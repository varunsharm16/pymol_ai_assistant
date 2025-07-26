# import json
# import os
# from PyQt5 import QtWidgets
# from pymol import cmd
# from commands import color_residue, set_background, rotate_view, set_cartoon, snapshot
# import openai

# # Map function names to the actual Python callables
# FUNCTION_MAP = {
#     "color_residue": color_residue,
#     "set_background": set_background,
#     "rotate_view": rotate_view,
#     "set_cartoon": set_cartoon,
#     "snapshot": snapshot,
# }

# def call_llm(prompt: str):
#     resp = openai.ChatCompletion.create(
#         model="gpt-4-turbo",
#         messages=[{"role": "user", "content": prompt}],
#         max_tokens=200,
#         stop=["}"],
#         temperature=0.2,
#     )
#     # Expecting a JSON blob like {"name": "...", "arguments": {...}}
#     text = resp.choices[0].message.content.strip()
#     return json.loads(text)

# def launch_ui():
#     # Build simple input dialog
#     text, ok = QtWidgets.QInputDialog.getText(
#         None, "AI Assistant", "Describe your action:"
#     )
#     if not ok or not text.strip():
#         return
#     try:
#         spec = call_llm(text)
#         name = spec["name"]
#         args = spec.get("arguments", {})
#         func = FUNCTION_MAP.get(name)
#         if not func:
#             QtWidgets.QMessageBox.warning(None, "AI Assistant", f"Unknown function: {name}")
#             return
#         # Execute the PyMOL command
#         func(cmd, **args)
#     except Exception as e:
#         QtWidgets.QMessageBox.critical(None, "AI Assistant Error", str(e))