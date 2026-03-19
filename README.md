# PyMOL AI Assistant

Desktop assistant for PyMOL that lets users control common molecular-visualization tasks with plain English.

Current version: `0.1.1-alpha`

## Before You Start

You must already have:

- PyMOL installed
- an OpenAI API key

Everything else can be handled by the bootstrap installers below.

## Fast Install

### macOS

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/main/bootstrap-macos.sh)"
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/main/bootstrap-windows.ps1 | iex"
```

These bootstrap scripts:

- check that PyMOL is already installed
- install missing Git, Python, Node.js, and npm if needed
- clone or update the repo automatically
- run the normal installer
- configure PyMOL to auto-load the assistant on startup

The Windows bootstrap may require PowerShell to be run as Administrator if it needs to install missing tools.

## Manual Install

Use this only if you do not want the bootstrap installer.

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

If you do not have Git, you can download the repo as a ZIP instead.

## First Launch

1. Open PyMOL
2. Type `ai`
3. The Electron app should open
4. On first launch, complete onboarding
5. Open `Status` and run the system check
6. Enter your OpenAI API key in `Settings` if prompted

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
- show PyMOL’s built-in sequence view
- save snapshots
- save and reopen `.pymolai` project files

The app also includes projects, notes, prompt logs, onboarding, health checks, and current-selection tags such as `@A:ALA21`.

## How To Use It

Keep prompts short and use one action at a time.

Good:

- `Show protein as cartoon`
- `Color chain A red`
- `Zoom to ligand`

Bad:

- `Fetch 1CRN and color it blue and rotate 45 degrees`

If you want to be more precise, use the selection tag shown by the UI when PyMOL has a current selection.

## Configuration

Local config is stored in:

- `~/.pymol/config.json`

Common keys:

- `project_root`
- `node_path`
- `npm_path`
- `openai_api_key`
- `openai_model`

If `openai_model` is not set, the app currently defaults to `gpt-5.4-mini`.

## Troubleshooting

### `ai` is not defined in PyMOL

Rerun the installer. It should add a managed PyMOL AI Assistant startup block automatically.

Typical plugin locations:

- `~/.pymol/Plugins/pymol_ai_assistant`
- macOS/Linux startup file: `~/.pymolrc`
- Windows startup file: `%USERPROFILE%\pymolrc.pml`

### Bootstrap says PyMOL was not found

Install PyMOL first, confirm it launches normally, then rerun the bootstrap.

### Windows bootstrap says to rerun as Administrator

This means Windows needs permission to install missing tools.

Do this:

1. Close the current PowerShell window
2. Open the Start menu
3. Search for `PowerShell`
4. Right-click `Windows PowerShell` or `PowerShell`
5. Choose `Run as administrator`
6. Rerun the bootstrap command

### Bootstrap says the repo directory already exists but is not a git repo

Move or remove the existing directory, then rerun the bootstrap:

- macOS: `~/pymol_ai_assistant`
- Windows: `%USERPROFILE%\pymol_ai_assistant`

### Electron UI does not open

Rerun the installer and check:

- `pymol-ai-electron-ui/dist/index.html`
- `~/.pymol/electron-ui.log`

### Bridge is unreachable

Rerun the installer so the bridge virtual environment and dependencies are rebuilt.

### Prompts fail often

Common causes:

- the plugin is not connected
- the target does not exist in the current scene
- the prompt contains multiple actions

Use shorter, single-action prompts and check `Status`.

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
