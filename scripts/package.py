"""Create deterministic, allowlisted release archives. Run after npm run build."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'extension.json').read_text(encoding='utf-8'))['version']
OUTPUT = ROOT / 'release'
OUTPUT.mkdir(exist_ok=True)
DOCS = ['README.md', 'CHANGELOG.md', 'RELEASE-NOTES.md', 'LICENSE',
        'docs/USER-GUIDE.md', 'docs/MIGRATION-2.0.md']

def archive(name, paths):
    target = OUTPUT / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for relative in sorted(paths):
            source = ROOT / relative
            if source.is_symlink() or not source.is_file():
                raise ValueError(f'Expected regular release file: {relative}')
            data = source.read_bytes()
            if source.suffix in {'.json', '.js', '.mjs', '.md'} or relative == 'LICENSE':
                data = data.replace(b'\r\n', b'\n')
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data)
    with zipfile.ZipFile(target) as bundle:
        assert bundle.testzip() is None
        assert sorted(bundle.namelist()) == sorted(paths)
    return target

packages = [
    archive(f'random-math-v{VERSION}.zip', DOCS + [
        'extension.json', 'dist/index.js', 'dist/index.mjs', 'assets/cover.png']),
    archive(f'random-math-v{VERSION}-docs.zip', DOCS),
]
(OUTPUT / 'SHA256SUMS.txt').write_text(''.join(
    f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in packages
), encoding='utf-8')
print(f'Built {len(packages)} archives for v{VERSION}; SHA256SUMS.txt generated.')
