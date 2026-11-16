// Detalii bogate pentru ghidul de weekend (assets/flight-guide.js), pe oraș. Pentru orașele fără intrare aici ghidul
// folosește legenda și traseul din assets/illustrated-guides.js. Prețurile de intrare sunt orientative (rotunjite).
//   objectives: pe aceeași ordine ca legend din illustrated-guides: { text, chips:[[tip,eticheta]] } tip: f=gratuit, p=preț, t=durată, n=notă
//   days: pe aceeași ordine ca days din illustrated-guides: { title, items:[[ora, text, xmas?]] }  (xmas = doar nov-dec)
//   tips: [{ icon, title, text }]
window.CB_GUIDE_DETAILS = {
  'City:vienna_at': {
    objectives: [
      { text: 'Simbolul Vienei, cu acoperiș de țigle colorate. Navă gratuită; 343 de trepte în Turnul de Sud pentru panoramă.', chips: [['f', 'Navă gratuită'], ['p', 'Turn ~6 €'], ['t', '1–1,5 h']] },
      { text: 'Reședința Habsburgilor: apartamentele imperiale și Muzeul Sisi. Heldenplatz se vede gratuit; vino dimineața, sunt cozi mici.', chips: [['p', 'Apartamente + Sisi ~18 €'], ['t', '2 h']] },
      { text: 'Biserica barocă cu cupolă verde. Un lift panoramic te duce lângă fresca din cupolă; afară, bazinul oglindă din Karlsplatz.', chips: [['p', 'Intrare ~9 €'], ['t', '45 min']] },
      { text: 'Palatul de vară imperial, cu grădini până la Gloriette. Rezervă online ora de intrare; grădinile se pot vizita separat.', chips: [['p', 'Palat de la ~27 €'], ['f', 'Grădini ~6 €'], ['t', '3 h']] }
    ],
    days: [
      { title: 'centrul istoric', items: [['09:30', 'Stephansdom: navă și Turnul de Sud, înainte de aglomerație.'], ['11:30', 'Graben și Kohlmarkt: vitrine, o cafea la Demel sau Café Central.'], ['15:00', 'Hofburg: Apartamentele imperiale și Heldenplatz.'], ['18:00', 'Târgul de Crăciun din fața Primăriei (Rathausplatz), deschis până seara.', true]] },
      { title: 'baroc și grădini', items: [['09:00', 'Karlsplatz: Karlskirche și bazinul oglindă.'], ['11:00', 'Palat și grădini la Schönbrunn, apoi urcare la Gloriette pentru panoramă.'], ['17:30', 'Metrou și tren către aeroport: pleacă cu cel puțin 2,5 ore înainte de zbor.']] }
    ],
    tips: [
      { icon: '🚇', title: 'Transport în oraș', text: 'Bilet de 72 h pentru metrou, tramvai și autobuz ~17 €; de la aeroport, trenul CAT sau S7 spre centru, ~15–25 min.' },
      { icon: '🍰', title: 'De încercat', text: 'Sachertorte, Apfelstrudel, șnițel vienez; la cafenele comanzi un „Melange” și stai cât vrei.' },
      { icon: '🕘', title: 'Program', text: 'Duminica magazinele sunt închise; muzeele și palatele rămân deschise.' },
      { icon: '🎫', title: 'Bilete combinate', text: 'Vienna City Card (metrou + reduceri la muzee) sau Sisi Ticket pentru Hofburg + Schönbrunn: merită dacă intri în 3+ obiective.' }
    ]
  }
};
// Moneda locală după codul țării din cityId (City:vienna_at -> at). Euro: zona euro.
window.CB_CURRENCY = (() => {
  const eur = 'at be cy de ee es fi fr gr hr ie it lt lu lv mt nl pt si sk bg ad mc sm va me xk'.split(' ');
  const m = {};
  eur.forEach(c => { m[c] = ['EUR', 'EURO']; });
  Object.assign(m, { ro: ['RON', 'Leul românesc'], cz: ['CZK', 'Coroana cehă'], pl: ['PLN', 'Zlotul polonez'], hu: ['HUF', 'Forintul maghiar'], dk: ['DKK', 'Coroana daneză'], se: ['SEK', 'Coroana suedeză'], no: ['NOK', 'Coroana norvegiană'], ch: ['CHF', 'Francul elvețian'], gb: ['GBP', 'Lira sterlină'], tr: ['TRY', 'Lira turcească'], rs: ['RSD', 'Dinarul sârbesc'], md: ['MDL', 'Leul moldovenesc'], ge: ['GEL', 'Lari georgian'], is: ['ISK', 'Coroana islandeză'], al: ['ALL', 'Leka albaneză'], mk: ['MKD', 'Denarul macedonean'], ba: ['BAM', 'Marca convertibilă'] });
  return m;
})();
