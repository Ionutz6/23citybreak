// events-sync: aduce zilnic evenimentele următoarelor 120 de zile în tabela public.events.
// Surse: Ticketmaster Discovery (concerte, sport, teatru), football-data.org (fotbal), lista curatoriată de pe site.
// Rulează din pg_cron (vezi README.md), nu din browser. Cheile API stau doar aici, ca secrete.
// Secrete: CRON_SECRET, TICKETMASTER_API_KEY, FOOTBALL_DATA_API_KEY. Folosește service role.
// Parametri: ?only=tm|fd|cur (o singură sursă; recomandat, ca să rămână sub limita de timp), ?dry (nu scrie), ?limit=N (primele N orașe, pentru test).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { type City, type EventRow, collapseFestivalBlocks, fromCurated, dedupePerformances, dedupeSessions, fromFootballData, fromTicketmaster, parseCityCoords, TM_COUNTRIES } from "./normalize.ts";

const SITE = "https://23citybreak.ro";
const DAYS_AHEAD = 120;
const FD_DAYS_AHEAD = 240; // fotbal: tot sezonul, ca meciurile echipelor preferate să existe și peste 120 de zile (site-ul arată restul doar până la 120)
const FD_COMPETITIONS = ["CL", "PL", "PD", "SA", "BL1", "FL1", "DED", "PPL"]; // nivelul gratuit football-data.org
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const day = (d: Date) => d.toISOString().slice(0, 10);

// Cursuri BCE (Frankfurter): unități de monedă pentru 1 EUR. Dacă nu răspunde, rămân doar prețurile în EUR.
async function fetchFx(log: string[]): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR");
    if (res.ok) return (await res.json())?.rates ?? {};
    log.push(`fx: HTTP ${res.status}`);
  } catch (e) { log.push(`fx: ${e}`); }
  return {};
}

async function syncTicketmaster(cities: City[], key: string, log: string[]): Promise<EventRow[]> {
  const fx = await fetchFx(log);
  const priceSeen: Record<string, number> = {};
  const rows = new Map<string, EventRow>();
  const from = new Date(), to = new Date(Date.now() + DAYS_AHEAD * 864e5);
  for (const city of cities.filter((c) => TM_COUNTRIES.has(c.cc))) {
    for (const segment of ["Music", "Sports"]) {
      const u = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
      u.search = new URLSearchParams({
        apikey: key, latlong: `${city.lat},${city.lon}`, radius: "25", unit: "km", segmentName: segment,
        startDateTime: `${day(from)}T00:00:00Z`, endDateTime: `${day(to)}T23:59:59Z`, size: "100", sort: "relevance,desc",
      }).toString();
      const res = await fetch(u);
      if (res.status === 429) { log.push(`tm: limită atinsă la ${city.id}`); return [...rows.values()]; }
      if (!res.ok) { log.push(`tm ${city.id}/${segment}: HTTP ${res.status}`); await sleep(250); continue; }
      const list = (await res.json())?._embedded?.events ?? [];
      list.forEach((ev: unknown, i: number) => {
        const row = fromTicketmaster(ev, city, i, fx);
        for (const p of (ev as { priceRanges?: { currency?: string }[] })?.priceRanges ?? []) priceSeen[p.currency ?? "?"] = (priceSeen[p.currency ?? "?"] ?? 0) + 1;
        if (row && !rows.has(row.id)) rows.set(row.id, row);
      });
      await sleep(250); // sub 5 apeluri/secundă
    }
  }
  log.push(`tm: priceRanges pe monede ${JSON.stringify(priceSeen)}, ${[...rows.values()].filter((r) => r.price_min_eur).length}/${rows.size} cu preț`);
  return dedupePerformances(collapseFestivalBlocks(dedupeSessions([...rows.values()])));
}

async function syncFootball(key: string, log: string[]): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  const unmapped = new Set<string>();
  const from = day(new Date()), to = day(new Date(Date.now() + FD_DAYS_AHEAD * 864e5));
  for (const code of FD_COMPETITIONS) {
    const res = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`, { headers: { "X-Auth-Token": key } });
    if (!res.ok) log.push(`fd ${code}: HTTP ${res.status}`);
    else for (const m of (await res.json())?.matches ?? []) {
      const r = fromFootballData(m, code);
      if (r.row) rows.push(r.row);
      if (r.unmapped) unmapped.add(r.unmapped);
    }
    await sleep(6500); // nivelul gratuit: 10 apeluri/minut
  }
  if (unmapped.size) log.push(`fd echipe fără oraș: ${[...unmapped].sort().join(", ")}`);
  return rows;
}

async function syncCurated(cities: City[], log: string[]): Promise<EventRow[]> {
  const res = await fetch(`${SITE}/data/evenimente-curatoriate.json`);
  if (!res.ok) { log.push(`cur: HTTP ${res.status}`); return []; }
  const known = new Set(cities.map((c) => c.id));
  const today = day(new Date());
  // deno-lint-ignore no-explicit-any
  return ((await res.json())?.events ?? []).filter((e: any) => (e.ends ?? e.starts) >= today).map((e: unknown) => fromCurated(e, known)).filter(Boolean) as EventRow[];
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const only = q.get("only"), dry = q.has("dry"), limit = +(q.get("limit") ?? 0);
  const log: string[] = [];

  const coordsRes = await fetch(`${SITE}/assets/city-coords.js`);
  if (!coordsRes.ok) return new Response(`city-coords: HTTP ${coordsRes.status}`, { status: 502 });
  let cities = parseCityCoords(await coordsRes.text());
  if (!cities.length) return new Response("city-coords: niciun oraș", { status: 502 });
  if (limit > 0) cities = cities.slice(0, limit);

  const rows: EventRow[] = [];
  const tmKey = Deno.env.get("TICKETMASTER_API_KEY"), fdKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
  if (!only || only === "tm") tmKey ? rows.push(...await syncTicketmaster(cities, tmKey, log)) : log.push("tm: lipsește TICKETMASTER_API_KEY");
  if (!only || only === "fd") fdKey ? rows.push(...await syncFootball(fdKey, log)) : log.push("fd: lipsește FOOTBALL_DATA_API_KEY");
  if (!only || only === "cur") rows.push(...await syncCurated(cities, log));

  const bySource: Record<string, number> = {};
  for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  if (dry) return Response.json({ dry: true, bySource, log, sample: rows.slice(0, 5) });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("events").upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })));
    if (error) return Response.json({ error: error.message, bySource, log }, { status: 500 });
  }
  // Curățenie: evenimentele încheiate de peste 2 zile.
  const cutoff = new Date(Date.now() - 2 * 864e5).toISOString();
  await sb.from("events").delete().lt("starts_at", cutoff).or(`ends_at.is.null,ends_at.lt.${cutoff}`);
  return Response.json({ written: rows.length, bySource, log });
});
