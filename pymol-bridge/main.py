# ~/pymol-bridge/main.py
import json
import asyncio
import uuid
from typing import Set, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import uvicorn

app = FastAPI(title="PyMOL Bridge", version="0.1.0")

# Allow the Electron renderer (vite dev server) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",  # dev convenience; tighten later
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All connected PyMOL-plugin sockets live here
clients: Set[WebSocket] = set()

# Correlate outbound messages with plugin ACKs
pending: Dict[str, asyncio.Future] = {}

@app.websocket("/bridge")
async def bridge_ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
                mid = data.get("id")
                if mid and mid in pending:
                    fut = pending.pop(mid)
                    if not fut.done():
                        fut.set_result(data)
            except Exception:
                # Ignore non-JSON or unsolicited logs from plugin
                pass
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)

async def _broadcast_and_wait(payload: dict, timeout: float = 8.0):
    if not clients:
        return {"ok": False, "error": "No PyMOL plugin connected"}, 503

    # attach correlation id
    mid = str(uuid.uuid4())
    payload = dict(payload)
    payload["id"] = mid

    # create a future for the ACK
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    pending[mid] = fut

    # broadcast
    text = json.dumps(payload)
    dead = []
    for ws in list(clients):
        try:
            await ws.send_text(text)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

    # wait for ack from any plugin
    try:
        ack = await asyncio.wait_for(fut, timeout=timeout)
        # normalize ack
        if isinstance(ack, dict) and ack.get("ok") is True:
            return {"ok": True}, 200
        # pass through error if provided
        err = (ack or {}).get("error") if isinstance(ack, dict) else None
        return {"ok": False, "error": err or "Execution failed"}, 500
    except asyncio.TimeoutError:
        # cleanup if still pending
        if mid in pending:
            pending.pop(mid, None)
        return {"ok": False, "error": "Plugin ACK timeout"}, 504
    
@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/command")
async def command(req: Request):
    try:
        payload = await req.json()
        if not isinstance(payload, dict) or "name" not in payload:
            return JSONResponse({"ok": False, "error": "Invalid payload"}, status_code=400)
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    data, code = await _broadcast_and_wait(payload)
    return JSONResponse(data, status_code=code)


# Natural-language prompt endpoint for UI
@app.post("/nl")
async def nl(req: Request):
    """
    Accepts a JSON body like: { "text": "set bg to white" }
    Broadcasts an nl_prompt envelope to all connected PyMOL plugins:
      { "name": "nl_prompt", "arguments": { "text": "..." } }
    """
    try:
        payload = await req.json()
        if not isinstance(payload, dict):
            return JSONResponse({"ok": False, "error": "Invalid payload"}, status_code=400)
        text = (payload.get("text") or "").strip()
        if not text:
            return JSONResponse({"ok": False, "error": "'text' is required"}, status_code=400)
    except Exception:
        return JSONResponse({"ok": False, "error": "Bad JSON"}, status_code=400)

    envelope = {"name": "nl_prompt", "arguments": {"text": text}}
    data, code = await _broadcast_and_wait(envelope)
    return JSONResponse(data, status_code=code)


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=5179, reload=False)