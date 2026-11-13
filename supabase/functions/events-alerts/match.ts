// Logică pură (fără rețea) pentru emailurile de alertă: ce evenimente se potrivesc preferințelor unui utilizator,
// în ce ordine, și cum se scrie emailul. Testată cu `node --test supabase/functions/events-alerts/match.test.ts`.

export type Ev = {
  id: string; kind: string; title: string; city_id: string; venue: string | null; starts_at: string; ends_at: string | null;
  time_tbc: boolean; artists: string[]; teams: string[]; competition: string | null; genres: string[];
  price_min_eur: number | null; popularity: number; first_seen_at?: string;
};
export type Prefs = {
  music_genres: string[]; sports: string[]; competitions: string[]; other_interests: string[];
  favorite_teams: string[]; favorite_artists: string[];
};

// La fel ca ev_norm din SQL și normQuery din events-search.
export const norm = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[øØ]/g, "o").replace(/[łŁ]/g, "l")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Sportul unui eveniment (aceeași regulă ca sportOf din assets/events.js).
export function sportOf(e: Ev): string {
  if (e.kind === "football") return "football";
  if (e.kind !== "sport") return "";
  const t = `${(e.genres || []).join(" ")} ${e.title} ${e.competition || ""}`;
  if (e.competition === "6N" || /rugby/i.test(t)) return "rugby";
  if (/basket/i.test(t)) return "basketball";
  if (/tenis|tennis/i.test(t)) return "tennis";
  if (/moto ?gp/i.test(t)) return "motogp";
  if (/formula ?1|\bf1\b|grand prix/i.test(t)) return "f1";
  if (/marat|marathon|running/i.test(t)) return "running";
  return "other";
}

// Genurile din profil → numele de gen de la Ticketmaster (events.genres).
const GENRE_RX: Record<string, RegExp> = {
  rock: /rock|punk/i, pop: /\bpop\b/i, electronic: /electronic|dance|techno|house|edm/i, hiphop: /hip.?hop|rap|r&b/i,
  metal: /metal/i, indie: /indie|alternative/i, jazz: /jazz|blues/i, classical: /classical|opera|orchestra/i,
  latin: /latin|reggaeton|salsa/i, folk: /folk|world|country/i,
};
const OTHER_KIND: Record<string, string[]> = { festival: ["festival"], xmas_market: ["market"], city_festival: ["city_festival"], theatre: ["theatre"], comedy: ["comedy"] };

// Numele favorit apare ca cuvinte întregi în text (ca „Real Madrid” în „Real Madrid CF”, nu „Roma” în „Romania”).
const hasName = (hay: string, name: string) => { const n = norm(name); return n.length >= 3 && ` ${hay} `.includes(` ${n} `); };

// De ce se potrivește un eveniment: prioritate 3 = artist/echipă favorită, 2 = competiție, 1 = sport, gen sau alt motiv; 0 = deloc.
export function matchEvent(e: Ev, p: Prefs): { score: number; why: string } {
  const hay = norm([e.title, ...(e.artists || []), ...(e.teams || [])].join(" "));
  for (const a of p.favorite_artists || []) if (hasName(hay, a)) return { score: 3, why: a };
  for (const t of p.favorite_teams || []) if (hasName(hay, t)) return { score: 3, why: t };
  if (e.competition && (p.competitions || []).includes(e.competition)) return { score: 2, why: e.competition };
  const sp = sportOf(e);
  if (sp && (p.sports || []).includes(sp)) return { score: 1, why: sp };
  if (e.kind === "concert" || e.kind === "festival") {
    const g = (e.genres || []).join(" ");
    for (const k of p.music_genres || []) if (GENRE_RX[k]?.test(g)) return { score: 1, why: k };
  }
  for (const k of p.other_interests || []) if ((OTHER_KIND[k] || []).includes(e.kind)) return { score: 1, why: k };
  return { score: 0, why: "" };
}

// Evenimentele pentru rezumat: potrivite, încă netrimise, ordonate după potrivire și popularitate, cel mult `max`.
export function pickDigest(events: Ev[], p: Prefs, alreadySent: Set<string>, max = 8): { shown: (Ev & { why: string })[]; more: number } {
  const hits = events.filter((e) => !alreadySent.has(e.id))
    .map((e) => ({ e, m: matchEvent(e, p) })).filter((x) => x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score || b.e.popularity - a.e.popularity || a.e.starts_at.localeCompare(b.e.starts_at));
  return { shown: hits.slice(0, max).map((x) => ({ ...x.e, why: x.m.why })), more: Math.max(0, hits.length - max) };
}

// ---------- Email ----------
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const MON = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const DOW = ["dum", "lun", "mar", "mie", "joi", "vin", "sâm"];
const TZ: Record<string, string> = { gb: "Europe/London", ie: "Europe/Dublin", pt: "Europe/Lisbon", gr: "Europe/Athens", fi: "Europe/Helsinki", ro: "Europe/Bucharest" };
export const cityName = (slug: string) => slug.replace(/_[a-z]{2}$/, "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
export function whenText(e: Ev): string {
  const tz = TZ[e.city_id.slice(-2)] ?? "Europe/Berlin";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(e.starts_at)).map((x) => [x.type, x.value]));
  const d = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${+p.day} ${MON[+p.month - 1]} ${p.year}${e.time_tbc ? "" : `, ${p.hour}:${p.minute}`}`;
}
export const eventUrl = (e: Ev) => `https://23citybreak.ro/weekend.html?e=${encodeURIComponent(e.id)}`;

export function eventRow(e: Ev): string {
  return `<tr><td style="padding:12px 0;border-top:1px solid #ece7dc">
    <a href="${esc(eventUrl(e))}" style="color:#141516;font-weight:700;font-size:16px;text-decoration:none">${esc(e.title)}</a><br>
    <span style="color:#5b6470;font-size:14px">${esc(cityName(e.city_id))}${e.venue ? ` · ${esc(e.venue)}` : ""} · ${esc(whenText(e))}${e.price_min_eur ? ` · bilet de la ${Math.round(e.price_min_eur)} €` : ""}</span><br>
    <a href="${esc(eventUrl(e))}" style="color:#7a5414;font-size:14px;font-weight:700">Vezi pachetul de weekend →</a></td></tr>`;
}
const wrap = (title: string, intro: string, rows: string, why: string, unsub: string) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#141516">
  <p style="color:#8a6a33;font-weight:700;letter-spacing:.08em;font-size:12px">23CITYBREAK</p>
  <h1 style="font-size:24px;margin:8px 0">${title}</h1><p style="font-size:15px;color:#454a45">${intro}</p>
  <table style="width:100%;border-collapse:collapse">${rows}</table>
  <p style="font-size:12px;color:#8a8d85;margin-top:24px">${why} <a href="${esc(unsub)}" style="color:#8a8d85">Oprește alertele</a>.</p></div>`;

export function nameAlertEmail(groups: { query: string; events: Ev[] }[], unsub: string): { subject: string; html: string } {
  const first = groups[0];
  const subject = groups.length === 1 ? `A apărut: ${first.query}` : `Au apărut evenimente pentru ${groups.length} alerte ale tale`;
  const rows = groups.map((g) => `<tr><td style="padding:14px 0 4px;font-size:13px;color:#8a6a33;font-weight:700;letter-spacing:.05em">ALERTA TA: ${esc(g.query.toUpperCase())}</td></tr>${g.events.slice(0, 5).map(eventRow).join("")}`).join("");
  return { subject, html: wrap("Ce căutai a apărut", "Ai cerut să te anunțăm când apare. Acestea sunt datele găsite în weekenduri, în orașe cu zbor.", rows, "Primești acest email pentru că ai apăsat „Anunță-mă pe email” pe 23citybreak.ro. Ți-l trimitem o singură dată per alertă.", unsub) };
}
export function digestEmail(shown: Ev[], more: number, unsub: string): { subject: string; html: string } {
  const names = shown.slice(0, 2).map((e) => e.title).join(", ");
  const rows = shown.map(eventRow).join("") + (more ? `<tr><td style="padding:14px 0;border-top:1px solid #ece7dc"><a href="https://23citybreak.ro/evenimente.html" style="color:#7a5414;font-weight:700">Încă ${more} ${more === 1 ? "eveniment" : "evenimente"} pe 23citybreak.ro →</a></td></tr>` : "");
  return { subject: `Evenimente noi pentru tine: ${names}${shown.length > 2 ? " și altele" : ""}`, html: wrap("Evenimente noi pe gustul tău", "Am găsit în weekenduri, în orașe cu zbor, evenimente care se potrivesc preferințelor din cont.", rows, "Primești acest rezumat săptămânal pentru că ai bifat alertele de evenimente în Contul tău.", unsub) };
}
