#!/usr/bin/env python3
"""Give each book's spine the dominant colour of its cover.

    python3 scripts/spine-colors.py            # fill in books that have a cover but no "color"
    python3 scripts/spine-colors.py --redo     # recompute every book that has a cover
    python3 scripts/spine-colors.py --dry-run  # print what would change

Needs Pillow (pip install pillow). Books without a cover, or with a `color`
you set by hand (unless --redo), are left alone; the page falls back to its
per-book pseudo-random palette for those.
"""
import argparse
import colorsys
import io
import json
import pathlib
import urllib.request

DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "books.json"


def dominant(img):
    """Pick the colour that covers the most 'interesting' pixels.

    Pixels are weighted by saturation and by how far they are from black or
    paper-white, so text, margins and shadows don't win; the winner is the
    heaviest hue/lightness bucket, averaged.
    """
    img = img.convert("RGB").resize((40, 60))
    buckets = {}
    for r, g, b in img.getdata():
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v < 0.12 or (v > 0.93 and s < 0.15):
            continue
        weight = 0.02 + (s ** 1.5) * max(0.0, 1 - abs(v - 0.55) * 1.2)
        key = (round(h * 12) % 12, v > 0.5)
        w, sr, sg, sb = buckets.get(key, (0, 0, 0, 0))
        buckets[key] = (w + weight, sr + r * weight, sg + g * weight, sb + b * weight)
    if not buckets:
        return None
    w, sr, sg, sb = max(buckets.values(), key=lambda t: t[0])
    r, g, b = sr / w / 255, sg / w / 255, sb / w / 255
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    # keep it a spine colour: not washed out into the cream page, not muddy
    v = min(max(v, 0.28), 0.78)
    s = max(s, 0.22) if s > 0.05 else s
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "navoditte.github.io spine-colors"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("Pillow is required: pip install pillow")

    books = json.loads(DATA.read_text())
    changed = 0
    for b in books:
        url = b.get("cover") or (
            f"https://covers.openlibrary.org/b/isbn/{b['isbn']}-M.jpg?default=false" if b.get("isbn") else ""
        )
        if not url or (b.get("color") and not a.redo):
            continue
        try:
            color = dominant(Image.open(io.BytesIO(fetch(url))))
        except Exception as e:
            print(f"skip  {b['title']}: {e}")
            continue
        if color:
            print(f"{color}  {b['title']}")
            b["color"] = color
            changed += 1
    if changed and not a.dry_run:
        DATA.write_text(json.dumps(books, indent=2, ensure_ascii=False) + "\n")
    print(f"{changed} spine colours {'would be ' if a.dry_run else ''}set.")


if __name__ == "__main__":
    main()
