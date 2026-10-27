/* Offline production dataset contract tests: no network, no paid services. */
'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const E=require('../docs/engine.js');
const source=JSON.parse(fs.readFileSync('docs/data/recipes.json','utf-8'));
const latest=JSON.parse(fs.readFileSync('docs/data/latest.json','utf-8'));
const history=JSON.parse(fs.readFileSync('docs/data/history.json','utf-8'));
assert.equal(latest.region,'Asia');
assert.equal(latest.faction,'Elyos');
assert.equal(latest.server,'Fregion');
assert.equal(String(latest.server_id),'11507');
assert.equal(String(history.server_id),'11507');
assert(source.source?.license==='MIT');
assert(source.recipes.length>=200 && source.recipes.length<=400);
assert(source.recipes.every(r=>r.reference===true&&r.verified===false), 'Catalog reference cannot claim verified');
const valid=source.recipes.map(r=>E.validateRecipe(r,{allowUnknown:true}));
assert.equal(source.schema,5,'Catalog metadata schema should be v5');
assert(valid.every(r=>/^[A-Za-z0-9_-]{1,160}$/.test(r.icon||'')), 'All source recipes must have a recognized item icon filename');
assert(valid.every(r=>r.craft_type&&typeof r.craft_type==='string'),'All recipes must have a craft type');
assert(valid.some(r=>r.mastery_grade==='beginner'),'Novice crafting tier absent');
assert(valid.some(r=>r.mastery_grade==='intermediate'),'Professional crafting tier absent');
assert(valid.every(r=>r.success_rate===null),'Cannot invent ordinary success probability from combo chance');
const html=fs.readFileSync('docs/index.html','utf8');
const client=fs.readFileSync('docs/app.js','utf8');
assert(!html.includes('<th>SUCCESS</th>'),'Success column must be removed');
assert(html.includes('REMOVED*')&&html.includes('OUTFLOW %*'),'Removed count and percent columns required');
assert(html.includes('value="hot"'),'High-outflow filter missing');
assert(client.includes('E.isHotListingSignal(signal)'),'Hot-listing tag must use guarded engine signal');
assert(client.includes("rarity-"+'${rarity.key}'), 'Rarity styles must apply to the item name');
const known=JSON.parse(fs.readFileSync('docs/data/item-rarity.json','utf-8')).grades;
assert(Object.keys(known).length>=700,'Game-client item rarity lookup missing');
assert(valid.every(r=>r.item_grade!=null && known[r.item_id]===r.item_grade),'Recipe grade must match authoritative game-client grade');
assert.equal(E.rarityForGrade(11).key,'common');
assert.equal(E.rarityForGrade(21).key,'rare');
assert.equal(E.rarityForGrade(31).key,'epic');
assert.equal(E.rarityForGrade(41).key,'unique');
assert.equal(E.rarityForGrade(51).key,'heroic');
assert.equal(E.rarityForGrade(71).key,'special');
assert(html.includes('id="cronStatus"'),'Cron status missing');
assert(['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking'].every(job=>html.includes('id="level'+job+'" type="number" min="0" max="100" value="100"')),'All skills should default to Lv100 in settings');
assert(client.includes('craftIcon(recipe)')&&client.includes('craftIcon(recipe,true)'),'List and detail both need icons');
assert(client.includes('setInterval(refreshFeedInPlace,10*60*1000)'),'Browser should periodically refresh market snapshots');

// Full Craft Catalog must not depend on the availability of Market prices or Bound vendor prices.
const catalog=E.buildCraftCatalog(latest.items,valid);
const catalogById=new Map(catalog.map(x=>[x.id,x]));
const uniqueCraftIds=new Set(valid.map(r=>r.item_id));
const jobs=['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking'];
const counts=E.craftProfessionCounts(valid,jobs);
assert.equal(counts.all,243,'Total outputs must be distinct item IDs');
assert.deepEqual(jobs.map(j=>counts[j]),[46,51,70,58,23],
 'Profession tab counts must reflect unique outputs from the current reference dataset');
assert(counts.all<jobs.reduce((sum,j)=>sum+counts[j],0),
 'An item shared across jobs is counted once overall and once in each relevant job');
const shared=valid.filter(r=>r.item_id==='610710001'); // Orichalcum Ingot
assert(shared.some(r=>r.profession==='Blacksmithing'));
assert(shared.some(r=>r.profession==='Armorsmithing'));
assert.equal(new Set(shared.map(r=>r.profession)).size,2);
assert.deepEqual(E.craftProfessionCounts(shared,jobs),{
 all:1,Alchemy:0,Blacksmithing:1,Armorsmithing:1,Handicrafting:0,Cooking:0
},'Batch recipes must not inflate counts, and shared outputs must occur under both jobs');
assert(client.includes("state.profession==='all'?options:options.filter(recipe=>recipe.profession===state.profession)"),
 'The selected profession must determine the recipe used for cost calculations');
assert(client.includes('rows=rows.filter(x=>x.recipe?.profession===state.profession)'),
 'Profession filter must constrain the displayed crafting rows');
assert(client.includes('state.selected=null'),'Switching profession should clear a stale item detail');

assert.equal(catalogById.size,catalog.length,'Craft catalog must not duplicate market entries');
assert(uniqueCraftIds.size>=240,'Craft output catalog unexpectedly shrunk');
for(const id of uniqueCraftIds)assert(catalogById.has(id),'Missing craft output '+id);
assert(catalog.length>latest.items.length,'Craft-only unlisted outputs should exist');
const expectedFamilies={Food:17,Drink:6,Potion:7,Scroll:4};
for(const [type,amount] of Object.entries(expectedFamilies)){
 const recipes=valid.filter(r=>r.craft_type===type);
 assert.equal(recipes.length,amount,'Incomplete '+type+' recipes in Global client catalog');
 assert(recipes.every(r=>catalogById.has(r.item_id)),'Missing '+type+' recipes from craft view');
}
assert.equal(E.craftFamily({profession:'Cooking',craft_type:'Food'}),'food');
assert.equal(E.craftFamily({profession:'Cooking',craft_type:'Drink'}),'food');
assert.equal(E.craftFamily({profession:'Alchemy',craft_type:'Potion'}),'potion');
assert.equal(E.craftFamily({profession:'Alchemy',craft_type:'Scroll'}),'scroll');
assert.equal(E.craftFamily({profession:'Handicrafting',craft_type:'Ring'}),'equipment');
const noExchange=valid.find(r=>r.name==="Artisan's Coriolus Tea");
assert(noExchange,'A sample unlisted drink should exist');
const missingMarketItem=catalogById.get(noExchange.item_id);
assert.equal(missingMarketItem.marketMissing,true);
assert.equal(missingMarketItem.price,null,'Unlisted drink must not get a fake price');
assert.equal(missingMarketItem.listings,null,'Unlisted drink must not get fake market listings');
const bound=valid.find(r=>r.name==='Life Serum (Bound)');
assert(bound);
assert.equal(catalogById.get(bound.item_id).bound,true,'Bound output must stay identified');
const selectedScroll=valid.find(r=>r.name==='Superior Speed Scroll');
assert(selectedScroll && catalogById.has(selectedScroll.item_id));
const speedMarket=latest.items.find(x=>x.id===selectedScroll.item_id);
assert(speedMarket?.price>0,'Scroll output has valid Fregion ask');
const speedEco=E.calculateEconomics(speedMarket,selectedScroll,latest.items,{tax_percent:10});
assert.equal(speedEco.complete,false,'Bound NPC materials without local prices must not be treated as free');
assert(speedEco.missing.some(x=>x.includes('Bound')),'Missing Bound cost must explain why consumables are unscored');

const vendorReference=JSON.parse(fs.readFileSync('docs/data/vendor-reference.json','utf8')).prices;
const optedInSpeed=E.calculateEconomics(speedMarket,selectedScroll,latest.items,{tax_percent:10},{
 vendorPrices:vendorReference,useVendorReference:true
});
assert.equal(optedInSpeed.complete,true,'Optional NPC price references must unlock consumable cost calculations');
assert.equal(optedInSpeed.vendorReference,true,'TW vendor cost must be labeled as a reference');
assert.equal(optedInSpeed.scenario,true,'Unverified TW shop reference must remain a scenario');
assert(optedInSpeed.parts.some(x=>x.vendorReference),'Ingredient pricing provenance must be visible');
const foodRecipe=valid.find(r=>r.name==="Artisan's Fruit Salad");
const foodMarket=latest.items.find(x=>x.id===foodRecipe.item_id);
assert(foodMarket?.price>0);
assert.equal(E.calculateEconomics(foodMarket,foodRecipe,latest.items,{tax_percent:10}).complete,false);
const optedInFood=E.calculateEconomics(foodMarket,foodRecipe,latest.items,{tax_percent:10},{
 vendorPrices:vendorReference,useVendorReference:true
});
assert.equal(optedInFood.complete,true,'Opt-in vendor reference should also support Cooking');
assert.equal(optedInFood.vendorReference,true);

const htmlText=fs.readFileSync('docs/index.html','utf8');
const appText=fs.readFileSync('docs/app.js','utf8');
assert(htmlText.includes('id="craftProfessions"'),'Craft profession selector must be visible');
assert(htmlText.includes('เลือกอาชีพคราฟ'),'Profession selector must have correct Thai label');
assert(!htmlText.includes('id="craftFamilies"'),'Old item-type selector should no longer be visible');
assert(!htmlText.includes('value="job:Alchemy"'),'Profession chips should replace duplicate profession dropdown options');
assert(appText.includes("filter:'craft'"),'Start with all crafts rather than only cost-complete items');
assert(appText.includes('craftList.map(compute)') && appText.includes('state.craftIds.has(String(item.id))'),'Table must include all craft outputs without scanning unrelated market items');
assert(appText.includes('E.buildCraftCatalog(state.latest.items,state.recipes)'),'Craft catalog must be generated from both feeds');
assert(appText.includes('Bound · ลงขายไม่ได้'),'Bound crafts must be marked non-sellable');
assert(appText.includes('ไม่มีประกาศขาย'),'Missing prices must be called out clearly');
const marketIds=new Set(latest.items.map(i=>String(i.id)));
assert(valid.filter(r=>marketIds.has(r.item_id)).length>=70, 'Unrecognized market item IDs');
assert(valid.some(r=>r.item_id==='511060015'),'Speed scroll missing');
assert(valid.some(r=>r.item_id==='511060016'),'Courage scroll missing');
assert(valid.some(r=>r.name==='Strong Leather'),'Strong Leather missing');
const byId=new Map(latest.items.map(i=>[i.id,i]));
let priced=0,positiveScenarios=0;
for(const recipe of valid){
 const item=byId.get(recipe.item_id);
 if(!item)continue;
 const eco=E.calculateEconomics(item,recipe,latest.items,{tax_percent:10});
 if(eco.complete){
   assert(eco.assumedSuccess,'Unknown client recipe rate must be labeled as assumed');
   assert(eco.scenario,'Client reference must be a scenario');
   priced++;
   if(eco.profit>0)positiveScenarios++;
 }
}
assert(priced>=15,`Unexpected missing costs: ${priced}`);
assert(positiveScenarios>0);
console.log(`Catalog integration OK: ${source.recipes.length} Elyos reference recipes, ${priced} priced scenarios, ${positiveScenarios} positive (NOT sales)`);
