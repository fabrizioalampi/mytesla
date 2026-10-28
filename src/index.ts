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
 */

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  N2YO_API_KEY?: string;
  /* solo per i test in locale: indirizzo di un server finto al posto di N2YO */
  N2YO_BASE?: string;
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "GET") return fail(405, "Metodo non ammesso");
      try { return await handle(url, env, ctx); }
      catch { return fail(500, "Errore interno"); }
    }
    return env.ASSETS.fetch(request);
  },
};
