# cat << 'EOF' > ~/.pymol/Plugins/pymol_ai_assistant/__init__.py
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

# —— Helper functions ——
def color_residue(residue: str, chain: str, color: str):
    # Clear any prior selection state
    cmd.deselect()
    # Normalize inputs
    raw = residue.upper()
    chain = chain.upper() if chain else ''
    # Strip parentheses
    if "(" in raw and ")" in raw:
        raw = raw.split("(",1)[1].split(")",1)[0]
    # Keep only letters
    raw = "".join(re.findall(r"[A-Z]", raw))
    # Map one-letter codes
    if len(raw)==1 and raw in RES_MAP:
        raw = RES_MAP[raw]
    # Build selection string
    sel = f"resn {raw}" + (f" and chain {chain}" if chain else "")
    # Apply color to selection directly
    cmd.color(color, sel)


def color_chain(chain: str, color: str):
    chain = chain.upper()
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
    options = QtWidgets.QFileDialog.Options()
    path, _ = QtWidgets.QFileDialog.getSaveFileName(
        None,
        "Save Snapshot As…",
        filename or "snapshot.png",
        "PNG Files (*.png);;All Files (*)",
        options=options
    )
    if not path:
        return
    if not path.lower().endswith(".png"):
        path += ".png"
    cmd.png(path, dpi=300)
    QtWidgets.QMessageBox.information(
        None, "AI Assistant", f"Snapshot saved to:\n{path}"
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
    return json.loads(resp.choices[0].message.content.strip())


def launch_ui():
    text, ok = QtWidgets.QInputDialog.getText(
        None, "AI Assistant", "Describe a single PyMOL action:"
    )
    if not ok or not text.strip():
        return
    try:
        spec = call_llm(text)
        print("DEBUG spec:", spec)
        # Extract and normalize arguments
        args = spec.get("arguments", {}) or {}
        if "residue_name" in args:
            args["residue"] = args.pop("residue_name")
        # Normalize chain
        chain_arg = args.get("chain")
        if chain_arg:
            if chain_arg.lower() == "all":
                m = re.search(r'chain\s+([A-Za-z])', text, re.IGNORECASE)
                if m:
                    args["chain"] = m.group(1).upper()
            else:
                args["chain"] = chain_arg.upper()
        else:
            m = re.search(r'chain\s+([A-Za-z])', text, re.IGNORECASE)
            if m:
                args["chain"] = m.group(1).upper()

        # Determine action name
        name = spec.get("name", "").lower()
        if name == "color":
            name = "color_all"
        if name == "color_residue" and ("residue" not in args) and ("chain" in args):
            name = "color_chain"

        # Ensure color_all res works
        if name == "color_residue":
            args.setdefault("residue", "")
            args.setdefault("chain", "")

        # Hex-color handling
        col = args.get("color", "")
        if isinstance(col, str) and col.startswith("#"):
            cname = f"c_{col[1:].lower()}"
            rgb = [int(col[i:i+2], 16)/255 for i in (1,3,5)]
            cmd.set_color(cname, rgb)
            args["color"] = cname

        # Fetch function and call
        func = FUNCTION_MAP.get(name)
        if not func:
            QtWidgets.QMessageBox.warning(
                None, "AI Assistant", f"Unknown action: {name}"
            )
            return
        sig = inspect.signature(func).parameters
        filtered = {k: v for k, v in args.items() if k in sig}
        func(**filtered)

    except Exception as e:
        QtWidgets.QMessageBox.critical(None, "AI Assistant Error", str(e))

cmd.extend("ai", launch_ui)

def __init_plugin__(self=None):
    pass
# EOF