// Potrivire exactă între o echipă preferată din profil și numele echipelor unui meci.
// „Barcelona” = FC Barcelona, nu și „RCD Espanyol de Barcelona”; „Atletico Madrid” ≠ „Real Madrid”; „Inter” ≠ „AC Milan”.
// Regulă: după ce scoatem cuvintele generice (fc, cf, ac, real, de…), cuvintele echipei preferate trebuie să fie toate în numele
// echipei din meci, iar ce rămâne în plus poate fi doar numele unui oraș (ex. „Bayern” = „FC Bayern München”).
// Aceeași logică (copie) e în supabase/functions/events-alerts/match.ts, pentru emailurile de alertă.
(() => {
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const GENERIC = new Set('fc cf ac as rcd cd ud sd sc sv ssc fk bv vfl vfb tsg fsv rb club de del da di do la le the real calcio football afc 1 04 05 09 96 1899 1846 1910'.split(' '));
  const CITIES = new Set('madrid barcelona munchen munich milano milan roma rome napoli torino turin paris marseille lyon london londra manchester liverpool amsterdam lisboa lisbon porto sevilla seville valencia bilbao dortmund berlin hamburg koln cologne frankfurt stuttgart leipzig bremen lille nice'.split(' '));
  // Nume alternative → forma canonică (cum apare în football-data.org).
  const ALIAS = [
    [/\binternazionale\b|\binter milan\b|\binter milano\b/, 'inter'], [/\batletico\b|\batleti\b/, 'atletico madrid'],
    [/\bpsg\b|\bparis saint germain\b|\bparis sg\b/, 'paris saint germain'], [/\bman utd\b|\bman united\b/, 'manchester united'], [/\bman city\b/, 'manchester city'],
    [/\bspurs\b/, 'tottenham'], [/\bbarca\b/, 'barcelona'], [/\bbayern munchen\b|\bbayern munich\b/, 'bayern'], [/\bjuve\b/, 'juventus'],
  ];
  const tokens = name => {
    let n = norm(name);
    for (const [rx, to] of ALIAS) if (rx.test(n)) { n = to; break; }
    return n.split(' ').filter(w => w && !GENERIC.has(w));
  };
  // fav: ce a scris clientul; team: numele echipei dintr-un meci.
  const matchesTeam = (fav, team) => {
    const f = tokens(fav), t = tokens(team);
    if (!f.length || !t.length || !f.every(w => t.includes(w))) return false;
    return t.filter(w => !f.includes(w)).every(w => CITIES.has(w));
  };
  const api = { matchesTeam, norm };
  if (typeof window !== 'undefined') window.CBTeamMatch = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
