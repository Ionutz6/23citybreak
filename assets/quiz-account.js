// Faza 2 a quizului: email după joc (magic link Supabase, proiectul 23ai), clasament Europa, newsletter comun 23ai + 23citybreak.
(() => {
  const SUPABASE_URL = 'https://lsudthnrumslfscpppix.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdWR0aG5ydW1zbGZzY3BwcGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODY2MDEsImV4cCI6MjEwOTk2MjYwMX0.aw6KKBRKMdkfiAbzkHKUlpP2cuHhN-gF-GiUT5zHq5Y';
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  const QUIZ = 'ghiceste-orasul', PENDING = '23cb-quiz-pending', MIN_PLAYERS_FOR_PCT = 100;
  const TOKEN_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  const CONSENT = 'Vreau să primesc newsletterul 23ai și 23citybreak pe email (idei de city break, zboruri ieftine, noutăți 23ai). Mă pot dezabona oricând.';

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = n => Number(n).toLocaleString('ro-RO');
  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del: k => { try { localStorage.removeItem(k); } catch {} },
  };
  const hasSession = () => { try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; } };

  let clientPromise;
  const client = () => clientPromise ||= import(SDK).then(m => m.createClient(SUPABASE_URL, SUPABASE_KEY, {auth: {flowType: 'implicit', detectSessionInUrl: true, persistSession: true}}));

  async function save(sb, session, result, newsletter) {
    const user = session.user, meta = user.user_metadata || {};
    const wantsNews = newsletter ?? !!meta.newsletter;
    const row = {user_id: user.id, email: user.email, source: '23citybreak-quiz'};
    if (wantsNews) await sb.from('subscribers').upsert({...row, newsletter: true, consent_text: meta.consent_text || CONSENT, consent_at: new Date().toISOString(), unsubscribed_at: null});
    else await sb.from('subscribers').upsert(row, {ignoreDuplicates: true});
    if (result) {
      const {error} = await sb.from('quiz_scores').insert({quiz: QUIZ, score: result.score, correct: result.correct});
      if (error) throw error;
    }
    const {data, error} = await sb.rpc('my_quiz_rank', {p_quiz: QUIZ});
    if (error) throw error;
    sb.functions.invoke('quiz-result-email', {body: {quiz: QUIZ}}).catch(() => {});
    return Array.isArray(data) ? data[0] : data;
  }

  function rankPanel(target, rank, email, sb) {
    const box = el('div', 'quiz-rank');
    box.append(el('span', 'field-kicker', 'CLASAMENTUL EUROPA'));
    if (!rank || !rank.players) { box.append(el('p', null, 'Nu am putut calcula clasamentul acum.')); target.replaceChildren(box); return; }
    const big = rank.players >= MIN_PLAYERS_FOR_PCT
      ? `Ești în top ${rank.top_pct}%`
      : rank.players === 1 ? 'Ești primul jucător din clasament' : `Ești pe locul ${fmt(rank.rank)} din ${fmt(rank.players)}`;
    box.append(el('strong', 'quiz-rank-big', big));
    const detail = rank.players >= MIN_PLAYERS_FOR_PCT
      ? `dintre ${fmt(rank.players)} de jucători, cu cel mai bun scor al tău: ${fmt(rank.best)} puncte (${rank.best_correct}/10).`
      : `Cel mai bun scor al tău: ${fmt(rank.best)} puncte (${rank.best_correct}/10). Procentul apare de la ${MIN_PLAYERS_FOR_PCT} de jucători.`;
    box.append(el('p', null, detail));
    const foot = el('p', 'quiz-rank-foot', `Conectat ca ${email}. `);
    const out = el('button', 'quiz-link', 'Nu ești tu? Ieși'); out.type = 'button';
    out.addEventListener('click', async () => { await sb.auth.signOut(); target.replaceChildren(el('p', 'quiz-rank-foot', 'Ai ieșit din cont.')); });
    foot.append(out); box.append(foot);
    target.replaceChildren(box);
  }

  function emailForm(target, result) {
    const form = el('form', 'quiz-email');
    form.append(el('strong', 'quiz-email-title', 'Află în primii câți la sută ești'));
    form.append(el('p', null, 'Lasă-ți emailul și îți trimitem un link de confirmare. După ce îl apeși, vezi locul tău în clasamentul Europa și primești rezultatul pe email.'));
    const row = el('div', 'quiz-email-row');
    const input = el('input'); input.type = 'email'; input.required = true; input.autocomplete = 'email'; input.placeholder = 'adresa@email.ro'; input.setAttribute('aria-label', 'Adresa de email');
    const send = el('button', 'quiz-primary', 'Trimite linkul ↗'); send.type = 'submit';
    row.append(input, send);
    const label = el('label', 'quiz-consent');
    const box = el('input'); box.type = 'checkbox';
    label.append(box, el('span', null, CONSENT));
    const note = el('p', 'quiz-rank-foot', 'Emailul e folosit pentru clasament și pentru rezultat. Datele sunt păstrate de 23ai. Fără bifă nu primești newsletter.');
    const status = el('p', 'quiz-email-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    form.append(row, label, note, status);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      send.disabled = true; status.textContent = 'Se trimite...';
      store.set(PENDING, {...result, newsletter: box.checked, at: Date.now()});
      try {
        const sb = await client();
        const {error} = await sb.auth.signInWithOtp({email: input.value.trim(), options: {emailRedirectTo: location.origin + location.pathname, data: {newsletter: box.checked, consent_text: box.checked ? CONSENT : null}}});
        if (error) throw error;
        form.replaceChildren(el('strong', 'quiz-email-title', 'Verifică-ți emailul'), el('p', null, `Ți-am trimis un link pe ${input.value.trim()}. Apasă-l (pe orice dispozitiv) și vezi locul tău în clasament. Scorul acesta e păstrat.`));
      } catch (err) {
        send.disabled = false;
        status.textContent = /rate|limit|seconds/i.test(err?.message || '') ? 'Ai cerut deja un link. Încearcă din nou peste un minut.' : 'Nu am putut trimite emailul acum. Încearcă din nou puțin mai târziu.';
      }
    });
    target.replaceChildren(form);
  }

  async function mount(target, result) {
    if (!hasSession()) { emailForm(target, result); return; }
    target.replaceChildren(el('p', 'quiz-rank-foot', 'Se calculează clasamentul...'));
    try {
      const sb = await client();
      const {data: {session}} = await sb.auth.getSession();
      if (!session) { emailForm(target, result); return; }
      rankPanel(target, await save(sb, session, result), session.user.email, sb);
    } catch { target.replaceChildren(el('p', 'quiz-rank-foot', 'Nu am putut salva scorul acum.')); }
  }

  // Întoarcerea din linkul primit pe email.
  async function resume() {
    const fromLink = /access_token=|error_description=/.test(location.hash);
    const pending = store.get(PENDING);
    if (!fromLink && !(pending && hasSession())) return;
    const quiz = window.Quiz; if (!quiz) return;
    const section = document.getElementById('city-quiz');
    const content = quiz.content;
    const show = nodes => { content.replaceChildren(...nodes); section.scrollIntoView({block: 'start'}); };
    const again = el('button', 'quiz-primary', 'Joacă din nou ↻'); again.type = 'button';
    again.addEventListener('click', () => quiz.start());
    const actions = el('div', 'quiz-actions'); actions.append(again);
    if (/error_description=/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search + '#city-quiz');
      show([el('span', 'field-kicker', 'LINK EXPIRAT'), el('h3', null, 'Linkul nu mai e valabil'), el('p', null, 'Linkurile de confirmare expiră după o oră și merg o singură dată. Joacă din nou și cere un link nou.'), actions]);
      return;
    }
    const target = el('div', 'quiz-account');
    show([el('h3', null, 'Email confirmat'), target, actions]);
    target.append(el('p', 'quiz-rank-foot', 'Se calculează clasamentul...'));
    try {
      const sb = await client();
      const {data: {session}} = await sb.auth.getSession();
      history.replaceState(null, '', location.pathname + location.search + '#city-quiz');
      if (!session) { target.replaceChildren(el('p', null, 'Nu am putut confirma emailul. Încearcă din nou.')); return; }
      const rank = await save(sb, session, pending, pending ? pending.newsletter : null);
      store.del(PENDING);
      rankPanel(target, rank, session.user.email, sb);
    } catch { target.replaceChildren(el('p', null, 'Nu am putut salva scorul acum. Încearcă din nou puțin mai târziu.')); }
  }

  window.QuizAccount = {mount};
  resume();
})();
