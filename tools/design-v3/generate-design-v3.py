#!/usr/bin/env python3
"""Generate deterministic BatchFrame V3 UI concepts and film-style review sheets.

This is a design-only tool. It does not import or modify the mini-program renderer.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "design-v3"
UI_OUT = OUT / "ui"
FRAME_OUT = OUT / "frame-styles"
PHOTO = ROOT / "docs" / "readme-assets" / "example.jpg"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_MED = "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


def font(size: int, bold: bool = False):
    path = FONT_BOLD if bold else FONT_REG
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def fit_cover(image: Image.Image, box):
    x, y, w, h = box
    scale = max(w / image.width, h / image.height)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def sample_photo():
    """Use only the example photo area from the repository's composite reference."""
    source = Image.open(PHOTO).convert("RGB")
    # The repository reference is a contact sheet; this rectangle is its actual
    # street-photo example, kept read-only and cropped for design presentation.
    return source.crop((270, 320, 600, 530))


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def label(draw, xy, text, size=14, fill="#111111", bold=False, anchor=None):
    draw.text(xy, text, font=font(size, bold), fill=fill, anchor=anchor)


def frame_polygon(draw, rect, inset, wobble, seed):
    """Draw a deterministic, smooth-ish black rebate around a photo rectangle."""
    x, y, w, h = rect
    rng = random.Random(seed)
    points = []
    n = 18
    for i in range(n + 1):
        t = i / n
        points.append((x + w * t, y - inset + rng.randint(-wobble, wobble)))
    for i in range(n + 1):
        t = i / n
        points.append((x + w + inset + rng.randint(-wobble, wobble), y + h * t))
    for i in range(n + 1):
        t = i / n
        points.append((x + w * (1 - t), y + h + inset + rng.randint(-wobble, wobble)))
    for i in range(n + 1):
        t = i / n
        points.append((x - inset + rng.randint(-wobble, wobble), y + h * (1 - t)))
    draw.polygon(points, fill="#050505")


def render_film_style(style, ratio=(4, 5), size=(720, 900), seed=17):
    """Render a design-only visual sample with deliberately different structures."""
    W, H = size
    bg = "#EEE9DF" if style not in {"film-gate", "negative-35mm", "cine-16mm"} else "#171513"
    canvas = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(canvas)
    photo = sample_photo()
    margin = int(min(W, H) * (0.17 if ratio[0] <= ratio[1] else 0.12))
    frame_rect = (margin, margin, W - margin * 2, H - margin * 2)
    px, py, pw, ph = frame_rect
    image = fit_cover(photo, (px, py, pw, ph))

    if style == "none":
        canvas.paste(image, (px, py))
    elif style == "clean-black":
        draw.rectangle((px - 9, py - 9, px + pw + 9, py + ph + 9), fill="#050505")
        canvas.paste(image, (px, py))
    elif style == "full-frame-scan":
        frame_polygon(draw, frame_rect, 12, 3, seed)
        canvas.paste(image, (px, py))
        draw.line((px, py, px + pw, py), fill="#161616", width=2)
    elif style == "film-gate":
        draw.rectangle((px - 29, py - 23, px + pw + 29, py + ph + 23), fill="#050505")
        draw.rectangle((px - 33, py + ph // 2 - 18, px - 23, py + ph // 2 + 18), fill="#26211c")
        draw.rectangle((px + pw + 23, py + ph // 2 - 12, px + pw + 34, py + ph // 2 + 27), fill="#26211c")
        canvas.paste(image, (px, py))
    elif style == "negative-35mm":
        top, side = 52, 26
        draw.rectangle((px - side, py - top, px + pw + side, py + ph + top), fill="#080808")
        canvas.paste(image, (px, py))
        for row_y in (py - top + 12, py + ph + top - 24):
            for i in range(7):
                hole_x = px - side + 8 + i * ((pw + side * 2 - 20) / 6)
                draw.rounded_rectangle((hole_x - 9, row_y, hole_x + 9, row_y + 13), radius=4, fill="#BFB8AA")
        label(draw, (px + pw // 2, py - 29), f"BF 024  /  {seed % 99:02d}", 16, "#D8D0C3", True, "mm")
    elif style == "medium-format-120":
        side = 62
        draw.rectangle((px - side, py - 27, px + pw + side, py + ph + 27), fill="#0B0A09")
        canvas.paste(image, (px, py))
        label(draw, (px - side // 2, py + ph // 2), f"12{seed % 8}", 21, "#D8D0C3", True, "mm")
        for i in range(3):
            draw.ellipse((px + pw + 25, py + ph // 2 - 24 + i * 20, px + pw + 33, py + ph // 2 - 16 + i * 20), fill="#D8D0C3")
    elif style == "cine-16mm":
        side, top = 38, 24
        draw.rectangle((px - side, py - top, px + pw + side, py + ph + top), fill="#090909")
        canvas.paste(image, (px, py))
        for i in range(13):
            yy = py - 4 + i * (ph / 12)
            draw.rounded_rectangle((px - side + 9, yy, px - side + 20, yy + 9), radius=3, fill="#968D7F")
            draw.rounded_rectangle((px + pw + side - 20, yy, px + pw + side - 9, yy + 9), radius=3, fill="#968D7F")
        label(draw, (px + pw + side - 5, py + ph - 7), "C16 07", 12, "#C9C0B1", True, "rs")
    elif style == "contact-sheet":
        rebate = 45
        draw.rectangle((px - rebate, py - rebate, px + pw + rebate, py + ph + rebate), fill="#0A0908")
        canvas.paste(image, (px, py))
        for i in range(6):
            xx = px - rebate + 12 + i * 22
            draw.line((xx, py + ph + 19, xx + 8, py + ph + 19), fill="#D3C9B8", width=2)
        label(draw, (px + 12, py + ph + 29), f"CONTACT / FRAME {seed % 36:02d}", 13, "#D3C9B8", True)
    elif style == "emulsion-damage":
        frame_polygon(draw, frame_rect, 22, 11, seed)
        canvas.paste(image, (px, py))
        rng = random.Random(seed + 33)
        for i in range(16):
            if i % 2:
                xx = rng.choice([rng.randint(px - 29, px - 3), rng.randint(px + pw + 3, px + pw + 29)])
                yy = rng.randint(py - 20, py + ph + 20)
            else:
                xx = rng.randint(px - 20, px + pw + 20)
                yy = rng.choice([rng.randint(py - 29, py - 3), rng.randint(py + ph + 3, py + ph + 29)])
            r = rng.randint(2, 7)
            draw.ellipse((xx - r, yy - r, xx + r, yy + r), fill="#050505")
    return canvas


STYLE_NAMES = {
    "none": "无内框",
    "clean-black": "经典细黑边",
    "full-frame-scan": "全幅扫描边",
    "film-gate": "片门压框",
    "negative-35mm": "35mm 负片",
    "medium-format-120": "120 中画幅",
    "cine-16mm": "16mm 电影胶片",
    "contact-sheet": "接触印样边",
    "emulsion-damage": "乳剂破损边",
}


def make_frame_sheets():
    styles = list(STYLE_NAMES)
    cell_w, cell_h = 260, 300
    sheet = Image.new("RGB", (cell_w * 3, (cell_h + 40) * 3), "#DCD5C8")
    d = ImageDraw.Draw(sheet)
    for idx, style in enumerate(styles[:9]):
        render_film_style(style, (4, 5), (480, 600), 21 + idx * 13).save(FRAME_OUT / f"style-{style}.png")
        x = (idx % 3) * cell_w
        y = (idx // 3) * (cell_h + 40)
        sample = render_film_style(style, (4, 5), (cell_w - 34, cell_h - 30), 21 + idx * 13)
        sheet.paste(sample, (x + 17, y + 8))
        label(d, (x + cell_w // 2, y + cell_h + 18), STYLE_NAMES[style], 15, "#171513", True, "mm")
    sheet.save(FRAME_OUT / "full-contact-sheet.png")

    details = Image.new("RGB", (900, 980), "#DCD5C8")
    dd = ImageDraw.Draw(details)
    for idx, style in enumerate(styles[2:9]):
        sample = render_film_style(style, (4, 5), (240, 320), 37 + idx * 9)
        crop = sample.crop((0, 0, 135, 140)).resize((240, 248), Image.Resampling.LANCZOS)
        crop2 = sample.crop((sample.width - 135, sample.height - 140, sample.width, sample.height)).resize((240, 248), Image.Resampling.LANCZOS)
        x = (idx % 3) * 300
        y = (idx // 3) * 320
        details.paste(crop, (x + 8, y + 8))
        details.paste(crop2, (x + 8, y + 130))
        label(dd, (x + 8, y + 292), STYLE_NAMES[style], 14, "#171513", True)
    details.save(FRAME_OUT / "corner-details.png")

    ratios = [(1, 1), (4, 5), (3, 4), (9, 16), (16, 9), (2, 3)]
    ratio_sheet = Image.new("RGB", (1200, 720), "#DCD5C8")
    rd = ImageDraw.Draw(ratio_sheet)
    for i, ratio in enumerate(ratios):
        rw = 170 if ratio[0] <= ratio[1] else 250
        rh = round(rw * ratio[1] / ratio[0])
        if rh > 270:
            rh = 270
            rw = round(rh * ratio[0] / ratio[1])
        sample = render_film_style("negative-35mm", ratio, (rw, rh), 80 + i)
        x = 40 + i * 190
        y = 120 + (270 - rh) // 2
        ratio_sheet.paste(sample, (x, y))
        label(rd, (x + rw // 2, 80), f"{ratio[0]}:{ratio[1]}", 16, "#171513", True, "mm")
    ratio_sheet.save(FRAME_OUT / "ratio-comparison.png")


def icon(draw, center, kind, color):
    x, y = center
    if kind == "photo":
        draw.rectangle((x - 8, y - 7, x + 8, y + 7), outline=color, width=2)
        draw.ellipse((x - 4, y - 3, x - 1, y), fill=color)
        draw.line((x - 6, y + 5, x - 1, y + 1, x + 3, y + 4, x + 7, y), fill=color, width=2)
    elif kind == "frame":
        draw.rectangle((x - 8, y - 8, x + 8, y + 8), outline=color, width=2)
        draw.rectangle((x - 4, y - 4, x + 4, y + 4), outline=color, width=1)
    elif kind == "canvas":
        draw.rectangle((x - 8, y - 5, x + 8, y + 5), outline=color, width=2)
        draw.line((x - 5, y - 9, x + 5, y - 9), fill=color, width=1)
    else:
        draw.line((x - 8, y, x + 8, y), fill=color, width=2)
        draw.line((x, y - 8, x, y + 8), fill=color, width=2)


def draw_ui(width, height, scheme, state):
    dark = scheme == "darkroom"
    if dark:
        colors = {"bg": "#0B0A09", "panel": "#171513", "stage": "#11100F", "text": "#F1EEE7", "muted": "#9A968E", "line": "#3A3530", "accent": "#B56A45", "warm": "#D1A25E", "card": "#24201C", "photo": "#E8E0D4"}
    else:
        colors = {"bg": "#F2EEE7", "panel": "#FAF8F3", "stage": "#161513", "text": "#181614", "muted": "#746D64", "line": "#D7D0C4", "accent": "#382E27", "warm": "#A46E45", "card": "#E7E0D6", "photo": "#EFE9DE"}
    im = Image.new("RGB", (width, height), colors["bg"])
    d = ImageDraw.Draw(im)
    s = width / 390
    def S(v): return round(v * s)
    # safe area + custom navigation, no duplicate title
    d.rectangle((0, 0, width, S(43)), fill=colors["panel"])
    d.line((0, S(42), width, S(42)), fill=colors["line"], width=1)
    label(d, (S(20), S(21)), "BATCHFRAME", S(14), colors["text"], True, "lm")
    label(d, (S(20), S(34)), "PHOTO WORKBENCH", S(8), colors["muted"], False, "lm")
    label(d, (width - S(20), S(25)), "V3 CONCEPT", S(9), colors["warm"], True, "rm")

    # preview stage
    stage_top, stage_bottom = S(53), S(432)
    d.rectangle((S(12), stage_top, width - S(12), stage_bottom), fill=colors["stage"])
    if state == "empty":
        label(d, (width // 2, S(184)), "BATCHFRAME", S(22), colors["photo"], True, "mm")
        label(d, (width // 2, S(221)), "批量统一照片版式", S(16), colors["text"], True, "mm")
        label(d, (width // 2, S(248)), "为一组照片统一画布、留白与内框", S(11), colors["muted"], False, "mm")
        rounded(d, (S(128), S(278), width - S(128), S(321)), S(8), colors["accent"])
        label(d, (width // 2, S(299)), "选择照片", S(13), "#FFFFFF", True, "mm")
    else:
        # large warm mat + real photo crop
        mat = (S(65), S(83), width - S(65), S(390))
        d.rectangle(mat, fill=colors["photo"])
        photo = fit_cover(sample_photo(), (S(79), S(101), width - S(158), S(253)))
        d.rectangle((S(79) - 6, S(101) - 6, width - S(79) + 6, S(354) + 6), fill="#080807")
        im.paste(photo, (S(79), S(101)))
        d = ImageDraw.Draw(im)
        if state in {"frame", "security"}:
            d.line((S(79), S(101), width - S(79), S(101)), fill="#B56A45" if dark else "#382E27", width=2)
        label(d, (S(77), S(372)), "FRAME 04", S(8), colors["muted"], True)
        label(d, (width - S(77), S(372)), "4:5", S(8), colors["muted"], True, "ra")
        if state == "security":
            rounded(d, (S(23), S(69), S(175), S(97)), S(8), "#3A211D")
            label(d, (S(35), S(83)), "!  1 张照片需要复查", S(10), "#E8A17D", True, "lm")

    # thumbnails
    thumb_y = S(449)
    for i in range(2 if state != "empty" else 0):
        x = S(24 + i * 63)
        t = fit_cover(sample_photo(), (x, thumb_y, S(52), S(52)))
        im.paste(t, (x, thumb_y))
        d = ImageDraw.Draw(im)
        d.rectangle((x, thumb_y, x + S(52), thumb_y + S(52)), outline=colors["warm"] if i == 0 else colors["line"], width=S(2 if i == 0 else 1))
        if state == "security" and i == 1:
            d.ellipse((x + S(38), thumb_y + S(3), x + S(50), thumb_y + S(15)), fill="#B45D47")
            label(d, (x + S(44), thumb_y + S(9)), "!", S(8), "#FFFFFF", True, "mm")
    if state == "empty":
        label(d, (S(24), thumb_y + S(26)), "选择照片后在这里切换", S(10), colors["muted"], False, "lm")
    else:
        label(d, (width - S(24), thumb_y + S(26)), "+ 添加", S(10), colors["warm"], True, "rm")

    # tools
    tabs_y = S(524)
    d.line((S(14), tabs_y - S(8), width - S(14), tabs_y - S(8)), fill=colors["line"], width=1)
    tools = [("模板", "photo"), ("画布", "canvas"), ("内框", "frame"), ("图片", "photo")]
    active = {"template": 0, "frame": 2, "canvas": 1, "exporting": 0, "security": 2, "empty": -1}[state]
    for i, (name, kind) in enumerate(tools):
        cx = S(48 + i * 97)
        col = colors["accent"] if i == active else colors["muted"]
        icon(d, (cx, tabs_y + S(10)), kind, col)
        label(d, (cx, tabs_y + S(30)), name, S(10), col, i == active, "mm")
        if i == active:
            d.rounded_rectangle((cx - S(19), tabs_y + S(45), cx + S(19), tabs_y + S(47)), radius=1, fill=colors["accent"])

    # settings sheet
    sheet_top = S(583)
    d.rectangle((0, sheet_top, width, height), fill=colors["panel"])
    d.line((0, sheet_top, width, sheet_top), fill=colors["line"], width=1)
    label(d, (S(20), sheet_top + S(22)), {"template": "组合模板", "frame": "内框风格", "canvas": "画布比例与留白", "exporting": "正在导出", "security": "内框风格", "empty": "开始创作"}[state], S(14), colors["text"], True)
    if state == "frame" or state == "security":
        card_names = ["全幅扫描", "片门压框", "35mm 负片"]
        for i, name in enumerate(card_names):
            x = S(18 + i * 122)
            rounded(d, (x, sheet_top + S(43), x + S(108), sheet_top + S(112)), S(8), colors["card"], colors["warm"] if i == 0 else colors["line"], S(2 if i == 0 else 1))
            sample = render_film_style(["full-frame-scan", "film-gate", "negative-35mm"][i], (4, 5), (92, 54), 50 + i)
            im.paste(sample.resize((S(92), S(54)), Image.Resampling.LANCZOS), (x + S(8), sheet_top + S(51)))
            d = ImageDraw.Draw(im)
            label(d, (x + S(8), sheet_top + S(106)), name, S(9), colors["text"], i == 0)
        label(d, (S(20), sheet_top + S(132)), "边缘强度", S(10), colors["muted"])
        for i, n in enumerate(["轻", "标准", "明显"]):
            rounded(d, (S(93 + i * 62), sheet_top + S(120), S(146 + i * 62), sheet_top + S(146)), S(6), colors["accent"] if i == 1 else colors["card"])
            label(d, (S(119 + i * 62), sheet_top + S(133)), n, S(9), "#FFFFFF" if i == 1 else colors["muted"], True, "mm")
    elif state == "canvas":
        label(d, (S(20), sheet_top + S(49)), "比例", S(10), colors["muted"])
        for i, n in enumerate(["1:1", "4:5", "3:4", "9:16"]):
            x = S(20 + i * 66)
            rounded(d, (x, sheet_top + S(66), x + S(56), sheet_top + S(96)), S(6), colors["accent"] if n == "4:5" else colors["card"])
            label(d, (x + S(28), sheet_top + S(81)), n, S(9), "#FFFFFF" if n == "4:5" else colors["muted"], True, "mm")
        label(d, (S(20), sheet_top + S(122)), "外层背景", S(10), colors["muted"])
        for i, c in enumerate(["#F4F0E8", "#171513", "#C8B7A1"]):
            d.ellipse((S(90 + i * 34), sheet_top + S(112), S(111 + i * 34), sheet_top + S(133)), fill=c, outline=colors["warm"] if i == 0 else colors["line"], width=1)
    elif state == "exporting":
        label(d, (S(20), sheet_top + S(55)), "正在处理照片", S(11), colors["muted"])
        d.rectangle((S(20), sheet_top + S(79), width - S(20), sheet_top + S(86)), fill=colors["card"])
        d.rectangle((S(20), sheet_top + S(79), S(20 + (width - S(40)) * .42), sheet_top + S(86)), fill=colors["warm"])
        label(d, (width - S(20), sheet_top + S(55)), "2 / 5", S(11), colors["warm"], True, "ra")
    elif state == "template":
        for i, name in enumerate(["白底经典", "白底暗房", "黑底经典"]):
            x = S(18 + i * 122)
            rounded(d, (x, sheet_top + S(45), x + S(108), sheet_top + S(105)), S(8), colors["card"], colors["warm"] if i == 0 else colors["line"], S(2 if i == 0 else 1))
            sample = render_film_style(["clean-black", "full-frame-scan", "film-gate"][i], (4, 5), (92, 44), 81 + i)
            im.paste(sample.resize((S(92), S(44)), Image.Resampling.LANCZOS), (x + S(8), sheet_top + S(52)))
            d = ImageDraw.Draw(im)
            label(d, (x + S(8), sheet_top + S(98)), name, S(9), colors["text"], i == 0)
    else:
        label(d, (S(20), sheet_top + S(52)), "一次选择一组照片，统一画布与内框", S(11), colors["muted"])

    # stable bottom export action
    if state != "empty":
        button_y = height - S(57)
        rounded(d, (S(16), button_y, width - S(16), height - S(14)), S(9), colors["accent"] if state != "exporting" else colors["card"])
        label(d, (width // 2, button_y + S(18)), "导出 2 张" if state != "exporting" else "导出中 · 42%", S(13), "#FFFFFF" if state != "exporting" else colors["muted"], True, "mm")
    return im


def make_ui_concepts():
    states = ["empty", "template", "frame", "canvas", "exporting", "security"]
    for scheme in ("darkroom", "gallery"):
        for state in states:
            for width, height in ((390, 844), (412, 915)):
                suffix = "" if width == 390 else "-412"
                draw_ui(width, height, scheme, state).save(UI_OUT / f"{scheme}-{state}{suffix}.png")


def main():
    UI_OUT.mkdir(parents=True, exist_ok=True)
    FRAME_OUT.mkdir(parents=True, exist_ok=True)
    make_ui_concepts()
    make_frame_sheets()
    print(f"generated UI concepts in {UI_OUT}")
    print(f"generated frame sheets in {FRAME_OUT}")


if __name__ == "__main__":
    main()
