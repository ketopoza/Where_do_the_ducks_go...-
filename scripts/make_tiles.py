#!/usr/bin/env python3
"""Generate a tile pyramid for a map layer.

Usage:
    python3 make_tiles.py <layer_id> <source> <out_dir> [max_zoom]

The map's display resolution is 9370x5590 (BASE_W x BASE_H). max_zoom >= 6
renders the source at up to 2**(max_zoom-6) that size, so deep zoom-in levels
stay sharp. Level 6 always equals the display resolution.

Produces tiles/{out_dir}/{layer_id}/{z}/{x}_{y}.{jpg|png}
and cuts 256px tiles at zoom levels 0..max_zoom.
"""

import os
import sys
import io
import math
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TILE_SIZE = 256
BASE_W = 9370
BASE_H = 5590


def render_source(src, w, h):
    """Return an RGBA image of src scaled to w x h."""
    ext = os.path.splitext(src)[1].lower()
    if ext == '.svg':
        import cairosvg
        png = cairosvg.svg2png(url=src, output_width=w, output_height=h)
        img = Image.open(io.BytesIO(png))
        return img.convert('RGBA')
    else:
        img = Image.open(src)
        img = img.convert('RGBA')
        if img.size != (w, h):
            img = img.resize((w, h), Image.LANCZOS)
        return img


def make_tiles(layer_id, src, out_dir, max_zoom=6, base_w=BASE_W, base_h=BASE_H):
    zoom_in = 2 ** (max_zoom - 6)
    disp_w = base_w * zoom_in
    disp_h = base_h * zoom_in
    root = os.path.join(out_dir, layer_id)
    os.makedirs(root, exist_ok=True)

    # Render once at the highest needed resolution
    print(f'Rendering {src} at {disp_w}x{disp_h} ...')
    full = render_source(src, disp_w, disp_h)

    total = 0
    for z in range(0, max_zoom + 1):
        s = 2 ** (z - max_zoom)
        mapW = max(1, round(disp_w * s))
        mapH = max(1, round(disp_h * s))
        cols = math.ceil(mapW / TILE_SIZE)
        rows = math.ceil(mapH / TILE_SIZE)

        if z == max_zoom:
            level_img = full
        else:
            level_img = full.resize((mapW, mapH), Image.LANCZOS)

        zdir = os.path.join(root, str(z))
        os.makedirs(zdir, exist_ok=True)

        for y in range(rows):
            for x in range(cols):
                bx = x * TILE_SIZE
                by = y * TILE_SIZE
                box = level_img.crop((bx, by, min(bx + TILE_SIZE, mapW),
                                      min(by + TILE_SIZE, mapH)))
                # Build a 256x256 tile (transparent padding on edges)
                tile = Image.new('RGBA', (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
                tile.paste(box, (0, 0))

                # Decide JPEG (opaque) vs PNG (has transparency)
                alpha = tile.getchannel('A')
                extrema = alpha.getextrema()
                if extrema[0] == 255:
                    rgb = tile.convert('RGB')
                    path = os.path.join(zdir, f'{x}_{y}.jpg')
                    rgb.save(path, 'JPEG', quality=82, optimize=True)
                else:
                    path = os.path.join(zdir, f'{x}_{y}.png')
                    tile.save(path, 'PNG', optimize=True)
                total += 1

        print(f'  z={z}: {cols}x{rows} tiles ({mapW}x{mapH})')
        if z != max_zoom:
            level_img.close()

    full.close()
    print(f'Done: {total} tiles in {root}')


if __name__ == '__main__':
    layer_id = sys.argv[1]
    src = sys.argv[2]
    out_dir = sys.argv[3]
    max_zoom = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    make_tiles(layer_id, src, out_dir, max_zoom=max_zoom)
