(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---------- archivio nel browser (IndexedDB, con ripiego in memoria) ---------- */
const store = (() => {
  const mem = {kv:new Map(), collection:new Map(), templates:new Map()};
  let dbP = null, ok = true;
  const open = () => {
    if (!dbP) dbP = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('wrap-studio', 1);
        r.onupgradeneeded = () => { const db = r.result; for (const n of ['kv', 'collection', 'templates']) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('bloccato'));
      } catch (e) { rej(e); }
    }).catch(e => { ok = false; return null; });
    return dbP;
  };
  const tx = async (name, mode, fn) => {
    const db = await open();
    if (!db) return fn(null, mem[name]);
    return new Promise((res, rej) => { try { const t = db.transaction(name, mode), s = t.objectStore(name); const r = fn(s); t.oncomplete = () => res(r && 'result' in r ? r.result : r); t.onerror = () => rej(t.error); } catch (e) { rej(e); } });
  };
  return {
    get persistent(){ return ok; },
    async ready(){ await open(); return ok; },
    get: (n, k) => tx(n, 'readonly', (s, m) => s ? s.get(k) : m.get(k)).catch(() => mem[n].get(k)),
    put: (n, k, v) => tx(n, 'readwrite', (s, m) => s ? s.put(v, k) : m.set(k, v)).catch(() => mem[n].set(k, v)),
    del: (n, k) => tx(n, 'readwrite', (s, m) => s ? s.delete(k) : m.delete(k)).catch(() => mem[n].delete(k)),
    all: async n => {
      const db = await open();
      if (!db) return [...mem[n].entries()];
      return new Promise(res => { try { const out = [], t = db.transaction(n), c = t.objectStore(n).openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else res(out); }; c.onerror = () => res([]); } catch (e) { res([]); } });
    }
  };
})();

/* ---------- stato del progetto ---------- */
const defaultDoc = () => ({v:1, model:'modely-2025-premium', style:'racing', palette:'oro', colors:WS.palette('oro').c.slice(), params:{}, seed:12345,
  text:{value:'', font:'Bebas Neue', color:'#ffffff', stroke:true, strokeColor:'#111111', size:140, rot:0, x:null, y:null},
  logo:null, strokes:[], exportOutline:false, name:'', nameTouched:false});
let doc = defaultDoc();
const ui = {showOutline:true, tool:'move', tab:'text'};
const hist = [], redoSt = [];
let editing = false;

const model = () => WS.model(doc.model);
const style = () => WS.style(doc.style);
const params = () => Object.assign(WS.defaultParams(style()), doc.params[doc.style] || {});
const autoName = () => { const p = WS.palette(doc.palette); return WS.cleanName(`${style().name} ${p ? p.name : 'Personale'}`); };
const fileName = () => WS.cleanName(doc.nameTouched ? doc.name : autoName());

function snapshot(){ return JSON.stringify(doc); }
function pushHist(){ hist.push(snapshot()); if (hist.length > 150) hist.shift(); redoSt.length = 0; updUndo(); }
/* una modifica: salva lo stato precedente per Annulla, poi aggiorna tutto */
function edit(fn, opts){ if (!(opts && opts.continuous && editing)) pushHist(); if (opts && opts.continuous) editing = true; fn(); changed(opts); }
function endEdit(){ editing = false; }
function undo(){ if (!hist.length) return; redoSt.push(snapshot()); doc = JSON.parse(hist.pop()); afterRestore(); }
function redo(){ if (!redoSt.length) return; hist.push(snapshot()); doc = JSON.parse(redoSt.pop()); afterRestore(); }
function updUndo(){ $('#undoBtn').disabled = !hist.length; $('#redoBtn').disabled = !redoSt.length; }
async function afterRestore(){ updUndo(); await ensureTemplate(); syncControls(); changed({styles:true}); }

/* ---------- template ufficiali ---------- */
const tplCache = new Map();
let tpl = null, tplLoading = null;
async function loadTemplate(id){
  if (tplCache.has(id)) return tplCache.get(id);
  const m = WS.model(id), key = WS.TEMPLATE_SHA + '/' + id;
  let blob = await store.get('templates', key);
  if (!(blob instanceof Blob)) {
    const r = await fetch(WS.templateUrl(id), {mode:'cors', credentials:'omit'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    blob = await r.blob();
    store.put('templates', key, blob);
  }
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(bmp, 0, 0);
  /* il contorno: i pixel scuri e opachi del template */
  const d = g.getImageData(0, 0, W, H), o = new ImageData(W, H);
  for (let i = 0; i < d.data.length; i += 4) {
    const a = d.data[i + 3], lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    if (a > 0 && lum < 110) { o.data[i] = d.data[i]; o.data[i + 1] = d.data[i + 1]; o.data[i + 2] = d.data[i + 2]; o.data[i + 3] = a; }
  }
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H; oc.getContext('2d').putImageData(o, 0, 0);
  const t = {id, W, H, img:c, outline:oc, model:m};
  tplCache.set(id, t);
  return t;
}
async function ensureTemplate(){
  if (tpl && tpl.id === doc.model) return tpl;
  const id = doc.model;
  showLoading('Scarico il template ufficiale da Tesla…');
  try {
    tplLoading = loadTemplate(id); const t = await tplLoading;
    if (doc.model !== id) return tpl;
    tpl = t; hideLoading(); sizeCanvas(); return tpl;
  } catch (e) {
    showLoading('Non riesco a scaricare il template da GitHub. Controlla la connessione.', true);
    throw e;
  }
}
function showLoading(msg, retry){
  const el = $('#loading'); el.hidden = false; $('#loadingText').textContent = msg;
  el.querySelector('.spinner').hidden = !!retry;
  let b = el.querySelector('button');
  if (retry && !b) { b = document.createElement('button'); b.className = 'btn primary'; b.type = 'button'; b.textContent = 'Riprova'; b.onclick = () => ensureTemplate().then(() => changed({styles:true})).catch(() => {}); el.appendChild(b); }
  if (!retry && b) b.remove();
}
function hideLoading(){ $('#loading').hidden = true; }

/* ---------- disegno ---------- */
let logoImg = null;
const fontsReady = new Set();
function needFont(f){
  if (fontsReady.has(f)) return;
  fontsReady.add(f);
  if (document.fonts && document.fonts.load) document.fonts.load(`80px "${f}"`).then(() => changed({styles:false, quiet:true})).catch(() => {});
}
function colorsOf(d){ const st = WS.style(d.style); return d.colors.slice(0, Math.max(st.colors, 1)).concat(d.colors).slice(0, 4); }

/* livello base (stile) in cache, così trascinare testo o pennello resta fluido */
let baseCache = {key:'', canvas:null};
function baseLayer(d, t, cw, ch){
  const key = JSON.stringify([d.model, d.style, d.colors, d.params[d.style] || {}, d.seed, cw, ch]);
  if (baseCache.key === key && baseCache.canvas) return baseCache.canvas;
  const c = baseCache.canvas && baseCache.canvas.width === cw && baseCache.canvas.height === ch ? baseCache.canvas : document.createElement('canvas');
  c.width = cw; c.height = ch;
  drawStyle(c.getContext('2d'), d, t, cw / t.W);
  baseCache = {key, canvas:c};
  return c;
}
function drawStyle(g, d, t, s){
  const st = WS.style(d.style);
  g.save(); g.setTransform(s, 0, 0, s, 0, 0);
  st.draw(g, t.W, t.H, WS.rng(d.seed), colorsOf(d), Object.assign(WS.defaultParams(st), d.params[d.style] || {}), t.model);
  g.restore();
}
function drawLogo(g, d, t, s){
  const L = d.logo; if (!L || !logoImg) return;
  const w = L.size, h = w * logoImg.height / logoImg.width;
  g.save(); g.setTransform(s, 0, 0, s, 0, 0); g.globalAlpha = L.opacity;
  if (L.repeat) {
    const sx = w * 1.25, sy = h * 1.25, ox = ((L.x % sx) + sx) % sx, oy = ((L.y % sy) + sy) % sy;
    for (let y = oy - sy; y < t.H + sy; y += sy) for (let x = ox - sx; x < t.W + sx; x += sx) g.drawImage(logoImg, x - w / 2, y - h / 2, w, h);
  } else g.drawImage(logoImg, L.x - w / 2, L.y - h / 2, w, h);
  g.restore();
}
let paintCanvas = null;
function drawPaint(g, d, t, s, cw, ch){
  if (!d.strokes.length) return;
  if (!paintCanvas) paintCanvas = document.createElement('canvas');
  paintCanvas.width = cw; paintCanvas.height = ch;
  const p = paintCanvas.getContext('2d');
  p.setTransform(s, 0, 0, s, 0, 0); p.lineCap = 'round'; p.lineJoin = 'round';
  for (const k of d.strokes) {
    p.globalCompositeOperation = k.mode === 'erase' ? 'destination-out' : 'source-over';
    p.strokeStyle = k.color; p.fillStyle = k.color; p.lineWidth = k.size;
    if (k.pts.length === 1) { p.beginPath(); p.arc(k.pts[0][0], k.pts[0][1], k.size / 2, 0, Math.PI * 2); p.fill(); continue; }
    p.beginPath(); p.moveTo(k.pts[0][0], k.pts[0][1]); for (let i = 1; i < k.pts.length; i++) p.lineTo(k.pts[i][0], k.pts[i][1]); p.stroke();
  }
  g.drawImage(paintCanvas, 0, 0);
}
function textPos(d, t){ return {x:d.text.x ?? t.W / 2, y:d.text.y ?? t.H / 2}; }
function drawText(g, d, t, s){
  const T = d.text; if (!T.value.trim()) return;
  needFont(T.font);
  const {x, y} = textPos(d, t);
  g.save(); g.setTransform(s, 0, 0, s, 0, 0); g.translate(x, y); g.rotate(T.rot * Math.PI / 180);
  g.font = `${T.size}px "${T.font}", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (T.stroke) { g.lineJoin = 'round'; g.lineWidth = Math.max(2, T.size * 0.09); g.strokeStyle = T.strokeColor; g.strokeText(T.value, 0, 0); }
  g.fillStyle = T.color; g.fillText(T.value, 0, 0);
  g.restore();
}
/* compone tutto su un canvas cw x ch e ritaglia sulla forma dei pannelli */
function compose(g, d, t, cw, ch, outline, useCache){
  const s = cw / t.W;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch); g.globalCompositeOperation = 'source-over';
  if (useCache) g.drawImage(baseLayer(d, t, cw, ch), 0, 0); else drawStyle(g, d, t, s);
  drawLogo(g, d, t, s); drawPaint(g, d, t, s, cw, ch); drawText(g, d, t, s);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(t.img, 0, 0, cw, ch);
  g.globalCompositeOperation = 'source-over';
  if (outline) g.drawImage(t.outline, 0, 0, cw, ch);
  g.restore();
}

/* ---------- anteprima ---------- */
const cv = $('#preview'), cx = cv.getContext('2d');
let drawReq = false;
function sizeCanvas(){
  if (!tpl) return;
  const s = Math.min(1, 720 / Math.max(tpl.W, tpl.H)), w = Math.round(tpl.W * s), h = Math.round(tpl.H * s);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  $('#canvasBox').classList.toggle('wide', tpl.W > tpl.H);
  fitCanvas();
}
function fitCanvas(){
  if (!tpl) return;
  const box = $('#canvasBox'), cs = getComputedStyle(box);
  const bw = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), bh = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.min(bw / tpl.W, bh / tpl.H);
  cv.style.width = Math.floor(tpl.W * k) + 'px'; cv.style.height = Math.floor(tpl.H * k) + 'px';
}
new ResizeObserver(fitCanvas).observe($('#canvasBox'));
function requestDraw(){ if (drawReq) return; drawReq = true; requestAnimationFrame(() => { drawReq = false; if (tpl) compose(cx, doc, tpl, cv.width, cv.height, ui.showOutline, true); }); }

/* miniature degli stili, disegnate una alla volta per non bloccare la pagina */
let thumbJob = 0;
function renderStyleThumbs(){
  const job = ++thumbJob, t = tpl; if (!t) return;
  const btns = $$('#styleGrid .style-btn');
  let i = 0;
  const step = () => {
    if (job !== thumbJob || i >= btns.length) return;
    const b = btns[i++], c = b.querySelector('canvas'), st = WS.style(b.dataset.style);
    const w = 160, h = Math.round(160 * t.H / t.W); c.width = w; c.height = h;
    const d = Object.assign({}, doc, {style:st.id, text:Object.assign({}, doc.text, {value:''}), logo:null, strokes:[]});
    compose(c.getContext('2d'), d, t, w, h, false, false);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- export PNG con controllo del peso ---------- */
function posterize(c, levels){
  const g = c.getContext('2d', {willReadFrequently:true}), d = g.getImageData(0, 0, c.width, c.height), a = d.data, k = 255 / (levels - 1);
  for (let i = 0; i < a.length; i += 4) { if (!a[i + 3]) { a[i] = a[i + 1] = a[i + 2] = 0; continue; } a[i] = Math.round(Math.round(a[i] / k) * k); a[i + 1] = Math.round(Math.round(a[i + 1] / k) * k); a[i + 2] = Math.round(Math.round(a[i + 2] / k) * k); }
  g.putImageData(d, 0, 0);
}
function clearHidden(c){
  /* dove l'alpha è 0 azzera anche il colore: il PNG pesa meno */
  const g = c.getContext('2d', {willReadFrequently:true}), d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) if (!a[i + 3]) a[i] = a[i + 1] = a[i + 2] = 0;
  g.putImageData(d, 0, 0);
}
const toBlob = c => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('PNG non generato')), 'image/png'));
async function exportPng(d){
  const t = await loadTemplate(d.model);
  const minS = 512 / Math.min(t.W, t.H);
  const scales = [1, 0.875, 0.75, 0.625, 0.5].filter(s => s > minS + 1e-6).concat([minS]);
  const c = document.createElement('canvas');
  let last = null;
  for (const s of scales) {
    c.width = Math.round(t.W * s); c.height = Math.round(t.H * s);
    compose(c.getContext('2d'), d, t, c.width, c.height, d.exportOutline, false); clearHidden(c);
    const b = await toBlob(c); last = {blob:b, w:c.width, h:c.height, scaled:s < 1, levels:0};
    if (b.size <= WS.MAX_BYTES) return last;
  }
  for (const lv of [32, 16, 8, 6, 4]) {
    compose(c.getContext('2d'), d, t, c.width, c.height, d.exportOutline, false); posterize(c, lv);
    const b = await toBlob(c); last = {blob:b, w:c.width, h:c.height, scaled:true, levels:lv};
    if (b.size <= WS.MAX_BYTES) return last;
  }
  last.tooBig = true; return last;
}
let expCache = {key:'', res:null, p:null};
function expKey(){ return JSON.stringify([doc.model, doc.style, doc.colors, doc.params[doc.style] || {}, doc.seed, doc.text, doc.logo, doc.strokes, doc.exportOutline, !!logoImg]); }
function currentExport(){
  const key = expKey();
  if (expCache.key === key && expCache.p) return expCache.p;
  const d = JSON.parse(JSON.stringify(doc));
  const p = exportPng(d).then(r => { if (expCache.key === key) expCache.res = r; return r; });
  expCache = {key, res:null, p};
  return p;
}
let wT = 0;
function scheduleWeight(){
  clearTimeout(wT); $('#weightTxt').textContent = 'Calcolo il peso…';
  wT = setTimeout(async () => { try { showWeight(await currentExport()); } catch (e) { $('#weightTxt').textContent = 'Peso non disponibile'; } }, 450);
}
const kb = n => n < 1000000 ? Math.round(n / 1000) + ' KB' : (n / 1000000).toFixed(2).replace('.', ',') + ' MB';
function showWeight(r){
  if (!r) return;
  const pct = Math.min(100, r.blob.size / WS.MAX_BYTES * 100), bar = $('#weightBar');
  bar.style.width = pct + '%'; bar.classList.toggle('high', pct > 85);
  $('#weightTxt').textContent = `${kb(r.blob.size)} su 1 MB · ${r.w}x${r.h}`;
  const m = $('#fitMsg');
  if (r.tooBig) { m.hidden = false; m.textContent = 'Anche riducendo dimensioni e colori il file supera 1 MB: questo disegno ha troppi dettagli fini. Prova uno stile più semplice, un motivo più grande o meno pennellate.'; }
  else if (r.levels) { m.hidden = false; m.textContent = `Per stare sotto 1 MB ho ridotto il file a ${r.w}x${r.h} pixel e i colori a ${r.levels} livelli per canale.`; }
  else if (r.scaled) { m.hidden = false; m.textContent = `Per stare sotto 1 MB ho ridotto il file a ${r.w}x${r.h} pixel (Tesla accetta da 512 pixel in su).`; }
  else m.hidden = true;
}
function download(blob, name){
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
async function downloadPng(){
  const btns = [$('#dlBtn'), $('#dlQuick')]; btns.forEach(b => b.disabled = true);
  try { const r = await currentExport(); showWeight(r); if (r.tooBig) { toast('Il file supera 1 MB: l\'auto non lo accetterebbe. Semplifica il disegno e riprova.', 5000); return; } download(r.blob, fileName() + '.png'); toast(`Scaricata ${fileName()}.png (${kb(r.blob.size)})`); }
  catch (e) { toast('Non sono riuscito a creare il PNG: ' + (e.message || e)); }
  finally { btns.forEach(b => b.disabled = false); }
}

/* ---------- raccolta ---------- */
let collection = [];
const colUrls = [];
async function loadCollection(){ const rows = await store.all('collection'); collection = rows.map(([, v]) => v).filter(v => v && v.blob).sort((a, b) => a.created - b.created); renderCollection(); }
function uniqueName(base, taken){ let n = base, k = 2; while (taken.has(n.toLowerCase())) { const suf = '_' + k++; n = base.slice(0, WS.MAX_BASE - suf.length) + suf; } return n; }
async function addToCollection(){
  if (collection.length >= WS.MAX_COLLECTION) { toast('La raccolta è piena: l\'auto ne legge al massimo 10. Togline una per aggiungerne un\'altra.', 4500); return; }
  const r = await currentExport();
  if (r.tooBig) { toast('Il file supera 1 MB: semplifica il disegno prima di aggiungerlo.', 4500); return; }
  const name = uniqueName(fileName(), new Set(collection.map(c => c.name.toLowerCase())));
  const item = {id:'w' + Date.now().toString(36), name, blob:r.blob, w:r.w, h:r.h, size:r.blob.size, created:Date.now()};
  collection.push(item); await store.put('collection', item.id, item); renderCollection();
  toast(`Aggiunta "${name}" alla raccolta (${collection.length} di 10).` + (store.persistent ? '' : ' Questo browser non permette di salvarla: ricaricando la pagina si perde.'), 3500);
}
function renderCollection(){
  colUrls.splice(0).forEach(u => URL.revokeObjectURL(u));
  const box = $('#collection'); box.hidden = !collection.length;
  $('#colCount').textContent = `${collection.length} di ${WS.MAX_COLLECTION}`;
  $('#addBtn').disabled = collection.length >= WS.MAX_COLLECTION;
  const ul = $('#colList'); ul.textContent = '';
  for (const it of collection) {
    const li = document.createElement('li'), img = document.createElement('img'), u = URL.createObjectURL(it.blob); colUrls.push(u);
    img.src = u; img.alt = ''; const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = it.name + '.png';
    const k = document.createElement('span'); k.className = 'kb'; k.textContent = kb(it.size);
    const del = document.createElement('button'); del.type = 'button'; del.textContent = '✕'; del.setAttribute('aria-label', 'Togli ' + it.name + ' dalla raccolta');
    del.onclick = async () => { collection = collection.filter(c => c.id !== it.id); await store.del('collection', it.id); renderCollection(); };
    li.append(img, nm, k, del); ul.appendChild(li);
  }
}
async function downloadZip(){
  if (!collection.length) return;
  if (typeof JSZip === 'undefined') { toast('Modulo ZIP non disponibile.'); return; }
  const zip = new JSZip(), dir = zip.folder('Wraps');
  for (const it of collection.slice(0, WS.MAX_COLLECTION)) dir.file(it.name + '.png', it.blob);
  const blob = await zip.generateAsync({type:'blob', compression:'STORE'});
  download(blob, 'Wraps.zip'); toast(`Scaricato Wraps.zip con ${collection.length} wrap: estrai la cartella Wraps nella radice della chiavetta.`, 4500);
}

/* ---------- interfaccia: auto ---------- */
function buildCarDialog(){
  const grid = $('#carGrid'); grid.textContent = '';
  for (const m of WS.MODELS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'car-card'; b.dataset.model = m.id;
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.src = WS.templateUrl(m.id); img.crossOrigin = 'anonymous';
    const n = document.createElement('b'); n.textContent = m.name;
    const s = document.createElement('span'); s.className = 'sub'; s.textContent = m.sub || ' ';
    const h = document.createElement('small'); h.textContent = m.help;
    b.append(img, n, s, h);
    b.onclick = () => { $('#carDialog').close(); if (m.id !== doc.model) selectModel(m.id); };
    grid.appendChild(b);
  }
}
async function selectModel(id){
  edit(() => { doc.model = id; const T = doc.text; T.x = T.y = null; if (doc.logo) { doc.logo.x = null; } });
  try { await ensureTemplate(); placeDefaults(); changed({styles:true}); } catch (e) {}
}
function placeDefaults(){ if (doc.logo && doc.logo.x == null && tpl) { doc.logo.x = tpl.W / 2; doc.logo.y = tpl.H / 2; } }
function syncCar(){
  const m = model(); $('#carName').textContent = m.name; $('#carSub').textContent = m.sub; $('#carThumb').src = WS.templateUrl(m.id);
  $$('.car-card').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.model === m.id)));
}

/* ---------- interfaccia: stili, colori, cursori ---------- */
function buildStyles(){
  const grid = $('#styleGrid'); grid.textContent = '';
  for (const st of WS.STYLES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'style-btn'; b.dataset.style = st.id; b.setAttribute('role', 'listitem');
    const c = document.createElement('canvas'); c.width = 160; c.height = 160;
    const l = document.createElement('span'); l.textContent = st.name;
    b.append(c, l); b.onclick = () => { if (doc.style !== st.id) edit(() => { doc.style = st.id; }); };
    grid.appendChild(b);
  }
}
function buildPalettes(){
  const box = $('#palettes'); box.textContent = '';
  for (const p of WS.PALETTES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pal-btn'; b.dataset.pal = p.id; b.setAttribute('role', 'listitem');
    const sw = document.createElement('span'); sw.className = 'sw';
    for (const c of p.c) { const i = document.createElement('i'); i.style.background = c; sw.appendChild(i); }
    const l = document.createElement('span'); l.textContent = p.name;
    b.append(sw, l); b.onclick = () => edit(() => { doc.palette = p.id; doc.colors = p.c.slice(); });
    box.appendChild(b);
  }
}
const COLOR_LABEL = ['Colore di fondo', 'Secondo colore', 'Terzo colore', 'Quarto colore'];
function syncPickers(){
  const st = style(), box = $('#pickers'); box.textContent = '';
  const n = Math.max(1, st.colors);
  for (let i = 0; i < n; i++) {
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = doc.colors[i]; inp.setAttribute('aria-label', COLOR_LABEL[i]); inp.title = COLOR_LABEL[i];
    inp.oninput = () => edit(() => { doc.colors[i] = inp.value; doc.palette = 'custom'; }, {continuous:true, noPickers:true});
    inp.onchange = endEdit;
    box.appendChild(inp);
  }
}
function syncSliders(){
  const st = style(), P = params(), box = $('#sliders'); box.textContent = '';
  for (const s of st.sliders) {
    const lab = document.createElement('label'); lab.className = 'field';
    const sp = document.createElement('span'); sp.textContent = s.label + ' ';
    const out = document.createElement('output'); out.textContent = P[s.key] + s.unit; sp.appendChild(out);
    const r = document.createElement('input'); r.type = 'range'; r.min = s.min; r.max = s.max; r.step = s.step; r.value = P[s.key];
    r.oninput = () => { out.textContent = r.value + s.unit; edit(() => { doc.params[doc.style] = Object.assign({}, doc.params[doc.style], {[s.key]:+r.value}); }, {continuous:true, noSliders:true}); };
    r.onchange = endEdit;
    lab.append(sp, r); box.appendChild(lab);
  }
}
function syncSelection(){
  $$('.style-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === doc.style)));
  $$('.pal-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pal === doc.palette)));
}
function syncText(){
  const T = doc.text;
  $('#txtValue').value = T.value; $('#txtFont').value = T.font; $('#txtColor').value = T.color; $('#txtStroke').checked = T.stroke; $('#txtStrokeColor').value = T.strokeColor;
  $('#txtSize').value = T.size; $('#txtSizeOut').textContent = T.size + ' px'; $('#txtRot').value = T.rot; $('#txtRotOut').textContent = T.rot + '°';
}
function syncLogo(){
  const L = doc.logo; $('#logoCtrls').hidden = !L || !logoImg;
  if (L) { $('#logoSize').value = L.size; $('#logoSizeOut').textContent = Math.round(L.size) + ' px'; $('#logoOp').value = Math.round(L.opacity * 100); $('#logoOpOut').textContent = Math.round(L.opacity * 100) + '%'; $('#logoRepeat').checked = L.repeat; }
}
function syncName(){ if (document.activeElement !== $('#nameIn')) $('#nameIn').value = doc.nameTouched ? doc.name : autoName(); $('#nameHint').textContent = `Verrà salvato come: ${fileName()}.png`; }
function syncControls(){ syncCar(); syncSelection(); syncPickers(); syncSliders(); syncText(); syncLogo(); syncName(); $('#exportOutline').checked = doc.exportOutline; }

/* ogni modifica passa da qui */
let persistT = 0;
function changed(opts){
  opts = opts || {};
  if (!opts.quiet) {
    syncSelection(); if (!opts.noPickers) syncPickers(); if (!opts.noSliders) syncSliders(); syncName(); syncCar();
    clearTimeout(persistT); persistT = setTimeout(() => store.put('kv', 'project', doc), 400);
  }
  requestDraw(); scheduleWeight();
  const thumbsKey = JSON.stringify([doc.model, doc.colors, doc.seed]);
  if (opts.styles || thumbsKey !== changed.tk) { changed.tk = thumbsKey; clearTimeout(changed.tt); changed.tt = setTimeout(renderStyleThumbs, opts.continuous ? 300 : 30); }
}

/* ---------- Variante e Sorprendimi ---------- */
function variant(){
  const st = style();
  if (st.variants) edit(() => { doc.seed = (Math.random() * 2 ** 31) | 0; });
  else edit(() => { const n = Math.max(2, st.colors); const c = doc.colors.slice(0, n); c.push(c.shift()); doc.colors = c.concat(doc.colors.slice(n)); doc.palette = 'custom'; });
  if (!st.variants) toast('Questo stile non è casuale: ho scambiato l\'ordine dei colori.');
}
function surprise(){
  const others = WS.STYLES.filter(s => s.id !== doc.style), st = others[Math.floor(Math.random() * others.length)];
  const pals = WS.PALETTES.filter(p => p.id !== doc.palette), p = pals[Math.floor(Math.random() * pals.length)];
  edit(() => {
    doc.style = st.id; doc.palette = p.id; doc.colors = p.c.slice(); doc.seed = (Math.random() * 2 ** 31) | 0;
    const pr = {}; for (const s of st.sliders) { const span = s.max - s.min; pr[s.key] = Math.round((s.min + span * (0.2 + Math.random() * 0.6)) / s.step) * s.step; }
    doc.params[st.id] = pr;
  });
}

/* ---------- trascinamento e pennello sull'anteprima ---------- */
function toTpl(e){ const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * tpl.W, (e.clientY - r.top) / r.height * tpl.H]; }
function hitText(x, y){
  const T = doc.text; if (!T.value.trim()) return false;
  const p = textPos(doc, tpl); cx.save(); cx.font = `${T.size}px "${T.font}", sans-serif`; const w = cx.measureText(T.value).width; cx.restore();
  const a = -T.rot * Math.PI / 180, dx = x - p.x, dy = y - p.y, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) < w / 2 + 16 && Math.abs(ly) < T.size * 0.45 + 16;
}
function hitLogo(x, y){ const L = doc.logo; if (!L || !logoImg) return false; if (L.repeat) return true; const w = L.size, h = w * logoImg.height / logoImg.width; return Math.abs(x - L.x) < w / 2 && Math.abs(y - L.y) < h / 2; }
let drag = null;
cv.addEventListener('pointerdown', e => {
  if (!tpl || e.button > 0) return;
  const [x, y] = toTpl(e);
  if (ui.tool === 'brush' || ui.tool === 'eraser') {
    pushHist(); doc.strokes.push({mode:ui.tool === 'eraser' ? 'erase' : 'paint', color:$('#brushColor').value, size:+$('#brushSize').value, pts:[[Math.round(x), Math.round(y)]]});
    drag = {kind:'stroke'}; cv.setPointerCapture(e.pointerId); requestDraw(); return;
  }
  if (hitText(x, y)) { const p = textPos(doc, tpl); pushHist(); drag = {kind:'text', ox:p.x - x, oy:p.y - y}; }
  else if (hitLogo(x, y)) { pushHist(); drag = {kind:'logo', ox:doc.logo.x - x, oy:doc.logo.y - y}; }
  if (drag) { cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; }
});
cv.addEventListener('pointermove', e => {
  if (!tpl) return;
  const [x, y] = toTpl(e);
  if (!drag) { if (ui.tool === 'move') cv.style.cursor = hitText(x, y) || hitLogo(x, y) ? 'grab' : 'default'; return; }
  if (drag.kind === 'stroke') { const k = doc.strokes[doc.strokes.length - 1], l = k.pts[k.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 2) k.pts.push([Math.round(x), Math.round(y)]); }
  else if (drag.kind === 'text') { doc.text.x = Math.round(x + drag.ox); doc.text.y = Math.round(y + drag.oy); }
  else if (drag.kind === 'logo') { doc.logo.x = Math.round(x + drag.ox); doc.logo.y = Math.round(y + drag.oy); }
  requestDraw();
});
const endDrag = () => { if (!drag) return; drag = null; cv.style.cursor = ''; changed({quiet:false}); };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

/* ---------- pannello Personalizza ---------- */
function setTool(t){ ui.tool = t; $$('.seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t))); cv.className = 'tool-' + t; }
function showTab(t){
  ui.tab = t; $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  for (const p of ['text', 'logo', 'draw']) $('#pane-' + p).hidden = p !== t;
  if (t !== 'draw') setTool('move');
}
$('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
$$('.seg-btn').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('#perso').addEventListener('toggle', () => { if (!$('#perso').open) setTool('move'); });
const textEdit = (fn, cont) => edit(fn, cont ? {continuous:true} : undefined);
$('#txtValue').oninput = e => textEdit(() => { doc.text.value = e.target.value; }, true);
$('#txtValue').onchange = endEdit;
$('#txtFont').onchange = e => textEdit(() => { doc.text.font = e.target.value; });
$('#txtColor').oninput = e => textEdit(() => { doc.text.color = e.target.value; }, true);
$('#txtStroke').onchange = e => textEdit(() => { doc.text.stroke = e.target.checked; });
$('#txtStrokeColor').oninput = e => textEdit(() => { doc.text.strokeColor = e.target.value; }, true);
$('#txtSize').oninput = e => { $('#txtSizeOut').textContent = e.target.value + ' px'; textEdit(() => { doc.text.size = +e.target.value; }, true); };
$('#txtRot').oninput = e => { $('#txtRotOut').textContent = e.target.value + '°'; textEdit(() => { doc.text.rot = +e.target.value; }, true); };
for (const id of ['#txtColor', '#txtStrokeColor', '#txtSize', '#txtRot']) $(id).addEventListener('change', endEdit);
$('#txtRemove').onclick = () => { textEdit(() => { doc.text.value = ''; }); syncText(); };

$('#logoIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const bmp = await imageFrom(f);
    logoImg = bmp; await store.put('kv', 'logo', f);
    edit(() => { const w = Math.min(tpl.W * 0.35, 360); doc.logo = {x:tpl.W / 2, y:tpl.H / 2, size:w, opacity:1, repeat:false}; });
    syncLogo(); toast('Immagine aggiunta: trascinala sull\'anteprima per spostarla.');
  } catch (err) { toast('Non riesco a leggere questa immagine. Prova con un PNG o un JPG.'); }
};
async function imageFrom(blob){
  try { return await createImageBitmap(blob); }
  catch (e) { // SVG e alcuni formati: passa da un elemento <img>
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth || 512; c.height = img.naturalHeight || 512; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; }
    finally { URL.revokeObjectURL(url); }
  }
}
$('#logoSize').oninput = e => { $('#logoSizeOut').textContent = e.target.value + ' px'; edit(() => { doc.logo.size = +e.target.value; }, {continuous:true}); };
$('#logoOp').oninput = e => { $('#logoOpOut').textContent = e.target.value + '%'; edit(() => { doc.logo.opacity = +e.target.value / 100; }, {continuous:true}); };
$('#logoSize').addEventListener('change', endEdit); $('#logoOp').addEventListener('change', endEdit);
$('#logoRepeat').onchange = e => edit(() => { doc.logo.repeat = e.target.checked; });
$('#logoRemove').onclick = () => { edit(() => { doc.logo = null; }); syncLogo(); };
$('#brushSize').oninput = e => { $('#brushSizeOut').textContent = e.target.value + ' px'; };
$('#drawClear').onclick = () => { if (doc.strokes.length) edit(() => { doc.strokes = []; }); };

/* ---------- altri controlli ---------- */
$('#carBtn').onclick = () => { $('#carDialog').showModal(); };
$('#carClose').onclick = () => $('#carDialog').close();
$('#carDialog').addEventListener('click', e => { if (e.target === $('#carDialog')) $('#carDialog').close(); });
$('#variantBtn').onclick = variant; $('#surpriseBtn').onclick = surprise;
$('#outlineChk').onchange = e => { ui.showOutline = e.target.checked; requestDraw(); };
$('#exportOutline').onchange = e => edit(() => { doc.exportOutline = e.target.checked; });
$('#nameIn').oninput = e => { doc.nameTouched = true; doc.name = e.target.value; syncName(); clearTimeout(persistT); persistT = setTimeout(() => store.put('kv', 'project', doc), 400); };
$('#nameIn').onblur = () => { if (!$('#nameIn').value.trim()) { doc.nameTouched = false; doc.name = ''; } else doc.name = fileName(); syncName(); $('#nameIn').value = doc.nameTouched ? doc.name : autoName(); };
$('#dlBtn').onclick = downloadPng; $('#dlQuick').onclick = downloadPng;
$('#addBtn').onclick = addToCollection; $('#zipBtn').onclick = downloadZip;
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input[type=text],textarea,select')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
});
function toast(msg, ms){ const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 2600); }

/* ---------- avvio ---------- */
function validDoc(d){
  if (!d || typeof d !== 'object' || d.v !== 1) return null;
  const base = defaultDoc(), out = Object.assign(base, d);
  if (!WS.MODELS.some(m => m.id === out.model)) out.model = base.model;
  if (!WS.STYLES.some(s => s.id === out.style)) out.style = base.style;
  if (!Array.isArray(out.colors) || out.colors.length < 4) out.colors = base.colors;
  out.text = Object.assign(base.text, d.text || {}); out.strokes = Array.isArray(d.strokes) ? d.strokes : [];
  return out;
}
async function boot(){
  buildStyles(); buildPalettes(); buildCarDialog();
  await store.ready();
  const saved = validDoc(await store.get('kv', 'project'));
  if (saved) doc = saved;
  if (doc.logo) { const f = await store.get('kv', 'logo'); if (f instanceof Blob) { try { logoImg = await imageFrom(f); } catch (e) { doc.logo = null; } } else doc.logo = null; }
  syncControls(); setTool('move'); $('#brushSizeOut').textContent = $('#brushSize').value + ' px';
  loadCollection();
  try { await ensureTemplate(); placeDefaults(); changed({styles:true}); }
  catch (e) { /* il messaggio con Riprova è già visibile */ }
  if (!store.persistent) toast('Questo browser non permette di salvare i dati: progetto e raccolta durano finché la pagina resta aperta.', 5000);
}
boot();
})();
