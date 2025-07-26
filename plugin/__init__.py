import os, json, inspect, re
from PyQt5 import QtWidgets
from pymol import cmd
from openai import OpenAI

client = OpenAI()

# One‑letter → three‑letter map for residues
RES_MAP = {
    'A':'ALA','C':'CYS','D':'ASP','E':'GLU','F':'PHE',
    'G':'GLY','H':'HIS','I':'ILE','K':'LYS','L':'LEU',
    'M':'MET','N':'ASN','P':'PRO','Q':'GLN','R':'ARG',
    'S':'SER','T':'THR','V':'VAL','W':'TRP','Y':'TYR'
}

def color_residue(residue: str, chain: str, color: str):
    # Normalize residue code
    raw = residue.upper()
    if "(" in raw and ")" in raw:
        raw = raw.split("(",1)[1].split(")",1)[0]
    raw = "".join(re.findall(r"[A-Z]", raw))
    if len(raw)==1 and raw in RES_MAP:
        raw = RES_MAP[raw]
    # Build selection (chain may be empty for “all chains”)
    sel = f"resn {raw}"
    if chain:
        sel += f" and chain {chain}"
    cmd.color(color, sel)

def color_chain(chain: str, color: str):
    cmd.color(color, f"chain {chain}")

def color_all(color: str):
    cmd.color(color, "all")

def set_background(color: str):
    cmd.bg_color(color)

def rotate_view(axis: str, angle: float):
    cmd.rotate(axis, angle)

def set_cartoon(representation: str):
    cmd.hide("everything", "all")
    cmd.show(representation, "all")

def snapshot(filename: str):
    opts = QtWidgets.QFileDialog.Options()
    path, _ = QtWidgets.QFileDialog.getSaveFileName(
        None, "Save Snapshot As…", filename or "snapshot.png",
        "PNG Files (*.png);;All Files (*)", options=opts
    )
    if not path:
        return
    if not path.lower().endswith(".png"):
        path += ".png"
    cmd.png(path, dpi=300)
    QtWidgets.QMessageBox.information(None, "AI Assistant",
        f"Snapshot saved to:\n{path}"
    )

FUNCTION_MAP = {
    "color_residue": color_residue,
    "color_chain":   color_chain,
    "color_all":     color_all,
    "set_background": set_background,
    "rotate_view":    rotate_view,
    "set_cartoon":    set_cartoon,
    "snapshot":       snapshot,
}

def call_llm(prompt: str):
    system_msg = (
        "You are a PyMOL assistant. The user asks for one simple action. "
        "Return exactly one JSON OBJECT with keys: "
        "\"name\" (one of: " + ", ".join(f"\\\"{k}\\\"" for k in FUNCTION_MAP.keys()) + ") "
        "and \"arguments\" (an OBJECT). No arrays or extras.  \n"
        "Examples for coloring residues WITH chain:\n"
        "  Color C in chain A magenta → "
        "{\"name\":\"color_residue\",\"arguments\":{\"residue\":\"CYS\",\"chain\":\"A\",\"color\":\"magenta\"}}\n"
        "Examples for coloring residues WITHOUT chain:\n"
        "  Color all leucine residues orange → "
        "{\"name\":\"color_residue\",\"arguments\":{\"residue\":\"LEU\",\"chain\":\"\",\"color\":\"orange\"}}\n"
        "Examples for invalid chains:\n"
        "  If chain X does not exist, the plugin should error."
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
    return json.loads(resp.choices[0].message.content.strip())

def launch_ui():
    text, ok = QtWidgets.QInputDialog.getText(
        None, "AI Assistant", "Describe a single PyMOL action:"
    )
    if not ok or not text.strip():
        return
    try:
        spec = call_llm(text)
        name = spec.get("name")
        args = spec.get("arguments", {})

        # Route color → color_all
        if name == "color":
            name = "color_all"

        # Default‑chain fallback for color_residue
        if name == "color_residue":
            # If chain missing, assume all chains
            args.setdefault("chain", "")
            # If user specified a non‑empty chain, verify it exists
            ch = args.get("chain")
            if ch:
                existing = cmd.get_chains("all") or ""
                if ch not in existing.split():
                    raise ValueError(f"Chain '{ch}' not found")

        # Handle hex colors
        col = args.get("color","")
        if isinstance(col, str) and col.startswith("#"):
            cname = f"c_{col[1:].lower()}"
            rgb = [int(col[i:i+2],16)/255 for i in (1,3,5)]
            cmd.set_color(cname, rgb)
            args["color"] = cname

        # Cartoon remap & default
        if name == "set_cartoon" and "cartoon" in args:
            args["representation"] = args.pop("cartoon")
        if name == "set_cartoon" and "representation" not in args:
            args["representation"] = "cartoon"

        func = FUNCTION_MAP.get(name)
        if not func:
            QtWidgets.QMessageBox.warning(None, "AI Assistant",
                f"Unknown action: {name}")
            return

        # Execute multi‑axis rotate
        if name == "rotate_view" and "actions" in args:
            for act in args["actions"]:
                rotate_view(act["axis"], act["angle"])
            return

        # Filter and call single‑action helpers
        sig = inspect.signature(func).parameters
        filtered = {k: v for k, v in args.items() if k in sig}
        func(**filtered)

    except Exception as e:
        QtWidgets.QMessageBox.critical(None, "AI Assistant Error", str(e))

cmd.extend("ai", launch_ui)
def __init_plugin__(self=None): pass