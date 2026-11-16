// Muzică: doar concerte de vineri–duminică, ordonate crescător după prețul zborului (route_prices), favoritele primele, fără preț la coadă; prețul e auriu.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const f = H.friday(3), at = (d, t) => `${H.iso(d)}T${t}:00Z`;
const base = { venue: null, ends_at: null, time_tbc: false, genres: ['Rock'], teams: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 70, source: 'ticketmaster', kind: 'concert' };
const mk = (id, title, city, day = 0, extra = {}) => ({ ...base, id, title, city_id: city, artists: [title], starts_at: at(H.addDays(f, day), '20:00'), ...extra });
const rp = (city, eur) => ({ origin: 'OTP', dest: `City:${city}`, out_date: H.iso(f), back_date: H.iso(H.addDays(f, 2)), price_eur: eur, direct: true, source: 'travelpayouts', seen_at: new Date().toISOString() });
const titles = page => page.locator('.ev-card h3').allInnerTexts();

test('weekend doar, ordonat după prețul zborului, favorita prima, fără preț la coadă', async ({ page }) => {
  const events = [
    mk('a', 'Scump', 'paris_fr'), mk('b', 'Ieftin', 'rome_it'), mk('c', 'Fărăpreț', 'vienna_at'),
    mk('d', 'Miercuri', 'berlin_de', -2), mk('e', 'Favorita', 'prague_cz'),
  ];
  const db = H.makeDb ? H.makeDb({ route_prices: [rp('paris_fr', 120), rp('rome_it', 40), rp('prague_cz', 300)] }) : undefined;
  await H.install(page, { events, db, localStorage: { '23cb-prefs': { departure_airports: ['OTP'] }, '23cb-event-prefs': { favorite_artists: ['Favorita'] } } });
  await page.goto('/evenimente.html?tab=music');
  await expect.poll(titles).toEqual(['Favorita', 'Ieftin', 'Scump', 'Fărăpreț']);
  await expect(page.locator('.evp-price.ok').first()).toBeVisible();
});
