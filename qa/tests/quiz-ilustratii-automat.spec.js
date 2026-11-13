const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const H = require('../helpers');
const ROOT = path.join(__dirname, '..', '..');
const IMG = fs.readFileSync(path.join(ROOT, 'ilustratii-orase', '800', 'liverpool_gb.webp'));

// Un ghid fără quizImage intră singur în quiz dacă există ilustratii-orase/<id>.webp; imaginea cu etichete (guides*) nu apare niciodată.
test.setTimeout(150000);
test('quiz: oraș nou fără quizImage folosește ilustratii-orase/, fără imagini cu etichete', async ({ page }) => {
  await page.addInitScript(() => { let s = 777; Math.random = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; });
  await H.install(page, { session: false, db: H.makeDb() });
  const guide = (key, image, extra = '') => `window.CB_ILLUSTRATED_GUIDES["City:${key}"] = {${extra}"image":"${image}","extension":"webp","city":"X","legend":[],"days":[]};`;
  await page.route('**/assets/illustrated-guides.js*', async route => {
    const res = await route.fetch();
    // bristol: doar varianta mare există; belfast: are quizImage către imagine cu etichete și nu are fișier în ilustratii-orase/
    await route.fulfill({ response: res, body: (await res.text()) + guide('bristol_gb', 'bristol') + guide('belfast_gb', 'belfast', '"quizImage":"assets/guides-prague-style/belfast.webp",') });
  });
  const requested = [];
  page.on('request', r => requested.push(new URL(r.url()).pathname));
  await page.route('**/ilustratii-orase/bristol_gb.webp*', r => r.fulfill({ body: IMG, contentType: 'image/webp' }));
  await page.route('**/ilustratii-orase/800/bristol_gb.webp', r => r.fulfill({ status: 404, body: '' }));
  await page.route('**/ilustratii-orase/**belfast_gb.webp', r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/orase-vizitate.html');
  await expect(page.locator('#city-quiz')).toBeVisible();
  let seen = false;
  for (let g = 0; g < 60 && !seen; g++) {
    if (g === 0) await page.locator('.quiz-start').click();
    for (let r = 0; r < 10; r++) {
      await expect(page.locator('.quiz-option')).toHaveCount(4);
      const src = await page.locator('#quiz-image').evaluate(i => i.currentSrc || i.src);
      await page.locator('.quiz-option').first().click();
      const correct = await page.locator('.quiz-option.correct').textContent();
      if (src.endsWith('/ilustratii-orase/bristol_gb.webp')) { seen = true; expect(correct).toContain('Bristol'); }
      await page.locator('.quiz-actions .quiz-primary').click();
    }
    await expect(page.locator('.quiz-final')).toBeVisible();
    await page.getByText('Joacă din nou').click();
  }
  expect(seen).toBe(true);
  expect(requested.filter(p => /guides/.test(p) && p.endsWith('belfast.webp'))).toEqual([]);
});
