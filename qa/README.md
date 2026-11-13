# Teste automate (Playwright)

Supabase e simulat în `helpers.js`; nu se face nicio cerere reală și nu se scrie în producție.

    cd qa && npm install && npx playwright install chromium
    npx playwright test --trace off

`supabase-esm.js` este supabase-js împachetat local (site-ul îl ia de pe jsdelivr). `playwright.config.js` pornește singur serverul static pe portul 8123.
