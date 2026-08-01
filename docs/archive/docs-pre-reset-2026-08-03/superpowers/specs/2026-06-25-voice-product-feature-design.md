# Voice as a Product Feature — Design & Public Contract

**Status:** Approved (Alperen, 2026-06-25)
**Goal:** Make deckent's bot voice (STT in, TTS out) a first-class, provider-pluggable **product feature** — usable by every user, not just our dogfood — where a user can bind a cloud voice API (e.g. OpenAI) **or** stand up their own voice model and connect it to deckent over a small, documented HTTP contract.

> Builds on god-level bot Pillar-1 (merged `f1aaefdd`), which already shipped the deckent-side `VoiceAdapter` abstraction, the `local`/`openai` provider split, inbound STT→turn wiring, and reply-in-kind/always TTS→`sendVoice`. This spec turns that into a documented, hardened, self-serve **product** capability and defines the **public voice HTTP contract** third parties implement.

---

## 1. North-Star — pluggable, not deckent-specific

Voice is a transport, not a deckent-owned service. deckent's job is to provide **a clean contract + a provider factory**; the voice backend is the user's choice. A user has three paths:

1. **Cloud API — zero setup.** `provider: 'openai'` → OpenAI Whisper (STT) + TTS. The user supplies `OPENAI_API_KEY`; nothing to install or host. (Future: ElevenLabs, Azure, Deepgram, Google — each a thin adapter.)
2. **Own model — self-hosted.** `provider: 'local'` → deckent calls **any** HTTP service that implements the **deckent Voice Contract** (§3). The user runs VoxCPM2 / Piper / XTTS / Coqui / whisper.cpp / their own — in any language. We ship a **reference wrapper** (§4) as a working starting point.
3. **Future providers** — added to the `createVoiceAdapter` factory without touching callers.

**Dual-lens (Law 1):** the same engine serves our dogfood (we run the reference wrapper on VoxCPM2) and the end-user product (anyone binds any backend). **Every-environment (Law 2):** the contract is language/OS-agnostic; the reference wrapper is one implementation, not a requirement.

---

## 2. Provider Model (deckent side — already built, hardened here)

`createVoiceAdapter(cfg: VoiceConfig, deck: DeckSecrets): VoiceAdapter | null` (`src/connectors/voice/types.ts`) returns:

- `null` when voice is disabled or misconfigured (default-off; bot behaves byte-identically).
- a `local` adapter (`local-voice.ts`) — HTTP client of the Voice Contract (§3), Node built-in `fetch`, **no runtime dep**.
- an `openai` adapter (`openai-voice.ts`) — dynamic `openai` optionalDependency (tsc/CI green without it installed).

`VoiceAdapter` = `{ transcribe(audio, mime) → text; synthesize(text, opts?) → { data, mime } }`. The bot calls it **only** on real voice events (inbound voice → `transcribe`; voice reply → `synthesize`); zero idle cost, no polling, no persistent connection.

This spec **hardens** the OpenAI path (the cloud, zero-setup default) so it is product-solid, and adds the **health-check / honest-warn** and **config + docs** that make it self-serve.

---

## 3. The deckent Voice HTTP Contract (PUBLIC — the extension point)

Any service that implements these endpoints can be a deckent `local` voice backend. Minimal by design so it is trivial to implement in any stack.

### `GET /health`
→ `200 application/json` `{ "status": "ok", ... }`. deckent calls this on bot start; unreachable ⇒ honest-warn (§5), never a crash.

### `POST /stt` — speech → text
- **Request:** raw audio **bytes** in the body; `Content-Type: <audio mime>` (e.g. `audio/ogg`, `audio/mpeg`, `audio/wav`). Optional `?language=<bcp47>` query hint.
- **Response:** `200 application/json` `{ "text": "<transcript>" }`.
- **Errors:** any non-2xx ⇒ deckent treats the inbound voice as untranscribable and degrades honestly (notifies the user, does not crash).

### `POST /tts/raw` — text → speech (raw bytes)
- **Request:** `application/json` `{ "text": "<text>", "voice"?: "<id>", "language"?: "<bcp47>" }`. `voice` is an optional backend hint; a fixed-voice backend (e.g. our canonical-clone VoxCPM2) MAY ignore it.
- **Response:** `200` with the audio **bytes** in the body and `Content-Type: audio/<fmt>` (e.g. `audio/ogg`, `audio/wav`). deckent forwards the bytes to `sendVoice`.
- **Errors:** non-2xx ⇒ deckent falls back to the **text** reply (honest degrade).

> Rationale for **raw bytes** (not a JSON+URL envelope): one HTTP hop, no static-file accumulation on the bot path, and an exact match to `local-voice.ts`'s `synthesize` contract. A backend MAY additionally expose a richer JSON+URL+word-timestamps endpoint for other products (our VoxCPM2 service already has `/tts`); `/tts/raw` is the deckent surface.

### Contract stability
This contract is the public API. It is **additive-only**: new optional fields may be added; existing field names/semantics do not change without a versioned path (`/v2/...`). The reference wrapper and `local-voice.ts` are kept in lock-step with this section.

---

## 4. Reference Wrapper — `examples/voice-wrapper/` (shipped IN deckent)

A working, documented FastAPI service users can run as-is or fork. **It is an example, not "deckent's voice server."** Ported clean from our VoxCPM2 dogfood service.

### Files
- `examples/voice-wrapper/server.py` — FastAPI app implementing §3 (`/health`, `/stt`, `/tts/raw`).
- `examples/voice-wrapper/engines.py` — a small **engine abstraction**: `TtsEngine.synthesize(text, language) → (pcm, sr)` and `SttEngine.transcribe(path, language) → text`, with a `voxcpm` TTS impl + a `faster_whisper` STT impl, selected by env (`TTS_ENGINE`, `STT_ENGINE`). Adding Piper/XTTS = a new class.
- `examples/voice-wrapper/lifecycle.py` — **lazy-load + idle-evict** model manager (§4.1).
- `examples/voice-wrapper/README.md` — **the contract doc** (mirrors §3) + setup (venv, model weights, GPU notes) + the env knobs + a curl smoke for each endpoint.
- `examples/voice-wrapper/requirements.txt`, `run.sh`, `test_server.py`.

### 4.1 Model lifecycle — lazy-load + idle-evict (Alperen's choice)
- Models (TTS engine + STT engine) load **lazily** on first use, cached.
- A background task (or last-used check) **evicts** them from VRAM after `IDLE_EVICT_SEC` (default **600s / 10 min**, env-configurable; `0` = never evict = always-resident) of no requests: set refs to `None` + `torch.cuda.empty_cache()`.
- During an active conversation → warm/instant; after a long idle gap → VRAM freed, the next request pays a single cold-start. STT and TTS engines may be evicted independently.
- The HTTP listener stays up the whole time (≈ free); deckent's `/health` always answers.

### 4.2 Engine notes (our VoxCPM2 impl)
- VoxCPM2 2.0.3, `from_pretrained("openbmb/VoxCPM2", load_denoiser=False)`; sentence-chunked generation with 150 ms gaps (kills long-form drift); canonical clean voice ref (`voice-ref/deckent-canonical.wav`); production `t60 / cfg1.3`.
- STT via `faster-whisper large-v3` (`float16`, CUDA).
- `TTS_FAKE=1` ⇒ silence + deterministic output, so `test_server.py` and CI run with **no models / no GPU**.

---

## 5. deckent-side additions

### 5.1 Config (`bot_capabilities.voice` — in `src/connectors/capabilities/types.ts`)
```jsonc
"voice": {
  "enabled": true,
  "provider": "local",              // "local" | "openai"
  "stt": true,                       // accept inbound voice?
  "tts": "reply-in-kind",           // "off" | "reply-in-kind" | "always"
  "local": {
    "stt_url": "http://127.0.0.1:8001/stt",
    "tts_url": "http://127.0.0.1:8001/tts/raw",
    "health_url": "http://127.0.0.1:8001/health",   // optional; derived from stt_url host if absent
    "tts_voice": "default"
  }
  // provider:"openai" → OPENAI_API_KEY from .deck; optional model overrides
}
```

### 5.2 Health-check + honest-warn (Law 2: fail honestly, never silently)
On bot start, when voice is enabled: `GET` the health URL (explicit `local.health_url`, else derived from the STT/TTS host). If unreachable, emit `getMessage('voice.wrapper_unreachable', lang)` — a clear "voice is configured but the backend isn't reachable at `<url>`" warning. The bot still starts; inbound voice and reply-TTS already degrade to text (Pillar-1 honest-degrade), so nothing breaks. For `provider:'openai'`, the analogous check is a missing/empty key → honest warn. deckent does **not** spawn the wrapper (heavy, env-specific); the user runs it (their `run.sh`).

### 5.3 OpenAI path hardening (cloud = the zero-setup default)
Make the `openai-voice.ts` path product-solid: verify the transcribe file-upload + the TTS call against the current `openai` SDK shape, confirm the dynamic-load + null-config paths, and add a real (mock-client) round-trip test so a contributor without the optional dep still proves the call shapes.

---

## 6. Security & cross-platform

- **No secret leakage:** wrapper URLs are local/loopback by default; `OPENAI_API_KEY` comes from `.deck` and is never logged. The bot token path is untouched.
- **Audio is transient:** inbound audio is fetched to a buffer for STT; the wrapper writes generated audio under a tmp dir. No artifact-store path-traversal surface is added (voice bytes are not artifacts).
- **Default-off:** voice disabled ⇒ no adapter, no health-check, no deck read (Pillar-1 final-fix guarantee preserved).
- **Cross-platform:** the contract is OS/stack-agnostic; the reference wrapper documents GPU/CPU and Linux/WSL/macOS notes, and `TTS_FAKE` makes it runnable anywhere for tests.

---

## 7. Testing & Proof-of-Function

- **Wrapper:** `test_server.py` with `TTS_FAKE=1` — `/health` ok; `/stt` (fake) returns `{text}`; `/tts/raw` returns `audio/*` bytes with a non-empty body. No GPU/model needed.
- **Reference-real smoke (dogfood):** a documented manual run — start `run.sh`, `curl` `/stt` with a sample clip and `/tts/raw` with text, confirm a real transcript + real audio bytes (VoxCPM2). Recorded, not automated (needs the model).
- **deckent:** unit tests for the health-check (reachable→no warn; unreachable→`voice.wrapper_unreachable`), the derived-health-url logic, default-off (no check when disabled), and the OpenAI mock round-trip. Full connector suite stays green; tsc 0.
- **End-to-end dogfood (after build):** point config at the reference wrapper, send Telegram voice "ekran görüntüsü al" → bot transcribes, acts, replies by voice; "always" replies by voice to text too.

---

## 8. Roadmap

- **Now:** contract doc + reference wrapper (VoxCPM2 + whisper, lazy/idle-evict) + deckent health-check + OpenAI hardening + config docs.
- **Next providers:** ElevenLabs / Azure / Deepgram / Google adapters (thin, factory-registered).
- **Pillar-2+:** word-timestamp captions (the richer `/tts` JSON envelope already exists in our service), streaming TTS, per-chat voice selection.
