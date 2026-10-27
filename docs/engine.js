/* Pure market/crafting calculations. Works in browsers and Node tests.
 * Listings disappearing do not demonstrate actual completed sales. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.CraftEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
 const safeNumber=x=>x!==''&&x!=null&&Number.isFinite(Number(x))?Number(x):null;
 const normName=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 // Global-client numeric item grades. Special (71) is separate from the rarity ladder.
 const RARITIES={11:['common','Common'],21:['rare','Rare'],31:['epic','Epic'],41:['unique','Unique'],51:['heroic','Heroic'],61:['heroic','Heroic'],71:['special','Special']};
 function rarityForGrade(grade){
   const key=safeNumber(grade);
   const entry=key!==null?RARITIES[key]:null;
   return entry?{key:entry[0],label:entry[1],grade:key}:{key:'unknown',label:'ไม่ทราบระดับ',grade:null};
 }
 const hoursBetween=(a,b)=>(Date.parse(b)-Date.parse(a))/3600000;
 function recipesFor(item, recipes){
   const id=String(item.id||'');
   const byId=recipes.filter(r=>r.item_id && String(r.item_id)===id);
   return byId.length?byId:recipes.filter(r=>normName(r.name)===normName(item.name));
 }
 function recipeFor(item, recipes){return recipesFor(item,recipes)[0]||null;}
 function timeSeries(snapshots,id,hours,lastTs){
   if(!Array.isArray(snapshots)||!lastTs)return [];
   const end=Date.parse(lastTs),start=end-hours*3600000;
   const valid=snapshots.filter(s=>{const t=Date.parse(s.ts);return Number.isFinite(t)&&t<=end+300000&&s.values&&Array.isArray(s.values[String(id)])&&safeNumber(s.values[String(id)][1])!==null;}).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
   let selected=valid.filter(s=>Date.parse(s.ts)>=start);
   const before=valid.filter(s=>Date.parse(s.ts)<start).slice(-1)[0];
   // A point just before the window gives a better starting baseline, but not if stale.
   const maxBeforeHours=hours<=24?2:hours<=7*24?8:30;
   if(before&&selected.length&&(start-Date.parse(before.ts))/3600000<=maxBeforeHours) selected=[before,...selected];
   return selected.map(s=>({ts:s.ts,price:s.values[String(id)][0],listings:s.values[String(id)][1]}));
 }
 function analyzeSignal(points,hours){
   const empty={valid:false,reason:'ต้องมี Snapshot อย่างน้อย 3 จุด',points:points.length,span:0,coverage:0,confidence:0,observedDrops:null,observedAdds:null,netDelta:null,priceChange:null,priceScore:null,outflowScore:null,liquidityScore:null,dropTransitions:0,observedSupply:null,removedRate:null,firstListings:null,lastListings:null,score:null};
   if(points.length<2)return empty;
   const first=points[0],last=points[points.length-1];
   const span=hoursBetween(first.ts,last.ts),coverage=clamp(span/hours,0,1);
   if(span<=0)return {...empty,reason:'ช่วงเวลาผิดปกติ'};
   const gaps=[],listings=[];
   let drops=0,adds=0,dropTransitions=0;
   for(let i=0;i<points.length;i++){
     listings.push(points[i].listings);
     if(i){const delta=points[i].listings-points[i-1].listings;
       if(delta<0){drops-=delta;dropTransitions++}else adds+=delta;
       gaps.push(hoursBetween(points[i-1].ts,points[i].ts));
     }
   }
   const avg=listings.reduce((a,b)=>a+b,0)/listings.length;
   // Supply observed by our snapshots, NOT units sold: opening listings plus net listing additions.
   // drops / observedSupply is bounded 0–1 but is not true sales conversion.
   const observedSupply=Math.max(0,first.listings)+adds;
   const removedRate=observedSupply>0?clamp(drops/observedSupply,0,1):null;
   const priceChange=first.price>0&&last.price>0?(last.price-first.price)/first.price:null;
   // Normalize by observed listing supply; do not infer units sold from listing counts.
   const dropRatio=removedRate??0;
   const repeat=dropTransitions/Math.max(1,points.length-1);
   const outflowScore=clamp(100*(.65*clamp(dropRatio/.40,0,1)+.35*clamp(repeat/.4,0,1)),0,100);
   const priceScore=priceChange===null?35:clamp(50+(priceChange/.20)*40,0,100);
   const liquidityScore=avg<3?5:avg<8?20:avg<20?42:avg<70?65:avg<300?85:avg<900?75:60;
   const expectedStep=hours<=7*24?1:hours<=30*24?6:24;
   const expectedN=clamp(span/expectedStep+1,3,60);
   const density=clamp(points.length/expectedN,0,1);
   const maxGap=Math.max(...gaps);
   const gapScore=clamp(1-Math.max(0,maxGap-expectedStep*3)/Math.max(hours*.2,expectedStep*4),0,1);
   const confidence=Math.round(100*(.55*coverage+.25*density+.2*gapScore));
   const minPoints=hours<=6?3:hours<=24?6:hours<=7*24?8:10;
   const valid=coverage>=.58&&points.length>=minPoints&&confidence>=65;
   const score=valid?Math.round(.52*outflowScore+.28*priceScore+.20*liquidityScore):null;
   const reason=!valid?`ข้อมูลยังไม่ต่อเนื่อง (${points.length}/${minPoints}+ จุด, ครอบคลุม ${Math.round(coverage*100)}%, confidence ${confidence})`:null;
   return {valid,reason,points:points.length,span,coverage,confidence,observedDrops:drops,observedAdds:adds,netDelta:last.listings-first.listings,priceChange,priceScore:Math.round(priceScore),outflowScore:Math.round(outflowScore),liquidityScore:Math.round(liquidityScore),dropTransitions,observedSupply,removedRate,firstListings:first.listings,lastListings:last.listings,score,avgListings:avg,maxGap};
 }
 // Demand proxy only. Guard sparse listings, short histories, nonrepeating drops, and collapsing prices.
 function isHotListingSignal(signal){
   return Boolean(signal&&signal.valid&&signal.confidence>=70&&signal.coverage>=.8
     &&signal.observedSupply>=12&&signal.avgListings>=8
     &&signal.observedDrops>=5&&signal.dropTransitions>=2
     &&signal.removedRate!==null&&signal.removedRate>=.30
     &&signal.priceChange!==null&&signal.priceChange>=-.10);
 }
 function collectIngredientCost(recipe,items,materialPrices){
   let subtotal=0;const missing=[],parts=[];
   for(const ingredient of recipe.ingredients||[]){
     const quantity=safeNumber(ingredient.qty);
     if(quantity===null||quantity<=0){missing.push(`จำนวนของ ${ingredient.name}`);continue}
     const key=ingredient.id?`id:${ingredient.id}`:`name:${normName(ingredient.name)}`;
     const override=safeNumber(materialPrices[key]);
     const match=items.find(it=>ingredient.id?String(it.id)===String(ingredient.id):normName(it.name)===normName(ingredient.name));
     const price=override!==null?override:safeNumber(match?.price);
     if(price===null){missing.push(ingredient.name||ingredient.id);parts.push({name:ingredient.name,qty:quantity,price:null,total:null});continue}
     const total=price*quantity;subtotal+=total;
     parts.push({name:ingredient.name,qty:quantity,price,total,manual:override!==null});
   }
   return {subtotal,parts,missing};
 }
 function calculateEconomics(item,recipe,items,settings={},custom={}){
   if(!recipe)return {complete:false,reason:'ไม่มีสูตรคราฟ'};
   const materials=collectIngredientCost(recipe,items,custom.materialPrices||{});
   const outQty=safeNumber(recipe.output_qty);
   const knownSuccess=safeNumber(custom.success_rate??recipe.success_rate);
   const assumedSuccess=knownSuccess===null;
   // Unknown craft success is an optimistic scenario only, NEVER a confirmed EV.
   const success=assumedSuccess?1:knownSuccess;
   const npc=safeNumber(custom.npc_kinah??recipe.npc_kinah);
   const crafting=safeNumber(settings.crafting_fee)??0;
   const tax=clamp(safeNumber(settings.tax_percent)??10,0,50)/100;
   const listingFee=safeNumber(settings.listing_fee)??0;
   const priceOverride=safeNumber(custom.sale_price);
   const ask=priceOverride!==null?priceOverride:safeNumber(item?.price);
   const missing=[...materials.missing];
   if(npc===null||npc<0)missing.push('ต้นทุน NPC / วัตถุดิบ Bound ต่อครั้ง');
   if(outQty===null||outQty<=0)missing.push('จำนวนผลผลิต');
   if(success===null||success<=0||success>1)missing.push('อัตราสำเร็จ');
   if(ask===null||ask<=0)missing.push('ราคาตั้งขาย');
   const manualUnitCost=safeNumber(custom.unit_cost_override);
   const manualOverride=manualUnitCost!==null&&manualUnitCost>0;
   if(manualOverride && ask!==null && ask>0){missing.length=0;}
   const base={complete:false,missing,parts:materials.parts,ask,success_rate:success,assumedSuccess,npc_kinah:npc,output_qty:outQty,reference:recipe.reference===true,comboExcluded:!!recipe.combo_chance};
   if(missing.length)return {...base,reason:'ข้อมูลต้นทุนหรือสูตรไม่ครบ'};
   // Bernoulli success model. Failure consumes inputs with no output; combo ignored.
   const spend=manualOverride?null:materials.subtotal+npc+crafting;
   const unitCost=manualOverride?manualUnitCost:spend/(outQty*success);
   const netRevenue=ask*(1-tax)-listingFee;
   const profit=netRevenue-unitCost;
   const roi=unitCost>0?profit/unitCost:null;
   const margin=netRevenue>0?profit/netRevenue:null;
   return {...base,complete:true,missing:[],recipeSpend:spend,unitCost,netRevenue,profit,roi,margin,tax,listingFee,manualOverride,scenario:assumedSuccess||recipe.reference===true};
 }
 function opportunityScore(signal,eco,recipeVerified){
   if(!eco.complete)return {status:'cost',label:'รอต้นทุน',score:null,reason:eco.reason};
   if(eco.profit<=0)return {status:'loss',label:'ต้นทุนไม่คุ้ม',score:0,reason:'รายรับสุทธิประมาณการต่ำกว่าต้นทุน (ยังไม่มีข้อมูลขายจริง)'};
   if(!signal.valid)return {status:'history',label:'รอสัญญาณตลาด',score:null,reason:signal.reason};
   const profitScore=clamp((eco.roi/.5)*75,0,100)*.75+clamp((eco.margin/.3)*100,0,100)*.25;
   const raw=.35*profitScore+.30*signal.outflowScore+.20*signal.priceScore+.15*signal.liquidityScore;
   const score=Math.round(raw*(.65+.35*signal.confidence/100));
   // Score is an observed MARKET heuristic, not sell-through probability.
   if(!recipeVerified||eco.assumedSuccess)
     return {status:'scenario',label:'สถานการณ์สมมติ',score,reason:'สูตรหรือโอกาสคราฟสำเร็จยังไม่ยืนยัน — ห้ามถือเป็นกำไรที่รับประกัน'};
   if(eco.roi>=.20 && score>=65 && signal.confidence>=65 && (signal.priceChange??0)>-.12)
     return {status:'trial',label:'ทดลองล็อตเล็ก',score,reason:'กำไรที่คำนวณได้ + สัญญาณประกาศลด (ไม่ใช่ยอดขายจริง)'};
   if(eco.roi>=.10 && score>=48)return {status:'watch',label:'เฝ้าดู',score,reason:'มีโอกาส แต่สัญญาณยังไม่แข็งแรง'};
   return {status:'avoid',label:'ยังไม่แนะนำ',score,reason:'กำไรหรือแรงซื้ออ่อนกว่าที่ต้องการ'};
 }
 function validateRecipe(recipe,opts={}){
   if(!recipe || typeof recipe!=='object')throw Error('สูตรไม่ใช่วัตถุ');
   const name=String(recipe.name||'').trim();
   const output_qty=Number(recipe.output_qty),success_rate=recipe.success_rate==null||recipe.success_rate===''?null:Number(recipe.success_rate);
   if(!name||name.length>150)throw Error('ชื่อสูตรไม่ถูกต้อง');
   if(!Number.isFinite(output_qty)||output_qty<=0||output_qty>100000)throw Error('ผลผลิตไม่ถูกต้อง');
   if((success_rate===null&&!opts.allowUnknown)|| (success_rate!==null&&(!Number.isFinite(success_rate)||success_rate<=0||success_rate>1)))throw Error('โอกาสสำเร็จต้องอยู่ระหว่าง 0–1 หรือระบุว่าไม่ทราบสำหรับชุดข้อมูลอ้างอิง');
   if(!Array.isArray(recipe.ingredients)||recipe.ingredients.length<1||recipe.ingredients.length>40)throw Error('ต้องมีวัตถุดิบอย่างน้อยหนึ่งรายการ');
   for(const ing of recipe.ingredients){if(!String(ing.name||ing.id||'').trim()||!(Number(ing.qty)>0))throw Error('ชื่อหรือจำนวนวัตถุดิบไม่ถูกต้อง');}
   const npc=recipe.npc_kinah===null||recipe.npc_kinah===''?null:Number(recipe.npc_kinah);
   if(npc!==null&&(!Number.isFinite(npc)||npc<0))throw Error('ต้นทุน NPC ไม่ถูกต้อง');
   return {name,recipe_id:String(recipe.recipe_id||''),item_id:String(recipe.item_id||''),profession:String(recipe.profession||'Unknown'),level:recipe.level==null?null:Number(recipe.level),output_qty,success_rate,npc_kinah:npc,ingredients:recipe.ingredients.map(i=>({name:String(i.name||'').trim(),id:i.id?String(i.id):'',qty:Number(i.qty)})),verified:recipe.verified===true,reference:recipe.reference===true,combo_chance:recipe.combo_chance??null,combo_item_id:recipe.combo_item_id||null,source:String(recipe.source||'user-entered').slice(0,240),item_grade: Number.isInteger(recipe.item_grade)&&RARITIES[recipe.item_grade]?recipe.item_grade:null,icon:/^[A-Za-z0-9_-]{1,160}$/.test(recipe.icon||'')?recipe.icon:null,craft_type:String(recipe.craft_type||'').slice(0,70),mastery_grade:['beginner','intermediate'].includes(recipe.mastery_grade)?recipe.mastery_grade:null};
 }
 return {clamp,safeNumber,normName,rarityForGrade,isHotListingSignal,recipeFor,recipesFor,timeSeries,analyzeSignal,calculateEconomics,opportunityScore,validateRecipe};
});
