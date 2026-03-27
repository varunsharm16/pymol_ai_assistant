# PyMOL AI Assistant

Prototype desktop assistant for PyMOL. It lets you control common molecular-visualization tasks with plain English through an Electron UI.

Current version: `0.1.1-alpha`

## Prototype Setup

This is still a prototype. The setup is reliable if the machine already has the required tools, but it is not a fully packaged app yet.

Before installing, make sure the user already has:

- PyMOL installed and launching normally
- an OpenAI API key
- Python `3.8+`
- Node.js `18+`
- `npm`
- Git, if they plan to clone the repo instead of downloading a ZIP

Recommended checks:

```bash
python3 --version
node --version
npm --version
git --version
```

On Windows:

```powershell
python --version
node --version
npm --version
git --version
```

If Git is missing, the repo can be downloaded as a ZIP instead.

## Known PyMOL Python Prereqs

The plugin imports these inside PyMOL:

- `websocket-client`
- `openai`

On some machines, PyMOL already has them. On others, they may need to be installed into PyMOL's Python.

If PyMOL prints messages like:

- `websocket-client not installed`
- `openai package not installed`

install them in PyMOL's Python.

macOS example:

```bash
/Applications/PyMOL.app/Contents/bin/pip install websocket-client openai
```

Windows:
- use the Python environment bundled with the PyMOL installation
- install `websocket-client` and `openai` there

## Install

### macOS / Linux

```bash
git clone https://github.com/varunsharm16/pymol_ai_assistant.git
cd pymol_ai_assistant
./install.sh
```

### Windows

```bat
git clone https://github.com/varunsharm16/pymol_ai_assistant.git
cd pymol_ai_assistant
install.bat
```

If the user downloaded a ZIP instead of cloning:

1. extract the folder
2. open a terminal in that folder
3. run the same installer command

## Optional Bootstrap Installers

Bootstrap scripts are available, but they are only convenience wrappers around the normal install flow.

macOS:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/main/bootstrap-macos.sh)"
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/main/bootstrap-windows.ps1 | iex"
```

Use these only if the user wants the script to help check or install missing system tools.

## First Launch

1. Open PyMOL
2. Type `ai`
3. The Electron app should open
4. Enter the OpenAI API key in `Settings` if prompted

If `ai` is not recognized, rerun the installer.

## What It Can Do

- fetch structures by PDB ID
- import local structure files
- show and hide common representations
- color residues, chains, ligands, proteins, or everything
- color by chain and by element
- remove waters, metals, or hydrogens
- isolate targets
- label residues or atoms
- zoom, orient, rotate, and change background
- set transparency
- measure distances
- show polar contacts
- align objects
- show PyMOL's built-in sequence view
- save snapshots
- save and reopen `.pymolai` project files

## Prompting

Use short, single-action prompts.

Good:

- `Show protein as cartoon`
- `Color chain A red`
- `Zoom to ligand`

Bad:

- `Fetch 1CRN and color it blue and rotate 45 degrees`

## Important Files

The installer writes local config here:

- macOS / Linux: `~/.pymol/config.json`
- Windows: `%USERPROFILE%\.pymol\config.json`

The plugin is installed here:

- macOS / Linux: `~/.pymol/Plugins/pymol_ai_assistant`
- Windows: `%USERPROFILE%\.pymol\Plugins\pymol_ai_assistant`

The startup hook is usually written here:

- macOS / Linux: `~/.pymolrc`
- Windows: `%USERPROFILE%\pymolrc`

## Troubleshooting

### `ai` is not defined in PyMOL

Rerun the installer. Then restart PyMOL completely.

### Electron UI does not open

Rerun the installer and make sure:

- Python is available
- Node.js and npm are available
- the UI build completed successfully

### Bridge is unreachable

Rerun the installer so the bridge virtual environment is rebuilt.

### Prompts stay pending or fail often

Common causes:

- the PyMOL plugin is not connected
- the target does not exist in the current scene
- the prompt contains multiple actions
- PyMOL's Python is missing `websocket-client` or `openai`

### Windows bootstrap asks for Administrator

That means Windows needs permission to install missing tools.

1. Close PowerShell
2. Open Start
3. Search for `PowerShell`
4. Right-click it
5. Choose `Run as administrator`
6. Run the bootstrap again

## Development

Key files:

- [`plugin/__init__.py`](plugin/__init__.py)
- [`plugin/command_model.py`](plugin/command_model.py)
- [`pymol-bridge/main.py`](pymol-bridge/main.py)
- [`pymol-ai-electron-ui/src/ui/App.tsx`](pymol-ai-electron-ui/src/ui/App.tsx)

Common checks:

```bash
pymol-bridge/.venv/bin/pytest -q tests
python3 -m py_compile plugin/__init__.py plugin/command_model.py pymol-bridge/main.py
cd pymol-ai-electron-ui
npm run test:parser
./node_modules/.bin/tsc --noEmit
npm run build
npm run build:electron
```

## License

MIT
