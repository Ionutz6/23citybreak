// Trimite rezultatul quizului pe email (Resend). Apelată din browser cu sesiunea jucătorului.
// Secrete necesare: RESEND_API_KEY, MAIL_FROM (ex. "23ai <quiz@23ai.ro>").
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "https://23citybreak.ro",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const fmt = (n: number) => n.toLocaleString("ro-RO");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return new Response("unauthorized", { status: 401, headers: cors });

  const { data } = await sb.rpc("my_quiz_rank", { p_quiz: "ghiceste-orasul" });
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return new Response("no score", { status: 404, headers: cors });
  const place = r.players >= 100 ? `Ești în top ${r.top_pct}% dintre ${fmt(r.players)} de jucători.` : `Ești pe locul ${fmt(r.rank)} din ${fmt(r.players)} de jucători.`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#141516">
    <p style="color:#8a6a33;font-weight:700;letter-spacing:.08em;font-size:12px">GHICEȘTE ORAȘUL · 23CITYBREAK</p>
    <h1 style="font-size:40px;margin:8px 0">${r.best_correct}/10</h1>
    <p style="font-size:18px;margin:0 0 8px"><b>${fmt(r.best)} puncte</b>, cel mai bun scor al tău.</p>
    <p style="font-size:16px">${place}</p>
    <p><a href="https://23citybreak.ro/#city-quiz" style="background:#dfa649;color:#15130f;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Joacă din nou</a></p>
    <p style="font-size:12px;color:#8a8d85">Primești acest email pentru că ai cerut rezultatul quizului pe 23citybreak.ro. Datele sunt administrate de 23ai.</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to: user.email, subject: `Rezultatul tău: ${r.best_correct}/10 la Ghicește orașul`, html }),
  });
  return new Response(res.ok ? "sent" : "mail error", { status: res.ok ? 200 : 502, headers: cors });
});
