#!/usr/bin/env python3
"""Validate generated frame mask count, alpha channels, dimensions and size."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "miniprogram" / "assets" / "frame-masks"
EXPECTED = {"full-frame-scan": 3, "emulsion-damage": 3}
TIERS = ("light", "medium", "strong")
SEGMENTS = {"top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"}

for style, variants in EXPECTED.items():
    for tier in TIERS:
        for variant in range(1, variants + 1):
            folder = ROOT / style / tier / f"variant-{variant:02d}"
            files = {file.stem for file in folder.glob("*.png")}
            assert files == SEGMENTS, (style, tier, variant, files)
            for file in folder.glob("*.png"):
                assert 0 < file.stat().st_size < 200_000, file
                image = Image.open(file)
                assert image.mode == "RGBA", (file, image.mode)
                assert image.width > 0 and image.height > 0, file
                assert image.getchannel("A").getbbox(), file

assert {path.name for path in ROOT.iterdir() if path.is_dir()} == set(EXPECTED), "stale or missing production mask style"

print("frame mask asset tests passed")
