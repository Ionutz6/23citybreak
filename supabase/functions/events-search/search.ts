// Logică pură (fără rețea) pentru events-search: legarea unui eveniment Ticketmaster de cel mai apropiat oraș
// din matrice și normalizarea textului căutat. Testată cu `node --test supabase/functions/events-search/search.test.ts`.
import { type City, type EventRow, fromTicketmaster } from "../events-sync/normalize.ts";

// La fel ca public.ev_norm din SQL: litere mici, fără diacritice, doar litere și cifre.
export const normQuery = (q: unknown): string =>
  String(q ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[øØ]/g, "o").replace(/[łŁ]/g, "l")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);

const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Cel mai apropiat oraș cu zbor, dacă sala e la cel mult maxKm (stadioanele mari sunt des la marginea orașului).
export function nearestCity(lat: number, lon: number, cities: City[], maxKm = 35): City | null {
  let best: City | null = null, bestKm = Infinity;
  for (const c of cities) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestKm) { best = c; bestKm = d; }
  }
  return bestKm <= maxKm ? best : null;
}

// Rezultatele unei căutări Ticketmaster → rânduri pentru public.events.
//   rows     = evenimente de weekend în orașele noastre (se salvează și apar la toți)
//   weekday  = găsite în orașele noastre, dar în timpul săptămânii (nu intră pe site, îi spunem doar utilizatorului)
//   outside  = găsite în orașe fără zbor de la noi
// deno-lint-ignore no-explicit-any
export function fromSearch(list: any[], cities: City[]): { rows: EventRow[]; weekday: number; outside: number } {
  const rows = new Map<string, EventRow>();
  let weekday = 0, outside = 0;
  list.forEach((ev, i) => {
    const loc = ev?._embedded?.venues?.[0]?.location;
    const lat = Number(loc?.latitude), lon = Number(loc?.longitude);
    const city = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? nearestCity(lat, lon, cities) : null;
    if (!city) { outside++; return; }
    const row = fromTicketmaster(ev, city, i);
    if (!row) { if (ev?.dates?.start?.localDate) weekday++; return; }
    // Căutat explicit de cineva = interes real: puțin peste media evenimentelor descoperite automat.
    row.popularity = Math.max(row.popularity, 60);
    if (!rows.has(row.id)) rows.set(row.id, row);
  });
  return { rows: [...rows.values()], weekday, outside };
}
