// Evenimente la dată fixă (concerte, meciuri, festivaluri) legate de weekendurile din căutare.
//   window.CBEvents.load()               → Promise<eveniment[]> (tabela publică `events`, vezi supabase/SCHEMA.md)
//   window.CBEvents.decorateCards(grid)  → apelat din renderCardsView(): badge pe cardurile de oraș
//   window.CBEvents.promos()            → Promise<eveniment[]>: promo pentru caruselul de pe prima pagină
//   window.CBEvents.cardHtml(e)          → cardul unui eveniment (folosit de evenimente.html, assets/events-page.js)
// Datele vin din Supabase prin REST, doar citire, fără cont. Dacă tabela e goală sau lipsește, nu apare nimic.
// Test fără bază de date: ?evenimente-demo=1 încarcă data/evenimente-demo.json (evenimente inventate).
(() => {
  const SUPABASE_URL = 'https://lsudthnrumslfscpppix.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdWR0aG5ydW1zbGZzY3BwcGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODY2MDEsImV4cCI6MjEwOTk2MjYwMX0.aw6KKBRKMdkfiAbzkHKUlpP2cuHhN-gF-GiUT5zHq5Y';
  const DEMO = new URLSearchParams(location.search).has('evenimente-demo');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugOf = id => String(id || '').replace(/^City:/, '');

  const KINDS = {
    concert: ['🎵', 'Concert'], festival: ['🎪', 'Festival'], football: ['⚽', 'Fotbal'], sport: ['🏟', 'Sport'],
    market: ['🎄', 'Târg'], city_festival: ['🎉', 'Sărbătoare de oraș'], theatre: ['🎭', 'Spectacol'], comedy: ['🎤', 'Stand-up'], other: ['✨', 'Eveniment'],
  };
  const COMPETITIONS = { '6N': 'Six Nations', CL: 'Champions League', PL: 'Premier League', PD: 'La Liga', SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1', DED: 'Eredivisie', PPL: 'Primeira Liga' };

  const cities = () => window.CB_EUROPE_CITIES || [];
  const cityOf = slug => cities().find(c => slugOf(c.id) === slug);
  const cityName = slug => cityOf(slug)?.name || slug.split('_')[0].replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
  const guideOf = slug => (window.CB_ILLUSTRATED_GUIDES || {})[`City:${slug}`];
  const guideImage = slug => { const g = guideOf(slug); return g ? `assets/guides-prague-style/${g.image}.${g.extension || 'png'}` : ''; };

  // ---------- Fotografii ----------
  // Bannerul unui eveniment: imaginea evenimentului de la Ticketmaster (hotlink, cum o dă API-ul), altfel fotografia
  // orașului de pe Wikimedia Commons, aceeași sursă ca pe cardurile de oraș din căutare (cu autor și licență).
  const photoCache = new Map();
  const getJson = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); return r.ok ? r.json() : null; };
  // Fișier Commons → URL lățime 1600 + credit (autor · licență); null dacă lipsește autorul sau licența.
  async function commonsPhoto(file) {
    if (!file) return null;
    const q = new URLSearchParams({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1600', format: 'json', origin: '*' });
    const info = Object.values((await getJson(`https://commons.wikimedia.org/w/api.php?${q}`))?.query?.pages || {})[0]?.imageinfo?.[0];
    const meta = info?.extmetadata;
    const text = h => new DOMParser().parseFromString(h || '', 'text/html').body.textContent.trim();
    const author = text(meta?.Artist?.value), license = text(meta?.LicenseShortName?.value);
    const url = info?.thumburl || info?.url;
    if (!url || !author || !license || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url) || !/^https:\/\/commons\.wikimedia\.org\//.test(info.descriptionurl || '')) return null;
    return { url, credit: `Foto: ${author} · ${license}`, creditUrl: info.descriptionurl };
  }
  function cityPhoto(slug) {
    if (!photoCache.has(slug)) photoCache.set(slug, (async () => {
      const m = /^([a-z0-9-]+)_[a-z]{2}$/.exec(slug || ''); if (!m) return null;
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(m[1].replace(/-/g, '_'))}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const art = await r.json();
      if (art.type !== 'standard' || !art.coordinates || !art.originalimage?.source) return null;
      const thumb = new URL(art.thumbnail?.source || art.originalimage.source);
      if (thumb.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(thumb.hostname) || !thumb.pathname.startsWith('/wikipedia/commons/')) return null;
      const parts = thumb.pathname.split('/');
      return commonsPhoto(decodeURIComponent(thumb.pathname.includes('/thumb/') ? parts[parts.length - 2] : parts[parts.length - 1]));
    })().catch(() => null).then(v => { if (!v) photoCache.delete(slug); return v; }));
    return photoCache.get(slug);
  }
  // Meciuri: fotografia stadionului echipei gazdă (Wikidata: club → P115 „home venue” → P18 imagine → Commons).
  // Fără stemă sau poze de agenție; dacă nu găsim nimic, rămâne fotografia orașului.
  const WD = 'https://www.wikidata.org/w/api.php';
  const wd = params => getJson(`${WD}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`);
  const ids = (claims, p) => (claims?.[p] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
  // Club de fotbal: „sport” (P641) = fotbal (Q2736) sau „instanță a” (P31) = club de fotbal (Q476028); exclude baschet/handbal.
  const isFootball = c => ids(c, 'P641').includes('Q2736') || ids(c, 'P31').includes('Q476028');
  function currentVenue(claims) {
    const st = (claims?.P115 || []).filter(c => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value?.id);
    const open = st.filter(c => !c.qualifiers?.P582);
    return (st.find(c => c.rank === 'preferred') || open[open.length - 1] || st[st.length - 1])?.mainsnak.datavalue.value.id || null;
  }
  const stadiumCache = new Map();
  function stadiumPhoto(team) {
    const key = String(team || '').trim();
    if (!key) return Promise.resolve(null);
    if (!stadiumCache.has(key)) stadiumCache.set(key, (async () => {
      const found = await wd({ action: 'wbsearchentities', search: key, language: 'en', type: 'item', limit: '7' });
      const cand = (found?.search || []).map(x => x.id).filter(id => /^Q\d+$/.test(id));
      if (!cand.length) return null;
      const ents = (await wd({ action: 'wbgetentities', ids: cand.join('|'), props: 'claims' }))?.entities || {};
      const club = cand.map(id => ents[id]).find(e => e?.claims && isFootball(e.claims) && currentVenue(e.claims));
      const venueId = club && currentVenue(club.claims);
      if (!venueId) return null;
      const v = (await wd({ action: 'wbgetentities', ids: venueId, props: 'claims|labels', languages: 'en' }))?.entities?.[venueId];
      const file = v?.claims?.P18?.find(c => c.rank === 'preferred')?.mainsnak?.datavalue?.value || v?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      const photo = await commonsPhoto(file);
      return photo && { ...photo, venue: v.labels?.en?.value || null };
    })().catch(() => null).then(v => { if (!v) stadiumCache.delete(key); return v; }));
    return stadiumCache.get(key);
  }
  // Alte sporturi (ex. rugby din lista curatoriată): fotografia stadionului după nume (Wikidata → P18 → Commons).
  const venueCache = new Map();
  function venuePhoto(venue) {
    const key = String(venue || '').trim();
    if (!key) return Promise.resolve(null);
    if (!venueCache.has(key)) venueCache.set(key, (async () => {
      const found = await wd({ action: 'wbsearchentities', search: key, language: 'en', type: 'item', limit: '5' });
      const cand = (found?.search || []).map(x => x.id).filter(id => /^Q\d+$/.test(id));
      if (!cand.length) return null;
      const ents = (await wd({ action: 'wbgetentities', ids: cand.join('|'), props: 'claims' }))?.entities || {};
      const v = cand.map(id => ents[id]).find(e => e?.claims?.P18 && e.claims.P625); // are imagine și coordonate = un loc, nu o echipă
      const file = v?.claims.P18.find(c => c.rank === 'preferred')?.mainsnak?.datavalue?.value || v?.claims.P18[0]?.mainsnak?.datavalue?.value;
      return commonsPhoto(file);
    })().catch(() => null).then(x => { if (!x) venueCache.delete(key); return x; }));
    return venueCache.get(key);
  }
  const eventPhoto = async e => {
    if (e.image_url) return { url: e.image_url, credit: 'Imagine: Ticketmaster', creditUrl: e.ticket_url || '' };
    if (e.kind === 'football' && e.teams?.[0]) { const p = await stadiumPhoto(e.teams[0]); if (p) return p; }
    if (e.kind === 'sport' && e.venue) { const p = await venuePhoto(e.venue); if (p) return p; }
    return cityPhoto(e.city_id);
  };
  const setBg = (node, photo) => { if (node && photo?.url) node.style.backgroundImage = `url("${photo.url.replace(/["\\]/g, '')}")`; };

  // ---------- Date ----------
  const DOW = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
  const DOW_LONG = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const MON = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const TZ = { gb: 'Europe/London', ie: 'Europe/Dublin', pt: 'Europe/Lisbon', gr: 'Europe/Athens', fi: 'Europe/Helsinki', ro: 'Europe/Bucharest' };
  const tzOf = slug => TZ[slug.slice(-2)] || 'Europe/Berlin';
  // Data și ora locală a orașului pentru un moment UTC.
  const local = (iso, slug) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tzOf(slug), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  };
  const isoAdd = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dowOf = d => new Date(`${d}T12:00:00Z`).getUTCDay();
  const shortDate = d => `${DOW[dowOf(d)]} ${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}`;
  // „20–22 nov” (sau „30 ian–1 feb” când trece în altă lună)
  const rangeLabel = (a, b) => a.slice(5, 7) === b.slice(5, 7) ? `${+a.slice(8)}–${+b.slice(8)} ${MON[+b.slice(5, 7) - 1]}` : `${+a.slice(8)} ${MON[+a.slice(5, 7) - 1]}–${+b.slice(8)} ${MON[+b.slice(5, 7) - 1]}`;
  const longDate = d => `${DOW_LONG[dowOf(d)]} ${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}`;
  const startDate = e => local(e.starts_at, e.city_id).date;
  const endDate = e => (e.ends_at ? local(e.ends_at, e.city_id).date : startDate(e));
  const isMultiDay = e => endDate(e) > startDate(e);
  const lengthDays = e => Math.round((new Date(endDate(e)) - new Date(startDate(e))) / 864e5) + 1;
  // Vinerea și duminica weekendului în care cade o zi.
  const weekendOf = d => { const w = dowOf(d); const fri = isoAdd(d, w === 0 ? -2 : 5 - w); return { fri, sun: isoAdd(fri, 2) }; };
  // Weekendul recomandat: cel al evenimentului; la evenimente lungi, primul weekend complet din interval (sau cel de început).
  const mainWeekend = e => {
    const s = startDate(e), en = endDate(e);
    if (!isMultiDay(e)) return weekendOf(s);
    for (let d = s; d <= en; d = isoAdd(d, 1)) if (dowOf(d) === 6) return weekendOf(d);
    return weekendOf(s);
  };
  // Regula orei: zborul de dus aterizează cu cel puțin 4 h înainte de start (altfel venim cu o zi mai devreme, dacă ar trebui
  // să aterizăm înainte de 08:00), iar cel de întors pleacă la cel puțin 3 h după final (meci 2 h, restul 3 h); dacă asta
  // cade după 22:30, plecăm a doua zi. Festivalurile pe mai multe zile și evenimentele fără oră anunțată rămân pe zilele standard.
  const hm = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const fmtT = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const timing = e => {
    if (e.time_tbc || isMultiDay(e)) return null;
    const s = startDate(e), st = hm(local(e.starts_at, e.city_id).time);
    const arrMin = st - 240, dep = st + (e.kind === 'football' ? 120 : 180) + 180;
    const depDate = isoAdd(s, Math.floor(dep / 1440)), depT = dep % 1440;
    return { s, arrMin, depT, outNeeded: arrMin < 480 ? isoAdd(s, -1) : s, backNeeded: depT >= 1350 ? isoAdd(depDate, 1) : depDate };
  };
  // Ce impune ora evenimentului pentru zilele alese: aterizare până la / decolare după (doar în ziua evenimentului),
  // plus semnalele „ajungi prea târziu” / „pleci prea devreme”.
  const flightRules = (e, out, back) => {
    const tm = timing(e);
    if (!tm) return { arriveBy: null, departAfter: null, outIssue: false, backIssue: false, tbc: !!e.time_tbc && !isMultiDay(e) };
    return {
      arriveBy: out === tm.s && tm.outNeeded === tm.s ? fmtT(tm.arrMin) : null,
      departAfter: back === tm.s && tm.backNeeded === tm.s ? fmtT(tm.depT) : null,
      outIssue: out > tm.outNeeded, backIssue: back < tm.backNeeded, tbc: false,
    };
  };
  // Zilele recomandate de zbor (vineri–duminică, mutate după oră) și regulile lor.
  const tripPlan = e => {
    const wk = mainWeekend(e), tm = timing(e);
    let out = wk.fri, back = wk.sun;
    if (tm) {
      const dw = dowOf(tm.s);
      if (dw >= 1 && dw <= 4) { out = tm.outNeeded; back = tm.backNeeded; }
      else {
        if (out > tm.outNeeded) out = tm.outNeeded;
        if (back < tm.backNeeded) { back = tm.backNeeded; out = [tm.outNeeded, [wk.fri, isoAdd(back, -2)].sort().pop()].sort()[0]; }
      }
    }
    return { out, back, ...flightRules(e, out, back) };
  };
  const whenLabel = e => {
    const s = startDate(e);
    if (isMultiDay(e)) { const en = endDate(e); return s.slice(0, 7) === en.slice(0, 7) ? `${+s.slice(8)}–${+en.slice(8)} ${MON[+s.slice(5, 7) - 1]}` : `${+s.slice(8)} ${MON[+s.slice(5, 7) - 1]} – ${+en.slice(8)} ${MON[+en.slice(5, 7) - 1]}`; }
    return `${longDate(s)}${e.time_tbc ? ', ora se anunță' : `, ${local(e.starts_at, e.city_id).time}`}`;
  };
  const MONTHS_LONG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthName = e => MONTHS_LONG[+startDate(e).slice(5, 7) - 1];
  // Prinde un weekend (vineri, sâmbătă sau duminică); evenimentele pe mai multe zile trec dacă includ o astfel de zi.
  const isWeekend = e => { for (let d = startDate(e), en = endDate(e), n = 0; d <= en && n < 40; d = isoAdd(d, 1), n++) if ([5, 6, 0].includes(dowOf(d))) return true; return false; };
  // Tab-urile paginii Evenimente. Festivalurile (Ticketmaster le clasifică la muzică) stau la Muzică.
  const CATEGORIES = [['sport', 'Sport'], ['music', 'Muzică'], ['other', 'Alte evenimente']];
  const categoryOf = e => e.kind === 'football' || e.kind === 'sport' ? 'sport' : e.kind === 'concert' || e.kind === 'festival' ? 'music' : 'other';
  // Sportul unui eveniment (fotbal din football-data; rugby, baschet etc. din lista curatoriată sau Ticketmaster).
  const SPORTS = { football: ['⚽', 'Fotbal'], rugby: ['🏉', 'Rugby'], basketball: ['🏀', 'Baschet'], tennis: ['🎾', 'Tenis'], f1: ['🏎️', 'Formula 1'], motogp: ['🏍️', 'MotoGP'], running: ['🏃', 'Maratoane'], other: ['🏟️', 'Sport'] };
  const sportOf = e => {
    if (e.kind === 'football') return 'football';
    const t = `${(e.genres || []).join(' ')} ${e.title} ${e.competition || ''}`;
    if (e.competition === '6N' || /rugby/i.test(t)) return 'rugby';
    if (/basket/i.test(t)) return 'basketball';
    if (/tenis|tennis/i.test(t)) return 'tennis';
    if (/moto ?gp/i.test(t)) return 'motogp';
    if (/formula ?1|\bf1\b|grand prix/i.test(t)) return 'f1';
    if (/marat|marathon|running/i.test(t)) return 'running';
    return 'other';
  };
  // Eticheta cardului: la sport numele sportului și liga („⚽ Fotbal · Serie A”, „🏉 Rugby · Six Nations”).
  const tagLabel = e => {
    const isSport = e.kind === 'football' || e.kind === 'sport';
    const [icon, name] = isSport ? SPORTS[sportOf(e)] : KINDS[e.kind] || KINDS.other;
    const comp = isSport && COMPETITIONS[e.competition] ? ` · ${COMPETITIONS[e.competition]}` : '';
    return `${icon} ${name}${comp}${isMultiDay(e) ? ` · ${lengthDays(e)} zile` : ''}`;
  };
  const packageUrl = e => `weekend.html?e=${encodeURIComponent(e.id)}${DEMO ? '&evenimente-demo=1' : ''}`;

  // ---------- Încărcare ----------
  let loading;
  const load = () => loading ||= (async () => {
    try {
      if (DEMO) return (await (await fetch('data/evenimente-demo.json')).json()).events;
      const since = new Date(Date.now() - 864e5).toISOString();
      // Pagini de câte 1000 (maximul pe cerere al API-ului), ca lista să nu se taie când cresc sursele de evenimente.
      const rows = [], PAGE_SIZE = 1000;
      for (let offset = 0; offset < 5 * PAGE_SIZE; offset += PAGE_SIZE) {
        const q = new URLSearchParams({ select: '*', or: `(starts_at.gte.${since},ends_at.gte.${since})`, order: 'popularity.desc,starts_at.asc,id.asc', limit: String(PAGE_SIZE), offset: String(offset) });
        const res = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
        if (!res.ok) break;
        const page = await res.json();
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      return rows;
    } catch { return []; }
  })();
  const byId = async id => (await load()).find(e => e.id === id) || null;

  // ---------- Secțiunea de pe pagina principală ----------
  function cardHtml(e) {
    const img = e.image_url || '';
    const wk = mainWeekend(e);
    const price = e.price_min_eur ? `<div class="ev-ticket">🎟 bilet de la <b>${Math.round(e.price_min_eur)} €</b></div>` : '';
    const note = e.kind === 'market' || e.kind === 'city_festival' ? 'intrare liberă' : '';
    const c = cityOf(e.city_id), act = isMultiDay(e) ? 'Alege zilele' : 'Vezi pachetul';
    // Tot chenarul negru e link spre pachet; săgeata rotundă e doar semnul vizual că se apasă.
    return `<article class="ev-card" data-ev="${esc(e.id)}"${img ? ` style="background-image:url('${esc(img)}')"` : ''}>
      <div class="ev-top"><span class="ev-tag">${esc(tagLabel(e))}</span></div>
      <a class="ev-body" href="${esc(packageUrl(e))}" aria-label="${esc(`${act}: ${e.title.replace(/ \(rugby\)$/, '')}, ${cityName(e.city_id)}`)}">
        <span class="ev-go" aria-hidden="true">→</span>
        <span class="ev-where">${c?.flag ? `<i aria-hidden="true">${c.flag}</i> ` : '📍 '}${esc(cityName(e.city_id))}${c?.country ? ` · ${esc(c.country)}` : ''}</span>
        <h3>${esc(e.title.replace(/ \(rugby\)$/, ''))}</h3>
        <div class="ev-meta">${e.venue ? `${esc(e.venue)} · ` : ''}${esc(whenLabel(e))}</div>
        ${isMultiDay(e) ? `<div class="ev-meta">📅 weekendul recomandat: ${esc(shortDate(wk.fri))} → ${esc(shortDate(wk.sun))}</div>` : ''}
        ${price}${note ? `<div class="ev-meta">${esc(note)}</div>` : ''}
        <div class="ev-flight" data-flight="${esc(e.id)}" aria-live="polite"></div>
      </a></article>`;
  }

  // Promo pentru caruselul de pe prima pagină: întâi sportul, apoi restul; doar ce începe peste 2–13 săptămâni
  // (nici mâine, nici peste 8 luni), ordonat după importanță; cel mult un eveniment pe oraș, maxim 5.
  async function promos() {
    const from = isoAdd(new Date().toISOString().slice(0, 10), 14), to = isoAdd(from, 78);
    const list = (await load()).filter(e => startDate(e) >= from && startDate(e) <= to && (e.popularity || 0) >= 60);
    const rank = e => (categoryOf(e) === 'sport' ? 1000 : 0) + (e.popularity || 0);
    const seen = new Set();
    return list.sort((a, b) => rank(b) - rank(a) || a.starts_at.localeCompare(b.starts_at))
      .filter(e => !seen.has(e.city_id) && seen.add(e.city_id)).slice(0, 5);
  }

  // ---------- Badge pe cardurile de oraș din rezultate ----------
  let cache = [];
  load().then(list => { cache = list; const grid = document.getElementById('cards-grid'); if (grid && list.length) decorateCards(grid); });
  function tripOf(wkId) {
    const m = /^similar:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(wkId || '');
    if (m) return { out: m[1], back: m[2] };
    try {
      const wk = (typeof ALL_WEEKENDS !== 'undefined' ? ALL_WEEKENDS : []).find(w => w.id === wkId);
      if (!wk) return null;
      const d = typeof getTripDates === 'function' ? getTripDates(wk) : { dateOut: wk.fri, dateIn: wk.sun };
      return { out: d.dateOut, back: d.dateIn };
    } catch { return null; }
  }
  function decorateCards(grid) {
    if (!cache.length) return;
    grid.querySelectorAll('[data-city-id]').forEach(card => {
      card.querySelector('.ev-badge')?.remove();
      const slug = slugOf(card.dataset.cityId), trip = tripOf(card.dataset.wkId);
      if (!slug || !trip) return;
      const hits = cache.filter(e => e.city_id === slug && startDate(e) <= trip.back && endDate(e) >= trip.out);
      if (!hits.length) return;
      const e = hits[0], [icon] = KINDS[e.kind] || KINDS.other;
      const a = document.createElement('a');
      a.className = 'ev-badge'; a.href = packageUrl(e);
      a.innerHTML = `<span aria-hidden="true">${icon}</span><span>${isMultiDay(e) ? '' : `${esc(DOW_LONG[dowOf(startDate(e))].replace(/^./, c => c.toUpperCase()))}: `}<b>${esc(e.title)}</b>${hits.length > 1 ? ` și încă ${hits.length - 1}` : ''} · vezi pachetul →</span>`;
      card.prepend(a);
    });
  }

  window.CBEvents = { api: { url: SUPABASE_URL, key: SUPABASE_KEY }, load, byId, promos, cardHtml, packageUrl, decorateCards, eventPhoto, cityPhoto, stadiumPhoto, venuePhoto, setBg, KINDS, COMPETITIONS, CATEGORIES, SPORTS, categoryOf, sportOf, isWeekend, helpers: { rangeLabel, esc, cityName, cityOf, guideOf, guideImage, local, isoAdd, dowOf, shortDate, longDate, startDate, endDate, isMultiDay, lengthDays, mainWeekend, tripPlan, flightRules, whenLabel, tagLabel, monthName, DOW, DOW_LONG, MON } };
})();
