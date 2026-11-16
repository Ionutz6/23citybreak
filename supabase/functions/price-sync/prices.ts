// Logica pură pentru prețurile de pe Home (fără rețea, testabilă cu node --test).
export const SITE = "https://23citybreak.ro";

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
export const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Weekendurile (vineri → duminică) care încep în următoarele `days` zile; prima vineri din viitor (azi nu contează). */
export function weekendPairs(today: string, days = 60): { out: string; back: string }[] {
  const res: { out: string; back: string }[] = [];
  let d = addDays(today, 1);
  while (dow(d) !== 5) d = addDays(d, 1);
  for (; d <= addDays(today, days); d = addDays(d, 7)) res.push({ out: d, back: addDays(d, 2) });
  return res;
}

/** { 'City:rome_it' → 'ROM' } din assets/europe-cities.js, doar pentru orașele cu ilustrație în `guideIds`. */
export function cityIatas(citiesJs: string, guides: Set<string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of citiesJs.matchAll(/id:\s*"(City:[a-z0-9-]+_[a-z]{2})"[^}]*?iata:\s*"([A-Z]{3})"/g)) if (guides.has(x[1])) m.set(x[1], x[2]);
  return m;
}
export function guideIds(guidesJs: string): Set<string> {
  return new Set([...guidesJs.matchAll(/"(City:[a-z0-9-]+_[a-z]{2})"\s*:\s*\{\s*"quizImage"/g)].map((x) => x[1]));
}

/** Răspuns Travelpayouts `prices_for_dates` → cel mai mic preț (EUR) pentru data cerută, sau null. */
export function cheapest(body: unknown): { price: number; direct: boolean } | null {
  // deno-lint-ignore no-explicit-any
  const list = ((body as any)?.data ?? []) as any[];
  let best: { price: number; direct: boolean } | null = null;
  for (const it of list) {
    const price = Math.round(Number(it?.price));
    if (!(price >= 15 && price <= 1500)) continue;
    const direct = Number(it?.transfers ?? it?.number_of_changes ?? 0) === 0 && Number(it?.return_transfers ?? 0) === 0;
    if (!best || price < best.price || (price === best.price && direct && !best.direct)) best = { price, direct };
  }
  return best;
}

export interface Report { dest: string; out: string; back: string; price: number; direct: boolean }
/** Validează un preț raportat de browser: formă, date de weekend în următoarele 75 de zile, preț plauzibil. */
export function validateReport(r: unknown, today: string): Report | null {
  // deno-lint-ignore no-explicit-any
  const x = r as any;
  if (!x || typeof x.dest !== "string" || !/^City:[a-z0-9-]+_[a-z]{2}$/.test(x.dest)) return null;
  for (const k of ["out", "back"]) if (typeof x[k] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x[k]) || Number.isNaN(Date.parse(x[k]))) return null;
  if (x.out <= today || x.out > addDays(today, 75)) return null;
  const nights = Math.round((Date.parse(x.back) - Date.parse(x.out)) / 864e5);
  if (![4, 5, 6].includes(dow(x.out)) || nights < 2 || nights > 3) return null; // joi–sâmbătă dus, 2–3 nopți
  const price = Math.round(Number(x.price));
  if (!(price >= 25 && price <= 600)) return null;
  return { dest: x.dest, out: x.out, back: x.back, price, direct: x.direct === true };
}

/** Un preț raportat care se abate mult de cache-ul Travelpayouts pentru aceeași rută și dată e ignorat (protecție la date false). */
export const plausible = (reported: number, cached: number | undefined) => cached === undefined || (reported >= cached * 0.5 && reported <= cached * 2);
