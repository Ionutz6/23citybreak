// Căutarea de evenimente după nume pe evenimente.html: artist, echipă, competiție, sală sau oraș („Oasis”, „Real Madrid”, „Viena”).
// Trei trepte, de la cea mai rapidă:
//   1. instant, în evenimentele deja încărcate (CBEvents.load), fără diacritice și cu toleranță la greșeli de tastare;
//   2. după 250 ms, în toată tabela events (RPC public search_events, pg_trgm), pentru ce nu e în primele 400 încărcate;
//   3. la Enter sau după o pauză de 1 s, funcția events-search: întreabă și Ticketmaster (când există cheia), salvează
//      ce găsește în events (apare și la ceilalți) și răspunde din aceeași căutare. Fără cheie, răspunde doar din tabelă.
// Dacă nu găsim nimic: „Nu avem încă evenimentul” + „Anunță-mă pe email când apare” (tabela event_alerts, doar cu cont).
// Test fără bază de date: ?evenimente-demo=1 (doar treapta 1).
(() => {
  const E = window.CBEvents, H = E.helpers, esc = H.esc;
  const form = document.getElementById('evs');
  if (!form) return;
  const input = form.querySelector('input'), panel = document.getElementById('evs-panel');
  const DEMO = new URLSearchParams(location.search).has('evenimente-demo');
  const MAX = 8;

  // ---------- Potrivire fără diacritice, cu toleranță la greșeli ----------
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[øØ]/g, 'o').replace(/[łŁ]/g, 'l')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Distanța Damerau-Levenshtein (cu inversarea a două litere vecine, cea mai frecventă greșeală de tastare).
  function dist(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  // Scorul unui cuvânt căutat față de cuvintele unui text: 4 exact, 3 început de cuvânt, 2 în interior, 1 aproximativ, 0 deloc.
  function tokenScore(t, words) {
    let best = 0;
    const tol = t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0;
    for (const w of words) {
      if (w === t) return 4;
      if (w.startsWith(t)) best = Math.max(best, 3);
      else if (t.length >= 3 && w.includes(t)) best = Math.max(best, 2);
      else if (tol && best < 1 && (dist(t, w) <= tol || (w.length > t.length && t.length >= 5 && dist(t, w.slice(0, t.length)) <= 1))) best = 1;
    }
    return best;
  }
  const scoreWords = (tokens, words) => { let s = 0; for (const t of tokens) { const x = tokenScore(t, words); if (!x) return 0; s += x; } return s; };

  const cityList = () => (window.CB_EUROPE_CITIES || []).filter(c => c.id?.startsWith('City:'));
  const slugOf = id => String(id).replace(/^City:/, '');
  // Orașele potrivite după numele românesc sau cel din slug („Viena” și „vienna” → vienna_at), doar ca început de cuvânt.
  function matchCities(tokens) {
    const out = [];
    for (const c of cityList()) {
      const words = norm(`${c.name} ${slugOf(c.id).replace(/_[a-z]{2}$/, '').replace(/-/g, ' ')}`).split(' ');
      if (tokens.every(t => words.some(w => w.startsWith(t) || (t.length >= 5 && dist(t, w) <= 1)))) out.push({ slug: slugOf(c.id), name: c.name, flag: c.flag || '' });
    }
    return out.slice(0, 3);
  }
  const hayCache = new Map();
  const hay = e => {
    if (!hayCache.has(e.id)) {
      const [, sport] = E.SPORTS[E.sportOf(e)] || [];
      hayCache.set(e.id, norm([e.title, e.venue, ...(e.artists || []), ...(e.teams || []), E.COMPETITIONS[e.competition] || e.competition,
        H.cityName(e.city_id), e.city_id.replace(/_[a-z]{2}$/, ''), (E.KINDS[e.kind] || [])[1], e.kind === 'football' || e.kind === 'sport' ? sport : ''].filter(Boolean).join(' ')).split(' '));
    }
    return hayCache.get(e.id);
  };

  // ---------- Stare ----------
  const today = new Date().toISOString().slice(0, 10);
  let all = [];
  E.load().then(list => { all = list.filter(e => H.endDate(e) >= today); if (input.value) run(); });
  const extra = new Map();     // evenimente venite din RPC / events-search, care nu erau în lista încărcată
  const serverHits = new Map(); // căutare normalizată → id-urile potrivite de server pentru ea
  const tmDone = new Map();    // căutare normalizată → { tm, found, weekday } de la events-search
  let q = '', tokens = [], cities = [], dbPending = false, tmPendingQ = '', active = -1, alertState = null;

  // ---------- Server ----------
  const api = E.api;
  async function rpc(query, cityIds) {
    if (DEMO) return [];
    const r = await fetch(`${api.url}/rest/v1/rpc/search_events`, {
      method: 'POST', headers: { apikey: api.key, Authorization: `Bearer ${api.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, city_ids: cityIds, lim: 30 }), signal: AbortSignal.timeout(8000),
    });
    return r.ok ? r.json() : [];
  }
  async function remote(query, cityIds) {
    if (DEMO) return { events: [], tm: 'off' };
    const u = new URL(`${api.url}/functions/v1/events-search`);
    u.searchParams.set('q', query);
    if (cityIds.length) u.searchParams.set('cities', cityIds.join(','));
    const r = await fetch(u, { headers: { apikey: api.key, Authorization: `Bearer ${api.key}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { events: [], tm: 'off' }; // funcția nu e încă publicată: rămânem la căutarea din tabelă
    return r.json();
  }
  function absorb(query, list) {
    const n = norm(query), hits = serverHits.get(n) || new Set();
    (list || []).forEach(e => { if (!e?.id || H.endDate(e) < today) return; hits.add(e.id); if (!all.some(x => x.id === e.id)) extra.set(e.id, e); });
    serverHits.set(n, hits);
  }

  // ---------- Rezultate ----------
  function results() {
    const cityIds = new Set(cities.map(c => c.slug));
    const pool = [...all, ...extra.values()], hits = serverHits.get(norm(q)) || new Set();
    const scored = [];
    for (const e of pool) {
      let s = scoreWords(tokens, hay(e));
      if (!s && cityIds.has(e.city_id)) s = 2.5 * tokens.length;
      if (!s && hits.has(e.id)) s = 0.5; // potrivit de server pentru căutarea asta (ex. trigrame), chiar dacă nu și aici
      if (s) scored.push([s + (e.popularity || 0) / 1000, e]);
    }
    return scored.sort((a, b) => b[0] - a[0] || a[1].starts_at.localeCompare(b[1].starts_at)).map(x => x[1]);
  }

  const ICON = e => (e.kind === 'football' || e.kind === 'sport' ? E.SPORTS[E.sportOf(e)] : E.KINDS[e.kind] || E.KINDS.other)[0];
  const mark = text => { // îngroașă bucățile potrivite exact
    let html = esc(text);
    for (const t of tokens.filter(t => t.length >= 2)) {
      const plain = norm(text);
      const i = plain.indexOf(t);
      if (i < 0 || plain.length !== String(text).length) continue; // doar când lungimile coincid (fără litere compuse)
      html = esc(text.slice(0, i)) + `<mark>${esc(text.slice(i, i + t.length))}</mark>` + esc(text.slice(i + t.length));
      break;
    }
    return html;
  };
  function rowHtml(e, i) {
    const sub = [H.cityName(e.city_id), e.venue].filter(Boolean).join(' · ');
    return `<li role="presentation"><a role="option" id="evs-o${i}" class="evs-row${i === active ? ' on' : ''}" aria-selected="${i === active}" href="${esc(E.packageUrl(e))}">
      <span class="evs-ic" aria-hidden="true">${ICON(e)}</span>
      <span class="evs-txt"><b>${mark(e.title)}</b><small>${esc(sub)}</small></span>
      <span class="evs-when">${esc(H.shortDate(H.startDate(e)))}${H.isMultiDay(e) ? ` – ${esc(H.shortDate(H.endDate(e)))}` : ''}<small>${esc(H.startDate(e).slice(0, 4))}${E.isWeekend(e) ? ' · weekend' : ''}</small></span>
      <span class="evs-go" aria-hidden="true">→</span></a></li>`;
  }

  function statusHtml(count) {
    const t = tmDone.get(norm(q));
    if (tmPendingQ === norm(q)) return `<p class="evs-status"><span class="evp-spin" aria-hidden="true"></span>Caut și în calendarul Ticketmaster…</p>`;
    if (dbPending && !count) return `<p class="evs-status"><span class="evp-spin" aria-hidden="true"></span>Caut în toate evenimentele…</p>`;
    if (t?.tm === 'on' && t.found) return `<p class="evs-status ok">Am adus ${t.found} ${t.found === 1 ? 'dată nouă' : 'date noi'} de la Ticketmaster. Le-am adăugat pe site, le vede oricine.</p>`;
    return '';
  }
  function emptyHtml() {
    const t = tmDone.get(norm(q));
    const searched = t && (t.tm === 'on' || t.tm === 'cached');
    let why;
    if (searched && t.weekday) why = `Am căutat și la Ticketmaster: ${t.weekday} ${t.weekday === 1 ? 'dată e' : 'date sunt'} în timpul săptămânii, iar noi includem doar evenimente de weekend (vineri seara → duminică).`;
    else if (searched) why = 'Am căutat și la Ticketmaster: nicio dată anunțată încă în orașele în care zburăm.';
    else why = 'Adăugăm zilnic concerte, meciuri și festivaluri noi în orașele în care zburăm.';
    return `<div class="evs-empty">
      <p class="evs-empty-t">Nu avem încă evenimentul „${esc(q)}”.</p>
      <p class="evs-empty-s">${why}</p>
      ${alertHtml()}
    </div>`;
  }
  function alertHtml() {
    const s = alertState;
    if (s?.q === norm(q) && s.state === 'ok') return `<p class="evs-alert-ok" role="status">🔔 Gata. Îți scriem${s.email ? ` pe <b>${esc(s.email)}</b>` : ''} când apare „${esc(s.label)}”, o singură dată. Alerta o vezi și o poți șterge în Contul tău.</p>`;
    if (s?.q === norm(q) && s.state === 'err') return `<p class="evs-alert-err" role="status">${esc(s.msg)}</p>`;
    const busy = s?.q === norm(q) && s.state === 'busy';
    const logged = window.Account?.hasSession?.();
    return `<button type="button" class="evs-alert" data-alert${busy ? ' disabled' : ''}>🔔 Anunță-mă pe email când apare</button>
      ${logged ? '' : '<small class="evs-alert-note">Îți cerem doar adresa de email, fără parolă.</small>'}`;
  }

  let shown = [];
  function render() {
    if (!q || tokens.join('').length < 2) { close(); return; }
    shown = results();
    const top = shown.slice(0, MAX);
    if (active >= top.length) active = top.length - 1;
    const cityNote = cities.length && top.some(e => cities.some(c => c.slug === e.city_id)) ? `<p class="evs-head">Și evenimentele din ${cities.map(c => `${c.flag} ${esc(c.name)}`).join(', ')}</p>` : '';
    panel.innerHTML = top.length
      ? `${cityNote}<ul class="evs-list" role="listbox" id="evs-list" aria-label="Evenimente găsite">${top.map(rowHtml).join('')}</ul>
         ${shown.length > MAX ? `<p class="evs-more">Încă ${shown.length - MAX} ${shown.length - MAX === 1 ? 'rezultat' : 'rezultate'}. Scrie mai precis, de exemplu și orașul.</p>` : ''}
         ${statusHtml(top.length)}`
      : (dbPending || tmPendingQ === norm(q) ? statusHtml(0) : emptyHtml());
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `evs-o${active}`); else input.removeAttribute('aria-activedescendant');
  }
  function close() { panel.hidden = true; panel.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }

  // ---------- Fluxul căutării ----------
  let dbTimer = 0, tmTimer = 0, seq = 0;
  function run() {
    q = input.value.trim().slice(0, 80);
    tokens = norm(q).split(' ').filter(Boolean);
    cities = tokens.length ? matchCities(tokens) : [];
    active = -1;
    clearTimeout(dbTimer); clearTimeout(tmTimer);
    const n = norm(q);
    if (n.length < 2) { close(); return; }
    dbPending = !DEMO;
    render();
    const my = ++seq, cityIds = cities.map(c => c.slug);
    dbTimer = setTimeout(async () => {
      const asked = q;
      try { absorb(asked, await rpc(asked, cityIds)); } catch {}
      if (my !== seq) return;
      dbPending = false; render();
    }, 250);
    if (n.length >= 4) tmTimer = setTimeout(() => searchTm(my), 1000);
  }
  async function searchTm(my = seq) {
    const n = norm(q);
    if (DEMO || n.length < 3 || tmDone.has(n) || tmPendingQ === n) { render(); return; }
    tmPendingQ = n; render();
    const cityIds = cities.map(c => c.slug);
    let r;
    try { r = await remote(q, cityIds); } catch { r = { events: [], tm: 'off' }; }
    tmDone.set(n, { tm: r.tm, found: r.found || 0, weekday: r.weekday || 0 });
    absorb(n, r.events);
    if (tmPendingQ === n) tmPendingQ = '';
    if (my === seq) { dbPending = false; render(); }
  }

  // ---------- Alertă pe email ----------
  async function createAlert(label) {
    const A = window.Account, n = norm(label);
    alertState = { q: n, label, state: 'busy' }; render();
    try {
      const s = await A.session();
      if (!s) { alertState = null; render(); return false; }
      const sb = await A.client();
      const { error } = await sb.from('event_alerts').insert({ query: label });
      if (error && error.code !== '23505') throw error; // 23505 = există deja: e tot un succes
      alertState = { q: n, label, state: 'ok', email: s.user?.email };
    } catch (err) {
      alertState = { q: n, label, state: 'err', msg: /maximum 30/.test(err?.message || '') ? 'Ai deja 30 de alerte active. Șterge din ele din Contul tău.' : 'Nu am putut salva alerta acum. Încearcă din nou peste un minut.' };
    }
    render();
    return true;
  }
  function askAlert() {
    const A = window.Account, label = q;
    if (!A) return;
    if (A.hasSession()) { createAlert(label); return; }
    const back = new URL(location.href); back.searchParams.set('alerta', label);
    A.openLogin({
      title: `Te anunțăm când apare „${label}”`,
      intro: 'Intră în cont cu un link pe email (fără parolă) și îți scriem imediat ce apare o dată în orașele în care zburăm.',
      source: '23citybreak-alerta', redirect: back.pathname.replace(/^\//, '') + back.search,
    });
  }

  // ---------- Evenimente DOM ----------
  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const a = panel.querySelector(`#evs-o${active}`);
    if (a) { location.href = a.href; return; }
    clearTimeout(tmTimer); searchTm();
  });
  input.addEventListener('keydown', ev => {
    const n = Math.min(shown.length, MAX);
    if (ev.key === 'ArrowDown' && n) { ev.preventDefault(); active = (active + 1) % n; render(); panel.querySelector(`#evs-o${active}`)?.scrollIntoView({ block: 'nearest' }); }
    else if (ev.key === 'ArrowUp' && n) { ev.preventDefault(); active = active <= 0 ? n - 1 : active - 1; render(); panel.querySelector(`#evs-o${active}`)?.scrollIntoView({ block: 'nearest' }); }
    else if (ev.key === 'Escape') { if (!panel.hidden) { ev.preventDefault(); close(); } else input.value = ''; }
  });
  panel.addEventListener('click', ev => { if (ev.target.closest('[data-alert]')) askAlert(); });
  document.addEventListener('click', ev => { if (!form.contains(ev.target)) close(); });

  // Întors din linkul de login cu ?alerta=…: salvăm alerta și curățăm adresa.
  const pendingAlert = new URLSearchParams(location.search).get('alerta');
  if (pendingAlert) {
    input.value = pendingAlert.slice(0, 80);
    run();
    const tryIt = async () => {
      if (!(await createAlert(input.value.trim()))) return false;
      const u = new URL(location.href); u.searchParams.delete('alerta'); history.replaceState(null, '', u);
      return true;
    };
    tryIt().then(ok => { if (!ok) window.addEventListener('account:change', tryIt, { once: true }); });
  }
})();
