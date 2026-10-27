'use strict';
const assert=require('node:assert/strict');
const E=require('../docs/engine.js');
const now='2026-10-27T03:00:00Z';
const id='610000001';
function seriesFor(count=25){
 let n=100;const snapshots=[];
 for(let i=0;i<count;i++){
  n=Math.max(5,n-(i%3===0?6:2)+(i%5===0?3:0));
  const time=new Date(Date.parse(now)-(count-i-1)*3600e3).toISOString();
  snapshots.push({ts:time,values:{[id]:[10000+i*30,n]}});
 }
 return snapshots;
}
const snapshots=seriesFor();
const points=E.timeSeries(snapshots,id,24,now);
assert.equal(points.length,25);
const signal=E.analyzeSignal(points,24);
assert.equal(signal.valid,true);
assert(signal.confidence>=75);
assert(signal.observedDrops>0);
assert(signal.observedAdds>0);
assert(signal.netDelta < 0);
assert.equal(signal.dropTransitions>0,true);
assert.equal(signal.observedSupply,signal.firstListings+signal.observedAdds);
assert(signal.removedRate>0&&signal.removedRate<=1);
assert(Math.abs(signal.removedRate-signal.observedDrops/signal.observedSupply)<1e-9);
assert.equal(E.isHotListingSignal(signal),true,'Sustained substantial listing removals should flag as high outflow');
assert.equal(E.isHotListingSignal({...signal,observedSupply:3,avgListings:1,observedDrops:2}),false,'One or two listings must not trigger a hot tag');
assert.equal(E.isHotListingSignal({...signal,priceChange:-.2}),false,'Large price declines must not trigger a hot tag');
assert.equal(E.isHotListingSignal({...signal,valid:false}),false,'Insufficient history must not trigger a hot tag');
const twoPoints=E.analyzeSignal(points.slice(0,2),24);
assert.equal(twoPoints.valid,false);
assert(twoPoints.observedDrops>=0,'Preliminary listing removal should be visible even with two snapshots');
assert.equal(E.rarityForGrade(11).key,'common');
assert.equal(E.rarityForGrade(21).key,'rare');
assert.equal(E.rarityForGrade(31).key,'epic');
assert.equal(E.rarityForGrade(41).key,'unique');
assert.equal(E.rarityForGrade(51).key,'heroic');
assert.equal(E.rarityForGrade(71).key,'special');
assert.equal(E.rarityForGrade(null).key,'unknown');
const item={id,name:'Ruby Powder',price:12000};
const ingredient={id:'610000002',name:'Ruby Gemstone',price:17000};
const recipe={name:'Ruby Powder',profession:'Alchemy',level:45,output_qty:30,success_rate:.95,npc_kinah:0,ingredients:[{name:'Ruby Gemstone',qty:10}],verified:true};
const econ=E.calculateEconomics(item,recipe,[item,ingredient],{tax_percent:10});
assert.equal(econ.complete,true);
assert(Math.abs(econ.unitCost-5964.912280701754)<.01);
assert(econ.profit>0);
assert(econ.margin>0&&econ.roi>econ.margin);
const op=E.opportunityScore(signal,econ,true);
assert(['trial','watch','avoid'].includes(op.status),op.status);
assert(op.score!==null);
assert.equal(E.opportunityScore(signal,econ,false).status,'scenario');
assert.equal(E.opportunityScore(E.analyzeSignal([],24),econ,true).status,'history');
const bound={...recipe,npc_kinah:null};
assert.equal(E.calculateEconomics(item,bound,[item,ingredient],{tax_percent:10}).complete,false);
const manual=E.calculateEconomics(item,bound,[item,ingredient],{tax_percent:10},{unit_cost_override:5500});
assert.equal(manual.complete,true);
assert.equal(manual.unitCost,5500);
const loss=E.calculateEconomics({...item,price:1000},recipe,[item,ingredient],{tax_percent:10});
assert.equal(E.opportunityScore(signal,loss,true).status,'loss');
const noPrice=E.calculateEconomics(item,recipe,[item],{tax_percent:10});
assert.equal(noPrice.complete,false);
assert(noPrice.missing.includes('Ruby Gemstone'));
const old=E.timeSeries(snapshots,id,90*24,now);
const insufficient=E.analyzeSignal(old,90*24);
assert.equal(insufficient.valid,false);
assert.throws(()=>E.validateRecipe({name:'X',output_qty:0,success_rate:1,ingredients:[{name:'Y',qty:1}]}));
assert.throws(()=>E.validateRecipe({name:'X',output_qty:1,success_rate:1,ingredients:[{name:'Y',qty:0}]}));
const valid=E.validateRecipe({...recipe,source:'game',verified:false});
assert.equal(valid.ingredients.length,1);
assert.equal(valid.verified,false);
// Global-client reference recipes with unknown success produce *optimistic* estimates only.
const clientRecipe={...recipe,recipe_id:'123',reference:true,verified:false,success_rate:null};
const client=E.validateRecipe(clientRecipe,{allowUnknown:true});
assert.equal(client.success_rate,null);
const preliminary=E.calculateEconomics(item,client,[item,ingredient],{tax_percent:10});
assert.equal(preliminary.complete,true);
assert.equal(preliminary.assumedSuccess,true);
assert.equal(preliminary.scenario,true);
assert.equal(E.opportunityScore(signal,preliminary,false).status,'scenario');
assert.throws(()=>E.validateRecipe(clientRecipe));
const withVariants=E.recipesFor(item,[{...client,item_id:'wrong'},client,{...client,recipe_id:'124',item_id:item.id}]);
assert.equal(withVariants.length,1);
assert.equal(withVariants[0].recipe_id,'124');

const fake=(name,score,margin,ask,other={})=>({
 item:{id:name,name,price:ask,listings:other.listings??12},
 eco:{margin,profit:other.profit??margin*100,roi:margin*1.3,unitCost:other.cost??100},
 op:{score,label:other.label??'กำลังรอ'},signal:{observedDrops:other.drops??2,removedRate:other.removedRate??.1,priceChange:other.change??.01,netDelta:other.delta??-2}
});
const unscored=[fake('Low',null,.15,1000),fake('High',null,.8,2000),fake('Known loss',0,-.25,500)];
assert.deepEqual(E.sortCraftRows(unscored,'score','desc').map(x=>x.item.name),['High','Low','Known loss'],
 'Before score is available, default must sort from highest margin to lowest');
const scored=[...unscored,fake('Score 60',60,.8,1500),fake('Score 81',81,.10,500)];
assert.deepEqual(E.sortCraftRows(scored,'score','desc').map(x=>x.item.name),
 ['Score 81','Score 60','High','Low','Known loss'],'Available positive scores first, remaining ranked by margin, losses last');
assert.deepEqual(E.sortCraftRows(unscored,'ask','asc').map(x=>x.item.name),['Known loss','Low','High']);
assert.deepEqual(E.sortCraftRows(unscored,'name','asc').map(x=>x.item.name),['High','Known loss','Low']);
assert.deepEqual(E.sortCraftRows([fake('Unknown',null,null,null),...unscored],'margin','desc').map(x=>x.item.name),
 ['High','Low','Known loss','Unknown'],'Missing margins must sort last, not become zero');
const ironRecipe={
 recipe_id:'basic',item_id:'100',name:'Orichalcum Mace',profession:'Blacksmithing',
 craft_type:'Mace',level:3,output_qty:1,success_rate:null,npc_kinah:0,
 ingredients:[{id:'200',name:'Orichalcum Ingot',qty:2}],
 combo_chance:25,combo_item_id:'101',reference:true,verified:false
};
const derivedStub={...ironRecipe,recipe_id:'splendent-stub',item_id:'101',name:'Splendent Orichalcum Mace',
  ingredients:[{id:'300',name:'Tiny fake recipe input',qty:1}],combo_chance:null,combo_item_id:null};
const mats=[{id:'100',name:'Orichalcum Mace',price:400,listings:10},
  {id:'101',name:'Splendent Orichalcum Mace',price:1200,listings:8},
  {id:'200',name:'Orichalcum Ingot',price:100,listings:9},
  {id:'300',name:'Tiny fake recipe input',price:1,listings:8}];
const costModel=E.createChainEstimator([ironRecipe,derivedStub],mats,{crafting_fee:0});
assert.equal(E.isEquipmentRecipe(ironRecipe),true);
assert.equal(costModel.hasCombo('101'),true);
assert.equal(costModel.getComboParents('101')[0].recipe_id,'basic');
const splendent=costModel.estimate('101');
assert.equal(splendent.complete,true);
assert.equal(splendent.cost,800,'Proc outcome needs 1/.25=4 base-craft attempts, not tiny proc-only stub materials');
assert.equal(splendent.method,'combo-proc');
assert.equal(splendent.expectedAttempts,4);
assert.equal(splendent.assumedSuccess,true);
const chainEcon=E.calculateEconomics(mats[1],derivedStub,mats,{tax_percent:10},{chainEstimate:splendent});
assert.equal(chainEcon.complete,true);
assert.equal(chainEcon.chainEstimated,true);
assert.equal(chainEcon.costSource,'chain-model');
assert.equal(chainEcon.profit,280);
const cheaperIngot={recipe_id:'ingot',item_id:'200',name:'Orichalcum Ingot',
 profession:'Blacksmithing',craft_type:'Misc_Blacksmithing',output_qty:1,success_rate:1,
 npc_kinah:0,ingredients:[{id:'300',name:'Ore',qty:2}]};
const cheaper=E.createChainEstimator([ironRecipe,derivedStub,cheaperIngot],
  mats.map(x=>({...x,price:x.id==='300'?20:x.price})),{});
assert.equal(cheaper.estimate('101').cost,320,'Nested intermediate craft should beat marketplace ask');
const noMaterial=E.createChainEstimator([ironRecipe],mats.filter(x=>x.id!=='200'),{});
assert.equal(noMaterial.estimate('100').complete,false,'Missing market price must not become zero');
const refOnly=E.createChainEstimator([ironRecipe],mats.filter(x=>x.id!=='200'),{},{
 vendorPrices:{'200':25},allowVendorReference:true
});
assert.equal(refOnly.estimate('101').cost,200);
assert.equal(refOnly.estimate('101').vendorReference,true);
const cyclic=E.createChainEstimator([
 {...ironRecipe,combo_chance:null,combo_item_id:null,ingredients:[{id:'200',qty:1,name:'B'}]},
 {...cheaperIngot,ingredients:[{id:'100',qty:1,name:'A'}]}
],[],{});
assert.equal(cyclic.estimate('100').complete,false,'Cycle must fail closed');

console.log('All engine tests passed (ROI, margin, listing drops, confidence, missing inputs, verification)');
