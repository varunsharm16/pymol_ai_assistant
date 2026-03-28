"""
NexMol — Backend Server v0.2.0
===============================
FastAPI server providing AI/LLM, config, and structure data services.
The frontend (Electron + 3Dmol.js) executes viewer commands directly.
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import platform
import socket
import stat
import sys
import time
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

from command_model import (
    CANONICAL_ACTIONS,
    ONLY_ONE_ACTION_ERROR,
    normalize_command_spec,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nexmol")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
_start_time = time.time()
__version__ = "0.2.0"

app = FastAPI(title="NexMol Backend", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Electron app, all local
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Paths / Config
# ---------------------------------------------------------------------------
_IS_WINDOWS = platform.system() == "Windows"
_CONFIG_DIR = Path.home() / ".nexmol"
_CONFIG_PATH = _CONFIG_DIR / "config.json"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"

RES_MAP = {
    "A": "ALA", "C": "CYS", "D": "ASP", "E": "GLU", "F": "PHE",
    "G": "GLY", "H": "HIS", "I": "ILE", "K": "LYS", "L": "LEU",
    "M": "MET", "N": "ASN", "P": "PRO", "Q": "GLN", "R": "ARG",
    "S": "SER", "T": "THR", "V": "VAL", "W": "TRP", "Y": "TYR",
}


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
        os.chmod(str(_CONFIG_PATH), stat.S_IRUSR | stat.S_IWUSR)


def _get_api_key() -> str:
    cfg = _read_config()
    return cfg.get("openai_api_key", "")


def _get_openai_model() -> str:
    cfg = _read_config()
    model = str(cfg.get("openai_model") or "").strip()
    return model or DEFAULT_OPENAI_MODEL


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------
_openai_client: OpenAI | None = None


def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    key = _get_api_key()
    if not key:
        raise RuntimeError(
            "No API key configured. Enter your key in Settings."
        )
    _openai_client = OpenAI(api_key=key)
    return _openai_client


def _call_llm(prompt: str) -> dict:
    """Send a natural language prompt to OpenAI and return a command spec."""
    log.debug("LLM prompt: %s", prompt)
    client = _get_openai_client()

    system_msg = (
        "You are a molecular visualization assistant. The user asks for exactly one simple action. "
        f"If the request contains multiple actions, respond with JSON error text: {json.dumps(ONLY_ONE_ACTION_ERROR)}.\n"
        "Respond with exactly one JSON OBJECT with keys:\n"
        " • name: one of "
        + ", ".join(f'"{k}"' for k in sorted(CANONICAL_ACTIONS | {"set_background", "rotate_view", "snapshot"}))
        + "\n"
        " • arguments: an OBJECT of keyword arguments.\n"
        "SelectionSpec shapes:\n"
        ' • {"kind":"all"}\n'
        ' • {"kind":"protein"}\n'
        ' • {"kind":"ligand"}\n'
        ' • {"kind":"water"}\n'
        ' • {"kind":"metals"}\n'
        ' • {"kind":"hydrogens"}\n'
        ' • {"kind":"chain","chain":"A"}\n'
        ' • {"kind":"residue","residue":"ASP","resi":"21","chain":"B"}\n'
        ' • {"kind":"atom","atom":"CA","residue":"ASP","resi":"21","chain":"B"}\n'
        ' • {"kind":"object","object":"my_obj"}\n'
        "Use canonical command names instead of legacy names like color_residue or set_cartoon.\n"
        "Do not return arrays. Do not chain actions. Examples:\n"
        ' remove waters -> {"name":"remove_selection","arguments":{"target":{"kind":"water"}}}\n'
        ' measure distance between selected -> {"name":"measure_distance","arguments":{"source":{"kind":"current_selection"},"target":{"kind":"current_selection"}}}\n'
        ' show ligand as sticks -> {"name":"show_representation","arguments":{"target":{"kind":"ligand"},"representation":"sticks"}}\n'
        ' label residues in chain A -> {"name":"label_selection","arguments":{"target":{"kind":"chain","chain":"A"},"mode":"residue"}}\n'
        ' set surface transparency to 0.4 on protein -> {"name":"set_transparency","arguments":{"target":{"kind":"protein"},"representation":"surface","value":0.4}}\n'
        ' measure distance between ligand and residue ASP in chain B -> {"name":"measure_distance","arguments":{"source":{"kind":"ligand"},"target":{"kind":"residue","residue":"ASP","chain":"B"}}}\n'
        ' color protein by chain -> {"name":"color_by_chain","arguments":{"target":{"kind":"protein"}}}\n'
        ' color ligand by element -> {"name":"color_by_element","arguments":{"target":{"kind":"ligand"}}}\n'
    )

    resp = client.chat.completions.create(
        model=_get_openai_model(),
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_completion_tokens=200,
    )
    content = resp.choices[0].message.content.strip()
    log.debug("LLM raw response: %s", content)
    spec = json.loads(content)
    if isinstance(spec, str):
        raise RuntimeError(spec)
    if not isinstance(spec, dict):
        raise RuntimeError("Malformed LLM response")
    return spec


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": __version__,
        "uptime_seconds": round(time.time() - _start_time, 1),
    }


# ---------------------------------------------------------------------------
# Natural Language → Command Spec
# ---------------------------------------------------------------------------


@app.post("/nl")
async def nl(req: Request):
    """Natural language prompt → normalized command spec returned to frontend."""
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

    try:
        raw_spec = _call_llm(text)
        # Normalize through command_model for validation
        normalized = normalize_command_spec(raw_spec, residue_map=RES_MAP)
        return {"ok": True, "spec": normalized}
    except Exception as exc:
        log.error("NL failed: %s", exc)
        return JSONResponse(
            {"ok": False, "error": str(exc)}, status_code=500
        )


# ---------------------------------------------------------------------------
# API Key management
# ---------------------------------------------------------------------------


@app.get("/api-key")
async def get_api_key():
    """Check if an API key is configured (never returns the key itself)."""
    key = _get_api_key()
    return {"configured": bool(key)}


@app.post("/api-key")
async def save_api_key(req: Request):
    """Save the API key to config."""
    try:
        body = await req.json()
        key = (body.get("key") or "").strip()
        if not key:
            return JSONResponse(
                {"ok": False, "error": "Key is required"}, status_code=400
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    global _openai_client
    _openai_client = None  # Reset cached client

    cfg = _read_config()
    cfg["openai_api_key"] = key
    _write_config(cfg)
    log.info("API key saved.")
    return {"ok": True}


@app.post("/validate-key")
async def validate_key(req: Request):
    """Test if the provided API key works with OpenAI."""
    try:
        body = await req.json()
        key = (body.get("key") or "").strip()
        if not key:
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
                    {"ok": False, "error": f"OpenAI returned status {resp.status_code}"},
                    status_code=502,
                )
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Network error: {exc}"}, status_code=502
        )


# ---------------------------------------------------------------------------
# Structure data endpoints
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
            "polymer_entity_count": rcsb.get("polymer_entity_count_protein", 0),
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


@app.post("/structures/fetch-data")
async def fetch_structure_data(req: Request):
    """Download PDB/mmCIF structure data from RCSB and return it to the frontend."""
    try:
        body = await req.json()
        pdb_id = (body.get("pdb_id") or "").strip().upper()
        fmt = (body.get("format") or "pdb").strip().lower()
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

    # Verify the PDB ID is valid first
    _, error_response = await _lookup_pdb_metadata(pdb_id)
    if error_response is not None:
        return error_response

    # Download structure data
    if fmt == "cif" or fmt == "mmcif":
        url = f"https://files.rcsb.org/download/{pdb_id}.cif"
        out_format = "cif"
    else:
        url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
        out_format = "pdb"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return JSONResponse(
                {"ok": False, "error": f"RCSB download failed (HTTP {resp.status_code})"},
                status_code=502,
            )
        return {
            "ok": True,
            "pdb_id": pdb_id,
            "format": out_format,
            "data": resp.text,
        }
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Download failed: {exc}"}, status_code=502
        )


@app.post("/structures/read-file")
async def read_structure_file(req: Request):
    """Read a local structure file and return its contents to the frontend."""
    try:
        body = await req.json()
        file_path = (body.get("file_path") or "").strip()
        if not file_path:
            return JSONResponse(
                {"ok": False, "error": "file_path is required"}, status_code=400
            )
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    path = Path(file_path)
    if not path.exists():
        return JSONResponse(
            {"ok": False, "error": f"File not found: {file_path}"}, status_code=404
        )

    # Determine format from extension
    ext = path.suffix.lower().lstrip(".")
    format_map = {
        "pdb": "pdb",
        "cif": "cif",
        "mmcif": "cif",
        "mol2": "mol2",
        "sdf": "sdf",
        "mol": "sdf",
        "xyz": "xyz",
    }
    fmt = format_map.get(ext, "pdb")

    try:
        data = path.read_text(encoding="utf-8")
        return {
            "ok": True,
            "file_path": file_path,
            "format": fmt,
            "name": path.name,
            "data": data,
        }
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Failed to read file: {exc}"}, status_code=500
        )


# ---------------------------------------------------------------------------
# Project Save / Load
# ---------------------------------------------------------------------------
_RECENT_PROJECTS_PATH = _CONFIG_DIR / "recent_projects.json"


def _update_recent(name: str, path_str: str) -> None:
    """Track the last 10 saved/opened projects."""
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    recent: list[dict] = []
    if _RECENT_PROJECTS_PATH.exists():
        try:
            recent = json.loads(_RECENT_PROJECTS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    # Remove duplicate
    recent = [r for r in recent if r.get("path") != path_str]
    recent.insert(0, {
        "name": name,
        "path": path_str,
        "saved_at": datetime.datetime.utcnow().isoformat() + "Z",
    })
    recent = recent[:10]
    _RECENT_PROJECTS_PATH.write_text(json.dumps(recent, indent=2), encoding="utf-8")


@app.post("/projects/save")
async def save_project(request: Request) -> dict:
    body = await request.json()
    file_path = body.get("path", "")
    name = body.get("name", "Untitled")
    commands = body.get("commands", [])
    notes = body.get("notes", "")
    pdb_id = body.get("pdb_id")
    molecule_path = body.get("molecule_path")

    if not file_path:
        return JSONResponse({"ok": False, "error": "No file path"}, status_code=400)

    project_data = {
        "version": "0.2.0",
        "name": name,
        "commands": commands,
        "notes": notes,
        "pdb_id": pdb_id,
        "molecule_path": molecule_path,
        "saved_at": datetime.datetime.utcnow().isoformat() + "Z",
    }

    try:
        p = Path(file_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(project_data, indent=2), encoding="utf-8")
        _update_recent(name, file_path)
        return {"ok": True, "path": file_path}
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Save failed: {exc}"}, status_code=500
        )


@app.post("/projects/load")
async def load_project(request: Request) -> dict:
    body = await request.json()
    file_path = body.get("path", "")

    if not file_path:
        return JSONResponse({"ok": False, "error": "No file path"}, status_code=400)

    p = Path(file_path)
    if not p.exists():
        return JSONResponse({"ok": False, "error": "File not found"}, status_code=404)

    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        _update_recent(data.get("name", p.stem), file_path)
        return {"ok": True, "data": data}
    except Exception as exc:
        return JSONResponse(
            {"ok": False, "error": f"Load failed: {exc}"}, status_code=500
        )


@app.get("/projects/recent")
async def get_recent_projects() -> dict:
    if _RECENT_PROJECTS_PATH.exists():
        try:
            recent = json.loads(_RECENT_PROJECTS_PATH.read_text(encoding="utf-8"))
            return {"ok": True, "projects": recent}
        except Exception:
            pass
    return {"ok": True, "projects": []}


# ---------------------------------------------------------------------------
# Main — ephemeral port with stdout handshake
# ---------------------------------------------------------------------------


def _find_free_port() -> int:
    """Bind to port 0 to let the OS assign a free port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    port = _find_free_port()
    # Handshake: Electron reads this line to discover our port
    print(f"NEXMOL_PORT={port}", flush=True)
    log.info("NexMol backend starting on 127.0.0.1:%d", port)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
