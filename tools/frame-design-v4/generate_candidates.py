#!/usr/bin/env python3
"""Generate deterministic V4 film-frame candidates for human review.

This is a design-only Pillow renderer. It never writes to miniprogram/ and is
not a replacement for the production Canvas renderer.
"""

from pathlib import Path
import hashlib
import random

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
PHOTO = ROOT / "docs" / "readme-assets" / "example.jpg"
OUT = ROOT / "docs" / "frame-design-v4"
FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


CANDIDATES = [
    ("a1-mount-line", "A1 经典装裱线", "A"),
    ("a2-scan-edge-a", "A2 全幅扫描 A", "A"),
    ("a2-scan-edge-b", "A2 全幅扫描 B", "A"),
    ("a2-scan-edge-c", "A2 全幅扫描 C", "A"),
    ("a3-film-gate", "A3 片门压框", "A"),
    ("a4-emulsion-a", "A4 乳剂破损 A", "A"),
    ("a4-emulsion-b", "A4 乳剂破损 B", "A"),
    ("a4-emulsion-c", "A4 乳剂破损 C", "A"),
    ("b1-negative-35mm", "B1 35mm 负片", "B"),
    ("b2-medium-format-120", "B2 120 中画幅", "B"),
    ("b3-cine-16mm", "B3 16mm 电影胶片", "B"),
    ("b4-contact-sheet", "B4 接触印样", "B"),
]


def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


def rng_for(candidate):
    digest = hashlib.sha256(candidate.encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def photo_for(size, mode):
    image = Image.open(PHOTO).convert("RGB")
    if mode == "portrait":
        crop = (image.width // 5, 0, image.width * 4 // 5, image.height)
    elif mode == "square":
        side = min(image.width, image.height)
        crop = ((image.width - side) // 2, (image.height - side) // 2,
                (image.width + side) // 2, (image.height + side) // 2)
    else:
        crop = (0, 0, image.width, image.height)
    return ImageOps.fit(image.crop(crop), size, method=Image.Resampling.LANCZOS)


def polygon_band(draw, rect, width, wobble, rng, fill="#050505"):
    x, y, right, bottom = rect
    points = []
    for i in range(25):
        t = i / 24
        points.append((x - width + t * (right - x + width), y - width + rng.randint(-wobble, wobble)))
    for i in range(25):
        t = i / 24
        points.append((right + width + rng.randint(-wobble, wobble), y - width + t * (bottom - y + width)))
    for i in range(25):
        t = i / 24
        points.append((right + width - t * (right - x + width), bottom + width + rng.randint(-wobble, wobble)))
    for i in range(25):
        t = i / 24
        points.append((x - width + rng.randint(-wobble, wobble), bottom + width - t * (bottom - y + width)))
    draw.polygon(points, fill=fill)


def draw_perfs(draw, rect, base, hole_w, hole_h, gap, fill):
    x, y, right, bottom = rect
    for pos in range(int(x - gap), int(right + gap), gap):
        draw.rounded_rectangle((pos, y - base * 0.72, pos + hole_w, y - base * 0.72 + hole_h), radius=max(1, hole_h // 4), fill=fill)
        draw.rounded_rectangle((pos, bottom + base * 0.25, pos + hole_w, bottom + base * 0.25 + hole_h), radius=max(1, hole_h // 4), fill=fill)


def draw_candidate(draw, candidate, rect, rng, bg):
    x, y, right, bottom = rect
    width = right - x
    height = bottom - y
    if candidate == "a1-mount-line":
        draw.rectangle((x - 8, y - 8, right + 8, bottom + 8), fill="#090909")
        return
    if candidate.startswith("a2-scan-edge"):
        wobble = {"a2-scan-edge-a": 2, "a2-scan-edge-b": 5, "a2-scan-edge-c": 8}[candidate]
        polygon_band(draw, rect, 12, wobble, rng)
        if candidate.endswith("b"):
            draw.rectangle((x - 14, y + height * .28, x - 3, y + height * .48), fill="#050505")
        if candidate.endswith("c"):
            draw.polygon([(right - 3, y - 12), (right + 18, y - 12), (right + 9, y + 34)], fill="#050505")
        return
    if candidate == "a3-film-gate":
        draw.rectangle((x - 22, y - 12, right + 16, bottom + 24), fill="#030303")
        draw.rectangle((x - 22, y - 12, x - 3, y + 30), fill="#030303")
        draw.rectangle((right - 20, bottom - 19, right + 16, bottom + 24), fill="#030303")
        draw.line((x - 22, y + 18, x - 22, bottom - 28), fill="#1D1B19", width=2)
        return
    if candidate.startswith("a4-emulsion"):
        wobble = {"a4-emulsion-a": 5, "a4-emulsion-b": 10, "a4-emulsion-c": 16}[candidate]
        polygon_band(draw, rect, 15, wobble, rng, fill="#030303")
        count = {"a4-emulsion-a": 8, "a4-emulsion-b": 20, "a4-emulsion-c": 38}[candidate]
        for _ in range(count):
            side = rng.choice(("left", "right", "top", "bottom"))
            if side == "left": px, py = rng.randint(x - 34, x + 7), rng.randint(y, bottom)
            elif side == "right": px, py = rng.randint(right - 7, right + 34), rng.randint(y, bottom)
            elif side == "top": px, py = rng.randint(x, right), rng.randint(y - 30, y + 6)
            else: px, py = rng.randint(x, right), rng.randint(bottom - 6, bottom + 30)
            size = rng.randint(2, 8 if candidate.endswith("c") else 5)
            draw.polygon([(px, py), (px + size, py - size // 2), (px + size * 2, py + size // 2)], fill="#030303")
        return
    if candidate == "b1-negative-35mm":
        draw.rectangle((x - 25, y - 39, right + 25, bottom + 39), fill="#020202")
        draw_perfs(draw, rect, 39, 20, 13, 38, bg)
        draw.text((x + width * .46, y - 31), "12A", fill=bg, font=font(15), anchor="mm")
        return
    if candidate == "b2-medium-format-120":
        draw.rectangle((x - 34, y - 22, right + 16, bottom + 29), fill="#030303")
        draw.rectangle((x - 34, y - 22, x - 20, bottom + 29), fill="#090909")
        draw.ellipse((x - 22, y + height * .43, x - 7, y + height * .49), fill=bg)
        draw.text((x - 27, bottom + 4), "07  ·  120", fill=bg, font=font(13), anchor="lm")
        return
    if candidate == "b3-cine-16mm":
        draw.rectangle((x - 19, y - 22, right + 19, bottom + 22), fill="#030303")
        for pos in range(int(y - 4), int(bottom + 5), 32):
            draw.rounded_rectangle((x - 14, pos, x - 4, pos + 18), radius=3, fill=bg)
        draw.text((right + 2, y + height * .52), "· 03", fill=bg, font=font(12), anchor="lm")
        return
    if candidate == "b4-contact-sheet":
        draw.rectangle((x - 25, y - 36, right + 25, bottom + 36), fill="#020202")
        draw.line((x - 12, y - 15, right + 12, y - 15), fill=bg, width=2)
        draw.line((x - 12, bottom + 15, right + 12, bottom + 15), fill=bg, width=2)
        for i, pos in enumerate(range(int(x), int(right), 75), 1):
            draw.line((pos, y - 25, pos, y - 12), fill=bg, width=2)
            draw.text((pos + 10, bottom + 17), f"{i:02d}", fill=bg, font=font(10))
        return


def compose(candidate, mode, output=(720, 520)):
    W, H = output
    bg = "#EEE9DF"
    canvas = Image.new("RGB", output, bg)
    draw = ImageDraw.Draw(canvas)
    rng = rng_for(f"{candidate}:{mode}")
    if mode == "portrait":
        pw, ph = int(W * .54), int(H * .65)
    elif mode == "square":
        pw, ph = int(W * .58), int(H * .58)
    else:
        pw, ph = int(W * .66), int(H * .48)
    px, py = (W - pw) // 2, (H - ph) // 2
    photo = photo_for((pw, ph), mode)
    draw_candidate(draw, candidate, (px, py, px + pw, py + ph), rng, bg)
    canvas.paste(photo, (px, py))
    return canvas


def save_candidate(candidate, label):
    folder = OUT / "styles" / candidate
    folder.mkdir(parents=True, exist_ok=True)
    landscape = compose(candidate, "landscape", (720, 520))
    portrait = compose(candidate, "portrait", (520, 720))
    square = compose(candidate, "square", (620, 620))
    landscape.save(folder / "landscape.png", optimize=True)
    portrait.save(folder / "portrait.png", optimize=True)
    square.save(folder / "square.png", optimize=True)
    tl = landscape.crop((0, 0, 310, 225)).resize((620, 450), Image.Resampling.NEAREST)
    br = landscape.crop((410, 295, 720, 520)).resize((620, 450), Image.Resampling.NEAREST)
    edge = landscape.crop((150, 0, 570, 160)).resize((840, 320), Image.Resampling.NEAREST)
    tl.save(folder / "top-left-detail.png", optimize=True)
    br.save(folder / "bottom-right-detail.png", optimize=True)
    edge.save(folder / "edge-detail.png", optimize=True)
    phone = ImageOps.contain(landscape, (390, 690), method=Image.Resampling.LANCZOS)
    phone_canvas = Image.new("RGB", (390, 844), "#171614")
    phone_canvas.paste(phone, ((390 - phone.width) // 2, 75))
    ImageDraw.Draw(phone_canvas).text((18, 24), label, fill="#F1EEE7", font=font(17))
    phone_canvas.save(folder / "phone-preview.png", optimize=True)
    card = ImageOps.fit(landscape.crop((40, 40, 360, 260)), (136, 92), method=Image.Resampling.LANCZOS)
    card.save(folder / "selector-card.png", optimize=True)


def labeled_grid(items, filename, columns, card_size=(360, 280), title=True):
    rows = (len(items) + columns - 1) // columns
    margin = 18
    top = 54 if title else 12
    sheet = Image.new("RGB", (columns * (card_size[0] + margin) + margin, rows * (card_size[1] + 42) + top), "#DCD8D0")
    draw = ImageDraw.Draw(sheet)
    if title:
        draw.text((margin, 14), filename.replace(".png", ""), fill="#171614", font=font(24))
    for index, (candidate, label) in enumerate(items):
        x = margin + (index % columns) * (card_size[0] + margin)
        y = top + (index // columns) * (card_size[1] + 42)
        image = ImageOps.contain(compose(candidate, "landscape", card_size), card_size, method=Image.Resampling.LANCZOS)
        sheet.paste(image, (x, y))
        draw.text((x, y + card_size[1] + 8), label, fill="#302D28", font=font(16))
    sheet.save(OUT / "blind-review" / filename, optimize=True)


def detail_grid(items, filename, columns=3):
    tile_w, tile_h = 430, 300
    rows = (len(items) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w, rows * tile_h), "#DCD8D0")
    draw = ImageDraw.Draw(sheet)
    for index, (candidate, label) in enumerate(items):
        x = (index % columns) * tile_w
        y = (index // columns) * tile_h
        detail = Image.open(OUT / "styles" / candidate / "top-left-detail.png")
        detail = ImageOps.fit(detail, (tile_w - 22, tile_h - 50), method=Image.Resampling.LANCZOS)
        sheet.paste(detail, (x + 11, y + 34))
        draw.text((x + 14, y + 8), label, fill="#171614", font=font(17))
    sheet.save(OUT / "blind-review" / filename, optimize=True)


def main():
    for candidate, label, _series in CANDIDATES:
        save_candidate(candidate, label)
    blind_dir = OUT / "blind-review"
    blind_dir.mkdir(parents=True, exist_ok=True)
    a = [(candidate, label) for candidate, label, series in CANDIDATES if series == "A"]
    b = [(candidate, label) for candidate, label, series in CANDIDATES if series == "B"]
    labeled_grid(a, "series-a-full-images.png", 4)
    labeled_grid(b, "series-b-full-images.png", 4)
    detail_grid(a, "series-a-corner-details.png")
    detail_grid(b, "series-b-corner-details.png")
    cards = Image.new("RGB", (4 * 170 + 20, ((len(CANDIDATES) + 3) // 4) * 130 + 20), "#DCD8D0")
    for i, (candidate, label, _series) in enumerate(CANDIDATES):
        x = 20 + (i % 4) * 170
        y = 20 + (i // 4) * 130
        cards.paste(Image.open(OUT / "styles" / candidate / "selector-card.png"), (x, y))
        ImageDraw.Draw(cards).text((x, y + 98), label.split(" ", 1)[0], fill="#302D28", font=font(14))
    cards.save(blind_dir / "all-selector-cards.png", optimize=True)
    anonymous = [(candidate, chr(65 + i)) for i, (candidate, _label, _series) in enumerate(CANDIDATES)]
    rng = random.Random(20260824)
    rng.shuffle(anonymous)
    labeled_grid(anonymous, "blind-without-labels.png", 4, title=True)
    print(f"generated {len(CANDIDATES)} design candidates under {OUT}")


if __name__ == "__main__":
    main()
