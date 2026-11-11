# Ilustrații pentru galeria „Orașe vizitate”

Galeria din profil folosește cele 53 de ilustrații din `ilustratii-quiz/` (Florența primește aceeași imagine ca Pisa). Celelalte 354 de orașe apar cu un placeholder („Ilustrație în pregătire”) până se generează imaginea lor.

## Lotul de generat

Lista completă e în `tools/ilustratii-lot.csv`, ordonată cu orașele mici turistice primele, apoi după populație. Coloane: `id;nume;tara;fisier;nume_prompt;tara_prompt`.

Pași:

1. Generezi imaginea cu promptul de mai jos, înlocuind `{nume_prompt}` și `{tara_prompt}` din CSV.
2. Salvezi la 1024×1536 px, format WebP (calitate ~80), în calea din coloana `fisier` (ex. `ilustratii-orase/hallstatt_at.webp`).
3. Rulezi `node tools/build-visited-data.cjs` (vezi antetul scriptului pentru dependențe). Scriptul găsește singur fișierele noi și actualizează `cities-data.json` și CSV-ul.

## Prompt (același stil ca ilustrațiile din quiz)

```
Hand-painted watercolor illustrated tourist map of {nume_prompt}, {tara_prompt}, portrait 2:3, bird's-eye isometric view, soft pastel palette on cream textured paper, loose ink outlines, visible brush strokes and paper grain. Beige street grid with white streets, small round trees and soft green parks, water in soft blue watercolor washes where the town has a river, lake or sea. Detailed illustrated versions of the 5 to 7 most famous landmarks and views of {nume_prompt}, each recognisable and in its real relative position. A red dotted walking route with round numbered red stop markers connecting half of the landmarks, and a blue dotted route with round numbered blue stop markers connecting the rest. Distant skyline or landscape typical of the place along the top edge. Charming storybook travel-map style, no text, no labels, high detail.

--ar 2:3 --style raw --v 7

Negative: photorealistic, 3D render, neon, dark, text, letters, watermark, blurry.
```

Pentru orașele mici (Hallstatt, Giethoorn, Bled etc.) merge bine să adaugi la final peisajul specific, de exemplu „lake and Alpine mountains”, „canals and thatched-roof farmhouses”, „lake with island church and castle on a cliff”. Verifică fiecare imagine înainte de publicare: generatoarele inventează uneori clădiri.
