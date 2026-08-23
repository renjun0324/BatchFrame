#!/usr/bin/env python3
"""Generate deterministic, local alpha masks for BatchFrame inner frames.

The masks are procedural project artwork, not downloaded assets. They are
small transparent RGBA segments so the mini-program never generates pixels at
runtime. A fixed seed makes regeneration byte-for-byte reproducible enough for
review and keeps each style/variant structurally distinct.
"""

from pathlib import Path
import hashlib
import math
import random

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1] / "assets" / "frame-masks"
SEGMENTS = ("top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left")


def seeded(*parts):
    digest = hashlib.sha256(":".join(map(str, parts)).encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def band_mask(style, variant, segment):
    is_corner = segment in {"top-left", "top-right", "bottom-left", "bottom-right"}
    width, height = (96, 96) if is_corner else ((256, 64) if segment in {"top", "bottom"} else (64, 256))
    rng = seeded("batchframe", style, variant, segment)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)

    if style == "darkroom-scan":
        base = min(width, height) * 0.38
        roughness = 1.5
        blur = 0.7
    else:
        base = min(width, height) * 0.52
        roughness = 5.0
        blur = 0.35

    if is_corner:
        for y in range(height):
            for x in range(width):
                outer = min(x, y, width - 1 - x, height - 1 - y)
                # Keep the outside corner opaque and erode only the inner edge.
                edge = min(x, y) if "top" in segment or "left" in segment else min(width - 1 - x, height - 1 - y)
                if edge < base:
                    jitter = (rng.random() - 0.5) * roughness
                    if edge < base - 5 + jitter:
                        mask.putpixel((x, y), 255)
    else:
        horizontal = segment in {"top", "bottom"}
        long_size = width if horizontal else height
        band_size = height if horizontal else width
        profile = []
        for i in range(long_size):
            t = i / max(1, long_size - 1)
            low = math.sin(t * math.pi * (1.3 + rng.random() * 0.7)) * roughness
            high = (rng.random() - 0.5) * (2.0 if style == "rough-emulsion" else 0.6)
            profile.append(max(4, min(band_size - 2, int(band_size * 0.76 + low + high))))
        for i, depth in enumerate(profile):
            for j in range(depth):
                # Rough emulsion gets sparse dry-brush holes and dense deposits,
                # while the scan edge remains continuous and softly varied.
                alpha = 255
                if style == "rough-emulsion" and rng.random() < 0.045:
                    alpha = rng.choice((0, 80, 150))
                if horizontal:
                    mask.putpixel((i, j), alpha)
                else:
                    mask.putpixel((j, i), alpha)

    if style == "rough-emulsion":
        # A few deterministic dry-brush marks, never a full-image noise field.
        for _ in range(8):
            if is_corner:
                x = rng.randrange(width)
                y = rng.randrange(height)
                draw.ellipse((x, y, min(width - 1, x + rng.randrange(2, 7)), min(height - 1, y + rng.randrange(2, 7))), fill=rng.choice((90, 170, 255)))
            else:
                if width > height:
                    x = rng.randrange(width)
                    draw.rectangle((x, 0, min(width - 1, x + rng.randrange(2, 10)), rng.randrange(max(4, height // 3), height)), fill=rng.choice((100, 190, 255)))
                else:
                    y = rng.randrange(height)
                    draw.rectangle((0, y, rng.randrange(max(4, width // 3), width), min(height - 1, y + rng.randrange(2, 10))), fill=rng.choice((100, 190, 255)))

    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    return mask


def orient(mask, segment):
    if segment == "top":
        return mask
    if segment == "bottom":
        return mask.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if segment == "left":
        return mask.rotate(90, expand=True)
    if segment == "right":
        return mask.rotate(270, expand=True)
    if segment == "top-left":
        return mask
    if segment == "top-right":
        return mask.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if segment == "bottom-left":
        return mask.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return mask.transpose(Image.Transpose.ROTATE_180)


def generate(style, variants):
    for variant in range(1, variants + 1):
        folder = ROOT / style / f"variant-{variant:02d}"
        folder.mkdir(parents=True, exist_ok=True)
        for segment in SEGMENTS:
            source_segment = "top-left" if segment in {"top-left", "top-right", "bottom-left", "bottom-right"} else ("top" if segment in {"top", "bottom"} else "left")
            image = orient(band_mask(style, variant, source_segment), segment)
            output = Image.new("RGBA", image.size, (3, 3, 3, 0))
            output.putalpha(image)
            output.save(folder / f"{segment}.png", optimize=True)


if __name__ == "__main__":
    generate("darkroom-scan", 2)
    generate("rough-emulsion", 3)
    print(f"generated masks under {ROOT}")
