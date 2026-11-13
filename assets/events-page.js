// Pagina Evenimente (evenimente.html): 3 categorii (Sport / Muzică / Alte evenimente) ca dale mari, sporturile
// împărțite pe sport (întâi cele din profil), ligile ca filtru secundar, comutatoarele „Doar weekenduri” (activ
// implicit) și „Doar în bugetul meu”. Turneele sunt grupate într-un card.
// Prețul zborului vine live de la Kiwi (assets/flight-price.js). Fiecare card are o singură stare de preț:
//   ok      → „Zbor OTP dus-întors de la 63 €”
//   none    → Kiwi a răspuns, dar nu există zbor în weekendul acela
//   pending → îl căutăm acum
//   unknown → nu l-am putut cere (limita Kiwi pe pagină sau pauză după un refuz): rândul de preț rămâne gol.
// Cu „Doar în bugetul meu” se afișează numai evenimentele cu preț găsit ≤ buget; restul sunt numărate, nu afișate.
(async () => {
  const root = document.getElementById('evp-root');
  const E = window.CBEvents, H = E.helpers, esc = H.esc, FP = window.CBFlightPrice;
  const PAGE = 12;
  const readLS = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
  const prefs = readLS('23cb-prefs'), interests = readLS('23cb-event-prefs');
  const budget = Number(prefs.budget_max_eur) > 0 ? Number(prefs.budget_max_eur) : null;
  const mySports = Array.isArray(interests.sports) ? interests.sports : [];
  const myComps = Array.isArray(interests.competitions) ? interests.competitions : [];
  const origin = FP.origin();
  const params = new URLSearchParams(location.search);

  // ---------- Sporturi ----------
  const SPORTS = [['football', 'Fotbal', '⚽'], ['rugby', 'Rugby', '🏉'], ['basketball', 'Baschet', '🏀'], ['tennis', 'Tenis', '🎾'],
    ['f1', 'Formula 1', '🏎️'], ['motogp', 'MotoGP', '🏍️'], ['running', 'Maratoane', '🏃'], ['other', 'Alte sporturi', '🏟️']];
  const sportOf = E.sportOf;

  // Cu interese salvate în profil: pastila „Pentru tine” e prima și e aleasă implicit; altfel „Toate”.
  const hasMine = mySports.length > 0 || myComps.length > 0;
  const isMine = e => mySports.includes(sportOf(e)) || (e.competition && myComps.includes(e.competition));
  const sportOrder = hasMine ? [...SPORTS.filter(s => mySports.includes(s[0])), ...SPORTS.filter(s => !mySports.includes(s[0]))] : SPORTS;

  const CAT_META = { sport: ['🏟️', 'Meciuri și curse'], music: ['🎤', 'Concerte și festivaluri'], other: ['🎭', 'Târguri, spectacole, sărbători'] };
  const tabParam = params.get('tab');
  const state = {
    tab: E.CATEGORIES.some(([k]) => k === tabParam) ? tabParam : 'sport',
    sport: hasMine ? 'mine' : 'all', comp: 'all',
    weekend: params.get('weekend') !== '0', inBudget: false, shown: PAGE, open: new Set(),
  };

  const today = new Date().toISOString().slice(0, 10);
  const all = (await E.load()).filter(e => H.endDate(e) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // ---------- Prețul zborului ----------
  const tripOf = e => { const w = H.mainWeekend(e); return { origin, dest: `City:${e.city_id}`, out: w.fri, back: w.sun }; };
  const tripLabel = e => { const w = H.mainWeekend(e); return H.rangeLabel(w.fri, w.sun); };
  const pending = new Set();
  const priceState = e => {
    const p = FP.cached(tripOf(e));
    if (p) return p.eur ? { s: 'ok', ...p } : { s: 'none' };
    return pending.has(e.id) ? { s: 'pending' } : { s: 'unknown' };
  };
  const inBudget = e => { const p = priceState(e); return p.s === 'ok' && p.eur <= budget; };
  const priceHtml = e => {
    const p = priceState(e);
    if (p.s === 'ok') return `<span class="evp-price ok${budget && p.eur > budget ? ' over' : ''}">✈︎ ${esc(tripLabel(e))} din ${esc(origin)}: de la <b>${p.eur} €</b>${p.direct ? ' · direct' : p.stops ? ` · ${p.stops} escală` : ''}</span>`;
    if (p.s === 'none') return `<span class="evp-price none">✈︎ Niciun zbor din ${esc(origin)} în weekendul ăsta</span>`;
    if (p.s === 'pending') return '<span class="evp-price wait">✈︎ Caut zborul…</span>';
    return '';
  };
  let rerender = 0;
  const later = () => { clearTimeout(rerender); rerender = setTimeout(render, 150); };
  const tried = new Set(); // cerute o dată fără răspuns (limită/pauză): nu le mai cerem la fiecare randare
  function ask(e) {
    if (pending.has(e.id) || tried.has(e.id) || FP.cached(tripOf(e)) || FP.paused()) return;
    pending.add(e.id); tried.add(e.id);
    FP.get(tripOf(e)).then(() => {
      pending.delete(e.id);
      if (state.inBudget && budget) later();
      else root.querySelectorAll(`[data-flight="${CSS.escape(e.id)}"]`).forEach(slot => { slot.innerHTML = priceHtml(e); });
    });
  }
  // Fără filtrul de buget cerem prețul doar când cardul ajunge pe ecran, ca să nu consumăm limita Kiwi degeaba.
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const e = all.find(x => x.id === en.target.dataset.flight); if (e) { ask(e); en.target.innerHTML = priceHtml(e); }
  }), { rootMargin: '200px' });
  function fillPrices() {
    root.querySelectorAll('[data-flight]').forEach(slot => {
      const e = all.find(x => x.id === slot.dataset.flight); if (!e) return;
      slot.innerHTML = priceHtml(e);
      if (priceState(e).s === 'unknown') io.observe(slot);
    });
  }

  // ---------- Grupare pe turnee ----------
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

  // ---------- Filtre ----------
  const inTab = () => all.filter(e => E.categoryOf(e) === state.tab).filter(e => !state.weekend || E.isWeekend(e));
  const bySport = (list, s = state.sport) => state.tab !== 'sport' || s === 'all' ? list : s === 'mine' ? list.filter(isMine) : list.filter(e => sportOf(e) === s);
  // Cheia de competiție: liga, iar la sport fără ligă (ex. baschet din Ticketmaster) sportul însuși.
  const compKey = e => e.competition || (state.tab === 'sport' ? `s:${sportOf(e)}` : e.kind);
  const byComp = list => state.comp === 'all' ? list : list.filter(e => compKey(e) === state.comp);
  const base = () => byComp(bySport(inTab()));
  const visible = () => (state.inBudget && budget ? base().filter(inBudget) : base());

  // ---------- Markup ----------
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
      <div class="evp-tour-head"><span class="ev-tag">${g.key.startsWith('c:') ? `${E.SPORTS[sportOf(first)].join(' ')} · Turneu` : '🎤 Turneu european'}</span>
        <h3>${esc(name)}</h3><p>${g.items.length} ${g.items.length === 1 ? 'dată' : 'date'} în ${cities} ${cities === 1 ? 'oraș' : 'orașe'}${state.weekend ? ', doar în weekend' : ''}</p></div>
      <ol class="evp-tour-list">${rows}</ol>
      ${g.items.length > 5 ? `<button type="button" class="evp-more-dates" data-tour="${esc(g.key)}" aria-expanded="${open}">${open ? 'Mai puține date' : `Toate cele ${g.items.length} date`}</button>` : ''}
    </article>`;
  }

  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  function catsHtml() {
    return `<div class="evp-cats" role="tablist" aria-label="Tip de eveniment">${E.CATEGORIES.map(([k, label]) => {
      const c = all.filter(e => E.categoryOf(e) === k && (!state.weekend || E.isWeekend(e))).length;
      const [icon, sub] = CAT_META[k];
      return `<button type="button" role="tab" class="evp-cat" id="tab-${k}" aria-selected="${k === state.tab}" aria-controls="evp-panel" data-tab="${k}" tabindex="${k === state.tab ? 0 : -1}">
        <span class="evp-cat-icon" aria-hidden="true">${icon}</span>
        <span class="evp-cat-txt"><b>${label}</b><small>${sub}</small></span>
        <span class="evp-cat-n">${c || '—'}</span></button>`;
    }).join('')}</div>`;
  }
  function sportsHtml() {
    if (state.tab !== 'sport') return '';
    const list = inTab();
    const pill = (k, label, icon, count, extra = '') => `<button type="button" class="evp-pill${state.sport === k ? ' on' : ''}${count ? '' : ' empty'}" data-sport="${k}" aria-pressed="${state.sport === k}"${count || state.sport === k ? '' : ' disabled'}>${icon ? `<span aria-hidden="true">${icon}</span>` : ''}${esc(label)}<small>${count}</small>${extra}</button>`;
    const pills = [
      hasMine ? pill('mine', 'Pentru tine', '★', list.filter(isMine).length) : '',
      pill('all', 'Toate sporturile', '', list.length),
      ...sportOrder.filter(([k]) => mySports.includes(k) || state.sport === k || list.some(e => sportOf(e) === k)).map(([k, label, icon]) => pill(k, label, icon, list.filter(e => sportOf(e) === k).length, mySports.includes(k) ? '<i class="evp-mine" title="Din profilul tău">★</i>' : '')),
    ].join('');
    const note = hasMine ? 'Sporturile marcate cu ★ sunt cele din profilul tău.' : '<a href="cont.html#interese">Alege-ți sporturile în Contul tău</a> și le punem primele.';
    return `<div class="evp-row"><span class="evp-row-label">Sport</span><div class="evp-pills" role="group" aria-label="Sport">${pills}</div></div><p class="evp-note">${note}</p>`;
  }
  function compsHtml() {
    const list = bySport(inTab());
    const comps = [...new Set(list.map(compKey))];
    if (comps.length < 2) return '';
    const label = c => E.COMPETITIONS[c] || (c.startsWith('s:') ? (SPORTS.find(x => x[0] === c.slice(2)) || SPORTS.at(-1))[1] : (E.KINDS[c] || E.KINDS.other)[1]);
    comps.sort((a, b) => (myComps.includes(b) - myComps.includes(a)) || label(a).localeCompare(label(b)));
    return `<div class="evp-row"><span class="evp-row-label">${state.tab === 'sport' ? 'Competiție' : 'Tip'}</span><div class="evp-chips" role="group" aria-label="Competiție">${[['all', 'Toate'], ...comps.map(c => [c, label(c)])].map(([c, l]) => `<button type="button" class="evp-chip${c === state.comp ? ' on' : ''}" data-comp="${esc(c)}" aria-pressed="${c === state.comp}">${myComps.includes(c) ? '★ ' : ''}${esc(l)}</button>`).join('')}</div></div>`;
  }
  const sw = (opt, label, on, disabled = false) => `<label class="evp-switch${disabled ? ' off' : ''}"><input type="checkbox" role="switch" data-opt="${opt}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''}><span class="evp-track" aria-hidden="true"></span><span>${label}</span></label>`;
  function budgetStatus() {
    if (!state.inBudget || !budget) return '';
    const b = base(), over = b.filter(e => priceState(e).s === 'ok' && !inBudget(e)).length;
    const none = b.filter(e => priceState(e).s === 'none').length, wait = b.filter(e => priceState(e).s === 'pending').length;
    const unknown = b.filter(e => priceState(e).s === 'unknown').length;
    const parts = [over && n(over, 'peste buget', 'peste buget'), none && n(none, 'fără zbor', 'fără zbor'), unknown && n(unknown, 'fără preț verificat încă', 'fără preț verificat încă')].filter(Boolean);
    return `<p class="evp-status">${wait ? `<span class="evp-spin" aria-hidden="true"></span>Verific prețul zborului pentru ${n(wait, 'eveniment', 'evenimente')}… ` : ''}${parts.length ? `Ascunse: ${parts.join(' · ')}.` : ''}</p>`;
  }

  function render() {
    // Cu filtrul de buget cerem din start prețurile candidaților (cei mai apropiați întâi), în limita Kiwi pe pagină.
    if (state.inBudget && budget) base().filter(e => priceState(e).s === 'unknown').slice(0, 24).forEach(ask);
    const items = build(visible());
    const focused = document.activeElement?.closest?.('[data-tab]')?.dataset.tab;
    root.innerHTML = `
      ${catsHtml()}
      <div class="evp-panel-top">
        ${sportsHtml()}
        ${compsHtml()}
        <div class="evp-switches">
          ${sw('weekend', 'Doar weekenduri', state.weekend)}
          ${sw('inBudget', budget ? `Doar în bugetul meu <small>zbor ≤ ${budget} €</small>` : 'Doar în bugetul meu', state.inBudget, !budget)}
          ${budget ? '' : '<a class="evp-note" href="cont.html#preferinte">Setează-ți bugetul în Contul tău →</a>'}
        </div>
        ${budgetStatus()}
      </div>
      <div id="evp-panel" role="tabpanel" aria-labelledby="tab-${state.tab}">
        ${items.length ? `<div class="ev-grid">${items.slice(0, state.shown).map(x => (x.items ? tourHtml(x) : E.cardHtml(x.e))).join('')}</div>` : `<p class="evp-empty">${emptyText()}</p>`}
        ${items.length > state.shown ? `<div class="ev-more"><button type="button" class="evp-more-btn" data-more>Arată încă ${Math.min(PAGE, items.length - state.shown)}</button></div>` : ''}
      </div>
      ${all.some(e => e.source === 'football-data') && state.tab === 'sport' ? '<p class="ev-credit">Football data provided by the Football-Data.org API</p>' : ''}
      <p class="ev-credit">Prețul zborului e cel mai mic găsit acum pe Kiwi, dus-întors de persoană, din ${esc(origin)}, pentru weekendul evenimentului (vineri → duminică). Se schimbă des; verifică-l în pachet.</p>`;
    root.querySelectorAll('.ev-card[data-ev]').forEach(card => {
      const e = all.find(x => x.id === card.dataset.ev);
      if (e) E.eventPhoto(e).then(p => E.setBg(card, p));
    });
    fillPrices();
    if (focused) root.querySelector(`[data-tab="${focused}"]`)?.focus();
  }
  function emptyText() {
    if (state.tab === 'music' && !all.some(e => E.categoryOf(e) === 'music')) return 'Concertele apar aici imediat ce conectăm Ticketmaster. Până atunci, vezi meciurile din Sport.';
    if (state.inBudget && budget) return pending.size ? 'Caut prețurile zborurilor…' : 'Nimic în bugetul tău deocamdată. Oprește „Doar în bugetul meu” ca să vezi tot.';
    if (state.sport === 'mine') return 'Nimic din sporturile tale în perioada asta. Alege „Toate sporturile”.';
    if (state.weekend) return 'Nu avem evenimente în weekend aici. Oprește „Doar weekenduri” ca să vezi și datele din timpul săptămânii.';
    return 'Nu avem încă evenimente în această categorie.';
  }

  root.addEventListener('click', ev => {
    const t = ev.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; state.comp = 'all'; state.shown = PAGE; const u = new URL(location.href); u.searchParams.set('tab', state.tab); history.replaceState(null, '', u); render(); root.querySelector(`[data-tab="${state.tab}"]`)?.focus(); return; }
    const s = ev.target.closest('[data-sport]'); if (s) { state.sport = s.dataset.sport; state.comp = 'all'; state.shown = PAGE; render(); return; }
    const c = ev.target.closest('[data-comp]'); if (c) { state.comp = c.dataset.comp; state.shown = PAGE; render(); return; }
    const g = ev.target.closest('[data-tour]'); if (g) { const k = g.dataset.tour; state.open.has(k) ? state.open.delete(k) : state.open.add(k); render(); return; }
    if (ev.target.closest('[data-more]')) { state.shown += PAGE; render(); }
  });
  root.addEventListener('keydown', ev => { // săgeți stânga/dreapta între categorii
    if (!ev.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const keys = E.CATEGORIES.map(([k]) => k), i = keys.indexOf(state.tab);
    root.querySelector(`[data-tab="${keys[(i + (ev.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length]}"]`)?.click();
  });
  root.addEventListener('change', ev => { const o = ev.target.dataset?.opt; if (o) { state[o] = ev.target.checked; state.shown = PAGE; render(); } });

  if (!all.length) { root.innerHTML = '<p class="evp-empty">Nu am putut încărca evenimentele acum. Reîncarcă pagina peste câteva minute.</p>'; return; }
  render();
})();
