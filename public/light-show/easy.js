(()=>{'use strict';
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const SET_KEY='light-show-studio:easy', EDITOR_KEY='light-show-studio:v1', STEP=20;
let idc=0; const uid=()=>'x'+Date.now().toString(36)+(++idc).toString(36);
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtS = t => { t=Math.max(0,t); const m=Math.floor(t/60), s=Math.floor(t-m*60); return m+':'+(s<10?'0':'')+s; };
function toast(msg, ms=2800){ const el=$('#toast'); el.textContent=msg; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>el.hidden=true, ms); }
const fileBase = n => (n||'lightshow').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60) || 'lightshow';

/* ---------- stato ---------- */
const S = {car:'my', density:null, parts:null, nCars:1, layout:'row', view:'front', sel:0};
let song=null;            /* {name, blob, buf, isDemo} */
let A=null, dur=0, shows=[];
let actx=null, src=null, playing=false, t0ctx=0, off=0, cur=0;

function defaultParts(car){ return new Set(partsFor(car).map(p=>p.id)); }
function loadSettings(){ try { const j=JSON.parse(localStorage.getItem(SET_KEY)||'null'); if (j && CARS[j.car]){ S.car=j.car; S.density=j.density??null; S.parts=new Set(j.parts||[]); S.nCars=Math.min(8,Math.max(1,j.nCars||1)); S.layout=j.layout==='arc'?'arc':'row'; S.view=j.view||'front'; } } catch(e){} if (!S.parts) S.parts=defaultParts(S.car); }
function saveSettings(){ try { localStorage.setItem(SET_KEY, JSON.stringify({car:S.car, density:S.density, parts:[...S.parts], nCars:S.nCars, layout:S.layout, view:S.view, song: song ? {name:song.name, isDemo:song.isDemo} : null})); } catch(e){} }

/* brano tenuto nel browser tra una visita e l'altra (IndexedDB, best effort) */
const idb = {
  open(){ return new Promise((res,rej)=>{ try { const r=indexedDB.open('light-show-studio',1); r.onupgradeneeded=()=>r.result.createObjectStore('audio'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); } catch(e){ rej(e); } }); },
  async put(key,v){ try { const db=await this.open(); await new Promise((res,rej)=>{ const tx=db.transaction('audio','readwrite'); tx.objectStore('audio').put(v,key); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); } catch(e){} },
  async get(key){ try { const db=await this.open(); return await new Promise((res,rej)=>{ const r=db.transaction('audio').objectStore('audio').get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); }); } catch(e){ return null; } }
};

/* ---------- partenza ---------- */
function buildCarGrid(){
  $('#carGrid').innerHTML = CAR_ORDER.map(id=>`<button class="carc" role="radio" data-car="${id}" aria-checked="${id===S.car}">${hasImg(id,'front') ? `<img src="img/${id}/icon.webp" alt="" loading="lazy">` : carIcon(id)}<b>${CARS[id].name}</b><small>${CARS[id].years}</small></button>`).join('');
  $$('#carGrid .carc').forEach(b=>b.onclick=()=>{ setCar(b.dataset.car); $$('#carGrid .carc').forEach(x=>x.setAttribute('aria-checked', String(x===b))); });
  $('#carPick').innerHTML = CAR_ORDER.map(id=>`<option value="${id}">${CARS[id].name} · ${CARS[id].years}</option>`).join('');
  const closName = {mirror:'specchietti',winF:'finestrini',lift:'portellone o baule',charge:'sportello di ricarica',falcon:'porte Falcon',handF:'maniglie',fbar:'light bar'};
  $('#supTable tbody').innerHTML = CAR_ORDER.map(id=>{ const c=CARS[id]; const cl=Object.keys(closName).filter(k=>c.rows.includes(k)).map(k=>closName[k]); return `<tr><td>${c.name}</td><td>${c.years}</td><td>${cl.join(', ')}</td></tr>`; }).join('');
}
function setCar(id){
  if (!CARS[id]) return; const changed = id!==S.car; S.car=id; $('#carPick').value=id;
  if (changed){ S.parts=defaultParts(id); }
  saveSettings(); if (A){ renderParts(); buildViews(); regenerate(); }
}

/* ---------- audio ---------- */
function ctx(){ if (!actx){ const AC=window.AudioContext||window.webkitAudioContext; actx=new AC(); } return actx; }
async function decode(blob){ return await ctx().decodeAudioData(await blob.arrayBuffer()); }
function busy(msg){ $('#busy').hidden=!msg; if (msg) $('#busyMsg').textContent=msg; }
async function loadSong(blob, name, isDemo, buf){
  stop(); showStudio(); busy('Ascolto il brano…');
  await new Promise(r=>setTimeout(r,30));
  try {
    if (!buf) buf = await decode(blob);
    const n=buf.length, nc=buf.numberOfChannels, mono=new Float32Array(n);
    for (let c=0;c<nc;c++){ const d=buf.getChannelData(c); for (let i=0;i<n;i++) mono[i]+=d[i]/nc; }
    busy('Trovo cassa, rullante, hi-hat e drop…'); await new Promise(r=>setTimeout(r,20));
    A = analyzeSong(mono, buf.sampleRate); dur=Math.max(1, buf.duration);
    song = {name, blob, buf, isDemo:!!isDemo};
    if (!isDemo) idb.put('easy', {name, blob});
    cur=0; renderSong(); renderParts(); buildViews(); regenerate(true); saveSettings();
    busy(null);
  } catch(err){ busy(null); console.error(err); toast('Non riesco a leggere questo file audio. Prova con un MP3 o un WAV.', 4500); if (!A) showStart(); }
}
$('#audioIn').onchange = e => { const f=e.target.files[0]; e.target.value=''; if (f) loadSong(f, f.name.replace(/\.[^.]+$/,''), false); };
const dz=$('#dropZone');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{ e.preventDefault(); dz.classList.add('over'); }));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{ e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if (!f) return; if (/\.(lsshow|zip)$/i.test(f.name)) openProject(f); else loadSong(f, f.name.replace(/\.[^.]+$/,''), false); });
$('#demoBtn').onclick = async ()=>{ showStudio(); busy('Preparo il brano demo…'); try { const b=await synthDemo(); await loadSong(null, 'Brano demo', true, b); } catch(e){ busy(null); toast('Il brano demo non parte in questo browser.'); } };

function showStudio(){ $('#start').hidden=true; $('#studio').hidden=false; window.scrollTo({top:0}); requestAnimationFrame(sizeWave); }
function showStart(){ stop(); $('#studio').hidden=true; $('#start').hidden=false; }
$('#restartBtn').onclick = ()=>{ showStart(); window.scrollTo({top:0, behavior:'smooth'}); };

/* ---------- pannello ---------- */
function renderSong(){
  $('#songName').textContent = song.name; $('#songMeta').textContent = `${fmtS(dur)} · ${Math.round(A.bpm)} BPM`;
  const strong = A.bars.filter(b=>b.lvl===2).length;
  $('#stats').innerHTML = [[Math.round(A.bpm),'BPM'],[A.hits.kick.length,'casse'],[A.builds.length,'build-up'],[A.drops.length,'drop']].map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#total').textContent = fmtS(dur);
  renderDensity();
}
const DENS_TXT = ['', 'Solo le casse principali: show calmo ed elegante.', 'Tutte le casse, rullante nei momenti forti.', 'Casse e rullante, hi-hat a ottavi quando il brano spinge.', 'Anche gli hi-hat nelle parti medie: show fitto.', 'Ogni colpo diventa un lampo, hi-hat a sedicesimi.'];
function density(){ return S.density ?? A?.suggested ?? 3; }
function renderDensity(){
  const d=density(), sug=A?.suggested??3; $('#dens').value=d;
  $('#densTicks').innerHTML = [1,2,3,4,5].map(i=>`<span class="${i===sug?'sug':''}">${i}${i===sug?' ★':''}</span>`).join('');
  $('#densTxt').textContent = DENS_TXT[d] + (d===sug ? ' Consigliata per questo brano.' : '');
  $('#densReset').hidden = S.density==null || S.density===sug;
}
$('#dens').oninput = e => { S.density=+e.target.value; renderDensity(); saveSettings(); regenerate(); };
$('#densReset').onclick = ()=>{ S.density=null; renderDensity(); saveSettings(); regenerate(); };
$('#carPick').onchange = e => setCar(e.target.value);
function renderParts(){
  $('#parts').innerHTML = partsFor(S.car).map(p=>`<button class="chip" data-p="${p.id}" aria-pressed="${S.parts.has(p.id)}">${p.name}</button>`).join('');
  $$('#parts .chip').forEach(b=>b.onclick=()=>{ const id=b.dataset.p; if (S.parts.has(id)) S.parts.delete(id); else S.parts.add(id); b.setAttribute('aria-pressed', String(S.parts.has(id))); saveSettings(); regenerate(); });
}
function renderMulti(){
  $('#nCars').textContent=S.nCars; $('#nMinus').disabled=S.nCars<=1; $('#nPlus').disabled=S.nCars>=8;
  $('#layoutSeg').classList.toggle('off', S.nCars<2);
  $$('#layoutSeg button').forEach(b=>b.setAttribute('aria-checked', String(b.dataset.v===S.layout)));
  $('#multiTxt').textContent = S.nCars<2 ? 'Una sola auto. Con più auto le luci si rincorrono da una all\'altra e i drop esplodono insieme.'
    : `${S.nCars} auto ${S.layout==='arc'?'a semicerchio':'in fila'}, numerate da sinistra guardandole di fronte. Ognuna ha il suo file e la sua chiavetta.`;
}
$('#nMinus').onclick=()=>{ S.nCars=Math.max(1,S.nCars-1); multiChanged(); };
$('#nPlus').onclick=()=>{ S.nCars=Math.min(8,S.nCars+1); multiChanged(); };
$$('#layoutSeg button').forEach(b=>b.onclick=()=>{ S.layout=b.dataset.v; renderMulti(); saveSettings(); if (S.view==='group') buildViews(); });
function multiChanged(){ if (S.sel>=S.nCars) S.sel=0; if (S.nCars>1 && S.view!=='group') S.view='group'; if (S.nCars<2 && S.view==='group') S.view='front'; renderMulti(); saveSettings(); buildViews(); regenerate(); }

/* ---------- generazione ---------- */
let genT=0;
function regenerate(now){
  if (!A) return; clearTimeout(genT); genPending=true;
  genT = setTimeout(doRegen, now?0:120);
}
let genPending=false;
function flushRegen(){ if (genPending || shows.length!==S.nCars){ clearTimeout(genT); doRegen(); } }
function doRegen(){
  {
    genPending=false;
    shows=[]; const d=density();
    for (let i=0;i<S.nCars;i++){
      const effects = autoShow(A, dur, {car:S.car, parts:S.parts, density:d, carIdx:i, nCars:S.nCars, uid});
      const rnd = renderChannels(effects, dur, STEP); const sim = simulate(rnd);
      shows.push({effects, rnd, sim, issues:closureIssues(sim)});
    }
    const iss = shows.flatMap((s,i)=>s.issues.map(x=>(S.nCars>1?`Auto ${i+1} · `:'')+x));
    $('#issues').hidden=!iss.length; $('#issues').innerHTML = iss.length ? `<b>Oltre i limiti di Tesla</b><br>${iss.map(esc).join('<br>')}` : '';
    paint(); drawWave();
  }
}

/* ---------- viste ---------- */
const VIEWS_IMG = [['front','Fronte'],['rear','Retro'],['side','Lato'],['qf','3/4 davanti'],['qr','3/4 dietro'],['all','Tutte'],['group','Gruppo']];
const VIEWS_SVG = [['front','Fronte'],['rear','Retro'],['side','Lato'],['top','Dall\'alto'],['all','Tutte'],['group','Gruppo']];
const isImg = () => hasImg(S.car,'front');
function viewSVG(car, v, small){ if (hasImg(car,v)) return imgSVG(car,v); return v==='rear'?rearSVG(car) : v==='side'?sideSVG(car) : v==='top'?topSVG(car,small) : frontSVG(car); }
let painters=[];  /* {P, idx} */
function buildViews(){
  const multi=S.nCars>1, VIEWS = isImg() ? VIEWS_IMG : VIEWS_SVG;
  if (!VIEWS.some(([v])=>v===S.view) || (S.view==='group' && !multi)) S.view='front';
  $('#viewTabs').innerHTML = VIEWS.filter(([v])=>v!=='group'||multi).map(([v,l])=>`<button role="tab" data-v="${v}" aria-selected="${v===S.view}">${l}</button>`).join('');
  $$('#viewTabs button').forEach(b=>b.onclick=()=>{ S.view=b.dataset.v; saveSettings(); buildViews(); });
  const cs=$('#carSel'); cs.hidden = !multi || S.view==='group';
  cs.innerHTML = multi ? Array.from({length:S.nCars},(_,i)=>`<button data-i="${i}" aria-pressed="${i===S.sel}">Auto ${i+1}</button>`).join('') : '';
  $$('#carSel button').forEach(b=>b.onclick=()=>{ S.sel=+b.dataset.i; buildViews(); });
  const cv=$('#canvas'); cv.className='canvas'; painters=[];
  const car=S.car;
  if (S.view==='all'){
    cv.className='canvas grid4';
    const four = isImg() ? [['3/4 DAVANTI','qf'],['3/4 DIETRO','qr'],['FRONTE','front'],['RETRO','rear']] : [['FRONTE','front'],['RETRO','rear'],['LATO','side'],['DALL\'ALTO','top']];
    cv.innerHTML = four.map(([l,v])=>[l,viewSVG(car,v,true)]).map(([l,s])=>`<div class="cell"><label>${l}</label>${s}</div>`).join('');
    $$('#canvas .cell').forEach(c=>painters.push({P:prepSVG(c), idx:()=>S.sel}));
  } else if (S.view==='group' && multi){
    cv.innerHTML = `<div class="group" id="group"></div>`; layoutGroup();
  } else {
    const svg = viewSVG(car, S.view);
    cv.innerHTML = `<div class="one">${svg}</div>`; painters.push({P:prepSVG(cv), idx:()=>S.sel});
  }
  paint();
}
function layoutGroup(){
  const g=$('#group'); if (!g) return; const n=S.nCars, W=g.clientWidth||800, H=g.clientHeight||400;
  const arc = S.layout==='arc';
  if (isImg()){
    const V=CARIMG[S.car].front, ar=V.h/V.w;
    let cw = Math.min(W/n*0.9, (H*0.8)/ar);
    g.innerHTML = Array.from({length:n},(_,i)=>{
      const u = n===1?0.5:i/(n-1), t=Math.abs(2*u-1), f=1-Math.sqrt(Math.max(0,1-t*t)), k = arc ? 0.72+0.28*f : 1, w=cw*k, h=w*ar;
      const x=(i+0.5)*W/n - w/2, y = arc ? H*0.06 + (H*0.9-h)*f : (H-h)/2;
      return `<div class="gcar${i===S.sel?' sel':''}" data-i="${i}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;z-index:${Math.round(k*10)}">${imgSVG(S.car,'front')}<b>${i+1}</b></div>`;
    }).join('');
    Array.from(g.querySelectorAll('.gcar')).forEach(el=>{ const i=+el.dataset.i; painters.push({P:prepSVG(el), idx:()=>i}); el.onclick=()=>{ S.sel=i; Array.from(g.querySelectorAll('.gcar')).forEach(x=>x.classList.toggle('sel', x===el)); }; });
    return;
  }
  const cw = arc ? Math.min(W/(n+2.2), H*0.2) : Math.min(W/n*0.62, H*0.42), ch = cw*2.05;
  const cy = H - ch*0.5 - 14, rx = W/2 - ch*0.55 - 8, ry = Math.max(40, cy - ch*0.55 - 8);
  g.innerHTML = Array.from({length:n},(_,i)=>{
    const u = n===1 ? 0.5 : i/(n-1);
    let x, y, rot=180;
    if (arc){ const a = Math.PI*(0.92 - 0.84*u); x = W/2 + Math.cos(a)*rx - cw/2; y = cy - Math.sin(a)*ry - ch/2; rot = Math.atan2(-Math.cos(a), -Math.sin(a))*180/Math.PI; }
    else { x = (i+0.5)*W/n - cw/2; y = H/2 - ch/2; }
    return `<div class="gcar${i===S.sel?' sel':''}" data-i="${i}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px"><div style="width:100%;height:100%;transform:rotate(${rot}deg)">${topSVG(S.car,true)}</div><b>${i+1}</b></div>`;
  }).join('');
  Array.from(g.querySelectorAll('.gcar')).forEach(el=>{ const i=+el.dataset.i; painters.push({P:prepSVG(el), idx:()=>i}); el.onclick=()=>{ S.sel=i; Array.from(g.querySelectorAll('.gcar')).forEach(x=>x.classList.toggle('sel', x===el)); }; });
}
function paint(){ for (const p of painters) paintSVG(p.P, shows[p.idx()]||shows[0], cur); }
let roT=0; new ResizeObserver(()=>{ clearTimeout(roT); roT=setTimeout(()=>{ sizeWave(); if (S.view==='group' && S.nCars>1){ painters=[]; layoutGroup(); paint(); } }, 80); }).observe($('#canvas'));

/* ---------- forma d'onda e sezioni ---------- */
const wv=$('#wave'), wctx=wv.getContext('2d');
function sizeWave(){ const dpr=window.devicePixelRatio||1, w=wv.clientWidth; if (!w) return; wv.width=Math.round(w*dpr); wv.height=Math.round(64*dpr); wctx.setTransform(dpr,0,0,dpr,0,0); drawWave(); }
function drawWave(){
  const w=wv.clientWidth, h=64; if (!w || !A) return;
  const cs=getComputedStyle(document.documentElement), panel2=cs.getPropertyValue('--panel2').trim()||'#161b23';
  wctx.clearRect(0,0,w,h); wctx.fillStyle=panel2; wctx.fillRect(0,0,w,h);
  const X = t => t/dur*w, col=['rgba(75,106,146,.45)','rgba(124,107,214,.45)','rgba(255,154,61,.5)'];
  for (const b of A.bars){ const x0=X(b.t0), x1=X(Math.min(dur,b.t1)); wctx.fillStyle=col[b.lvl]; wctx.fillRect(x0,h-6,x1-x0,6);
    if (b.build){ wctx.save(); wctx.beginPath(); wctx.rect(x0,0,x1-x0,h); wctx.clip(); wctx.strokeStyle='rgba(255,93,99,.35)'; wctx.lineWidth=1; for (let x=x0-h; x<x1; x+=5){ wctx.beginPath(); wctx.moveTo(x,h); wctx.lineTo(x+h,0); wctx.stroke(); } wctx.restore(); } }
  const pmin=A.pmin, pmax=A.pmax, nf=pmin.length, hs=A.hopSec, mid=(h-6)/2;
  const played = X(cur);
  for (let x=0;x<w;x++){
    const a=Math.floor(x/w*dur/hs), b=Math.min(nf, Math.floor((x+1)/w*dur/hs)+1); let mn=0, mx=0;
    for (let i=a;i<b;i++){ if (pmin[i]<mn) mn=pmin[i]; if (pmax[i]>mx) mx=pmax[i]; }
    wctx.fillStyle = x<played ? (cs.getPropertyValue('--accent').trim()||'#ffb238') : 'rgba(140,150,165,.7)';
    wctx.fillRect(x, mid - mx*mid*0.95, 1, Math.max(1,(mx-mn)*mid*0.95));
  }
  for (const di of A.drops){ const x=X(A.bars[di].t0); wctx.fillStyle='#fff'; wctx.fillRect(x-1,0,2,h-6); wctx.font='600 9px IBM Plex Mono, monospace'; wctx.fillText('DROP', Math.min(w-30,x+3), 10); }
  wctx.fillStyle=cs.getPropertyValue('--fg').trim()||'#fff'; wctx.fillRect(played-1,0,2,h);
}
function seekX(clientX){ const r=wv.getBoundingClientRect(); seek((clientX-r.left)/r.width*dur); }
let scrub=false;
wv.addEventListener('pointerdown', e=>{ scrub=true; wv.setPointerCapture(e.pointerId); seekX(e.clientX); });
wv.addEventListener('pointermove', e=>{ if (scrub) seekX(e.clientX); });
wv.addEventListener('pointerup', ()=>{ scrub=false; });

/* ---------- riproduzione ---------- */
function now(){ return playing ? off + (actx.currentTime - t0ctx) : cur; }
function play(){
  if (!song || playing) return; if (cur>=dur-0.05) cur=0;
  const c=ctx(); if (c.state==='suspended') c.resume();
  src=c.createBufferSource(); src.buffer=song.buf; src.connect(c.destination); t0ctx=c.currentTime+0.03; off=cur; src.start(t0ctx, cur); playing=true;
  src.onended=()=>{ if (playing && now()>=dur-0.1){ playing=false; cur=dur; setIcon(); } };
  setIcon(); loop();
}
function stop(){ if (!playing) return; cur=now(); playing=false; try{ src.stop(); }catch(e){} src.disconnect(); src=null; setIcon(); }
function seek(t){ t=Math.max(0,Math.min(dur,t)); const was=playing; if (was) stop(); cur=t; if (was) play(); else { paint(); drawWave(); clock(); } }
function setIcon(){ $('#playIco').innerHTML = playing ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11l9-5.5z"/>'; $('#playBtn').setAttribute('aria-label', playing?'Pausa':'Riproduci'); }
function clock(){ $('#clock').textContent = fmtS(cur); }
function loop(){ if (!playing) return; cur=Math.min(dur, now()); paint(); drawWave(); clock(); requestAnimationFrame(loop); }
$('#playBtn').onclick = ()=> playing ? stop() : play();
document.addEventListener('keydown', e=>{ if (e.code==='Space' && !$('#studio').hidden && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)){ e.preventDefault(); playing?stop():play(); } });

/* ---------- export ---------- */
async function wavBytes(){
  const b=song.buf, len=Math.ceil(b.duration*44100), oc=new OfflineAudioContext(Math.min(2,b.numberOfChannels), len, 44100);
  const s=oc.createBufferSource(); s.buffer=b; s.connect(oc.destination); s.start(0); const out=await oc.startRendering();
  const chs=[]; for (let c=0;c<out.numberOfChannels;c++) chs.push(out.getChannelData(c)); return encodeWav(chs,44100);
}
function download(name, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
$('#exportBtn').onclick = async ()=>{
  if (!A || typeof JSZip==='undefined'){ toast('Il modulo ZIP non si è caricato: ricarica la pagina.'); return; }
  flushRegen();
  const btn=$('#exportBtn'), old=btn.innerHTML; btn.disabled=true; btn.lastChild.textContent=' Preparo i file…';
  try {
    const base=fileBase(song.name), zip=new JSZip(), wav=await wavBytes(), N=S.nCars;
    const readme = i => `Show: ${song.name}${N>1?`\r\nAuto ${i+1} di ${N} (${S.layout==='arc'?'semicerchio':'fila'}, contando da sinistra guardando le auto di fronte)`:''}\r\nModello: ${CARS[S.car].name}\r\n\r\n1. Formatta la chiavetta in exFAT o FAT32.\r\n2. Copia la cartella LightShow nella radice della chiavetta.\r\n3. In auto, in Park: Toybox > Light Show, scegli lo show.${N>1?'\r\n4. Su ogni auto usa "Programma show" alla stessa ora.':''}\r\n\r\nCreato con Light Show Studio - mytesla.fabrizioalampi.it/light-show/\r\n`;
    for (let i=0;i<N;i++){
      const root = N>1 ? zip.folder(`Auto-${i+1}`) : zip, dir=root.folder('LightShow');
      dir.file(base+'.fseq', buildFseq(shows[i].rnd, 'Light Show Studio', base+'.wav')); dir.file(base+'.wav', wav);
      root.file('LEGGIMI.txt', readme(i));
    }
    const name = base + (N>1?`_${N}-auto`:'') + '.zip';
    download(name, await zip.generateAsync({type:'blob', compression:'STORE'}));
    openGuide(name, base);
  } catch(err){ console.error(err); toast('Download non riuscito: '+(err&&err.message||err), 4500); }
  finally { btn.disabled=false; btn.innerHTML=old; }
};

const GUIDE = {
  pc: base => `<ol>
    <li><b>Formatta la chiavetta</b> in <b>exFAT</b> (o FAT32). Mac: Utility Disco → Inizializza. Windows: tasto destro sulla chiavetta → Formatta.</li>
    <li><b>Estrai lo ZIP</b> e copia la cartella <code>LightShow</code> nella <b>radice</b> della chiavetta, non dentro altre cartelle.</li>
    <li>Dentro devono esserci <code>${esc(base)}.fseq</code> e <code>${esc(base)}.wav</code>, con lo stesso nome.</li>
    <li>Espelli la chiavetta e inseriscila in una porta USB dell'auto (meglio quella nel vano portaoggetti o davanti).</li>
    <li>Ad auto in <b>Park</b>: Toybox → <b>Light Show</b>, scegli lo show e avvialo, oppure programmalo.</li></ol>
    <p class="note">Se l'auto non vede lo show, quasi sempre è il percorso: deve essere <code>LightShow/${esc(base)}.fseq</code> proprio nella radice.</p>`,
  phone: () => `<ol>
    <li><b>Android</b>: collega la chiavetta con un adattatore OTG (o una chiavetta USB-C). Apri l'app File, estrai lo ZIP e copia la cartella <code>LightShow</code> nella radice della chiavetta.</li>
    <li><b>iPhone con USB-C</b> (o adattatore Lightning-USB): in File tocca lo ZIP per estrarlo, poi tieni premuta la cartella <code>LightShow</code> → Copia, e incollala nella chiavetta.</li>
    <li>Il telefono non sempre sa formattare in exFAT: se la chiavetta è nuova o in un altro formato, formattala prima dal computer.</li></ol>
    <p class="note">Su iPhone lo ZIP finisce in File → Download. Su Android di solito in Download.</p>`,
  cam: () => `<p>La porta USB è già occupata dalla chiavetta della dashcam? Due strade:</p><ol>
    <li><b>Hub USB</b> con due chiavette: una per TeslaCam, una con la cartella <code>LightShow</code>.</li>
    <li><b>Una chiavetta, due partizioni exFAT</b>: una per TeslaCam e una per gli show. <b>Attenzione: dividere la chiavetta cancella tutto quello che c'è sopra</b>, salva prima i video.<br>Su Mac, da Terminale (sostituisci <code>diskN</code> con la tua chiavetta, la vedi con <code>diskutil list</code>):
    <pre>diskutil partitionDisk diskN MBR ExFAT TESLACAM 50% ExFAT SHOW R</pre>
    Su Windows usa Gestione disco: elimina il volume, poi crea due volumi semplici exFAT.</li>
    <li>Nella partizione TeslaCam crea di nuovo la cartella <code>TeslaCam</code> (o lascia che la formatti l'auto da Sicurezza → Formatta dispositivo USB, che però usa tutta la chiavetta).</li></ol>`,
  multi: () => `<ol>
    <li>Nello ZIP c'è una cartella per auto: <code>Auto-1</code>, <code>Auto-2</code>… Ognuna ha la sua <code>LightShow</code>: va su <b>una chiavetta diversa</b>.</li>
    <li>Parcheggia le auto ${S.layout==='arc'?'a semicerchio, rivolte verso il centro':'in fila, una accanto all\'altra, col muso verso il pubblico'}, numerate da sinistra guardandole di fronte:
      <div class="lineup">${Array.from({length:S.nCars},(_,i)=>`<span>Auto ${i+1}</span>`).join('')}</div></li>
    <li>Su ogni auto: Toybox → Light Show → <b>Programma show</b>, alla stessa ora e allo stesso minuto. Le auto si sincronizzano sull'ora GPS.</li>
    <li>Ogni auto riproduce la musica dai suoi altoparlanti: tienile tutte con lo stesso volume.</li></ol>`
};
function openGuide(name, base){
  const d=$('#dlg'); $('#dlgFile').textContent = name; $('#dlgMultiTab').hidden = S.nCars<2;
  const show = t => { $$('#dlgTabs button').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.t===t))); $('#dlgBody').innerHTML = GUIDE[t](base); };
  $$('#dlgTabs button').forEach(b=>b.onclick=()=>show(b.dataset.t));
  show(S.nCars>1?'multi':'pc'); if (d.showModal) d.showModal(); else d.setAttribute('open','');
}
$('#dlgClose').onclick = ()=> $('#dlg').close();
$('#dlg').addEventListener('click', e=>{ if (e.target===$('#dlg')) $('#dlg').close(); });

/* ---------- progetto ---------- */
$('#saveBtn').onclick = async ()=>{
  if (!song) return; if (typeof JSZip==='undefined'){ toast('Il modulo ZIP non si è caricato.'); return; }
  const zip=new JSZip();
  zip.file('progetto.json', JSON.stringify({app:'light-show-studio-easy', v:1, name:song.name, isDemo:song.isDemo, car:S.car, density:S.density, parts:[...S.parts], nCars:S.nCars, layout:S.layout, audio: song.isDemo?null:'brano'+(song.blob&&song.blob.name?song.blob.name.replace(/^.*(\.[^.]+)$/,'$1'):'.audio')}, null, 1));
  if (!song.isDemo && song.blob) zip.file('brano'+(song.blob.name?song.blob.name.replace(/^.*(\.[^.]+)$/,'$1'):'.audio'), song.blob);
  download(fileBase(song.name)+'.lsshow', await zip.generateAsync({type:'blob', compression:'STORE'}));
  toast('Progetto salvato con brano e impostazioni.');
};
async function openProject(f){
  try {
    const zip=await JSZip.loadAsync(f); const pj=zip.file('progetto.json'); if (!pj) throw new Error('non è un progetto di Light Show Studio');
    const j=JSON.parse(await pj.async('string'));
    if (CARS[j.car]) S.car=j.car; S.density=j.density??null; S.parts=new Set(j.parts||defaultParts(S.car)); S.nCars=Math.min(8,Math.max(1,j.nCars||1)); S.layout=j.layout==='arc'?'arc':'row';
    if (S.nCars>1) S.view='group';
    $('#carPick').value=S.car; renderMulti();
    if (j.isDemo){ showStudio(); busy('Preparo il brano demo…'); const b=await synthDemo(); await loadSong(null,'Brano demo',true,b); }
    else { const af=j.audio && zip.file(j.audio); if (!af) throw new Error('nel progetto manca il brano'); const blob=await af.async('blob'); await loadSong(blob, j.name||'Brano', false); }
    toast('Progetto aperto.');
  } catch(err){ toast('Non riesco ad aprire il progetto: '+(err.message||err), 4500); }
}
$('#projIn').onchange = e => { const f=e.target.files[0]; e.target.value=''; if (f) openProject(f); };

/* ---------- passaggio all'editor avanzato ---------- */
$('#editorBtn').onclick = async ()=>{
  if (!song) return;
  let prev=null; try { prev=JSON.parse(localStorage.getItem(EDITOR_KEY)||'null'); } catch(e){}
  if (prev && Array.isArray(prev.effects) && prev.effects.length && prev.name!==song.name && !confirm(`Nell'editor avanzato c'è già lo show "${prev.name}". Sostituirlo con questo?`)) return;
  flushRegen();
  const i = S.nCars>1 ? S.sel : 0;
  /* il demo dell'editor è un altro brano: gli passo il nostro come file audio */
  let blob = song.blob;
  if (song.isDemo){ const b=song.buf, chs=[]; for (let c=0;c<b.numberOfChannels;c++) chs.push(b.getChannelData(c)); blob = new Blob([encodeWav(chs, b.sampleRate)], {type:'audio/wav'}); }
  const data = {name:song.name+(S.nCars>1?` (auto ${i+1})`:''), step:STEP, dur, audioName: song.name, isDemo:false,
    effects:shows[i].effects, expanded:{}, collapsed:{'g-ct':S.car!=='ct','g-int':true}};
  try { localStorage.setItem(EDITOR_KEY, JSON.stringify(data)); } catch(e){ toast('Non riesco a passare lo show all\'editor (memoria del browser piena?).'); return; }
  await idb.put('current', {name:song.name, blob});
  location.href='editor.html';
};

/* ---------- brano demo sintetico ---------- */
async function synthDemo(){
  const sr=44100, bpm=124, beat=60/bpm, bars=28, o0=0.4, D=o0+bars*4*beat+2;
  const oc=new OfflineAudioContext(2, Math.ceil(sr*D), sr);
  const comp=oc.createDynamicsCompressor(), master=oc.createGain(); master.gain.value=0.85; comp.connect(master); master.connect(oc.destination);
  const nb=oc.createBuffer(1,sr,sr), nd=nb.getChannelData(0); for (let i=0;i<sr;i++) nd[i]=Math.random()*2-1;
  const env=(g,t,a,p,d)=>{ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(p,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+d); };
  const kick=(t,v)=>{ const o=oc.createOscillator(), g=oc.createGain(); o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(45,t+0.12); env(g,t,0.004,v,0.36); o.connect(g); g.connect(comp); o.start(t); o.stop(t+0.42); };
  const noise=(t,v,type,f,d)=>{ const s=oc.createBufferSource(); s.buffer=nb; const fl=oc.createBiquadFilter(); fl.type=type; fl.frequency.value=f; const g=oc.createGain(); env(g,t,0.002,v,d); s.connect(fl); fl.connect(g); g.connect(comp); s.start(t, Math.random()*0.5); s.stop(t+d+0.05); };
  const hat=(t,v)=>noise(t,v,'highpass',8000,0.045), snare=(t,v)=>noise(t,v,'bandpass',1900,0.16);
  const pad=(t,fqs,len,v)=>{ for (const fq of fqs){ const o=oc.createOscillator(); o.type='triangle'; o.frequency.value=fq; const g=oc.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.4); g.gain.setValueAtTime(v,t+len-0.3); g.gain.exponentialRampToValueAtTime(0.0001,t+len+0.2); o.connect(g); g.connect(comp); o.start(t); o.stop(t+len+0.25); } };
  const bass=(t,fq,len,v)=>{ const o=oc.createOscillator(); o.type='sawtooth'; o.frequency.value=fq; const f=oc.createBiquadFilter(); f.type='lowpass'; f.frequency.value=400; const g=oc.createGain(); env(g,t,0.01,v,len); o.connect(f); f.connect(g); g.connect(comp); o.start(t); o.stop(t+len+0.05); };
  const chords=[[220,261.63,329.63],[174.61,220,261.63],[196,261.63,329.63],[196,246.94,293.66]], roots=[55,43.65,65.41,49];
  /* 0-7 intro calmo, 8-11 build, 12-19 drop, 20-23 break, 24-27 drop finale */
  for (let b=0;b<bars;b++){
    const tb=o0+b*4*beat, ci=b%4, sec = b<8?'intro': b<12?'build': b<20?'drop': b<24?'break':'drop';
    pad(tb, chords[ci], 4*beat, sec==='drop'?0.025:0.05);
    for (let k=0;k<4;k++){ const t=tb+k*beat;
      if (sec==='intro'){ if (k===0 && b>=2) kick(t,0.45); if (b>=4) hat(t+beat/2,0.08); }
      else if (sec==='build'){ const div = b<10?1 : b<11?2 : 4; for (let z=0;z<div;z++) snare(t+z*beat/div, 0.25+0.08*(b-8)); if (k===0) kick(t,0.5); }
      else if (sec==='drop'){ kick(t,0.95); hat(t+beat/2,0.22); hat(t+beat/4,0.07); hat(t+3*beat/4,0.07); if (k%2) snare(t,0.55); bass(t+beat/2, roots[ci]*2, beat*0.4, 0.3); }
      else { if (k===0) kick(t,0.4); }
    }
  }
  return oc.startRendering();
}

/* ---------- avvio ---------- */
async function boot(){
  loadSettings(); buildCarGrid(); $('#carPick').value=S.car; renderMulti();
  let saved=null; try { saved=JSON.parse(localStorage.getItem(SET_KEY)||'null'); } catch(e){}
  if (saved && saved.song && !saved.song.isDemo){
    const rec=await idb.get('easy');
    if (rec && rec.blob && rec.name===saved.song.name){ await loadSong(rec.blob, rec.name, false); toast('Ripreso da dove eri: '+rec.name); }
  }
}
boot();
})();
