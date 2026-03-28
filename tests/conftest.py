"""Shared pytest fixtures for NexMol backend tests."""
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _isolate_config(monkeypatch, tmp_path):
    """Redirect the NexMol home dir to a temp location for test isolation."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    fake_nexmol = fake_home / ".nexmol"
    fake_nexmol.mkdir()

    # Monkeypatch Path.home() to return our temp dir
    monkeypatch.setattr(Path, "home", staticmethod(lambda: fake_home))


@pytest.fixture
def client():
    """FastAPI TestClient for the bridge app."""
    # Import here so monkeypatch is applied before module-level code runs
    import importlib
    import sys

    # Force re-import of main to pick up monkeypatched paths
    if "main" in sys.modules:
        del sys.modules["main"]

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pymol-bridge"))
    import main

    return TestClient(main.app)
