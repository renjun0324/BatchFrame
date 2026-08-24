#!/usr/bin/env python3
"""Generate deterministic production mask segments for V3 inner frames.

Only the two material-like styles use local masks. Hard structures such as
film-gate and perforated film stay procedural in the mini-program renderer.
"""

from pathlib import Path
import hashlib
import math
import random

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1] / "miniprogram" / "assets" / "frame-masks"
SEGMENTS = ("top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left")
STYLE_VARIANTS = {"full-frame-scan": 3, "emulsion-damage": 3}
STRENGTH_TIERS = ("light", "medium", "strong")


def seeded(*parts):
    digest = hashlib.sha256(":".join(map(str, parts)).encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def band(style, tier, variant, segment):
    corner = segment in {"top-left", "top-right", "bottom-left", "bottom-right"}
    width, height = (96, 96) if corner else ((320, 72) if segment in {"top", "bottom"} else (72, 320))
    rng = seeded("batchframe-v3", style, tier, variant, segment)
    tier_index = STRENGTH_TIERS.index(tier)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    if corner:
        # A continuous corner with a different bend per variant.
        base = 30 + tier_index * 4 + rng.randrange(8)
        for y in range(height):
            for x in range(width):
                edge = min(x, y)
                if edge < base + math.sin((x + y) / 18) * ((1.2 + tier_index * 1.5) if style == "full-frame-scan" else (3 + tier_index * 3)):
                    mask.putpixel((x, y), 255)
    else:
        horizontal = segment in {"top", "bottom"}
        length = width if horizontal else height
        depth = height if horizontal else width
        base = depth * ((0.62 + tier_index * 0.06) if style == "full-frame-scan" else (0.68 + tier_index * 0.08))
        for i in range(length):
            t = i / max(1, length - 1)
            low = math.sin(t * math.pi * (1.1 + rng.random() * 0.8) + variant) * ((1.2 + tier_index * 1.8) if style == "full-frame-scan" else (3.5 + tier_index * 3.8))
            if style == "emulsion-damage":
                low += math.sin(t * math.pi * 4.7 + variant * 0.7) * (1.2 + tier_index * 2.8)
            edge_depth = int(max(depth * 0.48, min(depth - 2, base + low)))
            for j in range(edge_depth):
                alpha = 255
                if style == "emulsion-damage" and rng.random() < (0.012 + tier_index * 0.045):
                    alpha = rng.choice((0, 75, 150, 220))
                if horizontal:
                    mask.putpixel((i, j), alpha)
                else:
                    mask.putpixel((j, i), alpha)
        if style == "emulsion-damage":
            # Sparse dry-brush cuts are intentionally clustered near the edge.
            for _ in range(3 + tier_index * 6 + variant * 2):
                if horizontal:
                    x = rng.randrange(length)
                    draw.rectangle((x, 0, min(length - 1, x + rng.randrange(2, 10)), rng.randrange(3, max(4, int(depth * 0.45)))), fill=rng.choice((0, 90, 180)))
                else:
                    y = rng.randrange(length)
                    draw.rectangle((0, y, rng.randrange(3, max(4, int(depth * 0.45))), min(length - 1, y + rng.randrange(2, 10))), fill=rng.choice((0, 90, 180)))
    mask = mask.filter(ImageFilter.GaussianBlur(0.45 if style == "full-frame-scan" else 0.3))
    return mask


def orient(mask, segment):
    if segment == "top": return mask
    if segment == "bottom": return mask.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if segment == "left": return mask.rotate(90, expand=True)
    if segment == "right": return mask.rotate(270, expand=True)
    if segment == "top-left": return mask
    if segment == "top-right": return mask.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if segment == "bottom-left": return mask.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return mask.transpose(Image.Transpose.ROTATE_180)


def generate(style, variants):
    for tier in STRENGTH_TIERS:
        for variant in range(1, variants + 1):
            folder = ROOT / style / tier / f"variant-{variant:02d}"
            folder.mkdir(parents=True, exist_ok=True)
            for segment in SEGMENTS:
                source = "top-left" if segment in {"top-left", "top-right", "bottom-left", "bottom-right"} else ("top" if segment in {"top", "bottom"} else "left")
                alpha = orient(band(style, tier, variant, source), segment)
                output = Image.new("RGBA", alpha.size, (3, 3, 0, 0))
                output.putalpha(alpha)
                output.save(folder / f"{segment}.png", optimize=True)


if __name__ == "__main__":
    for style, variants in STYLE_VARIANTS.items():
        generate(style, variants)
    print(f"generated masks under {ROOT}")
