(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const STORE = 'satelliti:v1';
const EXAMPLE = {nome:'Milano', lat:45.4642, lon:9.19, tipo:'esempio'};
/* satelliti per cui chiediamo i passaggi visibili: pochi, per tenere basse le chiamate */
const PASS_SATS = [{id:25544, name:'Stazione Spaziale Internazionale (ISS)'}, {id:48274, name:'Stazione spaziale cinese Tiangong'}, {id:27386, name:'Envisat'}];
const CATS = [
  {id:'stazioni', name:'Stazioni spaziali', on:true}, {id:'starlink', name:'Starlink', on:true}, {id:'meteo', name:'Meteo', on:true},
  {id:'osservazione', name:'Osservazione della Terra', on:true}, {id:'navigazione', name:'Navigazione (GPS, Galileo)', on:true}, {id:'scienza', name:'Scientifici', on:true},
  {id:'altri', name:'Altri satelliti', on:true}, {id:'razzi', name:'Stadi di razzo', on:false}, {id:'detriti', name:'Detriti', on:false}
];
const CAT_WHAT = {
  starlink:'Satellite per l\'accesso a Internet di SpaceX, parte di una costellazione di migliaia.',
  meteo:'Satellite meteorologico: osserva nuvole, temperature e tempeste.',
  osservazione:'Osserva la superficie della Terra: mappe, agricoltura, ambiente, emergenze.',
  navigazione:'Satellite di navigazione: manda i segnali che usano i navigatori.',
  scienza:'Satellite scientifico: studia lo spazio, il Sole o la Terra.',
  altri:'Satellite per telecomunicazioni, ricerca o altri servizi.',
  razzi:'Stadio di razzo rimasto in orbita dopo un lancio: spesso grande e luminoso.',
  detriti:'Frammento in orbita, resto di un vecchio satellite o di un razzo.',
  stazioni:'Stazione spaziale abitata.'
};
function whatIs(id, name, cat){
  if (id === 25544) return 'Stazione Spaziale Internazionale: un laboratorio abitato da astronauti di più paesi, grande come un campo da calcio.';
  if (id === 48274) return 'Tiangong, la stazione spaziale cinese, abitata da tre astronauti.';
  if (id === 27386) return 'Envisat: grande satellite europeo per l\'ambiente, spento dal 2012 ma ancora in orbita e luminoso.';
  const n = name.toUpperCase();
  if (/^HST$|HUBBLE/.test(n)) return 'Telescopio spaziale Hubble: fotografa galassie e nebulose dal 1990.';
  if (/NAVSTAR|\bGPS\b/.test(n)) return 'Satellite GPS degli Stati Uniti: dà la posizione ai navigatori di tutto il mondo.';
  if (/GALILEO|GSAT0/.test(n)) return 'Satellite Galileo, il sistema di navigazione europeo.';
  if (/GLONASS/.test(n)) return 'Satellite GLONASS, il sistema di navigazione russo.';
  if (/BEIDOU/.test(n)) return 'Satellite BeiDou, il sistema di navigazione cinese.';
  if (/NOAA|METOP|METEOSAT|GOES|HIMAWARI/.test(n)) return 'Satellite meteorologico: le sue immagini finiscono nelle previsioni del tempo.';
  if (/SENTINEL/.test(n)) return 'Satellite Sentinel del programma europeo Copernicus: osserva terre, mari e atmosfera.';
  return CAT_WHAT[cat] || '';
}
const prettyName = (id, n) => id === 25544 ? 'Stazione Spaziale Internazionale (ISS)' : id === 48274 ? 'Stazione spaziale cinese Tiangong' : n;

/* ---------- impostazioni nel browser ---------- */
let prefs = {place:EXAMPLE, theme:'scuro'};
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.place && isFinite(s.place.lat) && isFinite(s.place.lon)) prefs = Object.assign(prefs, s); } catch (e) {}
const savePrefs = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) {} };
const r1 = x => (Math.round(x * 10) / 10).toFixed(1);   // posizione arrotondata (circa 10 km): l'unica che lascia il browser

/* ---------- formati ---------- */
const DIRS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ovest', 'Ovest', 'Nord-Ovest'];
const DIRS_S = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const dir = az => DIRS[Math.round(((az % 360) + 360) % 360 / 45) % 8];
const hm = t => new Date(t).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
const hms = t => new Date(t).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
function dayWord(t){
  const d = new Date(t), n = new Date(), k = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((k(d) - k(n)) / 86400000);
  return diff === 0 ? 'oggi' : diff === 1 ? 'domani' : diff === 2 ? 'dopodomani' : d.toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function height(el){ return el >= 80 ? 'proprio sopra la testa' : el >= 60 ? 'alto nel cielo' : el >= 40 ? 'fino a metà cielo' : el >= 25 ? 'a un quarto del cielo' : 'basso sull\'orizzonte'; }
function brightness(m){
  if (m == null || m >= 100000) return '';
  return m <= -2.5 ? 'Più luminoso di qualsiasi stella, impossibile non vederlo.' : m <= -1 ? 'Luminosissimo, come Giove.' : m <= 0.5 ? 'Luminoso come una stella brillante.' : m <= 2 ? 'Come una stella ben visibile.' : 'Come una stella debole: serve un cielo buio.';
}
function howTo(p){
  const atTop = p.max.t - p.start.t < 20000, up = p.max.el >= 80 ? 'passa proprio sopra la testa' : `sale ${height(p.max.el)} verso ${dir(p.max.az)}`;
  const start = p.startShadow ? `Si accende ${height(p.start.el)} a ${dir(p.start.az)} alle ${hm(p.start.t)}, uscendo dall'ombra della Terra` : `Compare a ${dir(p.start.az)} alle ${hm(p.start.t)}`;
  const end = p.endShadow ? `si spegne a ${dir(p.end.az)} alle ${hm(p.end.t)}, entrando nell'ombra della Terra` : `sparisce a ${dir(p.end.az)} alle ${hm(p.end.t)}`;
  return `${start}, ${atTop ? 'poi scende' : up}, ${end}. ${brightness(p.mag)}`.trim();
}
function countdown(ms){
  const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, x = s % 60;
  if (d) return `${d} g ${h} h ${String(m).padStart(2, '0')} min`;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
function toast(msg, ms){ const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 3000); }

/* ---------- tema ---------- */
const THEMES = ['scuro', 'rosso', 'chiaro'], THEME_NEXT = {scuro:'Rosso notte', rosso:'Chiaro', chiaro:'Scuro'};
function applyTheme(){ document.documentElement.dataset.theme = prefs.theme; $('#themeBtn').textContent = THEME_NEXT[prefs.theme]; readColors(); draw(); }
$('#themeBtn').onclick = () => { prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % 3]; savePrefs(); applyTheme(); };

/* ---------- stato ---------- */
let ids = [], names = [], cats = [], pos = new Float32Array(0), soloStazioni = false;
let passes = [], train = null, selected = null, shownPass = null, userShown = false;
const catOn = Object.fromEntries(CATS.map(c => [c.id, c.on]));
const meta = {sopra:null, passaggi:null};

/* ---------- worker dei calcoli ---------- */
const worker = new Worker('calcoli.js');
worker.onmessage = e => {
  const m = e.data;
  if (m.type === 'catalog') { ids = m.ids; names = m.names; cats = m.cats; soloStazioni = !!m.soloStazioni; pos = new Float32Array(0); if (!m.soloStazioni) $('#skyLoading').hidden = true; }
  else if (m.type === 'pos') { pos = m.pos; if (ids.length) $('#skyLoading').hidden = true; updateCounts(); draw(); }
  else if (m.type === 'meta') { meta[m.what] = m; showMeta(); if (!m.ok && !ids.length) $('#loadText').textContent = (m.errore || 'Il servizio dei satelliti non risponde.') + ' Riprovo tra 2 minuti.'; }
  else if (m.type === 'detail') { if (selected && selected.idx === m.idx) { Object.assign(selected, m); renderInfo(); draw(); } }
  else if (m.type === 'train') { train = m.train; renderTrain(); draw(); }
  else if (m.type === 'tracks') {
    for (const t of m.tracks) { const p = passes.find(x => x.key === t.key); if (!p) continue; p.track = t.track; if (t.start) Object.assign(p, {start:t.start, max:t.max, end:t.end, startShadow:t.startShadow, endShadow:t.endShadow, refined:true}); }
    passes.sort((a, b) => a.start.t - b.start.t); updateNext(); renderPasses(); draw();
  }
};
worker.onerror = e => toast('Errore nei calcoli: ' + (e.message || 'sconosciuto'), 6000);
document.addEventListener('visibilitychange', () => worker.postMessage({type:'visible', visible:!document.hidden}));

/* ---------- passaggi visibili (N2YO visualpasses, in cache un'ora per zona) ---------- */
let passJob = 0;
async function loadPasses(){
  const job = ++passJob, p = prefs.place, out = [];
  let okAny = false, last = null;
  for (const s of PASS_SATS) {
    try {
      const r = await fetch(`/api/satelliti/passaggi?id=${s.id}&lat=${r1(p.lat)}&lon=${r1(p.lon)}`);
      const b = await r.json().catch(() => null);
      last = {ok:r.ok, cache:r.headers.get('X-Satelliti-Cache'), at:r.headers.get('X-Satelliti-Aggiornato'), errore:b && b.errore};
      if (!r.ok || !b || !Array.isArray(b.passes)) continue;
      okAny = true;
      /* a occhio nudo: niente passaggi più deboli di magnitudine 4 (100000 = magnitudine sconosciuta) */
      for (const q of b.passes.filter(q => !(q.mag > 4 && q.mag < 100000))) out.push({id:s.id, name:s.name, key:`${s.id}-${q.startUTC}`, start:{t:q.startUTC * 1000, az:q.startAz, el:q.startEl}, max:{t:q.maxUTC * 1000, az:q.maxAz, el:q.maxEl}, end:{t:q.endUTC * 1000, az:q.endAz, el:q.endEl}, mag:q.mag, raw:Object.assign({id:s.id, key:`${s.id}-${q.startUTC}`}, q)});
    } catch (e) { last = {ok:false, errore:'Connessione assente.'}; }
  }
  if (job !== passJob) return;
  meta.passaggi = Object.assign(last || {}, {ok:okAny}); showMeta();
  passes = out.sort((a, b) => a.start.t - b.start.t); shownPass = null; userShown = false;
  worker.postMessage({type:'tracks', passes:passes.map(x => x.raw)});
  updateNext(); renderPasses();
}
setInterval(loadPasses, 60 * 60 * 1000);

/* ---------- posizione ---------- */
function setPlace(p, quiet){
  prefs.place = p; savePrefs();
  $('#placeName').textContent = p.nome; $('#placeTag').hidden = p.tipo !== 'esempio';
  $('#exampleBanner').hidden = p.tipo !== 'esempio';
  passes = []; train = null; selected = null; ids = []; pos = new Float32Array(0);
  renderPasses(true); renderTrain(); renderInfo(); updateNext(); updateCounts(); draw();
  $('#skyLoading').hidden = false; $('#loadText').textContent = 'Chiedo i satelliti sopra di te…';
  worker.postMessage({type:'observer', lat:p.lat, lon:p.lon});
  loadPasses();
  if (!quiet) toast(`Cielo di ${p.nome}: aggiorno satelliti e passaggi…`);
}
function openPlace(){ renderCities(''); $('#cityQ').value = ''; $('#geoMsg').textContent = 'La posizione resta nel tuo browser: al servizio dei satelliti arriva solo arrotondata a circa 10 km.'; $('#placeDlg').showModal(); }
$('#placeBtn').onclick = openPlace; $('#bannerPlace').onclick = openPlace;
$('#placeClose').onclick = () => $('#placeDlg').close();
$('#placeDlg').addEventListener('click', e => { if (e.target === $('#placeDlg')) $('#placeDlg').close(); });
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function renderCities(q){
  const ul = $('#cities'); ul.textContent = '';
  const nq = norm(q.trim()), list = CITTA.filter(c => !nq || norm(c.nome).includes(nq));
  for (const c of list) {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.textContent = c.nome;
    b.onclick = () => { $('#placeDlg').close(); setPlace({nome:c.nome, lat:c.lat, lon:c.lon, tipo:'citta'}); };
    li.appendChild(b); ul.appendChild(li);
  }
  if (!list.length) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = 'Nessun capoluogo con questo nome. Prova a inserire le coordinate.'; ul.appendChild(li); }
}
$('#cityQ').oninput = e => renderCities(e.target.value);
$('#geoBtn').onclick = () => {
  const msg = $('#geoMsg');
  if (!('geolocation' in navigator)) { msg.textContent = 'Questo browser non dà la posizione: scegli una città qui sotto.'; return; }
  msg.textContent = 'Chiedo la posizione al browser…';
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = +pos.coords.latitude.toFixed(2), lon = +pos.coords.longitude.toFixed(2);
    $('#placeDlg').close(); setPlace({nome:'La tua posizione', lat, lon, tipo:'gps'});
  }, err => {
    msg.textContent = err.code === 1 ? 'Il browser non ha dato il permesso per la posizione. Scegli una città qui sotto, va benissimo lo stesso.' : 'Non riesco a ottenere la posizione. Scegli una città qui sotto.';
  }, {enableHighAccuracy:false, timeout:15000, maximumAge:600000});
};
$('#coordBtn').onclick = () => {
  const lat = parseFloat($('#latIn').value.replace(',', '.')), lon = parseFloat($('#lonIn').value.replace(',', '.')), m = $('#coordMsg');
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { m.hidden = false; m.textContent = 'Servono una latitudine tra -90 e 90 e una longitudine tra -180 e 180, per esempio 45.46 e 9.19.'; return; }
  m.hidden = true; $('#placeDlg').close();
  setPlace({nome:`${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, tipo:'coordinate'});
};

/* ---------- categorie ---------- */
function buildCats(){
  const box = $('#cats'); box.textContent = '';
  for (const c of CATS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cat'; b.dataset.cat = c.id; b.setAttribute('aria-pressed', String(catOn[c.id]));
    const i = document.createElement('i'); i.dataset.cat = c.id;
    const n = document.createElement('span'); n.textContent = c.name;
    const k = document.createElement('b'); k.textContent = '0';
    b.append(i, n, k);
    b.onclick = () => { catOn[c.id] = !catOn[c.id]; b.setAttribute('aria-pressed', String(catOn[c.id])); draw(); };
    box.appendChild(b);
  }
  const tot = document.createElement('p'); tot.className = 'cat-total'; tot.id = 'catTotal'; box.after(tot);
}
function colorDots(){ $$('.cat i').forEach(i => { i.style.background = C['c-' + i.dataset.cat] || C.fg; }); }
function updateCounts(){
  const n = Object.fromEntries(CATS.map(c => [c.id, 0]));
  for (let k = 0; k < pos.length; k += 3) if (pos[k + 2] > 0) { const c = cats[pos[k]]; if (c in n) n[c]++; }
  let tot = 0;
  for (const c of CATS) { if (c.id !== 'detriti') tot += n[c.id]; const b = $(`.cat[data-cat="${c.id}"] b`); if (b) b.textContent = n[c.id].toLocaleString('it-IT'); }
  const t = $('#catTotal'); if (t) t.textContent = soloStazioni ? 'L\'elenco completo non è disponibile adesso: sulla mappa ci sono solo le stazioni spaziali, calcolate dal vivo.' : ids.length ? `${tot.toLocaleString('it-IT')} satelliti sopra l'orizzonte in questo momento (detriti esclusi)` : '';
}

/* ---------- mappa del cielo ---------- */
const cv = $('#sky'), g = cv.getContext('2d');
let C = {}, W = 0, R = 0, CX = 0, CY = 0, dpr = 1;
function readColors(){
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue('--' + n).trim();
  C = {}; for (const n of ['sky', 'sky-ring', 'sky-text', 'track', 'gold', 'fg', 'accent', 'font-mono', 'font-display']) C[n] = v(n);
  for (const c of CATS) C['c-' + c.id] = v('c-' + c.id);
  colorDots();
}
function sizeSky(){ const w = $('#skyBox').clientWidth; dpr = Math.min(2, devicePixelRatio || 1); W = w; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr); R = w / 2 - Math.max(28, w * 0.06); CX = CY = w / 2; draw(); }
new ResizeObserver(sizeSky).observe($('#skyBox'));
/* carta del cielo: Nord in alto, Est a sinistra (come guardando in su) */
const xy = (az, el) => { const r = R * (90 - el) / 90, a = az * Math.PI / 180; return [CX - r * Math.sin(a), CY - r * Math.cos(a)]; };
let drawReq = false;
function draw(){ if (drawReq) return; drawReq = true; requestAnimationFrame(() => { drawReq = false; paint(); }); }
function polyline(pts){ g.beginPath(); pts.forEach(([a, e], k) => { const [x, y] = xy(a, e); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
function paint(){
  if (!W) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, W);
  g.fillStyle = C.sky; g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C['sky-ring']; g.lineWidth = 1;
  for (const el of [30, 60]) { g.beginPath(); g.arc(CX, CY, R * (90 - el) / 90, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 1.5; g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1; g.globalAlpha = 0.35; for (let az = 0; az < 360; az += 45) { const [x, y] = xy(az, 0); g.beginPath(); g.moveTo(CX, CY); g.lineTo(x, y); g.stroke(); } g.globalAlpha = 1;
  const fs = Math.max(14, W * 0.032);
  g.fillStyle = C['sky-text']; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${fs}px ${C['font-display']}`;
  DIRS_S.forEach((d, k) => { const a = k * 45 * Math.PI / 180, r = R + fs * 0.95; g.fillText(d, CX - r * Math.sin(a), CY - r * Math.cos(a)); });
  g.font = `500 ${fs * 0.62}px ${C['font-mono']}`; g.fillText('30°', CX + 4, CY - R * 60 / 90 + fs * 0.4); g.fillText('60°', CX + 4, CY - R * 30 / 90 + fs * 0.4);
  // treno Starlink: i satelliti uniti da una linea
  if (train && catOn.starlink) {
    const pts = train.idx.map(i => [pos[i * 3 + 1], pos[i * 3 + 2]]).filter(p => p[1] > 0).sort((a, b) => a[0] - b[0]);
    if (pts.length > 1) { g.strokeStyle = C.gold; g.globalAlpha = 0.45; g.lineWidth = 2; g.setLineDash([3, 5]); polyline(pts); g.setLineDash([]); g.globalAlpha = 1; }
  }
  // punti: prima i più numerosi, poi i più importanti sopra
  const order = ['detriti', 'razzi', 'starlink', 'altri', 'navigazione', 'osservazione', 'meteo', 'scienza', 'stazioni'];
  const size = {stazioni:Math.max(5, W * 0.011), starlink:Math.max(1.4, W * 0.0026), detriti:Math.max(1.2, W * 0.002), razzi:Math.max(1.6, W * 0.003), altri:Math.max(1.8, W * 0.0034)};
  for (const c of order) {
    if (!catOn[c]) continue;
    g.fillStyle = C['c-' + c] || C.fg; const r = size[c] || Math.max(2.6, W * 0.005);
    for (let k = 0; k < pos.length; k += 3) {
      if (pos[k + 2] <= 0 || cats[pos[k]] !== c) continue;
      const [x, y] = xy(pos[k + 1], pos[k + 2]); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (c === 'stazioni') { g.font = `600 ${fs * 0.7}px ${C['font-display']}`; g.textAlign = 'left'; g.fillText(ids[pos[k]] === 25544 ? 'ISS' : 'Tiangong', x + r + 5, y); g.textAlign = 'center'; }
    }
  }
  // traiettoria del passaggio mostrato
  const tr = shownPass && shownPass.track;
  if (tr && tr.length > 1) {
    g.strokeStyle = C.track; g.lineWidth = Math.max(2.5, W * 0.005); g.setLineDash([8, 6]); polyline(tr); g.setLineDash([]);
    const [sx, sy] = xy(tr[0][0], tr[0][1]), [ex, ey] = xy(tr[tr.length - 1][0], tr[tr.length - 1][1]), [px, py] = xy(tr[tr.length - 2][0], tr[tr.length - 2][1]);
    const ang = Math.atan2(ey - py, ex - px), L = Math.max(12, W * 0.022);
    g.fillStyle = C.track; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - L * Math.cos(ang - 0.45), ey - L * Math.sin(ang - 0.45)); g.lineTo(ex - L * Math.cos(ang + 0.45), ey - L * Math.sin(ang + 0.45)); g.closePath(); g.fill();
    g.beginPath(); g.arc(sx, sy, Math.max(5, W * 0.009), 0, Math.PI * 2); g.fill();
    g.font = `600 ${fs * 0.72}px ${C['font-mono']}`; g.textAlign = 'center';
    g.fillText(hm(shownPass.start.t), sx, sy - fs * 0.9); g.fillText(hm(shownPass.end.t), ex, ey + fs);
  }
  // satellite selezionato
  if (selected && selected.az != null && selected.el > 0) {
    if (selected.track && selected.track.length > 1) { g.strokeStyle = C.accent; g.lineWidth = 2; g.globalAlpha = 0.7; polyline(selected.track); g.globalAlpha = 1; }
    const [x, y] = xy(selected.az, selected.el); g.strokeStyle = C.accent; g.lineWidth = 3; g.beginPath(); g.arc(x, y, Math.max(12, W * 0.02), 0, Math.PI * 2); g.stroke();
  }
}
cv.addEventListener('click', e => {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * W / r.height;
  let best = null, bd = Math.max(26, W * 0.04);
  for (let k = 0; k < pos.length; k += 3) {
    const c = cats[pos[k]]; if (pos[k + 2] <= 0 || !catOn[c]) continue;
    const [px, py] = xy(pos[k + 1], pos[k + 2]); let d = Math.hypot(px - x, py - y);
    if (c === 'starlink' || c === 'detriti') d *= 1.6;   // a parità di distanza preferisci gli oggetti più interessanti
    if (d < bd) { bd = d; best = pos[k]; }
  }
  if (best == null) { if (selected) { selected = null; worker.postMessage({type:'unselect'}); renderInfo(); draw(); } return; }
  selected = {idx:best}; worker.postMessage({type:'select', idx:best});
});

/* ---------- scheda del satellite ---------- */
function renderInfo(){
  const card = $('#infoCard');
  if (!selected || selected.az == null) { card.hidden = true; return; }
  const s = selected; card.hidden = false;
  $('#infoName').textContent = prettyName(s.id, s.name); $('#infoWhat').textContent = whatIs(s.id, s.name, s.cat);
  const rows = [
    ['Altezza sull\'orizzonte', `${Math.max(0, s.el).toFixed(0)}°`],
    ['Direzione', `${dir(s.az)} (azimut ${s.az.toFixed(0)}°)`],
    ['Quota', `${Math.round(s.alt).toLocaleString('it-IT')} km`],
    ['Velocità', `${Math.round(s.speed * 3600).toLocaleString('it-IT')} km/h (${s.speed.toFixed(1).replace('.', ',')} km/s)`],
  ];
  if (s.range) rows.push(['Distanza da te', `${Math.round(s.range).toLocaleString('it-IT')} km`]);
  rows.push(['Posizione', s.live ? 'calcolata dal vivo' : 'stimata, aggiornata ogni 2 minuti']);
  const kv = $('#infoKv'); kv.textContent = '';
  for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; kv.append(dt, dd); }
}
$('#infoClose').onclick = () => { selected = null; worker.postMessage({type:'unselect'}); renderInfo(); draw(); };

/* ---------- prossimo passaggio ed elenco ---------- */
/* per il conto alla rovescia: la ISS prima, preferendo un passaggio che valga la pena (almeno 2 minuti o oltre 25 gradi) */
const good = p => p.end.t - p.start.t >= 120000 || p.max.el >= 25;
function nextPass(){
  const now = Date.now(), up = passes.filter(p => p.end.t > now), iss = up.filter(p => p.id === 25544);
  return iss.find(good) || up.find(good) || iss[0] || up[0] || null;
}
let current = null;
function updateNext(){
  const p = nextPass(); current = p;
  const btn = $('#showPassBtn');
  if (!p) {
    const err = meta.passaggi && !meta.passaggi.ok;
    $('#nextName').textContent = err ? 'Passaggi non disponibili adesso' : meta.passaggi ? 'Nessun passaggio visibile nei prossimi 5 giorni' : 'Calcolo i passaggi…';
    $('#countdown').textContent = '--:--'; $('#nextWhen').textContent = err ? (meta.passaggi.errore || '') : ''; $('#nextHow').textContent = ''; btn.hidden = true; return;
  }
  $('#nextName').textContent = prettyName(p.id, p.name);
  $('#nextWhen').textContent = `${cap(dayWord(p.start.t))} alle ${hm(p.start.t)}, visibile per ${(m => m <= 1 ? 'circa un minuto' : `circa ${m} minuti`)(Math.round((p.end.t - p.start.t) / 60000))}`;
  $('#nextHow').textContent = howTo(p);
  btn.hidden = false;
  /* la traiettoria segue il conto alla rovescia, finché l'utente non ne sceglie un'altra */
  if (!userShown || !shownPass) { shownPass = p; draw(); }
  tickCountdown();
}
function tickCountdown(){
  const p = current, now = Date.now();
  $('#clock').textContent = hms(now);
  if (!p) return;
  if (now >= p.end.t) { updateNext(); renderPasses(); return; }
  if (now >= p.start.t) { $('#nextKicker').textContent = 'IN CORSO: GUARDA IN CIELO ADESSO'; $('#countdown').textContent = 'ora'; }
  else { $('#nextKicker').textContent = 'PROSSIMO PASSAGGIO VISIBILE TRA'; $('#countdown').textContent = countdown(p.start.t - now); }
}
setInterval(tickCountdown, 1000);
$('#showPassBtn').onclick = () => { shownPass = current; userShown = false; renderPasses(); draw(); $('#sky').scrollIntoView({behavior:'smooth', block:'center'}); };
function renderPasses(loading){
  const ol = $('#passes'); ol.textContent = '';
  const now = Date.now(), list = passes.filter(p => p.end.t > now).slice(0, 40);
  if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = loading || !meta.passaggi ? 'Chiedo i passaggi visibili…' : meta.passaggi.ok ? 'Nessun passaggio visibile nei prossimi 5 giorni: capita, perché serve che il satellite sia illuminato dal Sole mentre da te è buio.' : (meta.passaggi.errore || 'Il servizio dei passaggi non risponde adesso.'); ol.appendChild(li); return; }
  for (const p of list) {
    const li = document.createElement('li'); li.tabIndex = 0; li.setAttribute('role', 'button');
    if (shownPass && shownPass.key === p.key) li.setAttribute('aria-current', 'true');
    const t = document.createElement('span'); t.className = 't'; t.textContent = hm(p.start.t); const sm = document.createElement('small'); sm.textContent = dayWord(p.start.t); t.appendChild(sm);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = prettyName(p.id, p.name); const sn = document.createElement('small'); sn.textContent = `da ${dir(p.start.az)} a ${dir(p.end.az)}, ${height(p.max.el)}`; n.appendChild(sn);
    const m = document.createElement('span'); m.className = 'm'; m.textContent = `max ${Math.round(p.max.el)}°` + (p.mag < 100000 ? ` · mag ${p.mag.toFixed(1).replace('.', ',')}` : '');
    li.append(t, n, m);
    const show = () => { shownPass = p; userShown = true; renderPasses(); draw(); toast(`${prettyName(p.id, p.name)}: ${howTo(p)}`, 6000); };
    li.onclick = show; li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } };
    ol.appendChild(li);
  }
}
function renderTrain(){
  const box = $('#train');
  if (!train) { box.hidden = true; return; }
  const pts = train.idx.map(i => [pos[i * 3 + 1], pos[i * 3 + 2]]).filter(p => p[1] > 0);
  const az = pts.length ? Math.atan2(pts.reduce((s, p) => s + Math.sin(p[0] * Math.PI / 180), 0), pts.reduce((s, p) => s + Math.cos(p[0] * Math.PI / 180), 0)) * 180 / Math.PI : 0;
  box.hidden = false; box.textContent = '';
  const h = document.createElement('p'); h.className = 'train-title'; const b = document.createElement('b'); b.textContent = 'Treno Starlink sopra di te adesso'; h.appendChild(b);
  const d = document.createElement('p'); d.className = 'train-text';
  const date = train.date ? new Date(train.date).toLocaleDateString('it-IT', {day:'numeric', month:'long'}) : '';
  d.textContent = `${train.count} satelliti lanciati il ${date}, ancora vicini tra loro, verso ${dir(az)}. Sulla mappa sono uniti dalla linea tratteggiata. Si vedono a occhio nudo solo se illuminati dal Sole con il cielo buio, di solito poco dopo il tramonto o prima dell'alba.`;
  box.append(h, d);
}

/* ---------- fonte e data dei dati ---------- */
function showMeta(){
  const parts = [];
  const s = meta.sopra, p = meta.passaggi;
  if (s && s.at) parts.push(`satelliti sopra di te aggiornati alle ${hm(Date.parse(s.at))}`);
  if (p && p.at) parts.push(`passaggi calcolati alle ${hm(Date.parse(p.at))}`);
  let txt = 'Dati: N2YO.com' + (parts.length ? ', ' + parts.join(', ') : '');
  const stale = [s, p].some(x => x && x.cache === 'vecchia'), err = [s, p].find(x => x && !x.ok && x.errore);
  if (stale) txt += '. Il servizio non risponde: mostro gli ultimi dati disponibili.';
  else if (err) txt += '. ' + err.errore;
  $('#dataInfo').textContent = txt;
}

/* ---------- avvio ---------- */
readColors(); buildCats(); colorDots(); applyTheme();
setPlace(prefs.place, true);
})();
