// Căutare zboruri pe țară: „Spania" caută toate orașele spaniole din listă, progresiv, per oraș, fără retry la 403.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const kiwiES = (body) => {
  const it = body.variables.search.itinerary;
  const out = it.outboundDepartureDate.start.slice(0, 10), back = it.inboundDepartureDate.start.slice(0, 10);
  const prices = { 'City:madrid_es': 70, 'City:barcelona_es': 55, 'City:valencia_es': 90 };
  return { data: { returnItineraries: { itineraries: it.destination.ids.filter(d => prices[d]).map(to => H.ret({ to, out, back, price: prices[to] })) } } };
};

async function pickSpain(page) {
  await page.goto('/zboruri.html');
  await page.locator('#dest-search-input').fill('spania');
  const btn = page.locator('#dest-autocomplete-dropdown [data-destination-id="Country:ES"]');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator('#dest-search-input')).toHaveValue(/Spania \(toate orașele\)/);
  page.on('dialog', d => d.dismiss());
  await page.locator('#calendar-toggle').click(); // calendarul e ascuns implicit (formular compact)
  const days = page.locator('.calendar-day.available');
  await days.first().click();
  await days.nth(8).click();
}

test('țară: Spania → o cerere per weekend (max 8 orașe/cerere), rezultate pe oraș', async ({ page }) => {
  const st = await H.install(page, { kiwi: kiwiES });
  await pickSpain(page);
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-status-text')).toContainText(/Căutare finalizată.*orașe din Spania/, { timeout: 30000 });
  const dests = new Set(st.kiwi.flatMap(b => b.variables.search.itinerary.destination.ids));
  expect([...dests].every(id => id.endsWith('_es'))).toBe(true);
  expect(dests.has('City:madrid_es') && dests.has('City:barcelona_es')).toBe(true);
  expect(st.kiwi.every(b => b.variables.search.itinerary.destination.ids.length <= 8)).toBe(true);
  const text = await page.locator('#results-section').innerText();
  expect(text).toMatch(/madrid/i); expect(text).toMatch(/barcelona/i); expect(text).toMatch(/valencia/i);
  expect(st.errors).toEqual([]);
});

test('țară: la primul refuz 403 se oprește și nu reîncearcă', async ({ page }) => {
  const st = await H.install(page, { kiwi: () => ({ __status: 403, body: {} }) });
  await pickSpain(page);
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-status-text')).toContainText(/limit|pauză|Kiwi|minute|nu am putut|furnizor/i, { timeout: 30000 });
  expect(st.kiwi.length).toBeLessThanOrEqual(12); // cel mult primul val, fără retry
  const n = st.kiwi.length;
  await page.waitForTimeout(3500);
  expect(st.kiwi.length).toBe(n);
});

test('prețurile găsite se trimit anonim la price-report (o singură dată), pentru Home', async ({ page }) => {
  const st = await H.install(page, { kiwi: kiwiES });
  await pickSpain(page);
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-status-text')).toContainText(/Căutare finalizată/, { timeout: 30000 });
  await expect.poll(() => st.db.fn.filter(f => f.name === 'price-report').length, { timeout: 15000 }).toBeGreaterThan(0);
  const items = st.db.fn.filter(f => f.name === 'price-report').flatMap(f => f.body.items);
  expect(st.db.fn.find(f => f.name === 'price-report').body.origin).toBe('OTP');
  expect(items.find(i => i.dest === 'City:barcelona_es').price).toBe(55);
  expect(items.every(i => /^City:/.test(i.dest) && i.out < i.back)).toBe(true);
  expect(JSON.stringify(items)).not.toMatch(/@|token|email/i);
  const keys = items.map(i => `${i.dest}|${i.out}`);
  expect(new Set(keys).size).toBe(keys.length); // fără duplicate
});
