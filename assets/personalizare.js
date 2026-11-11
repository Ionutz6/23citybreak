// Căutare personalizată (faza C): preferințe, filtru „oraș nou sau oricare”, temperatură la destinație
// (Open-Meteo) și reminder lunar pentru orașele căutate dar nemarcate ca văzute.
//
// Interfața publică: window.CBPersonal
//   prefs()            → { departure_airports:[IATA], budget_max_eur, temp_min_c, temp_max_c, city_mode }
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
  const K = { prefs: '23cb-prefs', visited: '23cb-visited', searched: '23cb-searched', reminder: '23cb-visited-reminder', wx: '23cb-weather-v1', geo: '23cb-geo-v1' };
  const DEFAULTS = { departure_airports: [], budget_max_eur: null, temp_min_c: null, temp_max_c: null, city_mode: 'any' };
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
  let prefs = { ...DEFAULTS, ...store.get(K.prefs, {}) };
  let visited = new Set(store.get(K.visited, []));
  let cityModeThisSearch = null; // alegerea de la căutarea curentă; implicit din profil
  const account = () => (window.Account && typeof window.Account.hasSession === 'function' && window.Account.hasSession()) ? window.Account : null;

  async function loadFromAccount() {
    const acc = account();
    if (!acc) return false;
    try {
      const row = await acc.preferences();
      if (row) prefs = { ...DEFAULTS, ...pick(row) };
      const sb = await acc.client();
      const { data, error } = await sb.from('visited_cities').select('city_id');
      if (!error && Array.isArray(data)) visited = new Set(data.map(r => r.city_id));
      store.set(K.prefs, prefs); store.set(K.visited, [...visited]);
      return true;
    } catch (e) { console.warn('Preferințele din cont nu au putut fi citite:', e?.message || e); return false; }
  }
  const pick = r => Object.fromEntries(Object.keys(DEFAULTS).filter(k => k in r).map(k => [k, r[k]]));

  async function savePrefs(patch) {
    prefs = { ...prefs, ...patch };
    store.set(K.prefs, prefs);
    const acc = account();
    if (acc) {
      try { const sb = await acc.client(); await sb.from('search_preferences').upsert(pick(prefs)); }
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
      try { const sb = await acc.client(); await sb.from('visited_cities').upsert(slugs.map(city_id => ({ city_id, source }))); }
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
      if (first && !searchedOnce) origin.value = first.value;
      renderOriginChips(favs);
    }
    applyBudget();
    renderBar();
    rerender();
  }

  function applyBudget() {
    const sel = $('f-max-price');
    const b = prefs.budget_max_eur;
    if (!sel || searchedOnce) return;
    if (b == null) return;
    const opts = [...sel.options].map(o => Number(o.value)).filter(n => n !== 999).sort((a, z) => a - z);
    const fit = opts.find(n => n >= b);
    sel.value = String(fit ?? 999);
  }

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

  // ---------- Bara „oraș nou sau oricare” + temperatură ----------
  const TEMP_PRESETS = [
    { v: '', label: 'Oricare' },
    { v: '-30,10', label: 'Rece (sub 10°C)' },
    { v: '10,20', label: 'Răcoare (10–20°C)' },
    { v: '18,27', label: 'Plăcut (18–27°C)' },
    { v: '25,45', label: 'Cald (peste 25°C)' },
  ];
  let tempRange = null; // [min, max] pentru căutarea curentă
  const profileRange = () => (prefs.temp_min_c != null || prefs.temp_max_c != null) ? [prefs.temp_min_c ?? -30, prefs.temp_max_c ?? 45] : null;
  const fmtRange = r => r[0] <= -30 ? `sub ${r[1]}°C` : r[1] >= 45 ? `peste ${r[0]}°C` : `${r[0]}–${r[1]}°C`;

  function renderBar() {
    const actions = document.querySelector('#configurator .search-actions');
    if (!actions) return;
    let bar = $('pz-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pz-bar';
      bar.className = 'pz-bar';
      actions.parentNode.insertBefore(bar, actions);
      bar.addEventListener('change', onBarChange);
      bar.addEventListener('click', e => { if (e.target.closest('#pz-edit')) togglePrefsPanel(); });
    }
    const mode = cityModeThisSearch || prefs.city_mode || 'any';
    const pr = profileRange();
    if (tempRange === null) tempRange = pr;
    const cur = tempRange ? tempRange.join(',') : '';
    const presets = [...TEMP_PRESETS];
    if (pr && !presets.some(p => p.v === pr.join(','))) presets.splice(1, 0, { v: pr.join(','), label: `Din profil (${fmtRange(pr)})` });
    if (tempRange && !presets.some(p => p.v === cur)) presets.splice(1, 0, { v: cur, label: fmtRange(tempRange) });
    bar.innerHTML = `
      <div class="pz-group" role="radiogroup" aria-label="Ce orașe cauți">
        <span class="pz-label">Ce orașe?</span>
        <label class="pz-seg"><input type="radio" name="pz-mode" value="new" ${mode === 'new' ? 'checked' : ''}><span>Doar orașe noi</span></label>
        <label class="pz-seg"><input type="radio" name="pz-mode" value="any" ${mode !== 'new' ? 'checked' : ''}><span>Oricare</span></label>
        <small class="pz-hint">${visited.size ? `${visited.size} ${visited.size === 1 ? 'oraș văzut' : 'orașe văzute'}` : 'niciun oraș marcat ca văzut'}</small>
      </div>
      <div class="pz-group">
        <label class="pz-label" for="pz-temp">Temperatura la destinație</label>
        <select id="pz-temp">${presets.map(p => `<option value="${p.v}" ${p.v === cur ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
        <small class="pz-hint">max. zilnică, prognoză Open-Meteo sau media ultimilor 2 ani</small>
      </div>
      <button type="button" id="pz-edit" class="pz-link" aria-expanded="${!!$('pz-prefs')}">Preferințele mele</button>
      <p id="pz-note" class="pz-note" hidden></p>`;
  }

  function onBarChange(e) {
    if (e.target.name === 'pz-mode') cityModeThisSearch = e.target.value;
    if (e.target.id === 'pz-temp') tempRange = e.target.value ? e.target.value.split(',').map(Number) : false;
    rerender();
  }

  // Editor simplu de preferințe (fără cont: localStorage; cu cont: și în search_preferences).
  function togglePrefsPanel() {
    const open = $('pz-prefs');
    if (open) { open.remove(); $('pz-edit')?.setAttribute('aria-expanded', 'false'); return; }
    const origin = $('f-origin');
    const favs = (prefs.departure_airports || []).map(s => String(s).toUpperCase());
    const budgets = [...$('f-max-price').options].map(o => o.value);
    const budgetOpt = prefs.budget_max_eur == null ? '' : (budgets.map(Number).filter(n => n !== 999).sort((x, y) => x - y).find(n => n >= prefs.budget_max_eur) ?? 999).toString();
    const panel = document.createElement('div');
    panel.id = 'pz-prefs';
    panel.className = 'pz-prefs';
    panel.innerHTML = `
      <fieldset><legend>Aeroporturi de plecare favorite</legend>
        ${[...origin.options].map(o => `<label><input type="checkbox" name="pz-air" value="${esc(o.dataset.iata)}" ${favs.includes(o.dataset.iata) ? 'checked' : ''}> ${esc(o.dataset.label || o.textContent)}</label>`).join('')}
      </fieldset>
      <label>Buget maxim / persoană
        <select name="pz-budget"><option value="">Fără preferință</option>${budgets.map(v => `<option value="${v}" ${v === budgetOpt ? 'selected' : ''}>${v === '999' ? 'Oricât' : `Până la ${v} €`}</option>`).join('')}</select>
      </label>
      <div class="pz-temp-range"><span>Temperatura dorită (°C)</span>
        <input type="number" name="pz-tmin" min="-30" max="45" placeholder="min" value="${prefs.temp_min_c ?? ''}">
        <input type="number" name="pz-tmax" min="-30" max="45" placeholder="max" value="${prefs.temp_max_c ?? ''}">
      </div>
      <label>Implicit caut
        <select name="pz-mode-def"><option value="any" ${prefs.city_mode !== 'new' ? 'selected' : ''}>orice oraș</option><option value="new" ${prefs.city_mode === 'new' ? 'selected' : ''}>doar orașe noi</option></select>
      </label>
      <div class="pz-actions"><button type="button" class="pz-btn" id="pz-save">Salvează</button><small>${account() ? 'Se salvează în contul tău.' : 'Se salvează în acest browser. Cu un cont, le găsești pe orice dispozitiv.'}</small></div>`;
    $('pz-bar').insertAdjacentElement('afterend', panel);
    $('pz-edit').setAttribute('aria-expanded', 'true');
    panel.querySelector('#pz-save').addEventListener('click', async () => {
      const f = n => panel.querySelector(`[name="${n}"]`);
      const num = v => v === '' ? null : Math.max(-30, Math.min(45, Math.round(Number(v))));
      let tmin = num(f('pz-tmin').value), tmax = num(f('pz-tmax').value);
      if (tmin != null && tmax != null && tmin > tmax) [tmin, tmax] = [tmax, tmin];
      const b = f('pz-budget').value;
      searchedOnce = false; // aplică imediat noile valori în formular
      cityModeThisSearch = null; tempRange = null;
      await savePrefs({
        departure_airports: [...panel.querySelectorAll('[name="pz-air"]:checked')].map(i => i.value),
        budget_max_eur: b === '' || b === '999' ? null : Number(b),
        temp_min_c: tmin, temp_max_c: tmax,
        city_mode: f('pz-mode-def').value,
      });
      panel.remove();
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

  let lastHidden = { visited: 0, temp: 0 };
  function filterRows(rows, weekends, destVal) {
    const mode = cityModeThisSearch || prefs.city_mode || 'any';
    const range = tempRange || null;
    let hiddenVisited = 0, hiddenTemp = 0;
    let out = rows;
    if (mode === 'new' && destVal === 'any' && visited.size) {
      out = out.filter(r => { const v = visited.has(rowSlug(r)); if (v) hiddenVisited++; return !v; });
    }
    if (range) {
      const missing = [];
      out = out.map(r => {
        const slug = rowSlug(r);
        const cells = {};
        let changed = false;
        for (const [wkId, cell] of Object.entries(r.cellsMap || {})) {
          const wk = weekends.find(w => w.id === wkId);
          const t = wk ? weatherFor(slug, r, wk, missing) : null;
          if (t && (t.value < range[0] || t.value > range[1])) { changed = true; continue; }
          cells[wkId] = cell;
        }
        if (!changed) return r;
        if (!Object.keys(cells).length) { hiddenTemp++; return null; }
        return { ...r, cellsMap: cells };
      }).filter(Boolean);
      if (missing.length) queueWeather(missing);
    } else if (out.length) {
      // Fără filtru, cerem totuși temperaturile pentru afișarea pe carduri.
      const missing = [];
      out.forEach(r => Object.keys(r.cellsMap || {}).forEach(wkId => { const wk = weekends.find(w => w.id === wkId); if (wk) weatherFor(rowSlug(r), r, wk, missing); }));
      if (missing.length) queueWeather(missing);
    }
    lastHidden = { visited: hiddenVisited, temp: hiddenTemp };
    lastWeekends = weekends;
    showNote(destVal);
    return out;
  }

  function showNote(destVal) {
    const note = $('pz-note');
    if (!note) return;
    const parts = [];
    if (lastHidden.visited) parts.push(`${lastHidden.visited} ${lastHidden.visited === 1 ? 'oraș deja văzut ascuns' : 'orașe deja văzute ascunse'}`);
    if (lastHidden.temp) parts.push(`${lastHidden.temp} ${lastHidden.temp === 1 ? 'oraș ascuns' : 'orașe ascunse'} după temperatură`);
    const sel = typeof selectedCityObj !== 'undefined' ? selectedCityObj : null;
    if (destVal && destVal !== 'any' && visited.has(slugOf(destVal))) parts.push(`ai mai fost în ${sel?.name || cityName(slugOf(destVal))}`);
    if (weatherPending) parts.push('verificăm temperaturile…');
    note.textContent = parts.length ? parts.join(' · ') : '';
    note.hidden = !parts.length;
  }

  // ---------- Temperatură (Open-Meteo) ----------
  let wx = store.get(K.wx, {});
  let geo = store.get(K.geo, {});
  let weatherPending = false, lastWeekends = [];
  const isoAdd = (iso, d) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  const shiftYears = (iso, y) => `${Number(iso.slice(0, 4)) - y}${iso.slice(4)}`.replace(/-02-29$/, '-02-28');
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const tripDays = wk => {
    const d = typeof getTripDates === 'function' ? getTripDates(wk) : { dateOut: wk.fri, dateIn: wk.sun };
    const days = [];
    for (let x = d.dateOut; x <= d.dateIn && days.length < 12; x = isoAdd(x, 1)) days.push(x);
    return days;
  };
  const coordsFor = (slug, row) => {
    const c = window.CB_CITY_COORDS?.[`City:${slug}`] || geo[slug];
    if (c) return c;
    if (row?.city && !(slug in geo)) geocodeQueue.set(slug, row.city);
    return null;
  };

  // Returnează {value, source} din cache sau adaugă cererea în `missing`.
  function weatherFor(slug, row, wk, missing) {
    if (!slug) return null;
    const days = tripDays(wk);
    const key = `${slug}|${days[0]}|${days[days.length - 1]}`;
    const hit = wx[key];
    if (hit && hit.exp > Date.now()) return hit;
    const ll = coordsFor(slug, row);
    if (ll) missing.push({ key, slug, ll, days });
    return null;
  }

  const geocodeQueue = new Map();
  let queued = new Map(), timer = null;
  function queueWeather(items) {
    items.forEach(i => queued.set(i.key, i));
    if (!timer) timer = setTimeout(flushWeather, 150);
    weatherPending = true;
  }

  async function geocodeMissing() {
    const jobs = [...geocodeQueue].slice(0, 8);
    geocodeQueue.clear();
    await Promise.all(jobs.map(async ([slug, name]) => {
      try {
        const cc = slug.split('_')[1]?.toUpperCase();
        const q = String(name).split(/[\/(]/)[0].trim();
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=ro`, { signal: AbortSignal.timeout(8000) });
        const json = await res.json();
        const m = (json.results || []).find(r => !cc || r.country_code === cc) || null;
        geo[slug] = m ? [Math.round(m.latitude * 100) / 100, Math.round(m.longitude * 100) / 100] : null;
      } catch { /* încercăm din nou la următoarea vizită */ }
    }));
    store.set(K.geo, geo);
  }

  async function flushWeather() {
    timer = null;
    if (geocodeQueue.size) await geocodeMissing();
    const items = [...queued.values()];
    queued = new Map();
    if (!items.length) { weatherPending = false; rerender(); return; }
    const today = todayIso(), forecastEnd = isoAdd(today, 15), archiveEnd = isoAdd(today, -6);
    const fc = items.filter(i => i.days[i.days.length - 1] <= forecastEnd && i.days[0] >= today);
    const cl = items.filter(i => !fc.includes(i));
    try {
      await Promise.all([fetchForecast(fc, today, forecastEnd), fetchClimate(cl, archiveEnd)]);
    } catch (e) { console.warn('Open-Meteo nu a răspuns:', e?.message || e); }
    store.set(K.wx, pruneWx(wx));
    weatherPending = queued.size > 0;
    rerender();
  }

  const byLocation = items => {
    const m = new Map();
    items.forEach(i => { const k = i.ll.join(','); if (!m.has(k)) m.set(k, { ll: i.ll, items: [] }); m.get(k).items.push(i); });
    return [...m.values()];
  };
  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  async function multiFetch(base, locs, start, end) {
    const url = `${base}?latitude=${locs.map(l => l.ll[0]).join(',')}&longitude=${locs.map(l => l.ll[1]).join(',')}&start_date=${start}&end_date=${end}&daily=temperature_2m_max&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [json];
  }
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

  async function fetchForecast(items, start, end) {
    if (!items.length) return;
    for (const group of chunks(byLocation(items), 40)) {
      const data = await multiFetch('https://api.open-meteo.com/v1/forecast', group, start, end);
      group.forEach((loc, idx) => {
        const d = data[idx]?.daily; if (!d) return;
        const map = Object.fromEntries(d.time.map((t, i) => [t, d.temperature_2m_max[i]]));
        loc.items.forEach(it => {
          const v = avg(it.days.map(x => map[x]).filter(Number.isFinite));
          if (v != null) wx[it.key] = { value: Math.round(v), source: 'prognoză', exp: Date.now() + 6 * 3600e3 };
        });
      });
    }
  }

  // Pentru weekendurile de peste 16 zile: media temperaturii maxime în aceleași zile din ultimii 2 ani.
  async function fetchClimate(items, archiveEnd) {
    if (!items.length) return;
    const wanted = items.flatMap(i => i.days.flatMap(d => [shiftYears(d, 1), shiftYears(d, 2)])).filter(d => d <= archiveEnd).sort();
    if (!wanted.length) return;
    const start = wanted[0], end = wanted[wanted.length - 1];
    for (const group of chunks(byLocation(items), 25)) {
      const data = await multiFetch('https://archive-api.open-meteo.com/v1/archive', group, start, end);
      group.forEach((loc, idx) => {
        const d = data[idx]?.daily; if (!d) return;
        const map = Object.fromEntries(d.time.map((t, i) => [t, d.temperature_2m_max[i]]));
        loc.items.forEach(it => {
          const v = avg(it.days.flatMap(x => [map[shiftYears(x, 1)], map[shiftYears(x, 2)]]).filter(Number.isFinite));
          if (v != null) wx[it.key] = { value: Math.round(v), source: 'media ultimilor 2 ani', exp: Date.now() + 30 * DAY };
        });
      });
    }
  }
  const pruneWx = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v.exp > Date.now()).slice(-3000));

  // ---------- Carduri: temperatură + „văzut” ----------
  function decorateCards(grid) {
    grid.querySelectorAll('[data-city-id]').forEach(card => {
      const slug = slugOf(card.dataset.cityId);
      const wk = lastWeekends.find(w => w.id === card.dataset.wkId);
      const bits = [];
      if (wk && slug) {
        const days = tripDays(wk);
        const t = wx[`${slug}|${days[0]}|${days[days.length - 1]}`];
        if (t) bits.push(`<span class="pz-badge" title="Temperatura maximă, ${esc(t.source)}">${t.value >= 20 ? '☀' : t.value >= 10 ? '⛅' : '❄'} ~${t.value}°C</span>`);
      }
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
      window.setSimpleTripMode = (...args) => { const r = orig(...args); const was = searchedOnce; searchedOnce = false; applyBudget(); searchedOnce = was; return r; };
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
    window.addEventListener('storage', e => { if ([K.prefs, K.visited].includes(e.key)) { prefs = { ...DEFAULTS, ...store.get(K.prefs, {}) }; visited = new Set(store.get(K.visited, [])); applyPrefsToForm(); } });
    maybeShowReminder(new URLSearchParams(location.search).has('orase-vazute'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
