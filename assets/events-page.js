// Pagina Evenimente (evenimente.html): 3 categorii (Sport / Muzică / Alte evenimente) ca dale mari, sporturile
// împărțite pe sport (întâi cele din profil), ligile ca filtru secundar, comutatoarele „Doar weekenduri” (activ
// implicit) și „Doar în bugetul meu”. Doar evenimentele cu zbor din aeroportul de plecare (cel ales în cont, altfel OTP); fără aeroport ales în cont, doar cele importante (popularity ≥60).
// Prețul zborului vine live de la Kiwi (assets/flight-price.js). Fiecare card are o singură stare de preț:
//   ok      → „Zbor OTP dus-întors de la 63 €”
//   none    → Kiwi a răspuns, dar nu există zbor în weekendul acela
//   pending → îl căutăm acum
//   unknown → nu l-am cerut (implicit la încărcare nu trimitem nimic la Kiwi): „vezi prețul în pachet”.
// Prețurile se cer live doar cu „Doar cu zbor” sau „Doar în bugetul meu” activ (cele mai apropiate 24 de carduri), altfel doar în pagina evenimentului.
// Cu „Doar în bugetul meu” se afișează numai evenimentele cu preț găsit ≤ buget; restul sunt numărate, nu afișate.
(async () => {
  const root = document.getElementById('evp-root');
  const E = window.CBEvents, H = E.helpers, esc = H.esc, FP = window.CBFlightPrice;
  const PAGE = 8; // 4 pe rând × 2 rânduri; săgeți pentru următoarele 8
  // Cu cont, aeroportul de plecare și bugetul vin din cont (și pe un dispozitiv nou), nu doar din ce e salvat local.
  await window.Account?.syncPrefsToLocal?.();
  const readLS = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
  const prefs = readLS('23cb-prefs'), interests = readLS('23cb-event-prefs');
  // Aceleași praguri și aceeași afișare ca în Cont și la Zboruri: 75/100/125/150/200/250/350/500 €; valorile vechi (ex. 300) urcă la pragul următor; în RON valoare orientativă (≈5 lei/€, rotunjit la 50).
  const BUDGET_STEPS = [75, 100, 125, 150, 200, 250, 350, 500];
  const budget = Number(prefs.budget_max_eur) > 0 ? (BUDGET_STEPS.find(n => n >= Number(prefs.budget_max_eur)) ?? null) : null;
  const budgetText = budget ? (prefs.currency === 'RON' ? `~${new Intl.NumberFormat('ro-RO').format(Math.round(budget * 5 / 50) * 50)} RON` : `${budget} €`) : '';
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
    weekend: false, inBudget: false,
    onlyFlights: false, onlyTop: !hasAirports, onlyNotable: true, page: 0, open: new Set(),
  };

  const today = new Date().toISOString().slice(0, 10);
  const all = (await E.load()).filter(e => H.endDate(e) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // Fără „Toate sporturile” (suma sporturilor individuale e aceeași, fiecare eveniment are exact un sport): fără profil pornim de la primul sport cu evenimente.
  if (!hasMine) state.sport = (SPORTS.find(([k]) => all.some(e => E.categoryOf(e) === 'sport' && sportOf(e) === k)) || SPORTS[0])[0];

  // ---------- Prețul zborului ----------
  // Prețuri din tabela route_prices (cache Travelpayouts + prețuri văzute de vizitatori, fără Kiwi live): cel mai mic dus-întors pentru weekendul evenimentului.
  // Aeroportul din profil; dacă nu are încă prețuri, București (ca pe Acasă).
  let rpOrigin = origin;
  const RP = new Map(); // dest ('City:<id>') → [{ out, back, eur, direct }]
  async function loadRoutePrices() {
    const api = E.api;
    const load = async code => {
      const q = new URLSearchParams({ select: 'dest,out_date,back_date,price_eur,direct,source,seen_at', origin: `eq.${code}`, out_date: `gte.${today}`, order: 'price_eur.asc', limit: '1000' });
      q.append('out_date', `lte.${H.isoAdd(today, 90)}`);
      try {
        const r = await fetch(`${api.url}/rest/v1/route_prices?${q}`, { headers: { apikey: api.key, Authorization: `Bearer ${api.key}` }, signal: AbortSignal.timeout(8000) });
        return r.ok ? await r.json() : [];
      } catch { return []; }
    };
    let rows = await load(origin);
    if (origin !== 'OTP' && rows.length < 3) { rpOrigin = 'OTP'; rows = await load('OTP'); }
    const now = Date.now();
    for (const r of rows) {
      if (now - Date.parse(r.seen_at) > (r.source === 'visitor' ? 24 : 72) * 36e5) continue;
      const list = RP.get(r.dest) || []; list.push({ out: r.out_date, back: r.back_date, eur: r.price_eur, direct: r.direct }); RP.set(r.dest, list);
    }
  }
  await loadRoutePrices();
  const routePrice = e => {
    const list = RP.get(`City:${e.city_id}`); if (!list) return null;
    const w = H.tripPlan(e), d = H.startDate(e);
    const exact = list.filter(r => r.out === w.out && r.back === w.back);
    const near = exact.length ? exact : list.filter(r => r.out <= d && r.back >= d);
    return near.length ? near.reduce((a, b) => (b.eur < a.eur ? b : a)) : null;
  };
  const priceKey = e => { const p = priceState(e); return p.s === 'ok' ? p.eur : Infinity; }; // fără preț: la coadă
  const tripOf = e => { const w = H.tripPlan(e); return { origin, dest: `City:${e.city_id}`, out: w.out, back: w.back, arriveBy: w.arriveBy, departAfter: w.departAfter }; };
  const tripLabel = e => { const w = H.tripPlan(e); return H.rangeLabel(w.out, w.back); };
  const pending = new Set();
  const priceState = e => {
    const p = FP.cached(tripOf(e));
    if (p) return p.eur ? { s: 'ok', ...p } : { s: 'none', timing: p.timing };
    const rp = routePrice(e);
    if (rp) return { s: 'ok', eur: rp.eur, direct: rp.direct, rp: true };
    // Fără preț real: estimare după distanță (cu „~”), ca fiecare card să aibă un preț de zbor. Prețul exact se vede în pachet.
    const est = E.estimateFlight(e.city_id, rpOrigin);
    if (est && !pending.has(e.id)) return { s: 'ok', eur: est, est: true, rp: true };
    return pending.has(e.id) ? { s: 'pending' } : { s: 'unknown' };
  };
  const inBudget = e => { const p = priceState(e); return p.s === 'ok' && p.eur <= budget; };
  const priceHtml = e => {
    const p = priceState(e);
    if (p.s === 'ok') return E.flightHtml({ eur: p.eur, origin: p.rp ? rpOrigin : origin, label: tripLabel(e), note: p.direct ? 'direct' : p.stops ? `${p.stops} escală` : '', est: p.est });
    if (p.s === 'none') return `<span class="evp-price none">✈︎ ${p.timing ? `Niciun zbor din ${esc(origin)} care să se potrivească cu ora evenimentului` : `Niciun zbor din ${esc(origin)} în weekendul ăsta`}</span>`;
    if (p.s === 'pending') return '<span class="evp-price wait">✈︎ Caut zborul…</span>';
    // Nu am putut cere prețul (limită de cereri sau pauză după un refuz Kiwi): nu lăsăm cardul fără rând de zbor.
    // La încărcare nu cerem nimic la Kiwi (pagina rămâne rapidă, iar cererile Kiwi se economisesc): prețul exact se vede la deschiderea evenimentului.
    return `<span class="evp-price wait">✈︎ Zbor din ${esc(origin)}: vezi prețul în pachet</span>`;
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
  function fillPrices() {
    root.querySelectorAll('[data-flight]').forEach(slot => {
      const e = all.find(x => x.id === slot.dataset.flight); if (!e) return;
      slot.innerHTML = priceHtml(e);
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
  const TM = window.CBTeamMatch; // potrivire exactă pe echipă (FC Barcelona ≠ Espanyol), nu pe oraș
  const isFavTeam = e => myTeams.length && (e.teams || []).some(t => myTeams.some(f => TM.matchesTeam(f, t))) ? 1 : 0;
  // Muzică: cu „Doar artiști cunoscuți” activ arătăm cel mult 10 carduri, un card per artist, alese după un scor combinat:
  //   - trupa favorită din profil: prima (înaintea oricărui scor);
  //   - țări în care cântă (turneu internațional) – cel mai greu criteriu; concertele dintr-o singură țară intră doar dacă mai rămân locuri;
  //   - capacitatea maximă a sălilor din turneu (aproximativă, assets/venue-capacity.js): artiștii care umplu arene și stadioane urcă;
  //   - numărul de orașe din turneu; la festival, mărimea line-up-ului; popularitatea din baza noastră (rang Ticketmaster) ca departajare.
  // Diversitate: cel mult 2 carduri per oraș și 4 per țară (în afară de favorite). Formațiile tribut nu intră niciodată.
  const MAX_MUSIC = 30; // pagina 1 = top 10, „Arată încă 10” duce mai departe
  const cc = e => String(e.city_id || '').split('_').pop();
  const artistKey = e => norm(e.kind === 'festival' && (e.artists || []).length !== 1 ? e.title : e.artists?.[0] || e.title);
  const isTribute = e => TRIBUTE.test(e.title || '') || (e.artists || []).some(a => TRIBUTE.test(a));
  const reach = new Map(); // artist → { countries, cities, maxCap }
  for (const e of all) if (e.kind === 'concert' || e.kind === 'festival') {
    const k = artistKey(e), r = reach.get(k) || { countries: new Set(), cities: new Set(), maxCap: 0 };
    r.countries.add(cc(e)); r.cities.add(e.city_id); r.maxCap = Math.max(r.maxCap, window.CBVenueCap ? window.CBVenueCap(e.venue) : 1500); reach.set(k, r);
  }
  const musicScore = e => {
    const r = reach.get(artistKey(e)) || { countries: new Set([cc(e)]), cities: new Set([e.city_id]), maxCap: 1500 };
    return Math.min(r.countries.size, 5) * 150 + Math.min(r.cities.size, 6) * 20 + Math.log10(Math.max(r.maxCap, 200)) * 60
      + (e.kind === 'festival' ? Math.min((e.artists || []).length, 10) * 12 : 0) + (e.popularity || 0) * 0.3;
  };
  // Favoritele primele, apoi crescător după prețul zborului; cele fără preț la coadă (în ordinea relevanței/datei).
  const byPrice = list => list.map((e, i) => ({ e, i, f: isFav(e), k: priceKey(e) })).sort((a, b) => (b.f - a.f) || (a.k - b.k || 0) || a.i - b.i).map(x => x.e);
  function topMusic(list) {
    const best = new Map(); // un card per artist: cea mai apropiată dată
    for (const e of list) if (!isTribute(e)) { const k = artistKey(e), cur = best.get(k); if (!cur || e.starts_at < cur.starts_at) best.set(k, e); }
    const ranked = [...best.values()].sort((a, b) => (isFav(b) - isFav(a)) || (musicScore(b) - musicScore(a)) || a.starts_at.localeCompare(b.starts_at));
    const out = [], byCity = {}, byCountry = {};
    for (const e of ranked) {
      if (out.length >= MAX_MUSIC) break;
      if (!isFav(e) && ((byCity[e.city_id] || 0) >= 2 || (byCountry[cc(e)] || 0) >= 4)) continue;
      out.push(e); byCity[e.city_id] = (byCity[e.city_id] || 0) + 1; byCountry[cc(e)] = (byCountry[cc(e)] || 0) + 1;
    }
    return byPrice(out);
  }
  // Interval afișat: de la peste 2 săptămâni (mai poți face un plan) până la ~2 luni. Favoriții (artist/echipă) și evenimentele curatoriate (sport, ex. Six Nations) pot fi și mai departe și urcă primele.
  const MIN_DAYS = 14, MAX_DAYS = 60;
  const MIN_DATE = H.isoAdd(today, MIN_DAYS), MAX_DATE = H.isoAdd(today, MAX_DAYS);
  // Cu cont: sliderul de perioadă (assets/period-slider.js) înlocuiește intervalul fix; implicit tot 14 zile – 2 luni. Favoritele au secțiunea lor și respectă același interval.
  const loggedIn = !!(window.Account && typeof window.Account.hasSession === 'function' && window.Account.hasSession()) && !!window.CBPeriodSlider;
  const period = { from: MIN_DATE, to: MAX_DATE };
  const inRange = loggedIn
    ? e => (E.categoryOf(e) !== 'music' || E.isWeekend(e)) && H.endDate(e) >= period.from && H.startDate(e) <= period.to
    : e => (E.categoryOf(e) !== 'music' || E.isWeekend(e)) && H.endDate(e) >= MIN_DATE && (H.startDate(e) <= MAX_DATE || (e.source === 'curated' && e.kind === 'sport') || isFav(e) || isFavTeam(e));
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
    if (state.tab === 'music' && state.onlyNotable) { runs.clear(); return topMusic(list).map(e => ({ e })); }
    const seen = new Map(), perArtist = new Map();
    runs.clear();
    list = byPrice(list); // favoritele primele, apoi crescător după prețul zborului (la toate taburile); fără preț la coadă
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
  const inTab = () => all.filter(e => E.categoryOf(e) === state.tab).filter(inRange).filter(e => !state.weekend || E.isWeekend(e) || E.ANY_DAY.has(e.competition));
  const bySport = (list, s = state.sport) => state.tab !== 'sport' || s === 'all' ? list : s === 'mine' ? list.filter(isMine) : list.filter(e => sportOf(e) === s);
  // Cheia de competiție: liga, iar la sport fără ligă (ex. baschet din Ticketmaster) sportul însuși.
  const compKey = e => E.inferComp(e) || (state.tab === 'sport' ? `s:${sportOf(e)}` : e.kind);
  const byComp = list => state.comp === 'all' ? list : list.filter(e => compKey(e) === state.comp);
  const base = () => byComp(bySport(inTab()));
  // Importanță = coloana popularity din DB (scor ≥60: meciuri mari, artiști cu turnee mari). Fără orașe de plecare alese afișăm doar ce contează.
  const TOP = 60;
  const noFlight = e => priceState(e).s === 'none';
  const visible = () => {
    let b = base().filter(e => priceState(e).s !== 'unknown'); // fără preț real și fără estimare posibilă (oraș fără coordonate): cardul nu se afișează
    if (state.onlyTop) b = b.filter(e => (e.popularity || 0) >= TOP);
    if (state.onlyFlights) b = b.filter(e => !noFlight(e));
    return state.inBudget && budget ? b.filter(inBudget) : b;
  };

  // ---------- Markup ----------
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  function catsHtml() {
    return `<div class="evp-cats" role="tablist" aria-label="Tip de eveniment">${E.CATEGORIES.map(([k, label]) => {
      const c = all.filter(e => E.categoryOf(e) === k && inRange(e) && (!state.weekend || E.isWeekend(e) || E.ANY_DAY.has(e.competition))).length;
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
    const note = hasMine ? 'Pagina se deschide cu sporturile tale. Le schimbi oricând în Contul tău.' : '<a href="cont.html#interese">Alege-ți sporturile în Contul tău</a> și le punem primele.';
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

  const pages = n => Math.max(1, Math.ceil(n / PAGE));
  function pagerHtml(n) {
    if (n <= PAGE) return '';
    const last = pages(n) - 1;
    return `<nav class="ev-pager" aria-label="Pagini de evenimente"><button type="button" class="ev-arrow" data-page-go="-1" aria-label="Evenimentele anterioare"${state.page <= 0 ? ' disabled' : ''}>‹</button><span>${state.page + 1} / ${last + 1}</span><button type="button" class="ev-arrow" data-page-go="1" aria-label="Următoarele ${PAGE} evenimente"${state.page >= last ? ' disabled' : ''}>›</button></nav>`;
  }
  function render() {
    // Cu filtrul de buget cerem din start prețurile candidaților (cei mai apropiați întâi), în limita Kiwi pe pagină.
    // Cu cont, favoritele (artiști la Muzică, echipe la Sport) sunt într-o secțiune separată, deasupra celorlalte evenimente.
    const favPred = state.tab === 'music' ? isFav : state.tab === 'sport' ? isFavTeam : () => 0;
    const favOn = loggedIn && (state.tab === 'music' ? myArtists.length : state.tab === 'sport' ? myTeams.length : 0) > 0;
    let vis = visible(), favAll = [];
    if (favOn) { favAll = build(vis.filter(favPred)); vis = vis.filter(e => !favPred(e)); }
    const favItems = favAll.slice(0, PAGE);
    const favLater = favOn ? all.filter(e => E.categoryOf(e) === state.tab && favPred(e) && !inRange(e) && H.endDate(e) >= today && (state.tab !== 'music' || E.isWeekend(e))).length : 0;
    const items = build(vis);
    // Cerem întâi prețurile cardurilor care se văd (în ordinea afișării: favoritele, apoi pe dată), nu primele 24 pe dată din tot tab-ul:
    // altfel concertele de peste câteva luni nu apucau niciodată să primească zbor și rămâneau fără rând de preț.
    if ((state.inBudget && budget) || state.onlyFlights) [...favItems, ...items.slice(state.page * PAGE, (state.page + 1) * PAGE)].map(x => x.e).filter(e => priceState(e).s === 'unknown').slice(0, 24).forEach(ask);
    const focused = document.activeElement?.closest?.('[data-tab]')?.dataset.tab;
    root.innerHTML = `
      ${catsHtml()}
      <div class="evp-panel-top">
        ${sportsHtml()}
        ${compsHtml()}
        <div class="evp-switches">
          ${state.tab === 'music' ? sw('onlyNotable', 'Doar artiști cunoscuți <small>top, câte 10</small>', state.onlyNotable) : ''}
          ${hasAirports ? '' : sw('onlyTop', 'Doar cele importante', state.onlyTop)}
          ${sw('inBudget', budget ? `Doar în bugetul meu <small>zbor până la ${budgetText}</small>` : 'Doar în bugetul meu', state.inBudget, !budget)}
          ${budget ? '' : '<a class="evp-note" href="cont.html#preferinte">Setează-ți bugetul în Contul tău →</a>'}
        </div>
        ${flightsStatus()}${budgetStatus()}
      </div>
      <div id="evp-panel" role="tabpanel" aria-labelledby="tab-${state.tab}">
        ${favOn && (favItems.length || favLater) ? `<section class="evp-fav" aria-labelledby="evp-fav-h"><h2 id="evp-fav-h" class="evp-sec-h">★ Favorite</h2>
          ${favItems.length ? `<div class="ev-grid">${favItems.map(x => E.cardHtml(x.e, { tour: tourMore(x.e), runs: 0 })).join('')}</div>` : '<p class="evp-note">Niciun favorit în perioada aleasă.</p>'}
          ${favAll.length > PAGE ? `<p class="evp-note">Ai încă ${favAll.length - PAGE} favorite în perioada aleasă; restrânge perioada ca să le vezi pe toate.</p>` : ''}
          ${favLater ? `<p class="evp-note">Mai ai ${n(favLater, 'favorit', 'favorite')} în afara perioadei alese: mută capetele sliderului.</p>` : ''}</section>
          <h2 class="evp-sec-h">${state.tab === 'music' ? 'Alte concerte și festivaluri' : 'Alte meciuri și curse'}</h2>` : ''}
        ${items.length ? `<div class="ev-grid">${items.slice(state.page * PAGE, (state.page + 1) * PAGE).map(x => E.cardHtml(x.e, { tour: tourMore(x.e), runs: RUN_KINDS.has(x.e.kind) ? (runs.get(runKey(x.e)) || 1) - 1 : 0 })).join('')}</div>` : `<p class="evp-empty">${emptyText()}</p>`}
        ${pagerHtml(items.length)}
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
    if (t) { state.tab = t.dataset.tab; state.comp = 'all'; state.page = 0; const u = new URL(location.href); u.searchParams.set('tab', state.tab); history.replaceState(null, '', u); render(); root.querySelector(`[data-tab="${state.tab}"]`)?.focus(); return; }
    const s = ev.target.closest('[data-sport]'); if (s) { state.sport = s.dataset.sport; state.comp = 'all'; state.page = 0; render(); return; }
    const c = ev.target.closest('[data-comp]'); if (c) { state.comp = c.dataset.comp; state.page = 0; render(); return; }
    const g = ev.target.closest('[data-page-go]'); if (g) { state.page = Math.max(0, state.page + Number(g.dataset.pageGo)); render(); root.querySelector('.ev-grid')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  });
  root.addEventListener('keydown', ev => { // săgeți stânga/dreapta între categorii
    if (!ev.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const keys = E.CATEGORIES.map(([k]) => k), i = keys.indexOf(state.tab);
    root.querySelector(`[data-tab="${keys[(i + (ev.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length]}"]`)?.click();
  });
  root.addEventListener('change', ev => { const o = ev.target.dataset?.opt; if (o) { state[o] = ev.target.checked; state.comp = 'all'; state.page = 0; render(); } });

  if (loggedIn && all.length) {
    const wrap = document.createElement('div'); wrap.className = 'evp-wrap evp-period'; const host = document.createElement('div'); wrap.append(host); root.insertAdjacentElement('beforebegin', wrap);
    const t = CBPeriodSlider.parse(today), add = k => CBPeriodSlider.iso(new Date(t.getTime() + k * 864e5));
    const slider = CBPeriodSlider.create(host, { label: 'Perioada evenimentelor', from: add(MIN_DAYS), to: add(MAX_DAYS), today, onChange: r => { period.from = r.from; period.to = r.to; state.page = 0; render(); } });
    const r0 = slider.range(); period.from = r0.from; period.to = r0.to;
  }
  if (!all.length) { root.innerHTML = '<p class="evp-empty">Nu am putut încărca evenimentele acum. Reîncarcă pagina peste câteva minute.</p>'; return; }
  render();
  if (myArtists.length) loadFavorites();
})();
