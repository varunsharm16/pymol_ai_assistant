import sys, os, json
from PyQt5 import QtWidgets
from pymol import cmd
from llama_cpp import Llama

# ——— Helper commands ———
def color_residue(residue: str, chain: str, color: str):
    sel = f"resn {residue} and chain {chain}"
    cmd.color(color, sel)

def set_background(color: str):
    cmd.bg_color(color)

def rotate_view(axis: str, angle: float):
    cmd.rotate(axis, angle)

def set_cartoon(repr: str):
    cmd.show(repr, "all")

def snapshot(filename: str):
    cmd.png(filename, dpi=300)

# Map JSON names to functions
FUNCTION_MAP = {
    "color_residue": color_residue,
    "set_background": set_background,
    "rotate_view": rotate_view,
    "set_cartoon": set_cartoon,
    "snapshot": snapshot,
}

# Path to your local Llama model
MODEL_PATH = os.path.expanduser("~/models/llama-2-7b.gguf")

def call_llm(prompt: str):
    llm = Llama(model_path=MODEL_PATH)
    resp = llm(prompt, max_tokens=256, stop=["}"], streaming=False)
    text = resp["choices"][0]["text"].strip()
    return json.loads(text)

def launch_ui():
    text, ok = QtWidgets.QInputDialog.getText(None, "AI Assistant", "Describe your action:")
    if not ok or not text.strip():
        return
    try:
        spec = call_llm(text)
        func = FUNCTION_MAP.get(spec["name"])
        if not func:
            QtWidgets.QMessageBox.warning(None, "AI Assistant", f"Unknown function: {spec['name']}")
            return
        func(**spec.get("arguments", {}))
    except Exception as e:
        QtWidgets.QMessageBox.critical(None, "AI Assistant Error", str(e))

# Register as a PyMOL command
cmd.extend("ai", launch_ui)

# Plugin entrypoint (no-op now that we have a cmd)
def __init_plugin__(self=None):
    pass
