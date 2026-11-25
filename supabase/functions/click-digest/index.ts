// click-digest: rezumatul zilnic al click-urilor pe linkurile ieșite, trimis pe email (Resend). Rulează din pg_cron (vezi README.md).
//   Trimite DOAR dacă există cel puțin 1 click nou de la ultimul rezumat; altfel nu trimite nimic și nu scrie nimic.
//   ?dry → nu trimite și nu marchează click-urile, doar raportează.
// Secrete: RESEND_API_KEY, CRON_SECRET, CLICKS_REPORT_TO (adresa care primește rezumatul). Expeditor: office@23ai.ro.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Row = { id: number; created_at: string; partner: string; page: string; city: string | null; label: string | null };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const count = (rows: Row[], key: (r: Row) => string | null) => {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const table = (title: string, items: [string, number][], max = 15) => items.length
  ? `<h3 style="margin:22px 0 6px;font:700 14px Arial,sans-serif;color:#8a6a33">${title}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px Arial,sans-serif">${
    items.slice(0, max).map(([k, n]) => `<tr><td style="padding:5px 0;border-bottom:1px solid #e4dfd2">${esc(k)}</td><td align="right" style="padding:5px 0;border-bottom:1px solid #e4dfd2;font-weight:700">${n}</td></tr>`).join("")
  }</table>` : "";

export function buildEmail(rows: Row[], from: string, to: string) {
  const total = rows.length;
  const byPartner = count(rows, (r) => r.partner);
  const byPage = count(rows, (r) => r.page);
  const byPlace = count(rows, (r) => r.label ?? r.city);
  const combos = count(rows, (r) => `${r.partner} · ${r.page}${r.label ?? r.city ? " · " + (r.label ?? r.city) : ""}`);
  const subject = `23citybreak: ${total} ${total === 1 ? "click" : "click-uri"} pe linkurile ieșite`;
  const html = `<!doctype html><html lang="ro"><body style="margin:0;background:#efeadf"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="width:100%;max-width:540px;background:#f6f2e8;border-radius:18px;overflow:hidden;font-family:Arial,sans-serif;color:#141516">
  <tr><td style="background:#141516;padding:18px 28px;font:700 22px Arial,sans-serif;color:#fff"><span style="color:#dfa649">✈</span> 23<span style="color:#dfa649">city</span>break</td></tr>
  <tr><td style="padding:24px 28px 28px">
    <p style="margin:0;font:700 12px Arial,sans-serif;letter-spacing:.1em;color:#8a6a33">CLICK-URI PE LINKURI IEȘITE</p>
    <p style="margin:6px 0 0;font:700 34px/1.1 Arial,sans-serif">${total} ${total === 1 ? "click" : "click-uri"}</p>
    <p style="margin:6px 0 0;font:13px Arial,sans-serif;color:#6e716a">${esc(from)} – ${esc(to)} (ora României)</p>
    ${table("Pe partener", byPartner)}${table("Pe pagina sursă", byPage)}${table("Pe oraș / eveniment", byPlace)}${table("Cele mai frecvente combinații", combos, 10)}
    <p style="margin:24px 0 0;font:12px Arial,sans-serif;color:#6e716a">Fără date personale: nu se salvează IP, cont sau alți identificatori ai vizitatorilor.</p>
  </td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const dry = new URL(req.url).searchParams.has("dry");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cutoff = new Date().toISOString(); // click-urile apărute după acest moment rămân pentru rezumatul următor
  const rows: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.from("outbound_clicks").select("id,created_at,partner,page,city,label")
      .is("digested_at", null).lte("created_at", cutoff).order("id").range(from, from + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    rows.push(...(data as Row[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  if (!rows.length) return Response.json({ sent: false, clicks: 0 }); // niciun click: nu trimitem nimic
  const to = Deno.env.get("CLICKS_REPORT_TO");
  if (!to) return Response.json({ error: "missing CLICKS_REPORT_TO" }, { status: 400 });
  const fmt = (iso: string) => new Date(iso).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", dateStyle: "short", timeStyle: "short" });
  const { subject, html } = buildEmail(rows, fmt(rows[0].created_at), fmt(rows[rows.length - 1].created_at));
  if (dry) return Response.json({ sent: false, dry: true, clicks: rows.length, subject });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "23citybreak <office@23ai.ro>", to, subject, html }),
  });
  if (!res.ok) return Response.json({ error: `resend ${res.status}` }, { status: 502 }); // click-urile rămân nemarcate, se reîncearcă mâine
  await sb.from("outbound_clicks").update({ digested_at: new Date().toISOString() }).is("digested_at", null).lte("created_at", cutoff);
  await sb.from("outbound_clicks").delete().lt("digested_at", new Date(Date.now() - 90 * 864e5).toISOString());
  return Response.json({ sent: true, clicks: rows.length });
});
