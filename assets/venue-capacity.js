// Capacitatea APROXIMATIVĂ (locuri la concert) a sălilor și stadioanelor mari din orașele site-ului. Folosită doar ca să ordonăm concertele
// după „cât de mare e artistul” (un artist care umple o arenă contează mai mult decât unul dintr-un club): nu se afișează nicăieri și nu e o cifră oficială.
// Ticketmaster nu dă capacitatea locației; sala necunoscută primește o estimare din nume (stadion / arenă / sală / club).
//   window.CBVenueCap(venueName) → număr de locuri (estimat)
(() => {
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const KNOWN = [
    // Regatul Unit și Irlanda
    ['wembley stadium|wembley', 90000], ['ovo arena wembley|wembley arena|sse arena wembley', 12500], ['the o2|o2 arena|o2 london', 20000], ['hyde park', 65000], ['london stadium', 60000], ['tottenham hotspur stadium', 62000],
    ['twickenham', 82000], ['alexandra palace', 10000], ['brixton', 4900], ['apollo manchester|o2 apollo', 3500], ['eventim apollo|hammersmith', 5000], ['royal albert hall', 5200], ['co-op live|ao arena|manchester arena', 21000],
    ['etihad stadium', 53000], ['old trafford', 74000], ['hydro', 14300], ['hampden', 52000], ['murrayfield', 67000], ['utilita arena|resorts world arena|nec', 15500], ['m&s bank arena|liverpool arena|echo arena', 11000],
    ['3arena', 13000], ['aviva', 51700], ['croke park', 82000], ['bt murrayfield', 67000],
    // Franța
    ['stade de france', 80000], ['la defense arena|paris la defense', 40000], ['accor arena|bercy', 20300], ['zenith', 6500], ['olympia', 2000], ['groupama stadium', 59000], ['ldlc arena', 16000], ['tony garnier', 17000],
    ['velodrome', 67000], ['dome de marseille', 8500], ['pierre-mauroy|pierre mauroy', 50000],
    // Germania
    ['allianz arena', 75000], ['olympiastadion', 70000], ['olympiahalle', 12500], ['olympiapark', 60000], ['sap garden', 11500], ['mercedes-benz arena|uber arena', 17000], ['waldbuhne', 22000], ['velodrom', 12000], ['max-schmeling', 9000],
    ['barclays arena', 16000], ['volksparkstadion', 57000], ['signal iduna park', 81000], ['westfalenhalle', 15000], ['lanxess arena', 20000], ['rheinenergiestadion', 50000], ['deutsche bank park|waldstadion', 58000], ['festhalle', 13500],
    ['schleyer|porsche-arena|cannstatter', 15000], ['red bull arena leipzig', 47000], ['quarterback immobilien', 12000], ['merkur spiel-arena|esprit arena|dusseldorf arena', 54000], ['psd bank dome', 13000], ['zag arena', 14000], ['columbiahalle|tempodrom', 3500],
    // Italia
    ['san siro|meazza', 75000], ['ippodromo', 60000], ['forum di assago|unipol forum|mediolanum forum', 12500], ['stadio olimpico', 70000], ['circo massimo', 70000], ['palazzo dello sport', 11000], ['maradona|san paolo', 54000],
    ['inalpi', 12500], ['allianz stadium', 41000], ['dall.ara', 36000], ['unipol arena', 11000],
    // Spania
    ['metropolitano', 68000], ['bernabeu', 80000], ['movistar arena|wizink', 15000], ['palau sant jordi', 17000], ['estadi olimpic|olimpic lluis companys', 55000], ['camp nou', 99000], ['cartuja', 60000], ['bizkaia arena|bec', 18000], ['san mames', 53000], ['sant jordi club', 4500],
    // Țările de Jos și Belgia
    ['ziggo dome', 17000], ['johan cruij|johan cruyff', 55000], ['afas live', 6000], ['paradiso', 1500], ['ahoy', 16000], ['de kuip', 51000], ['sportpaleis', 18400], ['lotto arena', 5000], ['king baudouin|koning boudewijn', 50000], ['forest national', 8000],
    // Nordice
    ['royal arena', 16000], ['telia parken|parken', 38000], ['den gra hal', 2500], ['ericsson globe|avicii arena|3arena stockholm', 16000], ['strawberry arena|friends arena', 65000], ['tele2 arena', 45000], ['scandinavium', 12000], ['ullevi', 43000],
    ['malmo arena', 15000], ['unity arena|telenor arena', 23000], ['ullevaal', 28000], ['spektrum', 9700], ['veikkaus arena|hartwall', 13500], ['olympiastadion helsinki|helsingin olympiastadion', 36000],
    // Europa Centrală
    ['o2 universum', 7000], ['letnany', 80000], ['eden arena|sinobo', 20000], ['wiener stadthalle|stadthalle', 16000], ['ernst-happel|ernst happel', 55000], ['gasometer', 3000], ['tauron arena', 15000], ['narodowy', 58000], ['atlas arena', 13000],
    ['slaski', 55000], ['spodek', 11000], ['polsat plus arena|ergo arena', 11000], ['budapest sportaren|papp laszlo', 12500], ['puskas', 67000], ['letzigrund', 26000], ['hallenstadion', 13000], ['wankdorf|stade de suisse', 32000], ['st. jakob|st jakob', 9000],
  ].map(([k, n]) => [new RegExp(`(^|[^a-z0-9])(${k})([^a-z0-9]|$)`), n]);
  // Estimare din nume când sala nu e în listă.
  const GUESS = [[/stadion|stadium|stade\b|stadio|estadio|olympi|park\b|festival|open ?air|messe|hipp?odrom|hippodrome|racecourse/, 40000], [/arena|dome|forum|palau|pavilion|pavilhao|hall of|halle\b|sportpaleis|palasport|zenith|spektrum|sporthalle/, 12000],
    [/hall|halle|theatre|theater|teatro|auditorium|palace|palais|concert|kulturhaus|congress|congres|kongress|circus|cirque/, 3000], [/club|klub|bar\b|pub\b|cafe|jazz|loft|fabrik|factory|church|kirche|kulturfabrik|studio|ballroom|cellar|keller/, 600]];
  window.CBVenueCap = name => {
    const n = norm(name);
    if (!n) return 1500;
    for (const [rx, cap] of KNOWN) if (rx.test(n)) return cap;
    for (const [rx, cap] of GUESS) if (rx.test(n)) return cap;
    return 1500;
  };
})();
