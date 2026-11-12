// Pagina Evenimente (evenimente.html): tab-uri Sport / Muzică / Alte evenimente, turnee grupate într-un card,
// filtrele „Doar weekenduri” (activ implicit) și „Doar în bugetul meu” (bugetul de zbor din profil).
// Prețul zborului vine live de la Kiwi (assets/flight-price.js), doar pentru cardurile care se văd.
(async () => {
  const root = document.getElementById('evp-root');
  const E = window.CBEvents, H = E.helpers, esc = H.esc, FP = window.CBFlightPrice;
  const PAGE = 12;
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('23cb-prefs')) || {}; } catch { return {}; } })();
  const budget = Number(prefs.budget_max_eur) > 0 ? Number(prefs.budget_max_eur) : null;
  const origin = FP.origin();
  const params = new URLSearchParams(location.search);
  const state = {
    tab: E.CATEGORIES.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'sport',
    weekend: params.get('weekend') !== '0', inBudget: false, comp: 'all', shown: PAGE, open: new Set(),
  };

  const today = new Date().toISOString().slice(0, 10);
  const all = (await E.load()).filter(e => H.endDate(e) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // ---------- Prețul zborului ----------
  const tripOf = e => { const w = H.mainWeekend(e); return { origin, dest: `City:${e.city_id}`, out: w.fri, back: w.sun }; };
  const priceOf = e => FP.cached(tripOf(e));
  const overBudget = e => { const p = priceOf(e); return !!(budget && p?.eur && p.eur > budget); };
  const flightHtml = p => !p ? '' : p.eur ? `✈︎ zbor ${esc(origin)} de la <b>${p.eur} €</b>/pers.${p.direct ? ' · direct' : p.stops ? ` · ${p.stops} escală` : ''}` : '✈︎ fără zboruri găsite pentru weekendul ăsta';
  function fillPrices() {
    root.querySelectorAll('[data-flight]').forEach(slot => {
      const e = all.find(x => x.id === slot.dataset.flight); if (!e) return;
      const hit = priceOf(e);
      if (hit) { slot.innerHTML = flightHtml(hit); return; }
      if (FP.paused()) { slot.textContent = '✈︎ prețul zborului: vezi în pachet'; return; }
      if (!slot.dataset.asked) io.observe(slot);
    });
  }
  // Cerem prețul doar când cardul ajunge pe ecran, ca să nu consumăm limita Kiwi pe carduri nevăzute.
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const slot = en.target; io.unobserve(slot); slot.dataset.asked = '1';
    const e = all.find(x => x.id === slot.dataset.flight); if (!e) return;
    slot.textContent = '✈︎ caut prețul zborului…';
    FP.get(tripOf(e)).then(p => {
      slot.innerHTML = p ? flightHtml(p) : '✈︎ prețul zborului: vezi în pachet';
      if (state.inBudget && overBudget(e)) render(); // a ieșit din buget: dispare din listă
    });
  }), { rootMargin: '200px' });

  // ---------- Grupare pe turnee ----------
  // Turneu = același artist în mai multe orașe, sau aceeași competiție din lista curatoriată (ex. Six Nations).
  const groupKey = e => e.kind === 'concert' && e.artists?.[0] ? `a:${e.artists[0].toLowerCase()}` : e.source === 'curated' && e.competition ? `c:${e.competition}` : null;
  function build(list) {
    const groups = new Map(), out = [];
    for (const e of list) {
      const k = groupKey(e);
      if (!k) { out.push({ e }); continue; }
      if (!groups.has(k)) { const g = { key: k, items: [] }; groups.set(k, g); out.push(g); }
      groups.get(k).items.push(e);
    }
    return out.map(x => (x.items && x.items.length === 1 ? { e: x.items[0] } : x));
  }

  const visible = () => all.filter(e => E.categoryOf(e) === state.tab)
    .filter(e => !state.weekend || E.isWeekend(e))
    .filter(e => state.comp === 'all' || (e.competition || e.kind) === state.comp)
    .filter(e => !state.inBudget || !overBudget(e));

  function tourHtml(g) {
    const first = g.items[0], open = state.open.has(g.key);
    const name = g.key.startsWith('c:') ? (E.COMPETITIONS[first.competition] || first.competition) : first.artists[0];
    const cities = new Set(g.items.map(e => e.city_id)).size;
    const rows = (open ? g.items : g.items.slice(0, 5)).map(e => `
      <li><a class="evp-tour-row" href="${esc(E.packageUrl(e))}">
        <span class="d">${esc(H.shortDate(H.startDate(e)))}${E.isWeekend(e) ? ' <i class="evp-wk">weekend</i>' : ''}</span>
        <span class="c">${g.key.startsWith('a:') ? `<b>${esc(H.cityName(e.city_id))}</b>${e.venue ? ` · ${esc(e.venue)}` : ''}${e.price_min_eur ? ` · bilet de la ${Math.round(e.price_min_eur)} €` : ''}` : `<b>${esc(e.title.replace(/ \(rugby\)$/, ''))}</b> · ${esc(H.cityName(e.city_id))}`}</span>
        <span class="f" data-flight="${esc(e.id)}"></span><span class="go" aria-hidden="true">→</span></a></li>`).join('');
    return `<article class="evp-tour" data-ev="${esc(first.id)}">
      <div class="evp-tour-head"><span class="ev-tag">${g.key.startsWith('c:') ? '🏆 Turneu' : '🎤 Turneu european'}</span>
        <h3>${esc(name)}</h3><p>${g.items.length} ${g.items.length === 1 ? 'dată' : 'date'} în ${cities} ${cities === 1 ? 'oraș' : 'orașe'}${state.weekend ? ', doar în weekend' : ''}</p></div>
      <ol class="evp-tour-list">${rows}</ol>
      ${g.items.length > 5 ? `<button type="button" class="ev-chip" data-tour="${esc(g.key)}" aria-expanded="${open}">${open ? 'Mai puține date' : `Toate cele ${g.items.length} date`}</button>` : ''}
    </article>`;
  }

  function render() {
    const list = visible(), items = build(list);
    const inTab = all.filter(e => E.categoryOf(e) === state.tab);
    const comps = [...new Set(inTab.map(e => e.competition || e.kind))];
    const compLabel = c => E.COMPETITIONS[c] || (E.KINDS[c] || E.KINDS.other)[1];
    const hidden = all.filter(e => E.categoryOf(e) === state.tab && (!state.weekend || E.isWeekend(e)) && overBudget(e)).length;
    const tabCount = k => all.filter(e => E.categoryOf(e) === k && (!state.weekend || E.isWeekend(e))).length;
    root.innerHTML = `
      <div class="evp-tabs" role="tablist" aria-label="Tip de eveniment">${E.CATEGORIES.map(([k, label]) => `<button type="button" role="tab" id="tab-${k}" aria-selected="${k === state.tab}" aria-controls="evp-panel" data-tab="${k}">${label} <small>${tabCount(k)}</small></button>`).join('')}</div>
      <div class="evp-bar">
        <label class="evp-toggle"><input type="checkbox" data-opt="weekend"${state.weekend ? ' checked' : ''}><span>Doar weekenduri</span></label>
        <label class="evp-toggle${budget ? '' : ' off'}"><input type="checkbox" data-opt="inBudget"${state.inBudget ? ' checked' : ''}${budget ? '' : ' disabled'}><span>Doar în bugetul meu${budget ? ` (zbor ≤ ${budget} €)` : ''}</span></label>
        ${budget ? '' : '<a class="evp-hint" href="cont.html#preferinte">Setează-ți bugetul în Contul tău →</a>'}
        ${state.inBudget && hidden ? `<span class="evp-hint">${hidden} ${hidden === 1 ? 'ascuns' : 'ascunse'}, peste buget</span>` : ''}
      </div>
      ${comps.length > 1 ? `<div class="ev-filters evp-comps" role="group" aria-label="Competiție">${[['all', 'Toate'], ...comps.map(c => [c, compLabel(c)])].map(([c, l]) => `<button type="button" class="ev-chip${c === state.comp ? ' on' : ''}" data-comp="${esc(c)}" aria-pressed="${c === state.comp}">${esc(l)}</button>`).join('')}</div>` : ''}
      <div id="evp-panel" role="tabpanel" aria-labelledby="tab-${state.tab}">
        ${items.length ? `<div class="ev-grid">${items.slice(0, state.shown).map(x => (x.items ? tourHtml(x) : E.cardHtml(x.e))).join('')}</div>` : `<p class="evp-empty">${emptyText()}</p>`}
        ${items.length > state.shown ? `<div class="ev-more"><button type="button" class="ev-chip" data-more>Arată încă ${Math.min(PAGE, items.length - state.shown)}</button></div>` : ''}
      </div>
      ${all.some(e => e.source === 'football-data') && state.tab === 'sport' ? '<p class="ev-credit">Football data provided by the Football-Data.org API</p>' : ''}
      <p class="ev-credit">Prețul zborului e cel mai mic găsit acum pe Kiwi, dus-întors de persoană, din ${esc(origin)}, pentru weekendul evenimentului (vineri → duminică). Se schimbă des; verifică-l în pachet.</p>`;
    root.querySelectorAll('.ev-card[data-ev]').forEach(card => {
      if (card.style.backgroundImage) return;
      const e = all.find(x => x.id === card.dataset.ev);
      if (e) E.eventPhoto(e).then(p => E.setBg(card, p));
    });
    fillPrices();
  }
  function emptyText() {
    if (state.tab === 'music' && !all.some(e => E.categoryOf(e) === 'music')) return 'Concertele apar aici imediat ce conectăm Ticketmaster. Până atunci, vezi meciurile din tab-ul Sport.';
    if (state.weekend) return 'Nu avem evenimente în weekend aici. Debifează „Doar weekenduri” ca să vezi și datele din timpul săptămânii.';
    if (state.inBudget) return 'Nimic în bugetul tău deocamdată. Debifează „Doar în bugetul meu” ca să vezi tot.';
    return 'Nu avem încă evenimente în această categorie.';
  }

  root.addEventListener('click', ev => {
    const t = ev.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; state.comp = 'all'; state.shown = PAGE; const u = new URL(location.href); u.searchParams.set('tab', state.tab); history.replaceState(null, '', u); render(); root.querySelector(`[data-tab="${state.tab}"]`)?.focus(); return; }
    const c = ev.target.closest('[data-comp]'); if (c) { state.comp = c.dataset.comp; state.shown = PAGE; render(); return; }
    const g = ev.target.closest('[data-tour]'); if (g) { const k = g.dataset.tour; state.open.has(k) ? state.open.delete(k) : state.open.add(k); render(); return; }
    if (ev.target.closest('[data-more]')) { state.shown += PAGE; render(); }
  });
  root.addEventListener('keydown', ev => { // săgeți stânga/dreapta între tab-uri
    if (!ev.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const keys = E.CATEGORIES.map(([k]) => k), i = keys.indexOf(state.tab);
    root.querySelector(`[data-tab="${keys[(i + (ev.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length]}"]`)?.click();
  });
  root.addEventListener('change', ev => { const o = ev.target.dataset?.opt; if (o) { state[o] = ev.target.checked; state.shown = PAGE; render(); } });

  if (!all.length) { root.innerHTML = '<p class="evp-empty">Nu am putut încărca evenimentele acum. Reîncarcă pagina peste câteva minute.</p>'; return; }
  render();
})();
