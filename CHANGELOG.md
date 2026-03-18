# Changelog

All notable changes to PyMOL AI Assistant will be documented in this file.

## [0.1.1-alpha] — 2026-03-17

### Added
- **Generalized action + selection model** — canonical commands for showing, hiding, isolating, removing, coloring, labeling, transparency, zoom/orient, distance measurement, polar contacts, and alignment
- **Target-aware selections** — first-class support for protein, ligand, water, metals, hydrogens, chain, residue, object, current selection, and all
- **Expanded parser coverage** — deterministic parsing for cleanup, visualization, navigation, and analysis prompts
- **Command-model unit tests** — pure Python tests for selection compilation and legacy-command normalization
- **Parser regression tests** — lightweight Node-based parser tests without introducing a heavyweight frontend test runner
- **macOS bootstrap installer** — one-command pre-clone setup that can install missing Git, Python, and Node via Homebrew before running the normal installer
- **Windows bootstrap installer** — one-command pre-clone setup that can install missing Git, Python, and Node with `winget` or Chocolatey before running the normal installer

### Changed
- Upgraded NL command prompting to emit the canonical command schema instead of the original fixed verb set
- Expanded Quick Actions, Toolbox, and Help examples to surface the new capabilities
- Bumped runtime/app version markers to `0.1.1-alpha`

## [0.1.0-alpha] — 2026-03-17

### Added
- **Unified `ai` launcher** — type `ai` in PyMOL to start bridge, Electron UI, and plugin connection in one command
- **In-app API key entry** — first-launch modal and Settings panel; no more manual file creation
- **Onboarding health check** — 5-point system diagnostic with fix suggestions
- **Command queue** — retry logic with exponential backoff; commands persist across reconnects
- **Project save & load** — `.pymolai` zip format with session state and command history
- **PDB fetch & file import** — load molecules by PDB ID or local file directly from the UI
- **Cross-platform support** — macOS and Windows compatibility throughout
- **Installer scripts** — `install.sh` (macOS/Linux) and `install.bat` (Windows) for 5-minute setup
- **Automated tests** — pytest suite for bridge API, Electron smoke test

### Changed
- Replaced all `print()` logging with Python `logging` module (INFO default)
- API key loaded lazily from `~/.pymol/config.json` instead of at import time
- Connected log (`[AI-BRIDGE] Connected`) now prints once per session (not on every reconnect)
- Pinned all Python and npm dependencies to exact versions

### Removed
- Qt input dialog (`QInputDialog`) — all interaction through Electron UI
- Subscription/upgrade UI (UpgradeModal, ProfilePanel, pricing tiers)
- Dead plugin files (`assistant.py`, `commands.py`, `openai.py`)
