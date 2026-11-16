// Carusel de fotografii pentru hero-ul paginilor Zboruri și Evenimente, din Wikimedia Commons (licență liberă).
// Autorul și licența se citesc din Commons la încărcare, ca la caruselul de pe Acasă; o poză fără metadate valide sau care nu se
// încarcă e sărită, iar fără nicio poză rămâne fundalul negru de bază. Creditele apar în „Credite fotografii”.
// Folosire: <script src="assets/page-hero-photo.js" data-target=".page-hero" data-files="A.jpg|B.jpg|C.jpg" data-label="Zboruri" data-position="center 55%" defer></script>
(() => {
  const s = document.currentScript;
  const target = document.querySelector(s?.dataset.target || '');
  const files = (s?.dataset.files || '').split('|').map(f => f.trim()).filter(Boolean);
  if (!target || !files.length) return;
  const text = h => new DOMParser().parseFromString(h || '', 'text/html').body.textContent.trim();
  const veil = 'linear-gradient(90deg,rgba(10,11,13,.88) 0%,rgba(10,11,13,.6) 50%,rgba(10,11,13,.15) 100%),linear-gradient(0deg,rgba(10,11,13,.5),transparent 55%)';
  const preload = url => new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = url; });

  async function load() {
    const params = new URLSearchParams({ action: 'query', titles: files.map(f => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1600', format: 'json', origin: '*' });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const pages = Object.values((await r.json()).query?.pages || {});
    const out = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0], meta = info?.extmetadata;
      const author = text(meta?.Artist?.value), license = text(meta?.LicenseShortName?.value);
      if (!info?.thumburl || !info.descriptionurl || !author || !/^(CC|Public domain|PD)/i.test(license)) continue;
      if (await preload(info.thumburl)) out.push({ url: info.thumburl, page: info.descriptionurl, author, license, order: files.indexOf(p.title.replace(/^File:/, '')) });
    }
    return out.sort((a, b) => a.order - b.order);
  }

  load().then(photos => {
    if (!photos.length) return;
    const list = document.getElementById('photo-credit-list'), box = document.getElementById('photo-credits');
    if (list && box) {
      for (const p of photos) {
        const li = document.createElement('li'), a = document.createElement('a');
        a.href = p.page; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = `${s.dataset.label || 'Fotografie'}: ${p.author} · ${p.license}`;
        li.append(a); list.append(li);
      }
      box.hidden = false;
    }
    // Două straturi suprapuse pentru fade între poze; textul hero rămâne deasupra.
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    const layers = [0, 1].map(() => {
      const d = document.createElement('div'); d.setAttribute('aria-hidden', 'true');
      d.style.cssText = `position:absolute;inset:0;z-index:0;opacity:0;transition:opacity 1s;background-size:cover;background-position:${s.dataset.position || 'center'};pointer-events:none`;
      target.prepend(d); return d;
    });
    const show = (i, n) => { const d = layers[n % 2]; d.style.backgroundImage = `${veil},url("${photos[i].url}")`; d.style.opacity = '1'; layers[(n + 1) % 2].style.opacity = '0'; };
    show(0, 0);
    if (photos.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let i = 0, n = 0;
      setInterval(() => { i = (i + 1) % photos.length; show(i, ++n); }, 6000);
    }
  }).catch(() => {});
})();
