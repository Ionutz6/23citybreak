// Bug D: pagina de dezabonare ascunde butonul după confirmare, la link invalid și la link expirat.
// Toate apelurile către Supabase sunt simulate: nu se dezabonează niciun utilizator real.
const { test, expect } = require('@playwright/test');
const TOKEN = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

async function mock(page, result) {
  const calls = [];
  await page.route('**/rest/v1/rpc/**', route => {
    calls.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  return calls;
}

test('după confirmare: butonul și introducerea dispar, apare mesajul de succes', async ({ page }) => {
  const calls = await mock(page, true);
  await page.goto('/dezabonare.html?t=' + TOKEN);
  await expect(page.locator('#unsub-btn')).toBeVisible();
  await page.click('#unsub-btn');
  await expect(page.locator('#unsub-status')).toContainText('Gata, te-ai dezabonat');
  await expect(page.locator('#unsub-btn')).toBeHidden();
  await expect(page.locator('#unsub-intro')).toBeHidden();
  expect(calls.length).toBe(1);
});

for (const [label, qs] of [['fără token', ''], ['token invalid', '?t=abc123']]) {
  test(`link invalid (${label}): mesaj clar, fără buton, nicio cerere`, async ({ page }) => {
    const calls = await mock(page, true);
    await page.goto('/dezabonare.html' + qs);
    await expect(page.locator('#unsub-status')).toContainText('Linkul de dezabonare nu este complet');
    await expect(page.locator('#unsub-btn')).toBeHidden();
    await expect(page.locator('#unsub-intro')).toBeHidden();
    expect(calls.length).toBe(0);
  });
}

test('link expirat sau deja folosit: mesaj clar, fără buton', async ({ page }) => {
  await mock(page, false);
  await page.goto('/dezabonare.html?t=' + TOKEN);
  await page.click('#unsub-btn');
  await expect(page.locator('#unsub-status')).toContainText('Linkul nu mai este valabil');
  await expect(page.locator('#unsub-btn')).toBeHidden();
});
