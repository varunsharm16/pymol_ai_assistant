#!/usr/bin/env python3
"""Manage PyMOL AI Assistant startup hooks in user rc files."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


MANAGED_START = "# >>> PyMOL AI Assistant (managed) >>>"
MANAGED_END = "# <<< PyMOL AI Assistant (managed) <<<"

MANAGED_BLOCK = f"""{MANAGED_START}
python
import importlib.util
import os
import pathlib
import sys
import traceback

print("[AI-BRIDGE] ---- startup diagnostics ----")

_home = pathlib.Path.home()
print(f"[AI-BRIDGE] Path.home() = {{_home}}")
print(f"[AI-BRIDGE] USERPROFILE  = {{os.environ.get('USERPROFILE', '(not set)')}}")
print(f"[AI-BRIDGE] HOME         = {{os.environ.get('HOME', '(not set)')}}")

plugin_dir = _home / ".pymol" / "Plugins" / "pymol_ai_assistant"
init_py = plugin_dir / "__init__.py"
print(f"[AI-BRIDGE] Looking for plugin at: {{init_py}}")
print(f"[AI-BRIDGE] Plugin dir exists:  {{plugin_dir.exists()}}")
print(f"[AI-BRIDGE] __init__.py exists: {{init_py.exists()}}")

if "pymol_ai_assistant" in sys.modules:
    print("[AI-BRIDGE] Plugin already loaded (sys.modules hit)")
elif not init_py.exists():
    print(f"[AI-BRIDGE] ERROR: Plugin not found at {{init_py}}")
    print("[AI-BRIDGE] Re-run the installer or check that the above path exists.")
else:
    try:
        spec = importlib.util.spec_from_file_location(
            "pymol_ai_assistant",
            str(init_py),
            submodule_search_locations=[str(plugin_dir)],
        )
        if spec is None or spec.loader is None:
            print(f"[AI-BRIDGE] ERROR: Could not create import spec for {{init_py}}")
        else:
            module = importlib.util.module_from_spec(spec)
            sys.modules["pymol_ai_assistant"] = module
            spec.loader.exec_module(module)
            print("[AI-BRIDGE] Plugin loaded successfully. Type 'ai' to launch.")
    except Exception as _exc:
        print(f"[AI-BRIDGE] ERROR loading plugin: {{_exc}}")
        traceback.print_exc()

print("[AI-BRIDGE] ---- end diagnostics ----")
python end
{MANAGED_END}
"""

# Pure Python startup loader for PyMOL's Startup directory.
# This is NOT wrapped in python/python end — it's loaded directly as a .py file.
STARTUP_LOADER_SCRIPT = '''\
import importlib.util
import os
import pathlib
import sys
import traceback

print("[AI-BRIDGE] ---- startup diagnostics (Startup dir loader) ----")

_home = pathlib.Path.home()
print(f"[AI-BRIDGE] Path.home() = {_home}")
print(f"[AI-BRIDGE] USERPROFILE  = {os.environ.get('USERPROFILE', '(not set)')}")
print(f"[AI-BRIDGE] HOME         = {os.environ.get('HOME', '(not set)')}")

plugin_dir = _home / ".pymol" / "Plugins" / "pymol_ai_assistant"
init_py = plugin_dir / "__init__.py"
print(f"[AI-BRIDGE] Looking for plugin at: {init_py}")
print(f"[AI-BRIDGE] Plugin dir exists:  {plugin_dir.exists()}")
print(f"[AI-BRIDGE] __init__.py exists: {init_py.exists()}")

if "pymol_ai_assistant" in sys.modules:
    print("[AI-BRIDGE] Plugin already loaded (sys.modules hit)")
elif not init_py.exists():
    print(f"[AI-BRIDGE] ERROR: Plugin not found at {init_py}")
    print("[AI-BRIDGE] Re-run the installer or check that the above path exists.")
else:
    try:
        spec = importlib.util.spec_from_file_location(
            "pymol_ai_assistant",
            str(init_py),
            submodule_search_locations=[str(plugin_dir)],
        )
        if spec is None or spec.loader is None:
            print(f"[AI-BRIDGE] ERROR: Could not create import spec for {init_py}")
        else:
            module = importlib.util.module_from_spec(spec)
            sys.modules["pymol_ai_assistant"] = module
            spec.loader.exec_module(module)
            print("[AI-BRIDGE] Plugin loaded successfully. Type \'ai\' to launch.")
    except Exception as _exc:
        print(f"[AI-BRIDGE] ERROR loading plugin: {_exc}")
        traceback.print_exc()

print("[AI-BRIDGE] ---- end diagnostics ----")
'''

LEGACY_PLUGIN_PATTERNS = (
    re.compile(r"^\s*run\s+.*pymol_ai_assistant[/\\]__init__\.py\s*$", re.IGNORECASE),
    re.compile(r"^\s*run\s+.*pymol_ai_assistant_plugin[/\\]__init__\.py\s*$", re.IGNORECASE),
)


@dataclass
class StartupResult:
    startup_file: Path
    written_files: list[Path]
    action: str
    backups: list[Path]
    migrated: list[str]


def detect_platform(value: str) -> str:
    if value != "auto":
        return value
    if os.name == "nt":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def _unique_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result


def startup_files_for(platform_name: str, home: Path) -> list[Path]:
    if platform_name != "windows":
        return [home / ".pymolrc"]

    bases: list[Path] = []
    for key in ("HOME", "USERPROFILE"):
        value = os.environ.get(key)
        if value:
            bases.append(Path(value))

    home_drive = os.environ.get("HOMEDRIVE")
    home_path = os.environ.get("HOMEPATH")
    if home_drive and home_path:
        bases.append(Path(f"{home_drive}{home_path}"))

    if not bases:
        bases.append(home)

    targets: list[Path] = []
    for base in _unique_paths(bases):
        targets.append(base / "pymolrc")
        targets.append(base / "pymolrc.pml")
    return _unique_paths(targets)


def legacy_loader_paths(platform_name: str, home: Path) -> list[Path]:
    """Paths to remove during migration.

    NOTE: On Windows, %APPDATA%\\\\PyMOL\\\\Startup\\\\pymol_ai_assistant_startup.py
    is NOT legacy — we actively write to it. Only the directory-style loader
    (pymol_ai_assistant/) is legacy.
    """
    paths = [
        home / ".pymol" / "startup" / "pymol_ai_assistant_startup.py",
        home / ".pymol" / "startup" / "pymol_ai_assistant",
        home / ".pymol" / "Plugins" / "pymol_ai_assistant_plugin",
    ]
    if platform_name == "macos":
        paths.extend(
            [
                home / "Library" / "Application Support" / "PyMOL" / "Startup" / "pymol_ai_assistant_startup.py",
                home / "Library" / "Application Support" / "PyMOL" / "Startup" / "pymol_ai_assistant",
            ]
        )
    if platform_name == "windows":
        appdata = os.environ.get("APPDATA")
        if appdata:
            startup_dir = Path(appdata) / "PyMOL" / "Startup"
            # Only the directory-form is legacy; the .py file is actively managed
            paths.append(startup_dir / "pymol_ai_assistant")
    return paths


def startup_dir_paths_for(platform_name: str, home: Path) -> list[Path]:
    """Return directories where PyMOL auto-loads .py files at startup."""
    dirs: list[Path] = []
    if platform_name == "windows":
        appdata = os.environ.get("APPDATA")
        if appdata:
            dirs.append(Path(appdata) / "PyMOL" / "Startup")
    elif platform_name == "macos":
        dirs.append(home / "Library" / "Application Support" / "PyMOL" / "Startup")
    # Also check the lowercase .pymol/startup used by open-source PyMOL
    dirs.append(home / ".pymol" / "startup")
    return _unique_paths(dirs)


def backup_path(path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    return path.with_name(f"{path.name}.backup.{timestamp}")


def backup_existing(path: Path) -> Path | None:
    if not path.exists():
        return None
    dest = backup_path(path)
    if path.is_dir():
        shutil.copytree(path, dest)
    else:
        shutil.copy2(path, dest)
    return dest


def strip_managed_block(text: str) -> str:
    pattern = re.compile(
        rf"(?ms)^[ \t]*{re.escape(MANAGED_START)}\n.*?^[ \t]*{re.escape(MANAGED_END)}\n?"
    )
    return re.sub(pattern, "", text).rstrip()


def migrate_legacy_lines(text: str) -> tuple[str, list[str]]:
    migrated: list[str] = []
    new_lines: list[str] = []
    for line in text.splitlines():
        if any(pattern.match(line) for pattern in LEGACY_PLUGIN_PATTERNS):
            migrated.append(line.strip())
            new_lines.append(f"# Migrated by installer: {line.strip()}")
        else:
            new_lines.append(line)
    return "\n".join(new_lines).rstrip(), migrated


def append_managed_block(text: str) -> str:
    if text.strip():
        return f"{text.rstrip()}\n\n{MANAGED_BLOCK}"
    return MANAGED_BLOCK


def remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def migrate_legacy_paths(paths: Iterable[Path]) -> tuple[list[Path], list[str]]:
    backups: list[Path] = []
    migrated: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        backup = backup_existing(path)
        if backup is not None:
            backups.append(backup)
        remove_path(path)
        migrated.append(str(path))
    return backups, migrated


def _update_startup_file(startup_file: Path) -> tuple[str, list[Path], list[str]]:
    startup_file.parent.mkdir(parents=True, exist_ok=True)
    backups: list[Path] = []
    migrated: list[str] = []
    action = "created"
    original_text = ""
    if startup_file.exists():
        backup = backup_existing(startup_file)
        if backup is not None:
            backups.append(backup)
        original_text = startup_file.read_text(encoding="utf-8")
        action = "updated"

    text = strip_managed_block(original_text)
    text, migrated_lines = migrate_legacy_lines(text)
    migrated.extend(migrated_lines)
    final_text = append_managed_block(text)
    startup_file.write_text(final_text.rstrip() + "\n", encoding="utf-8")
    return action, backups, migrated

def _write_startup_loader(startup_dirs: list[Path]) -> list[Path]:
    """Write the pure-Python startup loader into each Startup directory."""
    written: list[Path] = []
    for d in startup_dirs:
        d.mkdir(parents=True, exist_ok=True)
        loader = d / "pymol_ai_assistant_startup.py"
        loader.write_text(STARTUP_LOADER_SCRIPT, encoding="utf-8")
        written.append(loader)
    return written


def install_startup_hook(platform_name: str, plugin_dir: Path | None, home: Path) -> StartupResult:
    startup_files = startup_files_for(platform_name, home)
    primary_startup_file = startup_files[0]

    backups: list[Path] = []
    migrated: list[str] = []
    action = "created"
    written_files: list[Path] = []

    if plugin_dir is not None:
        _ = plugin_dir

    # Write managed block into pymolrc / pymolrc.pml
    for startup_file in startup_files:
        file_action, file_backups, file_migrated = _update_startup_file(startup_file)
        if file_action == "updated":
            action = "updated"
        backups.extend(file_backups)
        migrated.extend(file_migrated)
        written_files.append(startup_file)

    # Write pure-Python loader into PyMOL Startup directories
    # This is the primary mechanism on Windows where pymolrc is often not read
    startup_dirs = startup_dir_paths_for(platform_name, home)
    loader_files = _write_startup_loader(startup_dirs)
    written_files.extend(loader_files)

    legacy_backups, legacy_migrated = migrate_legacy_paths(legacy_loader_paths(platform_name, home))
    backups.extend(legacy_backups)
    migrated.extend(legacy_migrated)

    return StartupResult(
        startup_file=primary_startup_file,
        written_files=written_files,
        action=action,
        backups=backups,
        migrated=migrated,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage PyMOL AI Assistant startup hooks.")
    parser.add_argument("--install", action="store_true", help="Install or update the managed startup hook.")
    parser.add_argument("--plugin-dir", type=Path, default=None, help="Optional plugin directory override.")
    parser.add_argument(
        "--platform",
        choices=("auto", "macos", "linux", "windows"),
        default="auto",
        help="Platform override, mainly for tests.",
    )
    parser.add_argument("--home", type=Path, default=Path.home(), help="Home directory override, mainly for tests.")
    parser.add_argument("--verbose", action="store_true", help="Print detailed output.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.install:
        print("Nothing to do. Use --install.")
        return 1

    platform_name = detect_platform(args.platform)
    result = install_startup_hook(platform_name, args.plugin_dir, args.home)

    print(
        f"AI_STARTUP_OK file={result.startup_file} action={result.action} "
        f"files={len(result.written_files)} migrated={len(result.migrated)} backups={len(result.backups)}"
    )
    if args.verbose:
        for item in result.written_files:
            print(f"WROTE {item}")
        for item in result.migrated:
            print(f"MIGRATED {item}")
        for item in result.backups:
            print(f"BACKUP {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
