// Normalizare pură (fără apeluri de rețea) a răspunsurilor Ticketmaster / football-data.org / lista curatoriată
// în rânduri pentru tabela public.events. Testată cu `node --test supabase/functions/events-sync/normalize.test.ts`.

export type EventRow = {
  id: string; kind: string; title: string; city_id: string; venue: string | null;
  starts_at: string; ends_at: string | null; time_tbc: boolean;
  artists: string[]; teams: string[]; competition: string | null; genres: string[];
  price_min_eur: number | null; ticket_url: string | null; image_url: string | null;
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

// deno-lint-ignore no-explicit-any
export function fromTicketmaster(ev: any, city: City, rank: number): EventRow | null {
  const start = ev?.dates?.start;
  if (!ev?.id || !ev?.name || !start?.localDate) return null;
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
  else if (seg === "arts & theatre") kind = /comedy/i.test(genre) ? "comedy" : "theatre";

  const attractions: string[] = (ev._embedded?.attractions ?? []).map((a: { name?: string }) => a.name).filter(Boolean);
  const price = (ev.priceRanges ?? []).filter((p: { currency?: string; min?: number }) => p.currency === "EUR" && typeof p.min === "number" && p.min > 0)
    .map((p: { min: number }) => p.min).sort((a: number, b: number) => a - b)[0] ?? null;
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
    price_min_eur: price, ticket_url: https(ev.url), image_url: https(img),
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
      ticket_url: null, image_url: null, popularity: Math.min(100, pop), source: "football-data",
    },
  };
}

// deno-lint-ignore no-explicit-any
export function fromCurated(e: any, knownCities: Set<string>): EventRow | null {
  if (!e?.slug || !e?.title || !e?.starts || !knownCities.has(e.city_id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.starts) || (e.ends && !/^\d{4}-\d{2}-\d{2}$/.test(e.ends))) return null;
  return {
    id: `cur:${e.slug}`, kind: e.kind ?? "other", title: String(e.title).slice(0, 200), city_id: e.city_id, venue: e.venue ?? null,
    starts_at: `${e.starts}T09:00:00.000Z`, ends_at: e.ends && e.ends > e.starts ? `${e.ends}T21:00:00.000Z` : null, time_tbc: true,
    artists: [], teams: [], competition: null, genres: [], price_min_eur: null,
    ticket_url: https(e.ticket_url), image_url: https(e.image_url), popularity: Math.max(0, Math.min(100, e.popularity ?? 50)), source: "curated",
  };
}
