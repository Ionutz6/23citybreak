// Trimite rezultatul quizului pe email (Resend). Apelată din browser cu sesiunea jucătorului.
// Secret necesar: RESEND_API_KEY. Expeditor: office@23ai.ro (domeniu verificat în Resend).
// Body opțional: { image_url } = imaginea de scor urcată de jucător în bucketul quiz-cards (doar din folderul lui).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "https://23citybreak.ro",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const fmt = (n: number) => n.toLocaleString("ro-RO");
const rating = (c: number) => c === 10 ? "Cetățean al Europei" : c >= 8 ? "Expert în city break-uri" : c >= 5 ? "Călător pasionat" : c >= 2 ? "Turist curios" : "Abia începi să explorezi";
const SITE = "https://23citybreak.ro";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return new Response("unauthorized", { status: 401, headers: cors });

  let imageUrl: string | null = null;
  try {
    const body = await req.json();
    const prefix = `${url}/storage/v1/object/public/quiz-cards/${user.id}/`;
    if (typeof body?.image_url === "string" && body.image_url.startsWith(prefix) && /^[\w./-]+$/.test(body.image_url.slice(prefix.length))) imageUrl = body.image_url;
  } catch { /* fără body */ }

  const { data } = await sb.rpc("my_quiz_rank", { p_quiz: "ghiceste-orasul" });
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return new Response("no score", { status: 404, headers: cors });
  const placeBig = r.players >= 100 ? `Top ${r.top_pct}%` : r.players === 1 ? "Locul 1" : `Locul ${fmt(r.rank)}`;
  const placeSmall = r.players >= 100 ? `dintre ${fmt(r.players)} de jucători din clasamentul Europa` : r.players === 1 ? "ești primul jucător din clasamentul Europa" : `din ${fmt(r.players)} de jucători în clasamentul Europa`;

  const font = "'Space Grotesk','Segoe UI',Arial,sans-serif";
  const card = imageUrl
    ? `<tr><td style="padding:0 28px"><a href="${SITE}/#city-quiz"><img src="${imageUrl}" width="484" alt="Cartonașul tău de scor: ${r.best_correct}/10, ${fmt(r.best)} puncte" style="display:block;width:100%;max-width:484px;height:auto;border-radius:14px;border:0"></a></td></tr>`
    : "";
  const html = `<!doctype html><html lang="ro"><body style="margin:0;padding:0;background:#efeadf">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeadf"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="width:100%;max-width:540px;background:#f6f2e8;border-radius:18px;overflow:hidden;font-family:${font};color:#141516">
    <tr><td style="background:#141516;padding:18px 28px">
      <table role="presentation" width="100%"><tr>
        <td style="font:700 22px ${font};color:#fff"><span style="color:#dfa649">✈</span> 23<span style="color:#dfa649">city</span>break</td>
        <td align="right" style="font:700 11px ${font};letter-spacing:.08em;color:#dfa649">GHICEȘTE ORAȘUL</td>
      </tr></table></td></tr>
    <tr><td style="padding:28px 28px 8px">
      <p style="margin:0;font:700 12px ${font};letter-spacing:.1em;color:#8a6a33">REZULTATUL TĂU</p>
      <p style="margin:6px 0 0;font:700 26px/1.2 ${font}">${rating(r.best_correct)}</p>
    </td></tr>
    <tr><td style="padding:12px 28px 20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="background:#fff;border-radius:12px;padding:16px 18px">
          <p style="margin:0;font:700 30px/1 ${font};white-space:nowrap">${r.best_correct}/10</p>
          <p style="margin:6px 0 0;font:600 13px ${font};color:#6e716a">${fmt(r.best)} puncte, cel mai bun scor</p></td>
        <td width="12"></td>
        <td width="50%" style="background:#141516;border-radius:12px;padding:16px 18px">
          <p style="margin:0;font:700 30px/1 ${font};color:#dfa649;white-space:nowrap">${placeBig}</p>
          <p style="margin:6px 0 0;font:600 13px ${font};color:#c9c7c1">${placeSmall}</p></td>
      </tr></table></td></tr>
    ${card}
    <tr><td align="center" style="padding:26px 28px 8px">
      <a href="${SITE}/#city-quiz" style="display:inline-block;background:#dfa649;color:#15130f;padding:14px 26px;border-radius:10px;text-decoration:none;font:700 15px ${font}">Bate-ți recordul ↗</a>
    </td></tr>
    <tr><td align="center" style="padding:6px 28px 26px">
      <a href="${SITE}/#configurator" style="font:700 14px ${font};color:#8a6a33">sau caută un zbor de weekend spre unul din orașe</a>
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #e5e2d9">
      <p style="margin:0;font:12px/1.5 Arial,sans-serif;color:#8a8d85">Primești acest email pentru că ai cerut rezultatul quizului pe 23citybreak.ro. Datele sunt administrate de 23ai.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "23ai <office@23ai.ro>", to: user.email, subject: `Rezultatul tău: ${r.best_correct}/10 la Ghicește orașul`, html }),
  });
  return new Response(res.ok ? "sent" : "mail error", { status: res.ok ? 200 : 502, headers: cors });
});
