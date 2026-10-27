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
