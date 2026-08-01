# Voice Maturation — WS2: Semantics & Modality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** (1) The bot stops giving contradictory replies like "I can't access audio" when asked to speak — the LLM knows it is voice-capable. (2) The user can control the output modality per message in natural language: send voice but say "yaz" → text reply; type but say "sesli cevap ver" → voice reply.

**Architecture:** A thin **turn-intent** layer (deterministic, at the connector seam) — already started in WS1 (reply-language). WS2 adds: a voice-awareness instruction into the agentic turn, and a per-turn **reply-modality** override that gates the existing voice-vs-text reply decision. Spec: `docs/superpowers/specs/2026-06-25-voice-maturation-design.md` (WS2).

**Tech Stack:** TypeScript/ESM + vitest.

## Global Constraints
- The modality override is **deterministic keyword detection** (multilingual: TR + EN at least), a side-channel that sets the output format; the FULL message still goes to the LLM (content unaffected). ESM `.js`. i18n via getMessage en+tr. tsc 0. Default-off preserved (no voice config → no change). Full connector suite green.
- WS2 reuses WS1's `turnText` injection seam in `connector-bootstrap.ts` (where the reply-language instruction is prepended before `chat()`/`chatStreaming()`), and the `shouldVoiceThisTurn` decision in the reply path.
- Modality keywords must NOT misfire on normal content — require reasonably explicit phrases (e.g. "sesli cevap ver", "sesli yanıtla", "bana yaz", "yazılı cevap ver", "reply by voice", "in text"), not bare "ses"/"yaz" embedded in unrelated words.

---

### Task 1: Reply-modality intent resolver

**Files:** Create `src/connectors/voice/modality.ts`, `tests/connectors/voice/modality.test.ts`

**Interfaces:**
- `export type ReplyModality = 'voice' | 'text';`
- `export function resolveReplyModality(text: string, opts: { ttsMode: 'off'|'reply-in-kind'|'always'; voiceOrigin: boolean }): { modality: ReplyModality; overridden: boolean }`
  - **Default** (no explicit request): `ttsMode==='off'` → `text`; `ttsMode==='always'` → `voice`; `ttsMode==='reply-in-kind'` → `voiceOrigin ? 'voice' : 'text'`.
  - **Override:** if the message contains an explicit *voice-request* phrase → `voice` (overridden:true); an explicit *text-request* phrase → `text` (overridden:true). Override beats the default (enables voice when off, and text when always).
  - Keyword sets (case-insensitive, word-ish boundaries): voice = `['sesli cevap', 'sesli yanıt', 'sesli anlat', 'sesli söyle', 'ses olarak', 'bana oku', 'reply by voice', 'in voice', 'read it aloud', 'say it']`; text = `['yaz', 'yazılı', 'yazarak', 'metin olarak', 'reply in text', 'in text', 'as text', 'write it']` — match `yaz` only as a word/imperative ("yaz", "yazılı", "yazarak", "bana yaz"), NOT inside other words. Document the exact matching rule.

- [ ] **Step 1: Failing test** — defaults (off→text, always→voice, reply-in-kind+voiceOrigin→voice, reply-in-kind+!voiceOrigin→text); voice override on text-origin (`"bunu bana sesli anlat"` + reply-in-kind + !voiceOrigin → `{voice, overridden:true}`); text override on voice-origin (`"ekran görüntüsü al ve bana yaz"` + reply-in-kind + voiceOrigin → `{text, overridden:true}`); override beats `always`/`off`; no misfire on a normal sentence without keywords.
- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/connectors/voice/modality.test.ts`).
- [ ] **Step 3: Implement** `modality.ts` (pure; keyword sets; explicit-phrase matching).
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): reply-modality intent resolver (ws2 t1)"`

---

### Task 2: Wire the modality override into the reply path

**Files:** Modify `src/connectors/connector-bootstrap.ts` (the `shouldVoiceThisTurn` computation + the reply path), `tests/connectors/voice-wire.test.ts`

**Interfaces:**
- Currently `shouldVoiceThisTurn` is computed from `ttsMode` + `voiceOrigin`. Replace/augment it with `resolveReplyModality(text, { ttsMode, voiceOrigin }).modality === 'voice'`. The `text` is the inbound message text (the user's words, pre-agentic). Keep the existing honest-degrade (synthesize/sendVoice failure → text fallback) intact.
- The override must work both directions: `reply-in-kind` voice-origin + "yaz" → text reply (no TTS); `off`/text-origin + "sesli ver" → voice reply.

- [ ] **Step 1: Failing test** (voice-wire) — a voice-origin turn whose text contains "bana yaz" (reply-in-kind) → NO `sendVoice`, text reply sent; a text-origin turn whose text contains "sesli cevap ver" (reply-in-kind) → `sendVoice` called. Use the existing voice-wire fakes.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — compute the modality via `resolveReplyModality` at the turn (where `text`, `ttsMode`, `voiceOrigin` are available) and gate `shouldVoiceThisTurn` on it. Preserve all degrade paths.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + `npx vitest run tests/connectors/`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): per-turn modality override gates voice-vs-text reply (ws2 t2)"`

---

### Task 3: LLM voice-awareness instruction

**Files:** Modify `src/connectors/connector-bootstrap.ts` (the `turnText` injection seam), `src/cli/helpers/messages.ts` (the instruction string en+tr), `tests/connectors/voice-wire.test.ts`

**Interfaces:**
- When voice is enabled for the chat (`voiceCfg` present), prepend a voice-awareness line to `turnText` (alongside the WS1 reply-language instruction): `getMessage('voice.capability_context', lang)` =
  - en: `"You are a voice-capable assistant: your replies may be spoken aloud and the user may send or request voice. Never say you cannot access, hear, or produce audio."`
  - tr: `"Sesli bir asistansın: yanıtların sesli okunabilir ve kullanıcı sesli mesaj gönderebilir veya isteyebilir. ASLA sesi duyamadığını, erişemediğini veya üretemediğini söyleme."`
- Order: voice-awareness + reply-language instructions both prepended (compose cleanly; one preamble block).

- [ ] **Step 1: Failing test** — a voice-enabled turn → `turnText` contains the voice-capability instruction (assert the marker); voice-disabled → not present (default-off).
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — prepend via getMessage; compose with the WS1 reply-language preamble (both in one block, no duplication).
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + `npx vitest run tests/connectors/`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): LLM voice-awareness context (no more 'cannot access audio') (ws2 t3)"`

---

### Task 4: Docs + suite/ci-sim

**Files:** Modify `docs/voice.md` (modality control + voice-awareness section)

- [ ] **Step 1:** `docs/voice.md` — add a **Modality control** section: per-message "yaz"/"sesli cevap ver" overrides the `tts` default (with examples, the keyword behavior, multilingual); note the LLM is voice-aware. No placeholders.
- [ ] **Step 2:** Run full `npx vitest run tests/connectors/` + `npx tsc --noEmit` + the wrapper unittest suite + `npm run test:ci-sim` (classify any failures as pre-existing vs WS2).
- [ ] **Step 3: Commit** — `git commit -m "docs(voice): modality control + voice-awareness (ws2 t4)"`

---

## Manual proof-of-function (dogfood, after WS2 + build)
1. Telegram (voice enabled, reply-in-kind): send a **voice** message + say "...bunu bana **yaz**" → bot replies in **text**. Type a message + "...**sesli cevap ver**" → bot replies by **voice**. Ask "bana sesli anlat" → bot speaks AND does not deny it can do audio.

## Plan Self-Review
**Spec coverage:** 2a (LLM voice-awareness) → T3; 2b (per-turn modality override) → T1+T2; 2c (flow robustness) → T1 (no-misfire) + T2 (degrade preserved). ✅
**Placeholder scan:** none — keyword sets + signatures concrete; the injection seam is the WS1 `turnText` point (known). ✅
**Type consistency:** `resolveReplyModality` T1→T2; `turnText` injection T3 reuses WS1 seam; i18n keys `voice.capability_context` T3. ✅
