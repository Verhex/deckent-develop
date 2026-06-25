# Voice — deckent Bot Voice Feature

**Voice is default-off.** Enabling it adds inbound speech-to-text (STT) and outbound
text-to-speech (TTS) to any deckent Telegram bot. The voice backend is your choice: a cloud
API with zero setup, your own self-hosted model, or any HTTP service that implements the
[deckent Voice Contract](../examples/voice-wrapper/README.md).

---

## 1. Overview

When voice is enabled, the bot:

- **Inbound (STT):** receives a Telegram voice message → transcribes it to text → runs the turn as a
  normal text command.
- **Outbound (TTS):** synthesizes the text reply → sends it back as a voice message via `sendVoice`.

The underlying abstraction is `VoiceAdapter` (`src/connectors/voice/types.ts`):

```ts
interface VoiceAdapter {
  transcribe(audio: Buffer, mime: string): Promise<{ text: string; language?: string }>;
  synthesize(text: string, opts?: { voice?: string; language?: string }): Promise<{ data: Buffer; mime: string }>;
}
```

`transcribe` returns the transcribed text **and** the detected language tag (e.g. `"tr"`, `"en"`).
`synthesize` accepts an optional `language` hint (BCP-47) forwarded to the TTS backend so it
produces output in the correct language.

`createVoiceAdapter(cfg, deck)` returns `null` when voice is disabled or misconfigured — the bot
is byte-identical to a voice-free bot when `enabled` is absent or `false`. No adapter is created,
no health-check is run, no deck secrets are read.

---

## 2. Three ways to get voice

### (a) `provider: "openai"` — zero-setup cloud

OpenAI Whisper (STT) + OpenAI TTS. Nothing to install or host; deckent loads the `openai` SDK
dynamically (optional peer dependency) so the binary and CI stay clean when the key is absent.

**Requirements:** add `OPENAI_API_KEY` to your project's `.deck` secrets file.

**Config:**
```json
{
  "bot_capabilities": {
    "voice": {
      "enabled": true,
      "provider": "openai",
      "stt": true,
      "tts": "reply-in-kind"
    }
  }
}
```

No `local` block is needed. The default TTS voice is `"alloy"` (pinned).

**Honest degrade:** if `OPENAI_API_KEY` is absent or empty, `createVoiceAdapter` returns `null`
and the bot starts without voice (no error). A missing key is a silent no-op, not a crash.

---

### (b) `provider: "local"` — your own backend

deckent calls any HTTP service that implements the
[deckent Voice HTTP Contract](../examples/voice-wrapper/README.md#2-the-deckent-voice-http-contract).
You choose the engine (VoxCPM2, Piper, XTTS, Coqui, whisper.cpp, a cloud proxy — any stack).

deckent ships a reference implementation you can run as-is or fork:

```
examples/voice-wrapper/
  server.py      — FastAPI app (VoxCPM2 TTS + faster-whisper STT)
  engines.py     — TTS / STT engine abstraction (swap engines by env)
  lifecycle.py   — lazy-load + idle-evict model manager
  run.sh         — one-command start
  README.md      — full contract doc + setup + env knobs
```

**Start the reference wrapper:**
```bash
cd examples/voice-wrapper
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh
# Listening on http://127.0.0.1:8001
```

> **⚠️ Security — no authentication.** The wrapper has no auth; keep it on `127.0.0.1`
> (the `run.sh` default). Binding to `0.0.0.0` or a public interface lets anyone reachable
> drive your GPU and read generated audio. See the
> [wrapper README](../examples/voice-wrapper/README.md#step-4--start-the-server) for
> mitigation options (reverse proxy, firewall, private network).

**Config:**
```json
{
  "bot_capabilities": {
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
}
```

`health_url` is optional: if absent, deckent derives it from the `stt_url` (or `tts_url`) origin
plus `/health`. For the example above the derived URL is `http://127.0.0.1:8001/health`.

---

### (c) Future providers

Additional providers (ElevenLabs, Azure Speech, Deepgram, Google, etc.) will be added to the
`createVoiceAdapter` factory as thin adapters. Existing callers need no changes — the `VoiceAdapter`
interface is the stable surface. Use `provider: "local"` with a thin HTTP shim today if you need
a different backend before first-party adapters land.

---

## 3. Config reference

The full `bot_capabilities.voice` schema (TypeScript source: `src/connectors/voice/types.ts`):

```ts
interface VoiceConfig {
  enabled?:  boolean;                            // default: false (must be explicit)
  stt?:      boolean;                            // default: false — accept inbound voice?
  tts?:      'off' | 'always' | 'reply-in-kind'; // default: 'off'
  provider?: 'local' | 'openai';                 // default: 'local'
  language?: 'auto' | string;                    // default: 'auto' — see §5 Language
  local?: {
    stt_url?:      string;  // required for provider:'local' — POST audio → {text, language}
    tts_url?:      string;  // required for provider:'local' — POST {text} → audio bytes
    tts_voice?:    string;  // optional voice hint forwarded in TTS request body
    health_url?:   string;  // optional; derived from stt_url/tts_url origin + "/health"
    stt_language?: string;  // optional explicit STT language hint (BCP-47, e.g. 'tr');
                            // appended as ?language= to stt_url; omit for auto-detect
  };
}
```

### Config examples

**OpenAI (zero-setup cloud):**
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

**Local wrapper (self-hosted):**
```json
{
  "voice": {
    "enabled": true,
    "provider": "local",
    "stt": true,
    "tts": "always",
    "local": {
      "stt_url": "http://127.0.0.1:8001/stt",
      "tts_url": "http://127.0.0.1:8001/tts/raw",
      "health_url": "http://127.0.0.1:8001/health",
      "tts_voice": "default"
    }
  }
}
```

**Voice completely off (default state — no block needed):**
```json
{
  "voice": {
    "enabled": false
  }
}
```

---

## 4. TTS modes

The `tts` field controls when the bot synthesizes voice replies:

| Value | Behavior |
|-------|----------|
| `"off"` | Never synthesize. All replies are text only. (Default.) |
| `"reply-in-kind"` | Synthesize a voice reply **only** when the inbound message was a voice message. Text-in → text-out. Voice-in → voice-out. |
| `"always"` | Always synthesize replies as voice, regardless of what the user sent. Text-in still gets a voice reply. |

`stt: true` is independent of `tts`: you can transcribe inbound voice without synthesizing
replies (`tts: "off"`), or synthesize all replies without accepting inbound voice
(`stt: false`, `tts: "always"` — though synthesis-only without STT is rarely useful).

---

## 5. Language — auto-detect, reply consistency, and pinning

### How language flows through a voice turn

1. **STT auto-detect (default):** when `local.stt_language` is absent, the wrapper's STT engine
   (faster-whisper) detects the spoken language from the audio and returns it as the `language`
   field in the `/stt` response (e.g. `{"text":"merhaba","language":"tr"}`).
2. **Language threading:** deckent reads the detected language and uses it in two places:
   - the LLM prompt receives a language instruction ("reply in `tr`") so the bot never mixes
     languages within a single reply;
   - the TTS call forwards `language` so the synthesis backend produces output in the same tongue.
3. **Result:** the user speaks (or types) in a language → the bot replies in **exactly that
   language**, consistently. No mixed-language replies.

### The `voice.language` config field

`bot_capabilities.voice.language` controls the **reply language preference**:

| Value | Behavior |
|-------|----------|
| absent or `"auto"` | **Auto-detect** — reply in the STT-detected language of each turn; for text turns, the model mirrors the user's input language. |
| BCP-47 tag (e.g. `"tr"`, `"en-US"`) | **Pinned** — always reply in this language regardless of the detected turn language. Useful for a bot that must always answer in Turkish even when the user writes in English ("TR sabit" use-case). |

### Config examples

**Auto-detect (default — no `language` field needed):**
```json
{
  "voice": {
    "enabled": true,
    "provider": "local",
    "stt": true,
    "tts": "reply-in-kind",
    "local": {
      "stt_url": "http://127.0.0.1:8001/stt",
      "tts_url": "http://127.0.0.1:8001/tts/raw"
    }
  }
}
```

**Pinned to Turkish (always reply in `tr`):**
```json
{
  "voice": {
    "enabled": true,
    "provider": "local",
    "stt": true,
    "tts": "reply-in-kind",
    "language": "tr",
    "local": {
      "stt_url": "http://127.0.0.1:8001/stt",
      "tts_url": "http://127.0.0.1:8001/tts/raw"
    }
  }
}
```

**Explicit STT language hint (skip auto-detect, force wrapper to transcribe as `tr`):**
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
      "stt_language": "tr"
    }
  }
}
```

`local.stt_language` is appended as `?language=tr` to every STT request, bypassing Whisper's
auto-detect. Use it when you know all callers speak one language and want to avoid the occasional
mis-detection. Omit it to keep auto-detect (recommended for multi-lingual bots).

See also: [`examples/voice-wrapper/README.md` §2 `/stt` contract](../examples/voice-wrapper/README.md#post-stt--speech-to-text).

---

## 6. Honest degrade — what happens when the backend is unreachable

deckent is designed to **never crash** due to a missing or unreachable voice backend.

### On bot start

When voice is enabled, deckent runs a health-check on the backend before accepting updates:

- **`provider: "local"`:** `GET <health_url>` (explicit or derived). If the backend is
  unreachable, deckent logs `voice.wrapper_unreachable` with the URL and **starts anyway**.
  Voice calls degrade to text for the session.

- **`provider: "openai"`:** if `OPENAI_API_KEY` is absent or empty, `createVoiceAdapter`
  returns `null` synchronously — no adapter, no warning, no check. The bot starts clean.

### On every voice call

- **STT failure** (backend error or network error): the inbound voice message is treated as
  untranscribable. The bot notifies the user honestly (e.g. "Could not transcribe your voice
  message") and does not process the turn.

- **TTS failure** (backend error or network error): the reply is sent as text instead of voice.
  The content is never lost — only the delivery modality degrades.

No call ever crashes the bot process. All errors are surfaced honestly.

---

## 7. Cross-links

- **Reference wrapper + full contract doc:** [`examples/voice-wrapper/README.md`](../examples/voice-wrapper/README.md)
- **Design spec:** [`docs/superpowers/specs/2026-06-25-voice-product-feature-design.md`](superpowers/specs/2026-06-25-voice-product-feature-design.md)
- **`VoiceConfig` type:** `src/connectors/voice/types.ts`
- **`VoiceAdapter` factory:** `src/connectors/voice/types.ts` — `createVoiceAdapter(cfg, deck)`
- **OpenAI adapter:** `src/connectors/voice/openai-voice.ts` — `makeOpenAIVoiceAdapter(client)` (testable entry-point), `createOpenAIVoiceAdapter(deck)` (production)
- **Local adapter:** `src/connectors/voice/local-voice.ts` — `makeLocalVoiceAdapter(cfg)`
- **Health-check:** `src/connectors/voice/health.ts`
