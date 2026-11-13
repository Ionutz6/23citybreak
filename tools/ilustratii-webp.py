#!/usr/bin/env python3
"""Pregătește ilustrațiile pentru site (rulează din rădăcina repo-ului: python3 tools/ilustratii-webp.py).

1. PNG-urile din assets/guides-prague-style devin WebP la aceeași rezoluție (calitate 90) și PNG-ul se șterge.
   După conversie, intrarea orașului din assets/illustrated-guides.js trebuie să aibă "extension":"webp".
2. Fiecare ilustrație primește o variantă de 800 px lățime în subfolderul 800/ (calitate 82), folosită acolo
   unde imaginea apare mică pe ecran (quiz, pagina de pachet pe telefon). Originalul rămâne pentru vizualizarea mare.

Variantele existente și mai noi decât sursa nu se regenerează. Necesită Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image

FOLDERS = ["assets/guides-prague-style", "ilustratii-quiz", "ilustratii-orase"]
SMALL_WIDTH, SMALL_QUALITY, FULL_QUALITY = 800, 82, 90


def save_webp(image, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "WEBP", quality=quality, method=6)


for folder in map(Path, FOLDERS):
    for png in sorted(folder.glob("*.png")):
        save_webp(Image.open(png), png.with_suffix(".webp"), FULL_QUALITY)
        png.unlink()
        print(f"PNG → WebP: {png.with_suffix('.webp')}")
    for source in sorted(folder.glob("*.webp")):
        small = folder / "800" / source.name
        if small.exists() and small.stat().st_mtime >= source.stat().st_mtime:
            continue
        image = Image.open(source)
        if image.width > SMALL_WIDTH:
            image = image.resize((SMALL_WIDTH, round(image.height * SMALL_WIDTH / image.width)), Image.LANCZOS)
        save_webp(image, small, SMALL_QUALITY)
        print(f"800 px: {small}")
