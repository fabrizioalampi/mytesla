(()=>{
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
let idc = 0; const uid = () => 'x' + Date.now().toString(36) + (++idc).toString(36);
const STORE_KEY = 'light-show-studio:v1';
const DEMO_NAME = 'Brano demo (sintetico, 120 BPM)';

/* ---------- state ---------- */
const S = {name:'Il mio light show', step:20, dur:34, effects:[], audioName:'', isDemo:false};
const ui = {collapsed:{'g-ct':true,'g-int':true}, expanded:{}, sel:new Set(), tool:{light:'on',closure:'open',bar:'sweepR',rgb:'color'},
  snap:true, follow:true, rec:false, tab:'tools', showCT:false, genStyle:'equilibrato', genClos:true, genWin:true, genExt:false, confirmNew:false, confirmGen:false};
let audioBuf=null, an=null, rnd=null, sim=null, grid=[];
let cur=0, playing=false, actx=null, srcNode=null, gainNode=null, playT0=0, playOff=0, wallT0=0;
const hist=[], redoSt=[]; let clip=null;

/* ---------- utils ---------- */
const fmt = (t,dec=2) => { t=Math.max(0,t); const m=Math.floor(t/60), s=t-m*60; return m+':'+(s<10?'0':'')+s.toFixed(dec); };
const fmtS = t => { const m=Math.floor(t/60), s=Math.round(t-m*60); return m+':'+(s<10?'0':'')+s; };
const q = t => Math.round(t*1000/S.step)*S.step/1000;
const r3 = v => Math.round(v*1000)/1000;
function toast(msg, ms=2600){ const el=$('#toast'); el.textContent=msg; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>el.hidden=true, ms); }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fileBase(){ const b=(S.name||'lightshow').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,''); return b || 'lightshow'; }
function beatLen(){ if (an && an.bpm) return 60/an.bpm; return 0.5; }

/* ---------- audio kept in this browser between sessions (IndexedDB, best effort) ---------- */
const audioStore = {
  open(){ return new Promise((res,rej)=>{ try { const r=indexedDB.open('light-show-studio',1); r.onupgradeneeded=()=>r.result.createObjectStore('audio'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); } catch(e){ rej(e); } }); },
  async put(v){ try { const db=await this.open(); await new Promise((res,rej)=>{ const tx=db.transaction('audio','readwrite'); tx.objectStore('audio').put(v,'current'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); } catch(e){} },
  async get(){ try { const db=await this.open(); return await new Promise((res,rej)=>{ const r=db.transaction('audio').objectStore('audio').get('current'); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); }); } catch(e){ return null; } }
};
/* ---------- downloads ---------- */
let dlP = null;
function downloads(){ if (!dlP) dlP = (window.claude && window.claude.use) ? window.claude.use('downloads').catch(()=>null) : Promise.resolve(null); return dlP; }
async function saveFile(filename, data, okMsg){
  const dl = await downloads();
  if (dl){
    try { const r = await dl.save({filename, data}); if (r && r.status==='saved') toast(okMsg||('File salvato: '+filename), 4000); return true; }
    catch(e){ const c=e&&e.code; if (c==='declined') toast('Salvataggio annullato.'); else if (c==='rate_limited') toast('C\'è già una richiesta di salvataggio aperta.'); else toast('Il salvataggio non è disponibile qui ('+(c||'errore')+').'); return false; }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 4000);
    return true;
  } catch(e){ toast('Il salvataggio non è disponibile in questa vista.'); return false; }
}

/* ---------- theme colors for canvas ---------- */
let C = {};
function readColors(){
  const cs = getComputedStyle(document.documentElement); const g = n => cs.getPropertyValue(n).trim();
  C = {bg:g('--bg'),panel:g('--panel'),panel2:g('--panel2'),line:g('--line'),fg:g('--fg'),muted:g('--muted'),accent:g('--accent'),err:g('--err'),
    front:g('--c-front'),turn:g('--c-turn'),rear:g('--c-rear'),clos:g('--c-clos'),bar:g('--c-bar'),rgb:g('--c-rgb'),mono:g('--font-mono'),disp:g('--font-display'),body:g('--font-body')};
  dark = luminance(C.panel) < 0.4;
}
let dark = true;
function luminance(hex){ const [r,g,b]=hexRgb(hex); return (0.299*r+0.587*g+0.114*b)/255; }
function rgba(hex,a){ const [r,g,b]=hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{ readColors(); requestDraw(); });
new MutationObserver(()=>{ readColors(); requestDraw(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* ---------- history ---------- */
function snap(){ return JSON.stringify(S.effects); }
function pushHist(){ hist.push(snap()); if (hist.length>120) hist.shift(); redoSt.length=0; }
function undo(){ if(!hist.length) return; redoSt.push(snap()); S.effects=JSON.parse(hist.pop()); pruneSel(); changed(); toast('Annullato'); }
function redo(){ if(!redoSt.length) return; hist.push(snap()); S.effects=JSON.parse(redoSt.pop()); pruneSel(); changed(); }
function pruneSel(){ const ids=new Set(S.effects.map(e=>e.id)); for (const id of [...ui.sel]) if(!ids.has(id)) ui.sel.delete(id); }

/* ---------- recompute pipeline ---------- */
let rcT=0;
function changed(fast){ requestDraw(); renderInspector(); clearTimeout(rcT); rcT=setTimeout(recompute, fast?0:140); }
function recompute(){
  rnd = renderChannels(S.effects, S.dur, S.step, false);
  sim = simulate(rnd);
  if (S.effects.some(e=>{const r=ROWMAP[e.row]; return r&&r.kind==='bar';})) ui.showCT = true;
  $('#chChip').textContent = rnd.nch+' canali';
  buildCarSVG.ct !== ui.showCT && buildCarSVG();
  renderCheck(); updatePreview(cur); persist();
}
let pT=0;
function persist(){ clearTimeout(pT); pT=setTimeout(()=>{ try{ localStorage.setItem(STORE_KEY, JSON.stringify({name:S.name,step:S.step,dur:S.dur,audioName:S.audioName,isDemo:S.isDemo,effects:S.effects,expanded:ui.expanded,collapsed:ui.collapsed})); }catch(e){} }, 400); }

/* ---------- rows / layout ---------- */
const HEADER_H=78, GH=24, RH=28, SH=22;
let LW = 176, pps = 60, rows=[], rowsH=HEADER_H, rowByKey={};
function buildRows(){
  rows=[]; rowByKey={}; let y=HEADER_H;
  for (const g of GROUPS){
    rows.push({t:'g',g,y,h:GH}); y+=GH;
    if (ui.collapsed[g.id]) continue;
    for (const r of g.rows){
      const row={t:'r',r:ROWMAP[r.id],key:r.id,y,h:RH}; rows.push(row); rowByKey[r.id]=row; y+=RH;
      if (ui.expanded[r.id] && ROWMAP[r.id+'.L']) for (const s of ['L','R']){ const k=r.id+'.'+s; const sr={t:'r',r:ROWMAP[k],key:k,sub:s,y,h:SH}; rows.push(sr); rowByKey[k]=sr; y+=SH; }
    }
  }
  rowsH=y; sizeSpacer();
}
function recRows(){ return rows.filter(r=>r.t==='r' && (r.r.kind==='ramp'||r.r.kind==='bool')).slice(0,9); }

/* ---------- canvas ---------- */
const cv=$('#cv'), ctx=cv.getContext('2d'), sc=$('#scroller'), spacer=$('#spacer');
let W=0, H=0, dpr=1;
function sizeCanvas(){
  dpr=Math.min(2,window.devicePixelRatio||1); W=sc.clientWidth; H=sc.clientHeight;
  LW = W<560 ? 120 : 176;
  cv.style.width=W+'px'; cv.style.height=H+'px'; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
  sizeSpacer(); requestDraw();
}
function sizeSpacer(){ spacer.style.width=(LW+S.dur*pps+80)+'px'; spacer.style.height=Math.max(H, rowsH+40)+'px'; }
new ResizeObserver(sizeCanvas).observe(sc);
const xToT = x => (x-LW+sc.scrollLeft)/pps;
const tToX = t => LW + t*pps - sc.scrollLeft;
const yToRow = y => { const yy=y+sc.scrollTop; for (const r of rows) if (yy>=r.y && yy<r.y+r.h) return r; return null; };
let drawReq=false;
function requestDraw(){ if(!drawReq){ drawReq=true; requestAnimationFrame(()=>{ drawReq=false; draw(); }); } }
sc.addEventListener('scroll', requestDraw, {passive:true});

const colorOf = r => C[r.color] || C.front;
function profile(type, durS){
  /* intensity profile points [x0..1, y0..1] for drawing inside a block */
  if (type==='on'||type==='strobe') return null;
  const ms = RAMP_MS[type]; if (!ms) return null;
  const fr = Math.min(1, (ms/1000)/Math.max(0.001,durS));
  if (type.startsWith('on')) return [[0,0],[fr,fr>=1?Math.min(1,durS*1000/ms):1],[1,fr>=1?Math.min(1,durS*1000/ms):1]];
  return [[0,1],[fr,fr>=1?1-Math.min(1,durS*1000/ms):0],[1,fr>=1?1-Math.min(1,durS*1000/ms):0]];
}
function draw(){
  if (!W) return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=C.panel; ctx.fillRect(0,0,W,H);
  const st=sc.scrollTop, t0=xToT(LW), t1=xToT(W);
  // rows background
  for (const r of rows){
    const y=r.y-st; if (y+r.h<HEADER_H || y>H) continue;
    if (r.t==='g'){ ctx.fillStyle=C.panel2; ctx.fillRect(LW,y,W-LW,r.h); }
    else if (r.sub){ ctx.fillStyle=rgba(C.panel2,0.55); ctx.fillRect(LW,y,W-LW,r.h); }
    ctx.fillStyle=C.line; ctx.fillRect(LW,y+r.h-1,W-LW,1);
  }
  // beat grid
  if (an && an.beats && an.beats.length){
    const bl=beatLen(); const showB=bl*pps>9;
    an.beats.forEach((b,i)=>{ if (b<t0-1||b>t1+1) return; const down=((i-an.downPhase)%4+4)%4===0; if(!showB && !down) return; const x=Math.round(tToX(b))+0.5; ctx.fillStyle=rgba(C.muted, down?0.22:0.09); ctx.fillRect(x,HEADER_H,1,H-HEADER_H); });
  }
  // effects
  ctx.save(); ctx.beginPath(); ctx.rect(LW,HEADER_H,W-LW,H-HEADER_H); ctx.clip();
  ctx.font=`500 11px ${C.body}`; ctx.textBaseline='middle';
  for (const e of S.effects){
    if (e.end<t0 || e.start>t1) continue;
    const r=ROWMAP[e.row]; if (!r) continue;
    let row=rowByKey[e.row], half=0;
    if (!row && r.parent && rowByKey[r.parent]){ row=rowByKey[r.parent]; half=r.sub==='L'?1:2; }
    if (!row){ const gr=rows.find(x=>x.t==='g'&&x.g.id===r.group); if (gr && ui.collapsed[r.group]){ const x0=tToX(e.start), x1=tToX(e.end); const y=gr.y-st; ctx.fillStyle=rgba(colorOf(r),0.55); ctx.fillRect(x0, y+gr.h-7, Math.max(1,x1-x0), 4); } continue; }
    let y=row.y-st+3, h=row.h-6; if (half){ h=(row.h-8)/2; if (half===2) y+=h+2; } if (y+h<HEADER_H||y>H) continue;
    const x0=tToX(e.start), x1=tToX(e.end), w=Math.max(2,x1-x0), col=colorOf(r), sel=ui.sel.has(e.id);
    if (r.kind==='rgb'){
      const c1=e.p.c1||'#ff3d7f', c2=e.p.c2||c1; const gr=ctx.createLinearGradient(x0,0,x0+w,0);
      if (e.type==='rainbow'){ for (let k=0;k<=6;k++){ const [rr,gg,bb]=hsv(k/6*360*(e.p.cycles||1),1,255); gr.addColorStop(k/6,`rgb(${rr|0},${gg|0},${bb|0})`); } }
      else { gr.addColorStop(0,c1); gr.addColorStop(1,c2); }
      ctx.fillStyle=gr; roundRect(x0,y,w,h,4); ctx.fill();
    } else {
      ctx.fillStyle=rgba(col, dark?0.2:0.16); roundRect(x0,y,w,h,4); ctx.fill();
      const pr = profile(e.type, e.end-e.start);
      ctx.fillStyle=rgba(col, dark?0.75:0.7);
      if (r.kind==='closure'){ ctx.fillStyle=rgba(col, e.type==='dance'?0.55:0.35); roundRect(x0,y,w,h,4); ctx.fill(); }
      else if (e.type==='strobe'){ const per=(e.p.period||200)/1000*pps; if (per>=3){ for (let x=x0; x<x0+w; x+=per) ctx.fillRect(x,y,Math.min(per/2,x0+w-x),h); } else { ctx.fillRect(x0,y,w,h); } }
      else if (r.kind==='bar'){ drawBarIcon(e,x0,y,w,h,col); }
      else if (!pr){ roundRect(x0,y,w,h,4); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x0,y+h); for (const [px,py] of pr) ctx.lineTo(x0+px*w, y+h-py*h); ctx.lineTo(x0+w,y+h); ctx.closePath(); ctx.fill(); }
    }
    ctx.lineWidth = sel?2:1; ctx.strokeStyle = sel ? C.fg : rgba(col,0.9); roundRect(x0+0.5,y+0.5,w-1,h-1,4); ctx.stroke();
    if (w>34 && !half){ const lab = (r.kind==='ramp'&&RAMP_MS[e.type]) ? (e.type.startsWith('on')?'↗ ':'↘ ')+TYPE_SHORT[e.type] : (e.type==='sweepL'?'← ':e.type==='sweepR'?'→ ':'')+TYPE_SHORT[e.type];
      ctx.fillStyle = r.kind==='rgb' ? '#fff' : C.fg; ctx.fillText(lab, x0+6, y+h/2+0.5, w-10); }
  }
  // live recording blocks
  for (const k in recHeld){ const h=recHeld[k], row=rowByKey[h.row]; if(!row) continue; const x0=tToX(h.start), x1=tToX(cur); ctx.fillStyle=rgba(C.err,0.6); ctx.fillRect(x0,row.y-st+3,Math.max(2,x1-x0),row.h-6); }
  // drag-create ghost handled by real effect
  ctx.restore();
  // header (ruler + waveform)
  ctx.fillStyle=C.panel; ctx.fillRect(0,0,W,HEADER_H); ctx.fillStyle=C.line; ctx.fillRect(0,HEADER_H-1,W,1);
  ctx.save(); ctx.beginPath(); ctx.rect(LW,0,W-LW,HEADER_H); ctx.clip();
  // waveform
  if (an && an.pmin && an.pmin.length){
    const mid=22+28, amp=24, hs=an.hopSec; ctx.fillStyle=rgba(C.muted,0.55);
    for (let x=LW; x<W; x++){
      const ta=xToT(x), tb=xToT(x+1); if (ta>S.dur) break; if (tb<0) continue;
      let i0=Math.max(0,Math.floor(ta/hs)), i1=Math.min(an.pmin.length-1,Math.max(i0,Math.floor(tb/hs)));
      let mn=0,mx=0; for (let i=i0;i<=i1;i++){ if(an.pmin[i]<mn) mn=an.pmin[i]; if(an.pmax[i]>mx) mx=an.pmax[i]; }
      ctx.fillRect(x, mid-mx*amp, 1, Math.max(1,(mx-mn)*amp));
    }
  } else { ctx.fillStyle=C.muted; ctx.font=`12px ${C.body}`; ctx.fillText('Nessun audio caricato', LW+10, 50); }
  // ruler
  const steps=[0.1,0.25,0.5,1,2,5,10,15,30,60]; let stp=steps.find(s=>s*pps>=70)||60;
  ctx.font=`500 10px ${C.mono}`; ctx.textBaseline='top';
  for (let t=Math.max(0,Math.floor(t0/stp)*stp); t<=Math.min(t1,S.dur+stp); t+=stp){ const x=Math.round(tToX(t))+0.5; ctx.fillStyle=C.line; ctx.fillRect(x,0,1,20); ctx.fillStyle=C.muted; ctx.fillText(stp<1?fmt(t,2):fmtS(t), x+4, 5); }
  if (an && an.beats){ an.beats.forEach((b,i)=>{ if(b<t0||b>t1) return; const down=((i-an.downPhase)%4+4)%4===0; const x=Math.round(tToX(b)); ctx.fillStyle=down?C.accent:rgba(C.muted,0.6); ctx.fillRect(x,down?14:17,down?2:1,down?7:4); }); }
  // end of show
  const xe=tToX(S.dur); if (xe<W){ ctx.fillStyle=rgba(C.fg,0.08); ctx.fillRect(xe,0,W-xe,HEADER_H); }
  ctx.restore();
  if (xe<W){ ctx.fillStyle=rgba(C.fg,dark?0.06:0.05); ctx.fillRect(Math.max(LW,xe),HEADER_H,W-Math.max(LW,xe),H-HEADER_H); }
  // labels column
  ctx.fillStyle=C.panel; ctx.fillRect(0,HEADER_H,LW,H-HEADER_H); ctx.fillStyle=C.line; ctx.fillRect(LW-1,0,1,H);
  ctx.save(); ctx.beginPath(); ctx.rect(0,HEADER_H,LW,H-HEADER_H); ctx.clip();
  const rr = ui.rec ? recRows() : [];
  ctx.textBaseline='middle';
  for (const r of rows){
    const y=r.y-st; if (y+r.h<HEADER_H || y>H) continue;
    ctx.fillStyle=C.line; ctx.fillRect(0,y+r.h-1,LW,1);
    if (r.t==='g'){
      ctx.fillStyle=C.panel2; ctx.fillRect(0,y,LW-1,r.h-1);
      ctx.fillStyle=C.muted; ctx.font=`600 10.5px ${C.disp}`; const coll=ui.collapsed[r.g.id];
      ctx.fillText((coll?'▸ ':'▾ ')+r.g.name.toUpperCase(), 10, y+r.h/2+0.5, LW-16);
    } else {
      const R=r.r; ctx.fillStyle=colorOf(R); ctx.fillRect(r.sub?18:8, y+6, 3, r.h-12);
      ctx.fillStyle = r.sub ? C.muted : C.fg; ctx.font = `${r.sub?400:500} ${r.sub?11:12.5}px ${C.body}`;
      const lab = r.sub ? (r.sub==='L'?'Sinistra':'Destra') : R.name;
      ctx.fillText(lab, r.sub?28:17, y+r.h/2+0.5, LW-46);
      if (!r.sub && ROWMAP[R.id+'.L']){ ctx.fillStyle=C.muted; ctx.font=`500 10px ${C.mono}`; ctx.fillText(ui.expanded[R.id]?'SX/DX ▾':'SX/DX ▸', LW-48, y+r.h/2+0.5); }
      const ri=rr.indexOf(r); if (ri>=0){ ctx.fillStyle=recHeldRow(r.key)?C.err:C.accent; roundRect(LW-20,y+5,14,r.h-10,3); ctx.fill(); ctx.fillStyle=dark?'#000':'#fff'; ctx.font=`600 10px ${C.mono}`; ctx.fillText(String(ri+1), LW-16, y+r.h/2+0.5); }
    }
  }
  ctx.restore();
  // corner
  ctx.fillStyle=C.panel; ctx.fillRect(0,0,LW,HEADER_H); ctx.fillStyle=C.line; ctx.fillRect(0,HEADER_H-1,LW,1); ctx.fillRect(LW-1,0,1,HEADER_H);
  ctx.fillStyle=C.muted; ctx.font=`600 10px ${C.disp}`; ctx.textBaseline='top'; ctx.fillText('TEMPO', 10, 6); ctx.fillText('AUDIO', 10, 44);
  ctx.font=`500 10px ${C.mono}`; ctx.fillText(an&&an.bpm?an.bpm.toFixed(1)+' BPM':'', 10, 58);
  // playhead
  const px=tToX(cur); if (px>=LW-1 && px<=W){ ctx.fillStyle=C.accent; ctx.fillRect(Math.round(px)-1,0,2,H); ctx.beginPath(); ctx.moveTo(px-6,0); ctx.lineTo(px+6,0); ctx.lineTo(px,8); ctx.fill(); }
}
function roundRect(x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function drawBarIcon(e,x0,y,w,h,col){
  const p=e.p||{}, from=(p.from??100)/100, to=(p.to??100)/100;
  ctx.fillStyle=rgba(col,0.7); ctx.beginPath(); ctx.moveTo(x0,y+h); ctx.lineTo(x0,y+h-from*h); ctx.lineTo(x0+w,y+h-to*h); ctx.lineTo(x0+w,y+h); ctx.closePath(); ctx.globalAlpha=e.type==='fill'?1:0.55; ctx.fill(); ctx.globalAlpha=1;
}

/* ---------- interactions ---------- */
let drag=null, touch=null;
function local(e){ const b=cv.getBoundingClientRect(); return {x:e.clientX-b.left, y:e.clientY-b.top}; }
function effectAt(key, x){
  const subs = ROWMAP[key+'.L'] && !ui.expanded[key];
  for (let i=S.effects.length-1;i>=0;i--){ const e=S.effects[i]; if (e.row!==key && !(subs && (e.row===key+'.L'||e.row===key+'.R'))) continue; const x0=tToX(e.start), x1=Math.max(x0+2,tToX(e.end)); if (x>=x0-3 && x<=x1+3) return {e, edge: x-x0<6 && x1-x0>14 ? 'L' : x1-x<6 && x1-x0>10 ? 'R' : x1-x0<=14 && x>x1-4 ? 'R' : null}; }
  return null;
}
function snapT(t, pxTol=10){
  t=Math.max(0,t);
  if (ui.snap && grid.length){
    let lo=0, hi=grid.length-1; while (hi-lo>1){ const m=(lo+hi)>>1; if (grid[m]<t) lo=m; else hi=m; }
    const c = Math.abs(grid[lo]-t)<Math.abs(grid[hi]-t)?grid[lo]:grid[hi];
    if (Math.abs(c-t)*pps <= pxTol) return q(c);
  }
  return q(t);
}
function defaultLen(type, kind){
  const bl=beatLen();
  if (RAMP_MS[type]) return RAMP_MS[type]/1000 + (type.startsWith('on')?0.1:0.06);
  if (kind==='closure') return type==='dance'?Math.max(4,bl*8):1;
  if (kind==='bar') return bl*2;
  if (kind==='rgb') return bl*8;
  if (type==='strobe') return bl*2;
  return Math.max(0.1, bl/2);
}
function defaultParams(kind,type){
  if (kind==='bar') return {from:100,to:100,width:type==='sparkle'?30:25};
  if (kind==='rgb') return type==='rainbow'?{cycles:1}:{c1:'#ff2e63',c2:'#08d9d6'};
  if (type==='strobe') return {period:Math.max(120,Math.round(beatLen()*1000/4))};
  return {};
}
function createAt(row, t, len){
  if (t >= S.dur - S.step/1000) t = Math.max(0, S.dur - (len ?? 0.5));
  const kind=row.r.kind, type=compatType(kind, ui.tool[toolCat(kind)]);
  const e={id:uid(), row:row.key, start:snapT(t), end:0, type, p:defaultParams(kind,type)};
  e.end = r3(Math.min(S.dur, e.start + (len ?? defaultLen(type,kind)))); if (e.end<=e.start) e.end=r3(e.start+S.step/1000);
  S.effects.push(e); return e;
}
function labelClick(y){
  const r=yToRow(y); if(!r) return;
  if (r.t==='g'){ ui.collapsed[r.g.id]=!ui.collapsed[r.g.id]; buildRows(); requestDraw(); persist(); return; }
  if (!r.sub && ROWMAP[r.key+'.L']){ ui.expanded[r.key]=!ui.expanded[r.key]; buildRows(); requestDraw(); persist(); }
}
cv.addEventListener('pointerdown', e=>{
  const {x,y}=local(e);
  if (e.pointerType==='touch'){ touch={x,y,t:performance.now()}; return; }
  if (e.button!==0) return;
  if (y<HEADER_H){ if (x>=LW){ seek(xToT(x)); drag={mode:'seek'}; cv.setPointerCapture(e.pointerId); } return; }
  if (x<LW){ labelClick(y); return; }
  const row=yToRow(y); if (!row || row.t!=='r') { if(!e.shiftKey){ ui.sel.clear(); renderInspector(); requestDraw(); } return; }
  const t=xToT(x), hit=effectAt(row.key,x);
  cv.setPointerCapture(e.pointerId);
  if (hit){
    if (e.shiftKey){ ui.sel.has(hit.e.id)?ui.sel.delete(hit.e.id):ui.sel.add(hit.e.id); }
    else if (!ui.sel.has(hit.e.id)){ ui.sel.clear(); ui.sel.add(hit.e.id); }
    const orig=new Map(S.effects.filter(x=>ui.sel.has(x.id)).map(x=>[x.id,[x.start,x.end]]));
    drag={mode: hit.edge==='L'?'resL':hit.edge==='R'?'resR':'move', e:hit.e, t0:t, orig, moved:false, x0:x};
    showTab('insp');
  } else {
    pushHist();
    if (!e.shiftKey) ui.sel.clear();
    const ne=createAt(row, t, S.step/1000); ui.sel.add(ne.id);
    drag={mode:'create', e:ne, anchor:ne.start, moved:false, x0:x, row};
  }
  renderInspector(); requestDraw();
});
cv.addEventListener('pointermove', e=>{
  const {x,y}=local(e);
  if (!drag){ setCursor(x,y); return; }
  const t=xToT(x);
  if (drag.mode==='seek'){ seek(t); return; }
  if (Math.abs(x-drag.x0)>3) { if(!drag.moved && drag.mode!=='create') pushHist(); drag.moved=true; }
  if (!drag.moved) return;
  const ev=drag.e;
  if (drag.mode==='create'){ const s=snapT(t); if (s>=drag.anchor){ ev.start=drag.anchor; ev.end=Math.max(r3(drag.anchor+S.step/1000), Math.min(S.dur,s)); } else { ev.start=s; ev.end=drag.anchor; } }
  else if (drag.mode==='move'){
    if (!drag.orig.has(ev.id)) return;
    const [s0]=drag.orig.get(ev.id); let ns=snapT(s0+(t-drag.t0)); let d=ns-s0;
    for (const [,v] of drag.orig) if (v[0]+d<0) d=-v[0];
    for (const x2 of S.effects){ const o=drag.orig.get(x2.id); if(o){ x2.start=r3(o[0]+d); x2.end=r3(o[1]+d); } }
  }
  else if (drag.mode==='resL'){ const s=snapT(t); ev.start=Math.min(s, r3(ev.end-S.step/1000)); }
  else if (drag.mode==='resR'){ const s=snapT(t); ev.end=Math.max(s, r3(ev.start+S.step/1000)); }
  renderInspector(true); requestDraw();
  autoScrollEdge(x);
});
function endDrag(){
  if (!drag) return;
  if (drag.mode==='create' && !drag.moved){ const e=drag.e; e.end=r3(Math.min(S.dur, e.start+defaultLen(e.type, ROWMAP[e.row].kind))); }
  const was=drag.mode; drag=null;
  if (was!=='seek') changed();
}
cv.addEventListener('pointerup', e=>{
  if (e.pointerType==='touch' && touch){
    const {x,y}=local(e); const moved=Math.hypot(x-touch.x,y-touch.y)>8||performance.now()-touch.t>600; touch=null; if (moved) return;
    if (y<HEADER_H){ if(x>=LW) seek(xToT(x)); return; }
    if (x<LW){ labelClick(y); return; }
    const row=yToRow(y); if (!row||row.t!=='r') return;
    const hit=effectAt(row.key,x);
    if (hit){ ui.sel.clear(); ui.sel.add(hit.e.id); showTab('insp'); renderInspector(); requestDraw(); }
    else { pushHist(); ui.sel.clear(); const ne=createAt(row, xToT(x)); ui.sel.add(ne.id); changed(); showTab('insp'); }
    return;
  }
  endDrag();
});
cv.addEventListener('pointercancel', ()=>{ touch=null; endDrag(); });
function setCursor(x,y){
  let c='default';
  if (y<HEADER_H) c = x>=LW?'text':'default';
  else if (x<LW) c='pointer';
  else { const row=yToRow(y); if (row&&row.t==='r'){ const h=effectAt(row.key,x); c = h ? (h.edge?'ew-resize':'grab') : 'crosshair'; } }
  cv.style.cursor=c;
}
function autoScrollEdge(x){ if (x>W-30) sc.scrollLeft+=12; else if (x<LW+20 && sc.scrollLeft>0) sc.scrollLeft-=12; }
sc.addEventListener('wheel', e=>{
  if (!(e.ctrlKey||e.metaKey||e.altKey)) return;
  e.preventDefault(); const {x}=local(e); zoomAt(e.deltaY<0?1.2:1/1.2, Math.max(LW,x));
},{passive:false});
function zoomAt(f, x){ x = x ?? Math.max(LW, Math.min(W, tToX(cur))); const t=xToT(x); pps=Math.max(4, Math.min(1200, pps*f)); sizeSpacer(); sc.scrollLeft=Math.max(0, LW+t*pps-x); requestDraw(); }
function zoomFit(){ pps=Math.max(4, (W-LW-24)/Math.max(1,S.dur)); sizeSpacer(); sc.scrollLeft=0; requestDraw(); }

/* ---------- keyboard ---------- */
const recHeld = {};
function recHeldRow(key){ return Object.values(recHeld).some(h=>h.row===key); }
document.addEventListener('keydown', e=>{
  if (e.target.closest && e.target.closest('input,select,textarea,summary,[contenteditable]')) return;
  const k=e.key.toLowerCase(), mod=e.ctrlKey||e.metaKey;
  if (k===' '){ e.preventDefault(); togglePlay(); return; }
  if (mod && k==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if (mod && k==='y'){ e.preventDefault(); redo(); return; }
  if (mod && k==='c'){ copySel(); return; }
  if (mod && k==='v'){ e.preventDefault(); paste(); return; }
  if (mod && k==='d'){ e.preventDefault(); duplicateSel(); return; }
  if (mod && k==='a'){ e.preventDefault(); S.effects.forEach(x=>ui.sel.add(x.id)); renderInspector(); requestDraw(); return; }
  if (mod) return;
  if (k==='delete'||k==='backspace'){ e.preventDefault(); deleteSel(); return; }
  if (ui.rec && /^[1-9]$/.test(k)){ e.preventDefault(); if (e.repeat) return; const row=recRows()[+k-1]; if (row && playing && !recHeld[k]) { recHeld[k]={row:row.key,start:q(cur)}; requestDraw(); } else if (!playing) toast('Avvia la riproduzione per registrare.'); return; }
  if (k==='home'){ seek(0); return; }
  if (k==='end'){ seek(S.dur); return; }
  if (k==='+'||k==='='){ zoomAt(1.25); return; }
  if (k==='-'){ zoomAt(0.8); return; }
  if (k==='arrowleft'||k==='arrowright'){ e.preventDefault(); const d=(k==='arrowleft'?-1:1)*(e.shiftKey?beatLen():S.step/1000); if (ui.sel.size){ pushHist(); for (const x of S.effects) if (ui.sel.has(x.id)){ const s=Math.max(0,q(x.start+d)); const len=x.end-x.start; x.start=s; x.end=r3(s+len); } changed(); } else seek(cur+d*(e.shiftKey?1:5)); return; }
  if (k==='r'){ toggleRec(); return; }
  if (k==='f' && e.shiftKey){ setTool('closure','stop'); applyTypeToSel('stop'); return; }
  const ty=HOTKEY[k]; if (ty){ const cat=TYPES.closure.includes(ty)?'closure':'light'; setTool(cat,ty); applyTypeToSel(ty); }
});
document.addEventListener('keyup', e=>{
  const k=e.key.toLowerCase(); const h=recHeld[k]; if (!h) return; delete recHeld[k];
  const end=Math.max(q(cur), h.start+S.step/1000); pushHist(); S.effects.push({id:uid(),row:h.row,start:r3(h.start),end:r3(end),type:'on',p:{}}); changed();
});
function applyTypeToSel(ty){
  if (!ui.sel.size) return; let n=0; pushHist();
  for (const e of S.effects) if (ui.sel.has(e.id)){ const kind=ROWMAP[e.row].kind; if (TYPES[kind].includes(ty)){ e.type=ty; e.p=Object.assign(defaultParams(kind,ty), e.p); n++; } }
  if (n) changed(); else hist.pop();
}
function copySel(){ const sel=S.effects.filter(e=>ui.sel.has(e.id)); if(!sel.length) return; const m=Math.min(...sel.map(e=>e.start)); clip=sel.map(e=>Object.assign(JSON.parse(JSON.stringify(e)),{start:e.start-m,end:e.end-m})); toast(sel.length+(sel.length>1?' effetti copiati':' effetto copiato')); }
function paste(){ if(!clip) return; pushHist(); ui.sel.clear(); const at=q(cur); for (const c of clip){ const e=Object.assign(JSON.parse(JSON.stringify(c)),{id:uid(),start:r3(at+c.start),end:r3(at+c.end)}); if (e.start<S.dur){ e.end=Math.min(S.dur,e.end); S.effects.push(e); ui.sel.add(e.id);} } changed(); }
function duplicateSel(){ const sel=S.effects.filter(e=>ui.sel.has(e.id)); if(!sel.length) return; pushHist(); const m=Math.min(...sel.map(e=>e.start)), M=Math.max(...sel.map(e=>e.end)); ui.sel.clear(); for (const s of sel){ const e=Object.assign(JSON.parse(JSON.stringify(s)),{id:uid(),start:r3(s.start+M-m),end:r3(s.end+M-m)}); if (e.start<S.dur){ e.end=Math.min(S.dur,e.end); S.effects.push(e); ui.sel.add(e.id);} } changed(); }
function deleteSel(){ if(!ui.sel.size) return; pushHist(); S.effects=S.effects.filter(e=>!ui.sel.has(e.id)); ui.sel.clear(); changed(); }

/* ---------- tools panel ---------- */
const TOOL_LABEL = {on500:'On 0,5 s',on1000:'On 1 s',on2000:'On 2 s',off500:'Off 0,5 s',off1000:'Off 1 s',off2000:'Off 2 s',sweepR:'Scorri →',sweepL:'Scorri ←'};
const TOOL_KEYS = {on:'F',on500:'E',on1000:'D',on2000:'C',off500:'W',off1000:'S',off2000:'X',strobe:'B',open:'Q',dance:'A',close:'Z',stop:'⇧F'};
function buildTools(){
  const lists = {light:TYPES.ramp, closure:TYPES.closure, bar:TYPES.bar, rgb:TYPES.rgb};
  for (const cat in lists){
    const box=document.querySelector(`.tools[data-cat="${cat}"]`);
    box.innerHTML = lists[cat].map(t=>`<button class="tool" data-cat="${cat}" data-type="${t}" aria-pressed="${ui.tool[cat]===t}" title="${TYPE_LABEL[t]}"><span>${TOOL_LABEL[t]||TYPE_LABEL[t]}</span>${TOOL_KEYS[t]?`<kbd>${TOOL_KEYS[t]}</kbd>`:''}</button>`).join('');
  }
}
function setTool(cat,t){ ui.tool[cat]=t; $$('.tool').forEach(b=>{ if (b.dataset.cat===cat) b.setAttribute('aria-pressed', String(b.dataset.type===t)); }); }
$('#pane-tools').addEventListener('click', e=>{ const b=e.target.closest('.tool'); if (!b) return; setTool(b.dataset.cat,b.dataset.type); applyTypeToSel(b.dataset.type); });

/* ---------- tabs ---------- */
function showTab(t){ ui.tab=t; $$('.tabs button').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===t))); for (const p of ['tools','insp','gen','check']) $('#pane-'+p).hidden = p!==t; if (t==='gen') renderGen(); if (t==='check') renderCheck(); if (t==='insp') renderInspector(); }
$('.tabs').addEventListener('click', e=>{ const b=e.target.closest('button'); if (b) showTab(b.dataset.tab); });

/* ---------- inspector ---------- */
function renderInspector(light){
  if (ui.tab!=='insp') return;
  const box=$('#pane-insp'); const sel=S.effects.filter(e=>ui.sel.has(e.id));
  if (light && box.dataset.id && sel.length===1 && box.dataset.id===sel[0].id){ const e=sel[0]; const a=$('#iStart'), b=$('#iEnd'), d=$('#iDur'); if(a&&document.activeElement!==a) a.value=e.start.toFixed(3); if(b&&document.activeElement!==b) b.value=e.end.toFixed(3); if(d) d.textContent=(e.end-e.start).toFixed(2)+' s'; return; }
  box.dataset.id = sel.length===1 ? sel[0].id : '';
  if (!sel.length){ box.innerHTML=`<div class="empty">Nessun effetto selezionato. Clicca un blocco nella timeline per modificarlo, oppure trascina su una riga vuota per crearne uno con lo strumento attivo.</div>
    <div class="sec"><h3>Durata dello show</h3><dl class="kv"><dt>Lunghezza</dt><dd>${fmt(S.dur)}</dd><dt>Effetti</dt><dd>${S.effects.length}</dd></dl></div>
    ${audioBuf?'':`<div class="sec"><h3>Durata senza audio</h3><div class="field"><label for="iShowDur">Secondi</label><input id="iShowDur" type="number" min="5" max="14400" step="1" value="${Math.round(S.dur)}"></div></div>`}`;
    const sd=$('#iShowDur'); if (sd) sd.addEventListener('change',()=>{ S.dur=Math.max(5,Math.min(14400,+sd.value||30)); sizeSpacer(); changed(); });
    return; }
  if (sel.length>1){ box.innerHTML=`<div class="sec"><h3>${sel.length} effetti selezionati</h3><p class="hint">Premi un tasto strumento per cambiare il tipo a tutti quelli compatibili. Frecce per spostarli di un frame, Maiusc+frecce di un beat.</p></div><div class="row"><button class="btn" id="iDup">Duplica</button><button class="btn" id="iDel">Elimina</button></div>`; $('#iDup').onclick=duplicateSel; $('#iDel').onclick=deleteSel; return; }
  const e=sel[0], R=ROWMAP[e.row], p=e.p||{};
  const side = R.sub ? (R.sub==='L'?' · sinistra':' · destra') : (R.ch.length===2&&R.kind!=='bar'&&R.kind!=='rgb'?' · entrambi i lati':'');
  let params='';
  if (R.kind==='bar') params=`<div class="grid3"><div class="field"><label for="pFrom">Da %</label><input id="pFrom" type="number" min="0" max="100" value="${p.from??100}"></div><div class="field"><label for="pTo">A %</label><input id="pTo" type="number" min="0" max="100" value="${p.to??100}"></div><div class="field"><label for="pWidth">${e.type==='sparkle'?'Densità %':'Larghezza %'}</label><input id="pWidth" type="number" min="1" max="100" value="${p.width??25}"></div></div>`;
  else if (R.kind==='rgb') params = e.type==='rainbow' ? `<div class="grid2"><div class="field"><label for="pCycles">Giri di colore</label><input id="pCycles" type="number" min="0.25" max="20" step="0.25" value="${p.cycles??1}"></div><div class="field"><label for="pBright">Luminosità %</label><input id="pBright" type="number" min="0" max="100" value="${p.bright??100}"></div></div>` : `<div class="grid3"><div class="field"><label for="pC1">Inizio</label><input id="pC1" type="color" value="${p.c1||'#ff2e63'}"></div><div class="field"><label for="pC2">Fine</label><input id="pC2" type="color" value="${p.c2||p.c1||'#08d9d6'}"></div><div class="field"><label for="pBright">Luminosità %</label><input id="pBright" type="number" min="0" max="100" value="${p.bright??100}"></div></div>`;
  else if (e.type==='strobe') params=`<div class="field"><label for="pPeriod">Periodo (ms, metà acceso e metà spento)</label><input id="pPeriod" type="number" min="40" max="4000" step="10" value="${p.period||200}"></div>`;
  const tips = {
    ramp: RAMP_MS[e.type] ? `La rampa dura ${RAMP_MS[e.type]/1000} s: perché arrivi al ${e.type.startsWith('on')?'100%':'0%'} il blocco deve durare almeno ${(RAMP_MS[e.type]/1000+0.05).toFixed(2)} s. Dopo il blocco la luce si spegne di colpo.` : 'Accensione istantanea per tutta la durata del blocco.',
    bool: 'Questa luce è solo accesa o spenta. Tieni accensioni e pause di almeno 100 ms per un effetto leggibile.',
    closure: {open:'Apre fino in fondo; il blocco può essere breve.',close:'Chiude fino in fondo; il blocco può essere breve.',dance:'Oscilla finché dura il blocco. Esclusi i finestrini, la chiusura deve essere già aperta. Meglio non superare 30 s.',stop:'Ferma subito il movimento.'}[e.type],
    bar: 'Ogni LED della barra è controllato singolarmente (luminosità 0-100%).', rgb: 'Colore pieno per display e luci ambiente, visibile anche da fuori.'};
  box.innerHTML = `<div class="sec"><h3>${esc(R.name)}${side}</h3>
    <div class="field"><label for="iType">Effetto</label><select id="iType">${TYPES[R.kind].map(t=>`<option value="${t}" ${t===e.type?'selected':''}>${TYPE_LABEL[t]}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="field"><label for="iStart">Inizio (s)</label><input id="iStart" type="number" step="0.02" min="0" value="${e.start.toFixed(3)}"></div><div class="field"><label for="iEnd">Fine (s)</label><input id="iEnd" type="number" step="0.02" min="0" value="${e.end.toFixed(3)}"></div></div>
    <p class="hint">Durata <b id="iDur">${(e.end-e.start).toFixed(2)} s</b> · ${Math.round((e.end-e.start)*1000/S.step)} frame da ${S.step} ms</p>
    ${params}
    <p class="hint">${tips[R.kind==='ramp'?'ramp':R.kind]||''}</p>
    ${R.ch.length===2 && !R.sub && R.kind!=='bar' && R.kind!=='rgb' ? `<div class="row"><button class="btn small" id="iSplit">Separa sinistra e destra</button></div>`:''}
    <div class="row"><button class="btn" id="iDup">Duplica</button><button class="btn" id="iDel">Elimina</button></div>`;
  const upd = fn => { pushHist(); fn(); changed(); };
  $('#iType').onchange = ev => upd(()=>{ e.type=ev.target.value; e.p=Object.assign(defaultParams(R.kind,e.type), e.p); renderInspector(); });
  $('#iStart').onchange = ev => upd(()=>{ e.start=Math.max(0,q(+ev.target.value||0)); if (e.end<=e.start) e.end=r3(e.start+S.step/1000); });
  $('#iEnd').onchange = ev => upd(()=>{ e.end=Math.max(r3(e.start+S.step/1000), q(+ev.target.value||0)); });
  const bind=(id,key,conv)=>{ const el=$('#'+id); if (el) el.onchange = ev => upd(()=>{ e.p=Object.assign({},e.p,{[key]:conv(ev.target.value)}); }); };
  bind('pFrom','from',v=>Math.max(0,Math.min(100,+v))); bind('pTo','to',v=>Math.max(0,Math.min(100,+v))); bind('pWidth','width',v=>Math.max(1,Math.min(100,+v)));
  bind('pCycles','cycles',v=>Math.max(0.25,+v||1)); bind('pBright','bright',v=>Math.max(0,Math.min(100,+v))); bind('pPeriod','period',v=>Math.max(40,+v||200));
  for (const id of ['pC1','pC2']){ const el=$('#'+id); if (el) el.oninput = ev => { e.p=Object.assign({},e.p,{[id==='pC1'?'c1':'c2']:ev.target.value}); requestDraw(); clearTimeout(rcT); rcT=setTimeout(recompute,200); }; }
  $('#iDup').onclick=duplicateSel; $('#iDel').onclick=deleteSel;
  const sp=$('#iSplit'); if (sp) sp.onclick=()=>upd(()=>{ const l=Object.assign(JSON.parse(JSON.stringify(e)),{id:uid(),row:e.row+'.L'}); e.row=e.row+'.R'; S.effects.push(l); ui.expanded[R.id]=true; buildRows(); ui.sel.clear(); ui.sel.add(l.id); renderInspector(); });
}

/* ---------- generator panel ---------- */
const GEN_KEY='light-show-studio:gen';
const ROW_NOTE = {lift:'solo portellone o frunk elettrico', handF:'solo Model S', handR:'solo Model S', fdoor:'solo Model X', falcon:'solo Model X', ch4:'', fbar:'', offroad:'optional'};
const PRESETS = {
  tutto: GROUPS.flatMap(g=>g.rows.map(r=>r.id)).filter(id=>!['handF','handR','fdoor','falcon','lift'].includes(id)),
  luci: LIGHT_ROWS.slice(),
  luciFin: LIGHT_ROWS.concat(['winF','winR']),
  niente: []
};
ui.genRows = new Set(DEFAULT_GEN); ui.genKeep=false;
try { const g=JSON.parse(localStorage.getItem(GEN_KEY)||'null'); if (g && Array.isArray(g.rows)){ ui.genRows=new Set(g.rows.filter(id=>ROWMAP[id])); ui.genStyle=g.style||ui.genStyle; ui.genKeep=!!g.keep; } } catch(e){}
function saveGen(){ try{ localStorage.setItem(GEN_KEY, JSON.stringify({rows:[...ui.genRows], style:ui.genStyle, keep:ui.genKeep})); }catch(e){} }
function renderGen(){
  const box=$('#pane-gen'); const sel=ui.genRows, nSel=sel.size;
  const replaced = ui.genKeep ? S.effects.filter(e=>sel.has(e.row.split('.')[0])).length : S.effects.length;
  const groupHtml = GROUPS.map(g=>{
    const ids=g.rows.map(r=>r.id), on=ids.filter(id=>sel.has(id)).length;
    return `<fieldset class="gsel"><legend><label class="cb"><input type="checkbox" data-group="${g.id}" ${on===ids.length?'checked':''} ${on>0&&on<ids.length?'data-ind="1"':''}><b>${esc(g.name)}</b></label><small>${on} di ${ids.length}</small></legend>
      <div class="cbgrid">${g.rows.map(r=>`<label class="cb"><input type="checkbox" data-row="${r.id}" ${sel.has(r.id)?'checked':''}><span>${esc(r.name.replace(/ \((S|X)\)/,''))}${ROW_NOTE[r.id]?`<small>${ROW_NOTE[r.id]}</small>`:''}</span></label>`).join('')}</div></fieldset>`;
  }).join('');
  box.innerHTML = `<div class="sec"><h3>Coreografia automatica</h3><p class="hint">Spunta cosa vuoi animare: il generatore costruisce lo show sui beat usando solo quelle luci e chiusure, rispettando i limiti di comandi di Tesla.</p></div>
  <dl class="kv"><dt>Brano</dt><dd>${esc(S.audioName||'nessuno')}</dd><dt>Tempo</dt><dd>${an&&an.bpm?an.bpm.toFixed(1)+' BPM':'non rilevato'}</dd></dl>
  ${an&&an.energy&&an.energy.length?'<div><canvas class="energy" id="energyCv" aria-label="Energia del brano per beat"></canvas><p class="hint" style="margin-top:4px">Energia per beat: le parti alte diventano lampeggi rapidi, quelle basse dissolvenze lente.</p></div>':''}
  <div class="sec"><h3>Cosa animare</h3>
    <div class="row presets" style="margin-bottom:10px"><button class="btn small" data-preset="tutto">Tutto</button><button class="btn small" data-preset="luci">Solo luci</button><button class="btn small" data-preset="luciFin">Luci e finestrini</button><button class="btn small" data-preset="niente">Niente</button></div>
    <div class="gsels">${groupHtml}</div></div>
  <div class="field"><label for="gStyle">Stile</label><select id="gStyle"><option value="elegante">Elegante, più dissolvenze</option><option value="equilibrato">Equilibrato</option><option value="energico">Energico, più lampeggi</option></select></div>
  <label class="check"><input type="checkbox" id="gKeep" ${ui.genKeep?'checked':''}><span>Rigenera solo le righe spuntate<small>Gli effetti sulle altre righe restano come sono, compresi i tuoi ritocchi a mano.</small></span></label>
  <div class="row">${!nSel ? `<button class="btn primary" disabled>Spunta almeno un elemento</button>` : (replaced && !ui.confirmGen) ? `<button class="btn primary" id="gGo">Genera show</button>` : replaced ? `<button class="btn primary" id="gYes" style="background:var(--err);border-color:var(--err);color:#fff">Sostituisci ${replaced} effetti</button><button class="btn" id="gNo">Annulla</button>` : `<button class="btn primary" id="gYes">Genera show</button>`}</div>`;
  $$('#pane-gen [data-ind]').forEach(el=>el.indeterminate=true);
  $('#gStyle').value=ui.genStyle;
  $('#gStyle').onchange=e=>{ ui.genStyle=e.target.value; saveGen(); };
  $('#gKeep').onchange=e=>{ ui.genKeep=e.target.checked; ui.confirmGen=false; saveGen(); renderGen(); };
  box.querySelectorAll('[data-row]').forEach(cb=>cb.onchange=()=>{ cb.checked?sel.add(cb.dataset.row):sel.delete(cb.dataset.row); ui.confirmGen=false; saveGen(); renderGen(); });
  box.querySelectorAll('[data-group]').forEach(cb=>cb.onchange=()=>{ const g=GROUPS.find(x=>x.id===cb.dataset.group); g.rows.forEach(r=>cb.checked?sel.add(r.id):sel.delete(r.id)); ui.confirmGen=false; saveGen(); renderGen(); });
  box.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{ ui.genRows=new Set(PRESETS[b.dataset.preset]); ui.confirmGen=false; saveGen(); renderGen(); });
  const go=$('#gGo'); if (go) go.onclick=()=>{ ui.confirmGen=true; renderGen(); };
  const no=$('#gNo'); if (no) no.onclick=()=>{ ui.confirmGen=false; renderGen(); };
  const yes=$('#gYes'); if (yes) yes.onclick=()=>{ ui.confirmGen=false; runGenerate(); renderGen(); };
  drawEnergy();
}
function drawEnergy(){
  const c=$('#energyCv'); if (!c || !an) return; const w=c.clientWidth, h=46, d=Math.min(2,devicePixelRatio||1); c.width=w*d; c.height=h*d; const g=c.getContext('2d'); g.scale(d,d);
  const en=an.energy, n=en.length; g.fillStyle=rgba(C.accent,0.18); g.strokeStyle=C.accent; g.lineWidth=1.5; g.beginPath(); g.moveTo(0,h);
  en.forEach((v,i)=>g.lineTo(i/(n-1)*w, h-2-v*(h-6))); g.lineTo(w,h); g.closePath(); g.fill(); g.beginPath(); en.forEach((v,i)=>{ const x=i/(n-1)*w, y=h-2-v*(h-6); i?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke();
}
function runGenerate(){
  pushHist();
  const sel=ui.genRows, made = generateShow(an, S.dur, {style:ui.genStyle, rows:[...sel]}, uid);
  S.effects = ui.genKeep ? S.effects.filter(e=>!sel.has(e.row.split('.')[0])).concat(made) : made;
  for (const g of GROUPS) if (g.rows.some(r=>sel.has(r.id))) ui.collapsed[g.id]=false;
  if (['fbar','rbar','offroad'].some(id=>sel.has(id))){ ui.showCT=true; buildCarSVG(); }
  ui.sel.clear(); buildRows(); changed(true);
  const skipped = [...sel].filter(id=>!made.some(e=>e.row.split('.')[0]===id));
  toast(`Show generato: ${made.length} effetti.` + (skipped.length ? ` Non usati: ${skipped.map(id=>ROWMAP[id].name).join(', ')} (brano troppo corto o senza spazio nei limiti).` : ''), skipped.length?6000:2600);
}

/* ---------- validation ---------- */
function validate(){
  const it=[], push=(lvl,html)=>it.push({lvl,html});
  if (!rnd || !sim) return it;
  if (!audioBuf) push('err', S.audioName ? `Ricarica il file audio <b>${esc(S.audioName)}</b>: senza musica l'auto non mostra lo show.` : 'Carica la musica: l\'auto vuole un file audio con lo stesso nome del .fseq.');
  else if (S.isDemo) push('info','Stai usando il brano demo sintetico. Caricane uno tuo con <b>Carica musica</b>.');
  else push('ok','L\'audio verrà esportato in WAV 44,1 kHz, il formato consigliato da Tesla per restare a tempo.');
  // closure limits
  let over=0; sim.cmds.forEach((n,k)=>{ const L=CL_LIMIT[k]; if (L && n>L.limit) over++; });
  if (over) push('err', `${over} ${over>1?'chiusure superano':'chiusura supera'} il limite di comandi per show. Vedi la tabella sotto.`);
  const dSeen=new Set();
  for (const d of sim.danceNoOpen){ const L=CL_LIMIT[d.k]; const key=d.k+(d.unsupported?'u':''); if (dSeen.has(key)) continue; dSeen.add(key);
    push('warn', d.unsupported ? `${esc(L.name)} non supporta la danza: usa Apri e Chiudi.` : `${esc(L.name)} ${L.side}: danza a ${fmt(d.t,1)} senza essere aperta. Metti un Apri prima, con il tempo di aprirsi.`); }
  sim.danceFrames.forEach((n,k)=>{ const s=n*S.step/1000; if (s>30) push('warn', `${esc(CL_LIMIT[k].name)} ${CL_LIMIT[k].side} danza per ${s.toFixed(0)} s: oltre 30 s il motore può fermarsi per temperatura.`); });
  { const P=sim.pos, NC=sim.NC; let hit=-1; for (let f=1; f<sim.frames && hit<0; f++){ let w=false, d=false; for (let k=6;k<=9;k++) if (Math.abs(P[f*NC+k]-P[(f-1)*NC+k])>1e-4) w=true; for (let k=0;k<=3;k++) if (Math.abs(P[f*NC+k]-P[(f-1)*NC+k])>1e-4) d=true; if (w&&d) hit=f; }
    if (hit>=0) push('warn', `A ${fmt(hit*S.step/1000,1)} i finestrini si muovono mentre si muovono le porte della Model X: l'auto può rilevare un falso schiacciamento e fermare lo show.`); }
  if (sim.chargeLong.length) push('info','Lo sportello di ricarica resta aperto più di 2 minuti: l\'auto lo richiude da sola.');
  if (S.effects.some(e=>e.row.startsWith('win') && e.type==='close')) push('info','Chiudere i finestrini durante lo show attenua la musica, che esce solo dagli altoparlanti interni.');
  const short=S.effects.filter(e=>{const k=ROWMAP[e.row]?.kind; return (k==='ramp'||k==='bool') && e.type!=='strobe' && e.end-e.start<0.1;}).length;
  if (short) push('info', `${short} ${short>1?'accensioni durano':'accensione dura'} meno di 100 ms: si vedranno appena.`);
  const strobeFast=S.effects.filter(e=>e.type==='strobe' && (e.p.period||200)<200).length;
  if (strobeFast) push('info', `${strobeFast} strobo con periodo sotto 200 ms: pulsazioni molto brevi, poco leggibili da lontano.`);
  const beyond=S.effects.filter(e=>e.start>=S.dur).length; if (beyond) push('warn', `${beyond} effetti iniziano dopo la fine del brano e non verranno esportati.`);
  if (rnd.nch===200) push('info','Lo show usa light bar o luci interne: il file avrà 200 canali.');
  if (!S.effects.length) push('warn','La timeline è vuota. Disegna qualche effetto o usa <b>Genera</b>.');
  if (!it.some(x=>x.lvl==='err'||x.lvl==='warn') && S.effects.length) push('ok','Nessun problema bloccante: lo show rispetta i limiti documentati da Tesla.');
  return it;
}
function renderCheck(){
  const items=validate(); const worst = items.some(i=>i.lvl==='err')?'err':items.some(i=>i.lvl==='warn')?'warn':'ok';
  $('#checkDot').style.background = `var(--${worst})`;
  if (ui.tab!=='check' || !rnd) return;
  const usedCl = []; sim.cmds.forEach((n,k)=>{ const L=CL_LIMIT[k]; if (L && (n>0)) usedCl.push({L,n}); });
  const lbl={err:'errore',warn:'avviso',info:'nota',ok:'ok'};
  $('#pane-check').innerHTML = `
  <div class="sec"><h3>File</h3><dl class="kv"><dt>Durata</dt><dd>${fmt(S.dur)}</dd><dt>Frame</dt><dd>${rnd.frames} × ${S.step} ms</dd><dt>Canali</dt><dd>${rnd.nch}</dd><dt>Formato</dt><dd>FSEQ 2.0 non compresso</dd><dt>Intervallo</dt><dd><select id="stepSel" aria-label="Intervallo tra frame" style="font:inherit;background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:1px 4px">${[20,25,40,50].map(s=>`<option ${s===S.step?'selected':''} value="${s}">${s} ms${s===20?' (consigliato)':''}</option>`).join('')}</select></dd></dl></div>
  <div class="sec"><h3>Controlli</h3><ul class="vlist">${items.map(i=>`<li><span class="pill ${i.lvl}">${lbl[i.lvl]}</span><span>${i.html}</span></li>`).join('')}</ul></div>
  <div class="sec"><h3>Comandi alle chiusure</h3>${usedCl.length?`<table class="cmd"><thead><tr><th>Chiusura</th><th></th><th class="n">Usati / limite</th></tr></thead><tbody>${usedCl.map(({L,n})=>`<tr class="${n>L.limit?'over':''}"><td>${esc(L.name)} ${L.side}</td><td style="width:34%"><div class="meter"><b style="width:${Math.min(100,n/L.limit*100)}%;${n>L.limit?'background:var(--err)':''}"></b></div></td><td class="n">${n} / ${L.limit}</td></tr>`).join('')}</tbody></table>`:'<p class="hint">Nessuna chiusura usata. Contano solo Apri, Chiudi e Danza.</p>'}</div>
  <div class="sec"><h3>Esporta</h3><p class="hint">Lo ZIP contiene la cartella <code>LightShow</code> con <code>${esc(fileBase())}.fseq</code> e <code>${esc(fileBase())}.wav</code>.</p><div class="row" style="margin-top:8px"><button class="btn primary" id="exp2">Esporta per USB</button></div></div>
  <div class="sec"><h3>Sulla chiavetta</h3><ol class="steps">
    <li>Formatta la chiavetta in exFAT o FAT32 (non NTFS), senza cartella TeslaCam e senza file di aggiornamento.</li>
    <li>Estrai lo ZIP nella radice: deve esserci <code>LightShow/</code> con i due file dallo stesso nome.</li>
    <li>Inseriscila in una porta USB anteriore o nel vano portaoggetti e aspetta qualche secondo.</li>
    <li>Sull'auto apri Toybox, Light Show, Programma show, e scegli lo show dal menu.</li>
    <li>Se il titolo resta "Light Show" invece di "Custom Light Show", controlla nomi dei file e formattazione.</li></ol></div>`;
  $('#exp2').onclick=exportZip;
  $('#stepSel').onchange=e=>{ S.step=+e.target.value; for (const x of S.effects){ x.start=q(x.start); x.end=Math.max(q(x.end), r3(x.start+S.step/1000)); } changed(true); };
}

/* ---------- export / import ---------- */
async function exportZip(force){
  if (!audioBuf && force!==true){ askNoAudio(); return; }
  if (typeof JSZip==='undefined'){ toast('Non riesco a caricare il modulo ZIP: controlla la connessione e riprova.'); return; }
  recompute();
  const btn=$('#exportBtn'); btn.disabled=true; const old=btn.innerHTML; btn.lastChild.textContent='Preparo i file…';
  try {
    const base=fileBase(); const zip=new JSZip(); const dir=zip.folder('LightShow');
    dir.file(base+'.fseq', buildFseq(rnd, 'Light Show Studio', base+'.wav'));
    if (audioBuf){
      const len=Math.ceil(audioBuf.duration*44100); const oc=new OfflineAudioContext(Math.min(2,audioBuf.numberOfChannels), len, 44100);
      const s=oc.createBufferSource(); s.buffer=audioBuf; s.connect(oc.destination); s.start(0); const out=await oc.startRendering();
      const chs=[]; for (let c=0;c<out.numberOfChannels;c++) chs.push(out.getChannelData(c));
      dir.file(base+'.wav', encodeWav(chs,44100));
    }
    dir.file('LEGGIMI.txt', `Show: ${S.name}\r\nCopia la cartella LightShow nella radice di una chiavetta exFAT o FAT32.\r\nI file .fseq e .wav devono avere lo stesso nome.\r\nSull'auto: Toybox > Light Show > Programma show.\r\nCreato con Light Show Studio.\r\n`);
    const blob=await zip.generateAsync({type:'blob',compression:'STORE'});
    await saveFile(base+'.zip', blob, audioBuf ? `Salvato ${base}.zip con ${base}.fseq e ${base}.wav` : `Salvato ${base}.zip, solo con ${base}.fseq`);
  } catch(err){ toast('Esportazione non riuscita: '+(err&&err.message||err)); }
  finally { btn.disabled=false; btn.innerHTML=old; }
}
$('#exportBtn').onclick=exportZip;
$('#mSave').onclick=async()=>{ $('#projMenu').open=false; const data=JSON.stringify({app:'light-show-studio',v:1,name:S.name,step:S.step,dur:S.dur,audioName:S.audioName,effects:S.effects},null,1); await saveFile(fileBase()+'.json', data); };
$('#mNew').onclick=()=>{ const b=$('#mNew'); if (!ui.confirmNew){ ui.confirmNew=true; b.textContent='Conferma: elimina '+S.effects.length+' effetti'; b.classList.add('confirm'); return; } ui.confirmNew=false; b.textContent='Svuota la timeline'; b.classList.remove('confirm'); $('#projMenu').open=false; pushHist(); S.effects=[]; ui.sel.clear(); changed(true); toast('Timeline svuotata. Ctrl+Z per annullare.'); };
$('#projMenu').addEventListener('toggle',()=>{ if(!$('#projMenu').open){ ui.confirmNew=false; const b=$('#mNew'); b.textContent='Svuota la timeline'; b.classList.remove('confirm'); } });
$$('.mlabel').forEach(l=>l.addEventListener('click',()=>setTimeout(()=>$('#projMenu').open=false,50)));
$('#projIn').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try { const j=JSON.parse(await f.text()); if (!Array.isArray(j.effects)) throw new Error('formato non riconosciuto');
    pushHist(); S.name=j.name||S.name; S.step=[20,25,40,50].includes(j.step)?j.step:20; S.effects=j.effects.filter(x=>ROWMAP[x.row]).map(x=>Object.assign({p:{}},x));
    if (!audioBuf && j.dur) S.dur=j.dur; if (j.audioName && j.audioName!==S.audioName && !j.audioName.startsWith('Brano demo')) showBanner(`Progetto aperto. Carica il brano <b>${esc(j.audioName)}</b> per sentirlo a tempo.`);
    $('#projName').value=S.name; ui.sel.clear(); buildRows(); changed(true); toast('Progetto aperto: '+S.effects.length+' effetti.');
  } catch(err){ toast('Non riesco ad aprire il progetto: '+err.message); } };
$('#fseqIn').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try { const p=parseFseq(await f.arrayBuffer()); const r=fseqToEffects(p, uid); pushHist(); S.effects=r.effects; Object.assign(ui.expanded, r.expanded);
    if ([20,25,40,50].includes(p.step)) S.step=p.step;
    if (!audioBuf || S.isDemo){ if (S.isDemo){ audioBuf=null; an=null; grid=[]; S.isDemo=false; S.audioName=''; $('#demoChip').hidden=true; $('#bpmChip').textContent='-- BPM'; } S.dur=r.dur; sizeSpacer(); zoomFit(); showBanner('Show importato. Carica il brano che lo accompagna per sentirlo a tempo.'); }
    S.name=f.name.replace(/\.fseq$/i,''); $('#projName').value=S.name; ui.sel.clear(); buildRows(); changed(true);
    toast(`Importati ${r.effects.length} effetti da ${f.name}.`+(r.extUsed?' Light bar e luci interne non vengono importate.':''), 4500);
  } catch(err){ toast(err.message||String(err), 4500); } };

/* ---------- audio ---------- */
function getCtx(){ if (!actx){ const AC=window.AudioContext||window.webkitAudioContext; actx=new AC(); gainNode=actx.createGain(); gainNode.connect(actx.destination); } return actx; }
async function setAudio(buf, name, demo){
  audioBuf=buf; S.audioName=name; S.isDemo=!!demo; S.dur=Math.max(1,buf.duration);
  const n=buf.length, nc=buf.numberOfChannels, mono=new Float32Array(n);
  for (let c=0;c<nc;c++){ const d=buf.getChannelData(c); for (let i=0;i<n;i++) mono[i]+=d[i]/nc; }
  an = analyzeMono(mono, buf.sampleRate);
  grid=[]; if (an.beats.length){ an.beats.forEach((b,i)=>{ grid.push(b); const nb=an.beats[i+1]; if (nb) grid.push((b+nb)/2); }); }
  $('#bpmChip').textContent = an.bpm ? an.bpm.toFixed(1)+' BPM' : '-- BPM';
  $('#demoChip').hidden = !demo;
  if (cur>S.dur) cur=0;
  sizeSpacer(); zoomFit();
}
$('#audioIn').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if (!f) return;
  stop(); toast('Analizzo '+f.name+'…', 6000);
  try {
    const ab=await f.arrayBuffer(); const keep=new Blob([ab],{type:f.type||'audio/mpeg'}); const buf=await getCtx().decodeAudioData(ab);
    audioStore.put({name:f.name, blob:keep});
    const wasDemo=S.isDemo || !S.effects.length;
    await setAudio(buf, f.name, false);
    if (S.name==='Il mio light show' || wasDemo){ S.name=f.name.replace(/\.[^.]+$/,''); $('#projName').value=S.name; }
    hideBanner(); changed(true);
    if (pendingExport){ pendingExport=false; toast('Musica caricata. Ora puoi esportare con la musica inclusa.', 4500); }
    if (wasDemo){ toast(`${f.name}: ${an.bpm?an.bpm.toFixed(0)+' BPM, ':''}${fmtS(S.dur)}. Apri Genera per creare lo show.`, 5000); showTab('gen'); }
    else toast(`Audio caricato: ${fmtS(S.dur)}.`);
  } catch(err){ toast('Non riesco a leggere questo file audio. Prova con un .wav o .mp3.', 4500); }
};

/* ---------- transport ---------- */
function clockNow(){ if (!playing) return cur; if (srcNode) return playOff + (actx.currentTime-playT0); return playOff + (performance.now()-wallT0)/1000; }
function play(){
  if (playing) return; if (cur>=S.dur-0.05) cur=0;
  playing=true; playOff=cur;
  if (audioBuf){ const c=getCtx(); if (c.state==='suspended') c.resume(); srcNode=c.createBufferSource(); srcNode.buffer=audioBuf; srcNode.connect(gainNode); playT0=c.currentTime+0.03; srcNode.start(playT0, cur); }
  else wallT0=performance.now();
  setPlayIcon(); loop();
}
function stop(){ if (!playing) return; cur=clockNow(); playing=false; if (srcNode){ try{srcNode.stop();}catch(e){} srcNode.disconnect(); srcNode=null; } for (const k in recHeld) delete recHeld[k]; setPlayIcon(); requestDraw(); }
function togglePlay(){ playing?stop():play(); }
function seek(t){ t=Math.max(0,Math.min(S.dur,t)); const was=playing; if (was) stop(); cur=t; if (was) play(); updatePreview(cur); updateClock(); requestDraw(); }
function setPlayIcon(){ $('#playIco').innerHTML = playing ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11l9-5.5z"/>'; $('#playBtn').setAttribute('aria-label', playing?'Pausa':'Riproduci'); }
function updateClock(){ $('#clock').innerHTML = `${fmt(cur)} <span>/ ${fmtS(S.dur)}</span>`; $('#tlTime').textContent = fmt(cur)+' / '+fmtS(S.dur); }
function loop(){
  if (!playing) return;
  cur = Math.max(0, clockNow());
  if (cur>=S.dur){ cur=S.dur; stop(); }
  updatePreview(cur); updateClock();
  if (ui.follow){ const x=tToX(cur); if (x>W-40 || x<LW) sc.scrollLeft = Math.max(0, LW+cur*pps-LW-(W-LW)*0.2); }
  draw(); requestAnimationFrame(loop);
}
$('#playBtn').onclick=togglePlay; $('#homeBtn').onclick=()=>seek(0);
$('#zoomIn').onclick=()=>zoomAt(1.4); $('#zoomOut').onclick=()=>zoomAt(1/1.4); $('#zoomFit').onclick=zoomFit;
$('#undoBtn').onclick=undo; $('#redoBtn').onclick=redo;
const tog=(id,key)=>{ $(id).onclick=()=>{ ui[key]=!ui[key]; $(id).classList.toggle('on',ui[key]); $(id).setAttribute('aria-pressed',String(ui[key])); requestDraw(); }; };
tog('#snapBtn','snap'); tog('#followBtn','follow');
function toggleRec(){ ui.rec=!ui.rec; $('#recBtn').classList.toggle('on',ui.rec); $('#recBtn').setAttribute('aria-pressed',String(ui.rec)); if (ui.rec) toast('Registrazione live: avvia la musica e tieni premuti i tasti 1-9 indicati accanto alle righe.', 4500); requestDraw(); }
$('#recBtn').onclick=toggleRec;
$('#projName').addEventListener('input', e=>{ S.name=e.target.value; persist(); });

/* ---------- vehicle preview (schematic, not to scale) ---------- */
const LIGHT_COL = {white:'#f4f8ff', amber:'#ffab2e', red:'#ff2a36', redDim:'#c4141f'};
let litEls=[], barEls=[], glassEls=[], mirrorEls=[], liftEl=null, chargeEl=null, groundEl=null;
function buildCarSVG(){
  buildCarSVG.ct = ui.showCT;
  const defs = `<defs><filter id="bl" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5"/></filter><filter id="bl2" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="9"/></filter>
    <linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a313c"/><stop offset="1" stop-color="#151a21"/></linearGradient>
    <linearGradient id="glassG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2230"/><stop offset="1" stop-color="#0b0f15"/></linearGradient></defs>`;
  const L = (ch, shape, color, halo) => `<g data-ch="${ch}" data-col="${color}">${halo?`<g class="halo" filter="url(#bl)" opacity="0">${shape.replace(/fill="[^"]*"/,`fill="${LIGHT_COL[color]}"`)}</g>`:''}<g class="lens">${shape.replace(/fill="[^"]*"/,'fill="#2b323d"')}</g><g class="lit" opacity="0">${shape.replace(/fill="[^"]*"/,`fill="${LIGHT_COL[color]}"`)}</g></g>`;
  const mir = s => `transform="translate(420,0) scale(-1,1)"`;
  /* front: viewer-left is the car's RIGHT side */
  const frontCluster = side => { const c = side==='R' ? {o:1,i:3,s:5,c4:7,c5:9,c6:11,t:13} : {o:0,i:2,s:4,c4:6,c5:8,c6:10,t:12};
    return `<path d="M62 128 L128 118 Q141 117 142 124 L140 133 Q102 141 67 141 Q57 137 62 128Z" fill="#0c1016" stroke="#39414d" stroke-width="1"/>
    ${L(c.t,'<path d="M60 131 L73 129 L73 139 L64 140Z" fill="x"/>','amber',true)}
    ${L(c.o,'<circle cx="86" cy="132" r="6.5" fill="x"/>','white',true)}
    ${L(c.i,'<circle cx="107" cy="130" r="6" fill="x"/>','white',true)}
    ${L(c.s,'<path d="M64 127.5 L128 119 Q138 118 139 122 L139 123 Q130 122 64 129.6Z" fill="x"/>','white',true)}
    ${L(c.c4,'<circle cx="119" cy="134" r="2.4" fill="x"/>','white',false)}${L(c.c5,'<circle cx="126.5" cy="133" r="2.4" fill="x"/>','white',false)}${L(c.c6,'<circle cx="134" cy="131.5" r="2.4" fill="x"/>','white',false)}`; };
  const frontSide = side => { const c = side==='R'?{fog:15,aux:17,mk:19,rep:21}:{fog:14,aux:16,mk:18,rep:20};
    return `${L(c.fog,'<circle cx="84" cy="166" r="5.5" fill="x"/>','white',true)}${L(c.aux,'<rect x="98" y="163" width="18" height="4" rx="2" fill="x"/>','white',true)}${L(c.mk,'<rect x="41" y="137" width="5" height="8" rx="2" fill="x"/>','amber',true)}${L(c.rep,'<rect x="48" y="118" width="7" height="4" rx="2" fill="x"/>','amber',true)}`; };
  const bar = (chs, x0, x1, y, h) => { const n=chs.length, w=(x1-x0)/n; return `<g class="ctbar">${chs.map((c,i)=>`<rect data-bar="${c}" x="${(x0+i*w).toFixed(2)}" y="${y}" width="${Math.max(0.6,w-0.6).toFixed(2)}" height="${h}" fill="#e9f3ff" opacity="0.06"/>`).join('')}</g>`; };
  const fbarCh = ROWMAP.fbar.ch.slice().reverse(), rbarCh = ROWMAP.rbar.ch, offCh = ROWMAP.offroad.ch.slice().reverse();
  $('#svgFront').innerHTML = `${defs}
    <ellipse id="groundF" cx="210" cy="206" rx="185" ry="12" fill="#cfe2ff" opacity="0" filter="url(#bl2)"/>
    <rect x="56" y="178" width="40" height="24" rx="4" fill="#0a0d12"/><rect x="324" y="178" width="40" height="24" rx="4" fill="#0a0d12"/>
    <path d="M40 186 L40 150 Q40 128 64 120 L120 104 Q210 93 300 104 L356 120 Q380 128 380 150 L380 186 Q380 190 374 190 L46 190 Q40 190 40 186Z" fill="url(#bodyG)" stroke="#3a4350" stroke-width="1"/>
    <path d="M110 104 L140 58 Q210 47 280 58 L310 104Z" fill="#1d232c" stroke="#3a4350" stroke-width="1"/>
    <path d="M123 100 L148 63 Q210 55 272 63 L297 100Z" fill="url(#glassG)"/>
    <path class="glass" d="M123 100 L148 63 Q210 55 272 63 L297 100Z" fill="#000" opacity="0"/>
    <g class="mirror" data-k="5" style="transform-origin:108px 101px;transition:none"><path d="M86 95 Q84 90 92 89 L110 93 L110 104 L92 104 Q85 103 86 95Z" fill="#232a34" stroke="#3a4350"/></g>
    <g class="mirror" data-k="4" style="transform-origin:312px 101px"><path d="M334 95 Q336 90 328 89 L310 93 L310 104 L328 104 Q335 103 334 95Z" fill="#232a34" stroke="#3a4350"/></g>
    <path d="M150 170 L270 170 L262 182 L158 182Z" fill="#0c1016"/>
    ${frontCluster('R')}${frontSide('R')}
    <g ${mir()}>${frontCluster('L')}${frontSide('L')}</g>
    ${ui.showCT ? bar(fbarCh,126,294,107,3) + bar(offCh,170,250,51,4) : ''}`;
  /* rear: viewer-left is the car's LEFT side */
  const rearCluster = side => { const c = side==='L'?{tail:25,turn:22}:{tail:26,turn:23};
    return `<path d="M56 124 L140 115 L143 129 Q102 136 60 137 Q51 132 56 124Z" fill="#14070a" stroke="#3d2228" stroke-width="1"/>
    ${L(c.tail,'<path d="M78 124 L140 117 L141 122 L80 129Z" fill="x"/>','redDim',true)}
    ${L(24,'<path d="M110 126 L141 123 L142 128 Q126 131 110 132Z" fill="x"/>','red',true)}
    ${L(c.turn,'<path d="M57 126 L77 124 L79 133 L61 135 Q54 131 57 126Z" fill="x"/>','amber',true)}
    ${L(27,'<rect x="86" y="129" width="16" height="4.5" rx="1.5" fill="x"/>','white',true)}
    ${L(28,'<circle cx="92" cy="171" r="4" fill="x"/>','red',true)}`; };
  $('#svgRear').innerHTML = `${defs}
    <rect x="56" y="178" width="40" height="24" rx="4" fill="#0a0d12"/><rect x="324" y="178" width="40" height="24" rx="4" fill="#0a0d12"/>
    <path d="M40 186 L40 148 Q40 126 62 119 L120 106 Q210 98 300 106 L358 119 Q380 126 380 148 L380 186 Q380 190 374 190 L46 190 Q40 190 40 186Z" fill="url(#bodyG)" stroke="#3a4350" stroke-width="1"/>
    <g id="liftG"><path d="M112 106 L140 60 Q210 50 280 60 L308 106Z" fill="#1d232c" stroke="#3a4350" stroke-width="1"/>
    <path d="M126 102 L150 65 Q210 58 270 65 L294 102Z" fill="url(#glassG)"/>
    <path class="glass" d="M126 102 L150 65 Q210 58 270 65 L294 102Z" fill="#000" opacity="0"/></g>
    <rect x="182" y="142" width="56" height="20" rx="3" fill="#d9dee5" opacity=".18" stroke="#56606d"/>
    ${L(29,'<rect x="186" y="139" width="48" height="3" rx="1.5" fill="x"/>','white',true)}
    <g id="chargeG"><rect x="44" y="122" width="12" height="10" rx="2" fill="#20262f" stroke="#3a4350"/><rect id="chargeLed" x="47" y="125" width="6" height="4" rx="1" fill="#3dff8b" opacity="0"/></g>
    ${rearCluster('L')}
    <g ${mir()}>${rearCluster('R').replace('<g data-ch="27"','<g data-ch="27" data-dup="1"').replace('<g data-ch="28"','<g data-ch="28" data-hide="1"')}</g>
    ${ui.showCT ? bar(rbarCh,126,294,110,3) : ''}`;
  $$('#svgRear [data-hide]').forEach(el=>el.remove());
  litEls = $$('[data-ch]').map(g=>({ch:+g.dataset.ch, lit:g.querySelector('.lit'), halo:g.querySelector('.halo')}));
  barEls = $$('[data-bar]').map(r=>({ch:+r.dataset.bar, el:r}));
  glassEls = $$('.glass'); mirrorEls = $$('.mirror').map(m=>({k:+m.dataset.k, el:m}));
  liftEl = $('#liftG'); chargeEl = $('#chargeLed'); groundEl = $('#groundF');
  buildClosStrip(); updatePreview(cur);
}
function buildClosStrip(){
  const items = GROUPS[2].rows.map(r=>`<span class="cl" data-row="${r.id}" title="${esc(r.name)}">${esc(r.name.replace(/ \((S|X)\)/,''))}${r.ch.map(c=>`<i><b data-k="${c-30}" style="width:0%"></b></i>`).join('')}</span>`);
  $('#closStrip').innerHTML = items.join('');
  closBars = $$('#closStrip b[data-k]').map(el=>({k:+el.dataset.k, el}));
  closChips = $$('#closStrip .cl').map(el=>({el, ch:ROWMAP[el.dataset.row].ch}));
}
let closBars=[], closChips=[];
function updatePreview(t){
  if (!sim || !rnd) return;
  const f = Math.max(0, Math.min(sim.frames-1, Math.floor(t*1000/S.step)));
  const I=sim.I, NL=sim.NL;
  for (const o of litEls){ const v=I[f*NL+o.ch]; o.lit.setAttribute('opacity', v.toFixed(3)); if (o.halo) o.halo.setAttribute('opacity', (v*0.95).toFixed(3)); }
  const nch=rnd.nch, b=rnd.buf;
  if (nch===200) for (const o of barEls){ const v=b[f*nch+o.ch]/255; o.el.setAttribute('opacity', (0.06+0.94*v).toFixed(3)); }
  // interior glow
  let cr=0,cg=0,cb=0;
  if (nch===200){ for (const base of [175,178,181,184,187,190]){ cr=Math.max(cr,b[f*nch+base]); cg=Math.max(cg,b[f*nch+base+1]); cb=Math.max(cb,b[f*nch+base+2]); } }
  const mx=Math.max(cr,cg,cb); for (const gl of glassEls){ gl.setAttribute('fill',`rgb(${cr},${cg},${cb})`); gl.setAttribute('opacity',(mx/255*0.75).toFixed(3)); }
  // ground reflection from front lights
  const fr = Math.max(I[f*NL+0],I[f*NL+1],I[f*NL+2],I[f*NL+3]) + 0.3*Math.max(I[f*NL+14],I[f*NL+15]);
  if (groundEl) groundEl.setAttribute('opacity', Math.min(0.55, fr*0.45).toFixed(3));
  // closures
  const P=sim.pos, D=sim.dancing, NC=sim.NC;
  for (const m of mirrorEls){ const p=P[f*NC+m.k]; const dir = m.k===5 ? 1 : -1; m.el.style.transform = `rotate(${(1-p)*55*dir}deg) scaleX(${0.55+0.45*p})`; }
  if (liftEl){ const p=P[f*NC+10]; liftEl.setAttribute('transform', `translate(0 ${(-p*16).toFixed(2)})`); }
  if (chargeEl){ const p=P[f*NC+15], d=D[f*NC+15]; chargeEl.setAttribute('opacity', p>0.3? '1':'0'); chargeEl.setAttribute('fill', d? `hsl(${(t*240)%360} 100% 60%)` : '#3dff8b'); }
  for (const o of closBars) o.el.style.width=(P[f*NC+o.k]*100).toFixed(0)+'%';
  for (const o of closChips) o.el.classList.toggle('dance', o.ch.some(c=>D[f*NC+c-30]));
  updateClock();
}

/* ---------- banner ---------- */
function askNoAudio(){
  const b=$('#banner'); b.innerHTML=`<span><b>Manca la musica.</b> Senza il file audio con lo stesso nome l'auto non mostra lo show.${S.audioName&&!S.isDemo?` Ricarica <b>${esc(S.audioName)}</b>.`:''}</span><label class="btn small primary" for="audioIn">Carica musica</label><button class="btn small" id="bForce">Esporta solo il .fseq</button><button class="btn small" id="bClose">Chiudi</button>`;
  b.hidden=false; $('#bClose').onclick=hideBanner; $('#bForce').onclick=()=>{ hideBanner(); exportZip(true); }; pendingExport=true;
}
let pendingExport=false;
function showBanner(html){ const b=$('#banner'); b.innerHTML=`<span>${html}</span><label class="btn small" for="audioIn">Carica musica</label><button class="btn small" id="bClose">Chiudi</button>`; b.hidden=false; $('#bClose').onclick=hideBanner; }
function hideBanner(){ $('#banner').hidden=true; }

/* ---------- demo audio ---------- */
async function synthDemo(){
  const sr=44100, bpm=120, beat=60/bpm, bars=16, off=0.5, dur=off+bars*4*beat+1.5;
  const oc=new OfflineAudioContext(2, Math.ceil(sr*dur), sr);
  const comp=oc.createDynamicsCompressor(); const master=oc.createGain(); master.gain.value=0.9; comp.connect(master); master.connect(oc.destination);
  const nb=oc.createBuffer(1,sr,sr), nd=nb.getChannelData(0); for (let i=0;i<sr;i++) nd[i]=Math.random()*2-1;
  const env=(g,t,a,peak,d)=>{ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+d); };
  const kick=(t,v)=>{ const o=oc.createOscillator(), g=oc.createGain(); o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(44,t+0.13); env(g,t,0.004,v,0.38); o.connect(g); g.connect(comp); o.start(t); o.stop(t+0.45); };
  const hat=(t,v)=>{ const s=oc.createBufferSource(); s.buffer=nb; const f=oc.createBiquadFilter(); f.type='highpass'; f.frequency.value=7500; const g=oc.createGain(); env(g,t,0.002,v,0.05); s.connect(f); f.connect(g); g.connect(comp); s.start(t, Math.random()*0.5); s.stop(t+0.08); };
  const snare=(t,v)=>{ const s=oc.createBufferSource(); s.buffer=nb; const f=oc.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1900; f.Q.value=0.7; const g=oc.createGain(); env(g,t,0.003,v,0.17); s.connect(f); f.connect(g); g.connect(comp); s.start(t, Math.random()*0.5); s.stop(t+0.25);
    const o=oc.createOscillator(), g2=oc.createGain(); o.frequency.value=190; env(g2,t,0.002,v*0.5,0.08); o.connect(g2); g2.connect(comp); o.start(t); o.stop(t+0.12); };
  const bass=(t,fq,len,v)=>{ const o=oc.createOscillator(); o.type='sawtooth'; o.frequency.value=fq; const f=oc.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420; const g=oc.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.01); g.gain.setValueAtTime(v,t+len*0.7); g.gain.exponentialRampToValueAtTime(0.0001,t+len); o.connect(f); f.connect(g); g.connect(comp); o.start(t); o.stop(t+len+0.02); };
  const pad=(t,fqs,len,v)=>{ for (const fq of fqs) for (const dt of [-3,3]){ const o=oc.createOscillator(); o.type='triangle'; o.frequency.value=fq; o.detune.value=dt; const g=oc.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.5); g.gain.setValueAtTime(v,t+len-0.4); g.gain.exponentialRampToValueAtTime(0.0001,t+len+0.3); o.connect(g); g.connect(comp); o.start(t); o.stop(t+len+0.35); } };
  const chords=[[220,261.63,329.63],[174.61,220,261.63],[196,261.63,329.63],[196,246.94,293.66]], roots=[110,87.31,130.81,98];
  for (let b=0;b<bars;b++){
    const tb=off+b*4*beat, ci=b%4, intro=b<4, build=b>=4&&b<8, full=b>=8&&b<14, outro=b>=14;
    pad(tb, chords[ci], 4*beat, intro||outro?0.05:0.03);
    for (let k=0;k<4;k++){ const t=tb+k*beat;
      if (intro){ if (b>=2 && k===0) kick(t,0.5); }
      else if (outro){ if (k===0 && b===14) kick(t,0.7); }
      else { kick(t, full?0.95:0.75); hat(t+beat/2, full?0.25:0.16); if (full){ hat(t+beat/4,0.08); hat(t+3*beat/4,0.08); if (k%2) snare(t,0.55); } bass(t, roots[ci], beat*0.45, full?0.28:0.2); if (full) bass(t+beat/2, roots[ci]*2, beat*0.4, 0.16); }
    }
  }
  return oc.startRendering();
}

/* ---------- boot ---------- */
async function boot(){
  readColors(); buildTools(); buildCarSVG(); buildRows(); sizeCanvas(); updateClock();
  let saved=null; try { saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); } catch(e){}
  $('#projName').value=S.name;
  try { const demo=await synthDemo(); await setAudio(demo, DEMO_NAME, true); } catch(e){ an=null; }
  if (saved && Array.isArray(saved.effects) && saved.effects.length){
    S.name=saved.name||S.name; S.step=[20,25,40,50].includes(saved.step)?saved.step:20; S.effects=saved.effects.filter(x=>ROWMAP[x.row]);
    Object.assign(ui.expanded, saved.expanded||{}); if (saved.collapsed) Object.assign(ui.collapsed, saved.collapsed);
    let restored=false;
    if (!saved.isDemo && saved.audioName){ const rec=await audioStore.get(); if (rec && rec.name===saved.audioName && rec.blob){ try { const buf=await getCtx().decodeAudioData(await rec.blob.arrayBuffer()); await setAudio(buf, rec.name, false); restored=true; } catch(e){} } }
    if (!restored && !saved.isDemo && saved.audioName){ audioBuf=null; an=null; grid=[]; S.audioName=saved.audioName; S.isDemo=false; S.dur=saved.dur||S.dur; $('#demoChip').hidden=true; $('#bpmChip').textContent='-- BPM'; showBanner(`Show ripreso dall'ultima sessione. Carica di nuovo <b>${esc(saved.audioName)}</b> per sentirlo e analizzarne i beat.`); }
    $('#projName').value=S.name;
  } else {
    S.name='Show demo'; $('#projName').value=S.name;
    S.effects = generateShow(an, S.dur, {style:'equilibrato', rows:DEFAULT_GEN}, uid);
  }
  buildRows(); sizeCanvas(); zoomFit(); recompute(); requestDraw(); downloads();
}
boot();
})();
