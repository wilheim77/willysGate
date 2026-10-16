#!/usr/bin/env python3
"""Builds a game's runtime art from art-src/ using the specs in content/<game>/art/.

    python3 scripts/build-art.py [game]          (default: intereses; needs Pillow)

Outputs (committed, so CI and the browser never need Python):
  content/<game>/public/assets/tiles/floors.png   64x32 frames
  content/<game>/public/assets/tiles/blocks.png   64x48 half blocks (one elevation level)
  content/<game>/public/assets/characters/<id>.png  4x6 grid of 96x96 frames
and rewrites the 'tilesets', 'terrain' and character 'sprites' entries of
content/<game>/assets/manifest.json.
"""
import colorsys
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
MAGENTA = (255, 0, 255)
FLOOR_W, FLOOR_H = 64, 32
BLOCK_CELL = 64
HALF_BLOCK_TOP = 16  # half blocks occupy rows 16..63 of their 64x64 cell
FRAME = 96


def load(sheet: str) -> Image.Image:
    """Loads a source sheet, turning Stone Soup's magenta background into transparency."""
    im = Image.open(SRC / sheet).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] == MAGENTA:
                px[x, y] = (0, 0, 0, 0)
    return im


def grade(im: Image.Image, saturation: float, brightness: float) -> Image.Image:
    """Darker, desaturated palette shared by all packs so they read as one style."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s * saturation, v * brightness)
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


def recolor_team(im: Image.Image, hex_color: str) -> Image.Image:
    """Spell of Mastery marks recolourable cloth with purple (hue ~260-315 deg)."""
    tr, tg, tb = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.2 and 255 / 360 <= h <= 315 / 360:
                # Keep the shading (value), take hue/saturation from the target, scale to its brightness.
                r2, g2, b2 = colorsys.hsv_to_rgb(th, ts, min(1.0, v * tv / 0.75))
                px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


def floor_frame(sheet: Image.Image, index: int) -> Image.Image:
    cols = sheet.width // FLOOR_W
    x, y = (index % cols) * FLOOR_W, (index // cols) * FLOOR_H
    return sheet.crop((x, y, x + FLOOR_W, y + FLOOR_H))


def block_cell(sheet: Image.Image, cell: list[int], top: int, bottom: int) -> Image.Image:
    row, col = cell
    x, y = col * BLOCK_CELL, row * BLOCK_CELL
    return sheet.crop((x, y + top, x + BLOCK_CELL, y + bottom))


def strip(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.alpha_composite(f, (i * w, 0))
    return out


def build_tiles(game_dir: Path, manifest: dict) -> None:
    spec = json.loads((game_dir / "art" / "tiles.json").read_text())
    g = spec["grade"]
    floors: list[Image.Image] = []
    blocks: list[Image.Image] = []
    terrain_art: dict = {}
    for terrain, t in spec["terrain"].items():
        entry: dict = {"tileset": "floors", "side": manifest["terrain"].get(terrain, {}).get("side", "#333333")}
        if "floor" in t:
            sheet = load(t["floor"]["sheet"])
            entry["frames"] = []
            for f in t["floor"]["frames"]:
                entry["frames"].append(len(floors))
                floors.append(grade(floor_frame(sheet, f), g["saturation"], g["brightness"]))
        if "top" in t:
            sheet = load(t["top"]["sheet"])
            entry["frames"] = [len(floors)]
            floors.append(grade(block_cell(sheet, t["top"]["cell"], 0, FLOOR_H), g["saturation"], g["brightness"]))
        if "block" in t:
            sheet = load(t["block"]["sheet"])
            bg = t["block"].get("grade", g)
            entry["block"] = {"tileset": "blocks", "frame": len(blocks)}
            blocks.append(grade(block_cell(sheet, t["block"]["cell"], HALF_BLOCK_TOP, BLOCK_CELL), bg["saturation"], bg["brightness"]))
        terrain_art[terrain] = entry

    out = game_dir / "public" / "assets" / "tiles"
    out.mkdir(parents=True, exist_ok=True)
    strip(floors).save(out / "floors.png")
    strip(blocks).save(out / "blocks.png")
    manifest["tilesets"]["floors"] = {"url": "assets/tiles/floors.png", "frameWidth": FLOOR_W, "frameHeight": FLOOR_H}
    manifest["tilesets"]["blocks"] = {"url": "assets/tiles/blocks.png", "frameWidth": BLOCK_CELL, "frameHeight": BLOCK_CELL - HALF_BLOCK_TOP}
    manifest["terrain"] = terrain_art
    print(f"tiles: {len(floors)} floor frames, {len(blocks)} block frames")


def build_characters(game_dir: Path, manifest: dict) -> None:
    spec = json.loads((game_dir / "art" / "characters.json").read_text())
    g = spec["grade"]
    layers_dir = SRC / "spell-of-mastery" / "character-layers"
    out = game_dir / "public" / "assets" / "characters"
    out.mkdir(parents=True, exist_ok=True)
    for cid, c in spec["characters"].items():
        sheet = None
        for name in c["layers"]:
            layer = Image.open(layers_dir / f"{name}.png").convert("RGBA")
            if "teamColor" in c:
                layer = recolor_team(layer, c["teamColor"])
            sheet = layer if sheet is None else Image.alpha_composite(sheet, layer)
        sheet = grade(sheet, g["saturation"], g["brightness"])
        sheet.save(out / f"{cid}.png")
        # Feet = lowest opaque pixel of the first idle frame; the renderer anchors it on the tile centre.
        idle = sheet.crop((0, 0, FRAME, FRAME))
        feet = max(y for y in range(FRAME) for x in range(FRAME) if idle.getpixel((x, y))[3] > 0) + 1
        manifest["sprites"][cid] = {
            "kind": "character",
            "url": f"assets/characters/{cid}.png",
            "frameWidth": FRAME,
            "frameHeight": FRAME,
            "feetY": feet,
        }
        print(f"character {cid}: {len(c['layers'])} layers, feet at y={feet}")


def main() -> None:
    game = sys.argv[1] if len(sys.argv) > 1 else "intereses"
    game_dir = ROOT / "content" / game
    manifest_path = game_dir / "assets" / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    build_tiles(game_dir, manifest)
    build_characters(game_dir, manifest)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
