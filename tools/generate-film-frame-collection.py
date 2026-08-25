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
from selector_preview_scene import photo_source


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
RUNTIME_PREVIEW_IDS = [
    'film-strip-35mm-full',
    'film-rebate-minimal',
    'medium-format-120',
    *STYLE_IDS,
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
SELECTOR_BACKGROUND = '#EEE9DF'


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


def render(style_id, size, margin, title=None, source=None, background=OUTER):
    source = source or photo_source()
    canvas = Image.new('RGB', size, background)
    layout = production_layout(style_id, size[0], size[1], source.width / source.height, margin)
    style = layout['style']
    frame = layout['frameRect']
    draw = ImageDraw.Draw(canvas)
    draw.rectangle(box_xyxy(frame), fill=style['frame']['color'])
    paste_aperture(canvas, source, layout['apertureRect'])
    decorations = layout['decorationRects']
    for item in decorations['perforations']:
        draw_perforation(draw, item, background)
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


def render_legacy_medium_preview(size, source):
    """Rebuild the existing legacy 120 selector with the common neutral photo.

    The runtime legacy renderer remains untouched; this maintains its visible
    asymmetric body and archive dot while removing the obsolete UI screenshot
    from its selector asset.
    """
    canvas = Image.new('RGB', size, '#EEE9DF')
    draw = ImageDraw.Draw(canvas)
    box = {'x': size[0] * .23, 'y': size[1] * .19, 'width': size[0] * .55, 'height': size[1] * .63}
    top, right, bottom, left = 8, 7, 9, 13
    draw.rectangle((round(box['x'] - left), round(box['y'] - top),
                    round(box['x'] + box['width'] + right), round(box['y'] + box['height'] + bottom)), fill='#030303')
    paste_aperture(canvas, source, box)
    draw.ellipse((round(box['x'] - left * .72), round(box['y'] + box['height'] * .47),
                  round(box['x'] - left * .2), round(box['y'] + box['height'] * .6)), fill='#EEE9DF')
    draw.text((round(box['x'] - left + 2), round(box['y'] + box['height'] + 2)), '07', fill='#EEE9DF', font=font(8))
    return canvas


def generate_previews():
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    source = photo_source()
    for style_id in RUNTIME_PREVIEW_IDS:
        image = render_legacy_medium_preview((240, 150), source) if style_id == 'medium-format-120' else render(style_id, (240, 150), 18, source=source, background=SELECTOR_BACKGROUND)[0]
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
