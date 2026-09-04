#!/usr/bin/env python3
"""
Generate tile pyramid from a large PNG image.
Creates multiple zoom levels with 256x256 tiles.

Usage: python3 generate_tiles.py [--input ../mapa_150dpi.png] [--output ../tiles] [--tile-size 256] [--max-zoom 4]
"""

import argparse
import math
import os
import sys
from pathlib import Path
from PIL import Image


def calculate_zoom_levels(width, height, tile_size):
    """Calculate how many zoom levels we need."""
    max_dim = max(width, height)
    levels = 0
    while max_dim > tile_size:
        max_dim //= 2
        levels += 1
    return levels


def generate_tiles(input_png, output_dir, tile_size=256, max_zoom=None):
    """Generate tile pyramid from image."""
    input_path = Path(input_png)
    output_path = Path(output_dir)

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    print(f"Loading image: {input_path}")
    img = Image.open(input_path)
    img_width, img_height = img.size
    print(f"Image size: {img_width} x {img_height} px")

    # Calculate zoom levels
    if max_zoom is None:
        max_zoom = calculate_zoom_levels(img_width, img_height, tile_size)
    print(f"Zoom levels: 0 to {max_zoom}")

    # Create output directory
    output_path.mkdir(parents=True, exist_ok=True)

    total_tiles = 0

    for zoom in range(max_zoom + 1):
        zoom_dir = output_path / str(zoom)
        zoom_dir.mkdir(exist_ok=True)

        # Calculate scaled dimensions for this zoom level
        scale = 1.0 / (2 ** (max_zoom - zoom))
        scaled_width = int(img_width * scale)
        scaled_height = int(img_height * scale)

        # Resize image for this zoom level
        if zoom < max_zoom:
            scaled_img = img.resize((scaled_width, scaled_height), Image.LANCZOS)
        else:
            scaled_img = img

        # Calculate number of tiles
        cols = math.ceil(scaled_width / tile_size)
        rows = math.ceil(scaled_height / tile_size)

        print(f"Zoom {zoom}: {scaled_width}x{scaled_height} px, {cols}x{rows} tiles")

        # Generate tiles
        for row in range(rows):
            for col in range(cols):
                # Calculate crop box
                left = col * tile_size
                upper = row * tile_size
                right = min(left + tile_size, scaled_width)
                lower = min(upper + tile_size, scaled_height)

                # Crop and save tile
                tile = scaled_img.crop((left, upper, right, lower))

                # Pad tile to full size if needed (edge tiles)
                if tile.size != (tile_size, tile_size):
                    padded = Image.new('RGB', (tile_size, tile_size), (255, 255, 255))
                    padded.paste(tile, (0, 0))
                    tile = padded

                tile_path = zoom_dir / f"{row}_{col}.png"
                tile.save(tile_path, 'PNG', optimize=True)
                total_tiles += 1

    print(f"\nDone! Generated {total_tiles} tiles in {output_path}")

    # Save metadata
    meta = {
        "tile_size": tile_size,
        "max_zoom": max_zoom,
        "image_width": img_width,
        "image_height": img_height,
        "total_tiles": total_tiles
    }

    meta_path = output_path / "metadata.json"
    import json
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"Metadata saved to {meta_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate tile pyramid from PNG")
    parser.add_argument("--input", default=None, help="Input PNG path")
    parser.add_argument("--output", default=None, help="Output tiles directory")
    parser.add_argument("--tile-size", type=int, default=256, help="Tile size in pixels (default: 256)")
    parser.add_argument("--max-zoom", type=int, default=None, help="Maximum zoom level (auto-calculated if not set)")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_dir = script_dir.parent

    input_png = args.input or str(project_dir / "mapa_150dpi.png")
    output_dir = args.output or str(project_dir / "tiles")

    generate_tiles(input_png, output_dir, args.tile_size, args.max_zoom)


if __name__ == "__main__":
    main()
