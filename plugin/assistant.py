import json
import os
from PyQt5 import QtWidgets
from pymol import cmd
from llama_cpp import Llama
from commands import color_residue, set_background, rotate_view, set_cartoon, snapshot

# Path to your local Llama model file (.bin or .gguf)
MODEL_PATH = os.path.expanduser("~/models/llama-2-7b.gguf")

# Map function names to the actual Python callables
FUNCTION_MAP = {
    "color_residue": color_residue,
    "set_background": set_background,
    "rotate_view": rotate_view,
    "set_cartoon": set_cartoon,
    "snapshot": snapshot,
}

def call_llm(prompt: str):
    llm = Llama(model_path=MODEL_PATH)
    response = llm(
        prompt,
        max_tokens=256,
        stop=["}"],
        streaming=False
    )
    # Expecting a JSON blob like {"name": "...", "arguments": {...}}
    text = response["choices"][0]["text"].strip()
    return json.loads(text)

def launch_ui():
    # Build simple input dialog
    text, ok = QtWidgets.QInputDialog.getText(
        None, "AI Assistant", "Describe your action:"
    )
    if not ok or not text.strip():
        return
    try:
        spec = call_llm(text)
        name = spec["name"]
        args = spec.get("arguments", {})
        func = FUNCTION_MAP.get(name)
        if not func:
            QtWidgets.QMessageBox.warning(None, "AI Assistant", f"Unknown function: {name}")
            return
        # Execute the PyMOL command
        func(cmd, **args)
    except Exception as e:
        QtWidgets.QMessageBox.critical(None, "AI Assistant Error", str(e))

# PyMOL plugin registration entrypoint
def __init_plugin__(self=None):
    launch_ui  # ensure symbol is loaded

# Register the `ai` command on import
from pymol import cmd; cmd.extend("ai", launch_ui)

