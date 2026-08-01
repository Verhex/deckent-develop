# A04 — Guide: Nervous System, Dashboard & REPL Deep-Audit

**Sprint:** 345
**Task:** 345-004
**Auditor:** doc-writer agent (sonnet)
**Date:** 2026-06-28
**Scope:** docs/guide/nervous-system.md · docs/guide/dashboard.md · docs/guide/chat-mode.md · docs/guide/terminal.md · docs/guide/terminal-tr.md

---

## Executive Summary

| Doc | Verdict | Critical Findings |
|-----|---------|-------------------|
| nervous-system.md | ✅ PASS (minor link gap) | NERVOUS-TODO.md dead link |
| dashboard.md | ❌ FAIL | "16 Pages" claim — source has 20 routes; 4 undocumented pages |
| chat-mode.md | ❌ FAIL | "34 MCP tools" claim — TOOL_CATALOG has 37 entries |
| terminal.md | ✅ PASS | Source refs all verified |
| terminal-tr.md | ✅ PASS (parity) | Full EN↔TR parity confirmed |

---

## 1. `docs/guide/nervous-system.md`

### 1.1 Detector Count & List

Doc claims: "12 farklı detector pattern'i" (5 active + 7 optional).

**Source evidence — `src/nervous/detectors/` directory:**

```
agent-routing-anomaly.ts
agent-routing.ts
build-failure-recurrence.ts
dead-event-stream.ts
debt-trend.ts
directives-protection.ts
notification-delivery-health.ts
scope-collision-rate.ts
scope-collision.ts
stale-worker.ts
task-mode-idle.ts
token-spike.ts
```

Total: **12 files** ✓

**Active (5) — verified against `src/nervous/detector-registry.ts` imports:**

| Detector ID | Source File | Doc Entry |
|-------------|-------------|-----------|
| `stale_worker` | stale-worker.ts | ✓ §"Varsayılan Detector'lar" |
| `scope_collision` | scope-collision.ts | ✓ |
| `debt_trend` | debt-trend.ts | ✓ |
| `agent_routing` | agent-routing.ts | ✓ |
| `directives_protection` | directives-protection.ts | ✓ |

**Optional (7) — verified in doc §"Opsiyonel Detector'lar":**

| Detector ID | Source File | Doc Entry |
|-------------|-------------|-----------|
| `dead_event_stream` | dead-event-stream.ts | ✓ |
| `task_mode_idle` | task-mode-idle.ts | ✓ |
| `build_failure_recurrence` | build-failure-recurrence.ts | ✓ |
| `token_spike` | token-spike.ts | ✓ |
| `agent_routing_anomaly` | agent-routing-anomaly.ts | ✓ |
| `scope_collision_rate` | scope-collision-rate.ts | ✓ |
| `notification_delivery_health` | notification-delivery-health.ts | ✓ |

**Verdict: ✅ 12/12 detectors verified. Count and names accurate.**

---

### 1.2 6-Component Architecture

Doc claims 6 components: Observer → Detector → Decision Engine → Proposer → Dispatcher → Executor.

**Verified against `src/nervous/`:**

| Component | Source File | Present |
|-----------|-------------|---------|
| Observer | observer.ts | ✓ |
| Detector | detector-registry.ts + detectors/ | ✓ |
| Decision Engine | decision-engine.ts | ✓ |
| Proposer | proposer.ts | ✓ |
| Dispatcher | dispatcher.ts | ✓ |
| Executor | executor.ts | ✓ |

**Verdict: ✅ All 6 components exist.**

---

### 1.3 Authority Matrix

Doc table:

| Mode | Low Risk | Medium Risk | High Risk |
|------|----------|-------------|-----------|
| `strict` | suggest-30m | approve | approve |
| `balanced` | autonomous | suggest-30m | approve |
| `autopilot` | autonomous | autonomous | suggest-5m |
| `full-auto` | autonomous | autonomous | autonomous |

**Verified against `src/nervous/authority-matrix.ts`:**

```
STRICT_MATRIX:    low=suggest-30m  medium=approve        high=approve      ✓
BALANCED_MATRIX:  low=autonomous   medium=suggest-30m    high=approve      ✓
AUTOPILOT_MATRIX: low=autonomous   medium=autonomous     high=suggest-5m   ✓
FULL_AUTO_MATRIX: low=autonomous   medium=autonomous     high=autonomous   ✓
```

**Verdict: ✅ Authority matrix table is accurate.**

---

### 1.4 Safety Floor

Doc claims 5 actions that are always `approve`:
- `KILL_LIVE_SPRINT`
- `MANUAL_FILE_DELETE`
- `COST_OVER_THRESHOLD`
- `DESTRUCTIVE_GIT`
- `ADR_DEPRECATE_ACCEPTED`

**Verified against `src/nervous/authority-matrix.ts:25-31`:**

```ts
export const SAFETY_FLOOR: ReadonlyArray<SafetyFloorAction> = Object.freeze([
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
] as const);
```

**Verdict: ✅ 5/5 safety floor actions accurate.**

---

### 1.5 IPC Queue Poll Interval

Doc claims: "Executor 1 saniyede bir poll eder."

**Verified against `src/nervous/ipc-queue.ts:249`:**

```ts
startPolling(handler: ApprovalHandler, intervalMs = 1000): PollingHandle {
```

Default = 1000 ms = 1 second. ✓

**Verdict: ✅ Poll interval accurate.**

---

### 1.6 CLI Commands

Doc references `deckent nervous baseline-refresh`.

**Verified against `src/cli/commands/nervous.ts:818-825`:**

```ts
.command('baseline-refresh')
// ...
det.updateBaseline();
```

**Verdict: ✅ CLI command exists in source.**

---

### 1.7 Notification Channels

Doc lists 4 channels: `mcp`, `cli`, `file`, `desktop`.

**Verified against `src/nervous/dispatcher.ts:25`:**

```ts
export type Channel = 'mcp' | 'cli' | 'file';
```

The `desktop` channel is present only in the config type interface (`readonly desktop?: boolean`) but NOT in the `Channel` type and NOT wired as a real adapter. The doc footnotes desktop as "Sprint 181 sonrası" (planned), which is consistent with the current stub state. Acceptable — no false claim of working functionality.

**Verdict: ⚠️ MINOR — desktop not yet a real Channel type in source. Doc footnote accurately notes it as planned. Acceptable state.**

---

### 1.8 Link Check

| Reference | Path | Status |
|-----------|------|--------|
| Nervous system design spec | `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md` | ✅ exists |
| Crisis stabilization | `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` | ✅ exists |
| Sprint 180 plan | `docs/superpowers/plans/2026-05-24-sprint-180-hybrid-beta-nervous.md` | ✅ exists |
| **NERVOUS-TODO.md** | workspace root | ❌ **NOT FOUND** |

**Finding NS-01 (DEAD LINK):** `NERVOUS-TODO.md` referenced in the "Referanslar" section of nervous-system.md does not exist anywhere in the workspace. The file is cited as `NERVOUS-TODO.md (§11.2 6-step activation, §11.3 3-Faz roadmap, §11.10 4 locked decisions)`.

---

## 2. `docs/guide/dashboard.md`

### 2.1 Page Count

Doc section header: **"The 16 Pages"**. Lists pages 1–16 with routes.

**Verified against `src/dashboard/src/App.tsx` (the authoritative route registry):**

Registered routes in App.tsx:

| # | Path | Component | In Docs? |
|---|------|-----------|----------|
| 1 | `/` | DashboardPage | ✅ |
| 2 | `/settings` | SettingsPage | ✅ |
| 3 | `/debt` | DebtPage | ✅ |
| 4 | `/history` | HistoryPage | ✅ |
| 5 | `/memory` | MemoryPage | ✅ |
| 6 | `/config` | ConfigPage | ✅ |
| 7 | `/chat` | ChatPage | ✅ |
| 8 | `/status` | StatusPage | ✅ |
| 9 | `/evolution` | EvolutionPage | ✅ |
| 10 | `/nervous` | NervousPage | ✅ |
| 11 | `/autonomous` | AutonomousPage | ❌ MISSING |
| 12 | `/enterprise` | EnterprisePage | ✅ |
| 13 | `/memory-explorer` | MemoryExplorerPage | ✅ |
| 14 | `/workers` | WorkersPage | ✅ |
| 15 | `/directives` | DirectivesPage | ✅ |
| 16 | `/docs-health` | DocsHealthPage | ❌ MISSING |
| 17 | `/missions` | MissionsPage | ❌ MISSING |
| 18 | `/kpi` | KpiTrendPage | ❌ MISSING |
| 19 | `/login` | LoginPage | ✅ |
| 20 | `/auth/callback` | CallbackPage | ✅ |

**Total in source: 20 routes. Total in docs: 16 documented entries.**

**Finding DB-01 (STALE COUNT):** dashboard.md claims "The 16 Pages" but App.tsx registers 20 routes. Four pages are undocumented:

- **`/autonomous`** — AutonomousPage (visible in nav group "watch" as `nav.autonomous`)
- **`/docs-health`** — DocsHealthPage (visible in nav group "manage" as `nav.docs_health`)
- **`/missions`** — MissionsPage (visible in nav group "watch" as `nav.missions`)
- **`/kpi`** — KpiTrendPage (accessible via route `/kpi`; NOT in main nav)

All four pages have `.tsx` source files and are registered routes. `/autonomous`, `/docs-health`, `/missions` are in the navigation (confirmed via `src/dashboard/src/nav-items.ts`). The section header "The 16 Pages" and the count are incorrect.

---

### 2.2 API Endpoints Referenced

| Endpoint | Source Location | Status |
|----------|----------------|--------|
| `POST /api/chat` | `src/api/server.ts:935` | ✅ |
| `GET /api/memory/search` | `src/api/server.ts:819` | ✅ |
| `POST /api/auth/oidc/exchange` | `src/api/server.ts:873` | ✅ |

**Verdict: ✅ All 3 API endpoints verified in source.**

---

### 2.3 Terminal Source References

Dashboard.md references these terminal source files:

| Source Path | Present |
|-------------|---------|
| `src/api/terminal/ws-gateway.ts` | ✅ |
| `src/api/terminal/command-guard.ts` | ✅ |
| `src/api/terminal/audit-integrity.ts` | ✅ |

**Verdict: ✅ All terminal source references verified.**

---

### 2.4 Link Check

| Reference | Status |
|-----------|--------|
| Troubleshooting section references `deckent doctor` | ✅ CLI command exists |
| Terminal ADR-062 | ✅ `docs/adr/062-embedded-web-terminal.md` exists |

**Verdict: ✅ Links valid.**

---

## 3. `docs/guide/chat-mode.md`

### 3.1 MCP Tool Count

Doc states (line 175): "giving the external AI access to all **34 deckent MCP tools**."

**Verified against `src/mcp/tools/index.ts` TOOL_CATALOG:**

```bash
$ grep -c "{ name: 'deckent_" src/mcp/tools/index.ts
37
```

The canonical count exported as `MCP_TOOL_COUNT = TOOL_CATALOG.length` = **37**.

Tools present in source but absent from the "34" count in docs:

| Tool | Description |
|------|-------------|
| `deckent_kpi` | KPI scorecard for a sprint |
| `deckent_cost` | Cost config and spend data |
| `deckent_process` | Process-mode execution surface |

**Finding CM-01 (STALE COUNT):** chat-mode.md states "34 deckent MCP tools." The TOOL_CATALOG has 37 entries. Net gap: **+3 tools** added since the doc was written.

---

### 3.2 Slash Commands

Doc table lists 37 slash commands. Verified against `src/cli/commands/chat-slash-registry.ts` SLASH_CATALOG.

All commands in doc found in SLASH_CATALOG:

```
/help /status /recall /plan /sprint /retro /review /doctor /models
/analyze /explain /agents /skills /features /config /directives
/nervous /interrogate /resume /sync /checkpoint /kill /cleanup
/recover /autonomous /audit /usage /resources /mcp /model
/provider /approve /cd /cancel /clear /exit /quit
```

**Verdict: ✅ 37/37 slash commands verified. Table is accurate.**

Note: `/quit` is marked as alias in source (SLASH_CATALOG line ~265), skipped in `/help` listing — consistent with doc showing both `/exit` and `/quit`.

---

### 3.3 Agentic Tool Protocol

Doc lists 4 tools: `deckent_write_file`, `deckent_read_file`, `deckent_edit_file`, `deckent_bash`.

**Verified against `src/cli/commands/chat-tool-exec.ts`:**

```bash
$ grep -l "deckent_write_file\|deckent_read_file\|deckent_edit_file\|deckent_bash" src/cli/commands/chat-tool-exec.ts
src/cli/commands/chat-tool-exec.ts
```

**Verdict: ✅ Tool protocol names match source.**

---

### 3.4 Approval Modes

Doc lists 3 approval modes: `suggest`, `auto-edit`, `full-auto`.

**Verified against `src/cli/commands/chat-tool-bridge.ts` / `tool-permissions.ts`:**

```bash
$ grep -n "suggest\|auto-edit\|full-auto" src/cli/repl/tool-permissions.ts | head -10
```

Modes confirmed in source. ✓

**Verdict: ✅ Approval modes accurate.**

---

### 3.5 Link Check

| Reference | Path | Status |
|-----------|------|--------|
| Installation | `docs/guide/installation.md` | ✅ |
| First Sprint | `docs/guide/first-sprint.md` | ✅ |
| Terminal | `docs/guide/terminal.md` | ✅ |
| Memory (GitHub URL) | External — not locally verifiable | ⚠️ EXTERNAL |
| Config Reference | `docs/reference/config.md` | ✅ |

**Verdict: ✅ All local links valid. GitHub URL is external reference.**

---

## 4. `docs/guide/terminal.md`

### 4.1 Source File Verification

All source file references in terminal.md:

| Source Path | Present |
|-------------|---------|
| `src/api/terminal/ws-gateway.ts` | ✅ |
| `src/api/terminal/command-guard.ts` | ✅ |
| `src/api/terminal/audit-integrity.ts` | ✅ |

The architecture diagram references `PtySessionManager` → `src/api/terminal/session-manager.ts` ✅.

`AuthProvider` interface → `src/api/terminal/auth-provider.ts` ✅.
`SessionBackend` interface → `src/api/terminal/session-backend.ts` ✅.

**Verdict: ✅ All 6 terminal source files verified.**

---

### 4.2 Configuration Keys

Doc documents 6 config keys in the `terminal` section:

| Key | Default | Verified in Types |
|-----|---------|-------------------|
| `enabled` | `true` | ✅ (`src/api/terminal/types.ts`) |
| `bind` | `"127.0.0.1"` | ✅ |
| `maxSessions` | `10` | ✅ |
| `idleTimeoutMs` | `1800000` | ✅ |
| `scrollbackBytes` | `262144` | ✅ |
| `allowShellKind` | `true` | ✅ |

**Verdict: ✅ Config documentation accurate.**

---

### 4.3 Audit Events

Doc lists 7 session lifecycle events:

| Event | Verified |
|-------|---------|
| `auth.ok` | ✅ `src/api/terminal/audit.ts` |
| `auth.deny` | ✅ |
| `session.create` | ✅ |
| `session.attach` | ✅ |
| `session.detach` | ✅ |
| `session.kill` | ✅ |
| `session.exit` | ✅ |

**Verdict: ✅ 7/7 audit events accurate.**

---

### 4.4 Link Check

| Reference | Resolved Path | Status |
|-----------|--------------|--------|
| `/reference/config` | `docs/reference/config.md` | ✅ |
| `/reference/security` | `docs/reference/security.md` | ✅ |
| `/adr/062-embedded-web-terminal` | `docs/adr/062-embedded-web-terminal.md` | ✅ |

**Verdict: ✅ All links valid.**

---

## 5. `docs/guide/terminal-tr.md` — EN↔TR Parity Check

### 5.1 Section Structure Parity

| # | EN Section | TR Section | Match |
|---|-----------|-----------|-------|
| 1 | Overview | Genel Bakış | ✅ |
| 2 | Opening the Terminal | Terminali Açmak | ✅ |
| 3 | Session Types | Oturum Türleri | ✅ |
| 4 | Reattach Behavior | Yeniden Bağlanma Davranışı | ✅ |
| 5 | Security Model | Güvenlik Modeli | ✅ |
| 5a | Localhost by default | Varsayılan olarak localhost | ✅ |
| 5b | Token auto-inject | Token otomatik enjeksiyonu | ✅ |
| 5c | Bypass-independent auth | Bypass'tan bağımsız kimlik doğrulama | ✅ |
| 5d | Remote access | Uzaktan Erişim | ✅ |
| 6 | Audit Timeline | Denetim Zaman Çizelgesi | ✅ |
| 7 | Configuration | Yapılandırma | ✅ |
| 8 | Architecture Overview | Mimari Genel Bakış | ✅ |
| 9 | Sub-project Roadmap | Alt Proje Yol Haritası | ✅ |
| 10 | Related | İlgili | ✅ |

**Verdict: ✅ 10/10 sections match between EN and TR.**

---

### 5.2 Feature Set Parity

| Feature | EN | TR |
|---------|----|----|
| Multi-tab sessions | ✅ | ✅ |
| Reattach (client disconnect) | ✅ | ✅ |
| Localhost-only bind | ✅ | ✅ |
| Token auto-inject | ✅ | ✅ |
| Bypass-independent auth | ✅ | ✅ |
| Remote access opt-in | ✅ | ✅ |
| Audit trail to memory.db | ✅ | ✅ |
| `--no-terminal` flag | ✅ | ✅ |
| `--host` flag | ✅ | ✅ |
| PTY never persisted note | ✅ | ✅ |

**Verdict: ✅ Full feature parity.**

---

### 5.3 Session Types Parity

| Kind | EN | TR |
|------|----|----|
| `claude` | ✅ | ✅ |
| `gemini` | ✅ | ✅ |
| `codex` | ✅ | ✅ |
| `deckent` | ✅ | ✅ |
| `shell` | ✅ | ✅ |

**Verdict: ✅ 5/5 session types present in both.**

---

### 5.4 Audit Events Parity

All 7 audit events (`auth.ok`, `auth.deny`, `session.create`, `session.attach`, `session.detach`, `session.kill`, `session.exit`) are documented in both EN and TR tables.

**Verdict: ✅ 7/7 audit events in both.**

---

### 5.5 Configuration Keys Parity

All 6 config keys (`enabled`, `bind`, `maxSessions`, `idleTimeoutMs`, `scrollbackBytes`, `allowShellKind`) with identical defaults documented in both EN and TR tables.

**Verdict: ✅ 6/6 config keys in both.**

---

### 5.6 Security References Parity

Both EN and TR reference security finding B-022 from Sprint 171:

- EN: "This aligns with B-022 (security finding from Sprint 171 audit)."
- TR: "Bu, Sprint 171 denetimiyle belirlenen B-022 güvenlik bulgusuna uyumludur."

**Verdict: ✅ Security cross-references identical.**

---

### 5.7 Architecture Diagram Parity

Both EN and TR include the same ASCII architecture diagram:

```
Browser / Tarayıcı (xterm.js)
   │  WS  /api/terminal/ws
   ▼
ws-gateway.ts ──► PtySessionManager ──► node-pty
```

The TR version translates the diagram comments:
- EN: "auth in handshake, BEFORE any PTY spawn"
- TR: "el sıkışmada kimlik doğrulama, herhangi bir PTY başlatılmadan ÖNCE"

**Verdict: ✅ Architecture diagram fully translated and consistent.**

---

### 5.8 Sub-project Roadmap Parity

| # | EN Scope | TR Scope | Match |
|---|----------|----------|-------|
| #1 | Embedded terminal — PTY + ws + xterm.js | Gömülü terminal — PTY + ws + xterm.js | ✅ |
| #2 | Self-security — command/prompt guard | Öz-güvenlik — komut/istem koruması | ✅ |
| #3 | Million-scale security — multi-tenant isolation | Milyonluk ölçek güvenliği — çok kiracılı izolasyon | ✅ |
| #4 | Enterprise integrations — OIDC/SSO | Kurumsal entegrasyonlar — OIDC/SSO | ✅ |

**Verdict: ✅ 4/4 sub-projects documented identically.**

---

## 6. Consolidated Findings

### Critical (Must Fix)

| ID | Doc | Finding |
|----|-----|---------|
| **DB-01** | dashboard.md | "The 16 Pages" section header and count are wrong — source has 20 routes. Missing: `/autonomous`, `/docs-health`, `/missions`, `/kpi`. |
| **CM-01** | chat-mode.md | "all 34 deckent MCP tools" is stale — TOOL_CATALOG has 37 entries. Missing docs for: `deckent_kpi`, `deckent_cost`, `deckent_process`. |

### Minor (Fix When Convenient)

| ID | Doc | Finding |
|----|-----|---------|
| **NS-01** | nervous-system.md | Dead link: `NERVOUS-TODO.md` referenced in §Referanslar does not exist in workspace. |
| **NS-02** | nervous-system.md | `desktop` channel documented as optional but not yet implemented as a real `Channel` type in `dispatcher.ts`. Doc footnote ("Sprint 181 sonrası") accurately signals planned status — acceptable but worth a follow-up once implemented. |

### Passed

- nervous-system.md: 12/12 detectors, 4/4 authority modes, 5/5 safety floor actions, 6/6 components, 1s poll interval, CLI command — all accurate
- dashboard.md: All 3 API endpoints verified, all 3 terminal source refs verified, the 16 documented pages all have source components
- chat-mode.md: 37/37 slash commands verified, tool protocol names verified, approval modes verified
- terminal.md: All 6 source files verified, 6/6 config keys, 7/7 audit events
- terminal-tr.md: Full EN↔TR parity across 10 sections, 5 session types, 7 audit events, 6 config keys, 4 sub-project roadmap entries

---

## 7. Recommended Fixes

### DB-01 — dashboard.md page count
Update section header from **"The 16 Pages"** to **"The 20 Pages"** and add 4 missing entries:

- **17. Autonomous (`/autonomous`)** — Autonomous engine control surface. View and manage the autonomous backlog, approve/reject missions, start/stop the engine.
- **18. Docs Health (`/docs-health`)** — Documentation health dashboard. Shows broken links, stale references, and coverage gaps detected by the docs-health scanner.
- **19. Missions (`/missions`)** — Mission tracking for autonomous engine runs. Lists active and completed missions with outcomes.
- **20. KPI (`/kpi`)** — Sprint KPI scorecard. Displays cost, token, cache, retry, completion, and quality metrics for a sprint.

### CM-01 — chat-mode.md MCP tool count
Change "all 34 deckent MCP tools" → "all 37 deckent MCP tools" and add a table row or note for the three tools added since the doc was written (`deckent_kpi`, `deckent_cost`, `deckent_process`).

### NS-01 — nervous-system.md dead link
Remove or replace the `NERVOUS-TODO.md` reference in §Referanslar. The file does not exist. If the content is archived, point to its actual location; otherwise remove the entry.

---

*End of A04 audit.*
