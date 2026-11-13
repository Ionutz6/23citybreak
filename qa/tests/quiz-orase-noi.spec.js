// Liverpool, Manchester, Rotterdam și Torino trebuie să apară în quiz, cu nume corect și imagine de 800 px care se încarcă.
const { test, expect } = require('@playwright/test');
const H = require('../helpers');
const NEW = { 'liverpool_gb.webp': 'Liverpool', 'manchester_gb.webp': 'Manchester', 'rotterdam_nl.webp': 'Rotterdam', 'turin_it.webp': 'Torino' };

test.setTimeout(150000);
test('quiz: cele 4 orașe noi apar cu nume corect și imagine 800 px', async ({ page }) => {
  await page.addInitScript(() => { let s = 12345; Math.random = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; });
  await H.install(page, { session: false, db: H.makeDb() });
  await page.goto('/orase-vizitate.html');
  await expect(page.locator('#city-quiz')).toBeVisible();
  const seen = {}; let pool = 0;
  for (let g = 0; g < 40 && Object.keys(seen).length < 4; g++) {
    if (g === 0) await page.locator('.quiz-start').click();
    for (let r = 0; r < 10; r++) {
      await expect(page.locator('.quiz-option')).toHaveCount(4);
      const names = await page.locator('.quiz-option').allTextContents();
      expect(new Set(names).size).toBe(4); // distractori distincți
      const src = await page.locator('#quiz-image').evaluate(i => i.currentSrc || i.src);
      await page.locator('.quiz-option').first().click();
      const correct = await page.locator('.quiz-option.correct').textContent();
      const file = src.split('/').pop();
      if (NEW[file]) { seen[file] = correct; const dims = await page.locator('#quiz-image').evaluate(i => [i.naturalWidth, i.naturalHeight]); expect(dims).toEqual([800, 1200]); }
      await page.locator('.quiz-actions .quiz-primary').click();
    }
    await expect(page.locator('.quiz-final')).toBeVisible();
    await page.getByText('Joacă din nou').click()
  }
  expect(seen).toEqual(NEW);
});
