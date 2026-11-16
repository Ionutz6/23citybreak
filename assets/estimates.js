// Estimări orientative pentru pagina de pachet (weekend.html): cazare și bilet la eveniment.
// NU sunt prețuri live. Sunt medii rotunjite, puse de noi, ca omul să-și facă o idee înainte să caute.
// Prețul zborului rămâne cel real (Kiwi). Eticheta „estimare” trebuie să apară mereu lângă aceste sume.
//
// CAZARE: preț pe noapte pentru 2 persoane, cameră dublă de hotel 3★ sau apartament simplu, media pe an
// (Booking și Airbnb la un loc, rotunjit la 5 €). Ajustări: +10% dacă în șederea ta intră o noapte de vineri sau sâmbătă,
// +20% la evenimente mari (hotelurile urcă prețurile în orașul evenimentului). Se verifică manual, o dată pe an.
// BILET: „de la” = biletul cel mai ieftin realist pe persoană, nu cel din categoria bună. La fotbal, la cluburile mari
// biletele de la club se epuizează, iar pe piața secundară prețul e de obicei de 2–4 ori mai mare.
(function () {
  const STAY = {"london_gb":175,"manchester_gb":110,"liverpool_gb":105,"edinburgh_gb":150,"birmingham_gb":100,"bristol_gb":110,"leeds_gb":100,"glasgow_gb":105,"newcastle_gb":95,"belfast_gb":100,"dublin_ie":165,"milan_it":140,"rome_it":135,"bologna_it":110,"venice_it":165,"naples_it":95,"pisa_it":95,"catania_it":85,"palermo_it":85,"bari_it":85,"turin_it":100,"verona_it":110,"genoa_it":95,"cagliari_it":85,"alghero_it":85,"pescara_it":75,"perugia_it":85,"trieste_it":90,"barcelona_es":135,"madrid_es":115,"valencia_es":95,"malaga_es":100,"seville_es":100,"alicante_es":80,"bilbao_es":105,"palma_es":115,"ibiza_es":140,"menorca_es":110,"tenerife_es":90,"gran-canaria_es":85,"lanzarote_es":85,"fuerteventura_es":85,"santander_es":90,"zaragoza_es":80,"paris_fr":170,"nice_fr":130,"lyon_fr":110,"marseille_fr":100,"bordeaux_fr":110,"toulouse_fr":95,"nantes_fr":95,"strasbourg_fr":105,"lille_fr":95,"berlin_de":100,"munich_de":140,"frankfurt_de":125,"hamburg_de":115,"cologne_de":105,"dusseldorf_de":110,"stuttgart_de":110,"nuremberg_de":95,"dortmund_de":90,"memmingen_de":85,"hannover_de":95,"leipzig_de":85,"bremen_de":90,"karlsruhe_de":90,"lisbon_pt":115,"porto_pt":95,"faro_pt":90,"funchal_pt":95,"athens_gr":85,"thessaloniki_gr":70,"heraklion_gr":75,"chania_gr":80,"rhodes_gr":85,"corfu_gr":90,"santorini_gr":170,"mykonos_gr":180,"zakynthos_gr":85,"vienna_at":110,"salzburg_at":115,"innsbruck_at":115,"graz_at":85,"zurich_ch":185,"geneva_ch":180,"basel_ch":150,"bruges_be":120,"brussels_be":105,"amsterdam_nl":165,"eindhoven_nl":105,"rotterdam_nl":115,"luxembourg_lu":125,"copenhagen_dk":150,"billund_dk":100,"stockholm_se":120,"gothenburg_se":105,"malmo_se":100,"oslo_no":145,"bergen_no":130,"tromso_no":140,"helsinki_fi":110,"rovaniemi_fi":130,"reykjavik_is":160,"tallinn_ee":85,"riga_lv":75,"vilnius_lt":70,"kaunas_lt":60,"warsaw_pl":80,"krakow_pl":75,"katowice_pl":65,"gdansk_pl":80,"wroclaw_pl":70,"poznan_pl":65,"prague_cz":90,"bratislava_sk":80,"budapest_hu":85,"zagreb_hr":80,"split_hr":95,"dubrovnik_hr":125,"zadar_hr":85,"pula_hr":80,"ljubljana_si":95,"belgrade_rs":65,"sarajevo_ba":60,"podgorica_me":60,"tivat_me":85,"skopje_mk":50,"tirana_al":55,"sofia_bg":55,"varna_bg":55,"burgas_bg":55,"chisinau_md":45,"larnaca_cy":80,"paphos_cy":80,"luqa_mt":95,"bucharest_ro":65,"cluj-napoca_ro":60,"timisoara_ro":55,"iasi_ro":50,"sibiu_ro":55,"suceava_ro":45,"craiova_ro":45,"brasov_ro":55,"bacau_ro":40,"oradea_ro":50,"istanbul_tr":75,"antalya_tr":65,"izmir_tr":60,"bodrum_tr":70,"tbilisi_ge":55,"kutaisi_ge":40,"yerevan_am":55};
  const BIG_CLUBS = ['real madrid', 'barcelona', 'bayern', 'paris saint', 'psg', 'liverpool', 'manchester united', 'manchester city', 'arsenal', 'chelsea', 'tottenham', 'juventus', 'inter', 'milan', 'atl', 'dortmund', 'napoli', 'roma', 'lazio'];
  const FOOTBALL = { CL: 70, PL: 70, PD: 55, SA: 45, BL1: 40, FL1: 35, DED: 30, PPL: 30 };
  const iso = d => new Date(d + 'T12:00:00Z');
  const nightsOf = (out, back) => Math.max(1, Math.round((iso(back) - iso(out)) / 864e5));
  function hasWeekendNight(out, back) {
    for (let d = iso(out); d < iso(back); d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w === 5 || w === 6) return true; }
    return false;
  }
  const round5 = n => Math.round(n / 5) * 5;
  // Eveniment „mare”: Champions League sau concert/festival cu scor mare de popularitate.
  const isBig = ev => (ev.kind === 'football' && ev.competition === 'CL') || ((ev.kind === 'concert' || ev.kind === 'festival') && (ev.popularity || 0) >= 62);

  /** { perNight, nights, total, big } sau null când nu avem orașul. */
  function stay(slug, out, back, ev) {
    const base = STAY[slug]; if (!base) return null;
    const nights = nightsOf(out, back), big = !!(ev && isBig(ev));
    const perNight = round5(base * (hasWeekendNight(out, back) ? 1.1 : 1) * (big ? 1.2 : 1));
    return { perNight, nights, total: perNight * nights, big };
  }

  /** { eur, real } pe persoană (eur 0 = intrare liberă) sau null când nu estimăm. */
  function ticket(ev) {
    if (ev.price_min_eur) return { eur: Math.round(ev.price_min_eur), real: true };
    const t = (ev.title || '').toLowerCase(), pop = ev.popularity || 0;
    let eur = null;
    switch (ev.kind) {
      case 'city_festival': case 'market': return { eur: 0, real: false };
      case 'football': {
        const base = FOOTBALL[ev.competition]; if (!base) return null;
        const top = (ev.teams || []).some(x => BIG_CLUBS.some(c => String(x).toLowerCase().includes(c)));
        eur = base * (top ? 1.5 : 1); break;
      }
      case 'concert': eur = pop >= 62 ? 70 : pop >= 42 ? 50 : 35; break;
      case 'festival': eur = pop >= 62 ? 80 : 55; break;
      case 'theatre': eur = 40; break;
      case 'comedy': eur = 30; break;
      case 'sport':
        eur = /rugby|six nations|champions cup|challenge cup/.test(t) ? 45
          : /euroleague|basket|lions/.test(t) ? 35
          : /hockey|\bhc\b|giants|storm|panthers|blaze/.test(t) ? 25
          : /boxing|mma|wwe|championship/.test(t) ? 60
          : 40; break;
      default: return null;
    }
    return { eur: round5(eur), real: false };
  }
  window.CBEstimates = { stay, ticket, nightsOf };
})();
