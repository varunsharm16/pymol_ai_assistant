# PyMOL AI Assistant

Desktop control layer for PyMOL that lets users drive common molecular-visualization actions with plain English.

Current version: `0.1.1-alpha`

## Fast Install (macOS)

Recommended for macOS users:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/main/bootstrap-macos.sh)"
```

This bootstrap script:

- installs Homebrew if needed
- installs missing Git, Python, Node.js, and npm via Homebrew
- checks that PyMOL is already installed
- clones or updates the repo into `~/pymol_ai_assistant`
- runs the normal project installer

It does **not** install PyMOL.

## What It Is

PyMOL AI Assistant is a three-part local app:

- A PyMOL plugin that registers the `ai` command and executes PyMOL actions
- A local FastAPI bridge on `127.0.0.1:5179`
- An Electron + React desktop UI for prompting, projects, molecules, notes, status checks, and settings

The intended flow is:

1. Install the repo locally
2. Open PyMOL
3. Type `ai`
4. Use the desktop UI to work with PyMOL

The system is still alpha software. The best results come from short, single-action prompts.

## What It Can Do

Current supported capabilities include:

- Fetch a structure by PDB ID
- Import local structure files
- Show and hide common representations
- Color residues, chains, ligands, proteins, or everything
- Color by chain and by element
- Remove waters, metals, or hydrogens
- Isolate a target
- Label residues or atoms
- Rotate, zoom, orient, and set the background
- Set representation transparency
- Measure distances
- Show polar contacts
- Align named objects
- Show PyMOL’s built-in sequence view
- Save snapshots
- Save and reopen `.pymolai` project files

The UI also exposes:

- Per-project prompt logs
- Per-project notes
- Recent projects
- Health checks
- First-run onboarding
- Current-selection tags such as `@A:ALA21` for more precise prompts

## Example Prompts

These are representative prompts that the current parser and NL fallback are designed around:

- `Remove waters`
- `Remove metals`
- `Show ligand as sticks`
- `Show the cartoon representation of the molecule`
- `Set surface transparency to 0.4 on protein`
- `Color protein grey`
- `Color all leucine residues orange`
- `Colour serine (SER) residues in chain A #FF00FF`
- `Color all chains grey`
- `Label residues in chain A`
- `Zoom to ligand`
- `Orient on chain B`
- `Measure distance between ligand and residue ASP in chain B`
- `Measure distance between selected`
- `Show polar contacts between ligand and residue ASP in chain B`
- `Align object ligand_pose to object receptor`
- `Show sequence`
- `Show sequence as residue names`
- `Hide sequence`
- `Snapshot as figure.png`

## Architecture

```text
Electron UI  <-->  FastAPI bridge  <-->  PyMOL plugin
                               \
                                \--> OpenAI API
```

Key code locations:

- [`plugin/__init__.py`](plugin/__init__.py)
- [`plugin/command_model.py`](plugin/command_model.py)
- [`pymol-bridge/main.py`](pymol-bridge/main.py)
- [`pymol-ai-electron-ui/src/ui/App.tsx`](pymol-ai-electron-ui/src/ui/App.tsx)

## Prerequisites

For installation, the practical prerequisites are:

- PyMOL
- Python `3.8+`, unless the macOS bootstrap installs it for you
- Node.js `18+`, unless the macOS bootstrap installs it for you
- npm, unless the macOS bootstrap installs it for you
- Git, if installing via `git clone` manually
- An OpenAI API key

If Git is not installed:

- the macOS bootstrap can install it automatically
- or the user can download the repository as a ZIP and extract it manually

## Quick Setup Guides

If the installer fails immediately on a fresh machine, it is usually because one of these tools is missing.

### Git

Git is only required if you are cloning the repo with `git clone`.

Check whether it is installed:

```bash
git --version
```

If that fails:

- macOS:
  - install Xcode Command Line Tools:
    ```bash
    xcode-select --install
    ```
  - or install Git from https://git-scm.com/downloads
- Windows:
  - install Git for Windows from https://git-scm.com/download/win
- Alternative:
  - download the repository as a ZIP from GitHub and extract it manually

### Python 3.8+

Check whether Python is installed:

```bash
python3 --version
```

On Windows, also try:

```bat
python --version
```

If Python is missing:

- macOS:
  - install from https://www.python.org/downloads/
  - or install with Homebrew:
    ```bash
    brew install python
    ```
- Windows:
  - install from https://www.python.org/downloads/windows/
  - during installation, enable `Add Python to PATH`

After install, reopen the terminal and verify:

```bash
python3 --version
```

### Node.js 18+

Check whether Node.js is installed:

```bash
node --version
npm --version
```

If Node.js is missing:

- macOS:
  - install from https://nodejs.org/
  - or install with Homebrew:
    ```bash
    brew install node
    ```
- Windows:
  - install from https://nodejs.org/
  - the standard installer includes npm

After install, reopen the terminal and verify:

```bash
node --version
npm --version
```

### PyMOL

Make sure PyMOL itself is installed before running the installer.

- Open-source build and general info: https://pymol.org/
- Schrödinger build: follow your licensed installation path

After installation, verify that PyMOL launches normally before trying to install this assistant.

## Installation

### macOS (recommended)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/main/bootstrap-macos.sh)"
```

Use this if you want the script to handle missing Git / Python / Node for you.

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

### What the installer does

The installer currently:

1. Creates `pymol-bridge/.venv`
2. Installs the bridge dependencies
3. Installs the Electron UI dependencies
4. Builds the Electron renderer and main process
5. Installs the PyMOL plugin under `~/.pymol/Plugins` or the Windows equivalent
6. Writes a PyMOL startup loader so the `ai` command exists automatically on launch
7. Stores `project_root`, `node_path`, and `npm_path` in `~/.pymol/config.json`
8. Tries to install `websocket-client` and `openai` into PyMOL’s Python when possible

If the installer stops during prerequisite checks, install the missing dependency first using the quick guides above, then rerun the installer.

### What the macOS bootstrap does

The bootstrap:

1. Verifies macOS
2. Installs Homebrew if needed
3. Installs missing Git / Python / Node.js / npm if needed
4. Verifies PyMOL is already installed
5. Clones or updates the repo in `~/pymol_ai_assistant`
6. Runs `./install.sh`

## First Launch

After installation:

1. Open PyMOL
2. Type `ai`
3. The Electron UI should launch
4. On first launch, the app shows onboarding and then routes the user to `Status`
5. Run the system check
6. Enter the OpenAI API key in `Settings` if prompted

If `ai` is not recognized, the installation is incomplete. Re-run the installer first.

## How to Use It

### Prompting

Use one action per prompt.

Good:

- `Show protein as cartoon`
- `Color chain A red`
- `Zoom to ligand`

Bad:

- `Fetch 1CRN and color it blue and rotate 45 degrees`

The parser is intentionally strongest on short action-oriented phrasing. The Quick Actions list in the UI is there to steer users toward prompts the parser already understands well.

### Current-selection tags

When PyMOL has a current selection or picked residue/atom, the prompt bar can show a tag such as `@A:ALA21`.

That tag can be inserted into prompts:

- `Color @A:ALA21 red`

### Molecules

Use the `Molecules` panel to:

- Preview a PDB entry before loading
- Fetch by PDB ID
- Import a local file

### Projects

Use the `Projects` panel to:

- Create a blank project
- Save a `.pymolai` project file
- Reopen a saved project
- Switch projects
- Delete projects

### Status

Use `Status` to verify:

- Bridge server reachable
- PyMOL plugin connected
- API key valid
- Node.js version
- Python version

## Configuration

The app stores local configuration in:

- `~/.pymol/config.json`

Current keys include:

- `project_root`
- `node_path`
- `npm_path`
- `openai_api_key`
- optional `openai_model`

If `openai_model` is not set, the plugin currently defaults to `gpt-5.4-mini` for NL fallback.

## Limitations

Current known limitations:

- This is alpha software
- Prompt quality is best with short, explicit, single-action requests
- Some actions still depend on PyMOL object/selection state, so a valid prompt can still fail if the target does not exist in the current scene
- Project switching is improved but still not production-grade
- The UI is local-first and assumes the bridge and PyMOL plugin are both running on the same machine

## Troubleshooting

### `ai` is not defined in PyMOL

Re-run the installer. The `ai` command only exists if the plugin startup loader was installed correctly.

If needed, check for these paths:

- `~/.pymol/Plugins/pymol_ai_assistant`
- `~/.pymol/startup/pymol_ai_assistant_startup.py`

On some macOS installs, the startup directory may instead be:

- `~/Library/Application Support/PyMOL/Startup`

### macOS bootstrap says Homebrew failed

- install Homebrew manually from https://brew.sh
- then rerun the bootstrap command

### macOS bootstrap says PyMOL was not found

- install PyMOL first
- make sure it exists in `/Applications/PyMOL.app` or `~/Applications/PyMOL.app`
- rerun the bootstrap

### macOS bootstrap says the repo directory already exists but is not a git repo

- move or remove `~/pymol_ai_assistant`
- rerun the bootstrap

### Electron UI does not open

Check:

- `pymol-ai-electron-ui/node_modules`
- `pymol-ai-electron-ui/dist/index.html`
- `~/.pymol/electron-ui.log`

Then rerun the installer.

### Bridge is unreachable

Re-run the installer so that:

- `pymol-bridge/.venv` exists
- the bridge dependencies are installed

You can also inspect `Status` in the UI.

### Prompts time out or fail often

Common causes:

- The plugin is not connected
- The target does not exist in the current scene
- The prompt is too broad or contains multiple actions

Use shorter prompts and prefer the patterns from Quick Actions.

### Save/load problems

Projects are saved as `.pymolai` archives that contain:

- `metadata.json`
- `session.pse`

If save/load breaks, first confirm the prompt log and PyMOL session are both present in the project file flow.

## Development

### Repository layout

```text
plugin/
  __init__.py
  command_model.py

pymol-bridge/
  main.py
  requirements.txt

pymol-ai-electron-ui/
  electron/
  src/ui/
  package.json

tests/
install.sh
install.bat
version.py
CHANGELOG.md
```

### Running checks

Bridge tests:

```bash
pymol-bridge/.venv/bin/pytest -q tests
```

Plugin compile check:

```bash
python3 -m py_compile plugin/__init__.py plugin/command_model.py pymol-bridge/main.py
```

Frontend parser tests:

```bash
cd pymol-ai-electron-ui
npm run test:parser
```

Frontend typecheck and build:

```bash
cd pymol-ai-electron-ui
./node_modules/.bin/tsc --noEmit
npm run build
npm run build:electron
```

## License

MIT
