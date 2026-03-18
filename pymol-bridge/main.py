"""
PyMOL AI Assistant — Bridge Server v0.1.1-alpha
================================================
FastAPI server bridging the Electron UI and PyMOL plugin via WebSocket.
Runs on http://127.0.0.1:5179.
"""
import asyncio
import base64
import json
import logging
import os
import platform
import stat
import time
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict, Set

import httpx
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pymol_bridge")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
_start_time = time.time()
__version__ = "0.1.1-alpha"

app = FastAPI(title="PyMOL Bridge", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_IS_WINDOWS = platform.system() == "Windows"
_CONFIG_DIR = Path.home() / ".pymol"
_CONFIG_PATH = _CONFIG_DIR / "config.json"
_RECENT_PATH = _CONFIG_DIR / "recent_projects.json"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
clients: Set[WebSocket] = set()
pending: Dict[str, asyncio.Future] = {}
# session data responses keyed by message id
session_data: Dict[str, asyncio.Future] = {}
selection_data: Dict[str, asyncio.Future] = {}
client_last_seen: Dict[WebSocket, float] = {}

STALE_CLIENT_SECONDS = 30.0
COMMAND_TIMEOUTS = {
    "nl_prompt": 45.0,
    "fetch_pdb": 45.0,
    "load_file": 20.0,
    "snapshot": 15.0,
    "get_session": 60.0,
    "set_session": 45.0,
    "clear_workspace": 15.0,
    "get_selection_info": 5.0,
}

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _touch_client(ws: WebSocket):
    client_last_seen[ws] = time.time()


def _prune_stale_clients():
    cutoff = time.time() - STALE_CLIENT_SECONDS
    stale = [ws for ws in list(clients) if client_last_seen.get(ws, 0.0) < cutoff]
    for ws in stale:
        clients.discard(ws)
        client_last_seen.pop(ws, None)


def _has_live_clients() -> bool:
    _prune_stale_clients()
    return len(clients) > 0


def _timeout_for_command(name: str) -> float:
    return COMMAND_TIMEOUTS.get((name or "").lower(), 8.0)


def _read_config() -> dict:
    try:
        if _CONFIG_PATH.exists():
            return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _write_config(cfg: dict):
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    if not _IS_WINDOWS:
        os.chmod(str(_CONFIG_PATH), stat.S_IRUSR | stat.S_IWUSR)  # 600


def _read_recent() -> list:
    try:
        if _RECENT_PATH.exists():
            return json.loads(_RECENT_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _write_recent(items: list):
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _RECENT_PATH.write_text(json.dumps(items[:10], indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# WebSocket endpoint (PyMOL plugin connects here)
# ---------------------------------------------------------------------------


@app.websocket("/bridge")
async def bridge_ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    _touch_client(ws)
    log.info("Plugin connected (%d total)", len(clients))
    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
                _touch_client(ws)
                if data.get("type") == "heartbeat":
                    continue
                # Check for session data response
                if data.get("type") == "session_data":
                    mid = data.get("id")
                    if mid and mid in session_data:
                        fut = session_data.pop(mid)
                        if not fut.done():
                            fut.set_result(data)
                    continue
                if data.get("type") == "selection_data":
                    mid = data.get("id")
                    if mid and mid in selection_data:
                        fut = selection_data.pop(mid)
                        if not fut.done():
                            fut.set_result(data)
                    continue
                # Check for ACK
                mid = data.get("id")
                if mid and mid in pending:
                    fut = pending.pop(mid)
                    if not fut.done():
                        fut.set_result(data)
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)
        client_last_seen.pop(ws, None)
        log.info("Plugin disconnected (%d remaining)", len(clients))


# ---------------------------------------------------------------------------
# Broadcast + ACK helpers
# ---------------------------------------------------------------------------


async def _broadcast_and_wait(payload: dict, timeout: float = 8.0):
    if not _has_live_clients():
        return {"ok": False, "error": "No PyMOL plugin connected"}, 503

    mid = str(uuid.uuid4())
    payload = dict(payload)
    payload["id"] = mid

    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    pending[mid] = fut

    text = json.dumps(payload)
    dead = []
    for ws in list(clients):
        try:
            await ws.send_text(text)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)
        client_last_seen.pop(ws, None)

    try:
        ack = await asyncio.wait_for(fut, timeout=timeout)
        if isinstance(ack, dict) and ack.get("ok") is True:
            return {"ok": True}, 200
        err = (ack or {}).get("error") if isinstance(ack, dict) else None
        return {"ok": False, "error": err or "Execution failed"}, 500
    except asyncio.TimeoutError:
        pending.pop(mid, None)
        return {"ok": False, "error": "Plugin ACK timeout"}, 504


async def _broadcast_and_wait_session(
    payload: dict, timeout: float = 15.0
):
    """Like _broadcast_and_wait but also waits for session_data response."""
    if not clients:
        return None, {"ok": False, "error": "No PyMOL plugin connected"}, 503
    _prune_stale_clients()
    if not clients:
        return None, {"ok": False, "error": "No PyMOL plugin connected"}, 503

    mid = str(uuid.uuid4())
    payload = dict(payload)
    payload["id"] = mid

    loop = asyncio.get_event_loop()

    # ACK future
    ack_fut = loop.create_future()
    pending[mid] = ack_fut

    # Session data future
    sess_fut = loop.create_future()
    session_data[mid] = sess_fut

    text = json.dumps(payload)
    for ws in list(clients):
        try:
            await ws.send_text(text)
        except Exception:
            clients.discard(ws)
            client_last_seen.pop(ws, None)

    try:
        started = time.time()
        ack = await asyncio.wait_for(ack_fut, timeout=timeout)
        if isinstance(ack, dict) and ack.get("ok") is not True:
            err = ack.get("error") or "Execution failed"
            return None, {"ok": False, "error": err}, 500

        elapsed = max(0.0, time.time() - started)
        remaining = max(0.1, timeout - elapsed)
        data = await asyncio.wait_for(sess_fut, timeout=remaining)
        return data, {"ok": True}, 200
    except asyncio.TimeoutError:
        pending.pop(mid, None)
        session_data.pop(mid, None)
        return None, {"ok": False, "error": "Session capture timeout"}, 504


async def _broadcast_and_wait_selection(payload: dict, timeout: float = 5.0):
    if not _has_live_clients():
        return None, {"ok": False, "error": "No PyMOL plugin connected"}, 503

    mid = str(uuid.uuid4())
    payload = dict(payload)
    payload["id"] = mid

    loop = asyncio.get_event_loop()
    ack_fut = loop.create_future()
    data_fut = loop.create_future()
    pending[mid] = ack_fut
    selection_data[mid] = data_fut

    text = json.dumps(payload)
    for ws in list(clients):
        try:
            await ws.send_text(text)
        except Exception:
            clients.discard(ws)
            client_last_seen.pop(ws, None)

    try:
        started = time.time()
        ack = await asyncio.wait_for(ack_fut, timeout=timeout)
        if isinstance(ack, dict) and ack.get("ok") is not True:
            err = ack.get("error") or "Execution failed"
            return None, {"ok": False, "error": err}, 500

        elapsed = max(0.0, time.time() - started)
        remaining = max(0.1, timeout - elapsed)
        data = await asyncio.wait_for(data_fut, timeout=remaining)
        return data, {"ok": True}, 200
    except asyncio.TimeoutError:
        pending.pop(mid, None)
        selection_data.pop(mid, None)
        return None, {"ok": False, "error": "Selection info timeout"}, 504


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": __version__,
        "plugin_connected": _has_live_clients(),
        "uptime_seconds": round(time.time() - _start_time, 1),
    }


@app.get("/selection/current")
async def current_selection():
    data, result, code = await _broadcast_and_wait_selection(
        {"name": "get_selection_info", "arguments": {}},
        timeout=_timeout_for_command("get_selection_info"),
    )
    if code != 200:
        return JSONResponse(result, status_code=code)
    return {"ok": True, "selection": (data or {}).get("selection")}


# ---------------------------------------------------------------------------
# Command endpoints
# ---------------------------------------------------------------------------


@app.post("/command")
async def command(req: Request):
    try:
        payload = await req.json()
        if not isinstance(payload, dict) or "name" not in payload:
            return JSONResponse(
                {"ok": False, "error": "Invalid payload"}, status_code=400
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    data, code = await _broadcast_and_wait(
        payload, timeout=_timeout_for_command(payload.get("name", ""))
    )
    return JSONResponse(data, status_code=code)


@app.post("/nl")
async def nl(req: Request):
    """Natural language prompt → plugin executes via LLM."""
    try:
        payload = await req.json()
        if not isinstance(payload, dict):
            return JSONResponse(
                {"ok": False, "error": "Invalid payload"}, status_code=400
            )
        text = (payload.get("text") or "").strip()
        if not text:
            return JSONResponse(
                {"ok": False, "error": "'text' is required"}, status_code=400
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    envelope = {"name": "nl_prompt", "arguments": {"text": text}}
    data, code = await _broadcast_and_wait(
        envelope, timeout=_timeout_for_command(envelope["name"])
    )
    return JSONResponse(data, status_code=code)


# ---------------------------------------------------------------------------
# API Key management
# ---------------------------------------------------------------------------


@app.get("/api-key")
async def get_api_key():
    """Check if an API key is configured (never returns the key itself)."""
    cfg = _read_config()
    key = cfg.get("openai_api_key", "")
    if not key:
        # Check legacy file
        legacy = Path.home() / ".pymol" / "openai_api_key.txt"
        if legacy.exists():
            try:
                key = legacy.read_text(encoding="utf-8").strip()
            except Exception:
                pass
    return {"configured": bool(key)}


@app.post("/api-key")
async def save_api_key(req: Request):
    """Save the API key to ~/.pymol/config.json."""
    try:
        body = await req.json()
        key = (body.get("key") or "").strip()
        if not key:
            return JSONResponse(
                {"ok": False, "error": "Key is required"}, status_code=400
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    cfg = _read_config()
    cfg["openai_api_key"] = key
    _write_config(cfg)
    log.info("API key saved to config.")
    return {"ok": True}


@app.post("/validate-key")
async def validate_key(req: Request):
    """Test if the provided API key works with OpenAI."""
    try:
        body = await req.json()
        key = (body.get("key") or "").strip()
        if not key:
            # Use stored key
            cfg = _read_config()
            key = cfg.get("openai_api_key", "")
        if not key:
            return JSONResponse(
                {"ok": False, "error": "No API key provided or configured"},
                status_code=400,
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
            if resp.status_code == 200:
                return {"ok": True, "message": "API key is valid"}
            elif resp.status_code == 401:
                return JSONResponse(
                    {"ok": False, "error": "Invalid API key"}, status_code=401
                )
            else:
                return JSONResponse(
                    {
                        "ok": False,
                        "error": f"OpenAI returned status {resp.status_code}",
                    },
                    status_code=502,
                )
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Network error: {exc}"}, status_code=502
        )


# ---------------------------------------------------------------------------
# PDB / Molecule endpoints
# ---------------------------------------------------------------------------


async def _lookup_pdb_metadata(pdb_id: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
            )
    except Exception as exc:
        return None, JSONResponse(
            {"ok": False, "error": f"Network error: {exc}"}, status_code=502
        )

    if resp.status_code == 200:
        data = resp.json()
        struct = data.get("struct", {})
        exptl = data.get("exptl", [{}])[0] if data.get("exptl") else {}
        rcsb = data.get("rcsb_entry_info", {})
        return {
            "ok": True,
            "pdb_id": pdb_id,
            "title": struct.get("title", ""),
            "method": exptl.get("method", ""),
            "resolution": rcsb.get("resolution_combined", [None])[0]
            if rcsb.get("resolution_combined")
            else None,
            "polymer_entity_count": rcsb.get(
                "polymer_entity_count_protein", 0
            ),
        }, None

    if resp.status_code == 404:
        return None, JSONResponse(
            {"ok": False, "error": f"PDB ID '{pdb_id}' not found"},
            status_code=404,
        )

    return None, JSONResponse(
        {"ok": False, "error": f"RCSB returned {resp.status_code}"},
        status_code=502,
    )


@app.get("/pdb-info/{pdb_id}")
async def pdb_info(pdb_id: str):
    """Fetch metadata from RCSB PDB REST API."""
    pdb_id = pdb_id.strip().upper()
    if not pdb_id or len(pdb_id) != 4:
        return JSONResponse(
            {"ok": False, "error": "PDB ID must be 4 characters"}, status_code=400
        )

    metadata, error_response = await _lookup_pdb_metadata(pdb_id)
    if error_response is not None:
        return error_response
    return metadata


@app.post("/fetch-pdb")
async def fetch_pdb(req: Request):
    """Tell the PyMOL plugin to fetch a PDB structure."""
    try:
        body = await req.json()
        pdb_id = (body.get("pdb_id") or "").strip().upper()
        if not pdb_id:
            return JSONResponse(
                {"ok": False, "error": "pdb_id is required"}, status_code=400
            )
        if len(pdb_id) != 4:
            return JSONResponse(
                {"ok": False, "error": "PDB ID must be 4 characters"}, status_code=400
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    if not _has_live_clients():
        return JSONResponse(
            {"ok": False, "error": "No PyMOL plugin connected"}, status_code=503
        )

    _, error_response = await _lookup_pdb_metadata(pdb_id)
    if error_response is not None:
        return error_response

    data, code = await _broadcast_and_wait(
        {"name": "fetch_pdb", "arguments": {"pdb_id": pdb_id}},
        timeout=_timeout_for_command("fetch_pdb"),
    )
    return JSONResponse(data, status_code=code)


@app.post("/import-file")
async def import_file(req: Request):
    """Tell the PyMOL plugin to load a local file."""
    try:
        body = await req.json()
        file_path = (body.get("file_path") or "").strip()
        if not file_path:
            return JSONResponse(
                {"ok": False, "error": "file_path is required"}, status_code=400
            )
        if not Path(file_path).exists():
            return JSONResponse(
                {"ok": False, "error": f"File not found: {file_path}"},
                status_code=404,
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    data, code = await _broadcast_and_wait(
        {"name": "load_file", "arguments": {"file_path": file_path}},
        timeout=_timeout_for_command("load_file"),
    )
    return JSONResponse(data, status_code=code)


@app.post("/session/capture")
async def session_capture():
    data, payload, code = await _broadcast_and_wait_session(
        {"name": "get_session"}, timeout=_timeout_for_command("get_session")
    )
    if data is None:
        return JSONResponse(payload, status_code=code)
    return {"ok": True, "data": data.get("data", "")}


@app.post("/session/restore")
async def session_restore(req: Request):
    try:
        body = await req.json()
        data = (body.get("data") or "").strip()
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    if not data:
        return JSONResponse(
            {"ok": False, "error": "data is required"}, status_code=400
        )

    payload, code = await _broadcast_and_wait(
        {"name": "set_session", "arguments": {"data": data}},
        timeout=_timeout_for_command("set_session"),
    )
    return JSONResponse(payload, status_code=code)


@app.post("/session/clear")
async def session_clear():
    payload, code = await _broadcast_and_wait(
        {"name": "clear_workspace", "arguments": {}},
        timeout=_timeout_for_command("clear_workspace"),
    )
    return JSONResponse(payload, status_code=code)


# ---------------------------------------------------------------------------
# Project save / load
# ---------------------------------------------------------------------------


@app.post("/project/save")
async def project_save(req: Request):
    """
    Save a .pymolai project file (zip containing metadata.json + session.pse).
    """
    try:
        body = await req.json()
        save_path = (body.get("path") or "").strip()
        project_name = body.get("name", "Untitled")
        commands = body.get("commands", [])
        pdb_id = body.get("pdb_id", "")
        molecule_path = body.get("molecule_path", "")
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    if not save_path:
        return JSONResponse(
            {"ok": False, "error": "Save path required"}, status_code=400
        )

    # Request session from plugin
    sess_resp, _, code = await _broadcast_and_wait_session(
        {"name": "get_session"}, timeout=_timeout_for_command("get_session")
    )
    if sess_resp is None:
        return JSONResponse(
            {"ok": False, "error": "Failed to capture PyMOL session"}, status_code=code
        )

    session_b64 = sess_resp.get("data", "")

    # Build metadata
    metadata = {
        "name": project_name,
        "version": __version__,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "commands": commands,
        "pdb_id": pdb_id,
        "molecule_path": molecule_path,
    }

    # Write zip
    try:
        save_p = Path(save_path)
        if not save_p.suffix:
            save_p = save_p.with_suffix(".pymolai")

        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("metadata.json", json.dumps(metadata, indent=2))
            if session_b64:
                zf.writestr("session.pse", base64.b64decode(session_b64))
        save_p.parent.mkdir(parents=True, exist_ok=True)
        save_p.write_bytes(buf.getvalue())

        # Update recent projects
        recent = _read_recent()
        entry = {"name": project_name, "path": str(save_p), "saved_at": metadata["created_at"]}
        recent = [r for r in recent if r.get("path") != str(save_p)]
        recent.insert(0, entry)
        _write_recent(recent[:10])

        log.info("Project saved: %s", save_p)
        return {"ok": True, "path": str(save_p)}
    except Exception as exc:
        log.error("Project save failed: %s", exc)
        return JSONResponse(
            {"ok": False, "error": str(exc)}, status_code=500
        )


@app.post("/project/load")
async def project_load(req: Request):
    """Load a .pymolai project file and restore the session in PyMOL."""
    try:
        body = await req.json()
        load_path = (body.get("path") or "").strip()
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    if not load_path or not Path(load_path).exists():
        return JSONResponse(
            {"ok": False, "error": "Project file not found"}, status_code=404
        )

    try:
        with zipfile.ZipFile(load_path, "r") as zf:
            metadata = json.loads(zf.read("metadata.json"))
            session_bytes = None
            if "session.pse" in zf.namelist():
                session_bytes = zf.read("session.pse")
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Failed to read project file: {exc}"},
            status_code=400,
        )

    return {
        "ok": True,
        "metadata": metadata,
        "session_data": base64.b64encode(session_bytes).decode("ascii")
        if session_bytes
        else "",
    }


@app.get("/projects/recent")
async def recent_projects():
    """Return the last 5 saved projects."""
    items = _read_recent()
    # Filter out non-existent files
    valid = [r for r in items if Path(r.get("path", "")).exists()]
    return {"ok": True, "projects": valid[:5]}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=5179, reload=False)
