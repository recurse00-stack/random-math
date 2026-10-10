"""Deterministic allowlisted mcp.1 archives; uses existing 3.0.0 runtime bytes."""
from pathlib import Path
import hashlib
import json
import runpy
import zipfile

ROOT = Path(__file__).absolute().parent.parent
REV = "mcp.1"


def channel_files():
    api = runpy.run_path(str(ROOT / "scripts/install-skill.py"))
    channels = runpy.run_path(str(ROOT / "scripts/skill-channels.py"))
    top = json.loads((ROOT / "plugin-skill-manifest.json").read_bytes())
    paths = {"plugin-skill-manifest.json"}
    for channel in ("stable", "beta"):
        source, found, hashes, _ = channels["payload"](api, ROOT, channel)
        for name in ("AI-GUIDE.md", "AI-INTEGRATION.md", "MIGRATION-3.0.md", "CHOICE-UI-COMPATIBILITY.md",
                     "VALIDATION-3.0.md", "LEGACY-2.2.3-AI-GUIDE.md", "examples-v3.json"):
            if (source / "references" / name).read_bytes() != (ROOT / "docs" / name).read_bytes():
                raise ValueError("Stale channel reference; run build-skill-channels.py: " + name)
        paths.add(top["channels"][channel]["manifest"])
        paths.update((source / p).relative_to(ROOT).as_posix() for p in hashes)
    for entry in top["legacy"]:
        p = channels["relative"](entry["manifest"])
        if hashlib.sha256(api["safe_path"](ROOT / p).read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError("Legacy manifest changed")
        paths.add(p)
    paths.update(["scripts/install-skill.py", "scripts/skill-channels.py", "scripts/select-host-guidance.py",
                  "scripts/migrate-project.py", "extension.json"])
    return paths


def zip_bytes(data):
    import io
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, raw in sorted(data.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, raw)
    with zipfile.ZipFile(io.BytesIO(out.getvalue())) as z:
        assert z.testzip() is None and set(z.namelist()) == set(data)
    return out.getvalue()


def read_files(paths):
    safe = runpy.run_path(str(ROOT / "scripts/install-skill.py"))["safe_path"]
    return {p: safe(ROOT / p).read_bytes() for p in paths}


def ai_data():
    data = read_files(channel_files())
    data.update(read_files({"docs/MIGRATION-3.0.md", "docs/VALIDATION-3.0.md", "docs/examples-v3.json"}))
    for name, source in {"开始使用.md": "docs/AI-INTEGRATION.md", "开始使用.html": "docs/ai-install.html",
                         "待合并规则/AGENTS.append.md": "docs/ai-integration/AGENTS.append.md",
                         "待合并规则/CLAUDE.append.md": "docs/ai-integration/CLAUDE.append.md",
                         "待合并规则/random-math.mdc": "docs/ai-integration/random-math.mdc",
                         "给聊天AI的开场说明.md": "docs/ai-integration/CHAT-START.md"}.items():
        data[name] = (ROOT / source).read_bytes()
    for channel in ("stable", "beta"):
        prefix = f"channels/{channel}/skills/letsgal-plugin-random-math/"
        data.update({f"项目文件/{channel}/docs/random-math/" + p[len(prefix):]: raw
                     for p, raw in list(data.items()) if p.startswith(prefix)})
    return data


def build_ai(target):
    with Path(target).open("xb") as f:
        f.write(zip_bytes(ai_data()))
    print("Built independent stable/beta AI kit: " + str(target))


def build_packages(output, docs):
    output = Path(output)
    names = [f"random-math-v3.0.0-{REV}.zip", f"random-math-v3.0.0-{REV}-docs.zip"]
    for p in [*names, "SHA256SUMS.txt"]:
        if (output / p).exists():
            raise FileExistsError("Existing release artifact: " + str(output / p))
    runtime = {"dist/index.js", "dist/index.mjs", "dist/deck.js", "assets/cover.png"}
    expected = "2c9ad6116c4053858b04da6038ea0daada2b85991d286b2f7fa79aa33a825565"
    for p in ("dist/index.js", "dist/index.mjs"):
        if hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != expected:
            raise ValueError("mcp.1 requires the unchanged published 3.0.0 runtime")
    paths = {p for p in docs if not p.startswith("skills/")} | channel_files()
    data = read_files(paths)
    packages = {names[0]: zip_bytes({**data, **read_files(runtime)}), names[1]: zip_bytes(data)}
    sums = "".join(f"{hashlib.sha256(raw).hexdigest()}  {name}\n" for name, raw in packages.items())
    packages["SHA256SUMS.txt"] = sums.encode()
    output.mkdir(parents=True, exist_ok=True)
    for p, raw in packages.items():
        with (output / p).open("xb") as f:
            f.write(raw)
    print("Built mcp.1 packages with unchanged 3.0.0 runtime")
