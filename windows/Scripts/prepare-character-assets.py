#!/usr/bin/env python3
"""Prepare user-provided character art for the Electron renderer.

The source images stay untouched. Only border-connected near-white pixels are
removed, which protects white details enclosed by the character silhouette.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "renderer" / "assets" / "character-states"
SOURCE_ROOT = ASSET_ROOT / "source"

STATE_SOURCES = {
    "leisure": "leisure.png",
    "drinking": "drinking.png",
    "stretching": "stretching.png",
    "eyes-rest": "eyes-rest.jpg",
    "sleeping": "sleeping.jpg",
    "happy": "happy.png",
    "do-not-disturb": "do-not-disturb.png",
    "sad": "sadness.png",
    "patrolling": "patrolling.png",
    "slacking": "waiting-update.png",
    "collecting": "collecting.png",
}


def border_color(image: Image.Image) -> tuple[int, int, int]:
    pixels = np.asarray(image.convert("RGB"))
    border = np.concatenate(
        (
            pixels[:16].reshape(-1, 3),
            pixels[-16:].reshape(-1, 3),
            pixels[:, :16].reshape(-1, 3),
            pixels[:, -16:].reshape(-1, 3),
        )
    )
    return tuple(int(value) for value in np.median(border, axis=0))


def extract_border_background(source: Path, destination: Path) -> dict[str, object]:
    image = Image.open(source).convert("RGB")
    background = border_color(image)

    flooded = image.copy()
    marker = (1, 2, 3)
    draw = ImageDraw.Draw(flooded)
    width, height = flooded.size
    for seed in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        ImageDraw.floodfill(flooded, seed, marker, thresh=20)

    flooded_pixels = np.asarray(flooded)
    transparent = np.all(flooded_pixels == marker, axis=2)
    alpha = np.where(transparent, 0, 255).astype(np.uint8)

    # Feather only a narrow subject-side band. Interior whites remain opaque.
    background_mask = Image.fromarray(np.where(transparent, 255, 0).astype(np.uint8), "L")
    adjacent = np.asarray(background_mask.filter(ImageFilter.MaxFilter(5))) > 0
    edge_band = adjacent & ~transparent
    original = np.asarray(image).astype(np.int16)
    difference = np.max(np.abs(original - np.asarray(background, dtype=np.int16)), axis=2)
    edge_alpha = np.clip((difference - 2) * (255 / 28), 0, 255).astype(np.uint8)
    alpha[edge_band] = np.minimum(alpha[edge_band], edge_alpha[edge_band])

    # JPEG backgrounds can leave isolated near-white specks along the canvas
    # edge. Keep everything near the strongly colored subject, including
    # detached symbols such as the sleeping Zs, and discard only far-away noise.
    strong_y, strong_x = np.where(difference > 30)
    if strong_x.size:
        padding = max(16, round(min(width, height) * 0.012))
        left = max(0, int(strong_x.min()) - padding)
        top = max(0, int(strong_y.min()) - padding)
        right = min(width, int(strong_x.max()) + padding + 1)
        bottom = min(height, int(strong_y.max()) + padding + 1)
        alpha[:top] = 0
        alpha[bottom:] = 0
        alpha[:, :left] = 0
        alpha[:, right:] = 0

    rgba = np.dstack((np.asarray(image), alpha))
    rgba[alpha == 0, :3] = 0
    output = Image.fromarray(rgba, "RGBA")
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, optimize=True)

    visible = alpha > 0
    y_coordinates, x_coordinates = np.where(visible)
    if x_coordinates.size == 0:
        raise RuntimeError(f"No visible subject found in {source.name}")
    bounding_box = [
        int(x_coordinates.min()),
        int(y_coordinates.min()),
        int(x_coordinates.max()) + 1,
        int(y_coordinates.max()) + 1,
    ]
    coverage = float(np.count_nonzero(visible) / visible.size)
    if not 0.05 < coverage < 0.9:
        raise RuntimeError(f"Unexpected subject coverage for {source.name}: {coverage:.3f}")

    return {
        "source": source.name,
        "output": destination.name,
        "width": width,
        "height": height,
        "background": list(background),
        "visibleCoverage": round(coverage, 4),
        "visibleBounds": bounding_box,
    }


def main() -> None:
    downloads = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path.home() / "Downloads"
    SOURCE_ROOT.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {"states": {}}
    for state, file_name in STATE_SOURCES.items():
        original = downloads / file_name
        if not original.is_file():
            raise FileNotFoundError(f"Missing source image: {original}")
        preserved = SOURCE_ROOT / file_name
        shutil.copy2(original, preserved)
        metadata = extract_border_background(preserved, ASSET_ROOT / f"{state}.png")
        manifest["states"][state] = metadata

    existing_states = {
        "default": PROJECT_ROOT / "src" / "renderer" / "assets" / "chibi-lam-pixel.png",
        "working": PROJECT_ROOT / "src" / "renderer" / "assets" / "chibi-lam-singing.png",
    }
    for state, source in existing_states.items():
        destination = ASSET_ROOT / f"{state}.png"
        shutil.copy2(source, destination)
        with Image.open(destination) as image:
            manifest["states"][state] = {
                "source": source.name,
                "output": destination.name,
                "width": image.width,
                "height": image.height,
                "preservedExistingAsset": True,
            }

    manifest_path = ASSET_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(manifest_path)


if __name__ == "__main__":
    main()
