"""Package only the owned mechanism-preview frame pack; never overwrite a release."""
from pathlib import Path
import json, hashlib, re, zipfile
root = Path(__file__).resolve().parents[1]
pack = root / 'assets' / 'stage' / 'whale-maid'
out = root / 'deliverables' / 'stage' / 'whale-maid-mechanism-preview-1.1.0-preview.1.zip'
if out.exists():
    raise FileExistsError(out)
integrity = json.loads((pack / 'integrity.json').read_text(encoding='utf-8'))
files = ['pet.json', 'chess-role.json', 'integrity.json', 'THIRD_PARTY_NOTICES.md']
for entry in integrity['files']:
    name = entry['path']
    if not re.fullmatch(r'frames/[a-z][a-z-]*/[0-9]{3}\.png', name):
        raise ValueError('unsafe owned pack path')
    data = (pack / name).read_bytes()
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError('frame integrity failure: ' + name)
    files.append(name)
assert len(files) == 172 and len(set(files)) == 172
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in files:
        z.write(pack / name, 'whale-maid/' + name)
with zipfile.ZipFile(out) as z:
    assert len(z.infolist()) == 172 and z.testzip() is None
    assert json.loads(z.read('whale-maid/pet.json'))['renderer'] == 'frames2d'
print(json.dumps({'path': str(out), 'entries': 172, 'bytes': out.stat().st_size, 'crc': 'pass', 'sha256': hashlib.sha256(out.read_bytes()).hexdigest()}, ensure_ascii=False))
