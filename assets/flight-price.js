// Prețul zborului dus-întors pentru un pachet de eveniment, cerut live de la Kiwi din browserul vizitatorului
// (același API ca motorul de căutare de pe prima pagină).
//   window.CBFlightPrice.get({ origin:'OTP', dest:'City:dublin_ie', out:'2027-02-05', back:'2027-02-07' })
//     → Promise<{ eur, direct, stops, at } | null>   eur = cel mai mic preț / persoană, preferând zborurile directe
// Kiwi blochează IP-ul după prea multe cereri, așa că: cache 6 ore în localStorage, cel mult 2 cereri simultan și
// cel mult 24 de cereri pe încărcare de pagină. Pauza de 30 de minute după un refuz și bugetul de cereri pe oră
// sunt comune cu prima pagină și stau în assets/kiwi-client.js (încărcat înaintea acestui fișier).
(() => {
  const K = window.CBKiwi;
  const TTL = 6 * 36e5, MAX_PER_PAGE = 24, CACHE_KEY = '23cb-flight-prices';
  const QUERY = `query SearchReturn($search: SearchReturnInput, $filter: ItinerariesFilterInput, $options: ItinerariesOptionsInput) {
    returnItineraries(search: $search, filter: $filter, options: $options) { ... on Itineraries { itineraries { ... on ItineraryReturn {
      priceEur { amount } outbound { sectorSegments { segment { code } } } inbound { sectorSegments { segment { code } } } } } } } }`;
  const read = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } };
  const write = c => { try { const now = Date.now(); for (const k in c) if (now - c[k].at > TTL) delete c[k]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} };
  // Fără prețuri noi cât ține pauza după un refuz sau când bugetul de cereri pe oră e consumat.
  const paused = () => K.paused() || K.budgetLeft() <= 0;

  let sent = 0, active = 0;
  const queue = [], inflight = new Map();
  const pump = () => { while (active < 2 && queue.length) { active++; queue.shift()().finally(() => { active--; pump(); }); } };
  const schedule = fn => new Promise((res, rej) => { queue.push(() => fn().then(res, rej)); pump(); });

  async function ask({ origin, dest, out, back }) {
    if (paused() || sent >= MAX_PER_PAGE) return null;
    sent++;
    let res;
    try {
      res = await K.fetch({
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ query: QUERY, variables: {
          search: { passengers: { adults: 1, adultsHandBags: [0], adultsHoldBags: [0] }, cabinClass: { cabinClass: 'ECONOMY' },
            itinerary: { source: { ids: [`Station:airport:${origin}`] }, destination: { ids: [dest] },
              outboundDepartureDate: { start: `${out}T00:00:00`, end: `${out}T23:59:59` }, inboundDepartureDate: { start: `${back}T00:00:00`, end: `${back}T23:59:59` } } },
          filter: { allowChangeInboundSource: false, allowChangeInboundDestination: false, transportTypes: ['FLIGHT'] },
          options: { partner: 'skypicker', sortBy: 'PRICE' } } }),
      });
    } catch { return null; } // refuzul Kiwi (403 fără CORS → TypeError) pornește pauza în kiwi-client.js
    if (!res.ok) return null;
    const list = (await res.json().catch(() => null))?.data?.returnItineraries?.itineraries || [];
    const legs = it => Math.max((it.outbound?.sectorSegments || []).length, (it.inbound?.sectorSegments || []).length);
    const priced = list.filter(it => Number(it.priceEur?.amount) > 0);
    if (!priced.length) return { eur: null, direct: false, stops: null, at: Date.now() };
    const direct = priced.filter(it => legs(it) === 1).sort((a, b) => a.priceEur.amount - b.priceEur.amount)[0];
    const best = direct || priced.sort((a, b) => a.priceEur.amount - b.priceEur.amount)[0];
    return { eur: Math.round(Number(best.priceEur.amount)), direct: !!direct, stops: legs(best) - 1, at: Date.now() };
  }

  function get(p) {
    if (!/^[A-Z]{3}$/.test(p?.origin || '') || !/^City:[a-z0-9-]+_[a-z]{2}$/.test(p?.dest || '') || !p.out || !p.back) return Promise.resolve(null);
    const key = `${p.origin}|${p.dest}|${p.out}|${p.back}`;
    const hit = read()[key];
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit);
    if (!inflight.has(key)) inflight.set(key, schedule(() => ask(p)).then(r => { if (r) { const c = read(); c[key] = r; write(c); } inflight.delete(key); return r; }));
    return inflight.get(key);
  }
  const cached = p => { const h = read()[`${p.origin}|${p.dest}|${p.out}|${p.back}`]; return h && Date.now() - h.at < TTL ? h : null; };
  // Aeroportul de plecare din profil (primul ales), altfel București.
  const origin = () => { try { const a = JSON.parse(localStorage.getItem('23cb-prefs'))?.departure_airports?.[0]; return /^[A-Z]{3}$/.test(a) ? a : 'OTP'; } catch { return 'OTP'; } };
  window.CBFlightPrice = { get, cached, origin, paused };
})();
