// Pagina oficială de bilete (sau, unde nu am găsit una stabilă, pagina oficială a clubului) pentru echipele gazdă din
// football-data.org. Fiecare adresă a fost deschisă și verificată pe 2026-11-13; cluburile care lipsesc de aici
// (nemapate sau cu site care ne-a dat 404 / blocaj) rămân pe căutarea Google, ca să nu trimitem oameni pe o adresă greșită.
// Potrivire pe numele echipei fără diacritice, cuvinte întregi; întâi cele specifice (ex. „manchester city”).
(() => {
  const CLUBS = [
    // Anglia
    ['arsenal', 'https://www.arsenal.com/tickets'],
    ['chelsea', 'https://www.chelseafc.com/en'],
    ['tottenham', 'https://www.tottenhamhotspur.com/tickets'],
    ['manchester city', 'https://www.mancity.com/tickets'],
    ['manchester united', 'https://tickets.manutd.com'],
    ['liverpool', 'https://www.liverpoolfc.com/tickets'],
    ['everton', 'https://www.evertonfc.com/tickets'],
    ['newcastle', 'https://www.newcastleunited.com/en/tickets'],
    ['aston villa', 'https://tickets.avfc.co.uk'],
    ['west ham', 'https://www.whufc.com/en/tickets'],
    ['crystal palace', 'https://www.cpfc.co.uk/tickets/'],
    ['brentford', 'https://www.brentfordfc.com/en/ticket-information'],
    ['leeds', 'https://www.leedsunited.com/en'],
    // Spania
    ['real madrid', 'https://www.realmadrid.com/en-US/tickets'],
    ['espanyol', 'https://www.rcdespanyol.com/'],
    ['barcelona', 'https://www.fcbarcelona.com/en/tickets'],
    ['betis', 'https://www.realbetisbalompie.es/entradas'],
    ['sevilla', 'https://sevillafc.es/'],
    ['valencia', 'https://www.valenciacf.com/'],
    ['getafe', 'https://www.getafecf.com/'],
    ['levante', 'https://www.levanteud.com/'],
    ['athletic', 'https://www.athletic-club.eus/'],
    ['malaga', 'https://www.malagacf.com/'],
    ['rayo vallecano', 'https://www.rayovallecano.es/'],
    // Germania
    ['bayern', 'https://fcbayern.com/en/tickets'],
    ['dortmund', 'https://www.bvb.de/de/en/tickets.html'],
    // Italia („internazionale” înaintea lui „milan”)
    ['juventus', 'https://www.juventus.com/en/tickets/'],
    ['internazionale', 'https://www.inter.it/en/tickets'],
    ['milan', 'https://www.acmilan.com/en/tickets'],
  ];
  const ascii = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rules = CLUBS.map(([frag, url]) => [new RegExp(`(^|[^a-z])${frag}([^a-z]|$)`), url]);
  window.CBClubTickets = { url: team => { const n = ascii(team); return (rules.find(([re]) => re.test(n)) || [])[1] || null; } };
})();
