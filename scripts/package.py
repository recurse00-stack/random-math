"""Create deterministic, allowlisted release archives. Run after npm run build."""
from pathlib import Path
import hashlib
import json
import zipfile
import argparse
import io
import runpy

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'extension.json').read_text(encoding='utf-8'))['version']
SKILL_FILES = [
    'skills/letsgal-plugin-random-math/SKILL.md',
    'skills/letsgal-plugin-random-math/references/AI-GUIDE.md',
    'skills/letsgal-plugin-random-math/references/AI-INTEGRATION.md',
    'skills/letsgal-plugin-random-math/references/compatibility/stable.md',
    'skills/letsgal-plugin-random-math/references/compatibility/beta.md',
    'skills/letsgal-plugin-random-math/scripts/select-host-guidance.py',
]
AI_TOOLS = ['scripts/install-skill.py', 'scripts/select-host-guidance.py']
DOCS = SKILL_FILES + AI_TOOLS + ['docs/ai-integration/PLUGIN-INDEX.entry.md',
        'README.md', 'CHANGELOG.md', 'RELEASE-NOTES.md', 'LICENSE',
        'docs/USER-GUIDE.md', 'docs/creator-guide.html', 'docs/AI-GUIDE.md', 'docs/ai-guide.html',
        'docs/AI-INTEGRATION.md', 'docs/ai-integration/AGENTS.append.md', 'docs/ai-integration/CLAUDE.append.md', 'docs/ai-integration/random-math.mdc', 'docs/ai-integration/CHAT-START.md',
        'docs/images/variables.png', 'docs/images/new-variable.png',
        'docs/images/method-picker.png', 'docs/images/candidate-table.png', 'docs/MIGRATION-2.0.md', 'docs/DEVELOPMENT.md', 'docs/WORKSHOP.md', 'docs/VALIDATION-2.2.md', 'docs/VALIDATION-2.2.1.md', 'docs/VALIDATION-2.2.2.md', 'docs/VALIDATION-2.2.3.md']

def archive(paths, generated=None):
    generated = {} if generated is None else generated
    if set(paths) & set(generated):
        raise ValueError('Generated release file conflicts with the allowlist')
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for relative in sorted(paths):
            source = ROOT / relative
            if source.is_symlink() or not source.is_file():
                raise ValueError(f'Expected regular release file: {relative}')
            data = source.read_bytes()
            # Skill checksums describe exact source bytes; never normalize these files.
            if not relative.startswith('skills/') and (source.suffix in {'.json', '.js', '.mjs', '.md'} or relative == 'LICENSE'):
                data = data.replace(b'\r\n', b'\n')
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data)
        for relative, data in sorted(generated.items()):
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data)
    buffer.seek(0)
    with zipfile.ZipFile(buffer) as bundle:
        assert bundle.testzip() is None
        assert sorted(bundle.namelist()) == sorted([*paths, *generated])
    return buffer.getvalue()

def build(output):
    names = [f'random-math-v{VERSION}.zip', f'random-math-v{VERSION}-docs.zip']
    # Preflight every output, including checksums, before opening any file.
    for name in names + ['SHA256SUMS.txt']:
        target = output / name
        if target.exists() or target.is_symlink():
            raise FileExistsError(f'Refusing to overwrite {target}; use --output-dir with a fresh directory')
    for name in ['AI-GUIDE.md', 'AI-INTEGRATION.md']:
        canonical = (ROOT / 'docs' / name).read_bytes().replace(b'\r\n', b'\n')
        reference = (ROOT / 'skills/letsgal-plugin-random-math/references' / name).read_bytes().replace(b'\r\n', b'\n')
        if canonical != reference:
            raise ValueError(f'Stale Skill reference {name}; run scripts/build-creator-docs.py first')
    if (ROOT / 'dist/index.js').read_bytes() != (ROOT / 'dist/index.mjs').read_bytes():
        raise ValueError('Build entry files differ; run the complete build first')
    installer = runpy.run_path(str(ROOT / 'scripts/install-skill.py'))
    skill_manifest = installer['manifest_bytes'](ROOT / 'skills/letsgal-plugin-random-math', ROOT)
    expected = {path.removeprefix('skills/letsgal-plugin-random-math/') for path in SKILL_FILES}
    if set(json.loads(skill_manifest)['files']) != expected:
        raise ValueError('Skill tree differs from the public allowlist; review new/missing files before packaging')
    manifest = {'plugin-skill-manifest.json': skill_manifest}
    # Validate all inputs and assemble both archives before creating outputs.
    packages = dict(zip(names, [archive(DOCS + [
        'extension.json', 'dist/index.js', 'dist/index.mjs', 'dist/deck.js', 'assets/cover.png'], manifest),
        archive(DOCS + ['extension.json'], manifest)]))
    sums = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in packages.items())
    output.mkdir(parents=True, exist_ok=True)
    for name, data in {**packages, 'SHA256SUMS.txt': sums.encode('utf-8')}.items():
        with (output / name).open('xb') as stream:
            stream.write(data)
    print(f'Built {len(packages)} archives for v{VERSION}; SHA256SUMS.txt generated.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'release',
                        help='Output directory; existing archive/checksum files are never overwritten')
    build(parser.parse_args().output_dir)
