"""Build a separate, portable creator-AI kit. Does not install project rules."""
from pathlib import Path
import argparse
import zipfile
import runpy
import json

ROOT = Path(__file__).resolve().parent.parent

def build(target):
    # References are generated from the maintained docs. Do not ship stale copies.
    for name in ['AI-GUIDE.md', 'AI-INTEGRATION.md']:
        canonical = (ROOT / 'docs' / name).read_bytes().replace(b'\r\n', b'\n')
        reference = (ROOT / 'skills/letsgal-plugin-random-math/references' / name).read_bytes().replace(b'\r\n', b'\n')
        if canonical != reference:
            raise ValueError(f'Stale Skill reference {name}; run scripts/build-creator-docs.py first')
    files = {
        'skills/letsgal-plugin-random-math/references/examples-v3.json': 'skills/letsgal-plugin-random-math/references/examples-v3.json',
        'docs/images/v3-choice-rc5-beta242-longtext.png': 'docs/images/v3-choice-rc5-beta242-longtext.png',
        'skills/letsgal-plugin-random-math/references/images/v3-choice-rc5-beta242-longtext.png': 'skills/letsgal-plugin-random-math/references/images/v3-choice-rc5-beta242-longtext.png',
        'docs/images/PROVENANCE.md': 'docs/images/PROVENANCE.md',
        'docs/images/v3-choice-rc2-custom-longtext.png': 'docs/images/v3-choice-rc2-custom-longtext.png',
        'docs/images/v3-choice-rc2-official-branch.png': 'docs/images/v3-choice-rc2-official-branch.png',
        'skills/letsgal-plugin-random-math/references/images/PROVENANCE.md': 'skills/letsgal-plugin-random-math/references/images/PROVENANCE.md',
        'skills/letsgal-plugin-random-math/references/images/v3-choice-rc2-custom-longtext.png': 'skills/letsgal-plugin-random-math/references/images/v3-choice-rc2-custom-longtext.png',
        'skills/letsgal-plugin-random-math/references/images/v3-choice-rc2-official-branch.png': 'skills/letsgal-plugin-random-math/references/images/v3-choice-rc2-official-branch.png',
        'docs/VALIDATION-3.0.md': 'docs/VALIDATION-3.0.md',
        'skills/letsgal-plugin-random-math/references/VALIDATION-3.0.md': 'skills/letsgal-plugin-random-math/references/VALIDATION-3.0.md',
        'docs/CHOICE-UI-COMPATIBILITY.md': 'docs/CHOICE-UI-COMPATIBILITY.md',
        'skills/letsgal-plugin-random-math/references/CHOICE-UI-COMPATIBILITY.md': 'skills/letsgal-plugin-random-math/references/CHOICE-UI-COMPATIBILITY.md',
        'scripts/migrate-project.py': 'scripts/migrate-project.py',
        'docs/MIGRATION-3.0.md': 'docs/MIGRATION-3.0.md',
        'docs/examples-v3.json': 'docs/examples-v3.json',
        'skills/letsgal-plugin-random-math/references/MIGRATION-3.0.md': 'skills/letsgal-plugin-random-math/references/MIGRATION-3.0.md',
        'skills/letsgal-plugin-random-math/references/LEGACY-2.2.3-AI-GUIDE.md': 'skills/letsgal-plugin-random-math/references/LEGACY-2.2.3-AI-GUIDE.md',
        '开始使用.md': 'docs/AI-INTEGRATION.md',
        '开始使用.html': 'docs/ai-install.html',
        '统一管理索引条目.md': 'docs/ai-integration/PLUGIN-INDEX.entry.md',
        'skills/letsgal-plugin-random-math/SKILL.md': 'skills/letsgal-plugin-random-math/SKILL.md',
        'skills/letsgal-plugin-random-math/references/AI-GUIDE.md': 'skills/letsgal-plugin-random-math/references/AI-GUIDE.md',
        'skills/letsgal-plugin-random-math/references/AI-INTEGRATION.md': 'skills/letsgal-plugin-random-math/references/AI-INTEGRATION.md',
        'skills/letsgal-plugin-random-math/references/compatibility/stable.md': 'skills/letsgal-plugin-random-math/references/compatibility/stable.md',
        'skills/letsgal-plugin-random-math/references/compatibility/beta.md': 'skills/letsgal-plugin-random-math/references/compatibility/beta.md',
        'skills/letsgal-plugin-random-math/scripts/select-host-guidance.py': 'skills/letsgal-plugin-random-math/scripts/select-host-guidance.py',
        'scripts/install-skill.py': 'scripts/install-skill.py',
        'scripts/select-host-guidance.py': 'scripts/select-host-guidance.py',
        'extension.json': 'extension.json',
        '待合并规则/AGENTS.append.md': 'docs/ai-integration/AGENTS.append.md',
        '待合并规则/CLAUDE.append.md': 'docs/ai-integration/CLAUDE.append.md',
        '待合并规则/random-math.mdc': 'docs/ai-integration/random-math.mdc',
        '给聊天AI的开场说明.md': 'docs/ai-integration/CHAT-START.md',
    }
    # The fallback project route must carry the whole Skill, not a guide without its references.
    files.update({
        '项目文件/docs/random-math/' + name.removeprefix('skills/letsgal-plugin-random-math/'): relative
        for name, relative in list(files.items()) if name.startswith('skills/letsgal-plugin-random-math/')
    })
    installer = runpy.run_path(str(ROOT / 'scripts/install-skill.py'))
    data = {'plugin-skill-manifest.json': installer['manifest_bytes'](ROOT / 'skills/letsgal-plugin-random-math', ROOT)}
    expected = {name.removeprefix('skills/letsgal-plugin-random-math/') for name in files if name.startswith('skills/')}
    if set(json.loads(data['plugin-skill-manifest.json'])['files']) != expected:
        raise ValueError('Skill tree differs from the AI kit allowlist; review new/missing files before packaging')
    for name, relative in files.items():
        source = ROOT / relative
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Expected regular file: {relative}')
        # Preserve Skill bytes so the bundled manifest also verifies after extraction.
        raw = source.read_bytes()
        # PNG signatures contain CRLF; normalize only known text outside the Skill.
        data[name] = raw.replace(b'\r\n', b'\n') if not name.startswith(('skills/', '项目文件/docs/random-math/')) and source.suffix in {'.md', '.json', '.py'} else raw
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED) as bundle:
        for name in sorted(data):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data[name])
    with zipfile.ZipFile(target) as bundle:
        assert bundle.testzip() is None
        assert sorted(bundle.namelist()) == sorted(data)
    print(f'Built AI kit: {target}; no project rules installed.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='New ZIP path; existing files are never overwritten')
    build(parser.parse_args().output)
