"""Export existing user-derived expressions, NOT foreign art or dedicated action poses.
Uses the released dsh-pet v2 frames2d manifest shape (0.4.14 / 9ed843bc).
Hand coordinates belong exclusively to chess-role.json, never pet.json.
"""
from pathlib import Path
import hashlib, json
from PIL import Image, ImageSequence
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets' / 'expressions'
PACK = ROOT / 'assets' / 'stage' / 'whale-maid'
KEYS = ('idle', 'thinking', 'smug', 'surprised', 'troubled', 'victory', 'defeat')
RIGHT = (0.545, 0.676)
LEFT = (0.330, 0.682)

def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def track_palm(frame, template, anchor, radius=10):
    arr = np.asarray(frame.convert('RGBA')).astype(np.float32)
    x, y = round(anchor[0]*frame.width), round(anchor[1]*frame.height)
    best = (float('inf'), x, y)
    r = template.shape[0]//2
    # Small local RGB+alpha template search; this estimates breathing/sway offset,
    # not skeletal tracking or independent verification of a contact pose.
    for dy in range(-radius, radius+1):
        for dx in range(-radius, radius+1):
            patch = arr[y+dy-r:y+dy+r, x+dx-r:x+dx+r]
            if patch.shape != template.shape: continue
            score = float(np.mean((patch-template)**2))
            if score < best[0]: best = (score, x+dx, y+dy)
    return {'x': round(best[1]/frame.width, 6), 'y': round(best[2]/frame.height, 6), 'templateMse': round(best[0], 3)}

existing = json.loads((SOURCE/'manifest.json').read_text(encoding='utf-8'))
assert checksum(SOURCE/'source.png') == existing['source']['sha256']
reference = Image.open(SOURCE/'idle.webp').convert('RGBA')
ref = np.asarray(reference).astype(np.float32)
templates = {}
for name, anchor in [('right', RIGHT), ('left', LEFT)]:
    x,y = round(anchor[0]*reference.width),round(anchor[1]*reference.height)
    templates[name] = ref[y-10:y+10,x-10:x+10].copy()

manifest = {
    'petManifestVersion': 2, 'id': 'whale-maid-gomoku', 'displayName': '鲸语棋室 · 鲸娘',
    'license': 'LicenseRef-User-Provided-Local-Request', 'renderer': 'frames2d',
    'frames2d': {'dir': 'frames', 'defaultFrameMs': 100, 'tracks': {},
                 'phases': {'idle':'idle','waiting':'idle','thinking':'thinking','tool':'idle',
                            'review':'thinking','done':'victory','failed':'defeat'}}
}
role = {
    'format': 1, 'id': manifest['id'], 'petManifest': 'pet.json',
    'mode': 'mechanism-preview',
    'source': {'manifest': '../../expressions/manifest.json', 'sha256': existing['source']['sha256'],
               'rights': existing['source']['rights']},
    'canvas': {'width':384, 'height':384, 'feetY':0.956},
    'palms': {name:{'default':{'x':anchor[0],'y':anchor[1]}, 'frames':{}}
              for name,anchor in [('right',RIGHT),('left',LEFT)]},
    'palmEvidence': 'Manual source/448px expression inspection, mapped to the 384px canvas, then local template matching per frame. Approximate mechanism anchors; not dedicated limb poses.',
    'stoneDepth': 'behind-front-fingers',
    'dedicatedTracks': [],
    'missingActions': ['walk','take-stone','hold-stone','place-stone','pout-stomp','punch','arms-crossed'],
    'motions': {phase:{'track':track,'representation':'position-and-prop-composition'} for phase,track in {
        'idle':'idle','thinking':'thinking','pickup':'idle','carrying':'idle','placing':'idle','smug':'smug',
        'retreat':'idle','pout':'defeat','stomp':'defeat','run-avatar':'troubled','punch':'troubled',
        'arms-crossed':'defeat','invite':'smug','roaming':'idle','dragged':'surprised'}.items()},
    'invariants': {'hostCommitsFirst':True, 'clientNeverSubmitsFromAnimation':True,
                   'punchCount':3, 'bubbleMaxCharacters':60, 'stagePointerEvents':'none'}
}
files=[]
for key in KEYS:
    source = SOURCE/f'{key}.webp'
    im=Image.open(source)
    assert im.size == (384,384) and im.n_frames == 24
    directory=PACK/'frames'/key
    directory.mkdir(parents=True,exist_ok=True)
    names=[]; durations=[]
    palms={name:[] for name in templates}
    for i,frame in enumerate(ImageSequence.Iterator(im)):
        frame=frame.convert('RGBA')
        name=f'{i:03d}.png'
        out=directory/name
        frame.save(out,compress_level=6)
        assert frame.getextrema()[3][0] == 0
        names.append(name);durations.append(int(frame.info.get('duration',100)))
        for palm, anchor in [('right',RIGHT),('left',LEFT)]:
            palms[palm].append(track_palm(frame,templates[palm],anchor))
        files.append({'path':out.relative_to(PACK).as_posix(),'sha256':checksum(out),'bytes':out.stat().st_size})
    manifest['frames2d']['tracks'][key]={'frames':names,'frameMs':durations,'loop':True}
    for palm in palms: role['palms'][palm]['frames'][key]=palms[palm]
for name,data in [('pet.json',manifest),('chess-role.json',role),('integrity.json',{'format':1,'sourceSha256':existing['source']['sha256'],'frameCount':len(files),'files':files})]:
    (PACK/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pack':str(PACK),'tracks':len(KEYS),'frames':len(files),'bytes':sum(f['bytes'] for f in files),'dedicatedActions':False},ensure_ascii=False))
