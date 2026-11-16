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

test('idei de evadare: 3 destinații aleatorii până la 150 €, prețul vizitatorului suprascrie cache-ul, fără Kiwi', async ({ page }) => {
  const db = H.makeDb(); db.tables.route_prices = [...priceRows(), { origin: 'OTP', dest: 'City:london_gb', out_date: H.iso(H.friday(2)), back_date: H.iso(H.addDays(H.friday(2), 2)), price_eur: 200, direct: true, source: 'travelpayouts', seen_at: new Date().toISOString() }];
  const st = await H.install(page, { db });
  await page.goto('/');
  const cards = page.locator('#hf-grid .hm-fl');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('#hf-title')).toContainText('Idei de evadare la weekend din București');
  const first = await cards.allTextContents();
  const prices = first.map(t => +/(\d+) €/.exec(t)[1]);
  expect(prices.every(p => p <= 150)).toBe(true);
  expect(first.join()).not.toMatch(/\b80 €|\b200 €|\b20 €/); // 80 e înlocuit de 55 (vizitator); 200 peste plafon; 20 prea vechi
  expect(await cards.first().getAttribute('href')).toMatch(/zboruri\.html\?dest=City%3A\w+_\w+#configurator/);
  expect(st.kiwi.length).toBe(0);
  expect(H.realErrors(st)).toEqual([]);
});

test('utilizator logat: ideile de zbor respectă bugetul din profil', async ({ page }) => {
  const db = H.makeDb({ search_preferences: [{ user_id: 'qa-user', departure_airports: ['OTP'], budget_max_eur: 75, city_mode: 'any', currency: 'EUR' }] });
  db.tables.route_prices = priceRows();
  await H.install(page, { db, session: true, localStorage: { '23cb-prefs': { departure_airports: ['OTP'], budget_max_eur: 75 } } });
  await page.goto('/');
  const cards = page.locator('#hf-grid .hm-fl');
  await expect(cards).toHaveCount(3); // Roma 55 € și Viena 70 € în buget, completat cu Praga 90 €
  await expect(cards.nth(2)).toContainText('90 €');
});

test('fără prețuri în baza de date, secțiunea de zboruri rămâne ascunsă', async ({ page }) => {
  await H.install(page);
  await page.goto('/');
  await expect(page.locator('#home-events')).toBeVisible();
  await expect(page.locator('#home-flights')).toBeHidden();
});

test('evenimentele: 3 carduri din următoarele 14–60 de zile, echipa preferată prima, fără mențiunea „preferată” pe card', async ({ page }) => {
  const st = await H.install(page, { localStorage: { '23cb-event-prefs': { favorite_teams: ['Juventus'] } } });
  await page.goto('/');
  const titles = page.locator('#he-grid .ev-card h3');
  await expect(titles.first()).toContainText('Roma');
  expect(await titles.count()).toBeLessThanOrEqual(3);
  await expect(page.locator('#he-grid')).not.toContainText('preferată');
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

test('aeroportul din profil: „Idei de evadare la weekend din Valencia”', async ({ page }) => {
  const db = H.makeDb(); db.tables.route_prices = priceRows().map(r => ({ ...r, origin: 'VLC' }));
  await H.install(page, { db, localStorage: { '23cb-prefs': { departure_airports: ['VLC'] } } });
  await page.goto('/');
  await expect(page.locator('#hf-grid .hm-fl')).toHaveCount(3);
  await expect(page.locator('#hf-title')).toContainText('din Valencia');
});

test('aeroport din profil fără prețuri: arată București, cu mențiune', async ({ page }) => {
  const db = H.makeDb(); db.tables.route_prices = priceRows();
  await H.install(page, { db, localStorage: { '23cb-prefs': { departure_airports: ['VLC'] } } });
  await page.goto('/');
  await expect(page.locator('#hf-title')).toContainText('din București');
  await expect(page.locator('#hf-note')).toContainText('Încă nu avem prețuri din Valencia');
});

test('numele orașului din hero e alb', async ({ page }) => {
  await H.install(page);
  await page.goto('/');
  expect(await page.locator('#hero-city').evaluate(n => getComputedStyle(n).color)).toBe('rgb(255, 255, 255)');
});

test('bannerul Orașe vizitate: utilizator logat vede nivelul și textul pe nivel, cu CTA către quiz', async ({ page }) => {
  const ids = ['rome_it', 'paris_fr', 'prague_cz', 'vienna_at', 'madrid_es', 'berlin_de'];
  const db = H.makeDb({ visited_cities: ids.map(city_id => ({ user_id: 'qa-user', city_id })) });
  await H.install(page, { db, session: true });
  await page.goto('/');
  await expect(page.locator('#hc-kick')).toContainText('Călător de weekend');
  await expect(page.locator('#hc-title')).toContainText('6 orașe europene');
  await expect(page.locator('#hc-prog-text')).toContainText('Încă 6 orașe până la „Explorator”');
  await expect(page.locator('.hm-cta a[href="orase-vizitate.html#city-quiz"]')).toBeVisible();
});

test('headerul negru are aceeași lățime, înălțime și colțuri pe Acasă, Zboruri și Evenimente', async ({ page }) => {
  const read = sel => page.evaluate(s => { const n = document.querySelector(s), c = getComputedStyle(n), r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), br: c.borderBottomLeftRadius, bt: c.borderTopLeftRadius }; }, sel);
  await H.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const out = [];
  for (const [url, sel] of [['/', '.hero'], ['/zboruri.html', '.page-hero'], ['/evenimente.html', '.evp-hero']]) { await page.goto(url); out.push(await read(sel)); }
  for (const o of [out[1], out[2]]) { expect(Math.abs(o.w - out[0].w)).toBeLessThanOrEqual(3); expect(Math.abs(o.h - out[0].h)).toBeLessThanOrEqual(3); expect(o.br).toBe(out[0].br); }
  expect(out[0].br).toBe('28px');
});

test('hero Zboruri/Evenimente: carusel cu poze Commons, credit în pagină, text deasupra', async ({ page }) => {
  await H.install(page);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://commons.wikimedia.org/w/api.php**', route => {
    const titles = new URL(route.request().url()).searchParams.get('titles').split('|');
    const pages = Object.fromEntries(titles.map((t, i) => [i, { title: t, imageinfo: [{ thumburl: `https://upload.wikimedia.org/qa/${i}.png`, descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(t)}`, extmetadata: { Artist: { value: '<a>Autor Test</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] }]));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ query: { pages } }) });
  });
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }));
  for (const [url, sel, n] of [['/zboruri.html', '.page-hero', 3], ['/evenimente.html', '.evp-hero', 3]]) {
    await page.goto(url);
    await expect(page.locator(`${sel} > div[aria-hidden]`).first()).toHaveCSS('opacity', '1');
    await expect(page.locator('#photo-credit-list li')).toHaveCount(n);
    await expect(page.locator('#photo-credit-list')).toContainText('Autor Test · CC BY-SA 4.0');
    await expect(page.locator(`${sel} h1`)).toBeVisible();
  }
});

test('evenimente Acasă: doar vineri–duminică, fără excepții (nici Champions League), cu prețul zborului din weekendul evenimentului', async ({ page }) => {
  const f3 = H.friday(3), at = (d, t) => `${H.iso(d)}T${t}:00Z`;
  const base = { venue: null, ends_at: null, time_tbc: false, artists: [], teams: [], genres: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 95, source: 'football-data', kind: 'football' };
  const events = [
    { ...base, id: 'fd:sat', title: 'AS Roma – Juventus FC', city_id: 'rome_it', starts_at: at(H.addDays(f3, 1), '19:45'), teams: ['AS Roma', 'Juventus FC'], competition: 'SA' },
    { ...base, id: 'fd:cl', title: 'Real Madrid CF – FC Bayern', city_id: 'madrid_es', starts_at: at(H.addDays(f3, -3), '20:00'), teams: ['Real Madrid CF', 'FC Bayern'], competition: 'CL' }, // marți
    { ...base, id: 'fd:el', title: 'Olympiacos – Partizan', city_id: 'athens_gr', starts_at: at(H.addDays(f3, -1), '20:00'), competition: 'EL', kind: 'sport' },        // joi
  ];
  const db = H.makeDb(); const out = H.iso(f3), back = H.iso(H.addDays(f3, 2));
  db.tables.route_prices = [{ origin: 'OTP', dest: 'City:rome_it', out_date: out, back_date: back, price_eur: 77, direct: true, source: 'travelpayouts', seen_at: new Date().toISOString() }];
  await H.install(page, { db, events });
  await page.goto('/');
  await expect(page.locator('#he-grid .ev-card')).toHaveCount(1);
  await expect(page.locator('#he-grid')).toContainText('Roma');
  await expect(page.locator('#he-grid')).not.toContainText('Real Madrid');
  await expect(page.locator('#he-grid')).not.toContainText('Olympiacos');
  await expect(page.locator('#he-grid .ev-flight')).toContainText('zbor din București de la 77 €');
});
