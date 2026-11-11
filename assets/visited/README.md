# Modulul „Orașe vizitate”

Fișiere: `visited-map.js`, `visited-map.css`, `cities-data.json` (408 orașe), `europe-map.json` (harta precalculată). Se generează din `tools/visited-cities.txt` cu `tools/build-visited-data.cjs`. Pagina de previzualizare: `orase-vizitate.html`.

## Montare

```html
<link rel="stylesheet" href="assets/visited/visited-map.css">
<script src="assets/visited/visited-map.js"></script>
<script>
  const vc = await VisitedCities.mount(document.getElementById('harta'), {
    client: Account.client(),   // clientul Supabase existent; fără client => localStorage
    user,                       // utilizatorul logat
    mode: 'profile'             // 'profile' (hartă + galerie + share) sau 'onboarding' (hartă + căutare)
  });
</script>
```

- `vc.getVisited()` → `['prague_cz', ...]`, `vc.setVisited(ids)`, `vc.toggle(id)`, `vc.isVisited(id)`, `vc.onChange(fn)` (întoarce funcția de dezabonare), `vc.zoomTo('IT')`, `vc.zoomOut()`, `vc.destroy()`.
- Id-urile sunt slugul Kiwi fără `City:` (`^[a-z0-9-]+_[a-z]{2}$`), aceleași ca în căutarea de zboruri.
- Cu `client` + `user`, citește și scrie tabela `visited_cities` (`city_id`, `source` = `onboarding` sau `map`; `user_id` vine din `auth.uid()`). Orașele bifate înainte de login (localStorage `23cb-visited`) se urcă automat în cont la prima montare.
- Pentru altă stocare: `mount(el, {store: {load, add, remove, replace}})`.
