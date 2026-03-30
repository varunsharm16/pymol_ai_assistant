# Changelog

All notable changes to NexMol are documented here.

## [0.2.1-alpha] - 2026-03-29

### Added

- bundled the Python backend into the macOS app package so NexMol can run as a standalone desktop build
- added macOS packaging assets and release-ready app icon variants for GitHub distribution
- added a Windows packaging workflow that builds unsigned x64 NSIS installers as downloadable GitHub Actions artifacts
- added a branded empty-state viewer treatment and vendored the Manrope font locally

### Changed

- moved the chat workflow into the right-side panel layout
- refined the app branding across the packaged icon, viewer empty state, and settings surface
- simplified the in-app System Check to focus on the two user-relevant checks: backend reachability and API key validity
- updated the README and packaging workflow around GitHub Releases and macOS DMG distribution
- made backend packaging target-aware so macOS and Windows bundles use separate build output paths

### Fixed

- hardened the Electron main-process window lifecycle to avoid stale `BrowserWindow` crashes on relaunch
- cleaned up generated packaging artifacts and removed obsolete logo and build helper files from the app workflow

## [0.2.0-alpha] - 2026-03-27

### Added

- Mol*-backed molecule viewer embedded in the Electron UI
- backend ephemeral-port startup handshake for Electron
- frontend-executed command dispatch for supported viewer actions
- embedded structure data in `.nexmol` project saves so projects can restore an actual structure, not just metadata
- project-aware viewer restoration when switching or opening projects
- explicit staged messaging for preserved but not-yet-implemented commands such as contacts, alignment, and sequence view
- click-based current-selection tracking in the viewer for prompts that depend on `current_selection`

### Changed

- repositioned the app as NexMol, a standalone desktop prototype rather than a PyMOL plugin workflow
- replaced the previous 3Dmol viewer layer with a hidden-controls Mol* plugin while preserving the existing React shell and project flow
- hardened selection handling so unsupported `object` or `current_selection` cases no longer silently fall back to the whole structure
- updated backend API tests to cover current NexMol endpoints instead of removed PyMOL bridge/session endpoints
- updated parser coverage to preserve deferred commands while keeping them clearly staged
- restored the Projects entry point after wiring project save/load/switch behavior to actual viewer state

### Staged

- `show_contacts`
- `align_objects`
- sequence view and sequence formatting

These remain part of the intended feature surface, but they currently return explicit not-yet-implemented messaging instead of failing ambiguously.

## [0.1.1-alpha] - 2026-03-17

### Added

- generalized action and selection model
- expanded parser coverage for canonical molecular-viewer actions
- command-model unit tests
- parser regression tests

### Changed

- upgraded natural-language prompting to emit canonical command specs
