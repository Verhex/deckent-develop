# Bot Capability Framework — Design Spec

> **Status:** Approved design (brainstorming complete, 2026-06-24). Next: `writing-plans` for Slice 1.
> **Author session:** Alperen + Claude (hybrid dogfood).

**Goal:** Turn the deckent messaging bots (Telegram first; Discord/WhatsApp connector-agnostic) into a *controlled host-OS desktop assistant* — capable of actions like taking a screenshot or sending an email — by adding a **capability framework** (registry + per-capability risk-tier consent policy + platform adapters) wired into the single existing gated-dispatch chokepoint. Slice 1 ships the framework + two real capabilities: `screenshot` and `send_mail`.

**Architecture (one line):** Capabilities are a registry of `{ id, tier, defaultPolicy, edition, platformAdapters, run() }` units; the LLM invokes them as tools; the **existing** gated dispatcher consults a new policy engine (auto / confirm / deny) and executes via the registry in-process, reusing the durable park-and-approve store; media results are delivered out-of-band through a new connector `sendMedia` primitive.

**Tech stack:** TypeScript (ESM, Node ≥24), grammY (Telegram), nodemailer (mail, dynamic `optionalDependencies`), zod (arg schemas), vitest. Host-OS adapters: PowerShell interop (Windows/WSL), `screencapture` (macOS), `grim`/`scrot`/`import`/`gnome-screenshot` (Linux).

---

## Global Constraints (inherited by every implementation task)

These bind every task and the later implementation plan:

- **🔒 IMMUTABLE LAWS (CLAUDE.md):** (1) dual lens + scale — design for deckent dogfood AND end-user product (solo → largest enterprise, millions of users/projects); (2) every environment — cross-platform from the start (macOS · Linux · Windows native · Windows WSL), behind platform adapters, unsupported platform fails *honestly*, never silently; (3) never MVP — god-level/enterprise-grade only.
- **Single chokepoint invariant:** there must remain exactly ONE safety gate for bot actions (the existing gated dispatcher). The capability registry is its policy-brain + executor — NOT a second dispatch path.
- **Default-off / flag-gated:** the whole capability surface is off unless `bot_capabilities.enabled === true`. Risky/host-OS code is never blind-default-on.
- **Secrets via `.deck`:** no plaintext credentials in config (SMTP etc. interpolate from `.deck`).
- **i18n-first:** every user-facing string flows through `getMessage(key, lang)` (en/tr). Mechanism modules stay string-free.
- **Hermetic tests:** all I/O in `os.tmpdir()`; async `spawn` only (no `spawnSync`); no reading gitignored state; cross-platform matrix tested via injected probes/spawn on a single CI host; `npm run test:ci-sim` before push.
- **Proof-of-function (Tier-1):** user-surface capabilities require real-binary run-verify; a mock-only test alone = GO_WITH_TECH_DEBT, never DONE.
- **Surgical:** reuse existing connectors/dispatcher/bot-action-store/config patterns; minimum-diff.

---

## Background — what already exists (verified, file:line)

- **Inbound flow:** connector → `IncomingCommandRouter` (auth gate, `incoming-command-router.ts:115` silent-drop for unauthorized) → slash interception (`bot-commands.ts`, read-only invariant) → agentic chat (`chat-bridge.ts`).
- **Gated tool-use spine (Slice 2 agentic mode):** LLM emits tool_use → `makeGatedDispatcher()` (`bot-agentic.ts:99`) → read-only tools auto-execute (`READ_ONLY_BOT_TOOLS`, `bot-agentic.ts:29`), everything else is **parked durably** (`bot-action-store.ts`, `.deckent/bot-actions/<id>.json`, TTL + sprint-binding) awaiting `approve <id>`.
- **Cross-connector uniformity:** all connectors register through one `connector-bootstrap.ts` → one router → one dispatcher. A capability added at the dispatcher/registry layer works for Telegram + Discord + WhatsApp uniformly.
- **Auth/consent:** `gateway-access.ts` allowlist + pairing (default-deny). Capabilities inherit this chokepoint (only authorized chats reach chat → tools).
- **Gap:** no host-OS capabilities exist (no screenshot/SMTP deps), and the consent classifier is a binary read-only-vs-risky *set*, not a configurable per-capability risk-tier policy. The connector surface is text-only (`sendMessage`), no media primitive.

---

## Decisions log (brainstorming forks the user chose)

1. **Capability class / locus:** Host-OS / desktop (real screen, real mail, host file/app actions).
2. **Consent model:** per-capability risk-tier policy (auto / confirm / deny), overridable per-chat and globally.
3. **First slice:** framework + `screenshot` (read→auto) + `send_mail` (external→confirm).
4. **Architecture:** Approach C — registry policy+executor core wired INTO the single existing gated dispatcher (capabilities are uniform tools to the LLM).
5. **SMTP transport:** nodemailer via dynamic `import` (`optionalDependencies`), mirroring `loadGrammy()` — robust over a fragile hand-rolled SMTP (Law #3).
6. **Edition seam:** every capability carries an `edition: 'solo' | 'enterprise'` tag (all `'solo'` now, gate is a no-op). Registry is the future MOD-SPLIT seam; the split itself is planned post-project.

---

## Section 1 — Architecture & flow

**Flow (the single chokepoint preserved):**
```
text → connector → IncomingCommandRouter (auth gate, UNCHANGED)
     → slash-intercept (UNCHANGED) → agentic chat (persistent provider)
     → LLM tool_use (now includes capability tools)
     → ⟨gated dispatcher = THE ONE CHOKEPOINT⟩
          └─ if capability tool → PolicyEngine.resolve(cap, chatKey, project):
               • auto    → registry.run()  (in-process, platform-adapter) → result
               • confirm → PARK in bot-action-store + preview → `approve <id>` → run()
               • deny    → refuse
     → result (text/media) → text-ack returns to the LLM loop; media via sendMedia (out-of-band)
```

**New modules — `src/connectors/capabilities/`:**
- `types.ts` — `Capability`, `CapabilityResult`, `MediaAttachment`, `Tier`, `PolicyDecision`, `Edition`, `CapabilityContext`, `PlatformId`.
- `registry.ts` — `CapabilityRegistry` (register / get / has / list).
- `policy.ts` — `resolvePolicy(cap, ctx)` (layered resolution + destructive clamp + edition/master gate).
- `platform.ts` — `detectPlatform(probe?)` with injectable probes.
- `builtin/screenshot.ts`, `builtin/send-mail.ts`.

**Touched (surgical):** `bot-agentic.ts` (dispatcher consults policy + routes capability tools to registry), `chat-bridge.ts` (advertise capability tools to the provider), `connector-bootstrap.ts` (media send-back), `connectors/telegram.ts` + `connectors/types.ts` (`sendMedia`), config (`bot_capabilities`).

**Core types (interfaces for the plan):**
```ts
type Tier = 'read' | 'local' | 'external' | 'destructive';
type PolicyDecision = 'auto' | 'confirm' | 'deny';
type Edition = 'solo' | 'enterprise';
type PlatformId = 'win-native' | 'win-wsl' | 'darwin' | 'linux' | 'unsupported';

interface MediaAttachment { kind: 'photo' | 'document'; filename: string; mime: string; data: Buffer; caption?: string }
interface CapabilityResult { text?: string; media?: MediaAttachment[] }

interface CapabilityContext { chatKey: string; project: string; lang: string; spawn: SpawnFn; /* injected for tests */ }

interface Capability<A = unknown> {
  id: string;                 // e.g. 'screenshot', 'send_mail' — the tool name the LLM calls
  title: string;              // human label (i18n key resolved by caller)
  tier: Tier;
  defaultPolicy: PolicyDecision;
  edition: Edition;
  paramsSchema: ZodType<A>;   // validates args before run()
  preview(args: A, lang: string): string;     // shown in the confirm message
  run(args: A, ctx: CapabilityContext): Promise<CapabilityResult>;
}
```

---

## Section 2 — Consent / policy model + config

**Resolution (most-specific wins):**
```
resolvePolicy(cap, { chatKey, project, config, edition }):
  1. config.enabled === false                         → UNAVAILABLE (cap not advertised to LLM)
  2. cap.edition === 'enterprise' && edition !== 'enterprise' → UNAVAILABLE (now: all solo → no-op)
  3. base = perChat[chatKey][cap.id] ?? policies[cap.id] ?? cap.defaultPolicy
  4. CLAMP: cap.tier === 'destructive' && base === 'auto' → 'confirm' + warn  (destructive NEVER auto)
  5. → 'auto' | 'confirm' | 'deny'
```

**Tier → shipped default** (config may tighten freely; loosening is bounded by the clamp):
| tier | default | config may set |
|------|---------|----------------|
| read | `auto` | confirm / deny |
| local | `confirm` | auto / deny |
| external | `confirm` | auto (user accepts friction) |
| destructive | `deny` | at most `confirm` — **`auto` forbidden (clamped)** |

**Config (`.deckent/config.json`, 3-layer merge compatible):**
```jsonc
"bot_capabilities": {
  "enabled": false,                                              // MASTER flag-gate (default OFF)
  "policies": { "screenshot": "auto", "send_mail": "confirm" },  // optional global override
  "perChat":  { "<chatKey>": { "screenshot": "confirm" } },      // optional per-chat override
  "mail": { "allowedRecipients": [] }                            // optional anti-exfil recipient allowlist (empty = any, always-confirm)
}
```
Secrets (SMTP) interpolate from `.deck` (`$DECK:SMTP_HOST` …), never stored in config.

**Confirm UX:** `policy === 'confirm'` → park the resolved capability invocation in `bot-action-store`; the approval message renders `cap.preview(args, lang)` (mail → To/Subject/first body line; screenshot → "capture <display>"). `approve <id>` / `reject <id>` reuse the existing flow.

**Audit:** every execution (auto or approved) appends to `.deckent/capability-audit.jsonl` — `{ ts, chatKey, project, capId, tier, decision, argsDigest, status }`. Per-project (no single-file global bottleneck → scale-safe).

---

## Section 3 — Capabilities (Slice 1)

### 3a · `screenshot` (tier=read → auto)
Platform adapters selected by `detectPlatform()` (`win32` → win-native; `linux` + `/proc/version` ⊃ `microsoft` → win-wsl; `linux` → linux; `darwin` → darwin):

| platform | command (async `spawn`) | output read |
|----------|------------------------|-------------|
| **win-native** | `powershell.exe` → `System.Drawing` `PrimaryScreen.Bounds` capture → `%TEMP%\deckent-ss-<id>.png` | native Windows temp path |
| **win-wsl** | `powershell.exe` (interop) → same capture → `%TEMP%\…png` | `wslpath -u` → WSL path |
| **darwin** | `screencapture -x -t png <tmp>` | tmp path |
| **linux** | first available: `grim` → `scrot` → `import` → `gnome-screenshot` | tmp path |
| **unsupported** | — | honest error `CapabilityResult.text` (no fabrication) |

Mechanics: 15s timeout; nonzero exit → honest error; PNG → `media:[{kind:'photo', mime:'image/png', data:Buffer, caption:'📸 <host> · <display> · <ts>'}]`; tmp file best-effort `unlink`. Args (zod): `{ display?: 'primary' | 'all' }` (default `primary`). Privacy: screenshot captures the live screen → read→auto, but guarded by master-flag + chat-allowlist + audit; a chat may set `screenshot: 'confirm'`.

### 3b · `send_mail` (tier=external → confirm)
Transport: nodemailer via dynamic `import` (`optionalDependencies`; loaded only when the capability runs; tests inject a fake transport factory). Config from `.deck`: `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `mail_from` (= `SMTP_USER` default).

**Anti-exfiltration guard:** if `bot_capabilities.mail.allowedRecipients` is non-empty, recipients outside it are rejected *before* confirm; if empty, any recipient but **always confirm** (preview shows To). Args (zod): `{ to: string | string[], subject: string, body: string }` (validate email format; body plain-text in Slice 1, HTML deferred — YAGNI). Mechanics: missing SMTP config → honest error ("SMTP not configured in .deck"); `preview` = "📧 To … · Subject … · Body first-120ch"; success → `text: "Mail sent <to>/<subject> (id)"`. Audited.

---

## Section 4 — Media + connector interface (`sendMedia`)

- `IMessageConnector.sendMedia?(channelId: string, media: MediaAttachment): Promise<void>` — optional, feature-detected (like `sendChatAction`).
  - **Telegram (grammY):** `bot.api.sendPhoto(chatId, new InputFile(buf, filename), { caption })` for `photo`; `sendDocument` for `document`. `loadGrammy()` returns `{ Bot, InputFile }`.
  - **Discord / WhatsApp:** interface defined now; implementation deferred to the parity slice (user: "Discord/WhatsApp tested later"). Connector lacking `sendMedia` → honest fallback text ("[screenshot — this connector does not support media]"), never silent-drop.
- **Out-of-band delivery (critical):** binary media never enters the LLM text loop (no base64 context bloat; the model cannot emit it). `registry.run()` returns `{ text, media }`; `connector.sendMedia()` ships `media[]` directly to the chat (off-loop); a text acknowledgment ("screenshot 1920×1080 captured, sent to user") returns to the LLM tool-result so the loop stays coherent.
- **Size guard:** Telegram photo ≤ 10MB / document ≤ 50MB; over-limit → honest error.

---

## Section 5 — Testing + proof-of-function

**Unit (Tier-0, hermetic):**
- `policy.ts` (security-critical, highest priority) — table-driven: tier→default; per-chat > global > default precedence; **destructive-never-auto clamp**; master-off → UNAVAILABLE; edition-gate.
- `platform.ts` — inject `process.platform` + `/proc/version` probe → assert all five `PlatformId` outcomes (no real `/proc` read).
- `screenshot.ts` — inject fake `spawn` (records command, returns fixture PNG) → assert per-platform command construction (full matrix on one Linux CI host), nonzero→error, no-adapter→unsupported, PNG→media.
- `send-mail.ts` — inject fake transport → SMTP-missing→error; allowlist rejects out-of-list before send; valid→correct envelope; `preview` format.
- dispatcher / bootstrap / telegram — auto→run; confirm→park (not executed); deny→refuse; media→`sendMedia` out-of-band + text-ack to LLM; connector-without-sendMedia→honest fallback; `sendMedia`→`InputFile` from buffer + caption (fake grammY Bot).

**Proof-of-function (Tier-1, real-binary):**
- **Screenshot real-run** (host-side `Smoke:`, platform-gated): real `powershell.exe` capture → assert real PNG (magic bytes + nonzero size). Headless CI without display → skip-with-reason (no false pass).
- **Mail real-run:** NOT a nodemailer mock → a local in-process SMTP sink (tmpdir, async `node:net`) → real nodemailer → assert sink received the envelope (real SMTP round-trip, hermetic).
- **Live e2e (god-level):** real Telegram "take a screenshot" → bot returns a photo — manual dogfood verify on the phone (as with grammY/rich-text).

**Hermeticity:** all I/O in tmpdir + cleanup; async spawn only; config injected; `test:ci-sim` before push. **Routing:** framework → architect/bug-fixer; host-OS capabilities (user-surface) → api-builder; e2e harness → ci-guardian + ci-testing skill.

---

## Section 6 — Roadmap (controlled incremental capability catalog)

Grounded in the openclaw + NousResearch hermes-agent catalog. Each capability plugs into the same policy engine with a safe tier-default; riskier families ship later and more strictly gated.

| Slice | Family | Examples (tier→default) | Order rationale |
|-------|--------|-------------------------|-----------------|
| **S1** _(this spec)_ | First proof | screenshot (read→auto) · send-mail (external→confirm) | Validates framework + two tiers |
| **S2** | Observe & read | clipboard-read · read-file · list-dir (read→auto) · web-search/web-fetch (read→auto, egress → domain-allowlist) | Lowest risk, highest daily value |
| **S3** | Local action | write-file/edit-file (local→confirm) · clipboard-write · open/focus-app (local→confirm) · tts (local→auto) | Reversible local change; path-allowlist (anti-clobber) |
| **S4** | Outward comms & scheduling | message-send/broadcast (external→confirm) · calendar-write (external→confirm) · cron/reminder (external→confirm) | Outward effect; reuses connectors |
| **S5** | Desktop control (computer-use) | click/type/key/scroll/drag (local→confirm) | Drives the GUI → confirm-each + hard-block pattern list (e.g. `rm -rf`, fork bombs); adapter-heavy |
| **S6** | Shell & terminal | `exec` (destructive→**deny**, opt-in confirm+preview+hard-block) · tmux (destructive→confirm) | Most powerful + dangerous (openclaw `exec`) → LAST, default-deny, strongest guards + per-chat explicit enable + audit |

**Cross-cutting:** capabilities are connector-agnostic — Discord/WhatsApp parity = implementing connector primitives (`sendMedia`, etc.) on those adapters, not rewriting capabilities. Already-present deckent tools (memory-search/status/history) stay gated via the existing dispatcher; the framework serves only new host-OS/external capabilities. Edition seam: each capability's `edition` tag enables future MOD-SPLIT gating at one point.

---

## Non-goals (Slice 1)

- No Discord/WhatsApp `sendMedia` implementation (interface only; parity slice later).
- No HTML mail, no screenshot region/window selection, no clipboard/file/shell/computer-use capabilities (later slices).
- No edition split implementation (tag only; MOD-SPLIT planned post-project).
- No change to the existing auth/pairing or slash-command surfaces.

## Open items to resolve in `writing-plans`

- Exact task decomposition + ordering (framework types → policy → platform → screenshot → mail → media/connector → dispatcher wire → e2e smoke).
- i18n keys for capability titles, previews, confirm/deny/fallback/audit strings (en/tr).
- `package.json` `optionalDependencies` entry for nodemailer + dynamic loader (`loadNodemailer()`).
