# PyMOL AI Assistant 🧬🤖

Control PyMOL using natural language. Just describe what you want in plain English—no need to memorize complex commands.

![License](https://img.shields.io/badge/license-MIT-green)

## Why This Exists

Learning molecular visualization tools like PyMOL can be intimidating. The command syntax is powerful but has a steep learning curve, especially for:

- **Students** just starting in structural biology or biochemistry
- **Researchers** who occasionally need to visualize proteins but don't use PyMOL daily
- **Educators** who want to focus on teaching concepts, not software commands

This plugin bridges that gap. Instead of learning commands like `cmd.color("magenta", "resn CYS and chain A")`, you simply type:

> "Color the cysteines in chain A magenta"

The AI interprets your intent and executes the correct PyMOL command.

## Features

- 🗣️ **Natural language commands** — Describe actions in plain English
- 🖥️ **Desktop app** — Persistent UI with command history and projects
- 🎨 **Visualization controls** — Color residues, chains, change representations
- 📸 **Screenshots** — Save publication-quality snapshots
- 🔄 **View manipulation** — Rotate and orient your molecule

## Supported Commands

| Action | Example Prompt |
|--------|----------------|
| Color residues | "Color all cysteines magenta" |
| Color chains | "Make chain A blue" |
| Color everything | "Color the whole structure green" |
| Background | "Set background to white" |
| Rotate view | "Rotate 45 degrees around the Y axis" |
| Representation | "Show as cartoon" / "Show surface" |
| Snapshot | "Take a screenshot" |

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
│   └── __init__.py
├── pymol-bridge/               # FastAPI WebSocket server
│   ├── main.py
│   └── requirements.txt
├── pymol-ai-electron-ui/       # Desktop app (Electron + React)
│   ├── src/
│   └── package.json
└── README.md
```

---

## Installation

### Prerequisites

- [PyMOL](https://pymol.org/) (open-source or licensed version)
- [Node.js](https://nodejs.org/) v18+ (for the desktop UI)
- Python 3.8+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Step 1: Set Up Your API Key

Create a file at `~/.pymol/openai_api_key.txt` containing only your OpenAI API key:

```bash
mkdir -p ~/.pymol
echo "sk-your-api-key-here" > ~/.pymol/openai_api_key.txt
chmod 600 ~/.pymol/openai_api_key.txt
```

> ⚠️ **Security Note**: Never commit your API key. The key file is stored outside the repo and is only readable by you.

### Step 2: Install the Bridge Server

```bash
cd pymol-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 3: Install the Desktop UI

```bash
cd pymol-ai-electron-ui
npm install
```

### Step 4: Install PyMOL Dependencies

Install required packages in PyMOL's Python environment:

```bash
# For macOS PyMOL.app:
/Applications/PyMOL.app/Contents/bin/pip install websocket-client openai
```

---

## Usage

### 1. Start the Bridge Server

```bash
cd pymol-bridge
source .venv/bin/activate
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:5179
```

### 2. Start the Desktop UI

In a new terminal:
```bash
cd pymol-ai-electron-ui
npm run dev
```

### 3. Connect PyMOL

Open PyMOL and run:
```
run /path/to/pymol_ai_assistant/plugin/__init__.py
__init_plugin__()
```

You should see:
```
[AI-BRIDGE] WebSocket listener thread started.
[AI-BRIDGE] Connected.
```

### 4. Use It!

1. Load a structure in PyMOL: `fetch 1crn`
2. In the Electron UI, type: "Color all cysteines yellow"
3. Watch it happen in PyMOL! ✨

---

## Alternative: Qt Dialog Mode

If you don't want to use the desktop app, you can use the built-in Qt dialog:

1. Run the plugin in PyMOL (Step 3 above)
2. Type `ai` in PyMOL's command line
3. A dialog appears—enter your natural language command

---

## Cost

This uses OpenAI's GPT-3.5-turbo API. Each command costs approximately **$0.001–$0.002** (less than a penny). A typical session of 50 commands costs about $0.05–$0.10.

---

## Security

- ✅ API key stored externally (`~/.pymol/openai_api_key.txt`)
- ✅ Bridge runs on localhost only (127.0.0.1)
- ✅ No credentials in source code or git history

---

## License

MIT License — feel free to use, modify, and share.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

*Made to help students and researchers focus on science, not syntax.* 🔬