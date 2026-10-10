"""Generate independent stable/beta payloads from maintained 3.0.1 documentation."""
from pathlib import Path
import hashlib
import json
import runpy

ROOT = Path(__file__).absolute().parent.parent
NAME = "letsgal-plugin-random-math"
REVISION = "3.0.1"
REFERENCES = ["AI-GUIDE.md", "AI-INTEGRATION.md", "MIGRATION-3.0.md", "CHOICE-UI-COMPATIBILITY.md",
              "VALIDATION-3.0.md", "LEGACY-2.2.3-AI-GUIDE.md", "examples-v3.json"]
IMAGES = ["PROVENANCE.md", "v3-choice-rc5-beta242-longtext.png", "v3-choice-rc2-official-branch.png",
          "v3-choice-rc2-custom-longtext.png"]


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def build(root=ROOT):
    root = Path(root)
    installer = runpy.run_path(str(root / "scripts/install-skill.py"))
    ext = json.loads((root / "extension.json").read_bytes())
    if ext["id"] != "mixing-entropy.random-math" or ext["version"] != "3.0.1":
        raise ValueError("This profile set describes the 3.0.1 release")
    top = {"schema_version": 2, "plugin_id": ext["id"], "version": ext["version"],
           "docs_revision": REVISION, "channels": {}, "legacy": []}
    for channel in ("stable", "beta"):
        skill = root / "channels" / channel / "skills" / NAME
        inputs = {"SKILL.md": root / "skill-profiles" / channel / "SKILL.md",
                  "references/compatibility/" + channel + ".md": root / "skill-profiles" / channel / "compatibility.md",
                  "scripts/select-host-guidance.py": root / "scripts/select-host-guidance.py"}
        inputs.update({"references/" + f: root / "docs" / f for f in REFERENCES})
        inputs.update({"references/images/" + f: root / "docs/images" / f for f in IMAGES})
        if channel == "beta":
            inputs["references/mcp-workflow.md"] = root / "skill-profiles/beta/mcp-workflow.md"
        if skill.exists() and set(installer["file_hashes"](skill)) - set(inputs):
            raise ValueError("Unexpected channel files; inspect before regenerating")
        for relative, original in inputs.items():
            target = installer["safe_path"](skill / relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(installer["safe_path"](original).read_bytes())
        manifest = {"schema_version": 1, "name": NAME, "plugin_id": ext["id"], "version": ext["version"],
                    "channel": channel, "docs_revision": REVISION,
                    "skill_path": skill.relative_to(root).as_posix(), "files": installer["file_hashes"](skill)}
        relative = "channels/" + channel + "/plugin-skill-manifest.json"
        raw = encoded(manifest)
        (root / relative).write_bytes(raw)
        top["channels"][channel] = {"manifest": relative, "sha256": hashlib.sha256(raw).hexdigest()}
    legacy = root / "skill-profiles/legacy-sdk1.json"
    top["legacy"].append({"manifest": legacy.relative_to(root).as_posix(),
                          "sha256": hashlib.sha256(legacy.read_bytes()).hexdigest()})
    (root / "plugin-skill-manifest.json").write_bytes(encoded(top))
    return top


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False, indent=2))
