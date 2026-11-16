// price-report: primește din browser prețurile găsite de un vizitator în căutarea de pe zboruri.html și le salvează în
// public.route_prices (source = 'visitor'), ca Home să afișeze prețuri reale fără cereri Kiwi de pe server.
//   POST { origin: 'OTP', items: [{ dest: 'City:rome_it', out: '2026-12-04', back: '2026-12-06', price: 63, direct: true }, ...] }  (max 300)
// Publică (fără JWT), ca events-search. Un preț se salvează doar dacă trece de validare (date de weekend în următoarele 75 de zile,
// 25–600 €) și, când avem cache Travelpayouts pentru aceeași rută și dată, nu se abate de el cu mai mult de ×2 / ÷2.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { plausible, validateReport } from "../price-sync/prices.ts";

const SITE = "https://23citybreak.ro";
const ORIGINS = new Set([SITE, "https://www.23citybreak.ro", "https://ionutz6.github.io", "http://localhost:8080", "http://127.0.0.1:8080"]);
const cors = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return { "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : SITE, "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
};
const reply = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "POST" }, 405);
  if (!ORIGINS.has(req.headers.get("origin") ?? "")) return reply(req, { error: "origin" }, 403);
  // deno-lint-ignore no-explicit-any
  let body: any; try { body = await req.json(); } catch { return reply(req, { error: "json" }, 400); }
  if (typeof body?.origin !== "string" || !/^[A-Z]{3}$/.test(body.origin) || !Array.isArray(body.items)) return reply(req, { error: "forma" }, 400);
  const today = new Date().toISOString().slice(0, 10);
  const items = body.items.slice(0, 300).map((r: unknown) => validateReport(r, today)).filter(Boolean) as NonNullable<ReturnType<typeof validateReport>>[];
  if (!items.length) return reply(req, { saved: 0 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cached } = await sb.from("route_prices").select("dest,out_date,back_date,price_eur,source,seen_at").eq("origin", body.origin)
    .in("dest", [...new Set(items.map((i) => i.dest))]).gte("out_date", today);
  const key = (c: { dest: string; out_date?: string; back_date?: string }, o?: string, b?: string) => `${c.dest}|${c.out_date ?? o}|${c.back_date ?? b}`;
  const ref = new Map((cached ?? []).filter((c) => c.source === "travelpayouts").map((c) => [key(c), c.price_eur as number]));
  // Un vizitator cu filtre (ex. doar după 18:00) vede prețuri mai mari: păstrăm cel mai mic preț raportat în ultimele 24 h.
  const recent = new Map((cached ?? []).filter((c) => c.source === "visitor" && Date.now() - Date.parse(c.seen_at) < 864e5).map((c) => [key(c), c.price_eur as number]));
  const now = new Date().toISOString();
  const rows = items.filter((i) => plausible(i.price, ref.get(key({ dest: i.dest }, i.out, i.back))) && !(recent.get(key({ dest: i.dest }, i.out, i.back)) <= i.price))
    .map((i) => ({ origin: body.origin, dest: i.dest, out_date: i.out, back_date: i.back, price_eur: i.price, direct: i.direct, source: "visitor", seen_at: now }));
  if (!rows.length) return reply(req, { saved: 0 });
  const { error } = await sb.from("route_prices").upsert(rows, { onConflict: "origin,dest,out_date,back_date,source" });
  return error ? reply(req, { error: "db" }, 500) : reply(req, { saved: rows.length });
});
