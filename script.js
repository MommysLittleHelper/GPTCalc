(() => {
'use strict';
const UNIT_TO_M={m:1,'м':1,см:.01,мм:.001};
const $=id=>document.getElementById(id);
const els={input:$('inputText'),calc:$('calcBtn'),result:$('resultBox'),totalVolume:$('totalVolume'),totalPieces:$('totalPieces'),details:$('detailsList'),copy:$('copyBtn'),clear:$('clearBtn'),status:$('calcStatus'),adapter:$('adapterPreview'),adapt:$('adaptBtn')};
const state={items:[]};
const connectionStatus=$('connectionStatus');
function updateConnectionStatus(){if(!connectionStatus)return;const online=navigator.onLine;connectionStatus.className='connection-status '+(online?'online':'offline');connectionStatus.textContent=online?'● Подключение активно':'● Офлайн-режим активен'}
addEventListener('online',updateConnectionStatus);addEventListener('offline',updateConnectionStatus);updateConnectionStatus();
function num(s){return Number(String(s).replace(',','.'))}
function nPattern(){return '(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)'}
function norm(s){return String(s||'').replace(/\\\*/g,'×').replace(/\*/g,'×').replace(/[×✕✖хХ]/g,'×').replace(/\u00a0/g,' ').replace(/[–—]/g,'-').replace(/\s+/g,' ')}
function unitFromText(t,end){const s=t.slice(end,end+45).toLowerCase();const m=s.match(/^\s*(мм|mm|миллиметр(?:а|ов)?|см|cm|сантиметр(?:а|ов)?|м|m|метр(?:а|ов)?)/i);if(!m)return null;const u=m[1];if(/^мм|^mm|миллиметр/.test(u))return 'мм';if(/^см|^cm|сантиметр/.test(u))return 'см';return 'м'}
function quantityFromContext(t,start,end){
 const before=t.slice(Math.max(0,start-180),start), after=t.slice(end,Math.min(t.length,end+220));
 const unitWords='(?:миллиметр(?:а|ов)?|сантиметр(?:а|ов)?|метр(?:а|ов)?|мм|см|mm|cm|м|m)';
 const qty='(\\d+(?:[.,]\\d+)?)';
 const qtyWords='(?:шт\\.?|штук|мест(?:а|о)?|pcs?)';
 let m;
 // 1. Явное количество сразу после габаритов: × 4, ×4 шт.
 m=after.match(new RegExp('^\\s*[×x*]\\s*'+qty+'\\s*'+qtyWords+'?','i'));
 if(m)return Math.max(1,Math.round(num(m[1])));
 // 2. Единица + количество: "4.5 метров, 8шт", "600 мм — 4 шт."
 m=after.match(new RegExp('^\\s*'+unitWords+'\\s*(?:(?:[,;:—-]|[×x*])\\s*)?(?:кол-?во|количество|qty)?\\s*[:=-]?\\s*'+qty+'\\s*'+qtyWords,'i'));
 if(m)return Math.max(1,Math.round(num(m[1])));
 // 3. Явное количество после размеров, в том числе после переноса строки.
 m=after.match(new RegExp('^\\s*(?:[,;:—-]\\s*)?(?:кол-?во|количество|qty)\\s*[:=-]?\\s*'+qty+'\\s*'+qtyWords,'i'));
 if(m)return Math.max(1,Math.round(num(m[1])));
 m=after.match(new RegExp('^\\s*(?:[,;:—-]\\s*)?'+qty+'\\s*'+qtyWords,'i'));
 if(m)return Math.max(1,Math.round(num(m[1])));
 // 4. Количество перед габаритами. Ищем последнее явное количество в контексте,
 // допускаем текст между ним и размерами: "2 шт. — ящик 600x400x300".
 const beforeMatches=[...before.matchAll(new RegExp('(?:^|[^\\d])'+qty+'\\s*'+qtyWords+'(?=\\s*(?:[-—:;,]|$|[\\p{L}]))','giu'))];
 if(beforeMatches.length){
   const last=beforeMatches[beforeMatches.length-1];
   const prefix=before.slice(0,last.index);
   // Не связываем номера накладных/артикулов с габаритами.
   if(!/(?:накладн|сч[её]т|артикул|арт\\.|№)\\s*$/i.test(prefix))return Math.max(1,Math.round(num(last[0].match(new RegExp(qty))[1])));
 }
 return 1;
}
function candidateScore(nums,q,u){
 const k=UNIT_TO_M[u], d=nums.map(v=>v*k), max=Math.max(...d), min=Math.min(...d), vol=d[0]*d[1]*d[2]*q; let s=0;
 // Cargo-first heuristic. Rooms/buildings are deliberately penalized.
 if(max>=.15&&max<=4)s+=34; else if(max>.04&&max<.15)s+=20; else if(max>4&&max<=8)s+=10; else s-=25;
 if(min>=.02&&min<=2)s+=18; else if(min<.005)s-=10; else if(min>2)s-=15;
 if(vol>=.00001&&vol<=20)s+=20; else if(vol<=200)s+=6; else s-=30;
 if(u==='мм'&&nums.every(v=>v>=250&&v<=5000))s+=30;
 if(u==='см'&&nums.every(v=>v>=5&&v<=500))s+=28;
 if(u==='м'&&nums.every(v=>v>=.3&&v<=8))s+=22;
 if(q>=10&&u!=='м')s+=10;
 if(q>=50&&u==='мм')s+=10;
 return s;
}
function chooseUnit(nums,q,explicit){if(explicit){const k=UNIT_TO_M[explicit];const d=nums.map(v=>v*k);return {unit:explicit,single:d[0]*d[1]*d[2],confidence:'high',warning:''}}const ranked=['мм','см','м'].map(u=>({unit:u,score:candidateScore(nums,q,u)})).sort((a,b)=>b.score-a.score);const best=ranked[0],second=ranked[1],margin=best.score-second.score;const confidence=margin>=18?'medium':'low';return {unit:best.unit,single:nums.map(v=>v*UNIT_TO_M[best.unit]).reduce((a,b,i)=>i===0?b:a*b,1),confidence,warning:`Единица не указана. Принято: ${best.unit}. Проверьте исходные данные.`}}
function findTriplets(line){
 const t=norm(line), n=nPattern(), out=[];
 const explicitRe=new RegExp(`(${n})\\s*(?:×|x|-)\\s*(${n})\\s*(?:×|x|-)\\s*(${n})(?!\\s*(?:×|x))`,'ig');
 let m;
 while((m=explicitRe.exec(t))){
  const before=t.slice(Math.max(0,m.index-60),m.index).toLowerCase();
  const after=t.slice(explicitRe.lastIndex,Math.min(t.length,explicitRe.lastIndex+60)).toLowerCase();
  // Do not treat an article/SKU code such as "артикул 600-400-300" as cargo dimensions.
  // Ordinary hyphenated dimensions like "1200-800-400" remain valid.
  const articleCode=/(?:артикул|арт\.?|sku)\s*[:№#-]?\s*$/.test(before);
  const hasCargoCue=/(?:мм|см|\bм\b|millimeter|сантиметр|метр|шт\.?|штук|мест(?:а|о)?|кол-?во|количество|qty|\bгруз\b|\bящик\b|\bкороб\b|\bпаллет\b|\bпаллета\b)/i.test(after);
  if(articleCode && !hasCargoCue) continue;
  out.push({index:m.index,end:explicitRe.lastIndex,nums:[num(m[1]),num(m[2]),num(m[3])],explicit:true});
}
 // Space-separated triplets: only when the local line looks like a cargo/position line,
 // and never when the candidate is part of a date, invoice number or article code.
 if(!out.length){
   const compact=new RegExp(`(^|[;:,\\s])(${n})\\s+(${n})\\s+(${n})(?=\\s|$|[;,.)])`,'ig');
   while((m=compact.exec(t))){const nums=[num(m[2]),num(m[3]),num(m[4])];const local=t.toLowerCase();const unsafe=/(накладн|счет|счёт|№|арт\.|артикул|дата|от\s+\d)/i.test(local);if(!unsafe)out.push({index:m.index,end:compact.lastIndex,nums,explicit:false});}
 }
 return out;
}
function parseLine(line,nextLine=''){
 const current=String(line||''), context=nextLine?current+'\n'+nextLine:current, t=norm(context);
 const out=[];for(const f of findTriplets(norm(current))){const unit=unitFromText(t,f.end);const q=quantityFromContext(t,f.index,f.end);const choice=chooseUnit(f.nums,q,unit);out.push({raw:current,dims:f.nums,unit:choice.unit,quantity:q,single:choice.single,total:choice.single*q,confidence:choice.confidence,warning:choice.warning,explicitUnit:!!unit,explicitQuantity:q!==1});}return out;
}
function parse(text){const lines=String(text||'').split(/\r?\n/);const out=[];for(let i=0;i<lines.length;i++){out.push(...parseLine(lines[i],lines[i+1]||''));}return out}
function fmt(x){return x.toFixed(4)}
function statusText(a){const low=a.filter(x=>x.confidence==='low').length,auto=a.filter(x=>!x.explicitUnit).length;if(low)return [`warning`,`⚠️ Требует проверки: ${low} ${low===1?'позиция':'позиции'} с неоднозначной единицей`];if(auto)return [`neutral`,`ℹ️ ${auto} ${auto===1?'единица выбрана':'единицы выбраны'} автоматически`];return ['success','✓ Расчёт подтверждён']}
function render(){const a=state.items;if(!a.length){els.result.style.display='none';return}const total=a.reduce((s,x)=>s+x.total,0),pieces=a.reduce((s,x)=>s+x.quantity,0);els.result.style.display='block';els.totalVolume.innerHTML=`<strong>${fmt(total)}</strong> м³`;els.totalPieces.textContent=`${pieces} шт.`;const st=statusText(a);els.status.className='calc-status '+st[0];els.status.textContent=st[1];els.details.innerHTML='';a.forEach((x,i)=>{const d=document.createElement('div');d.className='detail-line '+(x.confidence==='low'?'warning-line':'');d.innerHTML=`<div><strong>Позиция ${i+1}:</strong> ${x.dims.join('×')} ${x.unit} × ${x.quantity} шт. = <strong>${fmt(x.total)} м³</strong></div><div class="badge-group"><button class="btn-badge ${x.unit==='м'?'active':''}" data-i="${i}" data-u="м">м</button><button class="btn-badge ${x.unit==='см'?'active':''}" data-i="${i}" data-u="см">см</button><button class="btn-badge ${x.unit==='мм'?'active':''}" data-i="${i}" data-u="мм">мм</button></div>${x.warning?`<div class="warning-text">⚠️ ${x.warning}</div>`:''}`;els.details.appendChild(d)})}
function calculate(){state.items=parse(els.input.value);render();updateAdapterPreview()}
function setUnit(i,u){const x=state.items[i];if(!x)return;x.unit=u;x.single=x.dims.reduce((p,v)=>p*v*UNIT_TO_M[u],1);x.total=x.single*x.quantity;x.explicitUnit=true;x.confidence='high';x.warning='';render();updateAdapterPreview()}
function adapterNorm(s){return String(s||'').replace(/\\\*/g,'×').replace(/\*/g,'×').replace(/[×✕✖хХ]/g,'×').replace(/\u00a0/g,' ').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim()}
function adapterNumPattern(){return '(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)'}
function adapterUnitToken(){return '(?:миллиметров?|миллиметра|миллиметр|сантиметров?|сантиметра|сантиметр|метров?|метра|метр|мм|mm|см|cm|м|m)' }
function adapterUnitValue(u){const x=String(u||'').toLowerCase();if(/^мм|^mm|миллиметр/.test(x))return 'мм';if(/^см|^cm|сантиметр/.test(x))return 'см';return 'м'}
function adapterFindDimensionGroups(text){
 const t=adapterNorm(text), n=adapterNumPattern(), unit=adapterUnitToken(), groups=[]; let m;
 // 1) Unit attached to every number: 130cmx125cmx235cm / 0.86m X 0.86m X 0.96m
 const each=new RegExp('('+n+')\\s*('+unit+')\\s*(?:×|x|-|\\*|:)\\s*('+n+')\\s*('+unit+')\\s*(?:×|x|-|\\*|:)\\s*('+n+')\\s*('+unit+')','ig');
 while((m=each.exec(t))){groups.push({index:m.index,end:each.lastIndex,nums:[num(m[1]),num(m[3]),num(m[5])],unit:adapterUnitValue(m[2]),explicitUnit:true,source:m[0]});}
 // 1b) Unit attached to every number with no separator: 120см80см175см.
 const eachJoined=new RegExp('('+n+')\s*('+unit+')\s*('+n+')\s*('+unit+')\s*('+n+')\s*('+unit+')','ig');
 while((m=eachJoined.exec(t))){if(groups.some(g=>m.index>=g.index&&m.index<g.end))continue;groups.push({index:m.index,end:eachJoined.lastIndex,nums:[num(m[1]),num(m[3]),num(m[5])],unit:adapterUnitValue(m[2]),explicitUnit:true,source:m[0]});}
// 2) Unit after the whole group: 40 x 30.5 x 22.2 см / 120 80 60 см
 const whole=new RegExp('('+n+')\\s*(?:×|x|-|\\*)\\s*('+n+')\\s*(?:×|x|-|\\*)\\s*('+n+')\\s*('+unit+')','ig');
 while((m=whole.exec(t))){if(groups.some(g=>m.index>=g.index&&m.index<g.end))continue;groups.push({index:m.index,end:whole.lastIndex,nums:[num(m[1]),num(m[2]),num(m[3])],unit:adapterUnitValue(m[4]),explicitUnit:true,source:m[0]});}
 // 3) Three numbers separated only by spaces, with a unit after the third.
 const spaced=new RegExp('(^|[^\\d.,])('+n+')\\s+('+n+')\\s+('+n+')\\s*('+unit+')(?=$|[^\\w])','ig');
 while((m=spaced.exec(t))){const idx=m.index+(m[1]?m[1].length:0);if(groups.some(g=>idx>=g.index&&idx<g.end))continue;groups.push({index:idx,end:spaced.lastIndex,nums:[num(m[2]),num(m[3]),num(m[4])],unit:adapterUnitValue(m[5]),explicitUnit:true,source:m[0].trim()});}
 // 4) Three bare numbers with separators, including 1200-800-400 and 15*15*15.
 const bare=new RegExp('('+n+')\\s*(?:×|x|-|\\*)\\s*('+n+')\\s*(?:×|x|-|\\*)\\s*('+n+')(?![\\d.,])','ig');
 while((m=bare.exec(t))){if(groups.some(g=>m.index>=g.index&&m.index<g.end))continue;const before=t.slice(Math.max(0,m.index-70),m.index).toLowerCase();const after=t.slice(bare.lastIndex,Math.min(t.length,bare.lastIndex+80)).toLowerCase();if(/(?:накладн|сч[её]т|дата|артикул|арт\\.|sku|модель)\\s*[:№#-]?\\s*$/.test(before)&&!/(?:груз|габарит|размер|ящик|короб|паллет|мест|шт|кол-?во|количество)/i.test(after))continue;groups.push({index:m.index,end:bare.lastIndex,nums:[num(m[1]),num(m[2]),num(m[3])],unit:null,explicitUnit:false,source:m[0]});}
 // 5) Three bare numbers separated only by spaces, but avoid dates/service numbers.
 const bareSpaced=new RegExp('(^|[^\\d.,])('+n+')\\s+('+n+')\\s+('+n+')(?!\\s*(?:\\d|[./-]))','ig');
 while((m=bareSpaced.exec(t))){const idx=m.index+(m[1]?m[1].length:0);if(groups.some(g=>idx>=g.index&&idx<g.end))continue;const before=t.slice(Math.max(0,idx-60),idx).toLowerCase();if(/(?:накладн|сч[её]т|дата|артикул|арт\\.|sku|модель|вес)\\s*[:№#-]?\\s*$/.test(before))continue;groups.push({index:idx,end:bareSpaced.lastIndex,nums:[num(m[2]),num(m[3]),num(m[4])],unit:null,explicitUnit:false,source:m[0].trim()});}
 return groups.sort((a,b)=>a.index-b.index);
}
function adapterQuantityContext(text,g,nextIndex){
 const before=text.slice(Math.max(0,g.index-260),g.index), after=text.slice(g.end,Math.min(text.length,nextIndex==null?text.length:g.end+320));
 const qty='(\\d+(?:[.,]\\d+)?)'; const words='(?:шт\\.?|штук(?:и|а)?|мест(?:о|а)?|паллет(?:а|ы)?|короб(?:ок|а)?|коробк(?:а|и)|ящик(?:а|и)?|cll|pcs?)'; let m;
 // Explicit count after dimensions: × 4, 4 шт, 2 таких места, количество: 4.
 m=after.match(new RegExp('^\\s*(?:×|x|\\*)\\s*'+qty+'\\s*(?:'+words+')?','i'));if(m)return {q:Math.max(1,Math.round(num(m[1]))),explicit:true};
 m=after.match(new RegExp('^\\s*(?:[-–—,:;.]\\s*)?(?:кол-?во|количество|qty|мест|места|место)\\s*[:=-]?\\s*'+qty+'\\s*'+words+'?','i'));if(m)return {q:Math.max(1,Math.round(num(m[1]))),explicit:true};
 m=after.match(new RegExp('^\\s*(?:[-–—,:;.]\\s*)?'+qty+'\\s*(?:таких\\s+)?'+words,'i'));if(m)return {q:Math.max(1,Math.round(num(m[1]))),explicit:true};
 // cll can be attached to the quantity: X 1cll / 1cll.
 m=after.match(new RegExp('^\\s*(?:×|x|\\*)?\\s*'+qty+'\\s*cll\\b','i'));if(m)return {q:Math.max(1,Math.round(num(m[1]))),explicit:true};
 // Count before dimensions: 5 паллет / 1 место / 51 коробку.
 const bm=[...before.matchAll(new RegExp('(?:^|[^\\d])'+qty+'\\s*'+words,'giu'))];if(bm.length){const last=bm[bm.length-1];return {q:Math.max(1,Math.round(num(last[1]||last[0].match(new RegExp(qty))[1]))),explicit:true};}
 // "Всего планируют отправить 51 коробку ... каждая"
 m=before.match(new RegExp('(?:всего|планируют\\s+отправить|отправить|количество|кол-?во)\\D{0,80}'+qty+'\\s*(?:короб(?:ок|а)?|коробк(?:а|и)|паллет(?:а|ы)?|мест(?:о|а)?|штук?)','i'));if(m)return {q:Math.max(1,Math.round(num(m[1]))),explicit:true};
 // Same local block/line after dimensions, including "... = weight"; do not use weight.
 const blockAfter=after.split(/\n\s*(?:позиция|item|поз\.?|\\d+[.)])\s*/i)[0];
 m=blockAfter.match(new RegExp('(?:кол-?во|количество|мест(?:о|а)?|всего\\s+мест)\\s*[:=-]?\\s*'+qty+'\\s*'+words+'?','i'));if(m)return {q:Math.max(1,Math.round(num(m[1]))),explicit:true};
 return {q:1,explicit:false};
}
function adapterSplitBlocks(text){
 const raw=String(text||'').replace(/\r/g,'').split('\n'), blocks=[];let cur=[];
 for(const line of raw){const s=line.trim();if(!s){if(cur.length){blocks.push(cur.join('\n'));cur=[];}continue;}if(/^(?:позиция|поз\.?|item)\s*\d+/i.test(s)&&cur.length){blocks.push(cur.join('\n'));cur=[s];}else cur.push(s);}if(cur.length)blocks.push(cur.join('\n'));return blocks.length?blocks:[String(text||'')];
}
function adapterParse(text){
 const rows=[];for(const block of adapterSplitBlocks(text)){const groups=adapterFindDimensionGroups(block);for(let i=0;i<groups.length;i++){const g=groups[i], next=groups[i+1]?groups[i+1].index:null, qc=adapterQuantityContext(block,g,next);let unit=g.unit;if(!unit){const choice=chooseUnit(g.nums,qc.q,null);unit=choice.unit;}const single=g.nums.reduce((p,v)=>p*v*UNIT_TO_M[unit],1);const warning=g.explicitUnit?'':`Единица не указана. Принято: ${unit}. Проверьте исходные данные.`;rows.push({raw:block,dims:g.nums,unit,quantity:qc.q,single,total:single*qc.q,confidence:g.explicitUnit?'high':'medium',warning,explicitUnit:g.explicitUnit,explicitQuantity:qc.explicit});}}return rows;}
function adaptedRows(){return adapterParse(els.input.value)}
function updateAdapterPreview(rows=adaptedRows()){if(!els.adapter)return;if(!rows.length){els.adapter.style.display='none';els.adapter.innerHTML='';return}els.adapter.style.display='block';els.adapter.innerHTML=`<div class="adapter-title">🧠 Адаптированные данные</div><div class="adapter-hint">Формат, который получает расчётное ядро: L × W × H + единица + количество.</div>`+rows.map((r,i)=>`<div class="adapter-row"><span><b>Позиция ${i+1}</b> — ${r.dims.join(' × ')} ${r.unit} × ${r.quantity} шт.</span>${r.warning?`<div class="adapter-warning">⚠️ ${r.warning}</div>`:''}</div>`).join('')}
function adaptText(){
 const rows=adaptedRows();
 if(!rows.length){updateAdapterPreview(rows);return}
 const canonical=rows.map(r=>`${r.dims.join(' × ')} ${r.unit} × ${r.quantity} шт.`).join('\n');
 els.input.value=canonical;
 // Канонический текст используется как формат ввода, но сохраняем
 // уверенность исходного распознавания: автоопределённая единица не
 // превращается в явно указанную только из-за адаптации.
 state.items=rows.map(r=>({...r}));
 render();
 updateAdapterPreview(rows);
}
els.calc.addEventListener('click',calculate);els.input.addEventListener('input',()=>{clearTimeout(window.__calcTimer);window.__calcTimer=setTimeout(calculate,250)});els.input.addEventListener('paste',()=>setTimeout(calculate,30));if(els.adapt)els.adapt.addEventListener('click',adaptText);els.details.addEventListener('click',e=>{const b=e.target.closest('.btn-badge');if(b)setUnit(+b.dataset.i,b.dataset.u)});els.clear.addEventListener('click',()=>{els.input.value='';state.items=[];els.adapter.style.display='none';render();els.input.focus()});els.copy.addEventListener('click',async()=>{let r='📊 ОТЧЕТ ПО РАСЧЕТУ ОБЪЕМА:\n\n';state.items.forEach((x,i)=>{r+=`• Позиция ${i+1}: ${x.dims.join('x')} ${x.unit} × ${x.quantity} шт. = ${fmt(x.total)} м³\n`;if(x.warning)r+=`  ⚠️ ${x.warning}\n`});r+=`\n🚚 ОБЩИЙ ОБЪЕМ: ${fmt(state.items.reduce((s,x)=>s+x.total,0))} м³\n🔢 ВСЕГО МЕСТ: ${state.items.reduce((s,x)=>s+x.quantity,0)} шт.`;try{await navigator.clipboard.writeText(r)}catch(_){}});
function theme(t){document.documentElement.classList.remove('light','dark');let actual=t;if(t==='system')actual=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.classList.add(actual);localStorage.setItem('theme',t);document.querySelectorAll('.theme-switch button').forEach(b=>b.classList.remove('active'));const bt=$('theme-'+t);if(bt)bt.classList.add('active')}
$('theme-light').onclick=()=>theme('light');$('theme-dark').onclick=()=>theme('dark');$('theme-system').onclick=()=>theme('system');theme(localStorage.getItem('theme')||'system');
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
