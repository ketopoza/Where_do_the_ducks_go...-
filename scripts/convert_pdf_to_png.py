#!/usr/bin/env python3
"""
Convert PDF map to PNG using ImageMagick (via subprocess).
Usage: python3 convert_pdf_to_png.py [--dpi 150] [--input ../Whole_Map.pdf] [--output ../mapa.png]
"""

import subprocess
import argparse
import os
import sys
from pathlib import Path


def find_imagemagick():
    """Find ImageMagick convert command."""
    for cmd in ["convert", "/opt/ImageMagick/bin/convert"]:
        try:
            subprocess.run([cmd, "--version"], capture_output=True, check=True)
            return cmd
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    return None


def convert_pdf_to_png(input_pdf, output_png, dpi=150):
    """Convert PDF to PNG using ImageMagick."""
    convert_cmd = find_imagemagick()
    if not convert_cmd:
        print("ERROR: ImageMagick not found. Install with: brew install imagemagick")
        sys.exit(1)

    input_path = Path(input_pdf).resolve()
    output_path = Path(output_png).resolve()

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    print(f"Converting: {input_path.name}")
    print(f"DPI: {dpi}")
    print(f"Output: {output_path}")

    cmd = [
        convert_cmd,
        "-density", str(dpi),
        "-background", "white",
        "-alpha", "remove",
        str(input_path),
        str(output_path)
    ]

    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"ERROR: {result.stderr}")
        sys.exit(1)

    if output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"SUCCESS: {output_path} ({size_mb:.1f} MB)")
    else:
        print("ERROR: Output file not created")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Convert PDF map to PNG")
    parser.add_argument("--dpi", type=int, default=150, help="Resolution in DPI (default: 150)")
    parser.add_argument("--input", default=None, help="Input PDF path")
    parser.add_argument("--output", default=None, help="Output PNG path")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_dir = script_dir.parent

    input_pdf = args.input or str(project_dir / "assets" / "source" / "Whole_Map.pdf")
    output_png = args.output or str(project_dir / "assets" / "source" / "mapa_150dpi.png")

    convert_pdf_to_png(input_pdf, output_png, args.dpi)


if __name__ == "__main__":
    main()
