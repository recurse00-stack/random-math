"""Verify complete release archives, image bytes, installation manifests and preservation."""
from pathlib import Path
import hashlib, json, posixpath, re, runpy, tempfile, unittest, zipfile

ROOT = Path(__file__).absolute().parent.parent
package = runpy.run_path(str(ROOT / 'scripts/package.py'))
ai = runpy.run_path(str(ROOT / 'scripts/build-ai-kit.py'))
installer = runpy.run_path(str(ROOT / 'scripts/install-skill.py'))

class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='package-check-', dir=ROOT / '_test')
        cls.root = Path(cls.temp.name)
        cls.output = cls.root / 'packages'
        package['build'](cls.output)
        cls.ai_path = cls.output / 'ai-kit.zip'
        ai['build'](cls.ai_path)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_images_are_original_bytes_in_every_archive(self):
        for path in self.output.glob('*.zip'):
            with self.subTest(archive=path.name), zipfile.ZipFile(path) as z:
                images = [n for n in z.namelist() if n.endswith('.png')]
                self.assertGreaterEqual(len(images), 4)
                for name in images:
                    raw = z.read(name)
                    source = ('skills/letsgal-plugin-random-math/' + name.removeprefix('项目文件/docs/random-math/')) if name.startswith('项目文件/docs/random-math/') else name
                    self.assertEqual(raw, (ROOT / source).read_bytes(), name)
                    # Raw host captures can retain a .png filename with JPEG bytes.
                    # Preserve originals; the HTML generator detects MIME from bytes.
                    self.assertTrue(raw.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff')), name)

    def test_markdown_image_references_resolve_inside_archive(self):
        for path in self.output.glob('*.zip'):
            with self.subTest(archive=path.name), zipfile.ZipFile(path) as z:
                names = set(z.namelist())
                for name in names:
                    if name.endswith('.md'):
                        for link in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', z.read(name).decode('utf-8')):
                            self.assertNotIn('://', link)
                            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
                            self.assertIn(resolved, names, (name, link))

    def test_document_links_resolve_without_the_development_tree(self):
        for path in self.output.glob('*.zip'):
            with self.subTest(archive=path.name), zipfile.ZipFile(path) as z:
                names = set(z.namelist())
                for name in names:
                    if not name.endswith('.md'): continue
                    for link in re.findall(r'(?<!!)\[[^\]]*\]\(([^)\s]+)\)', z.read(name).decode('utf-8')):
                        if link.startswith(('http:', 'https:', '#', 'mailto:')): continue
                        target = posixpath.normpath(posixpath.join(posixpath.dirname(name), link.split('#')[0]))
                        self.assertIn(target, names, (name, link))

    def test_fallback_project_route_is_a_complete_skill(self):
        with zipfile.ZipFile(self.ai_path) as z:
            names = set(z.namelist())
            prefix = 'skills/letsgal-plugin-random-math/'
            for name in names:
                if name.startswith(prefix):
                    fallback = '项目文件/docs/random-math/' + name.removeprefix(prefix)
                    self.assertIn(fallback, names)
                    self.assertEqual(z.read(name), z.read(fallback))
            guide = z.read(prefix + 'references/AI-GUIDE.md').decode('utf-8')
            self.assertIn('已初始化池同样生效', guide)
            for rule in ['待合并规则/AGENTS.append.md', '待合并规则/CLAUDE.append.md', '待合并规则/random-math.mdc']:
                text = z.read(rule).decode('utf-8')
                self.assertIn('docs/random-math/SKILL.md', text)
                self.assertNotIn('已建池不随候选表或变量改变', text)

    def test_extracted_skill_matches_installer_manifest(self):
        for number, path in enumerate(self.output.glob('*.zip')):
            with self.subTest(archive=path.name), zipfile.ZipFile(path) as z:
                folder = self.root / ('extracted-' + str(number))
                for name in z.namelist():
                    self.assertFalse(name.startswith('/') or '..' in Path(name).parts)
                z.extractall(folder)
                identity, files = installer['checked_source'](folder / installer['SKILL_RELATIVE'], folder)
                self.assertEqual(identity['version'], package['VERSION'])
                self.assertEqual(len(files), len(package['SKILL_FILES']))
                self.assertIn('references/examples-v3.json', files)
                self.assertIn('references/images/v3-choice-rc5-beta242-longtext.png', files)
                self.assertEqual(files, json.loads(z.read('plugin-skill-manifest.json'))['files'])

    def test_reader_text_has_no_internal_coordination_notes(self):
        forbidden = re.compile(r"本轮|用户(?:确认|批准|授权|要求)|助手(?:已完成|未修改|负责)|按用户转述|你我|主模型|凭据|执行策略|安全策略|尚未公开(?:提交|发布)|门禁INCOMPLETE|私有验收|external_authorization|this task", re.I)
        for path in self.output.glob('*.zip'):
            with self.subTest(archive=path.name), zipfile.ZipFile(path) as z:
                for name in z.namelist():
                    if not name.endswith(('.md', '.html', '.mdc')): continue
                    raw = z.read(name).decode('utf-8-sig')
                    self.assertIsNone(forbidden.search(raw), name)

    def test_repeated_builds_refuse_to_replace_existing_bytes(self):
        hashes = lambda: {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.output.iterdir()}
        before = hashes()
        with self.assertRaises(FileExistsError):
            package['build'](self.output)
        with self.assertRaises(FileExistsError):
            ai['build'](self.ai_path)
        self.assertEqual(hashes(), before)

if __name__ == '__main__':
    unittest.main(verbosity=2)
