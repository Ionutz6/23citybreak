// price-sync: aduce zilnic în public.route_prices cele mai mici prețuri dus-întors (vineri → duminică, următoarele 8 weekenduri)
// din Travelpayouts Data API (aviasales/v3/prices_for_dates: prețuri găsite de utilizatori în ultimele 48 h), pentru orașele cu ilustrație.
// Rulează din pg_cron (vezi README.md). Secrete: CRON_SECRET, TRAVELPAYOUTS_TOKEN. Opțional: PRICE_ORIGINS="OTP,CLJ" (implicit OTP).
// Fără cheie funcția răspunde 'missing token'. ?dry = nu scrie; ?limit=3 = doar 3 orașe; ?from=50&limit=50 = a doua jumătate.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { SITE, cheapest, cityIatas, guideIds, weekendPairs } from "./prices.ts";

const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const PARALLEL = 8;

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const token = Deno.env.get("TRAVELPAYOUTS_TOKEN");
  if (!token) return Response.json({ error: "missing token: pune TRAVELPAYOUTS_TOKEN în secretele funcției" }, { status: 400 });
  const q = new URL(req.url).searchParams, dry = q.has("dry"), limit = +(q.get("limit") ?? 0), from = +(q.get("from") ?? 0);
  const origins = (Deno.env.get("PRICE_ORIGINS") ?? "OTP").split(",").map((s) => s.trim()).filter((s) => /^[A-Z]{3}$/.test(s));
  const log: string[] = [];

  const [c, g] = await Promise.all([fetch(`${SITE}/assets/europe-cities.js`), fetch(`${SITE}/assets/illustrated-guides.js`)]);
  if (!c.ok || !g.ok) return new Response(`site: HTTP ${c.status}/${g.status}`, { status: 502 });
  let dests = [...cityIatas(await c.text(), guideIds(await g.text()))];
  if (!dests.length) return new Response("niciun oraș cu ilustrație", { status: 502 });
  dests = dests.slice(from, limit > 0 ? from + limit : undefined); // ?from=50&limit=50 = a doua jumătate (timpul funcției e limitat)

  const today = new Date().toISOString().slice(0, 10);
  const jobs = origins.flatMap((origin) => dests.flatMap(([dest, iata]) => weekendPairs(today).map((w) => ({ origin, dest, iata, ...w }))));
  const rows: Record<string, unknown>[] = [];
  let failed = 0, empty = 0, i = 0, firstError = "";
  const now = new Date().toISOString();
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++];
      if (j.iata === j.origin) continue;
      const u = new URL(API);
      u.search = new URLSearchParams({ origin: j.origin, destination: j.iata, departure_at: j.out, return_at: j.back, unique: "false", sorting: "price", currency: "eur", limit: "30", token }).toString();
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) { failed++; firstError ||= `HTTP ${r.status}`; continue; }
        const best = cheapest(await r.json());
        if (!best) { empty++; continue; }
        rows.push({ origin: j.origin, dest: j.dest, out_date: j.out, back_date: j.back, price_eur: best.price, direct: best.direct, source: "travelpayouts", seen_at: now });
      } catch (e) { failed++; firstError ||= String(e); }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  log.push(`cereri: ${jobs.length}, cu preț: ${rows.length}, fără preț: ${empty}, eșuate: ${failed}${firstError ? ` (prima eroare: ${firstError})` : ""}`);
  if (dry) return Response.json({ dry: true, log, sample: rows.slice(0, 5) });
  if (!rows.length) return Response.json({ log, written: 0 }, { status: failed ? 502 : 200 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  for (let k = 0; k < rows.length; k += 500) {
    const { error } = await sb.from("route_prices").upsert(rows.slice(k, k + 500), { onConflict: "origin,dest,out_date,back_date,source" });
    if (error) return Response.json({ error: error.message, log }, { status: 500 });
  }
  return Response.json({ log, written: rows.length });
});
