#!/usr/bin/env python3
"""Create a local visual review sheet from the sample photo and mask assets."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "png" / "1.jpg"
OUT = ROOT / "docs" / "frame-style-review" / "contact-sheet.png"
SEGMENTS = ("top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left")
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def mask_path(style, segment):
    variant = "variant-01"
    return ROOT / "assets" / "frame-masks" / style / variant / f"{segment}.png"


def compose(style):
    canvas = Image.new("RGBA", (500, 320), (255, 255, 255, 255))
    photo = ImageOps.fit(Image.open(PHOTO).convert("RGB"), (400, 250), method=Image.Resampling.LANCZOS)
    photo_box = (50, 35, 450, 285)
    if style == "black-clean":
        canvas = Image.new("RGBA", (500, 320), (20, 21, 24, 255))
    canvas.alpha_composite(Image.new("RGBA", (400, 250), (5, 5, 5, 255)), (46, 31))
    canvas.alpha_composite(photo.convert("RGBA"), (50, 35))
    if style == "darkroom-scan":
        mask_style = "darkroom-scan"
    elif style == "rough-emulsion":
        mask_style = "rough-emulsion"
    else:
        mask_style = None
    if mask_style:
        frame = (46, 31, 454, 289)
        corner = 40
        for segment in SEGMENTS:
            asset = Image.open(mask_path(mask_style, segment)).convert("RGBA")
            if segment == "top-left": box = (frame[0], frame[1], frame[0] + corner, frame[1] + corner)
            elif segment == "top": box = (frame[0] + corner, frame[1], frame[2] - corner, frame[1] + 12)
            elif segment == "top-right": box = (frame[2] - corner, frame[1], frame[2], frame[1] + corner)
            elif segment == "right": box = (frame[2] - 12, frame[1] + corner, frame[2], frame[3] - corner)
            elif segment == "bottom-right": box = (frame[2] - corner, frame[3] - corner, frame[2], frame[3])
            elif segment == "bottom": box = (frame[0] + corner, frame[3] - 12, frame[2] - corner, frame[3])
            elif segment == "bottom-left": box = (frame[0], frame[3] - corner, frame[0] + corner, frame[3])
            else: box = (frame[0], frame[1] + corner, frame[0] + 12, frame[3] - corner)
            asset = asset.resize((max(1, box[2] - box[0]), max(1, box[3] - box[1])), Image.Resampling.LANCZOS)
            canvas.alpha_composite(asset, (box[0], box[1]))
    else:
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((46, 31, 454, 289), outline=(5, 5, 5, 255), width=5)
    return canvas.convert("RGB")


def main():
    styles = [("经典细黑边", "clean-black"), ("暗房扫描边", "darkroom-scan"), ("粗粝显影边", "rough-emulsion")]
    sheet = Image.new("RGB", (1500, 1100), (238, 239, 242))
    draw = ImageDraw.Draw(sheet)
    title_font = font(28)
    label_font = font(20)
    for row, (label, style) in enumerate(styles):
        y = 30 + row * 350
        draw.text((25, y), label, fill=(25, 28, 34), font=title_font)
        full = compose(style)
        sheet.paste(full, (25, y + 42))
        crop = full.crop((35, 20, 190, 175)).resize((250, 250), Image.Resampling.NEAREST)
        sheet.paste(crop, (540, y + 42))
        crop2 = full.crop((310, 145, 470, 305)).resize((250, 250), Image.Resampling.NEAREST)
        sheet.paste(crop2, (810, y + 42))
        long_edge = full.crop((145, 22, 355, 105)).resize((350, 140), Image.Resampling.NEAREST)
        sheet.paste(long_edge, (1080, y + 42))
        draw.text((555, y + 300), "左上角放大", fill=(70, 76, 86), font=label_font)
        draw.text((825, y + 300), "右下角放大", fill=(70, 76, 86), font=label_font)
        draw.text((1090, y + 195), "上边长边放大", fill=(70, 76, 86), font=label_font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
