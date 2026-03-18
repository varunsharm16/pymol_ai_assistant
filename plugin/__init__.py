"""
PyMOL AI Assistant Plugin — v0.1.1-alpha
========================================
Type ``ai`` in PyMOL to launch the full system:
  1. Bridge server (FastAPI on 127.0.0.1:5179)
  2. Electron desktop UI
  3. WebSocket listener for command execution

All interaction happens through the Electron UI — no Qt dialogs.
"""
import atexit
import base64
import importlib.util
import inspect
import json
import logging
import os
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Logging setup (clean terminal by default — INFO level)
# ---------------------------------------------------------------------------
_log = logging.getLogger("pymol_ai")
if not _log.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("[AI-BRIDGE] %(message)s"))
    _log.addHandler(_handler)
    _log.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Ensure PyMOL sees user site-packages BEFORE importing websocket
# ---------------------------------------------------------------------------
_site_dir = os.path.expanduser("~/.pymol/site-packages")
if _site_dir not in sys.path:
    sys.path.insert(0, _site_dir)

_BOOT_CONFIG_PATH = Path.home() / ".pymol" / "config.json"


def _load_command_model_symbols():
    try:
        from .command_model import (  # noqa: E402
            CANONICAL_ACTIONS,
            ONLY_ONE_ACTION_ERROR,
            compile_selection_spec,
            describe_selection_spec,
            normalize_command_spec,
            normalize_sequence_format,
        )
        return {
            "CANONICAL_ACTIONS": CANONICAL_ACTIONS,
            "ONLY_ONE_ACTION_ERROR": ONLY_ONE_ACTION_ERROR,
            "compile_selection_spec": compile_selection_spec,
            "describe_selection_spec": describe_selection_spec,
            "normalize_command_spec": normalize_command_spec,
            "normalize_sequence_format": normalize_sequence_format,
        }
    except Exception:
        pass

    candidates = []

    current_file = globals().get("__file__")
    if current_file:
        candidates.append(Path(current_file).resolve().with_name("command_model.py"))

    try:
        import inspect as _inspect

        source_file = _inspect.getsourcefile(_load_command_model_symbols)
        if source_file:
            candidates.append(Path(source_file).resolve().with_name("command_model.py"))
    except Exception:
        pass

    try:
        if _BOOT_CONFIG_PATH.exists():
            cfg = json.loads(_BOOT_CONFIG_PATH.read_text(encoding="utf-8"))
            root = (cfg.get("project_root") or "").strip()
            if root:
                candidates.append(Path(root).resolve() / "plugin" / "command_model.py")
    except Exception:
        pass

    seen = set()
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        if not path.exists():
            continue
        spec = importlib.util.spec_from_file_location("pymol_ai_command_model", path)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return {
            "CANONICAL_ACTIONS": module.CANONICAL_ACTIONS,
            "ONLY_ONE_ACTION_ERROR": module.ONLY_ONE_ACTION_ERROR,
            "compile_selection_spec": module.compile_selection_spec,
            "describe_selection_spec": module.describe_selection_spec,
            "normalize_command_spec": module.normalize_command_spec,
            "normalize_sequence_format": module.normalize_sequence_format,
        }

    raise ImportError("Could not locate command_model.py for the PyMOL AI Assistant plugin")

from pymol import cmd, util  # noqa: E402
try:
    from pymol.Qt.utils import MainThreadCaller  # noqa: E402
except Exception:
    MainThreadCaller = None

try:
    import websocket  # noqa: E402
except ImportError:
    websocket = None
    _log.warning(
        "websocket-client not installed. "
        "Run: pip install websocket-client   (in PyMOL's Python)"
    )

try:
    from openai import OpenAI  # noqa: E402
except ImportError:
    OpenAI = None
    _log.warning(
        "openai package not installed. "
        "Run: pip install openai   (in PyMOL's Python)"
    )

_command_model_symbols = _load_command_model_symbols()
CANONICAL_ACTIONS = _command_model_symbols["CANONICAL_ACTIONS"]
ONLY_ONE_ACTION_ERROR = _command_model_symbols["ONLY_ONE_ACTION_ERROR"]
compile_selection_spec = _command_model_symbols["compile_selection_spec"]
describe_selection_spec = _command_model_symbols["describe_selection_spec"]
normalize_command_spec = _command_model_symbols["normalize_command_spec"]
normalize_sequence_format = _command_model_symbols["normalize_sequence_format"]

# ---------------------------------------------------------------------------
# Constants & paths (cross-platform)
# ---------------------------------------------------------------------------
_IS_WINDOWS = platform.system() == "Windows"
_CONFIG_PATH = Path.home() / ".pymol" / "config.json"
_CONFIG_DIR = _CONFIG_PATH.parent
BRIDGE_URL = "ws://127.0.0.1:5179/bridge"
BRIDGE_HTTP = "http://127.0.0.1:5179"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
SEQUENCE_FORMAT_TO_SETTING = {
    "residue_codes": 0,
    "residue_names": 1,
    "atom_names": 2,
    "chain_identifiers": 3,
}


def _detect_project_root() -> Path:
    """
    Determine the project root directory.

    Priority:
      1. ``project_root`` key in ``~/.pymol/config.json`` (set by installer)
      2. Fallback: walk up from ``__file__`` (works when run from source)
    """
    # Try config file first (most reliable — set by install.sh / install.bat)
    try:
        if _CONFIG_PATH.exists():
            cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            root = cfg.get("project_root", "")
            if root:
                p = Path(root)
                if (p / "pymol-bridge").is_dir():
                    _log.debug("Project root from config: %s", p)
                    return p
    except Exception as exc:
        _log.debug("Failed to read project_root from config: %s", exc)

    # Fallback: __file__ based (works when plugin is run directly from source)
    candidate = Path(__file__).resolve().parent.parent
    if (candidate / "pymol-bridge").is_dir():
        return candidate

    # Last resort: try without .resolve() (preserves symlink path)
    candidate2 = Path(__file__).parent.parent
    if (candidate2 / "pymol-bridge").is_dir():
        return candidate2

    _log.warning(
        "Could not detect project root. "
        "Re-run install.sh or set 'project_root' in ~/.pymol/config.json"
    )
    return candidate


_PROJECT_ROOT = _detect_project_root()
_BRIDGE_DIR = _PROJECT_ROOT / "pymol-bridge"
_ELECTRON_DIR = _PROJECT_ROOT / "pymol-ai-electron-ui"

# One-letter → three-letter residue map
RES_MAP = {
    "A": "ALA", "C": "CYS", "D": "ASP", "E": "GLU", "F": "PHE",
    "G": "GLY", "H": "HIS", "I": "ILE", "K": "LYS", "L": "LEU",
    "M": "MET", "N": "ASN", "P": "PRO", "Q": "GLN", "R": "ARG",
    "S": "SER", "T": "THR", "V": "VAL", "W": "TRP", "Y": "TYR",
}

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
_ws_thread = None
_heartbeat_thread = None
_ws_conn = None
_ws_lock = threading.Lock()
_connected_logged = False  # ensures "Connected" prints exactly once
_bridge_proc = None
_electron_proc = None
_electron_log_handle = None
_openai_client = None  # lazy-loaded
_shutting_down = False
_main_thread_caller = MainThreadCaller() if MainThreadCaller is not None else None


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------
def _read_config() -> dict:
    """Read ~/.pymol/config.json, returning {} on any error."""
    try:
        if _CONFIG_PATH.exists():
            return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        _log.debug("Failed to read config: %s", exc)
    return {}


def _get_api_key() -> str:
    """Return the OpenAI API key from config, or empty string."""
    cfg = _read_config()
    key = cfg.get("openai_api_key", "")
    if not key:
        # Fallback: legacy file
        legacy = Path.home() / ".pymol" / "openai_api_key.txt"
        if legacy.exists():
            try:
                key = legacy.read_text(encoding="utf-8").strip()
            except Exception:
                pass
    return key


def _get_openai_model() -> str:
    cfg = _read_config()
    model = str(cfg.get("openai_model") or "").strip()
    return model or DEFAULT_OPENAI_MODEL


def _get_openai_client():
    """Lazy-load the OpenAI client on first LLM call."""
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    if OpenAI is None:
        raise RuntimeError(
            "openai package not installed. "
            "Run: pip install openai  (in PyMOL's Python)"
        )
    key = _get_api_key()
    if not key:
        raise RuntimeError(
            "No API key configured. Enter your key in the Electron UI Settings."
        )
    _openai_client = OpenAI(api_key=key)
    return _openai_client


# ---------------------------------------------------------------------------
# Helper functions for PyMOL commands
# ---------------------------------------------------------------------------
def set_background(color: str):
    _log.debug("set_background: color %s", color)
    cmd.bg_color(color)


def rotate_view(axis: str, angle: float):
    _log.debug("rotate_view: axis %s, angle %s", axis, angle)
    cmd.rotate(axis, angle)


def snapshot(filename: str):
    filename = filename or ""
    if not filename:
        filename = _downloads_snap_path()
    filename = str(Path(filename).expanduser())
    if not filename.lower().endswith(".png"):
        filename += ".png"
    Path(filename).parent.mkdir(parents=True, exist_ok=True)
    _log.info("Saving snapshot to: %s", filename)
    cmd.png(filename, dpi=300)


CANONICAL_FUNCTION_MAP = {}


# ---------------------------------------------------------------------------
# Snapshot path utility
# ---------------------------------------------------------------------------
def _downloads_snap_path(basename: str | None = None) -> str:
    import datetime

    base_dir = Path.home() / "Downloads" / "PyMOL_Snapshots"
    base_dir.mkdir(parents=True, exist_ok=True)
    if not basename:
        basename = f"snapshot-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    basename = Path(basename).name
    if not basename.lower().endswith(".png"):
        basename += ".png"
    return str(base_dir / basename)


def _normalize_color(color: str) -> str:
    col = (color or "").strip()
    if col.startswith("#") and len(col) == 7:
        cname = f"c_{col[1:].lower()}"
        rgb = [int(col[i : i + 2], 16) / 255 for i in (1, 3, 5)]
        cmd.set_color(cname, rgb)
        return cname
    return col.lower()


def _selection_from_target(target: dict, role: str = "target") -> str:
    selection = compile_selection_spec(target, residue_map=RES_MAP)
    kind = target["kind"]
    object_name = target.get("object")
    if object_name:
        names = set(cmd.get_names("objects"))
        if object_name not in names:
            raise ValueError(f"Unknown object '{object_name}'")
    if kind == "current_selection" and cmd.count_atoms(selection) == 0:
        raise ValueError("Current selection is empty")
    if cmd.count_atoms(selection) == 0:
        desc = describe_selection_spec(target, residue_map=RES_MAP)
        raise ValueError(f"{role.title()} selection is empty: {desc}")
    return selection


def _default_measure_name(prefix: str, *targets: dict) -> str:
    def _slug(target: dict) -> str:
        desc = describe_selection_spec(target, residue_map=RES_MAP)
        return re.sub(r"[^a-z0-9]+", "_", desc.lower()).strip("_") or "target"

    parts = [_slug(target) for target in targets]
    return f"{prefix}_{'_'.join(parts)}"


def show_representation(target: dict, representation: str):
    selection = _selection_from_target(target)
    cmd.show(representation, selection)


def hide_representation(target: dict, representation: str):
    selection = _selection_from_target(target)
    cmd.hide(representation, selection)


def isolate_selection(target: dict, representation: str | None = None):
    selection = _selection_from_target(target)
    cmd.hide("everything", "all")
    cmd.show(representation or "cartoon", selection)
    cmd.zoom(selection)


def remove_selection(target: dict):
    selection = _selection_from_target(target)
    cmd.remove(selection)


def color_selection(target: dict, color: str):
    selection = _selection_from_target(target)
    cmd.color(_normalize_color(color), selection)


def color_by_chain(target: dict):
    selection = _selection_from_target(target)
    util.chainbow(selection)


def color_by_element(target: dict):
    selection = _selection_from_target(target)
    util.cbag(selection)


def set_transparency(target: dict, value: float, representation: str = "surface"):
    selection = _selection_from_target(target)
    cmd.show(representation, selection)
    setting_name = {
        "surface": "transparency",
        "sticks": "stick_transparency",
        "cartoon": "cartoon_transparency",
        "spheres": "sphere_transparency",
    }[representation]
    cmd.set(setting_name, value, selection)


def label_selection(target: dict, mode: str = "residue", template: str | None = None):
    selection = _selection_from_target(target)
    if mode == "atom":
        expression = template or "name"
        cmd.label(selection, expression)
        return

    expression = template or '"%s-%s" % (resn,resi)'
    label_sel = f"({selection}) and name CA+P"
    if cmd.count_atoms(label_sel) == 0:
        label_sel = selection
    cmd.label(label_sel, expression)


def zoom_selection(target: dict):
    selection = _selection_from_target(target)
    cmd.zoom(selection)


def orient_selection(target: dict):
    selection = _selection_from_target(target)
    cmd.orient(selection)


def measure_distance(source: dict, target: dict, object_name: str | None = None):
    source_sel = _selection_from_target(source, role="source")
    target_sel = _selection_from_target(target, role="target")
    name = object_name or _default_measure_name("distance", source, target)
    cmd.distance(name, source_sel, target_sel)


def show_contacts(source: dict, target: dict, mode: str = "polar", object_name: str | None = None):
    source_sel = _selection_from_target(source, role="source")
    target_sel = _selection_from_target(target, role="target")
    name = object_name or _default_measure_name("contacts", source, target)
    distance_mode = 2 if mode == "polar" else 0
    cmd.distance(name, source_sel, target_sel, mode=distance_mode)


def align_objects(mobile: dict, target: dict, method: str = "align"):
    if mobile.get("kind") != "object" or target.get("kind") != "object":
        raise ValueError("align_objects requires both mobile and target to be object targets")
    mobile_sel = _selection_from_target(mobile, role="mobile")
    target_sel = _selection_from_target(target, role="target")
    if method != "align":
        raise ValueError(f"Unsupported alignment method: {method}")
    cmd.align(mobile_sel, target_sel)


def show_sequence_view():
    cmd.set("seq_view", 1)
    cmd.refresh()


def hide_sequence_view():
    cmd.set("seq_view", 0)
    cmd.refresh()


def set_sequence_view_format(format: str):
    canonical = normalize_sequence_format(format)
    cmd.set("seq_view", 1)
    cmd.set("seq_view_format", SEQUENCE_FORMAT_TO_SETTING[canonical])
    cmd.refresh()


def _selection_atom_records(selection_name: str):
    model = cmd.get_model(selection_name)
    return list(getattr(model, "atom", []) or [])


def _selection_target_from_atoms(atoms: list[object]) -> dict:
    first = atoms[0]
    same_object = all(getattr(atom, "model", "") == getattr(first, "model", "") for atom in atoms)
    same_chain = all(getattr(atom, "chain", "") == getattr(first, "chain", "") for atom in atoms)
    same_resn = all(getattr(atom, "resn", "") == getattr(first, "resn", "") for atom in atoms)
    same_resi = all(str(getattr(atom, "resi", "")) == str(getattr(first, "resi", "")) for atom in atoms)
    same_name = all(getattr(atom, "name", "") == getattr(first, "name", "") for atom in atoms)

    if len(atoms) == 1 or (same_object and same_chain and same_resn and same_resi and same_name):
        target = {
            "kind": "atom",
            "atom": getattr(first, "name", ""),
            "residue": getattr(first, "resn", ""),
            "resi": str(getattr(first, "resi", "")),
        }
        if getattr(first, "chain", ""):
            target["chain"] = getattr(first, "chain", "")
        if getattr(first, "model", ""):
            target["object"] = getattr(first, "model", "")
        return target

    if same_object and same_chain and same_resn and same_resi:
        target = {
            "kind": "residue",
            "residue": getattr(first, "resn", ""),
            "resi": str(getattr(first, "resi", "")),
        }
        if getattr(first, "chain", ""):
            target["chain"] = getattr(first, "chain", "")
        if getattr(first, "model", ""):
            target["object"] = getattr(first, "model", "")
        return target

    if same_object and getattr(first, "model", ""):
        return {"kind": "object", "object": getattr(first, "model", "")}

    return {"kind": "current_selection"}


def _selection_tag_label(target: dict, count: int) -> str:
    kind = target.get("kind")
    if kind == "atom":
        base = f"{target.get('residue', '')}{target.get('resi', '')}".strip()
        chain = target.get("chain")
        prefix = f"{chain}:" if chain else ""
        return f"@{prefix}{base}:{target.get('atom', '')}".rstrip(":")
    if kind == "residue":
        base = f"{target.get('residue', '')}{target.get('resi', '')}".strip()
        chain = target.get("chain")
        prefix = f"{chain}:" if chain else ""
        return f"@{prefix}{base}"
    if kind == "object":
        return f"@obj:{target.get('object', '')}"
    return f"@selection[{count}]"


def _current_selection_info() -> dict | None:
    for selection_name in ("sele", "pk1", "pk2", "pk3", "pk4"):
        if cmd.count_atoms(selection_name) == 0:
            continue
        atoms = _selection_atom_records(selection_name)
        if not atoms:
            continue
        target = _selection_target_from_atoms(atoms)
        count = len(atoms)
        return {
            "label": _selection_tag_label(target, count),
            "description": describe_selection_spec(target, residue_map=RES_MAP),
            "target": target,
            "source": selection_name,
            "count": count,
        }
    return None


CANONICAL_FUNCTION_MAP = {
    "show_representation": show_representation,
    "hide_representation": hide_representation,
    "isolate_selection": isolate_selection,
    "remove_selection": remove_selection,
    "color_selection": color_selection,
    "color_by_chain": color_by_chain,
    "color_by_element": color_by_element,
    "set_transparency": set_transparency,
    "label_selection": label_selection,
    "zoom_selection": zoom_selection,
    "orient_selection": orient_selection,
    "measure_distance": measure_distance,
    "show_contacts": show_contacts,
    "align_objects": align_objects,
    "show_sequence_view": show_sequence_view,
    "hide_sequence_view": hide_sequence_view,
    "set_sequence_view_format": set_sequence_view_format,
}


# ---------------------------------------------------------------------------
# WebSocket ACK
# ---------------------------------------------------------------------------
def _ws_send_ack(msg_id, ok, error=None):
    """Send an execution ACK back to the bridge."""
    if not msg_id:
        return
    try:
        payload = {"id": msg_id, "ok": bool(ok)}
        if error:
            payload["error"] = str(error)
        _ws_send_json(payload)
    except Exception as exc:
        _log.debug("Failed to send ACK: %s", exc)


def _ws_send_json(payload: dict):
    """Send a JSON payload over the active websocket connection."""
    text = json.dumps(payload)
    with _ws_lock:
        ws = _ws_conn
        if ws is not None:
            ws.send(text)


def _temp_session_path() -> str:
    """Create a temporary path for a native PyMOL session file."""
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix="pymol-ai-session-", suffix=".pse", dir=str(_CONFIG_DIR))
    os.close(fd)
    return path


def _run_in_pymol_thread(func):
    """Run a callable on PyMOL's main Qt thread when available."""
    if _main_thread_caller is not None:
        return _main_thread_caller(func)
    return func()


# ---------------------------------------------------------------------------
# Command execution
# ---------------------------------------------------------------------------
def _execute_spec(spec: dict):
    """Execute a JSON spec: {name: str, arguments: {..}}."""
    try:
        if not isinstance(spec, dict):
            _log.debug("Ignoring non-dict message: %r", spec)
            return

        mid = spec.get("id")

        # Natural language envelope
        if spec.get("name") == "nl_prompt":
            args = spec.get("arguments") or {}
            prompt = args.get("text") or spec.get("prompt") or ""
            if not prompt:
                _log.warning("nl_prompt missing 'text'")
                _ws_send_ack(mid, ok=False, error="nl_prompt missing text")
                return
            try:
                llm_spec = _call_llm(prompt)
                if isinstance(llm_spec, dict):
                    llm_spec.setdefault("id", mid)
                _log.info("NL → spec: %s", llm_spec)
                return _execute_spec(llm_spec)
            except Exception as exc:
                _log.error("nl_prompt failed: %s\n%s", exc, traceback.format_exc())
                _ws_send_ack(mid, ok=False, error=str(exc))
                return

        # Session capture (for project save)
        if spec.get("name") == "get_session":
            session_path = None
            try:
                session_path = _temp_session_path()
                def _capture_session():
                    cmd.save(session_path, format="pse")
                    cmd.sync(timeout=60.0)

                _run_in_pymol_thread(_capture_session)
                encoded = base64.b64encode(Path(session_path).read_bytes()).decode("ascii")
                _ws_send_ack(mid, ok=True, error=None)
                # Send session data as a separate message
                _ws_send_json({"type": "session_data", "id": mid, "data": encoded})
            except Exception as exc:
                _log.error("get_session failed: %s", exc)
                _ws_send_ack(mid, ok=False, error=str(exc))
            finally:
                try:
                    if session_path:
                        Path(session_path).unlink(missing_ok=True)
                except Exception:
                    pass
            return

        # Session restore (for project load)
        if spec.get("name") == "set_session":
            session_path = None
            try:
                data = spec.get("arguments", {}).get("data", "")
                if not data:
                    raise RuntimeError("session data required")
                session_path = _temp_session_path()
                Path(session_path).write_bytes(base64.b64decode(data))
                def _restore_session():
                    cmd.delete("all")
                    cmd.deselect()
                    cmd.load(session_path)
                    cmd.sync(timeout=45.0)
                    cmd.deselect()
                    cmd.refresh()

                _run_in_pymol_thread(_restore_session)
                _ws_send_ack(mid, ok=True)
            except Exception as exc:
                _log.error("set_session failed: %s", exc)
                _ws_send_ack(mid, ok=False, error=str(exc))
            finally:
                try:
                    if session_path:
                        Path(session_path).unlink(missing_ok=True)
                except Exception:
                    pass
            return

        if spec.get("name") == "clear_workspace":
            try:
                def _clear_workspace():
                    cmd.delete("all")
                    cmd.deselect()
                    cmd.sync(timeout=15.0)
                    cmd.refresh()

                _run_in_pymol_thread(_clear_workspace)
                _ws_send_ack(mid, ok=True)
            except Exception as exc:
                _log.error("clear_workspace failed: %s", exc)
                _ws_send_ack(mid, ok=False, error=str(exc))
            return

        if spec.get("name") == "get_selection_info":
            try:
                info = _run_in_pymol_thread(_current_selection_info)
                _ws_send_ack(mid, ok=True)
                _ws_send_json({"type": "selection_data", "id": mid, "selection": info})
            except Exception as exc:
                _log.error("get_selection_info failed: %s", exc)
                _ws_send_ack(mid, ok=False, error=str(exc))
            return

        normalized = normalize_command_spec(spec, residue_map=RES_MAP)
        name = normalized["name"]
        args = normalized.get("arguments") or {}

        if name == "fetch_pdb":
            try:
                pdb_id = args.get("pdb_id", "")
                if not pdb_id:
                    _ws_send_ack(mid, ok=False, error="pdb_id required")
                    return
                cmd.fetch(pdb_id)
                _log.info("Fetched PDB: %s", pdb_id)
                _ws_send_ack(mid, ok=True)
            except Exception as exc:
                _log.error("fetch_pdb failed: %s", exc)
                _ws_send_ack(mid, ok=False, error=str(exc))
            return

        if name == "load_file":
            try:
                file_path = args.get("file_path", "")
                if not file_path or not Path(file_path).exists():
                    _ws_send_ack(mid, ok=False, error="File not found")
                    return
                cmd.load(file_path)
                _log.info("Loaded file: %s", file_path)
                _ws_send_ack(mid, ok=True)
            except Exception as exc:
                _log.error("load_file failed: %s", exc)
                _ws_send_ack(mid, ok=False, error=str(exc))
            return

        if name == "set_background":
            set_background(args.get("color", ""))
            _ws_send_ack(mid, ok=True)
            return

        if name == "snapshot":
            snapshot(args.get("filename", ""))
            _ws_send_ack(mid, ok=True)
            return

        if name == "rotate_view":
            if "axis" in args and "angle" in args:
                rotate_view(args["axis"], args["angle"])
                _ws_send_ack(mid, ok=True)
                return
            if "rotation" in args and isinstance(args["rotation"], (list, tuple)):
                rot = args["rotation"]
                for idx, val in enumerate(rot):
                    if isinstance(val, (int, float)) and val != 0:
                        axis = ["X", "Y", "Z"][idx]
                        rotate_view(axis, val)
                _ws_send_ack(mid, ok=True)
                return
            axes = ["x", "y", "z"]
            handled = False
            for key in axes:
                if key in args and isinstance(args[key], (int, float)):
                    rotate_view(key.upper(), args[key])
                    handled = True
                elif f"rotate_{key}" in args and isinstance(
                    args[f"rotate_{key}"], (int, float)
                ):
                    rotate_view(key.upper(), args[f"rotate_{key}"])
                    handled = True
            if handled:
                _ws_send_ack(mid, ok=True)
                return
            raise ValueError("rotate_view requires axis/angle or rotation values")

        func = CANONICAL_FUNCTION_MAP.get(name)
        if not func:
            _log.warning("Unknown action: %s", name)
            _ws_send_ack(mid, ok=False, error=f"Unknown action: {name}")
            return

        sig = inspect.signature(func)
        filtered = {k: v for k, v in args.items() if k in sig.parameters}
        _log.info("Executing %s(%s)", name, filtered)
        func(**filtered)
        _ws_send_ack(mid, ok=True)
    except Exception as exc:
        _log.error("Execution error: %s\n%s", exc, traceback.format_exc())
        _ws_send_ack(spec.get("id"), ok=False, error=str(exc))


# ---------------------------------------------------------------------------
# WebSocket loop (bridge → plugin)
# ---------------------------------------------------------------------------
def _ws_loop():
    """Background loop: connect to FastAPI bridge and receive JSON commands."""
    global _ws_conn, _connected_logged

    if websocket is None:
        _log.error(
            "websocket-client not available; "
            "pip install websocket-client in PyMOL's Python"
        )
        return

    backoff = 2.0  # seconds between reconnects

    while not _shutting_down:
        ws = None
        try:
            ws = websocket.create_connection(BRIDGE_URL, timeout=5)
            with _ws_lock:
                _ws_conn = ws

            if not _connected_logged:
                _log.info("Connected to bridge.")
                _connected_logged = True
            else:
                _log.debug("Reconnected to bridge.")

            backoff = 2.0  # reset on success

            while not _shutting_down:
                msg = ws.recv()
                if not msg:
                    break
                try:
                    spec = json.loads(msg)
                except Exception as exc:
                    _log.debug("Bad JSON from bridge: %s: %r", exc, msg)
                    continue
                _execute_spec(spec)

        except Exception as exc:
            if not _shutting_down:
                _log.debug("Bridge connection failed: %s", exc)
                time.sleep(backoff)
                backoff = min(backoff * 1.5, 30)
        finally:
            try:
                if ws is not None:
                    with _ws_lock:
                        if _ws_conn is ws:
                            _ws_conn = None
                    ws.close()
            except Exception:
                pass


def _heartbeat_loop():
    """Keep the websocket marked as live even while long commands are running."""
    while not _shutting_down:
        time.sleep(10.0)
        try:
            _ws_send_json({"type": "heartbeat", "ts": time.time()})
        except Exception as exc:
            _log.debug("Heartbeat send failed: %s", exc)
            with _ws_lock:
                ws = _ws_conn
                _ws_conn = None
            try:
                if ws is not None:
                    ws.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------
def _call_llm(prompt: str) -> dict:
    """Send a natural language prompt to OpenAI and return a command spec."""
    _log.debug("LLM prompt: %s", prompt)
    client = _get_openai_client()

    system_msg = (
        "You are a PyMOL assistant. The user asks for exactly one simple action. "
        f"If the request contains multiple actions, respond with JSON error text: {json.dumps(ONLY_ONE_ACTION_ERROR)}.\n"
        "Respond with exactly one JSON OBJECT with keys:\n"
        " • name: one of "
        + ", ".join(f'"{k}"' for k in sorted(CANONICAL_ACTIONS | {"set_background", "rotate_view", "snapshot"}))
        + "\n"
        " • arguments: an OBJECT of keyword arguments.\n"
        "SelectionSpec shapes:\n"
        ' • {"kind":"all"}\n'
        ' • {"kind":"protein"}\n'
        ' • {"kind":"ligand"}\n'
        ' • {"kind":"water"}\n'
        ' • {"kind":"metals"}\n'
        ' • {"kind":"hydrogens"}\n'
        ' • {"kind":"current_selection"}\n'
        ' • {"kind":"chain","chain":"A","object":"1crn"}\n'
        ' • {"kind":"residue","residue":"ASP","resi":"21","chain":"B","object":"1crn"}\n'
        ' • {"kind":"atom","atom":"CA","residue":"ASP","resi":"21","chain":"B","object":"1crn"}\n'
        ' • {"kind":"object","object":"my_obj"}\n'
        "Sequence commands:\n"
        ' • {"name":"show_sequence_view","arguments":{}}\n'
        ' • {"name":"hide_sequence_view","arguments":{}}\n'
        ' • {"name":"set_sequence_view_format","arguments":{"format":"residue_codes"}}\n'
        "Use canonical command names instead of legacy names like color_residue or set_cartoon.\n"
        "If the user message includes a selection tag mapping, use the mapped SelectionSpec exactly.\n"
        "Do not return arrays. Do not chain actions. Examples:\n"
        ' remove waters -> {"name":"remove_selection","arguments":{"target":{"kind":"water"}}}\n'
        ' measure distance between selected -> {"name":"measure_distance","arguments":{"source":{"kind":"current_selection"},"target":{"kind":"current_selection"}}}\n'
        ' show ligand as sticks -> {"name":"show_representation","arguments":{"target":{"kind":"ligand"},"representation":"sticks"}}\n'
        ' show sequence -> {"name":"show_sequence_view","arguments":{}}\n'
        ' show sequence as residue names -> {"name":"set_sequence_view_format","arguments":{"format":"residue_names"}}\n'
        ' label residues in chain A -> {"name":"label_selection","arguments":{"target":{"kind":"chain","chain":"A"},"mode":"residue"}}\n'
        ' set surface transparency to 0.4 on protein -> {"name":"set_transparency","arguments":{"target":{"kind":"protein"},"representation":"surface","value":0.4}}\n'
        ' measure distance between ligand and residue ASP in chain B -> {"name":"measure_distance","arguments":{"source":{"kind":"ligand"},"target":{"kind":"residue","residue":"ASP","chain":"B"}}}\n'
        ' align object ligand_pose to object receptor -> {"name":"align_objects","arguments":{"mobile":{"kind":"object","object":"ligand_pose"},"target":{"kind":"object","object":"receptor"},"method":"align"}}'
    )

    resp = client.chat.completions.create(
        model=_get_openai_model(),
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_completion_tokens=200,
    )
    content = resp.choices[0].message.content.strip()
    _log.debug("LLM raw response: %s", content)
    spec = json.loads(content)
    if isinstance(spec, str):
        raise RuntimeError(spec)
    if not isinstance(spec, dict):
        raise RuntimeError("Malformed LLM response")
    return spec


# ---------------------------------------------------------------------------
# Subprocess management (cross-platform)
# ---------------------------------------------------------------------------
def _is_bridge_running() -> bool:
    """Check if the bridge server is reachable."""
    try:
        import urllib.request

        req = urllib.request.Request(f"{BRIDGE_HTTP}/health", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def _bridge_supports_required_routes() -> bool:
    """Check whether the running bridge exposes the session endpoints the UI needs."""
    try:
        import urllib.request

        req = urllib.request.Request(f"{BRIDGE_HTTP}/openapi.json", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status != 200:
                return False
            data = json.loads(resp.read().decode("utf-8"))
        paths = data.get("paths", {})
        required = {"/session/capture", "/session/restore", "/session/clear"}
        return required.issubset(paths.keys())
    except Exception:
        return False


def _stop_bridge_on_port():
    """Stop any process currently listening on the bridge port."""
    if _IS_WINDOWS:
        try:
            output = subprocess.check_output(
                ["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL
            )
            pids = set()
            for line in output.splitlines():
                if ":5179" not in line or "LISTENING" not in line.upper():
                    continue
                parts = line.split()
                if parts:
                    pids.add(parts[-1])
            for pid in pids:
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
        except Exception as exc:
            _log.warning("Failed to stop outdated bridge on port 5179: %s", exc)
        return

    try:
        output = subprocess.check_output(
            ["lsof", "-ti", "tcp:5179"], text=True, stderr=subprocess.DEVNULL
        )
        for pid in {line.strip() for line in output.splitlines() if line.strip()}:
            subprocess.run(
                ["kill", "-TERM", pid],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
    except Exception as exc:
        _log.warning("Failed to stop outdated bridge on port 5179: %s", exc)


def _wait_for_bridge_shutdown(timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not _is_bridge_running():
            return True
        time.sleep(0.25)
    return not _is_bridge_running()


def _get_venv_python() -> str:
    """Return path to the Python executable in the bridge venv."""
    venv_dir = _BRIDGE_DIR / ".venv"
    if _IS_WINDOWS:
        python = venv_dir / "Scripts" / "python.exe"
    else:
        python = venv_dir / "bin" / "python"
    if python.exists():
        return str(python)
    # Fallback: system python
    return sys.executable


def _get_configured_executable(config_key: str, *fallbacks: str) -> str:
    """Resolve an executable from config, PATH, or common install locations."""
    cfg = _read_config()
    configured = (cfg.get(config_key) or "").strip()
    candidates = []
    if configured:
        candidates.append(configured)

    for fallback in fallbacks:
        if not fallback:
            continue
        resolved = shutil.which(fallback)
        if resolved:
            candidates.append(resolved)
        candidates.append(fallback)

    seen = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        path = Path(candidate).expanduser()
        if path.is_file() and os.access(str(path), os.X_OK):
            return str(path)
    return ""


def _build_subprocess_env(*exe_paths: str) -> dict:
    """
    Preserve the environment but prepend executable directories to PATH.
    PyMOL app launches often start with a stripped PATH on macOS.
    """
    env = os.environ.copy()
    # Some launch contexts export this, which forces Electron into plain Node mode.
    env.pop("ELECTRON_RUN_AS_NODE", None)
    path_entries = env.get("PATH", "").split(os.pathsep) if env.get("PATH") else []

    for exe_path in exe_paths:
        if not exe_path:
            continue
        exe_dir = str(Path(exe_path).expanduser().parent)
        if exe_dir and exe_dir not in path_entries:
            path_entries.insert(0, exe_dir)

    env["PATH"] = os.pathsep.join(path_entries)
    return env


def _open_process_log(filename: str):
    """Open a persistent log file for background subprocess output."""
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    return open(_CONFIG_DIR / filename, "a", encoding="utf-8")


def _get_electron_binary() -> str:
    """Return the platform-specific Electron binary installed in node_modules."""
    base = _ELECTRON_DIR / "node_modules" / "electron" / "dist"
    if _IS_WINDOWS:
        candidate = base / "electron.exe"
    elif platform.system() == "Darwin":
        candidate = base / "Electron.app" / "Contents" / "MacOS" / "Electron"
    else:
        candidate = base / "electron"
    return str(candidate) if candidate.exists() else ""


def _start_bridge():
    """Start the bridge server as a background subprocess."""
    global _bridge_proc
    if _bridge_proc is not None and _bridge_proc.poll() is None:
        _log.debug("Bridge already running (pid %d)", _bridge_proc.pid)
        return

    python_exe = _get_venv_python()
    main_py = str(_BRIDGE_DIR / "main.py")

    _log.info("Starting bridge server...")
    try:
        kwargs = {
            "cwd": str(_BRIDGE_DIR),
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if _IS_WINDOWS:
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

        _bridge_proc = subprocess.Popen(
            [python_exe, main_py],
            **kwargs,
        )
        _log.info("Bridge started (pid %d)", _bridge_proc.pid)
    except Exception as exc:
        _log.error("Failed to start bridge: %s", exc)


def _start_electron():
    """Start the Electron desktop UI as a background subprocess."""
    global _electron_proc, _electron_log_handle
    if _electron_proc is not None and _electron_proc.poll() is None:
        _log.debug("Electron UI already running (pid %d)", _electron_proc.pid)
        return

    if not (_ELECTRON_DIR / "package.json").exists():
        _log.error("Electron UI not found at %s", _ELECTRON_DIR)
        return

    if not (_ELECTRON_DIR / "node_modules").exists():
        _log.error(
            "node_modules not found. Run: cd %s && npm install", _ELECTRON_DIR
        )
        return

    dist_index = _ELECTRON_DIR / "dist" / "index.html"
    if not dist_index.exists():
        _log.error(
            "Electron UI build not found at %s. Re-run install.sh to build it.",
            dist_index,
        )
        return

    _log.info("Starting Electron UI...")
    try:
        node_cmd = _get_configured_executable(
            "node_path",
            "node.exe" if _IS_WINDOWS else "node",
            "node",
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
        )
        electron_bin = _get_electron_binary()
        if not electron_bin:
            _log.error(
                "Failed to start Electron UI: Electron binary not found under node_modules. "
                "Re-run install.sh."
            )
            return
        kwargs = {
            "cwd": str(_ELECTRON_DIR),
            "env": _build_subprocess_env(node_cmd),
        }
        if _electron_log_handle is not None:
            try:
                _electron_log_handle.close()
            except Exception:
                pass
        _electron_log_handle = _open_process_log("electron-ui.log")
        kwargs["stdout"] = _electron_log_handle
        kwargs["stderr"] = _electron_log_handle
        if _IS_WINDOWS:
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

        _electron_proc = subprocess.Popen(
            [electron_bin, "."],
            **kwargs,
        )
        _log.info("Electron UI started (pid %d)", _electron_proc.pid)
    except Exception as exc:
        _log.error("Failed to start Electron UI: %s", exc)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
def _cleanup():
    """Terminate bridge and Electron subprocesses."""
    global _shutting_down
    _shutting_down = True

    for name, proc in [("bridge", _bridge_proc), ("Electron", _electron_proc)]:
        if proc is not None and proc.poll() is None:
            _log.debug("Terminating %s (pid %d)...", name, proc.pid)
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            except Exception:
                pass

    global _electron_log_handle
    if _electron_log_handle is not None:
        try:
            _electron_log_handle.close()
        except Exception:
            pass
        _electron_log_handle = None


atexit.register(_cleanup)


# ---------------------------------------------------------------------------
# Unified `ai` launcher — the ONLY entry point
# ---------------------------------------------------------------------------
def _launch_system(args_str=""):
    """
    The ``ai`` command handler. Starts bridge + Electron + WebSocket listener.
    Usage in PyMOL: ``ai``
    """
    global _ws_thread, _heartbeat_thread

    _log.info("Launching PyMOL AI Assistant...")

    # 1. Start bridge if not running
    bridge_running = _is_bridge_running()
    if bridge_running and not _bridge_supports_required_routes():
        _log.info("Existing bridge is outdated. Restarting bridge server...")
        _stop_bridge_on_port()
        _wait_for_bridge_shutdown()
        bridge_running = _is_bridge_running()

    if not bridge_running:
        _start_bridge()
        # Wait a moment for the bridge to come up
        for _ in range(15):
            time.sleep(0.5)
            if _is_bridge_running():
                break
        else:
            _log.warning(
                "Bridge may not have started. "
                "Check that pymol-bridge/.venv is set up correctly."
            )

    # 2. Start Electron UI
    _start_electron()

    # 3. Start WebSocket listener thread
    if _ws_thread is None or not _ws_thread.is_alive():
        _ws_thread = threading.Thread(target=_ws_loop, daemon=True)
        _ws_thread.start()
        _log.info("WebSocket listener started.")
    else:
        _log.debug("WebSocket listener already running.")

    if _heartbeat_thread is None or not _heartbeat_thread.is_alive():
        _heartbeat_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
        _heartbeat_thread.start()
        _log.info("WebSocket heartbeat started.")

    _log.info("System launched. Use the Electron UI to send commands.")


# Register the `ai` command
cmd.extend("ai", _launch_system)

_log.info("Plugin loaded. Type 'ai' in PyMOL to start.")
