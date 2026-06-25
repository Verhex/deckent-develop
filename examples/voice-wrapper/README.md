# deckent Voice Wrapper

A reference local voice backend for deckent's bot — **one implementation** of the
[deckent Voice HTTP Contract](#2-the-deckent-voice-http-contract).

**What it runs:**
- [VoxCPM2](https://huggingface.co/openbmb/VoxCPM2) (TTS) — sentence-chunked generation,
  canonical voice clone, `t60 / cfg1.3`
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) large-v3 (STT) — CUDA float16

**How it works:** models load lazily on first use and evict from VRAM after
`IDLE_EVICT_SEC` (default 600 s) of idle time. The HTTP server stays up the whole
time; `GET /health` always answers instantly.

**Bring your own backend.** The contract in §2 is minimal and
language-agnostic — implement it in Piper, XTTS, Coqui, whisper.cpp, a cloud proxy,
or anything else. This wrapper is the reference, not a requirement.

---

## Contents

1. [What this is](#1-what-this-is)
2. [The deckent Voice HTTP Contract](#2-the-deckent-voice-http-contract)
3. [Run it](#3-run-it)
4. [Env knobs](#4-env-knobs)
5. [Connect to deckent](#5-connect-to-deckent)
6. [Bring your own backend](#6-bring-your-own-backend)

---

## 1. What this is

deckent's bot can do voice: inbound voice messages → STT → turn; replies → TTS →
`sendVoice`. The voice backend is user-chosen; deckent supplies:

- A **clean HTTP contract** (§2) any backend can implement.
- **This reference wrapper** — a working FastAPI service you can run as-is or fork.
- A **cloud alternative** — `provider: "openai"` for zero-setup (no wrapper needed;
  see §6).

This file is the public contract doc. Third parties implementing their own backends
against §2 should treat it as a stable spec (additive-only; field names and semantics
do not change without a versioned `/v2/...` path).

---

## 2. The deckent Voice HTTP Contract

Any HTTP service that implements all three endpoints below is a valid deckent local
voice backend. Port, host, and transport (HTTP/HTTPS) are user-configured.

### `GET /health`

Liveness + model-load status.

**Response:** `200 application/json`

```json
{
  "status": "ok",
  "fake": false,
  "loaded": { "tts": false, "stt": false }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `status` | `"ok"` | always `"ok"` on a healthy server |
| `fake` | `bool` | `true` when running in `TTS_FAKE=1` mode (no real models) |
| `loaded.tts` | `bool` | TTS engine currently loaded in memory |
| `loaded.stt` | `bool` | STT engine currently loaded in memory |

deckent calls this on bot start. If unreachable, it emits an honest warning and
degrades voice to text — it never crashes.

**Smoke:**
```bash
curl -s localhost:8001/health
# {"status":"ok","fake":false,"loaded":{"tts":false,"stt":false}}
```

---

### `POST /stt` — speech to text

**Request:**
- Body: raw audio bytes
- `Content-Type: <audio mime>` — e.g. `audio/ogg`, `audio/mpeg`, `audio/wav`
- Optional query param: `?language=<bcp47>` — e.g. `?language=tr` (default `en`)

**Response:** `200 application/json`

```json
{ "text": "the transcribed sentence" }
```

Non-2xx → deckent treats the voice message as untranscribable and notifies the user.
No crash.

**Smoke:**
```bash
curl --data-binary @clip.ogg \
     -H 'content-type: audio/ogg' \
     'localhost:8001/stt'
# {"text":"the transcribed sentence"}

# With language hint:
curl --data-binary @clip.ogg \
     -H 'content-type: audio/ogg' \
     'localhost:8001/stt?language=tr'
```

---

### `POST /tts/raw` — text to speech (raw bytes)

**Request:** `Content-Type: application/json`

```json
{ "text": "hello world", "voice": "optional-id" }
```

| Field | Required | Default | Meaning |
|-------|----------|---------|---------|
| `text` | yes | — | text to synthesize |
| `voice` | no | `null` | backend-specific voice hint; a fixed-voice backend (e.g. VoxCPM2 with a voice ref) MAY ignore it |
| `language` | no | `"en"` | BCP-47 language tag; accepted by the server but **NOT sent by deckent's client** (`local-voice.ts` sends only `text` + `voice`). Third-party clients MAY send it; the reference VoxCPM2 engine ignores it (TR-specialized). |

**Response:** `200` with raw audio bytes in the body

```
Content-Type: audio/wav
<binary WAV bytes — mono 16-bit PCM>
```

Non-2xx → deckent falls back to the text reply (honest degrade, no crash).

**Smoke:**
```bash
curl -s -X POST localhost:8001/tts/raw \
     -H 'content-type: application/json' \
     -d '{"text":"merhaba"}' \
     --output out.wav

# Verify it's a valid WAV:
file out.wav
# out.wav: RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono
# (16000 Hz in fake mode / 48000 Hz with VoxCPM2)
```

---

### Contract stability

This contract is **additive-only**: new optional fields may be added to any
request/response body; existing field names and semantics do not change without a
versioned path (`/v2/...`). `local-voice.ts` (the deckent client) is kept in
lock-step with this section.

---

## 3. Run it

### Prerequisites

- Python 3.10+ with `python3-venv` available (`sudo apt install python3-venv` on
  Debian/Ubuntu)
- An NVIDIA GPU with CUDA 12.x for VoxCPM2 + faster-whisper (CPU-only is not
  supported by these engines; use `TTS_FAKE=1` for model-free testing)

### Step 1 — Create venv and install base deps

```bash
cd examples/voice-wrapper
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### Step 2 — Install engine deps (NVIDIA GPU)

```bash
# VoxCPM2 TTS
.venv/bin/pip install voxcpm

# PyTorch with CUDA 12.8 (cu128) — required for VoxCPM2 GPU inference
.venv/bin/pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cu128

# faster-whisper STT (pulls in CTranslate2 with CUDA support transitively)
.venv/bin/pip install faster-whisper
```

> **Note:** `libcudnn` and `libcublas` must be present on the host (CUDA 12.x).
> On a fresh Ubuntu system: `sudo apt install libcudnn9-cuda-12 libcublas-12-*`.

### Step 3 — Prepare the voice reference

VoxCPM2 clones your canonical voice. Place (or record) a clean mono WAV at:

```
examples/voice-wrapper/voice-ref/deckent-canonical.wav
```

Then set `TTS_VOICE_REF` to point at it (see env knobs below), or rely on the
default path wired in `run.sh`.

On first start the VoxCPM2 weights (~4.7 GB) are downloaded to your HuggingFace
cache (`~/.cache/huggingface/`) automatically. Subsequent starts are instant.

### Step 4 — Start the server

> **⚠️ Security — no authentication.** This wrapper has no auth. Keep it bound to
> `127.0.0.1` (the `run.sh` default). Do NOT bind it to `0.0.0.0` or expose it to an
> untrusted network: anyone who can reach it can use your GPU (`/tts/raw`, `/stt`) and
> read generated audio. To run it on another host, put it behind an authenticating
> reverse proxy, a firewall, or a private network.

```bash
chmod +x run.sh
./run.sh
# Listening on http://127.0.0.1:8001
```

The server binds to `127.0.0.1:8001`. Override any env knob before calling:

```bash
TTS_VOICE_REF=/my/ref.wav IDLE_EVICT_SEC=300 ./run.sh
```

### Smoke test without models (`TTS_FAKE=1`)

To verify the server wires up correctly without a GPU or any model download:

```bash
TTS_FAKE=1 .venv/bin/python -m uvicorn server:app \
  --host 127.0.0.1 --port 8001 --workers 1

curl -s localhost:8001/health
# {"status":"ok","fake":true,"loaded":{"tts":false,"stt":false}}

curl -X POST localhost:8001/tts/raw \
  -H 'content-type: application/json' \
  -d '{"text":"test"}' --output fake.wav

curl --data-binary @fake.wav -H 'content-type: audio/wav' localhost:8001/stt
# {"text":"[fake transcript]"}
```

### Run the test suite

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover
```

Tests run entirely in `TTS_FAKE=1` mode (no GPU, no models required).

---

## 4. Env knobs

All variables are optional; unset = default.

| Variable | Default | Meaning |
|----------|---------|---------|
| `TTS_ENGINE` | `voxcpm` | TTS engine name (`voxcpm` or `fake`) |
| `STT_ENGINE` | `faster_whisper` | STT engine name (`faster_whisper` or `fake`) |
| `TTS_FAKE` | _(unset)_ | Set to `1` to enable fake mode — no models, no GPU; `/stt` returns `{"text":"[fake transcript]"}`, `/tts/raw` returns 1 s of silence WAV |
| `IDLE_EVICT_SEC` | `600` | Seconds of idle time after which a loaded engine is evicted from VRAM. `0` = never evict (keep engines always-resident) |
| `TTS_VOICE_REF` | `<script-dir>/voice-ref/deckent-canonical.wav` | Path to the canonical voice reference WAV passed to VoxCPM2. Omit or leave empty to use VoxCPM2's built-in default voice |
| `TTS_TIMESTEPS` | `60` | VoxCPM2 inference timesteps — higher = better quality, slower |
| `TTS_CFG` | `1.3` | VoxCPM2 CFG (classifier-free guidance) value |
| `AUDIO_TMP` | `/tmp/voice_wrapper` | Temporary directory for incoming STT audio files. Created automatically on first request |

---

## 5. Connect to deckent

Add a `voice` block to your deckent project's `bot_capabilities`:

```json
{
  "voice": {
    "enabled": true,
    "provider": "local",
    "stt": true,
    "tts": "reply-in-kind",
    "local": {
      "stt_url": "http://127.0.0.1:8001/stt",
      "tts_url": "http://127.0.0.1:8001/tts/raw",
      "health_url": "http://127.0.0.1:8001/health",
      "tts_voice": "default"
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `provider` | `"local"` — use the local HTTP contract (§2) |
| `stt` | `true` to accept inbound voice messages and transcribe them |
| `tts` | `"reply-in-kind"` — synthesize voice only when the user sent voice; `"always"` — always reply with voice; `"off"` — never synthesize |
| `stt_url` | STT endpoint on your wrapper |
| `tts_url` | TTS endpoint on your wrapper |
| `health_url` | Optional; deckent's bot-start health-check uses it, and derives it from the `stt_url` host + `/health` if omitted |
| `tts_voice` | Optional voice hint forwarded in the TTS request body |

**On bot start**, deckent calls `GET <health_url>`. If the wrapper is unreachable it
emits a clear warning (`"voice backend unreachable at <url>"`) and starts anyway —
inbound voice and TTS replies degrade honestly to text. deckent never spawns the
wrapper; you run it yourself (`./run.sh`).

---

## 6. Bring your own backend

Implement the three endpoints in §2 in **any language or stack** and point deckent's
`stt_url` / `tts_url` at it. The contract is the only requirement — not this wrapper,
not Python, not VoxCPM2.

Popular alternatives:

| Backend | Fits |
|---------|------|
| [Piper](https://github.com/rhasspy/piper) | Lightweight neural TTS, CPU-friendly |
| [Coqui TTS / XTTS](https://github.com/coqui-ai/TTS) | High-quality multi-lingual TTS |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Fast CPU/GPU STT, minimal deps |
| A cloud proxy | Wrap ElevenLabs, Azure, Deepgram, Google — any API — in a thin HTTP shim |

**Minimal compliant server (Python + Flask, fake only):**

```python
from flask import Flask, request, jsonify, Response
import struct, wave, io

app = Flask(__name__)

@app.get("/health")
def health():
    return jsonify({"status": "ok", "fake": True, "loaded": {"tts": False, "stt": False}})

@app.post("/stt")
def stt():
    return jsonify({"text": "your transcript here"})

@app.post("/tts/raw")
def tts_raw():
    n = 16000
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(struct.pack(f"<{n}h", *([0]*n)))
    return Response(buf.getvalue(), mimetype="audio/wav")
```

**Zero-setup cloud alternative.** If you just want voice without hosting anything:

```json
{
  "voice": {
    "enabled": true,
    "provider": "openai",
    "stt": true,
    "tts": "reply-in-kind"
  }
}
```

Set `OPENAI_API_KEY` in your `.deck` secrets file. No wrapper, no GPU, no model
download — deckent calls OpenAI Whisper (STT) and OpenAI TTS directly.
