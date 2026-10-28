const $=s=>document.querySelector(s);
const TZ='America/Sao_Paulo';
const color=n=>Number(n)===0?'white':(Number(n)>=1&&Number(n)<=7?'yellow':'black');
const parts=t=>{let p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))};
const fmt=t=>{let p=parts(t);return `${p.hour}:${p.minute}:${p.second}`};
function normalize(raw){let a=Array.isArray(raw)?raw:(raw?.data||raw?.history||raw?.results||raw?.items||raw?.rounds||[]);return a.map(x=>({number:Number(x.number??x.result),ts:new Date(x.instant||x.created_at_utc||x.created_at_local||x.created_at||x.ts).getTime()})).filter(x=>Number.isFinite(x.number)&&x.ts).sort((a,b)=>b.ts-a.ts).slice(0,200)}
function mkStone(r,hero=false){let c=color(r.number),el=document.createElement('div');el.className='stone '+c+(hero?' hero':'');el.textContent=c==='white'?'ϟ':r.number;return el}
function render(rows){
 if(!rows.length)return;
 const last=rows[0],c=color(last.number),ls=$('#lastStone');ls.className='stone hero '+c;ls.textContent=c==='white'?'ϟ':last.number;$('#lastNumber').textContent=c==='white'?'BRANCO':last.number;$('#lastTime').textContent=fmt(last.ts);
 const wi=rows.findIndex(r=>r.number===0);$('#recovery').textContent=wi<0?'200+':wi;$('#lastWhite').textContent=wi>=0?fmt(rows[wi].ts).slice(0,5):'--:--';
 let ct={black:0,yellow:0,white:0};rows.forEach(r=>ct[color(r.number)]++);Object.keys(ct).forEach(k=>$('#'+k+'Pct').textContent=(ct[k]*100/rows.length).toFixed(1)+'%');
 const whites=rows.map((r,i)=>r.number===0?i:null).filter(x=>x!==null).slice(0,4),g=[];for(let i=0;i<whites.length-1;i++)g.push(whites[i+1]-whites[i]);$('#avgWhite').textContent=g.length?(g.reduce((a,b)=>a+b,0)/g.length).toFixed(1):'--';
 const minuteStats=Array.from({length:60},(_,m)=>{let a=rows.filter(r=>Number(parts(r.ts).minute)===m);return{total:a.length,white:a.filter(r=>r.number===0).length}});
 // Build chronological hour groups; show enough rows to represent the 200-round window,
 // each minute cell always max 2 stones.
 const groups=new Map(); rows.forEach(r=>{let p=parts(r.ts),key=`${p.year}-${p.month}-${p.day} ${p.hour}`;(groups.get(key)||groups.set(key,[]).get(key)).push(r)});
 let hourGroups=[...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
 const grid=$('#grid');grid.innerHTML='';
 hourGroups.forEach(([hourKey,hrows])=>{
   let hourLabel=document.createElement('div');hourLabel.className='hour-label';hourLabel.textContent=hourKey.slice(-2)+':00';grid.appendChild(hourLabel);
   for(let d=0;d<6;d++){let dec=document.createElement('div');dec.className='decade';
    for(let m=d*10;m<d*10+10;m++){let cell=document.createElement('div');cell.className='minute';let st=minuteStats[m],pct=st.total?st.white*100/st.total:0;cell.innerHTML=`<div class="minute-head"><b>${String(m).padStart(2,'0')}</b><span class="${pct?'hot':''}">BRANCO ${pct.toFixed(1)}%</span></div><div class="minute-stones"></div>`;let box=cell.querySelector('.minute-stones');let rr=hrows.filter(r=>Number(parts(r.ts).minute)===m).sort((a,b)=>a.ts-b.ts).slice(0,2);rr.forEach(r=>box.appendChild(mkStone(r)));for(let x=rr.length;x<2;x++){let e=document.createElement('div');e.className='empty';box.appendChild(e)}dec.appendChild(cell)}
    grid.appendChild(dec)
   }
 });
 $('#updated').textContent=fmt(Date.now());
}
async function load(){try{let r=await fetch('/api/rounds',{cache:'no-store'});if(!r.ok)throw Error();render(normalize(await r.json()))}catch(e){console.warn('Feed indisponível')}}
setInterval(()=>$('#clock').textContent=fmt(Date.now()),1000);load();setInterval(load,15000);