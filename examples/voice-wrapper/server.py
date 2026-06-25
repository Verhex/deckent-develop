"""
server.py — FastAPI server implementing the deckent Voice HTTP contract.

Contract (must match deckent's TypeScript local-voice.ts client exactly):
    GET  /health      → 200 {"status":"ok", "fake":bool, "loaded":{"tts":bool,"stt":bool}}
    POST /stt         → body=raw audio bytes, Content-Type:<mime>, ?language= → {"text":"..."}
    POST /tts/raw     → JSON {"text","voice"?,"language"?} → audio/wav bytes (PCM-16)

Environment variables:
    TTS_ENGINE       : TTS engine name (default: "voxcpm")
    STT_ENGINE       : STT engine name (default: "faster_whisper")
    TTS_FAKE         : set to "1" to enable fake mode (no models loaded; for tests/CI)
    IDLE_EVICT_SEC   : idle eviction timeout in seconds (default: 600)
    AUDIO_TMP        : tmp directory for incoming audio files (default: /tmp/voice_wrapper)
    TTS_VOICE_REF    : path to canonical voice reference WAV (VoxCPM2)
    TTS_TIMESTEPS    : VoxCPM2 inference timesteps (default: 60)
    TTS_CFG          : VoxCPM2 CFG value (default: 1.3)

Fake mode (TTS_FAKE=1):
    /stt  → returns {"text": "[fake transcript]"} immediately (no tmp file, no model)
    /tts/raw → returns a 1-second 16 kHz silence WAV (stdlib wave; no numpy needed)

Background idle-evict:
    A FastAPI lifespan background task wakes every 30 s and calls manager.maybe_evict().
    The task is cancelled cleanly on server shutdown.
"""

from __future__ import annotations

import asyncio
import io
import os
import struct
import tempfile
import time
import wave
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Runtime configuration — resolved once at import time
# ---------------------------------------------------------------------------

FAKE: bool = os.environ.get("TTS_FAKE") == "1"

_TTS_ENGINE: str = os.environ.get("TTS_ENGINE") or "voxcpm"
_STT_ENGINE: str = os.environ.get("STT_ENGINE") or "faster_whisper"
_IDLE_EVICT_SEC: int = int(os.environ.get("IDLE_EVICT_SEC") or "600")
_AUDIO_TMP: Path = Path(os.environ.get("AUDIO_TMP") or "/tmp/voice_wrapper")
_EVICT_POLL_SEC: float = 30.0

# ---------------------------------------------------------------------------
# ModelManager — single module-level instance
# In FAKE mode the manager still exists but will only ever serve fake engines
# because TTS_FAKE short-circuits every handler before manager.tts/stt() is called.
# ---------------------------------------------------------------------------

# Lazy import so that this module loads without lifecycle.py on sys.path in
# environments that don't have the voice-wrapper installed as a package.
try:
    from lifecycle import ModelManager  # type: ignore[import-untyped]

    _tts_name = "fake" if FAKE else _TTS_ENGINE
    _stt_name = "fake" if FAKE else _STT_ENGINE
    manager: ModelManager = ModelManager(
        tts_name=_tts_name,
        stt_name=_stt_name,
        idle_evict_sec=0 if FAKE else _IDLE_EVICT_SEC,
    )
except ModuleNotFoundError:  # pragma: no cover — outside package install
    manager = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Helpers — WAV encoding (stdlib only, no soundfile / libsndfile)
# ---------------------------------------------------------------------------

def _pcm_float32_to_wav_bytes(pcm: "np.ndarray", sample_rate: int) -> bytes:
    """
    Convert a float32 PCM array (values in [-1, 1]) to a mono 16-bit PCM WAV.

    Uses only stdlib `wave` and `numpy` — zero soundfile/libsndfile dependency.
    Clipping is applied before cast so out-of-range samples don't wrap.
    """
    # Clip to [-1, 1] then scale to int16 range.
    clipped = np.clip(pcm, -1.0, 1.0)
    int16_samples = (clipped * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(int16_samples.tobytes())
    return buf.getvalue()


def _silence_wav_bytes(duration_sec: float = 1.0, sample_rate: int = 16_000) -> bytes:
    """
    Build a minimal silent (all-zero) 16-bit PCM mono WAV without numpy.

    Used in FAKE mode for /tts/raw so the fake path has zero heavy deps.
    """
    n_samples = int(duration_sec * sample_rate)
    raw_frames = struct.pack(f"<{n_samples}h", *([0] * n_samples))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(raw_frames)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Background idle-evict task
# ---------------------------------------------------------------------------

_evict_task: Optional[asyncio.Task] = None  # type: ignore[type-arg]


async def _idle_evict_loop() -> None:
    """Wake every _EVICT_POLL_SEC seconds and call manager.maybe_evict()."""
    try:
        while True:
            await asyncio.sleep(_EVICT_POLL_SEC)
            if manager is not None:
                manager.maybe_evict()
    except asyncio.CancelledError:
        pass  # clean shutdown


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """FastAPI lifespan: start background evict task on startup, cancel on shutdown."""
    global _evict_task  # noqa: PLW0603
    _evict_task = asyncio.create_task(_idle_evict_loop())
    try:
        yield
    finally:
        if _evict_task and not _evict_task.done():
            _evict_task.cancel()
            try:
                await _evict_task
            except asyncio.CancelledError:
                pass


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="deckent Voice Wrapper",
    description=(
        "Local voice service implementing the deckent voice HTTP contract. "
        "Exposes /health, /stt, and /tts/raw endpoints. "
        "Engine (TTS/STT) is lazily loaded and idle-evicted to conserve VRAM."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    language: Optional[str] = "en"


class HealthResponse(BaseModel):
    status: str
    fake: bool
    loaded: dict  # {"tts": bool, "stt": bool}


class SttResponse(BaseModel):
    text: str


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health() -> JSONResponse:
    """
    Liveness + model-load status.

    Returns the FAKE flag and whether each engine is currently loaded in memory.
    """
    loaded = manager.loaded if manager is not None else {"tts": False, "stt": False}
    return JSONResponse(
        content={
            "status": "ok",
            "fake": FAKE,
            "loaded": loaded,
        }
    )


# ---------------------------------------------------------------------------
# POST /stt
# ---------------------------------------------------------------------------

@app.post("/stt", response_model=SttResponse)
async def stt(request: Request) -> JSONResponse:
    """
    Speech-to-text endpoint.

    Request body : raw audio bytes (any format the engine supports; typically WAV).
    Content-Type : audio/<subtype> — forwarded as metadata; the engine reads the file path.
    Query param  : language= (BCP-47, default "en").

    In FAKE mode: returns {"text": "[fake transcript]"} immediately without touching
    the ModelManager or writing any file to disk.
    """
    language: str = request.query_params.get("language") or "en"

    # --- FAKE short-circuit ---
    if FAKE:
        return JSONResponse(content={"text": "[fake transcript]"})

    # --- Real path ---
    body = await request.body()

    # Ensure the temp directory exists.
    _AUDIO_TMP.mkdir(parents=True, exist_ok=True)

    # Write audio to a named temp file; the engine needs a file path.
    with tempfile.NamedTemporaryFile(
        dir=_AUDIO_TMP,
        suffix=".wav",
        delete=False,
    ) as tmp_f:
        tmp_path = tmp_f.name
        tmp_f.write(body)

    try:
        text = manager.stt().transcribe(tmp_path, language)
    finally:
        # Best-effort cleanup — failure is non-fatal (tmp will be gc'd by OS).
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return JSONResponse(content={"text": text})


# ---------------------------------------------------------------------------
# POST /tts/raw
# ---------------------------------------------------------------------------

@app.post("/tts/raw")
async def tts_raw(body: TtsRequest) -> Response:
    """
    Text-to-speech endpoint.

    Request body : JSON {"text": str, "voice"?: str, "language"?: str}
    Response     : audio/wav bytes (mono 16-bit PCM, sample rate from engine).

    voice        : Optional voice identifier.  Ignored by VoxCPM2 (uses the
                   canonical reference configured via TTS_VOICE_REF env var).
    language     : BCP-47 tag (default "en"); forwarded to the TTS engine.

    In FAKE mode: returns 1 second of silence (16 kHz 16-bit PCM WAV) built
    with stdlib `wave` and `struct` — no numpy required.
    """
    language: str = body.language or "en"

    # --- FAKE short-circuit ---
    if FAKE:
        wav_bytes = _silence_wav_bytes(duration_sec=1.0, sample_rate=16_000)
        return Response(content=wav_bytes, media_type="audio/wav")

    # --- Real path ---
    pcm, sample_rate = manager.tts().synthesize(body.text, language)
    wav_bytes = _pcm_float32_to_wav_bytes(pcm, sample_rate)
    return Response(content=wav_bytes, media_type="audio/wav")
