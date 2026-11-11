/* Orașe vizitate: căutare, hartă a Europei cu 2 niveluri de zoom, galerie și imagine de share.
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

  const norm = s => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const flag = cc => cc === 'XK' ? '🇽🇰' : String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0)));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const plural = (n, one, many) => n === 1 ? `1 ${one}` : `${n} ${n % 100 >= 20 || n % 100 === 0 && n ? 'de ' : ''}${many}`;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    const hint = el('span', 'vc-hint', 'Apasă pe o țară ca să vezi orașele ei.');
    bar.append(back, hint);
    const root = svg('svg', {viewBox: `0 0 ${map.width} ${map.height}`, role: 'img', 'aria-label': 'Harta Europei cu orașele vizitate'});
    const gLand = svg('g', {class: 'vc-land'}), gInset = svg('g', {class: 'vc-inset'}), gDots = svg('g', {class: 'vc-dots'}), gLabels = svg('g', {class: 'vc-labels'});
    root.append(gLand, gInset, gDots, gLabels);
    const tip = el('div', 'vc-tip'); tip.hidden = true;
    mapBox.append(bar, root, tip);

    const zone = el('div', 'vc-zone'); zone.hidden = true;
    const gallery = el('section', 'vc-gallery');
    const status = el('p', 'vc-status'); status.setAttribute('role', 'status');
    container.replaceChildren(head, searchWrap, mapBox, zone, status, ...(mode === 'onboarding' ? [] : [gallery]));
    if (mode === 'onboarding') shareBtn.hidden = true;

    /* --- hartă --- */
    const countryEls = new Map();
    for (const c of map.countries) {
      const p = svg('path', {d: c.d, class: c.active ? 'vc-country' : 'vc-country is-off', 'data-cc': c.cc});
      if (c.active) { p.append(Object.assign(svg('title'), {textContent: c.name})); }
      gLand.append(p); countryEls.set(c.cc, p);
    }
    if (map.inset) {
      const {x, y, w, h} = map.inset;
      gInset.append(svg('rect', {x, y, width: w, height: h, rx: 8}), Object.assign(svg('text', {x: x + 8, y: y + h - 8}), {textContent: 'Canare · Madeira · Azore'}));
    }
    const dotEls = new Map(), labelEls = new Map();
    for (const c of cities) {
      const d = svg('circle', {cx: c.x, cy: c.y, r: 3, class: 'vc-dot', 'data-id': c.id});
      gDots.append(d); dotEls.set(c.id, d);
    }

    let view = [0, 0, map.width, map.height], focus = null, anim;
    const k = () => view[2] / map.width;
    function applyView() {
      root.setAttribute('viewBox', view.map(v => v.toFixed(1)).join(' '));
      const s = k(), z = focus ? 1.9 : 1;
      for (const [id, d] of dotEls) d.setAttribute('r', ((visited.has(id) ? 4.2 : 2.6) * z * s).toFixed(2));
      for (const [, t] of labelEls) { t.setAttribute('font-size', (10.5 * s).toFixed(2)); t.setAttribute('dy', (-7 * s).toFixed(2)); }
      root.style.setProperty('--vc-stroke', (0.7 * s).toFixed(3));
    }
    function animateTo(target) {
      cancelAnimationFrame(anim);
      const from = [...view], t0 = performance.now(), dur = reduceMotion() ? 0 : 450;
      const step = now => {
        const p = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
        view = from.map((v, i) => v + (target[i] - v) * e); applyView();
        if (p < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    function boxFor(cc) {
      const c = map.countries.find(x => x.cc === cc);
      let [x0, y0, x1, y1] = c.cityBox || c.box;
      const pad = 40, minW = 170, ar = map.width / map.height;
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      let w = Math.max(x1 - x0, minW), h = Math.max(y1 - y0, minW / ar);
      if (w / h > ar) h = w / ar; else w = h * ar;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return [cx - w / 2, cy - h / 2, w, h];
    }
    function zoomTo(cc) {
      if (!cc || !map.countries.some(c => c.cc === cc && c.active)) return;
      if (!cities.some(c => c.cc === cc)) return;
      focus = cc; back.hidden = false;
      hint.textContent = 'Apasă pe un punct ca să bifezi orașul.';
      container.classList.add('is-zoomed');
      countryEls.forEach((p, k2) => p.classList.toggle('is-focus', k2 === cc));
      const inCountry = cities.filter(c => c.cc === cc);
      const target = inCountry.every(c => c.inset) && map.inset ? [map.inset.x - 20, map.inset.y - 40, map.inset.w + 40, (map.inset.w + 40) * map.height / map.width] : boxFor(cc);
      renderLabels(cc); renderZone(cc); animateTo(target);
    }
    function zoomOut() {
      focus = null; back.hidden = true; zone.hidden = true;
      hint.textContent = 'Apasă pe o țară ca să vezi orașele ei.';
      container.classList.remove('is-zoomed');
      countryEls.forEach(p => p.classList.remove('is-focus'));
      renderLabels(null); animateTo([0, 0, map.width, map.height]);
    }
    function renderLabels(cc) {
      gLabels.replaceChildren(); labelEls.clear();
      if (!cc) return;
      for (const c of cities.filter(x => x.cc === cc)) {
        const t = svg('text', {x: c.x, y: c.y, class: visited.has(c.id) ? 'is-on' : ''}); t.textContent = c.name.replace(/ \(.*\)$/, '');
        gLabels.append(t); labelEls.set(c.id, t);
      }
    }
    function renderZone(cc) {
      const list = cities.filter(c => c.cc === cc).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
      const h = el('h4', null, `${flag(cc)} ${list[0].country}`);
      const n = list.filter(c => visited.has(c.id)).length;
      h.append(el('span', null, ` ${n}/${list.length} vizitate`));
      const ul = el('div', 'vc-chips');
      for (const c of list) {
        const b = el('button', 'vc-chip' + (visited.has(c.id) ? ' is-on' : ''), c.name); b.type = 'button'; b.dataset.id = c.id;
        b.setAttribute('aria-pressed', String(visited.has(c.id)));
        ul.append(b);
      }
      zone.replaceChildren(h, ul); zone.hidden = false;
    }

    root.addEventListener('click', e => {
      const dot = e.target.closest('.vc-dot');
      if (dot) { const c = byId.get(dot.dataset.id); if (focus && (c.cc === focus || e.detail)) { toggle(c.id); } if (!focus || c.cc !== focus) zoomTo(c.cc); return; }
      const p = e.target.closest('.vc-country');
      if (p && !p.classList.contains('is-off')) { if (p.dataset.cc !== focus) zoomTo(p.dataset.cc); return; }
      if (e.target.closest('.vc-inset') && !focus) zoomTo('ES');
    });
    root.addEventListener('pointermove', e => {
      const dot = e.target.closest('.vc-dot'), p = e.target.closest('.vc-country');
      const c = dot && byId.get(dot.dataset.id);
      const txt = c ? `${c.name} · ${c.country}${visited.has(c.id) ? ' ✓' : ''}` : p && !p.classList.contains('is-off') ? (map.countries.find(x => x.cc === p.dataset.cc)?.name || '') : '';
      if (!txt || e.pointerType === 'touch') { tip.hidden = true; return; }
      const r = mapBox.getBoundingClientRect();
      tip.textContent = txt; tip.hidden = false;
      tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    });
    root.addEventListener('pointerleave', () => { tip.hidden = true; });
    back.addEventListener('click', zoomOut);
    zone.addEventListener('click', e => { const b = e.target.closest('.vc-chip'); if (b) toggle(b.dataset.id); });
    const onKey = e => { if (e.key === 'Escape' && focus && !drop.contains(document.activeElement) && document.activeElement !== input) zoomOut(); };
    document.addEventListener('keydown', onKey);

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
      if (!was) zoomTo(c.cc);
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

    /* --- galerie --- */
    function renderGallery() {
      if (mode === 'onboarding') return;
      const list = [...visited].map(id => byId.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
      const h = el('h3', null, 'Galeria ta de orașe');
      if (!list.length) { gallery.replaceChildren(h, el('p', 'vc-muted', 'Bifează primul oraș și apare aici, cu ilustrația lui.')); return; }
      const grid = el('div', 'vc-grid');
      for (const c of list) {
        const card = el('figure', 'vc-card' + (c.img ? '' : ' is-placeholder'));
        if (c.img) { const img = el('img'); img.src = c.img; img.alt = `Ilustrație ${c.name}`; img.loading = 'lazy'; card.append(img); }
        else { const ph = el('div', 'vc-ph'); ph.append(el('span', 'vc-ph-flag', flag(c.cc)), el('span', 'vc-ph-name', c.name.replace(/ \(.*\)$/, '')), el('span', 'vc-ph-note', 'Ilustrație în pregătire')); card.append(ph); }
        const cap = el('figcaption'); cap.append(el('strong', null, c.name), el('span', null, c.country)); card.append(cap);
        grid.append(card);
      }
      gallery.replaceChildren(h, grid);
    }

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
      labelEls.forEach((t, id) => t.classList.toggle('is-on', visited.has(id)));
      // punctele vizitate deasupra celorlalte
      [...visited].forEach(id => { const d = dotEls.get(id); if (d) gDots.append(d); });
      applyView();
      if (focus) renderZone(focus);
      renderGallery();
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
      acts.append(native, wa, dl, close); box.append(img, acts); dlg.append(box);
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
      destroy() { document.removeEventListener('keydown', onKey); cancelAnimationFrame(anim); container.replaceChildren(); container.classList.remove('vc-root', `vc-${mode}`, 'is-zoomed'); }
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
    x.save(); x.beginPath(); x.roundRect(70, top, mw, mh, 22); x.fillStyle = '#e7eef0'; x.fill(); x.clip();
    x.translate(ox, oy); x.scale(s, s);
    x.lineJoin = 'round';
    for (const k of map.countries) {
      const p = new Path2D(k.d);
      x.fillStyle = ccs.has(k.cc) ? '#f2d9a6' : k.active ? '#fffdf8' : '#efece3'; x.fill(p);
      x.strokeStyle = '#cfc8b8'; x.lineWidth = 0.8 / s * 0.9; x.stroke(p);
    }
    for (const city of cities) if (!visited.has(city.id) && !city.inset) { x.fillStyle = 'rgba(20,21,22,.18)'; x.beginPath(); x.arc(city.x, city.y, 2.2, 0, Math.PI * 2); x.fill(); }
    for (const id of ids) {
      const city = byId.get(id); if (city.inset) continue;
      x.fillStyle = '#dfa649'; x.strokeStyle = '#141516'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(city.x, city.y, 6, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    x.restore();
    const insetN = ids.filter(id => byId.get(id).inset).length;
    if (insetN) { x.font = `600 26px ${display}`; x.fillStyle = '#555b50'; x.fillText(`+ ${insetN} în Canare / Madeira / Azore`, 96, top + mh - 30); }

    x.fillStyle = '#141516'; x.font = `700 40px ${display}`; x.fillText('Tu câte orașe ai bifat?', 70, H - 70);
    x.textAlign = 'right'; x.fillStyle = '#8a6a33'; x.font = `700 32px ${display}`; x.fillText('23citybreak.ro', W - 70, H - 72);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png'));
  }

  window.VisitedCities = {
    mount,
    loadData,
    stores: {local: localStore, supabase: supabaseStore},
    readLocal
  };
})();
