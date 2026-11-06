"""Independent, offline pixel checks; never imports/executes the archive scripts."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1] / 'assets' / 'actions-ai-v1'
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
crop = (0, 97, 384, 481)
masters = variants = masks = changed = hidden_rgb_difference_frames = 0
for track, spec in manifest['tracks'].items():
    for f in spec['frames']:
        name = f['name']
        original = root / 'originals' / 'frames' / track / (name + '_' + str(f['duration']) + '.webp')
        backup = root / 'originals' / 'frames' / 'png' / track / (name + '.png')
        with Image.open(original) as opened:
            source = opened.convert('RGBA')
        source_pixels = np.asarray(source)
        with Image.open(backup) as opened:
            backup_pixels = np.asarray(opened.convert('RGBA')).copy()
        alpha = source_pixels[:, :, 3]
        assert np.array_equal(alpha, backup_pixels[:, :, 3]), str(backup)
        assert np.array_equal(source_pixels[alpha > 0, :3], backup_pixels[alpha > 0, :3]), str(backup)
        # WebP may discard RGB of alpha=0 pixels; do not claim RGBA identity.
        if not np.array_equal(source_pixels, backup_pixels):
            hidden_rgb_difference_frames += 1
        assert not np.any(alpha[:97]) and not np.any(alpha[481:]), str(original)
        expected = source.crop(crop)
        if track == 'take-stone':
            expected = ImageOps.mirror(expected)
        with Image.open(root / f['path']) as opened:
            assert opened.mode == 'RGBA' and opened.size == (384, 384)
            master = np.asarray(opened).copy()
        assert np.array_equal(master, np.asarray(expected)), f['path']
        masters += 1
        if f['stone'] is None:
            assert f['whitePath'] == f['blackPath'] == f['path']
            continue
        with Image.open(root / f['whitePath']) as opened:
            white = np.asarray(opened.convert('RGBA')).copy()
        with Image.open(root / f['blackPath']) as opened:
            black = np.asarray(opened.convert('RGBA')).copy()
        with Image.open(root / 'masks' / 'stone-interior' / track / (name + '.png')) as opened:
            assert opened.mode == 'L'
            mask = np.asarray(opened) > 0
        assert np.array_equal(master, white), f['whitePath']
        assert np.array_equal(white[:, :, 3], black[:, :, 3]), f['blackPath']
        assert np.array_equal(white[~mask], black[~mask]), f['blackPath']
        delta = np.any(white != black, axis=2)
        assert np.array_equal(delta, mask), f['blackPath']
        assert np.mean(black[mask, :3]) < 100, f['blackPath']
        if track == 'place-stone' and f['index'] >= 5:
            assert f['unusedAfterHandover'] is True and f['stoneRemoved'] is False
        variants += 2
        masks += 1
        changed += int(delta.sum())
assert (masters, variants, masks, changed) == (56, 48, 24, 4780)
print(json.dumps({'normalizedRgbaExactToWebp': masters, 'backupAlphaAndVisibleRgbExact': masters,
    'backupHiddenRgbDifferenceFrames': hidden_rgb_difference_frames, 'discardedPixelsAlphaZero': True, 'preparedVariantsChecked': variants,
    'whiteRgbaExact': 24, 'blackAlphaAndOutsideMaskRgbaExact': masks,
    'changedStoneInteriorPixels': changed, 'placeLateFramesPreservedNotErased': True}, indent=2))
