"""Behavior tests for safe Skill installation and target-host evidence routing."""
from pathlib import Path
from unittest import mock
import importlib.util
import json
import os
import shutil
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
import zipfile
import io

ROOT = Path(__file__).absolute().parent.parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load("random_math_installer", "install-skill.py")
router = load("random_math_router", "select-host-guidance.py")


class SkillToolTests(unittest.TestCase):
    def setUp(self):
        # Synthetic files only; never point tests at an existing Agent/project/user area.
        self.temporary = tempfile.TemporaryDirectory(prefix="random-math-skill-tests-", dir=ROOT / "_test")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.bundle = self.root / "bundle"
        self.source = self.bundle / installer.SKILL_RELATIVE
        self.source.mkdir(parents=True)
        self.home = self.root / "user"
        self.home.mkdir()
        self.skills = self.home / ".codex/skills"
        self.create_source()
        self.bundle.joinpath("extension.json").write_text(json.dumps({
            "id": "mixing-entropy.random-math", "version": "2.2.3"}), encoding="utf-8")
        self.bundle.joinpath("plugin-skill-manifest.json").write_bytes(installer.manifest_bytes(self.source, self.bundle))
        self.sdk = self.root / "sdk"
        self.sdk.mkdir()
        self.sdk.joinpath("constants.ts").write_text('export const SDK_VERSION = "1.21.0";\n', encoding="utf-8")

    def create_source(self):
        for name in installer.REQUIRED_FILES:
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("Fixture for " + name + "\n", encoding="utf-8")
        self.source.joinpath("SKILL.md").write_text(
            '---\nname: letsgal-plugin-random-math\ndescription: test fixture\nmetadata:\n'
            '  plugin_id: mixing-entropy.random-math\n  plugin_version: "2.2.3"\n---\nSynthetic plugin docs.\n',
            encoding="utf-8")

    def create_main(self, root=None):
        main = (root or self.skills) / "letsgal-authoring/SKILL.md"
        main.parent.mkdir(parents=True, exist_ok=True)
        main.write_text("---\nname: letsgal-authoring\n---\nUnmodified main Skill.\n", encoding="utf-8")
        return main

    def install(self, **kwargs):
        arguments = {"bundle_root": self.bundle, "skills_root": self.skills,
                     "user_root": self.home, "environment": {}}
        arguments.update(kwargs)
        return installer.install(**arguments)

    def route(self, **kwargs):
        arguments = {"skill_root": self.source, "host_version": "2.3.0-beta.1",
                     "channel": "beta", "sdk_root": self.sdk}
        arguments.update(kwargs)
        return router.route(**arguments)

    def project(self, body):
        project = self.root / "project"
        project.mkdir(exist_ok=True)
        project.joinpath("LETSGAL.md").write_text(body, encoding="utf-8")
        return project

    def make_link(self, link, target, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
            return
        except OSError:
            if os.name == "nt" and directory:
                result = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)],
                                        capture_output=True, text=True)
                if result.returncode == 0:
                    return
            self.skipTest("Platform does not allow this symlink/junction fixture")

    def test_preview_creates_nothing(self):
        main = self.create_main()
        original = main.read_bytes()
        result = self.install()
        self.assertEqual(result["status"], "PREVIEW")
        self.assertEqual(result["mode"], "under-main")
        self.assertFalse(Path(result["target"]).exists())
        self.assertFalse(self.home.joinpath(".letsgal-authoring").exists())
        self.assertEqual(main.read_bytes(), original)

    def test_main_skill_install_repeat_preserves_preferences_old_version_and_index(self):
        main = self.create_main()
        original = main.read_bytes()
        plugins = self.home / ".letsgal-authoring/plugins"
        old_version = plugins / "mixing-entropy.random-math/2.2.2/private-note.md"
        old_version.parent.mkdir(parents=True)
        old_version.write_bytes(b"keep old version")
        preferences = self.home / ".letsgal-authoring/preferences/user.md"
        preferences.parent.mkdir()
        preferences.write_bytes(b"keep preferences")
        index = plugins / "INDEX.md"
        prior_index = b"\xef\xbb\xbf# My index\r\nUser notes\r\n| other.plugin | 1 | other | custom |"
        index.write_bytes(prior_index)
        result = self.install(apply=True)
        self.assertEqual(result["status"], "INSTALLED")
        self.assertEqual(installer.file_hashes(Path(result["target"])), installer.file_hashes(self.source))
        self.assertTrue(index.read_bytes().startswith(prior_index))
        self.assertEqual(Path(result["index_backup"]).read_bytes(), prior_index)
        self.assertEqual(self.install(apply=True)["status"], "UNCHANGED")
        self.assertEqual(len(list(plugins.glob("INDEX.before-*.md"))), 1)
        self.assertEqual(old_version.read_bytes(), b"keep old version")
        self.assertEqual(preferences.read_bytes(), b"keep preferences")
        self.assertEqual(main.read_bytes(), original)

    def test_main_absent_installs_independent_skill(self):
        result = self.install(apply=True)
        self.assertEqual(result["mode"], "standalone")
        self.assertEqual(Path(result["target"]), self.skills / "letsgal-plugin-random-math")
        self.assertFalse(self.home.joinpath(".letsgal-authoring").exists())
        self.assertFalse(result["agent_discovery_verified"])

    def test_home_user_area_is_not_a_main_skill(self):
        self.home.joinpath(".letsgal-authoring/plugins").mkdir(parents=True)
        self.assertEqual(self.install()["mode"], "standalone")

    def test_existing_difference_or_unknown_file_is_never_overwritten(self):
        first = self.install(apply=True)
        destination = Path(first["target"])
        extra = destination / "personal-note.md"
        extra.write_bytes(b"my notes")
        before = installer.file_hashes(destination)
        with self.assertRaisesRegex(ValueError, "unknown files"):
            self.install(apply=True)
        self.assertEqual(installer.file_hashes(destination), before)
        extra.unlink()
        destination.joinpath("SKILL.md").write_bytes(b"private revision")
        with self.assertRaisesRegex(ValueError, "Existing Skill differs"):
            self.install(apply=True)
        self.assertEqual(destination.joinpath("SKILL.md").read_bytes(), b"private revision")

    def test_standalone_upgrade_refuses_to_replace_previous_version(self):
        first = self.install(apply=True)
        previous = installer.file_hashes(Path(first["target"]))
        body = self.source.joinpath("SKILL.md").read_text(encoding="utf-8").replace('"2.2.3"', '"2.2.4"')
        self.source.joinpath("SKILL.md").write_text(body, encoding="utf-8")
        self.bundle.joinpath("extension.json").write_text(json.dumps({"id": "mixing-entropy.random-math", "version": "2.2.4"}), encoding="utf-8")
        self.bundle.joinpath("plugin-skill-manifest.json").write_bytes(installer.manifest_bytes(self.source, self.bundle))
        with self.assertRaisesRegex(ValueError, "Existing Skill differs"):
            self.install(apply=True)
        self.assertEqual(installer.file_hashes(Path(first["target"])), previous)

    def test_incomplete_source_is_rejected_before_writing(self):
        self.source.joinpath("references/compatibility/beta.md").unlink()
        with self.assertRaisesRegex(ValueError, "Incomplete Skill"):
            self.install(apply=True)
        self.assertFalse(self.skills.exists())

    def test_identity_version_and_manifest_checksums_must_agree(self):
        self.bundle.joinpath("extension.json").write_text('{"id":"mixing-entropy.random-math","version":"2.2.2"}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "identity/version differ"):
            self.install()
        self.bundle.joinpath("extension.json").write_text('{"id":"mixing-entropy.random-math","version":"2.2.3"}', encoding="utf-8")
        manifest = installer.manifest_bytes(self.source, self.bundle)
        self.bundle.joinpath("plugin-skill-manifest.json").write_bytes(manifest)
        self.assertEqual(self.install()["status"], "PREVIEW")
        self.source.joinpath("references/AI-GUIDE.md").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "checksums"):
            self.install(apply=True)

    def test_invalid_metadata_and_traversal_are_rejected(self):
        for invalid in ("../escape", ".", "..", "CON", "mixing..entropy", "id/child", "id\\child", "id."):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    installer.identity(invalid)
        with self.assertRaisesRegex(ValueError, "traversal"):
            self.install(user_root=self.home / ".." / "escape", apply=True)
        body = self.source.joinpath("SKILL.md").read_text(encoding="utf-8")
        self.source.joinpath("SKILL.md").write_text(body.replace('  plugin_version: "2.2.3"', '  plugin_version: "2.2.3"\n  version: "2.2.2"'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.install()

    def test_package_manifest_traversal_is_rejected(self):
        manifest = json.loads(installer.manifest_bytes(self.source, self.bundle))
        manifest["skill_path"] = "../escape"
        self.bundle.joinpath("plugin-skill-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Unsafe Skill package manifest path"):
            self.install()

    def test_source_override_cannot_bypass_bundle_identity_or_checksums(self):
        override = self.root / "override"
        shutil.copytree(self.source, override)
        self.assertEqual(self.install(source=override)["status"], "PREVIEW")
        override.joinpath("references/AI-GUIDE.md").write_bytes(b"different same-version content")
        with self.assertRaisesRegex(ValueError, "checksums"):
            self.install(source=override, apply=True)
        shutil.rmtree(override)
        shutil.copytree(self.source, override)
        self.bundle.joinpath("plugin-skill-manifest.json").write_bytes(installer.manifest_bytes(self.source, self.bundle))
        self.assertEqual(self.install(source=override)["status"], "PREVIEW")
        override.joinpath("references/AI-GUIDE.md").write_bytes(b"different same-version content")
        with self.assertRaisesRegex(ValueError, "checksums"):
            self.install(source=override, apply=True)
        text = override.joinpath("SKILL.md").read_text(encoding="utf-8").replace('"2.2.3"', '"2.2.4"')
        override.joinpath("SKILL.md").write_text(text, encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "identity/version differ"):
            self.install(source=override, apply=True)
        self.assertFalse(self.skills.exists())

    def test_missing_manifest_cannot_disable_source_integrity_gate(self):
        override = self.root / "override"
        shutil.copytree(self.source, override)
        self.bundle.joinpath("plugin-skill-manifest.json").unlink()
        self.source.joinpath("references/AI-GUIDE.md").write_bytes(b"changed without complete-source manifest")
        for source in (None, override):
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, "manifest is missing"):
                    self.install(source=source, apply=True)
        self.assertFalse(self.skills.exists())

    def test_duplicate_metadata_is_rejected(self):
        body = self.source.joinpath("SKILL.md").read_text(encoding="utf-8")
        self.source.joinpath("SKILL.md").write_text(body.replace("  plugin_id:", "  plugin_id: mixing-entropy.random-math\n  plugin_id:"), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.install()

    def test_conflicting_index_entry_stops_before_install(self):
        self.create_main()
        index = self.home / ".letsgal-authoring/plugins/INDEX.md"
        index.parent.mkdir(parents=True)
        prior = b"| mixing-entropy.random-math | 2.2.3 | [wrong](somewhere/else.md) | user |\n"
        index.write_bytes(prior)
        with self.assertRaisesRegex(ValueError, "index entry conflicts"):
            self.install(apply=True)
        self.assertEqual(index.read_bytes(), prior)
        self.assertFalse(index.parent.joinpath("mixing-entropy.random-math").exists())

    def test_codex_claude_and_unknown_agent_detection(self):
        codex = installer.detect_skills_root(self.home, environment={"CODEX_HOME": str(self.home / ".codex")})
        self.assertEqual(codex[:2], (self.skills, "codex"))
        claude_root = self.home / ".claude/skills"
        claude = installer.detect_skills_root(self.home, environment={"CLAUDECODE": "1"})
        self.assertEqual(claude[:2], (claude_root, "claude"))
        with self.assertRaisesRegex(ValueError, "unknown/ambiguous"):
            installer.detect_skills_root(self.home, environment={})
        self.create_main(claude_root)
        self.assertEqual(installer.detect_skills_root(self.home, environment={})[1], "claude")
        self.create_main()
        with self.assertRaisesRegex(ValueError, "unknown/ambiguous"):
            installer.detect_skills_root(self.home, environment={})
        explicit = installer.detect_skills_root(self.home, explicit=self.root / "other-tool", environment={})
        self.assertEqual(explicit[1], "explicit")
        with self.assertRaisesRegex(ValueError, "Conflicting Agent"):
            installer.detect_skills_root(self.home, environment={"CLAUDECODE": "1", "CODEX_HOME": str(self.home / ".codex")})

    def test_codex_agents_directory_main_is_detected_and_ambiguous_main_is_rejected(self):
        modern = self.home / ".agents/skills"
        self.assertEqual(installer.detect_skills_root(self.home, agent="codex", environment={})[0], modern)
        self.create_main(modern)
        detected = installer.detect_skills_root(self.home, environment={})
        self.assertEqual(detected[:2], (modern, "codex"))
        detected = installer.detect_skills_root(self.home, environment={"CODEX_HOME": str(self.home / ".codex")})
        self.assertEqual(detected[0], modern)
        self.create_main()
        with self.assertRaisesRegex(ValueError, "Multiple Codex main Skills"):
            installer.detect_skills_root(self.home, agent="codex", environment={})

    def test_target_ancestor_link_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.make_link(self.home / ".codex", outside, directory=True)
        with self.assertRaisesRegex(ValueError, "Linked/reparse"):
            self.install(apply=True)
        self.assertEqual(list(outside.iterdir()), [])

    def test_source_link_is_rejected(self):
        file = self.source / "references/compatibility/beta.md"
        file.unlink()
        other = self.root / "external.md"
        other.write_bytes(b"external")
        self.make_link(file, other)
        with self.assertRaisesRegex(ValueError, "Linked/reparse"):
            self.install()

    def test_index_link_is_rejected(self):
        self.create_main()
        index = self.home / ".letsgal-authoring/plugins/INDEX.md"
        index.parent.mkdir(parents=True)
        external = self.root / "external-index.md"
        external.write_bytes(b"keep")
        self.make_link(index, external)
        with self.assertRaisesRegex(ValueError, "Linked/reparse"):
            self.install(apply=True)
        self.assertEqual(external.read_bytes(), b"keep")

    def test_installed_file_link_is_rejected(self):
        result = self.install(apply=True)
        destination = Path(result["target"])
        file = destination / "references/AI-GUIDE.md"
        file.unlink()
        external = self.root / "external-doc.md"
        external.write_bytes(b"keep")
        self.make_link(file, external)
        with self.assertRaisesRegex(ValueError, "Linked/reparse"):
            self.install(apply=True)

    def test_reparse_files_source_index_and_installed_are_rejected_with_mocked_attributes(self):
        # Windows file symlinks require a privilege unavailable in some installations.
        # Exercise their exact reparse attribute branch separately; this is not a real link test.
        self.create_main()
        first = self.install(apply=True)
        index = Path(first["index"])
        targets = (self.source / "references/AI-GUIDE.md", index,
                   Path(first["target"]) / "references/AI-GUIDE.md")
        original_lstat = Path.lstat
        for target in targets:
            before = target.read_bytes()
            with self.subTest(target=str(target)):
                def mocked_lstat(path, *args, **kwargs):
                    if path == target:
                        return SimpleNamespace(st_mode=stat.S_IFREG, st_file_attributes=0x400)
                    return original_lstat(path, *args, **kwargs)
                with mock.patch.object(Path, "lstat", mocked_lstat):
                    with self.assertRaisesRegex(ValueError, "Linked/reparse"):
                        self.install(apply=True)
                self.assertEqual(target.read_bytes(), before)

    def test_source_directory_junction_is_rejected(self):
        refs = self.source / "references"
        external = self.root / "external-references"
        refs.rename(external)
        self.make_link(refs, external, directory=True)
        with self.assertRaisesRegex(ValueError, "Linked/reparse"):
            self.install(apply=True)
        self.assertFalse(self.skills.exists())

    def test_archive_manifest_survives_extraction_with_exact_skill_bytes(self):
        # A manifest hashed before CRLF normalization must still verify the extracted kit.
        self.source.joinpath("references/AI-GUIDE.md").write_bytes(b"# Guide\r\nFixture\r\n")
        package = load("random_math_package", "package.py")
        package.ROOT = self.bundle
        manifest = installer.manifest_bytes(self.source, self.bundle)
        relative_files = [str(path.relative_to(self.bundle)).replace("\\", "/")
                          for path in self.source.rglob("*") if path.is_file()]
        data = package.archive(relative_files + ["extension.json"], {"plugin-skill-manifest.json": manifest})
        extracted = self.root / "extracted"
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            archive.extractall(extracted)
        source = extracted / installer.SKILL_RELATIVE
        found, hashes = installer.checked_source(source, extracted)
        self.assertEqual(found["version"], "2.2.3")
        self.assertEqual(hashes, installer.file_hashes(self.source))

    def test_routing_selects_only_target_channel_and_never_claims_runtime(self):
        for version, channel in (("2.3.0-beta.1", "beta"), ("2.0.0", "stable")):
            with self.subTest(channel=channel):
                result = self.route(host_version=version, channel=channel)
                self.assertEqual(result["route_status"], "ROUTED")
                self.assertEqual(result["host_version"], version)
                self.assertTrue(result["reference"].endswith(channel + ".md"))
                self.assertEqual(result["sdk"]["version"], "1.21.0")
                self.assertEqual(result["compatibility_validation"], "NOT_RUN")
                self.assertEqual(result["plugin"]["actual_enabled_version"], "UNKNOWN")

    def test_project_selection_routes_without_modifying_project(self):
        project = self.project('---\nletsgal_host_version: "2.0.0"\nletsgal_channel: stable\n'
                               f'letsgal_sdk_root: \'{self.sdk}\'\n---\nUser settings.\n')
        before = project.joinpath("LETSGAL.md").read_bytes()
        result = self.route(project=project, host_version=None, channel=None, sdk_root=None)
        self.assertEqual(result["channel"], "stable")
        self.assertEqual(result["route_status"], "ROUTED")
        self.assertEqual(project.joinpath("LETSGAL.md").read_bytes(), before)
        self.assertEqual(len(list(project.iterdir())), 1)

    def test_executable_full_beta_version_can_route_without_declared_channel(self):
        executable = self.root / "Studio.exe"
        executable.write_bytes(b"synthetic PE stand-in; reader mocked")
        reader = mock.Mock(return_value="2.3.0-beta.1")
        result = self.route(studio_exe=executable, host_version=None, channel=None, version_reader=reader)
        self.assertEqual(result["route_status"], "ROUTED")
        self.assertEqual(result["host_version"], "2.3.0-beta.1")
        reader.assert_called_once_with(executable)
        self.assertIn("FileVersion", result["host_sources"][0]["source"])

    def test_channel_and_host_version_conflicts_return_unknown(self):
        project = self.project('---\nletsgal_host_version: "2.0.0"\nletsgal_channel: stable\n---\n')
        cases = ({"project": project}, {"channel": "stable"}, {"host_version": "2.3.0-rc.1"},
                 {"host_version": "2.3"}, {"channel": None}, {"host_version": None})
        for args in cases:
            with self.subTest(args=args):
                result = self.route(**args)
                self.assertEqual(result["route_status"], "UNKNOWN")
                self.assertEqual(result["reference"], "UNKNOWN")
                self.assertIsNotNone(result["reason"])

    def test_unknown_or_conflicting_sdk_cannot_pass_routing(self):
        result = self.route(sdk_root=None)
        self.assertEqual(result["route_status"], "UNKNOWN")
        self.assertEqual(result["sdk"]["version"], "UNKNOWN")
        self.sdk.joinpath("package.json").write_text('{"version":"1.20.0"}', encoding="utf-8")
        self.assertIn("Conflicting SDK", self.route()["reason"])

    def test_route_missing_reference_and_project_traversal_return_unknown(self):
        self.source.joinpath("references/compatibility/beta.md").unlink()
        self.assertIn("reference is missing", self.route()["reason"])
        project = self.project('---\nletsgal_sdk_root: ../escape\n---\n')
        self.assertIn("traversal", self.route(project=project)["reason"])

    def test_explicit_samples_are_only_source_evidence(self):
        sample = self.root / "sample.json"
        sample.write_bytes(b"{invalid JSON is still merely source evidence")
        result = self.route(sample_file=[sample])
        self.assertEqual(result["route_status"], "ROUTED")
        self.assertEqual(len(result["samples"]), 1)
        self.assertIn("behavior/schema not verified", result["samples"][0]["validation"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
