/* Orașe vizitate: căutare, hartă a Europei cu zoom (rotiță, pinch, +/−) și drag, fișă cu ilustrație per oraș, panou cu orașele țării și imagine de share.
 * Modul independent. Se montează cu:
 *   const vc = await VisitedCities.mount(container, {client, user, mode: 'profile' | 'onboarding'});
 * Fără client/user, lista se păstrează în localStorage (și se urcă automat în cont la prima montare cu client).
 * Interfață: vc.getVisited() -> ['prague_cz', ...], vc.setVisited(ids), vc.toggle(id), vc.onChange(fn), vc.destroy()
 */
(() => {
  const BASE = (() => { const s = document.currentScript?.src; return s ? s.replace(/[^/]*$/, '') : 'assets/visited/'; })();
  const ROOT = BASE.replace(/assets\/visited\/$/, '');
  const LOCAL_KEY = '23cb-visited';
  const SITE = 'https://23citybreak.ro/';
  const SVGNS = 'http://www.w3.org/2000/svg';
  let dataPromise;
  /* Fundalul hărții. Un singur loc de schimbat: calea unei imagini (PNG/WebP/SVG) de exact 1000×860 sau multiplu
   * (ex. 3000×2580), în aceeași proiecție ca assets/visited/europe-map.json (vezi assets/visited/FUNDAL-HARTA.md).
   * Gol = harta vectorială din europe-map.json. Se poate suprascrie per pagină cu mount(el, {background}).
   * Verificarea alinierii: adaugă ?harta-debug=1 în URL. */
  const config = {
    background: 'assets/visited/fundal-harta.webp',
    debug: /[?&]harta-debug=1/.test(location.search)
  };
  // Test rapid al unui fundal nou fără modificări de cod: ?harta-debug=1&harta-fundal=tools/fundal-nou.webp (doar căi din site)
  const testBg = new URLSearchParams(location.search).get('harta-fundal');
  if (testBg && /^[\w./-]+\.(png|webp|jpe?g|svg)$/i.test(testBg) && !testBg.includes('..')) config.background = testBg;
  const DEBUG_CITIES = ['lisbon_pt', 'reykjavik_is', 'dublin_ie', 'london_gb', 'paris_fr', 'rome_it', 'athens_gr', 'istanbul_tr', 'oslo_no', 'helsinki_fi', 'bucharest_ro', 'luqa_mt', 'tbilisi_ge', 'tromso_no', 'seville_es', 'larnaca_cy', 'tenerife_es'];

  const norm = s => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const flag = cc => cc === 'XK' ? '🇽🇰' : String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0)));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const plural = (n, one, many) => n === 1 ? `1 ${one}` : `${n} ${n % 100 >= 20 || n % 100 === 0 && n ? 'de ' : ''}${many}`;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ilustrațiile apar aici mici (listă, fișa orașului): folosim varianta de 800 px din subfolderul 800/.
  const smallImage = src => src.replace(/([^/]+\.webp)$/, '800/$1');

  function loadData() {
    if (!dataPromise) dataPromise = Promise.all(['cities-data.json', 'europe-map.json'].map(f => fetch(BASE + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); })))
      .then(([cities, map]) => {
        cities.forEach(c => { c.key = norm([c.name, c.country, ...(c.alt || [])].join(' ')); if (c.img) c.img = ROOT + c.img; });
        return {cities, map, byId: new Map(cities.map(c => [c.id, c]))};
      });
    return dataPromise;
  }

  /* ---------- stocare ---------- */
  const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeLocal = ids => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(ids)); } catch {} };
  const localStore = () => ({load: async () => readLocal(), add: async (id, all) => writeLocal(all), remove: async (id, all) => writeLocal(all), replace: async all => writeLocal(all)});
  // Tabela visited_cities(user_id default auth.uid(), city_id, visited_on, source), RLS pe rândurile proprii.
  const supabaseStore = (client, source, userId) => ({
    async load() {
      const {data, error} = await client.from('visited_cities').select('city_id');
      if (error) throw error;
      const ids = data.map(r => r.city_id), local = readLocal().filter(id => !ids.includes(id));
      if (local.length) { // orașe bifate înainte de autentificare
        const {error: e} = await client.from('visited_cities').upsert(local.map(city_id => ({city_id, source})), {onConflict: 'user_id,city_id', ignoreDuplicates: true});
        if (!e) { writeLocal([]); ids.push(...local); }
      }
      return ids;
    },
    async add(id) { const {error} = await client.from('visited_cities').upsert({city_id: id, source}, {onConflict: 'user_id,city_id', ignoreDuplicates: true}); if (error) throw error; },
    async remove(id) { const {error} = await client.from('visited_cities').delete().eq('user_id', userId).eq('city_id', id); if (error) throw error; },
    async replace(all, prev) {
      const add = all.filter(id => !prev.includes(id)), del = prev.filter(id => !all.includes(id));
      if (add.length) { const {error} = await client.from('visited_cities').upsert(add.map(city_id => ({city_id, source})), {onConflict: 'user_id,city_id', ignoreDuplicates: true}); if (error) throw error; }
      if (del.length) { const {error} = await client.from('visited_cities').delete().eq('user_id', userId).in('city_id', del); if (error) throw error; }
    }
  });

  /* ---------- montare ---------- */
  async function mount(container, opts = {}) {
    const mode = opts.mode || 'profile';
    const store = opts.store || (opts.client && opts.user ? supabaseStore(opts.client, mode === 'onboarding' ? 'onboarding' : 'map', opts.user.id) : localStore());
    container.classList.add('vc-root', `vc-${mode}`);
    container.replaceChildren(el('p', 'vc-loading', 'Se încarcă harta…'));
    const {cities, map, byId} = await loadData();
    let visited = new Set();
    try { (await store.load()).forEach(id => byId.has(id) && visited.add(id)); } catch (e) { console.warn('[visited] încărcare', e); }
    const listeners = new Set(opts.onChange ? [opts.onChange] : []);

    /* --- structură --- */
    const head = el('div', 'vc-head');
    const counter = el('div', 'vc-counter');
    const countNum = el('strong'), countText = el('span');
    counter.append(countNum, countText);
    const shareBtn = el('button', 'vc-btn vc-primary', 'Distribuie harta ↗'); shareBtn.type = 'button';
    head.append(counter, shareBtn);

    const searchWrap = el('div', 'vc-search');
    const input = el('input'); input.type = 'search'; input.placeholder = 'Caută un oraș: Praga, Hallstatt, Sibiu…'; input.autocomplete = 'off';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-label', 'Caută un oraș');
    const listId = 'vc-list-' + Math.random().toString(36).slice(2, 8);
    const drop = el('ul', 'vc-drop'); drop.id = listId; drop.setAttribute('role', 'listbox'); drop.hidden = true;
    input.setAttribute('aria-controls', listId);
    searchWrap.append(input, drop);

    const mapBox = el('div', 'vc-map');
    const bar = el('div', 'vc-mapbar');
    const back = el('button', 'vc-btn vc-back', '← Toată Europa'); back.type = 'button'; back.hidden = true;
    const hint = el('span', 'vc-hint', 'Rotița sau +/− pentru zoom, trage ca să muți harta. Apasă pe un oraș sau pe o țară.');
    bar.append(back, hint);
    const zoomCtl = el('div', 'vc-zoom');
    const zIn = el('button', 'vc-btn', '+'), zOut = el('button', 'vc-btn', '−'), zReset = el('button', 'vc-btn', '⤢');
    [[zIn, 'Mărește harta'], [zOut, 'Micșorează harta'], [zReset, 'Toată Europa']].forEach(([b, l]) => { b.type = 'button'; b.setAttribute('aria-label', l); b.title = l; });
    zoomCtl.append(zIn, zOut, zReset);
    const root = svg('svg', {viewBox: `0 0 ${map.width} ${map.height}`, role: 'img', 'aria-label': 'Harta Europei cu orașele vizitate', tabindex: '0'});
    const gWorld = svg('g', {class: 'vc-world'});
    const gBg = svg('g', {class: 'vc-bg'}), gLand = svg('g', {class: 'vc-land'}), gInset = svg('g', {class: 'vc-inset'}), gDots = svg('g', {class: 'vc-dots'}), gLabels = svg('g', {class: 'vc-labels'}), gDebug = svg('g', {class: 'vc-debug'});
    gWorld.append(gBg, gLand, gInset, gDots, gLabels, gDebug);
    root.append(gWorld);
    const tip = el('div', 'vc-tip'); tip.hidden = true;
    mapBox.append(root, bar, zoomCtl, tip);

    const zone = el('section', 'vc-zone'); zone.hidden = true;
    const status = el('p', 'vc-status'); status.setAttribute('role', 'status');
    container.replaceChildren(head, searchWrap, mapBox, status, zone);
    if (mode === 'onboarding') shareBtn.hidden = true;

    /* --- straturi: fundal (vector sau imagine) + strat interactiv --- */
    const bgImage = opts.background ?? config.background;
    if (bgImage) {
      gBg.append(svg('image', {href: ROOT + bgImage, x: 0, y: 0, width: map.width, height: map.height, preserveAspectRatio: 'none'}));
      container.classList.add('has-bg-image');
    }
    const countryEls = new Map();
    for (const c of map.countries) {
      const p = svg('path', {d: c.d, class: c.active ? 'vc-country' : 'vc-country is-off', 'data-cc': c.cc});
      gLand.append(p); countryEls.set(c.cc, p);
    }
    if (map.inset) {
      const {x, y, w, h, land = []} = map.inset;
      gInset.append(svg('rect', {x, y, width: w, height: h, rx: 8}));
      for (const l of land) gInset.append(svg('path', {d: l.d, class: 'vc-country', 'data-cc': l.cc}));
      gInset.append(Object.assign(svg('text', {x: x + 8, y: y + h - 8}), {textContent: 'Azore'}));
    }
    const dotEls = new Map(), hitEls = new Map(), labelEls = new Map();
    for (const c of cities) {
      const hit = svg('circle', {cx: c.x, cy: c.y, r: 5, class: 'vc-hit', 'data-id': c.id});
      const d = svg('circle', {cx: c.x, cy: c.y, r: 3, class: 'vc-dot', 'data-id': c.id});
      gDots.append(hit, d); dotEls.set(c.id, d); hitEls.set(c.id, hit);
    }
    if (config.debug) {
      // Mod de verificare a alinierii fundalului: cruci pe orașe de referință + transparența stratului vectorial
      for (const id of DEBUG_CITIES) { const c = byId.get(id); if (!c) continue;
        gDebug.append(svg('path', {d: `M${c.x - 8} ${c.y}h16M${c.x} ${c.y - 8}v16`}), Object.assign(svg('text', {x: c.x + 6, y: c.y - 6}), {textContent: c.name})); }
      const slider = el('label', 'vc-debug-ctl', 'Strat vectorial ');
      const r = el('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = bgImage ? 0 : 100;
      r.addEventListener('input', () => gLand.style.opacity = r.value / 100); gLand.style.opacity = r.value / 100;
      slider.append(r); mapBox.append(slider);
    }

    /* --- zoom & pan: transformare pe grupul hărții; punctele și etichetele au mărime constantă pe ecran --- */
    const LEVELS = [1, 2, 4, 7, 12], MAX = 14;
    let s = 1, tx = 0, ty = 0, focus = null, anim, labelTimer;
    const W = map.width, H = map.height;
    const pxToUnits = () => W / (root.getBoundingClientRect().width || W);
    const clampView = () => { s = Math.min(MAX, Math.max(1, s)); tx = Math.min(0, Math.max(W - W * s, tx)); ty = Math.min(0, Math.max(H - H * s, ty)); };
    const isTouch = matchMedia('(pointer: coarse)').matches;
    function applyView() {
      clampView();
      gWorld.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
      const u = pxToUnits() / s; // 1 pixel de ecran în unități ale hărții
      const near = s >= 2;
      for (const [id, d] of dotEls) d.setAttribute('r', ((visited.has(id) ? (near ? 7 : 5) : (near ? 5 : 3)) * u).toFixed(3));
      const hitR = (near ? (isTouch ? 15 : 12) : (isTouch ? 9 : 6)) * u;
      for (const [, h] of hitEls) h.setAttribute('r', hitR.toFixed(3));
      root.style.setProperty('--vc-stroke', (0.8 * u).toFixed(4));
      root.style.setProperty('--vc-u', u.toFixed(4));
      zIn.disabled = s >= MAX - 0.01; zOut.disabled = s <= 1.001; zReset.disabled = s <= 1.001;
      back.hidden = s <= 1.001;
      container.classList.toggle('is-zoomed', s > 1.001);
      clearTimeout(labelTimer); labelTimer = setTimeout(renderLabels, 60);
    }
    function animateTo(ns, ntx, nty) {
      cancelAnimationFrame(anim);
      const f = [s, tx, ty], t = [ns, ntx, nty], t0 = performance.now(), dur = reduceMotion() ? 0 : 420;
      const step = now => {
        const p = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
        // interpolare în spațiul logaritmic al zoomului, ca mișcarea să pară uniformă
        s = Math.exp(Math.log(f[0]) + (Math.log(t[0]) - Math.log(f[0])) * e);
        const k = (s - f[0]) / ((t[0] - f[0]) || 1);
        tx = t[0] === f[0] ? f[1] + (t[1] - f[1]) * e : f[1] + (t[1] - f[1]) * k; ty = t[0] === f[0] ? f[2] + (t[2] - f[2]) * e : f[2] + (t[2] - f[2]) * k;
        applyView();
        if (p < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    const toSvg = (clientX, clientY) => { const r = root.getBoundingClientRect(); return [(clientX - r.left) * W / r.width, (clientY - r.top) * H / r.height]; };
    function zoomAround(ns, px, py, animate) {
      ns = Math.min(MAX, Math.max(1, ns));
      const wx = (px - tx) / s, wy = (py - ty) / s; // punctul din hartă de sub cursor rămâne pe loc
      const ntx = px - wx * ns, nty = py - wy * ns;
      if (animate) animateTo(ns, ntx, nty); else { cancelAnimationFrame(anim); s = ns; tx = ntx; ty = nty; applyView(); }
    }
    const nextLevel = dir => dir > 0 ? (LEVELS.find(l => l > s + 0.05) ?? MAX) : ([...LEVELS].reverse().find(l => l < s - 0.05) ?? 1);
    function fitBox([x0, y0, x1, y1], pad = 40) {
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const ns = Math.min(MAX, Math.max(1, Math.min(W / (x1 - x0), H / (y1 - y0))));
      animateTo(ns, W / 2 - (x0 + x1) / 2 * ns, H / 2 - (y0 + y1) / 2 * ns);
    }
    function zoomTo(cc) {
      const c = map.countries.find(x => x.cc === cc);
      if (!c || !c.active || !cities.some(x => x.cc === cc)) return;
      focus = cc; countryEls.forEach((p, k2) => p.classList.toggle('is-focus', k2 === cc));
      const pts = cities.filter(x => x.cc === cc);
      let box = c.cityBox || c.box;
      if (pts.every(x => x.inset)) box = [map.inset.x, map.inset.y, map.inset.x + map.inset.w, map.inset.y + map.inset.h];
      const minSide = 120; // țările foarte mici nu primesc zoom exagerat
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, hw = Math.max(minSide, box[2] - box[0]) / 2, hh = Math.max(minSide * H / W, box[3] - box[1]) / 2;
      fitBox([cx - hw, cy - hh, cx + hw, cy + hh]);
      renderZone(cc);
    }
    function flyToCity(c) { const ns = Math.max(s, 4); animateTo(ns, W / 2 - c.x * ns, H / 2 - c.y * ns); }
    function zoomOut() {
      focus = null; zone.hidden = true; countryEls.forEach(p => p.classList.remove('is-focus'));
      animateTo(1, 0, 0);
    }

    // Etichete: doar de la zoom 2 în sus, pentru orașele din cadru, fără suprapuneri (vizitate și mari au prioritate)
    function renderLabels() {
      gLabels.replaceChildren(); labelEls.clear();
      if (s < 2) return;
      const u = pxToUnits() / s, fs = 11.5 * u, placed = [];
      const vx0 = -tx / s, vy0 = -ty / s, vx1 = vx0 + W / s, vy1 = vy0 + H / s;
      const inView = cities.filter(c => c.x >= vx0 && c.x <= vx1 && c.y >= vy0 && c.y <= vy1);
      const rank = c => (visited.has(c.id) ? 1e9 : 0) + (c.cc === focus ? 1e8 : 0) + (c.img ? 1e7 : 0) + (c.tourist ? 2e5 : 0) + c.pop;
      inView.sort((a, b) => rank(b) - rank(a));
      for (const c of inView) {
        const name = c.name.replace(/ \(.*\)$/, ''), w = name.length * fs * 0.56 + 4 * u, h = fs * 1.25;
        const bx = [c.x - w / 2, c.y - 9 * u - h, c.x + w / 2, c.y - 9 * u];
        if (placed.some(p => bx[0] < p[2] && bx[2] > p[0] && bx[1] < p[3] && bx[3] > p[1])) continue;
        placed.push(bx, [c.x - 6 * u, c.y - 6 * u, c.x + 6 * u, c.y + 6 * u]);
        const t = svg('text', {x: c.x, y: c.y - 10 * u, 'font-size': fs.toFixed(3), class: visited.has(c.id) ? 'is-on' : ''}); t.textContent = name;
        gLabels.append(t); labelEls.set(c.id, t);
      }
    }

    /* --- panoul țării: ilustrațiile tuturor orașelor din țară --- */
    function cityCard(c) {
      const card = el('div', 'vc-card' + (visited.has(c.id) ? ' is-on' : ''));
      const open = el('button', 'vc-card-open'); open.type = 'button'; open.dataset.open = c.id; open.setAttribute('aria-label', `Deschide ${c.name}`);
      if (c.img) { const img = el('img'); img.src = smallImage(c.img); img.alt = ''; img.loading = 'lazy'; open.append(img); }
      else { const ph = el('div', 'vc-ph'); ph.append(el('span', 'vc-ph-flag', flag(c.cc)), el('span', 'vc-ph-name', c.name.replace(/ \(.*\)$/, '')), el('span', 'vc-ph-note', 'Ilustrație în pregătire')); open.append(ph); }
      const cap = el('div', 'vc-card-cap'); cap.append(el('strong', null, c.name));
      const tg = el('button', 'vc-card-tg', visited.has(c.id) ? '✓ Vizitat' : '+ Bifează'); tg.type = 'button'; tg.dataset.toggle = c.id; tg.setAttribute('aria-pressed', String(visited.has(c.id)));
      cap.append(tg); card.append(open, cap);
      return card;
    }
    function renderZone(cc) {
      const list = cities.filter(c => c.cc === cc).sort((a, b) => (visited.has(b.id) - visited.has(a.id)) || (!!b.img - !!a.img) || a.name.localeCompare(b.name, 'ro'));
      const n = list.filter(c => visited.has(c.id)).length;
      const h = el('div', 'vc-zone-head');
      const t = el('h4', null, `${flag(cc)} ${list[0].country}`); t.append(el('span', null, ` ${n}/${list.length} vizitate`));
      const x = el('button', 'vc-btn', 'Închide'); x.type = 'button'; x.dataset.close = '1';
      h.append(t, x);
      if (mode === 'onboarding') {
        const ul = el('div', 'vc-chips');
        for (const c of list) { const b = el('button', 'vc-chip' + (visited.has(c.id) ? ' is-on' : ''), c.name); b.type = 'button'; b.dataset.toggle = c.id; b.setAttribute('aria-pressed', String(visited.has(c.id))); ul.append(b); }
        zone.replaceChildren(h, ul);
      } else {
        const grid = el('div', 'vc-grid'); list.forEach(c => grid.append(cityCard(c)));
        zone.replaceChildren(h, grid);
      }
      zone.hidden = false;
    }
    zone.addEventListener('click', e => {
      const tg = e.target.closest('[data-toggle]'); if (tg) { toggle(tg.dataset.toggle); return; }
      const op = e.target.closest('[data-open]'); if (op) { openCity(byId.get(op.dataset.open), op); return; }
      if (e.target.closest('[data-close]')) { zone.hidden = true; focus = null; countryEls.forEach(p => p.classList.remove('is-focus')); }
    });

    /* --- fișa orașului: ilustrația se deschide doar la click pe oraș --- */
    let cityDlg = null;
    function openCity(c, returnFocus) {
      cityDlg?.remove();
      const dlg = el('div', 'vc-modal'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', c.name);
      const box = el('div', 'vc-modal-box vc-city');
      if (c.img) { const img = el('img', 'vc-city-img'); img.src = smallImage(c.img); img.alt = `Ilustrație ${c.name}`; box.append(img); }
      else { const ph = el('div', 'vc-ph vc-city-img'); ph.append(el('span', 'vc-ph-flag', flag(c.cc)), el('span', 'vc-ph-name', c.name.replace(/ \(.*\)$/, '')), el('span', 'vc-ph-note', 'Ilustrație în pregătire')); box.append(ph); }
      const info = el('div', 'vc-city-info'); info.append(el('strong', null, c.name), el('span', null, `${flag(c.cc)} ${c.country}`));
      const acts = el('div', 'vc-actions');
      const tg = el('button', 'vc-btn' + (visited.has(c.id) ? '' : ' vc-primary'), visited.has(c.id) ? '✓ Vizitat · scoate din listă' : 'Am fost aici ✓'); tg.type = 'button';
      const country = el('button', 'vc-btn', `Toate orașele din ${c.country}`); country.type = 'button';
      const close = el('button', 'vc-btn', 'Închide'); close.type = 'button';
      const shut = () => { dlg.remove(); cityDlg = null; (returnFocus || root).focus?.({preventScroll: true}); };
      tg.addEventListener('click', () => { toggle(c.id); shut(); });
      country.addEventListener('click', () => { shut(); zoomTo(c.cc); zone.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest'}); });
      close.addEventListener('click', shut);
      dlg.addEventListener('click', e => { if (e.target === dlg) shut(); });
      dlg.addEventListener('keydown', e => { if (e.key === 'Escape') shut(); });
      acts.append(tg, country, close); box.append(info, acts); dlg.append(box);
      document.body.append(dlg); cityDlg = dlg; tg.focus();
    }

    /* --- interacțiuni pe hartă: click/tap, drag, pinch, rotiță --- */
    const pointers = new Map();
    let drag = null, pinch = null;
    function hitTest(clientX, clientY) {
      const t = document.elementFromPoint(clientX, clientY);
      if (!t || !root.contains(t)) return {};
      const id = t.dataset?.id; if (id) return {city: byId.get(id)};
      const p = t.closest('.vc-country'); if (p && !p.classList.contains('is-off')) return {cc: p.dataset.cc};
      return {};
    }
    root.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      root.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) drag = {x: e.clientX, y: e.clientY, tx, ty, moved: false};
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), s, mid: toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), tx, ty};
        if (drag) drag.moved = true;
      }
    });
    root.addEventListener('pointermove', e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const ns = Math.min(MAX, Math.max(1, pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
        const [mx, my] = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        const wx = (pinch.mid[0] - pinch.tx) / pinch.s, wy = (pinch.mid[1] - pinch.ty) / pinch.s;
        cancelAnimationFrame(anim); s = ns; tx = mx - wx * ns; ty = my - wy * ns; applyView();
        return;
      }
      if (drag && pointers.size === 1) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; container.classList.add('is-dragging'); tip.hidden = true; }
        if (drag.moved) { const u = pxToUnits(); cancelAnimationFrame(anim); tx = drag.tx + dx * u; ty = drag.ty + dy * u; applyView(); }
        return;
      }
      if (e.pointerType === 'touch') return;
      const {city, cc} = hitTest(e.clientX, e.clientY);
      const txt = city ? `${city.name} · ${city.country}${visited.has(city.id) ? ' ✓' : ''}` : cc ? (map.countries.find(x => x.cc === cc)?.name || '') : '';
      root.style.cursor = city && s >= 2 ? 'pointer' : city || cc ? 'zoom-in' : 'grab';
      if (!txt) { tip.hidden = true; return; }
      const r = mapBox.getBoundingClientRect();
      tip.textContent = txt; tip.hidden = false;
      tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    });
    const endPointer = e => {
      const wasDrag = drag?.moved;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) { const [p] = [...pointers.values()]; drag = {x: p[0], y: p[1], tx, ty, moved: true}; return; }
      if (pointers.size) return;
      drag = null; container.classList.remove('is-dragging');
      if (wasDrag || e.type === 'pointercancel') return;
      const {city, cc} = hitTest(e.clientX, e.clientY);
      // La zoom 1 punctele sunt dese: un click alege țara (zoom + panoul ei); fișa orașului se deschide de la zoom 2
      if (city && s >= 2) openCity(city);
      else if (city || cc) zoomTo(city ? city.cc : cc);
    };
    root.addEventListener('pointerup', endPointer);
    root.addEventListener('pointercancel', endPointer);
    root.addEventListener('pointerleave', () => { tip.hidden = true; });
    root.addEventListener('wheel', e => {
      e.preventDefault();
      const [px, py] = toSvg(e.clientX, e.clientY);
      zoomAround(s * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), px, py, false);
    }, {passive: false});
    root.addEventListener('keydown', e => {
      const step = 60 * pxToUnits();
      if (e.key === '+' || e.key === '=') zoomAround(nextLevel(1), W / 2, H / 2, true);
      else if (e.key === '-') zoomAround(nextLevel(-1), W / 2, H / 2, true);
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); tx += e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0; ty += e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0; applyView(); }
      else if (e.key === 'Escape') zoomOut();
    });
    zIn.addEventListener('click', () => zoomAround(nextLevel(1), W / 2, H / 2, true));
    zOut.addEventListener('click', () => zoomAround(nextLevel(-1), W / 2, H / 2, true));
    zReset.addEventListener('click', zoomOut);
    back.addEventListener('click', zoomOut);
    const ro = new ResizeObserver(() => applyView()); ro.observe(root);

    /* --- căutare --- */
    let matches = [], active = -1;
    function renderDrop() {
      const q = norm(input.value).replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
      if (!q) { drop.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      const toks = q.split(/\s+/);
      matches = cities.filter(c => toks.every(t => c.key.includes(t)))
        .sort((a, b) => (norm(a.name).startsWith(toks[0]) ? 0 : 1) - (norm(b.name).startsWith(toks[0]) ? 0 : 1) || b.pop - a.pop).slice(0, 8);
      drop.replaceChildren();
      if (!matches.length) { const li = el('li', 'vc-empty', `Nu am găsit „${input.value}”. Încearcă numele local sau al țării.`); drop.append(li); }
      matches.forEach((c, i) => {
        const li = el('li', 'vc-opt' + (i === active ? ' is-active' : '')); li.id = `${listId}-${i}`; li.setAttribute('role', 'option'); li.dataset.id = c.id;
        li.setAttribute('aria-selected', String(i === active));
        li.append(el('span', 'vc-flag', flag(c.cc)), el('span', 'vc-name', c.name), el('span', 'vc-country-name', c.country), el('span', 'vc-mark', visited.has(c.id) ? '✓ vizitat' : '+ bifează'));
        drop.append(li);
      });
      drop.hidden = false; input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', active >= 0 ? `${listId}-${active}` : '');
    }
    function pick(id) {
      const c = byId.get(id); const was = visited.has(id);
      toggle(id); input.value = ''; active = -1; renderDrop();
      if (!was) flyToCity(c);
      say(was ? `${c.name} a fost scos din listă.` : `${c.name} a fost adăugat.`);
    }
    input.addEventListener('input', () => { active = -1; renderDrop(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!matches.length) return; active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; renderDrop(); }
      else if (e.key === 'Enter') { e.preventDefault(); const c = matches[active >= 0 ? active : 0]; if (c && !drop.hidden) pick(c.id); }
      else if (e.key === 'Escape') { input.value = ''; renderDrop(); }
    });
    drop.addEventListener('mousedown', e => e.preventDefault());
    drop.addEventListener('click', e => { const li = e.target.closest('.vc-opt'); if (li) pick(li.dataset.id); });
    input.addEventListener('blur', () => setTimeout(() => { drop.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120));
    input.addEventListener('focus', renderDrop);

    /* --- stare --- */
    function say(msg) { status.textContent = msg; }
    function refresh() {
      const n = visited.size, countries = new Set([...visited].map(id => byId.get(id)?.cc)).size;
      countNum.textContent = n;
      countText.textContent = ` ${plural(n, 'oraș vizitat', 'orașe vizitate').replace(/^\d+ /, '')} · ${plural(countries, 'țară', 'țări')}`;
      shareBtn.disabled = n === 0;
      const vcc = new Set([...visited].map(id => byId.get(id)?.cc));
      countryEls.forEach((p, cc) => p.classList.toggle('is-visited', vcc.has(cc)));
      dotEls.forEach((d, id) => d.classList.toggle('is-on', visited.has(id)));
      // punctele vizitate deasupra celorlalte
      [...visited].forEach(id => { const h = hitEls.get(id), d = dotEls.get(id); if (d) gDots.append(h, d); });
      applyView();
      if (focus && !zone.hidden) renderZone(focus);
    }
    async function persist(fn, rollback) {
      try { await fn(); } catch (e) { console.warn('[visited] salvare', e); rollback(); refresh(); say('Nu am putut salva modificarea. Încearcă din nou.'); }
    }
    function emit() { const ids = [...visited]; listeners.forEach(fn => { try { fn(ids); } catch {} }); }
    function toggle(id) {
      if (!byId.has(id)) return;
      const on = !visited.has(id);
      on ? visited.add(id) : visited.delete(id);
      refresh(); emit();
      const all = [...visited];
      persist(() => on ? store.add(id, all) : store.remove(id, all), () => on ? visited.delete(id) : visited.add(id));
    }
    function setVisited(ids) {
      const prev = [...visited];
      visited = new Set((ids || []).filter(id => byId.has(id)));
      refresh(); emit();
      persist(() => store.replace([...visited], prev), () => { visited = new Set(prev); });
    }

    /* --- share --- */
    let shareBlob;
    shareBtn.addEventListener('click', async () => {
      shareBtn.disabled = true; say('Pregătesc imaginea…');
      try { shareBlob = await buildShareImage({cities, map, byId, visited}); } catch (e) { console.warn(e); say('Nu am putut genera imaginea.'); shareBtn.disabled = false; return; }
      shareBtn.disabled = false; say('');
      openShare(shareBlob, visited.size);
    });
    function openShare(blob, n) {
      const url = URL.createObjectURL(blob), filename = `23citybreak-${n}-orase.png`;
      const text = `Am vizitat ${plural(n, 'oraș', 'orașe')} din Europa. Tu câte ai bifat?`;
      const dlg = el('div', 'vc-modal'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', 'Imaginea de distribuit');
      const box = el('div', 'vc-modal-box');
      const img = el('img'); img.src = url; img.alt = text;
      const acts = el('div', 'vc-actions');
      const native = el('button', 'vc-btn vc-primary', 'Distribuie ↗'); native.type = 'button';
      const wa = el('a', 'vc-btn vc-wa', 'WhatsApp'); wa.href = `https://wa.me/?text=${encodeURIComponent(text + ' ' + SITE)}`; wa.target = '_blank'; wa.rel = 'noopener';
      const dl = el('a', 'vc-btn', 'Descarcă imaginea'); dl.href = url; dl.download = filename;
      const note = el('p', 'vc-share-note'); note.setAttribute('role', 'status');
      /* WhatsApp: pe mobil foaia de distribuire cu fișier; pe desktop imaginea merge în clipboard (Ctrl+V în chat), altfel se descarcă */
      wa.addEventListener('click', async e => {
        const file = new File([blob], filename, {type: 'image/png'});
        if (navigator.canShare?.({files: [file]})) {
          e.preventDefault();
          try { await navigator.share({files: [file], text: `${text} ${SITE}`}); } catch {}
          return;
        }
        e.preventDefault();
        window.open(wa.href, '_blank', 'noopener');
        let copied = false;
        try { await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); copied = true; } catch {}
        if (copied) note.textContent = 'Imaginea e copiată. În WhatsApp, apasă Ctrl+V în conversație, apoi Trimite.';
        else { const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); note.textContent = 'Am descărcat imaginea. În WhatsApp, atașeaz-o (agrafa) din Descărcări.'; }
      });
      const close = el('button', 'vc-btn', 'Închide'); close.type = 'button';
      if (!navigator.share) native.hidden = true;
      native.addEventListener('click', async () => {
        const file = new File([blob], filename, {type: 'image/png'});
        try { if (navigator.canShare?.({files: [file]})) await navigator.share({files: [file], text: `${text} ${SITE}`}); else await navigator.share({text, url: SITE}); } catch {}
      });
      const shut = () => { dlg.remove(); URL.revokeObjectURL(url); shareBtn.focus(); };
      close.addEventListener('click', shut);
      dlg.addEventListener('click', e => { if (e.target === dlg) shut(); });
      dlg.addEventListener('keydown', e => { if (e.key === 'Escape') shut(); });
      acts.append(native, wa, dl, close); box.append(img, acts, note); dlg.append(box);
      document.body.append(dlg); (native.hidden ? dl : native).focus();
    }

    refresh();
    return {
      getVisited: () => [...visited],
      setVisited,
      toggle,
      isVisited: id => visited.has(id),
      onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      zoomTo, zoomOut,
      destroy() { ro.disconnect(); cityDlg?.remove(); cancelAnimationFrame(anim); container.replaceChildren(); container.classList.remove('vc-root', `vc-${mode}`, 'is-zoomed'); }
    };
  }

  /* ---------- imagine de share 1080×1350, în stilul imaginii din quiz ---------- */
  async function buildShareImage({cities, map, byId, visited}) {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    try { await Promise.all(['700 64px "Space Grotesk"', '600 38px "Space Grotesk"'].map(f => document.fonts.load(f))); } catch {}
    const display = '"Space Grotesk", "Segoe UI", sans-serif';
    const ids = [...visited], n = ids.length, ccs = new Set(ids.map(id => byId.get(id).cc));
    x.fillStyle = '#f6f2e8'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#141516'; x.fillRect(0, 0, W, 120);
    x.font = `700 44px ${display}`; x.textBaseline = 'middle';
    x.fillStyle = '#dfa649'; x.fillText('✈︎', 70, 62);
    x.fillStyle = '#fff'; x.fillText('23', 130, 62); let off = 130 + x.measureText('23').width;
    x.fillStyle = '#dfa649'; x.fillText('city', off, 62); off += x.measureText('city').width;
    x.fillStyle = '#fff'; x.fillText('break', off, 62);
    x.textAlign = 'right'; x.font = `700 26px ${display}`; x.fillStyle = '#dfa649'; x.fillText('HARTA MEA DE CITY BREAK', W - 70, 62);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = '#141516';
    x.font = `700 210px ${display}`; x.fillText(String(n), 62, 345);
    const numW = x.measureText(String(n)).width;
    x.font = `700 54px ${display}`; x.fillText(plural(n, 'oraș', 'orașe').replace(/^\d+ /, ''), 62 + numW + 24, 270);
    x.fillText('vizitate', 62 + numW + 24, 335);
    x.font = `600 38px ${display}`; x.fillStyle = '#8a6a33'; x.fillText(`în ${plural(ccs.size, 'țară', 'țări')} din Europa`, 66, 410);

    // harta: încadrată pe orașele vizitate (cu minim toată zona centrală) sau toată Europa
    const top = 450, mh = 760, mw = W - 140;
    const s = Math.min(mw / map.width, mh / map.height), ox = 70 + (mw - map.width * s) / 2, oy = top + (mh - map.height * s) / 2;
    x.save(); x.beginPath(); x.roundRect(70, top, mw, mh, 22); x.fillStyle = config.background ? '#c3e2dc' : '#e7eef0'; x.fill(); x.clip();
    x.translate(ox, oy); x.scale(s, s);
    x.lineJoin = 'round';
    const bg = config.background ? await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = ROOT + config.background; }) : null;
    if (bg) x.drawImage(bg, 0, 0, map.width, map.height);
    for (const k of map.countries) {
      const p = new Path2D(k.d);
      if (bg) { if (ccs.has(k.cc)) { x.fillStyle = 'rgba(34,160,75,.08)'; x.fill(p); } continue; }
      x.fillStyle = ccs.has(k.cc) ? '#dcefd9' : k.active ? '#fffdf8' : '#efece3'; x.fill(p);
      x.strokeStyle = '#cfc8b8'; x.lineWidth = 0.8 / s * 0.9; x.stroke(p);
    }
    for (const city of cities) if (!visited.has(city.id) && !city.inset) { x.fillStyle = 'rgba(20,21,22,.18)'; x.beginPath(); x.arc(city.x, city.y, 2.2, 0, Math.PI * 2); x.fill(); }
    for (const id of ids) {
      const city = byId.get(id); if (city.inset) continue;
      x.fillStyle = '#22a04b'; x.strokeStyle = '#ffffff'; x.lineWidth = 2;
      x.beginPath(); x.arc(city.x, city.y, 6, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    x.restore();
    const insetN = ids.filter(id => byId.get(id).inset).length;
    if (insetN) { x.font = `600 26px ${display}`; x.fillStyle = '#555b50'; x.fillText(`+ ${insetN} în Azore`, 96, top + mh - 30); }

    x.fillStyle = '#141516'; x.font = `700 40px ${display}`; x.fillText('Tu câte orașe ai bifat?', 70, H - 70);
    x.textAlign = 'right'; x.fillStyle = '#8a6a33'; x.font = `700 32px ${display}`; x.fillText('23citybreak.ro', W - 70, H - 72);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png'));
  }

  window.VisitedCities = {
    mount,
    loadData,
    stores: {local: localStore, supabase: supabaseStore},
    config,
    readLocal
  };
})();
