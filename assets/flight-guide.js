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
  let ov, last = null, photoToken = 0;

  function build() {
    ov = document.createElement('div');
    ov.className = 'fg-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'fg-title');
    ov.innerHTML = `<div class="fg-dlg"><div class="fg-ban" id="fg-ban"><span class="fg-badge">Ghid de Weekend 23Citybreak · 48h</span><button type="button" class="fg-x" aria-label="Închide">✕</button><div><h2 id="fg-title"></h2><div class="fg-ct" id="fg-ct"></div></div><a class="fg-credit" id="fg-credit" target="_blank" rel="noopener noreferrer" hidden></a></div><div class="fg-body" id="fg-body"></div><div class="fg-foot"><a class="fg-jr" href="jurnal.html">Descoperă Jurnalul →</a><button type="button" class="fg-cl">Închide</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.fg-x,.fg-cl')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
  }

  // Poza reprezentativă a orașului pentru banner: imaginea principală a articolului din Wikipedia, cu autor și licență din Commons.
  // Fără poză validă (autor + licență), rămâne fundalul de rezervă. Creditul apare în banner și în „Credite fotografii”, dacă pagina o are.
  const photoCache = new Map();
  const plain = h => new DOMParser().parseFromString(h || '', 'text/html').body.textContent.trim();
  function cityPhoto(cityId) {
    const m = /^City:([a-z0-9-]+)_([a-z]{2})$/i.exec(cityId || '');
    if (!m) return Promise.resolve(null);
    if (!photoCache.has(cityId)) {
      photoCache.set(cityId, (async () => {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(m[1].replace(/-/g, '_'))}`, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) return null;
        const a = await r.json(), src = a.thumbnail?.source;
        if (a.type !== 'standard' || !src) return null;
        const u = new URL(src);
        if (u.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(u.hostname) || !u.pathname.startsWith('/wikipedia/commons/')) return null;
        const parts = u.pathname.split('/'), file = decodeURIComponent(parts[parts.length - 2]);
        const q = new URLSearchParams({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1200', format: 'json', origin: '*' });
        const c = await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { signal: AbortSignal.timeout(12000) });
        if (!c.ok) return null;
        const info = Object.values((await c.json()).query?.pages || {})[0]?.imageinfo?.[0], meta = info?.extmetadata;
        const author = plain(meta?.Artist?.value), license = plain(meta?.LicenseShortName?.value);
        const page = info?.descriptionurl ? new URL(info.descriptionurl) : null;
        if (!info?.thumburl || !author || !license || !page || page.protocol !== 'https:' || page.hostname !== 'commons.wikimedia.org') return null;
        const t = new URL(info.thumburl);
        if (t.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(t.hostname)) return null;
        return { url: t.href, source: page.href, author, license };
      })().catch(() => null).then(d => { if (!d) photoCache.delete(cityId); return d; }));
    }
    return photoCache.get(cityId);
  }
  function creditLine(city, ph) {
    const list = document.getElementById('photo-credit-list'), box = document.getElementById('photo-credits');
    if (!list || !box || [...list.querySelectorAll('a')].some(a => a.href === ph.source)) return;
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = ph.source; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `${city}: ${ph.author} · ${ph.license}`;
    li.append(a); list.append(li); box.hidden = false;
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
        const price = Math.round(Number(o.price) || 0);

    document.getElementById('fg-title').textContent = city;
    document.getElementById('fg-ct').textContent = [o.country, o.iata].filter(Boolean).join(' · ');
    const img = o.photo || (g ? `assets/guides-prague-style/800/${g.image}.webp` : '');
    const ban = document.getElementById('fg-ban'), credit = document.getElementById('fg-credit');
    ban.style.backgroundImage = img ? `url("${img}")` : 'linear-gradient(135deg,#23303b,#3b4a57)';
    credit.hidden = true; credit.textContent = '';
    const token = ++photoToken;
    cityPhoto(o.cityId).then(ph => {
      if (!ph || token !== photoToken) return;
      const im = new Image();
      im.onload = () => {
        if (token !== photoToken) return;
        ban.style.backgroundImage = `url("${ph.url}")`;
        credit.textContent = `Foto: ${ph.author} · ${ph.license}`; credit.href = ph.source; credit.hidden = false;
        creditLine(city, ph);
      };
      im.src = ph.url;
    });

    const cc = slug.split('_').pop(), cur = (window.CB_CURRENCY || {})[cc];
    const det = (window.CB_GUIDE_DETAILS || {})[o.cityId];
    const xmasOk = (() => { const md = Number(o.out.slice(5, 7)) * 100 + Number(o.out.slice(8, 10)); return md >= 1115 && md <= 1226; })();
    const ev = (o.events || []).length ? `<div class="fg-box"><h4>În weekendul acesta</h4><div class="fg-ev">${o.events.map(e => `<a href="${esc(e.url)}">${esc(e.icon || '🎟')} ${esc(e.title)} →</a>`).join('')}</div></div>` : '';
    const tipsList = [...(det?.tips || [])];
    if (cur) tipsList.push({ icon: '💶', title: `Moneda locală: ${cur[0]}`, text: `${cur[1]} (${cur[0]}).` });
    const tips = tipsList.length ? `<div class="fg-box"><h4>Sfaturi practice</h4><div class="fg-ev">${tipsList.map(t => `<div class="fg-tip"><b>${t.icon} ${esc(t.title)}</b><small>${esc(t.text)}</small></div>`).join('')}</div></div>` : '';
    const buy = `<div class="fg-box fg-buy"><h4>Zbor dus-întors · vineri–duminică</h4>
        <div class="fg-big">${price ? `${price} €` : '—'}<small>per persoană, tur–retur</small></div>
        ${o.outTime && o.inTime ? `<div class="fg-legs"><div class="fg-leg"><b>🛫 Tur · ${esc(day(o.out))}</b>${esc(o.outTime)}</div><div class="fg-leg"><b>🛬 Retur · ${esc(day(o.back))}</b>${esc(o.inTime)}</div></div>` : '<div style="height:14px"></div>'}
        <div class="fg-meta">📅 ${esc(day(o.out))} – ${esc(day(o.back))}${o.airline ? ` · ${esc(o.airline)}` : ''}${o.direct === true ? ' · Direct' : ''}${o.outTime ? '' : ' · orele exacte se văd pe Kiwi'}</div>
        <a class="fg-cta" href="${esc(kiwi)}" target="_blank" rel="noopener noreferrer">Cumpără bilet de avion</a>
        ${skyUrl ? `<a class="fg-alt" href="${esc(skyUrl)}" target="_blank" rel="noopener noreferrer">sau compară prețul pe Skyscanner</a>` : ''}
      </div>`;
    const nights = Math.max(1, Math.round((new Date(`${o.back}T12:00:00Z`) - new Date(`${o.out}T12:00:00Z`)) / 864e5));
    const stayBox = `<div class="fg-box fg-stay"><h4>Cazare</h4><p class="fg-st">Caută cazare în ${esc(city)}</p><p class="fg-ss">${nights} ${nights === 1 ? 'noapte' : 'nopți'} · ${esc(day(o.out))} – ${esc(day(o.back))} · 2 adulți (completate automat)</p>
      <div class="fg-two"><a class="fg-bk fg-b" href="${esc(bookingUrl)}" target="_blank" rel="noopener noreferrer">Booking<small>hoteluri și pensiuni</small></a><a class="fg-bk fg-a" href="${esc(airbnbUrl)}" target="_blank" rel="noopener noreferrer">Airbnb<small>apartamente</small></a></div>
      <p class="fg-tp">💡 Vineri și sâmbătă seara sunt cele mai scumpe nopți: rezervă din timp, cu anulare gratuită. Caută aproape de o stație de metrou sau tramvai, nu neapărat în centru.</p></div>`;
    // Butonul apare mereu; fără onShare propriu (ex. deschis din Acasă) trimite același mesaj ca pe Zboruri: link către itinerar pe 23citybreak.ro, fără Kiwi.
    const defaultShare = () => {
      const p = new URLSearchParams();
      if (o.cityId) p.set('guide', o.cityId);
      if (o.iata) p.set('to', o.iata);
      if (o.origin) p.set('origin', o.origin);
      if (o.out) p.set('out', o.out);
      if (o.back) p.set('back', o.back);
      if (price) p.set('price', String(price));
      const text = `Am găsit escapada asta pe 23citybreak ✈️\n\n📍 ${city}\n📅 Weekend: ${o.dates || `${day(o.out)} – ${day(o.back)}`}\n💰 De la ${price} € / persoană, tur-retur\n🔗 Vezi călătoria: https://23citybreak.ro/zboruri.html?${p}\n\nDescoperă și alte escapade: https://23citybreak.ro`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    };
    const shareFn = o.onShare || defaultShare;
    const share = `<button type="button" class="fg-btn fg-wa" id="fg-share">Trimite pe WhatsApp</button>`;
    const fine = `<p class="fg-fine">Prețul zborului se poate schimba până la rezervare.</p>`;
    let objHtml = '', daysHtml = '', right = '', mtail = '';
    if (g) {
      const wd = i => { const d = new Date(`${o.out}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1 + i); return DOW[d.getUTCDay()]; };
      objHtml = `<div class="fg-sec fg-objectives"><h3>Ce vezi în ${esc(g.city || city)} <span>${g.legend.length} obiective de pe hartă${det ? ' · prețurile de intrare sunt orientative' : ''}</span></h3><div class="fg-obj">${g.legend.map(([n, name, d], i) => {
        const x = det?.objectives?.[i];
        return `<div class="fg-o"><i>${esc(n)}</i><div><b>${esc(name)}</b><p>${esc(x?.text || d)}</p>${x?.chips ? `<div class="fg-chips">${x.chips.map(([k, t]) => `<span class="${esc(k)}">${k === 't' ? '⏱ ' : ''}${esc(t)}</span>`).join('')}</div>` : ''}</div></div>`;
      }).join('')}</div></div>`;
      daysHtml = `<div class="fg-sec fg-days"><h3>Planul pe zile <span>${esc(wd(0).toLowerCase())} și ${esc(wd(1).toLowerCase())}</span></h3>${g.days.map((d, i) => {
        const dd = det?.days?.[i];
        const body = dd ? `<ul class="fg-tl">${dd.items.filter(it => !it[2] || xmasOk).map(([t, tx]) => `<li><b>${esc(t)}</b>${esc(tx)}</li>`).join('')}</ul>` : `<p>${esc(d.story)}</p>`;
        return `<div class="fg-day"><h5>Ziua ${i + 1} · ${esc(wd(i))}${dd ? ` · ${esc(dd.title)}` : ''}</h5>${body}<a href="${esc(directions(d.stops))}" target="_blank" rel="noopener noreferrer">Deschide traseul în Google Maps ↗</a></div>`;
      }).join('')}</div>`;
      const keys = `<div class="fg-keys">${g.legend.map(([n, name]) => `<span><i>${esc(n)}</i>${esc(name)}</span>`).join('')}</div>`;
      right = `<aside class="fg-right fg-map"><div class="fg-stick"><img src="assets/guides-prague-style/${esc(g.image)}.${esc(g.extension || 'png')}" alt="Ilustrație ${esc(g.city || city)}" loading="lazy"><p class="fg-fine">Ilustrație schematică: pozițiile și traseul sunt orientative. Numerele de pe hartă corespund obiectivelor din stânga.</p>${keys}<div class="fg-rtail">${ev}${tips}</div></div></aside>`;
      mtail = `<div class="fg-mtail">${ev}${tips}</div>`;
    }
    const left = g
      ? `<div class="fg-left">${buy}${share}${fine}${stayBox}${objHtml}${daysHtml}</div>`
      : `<div class="fg-left">${buy}${share}${fine}${stayBox}${ev}${tips}<div class="fg-simp"><b>Ghid simplificat.</b> Pentru acest oraș nu avem încă ilustrație și traseu pe două zile.</div></div>`;
    const body = document.getElementById('fg-body');
    body.className = 'fg-body' + (g ? '' : ' one');
    body.innerHTML = left + right + mtail;
    body.scrollTop = 0;
    document.getElementById('fg-share')?.addEventListener('click', shareFn);
    document.querySelector('.fg-jr').setAttribute('href', slug === 'prague_cz' ? 'praga-doua-zile.html' : 'jurnal.html');
    ov.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    ov.querySelector('.fg-x').focus();
  }

  window.CBFlightGuide = { open, close: () => ov && close() };
})();
