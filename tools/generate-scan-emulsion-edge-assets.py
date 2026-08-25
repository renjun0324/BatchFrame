#!/usr/bin/env python3
"""Create original texture segments for the scan-emulsion-edge inner frame.

The assets contain only transparent warm emulsion residue and tiny black scan
deposits. The continuous black frame is always drawn by the mini-program
Canvas renderer. No reference image, downloaded image, or third-party film
asset is read by this script.
"""

from __future__ import annotations

import hashlib
import json
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from selector_preview_scene import photo_source


ROOT = Path(__file__).resolve().parents[1]
MASK_ROOT = ROOT / 'miniprogram' / 'assets' / 'frame-masks' / 'scan-emulsion-edge'
PREVIEW = ROOT / 'miniprogram' / 'assets' / 'frame-previews' / 'scan-emulsion-edge.png'
REVIEW = ROOT / 'docs' / 'production-frame-review'
SEGMENTS = ('top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left')
WARM = ((216, 190, 120, 184), (228, 208, 154, 158), (185, 149, 76, 184), (238, 227, 197, 132))
BLACK = (5, 5, 5, 145)
PRODUCTION_BG = '#FFFFFF'
PREVIEW_BG = '#EEE9DF'


def review_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def seeded(*parts: object) -> random.Random:
    digest = hashlib.sha256(':'.join(map(str, parts)).encode('utf-8')).digest()
    return random.Random(int.from_bytes(digest[:8], 'big'))


def segment_size(segment: str) -> tuple[int, int]:
    if segment in ('top', 'bottom'):
        return (320, 72)
    if segment in ('left', 'right'):
        return (72, 320)
    return (96, 96)


def draw_horizontal(draw: ImageDraw.ImageDraw, width: int, height: int, *, bottom: bool, variant: int) -> None:
    rng = seeded('scan-emulsion-edge', 'bottom' if bottom else 'top', variant)
    baseline = int(height * (0.72 if bottom else 0.27))
    direction = -1 if bottom else 1
    # A few spaced deposits, not a yellow stroke. Bottom receives more material.
    clusters = 12 + variant * 2 + (4 if bottom else 0)
    for _ in range(clusters):
        x = rng.randint(2, width - 8)
        span = rng.randint(4, 20 if bottom else 16)
        depth = rng.randint(3, 12 if bottom else 9)
        color = rng.choice(WARM)
        y0 = baseline + direction * rng.randint(2, 13)
        y1 = y0 + direction * depth
        box = (x, min(y0, y1), min(width - 1, x + span), max(y0, y1))
        draw.rounded_rectangle(box, radius=max(1, depth // 3), fill=color)
    # Fine pale scan fibres remain scarce and run only across short portions.
    for _ in range(4 + variant):
        x = rng.randint(0, width - 26)
        y = baseline + direction * rng.randint(10, 22)
        draw.line((x, y, x + rng.randint(10, 30), y + direction * rng.choice((-1, 0, 1))), fill=WARM[3], width=1)
    # A small outer black accumulation grounds the residue without making a tear.
    for _ in range(4 + (2 if bottom else 0)):
        x = rng.randint(0, width - 5)
        y = baseline + direction * rng.randint(0, 6)
        draw.rectangle((x, min(y, y + direction * 2), x + rng.randint(1, 4), max(y, y + direction * 2)), fill=BLACK)


def draw_vertical(draw: ImageDraw.ImageDraw, width: int, height: int, *, right: bool, variant: int) -> None:
    rng = seeded('scan-emulsion-edge', 'right' if right else 'left', variant)
    baseline = int(width * (0.73 if right else 0.27))
    direction = -1 if right else 1
    # Deliberately restrained: the reference language keeps side rails cleaner.
    for _ in range(3 + variant):
        y = rng.randint(10, height - 12)
        span = rng.randint(3, 8)
        depth = rng.randint(2, 5)
        x0 = baseline + direction * rng.randint(3, 9)
        x1 = x0 + direction * depth
        draw.rounded_rectangle((min(x0, x1), y, max(x0, x1), y + span), radius=1, fill=rng.choice(WARM[:3]))
    for _ in range(2):
        y = rng.randint(0, height - 4)
        x = baseline + direction * rng.randint(0, 4)
        draw.rectangle((min(x, x + direction * 2), y, max(x, x + direction * 2), y + 2), fill=BLACK)


def draw_corner(draw: ImageDraw.ImageDraw, width: int, height: int, segment: str, variant: int) -> None:
    rng = seeded('scan-emulsion-edge', segment, variant)
    top = segment.startswith('top')
    left = segment.endswith('left')
    ox = int(width * (0.24 if left else 0.76))
    oy = int(height * (0.24 if top else 0.76))
    dx = 1 if left else -1
    dy = 1 if top else -1
    # Each corner has its own seed and cluster layout. No rotations or flips.
    for _ in range(8 + variant * 2):
        along_x = rng.randint(0, 26)
        along_y = rng.randint(0, 26)
        x = ox + dx * along_x
        y = oy + dy * along_y
        w = rng.randint(2, 10)
        h = rng.randint(2, 7)
        x2, y2 = x + dx * w, y + dy * h
        draw.rounded_rectangle((min(x, x2), min(y, y2), max(x, x2), max(y, y2)), radius=1, fill=rng.choice(WARM))
    for _ in range(3):
        x = ox + dx * rng.randint(0, 18)
        y = oy + dy * rng.randint(0, 18)
        x2, y2 = x + dx * rng.randint(1, 3), y + dy * rng.randint(1, 3)
        draw.rectangle((min(x, x2), min(y, y2), max(x, x2), max(y, y2)), fill=BLACK)


def generate_segment(segment: str, variant: int) -> Image.Image:
    width, height = segment_size(segment)
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if segment == 'top':
        draw_horizontal(draw, width, height, bottom=False, variant=variant)
    elif segment == 'bottom':
        draw_horizontal(draw, width, height, bottom=True, variant=variant)
    elif segment == 'left':
        draw_vertical(draw, width, height, right=False, variant=variant)
    elif segment == 'right':
        draw_vertical(draw, width, height, right=True, variant=variant)
    else:
        draw_corner(draw, width, height, segment, variant)
    return image


def write_masks() -> None:
    for variant in range(1, 4):
        folder = MASK_ROOT / f'variant-{variant:02d}'
        folder.mkdir(parents=True, exist_ok=True)
        for segment in SEGMENTS:
            generate_segment(segment, variant).save(folder / f'{segment}.png', optimize=True)


def photo(size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(photo_source(), size, method=Image.Resampling.LANCZOS)


def actual_scan_plan(photo_box: tuple[int, int, int, int], border: int, variant: int) -> dict:
    """Ask the real mini-program renderer for geometry and texture placement.

    Node has no Canvas raster backend in this repository, so a tiny recording
    context captures the exact production `drawScanEmulsionEdgeFrame` calls.
    Pillow only rasterizes that already-computed plan for review documents.
    """
    px, py, pw, ph = photo_box
    payload = json.dumps({"photoRect": {"x": px, "y": py, "width": pw, "height": ph}, "border": border, "variant": variant})
    script = r'''
const input = JSON.parse(process.argv[1]);
const { drawImageWithInnerFrame, MASK_SEGMENTS } = require('./miniprogram/core/innerFrameRenderer');
const calls = [];
const ctx = {
  save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  drawImage(source, x, y, width, height) { calls.push({ source: source.kind, x, y, width, height }); }
};
const masks = Object.fromEntries(MASK_SEGMENTS.map(segment => [segment, { kind: segment }]));
const result = drawImageWithInnerFrame({
  ctx,
  image: { kind: 'photo', width: 2400, height: 1600 },
  photoRect: input.photoRect,
  frameWidth: input.border,
  styleId: 'scan-emulsion-edge',
  color: '#050505',
  seed: `review-${input.variant}`,
  strengthLevel: 'medium',
  maskImages: masks
});
console.log(JSON.stringify({ result, calls }));
'''
    completed = subprocess.run(
        ['node', '-e', script, payload], cwd=ROOT, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
    )
    return json.loads(completed.stdout)


def composite_scan(size: tuple[int, int], border: int = 18, variant: int = 1, background: str = PRODUCTION_BG) -> Image.Image:
    width, height = size
    canvas = Image.new('RGB', size, background).convert('RGBA')
    draw = ImageDraw.Draw(canvas)
    pw, ph = int(width * 0.62), int(height * 0.58)
    px, py = (width - pw) // 2, (height - ph) // 2
    plan = actual_scan_plan((px, py, pw, ph), border, variant)
    outer = [(round(point['x']), round(point['y'])) for point in plan['result']['outer']]
    draw.polygon(outer, fill='#050505')
    for call in plan['calls']:
        target = (round(call['x']), round(call['y']))
        target_size = (max(1, round(call['width'])), max(1, round(call['height'])))
        if call['source'] == 'photo':
            canvas.alpha_composite(photo(target_size).convert('RGBA'), target)
        else:
            texture = Image.open(MASK_ROOT / f'variant-{variant:02d}' / f"{call['source']}.png").convert('RGBA')
            texture = texture.resize(target_size, Image.Resampling.LANCZOS)
            canvas.alpha_composite(texture, target)
    return canvas.convert('RGB')


def composite_other_basic(size: tuple[int, int], kind: str) -> Image.Image:
    width, height = size
    canvas = Image.new('RGB', size, PRODUCTION_BG)
    draw = ImageDraw.Draw(canvas)
    pw, ph = int(width * 0.62), int(height * 0.58)
    px, py = (width - pw) // 2, (height - ph) // 2
    border = 15 if kind == 'full-frame-scan' else 18
    if kind == 'clean-black':
        draw.rectangle((px - border, py - border, px + pw + border, py + ph + border), fill='#050505')
    else:
        rng = seeded('comparison', kind)
        wobble = 3 if kind == 'full-frame-scan' else 8
        points = []
        for index in range(25):
            x = px - border + index * (pw + border * 2) / 24
            points.append((x, py - border + rng.randint(-wobble, wobble)))
        for index in range(25):
            y = py - border + index * (ph + border * 2) / 24
            points.append((px + pw + border + rng.randint(-wobble, wobble), y))
        for index in range(25):
            x = px + pw + border - index * (pw + border * 2) / 24
            points.append((x, py + ph + border + rng.randint(-wobble, wobble)))
        for index in range(25):
            y = py + ph + border - index * (ph + border * 2) / 24
            points.append((px - border + rng.randint(-wobble, wobble), y))
        draw.polygon(points, fill='#050505')
        if kind == 'emulsion-damage':
            for _ in range(28):
                x = rng.choice((rng.randint(px - border - 10, px + 4), rng.randint(px + pw - 4, px + pw + border + 10)))
                y = rng.randint(py - border, py + ph + border)
                draw.ellipse((x, y, x + rng.randint(2, 6), y + rng.randint(2, 6)), fill='#050505')
    canvas.paste(photo((pw, ph)), (px, py))
    return canvas


def make_preview() -> None:
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    preview = composite_scan((240, 150), border=6, variant=2, background=PREVIEW_BG)
    preview.save(PREVIEW, optimize=True)


def make_review() -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    full = composite_scan((960, 760), border=18, variant=2)
    full.save(REVIEW / 'scan-emulsion-edge-full.png', optimize=True)

    detail = Image.new('RGB', (1200, 760), '#EEE9DF')
    regions = ((0, 0, 220, 190), (740, 560, 960, 760), (300, 110, 660, 185), (300, 565, 660, 650), (170, 250, 245, 510))
    labels = ('左上角', '右下角', '上边', '下边', '左边')
    font = review_font(18)
    for index, (region, label) in enumerate(zip(regions, labels)):
        crop = full.crop(region).resize((220, 220), Image.Resampling.NEAREST)
        x = (index % 3) * 400 + 28
        y = (index // 3) * 370 + 54
        detail.paste(crop, (x, y))
        ImageDraw.Draw(detail).text((x, y - 28), label, fill='#25221B', font=font)
    detail.save(REVIEW / 'scan-emulsion-edge-detail.png', optimize=True)

    widths = Image.new('RGB', (1440, 520), '#EEE9DF')
    for index, width in enumerate((10, 18, 28)):
        tile = composite_scan((440, 450), border=width, variant=2)
        widths.paste(tile, (index * 480 + 20, 45))
        ImageDraw.Draw(widths).text((index * 480 + 20, 14), f'内框宽度 {width}', fill='#25221B', font=font)
    widths.save(REVIEW / 'scan-emulsion-edge-widths.png', optimize=True)

    comparison = Image.new('RGB', (1680, 540), '#EEE9DF')
    labels = ('经典细黑边', '全幅扫描边', '原片扫描黑边', '乳剂破损边')
    for index, label in enumerate(labels):
        style = {'经典细黑边': 'clean-black', '全幅扫描边': 'full-frame-scan', '乳剂破损边': 'emulsion-damage'}.get(label)
        tile = composite_scan((390, 470), border=18, variant=2) if label == '原片扫描黑边' else composite_other_basic((390, 470), style)
        comparison.paste(tile, (index * 420 + 15, 48))
        ImageDraw.Draw(comparison).text((index * 420 + 15, 16), label, fill='#25221B', font=font)
    comparison.save(REVIEW / 'scan-emulsion-edge-comparison.png', optimize=True)


if __name__ == '__main__':
    write_masks()
    make_preview()
    make_review()
    total = sum(path.stat().st_size for path in MASK_ROOT.rglob('*.png'))
    print(f'generated scan-emulsion-edge masks: {total} bytes')
    print(f'generated {PREVIEW}')
    print(f'generated review images under {REVIEW}')
