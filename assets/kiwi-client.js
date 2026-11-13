// Singurul loc prin care paginile trimit cereri către Kiwi (api.skypicker.com). Kiwi blochează un IP după o rafală
// de cereri (HTTP 403 fără antete CORS, pe care browserul îl raportează ca TypeError), iar fiecare cerere trimisă
// în timpul blocajului îl prelungește. De aceea evidența stă în localStorage, comună tuturor paginilor și
// păstrată la reîncărcare:
//   - pauză de 30 de minute după un refuz;
//   - buget de cereri pe oră per browser, ca un vizitator să nu ajungă singur la pragul Kiwi (~850 de cereri).
//
//   CBKiwi.fetch({ body, signal })  → Promise<Response>; aruncă eroare cu .providerRefusal sau .budgetExceeded
//   CBKiwi.paused()                 → true cât ține pauza după refuz
//   CBKiwi.pausedUntil()            → momentul (ms) până la care ține pauza; 0 dacă nu e pauză
//   CBKiwi.pause()                  → pornește pauza (apelat și de pagini când văd un 403/429 în răspuns)
//   CBKiwi.budgetLeft()             → câte cereri mai sunt permise în ora curentă
//   CBKiwi.minutesToBudget()        → peste câte minute se eliberează următoarea cerere din buget
//   CBKiwi.CONCURRENCY              → câte cereri pot rula simultan într-o căutare
(() => {
  const API = 'https://api.skypicker.com/umbrella/v2/graphql';
  const PAUSE_KEY = '23cb-kiwi-pause', LOG_KEY = '23cb-kiwi-requests';
  const PAUSE_MS = 30 * 60 * 1000, HOUR_MS = 60 * 60 * 1000, MAX_PER_HOUR = 250, CONCURRENCY = 12;

  // Fără localStorage (mod privat strict) evidența rămâne doar în memoria paginii.
  const memory = {};
  const get = key => { try { return localStorage.getItem(key); } catch { return memory[key] ?? null; } };
  const set = (key, value) => { memory[key] = value; try { localStorage.setItem(key, value); } catch {} };

  const pausedUntil = () => { const until = Number(get(PAUSE_KEY)) || 0; return until > Date.now() ? until : 0; };
  const paused = () => pausedUntil() > 0;
  const pause = () => set(PAUSE_KEY, String(Date.now() + PAUSE_MS));

  // Momentele cererilor din ultima oră, cele mai vechi primele.
  const recent = () => {
    let list;
    try { list = JSON.parse(get(LOG_KEY)); } catch { list = null; }
    const since = Date.now() - HOUR_MS;
    return Array.isArray(list) ? list.filter(t => Number.isFinite(t) && t > since && t <= Date.now()) : [];
  };
  const budgetLeft = () => Math.max(0, MAX_PER_HOUR - recent().length);
  const minutesToBudget = () => {
    const list = recent();
    return list.length < MAX_PER_HOUR ? 0 : Math.max(1, Math.ceil((list[0] + HOUR_MS - Date.now()) / 60000));
  };

  async function kiwiFetch({ body, signal } = {}) {
    const list = recent();
    if (list.length >= MAX_PER_HOUR) {
      const error = new Error('Bugetul de cereri pe oră către furnizorul de zboruri a fost atins');
      error.budgetExceeded = true;
      throw error;
    }
    list.push(Date.now());
    set(LOG_KEY, JSON.stringify(list));
    let response;
    try {
      response = await fetch(API, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body });
    } catch (error) {
      // Doar eșecul cererii în sine e refuz; fără rețea (offline) nu e vina furnizorului.
      if (error?.name === 'TypeError' && navigator.onLine !== false) { error.providerRefusal = true; pause(); }
      throw error;
    }
    if (response.status === 403 || response.status === 429) pause();
    return response;
  }

  window.CBKiwi = { fetch: kiwiFetch, paused, pausedUntil, pause, budgetLeft, minutesToBudget, CONCURRENCY, MAX_PER_HOUR };
})();
