// Hub-ul „Orașe vizitate”: harta ta, nivelul de călător, cel mai bun scor la quiz și locul în clasament.
// Fără cont: harta și scorul rămân în acest browser (localStorage), cu invitație la login ca să le salvezi.
// Expune window.Hub pentru quiz (butonul „Am fost” din recapitulare).
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = n => Number(n).toLocaleString('ro-RO');
  const plural = (n, one, many) => n === 1 ? `1 ${one}` : `${fmt(n)} ${n % 100 >= 20 || n % 100 === 0 && n ? 'de ' : ''}${many}`;
  const readBest = () => { try { return JSON.parse(localStorage.getItem('23cb-quiz-best')) || null; } catch { return null; } };
  const QUIZ = 'ghiceste-orasul', MIN_PLAYERS_FOR_PCT = 100;

  // Nivelurile de călător, după orașele bifate. Pragurile cresc ca să rămână mereu un pas următor.
  const LEVELS = [
    [0, 'Abia pornești la drum'], [1, 'Turist curios'], [5, 'Călător de weekend'], [12, 'Explorator'],
    [25, 'Colecționar de orașe'], [45, 'Globetrotter'], [75, 'Cetățean al Europei'],
  ];
  const levelFor = n => {
    let i = 0; while (i + 1 < LEVELS.length && n >= LEVELS[i + 1][0]) i++;
    const [from, name] = LEVELS[i], next = LEVELS[i + 1];
    return {index: i + 1, name, next: next && {at: next[0], name: next[1], left: next[0] - n, pct: Math.round(100 * (n - from) / (next[0] - from))}};
  };

  const state = {vc: null, cities: null, rank: null, session: null, ready: false};

  function stat(label, value, sub) {
    const box = el('div', 'hub-stat');
    box.append(el('span', 'hub-stat-label', label), el('strong', 'hub-stat-value', value));
    if (sub) box.append(sub instanceof Node ? sub : el('span', 'hub-stat-sub', sub));
    return box;
  }

  function renderStats() {
    const ids = state.vc ? state.vc.getVisited() : [];
    const byId = state.cities;
    const countries = new Set(ids.map(id => byId?.get(id)?.cc).filter(Boolean)).size;
    const lvl = levelFor(ids.length);

    const lvlSub = el('div', 'hub-level');
    if (lvl.next) {
      const bar = el('div', 'hub-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(lvl.next.pct)); bar.setAttribute('aria-label', `Progres spre nivelul ${lvl.next.name}`);
      const fill = el('span'); fill.style.width = `${Math.max(4, lvl.next.pct)}%`; bar.append(fill);
      lvlSub.append(bar, el('span', 'hub-stat-sub', `Încă ${plural(lvl.next.left, 'oraș', 'orașe')} până la „${lvl.next.name}”`));
    } else lvlSub.append(el('span', 'hub-stat-sub', 'Ai atins cel mai înalt nivel.'));

    const rank = state.rank, best = readBest();
    let quizValue = '–', quizSub = 'Joacă și intră în clasamentul Europa';
    if (rank?.best != null) {
      quizValue = `${fmt(rank.best)} p`;
      quizSub = rank.players >= MIN_PLAYERS_FOR_PCT ? `Top ${rank.top_pct}% din ${fmt(rank.players)} jucători` : rank.players === 1 ? 'Primul jucător din clasament' : `Locul ${fmt(rank.rank)} din ${fmt(rank.players)}`;
    } else if (best) {
      quizValue = `${fmt(best.score)} p`;
      quizSub = state.session ? 'Joacă din nou ca să intri în clasament' : 'Salvat doar în acest browser';
    }
    const quizLink = el('a', 'hub-stat-sub hub-stat-link', quizSub + ' ↓'); quizLink.href = '#city-quiz';

    $('hub-stats').replaceChildren(
      stat('Orașe vizitate', fmt(ids.length), `în ${plural(countries, 'țară', 'țări')}`),
      stat(`Nivel ${lvl.index}`, lvl.name, lvlSub),
      stat('Ghicește orașul', quizValue, quizLink),
    );
  }

  function renderLoginCta() {
    const box = $('hub-login');
    if (state.session || !window.Account) { box.hidden = true; return; }
    const text = el('div', 'hub-login-text');
    text.append(el('strong', null, 'Salvează-ți harta și scorul'), el('span', null, 'Fără cont, orașele bifate și scorul la quiz rămân doar în acest browser. Cu un cont gratuit le păstrezi pe orice dispozitiv și intri în clasamentul Europa.'));
    const go = el('button', 'hub-btn hub-primary', 'Intră fără parolă ↗'); go.type = 'button';
    go.addEventListener('click', () => window.Account.openLogin({
      title: 'Salvează-ți harta și scorul',
      intro: 'Îți trimitem un link pe email. Îl apeși și orașele bifate aici se mută în contul tău. Dacă nu ai cont, îl creăm atunci.',
      source: '23citybreak-orase-vizitate', redirect: 'orase-vizitate.html',
    }));
    box.replaceChildren(text, go); box.hidden = false;
  }

  async function loadRank(sb) {
    try {
      const {data, error} = await sb.rpc('my_quiz_rank', {p_quiz: QUIZ});
      if (!error) state.rank = Array.isArray(data) ? data[0] : data;
    } catch {}
  }

  async function init() {
    const A = window.Account;
    try { if (A) await A.afterLogin(); } catch {}
    try { state.session = A ? await A.session() : null; } catch { state.session = null; }
    const sb = state.session ? await A.client() : null;
    const opts = {mode: 'profile', onChange: renderStats};
    if (sb) Object.assign(opts, {client: sb, user: state.session.user});
    const [vc, cities] = await Promise.all([
      window.VisitedCities.mount($('visited-cities'), opts),
      fetch('assets/visited/cities-data.json').then(r => r.json()).catch(() => []),
      sb ? loadRank(sb) : null,
    ]);
    state.vc = vc; state.cities = new Map(cities.map(c => [c.id, c]));
    renderStats(); renderLoginCta(); state.ready = true;
  }

  window.Hub = {
    canMark: id => !!state.vc && !!state.cities?.has(id),
    isVisited: id => !!state.vc?.isVisited(id),
    toggle: id => state.vc?.toggle(id),
  };
  window.addEventListener('quiz:rank', e => { state.rank = e.detail; renderStats(); });
  window.addEventListener('quiz:finished', renderStats);
  // Login reușit în altă filă sau ieșire din cont: reîncărcăm ca harta să treacă pe contul corect.
  window.addEventListener('account:change', () => { if (!state.ready) return; const has = !!window.Account?.hasSession(); if (has !== !!state.session) location.reload(); });

  renderStats();
  init().catch(e => { console.warn('[hub]', e); renderStats(); });
})();
