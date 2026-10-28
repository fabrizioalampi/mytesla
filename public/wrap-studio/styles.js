/* Wrap Studio: modelli, tavolozze e stili. Nessun accesso al DOM.
   Ogni stile disegna nello spazio del template (pixel 0..W, 0..H): lo stesso
   codice produce l'anteprima ridotta e il PNG a piena risoluzione. */
'use strict';
const WS = {};

/* Template ufficiali Tesla, letti dal browser direttamente dal repository
   github.com/teslamotors/custom-wraps (nessuna licenza: non li ridistribuiamo).
   Commit fissato al 22 luglio 2026, controllato il 28 ottobre 2026. */
WS.TEMPLATE_SHA = '86c7d31454caf0f20af6f6af105f577643f13bce';
WS.templateUrl = id => `https://raw.githubusercontent.com/teslamotors/custom-wraps/${WS.TEMPLATE_SHA}/${id}/template.png`;
WS.REPO_URL = 'https://github.com/teslamotors/custom-wraps';

/* axis: direzione del muso nel template ('v' verticale, 'h' orizzontale) */
WS.MODELS = [
  {id:'modely-2025-premium', name:'Model Y', sub:'2025 in poi, Premium', w:1024, h:1024, axis:'v', help:'Il restyling 2025: barra luminosa che attraversa tutto il frontale.'},
  {id:'modely-2025-base', name:'Model Y', sub:'2025 in poi, Standard', w:1024, h:1024, axis:'v', help:'Restyling 2025, versione d\'ingresso.'},
  {id:'modely-2025-performance', name:'Model Y', sub:'2025 in poi, Performance', w:1024, h:1024, axis:'v', help:'Restyling 2025, con paraurti e cerchi Performance.'},
  {id:'modely', name:'Model Y', sub:'fino al 2024', w:1024, h:1024, axis:'v', help:'Prima del restyling: due fari separati, niente barra luminosa.'},
  {id:'modely-l', name:'Model Y L', sub:'versione lunga, 6 posti', w:1024, h:1024, axis:'v', help:'La Model Y allungata con tre file di sedili.'},
  {id:'model3-2024-base', name:'Model 3', sub:'2024 in poi, Standard e Premium', w:1024, h:1024, axis:'v', help:'Il restyling 2024: fari sottili, niente leve dietro il volante.'},
  {id:'model3-2024-performance', name:'Model 3', sub:'2024 in poi, Performance', w:1024, h:1024, axis:'v', help:'Restyling 2024, versione Performance con alettone.'},
  {id:'model3', name:'Model 3', sub:'fino al 2023', w:1024, h:1024, axis:'v', help:'Prima del restyling: fari più grandi e leve dietro il volante.'},
  {id:'models-2021', name:'Model S', sub:'2021 in poi', w:1024, h:1024, axis:'v', help:'La Model S con il volante a cloche o tondo, dal 2021.'},
  {id:'models-2025-plaid', name:'Model S Plaid', sub:'2025 in poi', w:1024, h:1024, axis:'v', help:'Model S Plaid aggiornata nel 2025.'},
  {id:'modelx-2021', name:'Model X', sub:'2021 in poi', w:1024, h:1024, axis:'v', help:'La Model X con le porte ad ali di falco, dal 2021.'},
  {id:'cybertruck', name:'Cybertruck', sub:'', w:1024, h:768, axis:'h', help:'Il template del Cybertruck è più basso: 1024 x 768 pixel.'}
];
WS.model = id => WS.MODELS.find(m => m.id === id) || WS.MODELS[0];

WS.PALETTES = [
  {id:'notte', name:'Notte', c:['#11151f','#2b3550','#5d6b8f','#c9d3ea']},
  {id:'militare', name:'Militare', c:['#4b5320','#6b6b3a','#2f3324','#a39a6a']},
  {id:'neon', name:'Neon', c:['#120326','#ff2bd6','#00f0ff','#c6ff00']},
  {id:'pastello', name:'Pastello', c:['#ffd6e0','#c5e6ff','#d9f7c9','#fff1b8']},
  {id:'tricolore', name:'Tricolore', c:['#009246','#f4f5f0','#ce2b37','#1b1b1b']},
  {id:'oro', name:'Oro e nero', c:['#0c0c0c','#c9a227','#f3d77a','#3a3a3a']},
  {id:'ghiaccio', name:'Ghiaccio', c:['#e9f6ff','#9fd3f5','#4a90c2','#ffffff']},
  {id:'tramonto', name:'Tramonto', c:['#2d1b4e','#ff5e62','#ff9966','#ffd36e']},
  {id:'fuoco', name:'Fuoco', c:['#1a0500','#ff3b00','#ff9e00','#ffe15c']},
  {id:'oceano', name:'Oceano', c:['#03254c','#1167b1','#2a9df4','#d0efff']}
];
WS.palette = id => WS.PALETTES.find(p => p.id === id);

/* PRNG con seme (mulberry32) */
WS.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];

/* rumore a valori morbido, per mimetiche e maculato */
function valueNoise(R, cells) {
  const g = Array.from({length:(cells + 1) * (cells + 1)}, () => R());
  const at = (i, j) => g[(j % (cells + 1)) * (cells + 1) + (i % (cells + 1))];
  const sm = t => t * t * (3 - 2 * t);
  return (u, v) => { // u, v in 0..1
    const x = u * cells, y = v * cells, i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    return lerp(lerp(at(i, j), at(i + 1, j), fx), lerp(at(i, j + 1), at(i + 1, j + 1), fx), fy);
  };
}
function blob(g, R, cx, cy, r, wobble) {
  const n = 9 + Math.floor(R() * 5), pts = [];
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = r * (1 - wobble / 2 + R() * wobble); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  g.beginPath();
  for (let k = 0; k <= n; k++) {
    const p = pts[k % n], q = pts[(k + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (k === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
  }
  g.closePath();
}
/* riempie una banda ruotata che copre tutto il template */
function rotated(g, W, H, deg, fn) {
  const d = Math.hypot(W, H);
  g.save(); g.translate(W / 2, H / 2); g.rotate(deg * Math.PI / 180); fn(-d / 2, -d / 2, d, d); g.restore();
}

/* Ogni stile: nome, colori usati, al massimo due cursori {key,label,min,max,step,def} */
WS.STYLES = [
  {id:'tinta', name:'Tinta unita', colors:1, sliders:[], variants:false,
    draw(g, W, H, R, C) { g.fillStyle = C[0]; g.fillRect(0, 0, W, H); }},

  {id:'sfumatura', name:'Sfumatura', colors:3, sliders:[{key:'angle', label:'Direzione', min:0, max:360, step:5, def:90, unit:'°'}], variants:false,
    draw(g, W, H, R, C, P) {
      const a = P.angle * Math.PI / 180, r = Math.hypot(W, H) / 2, cx = W / 2, cy = H / 2;
      const gr = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      gr.addColorStop(0, C[0]); gr.addColorStop(0.55, C[1]); gr.addColorStop(1, C[2]);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }},

  {id:'racing', name:'Strisce racing', colors:3, sliders:[{key:'width', label:'Larghezza strisce', min:20, max:140, step:2, def:70, unit:' px'}, {key:'gap', label:'Distanza tra le strisce', min:0, max:80, step:2, def:22, unit:' px'}], variants:false,
    draw(g, W, H, R, C, P, M) {
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H);
      const vert = M.axis === 'v', len = vert ? H : W, mid = vert ? W / 2 : H / 2, w = P.width, gap = P.gap, pin = Math.max(3, w * 0.07);
      const band = (s, size, col) => { g.fillStyle = col; if (vert) g.fillRect(s, 0, size, len); else g.fillRect(0, s, len, size); };
      for (const dir of [-1, 1]) {
        const inner = dir < 0 ? mid - gap / 2 - w : mid + gap / 2;
        band(inner, w, C[1]);
        band(dir < 0 ? inner - pin * 2.2 : inner + w + pin * 1.2, pin, C[2]);
      }
    }},

  {id:'mimetica', name:'Mimetica', colors:4, sliders:[{key:'size', label:'Dimensione del motivo', min:30, max:160, step:5, def:80, unit:''}], variants:true,
    draw(g, W, H, R, C, P) {
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H);
      const s = P.size;
      for (let layer = 1; layer < 4; layer++) {
        g.fillStyle = C[layer];
        const n = Math.round((W * H) / (s * s) * (0.55 - layer * 0.1));
        for (let k = 0; k < n; k++) {
          const cx = R() * W, cy = R() * H, r = s * (0.45 + R() * 0.6);
          blob(g, R, cx, cy, r, 0.8); g.fill();
          blob(g, R, cx + (R() - 0.5) * r, cy + (R() - 0.5) * r, r * 0.6, 0.9); g.fill();
        }
      }
    }},

  {id:'digitale', name:'Mimetica digitale', colors:4, sliders:[{key:'size', label:'Dimensione dei quadretti', min:6, max:32, step:1, def:14, unit:' px'}], variants:true,
    draw(g, W, H, R, C, P) {
      const s = P.size, cols = Math.ceil(W / s), rows = Math.ceil(H / s);
      const n1 = valueNoise(R, 7), n2 = valueNoise(R, 13);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const u = i / cols, v = j / rows, val = n1(u, v) * 0.7 + n2(u, v) * 0.3 + (R() - 0.5) * 0.12;
        g.fillStyle = C[val < 0.35 ? 0 : val < 0.5 ? 1 : val < 0.65 ? 2 : 3];
        g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
      }
    }},

  {id:'diagonali', name:'Righe diagonali', colors:2, sliders:[{key:'width', label:'Larghezza righe', min:8, max:120, step:2, def:36, unit:' px'}, {key:'angle', label:'Angolo', min:0, max:180, step:5, def:45, unit:'°'}], variants:false,
    draw(g, W, H, R, C, P) {
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H);
      rotated(g, W, H, P.angle, (x, y, w, h) => { g.fillStyle = C[1]; for (let t = x; t < x + w; t += P.width * 2) g.fillRect(t, y, P.width, h); });
    }},

  {id:'pois', name:'Pois', colors:2, sliders:[{key:'size', label:'Dimensione dei pois', min:6, max:60, step:1, def:20, unit:' px'}], variants:false,
    draw(g, W, H, R, C, P) {
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H); g.fillStyle = C[1];
      const r = P.size, step = r * 3.2;
      for (let j = 0, y = 0; y < H + step; j++, y += step * 0.866) for (let x = (j % 2) * step / 2; x < W + step; x += step) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }},

  {id:'carbonio', name:'Carbonio', colors:2, sliders:[{key:'size', label:'Dimensione della trama', min:6, max:24, step:1, def:10, unit:' px'}], variants:false,
    draw(g, W, H, R, C, P) {
      const s = P.size;
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H);
      for (let j = 0; j * s < H; j++) for (let i = 0; i * s < W; i++) {
        const horiz = ((i + j) % 2) === 0, x = i * s, y = j * s;
        const gr = horiz ? g.createLinearGradient(x, y, x, y + s) : g.createLinearGradient(x, y, x + s, y);
        gr.addColorStop(0, C[0]); gr.addColorStop(0.5, C[1]); gr.addColorStop(1, C[0]);
        g.fillStyle = gr; g.fillRect(x + 0.6, y + 0.6, s - 1.2, s - 1.2);
      }
    }},

  {id:'scacchi', name:'Scacchi', colors:2, sliders:[{key:'size', label:'Dimensione delle caselle', min:12, max:120, step:2, def:48, unit:' px'}, {key:'angle', label:'Angolo', min:0, max:45, step:5, def:0, unit:'°'}], variants:false,
    draw(g, W, H, R, C, P) {
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H);
      rotated(g, W, H, P.angle, (x, y, w, h) => { g.fillStyle = C[1]; const s = P.size;
        for (let j = 0; j * s < h; j++) for (let i = 0; i * s < w; i++) if ((i + j) % 2) g.fillRect(x + i * s, y + j * s, s, s); });
    }},

  {id:'maculato', name:'Maculato', colors:3, sliders:[{key:'size', label:'Dimensione delle macchie', min:10, max:50, step:1, def:22, unit:' px'}], variants:true,
    draw(g, W, H, R, C, P) {
      g.fillStyle = C[0]; g.fillRect(0, 0, W, H);
      const s = P.size, step = s * 2.6;
      for (let y = -step; y < H + step; y += step * 0.9) for (let x = -step; x < W + step; x += step) {
        const cx = x + (R() - 0.5) * step * 0.9 + ((Math.round(y / step) % 2) ? step / 2 : 0), cy = y + (R() - 0.5) * step * 0.8, r = s * (0.7 + R() * 0.6);
        if (R() < 0.75) { // rosetta: anello scuro spezzato con centro più caldo
          g.fillStyle = C[2]; blob(g, R, cx, cy, r * 0.75, 0.6); g.fill();
          g.strokeStyle = C[1]; g.lineWidth = r * 0.32; g.lineCap = 'round';
          const parts = 3 + Math.floor(R() * 2);
          for (let k = 0; k < parts; k++) { const a0 = k / parts * Math.PI * 2 + R() * 0.6; g.beginPath(); g.arc(cx, cy, r, a0, a0 + Math.PI * 2 / parts * (0.55 + R() * 0.25)); g.stroke(); }
        } else { g.fillStyle = C[1]; blob(g, R, cx, cy, r * 0.45, 0.7); g.fill(); }
      }
    }},

  {id:'esagoni', name:'Esagoni', colors:3, sliders:[{key:'size', label:'Dimensione degli esagoni', min:14, max:90, step:2, def:36, unit:' px'}], variants:true,
    draw(g, W, H, R, C, P) {
      const r = P.size, dx = r * Math.sqrt(3), dy = r * 1.5;
      g.fillStyle = C[1]; g.fillRect(0, 0, W, H);
      for (let j = -1; j * dy < H + r; j++) for (let i = -1; i * dx < W + dx; i++) {
        const cx = i * dx + (j % 2 ? dx / 2 : 0), cy = j * dy;
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); } g.closePath();
        g.fillStyle = R() < 0.18 ? C[2] : C[0]; g.fill();
      }
    }},

  {id:'pixel', name:'Pixel art', colors:4, sliders:[{key:'size', label:'Dimensione dei pixel', min:12, max:64, step:2, def:32, unit:' px'}], variants:true,
    draw(g, W, H, R, C, P, M) {
      // simmetrico rispetto all'asse dell'auto, così i due fianchi si somigliano
      const s = P.size, vert = M.axis === 'v', cols = Math.ceil(W / s), rows = Math.ceil(H / s);
      const half = vert ? Math.ceil(cols / 2) : Math.ceil(rows / 2);
      const grid = [];
      for (let a = 0; a < (vert ? rows : cols); a++) { const row = []; for (let b = 0; b < half; b++) { const r = R(); row.push(r < 0.4 ? 0 : r < 0.65 ? 1 : r < 0.85 ? 2 : 3); } grid.push(row); }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        let k;
        if (vert) { const b = i < half ? i : cols - 1 - i; k = grid[j][Math.min(b, half - 1)]; }
        else { const b = j < half ? j : rows - 1 - j; k = grid[i][Math.min(b, half - 1)]; }
        g.fillStyle = C[k]; g.fillRect(i * s, j * s, s + 0.5, s + 0.5);
      }
    }}
];
WS.style = id => WS.STYLES.find(s => s.id === id) || WS.STYLES[0];
WS.defaultParams = st => Object.fromEntries(st.sliders.map(s => [s.key, s.def]));

/* Nome file secondo le regole Tesla: lettere, numeri, _ - e spazi, al massimo 30
   caratteri contando anche ".png" (prudenza: il README non dice se l'estensione conta). */
WS.MAX_BASE = 26;
WS.cleanName = s => {
  const n = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, WS.MAX_BASE).trim();
  return n || 'Wrap';
};
WS.MAX_BYTES = 1000000; /* 1 MB inteso come 1.000.000 byte, il valore più prudente */
WS.MAX_COLLECTION = 10;
