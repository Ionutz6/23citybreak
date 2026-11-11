// Generează assets/visited/cities-data.json și assets/visited/europe-map.json.
// Rulare (o singură dată, la schimbarea listei):
//   npm i --no-save all-the-cities@3 world-atlas@2.0.2 topojson-client@3 d3-geo@3
//   node tools/build-visited-data.cjs
// Coordonatele și populația vin din GeoNames (pachetul all-the-cities), granițele din Natural Earth (world-atlas).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const req = m => require(require.resolve(m, {paths: [process.cwd(), ROOT]}));
const cities = req('all-the-cities');
const topo = req('topojson-client');
const d3 = req('d3-geo');
const atlas = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-50m.json', {paths: [process.cwd(), ROOT]}), 'utf8'));

const COUNTRY = {GB:'Marea Britanie',IE:'Irlanda',IT:'Italia',VA:'Vatican',SM:'San Marino',MC:'Monaco',ES:'Spania',PT:'Portugalia',FR:'Franța',DE:'Germania',AT:'Austria',CH:'Elveția',LI:'Liechtenstein',BE:'Belgia',NL:'Olanda',LU:'Luxemburg',DK:'Danemarca',SE:'Suedia',NO:'Norvegia',FI:'Finlanda',IS:'Islanda',FO:'Insulele Feroe',EE:'Estonia',LV:'Letonia',LT:'Lituania',PL:'Polonia',CZ:'Cehia',SK:'Slovacia',HU:'Ungaria',SI:'Slovenia',HR:'Croația',RS:'Serbia',BA:'Bosnia și Herțegovina',ME:'Muntenegru',MK:'Macedonia de Nord',AL:'Albania',XK:'Kosovo',GR:'Grecia',CY:'Cipru',MT:'Malta',RO:'România',MD:'Moldova',UA:'Ucraina',BG:'Bulgaria',TR:'Turcia',GE:'Georgia',AM:'Armenia',AZ:'Azerbaidjan'};
// ISO numeric (world-atlas) -> alpha-2
const NUM = {826:'GB',372:'IE',380:'IT',336:'VA',674:'SM',492:'MC',724:'ES',620:'PT',250:'FR',276:'DE','040':'AT',756:'CH',438:'LI','056':'BE',528:'NL',442:'LU',208:'DK',752:'SE',578:'NO',246:'FI',352:'IS',234:'FO',233:'EE',428:'LV',440:'LT',616:'PL',203:'CZ',703:'SK',348:'HU',705:'SI',191:'HR',688:'RS','070':'BA',499:'ME',807:'MK','008':'AL',383:'XK',300:'GR',196:'CY',470:'MT',642:'RO',498:'MD',804:'UA',100:'BG',792:'TR',268:'GE','051':'AM','031':'AZ',112:'BY',643:'RU',504:'MA','012':'DZ',788:'TN',818:'EG',760:'SY',368:'IQ',364:'IR',682:'SA',400:'JO',376:'IL',422:'LB',434:'LY',398:'KZ',275:'PS',304:'GL',795:'TM'};
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ş/g,'s').replace(/ţ/g,'t');
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const lines = fs.readFileSync(path.join(__dirname, 'visited-cities.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const out = [], seen = new Set(), warn = [];
for (const line of lines) {
  const [name, lookup, cc, ...opts] = line.split(';');
  const o = {}; for (const p of opts) { const [k, v] = p.split('='); o[k] = v ?? true; }
  const id = o.id ? o.id.replace(/^City:/, '') : `${slug(lookup)}_${cc.toLowerCase()}`;
  if (!/^[a-z0-9-]+_[a-z]{2}$/.test(id)) throw new Error('id invalid ' + id);
  if (seen.has(id)) throw new Error('duplicat ' + id); seen.add(id);
  const cands = cities.filter(c => c.country === cc && (norm(c.name) === norm(lookup) || (c.altName && c.altName.split(',').some(a => norm(a) === norm(lookup))))).sort((a, b) => b.population - a.population);
  const m = cands[0];
  let lat, lon;
  if (o.ll) [lat, lon] = o.ll.split(',').map(Number);
  else if (m) [lon, lat] = m.loc.coordinates;
  else { warn.push(`${name} (${lookup}, ${cc}) negăsit`); continue; }
  if (o.ll && m) { const d = Math.hypot(m.loc.coordinates[1] - lat, m.loc.coordinates[0] - lon); if (d > 0.5) warn.push(`${name}: ll manual diferă de GeoNames cu ${d.toFixed(2)}°`); }
  const pop = m ? m.population : 0;
  out.push({id, name, country: COUNTRY[cc], cc, lat: +lat.toFixed(4), lon: +lon.toFixed(4), pop, tourist: !!o.t, alt: o.alt ? o.alt.split('|') : undefined});
}

// Ilustrațiile quizului (ilustratii-quiz/ilustratie-NNN.webp), în ordinea din assets/quiz.js
const QUIZ_ORDER = 'edinburgh_gb,budapest_hu,brussels_be,chisinau_md,vienna_at,lyon_fr,porto_pt,bologna_it,paris_fr,milan_it,venice_it,copenhagen_dk,madrid_es,barcelona_es,athens_gr,rome_it,pisa_it,naples_it,amsterdam_nl,nice_fr,london_gb,istanbul_tr,lisbon_pt,warsaw_pl,berlin_de,dublin_ie,valencia_es,seville_es,krakow_pl,malaga_es,munich_de,bari_it,split_hr,stockholm_se,dubrovnik_hr,palermo_it,thessaloniki_gr,zurich_ch,catania_it,bratislava_sk,tallinn_ee,oslo_no,marseille_fr,bordeaux_fr,riga_lv,sofia_bg,helsinki_fi,bruges_be,belgrade_rs,vilnius_lt,ljubljana_si,glasgow_gb,cologne_de'.split(',');
const ILL = Object.fromEntries(QUIZ_ORDER.map((id, i) => [id, `ilustratii-quiz/ilustratie-${String(i + 1).padStart(3, '0')}.webp`]));
ILL.florence_it = ILL.pisa_it; // aceeași ilustrație „Pisa și Florența”
// Ilustrații noi generate în lot: ilustratii-orase/<id>.webp (au prioritate doar pentru orașele fără ilustrație de quiz)
const extra = fs.existsSync(path.join(ROOT, 'ilustratii-orase')) ? new Set(fs.readdirSync(path.join(ROOT, 'ilustratii-orase'))) : new Set();
for (const c of out) { if (ILL[c.id]) c.img = ILL[c.id]; else if (extra.has(`${c.id}.webp`)) c.img = `ilustratii-orase/${c.id}.webp`; }
// Lista pentru generarea lotului de ilustrații (orașele fără imagine, cele turistice și mari primele)
const lot = out.filter(c => !c.img).sort((a, b) => (b.tourist - a.tourist) || b.pop - a.pop);
const en = Object.fromEntries(lines.map(l => { const [n, lk, cc, ...o] = l.split(';'); const idOpt = o.find(x => x.startsWith('id=')); return [idOpt ? idOpt.slice(3).replace(/^City:/, '') : `${slug(lk)}_${cc.toLowerCase()}`, lk]; }));
const dn = new Intl.DisplayNames(['en'], {type: 'region'});
const csv = ['id;nume;tara;fisier;nume_prompt;tara_prompt', ...lot.map(c => [c.id, c.name, c.country, `ilustratii-orase/${c.id}.webp`, en[c.id], dn.of(c.cc)].join(';'))];
fs.writeFileSync(path.join(__dirname, 'ilustratii-lot.csv'), csv.join('\n') + '\n');
const missingIll = QUIZ_ORDER.filter(id => !out.some(c => c.id === id));
if (missingIll.length) warn.push('ilustrații fără oraș: ' + missingIll.join(','));

// Proiecție conică conformă centrată pe Europa; harta e precalculată în coordonate SVG.
const W = 1000, H = 860;
const all = topo.feature(atlas, atlas.objects.countries).features;
const europeBox = {type: 'Feature', geometry: {type: 'Polygon', coordinates: [[[-25, 34], [-25, 71.5], [45, 71.5], [45, 34], [-25, 34]]]}};
const proj = d3.geoConicConformal().rotate([-12, 0]).parallels([40, 62]).fitExtent([[190, 10], [W - 10, H - 10]], {type: 'FeatureCollection', features: out.filter(c => c.lat > 34.5 && c.lon > -25).map(c => ({type: 'Feature', geometry: {type: 'Point', coordinates: [c.lon, c.lat]}}))});
const clip = d3.geoPath(proj);
const pathGen = d3.geoPath(proj).digits(1);
const countries = [];
for (const f of all) {
  const cc = NUM[String(f.id).padStart(3, '0')] || NUM[+f.id];
  const b = clip.bounds(f);
  if (!(b[1][0] > -50 && b[0][0] < W + 50 && b[1][1] > -50 && b[0][1] < H + 50)) continue;
  if (!cc) continue;
  // simplifică puțin: lasă d3 să proiecteze, apoi taie la fereastră cu clipExtent
  const p = d3.geoPath(proj.clipExtent([[0, 0], [W, H]])).digits(1)(f);
  if (!p) continue;
  const bb = d3.geoPath(proj).bounds(f);
  countries.push({cc, name: COUNTRY[cc] || f.properties.name, d: p, box: bb.flat().map(v => Math.round(v)), active: !!COUNTRY[cc]});
  proj.clipExtent(null);
}
for (const c of out) { const [x, y] = proj([c.lon, c.lat]); c.x = +x.toFixed(1); c.y = +y.toFixed(1); }
// Azorele sunt în afara cadrului: le desenăm într-un chenar în Atlantic, la sud de Islanda și la vest de Irlanda
// (marginea din stânga a hărții e lăsată liberă prin fitExtent, așa că Canarele și Madeira intră în cadru la locul lor).
const inset = {x: 14, y: 330, w: 150, h: 110};
const outside = out.filter(c => c.x < 0 || c.y > H || c.x > W || c.y < 0);
if (outside.length) {
  // Azore: centrul arhipelagului, ~7° lățime în chenar
  const p2 = d3.geoMercator().center([-28, 38.4]).scale(1000).translate([inset.x + inset.w / 2, inset.y + inset.h / 2 - 8]);
  for (const c of outside) { const [x, y] = p2([c.lon, c.lat]); c.x = +x.toFixed(1); c.y = +y.toFixed(1); c.inset = true; }
  p2.clipExtent([[inset.x, inset.y], [inset.x + inset.w, inset.y + inset.h]]);
  inset.land = all.filter(f => ['724', '620'].includes(String(f.id).padStart(3, '0'))).map(f => ({cc: NUM[String(f.id).padStart(3, '0')], d: d3.geoPath(p2).digits(1)(f)})).filter(l => l.d);
}
// sanity: chenarul nu are voie să acopere orașe reale
const covered = out.filter(c => !c.inset && c.x >= inset.x && c.x <= inset.x + inset.w && c.y >= inset.y && c.y <= inset.y + inset.h);
if (covered.length) warn.push('chenarul acoperă: ' + covered.map(c => c.name).join(', '));
// Îmbunătățire pentru încadrare la zoom: caseta fiecărei țări calculată din orașele ei, nu din teritoriu (Franța/Norvegia au teritorii îndepărtate)
for (const k of countries) {
  const cs = out.filter(c => c.cc === k.cc && !c.inset);
  if (cs.length) k.cityBox = [Math.min(...cs.map(c => c.x)), Math.min(...cs.map(c => c.y)), Math.max(...cs.map(c => c.x)), Math.max(...cs.map(c => c.y))].map(Math.round);
}
proj.clipExtent(null);
const inv = (x, y) => proj.invert([x, y]).map(v => +v.toFixed(3));
const projection = {type: 'geoConicConformal (d3-geo)', rotate: proj.rotate(), parallels: [40, 62], scale: +proj.scale().toFixed(3), translate: proj.translate().map(v => +v.toFixed(3)),
  corners: {stangaSus: inv(0, 0), dreaptaSus: inv(W, 0), stangaJos: inv(0, H), dreaptaJos: inv(W, H), centru: inv(W / 2, H / 2)}};
const mapOut = {width: W, height: H, projection, inset: outside.length ? inset : null, countries};
fs.mkdirSync(path.join(ROOT, 'assets/visited'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'assets/visited/cities-data.json'), JSON.stringify(out));
fs.writeFileSync(path.join(ROOT, 'assets/visited/europe-map.json'), JSON.stringify(mapOut));
console.log(out.length, 'orașe;', countries.length, 'țări pe hartă;', outside.length, 'în chenar');
warn.forEach(w => console.warn('!', w));
