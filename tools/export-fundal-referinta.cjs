// Exportă harta de bază (doar uscat, mare și granițe, fără puncte sau text) ca PNG de referință pentru redesenare.
// Rulare: node tools/export-fundal-referinta.cjs [lățime=3000]  (necesită playwright)
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const ROOT = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/visited/europe-map.json'), 'utf8'));
const W = +(process.argv[2] || 3000), H = Math.round(W * map.height / map.width);
const paths = map.countries.map(c => `<path d="${c.d}" fill="${c.active ? '#ffffff' : '#ece8df'}" stroke="#8c8577" stroke-width="0.6"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${map.width} ${map.height}"><rect width="100%" height="100%" fill="#bcd6e3"/>${paths}</svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: W, height: H}});
  await p.setContent(`<body style="margin:0">${svg}</body>`);
  const out = path.join(ROOT, 'tools/fundal-referinta.png');
  await p.screenshot({path: out, clip: {x: 0, y: 0, width: W, height: H}});
  await b.close(); console.log(out, W + '×' + H);
})();
