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
const state={latest:null,history:null,recipes:[],selected:null,period:24,search:'',filter:'evaluated',sort:'score',settings:{tax_percent:10,listing_fee:0,crafting_fee:0,skills:{Alchemy:100,Blacksmithing:null,Armorsmithing:null,Handicrafting:null,Cooking:null},...saved.settings},materialPrices:saved.materialPrices||{},overrides:saved.overrides||{},customRecipes:saved.customRecipes||[], verified:saved.verified||{},watchlist:saved.watchlist||[],selectedRecipes:saved.selectedRecipes||{},ready:false};
function save(){if(isDemo)return;try{localStorage.setItem(storageKey,JSON.stringify({settings:state.settings,materialPrices:state.materialPrices,overrides:state.overrides,customRecipes:state.customRecipes,verified:state.verified,watchlist:state.watchlist,selectedRecipes:state.selectedRecipes}))}catch(e){console.warn('Could not save browser settings',e)}}
const esc=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const fmt=n=>n==null||!Number.isFinite(Number(n))?'—':Math.round(Number(n)).toLocaleString('en-US');
const money=n=>n==null||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
const percent=n=>n==null||!Number.isFinite(n)?'—':`${n>=0?'+':''}${(n*100).toFixed(1)}%`;
const localTs=t=>t?new Date(t).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'ยังไม่มี Snapshot';
const posClass=x=>x==null?'muted':x<0?'down':x>0?'up':'muted';
function itemFor(id){return state.latest?.items.find(x=>x.id===id)}
function recipeKey(recipe){return recipe.recipe_id||[recipe.item_id||E.normName(recipe.name),recipe.profession,recipe.level??'?'].join(':')}
function recipeOptions(item){return E.recipesFor(item,state.recipes)}
function verified(recipe){if(!recipe)return false;const key=recipeKey(recipe);return state.verified[key]===true || (state.verified[key]!==false&&recipe.verified===true)}
function setVerified(recipe,bool){state.verified[recipeKey(recipe)]=bool;save()}
function recipeFor(item){
 const options=recipeOptions(item);
 if(!options.length)return null;
 const selected=options.find(r=>recipeKey(r)===state.selectedRecipes[item.id]);
 if(selected)return selected;
 const candidates=options.map(r=>({r,eco:E.calculateEconomics(item,r,state.latest.items,state.settings,{...itemOverrides(item),materialPrices:state.materialPrices})}));
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
 const eco=E.calculateEconomics(item,recipe,state.latest.items,state.settings,{...itemOverrides(item),materialPrices:state.materialPrices});
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
 $('freshness').textContent=isDemo?'DEMO DATA':age===null?'รอข้อมูล':age>12?'ข้อมูลเก่า · '+Math.floor(age)+' ชั่วโมง':'เก็บล่าสุด '+Math.max(0,Math.floor(age))+' ชั่วโมงก่อน';
 $('freshness').className='freshness'+(age!==null&&age>12?' warning':'');
}
function renderTable(){
 let rows=state.latest.items.map(compute);
 const query=E.normName(state.search);
 if(query)rows=rows.filter(x=>E.normName(x.item.name).includes(query)||x.item.id.includes(query));
 if(state.filter==='craft')rows=rows.filter(x=>x.recipe);
 if(state.filter==='evaluated')rows=rows.filter(x=>x.recipe&&x.eco.complete);
 if(state.filter==='reference')rows=rows.filter(x=>x.recipe&&x.eco.complete&&!verified(x.recipe));
 if(state.filter==='trial')rows=rows.filter(x=>x.op.status==='trial');
 if(state.filter==='available')rows=rows.filter(x=>x.recipe&&x.eligible===true);
 if(state.filter==='watchlist')rows=rows.filter(x=>state.watchlist.includes(x.item.id));
 if(state.filter.startsWith('job:'))rows=rows.filter(x=>x.recipe?.profession===state.filter.slice(4));
 function score(x){return x.op.score??-100}
 switch(state.sort){
 case 'margin':rows.sort((a,b)=>(b.eco.margin??-1e5)-(a.eco.margin??-1e5));break;
 case 'roi':rows.sort((a,b)=>(b.eco.roi??-1e5)-(a.eco.roi??-1e5));break;
 case 'profit':rows.sort((a,b)=>(b.eco.profit??-1e15)-(a.eco.profit??-1e15));break;
 case 'drop':rows.sort((a,b)=>(b.signal.observedDrops??-1)-(a.signal.observedDrops??-1));break;
 case 'name':rows.sort((a,b)=>a.item.name.localeCompare(b.item.name));break;
 default:rows.sort((a,b)=>score(b)-score(a) || (b.eco.complete?1:0)-(a.eco.complete?1:0) || (b.eco.roi??-100)-(a.eco.roi??-100) || a.item.name.localeCompare(b.item.name));
 }
 $('rowCount').textContent=`แสดง ${Math.min(rows.length,250)} จาก ${rows.length} รายการ · ${state.period<=24?state.period+' ชั่วโมง':state.period/24+' วัน'}`;
 const body=$('itemsTable');
 if(!state.latest.items.length){body.innerHTML='<tr><td colspan="12"><div class="empty-data"><strong>ยังไม่มีข้อมูลตลาดจริง</strong><p>ตัวเก็บ Snapshot ยังไม่เปิดใช้งาน: ต้องยืนยัน Market Server ID และสิทธิ์ดึงข้อมูลก่อน</p><a href="demo.html">ดูหน้า Demo (ข้อมูลสมมติ) ↗</a></div></td></tr>';return}
 if(!rows.length){body.innerHTML='<tr><td colspan="12"><div class="empty-data"><strong>ไม่พบรายการ</strong><p>ลองแก้ตัวกรองหรือค้นหาชื่ออื่น</p></div></td></tr>';return}
 body.innerHTML=rows.slice(0,250).map(({item,recipe,signal,eco,op})=>{
  const listDelta=signal.netDelta;const watch=state.watchlist.includes(item.id);
  return `<tr data-id="${esc(item.id)}" class="${state.selected===item.id?'selected':''}"><td class="name-cell"><div class="item-name">${esc(item.name)} ${watch?'<span class="star">★</span>':''}</div><div class="item-sub">${recipe?esc(recipe.profession)+' · Lv.'+(recipe.level==null?'?':fmt(recipe.level)):'ไม่พบสูตรคราฟ'} ${recipe&&!verified(recipe)?'· ◇ สูตรอ้างอิง' :''}</div></td><td class="num">${fmt(item.price)}</td><td class="num">${fmt(item.listings)}</td><td class="num ${posClass(signal.observedDrops)}">${signal.observedDrops===null?'—':fmt(signal.observedDrops)}</td><td class="num ${posClass(listDelta)}">${listDelta===null?'—':`${listDelta>0?'+':''}${fmt(listDelta)}`}</td><td class="num ${posClass(signal.priceChange)}">${percent(signal.priceChange)}</td><td class="num">${money(eco.unitCost)}</td><td class="num ${posClass(eco.profit)}">${money(eco.profit)}</td><td class="num ${posClass(eco.roi)}">${percent(eco.roi)}</td><td class="num ${posClass(eco.margin)}">${percent(eco.margin)}</td><td>${op.score===null?'<span class="muted">—</span>':`<span class="score-chip">${op.score}<small>/100</small></span>`}<div class="confidence">${signal.valid?'coverage '+fmt(signal.confidence)+'%':'รอข้อมูล'}</div></td><td><span class="pill ${esc(op.status)}">${esc(op.label)}</span></td></tr>`;
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
 el.innerHTML=`<div class="detail-top"><div><div class="eyebrow">INVESTMENT REVIEW · ${esc(item.category||'ITEM')}</div><h2>${esc(item.name)}</h2><p class="detail-meta">${recipe?esc(recipe.profession)+' · Lv.'+(recipe.level==null?'?':fmt(recipe.level))+' · '+fmt(recipe.output_qty)+' ชิ้น/คราฟ':'สูตรยังไม่ได้เพิ่ม'} · ID ${esc(item.id)} · <a href="https://aion2.exchange/items/${encodeURIComponent(item.id)}" target="_blank" rel="noopener noreferrer">ข้อมูลตลาดต้นทาง ↗</a></p></div><div class="detail-actions"><button id="starButton" class="soft">${watch?'★ ติดตามแล้ว':'☆ เพิ่ม Watchlist'}</button><span class="pill ${esc(op.status)}">${esc(op.label)}</span></div></div>
 <div class="detail-stat-row"><div class="mini-stat"><small>ประเมินการลดลงของประกาศ</small><strong>${fmt(signal.observedDrops)}</strong><span>ไม่ใช่ยอดขายจริง</span></div><div class="mini-stat"><small>Listings Δ</small><strong class="${posClass(signal.netDelta)}">${signal.netDelta==null?'—':(signal.netDelta>0?'+':'')+fmt(signal.netDelta)}</strong><span>สุทธิในช่วงที่เลือก</span></div><div class="mini-stat"><small>ความเชื่อมั่นข้อมูล</small><strong>${fmt(signal.confidence)}%</strong><span>${fmt(signal.points)} จุดข้อมูล · ${(signal.coverage*100).toFixed(0)}% ของช่วง</span></div><div class="mini-stat"><small>Craft Investment Score</small><strong>${op.score===null?'—':op.score+'/100'}</strong><span>คะแนนสัญญาณ ไม่ใช่ % ขายออก</span></div></div>
 <div class="charts"><div class="chartcard"><h3>Listing history</h3><div class="hint">จำนวนประกาศขายลดลงอาจมาจากขาย, ถอน, หมดอายุ</div>${chart(pts,'listings','list','#57dfbd')}</div><div class="chartcard"><h3>Lowest asking price</h3><div class="hint">ราคาที่ตั้งขายต่อชิ้น ไม่ใช่ราคาซื้อขายสำเร็จ</div>${chart(pts,'price','price','#79aafa')}</div></div>
 <div class="detail-bottom"><div class="breakdown"><div class="detail-subhead"><h3>Recipe & Materials</h3>${recipe?`<a href="https://github.com/xtopolis/aion2-static" target="_blank" rel="noopener noreferrer">ที่มาสูตร (Global client) ↗</a>`:''}</div>
 ${variants.length>1?`<label class="variant-label">เปรียบเทียบวิธีคราฟ ${variants.length} สูตร<select id="variantSelect" class="variant-select">${variants.map(r=>`<option value="${esc(recipeKey(r))}" ${recipeKey(r)===recipeKey(recipe)?'selected':''}>${esc(r.profession)} · ${esc(r.name)} · Lv.${r.level??'?'} · ${r.output_qty} pcs</option>`).join('')}</select></label>`:''}
 <div class="recipe-meta">${recipe?'อัตราสำเร็จ '+(recipe.success_rate===null?'ยังไม่ยืนยัน — คำนวณฉากทัศน์ 100%':percent(recipe.success_rate))+' · ผลผลิต '+fmt(recipe.output_qty)+' ชิ้น':'สูตรยังไม่อยู่ในคลัง'}</div>${ingredients}${recipe?`<div class="ingredient"><span>วัสดุ Bound / NPC ต่อคราฟ</span><b>${eco.npc_kinah==null?'ยังไม่ได้กำหนด':fmt(eco.npc_kinah)+' K'}</b></div><label class="verify-row"><input id="verifyRecipe" type="checkbox" ${active?'checked':''}/><span>ฉันตรวจสูตรนี้ตรงกับในเกมแล้ว</span></label><p class="warning-note">ข้อมูลสูตรจาก Global client 21 ก.ย. 2026 (อาจต่างจากแพตช์ล่าสุด) · ค่าธรรมเนียม/โอกาสสำเร็จที่ไม่ทราบใช้สถานการณ์สมมติเท่านั้น · Combo ${recipe.combo_chance??0}% <strong>ยังไม่รวมมูลค่าในกำไร</strong> · ต้องตรวจจากในเกมก่อนลงทุน</p>`:''}</div>
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
function render(){if(!state.ready)return;periods();renderHead();renderTable();renderDetail()}
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
 $('sort').addEventListener('change',e=>{state.sort=e.target.value;renderTable()});
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
async function load(){
 const root=isDemo?'data/demo/':'data/';
 try{
  const r=await Promise.all(['latest.json','history.json'].map(x=>fetch(root+x+'?'+Date.now())));
  const recipesResponse=await fetch(root+'recipes.json?'+Date.now());
  if(r.some(x=>!x.ok)||!recipesResponse.ok)throw Error('Data JSON ไม่พร้อม');
  const [latest,history,book]=await Promise.all([...r.map(x=>x.json()),recipesResponse.json()]);
  if(!Array.isArray(latest.items)||!Array.isArray(history.snapshots)||!Array.isArray(book.recipes))throw Error('โครงสร้าง JSON ไม่ถูกต้อง');
  if(latest.server!=='Fregion'||latest.region!=='Asia'||latest.faction!=='Elyos')throw Error('ตลาดผิดเซิร์ฟเวอร์: ต้อง Asia / Elyos / Fregion');
  state.latest=latest;state.history=history;state.seedRecipes=book.recipes.map(r=>E.validateRecipe(r,{allowUnknown:true}));state.recipes=mergeRecipes(state.seedRecipes,state.customRecipes.map(r=>E.validateRecipe(r)));
  if(isDemo){state.verified=Object.fromEntries(state.recipes.map(x=>[recipeKey(x),true]));state.settings.skills=Object.fromEntries(['Alchemy','Blacksmithing','Armorsmithing','Handicrafting','Cooking'].map(x=>[x,100]));}
  state.ready=true;render();
 }catch(err){$('itemsTable').innerHTML=`<tr><td colspan="12"><div class="empty-data"><strong>เปิดข้อมูลไม่ได้</strong>${esc(err.message)}<p>เปิดเว็บผ่าน HTTP Server เช่น python -m http.server (ไม่ใช่ file://)</p></div></td></tr>`;$('qualityTitle').textContent='DATA ERROR';console.error(err)}
}
setupControls();load();
