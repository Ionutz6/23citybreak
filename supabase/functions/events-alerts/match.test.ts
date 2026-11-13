import test from "node:test";
import assert from "node:assert/strict";
import { digestEmail, matchEvent, nameAlertEmail, pickDigest, sportOf, whenText, type Ev, type Prefs } from "./match.ts";

const ev = (o: Partial<Ev> = {}): Ev => ({
  id: "x1", kind: "concert", title: "Concert", city_id: "london_gb", venue: "Wembley Stadium", starts_at: "2027-08-21T18:30:00Z", ends_at: null,
  time_tbc: false, artists: [], teams: [], competition: null, genres: [], price_min_eur: null, popularity: 60, ...o,
});
const none: Prefs = { music_genres: [], sports: [], competitions: [], other_interests: [], favorite_teams: [], favorite_artists: [] };

test("artist favorit: potrivire pe cuvinte întregi, fără diacritice", () => {
  const e = ev({ title: "Mötley Crüe Live", artists: ["Mötley Crüe"] });
  assert.equal(matchEvent(e, { ...none, favorite_artists: ["motley crue"] }).score, 3);
  assert.equal(matchEvent(ev({ title: "Romania Fest" }), { ...none, favorite_teams: ["Roma"] }).score, 0);
});
test("echipă favorită din teams", () => {
  const e = ev({ kind: "football", title: "Real – Celta", teams: ["Real Madrid CF", "RC Celta de Vigo"], competition: "PD" });
  assert.equal(matchEvent(e, { ...none, favorite_teams: ["Real Madrid"] }).score, 3);
  assert.equal(matchEvent(e, { ...none, competitions: ["PD"] }).score, 2);
  assert.equal(matchEvent(e, { ...none, sports: ["football"] }).score, 1);
  assert.equal(matchEvent(e, { ...none, sports: ["rugby"] }).score, 0);
});
test("gen muzical și alte motive", () => {
  assert.equal(matchEvent(ev({ genres: ["Rock"] }), { ...none, music_genres: ["rock"] }).score, 1);
  assert.equal(matchEvent(ev({ genres: ["Hip-Hop/Rap"] }), { ...none, music_genres: ["hiphop"] }).score, 1);
  assert.equal(matchEvent(ev({ genres: ["Rock"] }), { ...none, music_genres: ["jazz"] }).score, 0);
  assert.equal(matchEvent(ev({ kind: "market" }), { ...none, other_interests: ["xmas_market"] }).score, 1);
});
test("sportOf: rugby după competiție, alte sporturi după text", () => {
  assert.equal(sportOf(ev({ kind: "sport", competition: "6N", title: "Italia – Scoția" })), "rugby");
  assert.equal(sportOf(ev({ kind: "sport", title: "EuroLeague basketball" })), "basketball");
  assert.equal(sportOf(ev({ kind: "concert" })), "");
});
test("pickDigest: ordonare, dedupe și limită", () => {
  const list = [ev({ id: "a", genres: ["Rock"], popularity: 90 }), ev({ id: "b", artists: ["Oasis"], title: "Oasis", popularity: 50 }), ev({ id: "c", genres: ["Rock"], popularity: 70 }), ev({ id: "d", genres: ["Jazz"] })];
  const r = pickDigest(list, { ...none, music_genres: ["rock"], favorite_artists: ["Oasis"] }, new Set(["c"]), 2);
  assert.deepEqual(r.shown.map((e) => e.id), ["b", "a"]);
  assert.equal(r.more, 0);
  const all = pickDigest(list, { ...none, music_genres: ["rock"], favorite_artists: ["Oasis"] }, new Set(), 2);
  assert.equal(all.more, 1);
});
test("emailuri: ora locală, escapare, link de dezabonare", () => {
  assert.equal(whenText(ev()), "sâm 21 aug 2027, 19:30"); // Londra vara = UTC+1
  const m = nameAlertEmail([{ query: "oasis <b>", events: [ev({ id: "tm:A1", title: "Oasis & Co" })] }], "https://x/y?t=1");
  assert.match(m.html, /Oasis &amp; Co/);
  assert.match(m.html, /ALERTA TA: OASIS &lt;B&gt;/);
  assert.match(m.html, /weekend\.html\?e=tm%3AA1/);
  assert.match(m.html, /https:\/\/x\/y\?t=1/);
  const d = digestEmail([ev({ title: "A" }), ev({ id: "y", title: "B" }), ev({ id: "z", title: "C" })], 4, "https://u");
  assert.match(d.subject, /A, B și altele/);
  assert.match(d.html, /Încă 4 evenimente/);
});
