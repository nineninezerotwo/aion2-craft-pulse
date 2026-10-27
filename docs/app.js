/* Fregion Craft Investment Tracker. Everything runs in the browser.
 * Never interpret observed listing disappearance as verified sales. */
'use strict';
const E = window.CraftEngine;
const $ = id=>document.getElementById(id);
const isDemo = document.body.dataset.demo==='true';
const horizons=[['3h',3],['6h',6],['12h',12],['24h',24],['3d',72],['7d',168],['14d',336],['30d',720],['90d',2160]];
const storageKey='fregion_craft_pulse_v3';
const oldStorageKey='fregion_craft_pulse_v2';
function readSaved(){try{let x=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem(oldStorageKey)||'{}');return x&&typeof x==='object'?x:{}}catch(_){return {}}}
const saved=isDemo?{}:readSaved();
const state={latest:null,history:null,recipes:[],itemGrades:{},selected:null,period:24,search:'',filter:'evaluated',sort:'score',sortDir:'desc',vendorPrices:{},chainEstimator:null,settings:{use_vendor_reference:false,tax_percent:10,listing_fee:0,crafting_fee:0,skills:{Alchemy:100,Blacksmithing:100,Armorsmithing:100,Handicrafting:100,Cooking:100},...saved.settings},materialPrices:saved.materialPrices||{},overrides:saved.overrides||{},customRecipes:saved.customRecipes||[], verified:saved.verified||{},watchlist:saved.watchlist||[],selectedRecipes:saved.selectedRecipes||{},ready:false};
const JOBS=['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking'];
// Migrate saved preferences: old unknown/null values become Lv100; explicit skill values are preserved.
const previousSkills=(state.settings.skills&&typeof state.settings.skills==='object')?state.settings.skills:{};
state.settings.skills=Object.fromEntries(JOBS.map(job=>{
 const existing=E.safeNumber(previousSkills[job]);
 return [job,existing===null?100:Math.max(0,Math.min(100,existing))];
}));
function save(){if(isDemo)return;try{localStorage.setItem(storageKey,JSON.stringify({settings:state.settings,materialPrices:state.materialPrices,overrides:state.overrides,customRecipes:state.customRecipes,verified:state.verified,watchlist:state.watchlist,selectedRecipes:state.selectedRecipes}))}catch(e){console.warn('Could not save browser settings',e)}}
const esc=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const fmt=n=>n==null||!Number.isFinite(Number(n))?'—':Math.round(Number(n)).toLocaleString('en-US');
const money=n=>n==null||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
const percent=n=>n==null||!Number.isFinite(n)?'—':`${n>=0?'+':''}${(n*100).toFixed(1)}%`;
const localTs=t=>t?new Date(t).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'ยังไม่มี Snapshot';
const posClass=x=>x==null?'muted':x<0?'down':x>0?'up':'muted';
const ICON_BASE='https://raw.githubusercontent.com/xtopolis/aion2-static/main/public/icons/crafting/';
function craftIcon(recipe,large=false){
 const name=recipe?.icon;
 const img=typeof name==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(name)
  ?'<img alt="" loading="lazy" decoding="async" width="'+(large?68:42)+'" height="'+(large?68:42)+'" src="'+esc(ICON_BASE+name+'.webp')+'" onerror="this.remove()">':'';
 return '<span class="craft-icon'+(large?' craft-icon-lg':'')+'" aria-hidden="true"><span class="craft-icon-placeholder">◇</span>'+img+'</span>';
}
function recipeTier(recipe){
 if(!recipe)return '—';
 if(recipe.mastery_grade==='beginner')return 'Novice';
 if(recipe.mastery_grade==='intermediate')return 'Professional';
 return recipe.level==null?'ไม่ระบุ':Number(recipe.level)>50?'Professional':'Novice';
}
function actualSuccess(recipe,item){
 if(!recipe)return null;
 const rate=E.safeNumber(state.overrides?.[item.id]?.success_rate??recipe.success_rate);
 return rate!==null&&rate>0&&rate<=1?rate:null;
}
function successLabel(recipe,item){
 const rate=actualSuccess(recipe,item);
 return rate===null?'ไม่ทราบ':(rate*100).toFixed(1).replace(/\.0$/,'')+'%';
}
function rarityForItem(item,recipe){
 const grade=state.itemGrades[String(item.id)]??recipe?.item_grade;
 return E.rarityForGrade(grade);
}
function itemFor(id){return state.latest?.items.find(x=>x.id===id)}
function recipeKey(recipe){return recipe.recipe_id||[recipe.item_id||E.normName(recipe.name),recipe.profession,recipe.level??'?'].join(':')}
function recipeOptions(item){
 const listed=E.recipesFor(item,state.recipes);
 const parents=state.chainEstimator?.getComboParents(item.id)||[];
 const gearParents=parents.filter(r=>E.isEquipmentRecipe(r));
 if(gearParents.length){
  return gearParents.map(parent=>({...parent,
   recipe_id:'proc:'+parent.recipe_id,item_id:String(item.id),name:item.name,
   level:parent.level,output_qty:1,verified:false,
   icon:listed[0]?.icon||parent.icon,
   item_grade:listed[0]?.item_grade??parent.item_grade,
   combo_parent_recipe_id:parent.recipe_id
  }));
 }
 return listed;
}
function verified(recipe){if(!recipe)return false;const key=recipeKey(recipe);return state.verified[key]===true || (state.verified[key]!==false&&recipe.verified===true)}
function setVerified(recipe,bool){state.verified[recipeKey(recipe)]=bool;save()}
function recipeFor(item){
 const options=recipeOptions(item);
 if(!options.length)return null;
 const selected=options.find(r=>recipeKey(r)===state.selectedRecipes[item.id]);
 if(selected)return selected;
 const candidates=options.map(r=>{
   const chain=E.isEquipmentRecipe(r)&&state.chainEstimator
     ?state.chainEstimator.estimate(item.id,String(r.recipe_id||'').replace(/^proc:/,'')):null;
   const eco=E.calculateEconomics(item,r,state.latest.items,state.settings,{...itemOverrides(item),materialPrices:state.materialPrices,chainEstimate:chain});
   return {r,eco};
 });
 // Price complete input recipes by their cost rather than arbitrary iteration/order.
 candidates.sort((a,b)=>{
   if(a.eco.complete!==b.eco.complete)return a.eco.complete?-1:1;
   if(a.eco.complete&&b.eco.complete)return a.eco.unitCost-b.eco.unitCost;
   return (a.eco.missing?.length||0)-(b.eco.missing?.length||0);
 });
 return candidates[0].r;
}
function itemOverrides(item){return state.overrides[item.id]||{}}
function compute(item){
 const recipe=recipeFor(item);
 const pts=E.timeSeries(state.history?.snapshots,item.id,state.period,state.latest?.ts);
 const signal=E.analyzeSignal(pts,state.period);
 const chain=recipe&&E.isEquipmentRecipe(recipe)&&state.chainEstimator
   ?state.chainEstimator.estimate(item.id,String(recipe.recipe_id||'').replace(/^proc:/,'')):null;
 const eco=E.calculateEconomics(item,recipe,state.latest.items,state.settings,
   {...itemOverrides(item),materialPrices:state.materialPrices,chainEstimate:chain});
 let op=E.opportunityScore(signal,eco,verified(recipe));
 const skill=recipe?E.safeNumber(state.settings.skills?.[recipe.profession]):null;
 const eligible=recipe?(skill===null||recipe.level===null?null:skill>=recipe.level):false;
 if(recipe&&eligible===null)op={status:'skill',label:recipe.level===null?'ตรวจข้อกำหนดเลเวล':'ระบุเลเวลอาชีพ',score:null,reason:recipe.level===null?'สูตรจากข้อมูลเกมยังไม่ระบุเลเวล (อาจเป็น Transfer/Combo)':'ยังไม่ทราบเลเวลอาชีพนี้'};
 else if(recipe&&eligible===false)op={status:'locked',label:'เลเวลไม่ถึง',score:null,reason:`ต้องการ ${recipe.profession} Lv.${recipe.level} แต่ตอนนี้ Lv.${skill}`};
 return {item,recipe,pts,signal,eco,op,eligible};
}
function periods(){let el=$('periods');el.textContent='';for(const [label,hours] of horizons){const b=document.createElement('button');b.textContent=label;b.className=state.period===hours?'active':'';b.type='button';b.addEventListener('click',()=>{state.period=hours;render()});el.appendChild(b)}}
function renderHead(){
 const items=state.latest.items;
 $('updatedAt').textContent=localTs(state.latest.ts);
 $('status-dot').className='status-dot'+(items.length&&!isDemo?' ok':'');
 $('qualityTitle').textContent=isDemo?'DEMO · SYNTHETIC':items.length?'LISTINGS · NOT SALES':'WAITING FOR DATA';
 $('qualityDesc').textContent=isDemo?'ข้อมูลสมมติทั้งหมด ใช้ดูระบบก่อนเชื่อมตลาดจริง':items.length?'ตลาดจริง + สูตรอ้างอิง Global client (ไม่ใช่ยอดขายจริง)': 'ยังไม่ได้เก็บ Snapshot ของ Asia / Elyos / Fregion';
 $('itemCount').textContent=fmt(items.length);$('recipeCount').textContent=fmt(state.recipes.length);
 const snap=state.history.snapshots;
 const h=snap.length>1?(Date.parse(snap.at(-1).ts)-Date.parse(snap[0].ts))/3600000:0;
 $('historyDuration').textContent=h>=24?(h/24).toFixed(1)+'d':h>=1?h.toFixed(1)+'h':'—';
 const candidates=items.map(compute).filter(x=>x.eco.complete&&x.eco.profit>0).length;
 $('opportunities').textContent=items.length?fmt(candidates):'—';
 const age=state.latest.ts?(Date.now()-Date.parse(state.latest.ts))/3600000:null;
 $('freshness').textContent=isDemo?'DEMO DATA':age===null?'รอข้อมูล':age>3?'Feed ล่าช้า · '+Math.floor(age)+' ชั่วโมง':'ข้อมูลใหม่ '+Math.max(0,Math.floor(age*60))+' นาทีที่แล้ว';
 $('freshness').className='freshness'+(age!==null&&age>3?' warning':'');
 const cron=$('cronStatus');if(cron)cron.textContent=isDemo?'ข้อมูลทดลอง':age===null?'Cron · รอ Snapshot':age>3?'Cron · ตรวจ GitHub Actions':'Cron · ทุกชั่วโมง (UTC :23)';
}
function renderTable(){
 let rows=state.latest.items.map(compute);
 const query=E.normName(state.search);
 if(query)rows=rows.filter(x=>E.normName(x.item.name).includes(query)||x.item.id.includes(query)||E.normName(x.recipe?.profession).includes(query)||E.normName(x.recipe?.craft_type).includes(query));
 if(state.filter==='craft')rows=rows.filter(x=>x.recipe);
 if(state.filter==='evaluated')rows=rows.filter(x=>x.recipe&&x.eco.complete);
 if(state.filter==='reference')rows=rows.filter(x=>x.recipe&&x.eco.complete&&!verified(x.recipe));
 if(state.filter==='trial')rows=rows.filter(x=>x.op.status==='trial');
 if(state.filter==='hot')rows=rows.filter(x=>E.isHotListingSignal(x.signal));
 if(state.filter==='available')rows=rows.filter(x=>x.recipe&&x.eligible===true);
 if(state.filter==='watchlist')rows=rows.filter(x=>state.watchlist.includes(x.item.id));
 if(state.filter.startsWith('job:'))rows=rows.filter(x=>x.recipe?.profession===state.filter.slice(4));
 rows=E.sortCraftRows(rows,state.sort,state.sortDir);
 const scoresReady=rows.some(x=>x.op.score!=null && x.op.score>0);
 const sortedByMargin=state.sort==='score'&&state.sortDir==='desc'&&!scoresReady;
 const elSort=$('sortHint');if(elSort)elSort.textContent=sortedByMargin
   ?'ยังไม่มี Investment Score ที่ใช้จัดอันดับได้ → เรียงตาม Net Margin % สูงสุดก่อน'
   :'คลิกหัวคอลัมน์เพื่อเรียงจากมาก–น้อยหรือสลับเป็นน้อย–มาก';
 for(const th of document.querySelectorAll('#craftHeader th[data-sort-key]')){
   const active=th.dataset.sortKey===state.sort;
   const glyph=th.querySelector('.sort-direction');
   if(glyph)glyph.textContent=active?(state.sortDir==='desc'?'↓':'↑'):'↕';
   th.setAttribute('aria-sort',active?(state.sortDir==='desc'?'descending':'ascending'):'none');
   th.classList.toggle('sorted-column',active);
 }
 $('rowCount').textContent=`แสดง ${Math.min(rows.length,250)} จาก ${rows.length} รายการ · ${state.period<=24?state.period+' ชั่วโมง':state.period/24+' วัน'}`;
 const body=$('itemsTable');
 if(!state.latest.items.length){body.innerHTML='<tr><td colspan="13"><div class="empty-data"><strong>ยังไม่มีข้อมูลตลาดจริง</strong><p>ตัวเก็บ Snapshot ยังไม่เปิดใช้งาน: ต้องยืนยัน Market Server ID และสิทธิ์ดึงข้อมูลก่อน</p><a href="demo.html">ดูหน้า Demo (ข้อมูลสมมติ) ↗</a></div></td></tr>';return}
 if(!rows.length){body.innerHTML='<tr><td colspan="13"><div class="empty-data"><strong>ไม่พบรายการ</strong><p>ลองแก้ตัวกรองหรือค้นหาชื่ออื่น</p></div></td></tr>';return}
 body.innerHTML=rows.slice(0,250).map(({item,recipe,signal,eco,op})=>{
  const listDelta=signal.netDelta;const watch=state.watchlist.includes(item.id);
  const rarity=rarityForItem(item,recipe),hot=E.isHotListingSignal(signal);
  return `<tr data-id="${esc(item.id)}" class="${state.selected===item.id?'selected':''}"><td class="name-cell"><div class="craft-item-cell">${craftIcon(recipe)}<div class="craft-item-copy"><div class="item-title-row"><div class="item-name rarity-${rarity.key}" title="${esc(item.name)} · ${esc(rarity.label)}">${esc(item.name)} ${watch?'<span class="star">★</span>':''}</div>${hot?'<span class="hot-listing-tag" title="สัญญาณ Listings ลดสูง ไม่ใช่ยอดขายสำเร็จ">🔥 ขายดี*</span>':''}</div><div class="item-sub">${recipe?'<strong>'+esc(recipe.profession)+'</strong> · '+esc(recipe.craft_type||'Item'):'ไม่พบสูตรคราฟ'}</div><div class="craft-unlock">${recipe?'ปลดล็อก '+esc(recipeTier(recipe))+' Lv.'+(recipe.level==null?'?':fmt(recipe.level)):'ยังไม่มีสูตร'}${recipe&&!verified(recipe)?' · อ้างอิง Global':''}</div></div></div></td><td class="num">${fmt(item.price)}</td><td class="num">${fmt(item.listings)}</td><td class="num ${posClass(signal.observedDrops)}" title="ผลรวม Listings ที่ลดลงระหว่าง Snapshot ในช่วงที่เลือก ไม่ใช่ยอดขายสำเร็จ">${signal.observedDrops===null?'—':fmt(signal.observedDrops)}</td><td class="num outflow-rate" title="Removed ÷ (Listings ต้นช่วง + จำนวน Listings ที่เพิ่มระหว่าง Snapshot) · ไม่ใช่อัตราขายสำเร็จ">${signal.removedRate===null?'—':(signal.removedRate*100).toFixed(1)+'%'}</td><td class="num ${posClass(listDelta)}">${listDelta===null?'—':`${listDelta>0?'+':''}${fmt(listDelta)}`}</td><td class="num ${posClass(signal.priceChange)}">${percent(signal.priceChange)}</td><td class="num" title="${eco.chainEstimated?'Chain Estimate: Fregion asks + game-client recipe (may assume success=100% and omit fees).':eco.manualOverride?'Manual unit cost':'Direct market ingredient-price estimate'}">${eco.chainEstimated?'≈ ':''}${money(eco.unitCost)}${eco.chainEstimated?'<small class="chain-cost-label">Chain est.</small>':''}</td><td class="num ${posClass(eco.profit)}">${money(eco.profit)}</td><td class="num ${posClass(eco.roi)}">${percent(eco.roi)}</td><td class="num ${posClass(eco.margin)}">${percent(eco.margin)}</td><td>${op.score===null?'<span class="muted">—</span>':`<span class="score-chip">${op.score}<small>/100</small></span>`}<div class="confidence">${signal.valid?'coverage '+fmt(signal.confidence)+'%':'รอข้อมูล'}</div></td><td><span class="pill ${esc(op.status)}">${esc(op.label)}</span></td></tr>`;
 }).join('');
 for(const tr of body.querySelectorAll('tr[data-id]'))tr.addEventListener('click',()=>{state.selected=tr.dataset.id;renderTable();renderDetail();$('details').scrollIntoView({behavior:'smooth',block:'nearest'})});
}
function chart(points,type,id,color){
 const data=points.filter(p=>Number.isFinite(Number(p[type]))&&p[type]!==null);
 if(data.length<2)return '<div class="chart-no-data">ต้องมีประวัติอย่างน้อย 2 จุดในช่วงเวลานี้</div>';
 const vals=data.map(p=>Number(p[type]));let min=Math.min(...vals),max=Math.max(...vals);
 if(max===min){const d=Math.max(1,Math.abs(min)*.02);min-=d;max+=d;}
 const x0=68,y0=12,w=620,h=182,base=156,end=600;
 const t0=Date.parse(data[0].ts),t1=Date.parse(data.at(-1).ts),tr=Math.max(1,t1-t0);
 const xy=p=>[x0+(Date.parse(p.ts)-t0)/tr*(end-x0),y0+(max-Number(p[type]))/(max-min)*(base-y0)];
 const line=data.map(xy).map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ');
 const pts=data.map(xy);
 const poly=`${pts[0][0]},${base} ${line} ${pts.at(-1)[0]},${base}`;
 const ticks=[0,.5,1].map(u=>{const y=y0+u*(base-y0);const v=max-u*(max-min);return `<line x1="${x0}" y1="${y}" x2="${end}" y2="${y}" stroke="#2b4154" stroke-dasharray="3 5"/><text x="${x0-10}" y="${y+4}" text-anchor="end" font-size="11" fill="#91a4b9">${fmt(v)}</text>`}).join('');
 const dates=`<text x="${x0}" y="176" font-size="11" fill="#91a4b9">${new Date(t0).toLocaleDateString('th-TH',{month:'short',day:'numeric',timeZone:'Asia/Bangkok'})}</text><text x="${end}" y="176" font-size="11" text-anchor="end" fill="#91a4b9">${new Date(t1).toLocaleDateString('th-TH',{month:'short',day:'numeric',timeZone:'Asia/Bangkok'})}</text>`;
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="กราฟ ${esc(type)}"><defs><linearGradient id="g${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${ticks}<polygon points="${poly}" fill="url(#g${id})"/><polyline points="${line}" stroke="${color}" fill="none" stroke-width="2.8" stroke-linejoin="round"/>${dates}</svg>`;
}
function renderDetail(){
 const el=$('details'),item=itemFor(state.selected);
 if(!item){el.innerHTML='<div class="empty-details"><span>◇</span><h2>เลือกสินค้าจากตาราง</h2><p>ดูกราฟ, ต้นทุนสูตรคราฟ, ROI, Margin และหลักฐานที่ใช้จัดอันดับ</p></div>';return}
 const {recipe,pts,signal,eco,op}=compute(item),cust=itemOverrides(item),active=recipe?verified(recipe):false;
 const variants=recipeOptions(item);
 const ingredients=recipe?eco.parts.map(p=>{const ing=(recipe.ingredients||[]).find(i=>i.name===p.name),key=ing?.id?'id:'+ing.id:'name:'+E.normName(p.name),manual=state.materialPrices[key];return `<div class="ingredient editable-ingredient"><span>${esc(p.name)} × ${fmt(p.qty)}</span><label>ราคา/ชิ้น (K)<input class="materialPrice" data-material="${esc(key)}" type="number" min="0" step="1" placeholder="${p.price===null?'ไม่มีราคา':fmt(p.price)}" value="${esc(manual??'')}" aria-label="ราคาวัตถุดิบ ${esc(p.name)}"/></label></div>`;}).join(''):'<p class="muted">ยังไม่มีสูตรคราฟสำหรับสินค้านี้</p>';
 const watch=state.watchlist.includes(item.id);
 const rarity=rarityForItem(item,recipe),hot=E.isHotListingSignal(signal);
 el.innerHTML=`<div class="detail-top"><div class="detail-title-wrap">${craftIcon(recipe,true)}<div><div class="eyebrow">INVESTMENT REVIEW · ${esc(item.category||'ITEM')}</div><h2 class="rarity-${rarity.key}" title="${esc(rarity.label)}">${esc(item.name)}</h2><p class="detail-meta">${recipe?esc(recipe.profession)+' · Lv.'+(recipe.level==null?'?':fmt(recipe.level))+' · '+fmt(recipe.output_qty)+' ชิ้น/คราฟ':'สูตรยังไม่ได้เพิ่ม'} · ID ${esc(item.id)} · <a href="https://aion2.exchange/items/${encodeURIComponent(item.id)}" target="_blank" rel="noopener noreferrer">ข้อมูลตลาดต้นทาง ↗</a></p><div class="detail-craft-fields">${recipe?'<span>'+esc(recipe.profession)+' · '+esc(recipe.craft_type||'Item')+'</span><span>ปลดล็อก '+esc(recipeTier(recipe))+' Lv.'+(recipe.level==null?'?':fmt(recipe.level))+'</span><span>สำเร็จ '+esc(successLabel(recipe,item))+'</span>'+(recipe.combo_chance==null?'':'<span>Combo '+fmt(recipe.combo_chance)+'% (แยกจาก Success)</span>'):''}</div></div></div><div class="detail-actions">${hot?'<span class="hot-listing-tag" title="Removed % และจำนวนประกาศที่ลดสูงอย่างต่อเนื่อง ไม่ใช่ยอดขายจริง">🔥 ขายดี*</span>':''}<button id="starButton" class="soft">${watch?'★ ติดตามแล้ว':'☆ เพิ่ม Watchlist'}</button><span class="pill ${esc(op.status)}">${esc(op.label)}</span></div></div>
 <div class="detail-stat-row"><div class="mini-stat"><small>ประเมินการลดลงของประกาศ</small><strong>${fmt(signal.observedDrops)}</strong><span>ไม่ใช่ยอดขายจริง</span></div><div class="mini-stat"><small>Removed % / Observed Supply</small><strong>${signal.removedRate===null?'—':(signal.removedRate*100).toFixed(1)+'%'}</strong><span>${fmt(signal.observedDrops)} จาก ${fmt(signal.observedSupply)} ประกาศที่สังเกต · ไม่ใช่อัตราขายจริง</span></div><div class="mini-stat"><small>Listings Δ</small><strong class="${posClass(signal.netDelta)}">${signal.netDelta==null?'—':(signal.netDelta>0?'+':'')+fmt(signal.netDelta)}</strong><span>สุทธิในช่วงที่เลือก</span></div><div class="mini-stat"><small>ความเชื่อมั่นข้อมูล</small><strong>${fmt(signal.confidence)}%</strong><span>${fmt(signal.points)} จุดข้อมูล · ${(signal.coverage*100).toFixed(0)}% ของช่วง</span></div><div class="mini-stat"><small>Craft Investment Score</small><strong>${op.score===null?'—':op.score+'/100'}</strong><span>คะแนนสัญญาณ ไม่ใช่ % ขายออก</span></div></div>
 <div class="charts"><div class="chartcard"><h3>Listing history</h3><div class="hint">จำนวนประกาศขายลดลงอาจมาจากขาย, ถอน, หมดอายุ</div>${chart(pts,'listings','list','#57dfbd')}</div><div class="chartcard"><h3>Lowest asking price</h3><div class="hint">ราคาที่ตั้งขายต่อชิ้น ไม่ใช่ราคาซื้อขายสำเร็จ</div>${chart(pts,'price','price','#79aafa')}</div></div>
 <div class="detail-bottom"><div class="breakdown"><div class="detail-subhead"><h3>Recipe & Materials</h3>${recipe?`<a href="https://github.com/xtopolis/aion2-static" target="_blank" rel="noopener noreferrer">ที่มาสูตร (Global client) ↗</a>`:''}</div>
 ${variants.length>1?`<label class="variant-label">เปรียบเทียบวิธีคราฟ ${variants.length} สูตร<select id="variantSelect" class="variant-select">${variants.map(r=>`<option value="${esc(recipeKey(r))}" ${recipeKey(r)===recipeKey(recipe)?'selected':''}>${esc(r.profession)} · ${esc(r.name)} · Lv.${r.level??'?'} · ${r.output_qty} pcs</option>`).join('')}</select></label>`:''}
 <div class="recipe-meta">${recipe?'อัตราสำเร็จ '+(actualSuccess(recipe,item)===null?'ยังไม่ยืนยัน — คำนวณฉากทัศน์ 100%':successLabel(recipe,item))+' · ผลผลิต '+fmt(recipe.output_qty)+' ชิ้น':'สูตรยังไม่อยู่ในคลัง'}</div>${ingredients}${recipe?`<div class="ingredient"><span>วัสดุ Bound / NPC ต่อคราฟ</span><b>${eco.npc_kinah==null?'ยังไม่ได้กำหนด':fmt(eco.npc_kinah)+' K'}</b></div><label class="verify-row"><input id="verifyRecipe" type="checkbox" ${active?'checked':''}/><span>ฉันตรวจสูตรนี้ตรงกับในเกมแล้ว</span></label><p class="warning-note">ข้อมูลสูตรจาก Global client 21 ก.ย. 2026 (อาจต่างจากแพตช์ล่าสุด) · ค่าธรรมเนียม/โอกาสสำเร็จที่ไม่ทราบใช้สถานการณ์สมมติเท่านั้น · Combo ${recipe.combo_chance??0}% <strong>ยังไม่รวมมูลค่าในกำไร</strong> · ต้องตรวจจากในเกมก่อนลงทุน</p>`:''}</div>
 <div class="calc-pane"><h3>Calculate ROI / Margin</h3><div class="edit-fields"><label>ราคาขายต่อชิ้น (K)<input id="salePrice" type="number" min="0" step="1" placeholder="ราคาตลาดอัตโนมัติ" value="${esc(cust.sale_price??'')}"/></label><label>ต้นทุนต่อชิ้นแบบกรอกเอง (K)<input id="manualUnitCost" type="number" min="0" step="1" placeholder="คำนวณจากสูตรอัตโนมัติ" value="${esc(cust.unit_cost_override??'')}"/></label><label>ค่า NPC/Bound ต่อคราฟ (K)<input id="npcCost" type="number" min="0" step="1" placeholder="ต้องกรอกถ้ายังไม่ทราบ" value="${esc(cust.npc_kinah??recipe?.npc_kinah??'')}"/></label><label>โอกาสคราฟสำเร็จ (%)<input id="successRate" type="number" min="0.1" max="100" step=".1" value="${esc(cust.success_rate!=null?cust.success_rate*100:recipe?.success_rate!=null?recipe.success_rate*100:'')}"/></label></div><div class="totals"><div><small>ต้นทุน/ชิ้น (expected)</small><strong>${money(eco.unitCost)} K</strong></div><div><small>กำไร/ชิ้น</small><strong class="${posClass(eco.profit)}">${money(eco.profit)} K</strong></div><div><small>ROI on cost</small><strong class="${posClass(eco.roi)}">${percent(eco.roi)}</strong></div><div><small>Net margin</small><strong class="${posClass(eco.margin)}">${percent(eco.margin)}</strong></div></div><div class="calc-foot">${eco.complete?`ราคาสุทธิหลังภาษี/ค่าลงประกาศ ${money(eco.netRevenue)} K · ${eco.manualOverride?'ใช้ต้นทุนกรอกเอง':'ใช้ราคาวัตถุดิบที่ตั้งขาย'} ${eco.assumedSuccess?'· สมมติคราฟสำเร็จ 100% (กรณีดีที่สุด)':''}`:'ยังคำนวณไม่ได้: '+esc(eco.missing?.join(', ')||eco.reason||'ข้อมูลไม่ครบ')}</div></div></div>
 <div class="signal-foot"><strong>อ่านผล:</strong> ${esc(op.reason)} · Observed drops ${fmt(signal.observedDrops)} ประกาศ, observed adds ${fmt(signal.observedAdds)} ประกาศ · ข้อมูลไม่มีผลการขายสำเร็จจาก Fregion</div>`;
 if($('variantSelect'))$('variantSelect').addEventListener('change',e=>{state.selectedRecipes[item.id]=e.target.value;save();render()});
 for(const inp of el.querySelectorAll('.materialPrice'))inp.addEventListener('change',()=>{const v=inp.value.trim(),key=inp.dataset.material;if(v===''){delete state.materialPrices[key]}else {if(!Number.isFinite(Number(v))||Number(v)<0){alert('ราคาวัตถุดิบไม่ถูกต้อง');return}state.materialPrices[key]=Number(v)}save();render()});
 $('starButton').addEventListener('click',()=>{if(watch)state.watchlist=state.watchlist.filter(x=>x!==item.id);else state.watchlist.push(item.id);save();renderTable();renderDetail()});
 if(recipe)$('verifyRecipe').addEventListener('change',e=>{setVerified(recipe,e.target.checked);render()});
 for(const [id,key,scale] of [['salePrice','sale_price',1],['manualUnitCost','unit_cost_override',1],['npcCost','npc_kinah',1],['successRate','success_rate',.01]]){
  const input=$(id);if(!input)continue;
  input.addEventListener('change',()=>{const v=input.value.trim();if(!state.overrides[item.id])state.overrides[item.id]={};if(v==='')delete state.overrides[item.id][key];else {const n=Number(v);if(!Number.isFinite(n)||n<0||(key==='success_rate'&&(n<=0||n>100))){alert('ค่าตัวเลขไม่ถูกต้อง');return}state.overrides[item.id][key]=n*scale;}save();renderTable();renderDetail()});
 }
}
function render(){if(!state.ready)return;rebuildChainEstimator();periods();renderHead();renderTable();renderDetail()}
function openDialog(id){const d=$(id);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','')}
function closeDialog(id){const d=$(id);if(typeof d.close==='function')d.close();else d.removeAttribute('open')}
function readRecipeForm(){
 const ingredients=$('recipeIngredients').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
  const [name,quantity]=line.split('|');return {name:String(name||'').trim(),qty:Number(quantity)};
 });
 return E.validateRecipe({name:$('recipeName').value.trim(),item_id:$('recipeItemId').value.trim(),profession:$('recipeJob').value,level:Number($('recipeLevel').value),output_qty:Number($('recipeOutput').value),success_rate:Number($('recipeSuccess').value)/100,npc_kinah:$('recipeNpc').value.trim()===''?null:Number($('recipeNpc').value),ingredients,verified:$('recipeVerified').checked,source:'User-entered recipe; verified in-game by user'});
}
function setupControls(){
 $('search').addEventListener('input',e=>{state.search=e.target.value;renderTable()});
 $('recipeFilter').addEventListener('change',e=>{state.filter=e.target.value;renderTable()});
 $('sort').addEventListener('change',e=>{state.sort=e.target.value;state.sortDir=['name','job','status'].includes(state.sort)?'asc':'desc';renderTable()});
 for(const button of document.querySelectorAll('#craftHeader th[data-sort-key] .sort-header')){
   button.addEventListener('click',()=>{
     const col=button.closest('th').dataset.sortKey;
     if(state.sort===col)state.sortDir=state.sortDir==='desc'?'asc':'desc';
     else {state.sort=col;state.sortDir=['name','job','status'].includes(col)?'asc':'desc';}
     const select=$('sort');if(select?.querySelector('option[value="'+col+'"]'))select.value=col;
     renderTable();
   });
 }
 $('refresh').addEventListener('click',()=>location.reload());
 for(const [id,key] of [['taxRate','tax_percent'],['listingFee','listing_fee'],['craftingFee','crafting_fee']]){
  const field=$(id);field.value=state.settings[key];field.addEventListener('change',()=>{const n=Number(field.value);if(!Number.isFinite(n)||n<0||(key==='tax_percent'&&n>50)){alert('กรอกค่าที่ถูกต้อง');field.value=state.settings[key];return}state.settings[key]=n;save();render()});
 }
 for(const job of ['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking']){
   const field=$('level'+job);if(!field)continue;
   field.value=state.settings.skills?.[job]??'';
   field.addEventListener('change',()=>{const raw=field.value.trim();const v=raw===''?null:Number(raw);
     if(v!==null&&(!Number.isFinite(v)||v<0||v>100)){alert('เลเวลต้องอยู่ระหว่าง 0–100');field.value=state.settings.skills?.[job]??'';return}
     state.settings.skills={...state.settings.skills,[job]:v};save();render();
   });
 }
 $('addRecipe').addEventListener('click',()=>openDialog('recipeDialog'));
 $('recipeCancel').addEventListener('click',()=>closeDialog('recipeDialog'));
 $('recipeForm').addEventListener('submit',e=>{e.preventDefault();try{
  const recipe=readRecipeForm();const index=state.customRecipes.findIndex(r=>(recipe.item_id&&r.item_id===recipe.item_id)||E.normName(r.name)===E.normName(recipe.name));
  if(index>=0)state.customRecipes[index]=recipe;else state.customRecipes.push(recipe);
  state.verified[recipeKey(recipe)]=recipe.verified;
  state.recipes=mergeRecipes(state.seedRecipes,state.customRecipes);
  save();closeDialog('recipeDialog');$('recipeForm').reset();render();alert('บันทึกสูตรคราฟใน Browser ของคุณแล้ว (Export เพื่อสำรอง)');
 }catch(err){$('recipeError').textContent=err.message;}});
 $('importRecipes').addEventListener('click',()=>$('recipeFile').click());
 $('recipeFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{
  const raw=JSON.parse(await f.text());const list=Array.isArray(raw)?raw:raw.recipes;
  if(!Array.isArray(list)||list.length>2000)throw Error('ไฟล์ต้องมี recipes เป็น Array ขนาดไม่เกิน 2,000 สูตร');
  const checked=list.map(E.validateRecipe);
  state.customRecipes=checked;state.recipes=mergeRecipes(state.seedRecipes,checked);save();render();alert(`นำเข้า ${checked.length} สูตรแล้ว · สำรองเฉพาะ Browser เครื่องนี้`);
 }catch(err){alert('นำเข้าไม่สำเร็จ: '+err.message)}e.target.value='';});
 $('exportRecipes').addEventListener('click',()=>download('my-fregion-recipes.json',{format:'FregionCraftPulse-v2',exported_at:new Date().toISOString(),recipes:state.customRecipes,verified:state.verified,settings:state.settings,materialPrices:state.materialPrices,overrides:state.overrides,watchlist:state.watchlist,selectedRecipes:state.selectedRecipes}));
 $('importBackup').addEventListener('click',()=>$('backupFile').click());
 $('backupFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{
 const raw=JSON.parse(await f.text());if(raw.format!=='FregionCraftPulse-v2')throw Error('ไม่ใช่ไฟล์สำรองจากเว็บนี้');
 state.customRecipes=(raw.recipes||[]).map(E.validateRecipe);state.verified=raw.verified||{};state.settings={...state.settings,...raw.settings};state.overrides=raw.overrides||{};state.materialPrices=raw.materialPrices||{};state.watchlist=raw.watchlist||[];state.selectedRecipes=raw.selectedRecipes||{};
 state.recipes=mergeRecipes(state.seedRecipes,state.customRecipes);save();render();alert('นำเข้าข้อมูลสำรองเรียบร้อยแล้ว');
 }catch(err){alert('ไฟล์สำรองไม่ถูกต้อง: '+err.message)}e.target.value='';});
 $('importMarket').addEventListener('click',()=>$('marketFile').click());
 $('marketFile').addEventListener('change',async e=>{const files=[...e.target.files];if(!files.length)return;try{
  const parsed=await Promise.all(files.map(async f=>JSON.parse(await f.text())));
  const latest=parsed.find(a=>Array.isArray(a.items)),hist=parsed.find(a=>Array.isArray(a.snapshots));
  if(!latest||!hist)throw Error('เลือก latest.json + history.json หรือไฟล์ JSON ที่มีทั้ง items และ snapshots');
  if(latest.server!=='Fregion'||latest.region!=='Asia'||latest.faction!=='Elyos')throw Error('ต้องเป็นไฟล์ Asia/Elyos/Fregion เท่านั้น');
  if(String(latest.server_id)!==String(hist.server_id))throw Error('Server ID ของไฟล์ 2 ชุดไม่ตรงกัน');
  if(latest.items.length>5000||hist.snapshots.length>2400)throw Error('ข้อมูลขนาดเกินขีดจำกัด');
  if(!confirm('นำเข้า Market JSON เฉพาะในเบราว์เซอร์ (การรีเฟรชจะกลับไปใช้ข้อมูลจาก repo) ใช่ไหม?'))return;
  state.latest=latest;state.history=hist;render();
 }catch(err){alert('Import ตลาดไม่สำเร็จ: '+err.message)}e.target.value='';});
 $('openSettings').addEventListener('click',()=>openDialog('settingsDialog'));
 $('settingsClose').addEventListener('click',()=>closeDialog('settingsDialog'));
 $('downloadTemplate').addEventListener('click',()=>download('recipe-template.json',{recipes:[{name:'Example Crafted Item',item_id:'',profession:'Alchemy',level:1,output_qty:1,success_rate:.95,npc_kinah:null,ingredients:[{name:'Example Material',qty:3}],verified:false,source:'Verify in game'}]}));
}
function download(filename,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function mergeRecipes(seed,custom){
 const data=new Map();
 for(const r of seed)data.set(recipeKey(r),r);
 for(const r of custom)data.set(recipeKey(r),r);
 return [...data.values()];
}
function rebuildChainEstimator(){
 if(!state.latest?.items||!state.recipes)return;
 const successOverrides={};
 for(const [id,overrides] of Object.entries(state.overrides)){
   const rate=E.safeNumber(overrides?.success_rate);
   if(rate!==null&&rate>0&&rate<=1)successOverrides[id]=rate;
 }
 state.chainEstimator=E.createChainEstimator(state.recipes,state.latest.items,state.settings,{
  materialPrices:state.materialPrices,vendorPrices:state.vendorPrices,
  allowVendorReference:state.settings.use_vendor_reference===true,
  successOverrides
 });
}
async function load(){
 const root=isDemo?'data/demo/':'data/';
 try{
  const r=await Promise.all(['latest.json','history.json'].map(x=>fetch(root+x+'?'+Date.now())));
  const recipesResponse=await fetch(root+'recipes.json?'+Date.now());
  const vendorResponse=await fetch(root+'vendor-reference.json?'+Date.now()).catch(()=>null);
  // Optional, attributed game-client grade lookup for additional market items. Never infer rarity from item names.
  const rarityResponse=await fetch(root+'item-rarity.json?'+Date.now()).catch(()=>null);
  if(r.some(x=>!x.ok)||!recipesResponse.ok)throw Error('Data JSON ไม่พร้อม');
  const [latest,history,book]=await Promise.all([...r.map(x=>x.json()),recipesResponse.json()]);
  if(!Array.isArray(latest.items)||!Array.isArray(history.snapshots)||!Array.isArray(book.recipes))throw Error('โครงสร้าง JSON ไม่ถูกต้อง');
  if(latest.server!=='Fregion'||latest.region!=='Asia'||latest.faction!=='Elyos')throw Error('ตลาดผิดเซิร์ฟเวอร์: ต้อง Asia / Elyos / Fregion');
  state.latest=latest;state.history=history;
  state.itemGrades={};
  if(rarityResponse?.ok){
   try{
    const gradeDoc=await rarityResponse.json();
    if(gradeDoc?.grades&&typeof gradeDoc.grades==='object'&&!Array.isArray(gradeDoc.grades))
      state.itemGrades=gradeDoc.grades;
   }catch(err){console.warn('Optional rarity metadata unavailable:',err)}
  }
  if(vendorResponse?.ok){try{const vendor=await vendorResponse.json();if(vendor?.prices&&typeof vendor.prices==='object')state.vendorPrices=vendor.prices;}catch(e){console.warn('Vendor reference unavailable',e)}}
  state.seedRecipes=book.recipes.map(r=>E.validateRecipe(r,{allowUnknown:true}));state.recipes=mergeRecipes(state.seedRecipes,state.customRecipes.map(r=>E.validateRecipe(r)));
  if(isDemo){state.verified=Object.fromEntries(state.recipes.map(x=>[recipeKey(x),true]));state.settings.skills=Object.fromEntries(['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking'].map(x=>[x,100]));}
  state.ready=true;render();
 }catch(err){$('itemsTable').innerHTML=`<tr><td colspan="13"><div class="empty-data"><strong>เปิดข้อมูลไม่ได้</strong>${esc(err.message)}<p>เปิดเว็บผ่าน HTTP Server เช่น python -m http.server (ไม่ใช่ file://)</p></div></td></tr>`;$('qualityTitle').textContent='DATA ERROR';console.error(err)}
}
// The collector runs hourly on GitHub; poll cached static JSON only for active browser tabs.
let lastFeedCheck=0;
async function refreshFeedInPlace(){
 if(isDemo||!state.ready||document.visibilityState==='hidden')return;
 const now=Date.now();if(now-lastFeedCheck<4*60*1000)return;lastFeedCheck=now;
 try{
  const latestRes=await fetch('data/latest.json?ts='+now,{cache:'no-store'});
  if(!latestRes.ok)throw Error('latest '+latestRes.status);
  const latest=await latestRes.json();
  if(!Array.isArray(latest.items)||latest.region!=='Asia'||latest.faction!=='Elyos'||latest.server!=='Fregion')return;
  if(Date.parse(latest.ts)<=Date.parse(state.latest.ts))return;
  const historyRes=await fetch('data/history.json?ts='+now,{cache:'no-store'});
  if(!historyRes.ok)throw Error('history '+historyRes.status);
  const history=await historyRes.json();
  if(!Array.isArray(history.snapshots)||String(history.server_id)!==String(latest.server_id))return;
  state.latest=latest;state.history=history;render();
 }catch(err){console.warn('Background feed refresh failed:',err)}
}
setupControls();load();
if(!isDemo){
 setInterval(refreshFeedInPlace,10*60*1000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshFeedInPlace()});
}
