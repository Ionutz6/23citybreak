// Muzică: cu „Doar artiști cunoscuți” activ (implicit) cel mult 10 carduri, un card per artist: favoritele prima, apoi cei cu turneu în mai multe țări
// și săli mari, apoi restul; fără tribute. Fără filtru se vede tot.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const f = H.friday(3), at = (d, t) => `${H.iso(d)}T${t}:00Z`;
const base = { venue: null, ends_at: null, time_tbc: false, genres: ['Rock'], teams: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 70, source: 'ticketmaster' };
const mk = (id, title, city, artist, extra = {}) => ({ ...base, id, kind: 'concert', title, city_id: city, starts_at: at(H.addDays(f, 1), '19:00'), artists: [artist], ...extra });
const open = async (page, events, ls = {}) => {
  const st = await H.install(page, { events, localStorage: { '23cb-prefs': { departure_airports: ['OTP'] }, ...ls } });
  await page.goto('/evenimente.html?tab=music&weekend=0');
  return st;
};
const titles = page => page.locator('.ev-card h3').allInnerTexts();

test('turneu în 2 țări urcă înaintea trupei locale; tributul nu apare; fără filtru se vede tot', async ({ page }) => {
  const events = [
    mk('b1', 'Mala Kapela', 'warsaw_pl', 'Mala Kapela', { venue: 'Klub Wiejski' }),
    mk('a1', 'Editors', 'copenhagen_dk', 'Editors', { venue: 'Den Grå Hal' }), mk('a2', 'Editors', 'london_gb', 'Editors', { starts_at: at(H.addDays(f, 8), '19:00'), venue: 'The O2' }),
    mk('c1', 'Ultimate Coldplay', 'london_gb', 'Ultimate Coldplay'), mk('c2', 'Ultimate Coldplay', 'paris_fr', 'Ultimate Coldplay'),
  ];
  const st = await open(page, events);
  await expect.poll(titles).toEqual(['Editors', 'Mala Kapela']);
  await page.locator('input[data-opt=onlyNotable]').evaluate(el => el.click());
  await expect.poll(async () => (await titles(page)).length).toBe(5);
  expect(H.realErrors(st)).toEqual([]);
});

test('maximum 10 carduri, favorita prima, cel mult 2 pe oraș', async ({ page }) => {
  const events = Array.from({ length: 14 }, (_, i) => mk(`x${i}`, `Trupa ${i}`, i < 5 ? 'berlin_de' : ['paris_fr', 'rome_it', 'vienna_at', 'prague_cz', 'london_gb', 'madrid_es', 'dublin_ie', 'oslo_no', 'lisbon_pt'][i - 5], `Trupa ${i}`, { popularity: 20 + i }));
  await open(page, events, { '23cb-event-prefs': { favorite_artists: ['Trupa 0'] } });
  await expect.poll(async () => (await titles(page)).length).toBe(10);
  expect((await titles(page))[0]).toBe('Trupa 0');
  const berlin = await page.locator('.ev-card', { hasText: 'Berlin' }).count();
  expect(berlin).toBeLessThanOrEqual(2);
});
