# PyMOL AI Assistant 🧬🤖

Control PyMOL using natural language. Just describe what you want in plain English—no need to memorize complex commands.

![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-0.1.1--alpha-blue)

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/varunsharm16/pymol_ai_assistant.git
cd pymol_ai_assistant

# 2. Install (macOS/Linux)
./install.sh

# 3. Open PyMOL and type:
ai
```

That's it. The bridge server, desktop UI, and plugin all start automatically.

> 💡 First time? The app will prompt you to enter your OpenAI API key on launch.

---

## Why This Exists

Learning molecular visualization tools like PyMOL can be intimidating. The command syntax is powerful but has a steep learning curve, especially for:

- **Students** just starting in structural biology or biochemistry
- **Researchers** who occasionally need to visualize proteins but don't use PyMOL daily
- **Educators** who want to focus on teaching concepts, not software commands

Instead of learning commands like `cmd.color("magenta", "resn CYS and chain A")`, you simply type:

> "Color the cysteines in chain A magenta"

The AI interprets your intent and executes the correct PyMOL command.

## Features

- 🗣️ **Natural language commands** — Describe actions in plain English
- 🖥️ **Desktop app** — Persistent UI with command history and projects
- 🎨 **Visualization controls** — Show/hide, isolate, recolor, label, and style common structural targets
- 📸 **Screenshots** — Save publication-quality snapshots
- 🔄 **View manipulation** — Rotate and orient your molecule
- 🧹 **Cleanup tools** — Remove waters, metals, hydrogens, or isolate the ligand/protein
- 📏 **Analysis helpers** — Measure distances, show polar contacts, align named objects
- 🧪 **PDB fetch & import** — Load molecules by PDB ID or local file
- 💾 **Project save/load** — Save your session and command history as `.pymolai` files
- ✅ **Health check** — Built-in system diagnostic to verify everything works

## Supported Commands

| Action | Example Prompt |
|--------|----------------|
| Cleanup | "Remove waters" / "Remove metals" |
| Styling | "Show ligand as sticks" / "Set surface transparency to 0.4 on protein" |
| Coloring | "Color protein by chain" / "Color ligand by element" |
| Labels | "Label residues in chain A" |
| Navigation | "Zoom to ligand" / "Orient on chain B" |
| Analysis | "Measure distance between ligand and residue ASP in chain B" |
| Contacts & alignment | "Show polar contacts between ligand and residue ASP in chain B" / "Align object ligand_pose to object receptor" |
| Legacy basics | "Color all cysteines magenta" / "Set background to white" / "Rotate 45 degrees around the Y axis" |

## Architecture

```
┌──────────────────┐      ┌──────────────┐      ┌─────────────┐
│  Electron UI     │─────▶│   Bridge     │─────▶│   PyMOL     │
│  (Desktop App)   │ HTTP │  (FastAPI)   │  WS  │  (Plugin)   │
└──────────────────┘      └──────────────┘      └─────────────┘
         │                       │                     │
         │                       │                     ▼
         │                       │              ┌─────────────┐
         └───────────────────────┴─────────────▶│   OpenAI    │
                                                │   GPT API   │
                                                └─────────────┘
```

## Project Structure

```
pymol_ai_assistant/
├── plugin/                     # PyMOL plugin
│   ├── __init__.py             #   Unified launcher, WS client, command executor
│   └── command_model.py        #   Selection compilation + command normalization
├── pymol-bridge/               # FastAPI WebSocket bridge server
│   ├── main.py                 #   REST API + WebSocket relay
│   └── requirements.txt
├── pymol-ai-electron-ui/       # Desktop app (Electron + React)
│   ├── electron/               #   Main process + preload
│   ├── src/ui/                 #   React components + store
│   └── package.json
├── tests/                      # pytest test suite
├── install.sh                  # macOS/Linux installer
├── install.bat                 # Windows installer
├── version.py                  # Version: 0.1.1-alpha
└── CHANGELOG.md
```

---

## Installation

### Prerequisites

- [PyMOL](https://pymol.org/) (open-source or licensed version)
- [Node.js](https://nodejs.org/) v18+ (for the desktop UI)
- Python 3.8+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### macOS / Linux

```bash
git clone https://github.com/varunsharm16/pymol_ai_assistant.git
cd pymol_ai_assistant
./install.sh
```

The installer will:
1. Create a Python venv and install bridge dependencies
2. Run `npm install` for the Electron UI
3. Link the plugin to PyMOL's startup directory
4. Install `websocket-client` and `openai` in PyMOL's Python (if detected)

### Windows

```cmd
git clone https://github.com/varunsharm16/pymol_ai_assistant.git
cd pymol_ai_assistant
install.bat
```

The installer will:
1. Create a Python venv and install bridge dependencies
2. Run `npm install` for the Electron UI
3. Copy the plugin to `%APPDATA%\PyMOL\Startup\`

### After Installation

1. Open PyMOL
2. Type `ai` in the PyMOL command line
3. The Electron UI will open — enter your API key in Settings on first launch
4. Start typing natural language commands!

---

## Usage

### Load a Molecule

**From PDB:**
1. Click "Molecules" in the toolbar
2. Enter a PDB ID (e.g., `1CRN`)
3. Click "Preview" for metadata, then "Load in PyMOL"

**From File:**
1. Click "Molecules" → "Import File" tab
2. Choose a `.pdb`, `.cif`, `.mol2`, or `.sdf` file

### Send Commands

Type in the prompt bar: `"Color all cysteines yellow"` → Watch it happen in PyMOL! ✨

### Save/Load Projects

- Click "Projects" → "Save" to export your session as a `.pymolai` file
- Click "Open" to restore a previous session with all molecule state and command history

### System Check

Click "Status" in the toolbar to run a 5-point health check:
- ✅ Bridge server reachable
- ✅ PyMOL plugin connected
- ✅ API key valid
- ✅ Node.js ≥ 18
- ✅ Python ≥ 3.8

---

## Cost

This uses OpenAI's GPT-3.5-turbo API. Each command costs approximately **$0.001–$0.002** (less than a penny). A typical session of 50 commands costs about $0.05–$0.10.

---

## Security

- ✅ API key stored locally in `~/.pymol/config.json` with restricted permissions
- ✅ Bridge runs on localhost only (127.0.0.1)
- ✅ No credentials in source code or git history
- ✅ API key entered through the UI — no manual file creation needed

---

## Troubleshooting

### 1. Bridge won't start
- Make sure `pymol-bridge/.venv` exists. Re-run `./install.sh` if needed.
- Check that port 5179 isn't in use: `lsof -i :5179`

### 2. Electron UI doesn't open
- Ensure `node_modules` exists in `pymol-ai-electron-ui/`. Run `npm install` if missing.
- Requires Node.js 18+. Check with `node --version`.

### 3. PyMOL says "Unknown command: ai"
- The plugin isn't installed. Re-run the installer or manually:
  ```
  run /path/to/pymol_ai_assistant/plugin/__init__.py
  ```

### 4. Commands fail with "No PyMOL plugin connected"
- Make sure you typed `ai` in PyMOL (not just opened the Electron UI separately).
- Check the System Check panel for diagnostics.

### 5. API key errors
- Go to Settings in the Electron UI and re-enter your key.
- Make sure your OpenAI account has API credits.
- Test at https://platform.openai.com/api-keys

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Branch Naming
- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Release branches: `release/x.y.z`

### Pull Requests
1. Fork the repository
2. Create your feature branch
3. Make your changes with clear commit messages
4. Run tests: `cd tests && pytest -v`
5. Submit a PR against `main`

### Running Tests
```bash
# Python bridge tests
pip install pytest httpx
pytest tests/ -v

# Electron build check
cd pymol-ai-electron-ui
npm run build
```

---

## License

MIT License — feel free to use, modify, and share.

---

*Made to help students and researchers focus on science, not syntax.* 🔬
