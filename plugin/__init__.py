import sys, os
from PyQt5 import QtWidgets
from pymol import cmd
from assistant import launch_ui  # or just "from assistant import launch_ui" if same folder

# Expose "ai" at the PyMOL prompt
cmd.extend("ai", launch_ui)

def __init_plugin__(self=None):
    # No menu for now—`ai` is all you need
    pass
