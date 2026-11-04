/* ===== Disegni delle auto (SVG) e loro animazione a partire dalla simulazione di core.js ===== */
const LCOL = {w:'#f4f8ff', a:'#ffab2e', r:'#ff2a36', rd:'#d3141f'};
let svgUid = 0;
function lamp(ch, shape, c, halo){
  const on = shape.split('FILL').join(LCOL[c]);
  const off = shape.split('FILL').join(c==='r'||c==='rd' ? '#2b1116' : '#252c37');
  return `<g class="lp" data-ch="${ch}">${halo===false?'':`<g class="h" filter="url(#lsGlow)" opacity="0">${on}</g>`}<g>${off}</g><g class="on" opacity="0">${on}</g></g>`;
}
const flipX = (w, inner) => `<g transform="translate(${w},0) scale(-1,1)">${inner}</g>`;
function barSegs(chs, x0, x1, y, h){ const n=chs.length, w=(x1-x0)/n; return chs.map((c,i)=>`<rect data-bar="${c}" x="${(x0+i*w).toFixed(2)}" y="${y}" width="${Math.max(0.5,w-0.5).toFixed(2)}" height="${h}" fill="#e9f3ff" opacity="0.07"/>`).join(''); }
const hasRow = (car, id) => CARS[car].rows.includes(id);

/* ---------- FRONTE (420×230) ---------- */
function frontSVG(car){
  const C=CARS[car], H=id=>hasRow(car,id);
  if (C.body==='truck') return ctFront(car);
  const roof = C.body==='suv' ? 44 : 58, lift = C.body==='suv' ? 0 : 4;
  const cluster = side => {
    const o = side==='R' ? {o:1,i:3,s:5,c4:7,c5:9,c6:11,t:13} : {o:0,i:2,s:4,c4:6,c5:8,c6:10,t:12};
    const dots = (y,xs) => xs.map((x,j)=>H('ch4') ? lamp([o.c4,o.c5,o.c6][j], `<circle cx="${x}" cy="${y}" r="2.3" fill="FILL"/>`, 'w', false) : '').join('');
    if (C.style==='classic') return `<path d="M62 128 L128 118 Q141 117 142 124 L140 133 Q102 141 67 141 Q57 137 62 128Z" fill="#0c1016" stroke="#39414d"/>
      ${lamp(o.t,'<path d="M60 131 L73 129 L73 139 L64 140Z" fill="FILL"/>','a')}
      ${lamp(o.o,'<circle cx="86" cy="132" r="6.5" fill="FILL"/>','w')}${lamp(o.i,'<circle cx="107" cy="130" r="6" fill="FILL"/>','w')}
      ${lamp(o.s,'<path d="M64 127.5 L128 119 Q138 118 139 122 L139 123 Q130 122 64 129.6Z" fill="FILL"/>','w')}${dots(134,[119,126.5,134])}`;
    const y = C.style==='bar' ? 14 : 0;
    return `<path d="M60 ${124+y} L140 ${114+y} Q146 ${114+y} 145 ${120+y} L144 ${125+y} Q100 ${133+y} 64 ${133+y} Q56 ${130+y} 60 ${124+y}Z" fill="#0c1016" stroke="#39414d"/>
      ${lamp(o.t,`<path d="M60 ${125+y} L71 ${124+y} L71 ${132+y} L63 ${132+y}Z" fill="FILL"/>`,'a')}
      ${lamp(o.o,`<circle cx="88" cy="${127+y}" r="4.6" fill="FILL"/>`,'w')}${lamp(o.i,`<circle cx="104" cy="${125+y}" r="4.6" fill="FILL"/>`,'w')}
      ${C.style==='bar' ? '' : lamp(o.s,'<path d="M64 124 L140 115 L141 118 L66 127Z" fill="FILL"/>','w')}${dots(121+y,[118,126,134])}`;
  };
  const sideL = side => { const o = side==='R'?{fog:15,aux:17,mk:19,rep:21}:{fog:14,aux:16,mk:18,rep:20};
    return `${H('ffog')?lamp(o.fog,'<circle cx="84" cy="166" r="5.5" fill="FILL"/>','w'):''}${H('aux')?lamp(o.aux,'<rect x="98" y="163" width="18" height="4" rx="2" fill="FILL"/>','w'):''}
      ${H('smark')?lamp(o.mk,'<rect x="41" y="137" width="5" height="8" rx="2" fill="FILL"/>','a'):''}${lamp(o.rep,'<rect x="47" y="117" width="7" height="4" rx="2" fill="FILL"/>','a')}`; };
  const bar = C.style==='bar' ? lamp(5,'<path d="M72 114 L209 104 L209 107.5 L72 117.5Z" fill="FILL"/>','w') + flipX(420, lamp(4,'<path d="M72 114 L209 104 L209 107.5 L72 117.5Z" fill="FILL"/>','w')) : '';
  return `<svg viewBox="0 0 420 230" preserveAspectRatio="xMidYMid meet">
    <ellipse data-glow="0,1,2,3,14,15" cx="210" cy="212" rx="190" ry="14" fill="#cfe2ff" opacity="0" filter="url(#lsGlow2)"/>
    <ellipse cx="210" cy="198" rx="176" ry="7" fill="#000" opacity=".55"/>
    <rect x="56" y="176" width="40" height="22" rx="4" fill="#0a0d12"/><rect x="324" y="176" width="40" height="22" rx="4" fill="#0a0d12"/>
    <path d="M40 186 L40 ${150-lift} Q40 ${128-lift} 64 ${120-lift} L120 104 Q210 93 300 104 L356 ${120-lift} Q380 ${128-lift} 380 ${150-lift} L380 186 Q380 190 374 190 L46 190 Q40 190 40 186Z" fill="url(#lsBody)" stroke="#3a4350"/>
    <path d="M110 104 L140 ${roof} Q210 ${roof-11} 280 ${roof} L310 104Z" fill="#1d232c" stroke="#3a4350"/>
    <path d="M123 100 L148 ${roof+5} Q210 ${roof-4} 272 ${roof+5} L297 100Z" fill="url(#lsGlass)"/>
    <g data-mir="5" data-mode="front" style="transform-origin:110px 101px"><path d="M86 95 Q84 90 92 89 L110 93 L110 104 L92 104 Q85 103 86 95Z" fill="#232a34" stroke="#3a4350"/></g>
    <g data-mir="4" data-mode="front" style="transform-origin:310px 101px"><path d="M334 95 Q336 90 328 89 L310 93 L310 104 L328 104 Q335 103 334 95Z" fill="#232a34" stroke="#3a4350"/></g>
    <path d="M150 170 L270 170 L262 182 L158 182Z" fill="#0c1016"/>
    <path d="M200 116 Q210 112 220 116" stroke="#4a5462" stroke-width="2" fill="none"/>
    ${cluster('R')}${sideL('R')}${flipX(420, cluster('L')+sideL('L'))}${bar}
  </svg>`;
}
function ctFront(car){
  const fb = ROWMAP.fbar.ch.slice().reverse(), off = ROWMAP.offroad.ch.slice().reverse();
  const ends = side => { const o = side==='R'?{o:1,i:3,t:13,rep:21,s:5}:{o:0,i:2,t:12,rep:20,s:4};
    return `${lamp(o.s,'<rect x="52" y="117" width="10" height="4" fill="FILL"/>','w')}${lamp(o.o,'<rect x="62" y="125" width="24" height="4" rx="1" fill="FILL"/>','w')}${lamp(o.i,'<rect x="90" y="125" width="24" height="4" rx="1" fill="FILL"/>','w')}
      ${lamp(o.t,'<rect x="40" y="132" width="12" height="4" fill="FILL"/>','a')}${lamp(o.rep,'<rect x="34" y="146" width="6" height="4" fill="FILL"/>','a')}`; };
  return `<svg viewBox="0 0 420 230" preserveAspectRatio="xMidYMid meet">
    <ellipse data-glow="0,1,2,3" cx="210" cy="212" rx="190" ry="14" fill="#cfe2ff" opacity="0" filter="url(#lsGlow2)"/>
    <ellipse cx="210" cy="198" rx="180" ry="7" fill="#000" opacity=".55"/>
    <rect x="50" y="172" width="46" height="26" rx="3" fill="#0a0d12"/><rect x="324" y="172" width="46" height="26" rx="3" fill="#0a0d12"/>
    <path d="M30 188 L30 140 L54 120 L366 120 L390 140 L390 188Z" fill="url(#lsBodyS)" stroke="#4b5563"/>
    <path d="M72 118 L168 56 L252 56 L348 118Z" fill="#1d232c" stroke="#4b5563"/><path d="M90 114 L172 62 L248 62 L330 114Z" fill="url(#lsGlass)"/>
    <g data-mir="5" data-mode="front" style="transform-origin:72px 112px"><path d="M50 106 L72 104 L72 116 L52 116Z" fill="#2a313b" stroke="#4b5563"/></g>
    <g data-mir="4" data-mode="front" style="transform-origin:348px 112px"><path d="M370 106 L348 104 L348 116 L368 116Z" fill="#2a313b" stroke="#4b5563"/></g>
    <rect x="54" y="116.5" width="312" height="5" fill="#0b0e13"/>${barSegs(fb,62,358,117.5,3)}
    <rect x="150" y="50" width="120" height="5" fill="#0b0e13"/>${barSegs(off,154,266,51,3)}
    <path d="M140 160 L280 160 L272 176 L148 176Z" fill="#0c1016"/>
    ${ends('R')}${flipX(420, ends('L'))}
  </svg>`;
}

/* ---------- RETRO (420×230) ---------- */
function rearSVG(car){
  const C=CARS[car], H=id=>hasRow(car,id);
  if (C.body==='truck') return ctRear(car);
  const roof = C.body==='suv' ? 46 : 60;
  const cluster = side => { const o = side==='L'?{tail:25,turn:22}:{tail:26,turn:23};
    if (C.style==='bar') return `<path d="M54 122 L120 116 L122 128 Q90 134 58 134 Q50 130 54 122Z" fill="#14070a" stroke="#3d2228"/>
      ${lamp(o.turn,'<path d="M56 124 L76 122 L77 131 L60 132 Q53 129 56 124Z" fill="FILL"/>','a')}${lamp(24,'<path d="M82 121 L118 118 L119 126 L83 129Z" fill="FILL"/>','r')}
      ${lamp(27,'<rect x="88" y="128" width="16" height="3.5" rx="1.5" fill="FILL"/>','w')}`;
    return `<path d="M56 124 L140 115 L143 129 Q102 136 60 137 Q51 132 56 124Z" fill="#14070a" stroke="#3d2228"/>
      ${lamp(o.tail,'<path d="M78 124 L140 117 L141 122 L80 129Z" fill="FILL"/>','rd')}${lamp(24,'<path d="M110 126 L141 123 L142 128 Q126 131 110 132Z" fill="FILL"/>','r')}
      ${lamp(o.turn,'<path d="M57 126 L77 124 L79 133 L61 135 Q54 131 57 126Z" fill="FILL"/>','a')}${lamp(27,'<rect x="86" y="129" width="16" height="4.5" rx="1.5" fill="FILL"/>','w')}`; };
  const tailBar = C.style==='bar' ? lamp(25,'<path d="M70 113 L210 104 L210 107.5 L70 116.5Z" fill="FILL"/>','rd') + flipX(420, lamp(26,'<path d="M70 113 L210 104 L210 107.5 L70 116.5Z" fill="FILL"/>','rd')) : '';
  return `<svg viewBox="0 0 420 230" preserveAspectRatio="xMidYMid meet">
    <ellipse data-glow="24,25,26" data-red="1" cx="210" cy="212" rx="190" ry="14" fill="#ff2a36" opacity="0" filter="url(#lsGlow2)"/>
    <ellipse cx="210" cy="198" rx="176" ry="7" fill="#000" opacity=".55"/>
    <rect x="56" y="176" width="40" height="22" rx="4" fill="#0a0d12"/><rect x="324" y="176" width="40" height="22" rx="4" fill="#0a0d12"/>
    <path d="M40 186 L40 148 Q40 126 62 119 L120 106 Q210 98 300 106 L358 119 Q380 126 380 148 L380 186 Q380 190 374 190 L46 190 Q40 190 40 186Z" fill="url(#lsBody)" stroke="#3a4350"/>
    <g data-lift="rear"><path d="M112 106 L140 ${roof} Q210 ${roof-10} 280 ${roof} L308 106Z" fill="#1d232c" stroke="#3a4350"/>
      <path d="M126 102 L150 ${roof+5} Q210 ${roof-2} 270 ${roof+5} L294 102Z" fill="url(#lsGlass)"/>
      ${lamp(24,`<rect x="186" y="${roof+1}" width="48" height="3" rx="1.5" fill="FILL"/>`,'r')}</g>
    <rect x="182" y="142" width="56" height="20" rx="3" fill="#d9dee5" opacity=".16" stroke="#56606d"/>
    ${lamp(29,'<rect x="186" y="139" width="48" height="3" rx="1.5" fill="FILL"/>','w')}
    <g data-charge="rear"><rect x="42" y="124" width="12" height="10" rx="2" fill="#20262f" stroke="#3a4350"/><rect class="led" x="45" y="127" width="6" height="4" rx="1" fill="#3dff8b" opacity="0"/></g>
    ${cluster('L')}${H('rfog')?lamp(28,'<circle cx="92" cy="171" r="4" fill="FILL"/>','r'):''}${flipX(420, cluster('R'))}${tailBar}
  </svg>`;
}
function ctRear(car){
  const rb = ROWMAP.rbar.ch;
  return `<svg viewBox="0 0 420 230" preserveAspectRatio="xMidYMid meet">
    <ellipse data-glow="24,25,26" data-red="1" cx="210" cy="212" rx="190" ry="14" fill="#ff2a36" opacity="0" filter="url(#lsGlow2)"/>
    <ellipse cx="210" cy="198" rx="180" ry="7" fill="#000" opacity=".55"/>
    <rect x="50" y="172" width="46" height="26" rx="3" fill="#0a0d12"/><rect x="324" y="172" width="46" height="26" rx="3" fill="#0a0d12"/>
    <path d="M30 188 L30 132 L50 118 L370 118 L390 132 L390 188Z" fill="url(#lsBodyS)" stroke="#4b5563"/>
    <path d="M110 116 L150 70 L270 70 L310 116Z" fill="#1d232c" stroke="#4b5563"/><path d="M124 112 L156 76 L264 76 L296 112Z" fill="url(#lsGlass)"/>
    <rect x="44" y="120" width="332" height="6" fill="#120709"/>${barSegs(rb,70,350,121.5,3)}
    ${lamp(25,'<rect x="46" y="121" width="22" height="4" fill="FILL"/>','rd')}${lamp(26,'<rect x="352" y="121" width="22" height="4" fill="FILL"/>','rd')}
    ${lamp(22,'<rect x="40" y="130" width="14" height="4" fill="FILL"/>','a')}${lamp(23,'<rect x="366" y="130" width="14" height="4" fill="FILL"/>','a')}
    ${lamp(24,'<rect x="180" y="72" width="60" height="3" fill="FILL"/>','r')}${lamp(27,'<rect x="60" y="134" width="16" height="4" fill="FILL"/>','w')}
    <rect x="182" y="146" width="56" height="20" rx="3" fill="#d9dee5" opacity=".16" stroke="#56606d"/>${lamp(29,'<rect x="186" y="143" width="48" height="3" fill="FILL"/>','w')}
    <g data-charge="rear"><rect x="34" y="140" width="12" height="10" rx="2" fill="#20262f" stroke="#4b5563"/><rect class="led" x="37" y="143" width="6" height="4" rx="1" fill="#3dff8b" opacity="0"/></g>
  </svg>`;
}

/* ---------- LATO sinistro (520×230), muso a sinistra ---------- */
function sidePath(body){
  if (body==='truck') return 'M24 168 L24 136 L44 128 L250 62 L494 112 L494 168 Q494 174 488 174 L30 174 Q24 174 24 168Z';
  const r = body==='suv' ? 62 : 76;
  return `M28 170 Q26 148 44 140 L118 126 Q160 ${r+16} 218 ${r+2} L318 ${r} Q378 ${r+4} 432 112 L478 124 Q494 130 494 150 L494 170 Q494 176 488 176 L34 176 Q28 176 28 170Z`;
}
function sideSVG(car){
  const C=CARS[car], H=id=>hasRow(car,id), u=++svgUid, tr=C.body==='truck';
  const r = C.body==='suv' ? 62 : 76;
  const wheel = x => `<circle cx="${x}" cy="174" r="35" fill="#06080c"/><circle cx="${x}" cy="174" r="30" fill="#0c0f14" stroke="#2a313b" stroke-width="2"/><circle cx="${x}" cy="174" r="17" fill="#1a2028" stroke="#39414d"/><circle cx="${x}" cy="174" r="4" fill="#39414d"/>`;
  const wF = tr ? 'M170 124 L236 82 L292 70 L292 124Z' : `M176 124 L222 ${r+8} L286 ${r+6} L286 124Z`;
  const wR = tr ? 'M300 124 L300 69 L380 84 L420 116 L420 124Z' : `M294 124 L294 ${r+6} L330 ${r+5} Q370 ${r+10} 400 116 L404 124Z`;
  const top = tr ? 66 : r+5, wh = 124-top;
  const win = (k, d) => `<clipPath id="wc${u}${k}"><path d="${d}"/></clipPath><path d="${d}" fill="#05070a"/><g clip-path="url(#wc${u}${k})"><g data-win="${k}" data-h="${wh}"><path d="${d}" fill="url(#lsGlass)"/><path d="${d}" fill="#9fb3cc" opacity=".06"/></g></g><path d="${d}" fill="none" stroke="#3a4350"/>`;
  const hatch = tr ? '' : C.body==='suv'
    ? `<g data-lift="side" style="transform-origin:330px ${r+2}px"><path d="M330 ${r} Q378 ${r+4} 432 112 L478 124 L476 132 L404 124 L400 116 Q370 ${r+10} 330 ${r+5}Z" fill="url(#lsBodyS)" stroke="#3a4350"/><path d="M336 ${r+6} Q368 ${r+11} 396 114 L402 122 L420 124 Q380 ${r+14} 336 ${r+6}Z" fill="url(#lsGlass)" opacity=".8"/></g>`
    : `<g data-lift="side" style="transform-origin:420px 112px"><path d="M420 110 L478 122 L478 128 L420 117Z" fill="#232a34" stroke="#3a4350"/></g>`;
  const head = C.style==='bar' || tr
    ? `${lamp(4,'<path d="M28 138 L60 132 L61 135 L29 141Z" fill="FILL"/>','w')}${lamp(0,'<rect x="32" y="146" width="10" height="4" rx="2" fill="FILL"/>','w')}${lamp(2,'<rect x="44" y="145" width="10" height="4" rx="2" fill="FILL"/>','w')}${lamp(12,'<rect x="26" y="151" width="6" height="4" fill="FILL"/>','a')}`
    : `<path d="M30 140 L64 134 Q70 134 70 139 L68 146 Q46 150 32 150Z" fill="#0c1016" stroke="#39414d"/>${lamp(4,'<path d="M32 141 L66 135 L67 138 L33 144Z" fill="FILL"/>','w')}${lamp(0,'<circle cx="44" cy="145" r="3.5" fill="FILL"/>','w')}${lamp(2,'<circle cx="56" cy="142.5" r="3.5" fill="FILL"/>','w')}${lamp(12,'<path d="M30 146 L38 145 L38 150 L31 150Z" fill="FILL"/>','a')}`;
  const tail = tr
    ? `${lamp(25,'<rect x="484" y="114" width="10" height="10" fill="FILL"/>','rd')}${lamp(22,'<rect x="486" y="126" width="8" height="5" fill="FILL"/>','a')}${lamp(24,'<rect x="486" y="133" width="8" height="4" fill="FILL"/>','r')}`
    : `<path d="M462 122 L490 128 Q494 132 492 138 L466 134Z" fill="#14070a" stroke="#3d2228"/>${lamp(25,'<path d="M464 123 L489 129 L490 132 L466 128Z" fill="FILL"/>','rd')}${lamp(24,'<path d="M476 131 L491 134 L491 137 L476 134Z" fill="FILL"/>','r')}${lamp(22,'<path d="M466 129 L475 131 L475 134 L466 133Z" fill="FILL"/>','a')}`;
  const falcon = H('falcon') ? `<g data-falcon="0"><path d="M292 124 L292 ${r+6} L330 ${r+5} Q366 ${r+9} 392 112 L392 160 L292 160Z" fill="url(#lsBodyS)" stroke="#4a5462" opacity=".95"/></g>` : '';
  const handles = (H('handF') ? `<rect data-handle="11" x="236" y="134" width="22" height="4" rx="2" fill="#5a6573"/>` : '') + (H('handR') ? `<rect data-handle="12" x="340" y="134" width="22" height="4" rx="2" fill="#5a6573"/>` : '');
  return `<svg viewBox="0 0 520 230" preserveAspectRatio="xMidYMid meet">
    <ellipse data-glow="0,2,14" cx="40" cy="200" rx="70" ry="10" fill="#cfe2ff" opacity="0" filter="url(#lsGlow2)"/>
    <ellipse data-glow="24,25" data-red="1" cx="490" cy="200" rx="50" ry="9" fill="#ff2a36" opacity="0" filter="url(#lsGlow2)"/>
    <ellipse cx="260" cy="207" rx="240" ry="7" fill="#000" opacity=".55"/>
    <path d="${sidePath(C.body)}" fill="url(#lsBodyS)" stroke="#3a4350"/>
    ${win(6,wF)}${win(7,wR)}${falcon}${hatch}
    <path d="M${tr?296:290} 124 L${tr?296:290} ${top+1}" stroke="#3a4350" stroke-width="5"/>
    <path d="M60 156 L470 156" stroke="#2c333e" stroke-width="1"/>
    ${handles}
    <g data-mir="4" data-mode="side" style="transform-origin:${tr?176:178}px 117px"><path d="M${tr?156:160} 116 Q${tr?154:158} 110 ${tr?162:166} 109 L${tr?176:178} 112 L${tr?176:178} 122 L${tr?162:166} 122 Q${tr?156:160} 121 ${tr?156:160} 116Z" fill="#232a34" stroke="#3a4350"/></g>
    ${wheel(118)}${wheel(408)}
    ${head}${H('smark')?lamp(18,'<rect x="33" y="154" width="7" height="4" rx="2" fill="FILL"/>','a'):''}${H('ffog')?lamp(14,'<circle cx="40" cy="162" r="3" fill="FILL"/>','w'):''}
    ${lamp(20,'<rect x="148" y="128" width="9" height="3" rx="1.5" fill="FILL"/>','a')}
    ${tail}${lamp(27,`<rect x="${tr?486:470}" y="${tr?139:140}" width="${tr?8:10}" height="3" rx="1.5" fill="FILL"/>`,'w')}
    <g data-charge="side"><rect class="door" x="446" y="127" width="11" height="9" rx="2" fill="#232a34" stroke="#3a4350"/><rect class="led" x="448" y="129" width="7" height="5" rx="1" fill="#3dff8b" opacity="0"/></g>
  </svg>`;
}

/* ---------- DALL'ALTO (200×400), muso in alto ---------- */
function topSVG(car, small){
  const C=CARS[car], H=id=>hasRow(car,id), tr=C.body==='truck', bar=C.style==='bar';
  const body = tr ? 'M48 62 L152 62 L158 86 L158 352 L152 364 L48 364 L42 352 L42 86Z'
                  : 'M60 64 Q100 46 140 64 Q156 74 156 110 L156 330 Q156 360 140 364 Q100 372 60 364 Q44 360 44 330 L44 110 Q44 74 60 64Z';
  const side = s => { const L = s==='L', o = L?{o:0,i:2,s:4,t:12,rep:20,tail:25,rt:22,mk:18}:{o:1,i:3,s:5,t:13,rep:21,tail:26,rt:23,mk:19};
    return `${lamp(o.s, tr?'<rect x="50" y="60" width="18" height="4" fill="FILL"/>':'<path d="M54 76 Q60 64 80 60 L81 65 Q66 68 58 79Z" fill="FILL"/>','w')}
      ${lamp(o.o,'<circle cx="60" cy="72" r="3.4" fill="FILL"/>','w')}${lamp(o.i,'<circle cx="70" cy="67.5" r="3.4" fill="FILL"/>','w')}
      ${lamp(o.t,'<path d="M45 86 L50 76 L53 79 L48 89Z" fill="FILL"/>','a')}${lamp(o.rep,'<rect x="41" y="118" width="4" height="9" rx="2" fill="FILL"/>','a')}
      ${lamp(o.tail, tr?'<rect x="46" y="361" width="24" height="4" fill="FILL"/>':'<path d="M50 350 Q56 362 80 366 L80 361 Q62 358 55 347Z" fill="FILL"/>','rd')}
      ${lamp(o.rt,'<path d="M45 340 L49 350 L52 347 L48 337Z" fill="FILL"/>','a')}`; };
  const glass = tr ? '<path d="M56 120 L144 120 L144 250 L56 250Z" fill="url(#lsGlass)"/><path d="M56 254 L144 254 L144 352 L56 352Z" fill="#161b22" stroke="#2c333e"/>'
                   : '<rect x="58" y="128" width="84" height="170" rx="24" fill="url(#lsGlass)"/>';
  const wins = [[6,'L',150,206],[7,'L',212,268],[8,'R',150,206],[9,'R',212,268]].map(([k,s,a,b])=>`<rect data-win="${k}" data-mode="top" x="${s==='L'?45:151}" y="${a}" width="4" height="${b-a}" rx="2" fill="#7f90a8" opacity=".55"/>`).join('');
  const bars = tr ? `${barSegs(ROWMAP.fbar.ch.slice().reverse(),52,148,57,3)}${barSegs(ROWMAP.rbar.ch,52,148,366,3)}` : '';
  const fbarSig = bar && !tr ? lamp(4,'<path d="M78 58 Q90 54 100 54 L100 57 Q90 57 79 61Z" fill="FILL"/>','w', false)+flipX(200,lamp(5,'<path d="M78 58 Q90 54 100 54 L100 57 Q90 57 79 61Z" fill="FILL"/>','w', false)) : '';
  const rbarTail = bar && !tr ? lamp(25,'<path d="M80 366 L100 367 L100 370 L80 369Z" fill="FILL"/>','rd', false)+flipX(200,lamp(26,'<path d="M80 366 L100 367 L100 370 L80 369Z" fill="FILL"/>','rd', false)) : '';
  return `<svg viewBox="${small?'-10 -40 220 450':'-60 -10 320 420'}" preserveAspectRatio="xMidYMid meet">
    <path data-beam="0,2" d="M56 70 L-20 -120 L84 -120 L76 62Z" fill="url(#lsBeam)" opacity="0"/>
    <path data-beam="1,3" d="M144 70 L220 -120 L116 -120 L124 62Z" fill="url(#lsBeam)" opacity="0"/>
    <path data-beam="24,25,26" data-red="1" d="M52 360 L10 450 L190 450 L148 360Z" fill="url(#lsRedBeam)" opacity="0"/>
    <path d="${body}" fill="url(#lsBodyS)" stroke="#3d4653"/>
    ${glass}
    ${wins}
    <g data-lift="top"><path d="${tr?'M54 300 L146 300 L146 352 L54 352Z':'M62 302 L138 302 Q138 340 130 350 Q100 356 70 350 Q62 340 62 302Z'}" fill="#1b2129" stroke="#333b47"/></g>
    <g data-mir="4" data-mode="top" style="transform-origin:45px 140px"><path d="M45 136 L30 133 Q26 137 30 144 L45 144Z" fill="#232a34" stroke="#3d4653"/></g>
    <g data-mir="5" data-mode="top" style="transform-origin:155px 140px"><path d="M155 136 L170 133 Q174 137 170 144 L155 144Z" fill="#232a34" stroke="#3d4653"/></g>
    ${side('L')}${flipX(200, side('R'))}${fbarSig}${rbarTail}${bars}
    ${lamp(24, tr?'<rect x="86" y="356" width="28" height="3" fill="FILL"/>':'<rect x="88" y="354" width="24" height="3" rx="1.5" fill="FILL"/>','r')}
    ${H('rev')?lamp(27,'<rect x="58" y="355" width="8" height="3" fill="FILL"/>','w'):''}
    <g data-charge="top"><rect x="40" y="316" width="6" height="10" rx="2" fill="#20262f"/><rect class="led" x="41" y="318" width="4" height="6" rx="1" fill="#3dff8b" opacity="0"/></g>
  </svg>`;
}

/* piccola silhouette per le schede di scelta */
function carIcon(car){
  const b = CARS[car].body;
  return `<svg viewBox="20 40 480 150" aria-hidden="true"><path d="${sidePath(b)}" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><circle cx="118" cy="174" r="26" fill="var(--panel2)" stroke="currentColor" stroke-width="7"/><circle cx="408" cy="174" r="26" fill="var(--panel2)" stroke="currentColor" stroke-width="7"/></svg>`;
}

/* ---------- animazione ---------- */
function prepSVG(root){
  const q = s => Array.from(root.querySelectorAll(s));
  return {
    lamps: q('.lp').map(g=>({ch:+g.dataset.ch, on:g.querySelector('.on'), h:g.querySelector('.h')})),
    bars: q('[data-bar]').map(el=>({ch:+el.dataset.bar, el})),
    glows: q('[data-glow]').map(el=>({chs:el.dataset.glow.split(',').map(Number), el, red:!!el.dataset.red})),
    beams: q('[data-beam]').map(el=>({chs:el.dataset.beam.split(',').map(Number), el})),
    mirs: q('[data-mir]').map(el=>({k:+el.dataset.mir, mode:el.dataset.mode, el})),
    wins: q('[data-win]').map(el=>({k:+el.dataset.win, h:+el.dataset.h||0, mode:el.dataset.mode||'side', el})),
    lifts: q('[data-lift]').map(el=>({mode:el.dataset.lift, el})),
    charges: q('[data-charge]').map(el=>({mode:el.dataset.charge, led:el.querySelector('.led'), door:el.querySelector('.door')})),
    falcons: q('[data-falcon]').map(el=>({k:+el.dataset.falcon, el})),
    handles: q('[data-handle]').map(el=>({k:+el.dataset.handle, el}))
  };
}
function paintSVG(P, show, t){
  if (!show || !show.sim) return;
  const sim=show.sim, rnd=show.rnd, f=Math.max(0, Math.min(sim.frames-1, Math.floor(t*1000/rnd.step)));
  const I=sim.I, NL=sim.NL, pos=sim.pos, D=sim.dancing, NC=sim.NC;
  const li = c => I[f*NL+c];
  for (const o of P.lamps){ const v=li(o.ch); o.on.setAttribute('opacity', v.toFixed(3)); if (o.h) o.h.setAttribute('opacity', (v*0.95).toFixed(3)); }
  if (rnd.nch===200) for (const o of P.bars){ const v=rnd.buf[f*rnd.nch+o.ch]/255; o.el.setAttribute('opacity',(0.07+0.93*v).toFixed(3)); }
  for (const g of P.glows){ let m=0; for (const c of g.chs) m=Math.max(m, li(c)); g.el.setAttribute('opacity', Math.min(g.red?0.35:0.55, m*(g.red?0.32:0.48)).toFixed(3)); }
  for (const b of P.beams){ let m=0; for (const c of b.chs) m=Math.max(m, li(c)); b.el.setAttribute('opacity', (m*0.9).toFixed(3)); }
  const p = k => pos[f*NC+k], dn = k => D[f*NC+k];
  for (const m of P.mirs){ const v=p(m.k);
    if (m.mode==='front'){ const dir = m.k===5?1:-1; m.el.style.transform=`rotate(${((1-v)*50*dir).toFixed(1)}deg) scaleX(${(0.55+0.45*v).toFixed(3)})`; }
    else if (m.mode==='side') m.el.style.transform=`scaleX(${(0.45+0.55*v).toFixed(3)})`;
    else { const dir = m.k===4?-1:1; m.el.style.transform=`rotate(${((1-v)*-62*dir).toFixed(1)}deg)`; } }
  for (const w of P.wins){ const v=p(w.k);
    if (w.mode==='top'){ w.el.setAttribute('fill', v>0.05?'#04060a':'#7f90a8'); w.el.setAttribute('opacity', v>0.05? (0.6+0.4*v).toFixed(2) : '.55'); }
    else w.el.setAttribute('transform', `translate(0 ${(v*w.h).toFixed(2)})`); }
  for (const l of P.lifts){ const v=p(10);
    if (l.mode==='rear') l.el.setAttribute('transform', `translate(0 ${(-v*18).toFixed(2)})`);
    else if (l.mode==='side') l.el.style.transform = `rotate(${(-v*38).toFixed(1)}deg)`;
    else l.el.setAttribute('transform', `translate(0 ${(v*26).toFixed(2)})`); }
  for (const c of P.charges){ const v=p(15), d=dn(15);
    if (c.led){ c.led.setAttribute('opacity', v>0.3?'1':'0'); c.led.setAttribute('fill', d ? `hsl(${(t*240)%360} 100% 60%)` : '#3dff8b'); }
    if (c.door) c.door.setAttribute('transform', `translate(${(v*9).toFixed(2)} 0)`); }
  for (const fl of P.falcons){ const v=p(fl.k); fl.el.setAttribute('transform', `translate(0 ${(-v*58).toFixed(2)})`); fl.el.setAttribute('opacity', (1-v*0.35).toFixed(2)); }
  for (const h of P.handles){ const v=p(h.k); h.el.setAttribute('fill', v>0.5?'#c9d3df':'#5a6573'); }
}
