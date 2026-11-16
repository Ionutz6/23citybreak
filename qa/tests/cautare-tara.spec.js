// Căutare pe țară: „Spania (orice oraș)” cere Kiwi toate orașele țării dintr-o singură cerere pe weekend. Kiwi e simulat.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

test('destinația poate fi o țară întreagă', async ({ page }) => {
  const dests = [];
  const st = await H.install(page, { kiwi: body => {
    const it = body.variables.search.itinerary, out = it.outboundDepartureDate.start.slice(0, 10), back = it.inboundDepartureDate.start.slice(0, 10);
    dests.push(it.destination.ids);
    return { data: { returnItineraries: { itineraries: it.destination.ids.map((to, i) => H.ret({ to, out, back, price: 50 + i * 5 })) } } };
  } });
  await page.goto('/');
  const input = page.locator('#dest-search-input');
  await input.click(); await input.fill('spania');
  await expect(page.locator('#dest-autocomplete-dropdown button').first()).toContainText('Spania (orice oraș)');
  await page.locator('#dest-autocomplete-dropdown button').first().click();
  await expect(page.locator('#f-destination')).toHaveValue('Country:ES');
  await page.evaluate(() => { selectedWkIds = new Set([ALL_WEEKENDS.find(w => w.fri > new Date().toISOString().slice(0, 10)).id]); });
  await page.evaluate(() => runLiveSearch());
  await expect(page.locator('#search-status').first()).toContainText('din Spania', { timeout: 15000 });
  expect(dests.length).toBe(1);
  expect(dests[0].every(id => id.endsWith('_es'))).toBeTruthy();
  const rows = await page.evaluate(() => currentRows.map(r => r.cityId));
  expect(rows.length).toBeGreaterThan(3);
  expect(rows.every(id => id.endsWith('_es'))).toBeTruthy();
  expect(H.realErrors(st)).toEqual([]);
});
