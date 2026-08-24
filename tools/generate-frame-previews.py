#!/usr/bin/env python3
"""Generate compact selector cards from the production style vocabulary.

These are low-resolution runtime previews only. Their structure mirrors the
corresponding renderer types; the full-size composition still runs in Canvas.
"""

from pathlib import Path
import hashlib
import random

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "docs" / "readme-assets" / "example.jpg"
OUT = ROOT / "miniprogram" / "assets" / "frame-previews"
SIZE = (240, 150)


def rng(style):
    return random.Random(int.from_bytes(hashlib.sha256(style.encode()).digest()[:8], "big"))


def sample():
    source = Image.open(PHOTO).convert("RGB")
    if source.width > 2 * source.height:
        source = source.crop((source.width // 4, 0, source.width * 3 // 4, source.height))
    return ImageOps.fit(source, (132, 94), method=Image.Resampling.LANCZOS)


def polygon_frame(draw, photo_box, width, wobble, random):
    x, y, r, b = photo_box
    points = []
    for i in range(9):
        points.append((x - width + i * (r - x + width) / 8, y - width + random.randint(-wobble, wobble)))
    for i in range(9):
        points.append((r + width + random.randint(-wobble, wobble), y - width + i * (b - y + width) / 8))
    for i in range(9):
        points.append((r + width - i * (r - x + width) / 8, b + width + random.randint(-wobble, wobble)))
    for i in range(9):
        points.append((x - width + random.randint(-wobble, wobble), b + width - i * (b - y + width) / 8))
    draw.polygon(points, fill="#050505")


def render(style):
    canvas = Image.new("RGB", SIZE, "#EEE9DF")
    draw = ImageDraw.Draw(canvas)
    photo = sample()
    box = (54, 28, 186, 122)
    random = rng(style)
    if style == "none":
        canvas.paste(photo, (box[0], box[1]))
    elif style == "clean-black":
        draw.rectangle((box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4), fill="#050505")
        canvas.paste(photo, (box[0], box[1]))
    elif style == "full-frame-scan":
        polygon_frame(draw, box, 6, 1, random)
        canvas.paste(photo, (box[0], box[1]))
    elif style == "film-gate":
        draw.rectangle((box[0] - 7, box[1] - 4, box[2] + 5, box[3] + 8), fill="#020202")
        draw.rectangle((box[0] - 7, box[1] - 4, box[0] + 3, box[1] + 7), fill="#020202")
        canvas.paste(photo, (box[0], box[1]))
    elif style == "film-strip-35mm-full":
        draw.rectangle((box[0] - 9, box[1] - 12, box[2] + 9, box[3] + 12), fill="#020202")
        hole_w, hole_h, gap = 8, 5, 15
        for x in range(box[0] - 2, box[2] + 2, gap):
            draw.rounded_rectangle((x, box[1] - 10, x + hole_w, box[1] - 10 + hole_h), radius=2, fill="#EEE9DF")
            draw.rounded_rectangle((x, box[3] + 5, x + hole_w, box[3] + 5 + hole_h), radius=2, fill="#EEE9DF")
        canvas.paste(photo, (box[0], box[1]))
        draw.text((box[0] + 30, box[1] - 9), "BF COLOR 400", fill="#F3A126")
        draw.text((box[0] + 7, box[3] + 4), "01A", fill="#F3A126")
    elif style == "film-rebate-minimal":
        draw.rectangle((box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4), fill="#030303")
        canvas.paste(photo, (box[0], box[1]))
        draw.text((box[0] + 5, box[1] - 2), "BF 400", fill="#F3A126")
        draw.text((box[0] + 52, box[3] + 1), "02", fill="#F3A126")
        draw.polygon([(box[0] + 5, box[3] + 8), (box[0] + 11, box[3] + 4), (box[0] + 11, box[3] + 8)], fill="#F3A126")
        draw.polygon([(box[2] - 11, box[3] + 8), (box[2] - 5, box[3] + 4), (box[2] - 5, box[3] + 8)], fill="#F3A126")
    elif style == "medium-format-120":
        draw.rectangle((box[0] - 13, box[1] - 8, box[2] + 7, box[3] + 9), fill="#030303")
        canvas.paste(photo, (box[0], box[1]))
        draw.ellipse((box[0] - 8, box[1] + 38, box[0] - 1, box[1] + 45), fill="#EEE9DF")
        draw.text((box[0] - 11, box[3] + 2), "07", fill="#EEE9DF")
    elif style == "emulsion-damage":
        polygon_frame(draw, box, 8, 4, random)
        canvas.paste(photo, (box[0], box[1]))
        for _ in range(10):
            x = random.choice([random.randint(box[0] - 12, box[0] + 6), random.randint(box[2] - 6, box[2] + 12)])
            y = random.randint(box[1] - 8, box[3] + 8)
            draw.ellipse((x, y, x + random.randint(1, 4), y + random.randint(1, 4)), fill="#030303")
    return canvas


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for style in ("none", "clean-black", "full-frame-scan", "film-gate", "film-strip-35mm-full", "film-rebate-minimal", "medium-format-120", "emulsion-damage"):
        image = render(style)
        image.save(OUT / f"{style}.png", optimize=True)
    print(f"generated selector previews under {OUT}")
