#!/usr/bin/env python3
"""Generate the home hero from the production Film Frame layout contract.

The shared film-frame collection tool asks the production Node.js layout for
all frame geometry and decorations. This script only selects the warm 35mm
style and writes a dedicated, package-sized home asset. The photo scene is the
project-generated neutral still life used by runtime selector previews.
"""
import runpy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'tools'
OUTPUT = ROOT / 'miniprogram' / 'assets' / 'home' / 'home-hero.png'


def main():
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(TOOLS))
    collection = runpy.run_path(str(TOOLS / 'generate-film-frame-collection.py'))
    image, _ = collection['render']('film-35mm-warm', (640, 480), 58)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, optimize=True)
    size = OUTPUT.stat().st_size
    if size >= 80 * 1024:
        raise SystemExit(f'{OUTPUT} exceeds 80KiB: {size} bytes')
    print(f'generated {OUTPUT.relative_to(ROOT)} ({size} bytes)')


if __name__ == '__main__':
    main()
