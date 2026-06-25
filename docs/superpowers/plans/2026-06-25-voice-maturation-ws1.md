# Voice Maturation — WS1: Language Correctness & Consistency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Speak/type any language → it is transcribed in that language (no TR↔EN drift) → the bot replies in **one consistent language** (the spoken/typed one, or a configured preference), never mixed.

**Architecture:** STT auto-detects + returns the detected language; deckent threads it; a `resolveReplyLanguage` step (config preference > detected > auto) yields the turn language; the agentic turn is instructed to reply only in that language, and TTS speaks it. Spec: `docs/superpowers/specs/2026-06-25-voice-maturation-design.md` (WS1).

**Tech Stack:** Python FastAPI + faster-whisper (wrapper); TypeScript/ESM + vitest (deckent).

## Global Constraints
- **STT contract (additive):** `/stt` response becomes `{ "text": string, "language": string }` (was `{text}`). Default language = **auto-detect** (faster-whisper detects); an explicit `?language=<bcp47>` forces that language. Wrapper tests use stdlib `unittest` via the dogfood venv python `/home/alperen/youtube-plan/services/tts/.venv/bin/python` (FAKE mode).
- **deckent:** `VoiceAdapter.transcribe(audio, mime)` returns `{ text: string; language?: string }` (was `string`). ESM `.js`. i18n via getMessage. No new runtime dep. Default-off preserved (voice disabled → unchanged). tsc 0; full connector suite green.
- **Reply-language rule:** effective language = `cfg.language` if it is a concrete tag (`tr`/`en`/…); else the turn's detected/used language; else (`auto`) instruct the model to mirror the user's language. Never mix languages in one reply.
- **Backward-compat:** a client reading the old `{text}` still works (language is additive); FAKE STT returns a `language` too (e.g. `"tr"`).

---

### Task 1: Wrapper STT auto-detect + return detected language

**Files:** Modify `examples/voice-wrapper/engines.py` (`FasterWhisperStt.transcribe`), `examples/voice-wrapper/server.py` (`/stt`), `examples/voice-wrapper/test_server.py`, `examples/voice-wrapper/test_engines.py`

**Interfaces:**
- `FasterWhisperStt.transcribe(wav_path, language)` → returns `(text: str, detected: str)`. When `language` is falsy/None → pass `language=None` to whisper (auto-detect); read `info.language` from `model.transcribe(...)`'s returned `info`. When `language` is set → force it; `detected = language`.
- `FakeStt.transcribe(...)` → returns `("[fake transcript]", "tr")` (a default detected language for tests).
- `SttEngine.transcribe` abstract signature updated to `-> tuple[str, str]`.
- `/stt` → `language = request.query_params.get("language") or None` (NOT `"en"`); `text, detected = manager.stt().transcribe(path, language)`; respond `{ "text": text, "language": detected }`. FAKE → `{ "text": "[fake transcript]", "language": "tr" }`.

- [ ] **Step 1: Failing tests** (unittest, FAKE) — `/stt` returns JSON with both `text` (str) and `language` (str); `test_engines` — `FakeStt.transcribe` returns a 2-tuple `(str, str)`; the abstract/real signatures return a tuple.
- [ ] **Step 2: Run → FAIL** (`PYW=/home/alperen/youtube-plan/services/tts/.venv/bin/python; cd examples/voice-wrapper && "$PYW" -m unittest test_server test_engines -v`).
- [ ] **Step 3: Implement** the engine + server changes (auto-detect default, return detected language; FakeStt 2-tuple).
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice-wrapper): STT auto-detect + return detected language (ws1 t1)"`

---

### Task 2: deckent VoiceAdapter.transcribe → { text, language }

**Files:** Modify `src/connectors/voice/types.ts` (`VoiceAdapter.transcribe` return type), `src/connectors/voice/local-voice.ts`, `src/connectors/voice/openai-voice.ts`, `tests/connectors/voice/local-voice.test.ts`, `tests/connectors/voice/openai-voice.test.ts`

**Interfaces:**
- `VoiceAdapter.transcribe(audio: Buffer, mime: string): Promise<{ text: string; language?: string }>` (was `Promise<string>`).
- `local-voice.ts`: parse `{ text, language }` from the `/stt` JSON; optionally append `?language=<hint>` to `stt_url` when `local.stt_language` is a concrete tag (else omit → wrapper auto-detects). Return `{ text, language }`.
- `openai-voice.ts`: request `response_format: 'verbose_json'` (or `'json'` + a language hint) so the OpenAI transcription returns the detected `language`; return `{ text, language }`.
- `VoiceConfig.local.stt_language?: string` (optional explicit STT-language hint).

- [ ] **Step 1: Failing tests** — `local-voice` transcribe returns `{text, language}` from a stubbed `{text:'merhaba', language:'tr'}` fetch; honors `stt_language` hint in the URL when set; `openai-voice` transcribe returns `{text, language}` from the fake client. Update existing transcribe assertions (string → object).
- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/connectors/voice/`).
- [ ] **Step 3: Implement** the return-shape change across types + both adapters; fix all callers the compiler flags.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): transcribe returns {text, language} (ws1 t2)"`

---

### Task 3: Inbound voice threads the detected language

**Files:** Modify `src/connectors/connector-bootstrap.ts` (`handleInboundVoice` + the turn dispatch), `tests/connectors/voice-wire.test.ts`

**Interfaces:**
- `handleInboundVoice` captures `{ text, language }` from `voiceAdapter.transcribe(...)`; the resulting turn carries the detected `language` (extend the per-turn voice-origin metadata, e.g. `pendingVoiceLang` keyed by channel, mirroring the existing `pendingVoiceOrigin`).

- [ ] **Step 1: Failing test** — an inbound voice whose fake adapter returns `{text:'ekran görüntüsü al', language:'tr'}` → the turn's resolved language is `'tr'` (assert via the responder receiving the language, or the pending-lang map).
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** the capture + threading (parallel to `pendingVoiceOrigin`).
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + `npx vitest run tests/connectors/`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): thread STT detected language into the turn (ws1 t3)"`

---

### Task 4: Reply-language config + resolver

**Files:** Create `src/connectors/voice/language.ts`, `tests/connectors/voice/language.test.ts`; Modify `src/connectors/capabilities/types.ts` (`VoiceConfig.language`)

**Interfaces:**
- `VoiceConfig.language?: 'auto' | string` (bcp47 tag or `'auto'`; default `'auto'`).
- `resolveReplyLanguage(cfg: VoiceConfig, turnLang?: string): { tag: string | null; mode: 'forced' | 'mirror' }` — if `cfg.language` is a concrete tag → `{ tag, mode:'forced' }`; else if `turnLang` (voice detected) present → `{ tag: turnLang, mode:'forced' }`; else `{ tag: null, mode:'mirror' }` (let the model mirror the user's language).

- [ ] **Step 1: Failing test** — concrete `cfg.language:'tr'` → `{tag:'tr',mode:'forced'}` regardless of turnLang; `cfg.language:'auto'` + turnLang `'en'` → `{tag:'en',mode:'forced'}`; `'auto'` + no turnLang → `{tag:null,mode:'mirror'}`.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `language.ts` + the config field.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): reply-language config + resolveReplyLanguage (ws1 t4)"`

---

### Task 5: Inject reply-language instruction + TTS language passthrough

**Files:** Modify `src/connectors/chat-bridge.ts` (or the agentic prompt seam it owns) + `src/connectors/connector-bootstrap.ts` (TTS language), `src/cli/helpers/messages.ts` (the instruction strings, en+tr), `tests/connectors/voice-wire.test.ts` / a new test

**Interfaces:**
- Before the agentic turn runs, compute `resolveReplyLanguage(...)` and prepend a system/turn instruction: `mode:'forced'` → `getMessage('voice.reply_lang_forced', lang, { language })` ("Reply ONLY in {language}. Do not mix languages."); `mode:'mirror'` → `getMessage('voice.reply_lang_mirror', lang)` ("Reply in the same language the user used; do not mix languages."). Read the chat-bridge agentic flow to find where the per-turn prompt/preamble is assembled and inject there (do NOT hardcode — use the existing prompt-assembly seam).
- Pass the resolved language tag into the reply `voice.synthesize(text, { language })` path (TTS language hint) where the reply-TTS is invoked in `connector-bootstrap.ts`.

- [ ] **Step 1: Failing test** — a voice turn detected `'tr'` → the agentic prompt the responder receives contains the "reply only in tr" instruction (assert the injected preamble), and the reply-TTS is called with `language:'tr'`. (Use the existing voice-wire fakes.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** the injection at the real prompt seam + the TTS language passthrough; add i18n keys en+tr.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + `npx vitest run tests/connectors/`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): inject reply-language instruction + TTS language passthrough (ws1 t5)"`

---

### Task 6: Docs + suite/ci-sim

**Files:** Modify `docs/voice.md` (language section), `examples/voice-wrapper/README.md` (the `/stt` `{text,language}` + `?language=` contract)

- [ ] **Step 1:** Update `docs/voice.md` — the language preference (`voice.language` auto/tr/en…, per-chat), the "reply in one language" behavior, the STT auto-detect. Update the wrapper `README.md` `/stt` contract to `{text, language}` + the `?language=` override + auto-detect default. No placeholders; real config JSON.
- [ ] **Step 2:** Run full `npx vitest run tests/connectors/` + `npx tsc --noEmit` + the wrapper unittest suite + `npm run test:ci-sim`.
- [ ] **Step 3: Commit** — `git commit -m "docs(voice): language auto-detect + reply-language contract (ws1 t6)"`

---

## Manual proof-of-function (dogfood, after WS1)
1. Restart the wrapper from this branch (auto-detect STT). Telegram: speak **Turkish** → transcribed Turkish → bot replies **Turkish only** (no EN words). Speak/type **English** → English only. Set `voice.language:'tr'` → always Turkish even for English input.

## Plan Self-Review
**Spec coverage:** 1a (STT auto-detect) → T1/T2; 1b (reply-language resolve+pin) → T3/T4/T5; 1c (config preference) → T4. ✅
**Placeholder scan:** none — signatures + steps concrete; the T5 prompt seam is explicitly "find the real assembly point, don't hardcode". ✅
**Type consistency:** `transcribe → {text, language}` consistent T1(wrapper)→T2(adapter)→T3(bootstrap); `resolveReplyLanguage` T4→T5; `VoiceConfig.language`/`local.stt_language` T2/T4. ✅
