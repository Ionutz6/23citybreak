(() => {
  // Rulează pe orase-vizitate.html (hub-ul). Datele vin din assets/europe-cities.js și assets/illustrated-guides.js.
  const illustratedGuides = window.CB_ILLUSTRATED_GUIDES, ALL_EUROPE_CITIES = window.CB_EUROPE_CITIES;
  if (!illustratedGuides || !ALL_EUROPE_CITIES) return;
  // Ordered against the original, unlabelled map assets saved for the quiz.
  const slugs = 'edinburgh,budapesta,bruxelles,chisinau,viena,lyon,porto,bologna,paris,milano,venetia,copenhaga,madrid,barcelona,atena,roma,pisa-florenta,napoli,amsterdam,nisa,londra,istanbul,lisabona,varsovia,berlin,dublin,valencia,sevilla,cracovia,malaga,munchen,bari,split,stockholm,dubrovnik,palermo,salonic,zurich,catania,bratislava,tallinn,oslo,marsilia,bordeaux,riga,sofia,helsinki,bruges,belgrad,vilnius,ljubljana,glasgow,koln-bonn,stuttgart,frankfurt,bremen,bilbao,dortmund,leeds,toulouse,strasbourg,lille,birmingham,genova,leipzig,eindhoven,newcastle,cagliari'.split(',');
  // Primele 68 rămân în ordinea fixă (imaginea lor vine după poziție). Orice alt ghid cu quizImage intră automat, la coadă.
  const extra = Object.values(illustratedGuides).filter(g => g.quizImage && g.image && !slugs.includes(g.image)).map(g => g.image);
  const questions = [...slugs, ...extra].map((slug, i) => {
    const entry = Object.entries(illustratedGuides).find(([, guide]) => guide.image === slug);
    if (!entry) return null;
    const [id, guide] = entry;
    const city = ALL_EUROPE_CITIES.find(c => c.id === id);
    if (!city) return null;
    return {id, guide, name: slug === 'pisa-florenta' ? 'Pisa și Florența' : slug === 'koln-bonn' ? 'Köln' : city.name, image: guide.quizImage || `ilustratii-quiz/800/ilustratie-${String(i+1).padStart(3,'0')}.webp`};
  }).filter(Boolean);
  const section = document.getElementById('city-quiz');
  if (questions.length < 10) return;
  section.hidden = false;

  // BONUS_SECONDS rămâne 15: bonusul scade la fel ca înainte, deci scorurile rămân comparabile cu recordurile vechi.
  const ROUNDS = 10, SECONDS = 20, BONUS_SECONDS = 15, BASE = 100, MAX_BONUS = 50, MAX_SCORE = ROUNDS * (BASE + MAX_BONUS);
  const SITE = 'https://23citybreak.ro/orase-vizitate.html#city-quiz', BEST_KEY = '23cb-quiz-best';
  const $ = id => document.getElementById(id);
  const card = $('quiz-card'), image = $('quiz-image'), content = $('quiz-content');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shuffle = array => { const r = [...array]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = n => n.toLocaleString('ro-RO');
  const readBest = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; } catch { return null; } };
  const writeBest = v => { try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch {} };
  const rating = c => c === 10 ? 'Cetățean al Europei' : c >= 8 ? 'Expert în city break-uri' : c >= 5 ? 'Călător pasionat' : c >= 2 ? 'Turist curios' : 'Abia începi să explorezi';

  let game, timerId, shareBlob;

  function goToFlights(cityId) {
    // Pe prima pagină (vechiul loc al quizului) selectăm direct; altfel deschidem căutarea cu orașul ales.
    if (typeof selectDestination !== 'function' || !$('configurator')) { location.href = `./?dest=${encodeURIComponent(cityId)}#configurator`; return; }
    selectDestination(cityId);
    $('configurator').scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth'});
    $('dest-search-input').focus({preventScroll: true});
  }

  function showStart() {
    card.classList.remove('is-result');
    image.src = shuffle(questions)[0].image;
    image.alt = 'Ilustrație a unei destinații europene de ghicit';
    const best = readBest();
    const kicker = el('span', 'field-kicker', 'MICUL QUIZ DE WEEKEND');
    const h = el('h3', null, '10 orașe. Câte recunoști?');
    const p = el('p', null, `Ai ${SECONDS} de secunde pentru fiecare ilustrație. Primești ${BASE} de puncte pentru fiecare răspuns corect și până la ${MAX_BONUS} bonus dacă răspunzi repede (bonusul scade în primele ${BONUS_SECONDS} secunde).`);
    const start = el('button', 'quiz-primary quiz-start', 'Începe quizul ↗'); start.type = 'button';
    start.addEventListener('click', startGame);
    content.replaceChildren(kicker, h, p);
    if (best) content.append(el('p', 'quiz-best', `Cel mai bun scor al tău: ${fmt(best.score)} puncte (${best.correct}/10)`));
    const actions = el('div', 'quiz-actions'); actions.append(start); content.append(actions);
  }

  function startGame() {
    const picked = shuffle(questions).slice(0, ROUNDS);
    game = {rounds: picked, index: 0, score: 0, correct: 0, results: []};
    picked.forEach(q => { const img = new Image(); img.src = q.image; });
    renderRound();
  }

  function renderRound() {
    const q = game.rounds[game.index];
    const choices = shuffle([q, ...shuffle(questions.filter(o => o !== q && o.name !== q.name)).slice(0, 3)]);
    const top = el('div', 'quiz-top');
    top.append(el('span', 'quiz-step', `Întrebarea ${game.index + 1}/${ROUNDS}`), el('span', 'quiz-score', `${fmt(game.score)} puncte`));
    const bar = el('div', 'quiz-timer'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Timp rămas'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(SECONDS));
    const fill = el('span'); bar.append(fill);
    const secs = el('span', 'quiz-seconds', `${SECONDS} s`);
    const h = el('h3', null, 'Recunoști locul?');
    const options = el('div', 'quiz-options'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Alege destinația');
    const feedback = el('div', 'quiz-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true;
    const actions = el('div', 'quiz-actions'); actions.hidden = true;
    content.replaceChildren(top, bar, secs, h, options, feedback, actions);

    let started = 0, done = false;
    const finish = choice => {
      if (done) return; done = true; cancelAnimationFrame(timerId);
      const elapsed = started ? (performance.now() - started) / 1000 : SECONDS;
      const ok = choice === q;
      const bonus = ok ? Math.round(MAX_BONUS * Math.max(0, BONUS_SECONDS - elapsed) / BONUS_SECONDS) : 0;
      const points = ok ? BASE + bonus : 0;
      game.score += points; if (ok) game.correct++;
      game.results.push({q, ok, points});
      top.lastChild.textContent = `${fmt(game.score)} puncte`;
      options.querySelectorAll('button').forEach(b => { b.disabled = true; if (b.textContent === q.name) b.classList.add('correct'); if (choice && b === choice.button && !ok) b.classList.add('wrong'); });
      const heading = el('strong', null, ok ? `Corect! ${q.name}. +${points} puncte` : choice ? `Aproape! Răspunsul este ${q.name}.` : `Timpul a expirat. Era ${q.name}.`);
      if (ok && bonus) heading.append(el('em', null, ` (bonus de viteză +${bonus})`));
      const landmarks = q.guide.legend.slice(0, 2).map(place => place[1]);
      feedback.replaceChildren(heading, el('span', null, `De descoperit: ${landmarks.join(' și ')}.`)); feedback.hidden = false;
      const last = game.index === ROUNDS - 1;
      const next = el('button', 'quiz-primary', last ? 'Vezi scorul ↗' : 'Următorul oraș →'); next.type = 'button';
      next.addEventListener('click', () => { if (last) showResult(); else { game.index++; renderRound(); } content.querySelector('button')?.focus({preventScroll: true}); });
      actions.replaceChildren(next); actions.hidden = false; next.focus({preventScroll: true});
    };
    choices.forEach(choice => {
      const b = el('button', 'quiz-option', choice.name); b.type = 'button'; choice.button = b;
      b.addEventListener('click', () => finish(choice));
      options.append(b);
    });

    const tick = now => {
      const left = Math.max(0, SECONDS - (now - started) / 1000);
      fill.style.transform = `scaleX(${left / SECONDS})`;
      bar.classList.toggle('is-low', left < 5);
      bar.setAttribute('aria-valuenow', String(Math.ceil(left)));
      secs.textContent = `${Math.ceil(left)} s`;
      if (left <= 0) finish(null); else timerId = requestAnimationFrame(tick);
    };
    const begin = () => { if (started || done) return; started = performance.now(); timerId = requestAnimationFrame(tick); };
    image.alt = `Ilustrația ${game.index + 1} din ${ROUNDS}: ce oraș este?`;
    image.onload = begin; image.onerror = begin;
    image.src = q.image;
    if (image.complete && image.naturalWidth) begin();
  }

  function showResult() {
    const {score, correct, results} = game;
    const prev = readBest();
    const isRecord = !prev || score > prev.score;
    if (isRecord) writeBest({score, correct, at: new Date().toISOString()});
    card.classList.add('is-result');

    const kicker = el('span', 'field-kicker', isRecord && prev ? 'RECORD PERSONAL NOU' : 'REZULTATUL TĂU');
    const big = el('div', 'quiz-final');
    big.append(el('strong', null, `${correct}/10`), el('span', null, `${fmt(score)} puncte din ${fmt(MAX_SCORE)}`));
    const h = el('h3', null, rating(correct));
    const best = el('p', 'quiz-best', isRecord ? (prev ? `Ai depășit recordul de ${fmt(prev.score)} puncte.` : 'Acesta este primul tău scor. Poți juca din nou ca să-l îmbunătățești.') : `Cel mai bun scor al tău rămâne ${fmt(prev.score)} puncte (${prev.correct}/10).`);

    const list = el('ol', 'quiz-recap');
    results.forEach(r => {
      const li = el('li', r.ok ? 'ok' : 'ko');
      const b = el('button', null); b.type = 'button'; b.title = `Caută zboruri spre ${r.q.name}`;
      b.append(el('span', 'mark', r.ok ? '✓' : '✗'), el('span', 'name', r.q.name), el('span', 'pts', r.ok ? `+${r.points}` : '0'));
      b.addEventListener('click', () => goToFlights(r.q.id));
      li.append(b);
      const hub = window.Hub, vid = r.q.id.replace(/^City:/, '');
      if (hub?.canMark(vid)) {
        const mark = el('button', 'quiz-been'); mark.type = 'button';
        const paint = () => { const on = hub.isVisited(vid); mark.textContent = on ? '✓ Am fost' : '+ Am fost'; mark.classList.toggle('is-on', on); mark.setAttribute('aria-pressed', String(on)); mark.setAttribute('aria-label', `${on ? 'Scoate' : 'Marchează'} ${r.q.name} ca oraș vizitat`); };
        mark.addEventListener('click', () => { hub.toggle(vid); paint(); });
        paint(); li.classList.add('has-been'); li.append(mark);
      }
      list.append(li);
    });
    const recapLabel = el('p', 'quiz-recap-label', window.Hub ? 'Apasă pe un oraș ca să cauți zboruri de weekend. Ai fost deja acolo? Bifează „Am fost” și apare pe harta ta.' : 'Apasă pe un oraș ca să cauți zboruri de weekend.');

    const text = `Am ghicit ${correct}/10 orașe și am făcut ${fmt(score)} puncte la quizul „Ghicește orașul” de pe 23citybreak.ro. Tu câte recunoști?`;
    const actions = el('div', 'quiz-actions quiz-share');
    const shareBtn = el('button', 'quiz-primary', 'Distribuie imaginea ↗'); shareBtn.type = 'button';
    if (!navigator.share) shareBtn.hidden = true;
    const wa = el('a', 'quiz-wa', 'WhatsApp'); wa.href = `https://wa.me/?text=${encodeURIComponent(`${text} ${SITE}`)}`; wa.target = '_blank'; wa.rel = 'noopener';
    const dl = el('button', 'quiz-next', 'Descarcă imaginea'); dl.type = 'button';
    const again = el('button', 'quiz-next', 'Joacă din nou ↻'); again.type = 'button';
    actions.append(shareBtn, wa, dl, again);
    const hint = el('p', 'quiz-recap-label', 'Pentru Instagram: descarcă imaginea și adaug-o la story sau la o postare.');
    const account = el('div', 'quiz-account');
    content.replaceChildren(kicker, big, h, best, account, actions, hint, recapLabel, list);
    window.QuizAccount?.mount(account, {score, correct, cards: results.map(r => ({image: r.q.image, ok: r.ok}))});
    window.dispatchEvent(new CustomEvent('quiz:finished', {detail: {score, correct}}));

    shareBlob = null;
    image.onload = image.onerror = null;
    image.alt = `Cartonașul tău de scor: ${correct}/10, ${score} puncte`;
    buildShareImage(game).then(blob => { shareBlob = blob; image.src = URL.createObjectURL(blob); }).catch(() => { shareBtn.hidden = true; dl.hidden = true; hint.hidden = true; });

    const filename = `23citybreak-quiz-${score}.png`;
    const download = () => { if (!shareBlob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(shareBlob); a.download = filename; document.body.append(a); a.click(); a.remove(); };
    shareBtn.addEventListener('click', async () => {
      const file = shareBlob && new File([shareBlob], filename, {type: 'image/png'});
      if (file && navigator.canShare?.({files: [file]})) { try { await navigator.share({files: [file], text: `${text} ${SITE}`}); } catch {} return; }
      if (navigator.share) { try { await navigator.share({text, url: SITE}); } catch {} return; }
      download();
    });
    dl.addEventListener('click', download);
    again.addEventListener('click', () => { startGame(); content.querySelector('button')?.focus({preventScroll: true}); });
  }

  async function buildShareImage({score, correct, results}, type = 'image/png', quality) {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    try { await Promise.all(['700 64px "Space Grotesk"', '700 40px "Outfit"'].map(f => document.fonts.load(f))); } catch {}
    const imgs = await Promise.all(results.map(r => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = r.q.image; })));
    const display = '"Space Grotesk", "Segoe UI", sans-serif';
    x.fillStyle = '#f6f2e8'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#141516'; x.fillRect(0, 0, W, 120);
    x.font = `700 44px ${display}`; x.textBaseline = 'middle';
    x.fillStyle = '#dfa649'; x.fillText('✈︎', 70, 62);
    x.fillStyle = '#fff'; x.fillText('23', 130, 62); let off = 130 + x.measureText('23').width;
    x.fillStyle = '#dfa649'; x.fillText('city', off, 62); off += x.measureText('city').width;
    x.fillStyle = '#fff'; x.fillText('break', off, 62);
    x.textAlign = 'right'; x.font = `700 26px ${display}`; x.fillStyle = '#dfa649'; x.fillText('GHICEȘTE ORAȘUL', W - 70, 62);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = '#141516';
    // Cifrele desenate separat, cu spațiu între ele: altfel steagul lui „1” se lovește de „/” în Space Grotesk.
    x.font = `700 210px ${display}`; let nx = 66;
    [String(correct), '/', '10'].forEach((part, i) => { x.fillText(part, nx, 370); nx += x.measureText(part).width + (i < 2 ? 14 : 0); });
    x.font = `700 54px ${display}`; x.fillText(`${fmt(score)} puncte`, 72, 470);
    x.font = `600 38px ${display}`; x.fillStyle = '#8a6a33'; x.fillText(rating(correct), 72, 545);
    const cols = 5, gap = 18, tw = (W - 140 - gap * (cols - 1)) / cols, th = tw * 1.5, top = 610;
    results.forEach((r, i) => {
      const cx = 70 + (i % cols) * (tw + gap), cy = top + Math.floor(i / cols) * (th + gap);
      x.save(); x.beginPath(); x.roundRect(cx, cy, tw, th, 16); x.clip();
      x.fillStyle = '#fff'; x.fillRect(cx, cy, tw, th);
      if (imgs[i]) x.drawImage(imgs[i], cx, cy, tw, th);
      if (!r.ok) { x.fillStyle = 'rgba(20,21,22,.45)'; x.fillRect(cx, cy, tw, th); }
      x.restore();
      x.lineWidth = 6; x.strokeStyle = r.ok ? '#50875a' : '#be7868'; x.beginPath(); x.roundRect(cx, cy, tw, th, 16); x.stroke();
      x.fillStyle = r.ok ? '#50875a' : '#be7868'; x.beginPath(); x.arc(cx + tw - 28, cy + 28, 20, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; x.font = `700 26px ${display}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(r.ok ? '✓' : '✗', cx + tw - 28, cy + 29);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    });
    x.fillStyle = '#141516'; x.font = `700 40px ${display}`; x.fillText('Tu câte orașe recunoști?', 70, H - 70);
    x.textAlign = 'right'; x.fillStyle = '#8a6a33'; x.font = `700 32px ${display}`; x.fillText('23citybreak.ro', W - 70, H - 72);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), type, quality));
  }

  // Folosit de quiz-account.js pentru imaginea din emailul cu rezultatul.
  const cardImage = ({score, correct, cards}) => buildShareImage({score, correct, results: cards.map(c => ({ok: c.ok, q: {image: c.image}}))}, 'image/jpeg', 0.86);
  window.Quiz = {start: startGame, content, cardImage};
  showStart();
})();
