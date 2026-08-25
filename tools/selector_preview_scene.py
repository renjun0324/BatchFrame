"""Shared, locally generated artwork for every runtime selector preview.

The selector cards must demonstrate frame structure without embedding a user
photo, README example, or third-party image in the mini-program package.
"""

from PIL import Image, ImageDraw


def photo_source():
    """Return the single neutral still-life used by all selector generators."""
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
