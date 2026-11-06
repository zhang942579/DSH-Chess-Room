"""Synthetic geometry/records in memory and TemporaryDirectory ONLY.

These fixtures are NOT AI sources, generation evidence, user artwork, native
vision QA, or production artifacts. No network, image/API generation, runtime
or existing asset writes. Run with bundled Python -I -B.
"""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
from PIL import Image, ImageDraw, ImageFile

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "normalize-ai-refresh.py"
spec = importlib.util.spec_from_file_location("normalize_ai_refresh", SCRIPT)
normalizer = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = normalizer
spec.loader.exec_module(normalizer)


def encoded(image, format="PNG", **kwargs):
    buffer = io.BytesIO()
    image.save(buffer, format=format, **kwargs)
    return buffer.getvalue()


def synthetic_cell(index, background=(0, 255, 0), size=(64, 96)):
    # Simple uniquely colored geometric blocks, deliberately NOT whale artwork.
    image = Image.new("RGB", size, background)
    draw = ImageDraw.Draw(image)
    color = (40 + index, 70 + index % 10, 150 + index % 40)
    draw.rectangle((16, 14, 45, 80), fill=color)
    draw.rectangle((10, 44, 15, 56), fill=color)
    draw.rectangle((46, 46, 52, 60), fill=color)
    return image


class Fixture:
    def __init__(self, root):
        self.root = root.resolve()
        self.asset_root = self.root / "assets" / "actions-ai-v1"
        self.asset_root.mkdir(parents=True)
        self.raw = self.root / "assets" / "ai-refresh-20261105" / "raw"
        self.raw.mkdir(parents=True)
        self.plan_path = self.root / "refresh-plan.json"
        self.plan = {"format": normalizer.FORMAT, "tracks": {}}
        self.paths = []
        ordinal = 0
        for key, count, facing in (("idle", 6, "front"), ("walk-right", 4, "right")):
            sheets = []
            for n in range(count):
                image = Image.new("RGB", (256, 192), (0, 255, 0))
                for i in range(8):
                    row, col = divmod(i, 4)
                    image.paste(synthetic_cell(ordinal), (col * 64, row * 96))
                    ordinal += 1
                path = self.raw / f"synthetic-{key}-{n + 1:02d}.png"
                self.save_source(path, encoded(image))
                self.paths.append(path)
                sheets.append({"path": path.relative_to(self.root).as_posix(), "verified": True})
            self.plan["tracks"][key] = {"nativeFacing": facing, "sheets": sheets}
        self.save_plan()

    def save_source(self, path, data):
        assert normalizer.within(path.resolve(), self.root), "Fixture write must stay temporary"
        path.write_bytes(data)
        record = {"status": "generated", "modelRequested": "gpt-image-2",
            "imageSha256": hashlib.sha256(data).hexdigest(), "syntheticTestOnly": True,
            "prompt": "SYNTHETIC TEST FIXTURE; NOT AI GENERATION EVIDENCE",
            "apiRoute": "synthetic://not-an-api", "referenceHashes": {"synthetic-reference": "a" * 64}}
        path.with_suffix(".json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    def save_plan(self):
        self.plan_path.write_text(json.dumps(self.plan), encoding="utf-8")

    def delete_input(self, path):
        assert normalizer.within(path.resolve(), self.root), "Fixture deletion must stay temporary"
        path.unlink()

    def mutate_first_cell(self, image):
        path = self.paths[0]
        with Image.open(path) as source:
            sheet = source.convert("RGB")
        sheet.paste(image, (0, 0))
        self.save_source(path, encoded(sheet))

    def metadata_paths(self):
        return self.root / "fragment-new.json", self.root / "provenance-new.json"

    def fingerprint(self):
        return {path.relative_to(self.root).as_posix(): normalizer.sha256(path.read_bytes())
            for path in self.root.rglob("*") if path.is_file()}

    def prepare(self):
        return normalizer.prepare(self.plan_path, self.asset_root)


class NormalizerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-ai-normalizer-test-")
        self.addCleanup(self.temp.cleanup)
        self.fixture = Fixture(Path(self.temp.name))

    def assert_bad(self, pattern):
        with self.assertRaisesRegex(normalizer.RefreshError, pattern):
            self.fixture.prepare()

    def test_green_soft_matte_and_edge_despill_derive_only_from_source(self):
        cell = synthetic_cell(0)
        source = np.array(cell)
        source[20:75, 15] = (112, 255, 112)
        source[20:75, 14] = (20, 244, 18)  # JPEG-near-key green spill.
        rgba, box = normalizer.chroma_rgba(Image.fromarray(source))
        result = np.asarray(rgba)
        self.assertEqual(tuple(result[0, 0]), (0, 0, 0, 0))
        edge = (result[..., 3] > 0) & (result[..., 3] < 255)
        self.assertTrue(edge.any())
        self.assertTrue(np.all(result[..., 1][edge] <= np.maximum(result[..., 0][edge], result[..., 2][edge])))
        self.assertEqual(result[..., 3].max(), 255)
        self.assertEqual(tuple(result[40, 30, :3]), tuple(source[40, 30]))
        self.assertGreaterEqual(box[0], 2)

    def test_jpeg_spill_border_and_complete_decode(self):
        with Image.open(self.fixture.paths[0]) as source:
            image = source.convert("RGB")
        data = encoded(image, "JPEG", quality=90, subsampling=0)
        rgb = normalizer.decode_rgb(data, self.fixture.raw / "synthetic-jpeg.jpg")
        rgba, _ = normalizer.chroma_rgba(rgb.crop((0, 0, 64, 96)))
        self.assertEqual(rgba.mode, "RGBA")
        self.assertEqual(rgba.getchannel("A").getextrema(), (0, 255))

    def test_complete_fragment_is_80_unique_384px_8bit_rgba_and_unscaled_timing(self):
        before = self.fixture.fingerprint()
        result = self.fixture.prepare()
        self.assertEqual(len(result.pngs), 80)
        self.assertEqual(self.fixture.fingerprint(), before)
        all_hashes, pixel_hashes = set(), set()
        for key, count, total in (("idle", 48, 3510), ("walk-right", 32, 1600)):
            track = result.fragment["tracks"][key]
            self.assertEqual(len(track["frames"]), count)
            self.assertEqual(track["durationMs"], total)
            self.assertEqual(sum(track["durations"]), total)
            self.assertTrue(track["loop"])
            scales = {t["uniformTrackScale"] for t in result.provenance["tracks"][key]["transforms"]}
            self.assertEqual(len(scales), 1)
            for index, frame in enumerate(track["frames"]):
                self.assertEqual(frame["index"], index)
                self.assertEqual(frame["name"], f"{index + 1:02d}")
                self.assertEqual(frame["path"], frame["whitePath"])
                self.assertEqual(frame["path"], frame["blackPath"])
                self.assertIsNone(frame["stone"])
                self.assertFalse(frame["stoneRemoved"])
                data = result.pngs[frame["path"]]
                self.assertEqual(data[24:26], bytes((8, 6)))  # PNG IHDR bit depth / RGBA.
                self.assertEqual(normalizer.sha256(data), frame["sha256"])
                with Image.open(io.BytesIO(data)) as image:
                    image.load()
                    self.assertEqual(image.mode, "RGBA")
                    self.assertEqual(image.size, (384, 384))
                    self.assertEqual(image.getchannel("A").getextrema(), (0, 255))
                    self.assertEqual(image.getchannel("A").getbbox()[3], 368)
                    self.assertEqual(normalizer.sha256(image.tobytes()), frame["decodedRgbaSha256"])
                all_hashes.add(frame["sha256"])
                pixel_hashes.add(frame["decodedRgbaSha256"])
        self.assertEqual(len(all_hashes), 80)
        self.assertEqual(len(pixel_hashes), 80)
        self.assertEqual(result.fragment["tracks"]["idle"]["durations"][17:23], [25] * 6)
        self.assertEqual(result.fragment["tracks"]["idle"]["durations"][16], 80)
        self.assertEqual(result.fragment["tracks"]["idle"]["durations"][23], 80)
        self.assertTrue(result.provenance["notNativeTransparentAiOutput"])
        self.assertTrue(result.provenance["sourceClockUnscaled"])

    def test_original_record_prompt_route_reference_hashes_and_record_bytes_are_preserved(self):
        result = self.fixture.prepare()
        entry = result.provenance["sourceSheets"][0]
        record_path = self.fixture.paths[0].with_suffix(".json")
        self.assertEqual(entry["generationRecord"], json.loads(record_path.read_text(encoding="utf-8")))
        self.assertEqual(entry["generationRecordSha256"], normalizer.sha256(record_path.read_bytes()))
        self.assertEqual(entry["generationRecord"]["apiRoute"], "synthetic://not-an-api")
        self.assertIn("not reauthenticated", result.provenance["sourceModelClaim"])

    def test_missing_image(self):
        self.fixture.delete_input(self.fixture.paths[0])
        self.assert_bad("Missing regular input")

    def test_missing_generation_record(self):
        self.fixture.delete_input(self.fixture.paths[0].with_suffix(".json"))
        self.assert_bad("Missing regular input")

    def test_missing_plan(self):
        self.fixture.delete_input(self.fixture.plan_path)
        self.assert_bad("Missing regular input")

    def test_record_hash_mismatch(self):
        record = self.fixture.paths[0].with_suffix(".json")
        value = json.loads(record.read_text(encoding="utf-8"))
        value["imageSha256"] = "0" * 64
        record.write_text(json.dumps(value), encoding="utf-8")
        self.assert_bad("imageSha256 mismatches")

    def test_pending_wrong_model_missing_hash_records_are_rejected(self):
        record = self.fixture.paths[0].with_suffix(".json")
        original = json.loads(record.read_text(encoding="utf-8"))
        for changes in ({"status": "pending"}, {"modelRequested": "gpt-image-1.5"}, {"imageSha256": None}):
            with self.subTest(changes=changes):
                record.write_text(json.dumps({**original, **changes}), encoding="utf-8")
                self.assert_bad("Generation record")

    def test_invalid_record_json_and_nonfinite_json(self):
        record = self.fixture.paths[0].with_suffix(".json")
        for content in ("{", '{"status": NaN}', '{"latency": 1e400}', "[]"):
            with self.subTest(content=content):
                record.write_text(content, encoding="utf-8")
                self.assert_bad("JSON")

    def test_png_truncation_rejected_even_if_global_pillow_flag_was_enabled(self):
        path = self.fixture.paths[0]
        self.fixture.save_source(path, path.read_bytes()[:-20])
        old = ImageFile.LOAD_TRUNCATED_IMAGES
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        try:
            self.assert_bad("Malformed/truncated")
            self.assertTrue(ImageFile.LOAD_TRUNCATED_IMAGES)
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = old

    def test_truncated_jpeg_rejected(self):
        path = self.fixture.paths[0]
        with Image.open(path) as source:
            data = encoded(source.convert("RGB"), "JPEG", quality=90, subsampling=0)
        jpeg_path = path.with_suffix(".jpg")
        self.fixture.save_source(jpeg_path, data[:-100])
        self.fixture.plan["tracks"]["idle"]["sheets"][0]["path"] = jpeg_path.relative_to(self.fixture.root).as_posix()
        self.fixture.save_plan()
        self.assert_bad("Malformed/truncated")

    def test_canvas_dimensions_must_divide_four_and_two(self):
        for size in ((257, 192), (256, 193)):
            with self.subTest(size=size):
                self.fixture.save_source(self.fixture.paths[0], encoded(Image.new("RGB", size, (0, 255, 0))))
                self.assert_bad("not divisible")

    def test_canvas_dimensions_can_vary_without_per_frame_rescale(self):
        with Image.open(self.fixture.paths[1]) as source:
            original = source.convert("RGB")
        enlarged = Image.new("RGB", (320, 224), (0, 255, 0))
        for i in range(8):
            row, col = divmod(i, 4)
            enlarged.paste(original.crop((col * 64, row * 96, (col + 1) * 64, (row + 1) * 96)), (col * 80 + 8, row * 112 + 8))
        self.fixture.save_source(self.fixture.paths[1], encoded(enlarged))
        result = self.fixture.prepare()
        transforms = result.provenance["tracks"]["idle"]["transforms"]
        self.assertEqual(len({t["uniformTrackScale"] for t in transforms}), 1)

    def test_non_rgb_and_nonopaque_input_rejected(self):
        for image in (Image.new("L", (256, 192), 255), Image.new("RGBA", (256, 192), (0, 255, 0, 128))):
            with self.subTest(mode=image.mode):
                self.fixture.save_source(self.fixture.paths[0], encoded(image))
                self.assert_bad("Opaque|not opaque")

    def test_non_green_border_rejected(self):
        image = synthetic_cell(0)
        image.putpixel((0, 40), (255, 255, 255))
        self.fixture.mutate_first_cell(image)
        self.assert_bad("Non-green cell border")

    def test_clipped_silhouette_rejected_not_repaired(self):
        image = synthetic_cell(0)
        ImageDraw.Draw(image).rectangle((0, 30, 18, 65), fill=(40, 70, 150))
        self.fixture.mutate_first_cell(image)
        self.assert_bad("clipped silhouette")

    def test_blank_green_is_not_a_pose(self):
        self.fixture.mutate_first_cell(Image.new("RGB", (64, 96), (0, 255, 0)))
        self.assert_bad("Blank/no opaque")

    def test_exact_track_counts_and_facing_required(self):
        original = json.loads(json.dumps(self.fixture.plan))
        mutations = [("idle", "sheets", original["tracks"]["idle"]["sheets"][:-1]),
            ("walk-right", "sheets", original["tracks"]["walk-right"]["sheets"] + original["tracks"]["walk-right"]["sheets"][:1]),
            ("idle", "nativeFacing", "right"), ("idle", "frameCount", 49)]
        for key, field, value in mutations:
            with self.subTest(field=field):
                self.fixture.plan = json.loads(json.dumps(original))
                self.fixture.plan["tracks"][key][field] = value
                self.fixture.save_plan()
                self.assert_bad("exactly|nativeFacing|bounded frameCount")

    def test_wrong_format_and_extra_tracks_rejected(self):
        self.fixture.plan["format"] = "unverified-plan"
        self.fixture.save_plan()
        self.assert_bad("exact format")
        self.fixture.plan["format"] = normalizer.FORMAT
        self.fixture.plan["tracks"]["legacy-track"] = {}
        self.fixture.save_plan()
        self.assert_bad("ONLY idle")

    def test_per_sheet_verified_must_be_boolean_true_and_grid_fixed(self):
        sheet = self.fixture.plan["tracks"]["idle"]["sheets"][0]
        for gate in (False, 1, "true", None):
            with self.subTest(gate=gate):
                sheet["verified"] = gate
                self.fixture.save_plan()
                self.assert_bad("verified:true")
        sheet["verified"] = True
        sheet["columns"] = 3
        self.fixture.save_plan()
        self.assert_bad("exactly 4 columns")

    def test_path_traversal_absolute_windows_alias_and_wrong_raw_root_rejected(self):
        sheet = self.fixture.plan["tracks"]["idle"]["sheets"][0]
        for path in ("../outside.png", "assets/ai-refresh-20261105/raw/../bad.png", "C:/outside.png", "/outside.png", "assets\\ai-refresh-20261105\\raw\\image.png", "assets/actions-ai-v1/frames/01.png", "assets/ai-refresh-20261105/raw/sub/image.png"):
            with self.subTest(path=path):
                sheet["path"] = path
                self.fixture.save_plan()
                self.assert_bad("path|Source")

    def test_symlink_escape_is_rejected_when_os_supports_symlinks(self):
        outside = self.fixture.root / "outside.png"
        outside.write_bytes(self.fixture.paths[0].read_bytes())
        link = self.fixture.raw / "synthetic-link.png"
        try:
            os.symlink(outside, link)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"OS did not permit actual symlink fixture: {exc}")
        self.fixture.plan["tracks"]["idle"]["sheets"][0]["path"] = link.relative_to(self.fixture.root).as_posix()
        self.fixture.save_plan()
        self.assert_bad("Symlink/junction")

    def test_symlink_guard_branch_is_covered_without_windows_creation_privilege(self):
        target = self.fixture.paths[0]
        original = Path.is_symlink
        with mock.patch.object(Path, "is_symlink", lambda path: path == target or original(path)):
            self.assert_bad("Symlink/junction")

    def test_raw_root_junction_guard_is_checked_before_resolve(self):
        original = getattr(Path, "is_junction", lambda path: False)
        with mock.patch.object(Path, "is_junction", lambda path: path == self.fixture.raw or original(path), create=True):
            self.assert_bad("Symlink/junction")

    def test_generation_record_symlink_guard_branch(self):
        target = self.fixture.paths[0].with_suffix(".json")
        original = Path.is_symlink
        with mock.patch.object(Path, "is_symlink", lambda path: path == target or original(path)):
            self.assert_bad("Symlink/junction")

    def test_resource_byte_and_decoded_pixel_bounds_fail_closed(self):
        with mock.patch.object(normalizer, "MAX_RAW_BYTES", 1):
            self.assert_bad("bounded byte size")
        with mock.patch.object(normalizer, "MAX_IMAGE_PIXELS", 64):
            self.assert_bad("Unbounded/undersized")

    def test_prepared_destination_whitelist_is_checked_before_writes(self):
        result = self.fixture.prepare()
        result.pngs["../escaped.png"] = b"synthetic bad prepared path"
        fragment, provenance = self.fixture.metadata_paths()
        with self.assertRaisesRegex(normalizer.RefreshError, "48\\+32 whitelist"):
            normalizer.write_prepared(result, fragment, provenance)
        self.assertFalse((self.fixture.asset_root / "frames").exists())
        self.assertFalse(fragment.exists())

    def test_metadata_encoding_failure_is_checked_before_writes(self):
        result = self.fixture.prepare()
        result.provenance["syntheticBadNumber"] = float("nan")
        fragment, provenance = self.fixture.metadata_paths()
        with self.assertRaisesRegex(normalizer.RefreshError, "safely encoded before writes"):
            normalizer.write_prepared(result, fragment, provenance)
        self.assertFalse((self.fixture.asset_root / "frames").exists())
        self.assertFalse(fragment.exists())

    def test_repeated_source_sheet_paths_and_bytes_rejected(self):
        first, second = self.fixture.plan["tracks"]["idle"]["sheets"][:2]
        original = second["path"]
        second["path"] = first["path"]
        self.fixture.save_plan()
        self.assert_bad("Repeated source sheet path")
        second["path"] = original
        self.fixture.save_plan()
        self.fixture.save_source(self.fixture.paths[1], self.fixture.paths[0].read_bytes())
        self.assert_bad("Repeated raw sheet bytes")

    def test_repeated_decoded_source_pose_rejected(self):
        path = self.fixture.paths[0]
        with Image.open(path) as source:
            image = source.convert("RGB")
        image.paste(image.crop((0, 0, 64, 96)), (64, 0))
        self.fixture.save_source(path, encoded(image))
        self.assert_bad("Repeated decoded source cell/pose")

    def test_distinct_raw_pixels_but_repeated_normalized_pose_rejected(self):
        path = self.fixture.paths[0]
        with Image.open(path) as source:
            image = source.convert("RGB")
        image.paste(synthetic_cell(0, (8, 248, 9)), (64, 0))
        self.fixture.save_source(path, encoded(image))
        self.assert_bad("Repeated normalized RGBA pose")

    def test_default_cli_dry_run_writes_nothing(self):
        before = self.fixture.fingerprint()
        result = subprocess.run([sys.executable, "-I", "-B", str(SCRIPT), "--plan", str(self.fixture.plan_path), "--asset-root", str(self.fixture.asset_root)], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "dry-run-no-writes")
        self.assertEqual(report["framePngCount"], 80)
        self.assertFalse(report["nativeTransparentAiOutput"])
        self.assertEqual(self.fixture.fingerprint(), before)
        self.assertFalse((self.fixture.asset_root / "frames").exists())

    def test_metadata_flags_alone_do_not_enable_any_writes(self):
        fragment, provenance = self.fixture.metadata_paths()
        for flags in (["--fragment-out", str(fragment)], ["--write-frames"]):
            with self.subTest(flags=flags):
                result = subprocess.run([sys.executable, "-I", "-B", str(SCRIPT), "--plan", str(self.fixture.plan_path), "--asset-root", str(self.fixture.asset_root), *flags], capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(fragment.exists())
                self.assertFalse(provenance.exists())
                self.assertFalse((self.fixture.asset_root / "frames").exists())

    def test_explicit_write_creates_only_new_dirs_and_metadata_preserves_raw_and_legacy(self):
        old = self.fixture.asset_root / "frames" / "legacy"
        old.mkdir(parents=True)
        sentinel = old / "do-not-overwrite.png"
        sentinel.write_bytes(b"synthetic existing legacy sentinel")
        raw_before = {p: p.read_bytes() for p in self.fixture.raw.iterdir()}
        fragment, provenance = self.fixture.metadata_paths()
        result = self.fixture.prepare()
        normalizer.write_prepared(result, fragment, provenance)
        self.assertEqual(sentinel.read_bytes(), b"synthetic existing legacy sentinel")
        self.assertEqual({p: p.read_bytes() for p in self.fixture.raw.iterdir()}, raw_before)
        self.assertEqual(json.loads(fragment.read_text(encoding="utf-8")), result.fragment)
        self.assertEqual(json.loads(provenance.read_text(encoding="utf-8")), result.provenance)
        self.assertEqual(len(list((self.fixture.asset_root / "frames" / "idle-ai-v2").glob("*.png"))), 48)
        self.assertEqual(len(list((self.fixture.asset_root / "frames" / "walk-ai-v2").glob("*.png"))), 32)
        before = self.fixture.fingerprint()
        with self.assertRaisesRegex(normalizer.RefreshError, "NEW path"):
            normalizer.write_prepared(result, fragment, provenance)
        self.assertEqual(self.fixture.fingerprint(), before)

    def test_any_existing_frame_directory_even_empty_or_unknown_png_refuses_before_writes(self):
        result = self.fixture.prepare()
        target = self.fixture.asset_root / "frames" / "walk-ai-v2"
        target.mkdir(parents=True)
        fragment, provenance = self.fixture.metadata_paths()
        for contents in (False, True):
            with self.subTest(contents=contents):
                if contents:
                    (target / "unrelated.png").write_bytes(b"synthetic sentinel")
                before = self.fixture.fingerprint()
                with self.assertRaisesRegex(normalizer.RefreshError, "existing frame directory/PNG"):
                    normalizer.write_prepared(result, fragment, provenance)
                self.assertEqual(self.fixture.fingerprint(), before)
                self.assertFalse((self.fixture.asset_root / "frames" / "idle-ai-v2").exists())

    def test_existing_metadata_raw_manifest_origin_same_path_and_missing_parent_refused(self):
        result = self.fixture.prepare()
        fragment, provenance = self.fixture.metadata_paths()
        fragment.write_bytes(b"synthetic existing metadata")
        cases = [(fragment, provenance), (self.fixture.raw / "new-fragment.json", provenance),
            (self.fixture.root / "manifest.json", provenance), (self.fixture.root / "origin.json", provenance),
            (provenance, provenance), (self.fixture.root / "missing-parent" / "fragment.json", provenance)]
        for first, second in cases:
            with self.subTest(destination=str(first)):
                before = self.fixture.fingerprint()
                with self.assertRaises(normalizer.RefreshError):
                    normalizer.write_prepared(result, first, second)
                self.assertEqual(self.fixture.fingerprint(), before)
                self.assertFalse((self.fixture.asset_root / "frames").exists())

    def test_changed_inputs_after_prepare_refused_before_output(self):
        result = self.fixture.prepare()
        path = self.fixture.paths[0]
        path.write_bytes(path.read_bytes() + b"synthetic changed-input marker")
        fragment, provenance = self.fixture.metadata_paths()
        with self.assertRaisesRegex(normalizer.RefreshError, "Input changed"):
            normalizer.write_prepared(result, fragment, provenance)
        self.assertFalse((self.fixture.asset_root / "frames").exists())
        self.assertFalse(fragment.exists())

    def test_explicit_cli_write_has_no_extra_production_destinations(self):
        fragment, provenance = self.fixture.metadata_paths()
        result = subprocess.run([sys.executable, "-I", "-B", str(SCRIPT), "--plan", str(self.fixture.plan_path), "--asset-root", str(self.fixture.asset_root), "--write-frames", "--fragment-out", str(fragment), "--provenance-out", str(provenance)], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "written-new-files")
        self.assertTrue(fragment.exists())
        self.assertTrue(provenance.exists())
        self.assertFalse((self.fixture.asset_root / "manifest.json").exists())
        self.assertFalse((self.fixture.asset_root / "origin.json").exists())
        self.assertEqual(len(list(self.fixture.asset_root.rglob("*.png"))), 80)


if __name__ == "__main__":
    unittest.main(verbosity=2)
