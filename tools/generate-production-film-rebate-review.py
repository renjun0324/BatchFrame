#!/usr/bin/env python3
"""Generate review plates from the production film-rebate geometry contract.

The production renderer is Canvas code, so this tool intentionally uses the
same outputRect -> frameRect -> apertureRect ratios to make a raster review
plate. It is a review artifact generator, not a runtime asset generator.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "docs" / "readme-assets" / "example.jpg"
OUT = ROOT / "docs" / "production-frame-review"
BG = "#EFEAE2"
INK = "#030303"
ACCENT = "#F3A126"


def font(size):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def rebates(style):
    if style == "35mm":
        return (0.154, 0.027, 0.154, 0.027)
    return (0.033, 0.032, 0.032, 0.032)


def frame_layout(canvas_size, image_size, style, margin=72):
    cw, ch = canvas_size
    iw, ih = image_size
    image_aspect = iw / ih
    top, right, bottom, left = rebates(style)
    available = (margin, margin, cw - margin, ch - margin)
    aperture_ratio = (1 - left - right) / (1 - top - bottom)
    frame_aspect = image_aspect / aperture_ratio
    fw = available[2] - available[0]
    fh = fw / frame_aspect
    if fh > available[3] - available[1]:
        fh = available[3] - available[1]
        fw = fh * frame_aspect
    fx = (cw - fw) / 2
    fy = (ch - fh) / 2
    return (fx, fy, fw, fh), (fx + fw * left, fy + fh * top,
                              fw * (1 - left - right), fh * (1 - top - bottom))


def paste_photo(canvas, aperture, source):
    x, y, w, h = aperture
    photo = ImageOps.fit(source, (max(1, round(w)), max(1, round(h))), method=Image.Resampling.LANCZOS)
    canvas.paste(photo, (round(x), round(y)))


def draw_rebate(canvas, style, margin=72, label=True):
    source = Image.open(PHOTO).convert("RGB")
    frame, aperture = frame_layout(canvas.size, source.size, style, margin)
    fx, fy, fw, fh = frame
    ax, ay, aw, ah = aperture
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((round(fx), round(fy), round(fx + fw), round(fy + fh)), fill=INK)
    paste_photo(canvas, aperture, source)
    if style == "35mm":
        hole_w, hole_h = fw * 0.055, fh * 0.077
        for i in range(8):
            cx = ax + aw * i / 7
            for cy in (fy + fh * 0.055, fy + fh * 0.945):
                box = (round(cx - hole_w / 2), round(cy - hole_h / 2),
                       round(cx + hole_w / 2), round(cy + hole_h / 2))
                draw.rounded_rectangle(box, radius=max(2, round(hole_w * 0.18)), fill=BG)
        if label:
            draw.text((round(fx + fw * 0.08), round(fy + fh * 0.055)),
                      "BATCHFRAME COLOR 400", fill=ACCENT, font=font(max(11, round(fh * 0.035))))
            draw.text((round(fx + fw * 0.08), round(fy + fh * 0.91)), "02A", fill=ACCENT,
                      font=font(max(11, round(fh * 0.04))))
            draw.polygon([(round(fx + fw * .91), round(fy + fh * .93)),
                          (round(fx + fw * .95), round(fy + fh * .90)),
                          (round(fx + fw * .95), round(fy + fh * .93))], fill=ACCENT)
    elif label:
        draw.text((round(fx + fw * 0.06), round(fy + fh * 0.04)), "BATCHFRAME COLOR 400",
                  fill=ACCENT, font=font(max(10, round(fh * 0.035))))
        draw.text((round(fx + fw * 0.47), round(fy + fh * 0.91)), "02", fill=ACCENT,
                  font=font(max(10, round(fh * 0.04))))
        for side in (0.05, 0.93):
            x = fx + fw * side
            draw.polygon([(round(x), round(fy + fh * .95)),
                          (round(x + fw * .025), round(fy + fh * .91)),
                          (round(x + fw * .025), round(fy + fh * .95))], fill=ACCENT)
    return frame, aperture


def labeled_plate(title, style, margins=(72,)):
    width = 920
    height = 620 * len(margins)
    plate = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(plate)
    for index, margin in enumerate(margins):
        offset = index * 620
        part = Image.new("RGB", (width, 570), BG)
        draw_rebate(part, style, margin=margin)
        plate.paste(part, (0, offset))
        draw.text((28, offset + 16), f"{title}  |  outer margin {margin}px", fill="#222", font=font(22))
    return plate


def orientations():
    source = Image.open(PHOTO).convert("RGB")
    portrait_source = ImageOps.fit(source, (1280, 1800), method=Image.Resampling.LANCZOS)
    plate = Image.new("RGB", (1400, 1700), BG)
    draw = ImageDraw.Draw(plate)
    for idx, (style, image, x, y, title) in enumerate([
        ("35mm", source, 40, 100, "35mm landscape"),
        ("35mm", portrait_source, 740, 100, "35mm portrait"),
        ("minimal", source, 40, 930, "minimal landscape"),
        ("minimal", portrait_source, 740, 930, "minimal portrait"),
    ]):
        tile = Image.new("RGB", (620, 700), BG)
        # Use a temporary source-independent layout by fitting the selected image.
        frame, aperture = frame_layout(tile.size, image.size, style, 52)
        ImageDraw.Draw(tile).rectangle((frame[0], frame[1], frame[0] + frame[2], frame[1] + frame[3]), fill=INK)
        paste_photo(tile, aperture, image)
        ImageDraw.Draw(tile).text((22, 18), title, fill="#222", font=font(20))
        plate.paste(tile, (x, y))
    return plate


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    labeled_plate("35mm 完整片基", "35mm").save(OUT / "film-rebate-35mm.png", optimize=True)
    labeled_plate("极简胶片边码", "minimal").save(OUT / "film-rebate-minimal.png", optimize=True)
    labeled_plate("35mm 完整片基", "35mm", margins=(42, 180)).save(OUT / "film-rebate-mounted.png", optimize=True)
    orientations().save(OUT / "film-rebate-orientations.png", optimize=True)
    print(f"generated production film-rebate review plates under {OUT}")


if __name__ == "__main__":
    main()
