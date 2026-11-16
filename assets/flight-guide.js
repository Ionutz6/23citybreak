// Ghidul de weekend deschis la click pe un card de zbor (Acasă și Zboruri).
// Cardurile nu mai au linkuri: zborul, data, prețul și cumpărarea stau aici, ca pe pagina unui eveniment.
//   CBFlightGuide.open({ cityId:'City:bologna_it', city, country, iata, origin:'OTP', out:'2026-12-04', back:'2026-12-06',
//     price:68, outTime, inTime, airline, direct, kiwiUrl?, skyUrl?, photo?, events?:[{title,url,icon}], onShare? })
// Orașele cu ilustrație (assets/illustrated-guides.js) primesc harta și traseul pe două zile; celelalte, un ghid simplificat.
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const MON = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const day = iso => { const d = new Date(`${iso}T12:00:00Z`); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const sky = iso => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  let ov, last = null;

  function build() {
    ov = document.createElement('div');
    ov.className = 'fg-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'fg-title');
    ov.innerHTML = `<div class="fg-dlg"><div class="fg-ban" id="fg-ban"><span class="fg-badge">Ghid de Weekend 23Citybreak · 48h</span><button type="button" class="fg-x" aria-label="Închide">✕</button><div><h2 id="fg-title"></h2><div class="fg-ct" id="fg-ct"></div></div></div><div class="fg-body" id="fg-body"></div><div class="fg-foot"><a class="fg-jr" href="jurnal.html">Descoperă Jurnalul →</a><button type="button" class="fg-cl">Închide</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.fg-x,.fg-cl')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
  }
  function close() { ov.classList.remove('open'); document.documentElement.style.overflow = ''; last?.focus?.(); }

  function directions(stops) {
    const p = new URLSearchParams({ api: '1', origin: stops[0], destination: stops[stops.length - 1], travelmode: 'walking' });
    if (stops.length > 2) p.set('waypoints', stops.slice(1, -1).join('|'));
    return `https://www.google.com/maps/dir/?${p}`;
  }

  function open(o) {
    if (!ov) build();
    last = document.activeElement;
    const g = (window.CB_ILLUSTRATED_GUIDES || {})[o.cityId], slug = String(o.cityId || '').replace(/^City:/, '');
    const origin = (o.origin || 'OTP').toUpperCase();
    const kiwi = o.kiwiUrl || (o.iata ? `https://www.kiwi.com/deep?${new URLSearchParams({ from: origin, to: o.iata, departure: o.out, return: o.back, adults: '1', currency: 'EUR', lang: 'ro' })}` : 'https://www.kiwi.com/ro/');
    const skyUrl = o.skyUrl || (o.iata ? `https://www.skyscanner.ro/transport/flights/${origin.toLowerCase()}/${o.iata.toLowerCase()}/${sky(o.out)}/${sky(o.back)}/?adultsv2=1&cabinclass=economy` : '');
    const city = o.city || g?.city || slug;
    const stayCity = `${city}`;
    const bookingUrl = `https://www.booking.com/searchresults.html?${new URLSearchParams({ ss: stayCity, checkin: o.out, checkout: o.back, group_adults: '2', no_rooms: '1' })}`;
    const airbnbUrl = `https://www.airbnb.com/s/${encodeURIComponent(stayCity)}/homes?${new URLSearchParams({ checkin: o.out, checkout: o.back, adults: '2' })}`;
    const stay = window.CBEstimates?.stay?.(slug, o.out, o.back);
    const stayPp = stay ? Math.round(stay.total / 2 / 5) * 5 : 0;
    const price = Math.round(Number(o.price) || 0);

    document.getElementById('fg-title').textContent = city;
    document.getElementById('fg-ct').textContent = [o.country, o.iata].filter(Boolean).join(' · ');
    const img = o.photo || (g ? `assets/guides-prague-style/800/${g.image}.webp` : '');
    document.getElementById('fg-ban').style.backgroundImage = img ? `url("${img}")` : 'linear-gradient(135deg,#23303b,#3b4a57)';

    const events = (o.events || []).length ? `<div class="fg-box"><h4>În weekendul acesta</h4><div class="fg-ev">${o.events.map(e => `<a href="${esc(e.url)}">${esc(e.icon || '🎟')} ${esc(e.title)} →</a>`).join('')}</div></div>` : '';
    const left = `<div class="fg-left">
      <div class="fg-box fg-buy"><h4>Zbor dus-întors · vineri–duminică</h4>
        <div class="fg-big">${price ? `${price} €` : '—'}<small>per persoană, tur–retur</small></div>
        ${o.outTime && o.inTime ? `<div class="fg-legs"><div class="fg-leg"><b>🛫 Tur · ${esc(day(o.out))}</b>${esc(o.outTime)}</div><div class="fg-leg"><b>🛬 Retur · ${esc(day(o.back))}</b>${esc(o.inTime)}</div></div>` : '<div style="height:14px"></div>'}
        <div class="fg-meta">📅 ${esc(day(o.out))} – ${esc(day(o.back))}${o.airline ? ` · ${esc(o.airline)}` : ''}${o.direct === true ? ' · Direct' : ''}${o.outTime ? '' : ' · orele exacte se văd pe Kiwi'}</div>
        <a class="fg-cta" href="${esc(kiwi)}" target="_blank" rel="noopener noreferrer">Cumpără bilet de avion</a>
        ${skyUrl ? `<a class="fg-alt" href="${esc(skyUrl)}" target="_blank" rel="noopener noreferrer">sau compară prețul pe Skyscanner</a>` : ''}
      </div>
      <div class="fg-box"><h4>Estimare weekend, 1 persoană</h4><div class="fg-est">
        <div><span>Zbor</span><span>${price ? `${price} €` : '—'}</span></div>
        ${stay ? `<div><span>Cazare, ${stay.nights} nopți (estimare)</span><span>~${stayPp} €</span></div><div class="tot"><span>Total estimat</span><span>~${price + stayPp} €</span></div>` : ''}
      </div>
      <div class="fg-two"><a class="fg-btn" href="${esc(bookingUrl)}" target="_blank" rel="noopener noreferrer">Caută cazare · Booking</a><a class="fg-btn" href="${esc(airbnbUrl)}" target="_blank" rel="noopener noreferrer">Airbnb</a></div>
      ${o.onShare ? `<div style="margin-top:8px"><button type="button" class="fg-btn fg-wa" style="width:100%" id="fg-share">Trimite pe WhatsApp</button></div>` : ''}
      <p class="fg-fine">Cazarea e o estimare pentru 2 persoane împărțită la 2 (±25%). Prețul zborului se poate schimba până la rezervare.</p></div>
      ${events}
      ${g ? '' : `<div class="fg-simp"><b>Ghid simplificat.</b> Pentru acest oraș nu avem încă ilustrație și traseu pe două zile.</div>`}
    </div>`;
    let right = '';
    if (g) {
      const ext = g.extension || 'png';
      right = `<aside class="fg-right fg-map"><h3>Descoperă ${esc(g.city || city)} în două zile</h3><p class="fg-fine" style="margin:0 0 10px">Ilustrație schematică: pozițiile și traseul sunt orientative. Verifică orarele și accesul înainte de plecare.</p><img src="assets/guides-prague-style/${esc(g.image)}.${esc(ext)}" alt="Ilustrație ${esc(g.city || city)}" loading="lazy"><ol>${g.legend.map(([n, name, d]) => `<li><i>${esc(n)}</i><span><b>${esc(name)}</b><small>${esc(d)}</small></span></li>`).join('')}</ol>${g.days.map((d, i) => `<div class="fg-day"><strong>Ziua ${i + 1}</strong>${esc(d.story)}<br><a href="${esc(directions(d.stops))}" target="_blank" rel="noopener noreferrer">Deschide traseul în Google Maps ↗</a></div>`).join('')}</aside>`;
    }
    const body = document.getElementById('fg-body');
    body.className = 'fg-body' + (g ? '' : ' one');
    body.innerHTML = left + right;
    body.scrollTop = 0;
    document.getElementById('fg-share')?.addEventListener('click', o.onShare);
    document.querySelector('.fg-jr').setAttribute('href', slug === 'prague_cz' ? 'praga-doua-zile.html' : 'jurnal.html');
    ov.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    ov.querySelector('.fg-x').focus();
  }

  window.CBFlightGuide = { open, close: () => ov && close() };
})();
