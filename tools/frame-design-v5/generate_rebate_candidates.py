#!/usr/bin/env python3
"""Design-only model for film rebate inner frames.

The same outputRect/frameRect/apertureRect model is rendered twice with
different outer margins. This script never writes to miniprogram/.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
PHOTO = ROOT / "docs" / "readme-assets" / "example.jpg"
OUT = ROOT / "docs" / "frame-design-v5" / "candidates"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def photo(size):
    return ImageOps.fit(Image.open(PHOTO).convert("RGB"), size, method=Image.Resampling.LANCZOS)


def rect(x, y, width, height):
    return {"x": x, "y": y, "width": width, "height": height}


def derive_layout(output_rect, candidate, margin_ratio):
    """Return the three rectangles used by the corrected design contract."""
    output_w, output_h = output_rect["width"], output_rect["height"]
    available = rect(output_w * margin_ratio, output_h * margin_ratio,
                     output_w * (1 - 2 * margin_ratio), output_h * (1 - 2 * margin_ratio))
    if candidate == "film-strip-35mm-full":
        top = available["height"] * .155
        bottom = available["height"] * .155
        side = available["width"] * .027
    else:
        top = available["height"] * .055
        bottom = available["height"] * .075
        side = available["width"] * .025
    frame = rect(available["x"], available["y"], available["width"], available["height"])
    aperture = rect(frame["x"] + side, frame["y"] + top,
                    frame["width"] - side * 2, frame["height"] - top - bottom)
    return {"outputRect": rect(0, 0, output_w, output_h), "innerAvailableRect": available,
            "frameRect": frame, "apertureRect": aperture}


def draw_rebate(draw, layout, candidate, bg):
    frame = layout["frameRect"]
    aperture = layout["apertureRect"]
    fx, fy, fw, fh = frame["x"], frame["y"], frame["width"], frame["height"]
    ax, ay, aw, ah = aperture["x"], aperture["y"], aperture["width"], aperture["height"]
    draw.rectangle((fx, fy, fx + fw, fy + fh), fill="#030303")
    if candidate == "film-strip-35mm-full":
        hole_w, hole_h = fw * .055, fh * .077
        gap = fw / 8
        for i in range(9):
            x = fx + i * gap - hole_w / 2
            draw.rounded_rectangle((x, fy + fh * .055, x + hole_w, fy + fh * .055 + hole_h), radius=hole_h * .18, fill=bg)
            draw.rounded_rectangle((x, fy + fh - fh * .055 - hole_h, x + hole_w, fy + fh - fh * .055), radius=hole_h * .18, fill=bg)
        draw.text((fx + fw * .06, fy + fh * .085), "BATCHFRAME COLOR 400", fill="#C9C0B4", font=font(max(9, int(fw * .018))))
        draw.text((fx + fw * .06, fy + fh * .92), "01A", fill="#C9C0B4", font=font(max(10, int(fw * .021))))
    else:
        draw.line((fx + fw * .04, fy + fh * .065, fx + fw * .96, fy + fh * .065), fill="#C9C0B4", width=2)
        draw.line((fx + fw * .04, fy + fh * .935, fx + fw * .96, fy + fh * .935), fill="#C9C0B4", width=2)
        draw.text((fx + fw * .08, fy + fh * .075), "BATCHFRAME  ·  07", fill="#C9C0B4", font=font(max(9, int(fw * .018))))
        draw.ellipse((fx + fw * .08, fy + fh * .88, fx + fw * .08 + fw * .018, fy + fh * .88 + fw * .018), fill="#C9C0B4")
    draw.rectangle((ax, ay, ax + aw, ay + ah), outline="#151311", width=max(1, int(fw * .004)))
    return aperture


def render(candidate, margin_ratio, size=(840, 600)):
    canvas = Image.new("RGB", size, "#EEE9DF")
    draw = ImageDraw.Draw(canvas)
    layout = derive_layout({"width": size[0], "height": size[1]}, candidate, margin_ratio)
    aperture = draw_rebate(draw, layout, candidate, "#EEE9DF")
    image = photo((max(1, int(aperture["width"])), max(1, int(aperture["height"]))))
    canvas.paste(image, (int(aperture["x"]), int(aperture["y"])))
    return canvas, layout


def diagram(candidate, margin_ratio):
    canvas = Image.new("RGB", (960, 620), "#DCD8D0")
    draw = ImageDraw.Draw(canvas)
    image, layout = render(candidate, margin_ratio, (700, 500))
    canvas.paste(image, (30, 75))
    x = 760
    draw.text((x, 70), "同一内框模型", fill="#171614", font=font(22))
    for i, key in enumerate(("outputRect", "frameRect", "apertureRect")):
        value = layout[key]
        draw.text((x, 130 + i * 100), key, fill="#302D28", font=font(16))
        draw.text((x, 158 + i * 100), f"{int(value['width'])} × {int(value['height'])}", fill="#5A554C", font=font(15))
    draw.text((30, 35), f"{candidate} · margin={margin_ratio:.2f}", fill="#171614", font=font(22))
    return canvas


def save_candidate(candidate):
    folder = OUT / candidate
    folder.mkdir(parents=True, exist_ok=True)
    large, _ = render(candidate, .19)
    small, _ = render(candidate, .035)
    large.save(folder / "large-outer-margin.png", optimize=True)
    small.save(folder / "small-outer-margin.png", optimize=True)
    diagram(candidate, .19).save(folder / "geometry-large-margin.png", optimize=True)
    diagram(candidate, .035).save(folder / "geometry-small-margin.png", optimize=True)
    card = ImageOps.fit(large.crop((70, 50, 420, 270)), (140, 94), method=Image.Resampling.LANCZOS)
    card.save(folder / "inner-frame-selector-card.png", optimize=True)


def main():
    for candidate in ("film-strip-35mm-full", "film-rebate-minimal"):
        save_candidate(candidate)
    comparison = Image.new("RGB", (1720, 960), "#DCD8D0")
    draw = ImageDraw.Draw(comparison)
    for col, candidate in enumerate(("film-strip-35mm-full", "film-rebate-minimal")):
        x = col * 860
        draw.text((x + 20, 16), candidate, fill="#171614", font=font(24))
        for row, margin in enumerate((.19, .035)):
            image, _ = render(candidate, margin, (760, 430))
            comparison.paste(image, (x + 20, 58 + row * 450))
            draw.text((x + 20, 58 + row * 450 + 414), "large outer margin" if row == 0 else "small outer margin", fill="#5A554C", font=font(16))
    comparison.save(OUT / "inner-frame-margin-comparison.png", optimize=True)
    print(f"generated corrected inner-frame candidates under {OUT}")


if __name__ == "__main__":
    main()
