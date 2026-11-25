// Numără click-urile pe linkurile ieșite către parteneri (Kiwi, Skyscanner, Airbnb, Booking, Klook...) pentru rezumatul zilnic.
// Se trimit doar: partener, pagină, oraș/eveniment. Fără cookie, IP, cont sau alt identificator. Funcția: supabase/functions/click-log.
(() => {
  const URL_LOG = 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/click-log';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdWR0aG5ydW1zbGZzY3BwcGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODY2MDEsImV4cCI6MjEwOTk2MjYwMX0.aw6KKBRKMdkfiAbzkHKUlpP2cuHhN-gF-GiUT5zHq5Y';
  const PARTNERS = [
    [/(^|\.)kiwi\.com$/, 'Kiwi'], [/(^|\.)skyscanner\./, 'Skyscanner'], [/(^|\.)airbnb\./, 'Airbnb'], [/(^|\.)booking\.com$/, 'Booking'],
    [/(^|\.)klook\.com$/, 'Klook'], [/(^|\.)getyourguide\./, 'GetYourGuide'], [/(^|\.)viator\.com$/, 'Viator'], [/(^|\.)ticketmaster\./, 'Ticketmaster'],
    [/(^|\.)tp\.media$|(^|\.)travelpayouts\.com$|(^|\.)tpk\.lu$/, 'Travelpayouts'], [/(^|\.)google\.[a-z.]+$/, 'Google'],
  ];
  const page = () => (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '').toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'index';
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const partnerOf = (u) => { for (const [re, name] of PARTNERS) if (re.test(u.hostname)) return name === 'Google' && !/travel|flights/.test(u.pathname) ? '' : name; return ''; };
  // Destinația din URL: Kiwi ?to=, Booking ?ss=, Airbnb /s/<oraș>/, Skyscanner /flights/<de la>/<spre>/, Kiwi search /results/<de la>/<spre>/.
  const cityOf = (u) => {
    const q = u.searchParams, p = u.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
    let c = q.get('to') || q.get('ss') || '';
    if (!c && /airbnb/.test(u.hostname)) { const i = p.indexOf('s'); c = p[i + 1] || ''; }
    if (!c && /skyscanner/.test(u.hostname)) { const i = p.indexOf('flights'); c = p[i + 2] || ''; }
    if (!c && /kiwi/.test(u.hostname)) { const i = p.indexOf('results'); c = p[i + 2] || ''; }
    return clip(c.replace(/-(?:airport|cz|it|es)$/i, '').replace(/^City:/, ''), 80);
  };
  const labelOf = (el) => {
    const card = el.closest('article, [class*="card"], [class*="-card"], li, section');
    const h = card && card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"]');
    return clip(h && h.textContent, 100);
  };
  const seen = new Map();
  const log = (url, el) => {
    let u; try { u = new URL(url, location.href); } catch { return; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
    if (u.hostname === location.hostname) return;
    const partner = partnerOf(u); if (!partner) return;
    const body = { partner, page: page(), city: cityOf(u) || undefined, label: (el && labelOf(el)) || undefined };
    const k = JSON.stringify(body), now = Date.now();
    if (now - (seen.get(k) || 0) < 1500) return; // dublu-click / click + auxclick
    seen.set(k, now);
    try { fetch(URL_LOG, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain', apikey: KEY }, body: k }).catch(() => {}); } catch { /* ignorat */ }
  };
  const onClick = (e) => { if (e.button > 1) return; const a = e.target.closest && e.target.closest('a[href]'); if (a) log(a.href, a); };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  const open = window.open;
  window.open = function (url, ...rest) { try { if (url) log(String(url), null); } catch { /* ignorat */ } return open.call(this, url, ...rest); };
})();
