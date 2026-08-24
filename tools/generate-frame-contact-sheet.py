#!/usr/bin/env python3
"""Generate production-style visual review sheets.

The layout vocabulary and renderer names intentionally mirror the production
registry in miniprogram/core/innerFrameStyles.js. This is a review artifact,
not a second runtime renderer or a source of app assets.
"""

from pathlib import Path
import hashlib
import random

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "docs" / "readme-assets" / "example.jpg"
OUT = ROOT / "docs" / "production-frame-review"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
STYLES = [
    ("经典细黑边", "clean-black"),
    ("全幅扫描边", "full-frame-scan"),
    ("片门压框", "film-gate"),
    ("35mm 负片", "negative-35mm"),
    ("120 中画幅", "medium-format-120"),
    ("乳剂破损边", "emulsion-damage"),
]


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def sample(size):
    image = Image.open(PHOTO).convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)


def random_for(style):
    return random.Random(int.from_bytes(hashlib.sha256(style.encode()).digest()[:8], "big"))


def polygon_frame(draw, box, width, wobble, rng):
    x, y, r, b = box
    points = []
    for i in range(25): points.append((x - width + i * (r - x + width) / 24, y - width + rng.randint(-wobble, wobble)))
    for i in range(25): points.append((r + width + rng.randint(-wobble, wobble), y - width + i * (b - y + width) / 24))
    for i in range(25): points.append((r + width - i * (r - x + width) / 24, b + width + rng.randint(-wobble, wobble)))
    for i in range(25): points.append((x - width + rng.randint(-wobble, wobble), b + width - i * (b - y + width) / 24))
    draw.polygon(points, fill="#050505")


def compose(style, ratio=(4, 5), size=(520, 650), strength="medium"):
    W, H = size
    canvas = Image.new("RGB", size, "#EEE9DF")
    draw = ImageDraw.Draw(canvas)
    pw, ph = int(W * 0.58), int(H * 0.58)
    px, py = (W - pw) // 2, (H - ph) // 2
    photo = sample((pw, ph))
    rng = random_for(style)
    if style == "clean-black":
        draw.rectangle((px - 7, py - 7, px + pw + 7, py + ph + 7), fill="#050505")
    elif style == "full-frame-scan":
        wobble = {"light": 1, "medium": 3, "strong": 7}.get(strength, 3)
        polygon_frame(draw, (px, py, px + pw, py + ph), 11, wobble, rng)
    elif style == "film-gate":
        draw.rectangle((px - 17, py - 9, px + pw + 12, py + ph + 20), fill="#020202")
        draw.rectangle((px - 17, py - 9, px - 1, py + 18), fill="#020202")
        draw.rectangle((px + pw - 14, py + ph + 3, px + pw + 12, py + ph + 20), fill="#020202")
    elif style == "negative-35mm":
        draw.rectangle((px - 18, py - 28, px + pw + 18, py + ph + 28), fill="#020202")
        gap, hw, hh = 33, 18, 12
        for x in range(px - 8, px + pw + 8, gap):
            draw.rounded_rectangle((x, py - 22, x + hw, py - 22 + hh), radius=4, fill="#EEE9DF")
            draw.rounded_rectangle((x, py + ph + 10, x + hw, py + ph + 10 + hh), radius=4, fill="#EEE9DF")
        draw.text((px + pw // 2 - 24, py - 23), "12A", fill="#EEE9DF", font=font(15))
    elif style == "medium-format-120":
        draw.rectangle((px - 28, py - 18, px + pw + 14, py + ph + 22), fill="#030303")
        draw.ellipse((px - 18, py + ph // 2 - 9, px - 1, py + ph // 2 + 8), fill="#EEE9DF")
        draw.text((px - 24, py + ph + 4), "07", fill="#EEE9DF", font=font(15))
    elif style == "emulsion-damage":
        wobble = {"light": 4, "medium": 8, "strong": 15}.get(strength, 8)
        polygon_frame(draw, (px, py, px + pw, py + ph), 15, wobble, rng)
        for _ in range({"light": 8, "medium": 22, "strong": 48}.get(strength, 22)):
            x = rng.choice([rng.randint(px - 28, px + 10), rng.randint(px + pw - 10, px + pw + 28)])
            y = rng.randint(py - 22, py + ph + 22)
            draw.ellipse((x, y, x + rng.randint(2, 8), y + rng.randint(2, 8)), fill="#030303")
    canvas.paste(photo, (px, py))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1680, 3 * 760), "#DCD8D0")
    draw = ImageDraw.Draw(sheet)
    for row, (label, style) in enumerate(STYLES):
        y = row * 760 + 28
        draw.text((24, y), label, fill="#1A1917", font=font(30))
        full = compose(style)
        sheet.paste(full, (24, y + 48))
        left = full.crop((0, 0, 190, 210)).resize((280, 280), Image.Resampling.NEAREST)
        right = full.crop((330, 420, 520, 650)).resize((280, 280), Image.Resampling.NEAREST)
        edge = full.crop((140, 0, 380, 145)).resize((470, 220), Image.Resampling.NEAREST)
        sheet.paste(left, (580, y + 48)); sheet.paste(right, (890, y + 48)); sheet.paste(edge, (1190, y + 48))
        draw.text((590, y + 345), "左上角", fill="#4A4740", font=font(18))
        draw.text((900, y + 345), "右下角", fill="#4A4740", font=font(18))
        draw.text((1200, y + 240), "长边局部", fill="#4A4740", font=font(18))
    sheet.save(OUT / "full-contact-sheet.png", optimize=True)

    details = Image.new("RGB", (1680, 2 * 940), "#DCD8D0")
    d = ImageDraw.Draw(details)
    for index, (label, style) in enumerate(STYLES):
        x = (index % 3) * 560
        y = (index // 3) * 940
        d.text((x + 20, y + 20), label, fill="#1A1917", font=font(24))
        full = compose(style, size=(520, 650))
        details.paste(full.crop((0, 0, 190, 220)).resize((520, 520), Image.Resampling.NEAREST), (x + 20, y + 70))
    details.save(OUT / "corner-details.png", optimize=True)

    ratios = Image.new("RGB", (1560, 520), "#DCD8D0")
    rd = ImageDraw.Draw(ratios)
    for index, (label, style) in enumerate((STYLES[1], STYLES[2], STYLES[3], STYLES[4], STYLES[5])):
        x = index * 312
        rd.text((x + 12, 14), label, fill="#1A1917", font=font(18))
        ratios.paste(compose(style, size=(280, 400)), (x + 16, 52))
    ratios.save(OUT / "ratio-comparison.png", optimize=True)

    shape = Image.new("RGB", (1680, 500), "#DCD8D0")
    sd = ImageDraw.Draw(shape)
    for index, (label, style) in enumerate(STYLES[:4]):
        x = index * 420
        sd.text((x + 18, 14), label, fill="#1A1917", font=font(20))
        shape.paste(compose(style, size=(390, 430)), (x + 15, 52))
    shape.save(OUT / "shape-regression.png", optimize=True)

    strength_sheet = Image.new("RGB", (1560, 900), "#DCD8D0")
    ss = ImageDraw.Draw(strength_sheet)
    for row, style in enumerate(("full-frame-scan", "emulsion-damage")):
        label = "全幅扫描边" if row == 0 else "乳剂破损边"
        ss.text((18, row * 440 + 12), label, fill="#1A1917", font=font(24))
        for col, level in enumerate(("light", "medium", "strong")):
            x = col * 520 + 18
            ss.text((x, row * 440 + 52), {"light": "轻", "medium": "标准", "strong": "明显"}[level], fill="#4A4740", font=font(18))
            strength_sheet.paste(compose(style, size=(480, 350), strength=level), (x, row * 440 + 82))
    strength_sheet.save(OUT / "strength-comparison.png", optimize=True)
    print(f"wrote production review sheets under {OUT}")


if __name__ == "__main__":
    main()
