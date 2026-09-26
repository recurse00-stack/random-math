"""Build a separate, portable creator-AI kit. Does not install project rules."""
from pathlib import Path
import argparse
import zipfile

ROOT = Path(__file__).resolve().parent.parent

def build(target):
    # References are generated from the maintained docs. Do not ship stale copies.
    for name in ['AI-GUIDE.md', 'AI-INTEGRATION.md']:
        canonical = (ROOT / 'docs' / name).read_bytes().replace(b'\r\n', b'\n')
        reference = (ROOT / 'skills/letsgal-plugin-random-math/references' / name).read_bytes().replace(b'\r\n', b'\n')
        if canonical != reference:
            raise ValueError(f'Stale Skill reference {name}; run scripts/build-creator-docs.py first')
    files = {
        '开始使用.md': 'docs/AI-INTEGRATION.md',
        '统一管理索引条目.md': 'docs/ai-integration/PLUGIN-INDEX.entry.md',
        'Skill/letsgal-plugin-random-math/SKILL.md': 'skills/letsgal-plugin-random-math/SKILL.md',
        'Skill/letsgal-plugin-random-math/references/AI-GUIDE.md': 'skills/letsgal-plugin-random-math/references/AI-GUIDE.md',
        'Skill/letsgal-plugin-random-math/references/AI-INTEGRATION.md': 'skills/letsgal-plugin-random-math/references/AI-INTEGRATION.md',
        '项目文件/docs/random-math/AI-GUIDE.md': 'docs/AI-GUIDE.md',
        '项目文件/docs/random-math/AI-INTEGRATION.md': 'docs/AI-INTEGRATION.md',
        '待合并规则/AGENTS.append.md': 'docs/ai-integration/AGENTS.append.md',
        '待合并规则/CLAUDE.append.md': 'docs/ai-integration/CLAUDE.append.md',
        '待合并规则/random-math.mdc': 'docs/ai-integration/random-math.mdc',
        '给聊天AI的开场说明.md': 'docs/ai-integration/CHAT-START.md',
    }
    data = {}
    for name, relative in files.items():
        source = ROOT / relative
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Expected regular file: {relative}')
        data[name] = source.read_bytes().replace(b'\r\n', b'\n')
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED) as bundle:
        for name in sorted(data):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data[name])
    with zipfile.ZipFile(target) as bundle:
        assert bundle.testzip() is None
        assert sorted(bundle.namelist()) == sorted(files)
    print(f'Built AI kit: {target}; no project rules installed.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='New ZIP path; existing files are never overwritten')
    build(parser.parse_args().output)
