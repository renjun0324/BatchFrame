#!/usr/bin/env python3
"""Create a copyright-safe schematic reference board for V4 review."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "frame-design-v4" / "reference-board.png"
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
ITEMS = [
    ("扫描保留边", "连续、窄、角部略不对称", "scan"),
    ("相机片门", "硬直边、压框堆积", "gate"),
    ("35mm 负片", "上下齿孔、帧号", "35mm"),
    ("120 中画幅", "宽片基、单侧标记", "120"),
    ("16mm 电影", "窄片基、小而密的单侧孔", "16mm"),
    ("暗房接触印样", "档案线、编号、裁切标记", "contact"),
    ("乳剂侵蚀", "局部缺口、堆积、少量碎屑", "emulsion"),
    ("装裱细黑线", "克制、贴近照片、留白优先", "mount"),
]


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def draw_schematic(draw, box, kind):
    x, y, w, h = box
    px, py, pw, ph = x + 50, y + 20, w - 100, h - 40
    draw.rectangle((px - 10, py - 10, px + pw + 10, py + ph + 10), fill="#050505")
    if kind == "mount":
        draw.rectangle((px - 4, py - 4, px + pw + 4, py + ph + 4), outline="#EEE9DF", width=2)
    elif kind == "scan":
        for i in range(0, pw, 22):
            draw.line((px + i, py - 12 + (i % 5), px + i + 14, py - 9), fill="#B9B2A6", width=2)
        draw.line((px - 8, py + ph // 2, px - 1, py + ph // 2 - 6), fill="#B9B2A6", width=2)
    elif kind == "gate":
        draw.rectangle((px - 10, py - 10, px + 8, py + 25), fill="#191715")
        draw.rectangle((px + pw - 22, py + ph - 22, px + pw + 10, py + ph + 10), fill="#191715")
    elif kind in ("35mm", "16mm"):
        count = 6 if kind == "35mm" else 10
        for i in range(count):
            yy = py - 2 + i * (ph // count)
            draw.rounded_rectangle((px - 28, yy, px - 15, yy + (18 if kind == "35mm" else 10)), radius=3, fill="#EEE9DF")
        if kind == "35mm":
            for i in range(6):
                xx = px + i * (pw // 6)
                draw.rounded_rectangle((xx, py - 27, xx + 18, py - 14), radius=3, fill="#EEE9DF")
    elif kind == "120":
        draw.rectangle((px - 30, py - 10, px - 14, py + ph + 10), fill="#171513")
        draw.ellipse((px - 25, py + ph // 2 - 5, px - 14, py + ph // 2 + 6), fill="#EEE9DF")
        draw.text((px - 7, py + ph + 7), "07", fill="#EEE9DF", font=font(12))
    elif kind == "contact":
        draw.line((px - 2, py - 20, px + pw + 2, py - 20), fill="#EEE9DF", width=2)
        draw.line((px - 2, py + ph + 20, px + pw + 2, py + ph + 20), fill="#EEE9DF", width=2)
        for i in range(5):
            xx = px + i * (pw // 5)
            draw.text((xx, py + ph + 22), f"{i+1:02d}", fill="#EEE9DF", font=font(9))
    elif kind == "emulsion":
        for i in range(8):
            xx = px + (i * 23) % pw
            draw.polygon([(xx, py - 13), (xx + 12, py - 6), (xx + 20, py + 5)], fill="#050505")
            draw.ellipse((px - 25 + i * 3, py + 15 + i * 8, px - 14 + i * 3, py + 25 + i * 8), fill="#050505")


def main():
    width, row_h = 1440, 150
    image = Image.new("RGB", (width, 80 + len(ITEMS) * row_h), "#DCD8D0")
    draw = ImageDraw.Draw(image)
    draw.text((34, 22), "BatchFrame V4 胶片边框参考板 · 结构研究示意（非产品素材）", fill="#171614", font=font(28))
    for i, (name, description, kind) in enumerate(ITEMS):
        y = 80 + i * row_h
        draw.text((34, y + 50), name, fill="#171614", font=font(20))
        draw.text((240, y + 54), description, fill="#5A554C", font=font(16))
        draw_schematic(draw, (880, y + 10, 510, row_h - 20), kind)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
