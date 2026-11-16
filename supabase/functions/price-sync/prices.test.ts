import test from "node:test";
import assert from "node:assert/strict";
import { weekendPairs, cityIatas, guideIds, cheapest, validateReport, plausible, monthsAhead, weekendTrips } from "./prices.ts";

test("weekendPairs: vinerea → duminica, doar în viitor, în 60 de zile", () => {
  const w = weekendPairs("2026-11-16"); // luni
  assert.deepEqual(w[0], { out: "2026-11-20", back: "2026-11-22" });
  assert.equal(w.length, 9);
  assert.ok(w.every((x) => new Date(x.out).getUTCDay() === 5));
  assert.equal(weekendPairs("2026-11-20")[0].out, "2026-11-27"); // vineri azi: nu mai contează
});
test("cityIatas: doar orașele cu ilustrație", () => {
  const cities = `{ id: "City:rome_it", name: "Roma", country: "Italia", flag: "🇮🇹", iata: "ROM", code: "rom" },\n { id: "City:cairo_eg", name: "Cairo", iata: "CAI" }`;
  const guides = `window.X = {\n "City:rome_it":{"quizImage":"a.webp","image":"roma"},\n "City:vienna_at": {"quizImage":"b.webp"}}`;
  assert.deepEqual([...cityIatas(cities, guideIds(guides))], [["City:rome_it", "ROM"]]);
});
test("cheapest: cel mai mic preț, preferă direct la egalitate, ignoră valori absurde", () => {
  assert.deepEqual(cheapest({ data: [{ price: 90, transfers: 1 }, { price: 70, transfers: 0 }, { price: 70, transfers: 1 }, { price: 5 }] }), { price: 70, direct: true });
  assert.equal(cheapest({ data: [] }), null);
  assert.equal(cheapest(null), null);
});
test("validateReport: weekend, dată în interval, preț plauzibil", () => {
  const ok = { dest: "City:rome_it", out: "2026-12-04", back: "2026-12-06", price: 63.4, direct: true };
  assert.deepEqual(validateReport(ok, "2026-11-16"), { dest: "City:rome_it", out: "2026-12-04", back: "2026-12-06", price: 63, direct: true });
  assert.equal(validateReport({ ...ok, out: "2026-12-02", back: "2026-12-04" }, "2026-11-16"), null); // miercuri
  assert.equal(validateReport({ ...ok, price: 12 }, "2026-11-16"), null);
  assert.equal(validateReport({ ...ok, out: "2027-03-05", back: "2027-03-07" }, "2026-11-16"), null); // prea departe
  assert.equal(validateReport({ ...ok, dest: "rome" }, "2026-11-16"), null);
  assert.equal(validateReport({ ...ok, back: "2026-12-12" }, "2026-11-16"), null);
});
test("plausible: ×2 / ÷2 față de cache", () => {
  assert.ok(plausible(60, 80)); assert.ok(!plausible(20, 80)); assert.ok(!plausible(200, 80)); assert.ok(plausible(500, undefined));
});
test("weekendTrips: o lună de rezultate → cel mai mic preț pe weekend, doar dus joi–sâmbătă și 2–3 nopți", () => {
  const body = { data: [
    { departure_at: "2026-12-04T19:30:00+02:00", return_at: "2026-12-06T18:00:00+02:00", price: 80, transfers: 1 },
    { departure_at: "2026-12-04T07:30:00+02:00", return_at: "2026-12-06T21:00:00+02:00", price: 64.2, transfers: 0, return_transfers: 0 },
    { departure_at: "2026-12-02T07:30:00+02:00", return_at: "2026-12-04T21:00:00+02:00", price: 30, transfers: 0 },   // miercuri
    { departure_at: "2026-12-04T07:30:00+02:00", return_at: "2026-12-12T21:00:00+02:00", price: 40, transfers: 0 },  // 8 nopți
    { departure_at: "2026-12-11T07:30:00+02:00", return_at: "2026-12-13T21:00:00+02:00", price: 90, transfers: 0 },
  ] };
  const m = weekendTrips(body, "2026-11-16");
  assert.equal(m.size, 2);
  assert.deepEqual(m.get("2026-12-04|2026-12-06"), { out: "2026-12-04", back: "2026-12-06", price: 64, direct: true });
  assert.equal(weekendTrips({ data: [] }, "2026-11-16").size, 0);
  assert.deepEqual(monthsAhead("2026-11-16"), ["2026-11", "2026-12", "2027-01"]);
});
