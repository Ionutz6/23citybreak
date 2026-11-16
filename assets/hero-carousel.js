// Caruselul de pe prima pagină (hero): fotografii de orașe (Wikimedia Commons, cu credit) și, din când în când, un eveniment mare.
// Mutat din pagina Zboruri (zboruri.html) pe Home; click pe poză duce la Zboruri cu destinația aleasă sau la pachetul evenimentului.
// Cere assets/europe-cities.js (ALL_EUROPE_CITIES) și, pentru slide-urile cu evenimente, assets/events.js.
(() => {
    const ALL_EUROPE_CITIES = window.CB_EUROPE_CITIES || [];
    function normalizeDestQuery(val) {
      return String(val || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    }
    const photoCreditsSeen = new Set();
    function registerPhotoCredit(key, city, photo) {
      if (!photo?.source || photoCreditsSeen.has(photo.source)) return;
      const list = document.getElementById('photo-credit-list');
      const section = document.getElementById('photo-credits');
      if (!list || !section) return;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = photo.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `${city}: ${photo.author} · ${photo.license}`;
      item.appendChild(link); list.appendChild(item); section.hidden = false;
      photoCreditsSeen.add(photo.source);
    }
    // Thirty fixed city photographs, shuffled once per visit.
    const heroImages = [{"name":"Roma","country":"Italia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/330px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Paris","country":"Franța","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/330px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Milano","country":"Italia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Milan_Cathedral_from_Piazza_del_Duomo.jpg/330px-Milan_Cathedral_from_Piazza_del_Duomo.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Veneția","country":"Italia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4f/Venezia_aerial_view.jpg/330px-Venezia_aerial_view.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Florența","country":"Italia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Firenze_-_Piazzale_Michelangelo%2C_Firenze%2C_Italy_-_April_6%2C_2015_02.jpg/330px-Firenze_-_Piazzale_Michelangelo%2C_Firenze%2C_Italy_-_April_6%2C_2015_02.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Bologna","country":"Italia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dd/Torri_di_Bologna%2C_Bologna.jpg/330px-Torri_di_Bologna%2C_Bologna.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Viena","country":"Austria","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Schoenbrunn_philharmoniker_2012.jpg/330px-Schoenbrunn_philharmoniker_2012.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Praga","country":"Cehia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Prague_%286365119737%29.jpg/330px-Prague_%286365119737%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Amsterdam","country":"Țările de Jos","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png/330px-Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Lisabona","country":"Portugalia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/330px-Lisboa_-_Portugal_%2852597836992%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Porto","country":"Portugalia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/330px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Barcelona","country":"Spania","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Evening_light_over_Barcelona.jpg/330px-Evening_light_over_Barcelona.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Madrid","country":"Spania","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Madrid_-_Sky_Bar_360%C2%BA_%28Hotel_Riu_Plaza_Espa%C3%B1a%29%2C_vistas_19.jpg/330px-Madrid_-_Sky_Bar_360%C2%BA_%28Hotel_Riu_Plaza_Espa%C3%B1a%29%2C_vistas_19.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Atena","country":"Grecia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Athens_Acropolis_at_Daybreak.jpg/330px-Athens_Acropolis_at_Daybreak.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Budapesta","country":"Ungaria","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/View_from_Gell%C3%A9rt_Hill_to_the_Danube%2C_Hungary_-_Budapest_%2828493220635%29.jpg/330px-View_from_Gell%C3%A9rt_Hill_to_the_Danube%2C_Hungary_-_Budapest_%2828493220635%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Varșovia","country":"Polonia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Aleja_Niepdleglosci_Warsaw_2022_aerial_%28cropped%29.jpg/330px-Aleja_Niepdleglosci_Warsaw_2022_aerial_%28cropped%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Cracovia","country":"Polonia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/Krakow_Rynek_Glowny_panorama_2.jpg/330px-Krakow_Rynek_Glowny_panorama_2.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Copenhaga","country":"Danemarca","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/2018_-_Christiansborg_from_the_Marble_Bridge.jpg/330px-2018_-_Christiansborg_from_the_Marble_Bridge.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Stockholm","country":"Suedia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/Munkbroleden_with_Kornhamstorg_at_Gamla_Stan%2C_Stockholm%2C_Sweden_01.jpg/330px-Munkbroleden_with_Kornhamstorg_at_Gamla_Stan%2C_Stockholm%2C_Sweden_01.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Oslo","country":"Norvegia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Nationaltheatret_evening.jpg/330px-Nationaltheatret_evening.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Helsinki","country":"Finlanda","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3e/Suomenlinna_%28cropped%29.jpg/330px-Suomenlinna_%28cropped%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Edinburgh","country":"Regatul Unit","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/Skyline_of_Edinburgh.jpg/330px-Skyline_of_Edinburgh.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Londra","country":"Regatul Unit","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/330px-London_Skyline_%28125508655%29.jpeg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Bruxelles","country":"Belgia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Grand_Place_Bruselas_2.jpg/330px-Grand_Place_Bruselas_2.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Berlin","country":"Germania","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/Museumsinsel_Berlin_Juli_2021_1_%28cropped%29_b.jpg/330px-Museumsinsel_Berlin_Juli_2021_1_%28cropped%29_b.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Dubrovnik","country":"Croația","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/The_walls_of_the_fortress_and_View_of_the_old_city._panorama.jpg/330px-The_walls_of_the_fortress_and_View_of_the_old_city._panorama.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Lyon","country":"Franța","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Lyon-part-dieu-2023.jpg/330px-Lyon-part-dieu-2023.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Tallinn","country":"Estonia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Raekoja_plats_at_night.jpg/330px-Raekoja_plats_at_night.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Bruges","country":"Belgia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Br%C3%BCgge_Blick_vom_Belfried_4.jpg/330px-Br%C3%BCgge_Blick_vom_Belfried_4.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"},{"name":"Istanbul","country":"Turcia","image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cb/Historical_peninsula_and_modern_skyline_of_Istanbul.jpg/330px-Historical_peninsula_and_modern_skyline_of_Istanbul.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"}];
    const heroHeadlines = {
  "Roma": [
    "Ai aruncat o monedă în Fontana di Trevi?",
    "Mai ai o dorință de pus în Roma."
  ],
  "Paris": [
    "Ai văzut Parisul de sus?",
    "Turnul Eiffel te așteaptă."
  ],
  "Milano": [
    "Ai urcat pe acoperișul Domului din Milano?",
    "Orașul se vede altfel de acolo."
  ],
  "Veneția": [
    "Ai rătăcit vreodată pe străzile Veneției?",
    "Lasă canalele să-ți arate drumul."
  ],
  "Florența": [
    "Ai admirat Florența deasupra râului Arno?",
    "Descoperă orașul Renașterii."
  ],
  "Bologna": [
    "Ai gustat un ragù la Bologna?",
    "Ia loc la masă în inima Italiei."
  ],
  "Viena": [
    "Ai timp de o cafea la Viena?",
    "Palatele și cafenelele te așteaptă."
  ],
  "Praga": [
    "Ai numărat podurile din Praga?",
    "Descoperă-le la pas."
  ],
  "Amsterdam": [
    "Ai văzut Amsterdamul de pe malul canalelor?",
    "Alege-ți podul preferat."
  ],
  "Lisabona": [
    "Ai urcat pe străzile Lisabonei?",
    "Priveliștea merită fiecare pas."
  ],
  "Porto": [
    "Ai privit apusul peste Douro?",
    "Descoperă Porto de pe ambele maluri."
  ],
  "Barcelona": [
    "Ai descoperit Barcelona lui Gaudí?",
    "Privește orașul cu alți ochi."
  ],
  "Madrid": [
    "Ai ieșit la tapas în Madrid?",
    "Serile de aici merită descoperite."
  ],
  "Atena": [
    "Ai văzut Acropola din Atena?",
    "Pășește prin mii de ani de istorie."
  ],
  "Budapesta": [
    "Ai văzut Budapesta luminată?",
    "Descoper-o de pe malul Dunării."
  ],
  "Varșovia": [
    "Ai descoperit orașul vechi din Varșovia?",
    "Lasă-te surprins de povestea lui."
  ],
  "Cracovia": [
    "Ai ascultat trompeta din Cracovia?",
    "Descoperă piața ei medievală."
  ],
  "Copenhaga": [
    "Ai văzut casele colorate din Copenhaga?",
    "Plimbă-te pe lângă canalul Nyhavn."
  ],
  "Stockholm": [
    "Câte insule poți descoperi în Stockholm?",
    "Începe cu străduțele din Gamla Stan."
  ],
  "Oslo": [
    "Ce mai fac vikingii vremurilor noastre?",
    "E timpul să descoperi Oslo."
  ],
  "Helsinki": [
    "Ai savurat o cafea în Helsinki?",
    "Descoperă farmecul nordului."
  ],
  "Edinburgh": [
    "Ai văzut castelul din Edinburgh?",
    "Urcă spre poveștile Scoției."
  ],
  "Londra": [
    "Cum sună Big Ben la ora exactă?",
    "E timpul să afli pe viu, la Londra."
  ],
  "Bruxelles": [
    "Ai văzut Grand-Place din Bruxelles?",
    "Ia-ți timp și pentru o ciocolată belgiană."
  ],
  "Berlin": [
    "Câte povești încap în Berlin?",
    "Descoperă-le pe străzile orașului."
  ],
  "Dubrovnik": [
    "Ai văzut Adriatica de pe zidurile Dubrovnikului?",
    "Urcă pentru priveliște."
  ],
  "Lyon": [
    "Ai descoperit pasajele ascunse din Lyon?",
    "Începe cu orașul vechi."
  ],
  "Tallinn": [
    "Ai pășit prin Tallinnul medieval?",
    "Descoperă-l dincolo de ziduri."
  ],
  "Bruges": [
    "Ai descoperit canalele din Bruges?",
    "Ia-o la pas prin orașul medieval."
  ],
  "Istanbul": [
    "Ai privit Bosforul din Istanbul?",
    "Descoperă orașul dintre două continente."
  ]
};
    for (let i = heroImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [heroImages[i], heroImages[j]] = [heroImages[j], heroImages[i]];
    }
    let heroIndex = 0;
    const hero = document.querySelector('.hero-image');
    const heroCity = document.getElementById('hero-city');
    let displayedHeroCity = 'Praga';
    // Promo evenimente în carusel (fără dată exactă): un slide din 3, dintre meciurile importante din următoarele 2–13 săptămâni.
    // Click pe slide duce direct la pachetul evenimentului. Lista vine din assets/events.js (CBEvents.promos).
    let heroPromos = [], heroPromoIndex = 0, heroSlideCount = 0, displayedHeroEvent = null;
    const loadHeroPromos = () => window.CBEvents?.promos?.().then(list => { heroPromos = list || []; }).catch(() => {});
    if (window.CBEvents) loadHeroPromos(); else window.addEventListener('load', loadHeroPromos, {once: true});
    function chooseHeroCity() {
      if (displayedHeroEvent && window.CBEvents) { location.href = window.CBEvents.packageUrl(displayedHeroEvent); return; }
      const name = normalizeDestQuery(displayedHeroCity);
      const city = ALL_EUROPE_CITIES.find(c => !c.isAll && normalizeDestQuery(c.name) === name) || (name === 'florenta' ? ALL_EUROPE_CITIES.find(c => c.id === 'City:pisa_it') : null);
      // Click pe poză: pagina Zboruri cu destinația deja aleasă (sau pachetul evenimentului).
      location.href = city ? `zboruri.html?dest=${encodeURIComponent(city.id)}#configurator` : 'zboruri.html';
    }
    hero.addEventListener('click', chooseHeroCity);
    hero.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseHeroCity(); } });
    const heroPhotoCache = new Map();
    function getHeroPhoto(item) {
      if (!heroPhotoCache.has(item.image)) {
        heroPhotoCache.set(item.image, (async () => {
          const thumbnail = new URL(item.image);
          if (thumbnail.protocol !== 'https:' || thumbnail.hostname !== 'thumb.wikimedia.org' || !thumbnail.pathname.startsWith('/wikipedia/commons/')) return null;
          const parts = thumbnail.pathname.split('/');
          const fileName = decodeURIComponent(parts[parts.length - 2]);
          const params = new URLSearchParams({action:'query',titles:`File:${fileName}`,prop:'imageinfo',iiprop:'url|extmetadata',format:'json',origin:'*'});
          const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {signal:AbortSignal.timeout(10000)});
          if (!response.ok) return null;
          const info = Object.values((await response.json()).query?.pages || {})[0]?.imageinfo?.[0];
          const meta = info?.extmetadata;
          if (!info?.descriptionurl || !meta?.Artist?.value || !meta?.LicenseShortName?.value) return null;
          const author = new DOMParser().parseFromString(meta.Artist.value,'text/html').body.textContent.trim();
          const license = new DOMParser().parseFromString(meta.LicenseShortName.value,'text/html').body.textContent.trim();
          const source = new URL(info.descriptionurl);
          if (!author || !license || source.protocol !== 'https:' || source.hostname !== 'commons.wikimedia.org') return null;
          const large = new URL(thumbnail.href);
          large.pathname = large.pathname.replace(/\/\d+px-/, '/960px-');
          return {url:large.href, fallback:thumbnail.href,source:source.href,author,license};
        })().catch(() => null).then(photo => { if (!photo) heroPhotoCache.delete(item.image); return photo; }));
      }
      return heroPhotoCache.get(item.image);
    }
    function preloadHero(url) {
      return new Promise(resolve => {
        const img = new Image();
        const timeout = setTimeout(() => { img.onload = img.onerror = null; resolve(false); }, 8000);
        img.onload = () => { clearTimeout(timeout); resolve(true); };
        img.onerror = () => { clearTimeout(timeout); resolve(false); };
        img.src = url;
      });
    }
    function fitHeroHeadline() {
      const heading = document.getElementById('hero-headline');
      if (!heading) return;
      heading.style.fontSize = '';
      let size = parseFloat(getComputedStyle(heading).fontSize);
      const range = document.createRange();
      range.selectNodeContents(heading);
      const lineCount = () => new Set(Array.from(range.getClientRects(), rect => rect.width ? Math.round(rect.top) : null).filter(top => top !== null)).size;
      while ((lineCount() > 3 || heading.scrollHeight > heading.clientHeight + 1) && size > 16) {
        size -= 0.5;
        heading.style.fontSize = `${size}px`;
      }
    }
    window.addEventListener('resize', fitHeroHeadline);
    document.fonts?.ready.then(fitHeroHeadline);
    fitHeroHeadline();
    async function advanceHero() {
      let shown = false;
      heroSlideCount++;
      const heroKicker = hero.querySelector('.hero-image-label span');
      if (heroPromos.length && heroSlideCount % 3 === 0) {
        const ev = heroPromos[heroPromoIndex++ % heroPromos.length];
        const E = window.CBEvents, photo = await E.eventPhoto(ev).catch(() => null);
        if (photo?.url && await preloadHero(photo.url)) {
          const city = E.helpers.cityName(ev.city_id), month = E.helpers.monthName(ev);
          hero.style.backgroundImage = `linear-gradient(90deg,#111211 0%,transparent 24%),linear-gradient(0deg,rgba(0,0,0,.52),transparent 60%),url("${photo.url.replace(/["\\]/g, '')}")`;
          heroKicker.textContent = ev.kind === 'football' || ev.kind === 'sport' ? 'MECI DE WEEKEND' : 'EVENIMENT DE WEEKEND';
          heroCity.textContent = `${ev.title} · ${city}`;
          hero.setAttribute('aria-label', `Vezi pachetul de weekend: ${ev.title}, ${city}`);
          const heading = document.getElementById('hero-headline');
          const highlight = document.createElement('em');
          highlight.textContent = ev.kind === 'football' || ev.kind === 'sport' ? `Prinde meciul în ${month}.` : `Fii acolo în ${month}.`;
          heading.replaceChildren(document.createTextNode(`${ev.title.replace(/ \(rugby\)$/, '')} la ${city}. `), highlight);
          fitHeroHeadline();
          const m = /^Foto: (.+) · ([^·]+)$/.exec(photo.credit || '');
          if (m && photo.creditUrl) registerPhotoCredit(photo.creditUrl, `${ev.venue || city}`, {source: photo.creditUrl, author: m[1], license: m[2]});
          displayedHeroEvent = ev;
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setTimeout(advanceHero, 7000);
          return;
        }
      }
      for (let attempts = 0; attempts < 4 && !shown; attempts++) {
        const item = heroImages[heroIndex];
        heroIndex = (heroIndex + 1) % heroImages.length;
        const photo = await getHeroPhoto(item);
        if (!photo) continue;
        let url = photo.url;
        if (!await preloadHero(url)) {
          url = photo.fallback;
          if (!await preloadHero(url)) continue;
        }
        hero.style.backgroundImage = `linear-gradient(90deg,#111211 0%,transparent 24%),linear-gradient(0deg,rgba(0,0,0,.52),transparent 60%),url("${url}")`;
        heroCity.textContent = `${item.name} · ${item.country}`;
        heroKicker.textContent = 'DESTINAȚIE DE WEEKEND';
        displayedHeroCity = item.name; displayedHeroEvent = null;
        hero.setAttribute('aria-label', `Alege ${item.name} ca destinație`);
        const headline = heroHeadlines[item.name] || [`Descoperă ${item.name}.`, 'Alege-ți următorul weekend.'];
        const heading = document.getElementById('hero-headline');
        const highlight = document.createElement('em');
        highlight.textContent = headline[1];
        heading.replaceChildren(document.createTextNode(headline[0] + ' '), highlight);
        fitHeroHeadline();
        registerPhotoCredit(item.image, `${item.name}, ${item.country}`, photo);
        shown = true;
      }
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches || !shown) setTimeout(advanceHero, shown ? 7000 : 15000);
    }
    advanceHero();
})();
