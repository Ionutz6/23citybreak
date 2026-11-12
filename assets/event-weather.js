// Vremea orientativă pe pagina de pachet (weekend.html): cum e de obicei în luna evenimentului, în orașul lui.
// Sursa: arhiva Open-Meteo (gratuită, fără cheie, atribuire CC BY 4.0), media aceleiași luni din ultimii 3 ani încheiați.
// Nu e prognoză: rezultatul e marcat „orientativ” în pagină. Cache local 60 de zile per oraș și lună.
//
//   window.CBWeather.typical(slug, cityName, isoDate) → Promise<{ hi, lo, wet, month, years } | null>
//     hi / lo  = media temperaturii maxime / minime zilnice (°C, rotunjit)
//     wet      = din 10 zile, câte au avut cel puțin 1 mm de ploaie
//     month    = numele lunii în română („noiembrie”), years = câți ani au intrat în medie
(() => {
  const KEY = '23cb-climate-v1', TTL = 60 * 864e5;
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set: v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  };
  const pad = n => String(n).padStart(2, '0');
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1…12
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;

  async function coords(slug, name) {
    const c = window.CB_CITY_COORDS?.[`City:${slug}`];
    if (c) return c;
    const cc = String(slug).split('_')[1]?.toUpperCase();
    const q = String(name || slug.split('_')[0]).split(/[\/(]/)[0].trim();
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=ro`, { signal: AbortSignal.timeout(8000) });
    const m = ((await res.json()).results || []).find(r => !cc || r.country_code === cc);
    return m ? [Math.round(m.latitude * 100) / 100, Math.round(m.longitude * 100) / 100] : null;
  }

  async function typical(slug, name, iso) {
    if (!slug || !/^\d{4}-\d{2}/.test(iso || '')) return null;
    const month = +iso.slice(5, 7);
    const key = `${slug}|${month}`;
    const cache = store.get();
    if (cache[key] && cache[key].exp > Date.now()) return cache[key].v;
    try {
      const ll = await coords(slug, name);
      if (!ll) return null;
      // Ultimii 3 ani în care luna s-a încheiat de cel puțin o săptămână (arhiva are câteva zile întârziere).
      const now = new Date(), years = [];
      for (let y = now.getUTCFullYear(); years.length < 3 && y > now.getUTCFullYear() - 5; y--) {
        if (Date.UTC(y, month - 1, lastDay(y, month)) + 7 * 864e5 < now.getTime()) years.push(y);
      }
      const daily = await Promise.all(years.map(async y => {
        const p = new URLSearchParams({ latitude: ll[0], longitude: ll[1], start_date: `${y}-${pad(month)}-01`, end_date: `${y}-${pad(month)}-${lastDay(y, month)}`, daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum', timezone: 'auto' });
        const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${p}`, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
        return (await res.json()).daily || {};
      }));
      const hi = daily.flatMap(d => d.temperature_2m_max || []).filter(Number.isFinite);
      const lo = daily.flatMap(d => d.temperature_2m_min || []).filter(Number.isFinite);
      const pr = daily.flatMap(d => d.precipitation_sum || []).filter(Number.isFinite);
      if (!hi.length || !lo.length) return null;
      const v = { hi: Math.round(avg(hi)), lo: Math.round(avg(lo)), wet: pr.length ? Math.round(pr.filter(x => x >= 1).length / pr.length * 10) : null, month: MONTHS[month - 1], years: years.length };
      cache[key] = { v, exp: Date.now() + TTL };
      store.set(cache);
      return v;
    } catch (e) { console.warn('Vremea orientativă nu a putut fi încărcată:', e?.message || e); return null; }
  }

  window.CBWeather = { typical, MONTHS };
})();
