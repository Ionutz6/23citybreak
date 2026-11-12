import test from "node:test";
import assert from "node:assert/strict";
import { cityOfTeam, fitsWeekend, fromCurated, fromFootballData, fromTicketmaster, localParts, parseCityCoords } from "./normalize.ts";

const vienna = { id: "vienna_at", cc: "at", lat: 48.21, lon: 16.37 };
const tm = (over: Record<string, unknown> = {}) => ({
  id: "Z698xZb", name: "Trupă Test", url: "https://www.ticketmaster.at/event/1",
  dates: { start: { localDate: "2027-06-12", localTime: "20:00:00", dateTime: "2027-06-12T18:00:00Z" }, status: { code: "onsale" } },
  classifications: [{ primary: true, segment: { name: "Music" }, genre: { name: "Rock" } }],
  priceRanges: [{ currency: "EUR", min: 115, max: 300 }],
  images: [{ ratio: "16_9", width: 1024, url: "https://s1.ticketm.net/a.jpg" }, { ratio: "3_2", width: 640, url: "https://s1.ticketm.net/b.jpg" }],
  _embedded: { venues: [{ name: "Ernst-Happel-Stadion" }], attractions: [{ name: "Trupă Test" }] },
  ...over,
});

test("parseCityCoords citește formatul din assets/city-coords.js", () => {
  const c = parseCityCoords('window.X = {\n "City:prague_cz": [50.08, 14.43], "City:cluj-napoca_ro": [46.77, 23.6],\n "City:reykjavik_is": [64.15, -21.94] };');
  assert.deepEqual(c.map((x) => x.id), ["prague_cz", "cluj-napoca_ro", "reykjavik_is"]);
  assert.equal(c[2].lon, -21.94);
  assert.equal(c[1].cc, "ro");
});

test("fitsWeekend: vineri seara, sâmbătă, duminică până la 18", () => {
  assert.equal(fitsWeekend(5, 16), false);
  assert.equal(fitsWeekend(5, 19), true);
  assert.equal(fitsWeekend(6, 9), true);
  assert.equal(fitsWeekend(0, 18), true);
  assert.equal(fitsWeekend(0, 20), false);
  assert.equal(fitsWeekend(3, 20), false);
  assert.equal(fitsWeekend(3, 20, true), true);
});

test("Ticketmaster: concert de sâmbătă", () => {
  const r = fromTicketmaster(tm(), vienna, 0)!;
  assert.equal(r.id, "tm:Z698xZb");
  assert.equal(r.kind, "concert");
  assert.equal(r.city_id, "vienna_at");
  assert.equal(r.starts_at, "2027-06-12T18:00:00.000Z");
  assert.equal(r.price_min_eur, 115);
  assert.equal(r.image_url, "https://s1.ticketm.net/a.jpg");
  assert.deepEqual(r.genres, ["Rock"]);
  assert.equal(r.time_tbc, false);
});

test("Ticketmaster: miercuri iese, anulat iese, festival pe mai multe zile rămâne", () => {
  assert.equal(fromTicketmaster(tm({ dates: { start: { localDate: "2027-06-09", localTime: "20:00:00" }, status: { code: "onsale" } } }), vienna, 0), null);
  assert.equal(fromTicketmaster(tm({ dates: { start: { localDate: "2027-06-12", localTime: "20:00:00" }, status: { code: "cancelled" } } }), vienna, 0), null);
  const f = fromTicketmaster(tm({ dates: { start: { localDate: "2027-08-11" }, end: { localDate: "2027-08-16" }, status: { code: "onsale" } } }), vienna, 3)!;
  assert.equal(f.kind, "festival");
  assert.equal(f.ends_at, "2027-08-16T21:00:00.000Z");
  assert.equal(f.time_tbc, true);
});

test("Ticketmaster: preț în altă monedă nu e convertit, link http respins", () => {
  const r = fromTicketmaster(tm({ priceRanges: [{ currency: "GBP", min: 50 }], url: "http://x.test/e" }), vienna, 0)!;
  assert.equal(r.price_min_eur, null);
  assert.equal(r.ticket_url, null);
});

test("cityOfTeam: potrivire pe cuvinte, fără diacritice", () => {
  assert.equal(cityOfTeam("Real Madrid CF"), "madrid_es");
  assert.equal(cityOfTeam("Club Atlético de Madrid"), "madrid_es");
  assert.equal(cityOfTeam("FC Internazionale Milano"), "milan_it");
  assert.equal(cityOfTeam("Winterthur"), null); // „inter” doar ca și cuvânt întreg
  assert.equal(cityOfTeam("AC Milan"), "milan_it");
  assert.equal(cityOfTeam("1. FC Köln"), "cologne_de");
  assert.equal(cityOfTeam("Girona FC"), null);
});

test("football-data: meci de sâmbătă, ora locală", () => {
  const m = { id: 9, utcDate: "2027-03-06T20:00:00Z", status: "TIMED", homeTeam: { name: "Real Madrid CF", shortName: "Real Madrid" }, awayTeam: { name: "Club Atlético de Madrid", shortName: "Atleti" } };
  const { row } = fromFootballData(m, "PD");
  assert.equal(row!.id, "fd:9");
  assert.equal(row!.title, "Real Madrid – Atleti");
  assert.equal(row!.city_id, "madrid_es");
  assert.equal(row!.popularity, 75);
  assert.deepEqual(localParts(m.utcDate, "madrid_es"), { dow: 6, hour: 21 });
});

test("football-data: marți iese, echipă nemapată raportată, dată orientativă marcată", () => {
  const base = { id: 1, homeTeam: { name: "Arsenal FC" }, awayTeam: { name: "Chelsea FC" } };
  assert.equal(fromFootballData({ ...base, utcDate: "2027-03-09T20:00:00Z", status: "TIMED" }, "CL").row, null);
  assert.equal(fromFootballData({ ...base, utcDate: "2027-03-06T15:00:00Z", status: "FINISHED" }, "PL").row, null);
  assert.equal(fromFootballData({ ...base, homeTeam: { name: "Girona FC" }, utcDate: "2027-03-06T15:00:00Z", status: "TIMED" }, "PD").unmapped, "Girona FC");
  assert.equal(fromFootballData({ ...base, utcDate: "2027-03-07T00:00:00Z", status: "SCHEDULED" }, "PL").row!.time_tbc, true);
});

test("lista curatoriată: oraș necunoscut sau dată greșită iese", () => {
  const known = new Set(["munich_de"]);
  const ok = fromCurated({ slug: "oktoberfest", title: "Oktoberfest", kind: "city_festival", city_id: "munich_de", starts: "2027-09-18", ends: "2027-10-03", ticket_url: "https://www.oktoberfest.de/en" }, known)!;
  assert.equal(ok.id, "cur:oktoberfest");
  assert.equal(ok.ends_at, "2027-10-03T21:00:00.000Z");
  assert.equal(fromCurated({ slug: "x", title: "X", city_id: "nowhere_xx", starts: "2027-01-01" }, known), null);
  assert.equal(fromCurated({ slug: "x", title: "X", city_id: "munich_de", starts: "1 ian" }, known), null);
});
