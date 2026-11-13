import test from "node:test";
import assert from "node:assert/strict";
import { fromSearch, nearestCity, normQuery } from "./search.ts";

const cities = [
  { id: "london_gb", cc: "gb", lat: 51.51, lon: -0.13 },
  { id: "manchester_gb", cc: "gb", lat: 53.48, lon: -2.24 },
  { id: "dublin_ie", cc: "ie", lat: 53.35, lon: -6.26 },
];
const ev = (over: Record<string, unknown> = {}) => ({
  id: "G5v", name: "Oasis Live '27", url: "https://www.ticketmaster.co.uk/e/1",
  dates: { start: { localDate: "2027-07-10", localTime: "19:00:00", dateTime: "2027-07-10T18:00:00Z" }, status: { code: "onsale" } },
  classifications: [{ primary: true, segment: { name: "Music" }, genre: { name: "Rock" } }],
  _embedded: { venues: [{ name: "Wembley Stadium", location: { latitude: "51.556", longitude: "-0.2795" } }], attractions: [{ name: "Oasis" }] },
  ...over,
});

test("normQuery: fără diacritice, litere mici, spații normalizate", () => {
  assert.equal(normQuery("  Mötley Crüe!! "), "motley crue");
  assert.equal(normQuery("Ștefan  Bănică"), "stefan banica");
  assert.equal(normQuery("Bayern München"), "bayern munchen");
});

test("nearestCity: Wembley → Londra, Paris → niciun oraș", () => {
  assert.equal(nearestCity(51.556, -0.2795, cities)?.id, "london_gb");
  assert.equal(nearestCity(48.86, 2.35, cities), null);
});

test("fromSearch: weekend în oraș cu zbor intră; în timpul săptămânii și în afara orașelor doar se numără", () => {
  const r = fromSearch([
    ev(),
    ev({ id: "G6", dates: { start: { localDate: "2027-07-13", localTime: "19:00:00", dateTime: "2027-07-13T18:00:00Z" }, status: { code: "onsale" } } }), // marți
    ev({ id: "G7", _embedded: { venues: [{ name: "Stade de France", location: { latitude: "48.92", longitude: "2.36" } }], attractions: [{ name: "Oasis" }] } }),
    ev({ id: "G8", _embedded: { venues: [{ name: "Fără coordonate" }] } }),
  ], cities);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].id, "tm:G5v");
  assert.equal(r.rows[0].city_id, "london_gb");
  assert.deepEqual(r.rows[0].artists, ["Oasis"]);
  assert.ok(r.rows[0].popularity >= 60);
  assert.equal(r.weekday, 1);
  assert.equal(r.outside, 2);
});
