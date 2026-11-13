// Harness comun pentru testele QA 23citybreak.
// Tot ce iese din localhost e interceptat: Kiwi și Supabase sunt simulate, restul (fonturi, Wikipedia, Google,
// Travelpayouts) e blocat. Niciun test nu atinge producția și nu trimite emailuri.
const fs = require('fs');
const path = require('path');

const SB_BUNDLE = fs.readFileSync(path.join(__dirname, 'supabase-esm.js'), 'utf8');
const SB_HOST = 'lsudthnrumslfscpppix.supabase.co';
const TOKEN_KEY = 'sb-lsudthnrumslfscpppix-auth-token';
const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'qa.tester@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-11-01T10:00:00Z' };

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
// Vinerea celui de-al n-lea weekend de acum (n = 0: prima vineri care urmează, cum o calculează site-ul).
function friday(n = 0) {
  const now = new Date();
  let d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  while (d.getUTCDay() !== 5) d = addDays(d, 1);
  return addDays(d, 7 * n);
}

// ---------- Kiwi ----------
const CITY = {
  'City:rome_it': { code: 'FCO', name: 'Rome', cc: 'IT', slug: 'leonardo-da-vinci-fiumicino-rome-italy' },
  'City:prague_cz': { code: 'PRG', name: 'Prague', cc: 'CZ', slug: 'vaclav-havel-airport-prague-prague-czechia' },
  'City:vienna_at': { code: 'VIE', name: 'Vienna', cc: 'AT', slug: 'vienna-international-airport-vienna-austria' },
  'City:london_gb': { code: 'LTN', name: 'London', cc: 'GB', slug: 'luton-london-united-kingdom' },
  'City:bucharest_ro': { code: 'OTP', name: 'Bucharest', cc: 'RO', slug: 'henri-coanda-international-bucharest-romania' },
  'City:cluj-napoca_ro': { code: 'CLJ', name: 'Cluj-Napoca', cc: 'RO', slug: 'cluj-napoca-international-airport-cluj-napoca-romania' },
  'City:cairo_eg': { code: 'CAI', name: 'Cairo', cc: 'EG', slug: 'cairo-international-cairo-egypt' },
  'City:laquila_it': { code: 'QAQ', name: "L'Aquila", cc: 'IT', slug: 'laquila-italy' },
};
const station = id => { const c = CITY[id] || { code: 'XXX', name: id.replace(/^City:/, '').split('_')[0], cc: (id.split('_')[1] || 'xx').toUpperCase(), slug: 'x' }; return { code: c.code, slugEn: c.slug, city: { id, name: c.name, country: { code: c.cc } } }; };
const seg = (from, to, dep, arr, carrier = 'W4') => ({ segment: { code: `${carrier}123`, source: { localTime: dep, station: station(from) }, destination: { localTime: arr, station: station(to) }, carrier: { name: carrier, code: carrier } } });
function ret({ from = 'City:bucharest_ro', to, out, back, price = 89, outDep = '19:30', outArr = '21:00', inDep = '18:00', inArr = '22:30', durMin = 150, carrier = 'W4', via = null, inArrNextDay = false, outArrNextDay = false }) {
  const nextDay = d => iso(addDays(new Date(`${d}T12:00:00Z`), 1));
  const oSegs = via ? [seg(from, via, `${out}T${outDep}:00`, `${out}T20:00:00`, carrier), seg(via, to, `${out}T20:40:00`, `${outArrNextDay ? nextDay(out) : out}T${outArr}:00`, carrier)] : [seg(from, to, `${out}T${outDep}:00`, `${outArrNextDay ? nextDay(out) : out}T${outArr}:00`, carrier)];
  return { id: `it-${to}-${out}-${price}`, priceEur: { amount: String(price) }, bookingOptions: { edges: [] }, outbound: { duration: durMin * 60, sectorSegments: oSegs }, inbound: { duration: durMin * 60, sectorSegments: [seg(to, from, `${back}T${inDep}:00`, `${inArrNextDay ? nextDay(back) : back}T${inArr}:00`, carrier)] } };
}
const oneway = ({ from = 'City:bucharest_ro', to, out, durMin = 150 }) => ({ sector: { duration: durMin * 60, sectorSegments: [seg(from, to, `${out}T19:30:00`, `${out}T21:00:00`)] } });

// Răspunsul implicit: căutare țintită → un zbor direct de 89 € pe weekend; descoperire → Roma, Praga, Viena.
function defaultKiwi(body) {
  const v = body.variables, it = v.search.itinerary;
  const out = it.outboundDepartureDate.start.slice(0, 10);
  const from = it.source.ids[0];
  if (/onewayItineraries/.test(body.query)) return { data: { onewayItineraries: { itineraries: ['City:rome_it', 'City:prague_cz', 'City:vienna_at'].map(to => oneway({ from, to, out })) } } };
  const back = it.inboundDepartureDate.start.slice(0, 10);
  const dests = it.destination.ids;
  const prices = { 'City:rome_it': 89, 'City:prague_cz': 64, 'City:vienna_at': 120 };
  return { data: { returnItineraries: { itineraries: dests.filter(d => d.startsWith('City:')).map(to => ret({ from, to, out, back, price: prices[to] || 99 })) } } };
}

// ---------- Evenimente ----------
const at = (d, hm) => `${iso(d)}T${hm}:00Z`;
function sampleEvents() {
  const f3 = friday(3), f4 = friday(4), f5 = friday(5), f6 = friday(6);
  const base = { venue: null, ends_at: null, time_tbc: false, artists: [], teams: [], genres: [], competition: null, price_min_eur: null, ticket_url: null, image_url: null, popularity: 50, source: 'curated' };
  return [
    { ...base, id: 'fd:1', kind: 'football', title: 'AS Roma – Juventus FC', city_id: 'rome_it', starts_at: at(addDays(f3, 1), '19:45'), teams: ['AS Roma', 'Juventus FC'], competition: 'SA', popularity: 90, source: 'football-data' },
    { ...base, id: 'fd:2', kind: 'football', title: 'Real Madrid CF – FC Barcelona', city_id: 'madrid_es', starts_at: at(addDays(f4, 2), '20:00'), teams: ['Real Madrid CF', 'FC Barcelona'], competition: 'PD', popularity: 99, source: 'football-data' },
    { ...base, id: 'fd:3', kind: 'football', title: 'FC Bayern München – Borussia Dortmund', city_id: 'munich_de', starts_at: at(addDays(f3, 4), '19:30'), teams: ['FC Bayern München', 'Borussia Dortmund'], competition: 'BL1', popularity: 95, source: 'football-data' },
    { ...base, id: 'tm:1', kind: 'concert', title: 'Coldplay: Music of the Spheres', city_id: 'vienna_at', venue: 'Ernst-Happel-Stadion', starts_at: at(addDays(f4, 1), '19:00'), artists: ['Coldplay'], genres: ['pop'], price_min_eur: 79.5, ticket_url: 'https://www.ticketmaster.at/event/1', image_url: 'https://s1.ticketm.net/img/coldplay.jpg', popularity: 92, source: 'ticketmaster' },
    { ...base, id: 'tm:2', kind: 'concert', title: 'Coldplay: Music of the Spheres', city_id: 'prague_cz', venue: 'O2 Arena', starts_at: at(addDays(f5, 1), '19:00'), artists: ['Coldplay'], genres: ['pop'], price_min_eur: 65, ticket_url: 'https://www.ticketmaster.cz/event/2', popularity: 88, source: 'ticketmaster' },
    { ...base, id: 'tm:3', kind: 'festival', title: 'Sziget Winter Edition', city_id: 'budapest_hu', venue: 'Óbudai-sziget', starts_at: at(addDays(f5, -1), '12:00'), ends_at: at(addDays(f5, 3), '22:00'), genres: ['electronic'], ticket_url: 'https://szigetfestival.com', popularity: 80, source: 'ticketmaster' },
    { ...base, id: 'cur:market-vienna', kind: 'market', title: 'Târgul de Crăciun Rathausplatz', city_id: 'vienna_at', venue: 'Rathausplatz', starts_at: at(friday(0), '09:00'), ends_at: at(addDays(friday(0), 40), '21:00'), ticket_url: 'https://www.wien.info', popularity: 70 },
    { ...base, id: 'cur:6n-1', kind: 'sport', title: 'Irlanda – Franța (rugby)', city_id: 'dublin_ie', venue: 'Aviva Stadium', starts_at: at(addDays(f6, 1), '15:10'), competition: '6N', teams: ['Irlanda', 'Franța'], popularity: 85 },
    { ...base, id: 'cur:6n-2', kind: 'sport', title: 'Italia – Scoția (rugby)', city_id: 'rome_it', venue: 'Stadio Olimpico', starts_at: at(addDays(f6, 8), '15:15'), competition: '6N', teams: ['Italia', 'Scoția'], popularity: 75 },
    { ...base, id: 'tm:4', kind: 'comedy', title: 'Stand-up fără oră', city_id: 'london_gb', venue: 'The O2', starts_at: at(addDays(f4, 1), '00:00'), time_tbc: true, popularity: 40, source: 'ticketmaster' },
    { ...base, id: 'tm:xss', kind: 'concert', title: '<img src=x onerror="window.__xss=1"> Test & Co', city_id: 'rome_it', venue: '"><script>window.__xss=1</script>', starts_at: at(addDays(f5, 1), '20:00'), artists: ['<b>Rău</b>'], popularity: 30, source: 'ticketmaster' },
    { ...base, id: 'tm:nocity', kind: 'concert', title: 'Concert în oraș necunoscut', city_id: 'atlantis_zz', starts_at: at(addDays(f5, 1), '20:00'), artists: ['Necunoscuții'], popularity: 20, source: 'ticketmaster' },
  ];
}

// ---------- Supabase simulat ----------
function makeDb(seed = {}) {
  return { tables: { profiles: [], search_preferences: [], subscribers: [], visited_cities: [], event_preferences: [], event_alerts: [], quiz_scores: [], search_history: [], ...seed }, writes: [], rpcs: [], otp: [], fn: [] };
}

async function install(page, opts = {}) {
  const state = {
    kiwi: [], places: [], otp: [], kiwiHandler: opts.kiwi || defaultKiwi, db: opts.db || makeDb(), events: opts.events || sampleEvents(),
    blocked: [], errors: [], console: [], googleEnabled: !!opts.google, failRest: opts.failRest || null, ronRate: opts.ronRate ?? 5.0912,
    rpc: { my_quiz_rank: () => [{ best: 1200, best_correct: 9, rank: 3, players: 42, top_pct: 8 }], delete_my_account: () => null, record_search: () => null, unsubscribe: () => true, unsubscribe_alerts: () => true, search_events: (b, st) => st.events.filter(e => `${e.title} ${e.venue || ''} ${(e.artists || []).join(' ')} ${(e.teams || []).join(' ')}`.toLowerCase().includes(String(b.q || '').toLowerCase())), ...(opts.rpc || {}) },
    eventsSearch: opts.eventsSearch || (() => ({ events: [], tm: 'off' })),
  };
  page.on('pageerror', e => state.errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') state.console.push(m.text()); });

  if (opts.session) await page.addInitScript(([k, user]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 'qa.fake.token', refresh_token: 'qa-refresh', token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, user }));
  }, [TOKEN_KEY, { ...USER, ...(typeof opts.session === 'object' ? opts.session : {}) }]);
  if (opts.localStorage) await page.addInitScript(items => { for (const [k, v] of Object.entries(items)) if (localStorage.getItem(k) === null) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, opts.localStorage);
  if (opts.noOneTap !== false) await page.addInitScript(() => { try { if (!localStorage.getItem('23cb-onetap')) localStorage.setItem('23cb-onetap', JSON.stringify({ at: Date.now() })); } catch {} });

  await page.route(url => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', ...headers }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (url.hostname === 'api.skypicker.com') {
      const body = JSON.parse(req.postData() || '{}');
      // Autocomplete-ul de destinații întreabă și el Kiwi (query Places): îl numărăm separat.
      if (/places\(search/.test(body.query || '')) { state.places.push(body.variables?.search?.term); return opts.places ? json(await opts.places(body)) : json({ data: { places: { edges: [] } } }); }
      state.kiwi.push(body);
      const r = await state.kiwiHandler(body, state.kiwi.length, state);
      if (r === 'abort') return route.abort('failed');
      if (r && r.__status) return json(r.body || {}, r.__status);
      return json(r);
    }
    if (url.hostname === 'cdn.jsdelivr.net' && /supabase-js/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: SB_BUNDLE });
    if (url.hostname === 'api.frankfurter.dev') return state.ronRate ? json({ base: 'EUR', date: '2026-11-12', rates: { RON: state.ronRate } }) : route.abort('failed');

    if (url.hostname === SB_HOST) {
      const p = url.pathname;
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch {}
      if (p === '/auth/v1/settings') return json({ external: { google: state.googleEnabled, email: true } });
      if (p === '/auth/v1/otp') { state.otp.push(body); const r = opts.otp ? opts.otp(body) : null; return r ? json(r.body, r.status) : json({}); }
      if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      if (p === '/auth/v1/user') return json(USER);
      if (p.startsWith('/auth/v1/token')) return json({ access_token: 'qa.fake.token', refresh_token: 'qa-refresh', token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, user: USER });
      if (p.startsWith('/functions/v1/events-search')) { state.db.fn.push({ name: 'events-search', q: url.searchParams.get('q') }); return json(await state.eventsSearch(url.searchParams.get('q'), state)); }
      if (p.startsWith('/functions/v1/')) { state.db.fn.push({ name: p.split('/').pop(), body }); return json({ ok: true }); }
      if (p.startsWith('/storage/v1/')) { state.db.fn.push({ name: 'storage', path: p }); return json({ Key: p }); }
      if (p.startsWith('/rest/v1/rpc/')) {
        const name = p.split('/').pop();
        state.db.rpcs.push({ name, body });
        if (state.failRest && state.failRest(name, req.method())) return json({ message: 'simulated failure' }, 500);
        const fn = state.rpc[name];
        if (!fn) return json({ message: `function ${name} not found` }, 404);
        const out = await fn(body || {}, state);
        if (out && out.__status) return json(out.body, out.__status);
        return json(out);
      }
      if (p.startsWith('/rest/v1/')) {
        const table = p.split('/').pop();
        if (state.failRest && state.failRest(table, req.method())) return json({ message: 'simulated failure', code: 'XX000' }, 500);
        if (table === 'events') {
          const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 1000);
          if (opts.eventsStatus) return json({ message: 'down' }, opts.eventsStatus);
          return json(state.events.slice(offset, offset + limit));
        }
        const rows = state.db.tables[table] ||= [];
        if (req.method() === 'GET') return json(rows);
        state.db.writes.push({ table, method: req.method(), body, query: url.search, prefer: req.headers()['prefer'] || '' });
        if (req.method() === 'POST') {
          if (opts.onInsert) { const r = opts.onInsert(table, body, state); if (r) return json(r.body, r.status); }
          const items = Array.isArray(body) ? body : [body];
          const merge = /merge-duplicates/.test(req.headers()['prefer'] || '');
          for (const it of items) {
            const row = { user_id: USER.id, ...it };
            if (merge && rows.length && !('city_id' in row) && !('query' in row)) Object.assign(rows[0], row); else rows.push({ id: `row-${rows.length + 1}`, ...row });
          }
          return json(/return=representation/.test(req.headers()['prefer'] || '') ? items : null, 201);
        }
        if (req.method() === 'DELETE') {
          const eq = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]);
          state.db.tables[table] = rows.filter(r => !eq.every(([k, v]) => String(r[k]) === v));
          return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
        }
        if (req.method() === 'PATCH') { rows.forEach(r => Object.assign(r, body)); return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); }
      }
      return json({ message: 'unhandled in mock' }, 404);
    }
    if (opts.external) { let done = false; await opts.external(url, route, (...a) => { done = true; return json(...a); }); if (done) return; }
    state.blocked.push(url.hostname);
    return route.abort('blockedbyclient');
  });
  return state;
}

// Erorile de JavaScript ale paginii, fără zgomotul resurselor externe blocate intenționat.
const realErrors = state => state.errors.filter(e => !/Failed to fetch|NetworkError|Load failed|net::ERR/i.test(e));

module.exports = { install, makeDb, sampleEvents, defaultKiwi, ret, oneway, friday, addDays, iso, USER, TOKEN_KEY, realErrors, CITY };
