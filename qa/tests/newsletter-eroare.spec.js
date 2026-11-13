// Bug B: dacă salvarea abonării/dezabonării pică, UI-ul nu trebuie să afișeze o stare nesalvată. Supabase e simulat.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');
const onboarded = () => H.makeDb({ profiles: [{ user_id: H.USER.id, onboarding_done_at: '2026-11-02T10:00:00Z' }] });
const failSubscribers = (t, m) => t === 'subscribers' && m === 'POST';

test('abonarea pică la salvare: comutatorul revine și apare mesaj', async ({ page }) => {
  await H.install(page, { session: true, db: onboarded(), failRest: failSubscribers });
  await page.goto('/cont.html');
  await page.locator('#utilizator .acct-switch').click();
  await expect(page.locator('#utilizator .acct-user-nl .acct-status')).toContainText('Nu a mers acum');
  await expect(page.locator('#utilizator input[role=switch]')).not.toBeChecked();
});

test('dezabonarea pică la salvare: comutatorul rămâne pe „abonat”', async ({ page }) => {
  const db = onboarded(); db.tables.subscribers = [{ user_id: H.USER.id, email: H.USER.email, newsletter: true }];
  await H.install(page, { session: true, db, failRest: failSubscribers });
  await page.goto('/cont.html');
  const sw = page.locator('#utilizator input[role=switch]');
  await expect(sw).toBeChecked();
  await page.locator('#utilizator .acct-switch').click();
  await expect(page.locator('#utilizator .acct-user-nl .acct-status')).toContainText('Nu a mers acum');
  await expect(sw).toBeChecked();
});

test('bannerul: salvarea pică, nu apare „te-ai abonat” și se poate reîncerca', async ({ page }) => {
  await page.clock.install();
  await H.install(page, { session: true, db: onboarded(), failRest: failSubscribers });
  await page.goto('/evenimente.html');
  await page.clock.fastForward(21000);
  const banner = page.locator('.acct-banner');
  await banner.locator('button.acct-primary').click();
  await expect(banner).toContainText('Nu a mers acum');
  await expect(banner).not.toContainText('te-ai abonat');
  await expect(banner.locator('button.acct-primary')).toBeEnabled();
});

test('abonarea reușește: comutatorul rămâne bifat', async ({ page }) => {
  await H.install(page, { session: true, db: onboarded() });
  await page.goto('/cont.html');
  await page.locator('#utilizator .acct-switch').click();
  await expect(page.locator('#utilizator .acct-user-nl .acct-status')).toContainText('Abonat');
  await expect(page.locator('#utilizator input[role=switch]')).toBeChecked();
});
