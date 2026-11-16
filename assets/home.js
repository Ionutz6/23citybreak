// Home (index.html): „Cele mai ieftine zboruri” (prețuri din tabela route_prices, vezi supabase/SCHEMA.md) și „Weekenduri cu ceva special”
// (evenimente: favoritele din profil primele, apoi aceeași selecție ca pe pagina Evenimente, în următoarele 14–60 de zile).
// Nicio cerere la Kiwi: prețurile sunt citite din baza de date. Fără date, secțiunea de zboruri rămâne ascunsă.
(async () => {
  const E = window.CBEvents, H = E?.helpers;
  const API = E?.api;
  const readLS = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  await window.Account?.syncPrefsToLocal?.().catch?.(() => {});
  const prefs = readLS('23cb-prefs'), interests = readLS('23cb-event-prefs');
  const ORIGINS = { OTP: 'București', BBU: 'București', CLJ: 'Cluj-Napoca', IAS: 'Iași', TSR: 'Timișoara', SBZ: 'Sibiu', BCM: 'Bacău', SCV: 'Suceava', CND: 'Constanța', CRA: 'Craiova', OMR: 'Oradea', TGM: 'Târgu Mureș', VLC: 'Valencia', ALC: 'Alicante', PAR: 'Paris', MUC: 'München', FRA: 'Frankfurt' };
  const first = Array.isArray(prefs.departure_airports) ? prefs.departure_airports[0] : null;
  const profileOrigin = /^[A-Z]{3}$/.test(first || '') ? first : 'OTP';
  let origin = profileOrigin;
  const flightOrigin = () => origin; // aeroportul folosit la zboruri (București dacă aeroportul din profil n-are prețuri)
  const originName = code => ORIGINS[code] || code;

  // ---------- Zboruri ----------
  async function flights() {
    if (!API) return;
    const sec = document.getElementById('home-flights');
    const load = async code => {
      const q = new URLSearchParams({ select: 'dest,out_date,back_date,price_eur,direct,source,seen_at', origin: `eq.${code}`, out_date: `gte.${today}`, order: 'price_eur.asc', limit: '400' });
      q.append('out_date', `lte.${addDays(today, 60)}`);
      try {
        const r = await fetch(`${API.url}/rest/v1/route_prices?${q}`, { headers: { apikey: API.key, Authorization: `Bearer ${API.key}` }, signal: AbortSignal.timeout(10000) });
        return r.ok ? await r.json() : [];
      } catch { return []; }
    };
    let rows = await load(origin);
    // Aeroportul din profil fără prețuri încă (se sincronizează doar câteva): arătăm București, cu mențiune.
    let fellBack = false;
    if (origin !== 'OTP' && rows.length < 3) { origin = 'OTP'; fellBack = true; rows = await load(origin); }
    const now = Date.now();
    const fresh = r => now - Date.parse(r.seen_at) < (r.source === 'visitor' ? 24 : 72) * 36e5;
    // Aceeași rută și dată: prețul văzut de un vizitator (Kiwi, ultimele 24 h) îl înlocuiește pe cel din cache-ul Travelpayouts.
    const byKey = new Map();
    for (const r of rows.filter(fresh)) {
      const k = `${r.dest}|${r.out_date}|${r.back_date}`, cur = byKey.get(k);
      if (!cur || (r.source === 'visitor' && cur.source !== 'visitor')) byKey.set(k, r);
    }
    const bestByDest = new Map();
    for (const r of byKey.values()) {
      const g = window.CB_ILLUSTRATED_GUIDES?.[r.dest];
      if (!g || H.cityOf(r.dest.replace(/^City:/, ''))?.iata === origin) continue; // doar orașele cu ilustrație, fără orașul de plecare
      const cur = bestByDest.get(r.dest);
      if (!cur || r.price_eur < cur.price_eur) bestByDest.set(r.dest, r);
    }
    // Idei de evadare: 3 destinații aleatorii (altele la fiecare reîncărcare) în bugetul din profil (utilizator logat; fără limită dacă e „Oricât”)
    // sau până la 150 € (fără cont). Dacă în buget sunt mai puține de 3, completăm cu cele mai apropiate ca preț, peste buget.
    const logged = !!(await window.Account?.session?.().catch(() => null));
    const profileBudget = Number(prefs.budget_max_eur);
    const cap = logged ? (profileBudget > 0 ? profileBudget : Infinity) : 150;
    const all = [...bestByDest.values()].sort((a, b) => a.price_eur - b.price_eur);
    const pool = all.filter(r => r.price_eur <= cap);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const top = [...pool.slice(0, 3), ...all.filter(r => r.price_eur > cap)].slice(0, 3);
    if (!top.length) return;
    document.getElementById('hf-origin').textContent = originName(origin);
    document.getElementById('hf-grid').innerHTML = top.map(r => {
      const slug = r.dest.replace(/^City:/, ''), g = window.CB_ILLUSTRATED_GUIDES[r.dest], c = H.cityOf(slug);
      const img = `assets/guides-prague-style/800/${g.image}.webp`, img2 = `assets/guides-prague-style/${g.image}.webp`; // a doua e rezerva, dacă lipsește varianta de 800 px
      return `<a class="hm-fl" href="zboruri.html?dest=${encodeURIComponent(r.dest)}#configurator" style="background-image:url('${esc(img)}'),url('${esc(img2)}')" aria-label="${esc(`${g.city || H.cityName(slug)}, de la ${r.price_eur} €`)}"><span class="hm-tag">${r.direct ? 'Direct' : 'Zbor'}</span><div class="hm-in"><div><h3>${esc(g.city || H.cityName(slug))}</h3><small>${c?.country ? `${esc(c.country)} · ` : ''}${esc(H.rangeLabel(r.out_date, r.back_date))}</small></div><div class="hm-price"><b>${r.price_eur} €</b><span>dus-întors / pers.</span></div></div></a>`;
    }).join('');
    document.getElementById('hf-note').textContent = (fellBack ? `Încă nu avem prețuri din ${originName(profileOrigin)}, așa că îți arătăm zborurile din ${originName(origin)}. ` : '') + 'Prețul „de la” e cel mai mic găsit recent; se poate schimba până la rezervare. Verifică-l în căutare.';
    sec.hidden = false;
  }

  // ---------- Evenimente ----------
  // Aceleași reguli ca pe pagina Evenimente (assets/events-page.js): fără tribut-bands, doar muzică „cunoscută”, doar cele importante.
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const TRIBUTE = /\b(ultimate|tribute|tributo|the music of|celebration of|experience|story of|reloaded|symphonic|legacy|plays|performs|revisited)\b/i;
  const STADIUM = /\b(stadion|stadium|stade|stadio|olympi\w*|wembley|park|parc|dome|festival ?(ground|site|area)|messe|open ?air|race ?course|hippodrom\w*)\b/i;
  const TOP = 60;
  const myTeams = (Array.isArray(interests.favorite_teams) ? interests.favorite_teams : []).filter(t => typeof t === 'string' && t.trim().length >= 3).slice(0, 10);
  const myArtists = (Array.isArray(interests.favorite_artists) ? interests.favorite_artists : []).filter(a => typeof a === 'string' && a.trim().length >= 2).slice(0, 10);
  const favNames = myArtists.map(norm).filter(Boolean);
  const isFavArtist = e => !TRIBUTE.test(e.title || '') && favNames.some(f => (e.artists || []).some(a => norm(a) === f && !TRIBUTE.test(a)));
  const isFavTeam = e => myTeams.length && window.CBTeamMatch && (e.teams || []).some(t => myTeams.some(f => window.CBTeamMatch.matchesTeam(f, t)));

  async function events() {
    if (!E) return;
    const all = (await E.load()).filter(e => H.endDate(e) >= today);
    const cc = e => String(e.city_id || '').split('_').pop();
    const reach = new Map();
    for (const e of all) if ((e.kind === 'concert' || e.kind === 'festival') && e.artists?.[0]) {
      const k = norm(e.artists[0]), r = reach.get(k) || { countries: new Set(), cities: new Set() };
      r.countries.add(cc(e)); r.cities.add(e.city_id); reach.set(k, r);
    }
    const isNotable = e => {
      if (e.kind !== 'concert' && e.kind !== 'festival') return true;
      if (TRIBUTE.test(e.title || '') || (e.artists || []).some(a => TRIBUTE.test(a))) return false;
      if (isFavArtist(e) || e.source !== 'ticketmaster') return true;
      if (e.kind === 'festival' && (e.artists || []).length >= 4) return true;
      const r = e.artists?.[0] && reach.get(norm(e.artists[0]));
      return !!(r && (r.countries.size >= 2 || r.cities.size >= 3)) || STADIUM.test(e.venue || '');
    };
    // Doar evenimente de vineri–duminică, fără excepții (nici Champions League sau EuroLeague), în următoarele 14–60 de zile.
    const fav = e => (isFavTeam(e) || isFavArtist(e)) ? 1 : 0;
    const score = e => fav(e) * 1000 + (e.popularity || 0);
    // Candidați: evenimente de weekend, un singur eveniment pe oraș, cei mai importanți 40. Apoi cele mai ieftine 3 după prețul zborului
    // (weekendul evenimentului, vineri → duminică, din route_prices; fără cereri la Kiwi); cele fără preț vin după cele cu preț.
    const dowOf = d => new Date(`${d}T12:00:00Z`).getUTCDay();
    const weekendOf = e => {
      for (let d = H.startDate(e), n = 0; d <= H.endDate(e) && n < 40; d = addDays(d, 1), n++) {
        const w = dowOf(d); if ([5, 6, 0].includes(w)) { const fri = addDays(d, w === 5 ? 0 : w === 6 ? -1 : -2); return { out: fri, back: addDays(fri, 2) }; }
      }
      return null;
    };
    const from = addDays(today, 14), to = addDays(today, 60);
    const ranked = all.filter(e => H.startDate(e) >= from && H.startDate(e) <= to && E.isWeekend(e) && isNotable(e) && (fav(e) || (e.popularity || 0) >= TOP))
      .sort((a, b) => score(b) - score(a) || a.starts_at.localeCompare(b.starts_at));
    const cand = [], seenCity = new Set();
    for (const e of ranked) { if (seenCity.has(e.city_id)) continue; seenCity.add(e.city_id); cand.push(e); if (cand.length >= 40) break; }
    if (!cand.length) return;
    const wk = new Map(cand.map(e => [e.id, weekendOf(e)]));
    let rows = [];
    try {
      const fq = new URLSearchParams({ select: 'dest,out_date,back_date,price_eur,direct,source,seen_at', origin: `eq.${flightOrigin()}`, dest: `in.(${[...seenCity].map(c => `City:${c}`).join(',')})`, out_date: `in.(${[...new Set([...wk.values()].filter(Boolean).map(w => w.out))].join(',')})`, limit: '1000' });
      const r = await fetch(`${API.url}/rest/v1/route_prices?${fq}`, { headers: { apikey: API.key, Authorization: `Bearer ${API.key}` }, signal: AbortSignal.timeout(10000) });
      if (r.ok) rows = (await r.json()).filter(x => Date.now() - Date.parse(x.seen_at) < (x.source === 'visitor' ? 24 : 72) * 36e5);
    } catch {}
    const priceOf = e => {
      const w = wk.get(e.id);
      const c = w ? rows.filter(x => x.dest === `City:${e.city_id}` && x.out_date === w.out && x.back_date === w.back) : [];
      return c.length ? c.reduce((a, b) => (b.source === 'visitor' && a.source !== 'visitor') || (b.source === a.source && b.price_eur < a.price_eur) ? b : a) : null;
    };
    const priced = cand.map((e, i) => ({ e, i, p: priceOf(e), est: E.estimateFlight(e.city_id, flightOrigin()) }))
      .filter(x => x.p || x.est) // fără preț real și fără estimare posibilă: cardul nu se afișează
      .sort((a, b) => (a.p ? 0 : 1) - (b.p ? 0 : 1) || (a.p ? a.p.price_eur : a.est) - (b.p ? b.p.price_eur : b.est) || a.i - b.i); // prețurile reale primele, estimările după
    const picked = [], cats = {};
    for (const x of priced) { // cel mult 2 din aceeași categorie, ca vitrina să nu fie 3 meciuri
      const cat = E.categoryOf(x.e);
      if ((cats[cat] || 0) >= 2) continue;
      picked.push(x); cats[cat] = (cats[cat] || 0) + 1;
      if (picked.length === 3) break;
    }
    const grid = document.getElementById('he-grid');
    grid.innerHTML = picked.map(({ e, p, est }) => E.cardHtml(e, p ? { flight: { eur: p.price_eur, origin: originName(flightOrigin()), label: H.rangeLabel(p.out_date, p.back_date), note: p.direct ? 'direct' : '' } } : { flight: { eur: est, est: true, origin: originName(flightOrigin()), label: wk.get(e.id) ? H.rangeLabel(wk.get(e.id).out, wk.get(e.id).back) : '' } })).join('');
    grid.querySelectorAll('.ev-card[data-ev]').forEach(card => { // imaginea evenimentului ca pe pagina Evenimente, nu ilustrația orașului
      const x = picked.find(y => y.e.id === card.dataset.ev);
      if (x) E.eventPhoto(x.e).then(ph => E.setBg(card, ph)).catch(() => {});
    });
    grid.querySelectorAll('.ev-flight:empty').forEach(n => n.remove());
    document.getElementById('he-sub').textContent = 'Cele mai ieftine zboruri spre evenimentele din următoarele 2 luni, vineri–duminică.';
    document.getElementById('home-events').hidden = false;
  }

  // ---------- Banner „Orașe vizitate”: pentru utilizatorul logat, nivelul de călător și un text pe nivel ----------
  const LEVELS = [
    [0, 'Abia pornești la drum', 'Prima bifă te așteaptă. Alege un oraș în care ai fost și harta prinde viață.'],
    [1, 'Turist curios', 'Ai început colecția. Un weekend în plus și ajungi la nivelul următor.'],
    [5, 'Călător de weekend', 'Weekendurile tale au deja o hartă. Ține ritmul: următorul oraș e la un zbor distanță.'],
    [12, 'Explorator', 'Te-ai ales cu o hartă serioasă. Acum merită și orașele mai puțin bătătorite.'],
    [25, 'Colecționar de orașe', 'Peste jumătate din drum spre top. Fiecare oraș nou contează.'],
    [45, 'Globetrotter', 'Puțini ajung aici. Mai ai doar colțurile ascunse ale Europei.'],
    [75, 'Cetățean al Europei', 'Ai văzut aproape tot. Ești referința pentru weekendul altora.'],
  ];
  async function visitedBanner() {
    const A = window.Account;
    const session = A ? await A.session().catch(() => null) : null;
    if (!session) return;
    const sb = await A.client();
    const { data, error } = await sb.from('visited_cities').select('city_id');
    if (error || !Array.isArray(data)) return;
    const n = data.length;
    let i = 0; while (i + 1 < LEVELS.length && n >= LEVELS[i + 1][0]) i++;
    const [from, name, text] = LEVELS[i], next = LEVELS[i + 1];
    const $ = id => document.getElementById(id);
    $('hc-kick').textContent = `Nivel ${i + 1} · ${name}`;
    $('hc-title').innerHTML = `Ai vizitat <em>${n === 1 ? '1 oraș european' : `${n} ${n % 100 >= 20 || n % 100 === 0 ? 'de ' : ''}orașe europene`}</em>`;
    $('hc-text').textContent = text;
    $('hc-prog').querySelector('s').style.setProperty('--pct', `${next ? Math.round(100 * (n - from) / (next[0] - from)) : 100}%`);
    $('hc-prog-text').textContent = next ? `Încă ${next[0] - n} ${next[0] - n === 1 ? 'oraș' : 'orașe'} până la „${next[1]}”` : 'Ai atins cel mai înalt nivel';
    $('hc-main').textContent = 'Bifează orașe noi →';
  }

  flights().catch(() => {});
  events().catch(() => {});
  visitedBanner().catch(() => {});
})();
