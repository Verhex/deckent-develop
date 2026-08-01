# God-Level Bot — Pillar 1 (Interaction & UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the deckent messaging bot to god-level on Interaction & UX — button approvals, rich content, pretty previews, mail attachments (via capability artifacts), and voice (STT in / TTS out) — all on the existing single-chokepoint consent framework.

**Architecture:** Three new layers on the merged capability framework, none bypassing the gate: (A) an out-of-band buttoned rich-preview approval that edits on resolve; (B) a per-chat artifact store so a screenshot/inbound-photo can be attached to mail by reference (artifact-id-only); (C) a local-first VoiceAdapter (HTTP wrapper) + connector audio I/O, where voice is transport — transcribe → agentic loop → synthesize.

**Tech Stack:** TypeScript (ESM, Node ≥24), grammY, nodemailer (attachments), zod, vitest. Voice: local models behind a deckent HTTP contract (FastAPI wrapper: chatterbox/voxcpm2 + faster-whisper), OpenAI (`openai` optionalDependency) as cloud adapter. `markdownToTelegramHtml` for rich.

## Global Constraints

- **Single chokepoint:** approvals/artifacts/voice are UX/transport around the ONE gated dispatcher — they never bypass the consent policy. A voice "take a screenshot" → transcribe → agentic loop → screenshot capability → gate.
- **Backward-compatible + feature-detected:** every new connector method (`sendVoice`, `getFileBuffer`, the widened per-turn connector) and config (`voice`, `attachIds`) is optional; absent → byte-identical behavior (text fallback, no buttons, no voice).
- **Security — attachments:** mail attaches **registered artifact-ids only** (capability-produced or uploaded in THIS chat) — never an arbitrary host path. Artifacts per-`chatKey`, TTL.
- **Voice is transport, not a gated capability** — the capability gate still applies after transcription.
- **Secrets via `.deck`:** `$DECK:OPENAI_API_KEY` (cloud voice only); local voice needs no key.
- **i18n-first:** all user-facing strings via `getMessage` (en/tr) — button labels, previews, approval/result/voice text.
- **Hermetic tests:** inject connector/transport/spawn/openai/voice-http; tmpdir artifacts; async spawn (no spawnSync); no real network in unit tests; OpenAI/Gmail/local-voice smokes **skip-with-reason** when the dep/key/endpoint is absent; `test:ci-sim` before push.
- **Proof-of-function (Tier-1):** real-binary — real mail-with-attachment (SMTP-sink wire + live), real STT/TTS round-trip (skip when absent), live e2e (voice → screenshot → attached mail → voice reply).
- **ESM `.js` import extensions. Surgical. No-MVP.**

## File Structure

**New:**
- `src/connectors/capabilities/artifacts.ts` — per-chat artifact store.
- `src/connectors/voice/types.ts` — `VoiceAdapter`.
- `src/connectors/voice/local-voice.ts` — `LocalVoiceAdapter` (HTTP client).
- `src/connectors/voice/openai-voice.ts` — `OpenAIVoiceAdapter` (dynamic `openai`).
- `voice-wrapper/server.py` + `voice-wrapper/requirements.txt` — FastAPI sidecar (Python).

**Modified:** `src/connectors/types.ts` (connector `sendVoice?`/`getFileBuffer?`; `PerTurnConnector` widen) · `src/connectors/telegram.ts` (`sendVoice`/`getFileBuffer` + inbound photo/document/voice) · `src/connectors/capabilities/types.ts` (`ArtifactRef`, `CapabilityResult.artifacts`, `CapabilityContext.artifacts`) · `src/connectors/capabilities/execute.ts` (artifact ids in ack) · `src/connectors/capabilities/builtin/screenshot.ts` (produce artifact) · `src/connectors/capabilities/builtin/send-mail.ts` (`attachIds` + nodemailer attachments + rich preview) · `src/connectors/bot-agentic.ts` (`CapabilityGate.sendApproval?` + confirm branch + ack) · `src/connectors/chat-bridge.ts` (sendApproval impl + inbound-voice + reply-in-kind) · `src/connectors/connector-bootstrap.ts` (per-turn connector widen + edit-on-resolve + inbound-media/voice wiring + build artifact store/voice adapter) · `src/connectors/bot-action-store.ts` (`approvalMessageId?`) · `src/core/config-types.ts` (`bot_capabilities.voice`) · `src/cli/helpers/messages.ts` (i18n) · `package.json` (`openai` optionalDep).

---

# Phase A — Approval UX (buttons + rich + previews)

### Task 1: Widen per-turn connector + `approvalMessageId`

**Files:** Modify `src/connectors/types.ts`; Modify `src/connectors/bot-action-store.ts`; Test `tests/connectors/perturn-connector.test.ts`

**Interfaces — Produces:**
- `types.ts`: add to `IMessageConnector`: `sendVoice?(channelId: string, audio: { data: Buffer; mime: string }): Promise<void>` and `getFileBuffer?(fileId: string): Promise<{ data: Buffer; mime: string; filename?: string }>`. Export `PerTurnConnector` = the subset chat-turns use:
  ```ts
  export interface PerTurnConnector {
    readonly id: string;
    sendMessage(msg: OutgoingMessage): Promise<void>;
    sendMessageReturningId?(msg: OutgoingMessage): Promise<string | undefined>;
    editMessage?(channelId: string, messageId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void>;
    sendMedia?(channelId: string, media: MediaAttachment): Promise<void>;
    sendVoice?(channelId: string, audio: { data: Buffer; mime: string }): Promise<void>;
  }
  ```
- `bot-action-store.ts`: add `readonly approvalMessageId?: string` to `BotAction` and `approvalMessageId?: string` to `ParkBotActionInput`; persist + restore it.

- [ ] **Step 1: Failing test** — `tests/connectors/perturn-connector.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parkBotAction, takeBotAction } from '../../src/connectors/bot-action-store.js';

describe('bot-action approvalMessageId', () => {
  it('round-trips approvalMessageId through park/take', () => {
    const root = mkdtempSync(join(tmpdir(), 'park-'));
    const id = parkBotAction(root, { tool: 'send_mail', args: { to: 'a@x.com' }, channelId: 'c1', approvalMessageId: 'msg-42' });
    const got = takeBotAction(root, id);
    expect(got?.approvalMessageId).toBe('msg-42');
  });
});
```
- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/connectors/perturn-connector.test.ts` (Expected: `approvalMessageId` undefined / type error).
- [ ] **Step 3: Implement** — in `bot-action-store.ts` add the field to `BotAction` + `ParkBotActionInput`, include it in the written JSON object (`{ ...existing, ...(input.approvalMessageId ? { approvalMessageId: input.approvalMessageId } : {}) }`) and it round-trips automatically (the store reads the whole JSON). In `types.ts` add the two optional connector methods + `PerTurnConnector` interface + ensure `MediaAttachment` is imported.
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` EXIT=0.
- [ ] **Step 5: Commit** — `git commit -m "feat(bot): per-turn connector widening + bot-action approvalMessageId (p1.a t1)"`

### Task 2: `CapabilityGate.sendApproval` + dispatcher confirm branch

**Files:** Modify `src/connectors/bot-agentic.ts`; Modify `src/cli/helpers/messages.ts`; Test `tests/connectors/bot-agentic-sendapproval.test.ts`

**Interfaces:**
- Consumes: existing `CapabilityGate { has, resolve, runAuto }`, `parkedActionMessage`.
- Produces: extend `CapabilityGate` with `sendApproval?(id: string, capId: string, args: Record<string, unknown>): Promise<boolean>` (returns true if a buttoned message was sent). New `approvalRequestedAck(capId: string, lang: string): string`. i18n keys `cap.approval.ack`, `cap.btn.approve`, `cap.btn.reject`.

- [ ] **Step 1: Failing test** — `tests/connectors/bot-agentic-sendapproval.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest';
import { makeGatedDispatcher, type CapabilityGate } from '../../src/connectors/bot-agentic.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

const inner: McpToolDispatcher = { dispatch: vi.fn(async () => 'INNER') };
function gate(over: Partial<CapabilityGate>): CapabilityGate {
  return { has: (id) => id === 'send_mail', resolve: () => 'confirm', runAuto: vi.fn(), ...over };
}

describe('makeGatedDispatcher — sendApproval', () => {
  it('confirm: parks, calls sendApproval, returns short ack (not the type-approve text)', async () => {
    const sendApproval = vi.fn(async () => true);
    const park = vi.fn(() => 'act-1');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate({ sendApproval }) });
    const out = await d.dispatch('send_mail', { to: 'a@x.com' });
    expect(park).toHaveBeenCalledWith('send_mail', { to: 'a@x.com' });
    expect(sendApproval).toHaveBeenCalledWith('act-1', 'send_mail', { to: 'a@x.com' });
    expect(out).not.toMatch(/approve act-1/i);        // no "type approve <id>"
    expect(out).toMatch(/onay|approval/i);
  });
  it('confirm fallback: no sendApproval (or returns false) → legacy parked text', async () => {
    const park = vi.fn(() => 'act-2');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate({ sendApproval: undefined }) });
    expect(await d.dispatch('send_mail', {})).toMatch(/approve act-2/i);
  });
});
```
- [ ] **Step 2: Run → FAIL** (`sendApproval` not on the type; confirm branch returns parked text).
- [ ] **Step 3: Implement** — in `bot-agentic.ts`:
```ts
export interface CapabilityGate {
  has(id: string): boolean;
  resolve(id: string): PolicyResolution;
  runAuto(id: string, args: Record<string, unknown>): Promise<string>;
  sendApproval?(id: string, capId: string, args: Record<string, unknown>): Promise<boolean>;
}
function approvalRequestedAck(capId: string, lang: string): string {
  return getMessage('cap.approval.ack', lang, { cap: capId });
}
// In the confirm branch:
if (decision === 'confirm') {
  const id = deps.park(name, args);
  const sent = deps.capabilities.sendApproval ? await deps.capabilities.sendApproval(id, name, args).catch(() => false) : false;
  return sent ? approvalRequestedAck(name, lang) : parkedActionMessage(id, name, args, lang);
}
```
Add i18n (`messages.ts`): `cap.approval.ack` (en `Approval requested for {cap}; awaiting the user's decision.` / tr `{cap} için onay istendi; kullanıcının kararı bekleniyor.`), `cap.btn.approve` (en `✅ Approve` / tr `✅ Onayla`), `cap.btn.reject` (en `❌ Reject` / tr `❌ Reddet`).
- [ ] **Step 4: Run → PASS** + tsc EXIT=0 + `npx vitest run tests/connectors/bot-agentic.test.ts tests/connectors/bot-agentic-capabilities.test.ts` (no regression).
- [ ] **Step 5: Commit** — `git commit -m "feat(bot): CapabilityGate.sendApproval + dispatcher confirm-branch + ack (p1.a t2)"`

### Task 3: chat-bridge `sendApproval` impl (buttoned rich preview)

**Files:** Modify `src/connectors/chat-bridge.ts`; Test `tests/connectors/chat-bridge-approval.test.ts`

**Interfaces:**
- Consumes: `CapabilityGate.sendApproval` (T2), `PerTurnConnector` (T1), `approvalCallbackData` (`callback-router.ts:16`), `markdownToTelegramHtml`, `cap.preview`, `cap.btn.*` i18n.
- Produces: the capGate built in `runTurn` gains `sendApproval` using the per-turn connector; returns true iff the connector has `sendMessage`.

- [ ] **Step 1: Failing test** — `tests/connectors/chat-bridge-approval.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { makeChatResponder } from '../../src/connectors/chat-bridge.js';
import { CapabilityRegistry } from '../../src/connectors/capabilities/registry.js';
import type { Capability } from '../../src/connectors/capabilities/types.js';

// A confirm-tier capability with a known preview.
const mailish: Capability = {
  id: 'send_mail', titleKey: 't', tier: 'external', defaultPolicy: 'confirm', edition: 'solo',
  paramsSchema: z.object({ to: z.string() }), preview: (a: any) => `*To:* ${a.to}`, run: async () => ({ text: 'sent' }),
};

it('sendApproval sends a buttoned HTML preview via the per-turn connector', async () => {
  const sent: any[] = [];
  const connector = { id: 'telegram', sendMessage: vi.fn(async (m: any) => { sent.push(m); }),
    sendMessageReturningId: vi.fn(async (m: any) => { sent.push(m); return 'mid-9'; }) };
  // drive sendApproval directly through the responder's exposed gate test-seam:
  const responder = makeChatResponder({ agentic: true, root: process.cwd(), capConfig: { enabled: true },
    capRegistryOverride: (() => { const r = new CapabilityRegistry(); r.register(mailish); return r; })() } as any);
  // The responder exposes _testSendApproval(connector, capId, args, id) for this unit (see impl note).
  const ok = await (responder as any)._testSendApproval(connector, 'send_mail', { to: 'a@x.com' }, 'act-7');
  expect(ok).toBe(true);
  const msg = sent[0];
  expect(msg.parseMode).toBe('HTML');
  expect(msg.text).toContain('a@x.com');
  expect(msg.buttons[0][0].callbackData).toBe('approve:act-7');
  expect(msg.buttons[0][1].callbackData).toBe('reject:act-7');
});
```
> IMPL NOTE: expose a small test seam `_testSendApproval` on the responder (or factor `buildSendApproval(connector, registry, lang)` into a named exported helper `makeSendApproval` in chat-bridge and unit-test THAT directly — preferred; rewrite the test to import `makeSendApproval`). Use the cleaner factored helper.

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — add an exported helper in `chat-bridge.ts`:
```ts
import { approvalCallbackData } from './callback-router.js';
import { markdownToTelegramHtml } from './markdown-to-html.js';
import { getMessage } from '../cli/helpers/messages.js';
import type { PerTurnConnector } from './types.js';
import type { CapabilityRegistry } from './capabilities/registry.js';

export function makeSendApproval(connector: PerTurnConnector, registry: CapabilityRegistry, lang: string):
  (id: string, capId: string, args: Record<string, unknown>) => Promise<boolean> {
  return async (id, capId, args) => {
    if (typeof connector.sendMessage !== 'function') return false;
    const cap = registry.get(capId);
    const previewMd = cap ? cap.preview(args as never, lang) : `${capId}(${JSON.stringify(args)})`;
    const header = getMessage('cap.approval.header', lang);
    const html = markdownToTelegramHtml(`🔐 ${header}\n${previewMd}`);
    const buttons = [[
      { text: getMessage('cap.btn.approve', lang), callbackData: approvalCallbackData('approve', id) },
      { text: getMessage('cap.btn.reject', lang), callbackData: approvalCallbackData('reject', id) },
    ]];
    const msg = { connector: connector.id, channelId: id /* replaced below */, text: html, parseMode: 'HTML' as const, buttons };
    // channelId must be the chat, not the action id — see wiring note.
    return true; // placeholder removed in wiring
  };
}
```
> WIRING: `makeSendApproval` needs the channelId. Bind it in `runTurn` where `sessionId` (the channelId) and the per-turn connector are in scope: `const sendApproval = makeSendApproval(perTurnConnector, capRegistry, lang); capGate.sendApproval = (id, capId, args) => sendApproval(sessionId, id, capId, args)`. Adjust `makeSendApproval` signature to `(connector, registry, lang) => (channelId, id, capId, args) => Promise<boolean>` and send `sendMessageReturningId ?? sendMessage`, capturing the returned message id to store on the parked action (Task 4 reads it; here just send). Add i18n `cap.approval.header` (en `Approval required — not executed` / tr `Onay gerekli — çalıştırılmadı`).

- [ ] **Step 4: Run → PASS** + tsc + full connector suite green.
- [ ] **Step 5: Commit** — `git commit -m "feat(bot): out-of-band buttoned rich approval preview (p1.a t3)"`

### Task 4: Store approvalMessageId + edit-on-resolve + rich mail preview

**Files:** Modify `src/connectors/chat-bridge.ts` (capture msg id into park), Modify `src/connectors/connector-bootstrap.ts` (resolver edits the approval message), Modify `src/connectors/capabilities/builtin/send-mail.ts` + `src/cli/helpers/messages.ts` (rich preview); Test `tests/connectors/approval-resolve.test.ts`, `tests/connectors/capabilities/send-mail.test.ts` (extend)

**Interfaces:**
- Consumes: `approvalMessageId` (T1), the resolver (`connector-bootstrap.ts:204`).
- Produces: on approve/reject the resolver calls `connector.editMessage(channelId, approvalMessageId, outcomeHtml, 'HTML')` (feature-detected). `cap.mail.preview` → multi-line bold.

- [ ] **Step 1: Failing tests** —
```ts
// tests/connectors/approval-resolve.test.ts — assert editMessage called with outcome after approve/reject
// tests/connectors/capabilities/send-mail.test.ts — assert preview is multi-line with bold To/Subject/Body + 'Ek' when attachIds
import { describe, it, expect } from 'vitest';
import { sendMailCapability } from '../../../src/connectors/capabilities/builtin/send-mail.js';
it('mail preview is rich multi-line', () => {
  const p = sendMailCapability.preview({ to: 'a@x.com', subject: 'Hi', body: 'Hello world' } as any, 'tr');
  expect(p).toMatch(/\*Kime:\*/); expect(p).toMatch(/\*Konu:\*/); expect(p).toMatch(/Hi/);
});
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** —
  - `messages.ts` `cap.mail.preview`: en `📧 *Send email*\n*To:* {to}\n*Subject:* {subject}\n*Body:* {body}` / tr `📧 *Mail gönderilecek*\n*Kime:* {to}\n*Konu:* {subject}\n*Gövde:* {body}`. (`send-mail.ts` already passes `to/subject/body`; widen body slice to 200.) When the parked args carry `attachIds`, append `\n*Ek:* {files}` — done in the preview by reading resolved filenames (Task 7 wires filenames; here support the `{files}` slot with a separate key `cap.mail.preview_attach`).
  - chat-bridge `makeSendApproval`: capture `const mid = await connector.sendMessageReturningId?.(msg)` and return it so `runTurn` stores it: `deps.park` already ran in the dispatcher (Task 2) — so instead pass the message id back via a callback. Simplest: `park` is called in the dispatcher BEFORE `sendApproval`; change the dispatcher to call `sendApproval` first to GET the message id, then `park({..., approvalMessageId: mid})`. Re-order Task 2's confirm branch: `const mid = await sendApproval?.(...); const id = deps.park(name, args, mid);` — but `park` signature is `(tool,args)`. Extend the gate: have `sendApproval(id, ...)` receive the id, so keep park-first and STORE the mid by calling `deps.setApprovalMessageId?.(id, mid)`. Add optional `setApprovalMessageId(id, mid)` to GatedDispatcherDeps; chat-bridge implements it via the action store (re-read + rewrite the parked file with approvalMessageId). Keep it minimal: a `bot-action-store` helper `attachApprovalMessageId(root, id, mid)`.
  - `connector-bootstrap.ts` resolver: after running (`runCapability`) or on reject, if `parked.approvalMessageId` and `connector.editMessage`, edit it: `await connector.editMessage(parked.channelId, parked.approvalMessageId, markdownToTelegramHtml(outcome), 'HTML')` where outcome = `✅ {result}` / `❌ {rejected}` via `cap.approval.approved`/`cap.approval.rejected` i18n.
- [ ] **Step 4: Run → PASS** + tsc + full connector suite green.
- [ ] **Step 5: Commit** — `git commit -m "feat(bot): edit approval message on resolve + rich mail preview (p1.a t4)"`

---

# Phase B — Capability artifacts + mail attachments

### Task 5: Artifact store + types

**Files:** Create `src/connectors/capabilities/artifacts.ts`; Modify `src/connectors/capabilities/types.ts`; Test `tests/connectors/capabilities/artifacts.test.ts`

**Interfaces — Produces:**
```ts
// types.ts additions
export interface ArtifactRef { readonly id: string; readonly filename: string; readonly mime: string; readonly path: string }
// CapabilityResult gains:  readonly artifacts?: readonly ArtifactRef[];
// CapabilityContext gains:  readonly artifacts?: ArtifactStore;   (optional — injected when available)
// artifacts.ts
export interface ArtifactStore {
  register(chatKey: string, a: { filename: string; mime: string; data: Buffer }): ArtifactRef;
  get(chatKey: string, id: string): ArtifactRef | null;
}
export function createArtifactStore(root: string, opts?: { ttlMs?: number; now?: () => number }): ArtifactStore;
```
Per-`chatKey` directory under `<root>/.deckent/artifacts/<chatKey>/`; id = `art_<8hex>`; TTL prune on access (default 1h). `get` returns null if absent/expired or chatKey mismatch.

- [ ] **Step 1: Failing test** —
```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactStore } from '../../../src/connectors/capabilities/artifacts.js';

describe('artifact store', () => {
  it('registers + retrieves per chatKey; isolates chats; rejects unknown', () => {
    const root = mkdtempSync(join(tmpdir(), 'art-'));
    const store = createArtifactStore(root);
    const ref = store.register('chatA', { filename: 's.png', mime: 'image/png', data: Buffer.from([1, 2]) });
    expect(ref.id).toMatch(/^art_/);
    expect(existsSync(ref.path)).toBe(true);
    expect(store.get('chatA', ref.id)?.filename).toBe('s.png');
    expect(store.get('chatB', ref.id)).toBeNull();   // isolation
    expect(store.get('chatA', 'art_ghost')).toBeNull();
  });
});
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement `artifacts.ts`** (async-safe sync fs is OK here for register/get; tmp files):
```ts
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ArtifactRef } from './types.js';
export interface ArtifactStore { register(chatKey: string, a: { filename: string; mime: string; data: Buffer }): ArtifactRef; get(chatKey: string, id: string): ArtifactRef | null; }
const META = '.meta.json';
export function createArtifactStore(root: string, opts: { ttlMs?: number; now?: () => number } = {}): ArtifactStore {
  const ttl = opts.ttlMs ?? 3_600_000; const now = opts.now ?? (() => Date.now());
  const dir = (chatKey: string) => join(root, '.deckent', 'artifacts', encodeURIComponent(chatKey));
  const prune = (chatKey: string) => { const d = dir(chatKey); if (!existsSync(d)) return; for (const f of readdirSync(d)) { const p = join(d, f); try { if (now() - statSync(p).mtimeMs > ttl) rmSync(p, { force: true }); } catch { /* ignore */ } } };
  return {
    register(chatKey, a) {
      const d = dir(chatKey); mkdirSync(d, { recursive: true });
      const id = `art_${randomBytes(4).toString('hex')}`;
      const path = join(d, `${id}__${a.filename.replace(/[^\w.\-]/g, '_')}`);
      writeFileSync(path, a.data);
      return { id, filename: a.filename, mime: a.mime, path };
    },
    get(chatKey, id) {
      prune(chatKey); const d = dir(chatKey); if (!existsSync(d)) return null;
      const f = readdirSync(d).find((n) => n.startsWith(`${id}__`)); if (!f) return null;
      const path = join(d, f); const filename = f.slice(f.indexOf('__') + 2);
      return { id, filename, mime: 'application/octet-stream', path };
    },
  };
}
```
Add `ArtifactRef`, `CapabilityResult.artifacts?`, `CapabilityContext.artifacts?: ArtifactStore` to `types.ts`.
- [ ] **Step 4: Run → PASS** + tsc.
- [ ] **Step 5: Commit** — `git commit -m "feat(capabilities): per-chat artifact store + types (p1.b t5)"`

### Task 6: Screenshot produces an artifact + ack carries the id

**Files:** Modify `src/connectors/capabilities/builtin/screenshot.ts`, `src/connectors/capabilities/execute.ts`; Test extend `tests/connectors/capabilities/screenshot.test.ts`, `tests/connectors/capabilities/execute.test.ts`

**Interfaces:** Consumes `ArtifactStore` (T5). screenshot result gains `artifacts:[ref]` when `ctx.artifacts` present; `runCapability` appends `(artifact: <id>, <filename>)` to the returned text-ack when `result.artifacts` non-empty.

- [ ] **Step 1: Failing tests** — screenshot with an injected `ctx.artifacts` (fake store) returns `artifacts:[{id}]`; `runCapability` text-ack includes the id.
```ts
// execute.test.ts addition
it('text-ack includes artifact ids', async () => {
  const r = new CapabilityRegistry();
  r.register({ ...mediaCap, run: async () => ({ text: 'captured', artifacts: [{ id: 'art_1', filename: 's.png', mime: 'image/png', path: '/tmp/x' }] }) });
  const out = await runCapability(r, 'shot', {}, baseCtx(root), 'c', async () => {}, 'auto');
  expect(out).toMatch(/art_1/); expect(out).toMatch(/s\.png/);
});
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** —
  - `screenshot.ts`: after reading the PNG buffer, if `ctx.artifacts` present: `const ref = ctx.artifacts.register(ctx.chatKey, { filename: `screenshot-${ctx.now}.png`, mime: 'image/png', data });` and return `{ media:[...], artifacts:[ref] }`.
  - `execute.ts` `runCapability`: after `const result = await cap.run(...)`, build the ack: `let ack = result.text ?? `[${capId}] done`; if (result.artifacts?.length) ack += ' ' + result.artifacts.map(a => `(artifact: ${a.id}, ${a.filename})`).join(' '); return ack;` (media sink unchanged).
- [ ] **Step 4: Run → PASS** + tsc + screenshot smoke still green.
- [ ] **Step 5: Commit** — `git commit -m "feat(capabilities): screenshot artifact + ack carries artifact id (p1.b t6)"`

### Task 7: `send_mail` attachments (artifact-id-only)

**Files:** Modify `src/connectors/capabilities/builtin/send-mail.ts`, `src/cli/helpers/messages.ts`; Test extend `tests/connectors/capabilities/send-mail.test.ts`

**Interfaces:** Consumes `ArtifactStore` (T5). `Params` gains `attachIds?: string[]`. run resolves each id via `ctx.artifacts.get(ctx.chatKey, id)` → `path` → nodemailer `attachments:[{filename, path}]`; unknown id → honest error; preview lists attachment filenames.

- [ ] **Step 1: Failing test** —
```ts
it('attaches artifacts by id; unknown id → honest error, no send', async () => {
  const sendMail = vi.fn(async () => ({ messageId: 'm1' }));
  const store = { get: (_c: string, id: string) => id === 'art_1' ? { id, filename: 's.png', mime: 'image/png', path: '/tmp/s.png' } : null };
  const okCtx = ctx({ config: { enabled: true, mail: { smtp: { host: 'h' } } }, artifacts: store as any,
    loadMailTransport: async () => ({ sendMail } as any) });
  await sendMailCapability.run({ to: 'a@corp.com', subject: 'S', body: 'B', attachIds: ['art_1'] }, okCtx);
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ attachments: [{ filename: 's.png', path: '/tmp/s.png' }] }));
  const bad = await sendMailCapability.run({ to: 'a@corp.com', subject: 'S', body: 'B', attachIds: ['art_ghost'] }, okCtx);
  expect(bad.text).toMatch(/attachment|ek/i);
  expect(sendMail).toHaveBeenCalledTimes(1); // not called again for the bad one
});
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — extend `Params` with `attachIds: z.array(z.string()).optional()`. In run, before sending: resolve attachments —
```ts
const attachments: { filename: string; path: string }[] = [];
for (const aid of args.attachIds ?? []) {
  const ref = ctx.artifacts?.get(ctx.chatKey, aid);
  if (!ref) return { text: getMessage('cap.mail.attach_unknown', ctx.lang, { id: aid }) };
  attachments.push({ filename: ref.filename, path: ref.path });
}
// pass `...(attachments.length ? { attachments } : {})` into transport.sendMail
```
`MailMessage` type (types.ts) gains optional `attachments?: { filename: string; path: string }[]`. Preview: if `attachIds`, append `cap.mail.preview_attach` with the ids/filenames (resolve filenames best-effort via ctx.artifacts if available, else show ids). Add i18n `cap.mail.attach_unknown` (en `Attachment not found: {id}` / tr `Ek bulunamadı: {id}`) + `cap.mail.preview_attach` (en `*Attachment:* {files}` / tr `*Ek:* {files}`).
- [ ] **Step 4: Run → PASS** + tsc + the SMTP-sink smoke (extend it to assert `Content-Disposition: attachment` when an attachment is set — add a fixture file).
- [ ] **Step 5: Commit** — `git commit -m "feat(capabilities): send_mail artifact attachments (id-only, anti-exfil) + attach proof (p1.b t7)"`

### Task 8: Connector `getFileBuffer` + inbound media → artifact

**Files:** Modify `src/connectors/telegram.ts`, `src/connectors/connector-bootstrap.ts`; Test `tests/connectors/telegram-getfile.test.ts`, `tests/connectors/inbound-media.test.ts`

**Interfaces:** Produces `TelegramConnector.getFileBuffer(fileId)` (grammY `bot.api.getFile` → download URL → fetch → Buffer). Inbound `message:photo`/`message:document` → emit an `IncomingMessage` whose `raw` carries the fileId + filename; bootstrap registers it as an artifact for `chatKey` and prepends `[attached: <id>, <filename>]` to the text fed to the responder.

- [ ] **Step 1: Failing tests** — fake grammY Bot with `api.getFile` + a fetch stub → `getFileBuffer` returns the bytes; an inbound photo message → the responder receives text containing `[attached:`.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** —
  - `telegram.ts` `getFileBuffer`: `const f = await this.bot.api.getFile(fileId); const url = `https://api.telegram.org/file/bot${token}/${f.file_path}`; const res = await fetch(url); return { data: Buffer.from(await res.arrayBuffer()), mime: <from ext>, filename: <basename> };` (store the token from start config). Add grammY `getFile` to `GrammyBotInstance.api` type.
  - inbound: add `this.bot.on('message:photo', …)` + `message:document` → `emitMessage` with `text: ''` and `raw: { media: { fileId, filename, mime } }` (photo: largest size's file_id, filename `photo.jpg`).
  - `connector-bootstrap.ts` onMessage/onChat: if the incoming message `raw.media`, `getFileBuffer(fileId)` → `artifactStore.register(channelId, {...})` → ref; prepend `getMessage('cap.inbound.attached', lang, { id: ref.id, filename: ref.filename })` to the text before passing to the responder.
- [ ] **Step 4: Run → PASS** + tsc + existing telegram suite green.
- [ ] **Step 5: Commit** — `git commit -m "feat(connectors): getFileBuffer + inbound media → artifact (p1.b t8)"`

---

# Phase C — Voice (STT in / TTS out)

### Task 9: VoiceAdapter + config + adapters (local + OpenAI)

**Files:** Create `src/connectors/voice/types.ts`, `src/connectors/voice/local-voice.ts`, `src/connectors/voice/openai-voice.ts`; Modify `src/core/config-types.ts`, `package.json`; Test `tests/connectors/voice/local-voice.test.ts`, `tests/connectors/voice/openai-voice.test.ts`

**Interfaces — Produces:**
```ts
// voice/types.ts
export interface VoiceAdapter { transcribe(audio: Buffer, mime: string): Promise<string>; synthesize(text: string, opts?: { voice?: string }): Promise<{ data: Buffer; mime: string }>; }
export interface VoiceConfig { enabled?: boolean; stt?: boolean; tts?: 'off' | 'always' | 'reply-in-kind'; provider?: 'local' | 'openai'; local?: { stt_url?: string; tts_url?: string; tts_voice?: string } }
export function createVoiceAdapter(cfg: VoiceConfig, deck: Record<string,string>): VoiceAdapter | null;  // null when disabled/misconfigured
```
`config-types.ts`: `BotCapabilitiesConfig.voice?: VoiceConfig`. `package.json`: add `openai` to `optionalDependencies`.

- [ ] **Step 1: Failing tests** —
  - `local-voice.test.ts`: stub global `fetch` → `transcribe` POSTs audio to `stt_url`, returns `{text}` from JSON; `synthesize` POSTs `{text}` to `tts_url`, returns the audio bytes + content-type. Endpoint error → throws (caller skips).
  - `openai-voice.test.ts`: inject a fake openai client → transcribe/synthesize call the right methods; missing key → `createVoiceAdapter` returns null (or throws honest).
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** —
  - `local-voice.ts`:
```ts
import type { VoiceAdapter, VoiceConfig } from './types.js';
export function makeLocalVoiceAdapter(local: NonNullable<VoiceConfig['local']>): VoiceAdapter {
  return {
    async transcribe(audio, mime) {
      const res = await fetch(local.stt_url!, { method: 'POST', headers: { 'content-type': mime }, body: audio });
      if (!res.ok) throw new Error(`stt ${res.status}`);
      return ((await res.json()) as { text: string }).text;
    },
    async synthesize(text, opts) {
      const res = await fetch(local.tts_url!, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voice: opts?.voice ?? local.tts_voice }) });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      return { data: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') ?? 'audio/wav' };
    },
  };
}
```
  - `openai-voice.ts`: dynamic `loadOpenAI()` (Function-indirection like loadGrammy); `transcribe` → `openai.audio.transcriptions.create`; `synthesize` → `openai.audio.speech.create`. Returns null factory when key absent.
  - `voice/types.ts` `createVoiceAdapter(cfg, deck)`: if `!cfg.enabled` → null; provider 'local' → `makeLocalVoiceAdapter(cfg.local)` (require urls else null); 'openai' → openai adapter if `deck.OPENAI_API_KEY` else null.
- [ ] **Step 4: Run → PASS** + tsc.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): VoiceAdapter + local/openai adapters + config (p1.c t9)"`

### Task 10: Connector `sendVoice` + inbound voice handler

**Files:** Modify `src/connectors/telegram.ts`; Test extend `tests/connectors/telegram-sendmedia.test.ts` (add voice)

**Interfaces:** Produces `TelegramConnector.sendVoice(channelId, {data,mime})` (grammY `sendVoice` + `InputFile`); inbound `message:voice` → `emitMessage` with `raw: { voice: { fileId, mime } }`.

- [ ] **Step 1: Failing test** — fake Bot → `sendVoice` calls `api.sendVoice(channelId, InputFile(buffer))`; an inbound voice message → emitted with `raw.voice.fileId`.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — add `sendVoice` (mirror `sendMedia`: `new InputFileCtor(data)` → `api.sendVoice(channelId, file)`), add `api.sendVoice` to the grammY surface type, add `this.bot.on('message:voice', ctx => emitMessage({..., text:'', raw:{ voice:{ fileId: ctx.message.voice.file_id, mime: ctx.message.voice.mime_type ?? 'audio/ogg' } }}))`.
- [ ] **Step 4: Run → PASS** + tsc + telegram suite green.
- [ ] **Step 5: Commit** — `git commit -m "feat(connectors): sendVoice + inbound voice (p1.c t10)"`

### Task 11: Voice wiring — inbound STT → turn, reply-in-kind TTS

**Files:** Modify `src/connectors/connector-bootstrap.ts`, `src/connectors/chat-bridge.ts`; Test `tests/connectors/voice-wire.test.ts`

**Interfaces:** Consumes VoiceAdapter (T9), connector `getFileBuffer`/`sendVoice` (T8/T10). Inbound voice → `getFileBuffer` → `transcribe` → feed text to responder (mark the turn as voice-origin). Reply: if `tts==='always'` OR (`reply-in-kind` AND voice-origin) → strip markdown → `synthesize` → `sendVoice`.

- [ ] **Step 1: Failing test** — fake connector inbound voice + fake VoiceAdapter (transcribe→"take a screenshot", synthesize→buffer) → responder receives the transcribed text; reply-in-kind → `sendVoice` spy called; text-origin turn → no `sendVoice`.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — in `connector-bootstrap.ts` onMessage: if `raw.voice` and a voiceAdapter exists + `cfg.voice.stt`: `const { data, mime } = await connector.getFileBuffer(raw.voice.fileId); const text = await voice.transcribe(data, mime);` then route as a chat turn with `voiceOrigin=true`. After the responder returns the reply text, if TTS should fire (mode + origin), `const audio = await voice.synthesize(stripFormatting(reply), { voice }); await connector.sendVoice?.(channelId, audio);` (in addition to / instead of the text reply per mode — for `reply-in-kind`, send voice and SKIP the text send; for `always`, send voice; errors → fall back to text, honest). `stripFormatting` removes markdown/HTML.
- [ ] **Step 4: Run → PASS** + tsc + full connector suite + `npm run test:ci-sim`.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): inbound STT → agentic turn + reply-in-kind TTS (p1.c t11)"`

### Task 12: Voice wrapper (FastAPI sidecar)

**Files:** Create `voice-wrapper/server.py`, `voice-wrapper/requirements.txt`, `voice-wrapper/README.md`

**Interfaces:** Implements the deckent contract: `POST /stt` (audio bytes → `{text}`) and `POST /tts` (`{text,voice}` → audio bytes). Serves chatterbox/voxcpm2 (TTS) + faster-whisper (STT). **Tailored to the user's `youtube-plan` model setup — read it first.**

- [ ] **Step 1: Read the user's model setup** — inspect the `youtube-plan` folder (path provided by Alperen) to learn how chatterbox/voxcpm2 load (import path, model files, sample-rate, GPU/CPU). Note them in the README.
- [ ] **Step 2: Write `requirements.txt`** — `fastapi`, `uvicorn`, `faster-whisper`, plus the TTS model's deps (chatterbox/voxcpm2 per their repos).
- [ ] **Step 3: Write `server.py`** — FastAPI app:
```python
# /stt: accept raw audio body → faster-whisper transcribe → {"text": ...}
# /tts: accept {"text","voice"} → chatterbox/voxcpm2 synthesize → Response(audio_bytes, media_type="audio/wav")
# load models once at startup; /health → 200
```
(Complete the model-loading per Step 1's findings — do NOT leave it generic.)
- [ ] **Step 4: Run it + smoke** — start `uvicorn voice-wrapper.server:app --port 8123`; `curl -X POST :8123/tts -d '{"text":"merhaba"}' -H 'content-type: application/json' --output /tmp/t.wav` → assert a non-empty WAV; `curl -X POST :8123/stt --data-binary @/tmp/t.wav -H 'content-type: audio/wav'` → assert JSON `{text}` non-empty. Record the real outputs.
- [ ] **Step 5: Commit** — `git commit -m "feat(voice): FastAPI wrapper serving chatterbox/voxcpm2 + faster-whisper (p1.c t12)"`

---

### Task 13: Bootstrap construction + e2e + ci-sim

**Files:** Modify `src/connectors/connector-bootstrap.ts` (construct artifactStore + voiceAdapter once, thread into the per-turn context/gate), `src/connectors/chat-bridge.ts` (accept `artifacts`/`voice` deps); Test `tests/connectors/capabilities/pillar1-e2e.test.ts`

**Interfaces:** Wire it all: `connector-bootstrap` builds `const artifactStore = createArtifactStore(root)` and `const voice = createVoiceAdapter(cfg.bot_capabilities?.voice ?? {}, deckSecrets)`, threads `artifacts: artifactStore` into the capability context and `voice` into the inbound/reply path; threads the per-turn connector (full `IMessageConnector`) into chat-bridge so `sendApproval`/media/voice use it.

- [ ] **Step 1: Failing e2e test** — a hermetic integration: fake connector + injected provider that emits `screenshot` then `send_mail({attachIds:[<art from screenshot>]})`; assert the screenshot artifact is attached to the mail (fake transport spy sees `attachments`), and the confirm shows a buttoned preview. (Drive through `makeChatResponder` with fakes.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement the bootstrap wiring** per Interfaces (construct once, thread through; default-off when config absent).
- [ ] **Step 4: Run → PASS** + `npx tsc --noEmit` + full connector suite + `npm run test:ci-sim`.
- [ ] **Step 5: Commit** — `git commit -m "feat(bot): pillar-1 bootstrap wiring + e2e (artifact→mail attach, buttoned approval) (p1 t13)"`

---

## Manual proof-of-function (dogfood, after merge + build + restart)

1. `.deckent/config.json`: `bot_capabilities.voice = { enabled:true, stt:true, tts:'reply-in-kind', provider:'local', local:{ stt_url, tts_url } }`; run `voice-wrapper`.
2. Telegram: tap-approve a mail (buttons). "ekran görüntüsü al ve bana mail at" → mail with the PNG attached. Send a photo + "bunu X'e at" → attached. Send a voice "ekran görüntüsü al" → bot acts + replies by voice.

## Plan Self-Review

**Spec coverage:** Section 2 (approval UX) → T1–T4; Section 3 (artifacts/mail-attach) → T5–T8; Section 4 (voice) → T9–T12; bootstrap+e2e → T13. ✅
**Placeholder scan:** the chat-bridge `makeSendApproval` Step-3 contains a `return true; // placeholder` — the WIRING note replaces it; the implementer must complete the channelId-bound send (flagged explicitly, not silent). The voice wrapper Step-3 model-loading is intentionally tailored from Step-1's read (not generic). No other placeholders.
**Type consistency:** `ArtifactRef`/`ArtifactStore`/`CapabilityResult.artifacts`/`CapabilityContext.artifacts` consistent T5→T6→T7→T13; `VoiceAdapter`/`VoiceConfig`/`createVoiceAdapter` consistent T9→T11→T13; `CapabilityGate.sendApproval`/`approvalMessageId`/`PerTurnConnector` consistent T1→T2→T3→T4. `attachIds` consistent T7/T13. ✅
