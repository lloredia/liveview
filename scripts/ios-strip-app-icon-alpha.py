#!/usr/bin/env python3
"""
Strip alpha channel from the iOS app icon so App Store Connect validation passes.

Error: "The large app icon in the asset catalog cannot be transparent or contain an alpha channel."

Usage:
  python3 scripts/ios-strip-app-icon-alpha.py
  # or from repo root:
  python3 scripts/ios-strip-app-icon-alpha.py

Requires: pip install Pillow
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Requires Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
ICON_PATH = REPO_ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"


def main() -> int:
    if not ICON_PATH.exists():
        print(f"Icon not found: {ICON_PATH}", file=sys.stderr)
        return 1
    img = Image.open(ICON_PATH).convert("RGBA")
    # Composite onto white so the output has no transparency (App Store requirement)
    background = Image.new("RGB", img.size, (255, 255, 255))
    background.paste(img, mask=img.split()[-1])
    background.save(ICON_PATH, "PNG")
    print(f"Stripped alpha and saved: {ICON_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
