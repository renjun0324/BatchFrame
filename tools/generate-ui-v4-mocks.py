#!/usr/bin/env python3
"""Generate static DESIGN MOCK review frames for the BatchFrame UI v4 pass.

These are intentionally not WeChat DevTools screenshots. They give the visual
review a reproducible 390 x 844 reference while real-device layout remains a
separate manual check.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'ui-v4'
PREVIEWS = ROOT / 'miniprogram' / 'assets' / 'frame-previews'
W, H = 390, 844
PAGE, SURFACE, STAGE = '#F3F0E9', '#FAF8F3', '#151513'
INK, MUTED, LINE, ACCENT = '#26231F', '#777064', '#DDD6CA', '#A65332'


def font(size, bold=False):
    candidates = [
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc' if bold else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf',
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def text(draw, xy, value, size=12, color=INK, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=color, anchor=anchor)


def fit_preview(style, box):
    image = Image.open(PREVIEWS / f'{style}.png').convert('RGB')
    return ImageOps.fit(image, (box[2], box[3]), method=Image.Resampling.LANCZOS)


def top_label(draw):
    text(draw, (16, 14), 'DESIGN MOCK · 390 × 844', 9, MUTED)


def draw_editor(active='模板', expanded=True, exporting=False, error=False, film=False):
    image = Image.new('RGB', (W, H), PAGE)
    draw = ImageDraw.Draw(image)
    top_label(draw)
    text(draw, (16, 42), '2 张照片', 12, MUTED)
    text(draw, (374, 42), '＋ 添加', 12, ACCENT, True, 'ra')
    draw.rectangle((0, 63, W, 410 if expanded else 566), fill=STAGE)
    hero = fit_preview('emulsion-damage', (52, 130, 286, 178))
    image.paste(hero, (52, 148))
    if expanded:
        strip_y = 360
        tabs_y = 420
        sheet_y = 462
    else:
        strip_y = 566
        tabs_y = 628
        sheet_y = 672
    draw.rectangle((0, strip_y, W, tabs_y), fill=SURFACE)
    for index, style in enumerate(('emulsion-damage', 'clean-black')):
        x = 16 + index * 60
        thumb = fit_preview(style, (x, strip_y + 6, 50, 50))
        image.paste(thumb, (x, strip_y + 6))
        if index == 0:
            draw.rectangle((x, strip_y + 6, x + 50, strip_y + 56), outline=ACCENT, width=2)
    draw.rectangle((0, tabs_y, W, sheet_y), fill=SURFACE)
    for index, tab in enumerate(('模板', '画布', '内框')):
        x = 65 + index * 130
        text(draw, (x, tabs_y + 15), tab, 13, INK if tab == active else MUTED, tab == active, 'mm')
        if tab == active:
            draw.rectangle((x - 12, sheet_y - 2, x + 12, sheet_y), fill=ACCENT)
    draw.rectangle((0, sheet_y, W, H), fill=SURFACE)
    draw.rounded_rectangle((181, sheet_y + 8, 209, sheet_y + 11), radius=2, fill='#C9C0B3')
    if not expanded:
        text(draw, (195, 710), '设置面板已收起', 11, MUTED, anchor='mm')
    elif active == '模板':
        for index, style in enumerate(('clean-black', 'full-frame-scan', 'emulsion-damage')):
            x = 16 + index * 102
            image.paste(fit_preview(style, (x, sheet_y + 25, 92, 58)), (x, sheet_y + 25))
            if index == 2:
                draw.rectangle((x, sheet_y + 25, x + 92, sheet_y + 83), outline=ACCENT, width=2)
            text(draw, (x + 46, sheet_y + 93), ('经典', '扫描', '乳剂')[index], 10, INK if index == 2 else MUTED, anchor='ma')
    elif active == '画布':
        text(draw, (16, sheet_y + 28), '输出比例', 11, MUTED)
        for index, ratio in enumerate(('1:1', '3:4', '4:5', '9:16')):
            x = 16 + index * 72
            draw.rounded_rectangle((x, sheet_y + 46, x + 58, sheet_y + 76), radius=6, fill='#EFE0D7' if ratio == '3:4' else '#ECE7DE')
            text(draw, (x + 29, sheet_y + 61), ratio, 11, INK, ratio == '3:4', 'mm')
        text(draw, (16, sheet_y + 104), '图片缩放', 13)
        text(draw, (365, sheet_y + 104), '100%', 12, ACCENT, True, 'ra')
        draw.line((16, sheet_y + 132, 374, sheet_y + 132), fill=LINE, width=3)
        draw.ellipse((193, sheet_y + 125, 207, sheet_y + 139), fill=ACCENT)
    else:
        styles = ('film-35mm-mono', 'film-16mm-cinema', 'film-contact-sheet') if film else ('none', 'clean-black', 'emulsion-damage')
        names = ('35mm 黑白', '16mm 电影', '接触印样') if film else ('无内框', '经典细黑边', '乳剂破损边')
        active_style = 'film-16mm-cinema' if film else 'emulsion-damage'
        for index, style in enumerate(styles):
            x = 16 + index * 120
            image.paste(fit_preview(style, (x, sheet_y + 26, 112, 70)), (x, sheet_y + 26))
            if style == active_style:
                draw.rectangle((x, sheet_y + 26, x + 112, sheet_y + 96), outline=ACCENT, width=2)
            text(draw, (x + 56, sheet_y + 106), names[index], 10, INK if style == active_style else MUTED, anchor='ma')
    if exporting:
        draw.rounded_rectangle((16, H - 60, 374, H - 10), radius=10, fill='#B58169')
        text(draw, (195, H - 35), '处理中 1/2', 14, '#FFF9F4', True, 'mm')
    else:
        draw.rounded_rectangle((16, H - 60, 374, H - 10), radius=10, fill=ACCENT)
        text(draw, (195, H - 35), '批量导出 2 张', 14, '#FFF9F4', True, 'mm')
    if error:
        draw.ellipse((58, strip_y + 8, 69, strip_y + 19), fill='#9B3A32')
        text(draw, (64, strip_y + 13), '!', 8, '#FFFFFF', True, 'mm')
        text(draw, (195, 105), '检测服务异常：图片仍可编辑', 11, '#D4C5B8', anchor='mm')
    return image


def draw_home():
    image = Image.new('RGB', (W, H), PAGE)
    draw = ImageDraw.Draw(image)
    top_label(draw)
    text(draw, (24, 108), 'BATCHFRAME', 11, ACCENT, True)
    text(draw, (24, 136), '批量照片装裱', 30, INK, True)
    text(draw, (24, 183), '一次处理整组照片，\n统一留白与胶片内框。', 13, MUTED)
    draw.rectangle((24, 260, 366, 570), fill=STAGE)
    image.paste(fit_preview('emulsion-damage', (50, 335, 290, 180)), (50, 335))
    draw.rounded_rectangle((24, 730, 366, 780), radius=10, fill=ACCENT)
    text(draw, (195, 755), '选择照片', 15, '#FFF9F4', True, 'mm')
    text(draw, (195, 799), '一次最多选择 9 张', 11, MUTED, anchor='mm')
    return image


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    states = {
        '01-home-empty.png': draw_home(),
        '02-editor-with-images-template.png': draw_editor('模板'),
        '03-editor-canvas.png': draw_editor('画布'),
        '04-editor-basic-frame.png': draw_editor('内框'),
        '05-editor-film-frame.png': draw_editor('内框', film=True),
        '06-editor-panel-collapsed.png': draw_editor('模板', expanded=False),
        '07-editor-exporting.png': draw_editor('模板', exporting=True),
        '08-editor-error-state.png': draw_editor('模板', error=True),
    }
    for name, image in states.items():
        image.save(OUT / name, optimize=True)
    sheet = Image.new('RGB', (W * 2, H * 4), '#E5DED3')
    for index, image in enumerate(states.values()):
        sheet.paste(image, ((index % 2) * W, (index // 2) * H))
    sheet.save(OUT / 'contact-sheet.png', optimize=True)
    print(f'generated {len(states)} DESIGN MOCK frames under {OUT}')


if __name__ == '__main__':
    main()
