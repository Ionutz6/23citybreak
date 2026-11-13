// events-search: căutarea de pe evenimente.html („Oasis”, „Coldplay”, „Real Madrid”), dincolo de ce avem deja în tabelă.
//   GET ?q=oasis → { events: [...], tm: 'on'|'cached'|'off'|'limit'|'error', found, weekday }
// 1. Dacă aceeași căutare a fost trimisă la Ticketmaster în ultimele 6 ore (event_search_cache), nu o repetăm.
// 2. Altfel, cu TICKETMASTER_API_KEY: un singur apel Discovery cu keyword, în Europa, 400 de zile înainte.
//    Evenimentele de weekend din orașele cu zbor se salvează în public.events, deci apar și la ceilalți.
// 3. Răspunsul vine mereu din public.search_events (aceeași căutare ca pe site, fără diacritice, cu toleranță la greșeli).
// Fără cheie funcția merge în continuare (tm: 'off'): caută doar în tabelă.
// Limite Ticketmaster: 5 apeluri/s, 5.000/zi. Aici: cel mult 1 apel/250 ms per instanță și 1.500/zi pentru căutare
// (restul rămâne pentru events-sync, ~180/zi). Publică (fără JWT), ca și tabela events.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { parseCityCoords, TM_COUNTRIES } from "../events-sync/normalize.ts";
import { fromSearch, normQuery } from "./search.ts";

const SITE = "https://23citybreak.ro";
const CACHE_HOURS = 6;
const DAILY_CAP = 1500;
const DAYS_AHEAD = 400;
const ORIGINS = new Set(["https://23citybreak.ro", "https://www.23citybreak.ro", "https://ionutz6.github.io", "http://localhost:8080", "http://127.0.0.1:8080"]);

const cors = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return { "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : SITE, "Access-Control-Allow-Headers": "authorization, apikey, content-type", Vary: "Origin" };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });

let citiesCache: { at: number; list: ReturnType<typeof parseCityCoords> } | null = null;
async function cities() {
  if (citiesCache && Date.now() - citiesCache.at < 6 * 3600e3) return citiesCache.list;
  const res = await fetch(`${SITE}/assets/city-coords.js`);
  if (!res.ok) throw new Error(`city-coords: HTTP ${res.status}`);
  const list = parseCityCoords(await res.text()).filter((c) => TM_COUNTRIES.has(c.cc));
  citiesCache = { at: Date.now(), list };
  return list;
}

let lastCall = 0;
const throttle = async () => { const wait = lastCall + 250 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastCall = Date.now(); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors(req), "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  const url = new URL(req.url);
  const raw = (url.searchParams.get("q") ?? "").slice(0, 80);
  const q = normQuery(raw);
  if (q.length < 2) return json(req, { error: "q prea scurt" }, 400);
  const cityIds = (url.searchParams.get("cities") ?? "").split(",").filter((c) => /^[a-z0-9-]+_[a-z]{2}$/.test(c)).slice(0, 5);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const key = Deno.env.get("TICKETMASTER_API_KEY");
  let tm = "off", found = 0, weekday = 0;

  if (key && q.length >= 3) {
    const since = new Date(Date.now() - CACHE_HOURS * 3600e3).toISOString();
    const { data: hit } = await sb.from("event_search_cache").select("fetched_at, found").eq("q_norm", q).gte("fetched_at", since).maybeSingle();
    if (hit) { tm = "cached"; found = hit.found; }
    else {
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const { count } = await sb.from("event_search_cache").select("q_norm", { count: "exact", head: true }).gte("fetched_at", today.toISOString());
      if ((count ?? 0) >= DAILY_CAP) tm = "limit";
      else {
        const from = new Date(), to = new Date(Date.now() + DAYS_AHEAD * 864e5);
        const u = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
        u.search = new URLSearchParams({
          apikey: key, keyword: raw.trim(), latlong: "50.0,10.0", radius: "2200", unit: "km", locale: "*", size: "100", sort: "relevance,desc",
          startDateTime: `${from.toISOString().slice(0, 19)}Z`, endDateTime: `${to.toISOString().slice(0, 10)}T23:59:59Z`,
        }).toString();
        try {
          await throttle();
          const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
          if (res.status === 429) tm = "limit";
          else if (!res.ok) tm = "error";
          else {
            const r = fromSearch((await res.json())?._embedded?.events ?? [], await cities());
            found = r.rows.length; weekday = r.weekday; tm = "on";
            if (r.rows.length) {
              const { error } = await sb.from("events").upsert(r.rows.map((x) => ({ ...x, updated_at: new Date().toISOString() })));
              if (error) console.error("upsert events", error.message);
            }
          }
        } catch (e) { console.error("tm", (e as Error).message); tm = "error"; }
        await sb.from("event_search_cache").upsert({ q_norm: q, fetched_at: new Date().toISOString(), found, status: tm === "on" ? "ok" : tm });
      }
    }
  }

  const { data: events, error } = await sb.rpc("search_events", { q: raw, city_ids: cityIds, lim: 30 });
  if (error) return json(req, { error: error.message, tm }, 500);
  return json(req, { events: events ?? [], tm, found, weekday });
});
