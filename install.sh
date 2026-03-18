#!/usr/bin/env bash
# PyMOL AI Assistant — Installer for macOS/Linux
# Usage: ./install.sh
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*"; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo -e "${BOLD}PyMOL AI Assistant — Installer${NC}"
echo "================================"
echo ""

# ---- Check prerequisites ----

# Python
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        ver=$("$candidate" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 8 ]; then
            PYTHON="$candidate"
            info "Python: $("$candidate" --version)"
            break
        fi
    fi
done
if [ -z "$PYTHON" ]; then
    err "Python 3.8+ is required. Install from https://python.org"
    exit 1
fi

# Node.js
if ! command -v node &>/dev/null; then
    err "Node.js is required. Install v18+ from https://nodejs.org"
    exit 1
fi
NODE_PATH="$(command -v node)"
NODE_VER=$(node --version | grep -oE '[0-9]+' | head -1)
if [ "$NODE_VER" -lt 18 ]; then
    err "Node.js 18+ required (found $(node --version)). Update from https://nodejs.org"
    exit 1
fi
info "Node.js: $(node --version)"

# npm
if ! command -v npm &>/dev/null; then
    err "npm is required (comes with Node.js)"
    exit 1
fi
NPM_PATH="$(command -v npm)"
info "npm: $(npm --version)"

echo ""

# ---- Step 1: Bridge server ----
echo -e "${BOLD}[1/3] Setting up bridge server...${NC}"
cd "$ROOT/pymol-bridge"
if [ ! -d ".venv" ]; then
    "$PYTHON" -m venv .venv
fi
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate
info "Bridge dependencies installed"

# ---- Step 2: Electron UI ----
echo -e "${BOLD}[2/3] Setting up Electron UI...${NC}"
cd "$ROOT/pymol-ai-electron-ui"
npm install --silent 2>/dev/null || npm install
npm run build
npm run build:electron
info "Electron UI dependencies installed"

# ---- Step 3: PyMOL plugin ----
echo -e "${BOLD}[3/3] Installing PyMOL plugin...${NC}"
PLUGIN_SRC="$ROOT/plugin"

# Detect PyMOL startup directory
PYMOL_STARTUP=""
CANDIDATES=(
    "$HOME/Library/Application Support/PyMOL/Startup"
    "$HOME/.pymol/startup"
)
for dir in "${CANDIDATES[@]}"; do
    if [ -d "$dir" ]; then
        PYMOL_STARTUP="$dir"
        break
    fi
done

# Create if common macOS path exists
if [ -z "$PYMOL_STARTUP" ]; then
    if [ -d "/Applications/PyMOL.app" ] || [ -d "$HOME/Applications/PyMOL.app" ]; then
        PYMOL_STARTUP="$HOME/Library/Application Support/PyMOL/Startup"
        mkdir -p "$PYMOL_STARTUP"
    else
        PYMOL_STARTUP="$HOME/.pymol/startup"
        mkdir -p "$PYMOL_STARTUP"
    fi
fi

# Install plugin package under ~/.pymol/Plugins and add a startup loader
PYMOL_PLUGIN_HOME="$HOME/.pymol/Plugins"
mkdir -p "$PYMOL_PLUGIN_HOME"

PLUGIN_DIR="$PYMOL_PLUGIN_HOME/pymol_ai_assistant"
if [ -L "$PLUGIN_DIR" ]; then
    rm "$PLUGIN_DIR"
fi
if [ -d "$PLUGIN_DIR" ]; then
    warn "Plugin directory already exists at $PLUGIN_DIR — backing up"
    mv "$PLUGIN_DIR" "${PLUGIN_DIR}.backup.$(date +%s)"
fi
ln -s "$PLUGIN_SRC" "$PLUGIN_DIR"
info "Plugin linked: $PLUGIN_DIR → $PLUGIN_SRC"

LEGACY_STARTUP_PLUGIN="$PYMOL_STARTUP/pymol_ai_assistant"
if [ -L "$LEGACY_STARTUP_PLUGIN" ]; then
    rm "$LEGACY_STARTUP_PLUGIN"
elif [ -d "$LEGACY_STARTUP_PLUGIN" ]; then
    warn "Legacy startup plugin directory found at $LEGACY_STARTUP_PLUGIN — backing up"
    mv "$LEGACY_STARTUP_PLUGIN" "${LEGACY_STARTUP_PLUGIN}.backup.$(date +%s)"
fi

STARTUP_LOADER="$PYMOL_STARTUP/pymol_ai_assistant_startup.py"
cat > "$STARTUP_LOADER" <<'PYEOF'
import importlib.util
import pathlib
import sys

plugin_dir = pathlib.Path.home() / ".pymol" / "Plugins" / "pymol_ai_assistant"
init_py = plugin_dir / "__init__.py"
if not init_py.exists():
    raise FileNotFoundError(f"PyMOL AI Assistant plugin not found at {init_py}")

spec = importlib.util.spec_from_file_location(
    "pymol_ai_assistant",
    str(init_py),
    submodule_search_locations=[str(plugin_dir)],
)
if spec is None or spec.loader is None:
    raise ImportError(f"Could not create import spec for {init_py}")

module = importlib.util.module_from_spec(spec)
sys.modules["pymol_ai_assistant"] = module
spec.loader.exec_module(module)
PYEOF
info "Startup loader written to $STARTUP_LOADER"

# ---- Write project root to config ----
CONFIG_DIR="$HOME/.pymol"
CONFIG_FILE="$CONFIG_DIR/config.json"
mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
    # Update existing config — preserve other keys
    # Use python for safe JSON manipulation
    "$PYTHON" -c "
import json, pathlib
p = pathlib.Path('$CONFIG_FILE')
cfg = json.loads(p.read_text()) if p.exists() else {}
cfg['project_root'] = '$ROOT'
cfg['node_path'] = '$NODE_PATH'
cfg['npm_path'] = '$NPM_PATH'
p.write_text(json.dumps(cfg, indent=2))
"
else
    echo "{\"project_root\": \"$ROOT\", \"node_path\": \"$NODE_PATH\", \"npm_path\": \"$NPM_PATH\"}" > "$CONFIG_FILE"
fi
chmod 600 "$CONFIG_FILE"
info "Project root saved to $CONFIG_FILE"

# ---- Install websocket-client and openai in PyMOL's Python ----
# Try to detect PyMOL's pip
PYMOL_PIP=""
if [ -x "/Applications/PyMOL.app/Contents/bin/pip" ]; then
    PYMOL_PIP="/Applications/PyMOL.app/Contents/bin/pip"
elif [ -x "/Applications/PyMOL.app/Contents/bin/pip3" ]; then
    PYMOL_PIP="/Applications/PyMOL.app/Contents/bin/pip3"
fi

if [ -n "$PYMOL_PIP" ]; then
    echo ""
    echo "Installing PyMOL Python dependencies..."
    "$PYMOL_PIP" install --quiet websocket-client openai 2>/dev/null || \
        warn "Could not install packages in PyMOL's Python. You may need to run:
        $PYMOL_PIP install websocket-client openai"
    info "PyMOL Python packages installed"
else
    warn "Could not detect PyMOL's pip. Please install these in PyMOL's Python:
    pip install websocket-client openai"
fi

# ---- Done ----
echo ""
echo -e "${BOLD}${GREEN}Installation complete!${NC}"
echo ""
echo "  1. Open PyMOL"
echo "  2. Type: ai"
echo "  3. That's it! The bridge, UI, and plugin will start automatically."
echo ""
echo "  First time? Enter your OpenAI API key in the Settings panel."
echo ""
