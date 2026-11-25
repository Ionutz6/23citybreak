// click-log: primește din browser un click pe un link ieșit (partener, pagină, oraș/eveniment) și îl salvează în public.outbound_clicks.
//   POST { partner: 'Kiwi', page: 'weekend', city?: 'BCN', label?: 'Real Madrid' }  (content-type text/plain, ca să nu fie nevoie de preflight)
// Publică (fără JWT), cu verificare de origine. Nu salvează nimic care identifică vizitatorul: nu citește IP, user-agent sau cookie.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = "https://23citybreak.ro";
const ORIGINS = new Set([SITE, "https://www.23citybreak.ro", "https://ionutz6.github.io", "http://localhost:8080", "http://127.0.0.1:8080"]);
const PARTNERS = new Set(["Kiwi", "Skyscanner", "Airbnb", "Booking", "Klook", "GetYourGuide", "Viator", "Ticketmaster", "Travelpayouts", "Google"]);
const cors = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return { "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : SITE, "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
};
const reply = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
// deno-lint-ignore no-control-regex
const clean = (v: unknown, n: number) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) || null : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "POST" }, 405);
  if (!ORIGINS.has(req.headers.get("origin") ?? "")) return reply(req, { error: "origin" }, 403);
  // deno-lint-ignore no-explicit-any
  let b: any; try { b = JSON.parse(await req.text()); } catch { return reply(req, { error: "json" }, 400); }
  if (!PARTNERS.has(b?.partner) || typeof b?.page !== "string" || !/^[a-z0-9._-]{1,40}$/.test(b.page)) return reply(req, { error: "forma" }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await sb.from("outbound_clicks").insert({ partner: b.partner, page: b.page, city: clean(b.city, 80), label: clean(b.label, 100) });
  return error ? reply(req, { error: "db" }, 500) : reply(req, { ok: true });
});
