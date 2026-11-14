import test from "node:test";
import assert from "node:assert/strict";
import { dedupeSessions, cityOfTeam, fitsWeekend, fromCurated, localToUtc, fromFootballData, fromTicketmaster, localParts, parseCityCoords } from "./normalize.ts";

const vienna = { id: "vienna_at", cc: "at", lat: 48.21, lon: 16.37 };
const tm = (over: Record<string, unknown> = {}) => ({
  id: "Z698xZb", name: "Trupă Test", url: "https://www.ticketmaster.at/event/1",
  dates: { start: { localDate: "2027-06-12", localTime: "20:00:00", dateTime: "2027-06-12T18:00:00Z" }, status: { code: "onsale" } },
  classifications: [{ primary: true, segment: { name: "Music" }, genre: { name: "Rock" } }],
  priceRanges: [{ currency: "EUR", min: 115, max: 300 }],
  images: [{ ratio: "16_9", width: 1024, url: "https://s1.ticketm.net/a.jpg" }, { ratio: "16_9", width: 2048, url: "https://s1.ticketm.net/big.jpg" }, { ratio: "3_2", width: 3000, url: "https://s1.ticketm.net/b.jpg" }],
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
  assert.equal(r.image_url, "https://s1.ticketm.net/big.jpg");
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

test("Ticketmaster: preț în altă monedă se convertește în EUR, link http respins", () => {
  const r = fromTicketmaster(tm({ priceRanges: [{ currency: "GBP", min: 50 }], url: "http://x.test/e" }), vienna, 0, { GBP: 0.86 })!;
  assert.equal(r.price_min_eur, 58.14);
  assert.equal(r.ticket_url, null);
  // fără curs pentru monedă, prețul se omite; între mai multe intervale se ia cel mai mic în EUR
  assert.equal(fromTicketmaster(tm({ priceRanges: [{ currency: "XXX", min: 50 }] }), vienna, 0, {})!.price_min_eur, null);
  assert.equal(fromTicketmaster(tm({ priceRanges: [{ currency: "DKK", min: 300 }, { currency: "EUR", min: 90 }] }), vienna, 0, { DKK: 7.46 })!.price_min_eur, 40.21);
});

test("Ticketmaster: la sport nu se iau imagini (materiale oficiale ale echipelor)", () => {
  const r = fromTicketmaster(tm({ classifications: [{ primary: true, segment: { name: "Sports" }, genre: { name: "Basketball" } }] }), vienna, 0)!;
  assert.equal(r.kind, "sport");
  assert.equal(r.image_url, null);
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

test("curatoriate: oră locală, echipe, competiție", () => {
  const known = new Set(["dublin_ie", "rome_it"]);
  const r = fromCurated({ slug: "6n", title: "Irlanda – Anglia", kind: "sport", city_id: "dublin_ie", starts: "2027-02-05", time: "20:10", teams: ["Ireland", "England"], competition: "6N" }, known)!;
  assert.equal(r.starts_at, "2027-02-05T20:10:00.000Z");
  assert.equal(r.time_tbc, false);
  assert.deepEqual(r.teams, ["Ireland", "England"]);
  assert.equal(r.competition, "6N");
  assert.equal(localToUtc("2027-03-13", "15:10", "rome_it"), "2027-03-13T14:10:00.000Z");
  assert.equal(localToUtc("2027-07-10", "20:00", "rome_it"), "2027-07-10T18:00:00.000Z");
  assert.equal(fromCurated({ slug: "y", title: "Y", kind: "hack", city_id: "rome_it", starts: "2027-01-01" }, known)!.kind, "other");
});

test("Ticketmaster: pachete VIP și meciuri de juniori sunt excluse", () => {
  for (const name of ["Eisbären Berlin - Wild Wings | Box-Seat", "Misfits Boxing - Venue Premium Tickets", "Hot Wheels Pre-Show", "CLUB MILANO - ARCONATESE | CAMPIONATO JUNIORES NAZIONALE", "Pro Sesto Giovanili - 14/11/2026"])
    assert.equal(fromTicketmaster(tm({ name }), vienna, 0), null, name);
  assert.ok(fromTicketmaster(tm({ name: "Chelsea Women V Manchester City Women" }), vienna, 0));
});

test("Ticketmaster: fotbalul nu se ia de aici (doar din football-data.org)", () => {
  assert.equal(fromTicketmaster(tm({ classifications: [{ primary: true, segment: { name: "Sports" }, genre: { name: "Soccer" } }] }), vienna, 0), null);
});

test("Ticketmaster: merchandise și abonamente excluse, sesiunile aceluiași turneu devin un card", () => {
  for (const name of ["ABN AMRO Open 2027 - Luxe tote bag", "ABN AMRO Open 2027 - Luxe cap", "ABN AMRO Open 2027 - Tennis bag charm", "ABN AMRO Open 2027 - Passe-partout"])
    assert.equal(fromTicketmaster(tm({ name }), vienna, 0), null, name);
  const base = fromTicketmaster(tm({ classifications: [{ primary: true, segment: { name: "Sports" }, genre: { name: "Tennis" } }], _embedded: { attractions: [{ name: "ABN AMRO Open" }] } }), vienna, 0)!;
  const mk = (title: string, starts_at: string) => ({ ...base, id: title, title, starts_at });
  const rows = dedupeSessions([mk("ABN AMRO Open 2027 - Session 11", "2027-02-10T13:00:00Z"), mk("ABN AMRO Open 2027 - Qualifications", "2027-02-08T10:00:00Z"), mk("Alt meci", "2027-02-09T10:00:00Z")]);
  assert.deepEqual(rows.map((r) => r.title).sort(), ["ABN AMRO Open 2027 - Qualifications", "Alt meci"]);
});
