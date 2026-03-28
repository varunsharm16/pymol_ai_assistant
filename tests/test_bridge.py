"""Tests for the NexMol backend API endpoints."""

from __future__ import annotations

from pathlib import Path


def test_health_endpoint(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime_seconds" in data
    assert "plugin_connected" not in data


def test_nl_missing_text(client):
    resp = client.post("/nl", json={"text": ""})
    assert resp.status_code == 400
    assert resp.json()["ok"] is False


def test_nl_returns_normalized_spec(client, monkeypatch):
    import main

    monkeypatch.setattr(
      main,
      "_call_llm",
      lambda _prompt: {
          "name": "show_representation",
          "arguments": {
              "target": {"kind": "ligand"},
              "representation": "sticks",
          },
      },
    )

    resp = client.post("/nl", json={"text": "show ligand as sticks"})
    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "spec": {
            "name": "show_representation",
            "arguments": {
                "target": {"kind": "ligand"},
                "representation": "sticks",
            },
        },
    }


def test_nl_returns_error_for_invalid_command_spec(client, monkeypatch):
    import main

    monkeypatch.setattr(
      main,
      "_call_llm",
      lambda _prompt: {"name": "definitely_not_real", "arguments": {}},
    )

    resp = client.post("/nl", json={"text": "do the impossible"})
    assert resp.status_code == 500
    assert resp.json()["ok"] is False
    assert "Unknown action" in resp.json()["error"]


def test_nl_coerces_string_selection_target(client, monkeypatch):
    import main

    monkeypatch.setattr(
      main,
      "_call_llm",
      lambda _prompt: {
          "name": "color_selection",
          "arguments": {
              "target": "selected",
              "color": "red",
          },
      },
    )

    resp = client.post("/nl", json={"text": "make selected red"})
    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "spec": {
            "name": "color_selection",
            "arguments": {
                "target": {"kind": "active_selection"},
                "color": "red",
            },
        },
    }


def test_api_key_not_configured(client):
    resp = client.get("/api-key")
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


def test_api_key_roundtrip(client):
    save_resp = client.post("/api-key", json={"key": "sk-test-key-12345"})
    assert save_resp.status_code == 200
    assert save_resp.json()["ok"] is True

    get_resp = client.get("/api-key")
    assert get_resp.status_code == 200
    assert get_resp.json()["configured"] is True


def test_api_key_empty(client):
    resp = client.post("/api-key", json={"key": ""})
    assert resp.status_code == 400


def test_validate_key_no_key(client):
    resp = client.post("/validate-key", json={})
    assert resp.status_code == 400
    assert resp.json()["ok"] is False


def test_pdb_info_bad_id(client):
    resp = client.get("/pdb-info/X")
    assert resp.status_code == 400


def test_fetch_structure_data_bad_id(client):
    resp = client.post("/structures/fetch-data", json={"pdb_id": "XYZ"})
    assert resp.status_code == 400
    assert "4 characters" in resp.json()["error"]


def test_fetch_structure_data_not_found(client, monkeypatch):
    import main

    class FakeResponse:
        def __init__(self, status_code: int, json_data: dict | None = None, text: str = ""):
            self.status_code = status_code
            self._json_data = json_data or {}
            self.text = text

        def json(self):
            return self._json_data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            if "rest/v1/core/entry" in url:
                return FakeResponse(404)
            raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    resp = client.post("/structures/fetch-data", json={"pdb_id": "3XLI"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["error"].lower()


def test_fetch_structure_data_success(client, monkeypatch):
    import main

    requested_urls: list[str] = []

    class FakeResponse:
        def __init__(self, status_code: int, json_data: dict | None = None, text: str = ""):
            self.status_code = status_code
            self._json_data = json_data or {}
            self.text = text

        def json(self):
            return self._json_data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            requested_urls.append(url)
            if "rest/v1/core/entry" in url:
                return FakeResponse(
                    200,
                    json_data={
                        "struct": {"title": "Crambin"},
                        "exptl": [{"method": "X-RAY DIFFRACTION"}],
                        "rcsb_entry_info": {"resolution_combined": [1.5]},
                    },
                )
            if url.endswith(".cif"):
                return FakeResponse(200, text="data_1CRN\n#")
            if url.endswith(".pdb"):
                raise AssertionError("PDB fallback should not be used when mmCIF succeeds")
            raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    resp = client.post("/structures/fetch-data", json={"pdb_id": "1CRN"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["format"] == "cif"
    assert "data_1CRN" in resp.json()["data"]
    assert any(url.endswith("/1CRN.cif") for url in requested_urls)


def test_fetch_structure_data_falls_back_to_pdb_when_mmcif_missing(client, monkeypatch):
    import main

    requested_urls: list[str] = []

    class FakeResponse:
        def __init__(self, status_code: int, json_data: dict | None = None, text: str = ""):
            self.status_code = status_code
            self._json_data = json_data or {}
            self.text = text

        def json(self):
            return self._json_data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            requested_urls.append(url)
            if "rest/v1/core/entry" in url:
                return FakeResponse(
                    200,
                    json_data={
                        "struct": {"title": "Fallback Example"},
                        "exptl": [{"method": "ELECTRON MICROSCOPY"}],
                        "rcsb_entry_info": {"resolution_combined": [2.7]},
                    },
                )
            if url.endswith(".cif"):
                return FakeResponse(404)
            if url.endswith(".pdb"):
                return FakeResponse(200, text="ATOM      1  N   THR A   1")
            raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    resp = client.post("/structures/fetch-data", json={"pdb_id": "9NUK"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["format"] == "pdb"
    assert "ATOM" in resp.json()["data"]
    assert any(url.endswith("/9NUK.cif") for url in requested_urls)
    assert any(url.endswith("/9NUK.pdb") for url in requested_urls)


def test_read_structure_file_not_found(client):
    resp = client.post("/structures/read-file", json={"file_path": "/tmp/nonexistent.pdb"})
    assert resp.status_code == 404


def test_read_structure_file_success(client, tmp_path):
    structure_path = tmp_path / "example.pdb"
    structure_path.write_text("ATOM      1  N   GLY A   1\n", encoding="utf-8")

    resp = client.post("/structures/read-file", json={"file_path": str(structure_path)})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["format"] == "pdb"
    assert "ATOM" in resp.json()["data"]


def test_recent_projects_empty(client):
    resp = client.get("/projects/recent")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "projects": []}


def test_project_save_missing_path(client):
    resp = client.post("/projects/save", json={"name": "Test"})
    assert resp.status_code == 400


def test_project_save_and_load_roundtrip(client, tmp_path):
    project_path = tmp_path / "example.nexmol"
    payload = {
        "path": str(project_path),
        "name": "Example",
        "commands": [{
            "prompt": "Fetch PDB: 1CRN",
            "ts": 123,
            "status": "success",
            "resolver": "parser",
            "normalized_spec": {"name": "show_representation", "arguments": {"target": {"kind": "ligand"}}},
            "diagnostic": "",
        }],
        "notes": "hello world",
        "pdb_id": "1CRN",
        "molecule_path": "/tmp/example.pdb",
        "structure_data": "ATOM      1  N   THR A   1",
        "structure_format": "pdb",
        "object_name": "1CRN",
        "viewer_state": {
            "backgroundColor": "#ffffff",
            "cameraSnapshot": {"radius": 10},
            "operations": [{"name": "color_selection", "arguments": {"target": {"kind": "ligand"}, "color": "red"}}],
        },
    }

    save_resp = client.post("/projects/save", json=payload)
    assert save_resp.status_code == 200
    assert save_resp.json()["ok"] is True
    assert Path(project_path).exists()

    load_resp = client.post("/projects/load", json={"path": str(project_path)})
    assert load_resp.status_code == 200
    data = load_resp.json()
    assert data["ok"] is True
    assert data["data"]["name"] == "Example"
    assert data["data"]["structure_data"] == payload["structure_data"]
    assert data["data"]["structure_format"] == "pdb"
    assert data["data"]["object_name"] == "1CRN"
    assert data["data"]["viewer_state"] == payload["viewer_state"]


def test_project_load_not_found(client):
    resp = client.post("/projects/load", json={"path": "/tmp/nonexistent.nexmol"})
    assert resp.status_code == 404


def test_recent_projects_updated_after_save(client, tmp_path):
    project_path = tmp_path / "recent.nexmol"
    client.post("/projects/save", json={"path": str(project_path), "name": "Recent Project"})

    resp = client.get("/projects/recent")
    assert resp.status_code == 200
    projects = resp.json()["projects"]
    assert len(projects) == 1
    assert projects[0]["name"] == "Recent Project"
    assert projects[0]["path"] == str(project_path)
