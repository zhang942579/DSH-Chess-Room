#!/usr/bin/env python3
"""Offline, allowlisted import of the locally approved AI action artwork.

Run using bundled Python with -I -B. Never executes/archive-extracts source code,
loads companion .deps, or makes network/API calls. The 56 normalized master
PNGs preserve decoded RGBA exactly, apart from transparent-only crop and the
approved take-stone horizontal reflection. Prepared variants are opt-in.
"""
from __future__ import annotations

import argparse
from collections import deque
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

import numpy as np
from PIL import Image

ZIP_SHA256 = "1ea9bbbbeb8904606a58c05c2c3ef122a45582014bdacb00c1c91f0a1464c1a4"
DEFAULT_ZIP = Path("dsh-maid-seven-actions-v1.zip")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "actions-ai-v1"
PREFIX = "dsh-maid-actions/"
CROP = (0, 97, 384, 481)
TRACKS = ("walk-right", "take-stone", "hold-stone", "place-stone", "pout-stomp", "punch-small", "cross-arms")
# Source-space bounds and seeds are hand-measured from actual selected images.
# Half-open ROIs are intentionally local: never threshold the whole character.
STONE_ROIS = {
    "take-stone": [(295,444,325,462),(296,444,326,462),(290,438,319,457),(269,437,300,457),(269,302,299,325),(236,295,265,315),(207,317,237,341),(201,315,231,338)],
    "hold-stone": [(145,348,177,374),(147,348,178,374),(137,346,171,371),(146,346,177,372),(145,346,177,372),(146,347,179,373),(162,346,195,371),(146,347,179,373)],
    "place-stone": [(180,322,208,346),(214,366,242,389),(226,444,255,467),(218,447,250,469),(221,447,252,468),(219,446,250,471),(219,446,251,471),(219,446,251,471)],
}
STONE_SEEDS = {
    "take-stone": [(309,452),(310,452),(304,448),(283,447),(284,312),(250,305),(221,329),(215,327)],
    "hold-stone": [(161,359),(162,359),(153,357),(162,357),(161,357),(162,358),(178,357),(162,358)],
    "place-stone": [(194,332),(226,378),(240,455),(233,457),(235,457),(234,458),(234,458),(234,458)],
}
# Contact points are approximate visible finger/stone boundaries, not rig APIs.
CONTACTS = {
    "take-stone": [(241,355),(153,383),(190,406),(235,434),(282,322),(247,314),(216,341),(211,339)],
    "hold-stone": [(161,367),(162,367),(153,365),(162,365),(161,365),(162,366),(178,365),(162,366)],
    "place-stone": [(188,340),(221,372),(234,450),(229,452),(231,452),(200,359),(205,344),(201,340)],
}
NOTICE = """# Third-party and AI-artwork notice

These action images are AI-generated derivative artwork supplied by the user
for integration into this local dsh-chess-room project. The user explicitly
confirmed: “这些素材是我用AI生成的，可以使用”. This confirmation is not a blanket
commercial-use license and does not verify copyright ownership, redistribution
rights, model-provider terms, or the original character's rights.

The ZIP's reference image has identical decoded RGB pixels to the project's
existing character source. No upstream pet/plugin artwork was imported or
reused by this importer (zero upstream artwork reuse). This statement does not
claim the underlying character/reference is public-domain or independently
licensed. Original redistribution rights remain unverified; obtain appropriate
permission before publication, redistribution, or commercial exploitation.

The importer retains only selected frame image bytes and PNG backups as local
provenance. It does not import ZIP previews, HTML, scripts, dependencies, API
credentials, or generation jobs. Normalized masters are transparent-only crops;
take-stone alone is reflected to restore the reference bow/tail sides. Optional
prepared stone derivatives remain separate from untouched normalized masters.

Prepared white variants preserve all normalized source pixels. Prepared black
variants recolor only the measured, seed-connected cream-white stone interior
within each frame-specific ROI; all alpha and outside-mask RGBA remain exact.
Ground stones in place06-08 touch/occlude a shoe, so no stone/foot pixels were
erased, dilated, or inpainted. They are preserved for audit but marked unused
following handover. Runtime integration must stop the place clip at frame06
start (800ms), change to a clean-hand expression, and reveal the authoritative
board stone together to avoid duplicate visible stones. The frame05 fingertip
contact stone is retained. Anchors are approximate image measurements, not
internal rig, generation-service, or model API coordinates.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_write(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def bytes_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def normalize(image: Image.Image, track: str) -> Image.Image:
    assert image.mode == "RGBA" and image.size == (384, 512)
    alpha = np.asarray(image)[:, :, 3]
    assert not alpha[:97].any() and not alpha[481:].any(), "Crop would remove visible pixels"
    result = image.crop(CROP)
    if track == "take-stone":
        result = result.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    assert result.size == (384, 384)
    assert int(np.asarray(result)[:, :, 3].sum()) == int(alpha.sum())
    return result


def point_norm(point, track):
    x, y = point
    return [round(383 - x if track == "take-stone" else x, 2), round(y - 97, 2)]


def box_norm(box, track):
    l, t, r, b = box
    if track == "take-stone":
        l, r = 384 - r, 384 - l
    return [l, t - 97, r, b - 97]


def component(binary, seed):
    """8-connected local flood fill, returns only one bounded component."""
    h, w = binary.shape
    x, y = seed
    if not (0 <= x < w and 0 <= y < h and binary[y, x]):
        return np.zeros_like(binary)
    mask = np.zeros_like(binary)
    queue = deque([(x, y)])
    mask[y, x] = True
    while queue:
        x, y = queue.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and binary[ny, nx] and not mask[ny, nx]:
                    mask[ny, nx] = True
                    queue.append((nx, ny))
    return mask


def measure_stone(array, track, index):
    roi = STONE_ROIS[track][index]
    l, t, r, b = roi
    patch = array[t:b, l:r]
    rgb = patch[:, :, :3].astype(np.int16)
    # Cream-white Go stone interior; dark outline and pink fingers excluded.
    near_white = (patch[:, :, 3] > 0) & (rgb[:, :, 0] >= 215) & (rgb[:, :, 1] >= 210) & (rgb[:, :, 2] >= 210) & ((rgb.max(2) - rgb.min(2)) <= 43)
    sx, sy = STONE_SEEDS[track][index]
    mask_patch = component(near_white, (sx - l, sy - t))
    assert 20 <= int(mask_patch.sum()) <= 1000, (track, index, int(mask_patch.sum()))
    ys, xs = np.where(mask_patch)
    bbox = [int(xs.min()+l), int(ys.min()+t), int(xs.max()+l+1), int(ys.max()+t+1)]
    center = [float(xs.mean()+l), float(ys.mean()+t)]
    full = np.zeros(array.shape[:2], dtype=bool)
    full[t:b, l:r] = mask_patch
    return full, {"sourceRoi": list(roi), "sourceInteriorBbox": bbox, "sourceCenter": [round(v,2) for v in center], "normalizedCenter": point_norm(center, track), "normalizedInteriorBbox": box_norm(bbox, track), "interiorPixels": int(mask_patch.sum())}


def normalized_mask(source_mask, track):
    result = source_mask[97:481, :].copy()
    if track == "take-stone":
        result = result[:, ::-1].copy()
    return result


def prepare_variant(master, source_mask, track, number, measured):
    """Retain white master; recolor only measured connected stone interior."""
    base = np.asarray(master).copy()
    mask = normalized_mask(source_mask, track)
    mask_rel = f"masks/stone-interior/{track}/{number:02}.png"
    mask_path = OUT / mask_rel
    mask_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask.astype(np.uint8)*255, "L").save(mask_path)
    black = base.copy()
    luminance = base[:, :, :3].astype(np.float32).mean(2)
    gray = np.clip(18 + (luminance - 210) * 0.65, 18, 52).astype(np.uint8)
    black[mask, :3] = gray[mask, None]
    assert np.array_equal(black[:, :, 3], base[:, :, 3])
    assert np.array_equal(black[~mask], base[~mask]), "Recolor leaked beyond exact stone mask"
    paths = {}
    for color, pixels in (("white", base), ("black", black)):
        rel = f"prepared/{color}/{track}/{number:02}.png"
        target = OUT / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(pixels, "RGBA").save(target, compress_level=9)
        assert np.array_equal(np.asarray(Image.open(target)), pixels)
        paths[color] = rel
    measured.update({"interiorMaskPath": mask_rel, "recolorPixels": int(mask.sum()), "recolorAlphaPreserved": True, "recolorOutsideMaskUnchanged": True})
    return paths


def audit_zip(archive):
    entries = archive.infolist()
    assert len(entries) == 149
    names = []
    for item in entries:
        name = item.filename
        p = PurePosixPath(name)
        assert name.startswith(PREFIX) and "\\" not in name and not p.is_absolute() and ".." not in p.parts and ":" not in name
        assert not stat.S_ISLNK(item.external_attr >> 16)
        assert item.file_size <= 30_000_000 and not item.flag_bits & 1
        names.append(name)
    assert len(set(names)) == len(names)
    assert archive.testzip() is None
    return len(entries)


def run(args):
    zip_bytes = args.zip.read_bytes()
    assert sha(zip_bytes) == ZIP_SHA256, "Unexpected ZIP digest"
    source_reference = ROOT / "assets" / "expressions" / "source.png"
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        count = audit_zip(archive)
        source_manifest_bytes = archive.read(PREFIX + "chess-actions.json")
        source_manifest = json.loads(source_manifest_bytes)
        assert set(source_manifest["tracks"]) == set(TRACKS)
        reference_bytes = archive.read(PREFIX + "reference/dsh-reference.jpg")
        ref = Image.open(io.BytesIO(reference_bytes)).convert("RGB")
        original_ref = Image.open(source_reference).convert("RGB")
        assert ref.size == original_ref.size and np.array_equal(np.asarray(ref), np.asarray(original_ref))
        manifest = {"format": "dsh-chess-ai-actions-v1", "version": 1, "canvas": {"width":384,"height":384,"feetY":367}, "cell": {"width":384,"height":384}, "feetY":0.956,"feetPixelY":367,"normalization":{"sourceSize":[384,512],"crop":list(CROP),"scale":1,"resampling":False,"mirrorTracks":["take-stone"],"pixelCoordinateConvention":"zero-based pixels; bounding boxes half-open; x flip = 383-x", "transparentOnlyCrop":True}, "source":{"archiveName":args.zip.name,"archiveSha256":ZIP_SHA256,"manifestSha256":sha(source_manifest_bytes),"archiveEntries":count,"crcPassed":True},"tracks":{}}
        validation = {"frameCount":0,"trackCount":7,"cropDiscardedNontransparentPixels":0,"alphaSumPreserved":True,"normalizedPixelsExact":True,"distinctDecodedFramesPerTrack":{},"pngBackupAlphaExact":True,"frameMetrics":[]}
        anchor_manifest = {"format":"dsh-ai-stone-anchors-v1","measurement":"Actual selected frame visual ROIs plus local pixel-connected cream-white interior centroid; not generated rig/API anchors","coordinateSpace":"384x384 normalized zero-based pixels","accuracy":"Approximate contact points +/-3px, centroid measures visible interior not hidden full stone; local masks never threshold whole character","tracks":{}}
        for track in TRACKS:
            spec = source_manifest["tracks"][track]
            assert len(spec["frames"]) == len(spec["durations"]) == 8
            track_out = {"label":spec["label"],"loop":bool(spec["loop"]),"durations":spec["durations"],"durationMs":sum(spec["durations"]),"frames":[],"frameMetadata":[],"nativeFacing":"left" if track in ("walk-right","take-stone") else "front", "motionDirection":"right" if track in ("place-stone","punch-small") else ("left" if track in ("walk-right","take-stone") else "none"),"mirrored":track=="take-stone"}
            hashes = []
            if track in STONE_ROIS:
                anchor_manifest["tracks"][track] = []
            for index, (source_path, duration) in enumerate(zip(spec["frames"], spec["durations"])):
                number = index + 1
                assert re.fullmatch(r"frames/" + re.escape(track) + r"/[0-9]{2}_[0-9]+\.webp", source_path)
                assert int(Path(source_path).stem.split("_")[1]) == duration
                image_bytes = archive.read(PREFIX + source_path)
                image = Image.open(io.BytesIO(image_bytes)); image.load()
                assert image.mode == "RGBA" and image.size == (384,512)
                array = np.asarray(image)
                backup_path = f"frames/png/{track}/{number:02}.png"
                backup_bytes = archive.read(PREFIX + backup_path)
                backup = Image.open(io.BytesIO(backup_bytes)); backup.load()
                assert backup.mode == "RGBA" and backup.size == image.size
                assert np.array_equal(np.asarray(backup)[:,:,3],array[:,:,3])
                bytes_write(OUT / "originals" / source_path, image_bytes)
                bytes_write(OUT / "originals" / backup_path, backup_bytes)
                result = normalize(image,track)
                rel = f"frames/{track}/{number:02}.png"
                target = OUT / rel; target.parent.mkdir(parents=True,exist_ok=True)
                result.save(target,format="PNG",compress_level=9)
                saved = np.asarray(Image.open(target))
                assert np.array_equal(saved,np.asarray(result))
                bbox = image.getbbox()
                decoded_hash = sha(array.tobytes()); hashes.append(decoded_hash)
                metric = {"index":number,"file":rel,"sourceFile":source_path,"sourceSha256":sha(image_bytes),"sourcePngSha256":sha(backup_bytes),"decodedRgbaSha256":decoded_hash,"normalizedSha256":sha(target.read_bytes()),"sourceAlphaBbox":list(bbox),"normalizedAlphaBbox":list(result.getbbox()),"durationMs":duration,"alphaSum":int(array[:,:,3].sum())}
                descriptor = {"index":index,"name":f"{number:02}","duration":duration,"path":rel,"whitePath":rel,"blackPath":rel,"stone":None,"stoneRemoved":False}
                track_out["frameMetadata"].append(metric)
                validation["frameMetrics"].append({"track":track,"index":number,"sourceAlphaBbox":list(bbox),"normalizedAlphaBbox":list(result.getbbox()),"alphaSum":metric["alphaSum"]})
                validation["frameCount"] += 1
                if track in STONE_ROIS:
                    mask, measured = measure_stone(array, track, index)
                    measured.update({"index":index,"name":f"{number:02}","frame":rel,"contact":point_norm(CONTACTS[track][index],track),"stoneState":"ground" if (track=="take-stone" and number<=4) or (track=="place-stone" and number>=5) else "hand", "sourceContact":list(CONTACTS[track][index]),"groundRemovalApplied":False,"releaseBoundary":track=="place-stone" and number==5})
                    x, y = measured["normalizedCenter"]
                    descriptor["stone"] = {"x":x,"y":y}
                    if args.prepare:
                        paths = prepare_variant(result,mask,track,number,measured)
                        descriptor["whitePath"] = paths["white"]
                        descriptor["blackPath"] = paths["black"]
                        metric["preparedWhiteSha256"] = sha((OUT / paths["white"]).read_bytes())
                        metric["preparedBlackSha256"] = sha((OUT / paths["black"]).read_bytes())
                        validation.setdefault("variantMetrics",[]).append({"track":track,"index":index,"maskPixels":measured["recolorPixels"],"whiteMasterExact":True,"blackAlphaExact":True,"outsideMaskExact":True})
                    if track=="place-stone" and number>=6:
                        descriptor["unusedAfterHandover"] = True
                        measured["removalDecision"] = "Preserved: stone touches/occludes shoe, unsafe to erase; runtime clip hands off at frame06 start and must not display source06-08 after handover"
                    anchor_manifest["tracks"][track].append(measured)
                track_out["frames"].append(descriptor)
            assert len(set(hashes)) == 8, "Selected frames not distinct"
            validation["distinctDecodedFramesPerTrack"][track] = len(set(hashes))
            manifest["tracks"][track] = track_out
        manifest["anchors"] = "anchors.json"
        manifest["preparedVariants"] = bool(args.prepare)
        manifest["handover"] = {"takePickupFrameIndex":4,"placeLastVisibleFrameIndex":4,"placeReleaseAtMs":800,"placeReleaseContact":anchor_manifest["tracks"]["place-stone"][4]["contact"],"placeGroundStoneRemoval":False,"placePostReleaseSourceFramesPreserved":True,"instruction":"Display place01-05 only; at source06 start (800ms) switch to clean-hand expression and clear authoritative-board visual mask together. Do not display source06-08 after handover."}
        validation["groundStonePixelsRemoved"] = 0
        validation["preparedVariantImageCount"] = 48 if args.prepare else 0
        validation["stoneMaskCount"] = 24 if args.prepare else 0
        validation["stoneMaskChangedPixelTotal"] = sum(v["maskPixels"] for v in validation.get("variantMetrics",[]))
        bounds = [v["sourceAlphaBbox"] for v in validation["frameMetrics"]]
        validation["globalSourceAlphaBbox"] = [min(v[0] for v in bounds),min(v[1] for v in bounds),max(v[2] for v in bounds),max(v[3] for v in bounds)]
        validation["placePostReleaseFramesPreserved"] = True
        validation["placeReleaseMs"] = 800
        manifest["notes"] = ["walk-right visibly faces screen left; do not infer facing from its name", "Only take-stone reflected; asymmetric bow/tail sides preserved in other tracks", "Normalized masters contain baked white stones; use separate prepared variants for board handoff", "feetPixelY 367 is stage registration baseline, not claim that every pose's shoe bottoms are equal"]
        origin = {"format":"dsh-ai-actions-origin-v1","userConfirmation":{"recordedAt":"2026-11-03T23:09:00+08:00","statement":"这些素材是我用AI生成的，可以使用","timestampMeaning":"Local integration record time, not independently verified message timestamp","scope":"Integration/use of provided AI-generated action assets in this local project only"},"archive":{"name":args.zip.name,"sha256":ZIP_SHA256,"entries":count,"crcPassed":True},"reference":{"decodedRgbMatchesExistingSource":True,"existingSource":"assets/expressions/source.png","sourceFileSha256":sha(source_reference.read_bytes()),"zipReferenceSha256":sha(reference_bytes)},"rights":{"aiGenerated":True,"originalRedistributionRights":"unverified","blanketCommercialAssertion":False,"upstreamArtworkReused":False,"upstreamArtworkReuseCount":0,"publicationRedistributionCommercialPermission":"not established by local integration confirmation"},"safety":{"importAllowlist":"56 selected RGBA WebPs and 56 PNG backups only","executedArchiveCode":False,"importedDependencies":False,"networkCalls":False},"derivatives":{"crop":list(CROP),"resampling":False,"mirrorTracks":["take-stone"],"normalizedMastersUnretouched":True,"preparedVariants":bool(args.prepare),"stoneRecolor":"black: only one seed-connected cream-white interior component inside individually measured perframe source ROI; outside-mask RGBA and all alpha exact","stoneRemovalApplied":False,"postReleaseDecision":"place06-08 shoe-contact stones preserved and marked unusedAfterHandover; parent runtime clip ends at place06 start (800ms)","rigOrGeneratedApiAnchorsUsed":False}}
        json_write(OUT / "manifest.json",manifest)
        json_write(OUT / "anchors.json",anchor_manifest)
        json_write(OUT / "origin.json",origin)
        json_write(OUT / "validation.json",validation)
        (OUT / "THIRD_PARTY_NOTICES.md").write_text(NOTICE,encoding="utf-8")
        print(json.dumps({"output":str(OUT),"frames":validation["frameCount"],"tracks":7,"archiveSha256":ZIP_SHA256,"crop":list(CROP),"cropInvariant":"PASS: discarded alpha=0, alpha sums exact, saved normalized RGBA exact","backupAlphaExact":True,"preparedVariants":bool(args.prepare),"preparedVariantImageCount":validation["preparedVariantImageCount"],"groundStonePixelsRemoved":0},indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip",type=Path,default=DEFAULT_ZIP)
    parser.add_argument("--prepare",action="store_true",help="Emit locally approved separate white/black stone variants using tightly bounded measured component masks; never removes stones or edits masters")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
