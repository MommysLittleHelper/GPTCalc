(() => {
'use strict';
const UNIT_TO_M = {m:1, 'м':1, 'см':0.01, 'мм':0.001};
const $ = id => document.getElementById(id);
const els = {input:$('inputText'),calc:$('calcBtn'),result:$('resultBox'),totalVolume:$('totalVolume'),totalPieces:$('totalPieces'),details:$('detailsList'),copy:$('copyBtn'),clear:$('clearBtn'),status:$('calcStatus')};
const state={items:[]};

function num(s){return Number(String(s).replace(',', '.'))}
function nPattern(){return '(?:\\\\d+(?:[.,]\\\\d+)?|[.,]\\\\d+)'}
function norm(s){
  return String(s||'')
    .replace(/[×✕✖хХ]/g,'x')
    .replace(/\u00a0/g,' ')
    .replace(/[–—]/g,'-');
}
function unitNear(t,end){
  const s=t.slice(end,end+35).toLowerCase();
  const m=s.match(/^\s*(мм|mm|см|cm|м|m)\b/);
  return m ? ({mm:'мм',mm:'мм',cm:'см',см:'см',m:'м'}[m[1]] || m[1]) : null;
}
function quantityFromContext(t,start,end){
  const before=t.slice(Math.max(0,start-80),start);
  const after=t.slice(end,Math.min(t.length,end+80));
  const qPatterns=[
    /(?:^|[^\d])(\d+(?:[.,]\d+)?)\s*(?:шт\.?|штук|мест(?:а|о)?|pcs?)\s*$/i,
    /(?:^|[^\d])(?:количеств(?:о|а)?|qty)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*$/i
  ];
  for(const re of qPatterns){
    const m=before.match(re);
    if(m)return Math.max(1,Math.round(num(m[1])));
  }
  // Forms after dimensions: "1200x800x600 мм × 7", "... × 7 шт."
  let m=after.match(/^\s*(?:мм|см|м|mm|cm|m)?\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*(?:шт\.?|штук|мест(?:а|о)?|pcs?))?/i);
  if(m)return Math.max(1,Math.round(num(m[1])));
  m=after.match(/^\s*(?:,|;|-)?\s*(\d+(?:[.,]\d+)?)\s*(?:шт\.?|штук|мест(?:а|о)?|pcs?)\b/i);
  if(m)return Math.max(1,Math.round(num(m[1])));
  return 1;
}
function candidates(nums){
  return ['мм','см','м'].map(u=>{
    const k=UNIT_TO_M[u],d=nums.map(v=>v*k),single=d[0]*d[1]*d[2];
    return {unit:u,dimsM:d,single,total:single};
  });
}
function score(c,nums,q){
  const max=Math.max(...c.dimsM), min=Math.min(...c.dimsM), vol=c.single*q;
  let s=0;
  // Cargo plausibility: favour ordinary transport/package dimensions,
  // not room-scale dimensions. Quantity participates in ambiguity resolution.
  if(max>=0.15&&max<=4)s+=35;
  else if(max>4&&max<=8)s+=12;
  else if(max>8&&max<=15)s-=8;
  else s-=30;
  if(min>=0.02&&min<=2)s+=20; else if(min>2)s-=18;
  if(c.single>=0.00001&&c.single<=20)s+=25; else if(c.single<=100)s+=5; else s-=35;
  if(vol>=0.00001&&vol<=200)s+=15; else if(vol<=1000)s+=3; else s-=20;
  if(c.unit==='мм'&&nums.every(v=>v>=250&&v<=5000))s+=25;
  if(c.unit==='см'&&nums.every(v=>v>=10&&v<=500))s+=22;
  if(c.unit==='м'&&nums.every(v=>v>=0.3&&v<=8))s+=22;
  // Very small counts don't override physical plausibility; large counts
  // strengthen a compact cargo interpretation.
  if(q>=10 && c.unit!=='м')s+=8;
  if(q>=50 && c.unit==='мм')s+=8;
  return s;
}
function choose(nums,q,explicit){
  const cs=candidates(nums);
  if(explicit){
    const c=cs.find(x=>x.unit===explicit);
    return {c,confidence:'high',warning:''};
  }
  const ranked=cs.map(c=>({...c,score:score(c,nums,q)})).sort((a,b)=>b.score-a.score);
  const [best,second]=ranked;
  const margin=best.score-second.score;
  return {
    c:best,
    confidence:margin<=12?'low':'medium',
    warning:`⚠️ Единица не указана. Автовыбор: ${best.unit}. Проверьте единицу в исходном тексте.`
  };
}
function extract(line){
  const t=norm(line), n=nPattern();
  const re=new RegExp(`(${n})\\s*x\\s*(${n})\\s*x\\s*(${n})(?!\\s*x)`, 'ig');
  const out=[]; let m;
  while((m=re.exec(t))){
    const nums=[num(m[1]),num(m[2]),num(m[3])];
    if(nums.every(Number.isFinite)&&nums.every(v=>v>0)){
      const unit=unitNear(t,re.lastIndex);
      const q=quantityFromContext(t,m.index,re.lastIndex);
      out.push({nums,unit,q});
    }
  }
  return out;
}
function parse(text){
  const out=[];
  for(const line of String(text||'').split(/\r?\n/)){
    for(const f of extract(line)){
      const d=choose(f.nums,f.q,f.unit), c=d.c;
      out.push({
        raw:line,dims:f.nums,unit:c.unit,quantity:f.q,
        single:c.single,total:c.single*f.q,
        confidence:d.confidence,warning:d.warning,explicitUnit:!!f.unit
      });
    }
  }
  return out;
}
function fmt(x){return x.toFixed(4)}
function render(){
  const a=state.items;
  if(!a.length){els.result.style.display='none';return}
  const total=a.reduce((s,x)=>s+x.total,0),pieces=a.reduce((s,x)=>s+x.quantity,0),low=a.filter(x=>x.confidence==='low').length,auto=a.filter(x=>!x.explicitUnit).length;
  els.result.style.display='block';els.totalVolume.innerHTML=`<strong>${fmt(total)}</strong> м³`;els.totalPieces.textContent=`${pieces} шт.`;
  els.status.className='calc-status '+(low?'warning':auto?'neutral':'success');
  els.status.textContent=low?`⚠️ Требует проверки: ${low} ${low===1?'позиция':'позиции'} с неоднозначной единицей`:auto?`ℹ️ ${auto} ${auto===1?'единица выбрана':'единицы выбраны'} автоматически`:'✓ Расчёт выполнен по явно указанным единицам';
  els.details.innerHTML='';
  a.forEach((x,i)=>{
    const d=document.createElement('div');d.className='detail-line '+(x.confidence==='low'?'warning-line':'');
    d.innerHTML=`<div><strong>Позиция ${i+1}:</strong> ${x.dims.join('×')} ${x.unit} × ${x.quantity} шт. = <strong>${fmt(x.total)} м³</strong></div><div class="badge-group"><button class="btn-badge ${x.unit==='м'?'active':''}" data-i="${i}" data-u="м">м</button><button class="btn-badge ${x.unit==='см'?'active':''}" data-i="${i}" data-u="см">см</button><button class="btn-badge ${x.unit==='мм'?'active':''}" data-i="${i}" data-u="мм">мм</button></div>${x.warning?`<div class="warning-text">${x.warning}</div>`:''}`;
    els.details.appendChild(d);
  });
}
function setUnit(i,u){const x=state.items[i];if(!x)return;const k=UNIT_TO_M[u];x.unit=u;x.single=x.dims[0]*x.dims[1]*x.dims[2]*k*k*k;x.total=x.single*x.quantity;x.explicitUnit=true;x.confidence='high';x.warning='';render()}
els.calc.addEventListener('click',()=>{state.items=parse(els.input.value);render()});
els.details.addEventListener('click',e=>{const b=e.target.closest('.btn-badge');if(b)setUnit(+b.dataset.i,b.dataset.u)});
els.clear.addEventListener('click',()=>{els.input.value='';state.items=[];render();els.input.focus()});
els.copy.addEventListener('click',async()=>{
  const total=state.items.reduce((s,x)=>s+x.total,0),pieces=state.items.reduce((s,x)=>s+x.quantity,0);
  let r='📊 ОТЧЕТ ПО РАСЧЕТУ ОБЪЕМА:\\n\\n';
  state.items.forEach((x,i)=>{r+=`• Позиция ${i+1}: ${x.dims.join('x')} ${x.unit} × ${x.quantity} шт. = ${fmt(x.total)} м³\\n`;if(x.warning)r+=`  ${x.warning}\\n`});
  r+=`\\n🚚 ОБЩИЙ ОБЪЕМ: ${fmt(total)} м³\\n🔢 ВСЕГО МЕСТ: ${pieces} шт.`;
  try{await navigator.clipboard.writeText(r)}catch(_){}
});
function theme(t){document.documentElement.classList.remove('light','dark');let actual=t;if(t==='system')actual=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.classList.add(actual);localStorage.setItem('theme',t);document.querySelectorAll('.theme-switch button').forEach(b=>b.classList.remove('active'));$('theme-'+t).classList.add('active')}
$('theme-light').onclick=()=>theme('light');$('theme-dark').onclick=()=>theme('dark');$('theme-system').onclick=()=>theme('system');theme(localStorage.getItem('theme')||'system');
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();