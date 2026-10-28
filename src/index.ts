/*
 * mytesla: Worker per /api/* (il resto del sito sono file statici con gli header di public/_headers).
 *
 * Satelliti sopra di te, dati da N2YO (https://www.n2yo.com/api/):
 *   GET /api/satelliti/sopra?lat=..&lon=..       -> above, tutte le categorie, raggio 90 gradi
 *   GET /api/satelliti/passaggi?id=..&lat=..&lon=.. -> visualpasses, 5 giorni, almeno 60 s visibile
 *   GET /api/satelliti/tle?id=..                 -> tle
 *
 * Regole:
 * - la chiave arriva dal segreto N2YO_API_KEY e non esce mai dal Worker (non è nelle risposte né nei log);
 * - solo questi endpoint, ID numerici, latitudine e longitudine valide: non è un proxy;
 * - la posizione è arrotondata a 0,1 gradi (circa 10 km) prima di chiamare N2YO e come chiave di cache;
 * - cache nella Cache API, con una durata per tipo di dato e una copia di riserva più lunga;
 * - limiti orari: N2YO dice in ogni risposta quante chiamate ha fatto la chiave nell'ultima ora;
 *   lo salviamo e ci fermiamo al 90% del limite, servendo l'ultima copia;
 * - dopo un errore di N2YO non si riprova per qualche minuto.
 *
 * In viaggio, codici brevi per spostare un viaggio tra auto e telefono:
 *   POST /api/viaggi/invia            -> salva il viaggio (JSON, massimo 64 KB) e restituisce un codice
 *   GET  /api/viaggi/ricevi?codice=.. -> consegna il viaggio una sola volta e lo cancella
 * Il viaggio resta in KV al massimo 24 ore. Si accettano invii solo dal sito stesso, con un tetto
 * di invii e di codici sbagliati per indirizzo IP e per ora.
 */

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  N2YO_API_KEY?: string;
  /* solo per i test in locale: indirizzo di un server finto al posto di N2YO */
  N2YO_BASE?: string;
  /* codici brevi di In viaggio */
  VIAGGI: KVNamespace;
}

const N2YO = "https://api.n2yo.com/rest/v1/satellite";
const CACHE_HOST = "https://mytesla.fabrizioalampi.it/__cache/n2yo";
const TIMEOUT_MS = 10000;
const MAX_BYTES = 4 * 1024 * 1024;
const BACKOFF_S = 10 * 60;

type Verb = "above" | "visualpasses" | "tle";
const LIMITS: Record<Verb, number> = { above: 100, visualpasses: 100, tle: 1000 };
/* quanto una copia resta "fresca" e per quanto la si tiene come riserva */
const FRESH_S: Record<Verb, number> = { above: 120, visualpasses: 3600, tle: 6 * 3600 };
const KEEP_S: Record<Verb, number> = { above: 30 * 60, visualpasses: 12 * 3600, tle: 7 * 24 * 3600 };
const BROWSER_S: Record<Verb, number> = { above: 60, visualpasses: 600, tle: 3600 };

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

function respond(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra } });
}
const fail = (status: number, message: string) => respond(JSON.stringify({ errore: message }), status, { "Cache-Control": "no-store" });

/* ---------- validazione ---------- */
function coord(v: string | null, max: number): number | null {
  if (v === null || !/^-?\d{1,3}(\.\d{1,8})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}
const round1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
function noradId(v: string | null): number | null {
  if (v === null || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 999999 ? n : null;
}
function onlyParams(url: URL, allowed: string[]): boolean {
  return [...url.searchParams.keys()].every((k) => allowed.includes(k));
}

/* ---------- chiamata a N2YO ---------- */
class UpstreamError extends Error {
  constructor(message: string, readonly kind: "limite" | "chiave" | "rete" | "dati") { super(message); }
}
async function readCapped(res: Response): Promise<string> {
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) throw new UpstreamError("risposta troppo grande", "dati");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new UpstreamError("risposta troppo grande", "dati"); }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.byteLength; }
  return new TextDecoder().decode(all);
}
async function callN2yo(env: Env, path: string): Promise<any> {
  const key = env.N2YO_API_KEY;
  if (!key) throw new UpstreamError("chiave N2YO non configurata", "chiave");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.N2YO_BASE || N2YO}/${path}/&apiKey=${encodeURIComponent(key)}`, { signal: ctrl.signal, redirect: "manual", headers: { Accept: "application/json" } });
  } catch {
    throw new UpstreamError("N2YO non risponde (timeout o rete)", "rete");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new UpstreamError(`N2YO HTTP ${res.status}`, "chiave");
  if (res.status === 429) throw new UpstreamError("N2YO HTTP 429", "limite");
  if (!res.ok) throw new UpstreamError(`N2YO HTTP ${res.status}`, "rete");
  let data: any;
  try { data = JSON.parse(await readCapped(res)); } catch (e) { if (e instanceof UpstreamError) throw e; throw new UpstreamError("risposta di N2YO non valida", "dati"); }
  if (data && typeof data.error === "string") {
    const m = data.error.toLowerCase();
    throw new UpstreamError("N2YO: errore", m.includes("key") ? "chiave" : m.includes("limit") || m.includes("exceed") ? "limite" : "dati");
  }
  if (!data || typeof data.info !== "object") throw new UpstreamError("risposta di N2YO non riconosciuta", "dati");
  return data;
}

/* ---------- cache, contatore e pausa dopo gli errori ---------- */
const cache = () => (caches as unknown as { default: Cache }).default;
const cacheReq = (p: string) => new Request(`${CACHE_HOST}/${p}`);
async function getJson(p: string): Promise<{ body: any; at: number } | null> {
  const r = await cache().match(cacheReq(p));
  if (!r) return null;
  try { return { body: await r.json(), at: Number(r.headers.get("X-At") || 0) }; } catch { return null; }
}
function putJson(ctx: ExecutionContext, p: string, body: any, keepS: number) {
  ctx.waitUntil(cache().put(cacheReq(p), new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${keepS}`, "X-At": String(Date.now()) } })));
}
async function overLimit(verb: Verb): Promise<boolean> {
  const c = await getJson(`conta/${verb}`);
  return !!c && Date.now() - c.at < 3600_000 && Number(c.body.n) >= LIMITS[verb] * 0.9;
}

/* Serve dalla cache se fresca; altrimenti chiama N2YO; se non si può, serve la copia vecchia. */
async function serve(ctx: ExecutionContext, env: Env, verb: Verb, key: string, path: string, shape: (d: any) => any): Promise<Response> {
  const hit = await getJson(`dati/${key}`);
  const age = hit ? Date.now() - hit.at : Infinity;
  const head = (state: string, at: number) => ({
    "Cache-Control": `public, max-age=${state === "vecchia" ? 60 : BROWSER_S[verb]}`,
    "X-Satelliti-Cache": state,
    "X-Satelliti-Aggiornato": new Date(at).toISOString(),
    "X-Satelliti-Fonte": "N2YO.com",
  });
  if (hit && age < FRESH_S[verb] * 1000) return respond(JSON.stringify(hit.body), 200, head("cache", hit.at));

  const paused = await getJson(`pausa/${verb}`);
  let reason = "";
  if (paused) reason = paused.body.motivo;
  else if (await overLimit(verb)) reason = "limite";
  else {
    try {
      const data = await callN2yo(env, path);
      const n = Number(data.info.transactionscount);
      if (Number.isFinite(n)) putJson(ctx, `conta/${verb}`, { n }, 3600);
      const body = shape(data);
      putJson(ctx, `dati/${key}`, body, KEEP_S[verb]);
      return respond(JSON.stringify(body), 200, head("nuova", Date.now()));
    } catch (e) {
      reason = e instanceof UpstreamError ? e.kind : "rete";
      putJson(ctx, `pausa/${verb}`, { motivo: reason }, reason === "limite" ? 15 * 60 : BACKOFF_S);
    }
  }
  if (hit) return respond(JSON.stringify(hit.body), 200, { ...head("vecchia", hit.at), "X-Satelliti-Motivo": reason });
  const msg: Record<string, string> = {
    limite: "Abbiamo esaurito per quest'ora le richieste gratuite al servizio dei satelliti. Riprova tra un po'.",
    chiave: "Il servizio dei satelliti non accetta la nostra chiave in questo momento. Riprova più tardi.",
    rete: "Il servizio dei satelliti (N2YO) non risponde. Riprova tra qualche minuto.",
    dati: "Il servizio dei satelliti ha mandato dati che non riesco a leggere. Riprova tra qualche minuto.",
  };
  return respond(JSON.stringify({ errore: msg[reason] || msg.rete, motivo: reason }), 503, { "Cache-Control": "no-store", "Retry-After": "300" });
}

/* ---------- forma delle risposte verso il browser (solo i campi che servono) ---------- */
const shapeAbove = (d: any) => ({
  t: Date.now(),
  sats: (Array.isArray(d.above) ? d.above : []).slice(0, 6000).map((s: any) => ({
    id: Number(s.satid), name: String(s.satname || "").slice(0, 60), intl: String(s.intDesignator || "").slice(0, 16),
    launch: String(s.launchDate || "").slice(0, 10), lat: Number(s.satlat), lng: Number(s.satlng), alt: Number(s.satalt),
  })),
});
const shapePasses = (d: any) => ({
  id: Number(d.info.satid), name: String(d.info.satname || ""),
  passes: (Array.isArray(d.passes) ? d.passes : []).slice(0, 60).map((p: any) => ({
    startAz: p.startAz, startEl: p.startEl, startUTC: p.startUTC, maxAz: p.maxAz, maxEl: p.maxEl, maxUTC: p.maxUTC,
    endAz: p.endAz, endEl: p.endEl, endUTC: p.endUTC, mag: p.mag, duration: p.duration,
  })),
});
const shapeTle = (d: any) => {
  const [l1, l2] = String(d.tle || "").split(/\r?\n/);
  if (!l1 || !l2) throw new UpstreamError("TLE mancante", "dati");
  return { id: Number(d.info.satid), name: String(d.info.satname || ""), line1: l1.trim(), line2: l2.trim() };
};

async function handle(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const p = url.pathname;
  if (p === "/api/satelliti/sopra") {
    const lat = coord(url.searchParams.get("lat"), 90), lon = coord(url.searchParams.get("lon"), 180);
    if (lat === null || lon === null || !onlyParams(url, ["lat", "lon"])) return fail(400, "Servono lat e lon validi (gradi decimali).");
    const a = round1(lat), b = round1(lon);
    return serve(ctx, env, "above", `above/${a}/${b}`, `above/${a}/${b}/0/90/0`, shapeAbove);
  }
  if (p === "/api/satelliti/passaggi") {
    const id = noradId(url.searchParams.get("id")), lat = coord(url.searchParams.get("lat"), 90), lon = coord(url.searchParams.get("lon"), 180);
    if (id === null || lat === null || lon === null || !onlyParams(url, ["id", "lat", "lon"])) return fail(400, "Servono un id numerico e lat e lon validi.");
    const a = round1(lat), b = round1(lon);
    return serve(ctx, env, "visualpasses", `passes/${id}/${a}/${b}`, `visualpasses/${id}/${a}/${b}/0/5/60`, shapePasses);
  }
  if (p === "/api/satelliti/tle") {
    const id = noradId(url.searchParams.get("id"));
    if (id === null || !onlyParams(url, ["id"])) return fail(400, "Serve un id numerico (NORAD).");
    return serve(ctx, env, "tle", `tle/${id}`, `tle/${id}`, shapeTle);
  }
  return fail(404, "Endpoint inesistente");
}


/* ================= In viaggio: codici brevi ================= */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";   // senza 0/O, 1/I/L
const CODE_TTL_S = 24 * 3600;
const MAX_TRIP_BYTES = 64 * 1024;
const MAX_SENDS_PER_HOUR = 20, MAX_MISSES_PER_HOUR = 30;
const noStore = { "Cache-Control": "no-store" };

function newCode(): string {
  const r = new Uint8Array(8);
  crypto.getRandomValues(r);
  let s = "";
  for (const b of r) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}
const showCode = (c: string) => c.slice(0, 4) + "-" + c.slice(4);
function cleanCode(v: string | null): string | null {
  const c = String(v || "").toUpperCase().replace(/[\s-]/g, "");
  return c.length === 8 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}
/* contatori approssimati per IP nella Cache API (per data center): bastano come freno */
async function ipKey(request: Request, what: string): Promise<Request> {
  const ip = request.headers.get("CF-Connecting-IP") || "locale";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("in-viaggio:" + ip));
  const hex = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://mytesla.fabrizioalampi.it/__cache/viaggi/${what}/${hex}`);
}
async function bump(ctx: ExecutionContext, key: Request): Promise<number> {
  const c = await cache().match(key);
  const n = (c ? Number(await c.text()) || 0 : 0) + 1;
  ctx.waitUntil(cache().put(key, new Response(String(n), { headers: { "Cache-Control": "public, max-age=3600" } })));
  return n;
}
async function count(key: Request): Promise<number> { const c = await cache().match(key); return c ? Number(await c.text()) || 0 : 0; }

/* tiene solo i campi del diario, con tipi e lunghezze controllati */
function cleanTrip(d: any): { viaggi: any[]; soste: any[] } | null {
  if (!d || d.app !== "in-viaggio" || !Array.isArray(d.viaggi) || !Array.isArray(d.soste)) return null;
  if (d.viaggi.length < 1 || d.viaggi.length > 5 || d.soste.length > 500) return null;
  const str = (v: any, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const viaggi = d.viaggi.filter((v: any) => v && typeof v.id === "string" && typeof v.nome === "string" && num(v.inizio) !== null)
    .map((v: any) => ({ id: str(v.id, 40), nome: str(v.nome, 50), inizio: v.inizio, fine: num(v.fine) }));
  const ids = new Set(viaggi.map((v: any) => v.id));
  const soste = d.soste.filter((s: any) => s && typeof s.id === "string" && ids.has(s.viaggio) && num(s.t) !== null && typeof s.luogo === "string")
    .map((s: any) => {
      const lat = num(s.lat), lon = num(s.lon), ok = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
      return { id: str(s.id, 40), viaggio: s.viaggio, t: s.t, luogo: str(s.luogo, 60), lat: ok ? lat : null, lon: ok ? lon : null, fonte: str(s.fonte, 10), nota: str(s.nota, 140), umore: str(s.umore, 12) || null };
    });
  return viaggi.length ? { viaggi, soste } : null;
}

async function handleTrips(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (url.pathname === "/api/viaggi/invia") {
    if (request.method !== "POST") return fail(405, "Metodo non ammesso");
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return fail(403, "Invio non permesso da questo sito.");
    if (!(request.headers.get("Content-Type") || "").includes("application/json")) return fail(415, "Serve un JSON.");
    const sendKey = await ipKey(request, "invii");
    if ((await count(sendKey)) >= MAX_SENDS_PER_HOUR) return fail(429, "Troppi invii in un'ora. Riprova più tardi.");
    let body: any;
    try {
      const res = new Response(request.body);
      const text = await (async () => { const reader = res.body!.getReader(); let total = 0; const parts: Uint8Array[] = []; for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_TRIP_BYTES) throw new Error("grande"); parts.push(value); } const all = new Uint8Array(total); let o = 0; for (const p of parts) { all.set(p, o); o += p.byteLength; } return new TextDecoder().decode(all); })();
      body = JSON.parse(text);
    } catch (e) {
      return fail(413, "Il viaggio è troppo grande o non è valido (massimo 64 KB).");
    }
    const trip = cleanTrip(body);
    if (!trip) return fail(400, "Non è un viaggio di In viaggio.");
    let code = "";
    for (let k = 0; k < 5 && !code; k++) { const c = newCode(); if (!(await env.VIAGGI.get("codice:" + c))) code = c; }
    if (!code) return fail(503, "Riprova tra un attimo.");
    await env.VIAGGI.put("codice:" + code, JSON.stringify({ app: "in-viaggio", versione: 1, ...trip }), { expirationTtl: CODE_TTL_S });
    await bump(ctx, sendKey);
    return respond(JSON.stringify({ codice: showCode(code), scade: new Date(Date.now() + CODE_TTL_S * 1000).toISOString() }), 200, noStore);
  }
  if (url.pathname === "/api/viaggi/ricevi") {
    if (request.method !== "GET") return fail(405, "Metodo non ammesso");
    const missKey = await ipKey(request, "sbagliati");
    if ((await count(missKey)) >= MAX_MISSES_PER_HOUR) return fail(429, "Troppi codici sbagliati in un'ora. Riprova più tardi.");
    const code = cleanCode(url.searchParams.get("codice"));
    if (!code || [...url.searchParams.keys()].some((k) => k !== "codice")) { await bump(ctx, missKey); return fail(400, "Il codice ha 8 caratteri, per esempio K7P4-QX2M."); }
    const data = await env.VIAGGI.get("codice:" + code);
    if (!data) { await bump(ctx, missKey); return fail(404, "Codice non trovato o scaduto (vale 24 ore e una sola volta)."); }
    await env.VIAGGI.delete("codice:" + code);   // si usa una volta sola
    return respond(data, 200, noStore);
  }
  return fail(404, "Endpoint inesistente");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/viaggi/")) {
      try { return await handleTrips(request, url, env, ctx); }
      catch { return fail(500, "Errore interno"); }
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "GET") return fail(405, "Metodo non ammesso");
      try { return await handle(url, env, ctx); }
      catch { return fail(500, "Errore interno"); }
    }
    return env.ASSETS.fetch(request);
  },
};
