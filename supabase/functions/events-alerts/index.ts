// events-alerts: emailurile de alertă pentru evenimente. Rulează din pg_cron (vezi README.md), nu din browser.
//   ?only=names  → alertele după nume (event_alerts): trimite o dată, când apare ceva nou care se potrivește, apoi alerta e marcată îndeplinită
//   ?only=digest → rezumatul săptămânal pentru cei cu event_preferences.event_alerts = true: evenimente noi potrivite preferințelor
//   ?dry         → nu trimite și nu scrie nimic, doar raportează
// Secrete: RESEND_API_KEY, CRON_SECRET. Folosește service role. Expeditor: office@23ai.ro (domeniu verificat în Resend).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { digestEmail, type Ev, nameAlertEmail, type Prefs, pickDigest } from "./match.ts";

const DAY = 864e5;
const MAX_SENDS = 100;          // cel mult atâtea emailuri pe rulare (Resend: ~2 cereri/secundă, funcția are limită de timp)
const DIGEST_WINDOW_DAYS = 8;   // evenimente intrate în baza noastră în ultimele 8 zile
const MIN_LEAD_DAYS = 2;        // nu anunțăm evenimente care încep peste mai puțin de 2 zile (nu mai poți face un plan)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Sb = ReturnType<typeof createClient>;
type Rcpt = { email: string; token: string };

// Email + token de dezabonare per utilizator (din subscribers; rândul se creează la prima autentificare, aici doar completăm ce lipsește).
async function recipients(sb: Sb, ids: string[]): Promise<Map<string, Rcpt>> {
  const out = new Map<string, Rcpt>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("subscribers").select("user_id, email, unsubscribe_token").in("user_id", ids.slice(i, i + 200));
    for (const s of data ?? []) if (s.email) out.set(s.user_id, { email: s.email, token: s.unsubscribe_token });
  }
  for (const id of ids.filter((x) => !out.has(x))) {
    const { data } = await sb.auth.admin.getUserById(id);
    const email = data?.user?.email;
    if (!email) continue;
    await sb.from("subscribers").upsert({ user_id: id, email, source: "23citybreak-alerte" }, { ignoreDuplicates: true });
    const { data: row } = await sb.from("subscribers").select("unsubscribe_token").eq("user_id", id).maybeSingle();
    if (row) out.set(id, { email, token: row.unsubscribe_token });
  }
  return out;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "23citybreak <office@23ai.ro>", to, subject, html }),
  });
  if (!res.ok) console.error("resend", res.status, (await res.text()).slice(0, 200));
  await sleep(600);
  return res.ok;
}
const unsubUrl = (r: Rcpt) => `https://23citybreak.ro/dezabonare.html?t=${r.token}&tip=alerte`;

async function names(sb: Sb, dry: boolean, log: string[]) {
  const { data: alerts, error } = await sb.from("event_alerts").select("id, user_id, query, created_at").is("notified_at", null).order("created_at").limit(500);
  if (error) throw new Error(`event_alerts: ${error.message}`);
  const now = Date.now(), byUser = new Map<string, { id: string; query: string; events: Ev[] }[]>();
  for (const a of alerts ?? []) {
    const { data } = await sb.rpc("search_events", { q: a.query, city_ids: [], lim: 20 });
    const fresh = ((data ?? []) as Ev[]).filter((e) => (e.first_seen_at ?? "") > a.created_at && Date.parse(e.starts_at) > now + MIN_LEAD_DAYS * DAY);
    if (!fresh.length) continue;
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id)!.push({ id: a.id, query: a.query, events: fresh });
  }
  const rcpt = await recipients(sb, [...byUser.keys()]);
  let sent = 0;
  const report: { user: string; queries: string[] }[] = [];
  for (const [user, groups] of byUser) {
    const r = rcpt.get(user);
    if (!r) { log.push(`names: fără email pentru ${user}`); continue; }
    report.push({ user, queries: groups.map((g) => g.query) });
    if (dry) continue;
    if (sent >= MAX_SENDS) { log.push("names: limită de trimiteri atinsă, restul la următoarea rulare"); break; }
    const mail = nameAlertEmail(groups, unsubUrl(r));
    if (!(await send(r.email, mail.subject, mail.html))) continue;
    sent++;
    const eventIds = [...new Set(groups.flatMap((g) => g.events.map((e) => e.id)))];
    await sb.from("event_alerts").update({ notified_at: new Date().toISOString() }).in("id", groups.map((g) => g.id));
    await sb.from("event_mail_log").insert({ user_id: user, kind: "name", event_ids: eventIds });
  }
  return { alerts: alerts?.length ?? 0, users: byUser.size, sent, report: dry ? report : undefined };
}

async function digest(sb: Sb, dry: boolean, log: string[]) {
  const now = Date.now(), iso = (ms: number) => new Date(ms).toISOString();
  const { data: prefs, error } = await sb.from("event_preferences").select("*").eq("event_alerts", true).limit(2000);
  if (error) throw new Error(`event_preferences: ${error.message}`);
  if (!prefs?.length) return { users: 0, sent: 0 };
  const { data: evs, error: e2 } = await sb.from("events").select("*")
    .gte("first_seen_at", iso(now - DIGEST_WINDOW_DAYS * DAY)).gte("starts_at", iso(now + MIN_LEAD_DAYS * DAY)).limit(2000);
  if (e2) throw new Error(`events: ${e2.message}`);
  if (!evs?.length) return { users: prefs.length, sent: 0, newEvents: 0 };

  const ids = prefs.map((p) => p.user_id as string);
  const logs = new Map<string, { recent: boolean; digestRecent: boolean; sent: Set<string> }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("event_mail_log").select("user_id, kind, event_ids, sent_at").in("user_id", ids.slice(i, i + 200)).gte("sent_at", iso(now - 60 * DAY));
    for (const l of data ?? []) {
      const x = logs.get(l.user_id) ?? { recent: false, digestRecent: false, sent: new Set<string>() };
      const t = Date.parse(l.sent_at);
      if (t > now - 20 * 3600e3) x.recent = true;
      if (l.kind === "digest" && t > now - 5 * DAY) x.digestRecent = true;
      for (const id of l.event_ids) x.sent.add(id);
      logs.set(l.user_id, x);
    }
  }
  const plan: { user: string; shown: (Ev & { why: string })[]; more: number }[] = [];
  for (const p of prefs) {
    const l = logs.get(p.user_id);
    if (l?.recent || l?.digestRecent) continue;
    const r = pickDigest(evs as Ev[], p as Prefs, l?.sent ?? new Set());
    if (r.shown.length) plan.push({ user: p.user_id, ...r });
  }
  const rcpt = await recipients(sb, plan.map((x) => x.user));
  let sent = 0;
  for (const x of plan) {
    const r = rcpt.get(x.user);
    if (!r) { log.push(`digest: fără email pentru ${x.user}`); continue; }
    if (dry) continue;
    if (sent >= MAX_SENDS) { log.push("digest: limită de trimiteri atinsă, restul la următoarea rulare"); break; }
    const mail = digestEmail(x.shown, x.more, unsubUrl(r));
    if (!(await send(r.email, mail.subject, mail.html))) continue;
    sent++;
    await sb.from("event_mail_log").insert({ user_id: x.user, kind: "digest", event_ids: x.shown.map((e) => e.id) });
  }
  return { users: prefs.length, newEvents: evs.length, matched: plan.length, sent, report: dry ? plan.map((x) => ({ user: x.user, events: x.shown.map((e) => `${e.title} (${e.why})`), more: x.more })) : undefined };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const q = new URL(req.url).searchParams, only = q.get("only"), dry = q.has("dry");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const log: string[] = [];
  try {
    const out: Record<string, unknown> = { dry };
    if (!only || only === "names") out.names = await names(sb, dry, log);
    if (!only || only === "digest") out.digest = await digest(sb, dry, log);
    return Response.json({ ...out, log });
  } catch (e) {
    return Response.json({ error: (e as Error).message, log }, { status: 500 });
  }
});
