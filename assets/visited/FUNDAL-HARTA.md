# Fundalul hărții „Orașe vizitate”

## Cum e făcută harta acum

- **Granițe**: Natural Earth 1:50m (pachetul npm `world-atlas`), proiectate la build de `tools/build-visited-data.cjs` în `assets/visited/europe-map.json` (trasee SVG gata calculate).
- **Proiecție**: conică conformă (Lambert) din d3-geo, `rotate [-12, 0]`, paralele standard 40° și 62°, `scale 1038.983`, `translate [490.175, 1491.948]`. Valorile exacte sunt și în `europe-map.json` → `projection`.
- **Cadru**: 1000 × 860 unități (raport 50:43 ≈ 1,163). Colțurile (lon, lat): stânga-sus −57,0 / 63,0 · dreapta-sus 82,4 / 62,1 · stânga-jos −16,1 / 24,4 · dreapta-jos 41,1 / 24,0 · centru 12,9 / 52,9. Fiind conică, marginile de sus și de jos sunt arcuri, nu paralele drepte.
- **Orașe**: coordonate GeoNames, proiectate în aceleași unități (`x`, `y` din `cities-data.json`). Azorele stau într-un chenar desenat de cod în Atlantic (x 14–164, y 330–440). Fundalul trebuie să lase acolo doar mare.

## Straturile

Harta are două straturi:

1. **Fundal**: implicit traseele vectoriale ale țărilor. Opțional, o imagine.
2. **Strat interactiv**, peste fundal: țări clicabile (transparente când există imagine), punctele orașelor, etichetele, zoomul și drag-ul. Toate se calculează din coordonate, deci nu depind de imagine.

Fundalul se schimbă într-un singur loc, în `assets/visited/visited-map.js`:

```js
const config = {
  background: 'assets/visited/fundal-harta.webp',   // gol = harta vectorială
  ...
```

Imaginea trebuie să fie exact 3000 × 2580 px (sau 1000 × 860 ori un multiplu), în aceeași proiecție și același cadru ca `tools/fundal-referinta.png`. Recomand WebP calitate ~82 (≈ 400–700 KB).

## Fundalul activ

`assets/visited/fundal-harta.webp`: acuarelă generată cu ChatGPT pornind de la `tools/fundal-referinta.png`. Abaterea țărmurilor față de referință e de 1 px median și 3-5 px la percentila 90, la rezoluția 3000 px. Niciun oraș nu ajunge în mare.

## Cum testezi un fundal nou fără să schimbi codul

1. Pune imaginea în repo, de exemplu `tools/fundal-nou.webp`.
2. Deschide `orase-vizitate.html?harta-debug=1&harta-fundal=tools/fundal-nou.webp`.
3. Modul debug desenează **cruci roșii** pe 17 orașe de referință (Lisabona, Reykjavik, Dublin, Londra, Paris, Roma, Atena, Istanbul, Oslo, Helsinki, București, Valletta, Tbilisi, Tromsø, Sevilla, Larnaca, Tenerife) și pune jos un **slider** care suprapune conturul vectorial peste imagine.
4. Alinierea e bună dacă fiecare cruce cade pe orașul ei de pe uscat, iar conturul vectorial se suprapune cu țărmurile din imagine, cu o abatere de cel mult ~5 px la zoom 1. Verifică mai ales colțurile (Islanda, Portugalia, Cipru, Georgia), unde generatoarele deformează cel mai des.

## Prompt pentru ChatGPT (imagine → imagine)

Încarcă `tools/fundal-referinta.png` (3000 × 2580) și scrie:

```
Repaint this exact map image in a new style. It is a base map that interactive pins will be placed on by coordinates, so the geography must stay pixel-aligned with the image I uploaded.

Keep EXACTLY: the canvas size (3000 × 2580 px, aspect 50:43), the projection, the position, size and shape of every coastline, island and country border. Do not crop, rotate, zoom, shift, mirror or re-center anything. Land must stay land and sea must stay sea in the same pixels.

Style: hand-painted watercolor travel map on cream textured paper, soft pastel palette. Sea in calm light blue-turquoise washes with subtle wave texture near the coasts. European countries in warm, light cream/sand tones with very soft variation between neighbours, thin brown-grey ink borders. Countries outside Europe (North Africa, Middle East, Russia, Greenland) in a more muted, greyer beige so Europe stands out. Gentle relief shading for the Alps, Pyrenees, Carpathians and Scandinavian mountains, without changing any outline.

Strictly NO text, NO labels, NO country or city names, NO dots, pins, icons, compass, legend, frame or border around the image. The open Atlantic area west of Ireland must stay plain sea. Flat top-down map, not perspective, not 3D.
```

Dacă imaginea primită nu are 3000 × 2580, cere-i: „Return it at exactly 3000×2580 px, same framing.” Poți și să o redimensionezi tu, fără crop.

Notă sinceră: generatoarele de imagini nu țin geometria la pixel. Dacă diferențele trec de ~5 px, punctele ajung în mare. Ai două variante sigure:

- folosești imaginea doar ca textură (hârtie, acuarelă) și păstrezi peste ea conturul vectorial exact, iar eu reglez conturul să fie discret;
- îmi trimiți paleta și stilul care îți plac, iar eu le aplic direct pe harta vectorială, care e mereu exactă.
