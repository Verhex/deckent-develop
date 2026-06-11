# ADR-086: Native CLI Parity — F11 Feature Set (Sprint 224)

**Status:** accepted

**Date:** 2026-06-02

**Accepted:** Sprint 224

---

## Context

### The Gap

After ADR-083 (Sprint 221 — REPL Tam-Kapsam + Provider-Parity), `deckent` had a working
REPL with agentic dispatch, slash-registry, and status-line. However, a full `claude-code /
codex / gemini CLI` quality bar remained unmet:

- **Terminal-mode input missing:** readline was in line-mode, not terminal-mode. No ↑/↓
  history, no ←/→ cursor movement, raw escape sequences leaked to output.
- **Streaming was chunky:** the Claude `stream_event` envelope was not unwrapped — the
  entire assistant reply arrived as one block instead of token-by-token.
- **Thinking indicator had no brand:** a bare spinner, no kraken brand, no fixed-per-prompt
  verb, no braille-progress.
- **Agentic-DO had no tool layer:** `deckent` could orchestrate workers but had no own
  write/edit/read/bash tooling for the REPL session. `<deckent_tool>` protocol for
  provider-agnostic tool dispatch was absent.
- **Permission memory was absent:** every agentic action prompted `y/N` with no `always`
  option — no `.deckent/settings.local.json` persist (claude-code style).
- **`/nervous` slash was not wired:** `chat-nervous-bridge.ts` existed but was not called
  from `chat-native.ts` slash handler — `/nervous` returned "Unknown command".
- **Banner was zero-caller:** `renderBanner` existed in `chat-banner.ts` but `entry.ts`
  never called it.
- **AI plan-mode failed silently:** `callBrainPlanner()` collapsed all error types
  (spawn/timeout/parse/validation/no-provider) into a single `null` and the CLI silently
  fell back to structured-mode with no explanation.

These gaps collectively kept F11 below `claude-code` quality. Alperen's direction:
"deckent REPL must offer the FULL feature set + polish + speed of claude-code / codex /
gemini CLIs — multi-model, multi-provider, native, fast."

### ADR-081/082/083 Foundation

This ADR builds on:
- **ADR-081** — agentic REPL shell, `runChatNativeLoop` (Sprint 219)
- **ADR-082** — native LLM wire, config-driven provider, REPL gerçek cevap (Sprint 220)
- **ADR-083** — REPL tam-kapsam, provider-parity 5-fleet, local-model foundation (Sprint 221)

---

## Decision

Sprint 224 closed the F11 parity gap in two phases: hand-coded recovery branch (merged to
main before dogfood), and parallel deckent dogfood wave (orthogonal, distinct-file tasks).

### Recovery Branch (main — before dogfood)

**F11-002 — Terminal-mode input (224-001):**
`src/cli/commands/chat-native.ts` — readline switched to `terminal: true` mode. Line-editing
(↑/↓ history, ←/→ cursor, Del, Ctrl-A/E) work in the REPL. No raw escape leak.

**F11-003 — Real token-by-token streaming (224-011):**
Claude `stream_event` SSE envelope unwrapped — each text delta rendered immediately. Was
dumping whole reply at once (chunky/slow); now true streaming.

**F11-004 — Thinking indicator (224-014/018):**
`● deckent · <fiil>…` kraken-brand colored header. Verb fixed per-prompt (not cycling per
frame). Braille spinner in the wait region. Sprint 224-018 added color (`chalk` already in
deps; no new runtime dependency per ADR-010).

**F11-005/wire — Agentic-DO tool layer (224-005/006/wire):**
`src/cli/commands/chat-agentic-do.ts` — write/edit/read/bash tool layer, provider-agnostic
`<deckent_tool>` protocol. `dispatchAgenticDo` called from `runChatNativeLoop`. Confirm-gate
for write/bash (y/a/N). Scope-bounded to REPL session cwd.

**F11-006 — Permission memory (224-016):**
`.deckent/settings.local.json` — `permissions.allow[]` array, claude-code style 3-way
`y/a/N` prompt. `a` = always → appended to allow list, not asked again. Gitignored.

### Dogfood Wave (Sprint 224 — parallel deckent workers)

**224-015 — AI plan-mode fix:**
`callBrainPlanner()` → discriminant union `{ok:true,data}|{ok:false,reason,message}` with
`reason: spawn_failed|timeout|parse_failed|validation_failed|no_providers`. CLI bootstrap
logs detailed reason before falling back to structured. Timeout configurable via
`brain_plan_timeout_ms`.

**224-008 — `/nervous` slash wire:**
`chat-native.ts` slash handler → `getPendingNervous()` + `renderNervousPrompt()` called on
`/nervous`. Pending proposals listed with accept/reject flow. Was "Unknown command" before.

**224-009 — Banner wire:**
`entry.ts` `launchDefaultRepl` calls `renderBanner(ctx)` on TTY at startup (status-line
adjacent). Zero-caller bug fixed.

**224-010 — Nervous safe re-enable:**
`.deckent/config.json` `nervous_system.enabled: true` — panic-gate.ts non-blocking (223-006)
+ observer.ts (223-008) already in main → safe. A/B verified: nervous ON → sprint SPAWN
not blocked.

**224-027 — Smoke harnesses:**
`scripts/agentic-do-verify.mjs` — real `dist/cli/entry.js` agentic-write E2E (tmpdir-isolated,
async spawn, PASS/FAIL). `scripts/repl-smoke-verify.mjs` extended: terminal-mode /
streaming / permission-memory / `/`-menu all run-proven.

**224-012 (this ADR + MASTER-PLAN update):**
ADR-086 accepted; MASTER-PLAN §10 Sprint 224 outcome + F11 status updated.

---

## Consequences

### Positive

- **Terminal-mode parity:** readline terminal-mode gives ↑/↓ history, cursor movement —
  matches claude-code CLI UX.
- **True streaming:** token-by-token rendering from Claude SSE; no more chunky whole-reply.
- **Brand identity in motion:** kraken `● deckent · <fiil>…` header — recognizable,
  consistent per ADR-021.
- **Agentic-DO unblocked:** write/edit/read/bash in REPL session, `<deckent_tool>` protocol
  provider-agnostic. Agentic-DO E2E smoke run-proven.
- **Permission memory:** claude-code-style `always` option — power users not prompted
  repeatedly. `.deckent/settings.local.json` gitignored, per-machine.
- **`/nervous` slash live:** pending nervous proposals accessible from REPL without leaving
  the session.
- **AI planner honest:** discriminant error union surfaces real failure reason; no more
  silent structured fallback.
- **Nervous re-enabled:** proactive meta-orchestrator active again after Sprint 223 disable.
- **Smoke harnesses:** agentic-DO write-verify + REPL smoke all run-proven, not mock-only.

### Negative / Limitations

- **F11-007 (pinned input bar), F11-008 (interactive `/` menu), F11-009 (markdown-stream),
  F11-010 (token-counter), F11-011 (live activity), F11-012 (UTF-8/Turkish), F11-013
  (clickable paths):** not in Sprint 224 dogfood scope — REPL render core is coupled and
  handled by hand in separate session to avoid parallel collision.
- **F11-014 (multi-provider parity):** codex/gemini per-turn today; persistent + agentic
  parity post-Sprint 224.
- **Agentic-DO hermetic test boundary:** real `dist/cli/entry.js` required; smoke skips if
  `dist/` absent (hermetic CI compliance).
- **nervous A/B advisory:** SPAWN non-blocking confirmed but nervous runtime still advisory
  V1 — hard-flip post-GA V2 per ADR-037.

---

## Alternatives Considered

### Continue Chunky Streaming (no token-by-token)

Deferring streaming fix would have kept the per-turn latency perception poor. Rejected:
the streaming wire (`stream_event` unwrap) was a two-file change — surgical, high impact.

### New readline Abstraction Layer

Introduce a separate `terminal-readline.ts` wrapper for TTY mode. Rejected: Karpathy
Discipline 2 (Simplicity) — a single `terminal: true` option in the existing readline
init achieved the goal. No new abstraction needed.

### spawnSync for Agentic-DO Tools

`spawnSync` for the bash tool in agentic-DO. Rejected: ADR-006 (spawnSync Security Pattern)
forbids blocking sync for user commands; CI-hermeticity rule also blocks `spawnSync` in
tests. Async `spawn` with timeout guard used instead.

### Permission Memory in memory.db

Store `permissions.allow` in SQLite `memory.db`. Rejected: per-machine settings (not
project-wide knowledge) belong outside the git-tracked memory; `.deckent/settings.local.json`
(gitignored, flat JSON) matches the claude-code `settings.local.json` pattern.

---

## References

- Sprint 224 — feat: Native CLI Parity (F11) + nervous wire + AI plan-fix + smoke harnesses
- ADR-083 — REPL Tam-Kapsam + Provider-Parity (Sprint 221 predecessor)
- ADR-082 — Native-LLM-Wire (Sprint 220)
- ADR-081 — Native Agentic Deckent (Sprint 219)
- ADR-079 — Proof-of-Function DoD (Tier-0/Tier-1 + Smoke gate)
- ADR-021 — Kraken ASCII Brand Identity
- ADR-010 — Tek Runtime Dependency (no new deps — chalk already in deps)
- ADR-006 — spawnSync Security Pattern (agentic bash tool uses async spawn)
- `src/cli/commands/chat-native.ts` — terminal-mode readline + `/nervous` wire + agentic-DO wire
- `src/cli/commands/chat-agentic-do.ts` — `<deckent_tool>` protocol, write/edit/read/bash
- `src/cli/entry.ts` — `renderBanner` call, permission-memory init
- `src/orchestra/planner.ts` — discriminant union `callBrainPlanner`
- `scripts/agentic-do-verify.mjs` — run-proven agentic-write E2E smoke
- `scripts/repl-smoke-verify.mjs` — REPL smoke harness (terminal/streaming/perms/menu)
- `.deckent/config.json` — `nervous_system.enabled: true` (re-enabled Sprint 224-010)

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (REPL-parity = ürünün claude-code-kalite çıtası; F11 doğrudan user-deneyimi).

**Re-verified:** `/nervous` slash-wire (`chat-native.ts:21-24` import + `:292` wire-root) ✓ · banner-wire (`entry.ts:29` + `:511`) ✓ · planner discriminant-union (`planner.ts:375-386`: spawn_failed/timeout/parse_failed/validation_failed/no_providers) ✓ · permission-memory (`chat-permissions.ts` → `.deckent/settings.local.json`) ✓ · `agentic-do-verify.mjs` + `repl-smoke-verify.mjs` ✓.

**Yeniden-yapılanma (dosya-referansı stale, kavram canlı ve büyümüş):** `chat-agentic-do.ts` artık diskte YOK — `<deckent_tool>` agentic-DO katmanı şu aileye bölündü: `chat-session.ts` (`:83 DECKENT_TOOL_TAG_RE` parser + `--append-system-prompt` enjeksiyonu) + `chat-tool-exec.ts` (`createToolExecDispatcher`, async-spawn bash) + `chat-tool-bridge.ts` + `tool-permissions.ts` (hem `commands/` hem `repl/` katmanında). Bu ADR'nin Referanslar bölümündeki `chat-agentic-do.ts` satırı tarihsel kayıt olarak korunur.

**Negatives-listesi Ink'le kapandı:** F11-007 pinned input-bar (`src/cli/repl/input-bar.tsx`), F11-008 `/` menü, F11-009 markdown-stream vd. Sprint 224+ Ink enterprise-epic'i (E1-E7: markdown/menü/switcher/footer/agentic-diff/paste/default) ile gerçekleşti — ADR'nin "kapsam-dışı" bıraktıkları sonraki el-kodlama oturumlarında tamamlandı (ADR-083 amendment Ink-evrim notu).

**224-010 nervous re-enable bugün geçerli DEĞİL:** canlı `.deckent/config.json` → `nervous_system.enabled: false` — Sprint 223 disable → 224 re-enable → sonradan İKİNCİ kez kapatılmış (ADR-082 amendment'indeki opt-out drift'le aynı kayıt; yeniden-açma kararı ayrı değerlendirilecek). md+db senkron (Alperen ADR-review).
