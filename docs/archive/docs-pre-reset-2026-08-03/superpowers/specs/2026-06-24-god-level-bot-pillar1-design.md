# God-Level Bot — Pillar 1 (Interaction & UX) — Design Spec

> **Status:** Approved design (brainstorming, 2026-06-24). Next: `writing-plans`.
> Builds on the merged bot capability framework (`docs/superpowers/specs/2026-06-24-bot-capability-framework-design.md`).

**Goal:** Take the deckent messaging bot to god-level on the **Interaction & UX** pillar: capability approvals via inline **buttons** (not typed `approve <id>`), **rich content** (HTML formatting) everywhere, **beautiful previews**, **mail attachments** (via cross-capability artifacts), and **voice** (STT in / TTS out) — all on the existing single-chokepoint consent framework.

**Architecture:** Three new abstractions layered onto the capability framework, none bypassing the consent gate: (1) an **approval-send sink** that delivers out-of-band buttoned rich previews and edits them on resolution; (2) a per-chat **artifact store** that lets one capability's output (a screenshot PNG, or an inbound photo) be referenced as an attachment by another (send_mail); (3) a **VoiceAdapter** (local-first, HTTP-endpoint) plus connector audio I/O, where voice is pure transport (transcribe→agentic-loop→synthesize) and the capability gate still applies.

**Tech Stack:** TypeScript (ESM, Node ≥24), grammY (Telegram), nodemailer (mail, attachments), zod, vitest. Voice: local models behind a deckent HTTP contract (a FastAPI **wrapper** serving chatterbox/voxcpm2 for TTS + faster-whisper for STT), with OpenAI (`openai` optionalDependency) as a cloud adapter. Markdown→HTML via the existing `markdownToTelegramHtml`.

## Global Constraints (inherited by every task)

- **🔒 IMMUTABLE LAWS (CLAUDE.md):** dual-lens+scale; every-environment (cross-platform, adapter-based, million-scale, honest-fail-never-silent); never-MVP.
- **Single chokepoint preserved:** approvals, artifacts, and voice are UX/transport around the ONE gated dispatcher — none bypass the consent policy. A voice "take a screenshot" still transcribes → agentic loop → screenshot capability → gate.
- **Backward-compatible + flag-gated:** every new connector method and config is optional/feature-detected; when absent, behavior is byte-identical (honest text fallback, no buttons, no voice).
- **Secrets via `.deck`:** SMTP, `$DECK:OPENAI_API_KEY` (cloud voice only). Local voice needs no key.
- **i18n-first:** all user-facing strings via `getMessage` (en/tr) — button labels, previews, approval/result text.
- **Hermetic tests:** inject connector/transport/spawn/openai/voice-http; tmpdir artifacts; async spawn; no real network in unit tests; OpenAI/Gmail/local-voice smokes skip-with-reason when their dependency/key/endpoint is absent (CI-safe); `test:ci-sim` before push.
- **Proof-of-function (Tier-1):** real-binary verify — real buttoned approval (live), real mail-with-attachment (SMTP-sink wire + live), real STT/TTS round-trip (skip when endpoint/key absent), full live e2e (voice → screenshot → attached mail → voice reply).
- **Security — attachments:** mail attaches **artifact-ids only** (produced/uploaded in THIS chat), never arbitrary host paths → mail cannot exfil host files. Artifacts are per-chat-scoped + TTL.
- **Surgical:** reuse the per-turn connector (Slice 1.1), the inline-button/callback round-trip, `bot-action-store`, `markdownToTelegramHtml`/`sendRich`, the `loadGrammy/loadNodemailer` dynamic-dep pattern.

---

## North-Star — the 5 pillars (the god-level bot)

This spec implements **Pillar 1**; the doc records all five so the roadmap is coherent.

| Pillar | Theme | Scope |
|--------|-------|-------|
| **1 · Interaction & UX** _(this spec)_ | feel | button approvals · rich content · pretty previews · mail attachments · voice (STT/TTS) |
| **2 · Capability breadth** | power | S2 clipboard/file-read/web→auto · S3 file-write/open-app→confirm · S4 message-send/calendar/cron→confirm · S5 computer-use→confirm · S6 shell→deny · camera/screen-record artifacts |
| **3 · Intelligence & memory** | brain | per-session conversation memory · project/context awareness · proactive suggestions · better intent |
| **4 · Reach** | reach | Discord/WhatsApp parity (sendMessage-buttons/sendMedia/sendVoice/getFileBuffer per adapter) · multi-tenant gateway |
| **5 · Control & trust** | trust | richer audit · edition (solo/enterprise) gating · rate-limits · observability |

**North-star:** a controlled, polished, powerful, intelligent, multi-connector assistant — solo → world's-largest-enterprise.

---

## Decisions log (brainstorming)

1. First build slice = **full Pillar 1** (buttons + rich + previews + mail-attach + voice) — user chose maximum scope (no-MVP).
2. **Voice = local-first.** User has local TTS models (chatterbox / voxcpm2) + an Ollama/WSL setup. Local is better-aligned with every-environment/AS-7 + privacy (audio never leaves host) + zero cost. Adapter-based; OpenAI is an optional cloud adapter. STT = local whisper (faster-whisper recommended).
3. **Voice integration = local HTTP-endpoint + wrapper.** deckent's `LocalVoiceAdapter` POSTs to configurable URLs; a thin FastAPI **wrapper** (we author, tailored to the user's models) serves them behind deckent's STT/TTS contract. Decoupled (Node↔Python), model-agnostic, mirrors `ollama_host`.
4. **Mail attachments = artifact-ids only** (security: no arbitrary host-path attach).
5. **Reply-in-kind** voice default (voice-in → voice-out; text-in → text-out); configurable `off|always|reply-in-kind`.

---

## Section 1 — Architecture overview

The capability framework (registry / policy / single-chokepoint dispatcher / per-turn connector / audit) is the base. Pillar 1 adds:

- **A · Approval-send sink** — `CapabilityGate.sendApproval(id, capId, args)`: on a `confirm` decision, sends an out-of-band buttoned rich-preview via the per-turn connector and returns a short ack to the LLM; on resolve, edits the message.
- **B · Rich content** — capability replies/previews + the buttoned message flow through `markdownToTelegramHtml` (HTML).
- **C · Artifact store** — `CapabilityResult.artifacts`; a per-chat tmp-backed store; `send_mail.attachIds`; inbound-media → artifact.
- **D · VoiceAdapter** — local-first (HTTP-endpoint) + OpenAI; connector `getFileBuffer` (inbound audio/media) + `sendVoice`.

**Per-turn connector** (from Slice 1.1) widens from `{ id, sendMedia? }` to `{ id, sendMessage, sendMessageReturningId?, editMessage?, sendMedia?, sendVoice?, getFileBuffer? }` — it is the real `IMessageConnector`, surfaced to the chat-turn.

---

## Section 2 — Approval UX (buttons + rich + previews)

**Dispatcher (`bot-agentic.ts`)** — `decision === 'confirm'`:
```ts
const id = deps.park(name, args);
const sent = await deps.capabilities.sendApproval?.(id, name, args);   // out-of-band buttoned preview
return sent ? approvalRequestedAck(name, lang)                          // short tool_result to LLM
            : parkedActionMessage(id, name, args, lang);                // fallback: no-button connector → text
```

**`capGate.sendApproval` (chat-bridge)** — builds + sends via the per-turn connector:
- `cap.preview(args, lang)` → `markdownToTelegramHtml` → HTML body.
- `OutgoingMessage { parseMode:'HTML', buttons:[[approve, reject]] }` where buttons use `approvalCallbackData('approve'|'reject', id)` (`callback-router.ts:16`, format `action:id`).
- Send via `sendMessageReturningId` → capture the message id; store it on the parked action (`bot-action-store` gains `approvalMessageId?`).

**Approval message (mockup):**
```
🔐 Onay gerekli — çalıştırılmadı
📧 Mail gönderilecek
   Kime:  ahmet@firma.com
   Konu:  Test
   Gövde: merhaba, bu bir test…
   Ek:    screenshot.png
[ ✅ Onayla ]   [ ❌ Reddet ]
```
Button labels via `getMessage('cap.btn.approve'|'cap.btn.reject', lang)`.

**Button press → existing path (zero change):** `parseApprovalCallback` (`callback-router.ts:25`) → synthetic `approve <id>` → `IncomingCommandRouter` → composite resolver → `runCapability` (already capability-aware, `connector-bootstrap.ts`).

**Edit-on-resolve (god-level polish):** after the resolver runs, it edits the approval message (`editMessage(channelId, approvalMessageId, …)`) to remove the buttons and show the outcome — `✅ Onaylandı — <result>` / `❌ Reddedildi` — preventing double-taps and showing resolution.

**Rich preview format:** `cap.mail.preview` → multi-line, bold-labeled markdown (`*Kime:* … *Konu:* … *Gövde:* <≤200ch> … *Ek:* <filenames>`); generic capabilities get a default `{capId}({argsSummary})` preview.

**Rich content in replies:** capability text-acks/results already flow through `sendRich` (HTML); the buttoned message is HTML. The screenshot caption is rich.

---

## Section 3 — Mail attachments + capability artifacts

**`CapabilityResult.artifacts?: ArtifactRef[]`** where `ArtifactRef = { id: string; filename: string; mime: string; path: string }`.

**Artifact store (`src/connectors/capabilities/artifacts.ts`)** — per-`chatKey`, tmp-backed, TTL:
```ts
registerArtifact(chatKey: string, a: { filename: string; mime: string; data: Buffer }): ArtifactRef; // writes tmp file, returns ref
getArtifact(chatKey: string, id: string): ArtifactRef | null;                                        // scoped lookup
// TTL cleanup (e.g. 1h); per-chat isolation (chatA's id invisible to chatB)
```

**Producers:**
1. **Capability output:** `screenshot` returns `{ media:[…photo…], artifacts:[{id, 'screenshot.png', 'image/png', path}] }`. `runCapability` includes artifact ids in the LLM text-ack (`"screenshot captured (artifact: art_1, screenshot.png)"`) so the model can reference them.
2. **Inbound media:** a Telegram `message:photo`/`message:document` → connector `getFileBuffer(fileId)` → `registerArtifact(chatKey, …)` → the user-turn text fed to the LLM includes `"[attached: art_2, photo.jpg]"`.

**`send_mail` attachments:** args gain `attachIds?: string[]`. Each id → `getArtifact(chatKey, id)` → `path` → nodemailer `attachments: [{ filename, path }]`. Unknown id → honest error (not silent). The mail preview lists attachment filenames.

**🔒 Security:** attachments resolve **only** registered artifact-ids (capability-produced or user-uploaded in THIS chat) — never an arbitrary host path → mail cannot attach `/etc/passwd`. Per-chat isolation + TTL.

**Flows:**
- "ekran görüntüsü al ve bana mail at" → screenshot (auto) → art_1 + photo to chat → send_mail(to:me, attachIds:[art_1]) (confirm) → preview shows `Ek: screenshot.png` + buttons → approve → mail with PNG attached.
- "şu fotoğrafı patron@x.com'a at" (user sends photo) → art_2 → send_mail(attachIds:[art_2]) → approve → sent.

**New connector method:** `getFileBuffer?(fileId): Promise<{ data: Buffer; mime: string; filename?: string }>` (Telegram `getFile` + download; feature-detected). Shared with Section 4 (inbound voice).

---

## Section 4 — Voice (STT/TTS) — local-first

**`VoiceAdapter` (`src/connectors/voice/types.ts`):**
```ts
interface VoiceAdapter {
  transcribe(audio: Buffer, mime: string): Promise<string>;
  synthesize(text: string, opts?: { voice?: string }): Promise<{ data: Buffer; mime: string }>;
}
```

**`LocalVoiceAdapter` (`voice/local-voice.ts`)** — HTTP client to the wrapper (config URLs):
- `transcribe`: `POST {voice.local.stt_url}` with the audio bytes (Content-Type = `mime`) → `200 application/json { text }`.
- `synthesize`: `POST {voice.local.tts_url}` with `{ text, voice }` → `200 audio/<wav|ogg>` bytes.
- Endpoint unreachable → honest skip/error (no crash). Uses Node `fetch` (built-in) — no new dep.

**The wrapper (`voice-wrapper/server.py`, FastAPI — authored in this slice, tailored to the user's models):** loads chatterbox/voxcpm2 (TTS) + faster-whisper (STT) and exposes `/stt` + `/tts` per the contract. Run by the operator (like the local Ollama). Tailored using the user's `youtube-plan` model setup (path provided at build time).

**`OpenAIVoiceAdapter` (`voice/openai-voice.ts`)** — optional cloud: `openai` optionalDependency, dynamic-loaded (mirrors `loadGrammy`/`loadNodemailer`); Whisper + TTS; `$DECK:OPENAI_API_KEY`. Absent key/package → honest skip.

**Connector audio I/O (feature-detected):** `getFileBuffer` (Section 3, reused for inbound voice) + `sendVoice?(channelId, audio: { data, mime }): Promise<void>` (Telegram `sendVoice` + `InputFile`).

**Flows:**
- **Inbound:** `message:voice` → `getFileBuffer` → `voiceAdapter.transcribe` → text → **normal agentic turn** (as if typed).
- **Outbound (reply-in-kind default):** voice-in → strip markdown/HTML from reply → `voiceAdapter.synthesize` → `sendVoice`; text-in → text reply. `voice.tts: off|always|reply-in-kind`.

**🔒 Security:** voice is **transport, not a gated capability** — a voice "take a screenshot" still goes transcribe → agentic loop → screenshot capability → consent gate. Voice never weakens the security model. Local adapter keeps audio on-host (privacy/air-gapped); OpenAI adapter sends audio to OpenAI (opt-in).

**Config:**
```jsonc
"bot_capabilities": {
  "voice": {
    "enabled": true,
    "stt": true,
    "tts": "reply-in-kind",
    "provider": "local",                 // "local" | "openai"
    "local": { "stt_url": "http://127.0.0.1:8123/stt", "tts_url": "http://127.0.0.1:8123/tts", "tts_voice": "default" }
  }
}
```

---

## Section 5 — Testing + proof-of-function

**Unit (Tier-0, hermetic — inject connector/transport/spawn/openai/voice-http):**
- Approval UX: confirm-park → buttoned HTML message (`approve:<id>`/`reject:<id>`, preview body, msg-id captured); dispatcher returns short ack; no-sendMessage connector → text fallback. Edit-on-resolve: approve→`✅ Onaylandı`, reject→`❌ Reddedildi`.
- Preview: mail preview → multi-line `<b>` labels + `Ek:` when attachIds present.
- Artifact store: register/get/id-stable; **per-chatKey isolation**; TTL; unknown→null.
- screenshot artifact (media + artifacts; ack carries id); send_mail attachIds → nodemailer `attachments` (spy); unknown-id→honest error; **host-path rejected (security)**.
- Inbound-media→artifact (fake photo → getFileBuffer → register → turn text `[attached]`).
- Voice: fake voice-http → transcribe→text, synthesize→{data,mime}; endpoint/key absent→honest skip; inbound-voice→transcribe→responder; TTS reply-in-kind (voice-in→sendVoice spy; text-in→no sendVoice; tts:off→never).

**Proof-of-function (Tier-1, real-binary):**
- Mail-attachment: extend the local SMTP-sink smoke (Slice 1) to assert `Content-Disposition: attachment; filename=screenshot.png` + base64 body on the wire. (+ live: attached mail reaches the inbox.)
- Voice STT/TTS: a smoke that POSTs to a **real running wrapper** (or OpenAI when keyed) → asserts non-empty transcript / audio magic bytes; **skip-with-reason** when the endpoint/key is absent (CI-safe).
- Live e2e (god-level): Telegram voice "ekran görüntüsü al ve bana mail at" → transcribe → screenshot → attached mail → voice reply. Phone dogfood.

**Hermeticity:** tmpdir artifacts; async spawn; injected deps in unit tests; smokes skip when their dep/key/endpoint is absent; `test:ci-sim`. **Routing:** UX/connector → api-builder; voice/artifact → architect/bug-fixer; e2e/smoke → ci-guardian.

---

## Non-goals (this slice)

- Discord/WhatsApp button/voice/media (interface-ready; parity is Pillar 4).
- New capabilities beyond screenshot/mail (Pillar 2 — S2–S6).
- Conversation memory / proactivity (Pillar 3).
- Edition split, rate-limits, observability dashboard (Pillar 5).
- Local-voice **model installation** itself (the wrapper integrates the user's existing chatterbox/voxcpm2 + a local whisper; installing the models is operator setup).

## Open items (resolved in writing-plans / build)

- The `youtube-plan` model folder path + how chatterbox/voxcpm2 (and the chosen STT) are invoked — to tailor `voice-wrapper/server.py` exactly. (Requested at build time.)
- Final STT choice (faster-whisper recommended) if the user has no local STT yet.
- i18n keys (en/tr): `cap.btn.approve`, `cap.btn.reject`, approval header/ack/result, rich mail preview, voice skip/errors.
- `openai` optionalDependency entry (cloud adapter) + `loadOpenAI()` dynamic loader.
