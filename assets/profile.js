// Pagina de profil (cont.html): privată, doar pentru cine e conectat.
// Login, onboarding pentru conturile noi, cel mai bun scor la quiz și locul în clasament, preferințe, orașe văzute, newsletter, ștergere cont.
(() => {
  const A = window.Account;
  const main = document.getElementById('profile');
  const QUIZ = 'ghiceste-orasul', MIN_PLAYERS_FOR_PCT = 100;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = n => Number(n).toLocaleString('ro-RO');
  const card = (kicker, title) => { const c = el('section', 'acct-card'); c.append(el('span', 'acct-kicker', kicker)); if (title) c.append(el('h2', null, title)); return c; };

  function loggedOut(expired) {
    const box = el('section', 'acct-card acct-card-narrow');
    if (expired) box.append(el('p', 'acct-status', 'Linkul nu mai e valabil (expiră după o oră și merge o singură dată). Cere unul nou mai jos.'));
    box.append(A.loginForm().form);
    main.replaceChildren(box);
    box.querySelector('input[type=email]')?.focus();
  }

  async function quizCard(sb) {
    const c = card('GHICEȘTE ORAȘUL', 'Cel mai bun scor');
    const body = el('div', 'acct-quiz'); c.append(body);
    body.append(el('p', 'acct-note', 'Se încarcă...'));
    try {
      const {data, error} = await sb.rpc('my_quiz_rank', {p_quiz: QUIZ});
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r || !r.players) {
        body.replaceChildren(el('p', null, 'Încă nu ai jucat quizul. 10 ilustrații, ghicești orașul, intri în clasamentul Europa.'));
        const a = el('a', 'acct-primary', 'Joacă quizul ↗'); a.href = 'index.html#city-quiz';
        body.append(a); return c;
      }
      const stats = el('div', 'acct-stats');
      const stat = (big, small) => { const s = el('div', 'acct-stat'); s.append(el('strong', null, big), el('span', null, small)); return s; };
      const place = r.players >= MIN_PLAYERS_FOR_PCT ? `Top ${r.top_pct}%` : `Locul ${fmt(r.rank)}`;
      stats.append(stat(fmt(r.best), 'puncte'), stat(`${r.best_correct}/10`, 'răspunsuri corecte'), stat(place, `din ${fmt(r.players)} ${r.players === 1 ? 'jucător' : 'jucători'} în Europa`));
      const a = el('a', 'acct-secondary', 'Joacă din nou ↻'); a.href = 'index.html#city-quiz';
      body.replaceChildren(stats, a);
    } catch { body.replaceChildren(el('p', 'acct-status', 'Nu am putut încărca scorul acum.')); }
    return c;
  }

  async function prefsCard() {
    const c = card('PREFERINȚE DE CĂUTARE', 'Cum îți place să călătorești');
    c.append(el('p', 'acct-intro', 'Le folosim ca să-ți arătăm întâi zborurile potrivite.'));
    const form = A.prefsForm(await A.preferences());
    const save = el('button', 'acct-primary', 'Salvează'); save.type = 'button';
    const status = el('span', 'acct-status'); status.setAttribute('role', 'status');
    save.addEventListener('click', async () => {
      save.disabled = true; status.textContent = 'Se salvează...';
      try { await A.savePrefs(form.read()); status.textContent = 'Salvat ✓'; }
      catch { status.textContent = 'Nu am putut salva acum.'; }
      save.disabled = false;
    });
    const actions = el('div', 'acct-actions'); actions.append(save, status);
    c.append(form.node, actions);
    return c;
  }

  function visitedCard(sb, user) {
    const c = card('ORAȘE VĂZUTE', 'Harta ta de city break-uri');
    const box = el('div', 'acct-visited'); c.append(box);
    A.mountVisited(box, sb, user, 'profile');
    return c;
  }

  async function newsletterCard(sb, user) {
    const c = card('NEWSLETTER');
    const body = el('div'); c.append(body);
    const render = async () => {
      const on = await A.isSubscribed().catch(() => false);
      const btn = el('button', on ? 'acct-secondary' : 'acct-primary', on ? 'Dezabonează-mă' : 'Abonează-mă'); btn.type = 'button';
      const status = el('span', 'acct-status'); status.setAttribute('role', 'status');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await A.saveSubscriber(sb, user, !on, '23citybreak-cont'); await render(); }
        catch { btn.disabled = false; status.textContent = 'Nu a mers acum. Încearcă din nou.'; }
      });
      const actions = el('div', 'acct-actions'); actions.append(btn, status);
      body.replaceChildren(
        el('h2', null, on ? 'Ești abonat la newsletter' : 'Nu ești abonat la newsletter'),
        el('p', 'acct-intro', on ? 'Primești pe email zborurile ieftine de weekend și noutățile 23ai. Te poți dezabona oricând.' : 'Zboruri ieftine de weekend din România, o dată pe săptămână. Fără spam.'),
        ...(on ? [] : [el('p', 'acct-note', `Apăsând „Abonează-mă”: ${A.CONSENT}`)]),
        actions,
      );
      if (!on) c.classList.add('acct-card-highlight'); else c.classList.remove('acct-card-highlight');
    };
    await render();
    return c;
  }

  function accountCard(sb, user) {
    const c = card('CONT', null);
    c.append(el('p', null, `Conectat ca ${user.email}`));
    const out = el('button', 'acct-secondary', 'Ieși din cont'); out.type = 'button';
    out.addEventListener('click', async () => { await sb.auth.signOut(); A.updateHeader(); loggedOut(); });
    const del = el('button', 'acct-link acct-danger', 'Șterge contul și datele'); del.type = 'button';
    const confirmBox = el('div', 'acct-confirm'); confirmBox.hidden = true;
    const yes = el('button', 'acct-danger-btn', 'Da, șterge definitiv'); yes.type = 'button';
    const no = el('button', 'acct-link', 'Renunț'); no.type = 'button';
    const status = el('span', 'acct-status'); status.setAttribute('role', 'status');
    confirmBox.append(el('p', null, 'Se șterg contul, scorurile, preferințele, orașele văzute și abonarea la newsletter, pentru 23citybreak și 23ai. Nu se poate anula.'), yes, no, status);
    del.addEventListener('click', () => { confirmBox.hidden = false; yes.focus(); });
    no.addEventListener('click', () => { confirmBox.hidden = true; });
    yes.addEventListener('click', async () => {
      yes.disabled = true; status.textContent = 'Se șterge...';
      try {
        const {error} = await sb.rpc('delete_my_account'); if (error) throw error;
        await sb.auth.signOut().catch(() => {});
        try { localStorage.removeItem('23cb-nl-banner'); } catch {}
        A.updateHeader();
        main.replaceChildren(el('section', 'acct-card acct-card-narrow'));
        main.firstChild.append(el('h2', null, 'Contul a fost șters'), el('p', null, 'Toate datele tale au fost șterse. Mulțumim că ai folosit 23citybreak.'));
      } catch { yes.disabled = false; status.textContent = 'Nu am putut șterge contul acum. Scrie-ne la office@23ai.ro.'; }
    });
    const actions = el('div', 'acct-actions'); actions.append(out, del);
    c.append(actions, confirmBox);
    return c;
  }

  async function render() {
    const sb = await A.client();
    const {data: {session}} = await sb.auth.getSession();
    if (!session) { loggedOut(); return; }
    const user = session.user;
    const head = el('div', 'acct-hello');
    head.append(el('span', 'acct-kicker', 'CONTUL TĂU'), el('h1', null, 'Salut!'), el('p', 'acct-intro', user.email));
    const grid = el('div', 'acct-grid');
    main.replaceChildren(head, grid);
    const [quiz, news] = await Promise.all([quizCard(sb), newsletterCard(sb, user)]);
    const interests = window.ProfileInterests ? await window.ProfileInterests.card(sb).catch(() => null) : null;
    grid.append(quiz, news, await prefsCard(), ...(interests ? [interests] : []), visitedCard(sb, user), accountCard(sb, user));
  }

  async function start() {
    if (/error_description=/.test(location.hash)) { history.replaceState(null, '', location.pathname); loggedOut(true); return; }
    try {
      await A.afterLogin();
      if (!(await A.session())) { loggedOut(); return; }
      if (await A.needsOnboarding()) {
        main.replaceChildren();
        const host = el('div'); main.append(host);
        await A.runOnboarding(host);
        // Profilul apare după ce onboardingul e terminat sau sărit.
        const done = () => { if (!host.querySelector('.acct-onboarding')) { window.removeEventListener('account:change', done); render(); } };
        window.addEventListener('account:change', done);
        return;
      }
      await render();
    } catch (err) { console.error('cont:', err); main.replaceChildren(el('p', 'acct-status', 'Nu am putut încărca contul acum. Reîncarcă pagina.')); }
  }

  start();
})();
