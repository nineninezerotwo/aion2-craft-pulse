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
assert.equal(source.schema,4,'Catalog metadata schema should be v4');
assert(valid.every(r=>/^[A-Za-z0-9_-]{1,160}$/.test(r.icon||'')), 'All source recipes must have a recognized item icon filename');
assert(valid.every(r=>r.craft_type&&typeof r.craft_type==='string'),'All recipes must have a craft type');
assert(valid.some(r=>r.mastery_grade==='beginner'),'Novice crafting tier absent');
assert(valid.some(r=>r.mastery_grade==='intermediate'),'Professional crafting tier absent');
assert(valid.every(r=>r.success_rate===null),'Cannot invent ordinary success probability from combo chance');
const html=fs.readFileSync('docs/index.html','utf8');
const client=fs.readFileSync('docs/app.js','utf8');
assert(html.includes('<th>SUCCESS</th>'),'Success column missing');
assert(html.includes('id="cronStatus"'),'Cron status missing');
assert(['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking'].every(job=>html.includes('id="level'+job+'" type="number" min="0" max="100" value="100"')),'All skills should default to Lv100 in settings');
assert(client.includes('craftIcon(recipe)')&&client.includes('craftIcon(recipe,true)'),'List and detail both need icons');
assert(client.includes('setInterval(refreshFeedInPlace,10*60*1000)'),'Browser should periodically refresh market snapshots');

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
