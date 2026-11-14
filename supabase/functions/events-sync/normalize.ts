// Normalizare pură (fără apeluri de rețea) a răspunsurilor Ticketmaster / football-data.org / lista curatoriată
// în rânduri pentru tabela public.events. Testată cu `node --test supabase/functions/events-sync/normalize.test.ts`.

export type EventRow = {
  id: string; kind: string; title: string; city_id: string; venue: string | null;
  starts_at: string; ends_at: string | null; time_tbc: boolean;
  artists: string[]; teams: string[]; competition: string | null; genres: string[];
  price_min_eur: number | null; ticket_url: string | null; official_url: string | null; image_url: string | null;
  popularity: number; source: string;
};
export type City = { id: string; cc: string; lat: number; lon: number };

// Țările în care Ticketmaster vinde bilete (și are program de afiliere); în rest nu merită consumate apeluri.
export const TM_COUNTRIES = new Set(["at", "be", "cz", "dk", "fi", "fr", "de", "ie", "it", "nl", "no", "pl", "es", "se", "ch", "gb"]);

// „City:prague_cz”: [50.08, 14.43] → {id:'prague_cz', cc:'cz', lat, lon}. Sursa: assets/city-coords.js de pe site.
export function parseCityCoords(js: string): City[] {
  const out: City[] = [];
  for (const m of js.matchAll(/"City:([a-z0-9-]+_([a-z]{2}))":\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)) {
    out.push({ id: m[1], cc: m[2], lat: +m[3], lon: +m[4] });
  }
  return out;
}

const TZ: Record<string, string> = { gb: "Europe/London", ie: "Europe/Dublin", pt: "Europe/Lisbon", gr: "Europe/Athens", fi: "Europe/Helsinki", ro: "Europe/Bucharest" };
const tzOf = (cityId: string) => TZ[cityId.slice(-2)] ?? "Europe/Berlin";

// Ziua săptămânii (0 = duminică) și ora locală pentru un moment UTC, în fusul orașului.
export function localParts(utcIso: string, cityId: string): { dow: number; hour: number } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tzOf(cityId), weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utcIso));
  const wd = p.find((x) => x.type === "weekday")!.value;
  return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour: +p.find((x) => x.type === "hour")!.value };
}

// Compatibil cu un city break vineri seara → duminică seara: vineri de la 17:00, sâmbătă oricând, duminică până la 18:00.
// Evenimentele pe mai multe zile trec mereu (utilizatorul își alege zilele pe pagina de pachet).
export function fitsWeekend(dow: number, hour: number | null, multiDay = false): boolean {
  if (multiDay) return true;
  if (dow === 6) return true;
  if (dow === 5) return hour === null || hour >= 17;
  if (dow === 0) return hour === null || hour <= 18;
  return false;
}

const https = (u: unknown) => (typeof u === "string" && u.startsWith("https://") ? u : null);

export function priceInEur(ranges: { currency?: string; min?: number }[] | undefined, fx: Record<string, number>): number | null {
  const eur = (ranges ?? []).flatMap((p) => {
    if (typeof p.min !== "number" || !(p.min > 0)) return [];
    const cur = String(p.currency ?? "").toUpperCase();
    const rate = cur === "EUR" ? 1 : fx[cur];
    return rate > 0 ? [Math.round((p.min / rate) * 100) / 100] : [];
  });
  return eur.length ? Math.min(...eur) : null;
}

// Pachete de ospitalitate / upgrade-uri / parcări și meciuri de juniori sau amatori: nu sunt „evenimente” pentru un city break.
export const JUNK_TITLE = /\b(box[- ]seats?|venue premium|vip (upgrade|package|ticket)s?|hospitality|parking|meet\s*&\s*greet|pre-?show|juniores|giovanili|primavera|attivit[aà] di base|campionati? figc|youth|junior|merchandise|tote bag|\bluxe (cap|tote|hoodie)|charm|passe-partout|gift (card|voucher)|voucher|\bu-?1\d\b)\b|\b(20[01]\d)\b.*\b(club milano|campionato)\b/i;

// Sport feminin: Ticketmaster nu are câmp de gen, deducem din titlu (doar la sport).
export const WOMEN_TITLE = /\b(women|womens|women's|ladies|frauen|damen|dames|vrouwen|wnba|mulheres)\b|\(w\)|femenin|feminin|femmin|féminin|feminino|kobiet|ženy|\bnők\b/i;

// Turnee cu mai multe sesiuni (tenis etc.): Ticketmaster le listează ca evenimente separate cu același „participant” (turneul).
// Păstrăm un singur card per turneu și oraș, cel mai devreme; evenimentele fără „sesiune” în titlu rămân neatinse.
const SESSION = /\b(session|sessie|qualif\w*|day pass|[0-9]-day|finale?)\b/i;
export function dedupeSessions(rows: EventRow[]): EventRow[] {
  const first = new Map<string, EventRow>();
  const out: EventRow[] = [];
  for (const r of rows) {
    if (r.kind !== "sport" || r.teams.length !== 1 || !SESSION.test(r.title)) { out.push(r); continue; }
    const key = `${r.city_id}|${r.teams[0]}`;
    const cur = first.get(key);
    if (!cur || r.starts_at < cur.starts_at) first.set(key, r);
  }
  return [...out, ...first.values()];
}

// Festivaluri cu seturi vândute separat („Festival | Artist | Blok 2”): un singur card per festival, loc și zi,
// cu primii artiști, ora primului set și sfârșitul ultimului (+ 90 min). Biletul duce la primul set.
const BLOCK = /^(.+?)\s*\|\s*(.+?)\s*\|\s*blok\s*\d+\s*$/i;
const slug = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function collapseFestivalBlocks(rows: EventRow[]): EventRow[] {
  const groups = new Map<string, EventRow[]>();
  const out: EventRow[] = [];
  for (const r of rows) {
    const m = BLOCK.exec(r.title);
    if (!m) { out.push(r); continue; }
    const key = `${r.city_id}|${slug(r.venue ?? "")}|${slug(m[1])}|${r.starts_at.slice(0, 10)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  for (const [key, list] of groups) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const first = list[0], name = BLOCK.exec(first.title)![1].trim();
    const artists = [...new Set(list.flatMap((r) => r.artists.length ? [r.artists[0]] : [BLOCK.exec(r.title)![2].trim()]))].slice(0, 10);
    const last = new Date(new Date(list[list.length - 1].starts_at).getTime() + 90 * 6e4).toISOString();
    out.push({
      ...first, id: `tm:blk:${slug(key).slice(0, 80)}`, kind: "festival", title: name, artists,
      ends_at: last, popularity: Math.max(...list.map((r) => r.popularity)),
    });
  }
  return out;
}

// Pagina oficială a evenimentului din datele Ticketmaster: site-ul (homepage) al primei atracții (artist / festival / turneu)
// care are unul. Rețelele sociale, paginile Ticketmaster și Wikipedia nu sunt pagini oficiale.
const NOT_OFFICIAL = /(^|\.)(facebook|instagram|twitter|x|youtube|tiktok|wikipedia|ticketmaster|livenation|spotify|itunes|apple|lastfm|musicbrainz|google)\./i;
// deno-lint-ignore no-explicit-any
export function officialFromTicketmaster(ev: any): string | null {
  for (const a of ev?._embedded?.attractions ?? []) {
    for (const h of a?.externalLinks?.homepage ?? []) {
      const u = https(h?.url);
      if (!u) continue;
      try { if (!NOT_OFFICIAL.test(new URL(u).hostname + ".")) return u; } catch { /* url invalid */ }
    }
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export function fromTicketmaster(ev: any, city: City, rank: number, fx: Record<string, number> = {}): EventRow | null {
  const start = ev?.dates?.start;
  if (!ev?.id || !ev?.name || !start?.localDate) return null;
  if (JUNK_TITLE.test(String(ev.name))) return null;
  if (ev.dates?.status?.code && ev.dates.status.code !== "onsale" && ev.dates.status.code !== "offsale" && ev.dates.status.code !== "rescheduled") return null; // anulate / amânate
  const noTime = !!start.noSpecificTime || !!start.timeTBA || !start.localTime;
  const dow = new Date(`${start.localDate}T12:00:00Z`).getUTCDay();
  const hour = noTime ? null : +String(start.localTime).slice(0, 2);
  const endDate: string | undefined = ev.dates?.end?.localDate;
  const multiDay = !!endDate && endDate > start.localDate;
  if (!fitsWeekend(dow, hour, multiDay)) return null;

  const cls = (ev.classifications ?? []).find((c: { primary?: boolean }) => c.primary) ?? ev.classifications?.[0] ?? {};
  const seg = String(cls.segment?.name ?? "").toLowerCase();
  const genre = String(cls.genre?.name ?? "");
  const isFestival = /festival/i.test(ev.name) || /festival/i.test(String(cls.subType?.name ?? ""));
  let kind = "other";
  if (seg === "music") kind = isFestival || multiDay ? "festival" : "concert";
  else if (seg === "sports") kind = /football|soccer/i.test(genre) ? "football" : "sport";
  // Fotbalul vine doar din football-data.org (top 5 campionate + Champions League etc., masculin). Ticketmaster aduce juniori, amatori și feminin.
  if (kind === "football") return null;
  if (kind === "sport" && WOMEN_TITLE.test(String(ev.name))) return null;
  if (seg === "arts & theatre") kind = /comedy/i.test(genre) ? "comedy" : "theatre";

  const attractions: string[] = (ev._embedded?.attractions ?? []).map((a: { name?: string }) => a.name).filter(Boolean);
  // Prețul „de la” mereu în EUR: alte monede (GBP, DKK, SEK, NOK, CHF, PLN, CZK) se convertesc cu cursul BCE (fx = unități de monedă pentru 1 EUR).
  const price = priceInEur(ev.priceRanges, fx);
  // Cea mai mare imagine 16:9 (pentru bannerul paginii de pachet). La sport nu luăm imagini: materialele oficiale
  // ale echipelor și ligilor nu sunt licențiate implicit (FAQ Ticketmaster, „official artist/team/rightsholder creative”).
  const img = kind === "football" || kind === "sport" ? null : (ev.images ?? []).filter((i: { ratio?: string; width?: number }) => i.ratio === "16_9" && (i.width ?? 0) >= 600)
    .sort((a: { width: number }, b: { width: number }) => b.width - a.width)[0]?.url;
  // start.dateTime e UTC; fără oră folosim amiaza locală ca să nu sară ziua la conversii.
  const startsAt = !noTime && start.dateTime ? new Date(start.dateTime).toISOString() : `${start.localDate}T11:00:00.000Z`;
  return {
    id: `tm:${ev.id}`, kind, title: String(ev.name).slice(0, 200), city_id: city.id,
    venue: ev._embedded?.venues?.[0]?.name ?? null,
    starts_at: startsAt, ends_at: multiDay ? `${endDate}T21:00:00.000Z` : null, time_tbc: noTime,
    artists: kind === "concert" || kind === "festival" || kind === "comedy" ? attractions.slice(0, 10) : [],
    teams: kind === "football" || kind === "sport" ? attractions.slice(0, 2) : [],
    competition: null, genres: genre && genre !== "Undefined" ? [genre] : [],
    price_min_eur: price, ticket_url: https(ev.url), official_url: officialFromTicketmaster(ev), image_url: https(img),
    popularity: Math.max(10, 80 - rank * 2), source: "ticketmaster",
  };
}

// Echipa gazdă → orașul din matrice. Cheia e un fragment din numele echipei, fără diacritice, cu litere mici.
// Echipele nemapate sunt raportate în răspunsul funcției (unmapped), ca să poată fi adăugate aici.
export const TEAM_CITY: [string, string][] = [
  ["real madrid", "madrid_es"], ["atletico", "madrid_es"], ["rayo vallecano", "madrid_es"], ["getafe", "madrid_es"],
  ["barcelona", "barcelona_es"], ["espanyol", "barcelona_es"], ["valencia", "valencia_es"], ["levante", "valencia_es"],
  ["sevilla", "seville_es"], ["betis", "seville_es"], ["athletic", "bilbao_es"], ["malaga", "malaga_es"], ["mallorca", "palma_es"],
  ["arsenal", "london_gb"], ["chelsea", "london_gb"], ["tottenham", "london_gb"], ["west ham", "london_gb"], ["fulham", "london_gb"], ["crystal palace", "london_gb"], ["brentford", "london_gb"],
  ["manchester", "manchester_gb"], ["liverpool", "liverpool_gb"], ["everton", "liverpool_gb"], ["newcastle", "newcastle_gb"], ["aston villa", "birmingham_gb"], ["leeds", "leeds_gb"], ["bristol", "bristol_gb"],
  ["bayern", "munich_de"], ["dortmund", "dortmund_de"], ["eintracht frankfurt", "frankfurt_de"], ["union berlin", "berlin_de"], ["hertha", "berlin_de"], ["hamburg", "hamburg_de"], ["st. pauli", "hamburg_de"], ["koln", "cologne_de"], ["stuttgart", "stuttgart_de"], ["leipzig", "leipzig_de"], ["werder", "bremen_de"],
  ["milan", "milan_it"], ["inter", "milan_it"], ["internazionale", "milan_it"], ["roma", "rome_it"], ["lazio", "rome_it"], ["napoli", "naples_it"], ["juventus", "turin_it"], ["torino", "turin_it"], ["bologna", "bologna_it"], ["genoa", "genoa_it"], ["verona", "verona_it"], ["cagliari", "cagliari_it"], ["pisa", "pisa_it"],
  ["paris", "paris_fr"], ["marseille", "marseille_fr"], ["lyon", "lyon_fr"], ["nice", "nice_fr"], ["lille", "lille_fr"], ["toulouse", "toulouse_fr"], ["nantes", "nantes_fr"], ["strasbourg", "strasbourg_fr"],
  ["ajax", "amsterdam_nl"], ["feyenoord", "rotterdam_nl"], ["sparta rotterdam", "rotterdam_nl"], ["psv", "eindhoven_nl"],
  ["benfica", "lisbon_pt"], ["sporting clube de portugal", "lisbon_pt"], ["sporting cp", "lisbon_pt"], ["porto", "porto_pt"],
];
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function cityOfTeam(name: string): string | null {
  const n = ascii(name);
  // „Inter” nu trebuie să prindă alte nume; cerem potrivire pe cuvinte întregi.
  for (const [frag, city] of TEAM_CITY) if (new RegExp(`(^|[^a-z])${frag.replace(/[.]/g, "\\.")}([^a-z]|$)`).test(n)) return city;
  return null;
}

const BIG = ["real madrid", "barcelona", "atletico", "bayern", "dortmund", "arsenal", "chelsea", "liverpool", "manchester", "tottenham", "juventus", "milan", "inter", "roma", "napoli", "paris", "ajax", "benfica", "porto"];
const isBig = (n: string) => BIG.some((b) => ascii(n).includes(b));

// deno-lint-ignore no-explicit-any
export function fromFootballData(m: any, competition: string): { row: EventRow | null; unmapped?: string } {
  const home = m?.homeTeam?.name, away = m?.awayTeam?.name;
  if (!m?.id || !m?.utcDate || !home || !away) return { row: null };
  if (m.status !== "SCHEDULED" && m.status !== "TIMED") return { row: null };
  const city = cityOfTeam(home);
  if (!city) return { row: null, unmapped: home };
  const tbc = m.status === "SCHEDULED"; // data e orientativă, ora nu e anunțată
  const { dow, hour } = localParts(m.utcDate, city);
  if (!fitsWeekend(dow, tbc ? null : hour)) return { row: null };
  let pop = competition === "CL" ? 85 : 55;
  if (isBig(home)) pop += 10;
  if (isBig(home) && isBig(away)) pop += 10;
  return {
    row: {
      id: `fd:${m.id}`, kind: "football", title: `${m.homeTeam.shortName ?? home} – ${m.awayTeam.shortName ?? away}`, city_id: city,
      venue: null, starts_at: new Date(m.utcDate).toISOString(), ends_at: null, time_tbc: tbc,
      artists: [], teams: [home, away], competition, genres: [], price_min_eur: null,
      ticket_url: null, official_url: null, image_url: null, popularity: Math.min(100, pop), source: "football-data",
    },
  };
}

// Ora locală a orașului (YYYY-MM-DD + HH:MM) → moment UTC, ținând cont de ora de vară.
export function localToUtc(date: string, time: string, cityId: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tzOf(cityId), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess).map((x) => [x.type, x.value]));
  const shown = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return new Date(guess.getTime() - (shown.getTime() - guess.getTime())).toISOString();
}

const CURATED_KINDS = new Set(["concert", "football", "sport", "festival", "market", "city_festival", "theatre", "comedy", "other"]);
// deno-lint-ignore no-explicit-any
export function fromCurated(e: any, knownCities: Set<string>): EventRow | null {
  if (!e?.slug || !e?.title || !e?.starts || !knownCities.has(e.city_id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.starts) || (e.ends && !/^\d{4}-\d{2}-\d{2}$/.test(e.ends))) return null;
  // „time” opțional (ora locală, ex. meciuri de rugby): ora exactă, altfel ora se anunță.
  const time = typeof e.time === "string" && /^\d{2}:\d{2}$/.test(e.time) ? e.time : null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 4) : []);
  return {
    id: `cur:${e.slug}`, kind: CURATED_KINDS.has(e.kind) ? e.kind : "other", title: String(e.title).slice(0, 200), city_id: e.city_id, venue: e.venue ?? null,
    starts_at: time ? localToUtc(e.starts, time, e.city_id) : `${e.starts}T09:00:00.000Z`, ends_at: e.ends && e.ends > e.starts ? `${e.ends}T21:00:00.000Z` : null, time_tbc: !time,
    artists: strs(e.artists), teams: strs(e.teams), competition: typeof e.competition === "string" ? e.competition.slice(0, 12) : null, genres: [], price_min_eur: null,
    ticket_url: https(e.ticket_url), official_url: https(e.official_url) ?? (e.kind === "city_festival" || e.kind === "market" ? https(e.ticket_url) : null), image_url: https(e.image_url), popularity: Math.max(0, Math.min(100, e.popularity ?? 50)), source: "curated",
  };
}
