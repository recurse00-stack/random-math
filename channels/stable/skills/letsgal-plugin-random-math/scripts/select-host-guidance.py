"""Read target-project/Studio/SDK evidence and select Stable or Beta AI references.

Python 3.9+, standard library only. Selection does not certify compatibility and
never writes a project or upgrades Studio. Missing/conflicting evidence is UNKNOWN.
"""
from pathlib import Path
import argparse
import ctypes
import hashlib
import json
import os
import re
import stat

ROOT = Path(__file__).absolute().parent.parent
VERSION_PATTERN = re.compile(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z.-]+)?")
PROJECT_KEYS = {"letsgal_studio_exe", "letsgal_host_version", "letsgal_channel", "letsgal_sdk_root"}


def safe_path(value):
    raw = os.fspath(value)
    if "\x00" in raw or ".." in re.split(r"[/\\]", raw):
        raise ValueError("Path traversal is not supported")
    path = Path(raw).expanduser().absolute()
    for part in (*reversed(path.parents), path):
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError(f"Linked/reparse path is not supported: {part}")
    return path


def plain_scalar(value):
    value = value.strip()
    if value.startswith('"'):
        value = json.loads(value)
        if not isinstance(value, str):
            raise ValueError("Project setting must be a string")
        return value
    if value.startswith("'"):
        if not value.endswith("'") or len(value) < 2:
            raise ValueError("Invalid project frontmatter quote")
        return value[1:-1].replace("''", "'")
    if any(symbol in value for symbol in "#{}[]&*!|>"):
        raise ValueError("Unsupported project setting; quote the scalar value")
    return value


def read_project(project):
    if project is None:
        return {}, "UNKNOWN"
    project = safe_path(project)
    if not project.is_dir():
        raise ValueError("Target project is not a directory")
    document = safe_path(project / "LETSGAL.md")
    if not document.exists():
        return {}, str(document) + " (absent)"
    lines = document.read_text(encoding="utf-8-sig").splitlines()
    if not lines or lines[0] != "---":
        return {}, str(document) + " (no explicit routing frontmatter)"
    if "---" not in lines[1:]:
        raise ValueError("Unclosed LETSGAL.md frontmatter")
    result = {}
    for line in lines[1:lines[1:].index("---") + 1]:
        match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)", line)
        if not match or match.group(1) not in PROJECT_KEYS:
            continue
        key, raw = match.groups()
        if key in result:
            raise ValueError("Conflicting/duplicate LETSGAL.md setting: " + key)
        value = plain_scalar(raw)
        if key in {"letsgal_studio_exe", "letsgal_sdk_root"}:
            if ".." in re.split(r"[/\\]", value):
                raise ValueError("Project routing path traversal is not supported")
            value = safe_path(Path(value) if Path(value).is_absolute() else project / value)
        result[key] = value
    return result, str(document)


def classify_version(value):
    if not isinstance(value, str) or not VERSION_PATTERN.fullmatch(value):
        return "UNKNOWN"
    if "-" not in value.split("+", 1)[0]:
        return "stable"
    suffix = value.split("+", 1)[0].split("-", 1)[1].lower()
    return "beta" if re.search(r"(?:^|[.-])beta(?:[.-]|$)", suffix) else "UNKNOWN"


def read_file_version(executable):
    """Read the full Windows FileVersion string, retaining prerelease suffixes."""
    executable = safe_path(executable)
    if not executable.is_file():
        raise ValueError("Studio executable is absent")
    if os.name != "nt":
        raise ValueError("Executable FileVersion reading requires Windows; provide an explicit full version/channel")
    from ctypes import wintypes
    version = ctypes.WinDLL("version", use_last_error=True)
    version.GetFileVersionInfoSizeW.argtypes = (wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD))
    version.GetFileVersionInfoSizeW.restype = wintypes.DWORD
    version.GetFileVersionInfoW.argtypes = (wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID)
    version.GetFileVersionInfoW.restype = wintypes.BOOL
    version.VerQueryValueW.argtypes = (wintypes.LPCVOID, wintypes.LPCWSTR,
                                     ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.UINT))
    version.VerQueryValueW.restype = wintypes.BOOL
    dummy = wintypes.DWORD()
    size = version.GetFileVersionInfoSizeW(str(executable), ctypes.byref(dummy))
    if not size:
        raise ValueError("Studio has no readable FileVersion resource")
    buffer = ctypes.create_string_buffer(size)
    if not version.GetFileVersionInfoW(str(executable), 0, size, buffer):
        raise ValueError("Could not read Studio FileVersion resource")
    pointer, length = ctypes.c_void_p(), wintypes.UINT()
    if not version.VerQueryValueW(buffer, "\\VarFileInfo\\Translation", ctypes.byref(pointer), ctypes.byref(length)):
        raise ValueError("Studio has no string FileVersion translation; numeric fallback would lose the channel")
    translations = ctypes.cast(pointer, ctypes.POINTER(ctypes.c_ushort))
    versions = set()
    for offset in range(0, length.value // 2, 2):
        block = f"\\StringFileInfo\\{translations[offset]:04x}{translations[offset + 1]:04x}\\FileVersion"
        if version.VerQueryValueW(buffer, block, ctypes.byref(pointer), ctypes.byref(length)):
            value = ctypes.wstring_at(pointer).strip()
            if value:
                versions.add(value)
    if len(versions) != 1:
        raise ValueError("Missing/conflicting FileVersion strings")
    value = versions.pop()
    if not VERSION_PATTERN.fullmatch(value):
        raise ValueError("FileVersion is not a full supported version string")
    return value


def sdk_evidence(root):
    if root is None:
        return {"root": "UNKNOWN", "version": "UNKNOWN", "version_sources": [], "sha256": "UNKNOWN"}
    root = safe_path(root)
    if not root.is_dir():
        raise ValueError("SDK directory is absent")
    versions, sources = set(), []
    package = safe_path(root / "package.json")
    if package.is_file():
        data = json.loads(package.read_text(encoding="utf-8-sig"))
        if data.get("version"):
            versions.add(str(data["version"]))
            sources.append(str(package) + ":version")
    constants = safe_path(root / "constants.ts")
    if constants.is_file():
        matches = re.findall(r'\bSDK_VERSION\s*=\s*["\']([^"\']+)["\']', constants.read_text(encoding="utf-8-sig"))
        versions.update(matches)
        if matches:
            sources.append(str(constants) + ":SDK_VERSION")
    if len(versions) > 1:
        raise ValueError("Conflicting SDK versions")
    version = versions.pop() if versions else "UNKNOWN"
    if version != "UNKNOWN" and not VERSION_PATTERN.fullmatch(version):
        raise ValueError("SDK version is not a full supported version")
    digest = hashlib.sha256()
    count = 0
    for folder, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            safe_path(Path(folder) / name)
        for name in sorted(files):
            path = safe_path(Path(folder) / name)
            if not stat.S_ISREG(path.lstat().st_mode):
                raise ValueError("SDK contains non-regular content")
            digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0")
            digest.update(hashlib.sha256(path.read_bytes()).digest())
            count += 1
        dirs.sort()
    if not count:
        raise ValueError("SDK directory is empty")
    return {"root": str(root), "version": version, "version_sources": sources,
            "sha256": digest.hexdigest(), "file_count": count}


def plugin_evidence(skill_root):
    document = safe_path(skill_root / "SKILL.md")
    if not document.is_file():
        raise ValueError("Expected a Skill root containing SKILL.md")
    text = document.read_text(encoding="utf-8-sig").split("---", 2)
    if len(text) != 3 or text[0].strip():
        raise ValueError("Invalid Skill metadata")
    evidence = {}
    for key in ("plugin_id", "plugin_version", "version"):
        values = re.findall(r"^\s{2}" + key + r":\s*(.*?)\s*$", text[1], re.M)
        if len(values) > 1:
            raise ValueError("Duplicate plugin metadata: " + key)
        if values:
            evidence[key] = plain_scalar(values[0])
    if evidence.get("plugin_version") and evidence.get("version") and evidence["plugin_version"] != evidence["version"]:
        raise ValueError("Conflicting plugin documentation versions")
    return {"id": evidence.get("plugin_id", "UNKNOWN"),
            "documentation_version": evidence.get("plugin_version", evidence.get("version", "UNKNOWN")),
            "metadata_source": str(document), "actual_enabled_version": "UNKNOWN",
            "actual_enabled_source": "UNKNOWN"}


def route(project=None, studio_exe=None, host_version=None, channel=None, sdk_root=None,
          skill_root=None, sample_file=None, version_reader=read_file_version):
    selected_root = ROOT if (ROOT / "SKILL.md").is_file() else ROOT / "skills/letsgal-plugin-random-math"
    skill_root = safe_path(skill_root if skill_root is not None else selected_root)
    result = {"status": "UNKNOWN", "route_status": "UNKNOWN", "host_version": "UNKNOWN",
              "channel": "UNKNOWN", "host_sources": [], "project_source": "UNKNOWN",
              "reference": "UNKNOWN", "sdk": sdk_evidence(None), "samples": [],
              "plugin": {"id": "UNKNOWN", "documentation_version": "UNKNOWN", "actual_enabled_version": "UNKNOWN"},
              "compatibility_validation": "NOT_RUN", "studio_validation": "NOT_RUN",
              "player_save_export_validation": "NOT_RUN", "gaps": [], "reason": None}
    try:
        result["plugin"] = plugin_evidence(skill_root)
        settings, project_source = read_project(project)
        result["project_source"] = project_source
        versions, channels = [], []
        if host_version is not None:
            versions.append((host_version, "explicit --host-version (declaration; executable not verified)"))
        if settings.get("letsgal_host_version"):
            versions.append((settings["letsgal_host_version"], project_source + ":letsgal_host_version (declaration)"))
        if channel is not None:
            channels.append((channel.lower(), "explicit --channel"))
        if settings.get("letsgal_channel"):
            channels.append((settings["letsgal_channel"].lower(), project_source + ":letsgal_channel"))
        executables = []
        for value, source in ((studio_exe, "explicit --studio-exe"),
                              (settings.get("letsgal_studio_exe"), project_source + ":letsgal_studio_exe")):
            if value is not None:
                executable = safe_path(value)
                if executables and executable != executables[0][0]:
                    raise ValueError("Studio executable paths conflict with target-project selection")
                if not executables:
                    executables.append((executable, source))
        for executable, source in executables:
            versions.append((version_reader(executable), source + " -> FileVersion:" + str(executable)))
        if not versions:
            raise ValueError("Full target Studio version is UNKNOWN")
        if len({version for version, _ in versions}) != 1:
            raise ValueError("Target-project, declared, and executable host versions conflict")
        version = versions[0][0]
        inferred = classify_version(version)
        if inferred == "UNKNOWN":
            raise ValueError("Full host version/channel is UNKNOWN; unsupported prerelease is not assumed Beta")
        result["host_version"] = version
        result["host_sources"] = [{"value": value, "source": source} for value, source in versions]
        if not executables and not channels:
            raise ValueError("Declared versions require an explicit stable/beta channel")
        if any(value not in {"stable", "beta"} or value != inferred for value, _ in channels):
            raise ValueError("Declared channel conflicts with full host version")
        result["channel"] = inferred
        result["channel_sources"] = [{"value": value, "source": source} for value, source in channels]
        result["channel_sources"].append({"value": inferred, "source": "full host version prerelease suffix"})
        roots = [safe_path(value) for value in (sdk_root, settings.get("letsgal_sdk_root")) if value is not None]
        if len(set(roots)) > 1:
            raise ValueError("SDK paths conflict with target-project selection")
        result["sdk"] = sdk_evidence(roots[0] if roots else None)
        if result["sdk"]["version"] == "UNKNOWN":
            raise ValueError("Target SDK version is UNKNOWN; supply actual SDK root with version evidence")
        reference = safe_path(skill_root / "references" / "compatibility" / (inferred + ".md"))
        if not reference.is_file():
            raise ValueError("Selected channel reference is missing")
        result["reference"] = str(reference)
        for value in sample_file or []:
            path = safe_path(value)
            if not path.is_file():
                raise ValueError("Explicit sample is absent")
            result["samples"].append({"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                                      "validation": "SOURCE_ONLY; behavior/schema not verified"})
        if not result["samples"]:
            result["gaps"].append("Target-version saved sample: UNKNOWN")
        result["gaps"].extend(["Actual project plugin enablement/version: UNKNOWN",
                                "Studio/player/save/export compatibility: NOT_RUN"])
        result["status"] = result["route_status"] = "ROUTED"
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError) as error:
        result["reason"] = str(error)
        result["reference"] = "UNKNOWN"
        result["gaps"].append(str(error))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, help="Target project; read explicit LETSGAL.md frontmatter only")
    parser.add_argument("--studio-exe", type=Path, help="Actual target Studio executable; read full FileVersion")
    parser.add_argument("--host-version", help="Declared full Studio version, retaining beta suffix")
    parser.add_argument("--channel", choices=("stable", "beta"), help="Required for declared version without executable")
    parser.add_argument("--sdk-root", type=Path, help="Actual target SDK with package.json or constants.ts version")
    parser.add_argument("--skill-root", type=Path, help="Override packaged/installed Skill root")
    parser.add_argument("--sample-file", action="append", type=Path, help="Optional explicit target-version saved sample; hashes only")
    result = route(**vars(parser.parse_args()))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["route_status"] == "ROUTED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
