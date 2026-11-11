// Email lunar „Ai mai vizitat vreun oraș nou?”: orașele căutate (search_history) care nu sunt în visited_cities.
// Rulează din pg_cron o dată pe lună (vezi README.md din acest folder), nu din browser.
// Secrete: RESEND_API_KEY, CRON_SECRET (același în headerul x-cron-secret al jobului). Folosește service role.
// Trimite doar abonaților la newsletter (subscribers.newsletter = true, fără unsubscribed_at).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DAY = 864e5;
const MIN_AGE_DAYS = 3;      // orașul trebuie căutat de cel puțin 3 zile
const LOOKBACK_DAYS = 90;    // doar căutările din ultimele 90 de zile
const REMIND_EVERY_DAYS = 30;
const MAX_CITIES = 6;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const niceName = (slug: string) => slug.split("_")[0].split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("-");

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const dryRun = new URL(req.url).searchParams.has("dry");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const { data: rows, error } = await sb.from("search_history")
    .select("user_id, city_id, last_searched_at, first_searched_at, reminded_at")
    .gte("last_searched_at", iso(now - LOOKBACK_DAYS * DAY))
    .lte("first_searched_at", iso(now - MIN_AGE_DAYS * DAY))
    .or(`reminded_at.is.null,reminded_at.lt.${iso(now - REMIND_EVERY_DAYS * DAY)}`);
  if (error) return new Response(`search_history: ${error.message}`, { status: 500 });

  const byUser = new Map<string, { city_id: string; last: string }[]>();
  for (const r of rows ?? []) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id)!.push({ city_id: r.city_id, last: r.last_searched_at });
  }
  if (!byUser.size) return Response.json({ users: 0, sent: 0 });

  const ids = [...byUser.keys()];
  const [{ data: visited }, { data: subs }] = await Promise.all([
    sb.from("visited_cities").select("user_id, city_id").in("user_id", ids),
    sb.from("subscribers").select("user_id, email, unsubscribe_token").in("user_id", ids).eq("newsletter", true).is("unsubscribed_at", null),
  ]);
  const seen = new Set((visited ?? []).map((v) => `${v.user_id}|${v.city_id}`));
  const subByUser = new Map((subs ?? []).map((s) => [s.user_id, s]));

  let sent = 0;
  const report: { user: string; cities: string[] }[] = [];
  for (const [userId, list] of byUser) {
    const sub = subByUser.get(userId);
    if (!sub?.email) continue;
    const cities = list.filter((c) => !seen.has(`${userId}|${c.city_id}`))
      .sort((a, b) => b.last.localeCompare(a.last)).slice(0, MAX_CITIES).map((c) => c.city_id);
    if (!cities.length) continue;
    report.push({ user: userId, cities });
    if (dryRun) continue;

    const link = `https://23citybreak.ro/?orase-vazute=1#configurator`;
    const unsub = `https://23citybreak.ro/dezabonare.html?t=${sub.unsubscribe_token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#141516">
      <p style="color:#8a6a33;font-weight:700;letter-spacing:.08em;font-size:12px">23CITYBREAK</p>
      <h1 style="font-size:26px;margin:8px 0">Ai mai vizitat vreun oraș nou?</h1>
      <p style="font-size:16px">Luna trecută ai căutat zboruri spre:</p>
      <p style="font-size:18px;font-weight:700">${cities.map((c) => esc(niceName(c))).join(" · ")}</p>
      <p style="font-size:15px">Dacă ai ajuns în vreunul, marchează-l ca văzut. Așa îți arătăm doar destinații noi când cauți „doar orașe noi”.</p>
      <p><a href="${link}" style="background:#dfa649;color:#15130f;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Marchează orașele văzute</a></p>
      <p style="font-size:12px;color:#8a8d85">Primești acest email pentru că ești abonat la newsletterul 23ai și 23citybreak. <a href="${unsub}" style="color:#8a8d85">Dezabonare</a>.</p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "23citybreak <office@23ai.ro>", to: sub.email, subject: "Ai mai vizitat vreun oraș nou?", html }),
    });
    if (!res.ok) continue;
    sent++;
    await sb.from("search_history").update({ reminded_at: iso(now) }).eq("user_id", userId).in("city_id", list.map((c) => c.city_id));
  }
  return Response.json({ users: report.length, sent, dryRun, report: dryRun ? report : undefined });
});
