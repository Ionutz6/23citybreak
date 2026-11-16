// Evenimente: 4 pe rând, 8 pe pagină cu săgeți, preț de zbor mare auriu, ordine crescătoare după preț; căutarea nu e tăiată de hero.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const f = H.friday(3), at = d => `${H.iso(d)}T20:00:00Z`;
const base = { venue: null, ends_at: null, time_tbc: false, genres: ['Rock'], teams: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 70, source: 'ticketmaster', kind: 'concert' };
const cities = ['paris_fr', 'rome_it', 'vienna_at', 'prague_cz', 'london_gb', 'berlin_de', 'madrid_es', 'lisbon_pt', 'oslo_no', 'dublin_ie', 'athens_gr', 'warsaw_pl', 'milan_it', 'porto_pt', 'munich_de', 'lyon_fr'];
const rp = (city, eur) => ({ origin: 'OTP', dest: `City:${city}`, out_date: H.iso(f), back_date: H.iso(H.addDays(f, 2)), price_eur: eur, direct: true, source: 'travelpayouts', seen_at: new Date().toISOString() });

test('8 pe pagină, săgeți, preț auriu mare, ordine după preț, căutarea vizibilă', async ({ page }) => {
  const events = cities.map((c, i) => ({ ...base, id: 'e' + i, title: 'Trupa ' + i, city_id: c, artists: ['Trupa ' + i], starts_at: at(f) }));
  const db = H.makeDb({ route_prices: cities.map((c, i) => rp(c, 200 - i * 10)) });
  await H.install(page, { events, db, localStorage: { '23cb-prefs': { departure_airports: ['OTP'] } } });
  await page.goto('/evenimente.html?tab=music');
  await page.waitForSelector('.ev-card');
  const titles = () => page.locator('.ev-card h3').allInnerTexts();
  await expect.poll(async () => (await titles()).length).toBe(8);
  expect((await titles())[0]).toBe('Trupa 15');
  expect(await page.locator('.ev-grid').evaluate(g => getComputedStyle(g).gridTemplateColumns.split(' ').length)).toBe(4);
  expect(await page.locator('.ev-fp b').first().evaluate(e => getComputedStyle(e).color)).toBe('rgb(223, 166, 73)');
  await page.click('[data-page-to="1"]');
  await expect(page.locator('.ev-pg.on')).toHaveAttribute('aria-current', 'page');
  await page.fill('#evs-q', 'trupa');
  await expect.poll(() => page.evaluate(() => { const p = document.getElementById('evs-panel'), r = p.getBoundingClientRect(); return !p.hidden && !!document.elementFromPoint(r.left + 50, r.top + 20)?.closest('#evs-panel'); })).toBe(true);
});
