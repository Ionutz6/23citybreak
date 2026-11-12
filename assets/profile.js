// Pagina „Contul tău” (cont.html), aceeași adresă pentru toți:
//  - neconectat: salut multilingv, de ce merită un cont și loginul (Google, dacă e activ în Supabase, sau link pe email);
//  - conectat: salut, cât de complet e profilul, newsletter, preferințe, interese pentru evenimente, link spre orașele
//    vizitate (harta și quizul stau doar pe orase-vizitate.html), ștergerea contului.
(() => {
  const A = window.Account;
  const main = document.getElementById('profile');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const card = (kicker, title) => { const c = el('section', 'acct-card'); c.append(el('span', 'acct-kicker', kicker)); if (title) c.append(el('h2', null, title)); return c; };

  // Salutul se rotește prin 12 limbi europene, câte una la ~2,6 secunde, începând cu româna.
  // Cititoarele de ecran aud doar „Salut!”; cu „reduce motion” rămâne fix.
  const HELLOS = [['ro', 'Salut!', 'română'], ['en', 'Hello!', 'engleză'], ['de', 'Hallo!', 'germană'], ['fr', 'Bonjour !', 'franceză'], ['es', '¡Hola!', 'spaniolă'], ['it', 'Ciao!', 'italiană'],
    ['pt', 'Olá!', 'portugheză'], ['hu', 'Szia!', 'maghiară'], ['pl', 'Cześć!', 'poloneză'], ['cs', 'Ahoj!', 'cehă'], ['el', 'Γεια σου!', 'greacă'], ['nl', 'Hoi!', 'neerlandeză']];
  let helloTimer;
  function greeting() {
    const h = el('h1', 'acct-hello-word'); h.setAttribute('aria-label', 'Salut!');
    const word = el('span', 'acct-hello-text', HELLOS[0][1]); word.lang = 'ro'; word.setAttribute('aria-hidden', 'true');
    const lang = el('small', 'acct-hello-lang', 'în română'); lang.setAttribute('aria-hidden', 'true');
    h.append(word, lang);
    clearInterval(helloTimer);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let i = 0;
      helloTimer = setInterval(() => {
        if (!h.isConnected) { clearInterval(helloTimer); return; }
        h.classList.add('is-out');
        setTimeout(() => { i = (i + 1) % HELLOS.length; const [code, txt, name] = HELLOS[i]; word.textContent = txt; word.lang = code; lang.textContent = `în ${name}`; h.classList.remove('is-out'); }, 320);
      }, 2600);
    }
    return h;
  }

  function loggedOut(expired) {
    const head = el('div', 'acct-hello acct-pitch-head');
    head.append(el('span', 'acct-kicker', 'CONTUL TĂU'), greeting(),
      el('p', 'acct-lead', 'Fă-ți un cont gratuit și 23citybreak începe să caute pentru tine: zboruri din aeroportul tău, în bugetul tău, și evenimentele care chiar te interesează, cu weekendul pus cap la cap.'));
    const perks = el('ul', 'acct-perks');
    for (const [icon, title, text] of [
      ['✈︎', 'Zborurile tale, primele', 'Aeroportul de plecare, bugetul și vremea preferată se aplică singure la fiecare căutare, pe orice dispozitiv.'],
      ['⚽', 'Evenimente pe gustul tău', 'Spune-ne ce echipe, artiști și festivaluri urmărești. Când apare ceva într-un weekend, ai pachetul gata făcut: bilet, zbor, cazare.'],
      ['✉︎', 'Noutăți doar despre ce te interesează', 'Zboruri ieftine de weekend și evenimentele tale, pe email, doar dacă bifezi newsletterul. Te dezabonezi dintr-un click.'],
      ['🗺', 'Europa văzută prin ochii tăi', 'Bifezi orașele în care ai fost, îți salvezi scorul la quiz și descarci itinerariile în PDF.'],
    ]) { const li = el('li'); li.append(el('span', 'acct-perk-ico', icon)); const t = el('div'); t.append(el('strong', null, title), el('p', null, text)); li.append(t); perks.append(li); }
    const box = el('section', 'acct-card acct-auth');
    if (expired) box.append(el('p', 'acct-status', 'Linkul nu mai e valabil (expiră după o oră și merge o singură dată). Cere unul nou mai jos.'));
    box.append(A.loginForm({ title: 'Intră sau fă-ți cont', intro: 'Fără parolă. Dacă nu ai cont, îl creăm acum. E gratuit și îl poți șterge oricând.' }).form);
    const grid = el('div', 'acct-pitch'); grid.append(perks, box);
    main.replaceChildren(head, grid);
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

  function visitedCard() {
    const c = card('ORAȘE VIZITATE', 'Europa văzută prin ochii tăi');
    c.append(el('p', 'acct-intro', 'Harta orașelor în care ai fost, imaginea de share și scorul tău la „Ghicește orașul” sunt pe pagina Orașe vizitate.'));
    const actions = el('div', 'acct-actions');
    const a1 = el('a', 'acct-primary', 'Vezi orașele tale →'); a1.href = 'orase-vizitate.html';
    const a2 = el('a', 'acct-secondary', 'Joacă quizul'); a2.href = 'orase-vizitate.html#city-quiz';
    actions.append(a1, a2); c.append(actions);
    return c;
  }

  // Cât de complet e profilul: 4 lucruri care schimbă ce îi arătăm userului.
  function completeness(prefs) {
    let ev = null; try { ev = JSON.parse(localStorage.getItem('23cb-event-prefs')); } catch {}
    const hasEv = !!ev && ['music_genres', 'sports', 'competitions', 'other_interests', 'favorite_teams', 'favorite_artists'].some(k => ev[k]?.length);
    const items = [
      ['De unde pleci', !!prefs.departure_airports?.length, '#preferinte'],
      ['Bugetul pentru zbor', prefs.budget_max_eur != null, '#preferinte'],
      ['Vremea preferată', prefs.temp_min_c != null || prefs.temp_max_c != null, '#preferinte'],
      ['Ce evenimente urmărești', hasEv, '#interese'],
    ];
    const done = items.filter(x => x[1]).length;
    const box = el('div', 'acct-complete');
    const bar = el('div', 'acct-meter'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(items.length)); bar.setAttribute('aria-valuenow', String(done)); bar.setAttribute('aria-label', 'Profil completat');
    const fill = el('span'); fill.style.width = `${(done / items.length) * 100}%`; bar.append(fill);
    const list = el('ul', 'acct-check');
    for (const [label, ok, href] of items) { const li = el('li', ok ? 'ok' : null); const a = el('a', null, `${ok ? '✓' : '○'} ${label}`); a.href = href; li.append(a); list.append(li); }
    box.append(el('strong', null, done === items.length ? 'Profil complet. Mulțumim!' : `Profil completat: ${done} din ${items.length}`), bar, list);
    return box;
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
    const prefs = await A.preferences().catch(() => ({}));
    const head = el('div', 'acct-hello');
    head.append(el('span', 'acct-kicker', 'CONTUL TĂU'), greeting(), el('p', 'acct-intro', user.email),
      el('p', 'acct-lead', 'Cu cât îți completezi profilul mai exact, cu atât 23citybreak lucrează mai mult pentru tine. Zborurile din aeroportul tău și din bugetul tău apar primele, vremea pe care o preferi filtrează destinațiile, iar meciurile, concertele și festivalurile pe care le urmărești vin cu pachetul de weekend gata făcut. Durează două minute și le schimbi oricând.'),
      completeness(prefs));
    const grid = el('div', 'acct-grid');
    main.replaceChildren(head, grid);
    const news = await newsletterCard(sb, user);
    const interests = window.ProfileInterests ? await window.ProfileInterests.card(sb).catch(() => null) : null;
    if (interests) interests.id = 'interese';
    grid.append(news, await prefsCard(), ...(interests ? [interests] : []), visitedCard(), accountCard(sb, user));
    if (location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' });
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
