// Zboruri: cardul nu are linkuri sau butoane; click pe tot cardul deschide ghidul de weekend cu preț, perioadă și cumpărare.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const kiwiES = (body) => {
  const it = body.variables.search.itinerary;
  const out = it.outboundDepartureDate.start.slice(0, 10), back = it.inboundDepartureDate.start.slice(0, 10);
  const prices = { 'City:madrid_es': 70, 'City:barcelona_es': 55 };
  return { data: { returnItineraries: { itineraries: it.destination.ids.filter(d => prices[d]).map(to => H.ret({ to, out, back, price: prices[to] })) } } };
};

test('card de zbor: fără linkuri, click pe card deschide ghidul cu Kiwi și estimare', async ({ page }) => {
  const st = await H.install(page, { kiwi: kiwiES });
  await page.goto('/zboruri.html');
  await page.locator('#dest-search-input').fill('spania');
  await page.locator('#dest-autocomplete-dropdown [data-destination-id="Country:ES"]').click();
  page.on('dialog', d => d.dismiss());
  await page.locator('#calendar-toggle').click();
  const days = page.locator('.calendar-day.available');
  await days.first().click(); await days.nth(8).click();
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-status-text')).toContainText(/Căutare finalizată/, { timeout: 30000 });
  const card = page.locator('#cards-grid [data-guide-card]').first();
  await expect(card).toBeVisible();
  expect(await card.locator('a, button').count()).toBe(0);
  await card.click({ position: { x: 20, y: 150 } });
  const dlg = page.locator('.fg-ov.open');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.fg-cta')).toHaveText('Cumpără bilet de avion');
  await expect(dlg.locator('.fg-cta')).toHaveAttribute('href', /kiwi\.com/);
  await expect(dlg.locator('.fg-alt')).toContainText('Skyscanner');
  await expect(dlg.locator('.fg-meta')).toContainText('Vineri');
  await expect(dlg.locator('.fg-map img')).toBeVisible(); // Madrid/Barcelona au ilustrație
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  expect(st.errors).toEqual([]);
});

test('sliderele din Zboruri (buget și perioadă) sunt verzi', async ({ page }) => {
  await H.install(page, { session: true });
  await page.goto('/zboruri.html');
  const accent = await page.locator('.option-fields .option-slider').first().evaluate(e => getComputedStyle(e).accentColor);
  expect(accent).toBe('rgb(46, 157, 104)');
  const fill = await page.locator('.ps-fill').first().evaluate(e => getComputedStyle(e).backgroundColor);
  expect(fill).toBe('rgb(46, 157, 104)');
});
