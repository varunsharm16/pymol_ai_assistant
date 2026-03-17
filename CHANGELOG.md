# Changelog

All notable changes to PyMOL AI Assistant will be documented in this file.

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
