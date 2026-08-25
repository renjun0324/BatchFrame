#!/usr/bin/env python3
"""Audit the files that can be included by the configured mini-program root."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1] / "miniprogram"
BUDGET_BYTES = int(1.5 * 1024 * 1024)
HARD_LIMIT_BYTES = 2 * 1024 * 1024
FORBIDDEN_PARTS = {
    ".git",
    "cloudfunctions",
    "docs",
    "design-v3",
    "node_modules",
    "tests",
}
FORBIDDEN_SUFFIXES = {".md", ".py"}
FORBIDDEN_NAMES = {"logo.png", "example.jpg", "example.jpeg"}


def audit() -> int:
    if not ROOT.is_dir():
        print(f"ERROR: missing mini-program root: {ROOT}")
        return 1

    files = [path for path in ROOT.rglob("*") if path.is_file()]
    forbidden = []
    for path in files:
        relative = path.relative_to(ROOT)
        parts = set(relative.parts)
        if parts & FORBIDDEN_PARTS or path.suffix.lower() in FORBIDDEN_SUFFIXES:
            forbidden.append(relative)
        # A production style may legitimately be named "film-contact-sheet".
        # Documentation directories are already forbidden above, so only reject
        # the known README/sample filenames here rather than product style IDs.
        if path.name.lower() in FORBIDDEN_NAMES:
            forbidden.append(relative)

    total = sum(path.stat().st_size for path in files)
    print(f"root: {ROOT}")
    print(f"files: {len(files)}")
    print(f"bytes: {total}")
    print(f"MiB: {total / (1024 * 1024):.3f}")
    print(f"internal budget: {BUDGET_BYTES} bytes (1.5 MiB)")
    print(f"WeChat source limit reference: {HARD_LIMIT_BYTES} bytes (2 MiB)")

    print("\ntop files:")
    for path in sorted(files, key=lambda item: (-item.stat().st_size, str(item)))[:30]:
        print(f"  {path.stat().st_size:>9}  {path.relative_to(ROOT)}")

    directory_totals = defaultdict(int)
    for path in files:
        relative = path.relative_to(ROOT)
        directory_totals[str(relative.parent)] += path.stat().st_size
    print("\ndirectory totals:")
    for directory, size in sorted(directory_totals.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {size:>9}  {directory}")

    failed = False
    if forbidden:
        failed = True
        print("\nforbidden files inside miniprogram/:")
        for path in sorted(set(forbidden)):
            print(f"  {path}")
    if total > BUDGET_BYTES:
        failed = True
        print(f"\nERROR: package exceeds the 1.5 MiB internal budget by {total - BUDGET_BYTES} bytes")
    else:
        print(f"\nremaining to 1.5 MiB budget: {BUDGET_BYTES - total} bytes")
    if total >= HARD_LIMIT_BYTES:
        failed = True
        print("ERROR: package is at or above the 2 MiB WeChat source limit")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(audit())
