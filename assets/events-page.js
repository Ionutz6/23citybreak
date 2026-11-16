// Pagina Evenimente (evenimente.html): 3 categorii (Sport / Muzică / Alte evenimente) ca dale mari, sporturile
// împărțite pe sport (întâi cele din profil), ligile ca filtru secundar, comutatoarele „Doar weekenduri” (activ
// implicit) și „Doar în bugetul meu”. Doar evenimentele cu zbor din aeroportul de plecare (cel ales în cont, altfel OTP); fără aeroport ales în cont, doar cele importante (popularity ≥60).
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
  // Cu cont, aeroportul de plecare și bugetul vin din cont (și pe un dispozitiv nou), nu doar din ce e salvat local.
  await window.Account?.syncPrefsToLocal?.();
  const readLS = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
  const prefs = readLS('23cb-prefs'), interests = readLS('23cb-event-prefs');
  const budget = Number(prefs.budget_max_eur) > 0 ? Number(prefs.budget_max_eur) : null;
  const mySports = Array.isArray(interests.sports) ? interests.sports : [];
  const myComps = Array.isArray(interests.competitions) ? interests.competitions : [];
  const myTeams = Array.isArray(interests.favorite_teams) ? interests.favorite_teams.filter(t => typeof t === 'string' && t.trim().length >= 3).slice(0, 10) : [];
  const myArtists = Array.isArray(interests.favorite_artists) ? interests.favorite_artists.filter(a => typeof a === 'string' && a.trim().length >= 2).slice(0, 10) : [];
  const origin = FP.origin();
  const hasAirports = Array.isArray(prefs.departure_airports) && prefs.departure_airports.length > 0; // alese de client în cont
  const params = new URLSearchParams(location.search);

  // ---------- Sporturi ----------
  const SPORTS = [['football', 'Fotbal', '⚽'], ['rugby', 'Rugby', '🏉'], ['basketball', 'Baschet', '🏀'], ['hockey', 'Hochei', '🏒'], ['tennis', 'Tenis', '🎾'],
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
    weekend: params.get('weekend') !== '0', inBudget: false,
    onlyFlights: true, onlyTop: !hasAirports, shown: PAGE, open: new Set(),
  };

  const today = new Date().toISOString().slice(0, 10);
  const all = (await E.load()).filter(e => H.endDate(e) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // Fără „Toate sporturile” (suma sporturilor individuale e aceeași, fiecare eveniment are exact un sport): fără profil pornim de la primul sport cu evenimente.
  if (!hasMine) state.sport = (SPORTS.find(([k]) => all.some(e => E.categoryOf(e) === 'sport' && sportOf(e) === k)) || SPORTS[0])[0];

  // ---------- Prețul zborului ----------
  const tripOf = e => { const w = H.tripPlan(e); return { origin, dest: `City:${e.city_id}`, out: w.out, back: w.back, arriveBy: w.arriveBy, departAfter: w.departAfter }; };
  const tripLabel = e => { const w = H.tripPlan(e); return H.rangeLabel(w.out, w.back); };
  const pending = new Set();
  const priceState = e => {
    const p = FP.cached(tripOf(e));
    if (p) return p.eur ? { s: 'ok', ...p } : { s: 'none', timing: p.timing };
    return pending.has(e.id) ? { s: 'pending' } : { s: 'unknown' };
  };
  const inBudget = e => { const p = priceState(e); return p.s === 'ok' && p.eur <= budget; };
  const priceHtml = e => {
    const p = priceState(e);
    if (p.s === 'ok') return `<span class="evp-price ok${budget && p.eur > budget ? ' over' : ''}">✈︎ ${esc(tripLabel(e))} din ${esc(origin)}: de la <b>${p.eur} €</b>${p.direct ? ' · direct' : p.stops ? ` · ${p.stops} escală` : ''}</span>`;
    if (p.s === 'none') return `<span class="evp-price none">✈︎ ${p.timing ? `Niciun zbor din ${esc(origin)} care să se potrivească cu ora evenimentului` : `Niciun zbor din ${esc(origin)} în weekendul ăsta`}</span>`;
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
      if ((state.inBudget && budget) || state.onlyFlights) later();
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

  // Fiecare dată e un card de sine stătător (aceeași dimensiune); la concerte arătăm doar că turneul mai are și alte orașe.
  // Un turneu cu 20 de orașe nu ocupă pagina: cel mult 2 date per artist (cele mai apropiate), restul rămân semnalate pe card.
  const PER_TOUR = 2;
  // Trupe/artiști preferați din profil: primii la Muzică, inclusiv concertele anunțate peste cele 120 de zile (le cerem separat, pe nume, la Ticketmaster).
  const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const favNames = myArtists.map(norm).filter(Boolean);
  // Formațiile tribut („Ultimate Coldplay”, „The Bon Jovi Experience”, „A Tribute to…”) nu sunt trupa însăși: potrivirea e doar pe numele exact al artistului (attractions din Ticketmaster), nu pe titlu, și titlurile de tribut sunt excluse.
  const TRIBUTE = /\b(ultimate|tribute|tributo|the music of|celebration of|experience|story of|reloaded|symphonic|legacy|plays|performs|revisited)\b/i;
  const isFav = e => !TRIBUTE.test(e.title || '') && favNames.some(f => (e.artists || []).some(a => norm(a) === f && !TRIBUTE.test(a))) ? 1 : 0;
  // Echipe preferate: meciurile lor (max 2) urcă primele la Sport, chiar dacă sunt peste cele 120 de zile.
  const favTeams = myTeams.map(norm).filter(Boolean);
  const isFavTeam = e => favTeams.length && (e.teams || []).some(t => favTeams.some(f => ` ${norm(t)} `.includes(` ${f} `))) ? 1 : 0;
  const HORIZON = H.isoAdd(today, 120);
  async function loadFavorites() {
    const api = E.api, have = new Set(all.map(e => e.id));
    const found = [];
    for (let i = 0; i < myArtists.length; i += 3) {
      const rs = await Promise.allSettled(myArtists.slice(i, i + 3).map(async name => {
        const u = new URL(`${api.url}/functions/v1/events-search`); u.searchParams.set('q', name);
        const r = await fetch(u, { headers: { apikey: api.key, Authorization: `Bearer ${api.key}` }, signal: AbortSignal.timeout(15000) });
        return r.ok ? (await r.json()).events || [] : [];
      }));
      for (const r of rs) if (r.status === 'fulfilled') found.push(...r.value);
    }
    let added = 0;
    for (const e of found) if (!have.has(e.id) && isFav(e) && (e.kind === 'concert' || e.kind === 'festival') && H.endDate(e) >= today) { have.add(e.id); all.push(e); added++; }
    if (added) { all.sort((a, b) => a.starts_at.localeCompare(b.starts_at)); render(); }
  }

  // Spectacole și musicaluri cu multe reprezentații în același loc (Lion King, Disney On Ice): un singur card, cu cea mai apropiată dată
  // și numărul celorlalte reprezentații din weekenduri.
  const RUN_KINDS = new Set(['theatre', 'comedy', 'other']);
  const runKey = e => `${e.city_id}|${(e.venue || '').toLowerCase()}|${(e.title || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
  const runs = new Map();
  function build(list) {
    const seen = new Map(), perArtist = new Map();
    runs.clear();
    if (state.tab === 'music' && favNames.length) list = [...list].sort((a, b) => isFav(b) - isFav(a)); // trupele preferate primele (sortare stabilă: în rest rămâne ordinea pe dată)
    for (const e of list) if (RUN_KINDS.has(e.kind)) runs.set(runKey(e), (runs.get(runKey(e)) || 0) + 1);
    if (state.tab === 'sport' && favTeams.length) { // cel mult 2 meciuri ale echipelor preferate, primele
      const pinned = list.filter(isFavTeam).slice(0, 2);
      list = [...pinned, ...list.filter(e => !pinned.includes(e))];
    }
    const same = new Set(); // același concert/festival (oraș + loc + zi + artist sau titlu fără sufixe) apare o singură dată, chiar dacă vine și din DB, și din căutarea favoritelor
    list = list.filter(e => {
      if (e.kind !== 'concert' && e.kind !== 'festival') return true;
      const k = `${e.city_id}|${norm(e.venue)}|${String(e.starts_at).slice(0, 10)}|${norm(e.artists?.[0] || String(e.title).split('|')[0])}`;
      if (same.has(k)) return false; same.add(k); return true;
    });
    return list.filter(e => {
      if (RUN_KINDS.has(e.kind)) { const k = runKey(e); if (seen.has(k)) return false; seen.set(k, 1); return true; }
      if (e.kind !== 'concert' || !e.artists?.[0]) return true;
      const k = e.artists[0].toLowerCase(), n = perArtist.get(k) || 0;
      perArtist.set(k, n + 1);
      return n < PER_TOUR;
    }).map(e => ({ e }));
  }
  const tourMore = e => {
    if (e.kind !== 'concert' || !e.artists?.[0]) return 0;
    const a = e.artists[0].toLowerCase();
    return new Set(all.filter(x => x.id !== e.id && x.kind === 'concert' && x.artists?.[0]?.toLowerCase() === a && x.city_id !== e.city_id).map(x => x.city_id)).size;
  };

  // ---------- Filtre ----------
  const inTab = () => all.filter(e => E.categoryOf(e) === state.tab).filter(e => e.source !== 'football-data' || H.startDate(e) <= HORIZON || isFavTeam(e)).filter(e => !state.weekend || E.isWeekend(e));
  const bySport = (list, s = state.sport) => state.tab !== 'sport' || s === 'all' ? list : s === 'mine' ? list.filter(isMine) : list.filter(e => sportOf(e) === s);
  // Cheia de competiție: liga, iar la sport fără ligă (ex. baschet din Ticketmaster) sportul însuși.
  const compKey = e => E.inferComp(e) || (state.tab === 'sport' ? `s:${sportOf(e)}` : e.kind);
  const byComp = list => state.comp === 'all' ? list : list.filter(e => compKey(e) === state.comp);
  const base = () => byComp(bySport(inTab()));
  // Importanță = coloana popularity din DB (scor ≥60: meciuri mari, artiști cu turnee mari). Fără orașe de plecare alese afișăm doar ce contează.
  const TOP = 60;
  const noFlight = e => priceState(e).s === 'none';
  const visible = () => {
    let b = base();
    if (state.onlyTop) b = b.filter(e => (e.popularity || 0) >= TOP);
    if (state.onlyFlights) b = b.filter(e => !noFlight(e));
    return state.inBudget && budget ? b.filter(inBudget) : b;
  };

  // ---------- Markup ----------
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
      ...sportOrder.filter(([k]) => mySports.includes(k) || state.sport === k || list.some(e => sportOf(e) === k)).map(([k, label, icon]) => pill(k, label, icon, list.filter(e => sportOf(e) === k).length, mySports.includes(k) ? '<i class="evp-mine" title="Din profilul tău">★</i>' : '')),
    ].join('');
    const note = hasMine ? 'Sporturile marcate cu ★ sunt cele din profilul tău.' : '<a href="cont.html#interese">Alege-ți sporturile în Contul tău</a> și le punem primele.';
    return `<div class="evp-row evp-row-nolabel"><div class="evp-pills" role="group" aria-label="Sport">${pills}</div></div><p class="evp-note">${note}</p>`;
  }
  function compsHtml() {
    // La sport, rândul apare doar cu un sport anume ales (nu la „Pentru tine” / „Toate”) și doar dacă are cel puțin 2 competiții.
    if (state.tab === 'sport' && (state.sport === 'all' || state.sport === 'mine')) return '';
    const list = bySport(inTab());
    const comps = [...new Set(list.map(compKey))];
    if (comps.length < 2) return '';
    const label = c => E.COMPETITIONS[c] || (c.startsWith('s:') ? 'Alte meciuri' : (E.KINDS[c] || E.KINDS.other)[1]);
    comps.sort((a, b) => (myComps.includes(b) - myComps.includes(a)) || label(a).localeCompare(label(b)));
    return `<div class="evp-row${state.tab === 'sport' ? '' : ' evp-row-nolabel'}">${state.tab === 'sport' ? '<span class="evp-row-label">Competiție</span>' : ''}<div class="evp-chips" role="group" aria-label="Competiție">${[['all', 'Toate'], ...comps.map(c => [c, label(c)])].map(([c, l]) => `<button type="button" class="evp-chip${c === state.comp ? ' on' : ''}" data-comp="${esc(c)}" aria-pressed="${c === state.comp}">${myComps.includes(c) ? '★ ' : ''}${esc(l)}</button>`).join('')}</div></div>`;
  }
  const sw = (opt, label, on, disabled = false) => `<label class="evp-switch${disabled ? ' off' : ''}"><input type="checkbox" role="switch" data-opt="${opt}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''}><span class="evp-track" aria-hidden="true"></span><span>${label}</span></label>`;
  function flightsStatus() {
    if (!state.onlyFlights) return '';
    const b = base().filter(e => !state.onlyTop || (e.popularity || 0) >= TOP);
    const none = b.filter(noFlight).length, wait = b.filter(e => priceState(e).s === 'pending').length;
    return `<p class="evp-status">${wait ? `<span class="evp-spin" aria-hidden="true"></span>Verific zborurile din ${esc(origin)}… ` : ''}${none ? `Ascunse: ${n(none, 'fără zbor', 'fără zbor')} în weekendul respectiv.` : ''}</p>`;
  }
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
    if ((state.inBudget && budget) || state.onlyFlights) base().filter(e => priceState(e).s === 'unknown').slice(0, 24).forEach(ask);
    const items = build(visible());
    const focused = document.activeElement?.closest?.('[data-tab]')?.dataset.tab;
    root.innerHTML = `
      ${catsHtml()}
      <div class="evp-panel-top">
        ${sportsHtml()}
        ${compsHtml()}
        <div class="evp-switches">
          ${sw('weekend', 'Doar weekenduri', state.weekend)}
          ${sw('onlyFlights', `Doar cu zbor din ${esc(origin)}`, state.onlyFlights)}
          ${hasAirports ? '' : sw('onlyTop', 'Doar cele importante', state.onlyTop)}
          ${sw('inBudget', budget ? `Doar în bugetul meu <small>zbor ≤ ${budget} €</small>` : 'Doar în bugetul meu', state.inBudget, !budget)}
          ${budget ? '' : '<a class="evp-note" href="cont.html#preferinte">Setează-ți bugetul în Contul tău →</a>'}
        </div>
        ${flightsStatus()}${budgetStatus()}
      </div>
      <div id="evp-panel" role="tabpanel" aria-labelledby="tab-${state.tab}">
        ${items.length ? `<div class="ev-grid">${items.slice(0, state.shown).map(x => E.cardHtml(x.e, { fav: (state.tab === 'music' && isFav(x.e)) || (state.tab === 'sport' && isFavTeam(x.e)), favLabel: state.tab === 'sport' ? 'Echipa ta preferată' : 'Trupa ta preferată', tour: tourMore(x.e), runs: RUN_KINDS.has(x.e.kind) ? (runs.get(runKey(x.e)) || 1) - 1 : 0 })).join('')}</div>` : `<p class="evp-empty">${emptyText()}</p>`}
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
    if (state.sport === 'mine') return 'Nimic din sporturile tale în perioada asta. Alege un sport din listă.';
    if (state.weekend) return 'Nu avem evenimente în weekend aici. Oprește „Doar weekenduri” ca să vezi și datele din timpul săptămânii.';
    return 'Nu avem încă evenimente în această categorie.';
  }

  root.addEventListener('click', ev => {
    const t = ev.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; state.comp = 'all'; state.shown = PAGE; const u = new URL(location.href); u.searchParams.set('tab', state.tab); history.replaceState(null, '', u); render(); root.querySelector(`[data-tab="${state.tab}"]`)?.focus(); return; }
    const s = ev.target.closest('[data-sport]'); if (s) { state.sport = s.dataset.sport; state.comp = 'all'; state.shown = PAGE; render(); return; }
    const c = ev.target.closest('[data-comp]'); if (c) { state.comp = c.dataset.comp; state.shown = PAGE; render(); return; }
    if (ev.target.closest('[data-more]')) { state.shown += PAGE; render(); }
  });
  root.addEventListener('keydown', ev => { // săgeți stânga/dreapta între categorii
    if (!ev.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const keys = E.CATEGORIES.map(([k]) => k), i = keys.indexOf(state.tab);
    root.querySelector(`[data-tab="${keys[(i + (ev.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length]}"]`)?.click();
  });
  root.addEventListener('change', ev => { const o = ev.target.dataset?.opt; if (o) { state[o] = ev.target.checked; state.comp = 'all'; state.shown = PAGE; render(); } });

  if (!all.length) { root.innerHTML = '<p class="evp-empty">Nu am putut încărca evenimentele acum. Reîncarcă pagina peste câteva minute.</p>'; return; }
  render();
  if (myArtists.length) loadFavorites();
})();
