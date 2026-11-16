// Home: hero, zboruri ieftine din route_prices (fără Kiwi), evenimente de weekend (favoritele primele), redirect-uri vechi, Jurnal pe Orașe vizitate.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const priceRows = () => {
  const out = H.iso(H.friday(2)), back = H.iso(H.addDays(H.friday(2), 2)), at = new Date().toISOString(), old = new Date(Date.now() - 5 * 864e5).toISOString();
  const r = (dest, price, extra = {}) => ({ origin: 'OTP', dest, out_date: out, back_date: back, price_eur: price, direct: true, source: 'travelpayouts', seen_at: at, ...extra });
  return [r('City:rome_it', 80), r('City:vienna_at', 70), r('City:prague_cz', 90), r('City:madrid_es', 120),
    r('City:rome_it', 55, { source: 'visitor' }),          // prețul real al unui vizitator înlocuiește cache-ul
    r('City:london_gb', 20, { seen_at: old })];            // prea vechi: ignorat
};

test('zborurile ieftine: 3 orașe, prețul vizitatorului suprascrie cache-ul, fără cereri la Kiwi', async ({ page }) => {
  const db = H.makeDb(); db.tables.route_prices = priceRows();
  const st = await H.install(page, { db });
  await page.goto('/');
  const cards = page.locator('#hf-grid .hm-fl');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('55 €');
  await expect(cards.nth(1)).toContainText('70 €');
  await expect(cards.nth(2)).toContainText('90 €');
  await expect(cards.nth(0)).toHaveAttribute('href', /zboruri\.html\?dest=City%3Arome_it#configurator/);
  expect(await cards.nth(0).evaluate(n => n.style.backgroundImage)).toContain('assets/guides-prague-style/800/roma.webp');
  expect(st.kiwi.length).toBe(0);
  expect(H.realErrors(st)).toEqual([]);
});

test('fără prețuri în baza de date, secțiunea de zboruri rămâne ascunsă', async ({ page }) => {
  await H.install(page);
  await page.goto('/');
  await expect(page.locator('#home-events')).toBeVisible();
  await expect(page.locator('#home-flights')).toBeHidden();
});

test('evenimentele: 3 carduri din următoarele 14–60 de zile, echipa preferată prima', async ({ page }) => {
  const st = await H.install(page, { localStorage: { '23cb-event-prefs': { favorite_teams: ['Juventus'] } } });
  await page.goto('/');
  const titles = page.locator('#he-grid .ev-card h3');
  await expect(titles.first()).toContainText('Roma');
  expect(await titles.count()).toBeLessThanOrEqual(3);
  await expect(page.locator('#he-grid')).toContainText('Echipa ta preferată');
  expect(H.realErrors(st)).toEqual([]);
});

test('meniul: Acasă · Zboruri · Evenimente · Orașe vizitate, fără Jurnal', async ({ page }) => {
  await H.install(page);
  for (const p of ['/', '/zboruri.html', '/evenimente.html', '/orase-vizitate.html', '/jurnal.html']) {
    await page.goto(p);
    await expect(page.locator('.cb-nav a')).toHaveText(['Acasă', 'Zboruri', 'Evenimente', 'Orașe vizitate']);
  }
});

test('linkurile vechi spre căutare ajung pe zboruri.html', async ({ page }) => {
  await H.install(page);
  await page.goto('/?dest=City:rome_it#configurator');
  await expect(page).toHaveURL(/\/zboruri\.html\?dest=City:rome_it#configurator/);
  await expect(page.locator('#configurator')).toBeVisible();
});

test('click pe poza din hero duce la Zboruri', async ({ page }) => {
  await H.install(page);
  await page.goto('/');
  await page.locator('.hero-image').click();
  await expect(page).toHaveURL(/zboruri\.html|weekend\.html/);
});

test('Jurnalul e pe Orașe vizitate, iar jurnal.html rămâne publicat', async ({ page }) => {
  await H.install(page);
  await page.goto('/orase-vizitate.html');
  await expect(page.locator('#jurnal')).toContainText('Praga în 2 zile');
  await page.goto('/jurnal.html');
  await expect(page.locator('h1')).toContainText('Jurnal');
});
