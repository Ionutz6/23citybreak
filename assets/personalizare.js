// Căutare personalizată (faza C): preferințe, filtru „oraș nou sau oricare” și reminder lunar
// pentru orașele căutate dar nemarcate ca văzute. (Filtrul de temperatură a fost scos pe 2026-11-12;
// vremea orientativă apare acum doar pe paginile de pachet, vezi assets/event-weather.js.)
//
// Interfața publică: window.CBPersonal
//   prefs()            → { departure_airports:[IATA], budget_max_eur, city_mode, currency:'EUR'|'RON' }
//   visited()          → Set de sluguri Kiwi fără „City:” (ex. prague_cz)
//   savePrefs(patch)   → salvează local (și în cont, dacă există sesiune)
//   markVisited(slugs, source)
//   searched()         → istoricul local { slug: {name, first, last, count} }
//   filterRows(rows, weekends, destVal)  → apelat din renderMatrix()
//   decorateCards(grid)                  → apelat din renderCardsView()
//
// Sursa datelor: window.Account (assets/account.js, cont Supabase) când există sesiune,
// altfel localStorage. Schema e cea din supabase/SCHEMA.md (branchul cont-profil).
// Nu face nicio cerere suplimentară la Kiwi.
(() => {
  const K = { prefs: '23cb-prefs', visited: '23cb-visited', searched: '23cb-searched', reminder: '23cb-visited-reminder' };
  // Cache-urile vechi de temperatură (Open-Meteo) nu mai sunt folosite.
  try { localStorage.removeItem('23cb-weather-v1'); localStorage.removeItem('23cb-geo-v1'); } catch {}
  // temp_min_c / temp_max_c rămân în tabela search_preferences (date vechi), dar nu mai sunt citite sau scrise.
  const DEFAULTS = { departure_airports: [], budget_max_eur: null, city_mode: 'any', currency: 'EUR' };
  const DAY = 864e5, REMIND_EVERY = 30 * DAY, MIN_AGE = 3 * DAY;
  const store = {
    get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const slugOf = id => String(id || '').replace(/^City:/, '');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const cities = () => (typeof ALL_EUROPE_CITIES !== 'undefined' ? ALL_EUROPE_CITIES : []);
  const cityName = slug => cities().find(c => slugOf(c.id) === slug)?.name || slug.split('_')[0].replace(/-/g, ' ');

  // ---------- Sursa preferințelor ----------
  const pick = r => Object.fromEntries(Object.keys(DEFAULTS).filter(k => k in r).map(k => [k, r[k]]));
  let prefs = { ...DEFAULTS, ...pick(store.get(K.prefs, {}) || {}) };
  let visited = new Set(store.get(K.visited, []));
  const account = () => (window.Account && typeof window.Account.hasSession === 'function' && window.Account.hasSession()) ? window.Account : null;

  // Cu sesiune, contul (Supabase 23ai) e sursa de adevăr. La prima conectare pe acest browser,
  // urcăm în cont ce s-a strâns local înainte de login: preferințe (dacă rândul lipsește),
  // orașe văzute și orașe căutate. localStorage rămâne doar cache.
  async function loadFromAccount() {
    const acc = account();
    if (!acc) return false;
    try {
      const sb = await acc.client();
      const session = await acc.session();
      const uid = session?.user?.id;
      if (!uid) return false;
      const syncKey = `23cb-synced-${uid}`;
      const firstSync = !store.get(syncKey, false);
      const [{ data: prefRow, error: prefErr }, { data: vis, error: visErr }] = await Promise.all([
        sb.from('search_preferences').select('*').maybeSingle(),
        sb.from('visited_cities').select('city_id'),
      ]);
      if (prefErr || visErr) throw prefErr || visErr;
      const remoteVisited = new Set((vis || []).map(r => r.city_id));
      if (firstSync) {
        const localPrefs = store.get(K.prefs, null);
        const hasLocalPrefs = localPrefs && Object.keys(DEFAULTS).some(k => JSON.stringify(localPrefs[k] ?? DEFAULTS[k]) !== JSON.stringify(DEFAULTS[k]));
        if (!prefRow && hasLocalPrefs) await upsertPrefs(sb, { ...DEFAULTS, ...pick(localPrefs) });
        const localOnly = store.get(K.visited, []).filter(id => /^[a-z0-9-]+_[a-z]{2}$/.test(id) && !remoteVisited.has(id));
        if (localOnly.length) {
          const { error } = await sb.from('visited_cities').upsert(localOnly.map(city_id => ({ city_id, source: 'manual' })), { onConflict: 'user_id,city_id', ignoreDuplicates: true });
          if (!error) localOnly.forEach(id => remoteVisited.add(id));
        }
        const recent = Object.entries(searched()).sort((a, b) => b[1].last - a[1].last).slice(0, 20).map(([slug]) => slug);
        if (recent.length) await sb.rpc('record_search', { p_city_ids: recent });
        store.set(syncKey, true);
        prefs = { ...DEFAULTS, ...(prefRow ? pick(prefRow) : hasLocalPrefs ? pick(localPrefs) : {}) };
      } else {
        prefs = { ...DEFAULTS, ...(prefRow ? pick(prefRow) : {}) };
      }
      // Până la migrarea 20261112_moneda.sql rândul nu are currency: păstrăm alegerea locală.
      const localCur = store.get(K.prefs, {})?.currency;
      if (prefRow && !('currency' in prefRow) && localCur) prefs.currency = localCur;
      visited = remoteVisited;
      store.set(K.prefs, prefs); store.set(K.visited, [...visited]);
      return true;
    } catch (e) { console.warn('Preferințele din cont nu au putut fi citite:', e?.message || e); return false; }
  }
  const missingCurrencyCol = e => !!e && /currency/i.test(`${e.message || ''} ${e.details || ''}`) && /column|schema/i.test(e.message || '');
  async function upsertPrefs(sb, row) {
    let res = await sb.from('search_preferences').upsert(row);
    if (missingCurrencyCol(res.error)) { const { currency, ...rest } = row; res = await sb.from('search_preferences').upsert(rest); }
    if (res.error) throw res.error;
    return res;
  }

  async function savePrefs(patch) {
    prefs = { ...prefs, ...patch };
    store.set(K.prefs, prefs);
    const acc = account();
    if (acc) {
      try { const sb = await acc.client(); await upsertPrefs(sb, pick(prefs)); }
      catch (e) { console.warn('Preferințele nu au putut fi salvate în cont:', e?.message || e); }
    }
    applyPrefsToForm();
  }

  async function markVisited(slugs, source = 'prompt') {
    slugs = slugs.map(slugOf).filter(s => /^[a-z0-9-]+_[a-z]{2}$/.test(s));
    slugs.forEach(s => visited.add(s));
    store.set(K.visited, [...visited]);
    const acc = account();
    if (acc && slugs.length) {
      try { const sb = await acc.client(); await sb.from('visited_cities').upsert(slugs.map(city_id => ({ city_id, source })), { onConflict: 'user_id,city_id', ignoreDuplicates: true }); }
      catch (e) { console.warn('Orașele văzute nu au putut fi salvate în cont:', e?.message || e); }
    }
    window.dispatchEvent(new CustomEvent('cb:visited-change', { detail: { added: slugs } }));
    rerender();
  }

  // ---------- Aplicare în formular ----------
  function applyPrefsToForm() {
    const origin = $('f-origin');
    if (origin) {
      const favs = (prefs.departure_airports || []).map(s => String(s).toUpperCase());
      [...origin.options].forEach(o => {
        const base = o.dataset.label || (o.dataset.label = o.textContent);
        o.textContent = favs.includes(o.dataset.iata) ? `★ ${base}` : base;
      });
      // Favoritele urcă primele, în ordinea din profil; primul favorit e preselectat.
      favs.slice().reverse().forEach(iata => { const o = [...origin.options].find(x => x.dataset.iata === iata); if (o) origin.prepend(o); });
      const first = [...origin.options].find(o => favs.includes(o.dataset.iata));
      if (first && !searchedOnce) { origin.value = first.value; if (typeof refreshWeekendsForOrigin === 'function') refreshWeekendsForOrigin(); }
      renderOriginChips(favs);
    }
    applyBudget();
    applyCurrency();
    renderBar();
    rerender();
  }

  // Bugetul din profil e doar valoarea de pornire: după ce userul mișcă slider-ul, nu-l mai suprascriem
  // (de ex. când preferințele din cont sosesc după ce pagina s-a încărcat).
  let budgetTouched = false;
  document.addEventListener('input', e => { if (e.isTrusted && e.target?.id === 'f-max-price-slider') budgetTouched = true; }, true);
  document.addEventListener('change', e => { if (e.isTrusted && e.target?.id === 'f-max-price') budgetTouched = true; }, true);

  function applyBudget(force = false) {
    const sel = $('f-max-price');
    const b = prefs.budget_max_eur;
    if (!sel || (!force && (searchedOnce || budgetTouched))) return;
    if (b == null) return;
    const opts = [...sel.options].map(o => Number(o.value)).filter(n => n !== 999).sort((a, z) => a - z);
    const fit = String(opts.find(n => n >= b) ?? 999);
    if (sel.value === fit) return;
    sel.value = fit;
    // Select-ul e ascuns în spatele slider-ului (option-sliders.js), care se sincronizează doar la „change”.
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Moneda: valoarea din profil se aplică pe selectorul din căutare (index.html face conversia cu cursul BCE).
  // Dacă userul schimbă moneda din căutare, o ținem minte în profil (și local, fără cont).
  let currencyTouched = false;
  function applyCurrency() {
    const sel = $('currency-select');
    const want = prefs.currency === 'RON' ? 'RON' : 'EUR';
    if (!sel || currencyTouched || sel.disabled || sel.value === want) return;
    sel.value = want;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  window.addEventListener('cb:currency-change', e => {
    if (!e.detail?.user) return;
    currencyTouched = true;
    if (prefs.currency !== e.detail.currency) savePrefs({ currency: e.detail.currency });
  });

  function renderOriginChips(favs) {
    let box = $('pz-origin-chips');
    const origin = $('f-origin');
    if (!origin) return;
    if (favs.length < 2) { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'pz-origin-chips'; box.className = 'pz-chips'; origin.insertAdjacentElement('afterend', box); }
    box.innerHTML = favs.map(iata => {
      const o = [...origin.options].find(x => x.dataset.iata === iata);
      return o ? `<button type="button" class="pz-chip${origin.value === o.value ? ' on' : ''}" data-origin="${esc(o.value)}">${esc(iata)}</button>` : '';
    }).join('');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-origin]');
    if (!b) return;
    const origin = $('f-origin');
    origin.value = b.dataset.origin;
    origin.dispatchEvent(new Event('change'));
    renderOriginChips((prefs.departure_airports || []).map(s => String(s).toUpperCase()));
  });

  // ---------- „Profilul meu” pe prima pagină ----------
  // Rezumatul preferințelor (plecare, buget, ce orașe) deasupra căutării + editorul lor.
  // Tipul de oraș nu se mai alege la fiecare căutare: vine din profil și se aplică la toate căutările.
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function profileSummary() {
    const favs = (prefs.departure_airports || []).map(s => String(s).toUpperCase());
    return [
      { k: 'air', label: 'Plecare', value: favs.length ? favs.join(', ') : 'alegi la căutare' },
      { k: 'budget', label: 'Buget / persoană', value: prefs.budget_max_eur == null ? 'fără limită' : prefs.currency === 'RON' ? `până la ~${new Intl.NumberFormat('ro-RO').format(Math.round(prefs.budget_max_eur * 5 / 50) * 50)} RON` : `până la ${prefs.budget_max_eur} €`, sub: prefs.currency === 'RON' ? 'prețuri în lei (curs BCE)' : 'prețuri în euro' },
      { k: 'mode', label: 'Ce orașe', value: prefs.city_mode === 'new' ? 'doar orașe noi' : 'oricare', sub: visited.size ? plural(visited.size, 'oraș văzut', 'orașe văzute') : 'niciun oraș marcat ca văzut' },
    ];
  }

  function renderBar() {
    const panelHost = $('configurator');
    if (!panelHost) return;
    let card = $('pz-profile');
    if (!card) {
      card = document.createElement('section');
      card.id = 'pz-profile';
      card.className = 'pz-profile';
      card.setAttribute('aria-labelledby', 'pz-profile-title');
      panelHost.prepend(card);
      card.addEventListener('click', onProfileClick);
    }
    const acc = account();
    const panel = $('pz-prefs'), open = !!panel;
    card.innerHTML = `
      <div class="pz-profile-head">
        <div><span class="pz-kicker">PROFILUL MEU</span><h2 id="pz-profile-title">${acc ? 'Căutarea ta, pe gustul tău' : 'Personalizează căutarea'}</h2></div>
        <button type="button" id="pz-edit" class="pz-btn" aria-expanded="${open}" aria-controls="pz-prefs">${open ? 'Închide' : 'Preferințele mele'}</button>
      </div>
      <ul class="pz-summary">${profileSummary().map(s => `
        <li><button type="button" class="pz-tile" data-pz-edit="${s.k}"><span class="pz-tile-label">${esc(s.label)}</span><strong>${esc(s.value)}</strong>${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</button></li>`).join('')}
      </ul>
      <p class="pz-profile-foot">${acc
        ? `Salvate în contul tău. <a href="cont.html">Profil complet și harta orașelor văzute →</a>`
        : `Salvate doar în acest browser. <button type="button" class="pz-inline-link" data-pz-login>Fă-ți cont gratuit</button> ca să le ai pe orice dispozitiv și să-ți marchezi pe hartă orașele văzute.`}</p>`;
    if (panel) card.append(panel);
    ensureNote();
  }

  // Nota „N orașe ascunse” stă lângă butonul de căutare, unde se vede efectul filtrelor din profil.
  function ensureNote() {
    if ($('pz-note')) return;
    const actions = document.querySelector('#configurator .search-actions');
    if (!actions) return;
    const note = document.createElement('p');
    note.id = 'pz-note'; note.className = 'pz-note'; note.hidden = true;
    actions.parentNode.insertBefore(note, actions);
  }

  function onProfileClick(e) {
    if (e.target.closest('[data-pz-login]')) { window.Account?.openLogin?.(); return; }
    const tile = e.target.closest('[data-pz-edit]');
    if (e.target.closest('#pz-edit') || tile) {
      if (tile && $('pz-prefs')) { focusGroup(tile.dataset.pzEdit); return; }
      togglePrefsPanel(tile?.dataset.pzEdit);
    }
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-pz-open]')) { e.preventDefault(); $('pz-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (!$('pz-prefs')) togglePrefsPanel(e.target.closest('[data-pz-open]').dataset.pzOpen); } });

  const GROUP_INDEX = { air: 0, currency: 1, budget: 2, mode: 3 }; // ordinea din Account.prefsForm
  function focusGroup(k) {
    const g = $('pz-prefs')?.querySelectorAll('.acct-group, fieldset')[GROUP_INDEX[k] ?? 0];
    g?.querySelector('button, input, select')?.focus({ preventScroll: true });
    g?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Editorul: același formular ca în pagina de cont (Account.prefsForm), salvat local și în cont, dacă există sesiune.
  function togglePrefsPanel(focusKey) {
    const open = $('pz-prefs');
    if (open) { open.remove(); renderBar(); return; }
    const panel = document.createElement('div');
    panel.id = 'pz-prefs';
    panel.className = 'pz-prefs';
    const form = window.Account?.prefsForm ? window.Account.prefsForm({ ...prefs }) : null;
    if (!form) return;
    const actions = document.createElement('div');
    actions.className = 'pz-actions';
    actions.innerHTML = `<button type="button" class="pz-btn" id="pz-save">Salvează</button><button type="button" class="pz-inline-link" id="pz-cancel">Renunță</button><small>${account() ? 'Se salvează în contul tău și se aplică la toate căutările.' : 'Se salvează în acest browser și se aplică la toate căutările.'}</small>`;
    panel.append(form.node, actions);
    $('pz-profile').append(panel);
    renderBar();
    focusGroup(focusKey);
    actions.querySelector('#pz-cancel').addEventListener('click', () => { panel.remove(); renderBar(); });
    actions.querySelector('#pz-save').addEventListener('click', async () => {
      const v = form.read();
      searchedOnce = false; // aplică imediat noile valori în formular
      budgetTouched = false;
      currencyTouched = false;
      panel.remove();
      await savePrefs({
        departure_airports: v.departure_airports,
        budget_max_eur: v.budget_max_eur,
        city_mode: v.city_mode === 'new' ? 'new' : 'any',
        currency: v.currency === 'RON' ? 'RON' : 'EUR',
      });
      if (typeof renderCrossEngineBar === 'function') renderCrossEngineBar();
    });
  }

  // ---------- Filtrare rezultate ----------
  const rowSlug = r => {
    if (r.cityId) return slugOf(r.cityId);
    const iata = String(r.iata || r.code || '').toUpperCase();
    const c = cities().find(x => x.iata === iata);
    return c ? slugOf(c.id) : '';
  };

  let lastHidden = { visited: 0 };
  function filterRows(rows, weekends, destVal) {
    const mode = prefs.city_mode || 'any';
    let hiddenVisited = 0;
    let out = rows;
    if (mode === 'new' && destVal === 'any' && visited.size) {
      out = out.filter(r => { const v = visited.has(rowSlug(r)); if (v) hiddenVisited++; return !v; });
    }
    lastHidden = { visited: hiddenVisited };
    showNote(destVal);
    return out;
  }

  function showNote(destVal) {
    const note = $('pz-note');
    if (!note) return;
    const parts = [];
    if (lastHidden.visited) parts.push(`${lastHidden.visited} ${lastHidden.visited === 1 ? 'oraș deja văzut ascuns' : 'orașe deja văzute ascunse'}`);
    const sel = typeof selectedCityObj !== 'undefined' ? selectedCityObj : null;
    if (destVal && destVal !== 'any' && visited.has(slugOf(destVal))) parts.push(`ai mai fost în ${sel?.name || cityName(slugOf(destVal))}`);
    const filtered = lastHidden.visited;
    note.innerHTML = parts.length ? esc(parts.join(' · ')) + (filtered ? ' · <button type="button" class="pz-inline-link" data-pz-open="mode">schimbă în Profilul meu</button>' : '') : '';
    note.hidden = !parts.length;
  }

  // ---------- Carduri: „văzut” ----------
  function decorateCards(grid) {
    grid.querySelectorAll('[data-city-id]').forEach(card => {
      const slug = slugOf(card.dataset.cityId);
      const bits = [];
      if (slug && visited.has(slug)) bits.push('<span class="pz-badge pz-seen">✓ Văzut</span>');
      card.querySelector('.pz-badges')?.remove();
      if (!bits.length) return;
      const box = document.createElement('div');
      box.className = 'pz-badges';
      box.innerHTML = bits.join('');
      card.querySelector('h3')?.insertAdjacentElement('afterend', box);
    });
  }

  let rerenderTimer = null;
  const rerender = () => {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => { if (typeof renderMatrix === 'function' && (typeof currentRows === 'undefined' || currentRows.length)) renderMatrix(); else showNote(); }, 30);
  };

  // ---------- Istoric căutări + reminder lunar ----------
  let searchedOnce = false;
  const searched = () => store.get(K.searched, {});
  function logSearch(slug, name) {
    if (!slug || !/^[a-z0-9-]+_[a-z]{2}$/.test(slug)) return;
    const all = searched();
    const now = Date.now();
    const prev = all[slug];
    all[slug] = { name: name || prev?.name || cityName(slug), first: prev?.first || now, last: now, count: (prev?.count || 0) + 1 };
    store.set(K.searched, all);
    const acc = account();
    // search_history se scrie doar prin RPC (incrementează searches); dacă migrația lipsește, rămâne istoricul local.
    if (acc) acc.client().then(sb => sb.rpc('record_search', { p_city_ids: [slug] })).catch(() => {});
  }

  function wrapGlobals() {
    if (typeof window.runLiveSearch === 'function') {
      const orig = window.runLiveSearch;
      window.runLiveSearch = (...args) => {
        searchedOnce = true;
        const dest = $('f-destination')?.value;
        if (dest && dest !== 'any') logSearch(slugOf(dest), typeof selectedCityObj !== 'undefined' ? selectedCityObj?.name : '');
        return orig(...args);
      };
    }
    if (typeof window.setSimpleTripMode === 'function') {
      const orig = window.setSimpleTripMode;
      window.setSimpleTripMode = (...args) => { const r = orig(...args); budgetTouched = false; applyBudget(true); return r; };
    }
    // Clic pe „Verifică oferta” / „Kiwi” = interes real pentru oraș.
    document.addEventListener('click', e => {
      const a = e.target.closest('#cards-grid [data-city-id] a[href]');
      if (!a) return;
      const card = a.closest('[data-city-id]');
      logSearch(slugOf(card.dataset.cityId), card.querySelector('h3')?.textContent.trim());
    }, true);
  }

  function reminderCandidates(now = Date.now()) {
    return Object.entries(searched())
      .filter(([slug, s]) => !visited.has(slug) && now - s.first >= MIN_AGE && !(s.dismissed > now - 90 * DAY))
      .sort((a, b) => b[1].last - a[1].last)
      .slice(0, 8);
  }

  function maybeShowReminder(force = false) {
    const now = Date.now();
    const state = store.get(K.reminder, null);
    if (!state) { store.set(K.reminder, { last: now }); if (!force) return; }
    if (!force && now - (state?.last || now) < REMIND_EVERY) return;
    const list = reminderCandidates(force ? now + MIN_AGE : now);
    if (!list.length) return;
    const host = $('configurator');
    if (!host || $('pz-reminder')) return;
    const box = document.createElement('aside');
    box.id = 'pz-reminder';
    box.className = 'pz-reminder';
    box.setAttribute('aria-label', 'Orașe văzute');
    box.innerHTML = `
      <strong>Ai mai vizitat vreun oraș nou?</strong>
      <p>În ultima vreme ai căutat zboruri spre orașele de mai jos. Bifează-le pe cele în care ai ajuns, ca să-ți propunem destinații noi.</p>
      <div class="pz-chips">${list.map(([slug, s]) => `<label class="pz-chip"><input type="checkbox" value="${esc(slug)}"> ${esc(s.name)}</label>`).join('')}</div>
      <div class="pz-actions"><button type="button" class="pz-btn" data-act="save">Salvează</button><button type="button" class="pz-link" data-act="later">Nu încă</button></div>`;
    host.prepend(box);
    box.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      const all = searched();
      if (act === 'save') {
        const picked = [...box.querySelectorAll('input:checked')].map(i => i.value);
        list.forEach(([slug]) => { if (!picked.includes(slug) && all[slug]) all[slug].dismissed = Date.now(); });
        store.set(K.searched, all);
        await markVisited(picked, 'prompt');
        box.innerHTML = picked.length ? `<strong>Gata, ${picked.length === 1 ? 'orașul a fost marcat' : `${picked.length} orașe au fost marcate`} ca văzut${picked.length === 1 ? '' : 'e'}.</strong>` : '<strong>Am notat. Te întrebăm din nou luna viitoare.</strong>';
        setTimeout(() => box.remove(), 4000);
      } else box.remove();
      store.set(K.reminder, { last: Date.now() });
      renderBar();
    });
  }

  // ---------- Pornire ----------
  window.CBPersonal = {
    prefs: () => ({ ...prefs }), visited: () => new Set(visited), searched,
    savePrefs, markVisited, filterRows, decorateCards,
    showReminder: () => maybeShowReminder(true),
  };

  function init() {
    wrapGlobals();
    applyPrefsToForm();
    loadFromAccount().then(ok => { if (ok) applyPrefsToForm(); });
    window.addEventListener('account:change', () => loadFromAccount().then(() => { applyPrefsToForm(); }));
    window.addEventListener('storage', e => { if ([K.prefs, K.visited].includes(e.key)) { if (e.key === K.prefs) budgetTouched = false; prefs = { ...DEFAULTS, ...store.get(K.prefs, {}) }; visited = new Set(store.get(K.visited, [])); applyPrefsToForm(); } });
    maybeShowReminder(new URLSearchParams(location.search).has('orase-vazute'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
