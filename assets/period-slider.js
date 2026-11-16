// Slider de perioadă cu două capete (mouse, touch, tastatură), pe săptămâni.
// Scara: 26 de săptămâni (~6 luni) începând cu săptămâna de azi; capătul stâng nu poate trece înapoi de azi.
// Folosit pe Zboruri și pe Evenimente (separat pe fiecare pagină, nesalvat în Cont). Doar pentru utilizatorii cu cont.
//   const s = CBPeriodSlider.create(host, { from: '2026-11-30', to: '2027-01-17', onInput(range), onChange(range) });
//   range = { from: 'AAAA-LL-ZZ' (prima zi, luni sau azi), to: 'AAAA-LL-ZZ' (duminică), weeks: n }
(() => {
  const DAY = 864e5;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const add = (d, n) => new Date(d.getTime() + n * DAY);
  const monday = d => add(d, -((d.getUTCDay() + 6) % 7));
  const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
  const MONTHS_SHORT = ['I', 'F', 'M', 'A', 'M', 'I', 'I', 'A', 'S', 'O', 'N', 'D'];
  const localToday = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
  let uid = 0;

  function create(host, opts = {}) {
    const today = opts.today ? parse(opts.today) : localToday();
    const year = today.getUTCFullYear();
    const start = monday(today);                                       // scala începe în săptămâna de azi
    const total = opts.weeks || 26;                                    // ~6 luni înainte (city break de weekend, nu vacanțe planificate cu un an înainte)
    const minA = 0;                                                    // săptămâna de azi: limita stângă
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const weekOf = s => clamp(Math.floor((monday(parse(s)) - start) / DAY / 7), 0, total - 1);
    const id = `ps${++uid}`;

    // a = prima săptămână (inclusiv), b = ultima săptămână (inclusiv)
    let a = clamp(opts.from ? weekOf(opts.from) : minA, minA, total - 1);
    let b = clamp(opts.to ? weekOf(opts.to) : a, a, total - 1);

    host.classList.add('ps');
    host.innerHTML = `<div class="ps-head"><span class="ps-label">${opts.label || 'Perioada'}</span><output class="ps-value" aria-live="polite"></output></div>
      <div class="ps-track" data-ps-track>
        <div class="ps-past" aria-hidden="true"></div><div class="ps-fill" aria-hidden="true"></div>
        <div class="ps-ticks" aria-hidden="true"></div>
        <div class="ps-handle" role="slider" tabindex="0" data-ps="a" id="${id}-a" aria-label="Începutul perioadei"></div>
        <div class="ps-handle" role="slider" tabindex="0" data-ps="b" id="${id}-b" aria-label="Sfârșitul perioadei"></div>
      </div>
      <div class="ps-months" aria-hidden="true"></div>`;
    const track = host.querySelector('[data-ps-track]'), fill = host.querySelector('.ps-fill'), past = host.querySelector('.ps-past');
    const ticks = host.querySelector('.ps-ticks'), monthsEl = host.querySelector('.ps-months'), value = host.querySelector('.ps-value');
    const hA = host.querySelector('[data-ps=a]'), hB = host.querySelector('[data-ps=b]');
    const pct = i => (i / total) * 100;

    // Marcaje: o liniuță pe săptămână, mai înaltă la început de lună; etichetele de lună se rărează pe ecrane înguste.
    const monthStarts = []; // { pos (în săptămâni de la început), label, jan }
    for (let d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)); (d - start) / DAY / 7 < total; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      monthStarts.push({ pos: (d - start) / DAY / 7, label: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), jan: d.getUTCMonth() === 0, idx: monthStarts.length });
    }
    ticks.innerHTML = Array.from({ length: total }, (_, i) => `<i style="left:${pct(i)}%"></i>`).join('')
      + monthStarts.map(m => `<i class="ps-tick-m" style="left:${(m.pos / total) * 100}%"></i>`).join('');
    const drawMonths = () => {
      const px = track.clientWidth || host.clientWidth || 600, per = px / (total / 4.35);
      const step = per >= 34 ? 1 : 2;
      monthsEl.innerHTML = (monthStarts[0] && monthStarts[0].pos < 3 ? '' : `<span class="ps-start" style="left:0">${today.getUTCDate()} ${MONTHS[today.getUTCMonth()]}</span>`) + monthStarts.filter(m => m.idx % step === 0 || m.jan).map(m =>
        `<span class="${m.jan ? 'ps-jan' : ''}" style="left:${(m.pos / total) * 100}%">${m.label}${m.jan ? ` <b>${m.year}</b>` : ''}</span>`).join('');
    };
    if (window.ResizeObserver) new ResizeObserver(drawMonths).observe(host); else window.addEventListener('resize', drawMonths);

    const range = () => ({ from: iso(a === minA ? today : add(start, a * 7)), to: iso(add(start, b * 7 + 6)), weeks: b - a + 1 });
    const fmt = s => { const d = parse(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() !== year ? ` ${d.getUTCFullYear()}` : ''}`; };
    const label = () => { const r = range(); return `${fmt(r.from)} – ${fmt(r.to)} · ${r.weeks} ${r.weeks === 1 ? 'săptămână' : 'săptămâni'}`; };
    function paint() {
      const left = pct(a), right = pct(b + 1);
      past.style.width = `${pct(minA)}%`;
      fill.style.left = `${left}%`; fill.style.width = `${right - left}%`;
      hA.style.left = `${left}%`; hB.style.left = `${right}%`;
      const r = range(), text = label();
      value.textContent = text; host.dataset.from = r.from; host.dataset.to = r.to;
      for (const [h, v, lo, hi, name] of [[hA, a, minA, b, 'Începutul'], [hB, b, a, total - 1, 'Sfârșitul']]) {
        h.setAttribute('aria-valuemin', lo); h.setAttribute('aria-valuemax', hi); h.setAttribute('aria-valuenow', v);
        h.setAttribute('aria-valuetext', `${name} perioadei: ${fmt(iso(add(start, (h === hB ? v * 7 + 6 : Math.max(v, minA) * 7))))}`);
      }
    }
    const emit = (fn) => fn && fn(range());
    function move(which, week, commit) {
      const pa = a, pb = b;
      if (which === 'a') a = clamp(week, minA, b); else b = clamp(week, a, total - 1);
      if (a !== pa || b !== pb) { paint(); emit(opts.onInput); }
      if (commit) emit(opts.onChange);
    }
    // Poziția indicatorului → săptămâna cea mai apropiată de marginea handle-ului (stânga: începutul săptămânii; dreapta: sfârșitul).
    const weekAt = (clientX, which) => {
      const r = track.getBoundingClientRect(), x = clamp((clientX - r.left) / r.width, 0, 1) * total;
      return which === 'a' ? Math.round(x) : Math.round(x) - 1;
    };
    for (const [h, which] of [[hA, 'a'], [hB, 'b']]) {
      h.addEventListener('pointerdown', e => { e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('drag'); h.focus({ preventScroll: true }); });
      h.addEventListener('pointermove', e => { if (h.hasPointerCapture(e.pointerId)) move(which, weekAt(e.clientX, which), false); });
      const end = e => { if (h.hasPointerCapture?.(e.pointerId)) { h.releasePointerCapture(e.pointerId); } if (h.classList.contains('drag')) { h.classList.remove('drag'); emit(opts.onChange); } };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
      h.addEventListener('keydown', e => {
        const cur = which === 'a' ? a : b, big = e.shiftKey ? 4 : 1;
        const keys = { ArrowLeft: cur - big, ArrowDown: cur - big, ArrowRight: cur + big, ArrowUp: cur + big, PageDown: cur - 4, PageUp: cur + 4, Home: which === 'a' ? minA : a, End: which === 'a' ? b : total - 1 };
        if (!(e.key in keys)) return;
        e.preventDefault(); move(which, keys[e.key], true);
      });
    }
    // Click pe bară: mută capătul cel mai apropiat.
    track.addEventListener('pointerdown', e => {
      if (e.target.closest('.ps-handle')) return;
      const r = track.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 1) * total;
      const which = Math.abs(x - a) <= Math.abs(x - (b + 1)) ? 'a' : 'b';
      move(which, weekAt(e.clientX, which), true);
    });

    paint(); drawMonths();
    return {
      range,
      // Din exterior (ex. butoanele „Tot anul”): mută capetele fără să emită evenimente.
      set(from, to) { a = clamp(weekOf(from), minA, total - 1); b = clamp(weekOf(to), a, total - 1); paint(); },
      get min() { return minA; }, get total() { return total; }, today: iso(today),
    };
  }
  window.CBPeriodSlider = { create, iso, parse, monday };
})();
