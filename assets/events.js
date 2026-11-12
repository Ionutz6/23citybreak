// Evenimente la dată fixă (concerte, meciuri, festivaluri) legate de weekendurile din căutare.
//   window.CBEvents.load()               → Promise<eveniment[]> (tabela publică `events`, vezi supabase/SCHEMA.md)
//   window.CBEvents.decorateCards(grid)  → apelat din renderCardsView(): badge pe cardurile de oraș
//   secțiunea „Weekenduri cu ceva special” se montează singură în #events-home
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
  const COMPETITIONS = { CL: 'Champions League', PL: 'Premier League', PD: 'La Liga', SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1', DED: 'Eredivisie', PPL: 'Primeira Liga' };
  const FILTERS = [['all', 'Toate'], ['music', '🎵 Concerte'], ['football', '⚽ Fotbal'], ['fest', '🎪 Festivaluri']];
  const inFilter = (e, f) => f === 'all' || (f === 'music' && (e.kind === 'concert' || e.kind === 'comedy' || e.kind === 'theatre'))
    || (f === 'football' && (e.kind === 'football' || e.kind === 'sport')) || (f === 'fest' && (e.kind === 'festival' || e.kind === 'city_festival' || e.kind === 'market'));

  const cities = () => window.CB_EUROPE_CITIES || [];
  const cityOf = slug => cities().find(c => slugOf(c.id) === slug);
  const cityName = slug => cityOf(slug)?.name || slug.split('_')[0].replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
  const guideOf = slug => (window.CB_ILLUSTRATED_GUIDES || {})[`City:${slug}`];
  const guideImage = slug => { const g = guideOf(slug); return g ? `assets/guides-prague-style/${g.image}.${g.extension || 'png'}` : ''; };

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
  const whenLabel = e => {
    const s = startDate(e);
    if (isMultiDay(e)) { const en = endDate(e); return s.slice(0, 7) === en.slice(0, 7) ? `${+s.slice(8)}–${+en.slice(8)} ${MON[+s.slice(5, 7) - 1]}` : `${+s.slice(8)} ${MON[+s.slice(5, 7) - 1]} – ${+en.slice(8)} ${MON[+en.slice(5, 7) - 1]}`; }
    return `${longDate(s)}${e.time_tbc ? ', ora se anunță' : `, ${local(e.starts_at, e.city_id).time}`}`;
  };
  const tagLabel = e => {
    const [icon, name] = KINDS[e.kind] || KINDS.other;
    const label = e.kind === 'football' && COMPETITIONS[e.competition] ? COMPETITIONS[e.competition] : name;
    return `${icon} ${label}${isMultiDay(e) ? ` · ${lengthDays(e)} zile` : ''}`;
  };
  const packageUrl = e => `weekend.html?e=${encodeURIComponent(e.id)}${DEMO ? '&evenimente-demo=1' : ''}`;

  // ---------- Încărcare ----------
  let loading;
  const load = () => loading ||= (async () => {
    try {
      if (DEMO) return (await (await fetch('data/evenimente-demo.json')).json()).events;
      const since = new Date(Date.now() - 864e5).toISOString();
      const q = new URLSearchParams({ select: '*', or: `(starts_at.gte.${since},ends_at.gte.${since})`, order: 'popularity.desc,starts_at.asc', limit: '400' });
      const res = await fetch(`${SUPABASE_URL}/rest/v1/events?${q}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  })();
  const byId = async id => (await load()).find(e => e.id === id) || null;

  // ---------- Secțiunea de pe pagina principală ----------
  const PAGE = 8;
  function cardHtml(e) {
    const img = guideImage(e.city_id) || e.image_url || '';
    const wk = mainWeekend(e);
    const price = e.price_min_eur ? `<div><div class="ev-price">${Math.round(e.price_min_eur)} €</div><div class="ev-price-sub">bilet, de la</div></div>` : '<div></div>';
    const note = e.kind === 'football' ? 'bilete pe<br>site-ul clubului' : e.kind === 'market' || e.kind === 'city_festival' ? 'intrare<br>liberă' : '';
    return `<article class="ev-card"${img ? ` style="background-image:url('${esc(img)}')"` : ''}>
      <div class="ev-top"><span class="ev-tag">${esc(tagLabel(e))}</span></div>
      <div class="ev-body">
        <h3>${esc(e.title)} · ${esc(cityName(e.city_id))}</h3>
        <div class="ev-meta">${e.venue ? `${esc(e.venue)} · ` : ''}${esc(whenLabel(e))}</div>
        <div class="ev-meta">📅 ${isMultiDay(e) ? 'weekendul recomandat: ' : ''}${esc(shortDate(wk.fri))} → ${esc(shortDate(wk.sun))}</div>
        <div class="ev-prices">${price}<div class="ev-price-alt">${note}</div></div>
        <a class="ev-btn" href="${esc(packageUrl(e))}">${isMultiDay(e) ? 'Alege zilele →' : 'Vezi pachetul de weekend →'}</a>
      </div></article>`;
  }

  async function mountHome() {
    const host = document.getElementById('events-home');
    if (!host) return;
    const now = new Date().toISOString().slice(0, 10);
    const all = (await load()).filter(e => endDate(e) >= now);
    if (!all.length) return;
    let filter = 'all', shown = PAGE;
    const render = () => {
      const list = all.filter(e => inFilter(e, filter));
      const chips = FILTERS.filter(([f]) => f === 'all' || all.some(e => inFilter(e, f)))
        .map(([f, label]) => `<button type="button" class="ev-chip${f === filter ? ' on' : ''}" data-filter="${f}" aria-pressed="${f === filter}">${label}</button>`).join('');
      host.innerHTML = `<div class="ev-head"><div><h2>Weekenduri cu ceva special</h2><p>Concerte, meciuri și festivaluri în orașe unde ajungi cu un zbor de weekend</p></div><div class="ev-filters" role="group" aria-label="Tip de eveniment">${chips}</div></div>
        <div class="ev-grid">${list.slice(0, shown).map(cardHtml).join('')}</div>
        ${list.length > shown ? `<div class="ev-more"><button type="button" class="ev-chip" data-more>Arată încă ${Math.min(PAGE, list.length - shown)}</button></div>` : ''}
        ${all.some(e => e.source === 'football-data') ? '<p class="ev-credit">Football data provided by the Football-Data.org API</p>' : ''}`;
      host.hidden = false;
    };
    host.addEventListener('click', ev => {
      const chip = ev.target.closest('[data-filter]');
      if (chip) { filter = chip.dataset.filter; shown = PAGE; render(); return; }
      if (ev.target.closest('[data-more]')) { shown += PAGE; render(); }
    });
    render();
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

  window.CBEvents = { load, byId, decorateCards, KINDS, COMPETITIONS, helpers: { esc, cityName, cityOf, guideOf, guideImage, local, isoAdd, dowOf, shortDate, longDate, startDate, endDate, isMultiDay, lengthDays, mainWeekend, whenLabel, tagLabel, DOW, DOW_LONG, MON } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHome); else mountHome();
})();
