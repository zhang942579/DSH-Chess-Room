#!/usr/bin/env python3
"""Offline, fail-closed normalization of *reviewed* AI RGB green sprite sheets.

Plan: {"format":"dsh-whale-ai-refresh-plan-v1", "tracks": {
  "idle": {"nativeFacing":"front", "sheets":[{"path":
    "assets/ai-refresh-20261105/raw/idle-01.png", "verified":true}, ...6]},
  "walk-right": {"nativeFacing":"right", "sheets":[...4]}}}
Each sheet is 4 columns x 2 rows, read in row-major order. A same-stem JSON
record must say status=generated, modelRequested=gpt-image-2 and imageSha256.
The supplied verified=true gate is the caller's native-vision QA assertion:
all cells must retain head/hair/tail/two shoes, authored facing, non-green
clothes and clean green gutters. This script cannot certify anatomy or AI
origin. Records and their bytes are preserved, not edited or reauthenticated.

Default is DRY RUN: computation and a stdout summary only. --write-frames
requires two explicitly supplied NEW JSON destinations. Outputs never replace
raw inputs, manifest/origin, existing PNGs or existing output directories.
No network/API/image generation, rigging, pose synthesis, or timing scaling.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import platform
import re
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile, __version__ as PILLOW_VERSION

FORMAT = "dsh-whale-ai-refresh-plan-v1"
CANVAS = (384, 384)
FEET_Y = 367
PADDING = 12
GRID = (4, 2)
RAW_PREFIX = "assets/ai-refresh-20261105/raw"
TRACKS = {
    "idle": {"sheets": 6, "frames": 48, "nativeFacing": "front", "label": "独立 AI 待机", "directory": "idle-ai-v2"},
    "walk-right": {"sheets": 4, "frames": 32, "nativeFacing": "right", "label": "AI 向右走路", "directory": "walk-ai-v2"},
}
MAX_RAW_BYTES = 64 * 1024 * 1024
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000


class RefreshError(ValueError):
    """An input, provenance, QA, path or output policy failed closed."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def reject_links(path: Path) -> None:
    """Reject links/junctions in existing components, including chosen roots."""
    absolute = path.absolute()
    for component in (absolute, *absolute.parents):
        if component.is_symlink() or getattr(component, "is_junction", lambda: False)():
            raise RefreshError(f"Symlink/junction path is not allowed: {component}")


def within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def checked_file(path: Path, limit: int) -> bytes:
    reject_links(path)
    try:
        if not path.is_file():
            raise RefreshError(f"Missing regular input file: {path}")
        if path.stat().st_size > limit:
            raise RefreshError(f"Input exceeds bounded byte size: {path}")
        with path.open("rb") as handle:
            data = handle.read(limit + 1)
        if len(data) > limit:
            raise RefreshError(f"Input exceeds bounded byte size: {path}")
        return data
    except OSError as exc:
        raise RefreshError(f"Cannot read input {path}: {exc}") from exc


def read_json(path: Path) -> tuple[dict, bytes]:
    data = checked_file(path, MAX_JSON_BYTES)
    try:
        def bad_constant(value):
            raise ValueError(f"Nonfinite JSON value: {value}")
        def finite_float(value):
            number = float(value)
            if not math.isfinite(number):
                raise ValueError(f"Overflow/nonfinite JSON number: {value}")
            return number
        result = json.loads(data.decode("utf-8"), parse_constant=bad_constant, parse_float=finite_float)
    except (ValueError, UnicodeError) as exc:
        raise RefreshError(f"Invalid UTF-8 JSON: {path}: {exc}") from exc
    if not isinstance(result, dict):
        raise RefreshError(f"JSON object required: {path}")
    return result, data


def source_path(value: str, workspace: Path, raw_root: Path) -> Path:
    if not isinstance(value, str) or "\\" in value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise RefreshError("Sheet path must be a slash-separated workspace-relative string")
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts) or ":" in value or value.startswith("/"):
        raise RefreshError(f"Absolute, traversal or ambiguous sheet path rejected: {value!r}")
    if len(parts) != 4 or "/".join(parts[:3]) != RAW_PREFIX:
        raise RefreshError(f"Source must be directly under {RAW_PREFIX}: {value!r}")
    path = workspace.joinpath(*parts)
    reject_links(path)
    resolved = path.resolve()
    if not within(resolved, raw_root):
        raise RefreshError(f"Source escapes approved raw root: {value!r}")
    if resolved.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        raise RefreshError(f"Only JPEG/PNG raw sheets accepted: {value!r}")
    return resolved


def decode_rgb(data: bytes, path: Path) -> Image.Image:
    """Verify structure and fully decode; never opt into truncated images."""
    old_truncated = ImageFile.LOAD_TRUNCATED_IMAGES
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                if probe.format not in {"JPEG", "PNG"}:
                    raise RefreshError(f"Content is not JPEG/PNG: {path}")
                width, height = probe.size
                if width * height > MAX_IMAGE_PIXELS or width < 128 or height < 64:
                    raise RefreshError(f"Unbounded/undersized sheet canvas: {path}: {probe.size}")
                if width % GRID[0] or height % GRID[1]:
                    raise RefreshError(f"Sheet canvas is not divisible by 4 columns / 2 rows: {path}")
                if getattr(probe, "n_frames", 1) != 1:
                    raise RefreshError(f"Animated source is not a single sprite sheet: {path}")
                probe.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                if image.mode == "RGBA":
                    if image.getchannel("A").getextrema() != (255, 255):
                        raise RefreshError(f"Input is not opaque RGB green output: {path}")
                elif image.mode != "RGB":
                    raise RefreshError(f"Opaque RGB/RGBA source required, got {image.mode}: {path}")
                if image.getexif().get(274, 1) != 1:
                    raise RefreshError(f"EXIF rotation would change the declared grid: {path}")
                return image.convert("RGB")
    except RefreshError:
        raise
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise RefreshError(f"Malformed/truncated image: {path}: {exc}") from exc
    finally:
        ImageFile.LOAD_TRUNCATED_IMAGES = old_truncated


def chroma_rgba(cell: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Heuristic soft green key, edge unmix/despill; not native transparency.

    Raw (0,255,0) and JPEG-near-key pixels become transparent. Green excess
    12..210 supplies the soft transition. Edge RGB is un-mixed against that
    key and excess green capped to max(red,blue) only at partial alpha. All
    surviving content comes from this cell; no painting/anatomy repair.
    """
    rgb = np.asarray(cell.convert("RGB"), dtype=np.uint8)
    values = rgb.astype(np.float32)
    r, g, b = values[..., 0], values[..., 1], values[..., 2]
    excess = g - np.maximum(r, b)
    distance = np.max(np.abs(values - np.array([0, 255, 0], dtype=np.float32)), axis=2)
    near_key = (g >= 180) & (excess >= 150) & (distance <= 80)
    border = np.zeros(rgb.shape[:2], dtype=bool)
    border[:2, :] = border[-2:, :] = True
    border[:, :2] = border[:, -2:] = True
    if not np.all(near_key[border]):
        raise RefreshError("Non-green cell border or clipped silhouette: native-vision QA must reject sheet")
    alpha = 1 - np.clip((excess - 12) / (210 - 12), 0, 1)
    alpha[near_key] = 0
    alpha_bytes = np.rint(alpha * 255).astype(np.uint8)
    alpha_bytes[alpha_bytes < 8] = 0
    alpha = alpha_bytes.astype(np.float32) / 255
    if np.any(alpha_bytes[border]):
        raise RefreshError("Foreground matte reaches cell border: clipped silhouette")
    opaque = alpha_bytes == 255
    if not np.any(opaque):
        raise RefreshError("Blank/no opaque foreground cell after green matte")
    divisor = np.maximum(alpha[..., None], 1 / 255)
    key = np.array([0, 255, 0], dtype=np.float32)
    recovered = (values - (1 - alpha[..., None]) * key) / divisor
    recovered = np.clip(recovered, 0, 255)
    edge = (alpha_bytes > 0) & (alpha_bytes < 255)
    recovered[..., 1][edge] = np.minimum(recovered[..., 1][edge], np.maximum(recovered[..., 0][edge], recovered[..., 2][edge]))
    output = np.empty((*rgb.shape[:2], 4), dtype=np.uint8)
    output[..., :3] = np.rint(recovered).astype(np.uint8)
    output[..., 3] = alpha_bytes
    output[alpha_bytes == 0, :3] = 0
    rgba = Image.fromarray(output)
    box = rgba.getchannel("A").getbbox()
    if box is None or box[2] - box[0] < 8 or box[3] - box[1] < 8:
        raise RefreshError("Empty/undersized foreground silhouette")
    if box[0] < 2 or box[1] < 2 or box[2] > cell.width - 2 or box[3] > cell.height - 2:
        raise RefreshError("Foreground silhouette is clipped at a cell boundary")
    return rgba, box


@dataclass
class Cell:
    rgba: Image.Image
    box: tuple[int, int, int, int]
    source_sheet: str
    source_cell: dict
    raw_sha256: str
    record_path: str
    record_sha256: str


@dataclass
class PreparedRefresh:
    asset_root: Path
    raw_root: Path
    fragment: dict
    provenance: dict
    pngs: dict[str, bytes]
    input_hashes: dict[Path, str]


def normalized_canvas(cell: Cell, scale: float) -> tuple[Image.Image, dict]:
    crop = cell.rgba.crop(cell.box)
    dx = (CANVAS[0] - crop.width * scale) / 2
    dy = FEET_Y + 1 - crop.height * scale
    # The SAME isotropic factor is used for every cell in this track. Affine
    # resampling avoids independently rounded width/height scale factors.
    image = crop.convert("RGBa").transform(CANVAS, Image.Transform.AFFINE,
        (1 / scale, 0, -dx / scale, 0, 1 / scale, -dy / scale),
        resample=Image.Resampling.BICUBIC).convert("RGBA")
    box = image.getchannel("A").getbbox()
    if box is None:
        raise RefreshError("Normalization lost all foreground")
    correction = FEET_Y + 1 - box[3]
    if box[1] + correction < 0:
        raise RefreshError("Ground alignment would clip the head")
    grounded = Image.new("RGBA", CANVAS)
    grounded.alpha_composite(image, (0, correction))
    array = np.array(grounded, dtype=np.uint8)
    array[array[..., 3] == 0, :3] = 0
    result = Image.fromarray(array)
    final = result.getchannel("A").getbbox()
    if result.getchannel("A").getextrema() != (0, 255) or final is None:
        raise RefreshError("Normalized canvas must contain both transparent and fully opaque 8-bit alpha")
    if final[0] < 4 or final[1] < 4 or final[2] > CANVAS[0] - 4 or final[3] != FEET_Y + 1:
        raise RefreshError("Normalized foreground would be clipped or off declared ground baseline")
    return result, {"crop": list(cell.box), "uniformTrackScale": scale,
        "translation": [dx, dy], "groundCorrectionY": correction, "normalizedAlphaBounds": list(final)}


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def prepare(plan_path: Path, asset_root: Path) -> PreparedRefresh:
    reject_links(asset_root)
    asset_root = asset_root.resolve()
    if not asset_root.is_dir():
        raise RefreshError(f"Asset root must already be an approved directory: {asset_root}")
    workspace = asset_root.parent.parent
    raw_root = asset_root.parent / "ai-refresh-20261105" / "raw"
    reject_links(raw_root)
    raw_root = raw_root.resolve()
    plan, plan_data = read_json(plan_path)
    if plan.get("format") != FORMAT or not isinstance(plan.get("tracks"), dict) or set(plan["tracks"]) != set(TRACKS):
        raise RefreshError("Plan must use exact format and ONLY idle / walk-right tracks")
    source_paths, raw_hashes, decoded_hashes, normalized_hashes = set(), set(), set(), set()
    inputs = {plan_path.absolute(): sha256(plan_data)}
    records, track_provenance, fragment_tracks, pngs = [], {}, {}, {}
    for key, policy in TRACKS.items():
        spec = plan["tracks"][key]
        if not isinstance(spec, dict) or spec.get("nativeFacing") != policy["nativeFacing"]:
            raise RefreshError(f"Reviewed nativeFacing must be {policy['nativeFacing']} for {key}")
        sheets = spec.get("sheets")
        if not isinstance(sheets, list) or len(sheets) != policy["sheets"]:
            raise RefreshError(f"{key} requires exactly {policy['sheets']} sheets / {policy['frames']} unique frames")
        if spec.get("frameCount", policy["frames"]) != policy["frames"]:
            raise RefreshError(f"Wrong bounded frameCount for {key}")
        cells = []
        for sheet in sheets:
            if not isinstance(sheet, dict) or sheet.get("verified") is not True:
                raise RefreshError("Every sheet needs an explicit verified:true native-vision QA gate")
            if sheet.get("columns", 4) != 4 or sheet.get("rows", 2) != 2:
                raise RefreshError("Sheet layout must be exactly 4 columns x 2 rows")
            path = source_path(sheet.get("path"), workspace, raw_root)
            if path in source_paths:
                raise RefreshError("Repeated source sheet path")
            source_paths.add(path)
            data = checked_file(path, MAX_RAW_BYTES)
            raw_hash = sha256(data)
            if raw_hash in raw_hashes:
                raise RefreshError("Repeated raw sheet bytes")
            raw_hashes.add(raw_hash)
            record_path = path.with_suffix(".json")
            record, record_data = read_json(record_path)
            recorded_hash = record.get("imageSha256")
            if record.get("status") != "generated" or record.get("modelRequested") != "gpt-image-2":
                raise RefreshError(f"Generation record is not generated gpt-image-2: {record_path}")
            if not isinstance(recorded_hash, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", recorded_hash) or recorded_hash.lower() != raw_hash:
                raise RefreshError(f"Generation record imageSha256 mismatches exact raw bytes: {record_path}")
            image = decode_rgb(data, path)
            if (image.format or "") not in {"", "PNG", "JPEG"}:
                raise RefreshError("Unexpected decoded source format")
            if len(cells) + 8 > policy["frames"]:
                raise RefreshError("Unbounded source frame count")
            inputs[path], inputs[record_path] = raw_hash, sha256(record_data)
            record_relative = record_path.relative_to(workspace).as_posix()
            records.append({"sourceSheet": sheet["path"], "rawSha256": raw_hash,
                "generationRecordPath": record_relative, "generationRecordSha256": sha256(record_data),
                "generationRecord": record, "verified": True, "canvas": [image.width, image.height],
                "grid": {"columns": 4, "rows": 2}, "rowMajor": True})
            width, height = image.width // 4, image.height // 2
            for cell_index in range(8):
                row, col = divmod(cell_index, 4)
                box = (col * width, row * height, (col + 1) * width, (row + 1) * height)
                raw_cell = image.crop(box)
                decoded_hash = sha256(raw_cell.convert("RGBA").tobytes())
                if decoded_hash in decoded_hashes:
                    raise RefreshError("Repeated decoded source cell/pose pixels")
                decoded_hashes.add(decoded_hash)
                rgba, foreground = chroma_rgba(raw_cell)
                cells.append(Cell(rgba, foreground, sheet["path"],
                    {"index": cell_index, "row": row, "col": col, "rectangle": [box[0], box[1], width, height],
                     "decodedRgbaSha256": decoded_hash}, raw_hash, record_relative, sha256(record_data)))
        if len(cells) != policy["frames"]:
            raise RefreshError(f"Expected exactly {policy['frames']} normalized frames for {key}")
        max_width = max(c.box[2] - c.box[0] for c in cells)
        max_height = max(c.box[3] - c.box[1] for c in cells)
        scale = min((CANVAS[0] - 2 * PADDING) / max_width, (FEET_Y + 1 - PADDING) / max_height)
        if not math.isfinite(scale) or scale <= 0:
            raise RefreshError("Invalid uniform track scale")
        durations = [25 if key == "idle" and 18 <= i + 1 <= 23 else 80 if key == "idle" else 50 for i in range(len(cells))]
        frames, transformations = [], []
        for index, cell in enumerate(cells):
            image, transformation = normalized_canvas(cell, scale)
            decoded_hash = sha256(image.tobytes())
            if decoded_hash in normalized_hashes:
                raise RefreshError("Repeated normalized RGBA pose pixels (even if raw files differ)")
            normalized_hashes.add(decoded_hash)
            data = png_bytes(image)
            name = f"{index + 1:02d}"
            relative = f"frames/{policy['directory']}/{name}.png"
            pngs[relative] = data
            frames.append({"index": index, "name": name, "duration": durations[index],
                "path": relative, "whitePath": relative, "blackPath": relative,
                "stone": None, "stoneRemoved": False, "sha256": sha256(data),
                "decodedRgbaSha256": decoded_hash, "sourceSheet": cell.source_sheet,
                "sourceCell": cell.source_cell, "rawSha256": cell.raw_sha256,
                "generationRecordPath": cell.record_path, "generationRecordSha256": cell.record_sha256})
            transformations.append({"index": index, **transformation})
        fragment_tracks[key] = {"label": policy["label"], "loop": True, "nativeFacing": policy["nativeFacing"],
            "durationMs": sum(durations), "durations": durations, "frames": frames}
        track_provenance[key] = {"frameCount": len(cells), "sourceCycleMs": sum(durations),
            "uniformTrackScale": scale, "transforms": transformations}
    provenance = {"format": "dsh-whale-ai-refresh-normalization-v1", "planFormat": FORMAT,
        "planSha256": sha256(plan_data), "sourceModelClaim": "gpt-image-2; original generation records retained, not reauthenticated",
        "nativeVisionQa": "Caller-supplied verified:true; semantic/anatomical inspection is NOT automated",
        "pipeline": ["opaque JPEG/PNG RGB flat-green source", "soft chroma matte and edge unmix/despill",
            "alpha-bounds crop", "one fixed isotropic affine rescale per track", "integer ground alignment to lowest alpha pixel"],
        "notNativeTransparentAiOutput": True, "pixelsInventedOrRigged": False,
        "sourceClockUnscaled": True, "greenKey": [0, 255, 0],
        "matte": {"greenExcessSoftRange": [12, 210], "nearKeyMaxRgbDistance": 80,
            "nearKeyMinGreen": 180, "nearKeyMinGreenExcess": 150, "alphaZeroBelow": 8,
            "edgeDespill": "cap recovered green to max(red,blue) only at partial alpha"},
        "canvas": {"width": 384, "height": 384, "feetY": FEET_Y},
        "groundAnchorAssumption": "Lowest foreground alpha is the shoe baseline only if native-vision QA confirms it; no anatomical anchor is inferred",
        "uniqueness": "Exact decoded source-cell RGBA and normalized RGBA bytes must all differ; not a semantic/perceptual AI-origin test",
        "libraries": {"python": platform.python_version(), "pillow": PILLOW_VERSION, "numpy": np.__version__},
        "sourceSheets": records, "tracks": track_provenance}
    fragment = {"format": "dsh-whale-ai-refresh-manifest-fragment-v1",
        "canvas": {"width": 384, "height": 384, "feetY": FEET_Y}, "tracks": fragment_tracks}
    return PreparedRefresh(asset_root, raw_root, fragment, provenance, pngs, inputs)


def new_json_destination(path: Path, raw_root: Path) -> Path:
    reject_links(path)
    resolved = path.resolve()
    if resolved.exists() or path.is_symlink():
        raise RefreshError(f"Output must be a NEW path, never overwrite: {path}")
    if not resolved.parent.is_dir() or resolved.suffix.lower() != ".json":
        raise RefreshError(f"Output needs an existing parent and .json filename: {path}")
    if within(resolved, raw_root) or resolved.name.lower() in {"manifest.json", "origin.json"}:
        raise RefreshError(f"Raw/manifest/origin output is forbidden: {path}")
    return resolved


def write_prepared(prepared: PreparedRefresh, fragment_out: Path, provenance_out: Path) -> None:
    """All validation/encoding happens first. Exclusive creates, no replacement.

    An OS failure/racing new destination can leave partial NEW output, never
    overwritten data. There is deliberately no automatic deletion/rollback.
    """
    reject_links(prepared.asset_root)
    fragment_out = new_json_destination(fragment_out, prepared.raw_root)
    provenance_out = new_json_destination(provenance_out, prepared.raw_root)
    if fragment_out == provenance_out:
        raise RefreshError("Fragment and provenance destinations must differ")
    directories = [prepared.asset_root / "frames" / item["directory"] for item in TRACKS.values()]
    for path in directories:
        reject_links(path)
        if path.exists():
            raise RefreshError(f"Refuse existing frame directory/PNG (requires NEW directories): {path}")
    if any(within(path, directory) for path in (fragment_out, provenance_out) for directory in directories):
        raise RefreshError("Metadata must not be placed inside frame output directories")
    expected_frames = {f"frames/{policy['directory']}/{index + 1:02d}.png"
        for policy in TRACKS.values() for index in range(policy["frames"])}
    if set(prepared.pngs) != expected_frames:
        raise RefreshError("Prepared frame destinations/count differ from the approved 48+32 whitelist")
    try:
        metadata = [(path, (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
            for path, value in ((fragment_out, prepared.fragment), (provenance_out, prepared.provenance))]
    except (TypeError, ValueError) as exc:
        raise RefreshError(f"Metadata cannot be safely encoded before writes: {exc}") from exc
    for path, expected in prepared.input_hashes.items():
        if sha256(checked_file(path, MAX_RAW_BYTES if path.suffix.lower() != ".json" else MAX_JSON_BYTES)) != expected:
            raise RefreshError(f"Input changed after validation; no output written: {path}")
    # Do not create/replace the asset root, any raw path, or unrelated parents.
    frames_parent = prepared.asset_root / "frames"
    reject_links(frames_parent)
    if not frames_parent.exists():
        frames_parent.mkdir()
    for directory in directories:
        directory.mkdir()  # exist_ok=False prevents overwrite/race acceptance.
    for relative, data in prepared.pngs.items():
        target = prepared.asset_root / relative
        if target.parent not in directories or target.suffix != ".png":
            raise RefreshError("Unexpected prepared destination")
        reject_links(target)
        if target.resolve().parent not in directories:
            raise RefreshError("Frame target changed/escaped after preflight")
        with target.open("xb") as handle:
            handle.write(data)
    for path, data in metadata:
        new_json_destination(path, prepared.raw_root)
        with path.open("xb") as handle:
            handle.write(data)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--asset-root", type=Path, default=Path(__file__).resolve().parents[1] / "assets" / "actions-ai-v1")
    parser.add_argument("--write-frames", action="store_true", help="Explicitly create only NEW approved frame directories")
    parser.add_argument("--fragment-out", type=Path, help="NEW .json destination, required only for explicit write")
    parser.add_argument("--provenance-out", type=Path, help="NEW .json destination, required only for explicit write")
    args = parser.parse_args(argv)
    try:
        if args.write_frames and (args.fragment_out is None or args.provenance_out is None):
            raise RefreshError("--write-frames requires --fragment-out and --provenance-out NEW paths")
        if not args.write_frames and (args.fragment_out is not None or args.provenance_out is not None):
            raise RefreshError("Metadata paths do not enable writes: add explicit --write-frames or omit them for dry run")
        prepared = prepare(args.plan, args.asset_root)
        if args.write_frames:
            write_prepared(prepared, args.fragment_out, args.provenance_out)
        print(json.dumps({"status": "written-new-files" if args.write_frames else "dry-run-no-writes",
            "format": FORMAT, "nativeTransparentAiOutput": False,
            "tracks": {key: {"frameCount": len(value["frames"]), "durationMs": value["durationMs"],
                "nativeFacing": value["nativeFacing"], "uniformTrackScale": prepared.provenance["tracks"][key]["uniformTrackScale"]}
                for key, value in prepared.fragment["tracks"].items()},
            "framePngCount": len(prepared.pngs)}, ensure_ascii=False, indent=2))
        return 0
    except (RefreshError, OSError) as exc:
        print(f"normalize-ai-refresh: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
