# Voice Product Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship deckent bot voice as a self-serve, provider-pluggable product feature: a documented public HTTP contract, a reference local wrapper (VoxCPM2 + faster-whisper, lazy-load + idle-evict) shipped in `examples/`, a deckent-side health-check + honest-warn, and a hardened OpenAI cloud path.

**Architecture:** deckent already has the `VoiceAdapter` abstraction + `local`/`openai` providers (Pillar-1, merged). This plan adds (A) the reference wrapper implementing the contract, and (B) the deckent product wiring (health-check, config docs, OpenAI hardening). Spec: `docs/superpowers/specs/2026-06-25-voice-product-feature-design.md`.

**Tech Stack:** Python 3.12 + FastAPI + uvicorn (wrapper, VoxCPM2 2.0.3 + faster-whisper); TypeScript/ESM Node ≥24 + vitest (deckent).

## Global Constraints

- **Public contract (verbatim, spec §3):** `GET /health` → `{status:"ok"}`; `POST /stt` body=raw audio bytes + `Content-Type:<mime>` → `{text}`; `POST /tts/raw` JSON `{text, voice?, language?}` → `audio/<fmt>` **bytes**. Additive-only; field names/semantics frozen.
- **`local-voice.ts` lock-step:** STT `POST {stt_url}` bytes→`{text}`; TTS `POST {tts_url}` `{text,voice?}`→bytes. The wrapper MUST satisfy exactly this.
- **Lifecycle:** lazy-load + idle-evict, `IDLE_EVICT_SEC` env (default 600; `0`=never). STT/TTS evictable independently. HTTP listener always up.
- **`TTS_FAKE=1` runs with NO models / NO GPU** — every wrapper unit test uses it; CI/any-machine safe.
- **deckent default-off preserved:** voice disabled ⇒ no adapter, no health-check, no `.deck` read (Pillar-1 `f1aaefdd` guarantee).
- **i18n-first:** every deckent user-facing string via `getMessage(key, lang)` en+tr. ESM `.js` imports. No new deckent runtime dep (`fetch` builtin).
- **No secret leakage:** `OPENAI_API_KEY` from `.deck`, never logged; wrapper URLs loopback by default.

---

## Phase A — Reference Wrapper (`examples/voice-wrapper/`)

### Task 1: Engine abstraction + FAKE engines

**Files:**
- Create: `examples/voice-wrapper/engines.py`
- Test: `examples/voice-wrapper/test_engines.py`

**Interfaces:**
- Produces: `make_tts_engine(name) -> TtsEngine` with `.synthesize(text:str, language:str) -> tuple[np.ndarray, int]` (float32 PCM, sample_rate); `make_stt_engine(name) -> SttEngine` with `.transcribe(wav_path:str, language:str) -> str`. Names: `'fake'`, `'voxcpm'` (tts), `'faster_whisper'` (stt). Real engines import their heavy deps lazily **inside** the class (so `fake` needs nothing).

- [ ] **Step 1: Failing test** (`test_engines.py`):
```python
import numpy as np
from engines import make_tts_engine, make_stt_engine

def test_fake_tts_returns_pcm_and_sr():
    eng = make_tts_engine("fake")
    pcm, sr = eng.synthesize("merhaba dünya", "tr")
    assert isinstance(pcm, np.ndarray) and pcm.dtype == np.float32
    assert sr == 16000 and pcm.size > 0

def test_fake_stt_returns_text(tmp_path):
    eng = make_stt_engine("fake")
    p = tmp_path / "a.wav"
    p.write_bytes(b"\x00\x00")
    assert isinstance(eng.transcribe(str(p), "tr"), str)
```

- [ ] **Step 2: Run → FAIL** (`cd examples/voice-wrapper && python -m pytest test_engines.py -q` → import error).

- [ ] **Step 3: Implement `engines.py`** — `FakeTts` (1 s of low-amplitude noise at 16 kHz), `FakeStt` (returns `"[fake transcript]"`), `VoxCpmTts` (lazy `from voxcpm import VoxCPM`; canonical-ref chunked generation t60/cfg1.3 per the dogfood `server.py`), `FasterWhisperStt` (lazy `from faster_whisper import WhisperModel`, `large-v3`, float16, cuda). `make_*` factories dispatch by name; unknown name → `ValueError`.

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): engine abstraction + fake engines (voice t1)"`

---

### Task 2: Lazy-load + idle-evict model manager

**Files:**
- Create: `examples/voice-wrapper/lifecycle.py`
- Test: `examples/voice-wrapper/test_lifecycle.py`

**Interfaces:**
- Consumes: `make_tts_engine`/`make_stt_engine` (Task 1).
- Produces: `ModelManager(tts_name, stt_name, idle_evict_sec, now=time.monotonic, loader=...)` with `.tts()`/`.stt()` (lazy-create + touch last-used), `.maybe_evict()` (drop refs whose last-use age > `idle_evict_sec`; `idle_evict_sec<=0` ⇒ never), `.loaded` → `{"tts":bool,"stt":bool}`. Eviction calls an injectable `on_evict()` hook (real server passes `torch.cuda.empty_cache`). STT/TTS tracked independently.

- [ ] **Step 1: Failing test** — inject a fake `now` clock + counting loader; assert: first `.tts()` builds once, second reuses (loader called once); after advancing `now` past `idle_evict_sec`, `.maybe_evict()` drops it (`loaded["tts"]==False`) and a subsequent `.tts()` rebuilds (loader called twice); `idle_evict_sec=0` never evicts; touching tts does not evict stt independently.
```python
from lifecycle import ModelManager
def test_lazy_then_evict_then_reload():
    t = {"v": 0.0}; calls = {"tts": 0}
    def loader(kind):
        if kind == "tts": calls["tts"] += 1
        return object()
    m = ModelManager("fake","fake",idle_evict_sec=600,now=lambda: t["v"],loader=loader)
    m.tts(); m.tts(); assert calls["tts"] == 1
    t["v"] = 601; m.maybe_evict(); assert m.loaded["tts"] is False
    m.tts(); assert calls["tts"] == 2
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement `lifecycle.py`** — internal `_Slot{engine, last_used}` per kind; `.tts()/.stt()` lazy-build via `loader(kind)` (default loader = the Task-1 factories) + set `last_used=now()`; `.maybe_evict()` iterates slots, drops those idle too long + calls `on_evict`. Thread-safe with a `threading.Lock` (FastAPI runs sync handlers in a threadpool).
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): lazy-load + idle-evict model manager (voice t2)"`

---

### Task 3: FastAPI server (contract) + tests + run.sh + requirements

**Files:**
- Create: `examples/voice-wrapper/server.py`, `examples/voice-wrapper/test_server.py`, `examples/voice-wrapper/requirements.txt`, `examples/voice-wrapper/run.sh`
- Modify: (none)

**Interfaces:**
- Consumes: `ModelManager` (Task 2). Reads env: `TTS_ENGINE`(voxcpm), `STT_ENGINE`(faster_whisper), `TTS_FAKE`, `IDLE_EVICT_SEC`(600), `TTS_VOICE_REF`, `TTS_TIMESTEPS`(60), `TTS_CFG`(1.3), `AUDIO_TMP`(/tmp/voice_wrapper).
- Produces: the §3 endpoints.

- [ ] **Step 1: Failing test** (`test_server.py`, `TTS_FAKE=1` via `monkeypatch.setenv` before import, `fastapi.testclient.TestClient`):
```python
def test_health(client): r = client.get("/health"); assert r.status_code==200 and r.json()["status"]=="ok"
def test_stt_fake(client):
    r = client.post("/stt", content=b"\x00\x00", headers={"content-type":"audio/wav"})
    assert r.status_code==200 and isinstance(r.json()["text"], str)
def test_tts_raw_returns_audio_bytes(client):
    r = client.post("/tts/raw", json={"text":"merhaba"})
    assert r.status_code==200 and r.headers["content-type"].startswith("audio/") and len(r.content) > 44
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement `server.py`** — FastAPI app; one module-level `ModelManager`; a background `asyncio` task (startup event) calling `manager.maybe_evict()` every ~30 s. `POST /stt`: read `await request.body()`, write to a tmp file, `manager.stt().transcribe(path, lang)` → `{text}`; in FAKE mode short-circuit to `make_stt_engine("fake")`. `POST /tts/raw`: `manager.tts().synthesize(text, lang)` → write PCM to an in-memory WAV (`soundfile`/`wave`) → `Response(content=wav_bytes, media_type="audio/wav")`; FAKE mode → silence WAV bytes. `GET /health` → `{status:"ok", fake:FAKE, loaded:manager.loaded}`. `requirements.txt`: fastapi, uvicorn, soundfile, numpy, (voxcpm, faster-whisper noted as engine deps + the cu128 torch note). `run.sh`: mirror the dogfood env + `uvicorn server:app --host 127.0.0.1 --port 8001`.
- [ ] **Step 4: Run → PASS** (`python -m pytest test_server.py -q`, FAKE, no GPU).
- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): FastAPI server implementing the deckent voice contract (voice t3)"`

---

### Task 4: Reference README = the contract doc

**Files:**
- Create: `examples/voice-wrapper/README.md`

- [ ] **Step 1: Write `README.md`** — sections: (1) **The deckent Voice Contract** (copy spec §3 verbatim: `/health`, `/stt`, `/tts/raw` with request/response + a `curl` for each); (2) **Run it** (create venv, `pip install -r requirements.txt`, the torch cu128 note for NVIDIA, download weights note, `./run.sh`); (3) **Env knobs** table (`TTS_ENGINE`, `STT_ENGINE`, `TTS_FAKE`, `IDLE_EVICT_SEC`, `TTS_VOICE_REF`, `TTS_TIMESTEPS`, `TTS_CFG`); (4) **Connect to deckent** (the `bot_capabilities.voice` config block pointing at this wrapper); (5) **Bring your own backend** (implement the §3 contract in any language — Piper/XTTS/whisper.cpp/etc. — and point deckent at it; this wrapper is one example). No placeholders — real commands + the real config JSON.
- [ ] **Step 2: Commit** — `git commit -m "docs(voice-wrapper): contract README + setup + BYO-backend guide (voice t4)"`

---

## Phase B — deckent Product Wiring

### Task 5: Voice health-check + honest-warn + config field

**Files:**
- Create: `src/connectors/voice/health.ts`, `tests/connectors/voice/health.test.ts`
- Modify: `src/connectors/voice/types.ts` (add `health_url?` to `VoiceConfig.local`), `src/cli/commands/bot.ts` (call the check on start when voice enabled), `src/cli/helpers/messages.ts` (`voice.wrapper_unreachable` en+tr)

**Interfaces:**
- Produces: `resolveHealthUrl(local) -> string | null` (explicit `local.health_url`, else derive from `stt_url`/`tts_url` origin + `/health`, else null); `checkVoiceHealth(cfg: VoiceConfig, deck, fetchImpl=fetch) -> Promise<{ ok: boolean; provider: string; detail?: string }>` — `local`: GET health, `ok` iff 2xx; `openai`: `ok` iff key present; disabled → `{ok:true}` (nothing to check).

- [ ] **Step 1: Failing test** (`health.test.ts`) — stub `fetch`: reachable (200) → `ok:true`; unreachable (throw / 503) → `ok:false`; `resolveHealthUrl` derives `http://127.0.0.1:8001/health` from `stt_url=http://127.0.0.1:8001/stt`; explicit `health_url` wins; `openai` no-key → `ok:false`; disabled → `ok:true` and `fetch` NOT called.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `health.ts` (+ the `VoiceConfig.local.health_url?` field); wire into `bot.ts`: when `config.bot_capabilities?.voice?.enabled`, `await checkVoiceHealth(...)`; if `!ok`, log `getMessage('voice.wrapper_unreachable', lang, { url, detail })` (warn, non-fatal — bot still starts; Pillar-1 degrade covers runtime). Add the i18n key en (`⚠️ Voice is configured but the backend is unreachable at {url} — voice replies will fall back to text. {detail}`) + tr.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + `npx vitest run tests/connectors/voice/`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): bot-start health-check + honest-warn + health_url config (voice t5)"`

---

### Task 6: OpenAI cloud path hardening + config docs

**Files:**
- Modify: `src/connectors/voice/openai-voice.ts` (only if a real defect is found — else test-only), `tests/connectors/voice/openai-voice.test.ts` (add a full mock round-trip), `docs/reference/` or `docs/` voice config reference (create `docs/voice.md`)

**Interfaces:**
- Consumes: `makeOpenAIVoiceAdapter(client, cfg)` (existing).

- [ ] **Step 1: Failing/again test** — extend `openai-voice.test.ts`: inject a fake `openai` client whose `audio.transcriptions.create` returns `{text:"hi"}` and `audio.speech.create` returns an object whose `arrayBuffer()` yields bytes; assert `transcribe(buf,'audio/ogg')` → `"hi"` (file-shim has `name`, no `[Symbol.iterator]:undefined`), and `synthesize("hi")` → `{data: Buffer(len>0), mime}` with the default voice `'alloy'`. If the current code fails the shape, fix `openai-voice.ts` minimally.
- [ ] **Step 2: Run → FAIL/PASS as appropriate**.
- [ ] **Step 3: Implement** any minimal fix; write `docs/voice.md` — the user-facing voice guide: the three provider paths (openai/local/future), the full `bot_capabilities.voice` config schema, `provider:'openai'` setup (`.deck OPENAI_API_KEY`), `provider:'local'` setup (link `examples/voice-wrapper/`), the tts modes (off/reply-in-kind/always), and honest-degrade behavior. No placeholders.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + full `npx vitest run tests/connectors/` + `npm run test:ci-sim`.
- [ ] **Step 5: Commit** — `git commit -m "test(voice): openai cloud round-trip + voice config docs (voice t6)"`

---

## Manual proof-of-function (dogfood, after build)

1. `cd examples/voice-wrapper && python -m venv .venv && .venv/bin/pip install -r requirements.txt` (+ torch cu128 + VoxCPM2/whisper weights); `./run.sh`.
2. `curl -s localhost:8001/health` → `{"status":"ok"...}`; `curl` `/tts/raw` `{"text":"merhaba"}` → real WAV bytes; `curl --data-binary @clip.ogg -H 'content-type: audio/ogg' /stt` → real transcript.
3. deckent `.deckent/config.json` `bot_capabilities.voice = {enabled:true, provider:"local", stt:true, tts:"reply-in-kind", local:{stt_url, tts_url}}`; restart bot; Telegram voice "ekran görüntüsü al" → bot transcribes + acts + replies by voice. Stop the wrapper → bot logs `voice.wrapper_unreachable` on next start, voice degrades to text (no crash).

## Plan Self-Review

**Spec coverage:** §3 contract → T3 (+T4 doc); §4 reference wrapper (engines/lifecycle/server/readme) → T1–T4; §4.1 lazy+idle-evict → T2; §5.1 config → T5; §5.2 health-check+honest-warn → T5; §5.3 OpenAI hardening → T6; §1/§8 provider model + BYO → T4/T6 docs. ✅
**Placeholder scan:** none — every step has real code or a concrete artifact spec; FAKE-mode keeps wrapper tests model-free. ✅
**Type consistency:** `make_tts_engine`/`make_stt_engine`/`ModelManager.tts()/stt()/maybe_evict()/loaded` consistent T1→T2→T3; `resolveHealthUrl`/`checkVoiceHealth` T5; `VoiceConfig.local.health_url` T5; the §3 contract identical across T3/T4/T5(`local-voice.ts`). ✅
