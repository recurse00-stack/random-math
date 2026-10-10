"""Channel-aware Skill installation. Standard library; previews never write files."""
from pathlib import Path
import hashlib
import json
import os
import re
import uuid

ID = "mixing-entropy.random-math"
NAME = "letsgal-plugin-random-math"


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return path.read_bytes() if path.is_file() else None


def relative(value):
    if (not isinstance(value, str) or not value or "\\" in value or ":" in value
            or value.startswith("/") or any(p in ("", ".", "..") for p in value.split("/"))):
        raise ValueError("Unsafe manifest path")
    return value


def payload(api, root, channel):
    safe, hashes = api["safe_path"], api["file_hashes"]
    top = json.loads(safe(root / "plugin-skill-manifest.json").read_bytes())
    if top.get("schema_version") != 2 or top.get("plugin_id") != ID:
        raise ValueError("Unsupported channel manifest")
    entry = top.get("channels", {}).get(channel)
    if not entry:
        raise ValueError("Select --channel stable or beta, or supply --host-version")
    raw = safe(root / relative(entry["manifest"])).read_bytes()
    if digest(raw) != entry["sha256"]:
        raise ValueError("Channel manifest checksum mismatch")
    manifest = json.loads(raw)
    source = safe(root / relative(manifest["skill_path"]))
    found = api["skill_identity"](source)
    front = (source / "SKILL.md").read_text(encoding="utf-8-sig").split("---", 2)[1]
    for key in ("channel", "docs_revision"):
        values = re.findall(r"^\s+" + key + r":\s*(.+)$", front, re.M)
        if len(values) != 1:
            raise ValueError("Missing or duplicate channel/revision metadata")
        found[key] = api["identity"](api["scalar"](values[0]), key)
    ext = json.loads(safe(root / "extension.json").read_bytes())
    if (found["plugin_id"] != ID or found["name"] != NAME or found["channel"] != channel
            or any(manifest.get(k) != v for k, v in found.items())
            or top.get("version") != found["version"]
            or top.get("docs_revision") != found["docs_revision"]
            or ext.get("id") != ID or ext.get("version") != found["version"]):
        raise ValueError("Channel identity/revision conflict")
    actual = hashes(source)
    required = {"SKILL.md", "references/AI-GUIDE.md", "references/AI-INTEGRATION.md",
                "references/compatibility/" + channel + ".md", "scripts/select-host-guidance.py"}
    if channel == "beta":
        required.add("references/mcp-workflow.md")
    if not required.issubset(actual) or manifest.get("files") != actual:
        raise ValueError("Channel payload is incomplete or differs from checksums")
    return source, found, actual, top


def index_bytes(api, index, found):
    old, proposed = api["prepare_index"](index, found)
    text = proposed.decode("utf-8-sig")
    pattern = r"(?m)^\|\s*" + re.escape(ID) + r"\s*\|\s*" + re.escape(found["version"]) + r"\s*\|[^\r\n]*"
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise ValueError("Plugin index entry is ambiguous")
    # Preserve custom provenance in the last cell; only maintain our own marker.
    line = re.sub(r"\s*\[skill-channel:[^\]]*\]", "", matches[0].group())
    marker = f' [skill-channel:{found["channel"]};docs:{found["docs_revision"]}]'
    line = line.rstrip()
    line = line[:-1].rstrip() + marker + " |" if line.endswith("|") else line + marker
    text = text[:matches[0].start()] + line + text[matches[0].end():]
    return old or None, (b"\xef\xbb\xbf" if proposed.startswith(b"\xef\xbb\xbf") else b"") + text.encode("utf-8")


def atomic_file(api, path, expected, content):
    safe = api["safe_path"]
    safe(path)
    if read(path) != expected:
        raise ValueError("File changed since preview: " + str(path))
    if content is None:
        if expected is not None:
            safe(path).unlink()
        return
    safe(path.parent).mkdir(parents=True, exist_ok=True)
    temporary = safe(path.parent / ("." + path.name + "." + uuid.uuid4().hex + ".tmp"))
    with temporary.open("xb") as f:
        f.write(content)
    if read(safe(path)) != expected:
        temporary.unlink()
        raise ValueError("File changed during installation")
    os.replace(temporary, safe(path))


def locations(api, user_root, skills_root, has_main, found):
    safe = api["safe_path"]
    parent = safe(user_root / ".letsgal-authoring/plugins" if has_main else skills_root)
    target = safe(parent / ID / found["version"] if has_main else parent / NAME)
    backup_base = safe(user_root / ".letsgal-authoring/install-backups" if has_main
                       else skills_root.parent / ".letsgal-plugin-backups")
    record = safe(backup_base / "receipts" / (digest(str(target).encode()) + ".json"))
    index = safe(parent / "INDEX.md") if has_main else None
    if not target.is_relative_to(parent) or backup_base.is_relative_to(target):
        raise ValueError("Destination escaped user area")
    return target, backup_base, record, index


def install(api, bundle_root, skills_root=None, user_root=None, agent=None,
            environment=None, channel=None, host_version=None, apply=False,
            update=False, plan=None):
    safe, hashes = api["safe_path"], api["file_hashes"]
    root = safe(bundle_root)
    if host_version:
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:-beta\.\d+)?", host_version):
            raise ValueError("Unknown full host version; select the verified target channel")
        inferred = "beta" if "-beta." in host_version else "stable"
        if channel and channel != inferred:
            raise ValueError("Channel conflicts with target host version")
        channel = inferred
    source, found, incoming, top = payload(api, root, channel)
    user_root = safe(Path.home() if user_root is None else user_root)
    skills_root, detected_agent, detection = api["detect_skills_root"](user_root, agent, skills_root, environment)
    has_main = api["main_skill_present"](skills_root)
    if has_main:
        main_front = (skills_root / "letsgal-authoring/SKILL.md").read_text(encoding="utf-8-sig").split("---", 2)[1]
        current = re.search(r"^\s+channel:\s*[\"']?(stable|beta)", main_front, re.M)
        if current and current[1] != channel:
            raise ValueError("Main Skill channel differs; select the matching main Skill before applying")
    target, backup_base, record, index = locations(api, user_root, skills_root, has_main, found)
    if source == target or source.is_relative_to(target) or target.is_relative_to(source):
        raise ValueError("Source and target overlap")
    existing = hashes(target) if target.exists() else None
    old_record = read(record)
    owned = {}
    previous = None
    if existing is not None:
        if old_record:
            receipt = json.loads(old_record)
            if receipt.get("target") != str(target) or receipt.get("plugin_id") != ID:
                raise ValueError("Installation receipt identity conflict")
            owned = receipt["files"]
            previous = receipt.get("identity")
        else:
            for item in top.get("legacy", []):
                raw = safe(root / relative(item["manifest"])).read_bytes()
                if digest(raw) != item["sha256"]:
                    raise ValueError("Legacy manifest checksum mismatch")
                known = json.loads(raw)
                if known.get("plugin_id") != ID or known.get("version") != found["version"]:
                    continue
                if all(existing.get(p) == h for p, h in known["files"].items()):
                    owned = known["files"]
                    previous = {"version": known["version"], "docs_revision": "sdk.1", "channel": "mixed"}
                    break
            if not owned and all(existing.get(p) == h for p, h in incoming.items()):
                owned = incoming
                previous = found
            if not owned:
                raise ValueError("Existing Skill is unknown or edited; preserve and compare it before updating")
        if any(existing.get(p) != h for p, h in owned.items()):
            raise ValueError("Installed managed files were edited; nothing overwritten")
        for p in set(incoming) - set(owned):
            if p in existing:
                raise ValueError("New payload conflicts with an unowned file: " + p)
    desired = {p: h for p, h in (existing or {}).items() if p not in owned}
    desired.update(incoming)
    old_index, new_index = index_bytes(api, index, found) if index else (None, None)
    new_record = encoded({"schema_version": 1, "target": str(target), "plugin_id": ID,
                          "identity": found, "files": incoming})
    state = {"target": str(target), "existing": existing, "incoming": incoming,
             "old_index": digest(old_index or b""), "old_record": digest(old_record or b""), "identity": found}
    token = digest(encoded(state))
    changed = existing != desired or old_index != new_index or old_record != new_record
    differences = {"added": sorted(set(desired) - set(existing or {})),
                   "removed": sorted(set(existing or {}) - set(desired)),
                   "updated": sorted(p for p in set(desired) & set(existing or {}) if desired[p] != existing[p]),
                   "preserved": sorted(set(existing or {}) - set(owned))}
    result = {"status": "PREVIEW", **found, "previous": previous, "agent": detected_agent,
              "mode": "under-main" if has_main else "standalone", "target": str(target),
              "skills_root": str(skills_root), "main_skill_found": has_main, "plan_id": token,
              "files": len(incoming), "changes": differences, "index": str(index) if index else None,
              "backup_area": str(backup_base), "update_required": existing is not None and changed,
              "existing_identical": existing == desired, "agent_discovery_verified": False,
              "host_compatibility_verified": False}
    if not apply:
        return result
    if not changed:
        result["status"] = "UNCHANGED"
        return result
    if plan != token:
        raise ValueError("Preview is missing or stale; apply with its --plan token")
    if existing is not None and not update:
        raise ValueError("Existing installation differs; inspect preview then use --update --plan")
    backup = safe(backup_base / ("install-" + uuid.uuid4().hex))
    backup.mkdir(parents=True, exist_ok=False)
    stage, previous_tree = safe(backup / "staged"), safe(backup / "previous")
    if existing is None:
        stage.mkdir()
    else:
        api["copy_exclusive"](target, stage)
    for p in owned:
        if p not in incoming:
            safe(stage / relative(p)).unlink()
    for p in incoming:
        dest = safe(stage / relative(p))
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(safe(source / p).read_bytes())
    if hashes(stage) != desired or hashes(source) != incoming:
        raise ValueError("Source changed while staging; installation untouched")
    if ((hashes(target) if target.exists() else None) != existing
            or (read(index) if index else None) != old_index or read(record) != old_record):
        raise ValueError("Destination changed since preview; installation untouched")
    for name, raw in (("index.before", old_index), ("receipt.before", old_record)):
        if raw is not None:
            (backup / name).write_bytes(raw)
    recovery = {"schema_version": 1, "target": str(target), "skills_root": str(skills_root),
                "user_root": str(user_root), "has_main": has_main, "identity": found,
                "existing": existing, "installed": desired, "index": str(index) if index else None,
                "record": str(record), "index_before": digest(old_index) if old_index is not None else None,
                "index_after": digest(new_index) if new_index is not None else None,
                "receipt_before": digest(old_record) if old_record is not None else None,
                "receipt_after": digest(new_record), "state": "prepared"}
    (backup / "recovery.json").write_bytes(encoded(recovery))
    moved_old = moved_new = index_written = record_written = False
    try:
        safe(target.parent).mkdir(parents=True, exist_ok=True)
        if existing is not None:
            os.replace(safe(target), previous_tree)
            moved_old = True
            if hashes(previous_tree) != existing:
                raise ValueError("Target changed during commit")
        os.rename(stage, safe(target))  # destination must be absent
        moved_new = True
        if index and new_index != old_index:
            atomic_file(api, index, old_index, new_index)
            index_written = True
        atomic_file(api, record, old_record, new_record)
        record_written = True
        if hashes(target) != desired:
            raise ValueError("Installed files failed readback")
        recovery["state"] = "installed"
        (backup / "recovery.json").write_bytes(encoded(recovery))
    except Exception:
        # Roll back only our exact writes; an outside edit is never discarded.
        if record_written:
            atomic_file(api, record, new_record, old_record)
        if index_written:
            atomic_file(api, index, new_index, old_index)
        if moved_new:
            if hashes(target) != desired:
                raise ValueError("Outside edit detected; preserve installation and recovery: " + str(backup))
            os.rename(safe(target), safe(backup / "failed-new"))
        if moved_old:
            os.rename(previous_tree, safe(target))
        raise
    result.update(status="UPDATED" if existing is not None else "INSTALLED", backup=str(backup))
    return result


def restore(api, backup, apply=False, plan=None):
    safe, hashes = api["safe_path"], api["file_hashes"]
    backup = safe(backup)
    document = json.loads(safe(backup / "recovery.json").read_bytes())
    if document.get("state") != "installed":
        raise ValueError("Backup is not a completed installation")
    target, area, record, index = locations(api, safe(document["user_root"]), safe(document["skills_root"]),
                                           document["has_main"], document["identity"])
    if (backup.parent != area or str(target) != document["target"] or str(record) != document["record"]
            or (str(index) if index else None) != document["index"]):
        raise ValueError("Recovery paths escaped the installation area")
    if hashes(target) != document["installed"]:
        raise ValueError("Installed files changed; refusing to overwrite during restore")
    if document["existing"] is not None and hashes(safe(backup / "previous")) != document["existing"]:
        raise ValueError("Backup files failed checksum verification")
    old_index, old_record = read(backup / "index.before"), read(backup / "receipt.before")
    current_index, current_record = read(index) if index else None, read(record)
    for raw, key in ((old_index, "index_before"), (old_record, "receipt_before"),
                     (current_index, "index_after"), (current_record, "receipt_after")):
        if (digest(raw) if raw is not None else None) != document[key]:
            raise ValueError("Index/receipt changed or recovery data is corrupt")
    token = digest(encoded(document))
    result = {"status": "RESTORE_PREVIEW", "target": str(target), "backup": str(backup), "plan_id": token}
    if not apply:
        return result
    if plan != token:
        raise ValueError("Preview restore first; use its --plan token")
    # Retain the replaced installation as well; no recursive deletion.
    discarded = safe(backup / "replaced-on-restore")
    os.rename(safe(target), discarded)
    if hashes(discarded) != document["installed"]:
        os.rename(discarded, safe(target))
        raise ValueError("Installed files changed during restore; nothing discarded")
    restored_old = index_written = False
    try:
        if document["existing"] is not None:
            os.rename(safe(backup / "previous"), safe(target))
            restored_old = True
        if index:
            atomic_file(api, index, current_index, old_index)
            index_written = True
        atomic_file(api, record, current_record, old_record)
    except Exception:
        if index_written:
            atomic_file(api, index, old_index, current_index)
        if restored_old:
            os.rename(safe(target), safe(backup / "previous"))
        os.rename(discarded, safe(target))
        raise
    document["state"] = "restored"
    (backup / "recovery.json").write_bytes(encoded(document))
    result["status"] = "RESTORED"
    return result
