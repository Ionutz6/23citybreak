// Muzică: implicit doar artiști internaționali cunoscuți (turneu în ≥2 țări, festival cu line-up, stadion); fără trupe locale și fără tribute.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

test('filtrul „Doar artiști internaționali” ascunde trupele locale și tributele', async ({ page }) => {
  const f = H.friday(3), at = (d, t) => `${H.iso(d)}T${t}:00Z`;
  const base = { venue: null, ends_at: null, time_tbc: false, genres: ['Rock'], teams: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 70, source: 'ticketmaster' };
  const mk = (id, title, city, artist, extra = {}) => ({ ...base, id, kind: 'concert', title, city_id: city, starts_at: at(H.addDays(f, 1), '19:00'), artists: [artist], ...extra });
  const events = [
    mk('a1', 'Editors', 'copenhagen_dk', 'Editors'), mk('a2', 'Editors', 'london_gb', 'Editors', { starts_at: at(H.addDays(f, 8), '19:00') }),
    mk('b1', 'Mala Kapela', 'warsaw_pl', 'Mala Kapela', { venue: 'Klub Wiejski' }),
    mk('c1', 'Ultimate Coldplay', 'london_gb', 'Ultimate Coldplay'), mk('c2', 'Ultimate Coldplay', 'paris_fr', 'Ultimate Coldplay'),
  ];
  const st = await H.install(page, { events, localStorage: { '23cb-prefs': { departure_airports: ['OTP'] } } });
  await page.goto('/evenimente.html?tab=music&weekend=0');
  await page.locator('input[data-opt=onlyFlights]').evaluate(el => el.click());
  const titles = () => page.locator('.ev-card h3').allInnerTexts();
  await expect.poll(titles).toEqual(['Editors', 'Editors']);
  await page.locator('input[data-opt=onlyNotable]').evaluate(el => el.click());
  await expect.poll(async () => (await titles()).length).toBe(5);
  expect(H.realErrors(st)).toEqual([]);
});
