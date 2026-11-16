// Zboruri: slider de perioadă (doar cu cont). Filtrează weekendurile (vineri–duminică) din interval; butoanele „Tot anul” și calendarul mută capetele sliderului.
// Implicit: de la 14 zile la 2 luni. Fără cont, pagina rămâne ca înainte (calendarul și butoanele).
(() => {
  const host = document.getElementById('period-slider');
  if (!host || !window.CBPeriodSlider) return;
  const MIN_DAYS = 14, MAX_DAYS = 60;
  let slider = null, driving = false;
  const loggedIn = () => !!(window.Account && typeof window.Account.hasSession === 'function' && window.Account.hasSession());

  function apply(r) {
    driving = true;
    try {
      selectedWkIds = new Set(ALL_WEEKENDS.filter(w => w.fri >= r.from && w.fri <= r.to && (currentTripMode !== 'extended' || w.holidayType === 'extended')).map(w => w.id));
      const first = ALL_WEEKENDS.find(w => selectedWkIds.has(w.id));
      if (first) {
        calendarYear = Number(first.fri.slice(0, 4));
        mobileCalendarMonth = first.fri.slice(0, 7) < todayStr.slice(0, 7) ? todayStr.slice(0, 7) : first.fri.slice(0, 7);
        calendarYear = Number(mobileCalendarMonth.slice(0, 4));
      }
      renderWeekendSelectorUI(); renderCrossEngineBar(); renderMatrix();
    } finally { driving = false; }
  }
  function show() {
    if (slider) { host.hidden = false; return; }
    const iso = d => CBPeriodSlider.iso(d), t = CBPeriodSlider.parse(todayStr), add = n => new Date(t.getTime() + n * 864e5);
    slider = CBPeriodSlider.create(host, { label: 'Perioada căutării', from: iso(add(MIN_DAYS)), to: iso(add(MAX_DAYS)), today: todayStr, onChange: apply });
    host.hidden = false;
    apply(slider.range());
  }
  // Calendarul / „Tot anul” / presetările: capetele sliderului urmează selecția (de la primul la ultimul weekend ales).
  window.addEventListener('cb:weekends-rendered', () => {
    if (!slider || driving || !selectedWkIds.size) return;
    const ids = [...selectedWkIds].sort();
    slider.set(ids[0], ids.at(-1));
  });
  const refresh = () => { if (loggedIn()) show(); else if (slider) host.hidden = true; };
  window.addEventListener('account:change', refresh);
  refresh();
})();
