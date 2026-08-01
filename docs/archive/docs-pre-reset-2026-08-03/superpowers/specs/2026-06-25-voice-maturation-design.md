# Voice Assistant Maturation — Design

**Status:** Approved (Alperen, 2026-06-25)
**Goal:** Turn the working-but-rough voice bot into a coherent, multilingual voice assistant: correct & consistent language (STT + reply), no semantic/modality confusion, natural prosody, and per-user voice — all scaling to any user's language and voice (Law 1 + Law 2).

> Builds on Pillar-1 (capabilities) + the voice product feature (both merged). Voice quality is already fixed (single clean reference + one-pass synthesis = clear). This program fixes the *language*, *semantics/modality*, and *prosody* layers, then productizes.

---

## Diagnosis (root causes, verified in code)

1. **STT Turkish↔English drift** — the wrapper `/stt` hardcodes `language = query.get("language") or "en"` (`server.py:228`) and the deckent client (`local-voice.ts` transcribe) never sends a language → faster-whisper is **always forced to English**, so Turkish speech is mis-transcribed/garbled. Garbled input → "stupid" LLM replies.
2. **"I can't access audio" replies** — when asked to "reply by voice", the bot *does* reply by voice but the LLM **content** denies it can do voice. The LLM (Claude) has no context that its replies are spoken; it presents as text-only.
3. **Mixed / inconsistent reply language** — the LLM reply language isn't pinned; compounded by STT drift. User wants **only-TR or only-EN**, never mixed; other users their own language.
4. **Prosody (intonation/emphasis)** — VoxCPM2 quality is good with a clean ref; intonation/emphasis can be richer (reference expressiveness, params, text normalization).

---

## Architecture principle (unchanged, reinforced)

Voice is **transport**, not a brain. One agentic LLM holds all tools (Pillar-1). The maturation adds a thin **turn-intent layer** around that single brain:

```
inbound (voice|text)
   → [STT if voice: auto-detect language → text + detectedLang]
   → turn-intent resolve: { language, replyModality }   ← NEW
   → agentic LLM (tools, + voice-awareness + "reply in <language>")  ← context augmented
   → reply text
   → [reply via voice|text per replyModality; TTS in <language>]      ← gated by intent, not just config
```

The new layer is small, deterministic-first, and lives at the connector/bridge seam — not inside the engines.

---

## Workstream 1 — Language Correctness & Consistency 🔴 (FIRST)

**The highest-impact fix: stop the garbling + pin a single reply language.**

### 1a — STT auto-detect (wrapper + client)
- **Wrapper `/stt`:** default language to **auto-detect** (pass `None`/empty to faster-whisper, which detects per audio) instead of `"en"`. `engines.py` `FasterWhisperStt.transcribe` passes `language=None` when unset → whisper auto-detects; **return the detected language** in the response: `{ "text": ..., "language": "<detected>" }`. An explicit `?language=` still forces that language (override).
- **Client `local-voice.ts`:** `transcribe` returns `{ text, language? }` (was `string`); optionally send `?language=<hint>` when a config/per-chat language is pinned (else auto). The `VoiceAdapter.transcribe` signature gains the detected language in its return.
- **Backward-compat:** existing tests updated for the new `{text, language}` STT response; FAKE mode returns a `language` too.

### 1b — Reply-language resolution + pinning
- A **`resolveTurnLanguage`** step: for a voice turn, use the STT detected language; for a text turn, detect from the message text (a light heuristic / the LLM); apply the config preference (force or default).
- Inject into the agentic turn a clear instruction: **"Reply ONLY in {language}. Do not mix languages."** so the LLM produces a single-language reply. The TTS then speaks that single-language text.

### 1c — Config language preference (clearly saved)
- `bot_capabilities.voice.language` (or a broader `language`) = `"auto" | "tr" | "en" | <bcp47>` — **default for the project, per-chat overridable.** For Alperen: `"tr"` (fixed). For other users: `"auto"` (detect) or their pin. This is the "net kaydedilmiş iletişim-dili tercihi".

**WS1 deliverable:** speak Turkish → transcribed as Turkish → bot replies in Turkish only; speak/type English → English only; configurable + auto for any language.

---

## Workstream 2 — Semantics & Modality 🟠

### 2a — LLM voice-awareness
- Augment the agentic system context: "You are a voice-capable assistant; your replies may be spoken aloud to the user. Never claim you cannot produce or access audio. The user may ask for a voice or text reply." Kills the "I can't access audio" responses.

### 2b — Per-turn modality override
- Detect an explicit output-modality intent in the message (deterministic keyword sets, multilingual: `yaz/yazılı/text` → text; `sesli/ses olarak/voice/read it` → voice) → set the turn's **replyModality**, overriding the config default (`reply-in-kind`/`always`/`off`). Enables voice-in→text-out and text-in→voice-out. Later: LLM-driven via a `reply_via(voice|text)` tool for paraphrases.
- The modality keyword is a side-channel: it sets the output format but the full message still goes to the LLM (content unaffected).

### 2c — Flow robustness
- Intent extraction must not corrupt the content the LLM acts on; graceful degrade when STT confidence is low (ask to repeat / fall back to text).

---

## Workstream 3 — Prosody: Intonation & Emphasis 🟡

- **3a — Expressive reference:** curate clean, **expressive** (varied intonation) single-speaker references; offer a few candidate Turkish voices to choose from. (Ref expressiveness transfers to output.)
- **3b — Params + text normalization:** `cfg`/`inference_timesteps` sweep for naturalness (reuse the user's `poc/tts-naturalness` findings); normalize text for prosody (punctuation, numbers, abbreviations, casing).
- **3c — Per-user voice enrollment** ("both" paths): wrapper `POST /voice/enroll` (audio → per-`voice_id` reference) + per-request `voice` selecting an enrolled ref; deckent "sesimi kaydet" command (next voice message → enroll) + `voice.local.tts_voice_ref` config path. ~12s clean reference (10-15s ideal, SNR≥30dB).

---

## Workstream 4 — Hardening & Productization 🟢

- **4a:** (done as base commit) the one-pass + denoiser + model-env wrapper fix.
- **4b:** engine abstraction keeps Trendyol-TTS (VoxCPM2+TR-LoRA) as a selectable `TTS_MODEL`; per-request reference for enrollment.
- **4c:** tests (wrapper unittest + deckent vitest) for the new STT response shape, language resolution, modality override; docs (`docs/voice.md`, wrapper `README.md`) updated for language/modality/enrollment.

---

## Cross-cutting (Law 2)
Every piece — STT auto-detect, reply-language, modality keywords, enrollment — is **per-user, per-language**: any user runs their own language and (later) their own voice with zero retraining.

---

## Testing & Proof-of-Function
- **Wrapper:** unittest (FAKE) for the new `{text, language}` STT response + `?language=` override + auto-detect default; the engine `transcribe(language=None)` path.
- **deckent:** vitest for `resolveTurnLanguage`, the modality-keyword resolver, the reply-language instruction injection, the new `transcribe` return shape; default-off preserved; full connector suite green; tsc 0.
- **Live dogfood (per workstream):** WS1 — speak TR → TR-only reply; speak EN → EN-only; "yaz" after a voice msg → text reply; "sesli anlat" → voice reply that doesn't deny audio.

## Roadmap / order
WS1 (language) → WS2 (semantics/modality) → WS3 (prosody) → WS4 (productize). Each ships + dogfoods before the next.
