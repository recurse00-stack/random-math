"""Channel installation, update, preservation and recovery behavior on synthetic homes."""
from pathlib import Path
import importlib.util
import hashlib
import json
import runpy
import shutil
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).absolute().parent.parent
spec = importlib.util.spec_from_file_location("installer", ROOT / "scripts/install-skill.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
channels = runpy.run_path(str(ROOT / "scripts/skill-channels.py"))
globals_ = channels["install"].__globals__
paths = runpy.run_path(str(ROOT / "scripts/channel-package.py"))["channel_files"]()


class Channels(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "_test", prefix="channel-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / "bundle"
        for p in paths:
            dest = self.bundle / p
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes((ROOT / p).read_bytes())
        self.user = self.root / "user"
        self.user.mkdir()
        self.skills = self.user / ".codex/skills"
        self.api = vars(installer).copy()

    def main(self, channel=None):
        p = self.skills / "letsgal-authoring/SKILL.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("---\nname: letsgal-authoring\nmetadata:\n  channel: " + (channel or "beta") + "\n---\n", encoding="utf-8")
        return p

    def call(self, **kwargs):
        return channels["install"](self.api, self.bundle, skills_root=self.skills,
            user_root=self.user, environment={}, **{"channel": "beta", **kwargs})

    def apply(self, **kwargs):
        preview = self.call(**kwargs)
        return self.call(**kwargs, apply=True, plan=preview["plan_id"], update=preview["update_required"])

    def revise(self, channel="beta"):
        top_path = self.bundle / "plugin-skill-manifest.json"
        top = json.loads(top_path.read_bytes())
        rel = top["channels"][channel]["manifest"]
        manifest = json.loads((self.bundle / rel).read_bytes())
        skill = self.bundle / manifest["skill_path"]
        p = skill / "SKILL.md"
        p.write_text(p.read_text(encoding="utf-8").replace("mcp.1", "mcp.test"), encoding="utf-8")
        manifest["docs_revision"] = top["docs_revision"] = "mcp.test"
        manifest["files"] = installer.file_hashes(skill)
        raw = channels["encoded"](manifest)
        (self.bundle / rel).write_bytes(raw)
        top["channels"][channel]["sha256"] = hashlib.sha256(raw).hexdigest()
        top_path.write_bytes(channels["encoded"](top))

    def restore(self, installed):
        preview = channels["restore"](self.api, installed["backup"])
        return channels["restore"](self.api, installed["backup"], apply=True, plan=preview["plan_id"])

    def test_preview_no_writes_and_explicit_channel(self):
        before = installer.file_hashes(self.user)
        self.call()
        self.assertEqual(installer.file_hashes(self.user), before)
        with self.assertRaises(ValueError):
            self.call(channel=None)

    def test_first_install_main_repeat_and_index(self):
        main = self.main(); original = main.read_bytes()
        a = self.apply()
        self.assertEqual(a["mode"], "under-main")
        self.assertEqual(self.call(apply=True)["status"], "UNCHANGED")
        self.assertIn("skill-channel:beta;docs:mcp.1", Path(a["index"]).read_text())
        self.assertEqual(main.read_bytes(), original)

    def test_standalone_repeat_and_restore_fresh(self):
        a = self.apply()
        self.assertEqual(a["mode"], "standalone")
        self.assertEqual(self.call(apply=True)["status"], "UNCHANGED")
        self.assertEqual(self.restore(a)["status"], "RESTORED")
        self.assertFalse(Path(a["target"]).exists())

    def test_main_mismatch_and_host_conflict(self):
        self.main("stable")
        with self.assertRaisesRegex(ValueError, "Main Skill channel"):
            self.call()
        with self.assertRaisesRegex(ValueError, "conflicts"):
            self.call(host_version="2.5.0")
        self.assertEqual(self.call(channel=None, host_version="2.5.0")["channel"], "stable")

    def test_update_same_version_preserves_custom_files_and_restores(self):
        self.main(); first = self.apply()
        target = Path(first["target"])
        (target / "my-notes.txt").write_bytes(b"custom")
        before = installer.file_hashes(target)
        index_before = Path(first["index"]).read_bytes()
        self.revise()
        preview = self.call()
        with self.assertRaisesRegex(ValueError, "--update"):
            self.call(apply=True, plan=preview["plan_id"])
        second = self.apply()
        self.assertEqual(second["version"], "3.0.0")
        self.assertEqual(second["docs_revision"], "mcp.test")
        self.assertEqual((target / "my-notes.txt").read_bytes(), b"custom")
        self.restore(second)
        self.assertEqual(installer.file_hashes(target), before)
        self.assertEqual(Path(first["index"]).read_bytes(), index_before)

    def test_channel_switch_installs_only_selected_and_keeps_backup(self):
        first = self.apply()
        old = installer.file_hashes(Path(first["target"]))
        second = self.apply(channel="stable")
        target = Path(second["target"])
        self.assertFalse((target / "references/mcp-workflow.md").exists())
        self.assertFalse((target / "references/compatibility/beta.md").exists())
        self.assertTrue((target / "references/compatibility/stable.md").is_file())
        self.assertEqual(installer.file_hashes(Path(second["backup"]) / "previous"), old)

    def test_legacy_adoption_preserves_extra_file(self):
        self.main()
        target = self.user / ".letsgal-authoring/plugins/mixing-entropy.random-math/3.0.0"
        for name in installer.REQUIRED_FILES:
            p = target / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("Synthetic legacy reference", encoding="utf-8")
        (target / "SKILL.md").write_text('---\nname: letsgal-plugin-random-math\ndescription: fixture\nmetadata:\n  plugin_id: mixing-entropy.random-math\n  plugin_version: "3.0.0"\n  docs_revision: "sdk.1"\n---\n', encoding="utf-8")
        known = {"plugin_id": "mixing-entropy.random-math", "version": "3.0.0", "files": installer.file_hashes(target)}
        legacy = self.bundle / "skill-profiles/legacy-sdk1.json"
        legacy.write_bytes(channels["encoded"](known))
        top_path = self.bundle / "plugin-skill-manifest.json"
        top = json.loads(top_path.read_bytes())
        top["legacy"][0]["sha256"] = hashlib.sha256(legacy.read_bytes()).hexdigest()
        top_path.write_bytes(channels["encoded"](top))
        (target / "personal.txt").write_bytes(b"mine")
        p = self.call()
        self.assertEqual(p["previous"]["docs_revision"], "sdk.1")
        done = self.apply()
        self.assertEqual((target / "personal.txt").read_bytes(), b"mine")
        self.assertTrue((Path(done["backup"]) / "previous/references/compatibility/stable.md").exists())

    def test_edited_managed_file_stops_before_any_update(self):
        a = self.apply(); target = Path(a["target"])
        (target / "SKILL.md").write_text("personal edit", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "edited"):
            self.call()

    def test_unowned_new_file_collision_stops(self):
        a = self.apply(channel="stable"); target = Path(a["target"])
        (target / "references/mcp-workflow.md").write_bytes(b"mine")
        with self.assertRaisesRegex(ValueError, "unowned"):
            self.call()

    def test_stale_plan_after_extra_file_edit(self):
        a = self.apply(); self.revise(); p = self.call()
        (Path(a["target"]) / "new-note").write_bytes(b"new")
        with self.assertRaisesRegex(ValueError, "stale"):
            self.call(apply=True, update=True, plan=p["plan_id"])

    def test_stale_plan_after_index_edit(self):
        self.main(); a = self.apply(); self.revise(); p = self.call()
        index = Path(a["index"]); index.write_bytes(index.read_bytes() + b"\nnew user note\n")
        with self.assertRaisesRegex(ValueError, "stale"):
            self.call(apply=True, update=True, plan=p["plan_id"])

    def test_restore_refuses_later_edit_and_corrupt_backup(self):
        a = self.apply(); self.revise(); b = self.apply()
        target = Path(b["target"])
        (target / "new.txt").write_bytes(b"later")
        with self.assertRaisesRegex(ValueError, "changed"):
            self.restore(b)
        (target / "new.txt").unlink()
        (Path(b["backup"]) / "previous/SKILL.md").write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.restore(b)

    def test_index_failure_rolls_back_target_and_receipt(self):
        self.main(); a = self.apply(); self.revise()
        target = Path(a["target"]); before = installer.file_hashes(target)
        index = Path(a["index"]); original = index.read_bytes()
        real = globals_["atomic_file"]
        def failing(api, path, old, new):
            if path == index:
                raise OSError("simulated index write failure")
            return real(api, path, old, new)
        with mock.patch.dict(globals_, atomic_file=failing):
            with self.assertRaisesRegex(OSError, "simulated"):
                self.apply()
        self.assertEqual(installer.file_hashes(target), before)
        self.assertEqual(index.read_bytes(), original)

    def test_receipt_failure_rolls_back_index_too(self):
        self.main(); a = self.apply(); self.revise()
        target = Path(a["target"]); before = installer.file_hashes(target)
        index = Path(a["index"]); original = index.read_bytes()
        real = globals_["atomic_file"]
        def failing(api, path, old, new):
            if path.parent.name == "receipts":
                raise OSError("simulated receipt failure")
            return real(api, path, old, new)
        with mock.patch.dict(globals_, atomic_file=failing):
            with self.assertRaises(OSError): self.apply()
        self.assertEqual(installer.file_hashes(target), before)
        self.assertEqual(index.read_bytes(), original)

    def test_source_checksum_and_manifest_path_rejected(self):
        p = self.bundle / "channels/beta/skills/letsgal-plugin-random-math/SKILL.md"
        p.write_bytes(p.read_bytes() + b"change")
        with self.assertRaisesRegex(ValueError, "checksums"): self.call()
        top_path = self.bundle / "plugin-skill-manifest.json"
        top = json.loads(top_path.read_bytes()); top["channels"]["beta"]["manifest"] = "../outside.json"
        top_path.write_bytes(channels["encoded"](top))
        with self.assertRaisesRegex(ValueError, "Unsafe"): self.call()

    def test_staging_race_preserves_original(self):
        a = self.apply(); self.revise(); target = Path(a["target"])
        real = self.api["copy_exclusive"]
        def race(source, dest):
            real(source, dest)
            (source / "external-note").write_bytes(b"external")
        self.api["copy_exclusive"] = race
        with self.assertRaisesRegex(ValueError, "changed since preview"): self.apply()
        self.assertEqual((target / "external-note").read_bytes(), b"external")


if __name__ == "__main__":
    unittest.main(verbosity=2)
