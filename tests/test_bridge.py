"""Tests for the PyMOL AI Assistant bridge server API endpoints."""
import json
import zipfile


def test_health_endpoint(client):
    """GET /health returns expected shape with version and plugin status."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "plugin_connected" in data
    assert isinstance(data["plugin_connected"], bool)
    assert "uptime_seconds" in data


def test_health_no_plugin(client):
    """With no WebSocket clients, plugin_connected should be False."""
    data = client.get("/health").json()
    assert data["plugin_connected"] is False


def test_command_no_plugin(client):
    """POST /command returns 503 when no plugin is connected."""
    resp = client.post(
        "/command",
        json={"name": "color_all", "arguments": {"color": "red"}},
    )
    assert resp.status_code == 503
    data = resp.json()
    assert data["ok"] is False
    assert "No PyMOL plugin connected" in data["error"]


def test_command_bad_payload(client):
    """POST /command with missing name returns 400."""
    resp = client.post("/command", json={"arguments": {"color": "red"}})
    assert resp.status_code == 400


def test_nl_missing_text(client):
    """POST /nl with empty text returns 400."""
    resp = client.post("/nl", json={"text": ""})
    assert resp.status_code == 400
    data = resp.json()
    assert data["ok"] is False


def test_nl_no_plugin(client):
    """POST /nl with valid text but no plugin returns 503."""
    resp = client.post("/nl", json={"text": "color all red"})
    assert resp.status_code == 503


def test_api_key_not_configured(client):
    """GET /api-key returns configured=False when no key exists."""
    resp = client.get("/api-key")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False


def test_api_key_roundtrip(client):
    """POST then GET /api-key verifies save + check works."""
    # Save
    resp = client.post("/api-key", json={"key": "sk-test-key-12345"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Check
    resp2 = client.get("/api-key")
    assert resp2.json()["configured"] is True


def test_api_key_empty(client):
    """POST /api-key with empty key returns 400."""
    resp = client.post("/api-key", json={"key": ""})
    assert resp.status_code == 400


def test_validate_key_no_key(client):
    """POST /validate-key with no key configured returns 400."""
    resp = client.post("/validate-key", json={})
    assert resp.status_code == 400


def test_pdb_info_bad_id(client):
    """GET /pdb-info with bad ID returns 400."""
    resp = client.get("/pdb-info/X")
    assert resp.status_code == 400


def test_fetch_pdb_no_plugin(client):
    """POST /fetch-pdb with no plugin connected returns 503."""
    resp = client.post("/fetch-pdb", json={"pdb_id": "1CRN"})
    assert resp.status_code == 503


def test_fetch_pdb_bad_id(client):
    """POST /fetch-pdb rejects malformed PDB IDs before contacting PyMOL."""
    resp = client.post("/fetch-pdb", json={"pdb_id": "XYZ"})
    assert resp.status_code == 400
    assert "4 characters" in resp.json()["error"]


def test_fetch_pdb_not_found(client, monkeypatch):
    """POST /fetch-pdb returns 404 immediately when RCSB reports missing entry."""
    import main

    class FakeResponse:
        status_code = 404

        def json(self):
            return {}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            return FakeResponse()

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(main, "_has_live_clients", lambda: True)

    resp = client.post("/fetch-pdb", json={"pdb_id": "3XLI"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["error"].lower()


def test_import_file_not_found(client):
    """POST /import-file with nonexistent file returns 404."""
    resp = client.post("/import-file", json={"file_path": "/tmp/nonexistent.pdb"})
    assert resp.status_code == 404


def test_recent_projects_empty(client):
    """GET /projects/recent returns empty list when no projects saved."""
    resp = client.get("/projects/recent")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["projects"] == []


def test_project_save_missing_path(client):
    """POST /project/save without path returns 400."""
    resp = client.post("/project/save", json={"name": "Test"})
    assert resp.status_code == 400


def test_project_load_not_found(client):
    """POST /project/load with nonexistent file returns 404."""
    resp = client.post("/project/load", json={"path": "/tmp/nonexistent.pymolai"})
    assert resp.status_code == 404


def test_project_load_returns_metadata_and_session_data(client, tmp_path):
    """POST /project/load returns both metadata and base64 session data."""
    project_path = tmp_path / "example.pymolai"
    metadata = {"name": "Example", "commands": [{"prompt": "Fetch PDB: 1CRN"}]}
    session_bytes = b"fake-pse-session"

    with zipfile.ZipFile(project_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("metadata.json", json.dumps(metadata))
        zf.writestr("session.pse", session_bytes)

    resp = client.post("/project/load", json={"path": str(project_path)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["metadata"]["name"] == "Example"
    assert isinstance(data["session_data"], str)
    assert data["session_data"]


def test_session_capture_no_plugin(client):
    """POST /session/capture returns 503 when no plugin is connected."""
    resp = client.post("/session/capture", json={})
    assert resp.status_code == 503


def test_session_restore_requires_data(client):
    """POST /session/restore validates missing session data."""
    resp = client.post("/session/restore", json={})
    assert resp.status_code == 400


def test_session_clear_no_plugin(client):
    """POST /session/clear returns 503 when no plugin is connected."""
    resp = client.post("/session/clear", json={})
    assert resp.status_code == 503


def test_timeout_map(client):
    """Bridge timeout helper returns command-specific values."""
    import main

    assert main._timeout_for_command("nl_prompt") == 45.0
    assert main._timeout_for_command("fetch_pdb") == 45.0
    assert main._timeout_for_command("load_file") == 20.0
    assert main._timeout_for_command("unknown") == 8.0
