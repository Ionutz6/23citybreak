// Pagina de pachet (weekend.html?e=<id eveniment>): eveniment + zbor + cazare + itinerar pe zile.
// Itinerarul folosește aceleași date ca ghidul ilustrat al orașului (assets/illustrated-guides.js),
// deci tot ce recomandă apare și pe ilustrația afișată mai jos. Orașele fără ghid ilustrat nu au itinerar.
(async () => {
  const root = document.getElementById('pk-root');
  const E = window.CBEvents, H = E.helpers, esc = H.esc;
  const id = new URLSearchParams(location.search).get('e');
  await window.Account?.syncPrefsToLocal?.(); // aeroportul de plecare din cont, înainte de linkuri și prețul zborului
  const ev = id ? await E.byId(id) : null;
  if (!ev) {
    root.innerHTML = '<div class="pk-empty"><h1>Nu am găsit acest eveniment</h1><p>Poate s-a încheiat sau linkul nu mai e valabil.</p><p><a class="pk-btn gold" href="./">Vezi zborurile de weekend</a></p></div>';
    return;
  }
  const slug = ev.city_id, city = H.cityOf(slug), name = H.cityName(slug), guide = H.guideOf(slug);
  const s = H.startDate(ev), en = H.endDate(ev), multi = H.isMultiDay(ev);
  const hasAccount = () => !!(window.Account && window.Account.hasSession());
  const [icon, kindName] = E.KINDS[ev.kind] || E.KINDS.other;
  const cap = t => t.replace(/^./, c => c.toUpperCase());

  // ---------- Variantele de durată ----------
  const wk = H.mainWeekend(ev);
  const modes = multi
    ? [{ key: 'weekend', label: 'Weekendul recomandat', out: wk.fri, back: wk.sun }, { key: 'full', label: 'Tot evenimentul', out: H.isoAdd(s, -1), back: H.isoAdd(en, 1) }]
    : [{ key: 'weekend', label: 'Weekend (vin–dum)', out: wk.fri, back: wk.sun }, { key: 'long', label: 'Prelungit (joi–lun)', out: H.isoAdd(wk.fri, -1), back: H.isoAdd(wk.sun, 1) }];
  let trip = { out: modes[0].out, back: modes[0].back, mode: modes[0].key };
  // Banda de zile: la evenimentele de o zi lăsăm câte o zi în plus la capete (mie–mar), pentru alegerea manuală.
  const stripFrom = H.isoAdd([...modes.map(m => m.out), H.isoAdd(s, -1)].sort()[0], multi ? 0 : -1);
  const stripTo = H.isoAdd([modes[0].back, modes[1].back, H.isoAdd(en, 1)].sort().pop(), multi ? 0 : 1);
  const strip = []; for (let d = stripFrom; d <= stripTo && strip.length < 21; d = H.isoAdd(d, 1)) strip.push(d);
  const isEventDay = d => d >= s && d <= en;

  // ---------- Linkuri ----------
  const FP = window.CBFlightPrice;
  const origin = FP ? FP.origin() : 'OTP';
  const iata = city?.iata && /^[A-Z]{3}$/.test(city.iata) ? city.iata : '';
  const sky = d => d.slice(2).replace(/-/g, '');
  const flightUrl = () => iata ? `https://www.kiwi.com/deep?${new URLSearchParams({ from: origin, to: iata, departure: trip.out, return: trip.back, adults: '1', currency: 'EUR', lang: 'ro' })}` : 'https://www.kiwi.com/ro/';
  const skyUrl = () => iata ? `https://www.skyscanner.ro/transport/flights/${origin.toLowerCase()}/${iata.toLowerCase()}/${sky(trip.out)}/${sky(trip.back)}/?adultsv2=1&cabinclass=economy` : '';
  // Cazarea: căutare pe oraș (nu pe sala evenimentului), cu datele alese. Numele englezesc din slug-ul Kiwi
  // (ex. vienna_at → „Vienna”) e recunoscut sigur și de Booking, și de Airbnb.
  const stayCity = String(slug).split('_')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const stayUrl = () => `https://www.booking.com/searchresults.html?${new URLSearchParams({ ss: stayCity, checkin: trip.out, checkout: trip.back, group_adults: '2', no_rooms: '1' })}`;
  const airbnbUrl = () => `https://www.airbnb.com/s/${encodeURIComponent(stayCity)}/homes?${new URLSearchParams({ checkin: trip.out, checkout: trip.back, adults: '2' })}`;
  const ticketUrl = ev.ticket_url || `https://www.google.com/search?${new URLSearchParams({ q: ev.kind === 'football' && ev.teams?.[0] ? `${ev.teams[0]} official tickets` : `${ev.title} ${name} tickets` })}`;
  const ticketLabel = ev.ticket_url ? (ev.kind === 'city_festival' || ev.kind === 'market' ? 'Vezi programul oficial' : 'Cumpără bilet la eveniment') : (ev.kind === 'football' ? 'Caută bilete pe site-ul clubului' : 'Caută bilete la eveniment');
  const mapsPlace = q => `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: q })}`;
  const mapsDir = stops => { const p = new URLSearchParams({ api: '1', origin: stops[0], destination: stops[stops.length - 1], travelmode: 'walking' }); if (stops.length > 2) p.set('waypoints', stops.slice(1, -1).join('|')); return `https://www.google.com/maps/dir/?${p}`; };

  // ---------- Itinerar ----------
  const eventTime = ev.time_tbc ? '' : H.local(ev.starts_at, slug).time;
  const eventBlock = d => `<div class="pk-event"><div class="t">${multi ? 'Zi de eveniment' : eventTime ? `Ora ${esc(eventTime)}` : 'Ora se anunță'}</div><div class="w">${icon} ${esc(ev.title)}</div><div class="s">${ev.venue ? `<a href="${esc(mapsPlace(`${ev.venue}, ${name}`))}" target="_blank" rel="noopener noreferrer">${esc(ev.venue)}</a>` : esc(name)}${multi ? ` · ${esc(H.whenLabel(ev))}` : ''}</div></div>`;
  function itinerary() {
    const days = []; for (let d = trip.out; d <= trip.back; d = H.isoAdd(d, 1)) days.push(d);
    // Traseele din ghid se pun pe zilele pline (fără ziua sosirii), întâi pe cele fără eveniment de zi întreagă.
    const full = days.slice(1);
    const freeFirst = [...full.filter(d => !(multi && isEventDay(d))), ...full.filter(d => multi && isEventDay(d))];
    const routeOf = new Map(); (guide?.days || []).forEach((r, i) => { if (freeFirst[i]) routeOf.set(freeFirst[i], r); });
    return days.map((d, i) => {
      const route = routeOf.get(d), evDay = isEventDay(d), last = i === days.length - 1, first = i === 0;
      const morningOnly = multi && evDay && route;
      const head = first ? 'sosire' : last ? (route ? 'ultimul traseu, apoi plecare' : 'plecare') : evDay && !multi ? (!eventTime ? 'orașul și evenimentul' : eventTime < '15:00' ? 'evenimentul, apoi orașul' : 'orașul ziua, evenimentul seara') : evDay ? 'zi de eveniment' : 'la pas prin oraș';
      const body = [];
      if (first && !evDay) body.push(`<p class="pk-story">Seara sosirii: cazare și o primă plimbare prin centru.</p>`);
      if (route) body.push(`<p class="pk-story">${morningOnly ? 'Dimineața, înainte de eveniment: ' : ''}${esc(route.story)}</p><ol class="pk-stops">${route.stops.map(st => `<li><a href="${esc(mapsPlace(st))}" target="_blank" rel="noopener noreferrer">${esc(st.split(',')[0])}</a></li>`).join('')}</ol><a class="pk-maplink" href="${esc(mapsDir(route.stops))}" target="_blank" rel="noopener noreferrer">Deschide tot traseul în Google Maps ↗</a>`);
      if (evDay) body.push(eventBlock(d));
      if (!body.length) body.push(`<p class="pk-story">${last ? 'Dimineață liberă, apoi drumul spre aeroport.' : 'Zi liberă: reia obiectivele preferate de pe hartă sau odihnește-te.'}</p>`);
      return `<h2 class="pk-dayh">${esc(cap(H.longDate(d)))} · ${head}</h2>${body.join('')}`;
    }).join('');
  }

  // ---------- Randare ----------
  const illu = H.guideImage(slug);
  // Variantă de 800 px (tools/ilustratii-webp.py) pentru ecrane mici; linkul deschide ilustrația întreagă.
  const illuSmall = illu.replace(/([^/]+\.webp)$/, '800/$1');
  // Prețul zborului pentru zilele alese: o cerere Kiwi din browser, cu cache (assets/flight-price.js).
  let flight = null, flightState = 'idle', flightKey = '';
  const flightSub = () => flightState === 'loading' ? ' · caut prețul…' : flight?.eur ? `<br>${flight.direct ? 'direct' : `${flight.stops} ${flight.stops === 1 ? 'escală' : 'escale'}`}, de persoană, găsit acum pe Kiwi` : flightState === 'none' ? '<br>nu am găsit zboruri în zilele astea' : flightState === 'na' ? '<br>prețul îl vezi la Kiwi' : '';
  function loadFlight() {
    if (!FP || !iata || !city?.id) { flightState = 'na'; return; }
    const key = `${trip.out}|${trip.back}`; if (key === flightKey) return;
    flightKey = key; flight = null; flightState = 'loading';
    FP.get({ origin, dest: city.id, out: trip.out, back: trip.back }).then(p => {
      if (flightKey !== key) return;
      flight = p; flightState = p?.eur ? 'ok' : p ? 'none' : 'na'; render(false);
    });
  }
  let photo = null; // imaginea evenimentului sau fotografia orașului; se încarcă în paralel cu prima randare
  let wx = null; // vremea tipică în luna evenimentului (assets/event-weather.js), orientativ
  const wxRow = () => {
    if (!wx) return '';
    const ico = wx.hi >= 22 ? '☀️' : wx.hi >= 12 ? '⛅' : wx.hi >= 5 ? '🌥️' : '❄️';
    const rain = wx.wet == null ? '' : ` · ploaie în ~${wx.wet} ${wx.wet === 1 ? 'zi' : 'zile'} din 10`;
    return `<div class="pk-row pk-wx"><div class="l"><div class="pk-ico">${ico}</div><div><div class="t">Vremea în ${esc(wx.month)} <span class="pk-tag">orientativ</span></div><div class="s">ziua ~${wx.hi}°C · noaptea ~${wx.lo}°C${rain}</div><div class="s pk-wx-src">Media lunii în ultimii ${wx.years} ${wx.years === 1 ? 'an' : 'ani'}, nu e prognoză. Date: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a></div></div></div></div>`;
  };
  function render(refetch = true) {
    if (refetch) loadFlight();
    const nights = Math.round((new Date(trip.back) - new Date(trip.out)) / 864e5);
    const custom = trip.mode === 'custom';
    root.innerHTML = `
      <section class="pk-hero"><div class="pk-wrap">
        <div class="pk-crumb"><a href="evenimente.html">Evenimente</a> / ${esc(kindName)} / ${esc(name)}</div>
        <h1>${multi ? esc(ev.title) + ' · ' + esc(name) : `Weekend la ${esc(name)}: ${esc(ev.title)}`}</h1>
        <p class="pk-sub">${icon} ${ev.venue ? esc(ev.venue) + ' · ' : ''}${esc(H.whenLabel(ev))}</p>
        <p class="pk-print-only">Zbor ${esc(origin)} ⇄ ${esc(iata || name)}: ${esc(H.shortDate(trip.out))} → ${esc(H.shortDate(trip.back))} · 23citybreak.ro</p>
      </div>${photo?.credit ? (photo.creditUrl ? `<a class="pk-credit" href="${esc(photo.creditUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.credit)}</a>` : `<span class="pk-credit">${esc(photo.credit)}</span>`) : ''}</section>
      <div class="pk-wrap pk-grid">
        <div>
          <div class="pk-box">
            <h3>Câte zile stai?</h3>
            <div class="pk-seg" role="group" aria-label="Durata șederii">
              ${modes.map(m => `<button type="button" data-mode="${m.key}" aria-pressed="${trip.mode === m.key}">${esc(m.label)}</button>`).join('')}
              <button type="button" data-mode="custom" aria-pressed="${custom}">Aleg eu zilele</button>
            </div>
            <div class="pk-days">${strip.map(d => {
              const on = d >= trip.out && d <= trip.back, cls = `pk-day${on ? ' on' : ''}${isEventDay(d) ? ' event' : ''}`;
              const inner = `${H.DOW[H.dowOf(d)]}<small>${+d.slice(8)} ${H.MON[+d.slice(5, 7) - 1]}${isEventDay(d) && !multi ? ' · ' + esc(kindName.toLowerCase()) : ''}</small>`;
              return custom ? `<button type="button" class="${cls}" data-day="${d}" aria-pressed="${on}">${inner}</button>` : `<div class="${cls}">${inner}</div>`;
            }).join('')}</div>
            <p class="pk-note">${custom ? 'Apasă pe prima și pe ultima zi a șederii. ' : ''}Zbor ${esc(H.shortDate(trip.out))} → ${esc(H.shortDate(trip.back))}, ${nights} ${nights === 1 ? 'noapte' : 'nopți'}.${multi ? ' Zilele cu contur punctat sunt zilele evenimentului.' : ''}</p>
          </div>
          ${guide ? itinerary() : `<h2 class="pk-dayh">${esc(cap(H.whenLabel(ev)))}</h2>${eventBlock(s)}<p class="pk-note">Pentru ${esc(name)} nu avem încă un ghid ilustrat, așa că pachetul nu include un itinerar pe zile.</p>`}
          ${guide ? `<div class="pk-pdf"><button type="button" class="pk-btn line" data-pdf>⬇ Descarcă itinerarul (PDF)</button><span class="pk-note" style="margin:0">${hasAccount() ? 'În fereastra care se deschide alege „Salvează ca PDF”.' : 'Gratuit, cu un cont 23citybreak.'}</span></div>` : ''}
          ${guide ? `<section class="pk-illu"><h2>${esc(guide.city || name)} pe hartă</h2><p class="pk-note" style="margin:0">Toate obiectivele din itinerar sunt desenate pe ilustrație.</p>
            <div class="pk-illu-grid"><a href="${esc(illu)}" target="_blank" rel="noopener noreferrer"><img src="${esc(illuSmall)}" srcset="${esc(illuSmall)} 800w, ${esc(illu)} 1086w" sizes="(max-width: 900px) 100vw, 600px" alt="Hartă ilustrată cu obiectivele din ${esc(guide.city || name)}" loading="lazy"></a>
            <ol class="pk-legend">${guide.legend.map(([n, t, dsc]) => `<li><span class="n">${esc(n)}</span><span><strong>${esc(t)}</strong><br>${esc(dsc)}</span></li>`).join('')}</ol></div></section>` : ''}
        </div>
        <aside class="pk-box pk-side">
          <h3>Pachetul tău</h3>
          <div class="pk-row"><div class="l"><div class="pk-ico">${icon}</div><div><div class="t">Bilet la eveniment</div><div class="s">${ev.price_min_eur ? 'de la' : ev.kind === 'football' ? 'preț pe site-ul clubului' : ev.kind === 'city_festival' || ev.kind === 'market' ? 'intrare liberă' : 'preț la vânzător'}</div></div></div>${ev.price_min_eur ? `<div class="pr">${Math.round(ev.price_min_eur)} €</div>` : ''}</div>
          <div class="pk-row"><div class="l"><div class="pk-ico">✈︎</div><div><div class="t">Zbor ${esc(origin)} ⇄ ${esc(iata || name)}</div><div class="s">${esc(H.shortDate(trip.out))} → ${esc(H.shortDate(trip.back))}${flightSub()}</div></div></div>${flight?.eur ? `<div class="pr"><small>de la</small> ${flight.eur} €</div>` : ''}</div>
          ${wxRow()}
          <div class="pk-stack">
            <a class="pk-btn dark" href="${esc(ticketUrl)}" target="_blank" rel="noopener noreferrer">${icon} ${esc(ticketLabel)} ↗</a>
            <a class="pk-btn gold" href="${esc(flightUrl())}" target="_blank" rel="noopener noreferrer">✈︎ Cumpără bilet de avion ↗</a>
            ${skyUrl() ? `<div class="pk-alt"><a href="${esc(skyUrl())}" target="_blank" rel="noopener noreferrer">sau compară prețul pe Skyscanner</a></div>` : ''}
            <section class="pk-stay" aria-labelledby="pk-stay-h">
              <div class="pk-stay-head"><h4 id="pk-stay-h">🛏 Cazare</h4><span>${nights} ${nights === 1 ? 'noapte' : 'nopți'} · ${esc(H.shortDate(trip.out))} → ${esc(H.shortDate(trip.back))}</span></div>
              <div class="pk-stay-opts">
                <a class="pk-stay-opt" href="${esc(stayUrl())}" target="_blank" rel="noopener noreferrer"><span class="ic" aria-hidden="true">🏨</span><span class="nm">Booking</span><span class="ds">hoteluri și pensiuni</span><span class="go" aria-hidden="true">↗</span></a>
                <a class="pk-stay-opt" href="${esc(airbnbUrl())}" target="_blank" rel="noopener noreferrer"><span class="ic" aria-hidden="true">🏠</span><span class="nm">Airbnb</span><span class="ds">apartamente și case</span><span class="go" aria-hidden="true">↗</span></a>
              </div>
            </section>
          </div>
          <p class="pk-note">Prețul zborului e cel mai mic găsit acum pe Kiwi și se poate schimba. Biletele de avion, biletele la eveniment și cazarea se cumpără direct de pe site-urile furnizorilor, care stabilesc prețurile, disponibilitatea și condițiile. 23citybreak nu răspunde pentru eventualele diferențe sau erori de pe aceste site-uri și poate primi un comision, fără cost pentru tine.${ev.source === 'football-data' ? ' Football data provided by the Football-Data.org API.' : ''}</p>
        </aside>
      </div>`;
    document.title = `${ev.title} · ${name} · 23citybreak`;
    E.setBg(root.querySelector('.pk-hero'), photo);
  }

  // Itinerarul ca PDF: doar cu cont. Fără cont deschidem loginul; linkul din email revine aici cu ?pdf=1.
  function downloadPdf() {
    if (hasAccount()) { window.print(); return; }
    const back = new URL(location.href); back.searchParams.set('pdf', '1'); back.hash = '';
    window.Account?.openLogin({ title: 'Descarcă itinerarul', intro: 'Itinerarul în PDF e gratuit pentru cei cu cont. Fără parolă: îți trimitem un link pe email și revii direct aici.', source: 'itinerar-pdf', redirect: back.href });
  }
  let pick = null; // prima zi apăsată în modul „Aleg eu zilele”
  root.addEventListener('click', e => {
    if (e.target.closest('[data-pdf]')) { downloadPdf(); return; }
    const m = e.target.closest('[data-mode]');
    if (m) {
      const def = modes.find(x => x.key === m.dataset.mode);
      trip = def ? { out: def.out, back: def.back, mode: def.key } : { ...trip, mode: 'custom' };
      pick = null; render(); root.querySelector(`[data-mode="${trip.mode}"]`)?.focus(); return;
    }
    const d = e.target.closest('[data-day]')?.dataset.day;
    if (!d) return;
    if (!pick) { pick = d; trip = { out: d, back: H.isoAdd(d, 1) > stripTo ? d : H.isoAdd(d, 1), mode: 'custom' }; }
    else { const [a, b] = [pick, d].sort(); trip = { out: a, back: a === b ? H.isoAdd(a, 1) : b, mode: 'custom' }; pick = null; }
    // Șederea trebuie să prindă evenimentul: dacă zilele alese îl ocolesc, o întindem până la el.
    if (trip.back < s) trip.back = s;
    if (trip.out > en) trip.out = en;
    render(); root.querySelector(`[data-day="${d}"]`)?.focus();
  });
  render();
  // La meciuri, stadionul găsit pe Wikidata completează locul (football-data nu îl dă): apare în antet, hartă și cazare.
  window.CBWeather?.typical(slug, name, s).then(w => { if (w) { wx = w; render(); } });
  E.eventPhoto(ev).then(p => { if (p) { photo = p; if (!ev.venue && p.venue) ev.venue = p.venue; render(); } });
  window.addEventListener('account:change', render);
  // Întoarcere din linkul de login cerut pentru PDF.
  if (new URLSearchParams(location.search).has('pdf') && window.Account) {
    try { await window.Account.afterLogin(); if (await window.Account.session()) { render(); setTimeout(() => window.print(), 600); } } catch {}
  }
})();
