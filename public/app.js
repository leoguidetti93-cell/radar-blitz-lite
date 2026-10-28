const $=s=>document.querySelector(s);
const TZ='America/Sao_Paulo';
const color=n=>Number(n)===0?'white':(Number(n)>=1&&Number(n)<=7?'yellow':'black');
const parts=t=>{let p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))};
const fmt=t=>{let p=parts(t);return `${p.hour}:${p.minute}:${p.second}`};
function normalize(raw){
 let a=Array.isArray(raw)?raw:(raw?.data||raw?.history||raw?.results||raw?.items||raw?.rounds||[]);
 return a.map(x=>({number:Number(x.number??x.result),ts:new Date(x.instant||x.created_at_utc||x.created_at_local||x.created_at||x.ts).getTime()}))
 .filter(x=>Number.isFinite(x.number)&&x.ts).sort((a,b)=>b.ts-a.ts).slice(0,200)
}
function mkStone(r){
 let c=color(r.number),el=document.createElement('div');el.className='stone '+c;
 el.textContent=c==='white'?'ϟ':r.number; return el
}

/* Cada linha = bloco cronológico de 10 minutos (ex. 10:00–10:09).
   10 colunas x 2 pedras = 20 posições.
   Sempre 10 linhas = 200 posições.
   Ao entrar em x0 (10,20,30...), nasce uma nova linha no topo.
   A 11ª linha desaparece. */
function blockKey(r){
 let p=parts(r.ts), m=Number(p.minute), start=Math.floor(m/10)*10;
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${String(start).padStart(2,'0')}`;
}
function render(rows){
 if(!rows.length)return;
 const last=rows[0],c=color(last.number),ls=$('#lastStone');
 ls.className='stone hero '+c;ls.textContent=c==='white'?'ϟ':last.number;
 $('#lastNumber').textContent=c==='white'?'BRANCO':last.number;$('#lastTime').textContent=fmt(last.ts);

 const wi=rows.findIndex(r=>r.number===0);
 $('#recovery').textContent=wi<0?'200+':wi;
 $('#lastWhite').textContent=wi>=0?fmt(rows[wi].ts).slice(0,5):'--:--';

 let ct={black:0,yellow:0,white:0};rows.forEach(r=>ct[color(r.number)]++);
 Object.keys(ct).forEach(k=>$('#'+k+'Pct').textContent=(ct[k]*100/rows.length).toFixed(1)+'%');

 const whites=rows.map((r,i)=>r.number===0?i:null).filter(x=>x!==null).slice(0,4),g=[];
 for(let i=0;i<whites.length-1;i++)g.push(whites[i+1]-whites[i]);
 $('#avgWhite').textContent=g.length?(g.reduce((a,b)=>a+b,0)/g.length).toFixed(1):'--';

 // % BRANCO por COLUNA de minuto final (00..59), usando as 200 rodadas.
 const colStats=Array.from({length:60},(_,m)=>{
   const a=rows.filter(r=>Number(parts(r.ts).minute)===m);
   return {total:a.length,white:a.filter(r=>r.number===0).length}
 });

 // Agrupa as rodadas em blocos reais de 10 minutos.
 const map=new Map();
 rows.forEach(r=>{let k=blockKey(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r)});
 let blocks=[...map.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10);

 // Garante 10 linhas mesmo se a API ainda não trouxe 10 blocos completos.
 if(blocks.length){
   let [datepart,timepart]=blocks[blocks.length-1][0].split('T');
   let base=new Date(`${datepart}T${timepart}:00-03:00`);
   while(blocks.length<10){
     base=new Date(base.getTime()-10*60000);
     let p=parts(base.getTime()), start=Math.floor(Number(p.minute)/10)*10;
     let k=`${p.year}-${p.month}-${p.day}T${p.hour}:${String(start).padStart(2,'0')}`;
     blocks.push([k,[]]);
   }
 }

 const grid=$('#grid');grid.innerHTML='';
 blocks.forEach(([key,brows])=>{
   let start=Number(key.slice(-2)), hour=key.slice(11,13), end=start+9;
   let row=document.createElement('div');row.className='catalog-row';
   let lab=document.createElement('div');lab.className='row-label';
   lab.innerHTML=`<b>${hour}:${String(start).padStart(2,'0')}</b><span>— ${hour}:${String(end).padStart(2,'0')}</span>`;
   row.appendChild(lab);

   let dec=document.createElement('div');dec.className='decade';
   for(let m=start;m<=end;m++){
     let st=colStats[m],pct=st.total?st.white*100/st.total:0;
     let cell=document.createElement('div');cell.className='minute';
     cell.innerHTML=`<div class="minute-head"><b>${String(m).padStart(2,'0')}</b><span class="${pct?'hot':''}">BRANCO ${pct.toFixed(1)}%</span></div><div class="minute-stones"></div>`;
     let box=cell.querySelector('.minute-stones');
     let rr=brows.filter(r=>Number(parts(r.ts).minute)===m).sort((a,b)=>a.ts-b.ts).slice(0,2);
     rr.forEach(r=>box.appendChild(mkStone(r)));
     for(let x=rr.length;x<2;x++){let e=document.createElement('div');e.className='empty';box.appendChild(e)}
     dec.appendChild(cell)
   }
   row.appendChild(dec);grid.appendChild(row)
 });
 $('#updated').textContent=fmt(Date.now());
}
async function load(){try{let r=await fetch('/api/rounds',{cache:'no-store'});if(!r.ok)throw Error();render(normalize(await r.json()))}catch(e){console.warn('Feed indisponível',e)}}
setInterval(()=>$('#clock').textContent=fmt(Date.now()),1000);load();setInterval(load,15000);