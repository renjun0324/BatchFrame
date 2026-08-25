#!/usr/bin/env python3
"""Generate runtime selector previews and review plates from Film Frame Engine data.

The geometry is obtained from miniprogram/core/innerFrameLayout.js through
Node.js. Pillow only rasterizes the same frame body, aperture, perforations and
decorations for review assets; no external or branded artwork is used.
"""
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / 'miniprogram' / 'assets' / 'frame-previews'
REVIEW_DIR = ROOT / 'docs' / 'production-frame-review'
STYLE_IDS = [
    'film-35mm-mono',
    'film-35mm-warm',
    'film-120-classic',
    'film-16mm-cinema',
    'film-110-pocket',
    'film-contact-sheet',
]
STYLE_LABELS = {
    'film-35mm-mono': '35mm 黑白片基',
    'film-35mm-warm': '35mm 暖调片基',
    'film-120-classic': '120 经典片基',
    'film-16mm-cinema': '16mm 电影片基',
    'film-110-pocket': '110 袖珍胶片',
    'film-contact-sheet': '接触印样',
}
OUTER = '#FFFFFF'


def font(size):
    try:
        return ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', max(8, int(size)))
    except OSError:
        try:
            return ImageFont.truetype('DejaVuSans.ttf', max(8, int(size)))
        except OSError:
            return ImageFont.load_default()


def production_layout(style_id, width, height, image_aspect, margin, frame_index=2):
    script = """
      const { getInnerFrameStyle } = require('./miniprogram/core/innerFrameStyles');
      const { layoutInnerFrame } = require('./miniprogram/core/innerFrameLayout');
      const args = JSON.parse(process.argv[1]);
      const layout = layoutInnerFrame({
        outputRect: { x: 0, y: 0, width: args.width, height: args.height },
        outerLayout: { padding: args.margin, zoom: 1 },
        imageAspect: args.imageAspect,
        orientation: args.imageAspect < 1 ? 'portrait' : 'landscape',
        frameIndex: args.frameIndex,
        style: getInnerFrameStyle(args.styleId)
      });
      console.log(JSON.stringify(layout));
    """
    args = json.dumps({
        'styleId': style_id, 'width': width, 'height': height,
        'imageAspect': image_aspect, 'margin': margin, 'frameIndex': frame_index,
    })
    raw = subprocess.check_output(['node', '-e', script, args], cwd=ROOT, text=True)
    return json.loads(raw)


def photo_source():
    """A local, original neutral still-life used only for renderer review.

    It keeps selector previews independent from user photos, README artwork and
    third-party photography while providing light/dark detail around the frame.
    """
    width, height = 1600, 1200
    image = Image.new('RGB', (width, height), '#B8D7E5')
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = (
            round(183 - ratio * 71),
            round(215 - ratio * 57),
            round(229 - ratio * 57),
        )
        draw.line((0, y, width, y), fill=color)
    draw.polygon([(0, 760), (790, 690), (1600, 775), (1600, 1200), (0, 1200)], fill='#71766E')
    draw.rectangle((270, 335, 920, 835), fill='#D9C790')
    draw.polygon([(230, 335), (610, 165), (965, 335)], fill='#C68754')
    draw.rectangle((1030, 440, 1330, 860), fill='#B4C2A0')
    draw.polygon([(995, 440), (1175, 310), (1360, 440)], fill='#778D73')
    for x in (350, 525, 700):
        draw.rectangle((x, 460, x + 100, 615), fill='#537688')
        draw.rectangle((x + 14, 478, x + 86, 597), fill='#A9D0D8')
    draw.rectangle((500, 670, 680, 835), fill='#765D43')
    for x in (1080, 1200):
        draw.rectangle((x, 545, x + 70, 690), fill='#5B7480')
    draw.ellipse((112, 570, 400, 1055), fill='#425B45')
    draw.ellipse((1280, 610, 1535, 1020), fill='#3D5742')
    draw.rectangle((0, 1015, width, 1200), fill='#595C55')
    draw.line((0, 1040, width, 960), fill='#D6BF78', width=13)
    return image


def as_box(rect):
    return tuple(round(rect[key]) for key in ('x', 'y', 'width', 'height'))


def box_xyxy(rect):
    x, y, w, h = as_box(rect)
    return (x, y, x + w, y + h)


def paste_aperture(canvas, source, aperture):
    x, y, w, h = as_box(aperture)
    fitted = ImageOps.fit(source, (max(1, w), max(1, h)), method=Image.Resampling.LANCZOS)
    canvas.paste(fitted, (x, y))


def draw_marker(draw, marker):
    x, y, w, h = as_box(marker['box'])
    color = marker['color']
    kind = marker['type']
    if kind == 'square':
        draw.rectangle((x, y, x + w, y + h), fill=color)
    elif kind == 'circle':
        draw.ellipse((x, y, x + w, y + h), fill=color)
    elif kind == 'line':
        draw.rectangle((x, y + round(h * .42), x + w, y + round(h * .58)), fill=color)
    elif kind == 'arrow':
        draw.polygon([
            (x, y + round(h * .35)), (x + round(w * .62), y + round(h * .35)),
            (x + round(w * .62), y), (x + w, y + h // 2),
            (x + round(w * .62), y + h), (x + round(w * .62), y + round(h * .65)),
            (x, y + round(h * .65)),
        ], fill=color)
    else:
        draw.polygon([(x, y + h), (x + w, y + h // 2), (x, y)], fill=color)


def draw_perforation(draw, item, background):
    x, y, w, h = as_box(item['box'])
    color = background if item['color'] == 'outer-background' else item['color']
    if item['shape'] == 'circle':
        draw.ellipse((x, y, x + w, y + h), fill=color)
    elif item['shape'] == 'rounded-rect':
        radius = max(1, round(min(w, h) * item.get('cornerRadiusRatio', 0.018)))
        draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=color)
    else:
        draw.rectangle((x, y, x + w, y + h), fill=color)


def draw_text(draw, item):
    box = item['box']
    x, y, w, h = as_box(box)
    # The first batch uses horizontal preview cards; the style data still
    # carries portrait rotation for the runtime Canvas renderer.
    draw.text((x, y + max(0, (h - item['fontSize']) // 2)), item['text'],
              fill=item['color'], font=font(item['fontSize']))


def render(style_id, size, margin, title=None, source=None):
    source = source or photo_source()
    canvas = Image.new('RGB', size, OUTER)
    layout = production_layout(style_id, size[0], size[1], source.width / source.height, margin)
    style = layout['style']
    frame = layout['frameRect']
    draw = ImageDraw.Draw(canvas)
    draw.rectangle(box_xyxy(frame), fill=style['frame']['color'])
    paste_aperture(canvas, source, layout['apertureRect'])
    decorations = layout['decorationRects']
    for item in decorations['perforations']:
        draw_perforation(draw, item, OUTER)
    for item in decorations['labels']:
        draw_text(draw, item)
    for item in decorations['frameNumbers']:
        draw_text(draw, item)
    for item in decorations['markers']:
        draw_marker(draw, item)
    if title:
        draw.rounded_rectangle((18, 16, 18 + max(170, len(title) * 19), 52), radius=8, fill='#F1ECE1')
        draw.text((28, 23), title, fill='#1A1815', font=font(20))
    return canvas, layout


def generate_previews():
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for style_id in STYLE_IDS:
        image, _ = render(style_id, (240, 150), 18)
        output = PREVIEW_DIR / f'{style_id}.png'
        image.save(output, optimize=True)
        if output.stat().st_size > 15 * 1024:
            raise SystemExit(f'{output} exceeds 15KiB: {output.stat().st_size}')


def generate_review_plates():
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    details = []
    for style_id in STYLE_IDS:
        tile, _ = render(style_id, (900, 600), 62, STYLE_LABELS[style_id])
        tiles.append(tile)
        detail, layout = render(style_id, (900, 600), 62, STYLE_LABELS[style_id])
        frame = layout['frameRect']
        crop = detail.crop((
            max(0, round(frame['x'] - 26)), max(0, round(frame['y'] - 26)),
            min(detail.width, round(frame['x'] + frame['width'] * .48)),
            min(detail.height, round(frame['y'] + frame['height'] * .42)),
        ))
        details.append(ImageOps.fit(crop, (900, 600), method=Image.Resampling.NEAREST))

    grid = Image.new('RGB', (1800, 1800), '#E8E2D7')
    detail_grid = Image.new('RGB', (1800, 1800), '#E8E2D7')
    for index, tile in enumerate(tiles):
        x = (index % 2) * 900
        y = (index // 2) * 600
        grid.paste(tile, (x, y))
        detail_grid.paste(details[index], (x, y))
    grid.save(REVIEW_DIR / 'film-frame-first-batch.png', optimize=True)
    detail_grid.save(REVIEW_DIR / 'film-frame-first-batch-details.png', optimize=True)


if __name__ == '__main__':
    generate_previews()
    generate_review_plates()
    print('generated data-driven film frame previews and review plates')
