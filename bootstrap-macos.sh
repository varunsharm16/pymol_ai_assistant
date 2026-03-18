#!/usr/bin/env bash
# PyMOL AI Assistant — macOS bootstrap installer
# Usage:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/varunsharm16/pymol_ai_assistant/v0.1.1-alpha-build/bootstrap-macos.sh)"

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*"; }

PROJECT_DIR="${HOME}/pymol_ai_assistant"
REPO_URL="https://github.com/varunsharm16/pymol_ai_assistant.git"

echo -e "${BOLD}PyMOL AI Assistant — macOS Bootstrap${NC}"
echo "======================================"
echo ""

if [ "$(uname -s)" != "Darwin" ]; then
    err "This bootstrap currently supports macOS only."
    err "Use the manual install steps on other platforms."
    exit 1
fi

if ! command -v bash >/dev/null 2>&1; then
    err "bash is required to run this bootstrap."
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    err "curl is required to run this bootstrap."
    exit 1
fi

echo "Checking network access..."
if ! curl -fsSLI --connect-timeout 10 https://github.com >/dev/null 2>&1; then
    err "Could not reach GitHub. Check your internet connection and try again."
    exit 1
fi
info "Network access looks good"

load_brew() {
    if command -v brew >/dev/null 2>&1; then
        return 0
    fi
    if [ -x "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
        return 0
    fi
    if [ -x "/usr/local/bin/brew" ]; then
        eval "$(/usr/local/bin/brew shellenv)"
        return 0
    fi
    return 1
}

echo ""
echo "Checking Homebrew..."
if ! load_brew; then
    warn "Homebrew not found. Installing Homebrew..."
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if ! load_brew; then
        err "Homebrew installation completed, but brew is still not available in this shell."
        err "See https://brew.sh and rerun this bootstrap."
        exit 1
    fi
fi
info "Homebrew: $(brew --version | head -1)"

install_with_brew() {
    local package="$1"
    local label="$2"
    if ! brew install "$package"; then
        err "Failed to install ${label} with Homebrew."
        err "Command: brew install ${package}"
        exit 1
    fi
}

echo ""
echo "Checking Git..."
if ! command -v git >/dev/null 2>&1; then
    install_with_brew git "Git"
fi
info "Git: $(git --version)"

echo ""
echo "Checking Python..."
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        ver=$("$candidate" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 8 ]; then
            PYTHON="$candidate"
            break
        fi
    fi
done
if [ -z "$PYTHON" ]; then
    install_with_brew python "Python"
    PYTHON="python3"
fi
info "Python: $($PYTHON --version 2>&1)"

echo ""
echo "Checking Node.js..."
NODE_OK=0
if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node --version | grep -oE '[0-9]+' | head -1)
    if [ "${NODE_VER}" -ge 18 ]; then
        NODE_OK=1
    fi
fi
if [ "$NODE_OK" -ne 1 ] || ! command -v npm >/dev/null 2>&1; then
    install_with_brew node "Node.js"
fi
info "Node.js: $(node --version)"
info "npm: $(npm --version)"

echo ""
echo "Checking PyMOL..."
if [ ! -d "/Applications/PyMOL.app" ] && [ ! -d "${HOME}/Applications/PyMOL.app" ]; then
    err "PyMOL was not found in /Applications or ~/Applications."
    err "Install PyMOL first, then rerun this bootstrap."
    exit 1
fi
info "PyMOL installation detected"

echo ""
echo "Preparing repository..."
if [ ! -e "$PROJECT_DIR" ]; then
    git clone "$REPO_URL" "$PROJECT_DIR"
    info "Repository cloned to $PROJECT_DIR"
elif [ -d "$PROJECT_DIR/.git" ]; then
    git -C "$PROJECT_DIR" pull --ff-only
    info "Repository updated in $PROJECT_DIR"
else
    err "$PROJECT_DIR already exists, but it is not a git repository."
    err "Move or remove that directory, then rerun this bootstrap."
    exit 1
fi

echo ""
echo "Running project installer..."
cd "$PROJECT_DIR"
chmod +x ./install.sh
./install.sh

echo ""
echo -e "${BOLD}${GREEN}Bootstrap complete!${NC}"
echo ""
echo "  1. Open PyMOL"
echo "  2. Type: ai"
echo "  3. The Electron UI should launch"
echo ""
