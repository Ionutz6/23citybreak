// Slider de perioadă: Evenimente (secțiunea Favorite, interval) și Zboruri (filtru pe weekenduri, limită 12 rezultate). Doar cu cont.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');

const f = n => H.friday(n), at = d => `${H.iso(d)}T20:00:00Z`;
const base = { venue: null, ends_at: null, time_tbc: false, genres: ['Rock'], teams: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 70, source: 'ticketmaster', kind: 'concert' };
const ev = (id, title, city, d, extra = {}) => ({ ...base, id, title, city_id: city, artists: [title], starts_at: at(d), ...extra });

async function drag(page, handle, toX) {
  await page.locator(handle).scrollIntoViewIfNeeded();
  const b = await page.locator(handle).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(toX, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
}

test.describe('Evenimente', () => {
  const events = [ev('e1', 'Trupa Aproape', 'paris_fr', f(3)), ev('e2', 'Trupa Departe', 'rome_it', f(14)), ev('e3', 'Trupa Favorită', 'vienna_at', f(4))];
  const ls = { '23cb-prefs': { departure_airports: ['OTP'] }, '23cb-event-prefs': { favorite_artists: ['Trupa Favorită'] } };

  test('nelogat: fără slider, fără secțiunea Favorite', async ({ page }) => {
    await H.install(page, { events, localStorage: ls });
    await page.goto('/evenimente.html?tab=music'); await page.waitForSelector('.ev-card');
    await expect(page.locator('.ps')).toHaveCount(0);
    await expect(page.locator('.evp-fav')).toHaveCount(0);
  });

  test('logat: slider cu implicit 14 zile – 2 luni, Favorite separat, capetele se mută pe săptămâni', async ({ page }) => {
    const st = await H.install(page, { events, session: true, localStorage: ls });
    await page.goto('/evenimente.html?tab=music'); await page.waitForSelector('.ev-card');
    await expect(page.locator('.ps')).toHaveCount(1);
    await expect(page.locator('.evp-fav h2')).toHaveText('★ Favorite');
    await expect(page.locator('.evp-fav .ev-card h3')).toHaveText(['Trupa Favorită']);
    const titles = () => page.locator('#evp-panel > .ev-grid .ev-card h3').allInnerTexts();
    expect(await titles()).toEqual(['Trupa Aproape']);           // „Departe” e peste interval
    expect(H.realErrors(st)).toEqual([]);
    // Capătul drept spre sfârșitul scalei → apare și concertul îndepărtat
    await page.locator('[data-ps=b]').scrollIntoViewIfNeeded();
    const track = await page.locator('[data-ps-track]').boundingBox();
    await drag(page, '[data-ps=b]', track.x + track.width * 0.97);
    await expect.poll(titles).toContain('Trupa Departe');
    // Capătul stâng nu trece de azi
    await drag(page, '[data-ps=a]', track.x - 40);
    const today = await page.evaluate(() => CBPeriodSlider.iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))));
    await expect(page.locator('.ps')).toHaveAttribute('data-from', today);
    // Tastatură: o săptămână pe apăsare
    await page.focus('[data-ps=b]'); const to0 = await page.locator('.ps').getAttribute('data-to');
    await page.keyboard.press('ArrowLeft');
    const to1 = await page.locator('.ps').getAttribute('data-to');
    expect((new Date(to0) - new Date(to1)) / 864e5).toBe(7);
  });

  test('scara: 26 de săptămâni (~6 luni) de la săptămâna de azi, cu marcaje de lună', async ({ page }) => {
    await H.install(page, { events, session: true, localStorage: ls });
    await page.goto('/evenimente.html?tab=music'); await page.waitForSelector('.ps');
    expect(await page.locator('.ps-ticks i:not(.ps-tick-m)').count()).toBe(26);
    expect(await page.locator('.ps-tick-m').count()).toBeGreaterThanOrEqual(5);
    expect(await page.locator('.ps-tick-m').count()).toBeLessThanOrEqual(7);
    const track = await page.locator('[data-ps-track]').boundingBox();
    await drag(page, '[data-ps=b]', track.x + track.width + 60);           // nu trece de capătul scalei
    const to = await page.locator('.ps').getAttribute('data-to');
    const max = new Date(Date.now() + 26 * 7 * 864e5 + 8 * 864e5);
    expect(new Date(to) <= max).toBe(true);
  });
});

test.describe('Zboruri', () => {
  test('logat: slider selectează weekendurile din interval; „Tot anul” mută capetele', async ({ page }) => {
    const st = await H.install(page, { session: true });
    await page.goto('/zboruri.html');
    await expect(page.locator('#period-slider.ps')).toBeVisible();
    const n0 = await page.evaluate(() => selectedWkIds.size);
    expect(n0).toBeGreaterThanOrEqual(6); expect(n0).toBeLessThanOrEqual(9);   // 14 zile – 2 luni
    expect(st.kiwi.length).toBe(0);                                              // nicio cerere Kiwi la încărcare
    await page.locator('[data-ps=b]').scrollIntoViewIfNeeded();
    const track = await page.locator('[data-ps-track]').boundingBox();
    await drag(page, '[data-ps=b]', track.x + track.width * 0.97);
    await expect.poll(() => page.evaluate(() => selectedWkIds.size)).toBeGreaterThan(20);
    expect(await page.evaluate(() => [...selectedWkIds].every(id => new Date(id).getUTCDay() === 5))).toBe(true); // doar vineri → duminică
    await page.evaluate(() => selectCalendarRange('year'));
    const r = await page.evaluate(() => { const s = [...selectedWkIds].sort(); return [s[0], s.at(-1)]; });
    await expect(page.locator('#period-slider')).toHaveAttribute('data-to', new RegExp(`^${r[1].slice(0, 4)}-1[12]-`));
    expect(H.realErrors(st)).toEqual([]);
  });

  test('nelogat: fără slider', async ({ page }) => {
    await H.install(page);
    await page.goto('/zboruri.html');
    await expect(page.locator('#period-slider')).toBeHidden();
  });

  test('interval mare fără oraș: doar 12 rezultate și mesajul de rafinare', async ({ page }) => {
    await H.install(page, { session: true });
    await page.goto('/zboruri.html');
    await page.evaluate(() => {
      showCalendarYear(today.getFullYear() + 1); selectCalendarRange('year');
      const wk = getSelectedWeekendsList(), cs = ALL_EUROPE_CITIES.filter(c => c.id && !c.isAll && !c.isCountry && c.iata).slice(0, 20), ids = cs.map(c => c.id);
      hasEverSearched = true; searchState = 'success';
      currentRows = ids.map((cityId, i) => ({ cityId, city: cs[i].name, code: cs[i].iata, iata: cs[i].iata, cellsMap: { [wk[0].id]: { perPaxEur: 40 + i, stops: 0 } } }));
      revealResultsSection(); renderMatrix();
    });
    await expect(page.locator('#range-cap-note')).toBeVisible();
    await expect(page.locator('#range-cap-note')).toContainText('Alege un oraș sau o țară');
    expect(await page.locator('#cards-grid > *').count()).toBeLessThanOrEqual(12);
  });
});
