"""Preview or install this package's AI Skill without replacing existing user files.

Python 3.9+, standard library only. No download, engine installation, or project edits.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import os
import re
import stat
import tempfile
import uuid

ROOT = Path(__file__).absolute().parent.parent
SKILL_RELATIVE = "skills/letsgal-plugin-random-math"
REQUIRED_FILES = (
    "SKILL.md", "references/AI-GUIDE.md", "references/AI-INTEGRATION.md",
    "references/compatibility/stable.md", "references/compatibility/beta.md",
    "scripts/select-host-guidance.py",
)
REPARSE_POINT = 0x400


def safe_path(value):
    """Reject traversal and every existing symlink/junction ancestor before use."""
    raw = os.fspath(value)
    if "\x00" in raw or ".." in re.split(r"[/\\]", raw):
        raise ValueError("Path traversal is not supported")
    path = Path(raw).expanduser().absolute()
    for part in (*reversed(path.parents), path):
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & REPARSE_POINT:
            raise ValueError(f"Linked/reparse path is not supported: {part}")
    return path


def identity(value, field="identity"):
    devices = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
               *(f"LPT{i}" for i in range(1, 10))}
    if (not isinstance(value, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", value)
            or ".." in value or value.endswith(".")
            or value.split(".")[0].upper() in devices):
        raise ValueError(f"Unsafe {field}")
    return value


def scalar(value):
    value = value.strip()
    if value.startswith('"'):
        try:
            result = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError("Invalid quoted frontmatter value") from error
        if not isinstance(result, str):
            raise ValueError("Expected string frontmatter value")
        return result
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            raise ValueError("Invalid quoted frontmatter value")
        return value[1:-1].replace("''", "'")
    if any(mark in value for mark in "#{}[]&*!|>"):
        raise ValueError("Unsupported frontmatter scalar; use a plain or quoted string")
    return value


def skill_identity(source):
    text = safe_path(source / "SKILL.md").read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    if not lines or lines[0] != "---" or "---" not in lines[1:]:
        raise ValueError("SKILL.md requires frontmatter")
    fields, metadata, section = {}, {}, None
    for line in lines[1:lines[1:].index("---") + 1]:
        if not line.strip():
            continue
        match = re.fullmatch(r"(\s*)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)", line)
        if not match:
            raise ValueError("Unsupported Skill frontmatter")
        indent, key, value = match.groups()
        if not indent:
            if key in fields:
                raise ValueError(f"Duplicate Skill frontmatter key: {key}")
            fields[key] = scalar(value) if value else ""
            section = key if not value else None
        elif section == "metadata":
            if key in metadata:
                raise ValueError(f"Duplicate Skill metadata key: {key}")
            metadata[key] = scalar(value)
        else:
            raise ValueError("Unsupported nested Skill frontmatter")
    name = identity(fields.get("name", ""), "Skill name")
    if not re.fullmatch(r"letsgal-plugin-[a-z0-9-]+", name):
        raise ValueError("Expected an independent letsgal-plugin-* Skill")
    plugin_id = identity(metadata.get("plugin_id", ""), "plugin ID")
    version = metadata.get("plugin_version", metadata.get("version", ""))
    version = identity(version, "plugin version")
    if "version" in metadata and metadata["version"] != version:
        raise ValueError("Conflicting plugin_version/version metadata")
    return {"name": name, "plugin_id": plugin_id, "version": version}


def file_hashes(root):
    root = safe_path(root)
    if not root.is_dir():
        raise ValueError(f"Expected Skill directory: {root}")
    result = {}
    for folder, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            item = safe_path(Path(folder) / name)
            if not item.is_dir():
                raise ValueError("Non-directory Skill content")
        for name in files:
            item = safe_path(Path(folder) / name)
            if not stat.S_ISREG(item.lstat().st_mode):
                raise ValueError("Non-regular Skill content")
            result[item.relative_to(root).as_posix()] = hashlib.sha256(item.read_bytes()).hexdigest()
    return result


def checked_source(source, bundle_root=None, allow_source_override=False, require_manifest=True):
    source = safe_path(source)
    found = skill_identity(source)
    hashes = file_hashes(source)
    missing = sorted(set(REQUIRED_FILES) - set(hashes))
    if missing:
        raise ValueError("Incomplete Skill source; missing " + ", ".join(missing))
    if bundle_root is not None:
        bundle_root = safe_path(bundle_root)
        extension = json.loads(safe_path(bundle_root / "extension.json").read_text(encoding="utf-8-sig"))
        if extension.get("id") != found["plugin_id"] or extension.get("version") != found["version"]:
            raise ValueError("extension.json and Skill identity/version differ")
        manifest_path = safe_path(bundle_root / "plugin-skill-manifest.json")
        if require_manifest and not manifest_path.is_file():
            raise ValueError("Skill package manifest is missing; use a complete extracted release package")
        if require_manifest:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
            if manifest.get("schema_version") != 1:
                raise ValueError("Unsupported Skill package manifest")
            relative = manifest.get("skill_path", "")
            parts = PurePosixPath(relative).parts if isinstance(relative, str) else ()
            if (not parts or ".." in parts or "." in parts or "\\" in relative
                    or PurePosixPath(relative).is_absolute() or ":" in relative):
                raise ValueError("Unsafe Skill package manifest path")
            if safe_path(bundle_root / relative) != source and not allow_source_override:
                raise ValueError("Skill source differs from package manifest")
            if any(manifest.get(k) != found[k] for k in ("name", "plugin_id", "version")):
                raise ValueError("Skill package manifest identity/version conflict")
            if manifest.get("files") != hashes:
                raise ValueError("Skill source is incomplete or differs from package checksums")
    return found, hashes


def manifest_bytes(source, bundle_root):
    """Used by both allowlisted release builders; hashes are exact packaged bytes."""
    source = safe_path(source)
    # Builders are the only unmanifested workflow. Public installation always requires
    # the generated manifest; deleting it cannot disable complete-source verification.
    found, hashes = checked_source(source, bundle_root, require_manifest=False)
    document = {"schema_version": 1, **found,
                "skill_path": source.relative_to(safe_path(bundle_root)).as_posix(), "files": hashes}
    return (json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def main_skill_present(skills_root):
    main = safe_path(skills_root / "letsgal-authoring" / "SKILL.md")
    if not main.is_file():
        return False
    text = main.read_text(encoding="utf-8-sig")
    front = text.split("---", 2)
    if len(front) != 3 or front[0].strip():
        raise ValueError("Invalid letsgal-authoring frontmatter; cannot safely decide installation mode")
    names = re.findall(r"^name:\s*(.*?)\s*$", front[1], re.M)
    if len(names) != 1 or scalar(names[0]) != "letsgal-authoring":
        raise ValueError("Expected letsgal-authoring identity in the detected main Skill")
    return True


def detect_skills_root(user_root, agent=None, explicit=None, environment=None):
    environment = os.environ if environment is None else environment
    if explicit is not None:
        return safe_path(explicit), agent or "explicit", "explicit --skills-root"
    if agent is None:
        codex = any(environment.get(k) for k in ("CODEX_HOME", "CODEX_THREAD_ID", "CODEX_CI"))
        claude = any(environment.get(k) for k in ("CLAUDE_CONFIG_DIR", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"))
        if codex and claude:
            raise ValueError("Conflicting Agent environment; specify --agent or --skills-root")
        agent = "codex" if codex else "claude" if claude else None
        if agent is None:
            candidates = []
            for name, root in (("codex", user_root / ".agents" / "skills"),
                               ("codex", user_root / ".codex" / "skills"),
                               ("claude", user_root / ".claude" / "skills")):
                if main_skill_present(safe_path(root)):
                    candidates.append((name, root))
            if len(candidates) != 1:
                raise ValueError("Current Agent is unknown/ambiguous; specify --agent or --skills-root")
            agent = candidates[0][0]
    if agent == "codex":
        configured = (safe_path(environment["CODEX_HOME"]) / "skills" if environment.get("CODEX_HOME") else None)
        choices = list(dict.fromkeys(root for root in (configured, user_root / ".agents" / "skills",
                                                      user_root / ".codex" / "skills") if root is not None))
        available = [root for root in choices if main_skill_present(safe_path(root))]
        if len(available) > 1:
            raise ValueError("Multiple Codex main Skills; specify --skills-root for the current Agent")
        root = available[0] if available else configured if configured else user_root / ".agents" / "skills"
    elif agent == "claude":
        root = (safe_path(environment["CLAUDE_CONFIG_DIR"]) / "skills" if environment.get("CLAUDE_CONFIG_DIR")
                else user_root / ".claude" / "skills")
    else:
        raise ValueError("Unsupported Agent; use --skills-root for other tools")
    return safe_path(root), agent, "Agent environment/explicit Agent/main Skill discovery"


def prepare_index(index, found):
    index = safe_path(index)
    if index.exists() and not index.is_file():
        raise ValueError("Plugin index is not a regular file")
    old = index.read_bytes() if index.exists() else b""
    text = old.decode("utf-8-sig")
    prefix = f'| {found["plugin_id"]} | {found["version"]} |'
    reference = f'{found["plugin_id"]}/{found["version"]}/SKILL.md'
    matches = [line for line in text.splitlines() if re.match(
        r"^\|\s*" + re.escape(found["plugin_id"]) + r"\s*\|\s*" +
        re.escape(found["version"]) + r"\s*\|", line)]
    if matches:
        if len(matches) != 1 or f"]({reference})" not in matches[0]:
            raise ValueError("Existing plugin index entry conflicts; preserve and compare it")
        return old, old
    line = f'{prefix} [{found["name"]}]({reference}) | Files installed; Agent discovery and host compatibility not verified |\n'
    if not old:
        old_header = b"# Plugin Skill index\n\n| ID | Version | Entry | Validation |\n|---|---|---|---|\n"
        return old, old_header + line.encode("utf-8")
    return old, old + (b"" if old.endswith(b"\n") else b"\n") + line.encode("utf-8")


def copy_exclusive(source, target):
    """Create each destination exclusively; even a racing writer is never overwritten."""
    target.mkdir()
    for folder, dirs, files in os.walk(source, followlinks=False):
        relative = Path(folder).relative_to(source)
        destination = safe_path(target / relative)
        for name in dirs:
            safe_path(Path(folder) / name)
            safe_path(destination / name).mkdir()
        for name in files:
            with safe_path(destination / name).open("xb") as output:
                output.write(safe_path(Path(folder) / name).read_bytes())


def install(source=None, skills_root=None, user_root=None, apply=False, agent=None,
            bundle_root=ROOT, environment=None):
    user_root = safe_path(Path.home() if user_root is None else user_root)
    bundle_root = safe_path(bundle_root)
    bundled = source is None
    source = safe_path(bundle_root / SKILL_RELATIVE if bundled else source)
    found, hashes = checked_source(source, bundle_root, allow_source_override=not bundled)
    skills_root, detected_agent, detection = detect_skills_root(user_root, agent, skills_root, environment)
    has_main = main_skill_present(skills_root)
    parent = safe_path(user_root / ".letsgal-authoring" / "plugins" if has_main else skills_root)
    target = safe_path(parent / found["plugin_id"] / found["version"] if has_main else parent / found["name"])
    if not target.is_relative_to(parent):
        raise ValueError("Destination escaped the selected user area")
    if source == target or source.is_relative_to(target) or target.is_relative_to(source):
        raise ValueError("Source and destination overlap")
    existing = file_hashes(target) if target.exists() else None
    if existing is not None and existing != hashes:
        raise ValueError("Existing Skill differs, including unknown files; preserve/compare it before upgrading. Nothing overwritten")
    index = safe_path(parent / "INDEX.md") if has_main else None
    old, new = prepare_index(index, found) if index is not None else (b"", b"")
    result = {"status": "PREVIEW", **found, "mode": "under-main" if has_main else "standalone",
              "agent": detected_agent, "agent_detection_source": detection,
              "user_root": str(user_root), "skills_root": str(skills_root), "target": str(target),
              "main_skill_found": has_main, "existing_identical": existing == hashes,
              "files": len(hashes), "index": str(index) if index else None,
              "index_will_change": new != old, "agent_discovery_verified": False,
              "host_compatibility_verified": False}
    if not apply:
        return result
    if existing is None:
        # Snapshot, verify, then claim a fresh destination. Never replace an existing tree.
        with tempfile.TemporaryDirectory(prefix="random-math-skill-") as temporary:
            staged = Path(temporary) / "skill"
            copy_exclusive(source, staged)
            if checked_source(staged)[0] != found or file_hashes(staged) != hashes:
                raise ValueError("Source changed while staging; nothing installed")
            safe_path(target.parent).mkdir(parents=True, exist_ok=True)
            safe_path(target)
            copy_exclusive(staged, target)
            if file_hashes(target) != hashes:
                raise ValueError("Installed files changed; preserve the destination and inspect it")
    if index is not None and old != new:
        safe_path(index.parent).mkdir(parents=True, exist_ok=True)
        safe_path(index)
        if (index.read_bytes() if index.exists() else b"") != old:
            raise ValueError("Index changed; installed Skill retained, index not replaced")
        if old:
            backup = safe_path(index.parent / ("INDEX.before-" + uuid.uuid4().hex + ".md"))
            with backup.open("xb") as stream:
                stream.write(old)
            result["index_backup"] = str(backup)
        temporary_index = safe_path(index.parent / ("INDEX." + uuid.uuid4().hex + ".tmp"))
        with temporary_index.open("xb") as stream:
            stream.write(new)
        if (index.read_bytes() if index.exists() else b"") != old:
            raise ValueError("Index changed; prepared index retained, original index not replaced")
        safe_path(index)
        os.replace(temporary_index, index)
    result["status"] = "UNCHANGED" if existing == hashes and old == new else "INSTALLED"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Override the packaged Skill directory")
    parser.add_argument("--agent", choices=("codex", "claude"), help="Current AI tool, when auto detection is ambiguous")
    parser.add_argument("--skills-root", type=Path, help="Explicit Skill directory for this AI tool")
    parser.add_argument("--user-root", type=Path, help="Actual AI user's home (default: Path.home())")
    parser.add_argument("--apply", action="store_true", help="Install; omission only previews")
    args = parser.parse_args()
    try:
        result = install(**vars(args))
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "STOPPED", "reason": str(error)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
