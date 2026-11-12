// Contul 23ai pe 23citybreak: login cu magic link (Supabase, proiectul 23ai), buton în header,
// onboarding în 2 pași pentru conturile noi, banner periodic pentru newsletter.
// Schema și contractul window.Account: supabase/SCHEMA.md
(() => {
  const SUPABASE_URL = 'https://lsudthnrumslfscpppix.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdWR0aG5ydW1zbGZzY3BwcGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODY2MDEsImV4cCI6MjEwOTk2MjYwMX0.aw6KKBRKMdkfiAbzkHKUlpP2cuHhN-gF-GiUT5zHq5Y';
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  const TOKEN_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  const CONSENT = 'Vreau să primesc newsletterul 23ai și 23citybreak pe email (idei de city break, zboruri ieftine, noutăți 23ai). Mă pot dezabona oricând.';
  const PROFILE_URL = 'cont.html';
  const BANNER_KEY = '23cb-nl-banner', BANNER_EVERY_DAYS = 14, BANNER_DELAY_MS = 20000;
  const LOGIN_PENDING = '23cb-login-pending';

  const AIRPORTS = [
    ['OTP', 'București Otopeni'], ['BBU', 'București Băneasa'], ['CLJ', 'Cluj-Napoca'], ['IAS', 'Iași'],
    ['TSR', 'Timișoara'], ['SBZ', 'Sibiu'], ['BCM', 'Bacău'], ['SCV', 'Suceava'], ['CND', 'Constanța'],
    ['CRA', 'Craiova'], ['OMR', 'Oradea'], ['TGM', 'Târgu Mureș'],
    ['VLC', 'Valencia'], ['ALC', 'Alicante'], ['PAR', 'Paris (toate aeroporturile)'], ['MUC', 'München'], ['FRA', 'Frankfurt'],
  ];
  const BUDGETS = [100, 150, 200, 300, 500, null];
  // Bugetul se salvează mereu în EUR; în RON afișăm o valoare orientativă (≈5 lei/€, rotunjit la 50), ca în căutare.
  const budgetLabel = (v, cur) => v == null ? 'fără limită' : cur === 'RON' ? `până la ~${new Intl.NumberFormat('ro-RO').format(Math.round(v * 5 / 50) * 50)} RON` : `până la ${v} €`;
  const CURRENCIES = [['EUR', 'Euro (€)'], ['RON', 'Lei (RON)']];
  const TEMPS = [
    ['cool', 'Răcoare', 'sub 15°C', null, 15], ['mild', 'Plăcut', '15–25°C', 15, 25],
    ['warm', 'Cald', 'peste 25°C', 25, null], ['any', 'Oricum', 'nu contează', null, null],
  ];
  const DEFAULT_PREFS = {departure_airports: [], budget_max_eur: null, temp_min_c: null, temp_max_c: null, city_mode: 'any', currency: 'EUR'};
  const pickPrefs = r => Object.fromEntries(Object.keys(DEFAULT_PREFS).filter(k => r && k in r && r[k] !== undefined).map(k => [k, r[k]]));
  // Coloana currency vine dintr-o migrare separată (20261112_moneda.sql). Până e rulată, salvăm fără ea.
  const missingCurrencyCol = e => !!e && /currency/i.test(`${e.message || ''} ${e.details || ''}`) && /column|schema/i.test(e.message || '');
  async function upsertPrefs(sb, prefs) {
    let res = await sb.from('search_preferences').upsert(prefs);
    if (missingCurrencyCol(res.error)) { const {currency, ...rest} = prefs; res = await sb.from('search_preferences').upsert(rest); }
    return res;
  }

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del: k => { try { localStorage.removeItem(k); } catch {} },
  };
  const hasSession = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; } };
  const emit = () => window.dispatchEvent(new CustomEvent('account:change'));
  const onProfilePage = () => /\/cont(\.html)?$/.test(location.pathname);

  let clientPromise;
  const client = () => clientPromise ||= import(SDK).then(m => {
    const sb = m.createClient(SUPABASE_URL, SUPABASE_KEY, {auth: {flowType: 'implicit', detectSessionInUrl: true, persistSession: true}});
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(() => { updateHeader(); emit(); }, 0); });
    return sb;
  });
  const session = async () => { if (!hasSession() && !/access_token=/.test(location.hash)) return null; const sb = await client(); return (await sb.auth.getSession()).data.session; };

  async function preferences() {
    const s = await session(); if (!s) return {...DEFAULT_PREFS};
    const sb = await client();
    const {data} = await sb.from('search_preferences').select('*').maybeSingle();
    // Fără coloana currency în bază, păstrăm alegerea locală (aceeași cheie ca assets/personalizare.js).
    const local = store.get('23cb-prefs');
    return {...DEFAULT_PREFS, ...(data && !('currency' in data) && local?.currency ? {currency: local.currency} : {}), ...pickPrefs(data)};
  }

  // Abonarea: rândul din subscribers. Bifa de consimțământ + confirmarea prin magic link = double opt-in.
  async function saveSubscriber(sb, user, newsletter, source) {
    const row = {user_id: user.id, email: user.email, source};
    if (newsletter === true) return sb.from('subscribers').upsert({...row, newsletter: true, consent_text: CONSENT, consent_at: new Date().toISOString(), unsubscribed_at: null});
    if (newsletter === false) return sb.from('subscribers').upsert({...row, newsletter: false, unsubscribed_at: new Date().toISOString()});
    return sb.from('subscribers').upsert(row, {ignoreDuplicates: true});
  }
  async function isSubscribed() {
    const s = await session(); if (!s) return false;
    const {data} = await (await client()).from('subscribers').select('newsletter').maybeSingle();
    return !!data?.newsletter;
  }

  // ---------- Fereastra de login ----------
  let dialog;
  function loginForm({title, intro, source = '23citybreak-cont', redirect = PROFILE_URL, onSent} = {}) {
    const form = el('form', 'acct-form');
    form.append(el('strong', 'acct-title', title || 'Intră în contul tău'));
    form.append(el('p', 'acct-intro', intro || 'Fără parolă: îți trimitem un link pe email. Îl apeși și ești conectat. Dacă nu ai cont, îl creăm atunci.'));
    const row = el('div', 'acct-row');
    const input = el('input', 'acct-input'); input.type = 'email'; input.required = true; input.autocomplete = 'email'; input.placeholder = 'adresa@email.ro'; input.setAttribute('aria-label', 'Adresa de email');
    const send = el('button', 'acct-primary', 'Trimite linkul ↗'); send.type = 'submit';
    row.append(input, send);
    const label = el('label', 'acct-consent');
    const box = el('input'); box.type = 'checkbox';
    label.append(box, el('span', null, CONSENT));
    const note = el('p', 'acct-note', 'Fără bifă nu primești newsletter. Datele sunt păstrate de 23ai și le poți șterge oricând din cont.');
    const status = el('p', 'acct-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    form.append(row, label, note, status);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = input.value.trim();
      send.disabled = true; status.textContent = 'Se trimite...';
      store.set(LOGIN_PENDING, {newsletter: box.checked, source, at: Date.now()});
      try {
        const sb = await client();
        const target = new URL(redirect, location.href).href;
        const {error} = await sb.auth.signInWithOtp({email, options: {emailRedirectTo: target, data: {newsletter: box.checked, consent_text: box.checked ? CONSENT : null}}});
        if (error) throw error;
        form.replaceChildren(el('strong', 'acct-title', 'Verifică-ți emailul'), el('p', 'acct-intro', `Ți-am trimis un link pe ${email}. Apasă-l pe acest dispozitiv ca să intri în cont. Linkul e valabil o oră.`));
        onSent?.();
      } catch (err) {
        send.disabled = false;
        status.textContent = /rate|limit|seconds/i.test(err?.message || '') ? 'Ai cerut deja un link. Încearcă din nou peste un minut.' : 'Nu am putut trimite emailul acum. Încearcă din nou puțin mai târziu.';
      }
    });
    return {form, input};
  }

  function openLogin(opts) {
    if (!dialog) {
      dialog = el('dialog', 'acct-dialog');
      dialog.setAttribute('aria-label', 'Intră în cont');
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    const close = el('button', 'acct-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Închide');
    close.addEventListener('click', () => dialog.close());
    const {form, input} = loginForm(opts);
    dialog.replaceChildren(close, form);
    dialog.showModal();
    input.focus();
  }

  // ---------- Header ----------
  function updateHeader() {
    const btn = document.getElementById('account-link'); if (!btn) return;
    btn.textContent = hasSession() ? 'Contul tău' : 'Intră';
    btn.hidden = false;
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('#account-link'); if (!btn) return;
    e.preventDefault();
    if (hasSession()) { if (!onProfilePage()) location.href = PROFILE_URL; }
    else openLogin();
  });

  // ---------- Întoarcerea din linkul de login ----------
  // Salvează alegerea de newsletter făcută la login și pornește onboardingul dacă e cont nou.
  async function afterLogin() {
    const fromLink = /access_token=/.test(location.hash);
    const pending = store.get(LOGIN_PENDING);
    if (!fromLink && !pending) return null;
    const s = await session(); if (!s) return null;
    const sb = await client();
    // Alegerea vine din localStorage sau, dacă linkul e deschis în alt browser, din metadatele contului.
    const meta = s.user.user_metadata || {};
    const wants = pending ? pending.newsletter : !!meta.newsletter;
    await saveSubscriber(sb, s.user, wants ? true : null, pending?.source || '23citybreak-cont').catch(() => {});
    store.del(LOGIN_PENDING);
    if (fromLink) history.replaceState(null, '', location.pathname + location.search);
    return s;
  }

  async function needsOnboarding() {
    const s = await session(); if (!s) return false;
    const {data} = await (await client()).from('profiles').select('onboarding_done_at').maybeSingle();
    return !data?.onboarding_done_at;
  }

  // ---------- Onboarding (2 pași, fiecare se poate sări) ----------
  function chip(text, sub, pressed) {
    const b = el('button', 'acct-chip'); b.type = 'button';
    b.append(el('span', null, text)); if (sub) b.append(el('small', null, sub));
    b.setAttribute('aria-pressed', String(!!pressed));
    return b;
  }

  // Formularul de preferințe, folosit în onboarding și în profil. Întoarce {node, read()}.
  function prefsForm(prefs) {
    const node = el('div', 'acct-prefs');
    const state = {...DEFAULT_PREFS, ...prefs, departure_airports: [...(prefs.departure_airports || [])]};

    const g1 = el('fieldset', 'acct-group'); g1.append(el('legend', null, 'De unde pleci de obicei?'), el('p', 'acct-hint', 'Poți alege mai multe aeroporturi.'));
    const air = el('div', 'acct-chips');
    for (const [code, name] of AIRPORTS) {
      const b = chip(name, code, state.departure_airports.includes(code));
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        state.departure_airports = on ? [...state.departure_airports, code] : state.departure_airports.filter(c => c !== code);
      });
      air.append(b);
    }
    g1.append(air);

    const single = (legend, hint, items, isOn, pick) => {
      const g = el('fieldset', 'acct-group'); g.append(el('legend', null, legend)); if (hint) g.append(el('p', 'acct-hint', hint));
      const wrap = el('div', 'acct-chips'); const btns = [];
      for (const it of items) {
        const b = chip(it.label, it.sub, isOn(it)); btns.push(b);
        b.addEventListener('click', () => { btns.forEach(x => x.setAttribute('aria-pressed', String(x === b))); pick(it); });
        wrap.append(b);
      }
      g.append(wrap); return g;
    };
    if (!['EUR', 'RON'].includes(state.currency)) state.currency = 'EUR';
    const budgetItems = BUDGETS.map(v => ({v, label: budgetLabel(v, state.currency)}));
    const g2 = single('Bugetul pentru zbor', 'Dus-întors, de persoană.', budgetItems,
      it => it.v === state.budget_max_eur, it => { state.budget_max_eur = it.v; });
    const relabelBudgets = () => [...g2.querySelectorAll('.acct-chip > span')].forEach((s, i) => { s.textContent = budgetLabel(BUDGETS[i], state.currency); });
    const g5 = single('În ce monedă vezi prețurile?', 'Kiwi dă prețurile în EUR; în RON le convertim cu cursul BCE al zilei.', CURRENCIES.map(([v, label]) => ({v, label})),
      it => it.v === state.currency, it => { state.currency = it.v; relabelBudgets(); });
    const tempKey = (TEMPS.find(t => t[3] === state.temp_min_c && t[4] === state.temp_max_c) || TEMPS[3])[0];
    const g3 = single('Ce vreme îți place la destinație?', null, TEMPS.map(([k, label, sub, min, max]) => ({k, label, sub, min, max})),
      it => it.k === tempKey, it => { state.temp_min_c = it.min; state.temp_max_c = it.max; });
    const g4 = single('Ce orașe să-ți arătăm?', 'Se aplică la toate căutările. Schimbi oricând din Profilul meu.', [{v: 'new', label: 'Doar orașe noi', sub: 'pe care nu le-am văzut'}, {v: 'any', label: 'Oricare', sub: 'inclusiv cele văzute'}],
      it => it.v === state.city_mode, it => { state.city_mode = it.v; });

    node.append(g1, g5, g2, g3, g4);
    return {node, read: () => ({...state})};
  }

  async function savePrefs(prefs) {
    const sb = await client();
    const {error} = await upsertPrefs(sb, pickPrefs(prefs));
    if (error) throw error;
    // Și local, ca pagina de căutare să aplice moneda imediat, chiar înainte să citească din cont.
    if (prefs.currency) store.set('23cb-prefs', {...(store.get('23cb-prefs') || {}), currency: prefs.currency});
    emit();
  }
  async function markOnboarded() {
    const sb = await client();
    await sb.from('profiles').upsert({onboarding_done_at: new Date().toISOString()});
  }

  async function runOnboarding(host) {
    const s = await session(); if (!s) return;
    const sb = await client();
    const wrap = el('section', 'acct-onboarding'); wrap.setAttribute('aria-label', 'Configurează-ți contul');
    host.prepend(wrap);
    wrap.scrollIntoView({block: 'start'});
    const finish = async () => { await markOnboarded().catch(() => {}); wrap.remove(); emit(); };

    const step = (n, title, intro, body, primary, onPrimary) => {
      const head = el('div', 'acct-step-head');
      head.append(el('span', 'acct-kicker', `PASUL ${n} DIN 2`), el('h2', null, title), el('p', 'acct-intro', intro));
      const actions = el('div', 'acct-actions');
      const go = el('button', 'acct-primary', primary); go.type = 'button';
      const skip = el('button', 'acct-link', 'Sari peste'); skip.type = 'button';
      const status = el('p', 'acct-status'); status.setAttribute('role', 'status');
      actions.append(go, skip, status);
      wrap.replaceChildren(head, body, actions);
      head.querySelector('h2').tabIndex = -1; head.querySelector('h2').focus({preventScroll: true});
      return {go, skip, status, run: fn => go.addEventListener('click', async () => { go.disabled = true; try { await fn(); } catch { go.disabled = false; status.textContent = 'Nu am putut salva acum. Încearcă din nou.'; } })};
    };

    const step2 = () => {
      const body = el('div', 'acct-visited');
      mountVisited(body, sb, s.user, 'onboarding');
      const st = step(2, 'Ce orașe ai văzut deja?', 'Le marcăm pe hartă și, dacă vrei, îți arătăm la căutare doar orașe noi.', body, 'Gata ✓');
      st.run(finish); st.skip.addEventListener('click', finish);
    };

    const prefs = prefsForm(await preferences());
    const st1 = step(1, 'Cum îți place să călătorești?', 'Folosim răspunsurile ca să-ți arătăm întâi zborurile potrivite. Durează 20 de secunde.', prefs.node, 'Continuă →');
    st1.run(async () => { await savePrefs(prefs.read()); step2(); });
    st1.skip.addEventListener('click', step2);
  }

  // Harta orașelor văzute vine din alt modul (window.VisitedCities). Până atunci, un placeholder.
  function mountVisited(container, sb, user, mode) {
    if (window.VisitedCities?.mount) { try { window.VisitedCities.mount(container, {client: sb, user, mode}); return; } catch {} }
    const ph = el('div', 'acct-placeholder');
    ph.append(el('strong', null, 'Harta Europei vine în curând'), el('p', null, 'Aici vei putea marca pe hartă orașele în care ai fost și vei primi imaginea „X orașe văzute” pentru share.'));
    container.replaceChildren(ph);
  }

  // ---------- Banner newsletter ----------
  // Apare o dată la 14 zile, după 20 de secunde pe pagină, doar pentru cine nu e abonat. Nu apare pe pagina de cont.
  async function maybeBanner() {
    if (onProfilePage() || document.querySelector('.acct-banner')) return;
    const last = store.get(BANNER_KEY);
    if (last?.subscribed) return;
    if (last?.at && Date.now() - last.at < BANNER_EVERY_DAYS * 864e5) return;
    if (hasSession() && await isSubscribed().catch(() => true)) { store.set(BANNER_KEY, {subscribed: true}); return; }

    const bar = el('aside', 'acct-banner'); bar.setAttribute('aria-label', 'Newsletter');
    const text = el('div', 'acct-banner-text');
    text.append(el('strong', null, 'Zboruri ieftine de weekend, direct pe email'), el('span', null, 'Cele mai bune city break-uri din România, o dată pe săptămână. Fără spam.'));
    const close = el('button', 'acct-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Închide');
    const dismiss = () => { store.set(BANNER_KEY, {at: Date.now()}); bar.remove(); };
    close.addEventListener('click', dismiss);
    const cta = el('button', 'acct-primary', hasSession() ? 'Abonează-mă' : 'Vreau newsletterul ↗'); cta.type = 'button';
    const status = el('span', 'acct-status'); status.setAttribute('role', 'status');
    cta.addEventListener('click', async () => {
      if (!hasSession()) {
        dismiss();
        openLogin({title: 'Abonează-te la newsletter', intro: 'Lasă-ți emailul, bifează abonarea și confirmă din linkul primit. Primești și un cont, fără parolă.', source: '23citybreak-banner'});
        return;
      }
      // Cont conectat = email deja confirmat. Afișăm textul de consimțământ înainte de buton.
      cta.disabled = true;
      try {
        const s = await session(); await saveSubscriber(await client(), s.user, true, '23citybreak-banner');
        store.set(BANNER_KEY, {subscribed: true});
        bar.replaceChildren(el('strong', null, 'Gata, te-ai abonat. Mulțumim!'));
        setTimeout(() => bar.remove(), 3500);
      } catch { cta.disabled = false; status.textContent = 'Nu a mers acum. Încearcă din nou.'; }
    });
    const consent = el('small', 'acct-banner-consent', hasSession() ? `Apăsând „Abonează-mă”: ${CONSENT}` : 'Abonarea se confirmă prin email.');
    const right = el('div', 'acct-banner-actions'); right.append(cta, status);
    bar.append(text, right, consent, close);
    document.body.append(bar);
  }

  window.Account = {
    client, session, hasSession, preferences, savePrefs, openLogin, loginForm, prefsForm, saveSubscriber, isSubscribed,
    afterLogin, needsOnboarding, runOnboarding, mountVisited, updateHeader, CONSENT,
  };

  updateHeader();
  if (!onProfilePage()) {
    setTimeout(() => { maybeBanner(); }, BANNER_DELAY_MS);
    // Cont creat din altă parte (ex. quiz) și onboarding neparcurs: o invitație discretă spre profil, o dată pe sesiune.
    setTimeout(onboardingNudge, 4000);
  }

  async function onboardingNudge() {
    if (!hasSession()) return;
    try { if (sessionStorage.getItem('23cb-onb-nudge')) return; sessionStorage.setItem('23cb-onb-nudge', '1'); } catch {}
    if (!(await needsOnboarding().catch(() => false))) return;
    const bar = el('aside', 'acct-banner'); bar.setAttribute('aria-label', 'Configurează-ți contul');
    const text = el('div', 'acct-banner-text');
    text.append(el('strong', null, 'Spune-ne cum îți place să călătorești'), el('span', null, 'Aeroporturi, buget, vreme și orașele deja văzute. Durează un minut.'));
    const go = el('a', 'acct-primary', 'Configurează contul →'); go.href = PROFILE_URL;
    const close = el('button', 'acct-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Închide');
    close.addEventListener('click', () => bar.remove());
    const right = el('div', 'acct-banner-actions'); right.append(go);
    bar.append(text, right, close);
    if (!document.querySelector('.acct-banner')) document.body.append(bar);
  }
})();
