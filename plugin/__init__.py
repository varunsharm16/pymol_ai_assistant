# cat << 'EOF' > ~/.pymol/Plugins/pymol_ai_assistant/__init__.py
print("[AI-BRIDGE] Plugin LOADED from:", __file__)
import os, json, inspect, re
from PyQt5 import QtWidgets
from pymol import cmd
import threading, time, traceback

# DEBUG: prove this is the file being loaded
print("[AI-BRIDGE] Loading plugin from:", __file__)

# Ensure PyMOL sees your user site-packages BEFORE importing websocket
import sys
_site_dir = os.path.expanduser("~/.pymol/site-packages")
if _site_dir not in sys.path:
    sys.path.insert(0, _site_dir)
print("[AI-BRIDGE] sys.path[0:3]:", sys.path[:3])

key_path = os.path.expanduser("~/.pymol/openai_api_key.txt")
with open(key_path) as f:
    api_key = f.read().strip()

import websocket  # <-- must come AFTER the sys.path insert
from openai import OpenAI

client = OpenAI(api_key=api_key)

# One-letter → three-letter map for residues
RES_MAP = {
    'A':'ALA','C':'CYS','D':'ASP','E':'GLU','F':'PHE',
    'G':'GLY','H':'HIS','I':'ILE','K':'LYS','L':'LEU',
    'M':'MET','N':'ASN','P':'PRO','Q':'GLN','R':'ARG',
    'S':'SER','T':'THR','V':'VAL','W':'TRP','Y':'TYR'
}

# —— Helper functions ——
def color_residue(residue: str, chain: str, color: str):
    cmd.deselect()
    raw = residue.upper()
    chain = chain.upper() if chain else ''
    # Strip parentheses
    if "(" in raw and ")" in raw:
        raw = raw.split("(",1)[1].split(")",1)[0]
    # Keep only letters
    raw = "".join(re.findall(r"[A-Z]", raw))
    # Map one-letter codes
    if len(raw) == 1 and raw in RES_MAP:
        raw = RES_MAP[raw]
    sel = f"resn {raw}" + (f" and chain {chain}" if chain else "")
    print(f"[DEBUG] color_residue selection: {sel}, color: {color}")
    cmd.color(color, sel)

def color_chain(chain: str, color: str):
    chain = chain.upper()
    print(f"[DEBUG] color_chain: chain {chain}, color: {color}")
    # Special-case 'ALL' to color everything
    if chain == "ALL":
        cmd.color(color, "all")
    else:
        cmd.color(color, f"chain {chain}")

def color_all(color: str):
    print(f"[DEBUG] color_all: color {color}")
    cmd.color(color, "all")

def set_background(color: str):
    print(f"[DEBUG] set_background: color {color}")
    cmd.bg_color(color)

def rotate_view(axis: str, angle: float):
    print(f"[DEBUG] rotate_view: axis {axis}, angle {angle}")
    cmd.rotate(axis, angle)

def set_cartoon(representation: str):
    print(f"[DEBUG] set_cartoon: representation {representation}")
    cmd.hide("everything", "all")
    cmd.show(representation, "all")

def snapshot(filename: str):
    filename = filename or ""
    # If a filename is provided (e.g., from bridge/UI), save directly without opening a Qt dialog.
    if filename:
        path = filename
        if not path.lower().endswith(".png"):
            path += ".png"
        print(f"[DEBUG] Saving snapshot to: {path}")
        cmd.png(path, dpi=300)
        return

    # Otherwise, interactive dialog (PyMOL UI usage)
    options = QtWidgets.QFileDialog.Options()
    path, _ = QtWidgets.QFileDialog.getSaveFileName(
        None,
        "Save Snapshot As…",
        "snapshot.png",
        "PNG Files (*.png);;All Files (*)",
        options=options
    )
    if not path:
        print("[DEBUG] snapshot canceled by user.")
        return
    if not path.lower().endswith(".png"):
        path += ".png"
    print(f"[DEBUG] Saving snapshot to: {path}")
    cmd.png(path, dpi=300)
    QtWidgets.QMessageBox.information(None, "AI Assistant", f"Snapshot saved to:\n{path}")


FUNCTION_MAP = {
    "color_residue": color_residue,
    "color_chain":   color_chain,
    "color_all":     color_all,
    "set_background": set_background,
    "rotate_view":    rotate_view,
    "set_cartoon":    set_cartoon,
    "snapshot":       snapshot,
}

# --- Snapshot path utility: always use ~/Downloads/PyMOL_Snapshots ---
def _downloads_snap_path(basename: str | None = None) -> str:
    import datetime
    base_dir = os.path.expanduser("~/Downloads/PyMOL_Snapshots")
    os.makedirs(base_dir, exist_ok=True)
    if not basename:
        basename = f"snapshot-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    # strip directories and enforce .png
    basename = os.path.basename(basename)
    if not basename.lower().endswith('.png'):
        basename += '.png'
    return os.path.join(base_dir, basename)


# ---- Normalization used for both UI and bridge paths ----
def _normalize_action(name: str, args: dict, original_text: str = "") -> dict:
    if not isinstance(args, dict):
        return {}

    # British colour → color
    if "colour" in args and "color" not in args:
        args["color"] = args.pop("colour")

    # residue_name → residue
    if "residue_name" in args and "residue" not in args:
        args["residue"] = args.pop("residue_name")

    # color_residue requires residue & chain keys to exist
    if name == "color_residue":
        args.setdefault("residue", "")
        args.setdefault("chain", "")
        if isinstance(args.get("chain"), str):
            args["chain"] = args["chain"].upper()

    # color_chain: normalize chain
    if name == "color_chain" and isinstance(args.get("chain"), str):
        args["chain"] = args["chain"].upper()

    # snapshot: default filename if missing
    if name == "snapshot":
        args.setdefault("filename", "")

    # set_cartoon: alias “cartoon_type”/“style” → representation + default
    if name == "set_cartoon":
        if "cartoon_type" in args and "representation" not in args:
            args["representation"] = args.pop("cartoon_type")
        if "style" in args and "representation" not in args:
            args["representation"] = args.pop("style")
        args.setdefault("representation", "cartoon")

    # hex colors → named via set_color
    col = args.get("color")
    if isinstance(col, str) and col.startswith("#") and len(col) == 7:
        try:
            cname = f"c_{col[1:].lower()}"
            rgb = [int(col[i:i+2], 16)/255 for i in (1,3,5)]
            cmd.set_color(cname, rgb)
            args["color"] = cname
        except Exception:
            pass

    return args

# --- Bridge (WebSocket → receives JSON commands from local FastAPI) ---
BRIDGE_URL = "ws://127.0.0.1:5179/bridge"
_ws_thread = None

_ws_conn = None
_ws_lock = threading.Lock()

def _ws_send_ack(msg_id, ok, error=None):
    """Send an execution ACK back to the FastAPI bridge so HTTP callers know the result."""
    if not msg_id:
        return
    try:
        payload = {"id": msg_id, "ok": bool(ok)}
        if error:
            payload["error"] = str(error)
        # snapshot the current ws under lock
        with _ws_lock:
            ws = _ws_conn
        if ws is not None:
            ws.send(json.dumps(payload))
    except Exception as e:
        print(f"[AI-BRIDGE] Failed to send ACK: {e}")



def _execute_spec(spec: dict):
    """Execute a JSON spec of the shape {"name": str, "arguments": {..}} using FUNCTION_MAP."""
    try:
        if not isinstance(spec, dict):
            print(f"[AI-BRIDGE] Ignoring non-dict message: {spec!r}")
            return
        mid = spec.get("id")
        # ---- Natural language envelope: let UI send raw text, plugin does LLM+normalize ----
        if spec.get("name") == "nl_prompt":
            # Accept either { name:"nl_prompt", arguments:{ text:"..." } } or { name:"nl_prompt", prompt:"..." }
            args = spec.get("arguments") or {}
            prompt = args.get("text") or spec.get("prompt") or ""
            if not prompt:
                print("[AI-BRIDGE] nl_prompt missing 'text' or 'prompt'")
                _ws_send_ack(mid, ok=False, error="nl_prompt missing text")
                return
            try:
                llm_spec = call_llm(prompt)  # expects {"name": ..., "arguments": {...}}
                if isinstance(llm_spec, dict):
                    llm_spec.setdefault("id", mid)
                print(f"[AI-BRIDGE] nl → spec: {llm_spec}")
                return _execute_spec(llm_spec)  # delegate to the structured executor below
            except Exception as e:
                print(f"[AI-BRIDGE][ERROR] nl_prompt failed: {e}\n{traceback.format_exc()}")
                return
        name = (spec.get("name") or "").lower()
        args = _normalize_action(name, (spec.get("arguments") or {}))
        # Force ALL snapshots into ~/Downloads/PyMOL_Snapshots (use provided basename if any)
        if name == "snapshot":
            try:
                args = dict(args or {})
                user_name = args.get("filename") if isinstance(args.get("filename"), str) else None
                args["filename"] = _downloads_snap_path(user_name)
                print(f"[AI-BRIDGE] Snapshot path forced to: {args['filename']}")
            except Exception as _e:
                print(f"[AI-BRIDGE] Failed to prepare snapshot path: {_e}")
        func = FUNCTION_MAP.get(name)
        if not func:
            print(f"[AI-BRIDGE] Unknown action: {name}")
            _ws_send_ack(mid, ok=False, error=f"Unknown action: {name}")
            return
        # Filter kwargs to match the function signature (avoid unexpected keys)
        sig = inspect.signature(func)
        filtered = {k: v for k, v in args.items() if k in sig.parameters}
        print(f"[AI-BRIDGE] Executing {name}({filtered})")
        # Special rotate_view handling for various argument forms
        if name == "rotate_view":
            # handle single-axis rotate
            if "axis" in args and "angle" in args:
                print(f"[DEBUG] performing single-axis rotate with: {args['axis']}, {args['angle']}")
                rotate_view(args['axis'], args['angle'])
                _ws_send_ack(mid, ok=True)
                return
            # handle list rotation values
            if "rotation" in args and isinstance(args["rotation"], (list, tuple)):
                rot = args["rotation"]
                print(f"[DEBUG] handling list rotation: {rot}")
                for idx, val in enumerate(rot):
                    if isinstance(val, (int, float)) and val != 0:
                        axis = ['X','Y','Z'][idx]
                        print(f"[DEBUG] list rotate axis {axis} val {val}")
                        rotate_view(axis, val)
                _ws_send_ack(mid, ok=True)
                return
            # handle multi-axis keys
            axes = ['x','y','z']
            handled = False
            for key in axes:
                if key in args and isinstance(args[key], (int, float)):
                    print(f"[DEBUG] multi-axis rotate {key.upper()} val {args[key]}")
                    rotate_view(key.upper(), args[key])
                    handled = True
                elif f'rotate_{key}' in args and isinstance(args[f'rotate_{key}'], (int, float)):
                    print(f"[DEBUG] multi-axis rotate rotate_{key.upper()} val {args[f'rotate_{key}']}")
                    rotate_view(key.upper(), args[f'rotate_{key}'])
                    handled = True
            if handled:
                _ws_send_ack(mid, ok=True)
                return
        func(**filtered)
        _ws_send_ack(mid, ok=True)
    except Exception as e:
        print(f"[AI-BRIDGE][ERROR] {e}\n{traceback.format_exc()}")
        _ws_send_ack(spec.get("id"), ok=False, error=str(e))


def _ws_loop():
    """Background loop: connect to FastAPI bridge and receive JSON commands."""
    global _ws_conn
    if websocket is None:
        print("[AI-BRIDGE] websocket-client not available; please `pip install websocket-client` in PyMOL's Python")
        return
    while True:
        ws = None
        try:
            ws = websocket.create_connection(BRIDGE_URL, timeout=5)
            with _ws_lock:
                _ws_conn = ws
            print("[AI-BRIDGE] Connected.")
            while True:
                msg = ws.recv()
                if not msg:
                    break
                # Expect JSON text
                try:
                    spec = json.loads(msg)
                except Exception as e:
                    print(f"[AI-BRIDGE] Bad JSON from bridge: {e}: {msg!r}")
                    continue
                _execute_spec(spec)
        except Exception as e:
            print(f"[AI-BRIDGE] Disconnected or failed to connect: {e}")
            time.sleep(2.0)  # small backoff before retry
        finally:
            try:
                if ws is not None:
                    with _ws_lock:
                        if _ws_conn is ws:
                            _ws_conn = None
                    ws.close()
            except Exception:
                pass


def call_llm(prompt: str):
    print(f"[DEBUG] call_llm prompt: {prompt}")
    system_msg = (
        "You are a PyMOL assistant. The user asks for one simple action. "
        "Respond with exactly one JSON OBJECT with keys:\n"
        " • name: one of " + ", ".join(f"\"{k}\"" for k in FUNCTION_MAP.keys()) + "\n"
        " • arguments: an OBJECT of keyword arguments.\n"
        "No arrays or extra keys. Examples:\n"
        "  Color C in chain A magenta → {\"name\":\"color_residue\",\"arguments\":{\"residue\":\"C\",\"chain\":\"A\",\"color\":\"magenta\"}}"
    )
    resp = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role":"system","content":system_msg},
            {"role":"user","content":prompt},
        ],
        temperature=0.1,
        max_tokens=200,
    )
    content = resp.choices[0].message.content.strip()
    print(f"[DEBUG] call_llm raw response: {content}")
    spec = json.loads(content)
    print(f"[DEBUG] call_llm parsed spec: {spec}")
    return spec

def launch_ui():
    text, ok = QtWidgets.QInputDialog.getText(
        None, "AI Assistant", "Describe a single PyMOL action:"
    )
    if not ok or not text.strip():
        print("[DEBUG] launch_ui canceled or empty input.")
        return
    try:
        spec = call_llm(text)
        print(f"[DEBUG] spec after call_llm: {spec}")
        args = spec.get("arguments", {}) or {}
        print(f"[DEBUG] initial args: {args}")
        name = spec.get("name", "").lower()
        print(f"[DEBUG] action name before adjustments: {name}")

        # alias British spelling for color
        if "colour" in args and "color" not in args:
            args["color"] = args.pop("colour")
            print(f"[DEBUG] aliased 'colour' to 'color': {args['color']}")

        # ensure color_residue always gets residue & chain
        if name == "color_residue":
            args.setdefault("residue", "")
            args.setdefault("chain", "")
            print(f"[DEBUG] defaulted residue and chain: residue='{args['residue']}', chain='{args['chain']}'")

        # Default filename for snapshot
        if name == "snapshot":
            args.setdefault("filename", "")
            print(f"[DEBUG] snapshot filename defaulted: '{args['filename']}'")

        # Normalize residue_name key
        if "residue_name" in args:
            args["residue"] = args.pop("residue_name")
            print(f"[DEBUG] normalized residue_name to residue: {args}")

        # Normalize chain argument
        chain_arg = args.get("chain")
        if chain_arg:
            if chain_arg.lower() == "all":
                m = re.search(r'chain\s+([A-Za-z])', text, re.IGNORECASE)
                if m:
                    args["chain"] = m.group(1).upper()
                    print(f"[DEBUG] extracted chain from text: {args['chain']}")
            else:
                args["chain"] = chain_arg.upper()
                print(f"[DEBUG] detected chain in text fallback: {args['chain']}")

        # Default to 'all' for color_chain when prompt indicates 'all chains'
        if name == "color_chain" and "chain" not in args:
            if re.search(r"\ball\s+chains?\b", text, re.IGNORECASE):
                args["chain"] = "all"
                print(f"[DEBUG] defaulted chain to 'all' for color_chain")

        # ---- Cartoon representation aliasing & default ----
        if name == "set_cartoon":
            # alias fields to 'representation'
            if "cartoon_type" in args:
                args["representation"] = args.pop("cartoon_type")
                print(f"[DEBUG] aliased 'cartoon_type' to 'representation': {args['representation']}")
            elif "style" in args:
                args["representation"] = args.pop("style")
                print(f"[DEBUG] aliased 'style' to 'representation': {args['representation']}")
            # default if missing
            args.setdefault("representation", "cartoon")
            print(f"[DEBUG] defaulted 'representation' to: {args['representation']}")

        # ---- Hex color handling ----
        col = args.get("color")
        if isinstance(col, str) and col.startswith("#"):
            cname = f"c_{col[1:].lower()}"
            rgb = [int(col[i:i+2], 16)/255 for i in (1,3,5)]
            cmd.set_color(cname, rgb)
            args["color"] = cname
            print(f"[DEBUG] converted hex {col} to {cname} with rgb {rgb}")

        # ---- Rotate normalization ----
        if name == "rotate_view":
            print(f"[DEBUG] entering rotate_view normalization with args: {args}")
            # map rotate_axis and rotation_axis to axis
            if "rotate_axis" in args:
                args["axis"] = args.pop("rotate_axis")
                print(f"[DEBUG] mapped rotate_axis: {args['axis']}")
            if "rotation_axis" in args:
                args["axis"] = args.pop("rotation_axis")
                print(f"[DEBUG] mapped rotation_axis: {args['axis']}")
            # map rotate_angle to angle
            if "rotate_angle" in args:
                args["angle"] = args.pop("rotate_angle")
                print(f"[DEBUG] mapped rotate_angle: {args['angle']}")
            # handle list rotation values
            if "rotation" in args and isinstance(args["rotation"], (list, tuple)):
                rot = args.pop("rotation")
                print(f"[DEBUG] handling list rotation: {rot}")
                for idx, val in enumerate(rot):
                    if isinstance(val, (int, float)) and val != 0:
                        axis = ['X','Y','Z'][idx]
                        print(f"[DEBUG] list rotate axis {axis} val {val}")
                        rotate_view(axis, val)

                return
            # handle scalar rotation value
            if "rotation" in args and isinstance(args["rotation"], (int, float)):
                axis = args.get("axis")
                if not axis:
                    m = re.search(r'rotate\s+(\d+)\s+around\s+([XYZxyz])', text, re.IGNORECASE)
                    if m:
                        axis = m.group(2)
                        print(f"[DEBUG] extracted axis from text: {axis}")
                args["axis"] = axis.upper() if axis else ""
                args["angle"] = args.pop("rotation")
                print(f"[DEBUG] scalar rotation normalized: axis {args.get('axis')}, angle {args.get('angle')}")
            # perform single-axis rotate
            if "axis" in args and "angle" in args:
                print(f"[DEBUG] performing single-axis rotate with: {args['axis']}, {args['angle']}")
                rotate_view(args['axis'], args['angle'])
                return
        # ---- Multi-axis support ----
        if name == "rotate_view":
            print(f"[DEBUG] entering multi-axis branch with args: {args}")
            axes = ['x','y','z']
            handled = False
            for key in axes:
                if key in args and isinstance(args[key], (int, float)):
                    print(f"[DEBUG] multi-axis rotate {key.upper()} val {args[key]}")
                    rotate_view(key.upper(), args[key])
                    handled = True
                elif f'rotate_{key}' in args and isinstance(args[f'rotate_{key}'], (int, float)):
                    print(f"[DEBUG] multi-axis rotate rotate_{key.upper()} val {args[f'rotate_{key}']}")
                    rotate_view(key.upper(), args[f'rotate_{key}'])
                    handled = True
            if handled:
                return
        # Always save snapshots into Downloads/PyMOL_Snapshots (avoid Qt dialog)
        if name == "snapshot":
            try:
                user_name = args.get("filename") if isinstance(args.get("filename"), str) else None
                args["filename"] = _downloads_snap_path(user_name)
                print(f"[AI-BRIDGE] (UI) Snapshot path forced to: {args['filename']}")
            except Exception as _e:
                print(f"[AI-BRIDGE] (UI) Failed to prepare snapshot path: {_e}")
        # ---- Dispatch ----
        filtered = {k: v for k, v in args.items() if k in inspect.signature(FUNCTION_MAP.get(name, lambda: None)).parameters}
        print(f"[DEBUG] final function call: {name}, with args: {filtered}")
        func = FUNCTION_MAP.get(name)
        if not func:
            QtWidgets.QMessageBox.warning(None, "AI Assistant", f"Unknown action: {name}")
            return
        func(**filtered)
    except Exception as e:
        print(f"[ERROR] Exception in launch_ui: {e}")
        QtWidgets.QMessageBox.critical(None, "AI Assistant Error", str(e))

# Register the ai command
cmd.extend("ai", launch_ui)

def __init_plugin__(self=None):
    global _ws_thread
    try:
        if _ws_thread is None:
            _ws_thread = threading.Thread(target=_ws_loop, daemon=True)
            _ws_thread.start()
            print("[AI-BRIDGE] WebSocket listener thread started.")
    except Exception as e:
        print(f"[AI-BRIDGE][ERROR] Failed to start WS thread: {e}\n{traceback.format_exc()}")
# EOF