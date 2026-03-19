import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.manage_pymol_startup import (
    MANAGED_END,
    MANAGED_START,
    install_startup_hook,
    startup_files_for,
)


def test_startup_file_for_macos(tmp_path):
    assert startup_files_for("macos", tmp_path) == [tmp_path / ".pymolrc"]


def test_startup_file_for_windows(tmp_path):
    original = {key: sys.modules["os"].environ.get(key) for key in ("HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH")}
    try:
        sys.modules["os"].environ["USERPROFILE"] = str(tmp_path / "userprofile")
        sys.modules["os"].environ["HOME"] = str(tmp_path / "home")
        sys.modules["os"].environ["HOMEDRIVE"] = str(tmp_path / "drive")
        sys.modules["os"].environ["HOMEPATH"] = "\\profile"
        files = startup_files_for("windows", tmp_path)
    finally:
        for key, value in original.items():
            if value is None:
                sys.modules["os"].environ.pop(key, None)
            else:
                sys.modules["os"].environ[key] = value

    assert tmp_path / "userprofile" / "pymolrc" in files
    assert tmp_path / "userprofile" / "pymolrc.pml" in files
    assert tmp_path / "home" / "pymolrc" in files
    assert Path(f"{tmp_path / 'drive'}\\profile") / "pymolrc" in files


def test_install_creates_startup_file(tmp_path):
    result = install_startup_hook("macos", None, tmp_path)
    content = result.startup_file.read_text(encoding="utf-8")
    assert MANAGED_START in content
    assert MANAGED_END in content
    assert result.action == "created"


def test_install_updates_existing_file_without_clobbering_content(tmp_path):
    startup = tmp_path / ".pymolrc"
    startup.write_text("set opaque_background, off\n", encoding="utf-8")

    result = install_startup_hook("macos", None, tmp_path)
    content = startup.read_text(encoding="utf-8")

    assert "set opaque_background, off" in content
    assert MANAGED_START in content
    assert result.action == "updated"
    assert result.backups


def test_install_replaces_previous_managed_block_in_place(tmp_path):
    startup = tmp_path / ".pymolrc"
    startup.write_text(
        "set ray_trace_mode, 1\n\n"
        f"{MANAGED_START}\nold block\n{MANAGED_END}\n",
        encoding="utf-8",
    )

    install_startup_hook("macos", None, tmp_path)
    content = startup.read_text(encoding="utf-8")

    assert content.count(MANAGED_START) == 1
    assert "old block" not in content
    assert "set ray_trace_mode, 1" in content


def test_install_comments_out_legacy_ai_run_line(tmp_path):
    startup = tmp_path / ".pymolrc"
    legacy = "run ~/.pymol/Plugins/pymol_ai_assistant/__init__.py"
    startup.write_text(legacy + "\n", encoding="utf-8")

    result = install_startup_hook("macos", None, tmp_path)
    content = startup.read_text(encoding="utf-8")

    assert "# Migrated by installer:" in content
    assert legacy in content
    assert result.migrated


def test_install_migrates_legacy_loader_files(tmp_path):
    legacy_loader = tmp_path / ".pymol" / "startup" / "pymol_ai_assistant_startup.py"
    legacy_loader.parent.mkdir(parents=True, exist_ok=True)
    legacy_loader.write_text("print('old loader')\n", encoding="utf-8")

    result = install_startup_hook("linux", None, tmp_path)

    assert not legacy_loader.exists()
    assert any("pymol_ai_assistant_startup.py" in item for item in result.migrated)
    assert any("pymol_ai_assistant_startup.py.backup." in str(path) for path in result.backups)


def test_install_migrates_legacy_plugin_directory(tmp_path):
    legacy_dir = tmp_path / ".pymol" / "Plugins" / "pymol_ai_assistant_plugin"
    legacy_dir.mkdir(parents=True, exist_ok=True)
    (legacy_dir / "__init__.py").write_text("# legacy\n", encoding="utf-8")

    result = install_startup_hook("linux", None, tmp_path)

    assert not legacy_dir.exists()
    assert any("pymol_ai_assistant_plugin" in item for item in result.migrated)
    assert any("pymol_ai_assistant_plugin.backup." in str(path) for path in result.backups)


def test_windows_install_migrates_wrong_pymolrc_pml(tmp_path):
    original = {key: sys.modules["os"].environ.get(key) for key in ("HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH")}
    userprofile = tmp_path / "userprofile"
    userprofile.mkdir()
    try:
        sys.modules["os"].environ["USERPROFILE"] = str(userprofile)
        sys.modules["os"].environ.pop("HOME", None)
        sys.modules["os"].environ.pop("HOMEDRIVE", None)
        sys.modules["os"].environ.pop("HOMEPATH", None)

        wrong_startup = userprofile / "pymolrc.pml"
        wrong_startup.write_text("set ray_trace_mode, 1\n", encoding="utf-8")
        result = install_startup_hook("windows", None, tmp_path)
    finally:
        for key, value in original.items():
            if value is None:
                sys.modules["os"].environ.pop(key, None)
            else:
                sys.modules["os"].environ[key] = value

    content = wrong_startup.read_text(encoding="utf-8")
    assert wrong_startup.exists()
    assert "set ray_trace_mode, 1" in content
    assert MANAGED_START in content
    assert wrong_startup in result.written_files
