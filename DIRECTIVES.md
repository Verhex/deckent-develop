# DIRECTIVES — Sprint 332: sprint-331 KPI proof-of-function fixes + Beta-forward next-work (dogfood)

## Goal
Two-track sprint. **Track A (must-fix):** close the three sprint-331 POST-SPRINT-VERIFY KPI
proof-of-function bugs (`docs/audits/OVERNIGHT-2026-06-27-findings.md` → "Sprint-331 — POST-SPRINT
VERIFY", findings 1-3): (1) `deckent kpi` no-arg returns `{sprintId:null, kpis:[]}` because the
fallback only honors an ACTIVE sprint (`kpi.ts:195`) — no latest-finalized fallback (**proof-of-function
blocker**); (2) forward-collection does NOT fire at finalize (`recordKpiMeasurements` wired at
`sprint-finalizer.ts:791` but never persisted for sprint-331 — backfill `skipped:0`); (3) cost/token
KPIs are `0` because the finalize hook does not capture **real per-task cost/token** from the task
results. The KPI engine itself works (`kpi --sprint <id>` → 8 KPIs, 776 results in db; backfill
populated 1067 measurements) — these are the last proof-of-function gaps. **Track B (Beta-forward):**
pull high-value, well-scoped, **distinct-file** next-work toward the Beta publish — KPI Faz-2 surface
completion (dashboard card+trend page / `/api/kpi/trend` / `deckent_kpi --trend` MCP / Telegram
sprint-end summary / `deckent_cost` MCP parity), the Windows beta-onboarding cluster (SPAWN-1 DEP0190,
CFG-1 legacy-mode, F1-IMG-2 `image build`, DOC-PKG-1, F1-005 Dockerfile multi-CLI), the AS-2 F1-013
agentic HTTP-worker (core multi-provider enabler), the 331-007 B-ZOMBIE doctor live-wire, and the
F11-012 Ink render-path encoding guard. Every item is sourced to a read-doc line — nothing invented.

**Records of truth (READ FIRST):**
- Findings: `docs/audits/OVERNIGHT-2026-06-27-findings.md` (§ "Sprint-331 — POST-SPRINT VERIFY" → the 3 KPI fixes).
- Triage SSOT: `DECKENT-TRIAGE-PLAN.md` (Faz-4 B-ZOMBIE · B11-WIRE veins · enterprise/MOD-SPLIT removed 2026-06-26).
- Forward plan: `docs/MASTER-PLAN.md` §10 (sprint-331 row `:820` open follow-ups) + F1 matrix (F1-013:140/284 · F1-005:134 · F1-IMG-2:820/803 · SPAWN-1:1062 · CFG-1:1069 · DOC-PKG-1:803 · F11-012:820/267 · W-B CLI/MCP parity:735) + KPI spec §13 Faz-2.
- KPI sources: `src/cli/commands/kpi.ts:195` (no-arg fallback) · `src/orchestra/sprint-finalizer.ts:791` (`recordKpiMeasurements` hook) + `:661` `buildUsageTotals` (opus-priced estimate, ignores `result.cost`) · `src/core/kpi/collection.ts` (`deriveMeasurements`/`recordKpiMeasurements`) · `src/core/kpi/kpi-store.ts` (`kpi_results` table) · `src/core/kpi/kpi-service.ts:102/144` (`listSprintViews`/`getTrend`).

## 🔒 BAĞLAYICI — her task (3 Yasa anchor + collision-safety)
- **DISTINCT-FILE (KRİTİK):** hiçbir iki task `Files`/`Scope`'ta AYNI dosyayı listelemez. İki task tek dosyaya yazarsa = lock-collision-hang (sprint öldüren). Bu DIRECTIVES **sıfır-dosya-kesişimi doğrulandı**; worker yalnız kendi `Files` listesine yazar. **`src/cli/helpers/messages.ts` HİÇBİR task'a ait DEĞİL** (paylaşılan hot-file) → user-facing string isteyen task **mevcut `getMessage` anahtarlarını yeniden kullanır**, yeni anahtar gerekirse gerekçeli `TODO(phase2)` not düşer, messages.ts'i DÜZENLEMEZ. Dashboard i18n (`src/dashboard/src/i18n/en.ts`+`tr.ts`) yalnız Task 8'e aittir. Çalışma-ağacındaki **commit-edilmemiş** dosyalar (`config-types.ts`, `connectors/connector-bootstrap.ts`, `connectors/identity/providers/scim.ts`, `agents/agentic-worker-runner.ts`, identity test'leri) **hiçbir task tarafından dokunulmaz** (sosyal-identity Faz-3 işi — karışma).
- **PROVIDER-AGNOSTIC (Yasa #2):** claude-varsayımı YOK; provider-yolları simetrik (opus/codex/ollama/openai-compat aynı kontrat). Desteklenmeyen provider/platform **dürüstçe fail** eder, sessizce "claude"a düşmez. Cross-platform (macOS·Linux·Win-native+WSL): process-listeleme/spawn/shell platform-adapter ardına, unsupported = honest-fail. (SPAWN-1/F1-005/F1-013 doğrudan bu yasanın altında.)
- **DUAL-LENS + ÖLÇEK (Yasa #1):** her task hem deckent dogfood orkestrasyonunu hem son-kullanıcı ürününü (solo→en-büyük-şirket, milyon user/proje, multi-tenant) düşünür.
- **NO-MVP / god-level (Yasa #3):** kestirme/placeholder YOK; eksik bırakılan açıkça işaretlenir (gerekçeli `TODO(phase2)` tek istisna) — sessiz borç kabul edilmez.
- **Cerrahi + additive:** mevcut davranış byte-for-byte korunur; minimum-diff; ESM `.js` import zorunlu (Node16); `process.cwd()` YASAK → `join(root, …)`; mevcut export-imzaları kırılmaz.
- **i18n-first:** kullanıcı-görünür string `getMessage(key, lang)` (en/tr) / dashboard i18n (en.ts/tr.ts) — hardcode TR/EN = borç. Mekanizma modülleri string-free.
- **Hermetik test (zorunlu):** tmpdir, async (no `spawnSync`), no HOME/`.deckent`-leak, network **mock**'lı; her task **faithful** test (pre-fix RED / post-fix GREEN). `tsc --noEmit` 0-yeni-hata; değişen modülü import eden **affected-suite** yeşil; `npm run test:ci-sim` kırılmaz. **No haiku** (kod).
- **PROOF-OF-FUNCTION (ADR-079):** Tier-1 task (`src/cli/commands/`·`src/api/`·`src/dashboard/`) `Smoke:` gerçek-binary satırı ile kapanır (mock yetmez). Tier-0 (core/orchestra/providers/mcp/connectors/repl internal) unit-test-sufficient.
- **Dependencies konvansiyonu (sprint-331 BUG düzeltmesi — DİKKAT):** `- Dependencies: N` **0-TABANLI task index**'tir (`0` = İLK task = Task 1, `1` = Task 2, …). **Bağımsız task'ta `- Dependencies:` SATIRI HİÇ YAZILMAZ** (tamamen atlanır). `- Dependencies: 0` ASLA "bağımsız" anlamına gelmez — Task 1'e (ve self-task'ta kendine = deadlock) bağlar; sprint-331 planını bu kırdı. **Bu sprint'te 16 task'ın HEPSİ distinct-file + bağımsızdır → hiçbirinde `- Dependencies:` satırı YOKTUR.**

---

## Task 1: `deckent kpi` no-arg latest-finalized fallback (proof-of-function blocker — fix #1)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/kpi.ts, tests/cli/kpi-no-arg-fallback.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
Findings POST-SPRINT VERIFY 🔴 FIX-#1. `kpi.ts:195` does `const sprintId = options.sprint ?? currentSprintFn(root)` where `currentSprintFn` = `getCurrentSprintId` (`src/core/event-stream.ts:270`) → returns `null` once a sprint is finalized (no ACTIVE sprint), so a bare `deckent kpi` / `deckent kpi --json` emits `{ sprintId: null, kpis: [] }` — even though the store holds real results (sprint-331: 8 KPIs, 776 `kpi_results` rows). Fix the resolution order: when there is NO `--sprint` AND no active sprint, fall back to the **LATEST sprint that actually has KPI results** in the store. Add a focused read-only query (a small `latestSprintWithResults(tenantId)` helper reading `kpi_results` for `grain='sprint'`, ordered by `computed_at`/`period_key` DESC, LIMIT 1 — via `KpiService`/`KpiStore`, no new DB side-effect on the read path) and use it as the final fallback. Keep the existing precedence: explicit `--sprint` wins; then active sprint; then latest-with-results; only if NONE exist → today's honest `kpi.no_data` empty output (never crash, never create the DB). The `--trend` branch (`kpi.ts:171-192`) and table/JSON rendering stay byte-for-byte. Tenant-aware (default `'default'`). EXCLUSIVE owner of `kpi.ts` this sprint — Tasks 9/10/14 use OTHER files; Task 2 must not touch this.
### goNogo
- goCriteria: hermetic test seeds a tmpdir memory.db with finalized-sprint `kpi_results` (NO active sprint) → `runKpi({ json:true })` prints `{ sprintId: '<real latest id>', kpis:[…] }` with a non-empty `kpis[]` (pre-fix RED: `sprintId:null` + empty); explicit `--sprint <id>` still resolves that id; active-sprint path unchanged; truly-empty store → `kpi.no_data` (no crash, no DB created); `tsc --noEmit` 0-new; `npx vitest run tests/cli/kpi-no-arg-fallback.test.ts` GREEN.
- nogo: creating the DB as a read side-effect; breaking `--sprint`/active-sprint/`--trend` precedence; hardcoded TR/EN; `process.cwd()`; editing messages.ts or any non-listed file.
Smoke: node dist/cli/entry.js kpi --json → JSON with a real (non-null) sprintId and a non-empty kpis[] computed from the latest finalized sprint

## Task 2: forward-collection fire at finalize + REAL per-task cost/token capture (fix #2 + #3)
- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: typescript-expert, database-migration
- Files: src/orchestra/sprint-finalizer.ts, src/core/kpi/collection.ts, tests/orchestra/kpi-forward-collection.test.ts
- Scope: src/orchestra/, src/core/kpi/, tests/orchestra/
### Description
Findings POST-SPRINT VERIFY 🔴 FIX-#2 + #3. The KPI collection hook (`sprint-finalizer.ts:790-804`, `try { recordKpiMeasurements(...) } catch { debugLog }`) did NOT persist for sprint-331 (backfill reported `skipped:0` → no sprint had pre-existing measurements → the finalize hook never recorded). **First root-cause WHY** (disk-verify, document in result notes): candidates — the non-blocking `try/catch` silently swallowed a throw; wrong `dbPath`; the hook ran on the PRE-build dist; `results`/metrics shape mismatch; or an early-return upstream of `:790`. **Then fix** so finalize reliably records measurements for the just-finalized sprint. **Also fix the cost/token under-count (#3):** `buildUsageTotals` (`sprint-finalizer.ts:661`) re-estimates with hardcoded OPUS prices (`OPUS_PRICE_*`) and only reads `result.tokenUsage` — it IGNORES each result's real `result.cost.usd`. Capture the REAL per-task cost: sum `result.cost.usd` when present (provider-agnostic, the F1-TOK/cost-config ground-truth landed sprint-330) and fall back to the estimate only when a result carries no `cost`. Keep `UsageTotals` (`collection.ts:20-26`) + `deriveMeasurements` provider-agnostic and null-safe (no `cost` anywhere → 0, never crash). Net effect: forward sprints persist `cost_per_sprint`/`token_per_task` as REAL non-zero numbers (unlike the telemetry-less backfill). **These TWO files (`sprint-finalizer.ts` + `collection.ts`) are EXCLUSIVELY this task's — no other task touches them.** Do NOT touch `kpi.ts` (Task 1), `kpi-service.ts`, or `kpi-store.ts`.
### goNogo
- goCriteria: faithful test drives `finalizeSprint` (or the extracted hook) over a tmpdir memory.db with results that carry real `tokenUsage`+`cost.usd` → after finalize, `KpiStore`/`getResults` for that sprint contains measurements with NON-ZERO `cost_usd` sourced from `result.cost.usd` (pre-fix RED: hook absent/zero); the hook stays non-blocking (an injected throw does NOT fail finalize, but the success path now persists); a result with NO `cost` falls back to the estimate without crashing; finalize output otherwise byte-for-byte; `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/kpi-forward-collection.test.ts` GREEN + existing finalize/collection tests GREEN.
- nogo: claiming a fix without disk-verifying the real root cause in notes; the hook blocking/failing finalize; fabricating cost when no result reports it; using opus-only prices when a real `result.cost` exists; touching kpi.ts/kpi-service.ts/kpi-store.ts.

## Task 3: SPAWN-1 — Node DEP0190 `shell:true` Windows fix (cross-platform + ADR-006)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/provider.ts, src/providers/subprocess.ts, tests/core/spawn-dep0190.test.ts
- Scope: src/core/, src/providers/, tests/core/
### Description
MASTER-PLAN §10.5 SPAWN-1 (`:1062`, Windows beta.1 bug report). On win32, `detectCliVersion` (`src/core/provider.ts:346-350`) calls `spawnSync(cmd, args, { …, shell: isWindows })` — `shell:true` WITH an args array is the exact DEP0190 condition → every provider probe in `deckent doctor` (`detectClaude`/`detectCodex`/`detectGemini`) leaks `(node:…) [DEP0190] DeprecationWarning…` to user stdout/stderr AND is a real command-injection surface (args concatenated, not escaped — the ADR-006 carve-out the `authority-enforcer.ts:470` lint flags). Second live site: `src/providers/subprocess.ts:159` (`shell:true` to resolve `.cmd`/`.ps1` wrappers on the worker-spawn path). **Fix (NOT a blind `shell:false` flip — Windows needs `.cmd`/`.ps1` resolution; a naive flip ENOENTs npm-CLI wrappers):** resolve the wrapper's full path (PATHEXT / `where`) and call with `shell:false` + args array, OR invoke via `cmd.exe /c <cmd> <args>` with `shell:false` (Node escapes the array). Reuse the correct pattern already in `src/core/worker-image-check.ts` (`spawn(…, { shell:false })`), with the wrapper-resolution caveat (docker is a real `.exe`; provider CLIs are `.cmd` wrappers). Non-Windows path unchanged (no shell). Closes the deprecation noise AND the injection surface in one move. Platform branches behind an injectable seam so the test never spawns a real process. `provider.ts` is this task's alone (Task 1/4/etc. use other files; F1-013 uses `openai-compatible.ts`).
### goNogo
- goCriteria: hermetic test (injected platform + spawn seam) asserts the win32 path no longer passes `shell:true` with an args array — args are escaped (full-path+`shell:false`, or `cmd.exe /c` array) at BOTH sites (`provider.ts` probe + `subprocess.ts` wrapper); `.cmd`/`.ps1` wrapper resolution still works on win32 (no ENOENT regression, modeled in the seam); non-Windows behavior byte-for-byte; `tsc --noEmit` 0-new; `npx vitest run tests/core/spawn-dep0190.test.ts` GREEN + existing provider/subprocess tests GREEN.
- nogo: a blind `shell:false` flip that breaks Windows wrapper resolution; leaving `shell:true`+args at either site; a unix-only fix with no win32 path/honest-fail (Yasa #2); real process spawn in tests; touching authority-enforcer.ts.

## Task 4: CFG-1 — legacy `mode` no longer blocks `config set` (Windows beta install-blocker)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/cli/commands/config.ts, src/core/config.ts, src/core/config-migration.ts, tests/cli/config-legacy-mode-set.test.ts
- Scope: src/cli/commands/, src/core/, tests/cli/
### Description
MASTER-PLAN §10.5 CFG-1 (`:1069`, Windows beta.1 bug report). With a legacy `"mode": "pro_plan"` on disk, ANY `deckent config set <unrelated-key> <value>` (e.g. `spawn_backend docker`) fails whole-config validation with `Invalid value 'pro_plan' for field 'mode'` — the write/validate path (`config.ts:111-145` → `validatePartialConfig` → `validateConfig` → `VALID_MODES` at `src/core/config.ts:370` = `['performance','balanced','economic','api']`, legacy excluded, throws at `:488-489`) never calls `resolveMode`, while the READ path normalizes legacy (`loadConfig`→`resolveMode`) → asymmetry. **God-level fix (make the three paths agree):** (1) normalize `mode` via `resolveMode` inside `validatePartialConfig` / the `config set` action BEFORE `validateConfig` (mirrors the read path) → unblocks every `config set` and persists the canonical value on next write; (2) surface the legacy rename in `MigrationResult` (`config-migration.ts:221-223/288` already rewrites legacy→canonical) so `deckent config migrate` reports the `mode` rewrite instead of a misleading "Added 0 field(s)" (`config.ts:256`); (3) keep the error message (`config.ts:489`) and `VALID_MODES` (`:370`) in sync (don't advertise a value as "valid (legacy)" while validation rejects it). Surgical — do not widen `VALID_MODES`, do not touch `config-types.ts` (uncommitted social-identity work). i18n via existing message keys (do NOT edit messages.ts).
### goNogo
- goCriteria: hermetic test seeds a tmpdir `.deckent/config.json` with legacy `mode:'pro_plan'` → `config set spawn_backend docker` SUCCEEDS and persists `spawn_backend` AND canonical `mode:'economic'` (pre-fix RED: throws `Invalid value 'pro_plan'`); `config migrate` surfaces the legacy `mode` rename in its message; canonical-mode config unchanged; `tsc --noEmit` 0-new; `npx vitest run tests/cli/config-legacy-mode-set.test.ts` GREEN + existing config/migration tests GREEN.
- nogo: widening `VALID_MODES` to accept legacy (must normalize, not accept); breaking the canonical write path; editing `config-types.ts`/messages.ts; `process.cwd()`.
Smoke: with a legacy-mode .deckent/config.json on disk, node dist/cli/entry.js config set spawn_backend docker → exits 0, no "Invalid value 'pro_plan'", mode rewritten to economic

## Task 5: F1-013 — agentic HTTP-worker v1 (CLI-less providers run real workers)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/providers/openai-compatible.ts, src/agents/http-agentic-worker.ts, tests/agents/http-agentic-worker.test.ts
- Scope: src/providers/, src/agents/, tests/agents/
### Description
MASTER-PLAN F1-013 (`:140`, §4A `:284`/`:316`) — the core AS-2 multi-provider enabler. Today `OpenAICompatibleAdapter.spawn()` THROWS (`src/providers/openai-compatible.ts:187-189`, "HTTP-only … use send() instead of spawn()") → any OpenAI-compatible/Bedrock/API provider can `chat()` but **cannot run agentic sprint workers**. Build the v1 single-task end-to-end headless agentic loop: new `src/agents/http-agentic-worker.ts` = a provider-agnostic loop that drives the registered `adapter.send()` in a tool-use cycle, reusing the EXISTING executor layer (`chat-tool-exec` read/write/edit/bash impls — READ-only import) with **scope-enforcement** (write/edit only within `scope.filesWrite`; out-of-scope → the tool returns an error to the model, ADR-037 RBAC; aligned with the AS-2 per-worker auth-isolation contract), and writes `.hb` heartbeat + `.result` exactly like the CLI worker path (reuse the same `.tasks/` result schema). Then implement `OpenAICompatibleAdapter.spawn()` to launch this loop (via the subprocess backend lifecycle — kill/heartbeat/scope reused; do NOT fork a second runner — align with the existing `src/agents/agentic-worker-runner.ts` infra, do NOT edit it). v1 = ONE task uçtan uca (multi-worker concurrency + ollama tool-loop parity are explicit `TODO(phase2)` follow-ups, noted not stubbed). `adapter.send` is injectable so the test never hits a network. Tier-0 internal (subprocess-spawned; not a direct CLI/api/dashboard surface).
### goNogo
- goCriteria: hermetic test injects a fake `adapter.send` that emits a read→write tool sequence then a final answer → the loop executes the tools through the chat-tool-exec layer, REJECTS an out-of-scope write (returns tool-error, no disk write outside `scope.filesWrite`), writes a `.hb` and a valid `.result` (selfAssessment + filesChanged) to a tmpdir; `OpenAICompatibleAdapter.spawn()` no longer throws and drives the loop; `tsc --noEmit` 0-new; `npx vitest run tests/agents/http-agentic-worker.test.ts` GREEN + existing openai-compatible/agents tests GREEN.
- nogo: real network/process in tests; duplicating the agentic-worker-runner logic or editing it; bypassing scope-enforcement (out-of-scope write must fail honestly); a claude-only assumption; leaving `spawn()` throwing.

## Task 6: 331-007 B-ZOMBIE — wire `checkDaemonHygiene` live into `deckent doctor`
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, tests/cli/doctor-daemon-hygiene-wire.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
MASTER-PLAN §10 sprint-331 row (`:820`) — 331-007 landed GO_WITH_TECH_DEBT: `detectStaleDaemons` (`src/core/daemon-hygiene.ts:147`) + `checkDaemonHygiene` (`src/cli/commands/doctor-checks.ts:595`) were BUILT (cross-platform, advisory) but **live wiring into `doctor.ts` was deferred (outside 331-007 scope)** → `deckent doctor` still does NOT surface stale daemons (grep `daemon` in `doctor.ts` = empty). Wire `checkDaemonHygiene` as a new ADVISORY section in the `doctor` command (`src/cli/commands/doctor.ts`), alongside the existing checks: print the flagged stale `dist/mcp/server.js`/`bot`/`serve`/`watch` daemons + a copy-paste kill hint, or a clean PASS line — **advisory only, never auto-kills, never fails/exits-nonzero doctor**. Reuse the existing `checkDaemonHygiene` (do not reimplement detection); pass the same platform-lister seam. i18n via EXISTING `getMessage` keys already used by `doctor-checks.ts` (the full i18n-centralization of daemon strings into messages.ts stays a noted `TODO(phase2)` — messages.ts is not this task's file). `doctor.ts`+`doctor-checks.ts` are this task's alone.
### goNogo
- goCriteria: faithful test runs the `doctor` command with an injected stale-daemon snapshot → output includes the daemon-hygiene advisory line(s) + kill hint (pre-wire RED: section absent); injected clean snapshot → a PASS line; the section never throws, never auto-kills, never makes doctor exit non-zero; `tsc --noEmit` 0-new; `npx vitest run tests/cli/doctor-daemon-hygiene-wire.test.ts` GREEN + existing doctor tests GREEN.
- nogo: auto-killing any process; failing/exiting-nonzero doctor; reimplementing `detectStaleDaemons`; editing `messages.ts` or `daemon-hygiene.ts`; a unix-only path without honest-fail (Yasa #2).
Smoke: node dist/cli/entry.js doctor → output includes the daemon-hygiene advisory line (stale-daemon list+kill hint or a clean PASS), command exits 0

## Task 7: F11-012 — Ink render-path UTF-8/Türkçe chunk-boundary guard
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/repl/stream-segmenter.ts, tests/cli/repl/stream-segmenter-utf8.test.ts
- Scope: src/cli/repl/, tests/cli/repl/
### Description
MASTER-PLAN F11-012 (`:820` "Ink render-path encoding regression (kalan)"; `:267`). The earlier F11-012 audit hardened the provider stream-decode (`TextDecoder{stream:true}`) but flagged a REMAINING gap on the Ink REPL render path. `src/cli/repl/stream-segmenter.ts` segments streamed model output for the Ink renderer; if it splits on raw bytes / re-`.toString()`s per chunk, a multi-byte UTF-8 sequence straddling a chunk boundary (Turkish ç/ğ/ı/ö/ş/ü, or any non-ASCII) garbles into replacement characters. Audit the segmenter for any per-chunk byte→string conversion or boundary split that can bisect a code point; ensure it accumulates/segments on whole code points (carry an incomplete tail to the next chunk, or operate on already-decoded strings). Add a faithful byte-by-byte split regression test feeding Turkish text one byte at a time (and at adversarial mid-codepoint boundaries) → the reassembled segments equal the original string. Surgical — preserve segmentation behavior for ASCII/whole-codepoint input byte-for-byte. Tier-0 (REPL internal; the byte-boundary test is the proof).
### goNogo
- goCriteria: faithful test feeds a Turkish/emoji string split at every byte boundary (incl. mid-codepoint) → segmenter output reassembles to the exact original (pre-fix RED: replacement chars / garble at boundaries); ASCII + whole-codepoint segmentation unchanged; `tsc --noEmit` 0-new; `npx vitest run tests/cli/repl/stream-segmenter-utf8.test.ts` GREEN + existing repl/segmenter tests GREEN.
- nogo: changing segmentation for ASCII/whole-codepoint input; fabricating a fix without a byte-boundary test; widening scope beyond the segmenter.

## Task 8: KPI Faz-2 dashboard surface — scorecard card + trend page (Tier-1)
- Model: sonnet
- Effort: high
- Agent: frontend-designer
- Skills: typescript-expert
- Files: src/dashboard/src/components/KpiCard.tsx, src/dashboard/src/pages/KpiTrendPage.tsx, src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/App.tsx, src/dashboard/src/components/Sidebar.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, tests/dashboard/kpi-dashboard.test.tsx
- Scope: src/dashboard/, tests/dashboard/
### Description
MASTER-PLAN §10 sprint-331 row (`:820`) — KPI Faz-2 open follow-up "dashboard KPI card/trend sayfası". Two additive surfaces, ONE dashboard task (so the shared dashboard i18n + router are owned by a single worker, zero intra-collision): (1) `KpiCard.tsx` — reads `GET /api/kpi` (landed sprint-331 `:830`, `registerKpiEndpoint`) via the existing `fetchJson` client (`src/dashboard/src/lib/api.ts`) and renders the scorecard (id/value/formatted/target/status) using lucide-react icons (NO emoji) + the dashboard `ThemeProvider`; embed it into `DashboardPage.tsx` at the existing card grid (additive, no refactor). (2) `KpiTrendPage.tsx` — reads `GET /api/kpi/trend?kpiId=…` (Task 9's endpoint; the page mocks `fetchJson` in its test, no build coupling) and renders the old→new series; register a `/kpi` route in `App.tsx` (mirror the existing `<Route>` rows) + a Sidebar nav item (`Sidebar.tsx` items list, `labelKey`+lucide icon). All user-facing strings via dashboard i18n (`i18n/en.ts`+`tr.ts`, `t(labelKey)`) — these two i18n files are EXCLUSIVELY this task's. Empty/`401`/loading states honest (reuse `EmptyState`/`UnauthorizedBanner`/`Skeleton` patterns); the session/bootstrap token already flows through `fetchJson` (A6/A7 lessons — do not raw-fetch). Tier-1 dashboard.
### goNogo
- goCriteria: hermetic DOM test (vitest jsdom, mocked `fetchJson`): `KpiCard` renders real KPI rows from a seeded `/api/kpi` payload (numeric value + status) and an honest empty-state on `{kpis:[]}`; `KpiTrendPage` renders a series from a mocked `/api/kpi/trend` payload + an empty-series honest state; `/kpi` route + Sidebar item registered; NO emoji (lucide icons); strings via `t()`; `tsc --noEmit` 0-new (dashboard tsconfig); `npx vitest run -c vitest.dashboard.config.ts tests/dashboard/kpi-dashboard.test.tsx` GREEN.
- nogo: raw `fetch` bypassing the auth-forwarding client (IDOR/unauth); emoji instead of lucide; hardcoded TR/EN (must use i18n); re-implementing KPI math in the frontend (consume the API); reformatting DashboardPage/App/Sidebar beyond the additive insert.
Smoke: node dist/cli/entry.js serve --port 3328 then curl -s -o /dev/null -w "%{http_code}" localhost:3328/ → 200 (dashboard shell loads; KPI card+trend route served)

## Task 9: KPI Faz-2 — `GET /api/kpi/trend` HTTP endpoint (Tier-1 surface)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/api/kpi-trend-endpoint.ts, src/api/server.ts, tests/api/kpi-trend-endpoint.test.ts
- Scope: src/api/, tests/api/
### Description
MASTER-PLAN §10 sprint-331 row (`:820`) — KPI Faz-2 trend surface. `KpiService.getTrend(kpiId, n)` (`src/core/kpi/kpi-service.ts:144`) exists but no HTTP surface exposes it (only the scorecard `GET /api/kpi` landed, 331-009). New `src/api/kpi-trend-endpoint.ts` mirroring the existing modular endpoint pattern (`kpi-endpoint.ts`/`coverage-endpoint.ts`): `registerKpiTrendEndpoint(url, res, projectRoot, req)` serving `GET /api/kpi/trend?kpiId=&n=&tenantId=` → `KpiService.getTrend` → JSON `{ kpiId, series:[{ periodKey, value, status }] }`. Tenant-scope MUST flow from the authenticated request principal (`req`-threaded, same as `kpi-endpoint.ts` — NO cross-tenant leak; ref A1/A2 IDOR lessons). Wire it into `src/api/server.ts` additively at the existing endpoint-registration site (one `if (registerKpiTrendEndpoint(...)) return;` next to `:830`; do NOT refactor server.ts, do NOT touch `kpi-endpoint.ts`). Empty/unknown kpiId → `200` with `{ series: [] }` (honest no-data, not 500). Tier-1.
### goNogo
- goCriteria: hermetic supertest-style test hits `GET /api/kpi/trend?kpiId=cost_per_sprint` → `200` + valid JSON `series[]` (seeded DB → numeric points old→new; empty/unknown → `[]`, never 500); `tenantId` scopes results (cross-tenant isolation assertion); registration additive in server.ts; `tsc --noEmit` 0-new; `npx vitest run tests/api/kpi-trend-endpoint.test.ts` GREEN + existing api tests GREEN.
- nogo: route without request-principal tenant scoping (IDOR); refactoring server.ts beyond the one registration; touching `kpi-endpoint.ts`; 500 on empty/unknown kpiId; re-implementing trend math (delegate to `KpiService.getTrend`).
Smoke: node dist/cli/entry.js serve --port 3329 then curl -s localhost:3329/api/kpi/trend?kpiId=cost_per_sprint → HTTP 200 with a JSON body carrying a series[] array

## Task 10: KPI Faz-2 — `deckent_kpi` MCP tool gains `trend` mode
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/mcp/tools/kpi.ts, tests/mcp/kpi-trend-tool.test.ts
- Scope: src/mcp/tools/, tests/mcp/
### Description
MASTER-PLAN §10 sprint-331 row (`:820`) — KPI Faz-2 MCP trend parity. The `deckent_kpi` MCP tool landed scorecard-only (331-008, `src/mcp/tools/kpi.ts`). Extend the EXISTING registered tool (already wired in `index.ts`) with an optional `trend` mode: args widen to `{ sprint?, tenantId?, trend?: string /* kpiId */, n?: number }` — when `trend` is set, delegate to `KpiService.getTrend(kpiId, n)` and return `{ kpiId, series:[{ periodKey, value, status }] }`; otherwise the existing scorecard shape is byte-for-byte. `readOnlyHint:true`, tenant-aware, no network, no DB write beyond the service self-heal. Delegate to `KpiService` (SSOT) — do NOT reimplement trend math. Additive to `kpi.ts` only — do NOT touch `index.ts` (the tool is already registered; Task 15 owns `index.ts`).
### goNogo
- goCriteria: hermetic test invokes the tool with `{ trend:'cost_per_sprint', n:5 }` against a seeded tmpdir memory.db → returns `{ kpiId, series:[…] }` with numeric points (empty history → `series:[]`, no throw); the scorecard mode (no `trend`) returns the unchanged shape; `tsc --noEmit` 0-new; `npx vitest run tests/mcp/kpi-trend-tool.test.ts` GREEN.
- nogo: re-implementing trend math instead of delegating to `KpiService.getTrend`; changing the scorecard response shape; editing `index.ts`; network; hardcoded titles.

## Task 11: F1-IMG-2 — `deckent image build` standalone command (Beta onboarding)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/image.ts, src/cli/entry.ts, tests/cli/image-build.test.ts
- Scope: src/cli/commands/, src/cli/, tests/cli/
### Description
MASTER-PLAN §10 sprint-331 row (`:820` "F1-IMG-2 artık bloklanmıyor") + §10.5 `:803` #06. F1-DF shipped `Dockerfile.worker` in the npm package (331-005), so the standalone build command is now unblocked. Today only an internal `--fix-image` flow builds `deckent-worker:latest`; there is no first-class `deckent image build`. Add a new `src/cli/commands/image.ts` exposing `deckent image build` (build the worker image from the packaged `Dockerfile.worker`, cross-platform: resolve the packaged Dockerfile path via `join(root,…)`, honest-fail if docker is absent/unsupported with an actionable message, never silent) with `--tag` (default `deckent-worker:latest`), `--dry-run` (print the resolved Dockerfile path + build plan, no spawn), and reuse of the existing worker-image-check spawn pattern (`shell:false`). Register the command in `src/cli/entry.ts` following the existing command-registration pattern (additive — one import + one `.command(...)`, no reordering). i18n: reuse existing image/init `getMessage` keys; a genuinely new output string is a noted `TODO(phase2)` if no key exists (do NOT edit messages.ts). Tier-1. NOTE the init/upgrade auto-integration as an explicit out-of-scope follow-up.
### goNogo
- goCriteria: hermetic test (injected spawn seam + tmpdir) — `image build --dry-run` resolves the packaged `Dockerfile.worker` path and prints the build plan WITHOUT spawning (pre-add RED: command does not exist); `image build` invokes the docker build via the injected seam with `--tag`; docker-absent → an honest actionable error (no silent success); command registered in `entry.ts`; `tsc --noEmit` 0-new; `npx vitest run tests/cli/image-build.test.ts` GREEN.
- nogo: a real docker build in tests; `process.cwd()` for the Dockerfile path; silent success when docker is unavailable; editing messages.ts; reordering entry.ts registrations; implementing init/upgrade integration (scope creep).
Smoke: node dist/cli/entry.js image build --dry-run → prints the resolved Dockerfile.worker path + planned build command + image tag, exits 0 (no docker spawn)

## Task 12: DOC-PKG-1 — README links resolve on a fresh `npm i` (Beta onboarding)
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing
- Files: README.md, package.json, tests/build/readme-package-links.test.ts
- Scope: ./, tests/build/
### Description
MASTER-PLAN §10.5 `:803` #02 DOC-PKG-1 (🟡, Windows beta.1 report). `package.json files[]` ships `["dist","bin","README.md","LICENSE",...]` but the README references `docs/…` paths that are NOT in the tarball → every relative `docs/` link in the README is broken on a fresh `npm i deckent` (npmjs.com + local install). God-level fix = make the README **self-contained for the published package**: rewrite the in-README relative `docs/…` links to absolute canonical GitHub URLs (so they resolve from npmjs.com and a local install alike), OR add the referenced doc asset(s) to `package.json files[]` if they are small/canonical — pick the minimal, surgical option per link and keep `files[]` additions byte-aligned (no reorder/reformat of `package.json`). Hermetic test: parse `npm pack --dry-run --json` (tmpdir, no real publish) AND scan the README for relative `docs/…` links → assert every README link either resolves inside the packed manifest or is an absolute URL (no dangling relative `docs/` link survives in the published artifact). NOTE the broader W-H doc deliverables (`docs/cookbook/`, EN user guide) as out-of-scope follow-ups.
### goNogo
- goCriteria: test parses `npm pack --dry-run --json` + the README and asserts NO relative `docs/…` link that is absent from the packed tarball (pre-fix RED: dangling links); `package.json` diff is minimal (links rewritten and/or whitelisted files added, no field reorder); `tsc --noEmit` 0-new; `npx vitest run tests/build/readme-package-links.test.ts` GREEN.
- nogo: reformatting/reordering `package.json`; bundling large/unrelated trees into `files[]`; leaving a dangling relative `docs/` link in the published artifact; touching unrelated docs.
Smoke: npm pack --dry-run 2>&1 then verify every relative docs/ link in README is either packed or rewritten to an absolute URL (no dangling link in the tarball manifest)

## Task 13: F1-005 — Dockerfile.worker multi-CLI build-arg (opt-in codex/gemini)
- Model: opus
- Effort: high
- Agent: ci-guardian
- Skills: ci-testing
- Files: Dockerfile.worker, src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-multicli-buildarg.test.ts
- Scope: ./, src/orchestra/, tests/orchestra/
### Description
MASTER-PLAN F1 matrix F1-005 (`:134`, ⬜ P1) — Dockerfile.worker multi-CLI via build-arg opt-in (depends on F1-DF which shipped 331-005). Today `Dockerfile.worker` installs only the Claude CLI; a codex/gemini worker in docker has no CLI in-image. Add build-args (e.g. `INSTALL_CODEX`/`INSTALL_GEMINI`, default off → today's image byte-for-byte) that opt-in the extra provider CLIs at build time, keeping the ca-certs-fixed base + uid/gid 1000 fallback intact. On the spawn side (`src/orchestra/spawn-backend-docker.ts`), thread the per-worker provider so the build/image selection passes the right build-args (or selects the right tag) — provider-agnostic, honest-fail when a requested provider's CLI is not in the image (clear error, never silent claude fallback — Yasa #2 + the ADR-076 auth-precedence lesson). Surgical: build-args default-off preserve the current single-CLI image exactly. Do NOT touch `package.json` (Task 12) or `worker-image-check.ts`. The docker `build`/`run` is exercised through the existing injectable spawn seam — the test never builds a real image.
### goNogo
- goCriteria: hermetic test (injected spawn seam) asserts the assembled docker build invocation passes the correct `--build-arg` for a codex/gemini worker and NONE (default image) for a claude worker (pre-fix RED: no build-arg threading); `Dockerfile.worker` parses with the new ARG blocks default-off (single-CLI image unchanged); a requested provider absent from the image → honest error, no silent claude fallback; `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/docker-multicli-buildarg.test.ts` GREEN + existing docker-spawn tests GREEN.
- nogo: a real docker build in tests; changing the default (off) image; silent fallback to claude when a provider CLI is missing; touching package.json/worker-image-check.ts; `process.cwd()`.

## Task 14: KPI Faz-2 — Telegram/connector sprint-end KPI summary
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/connectors/kpi-sprint-summary.ts, src/connectors/connector-notify-adapter.ts, tests/connectors/kpi-sprint-summary.test.ts
- Scope: src/connectors/, tests/connectors/
### Description
MASTER-PLAN §10 sprint-331 row (`:820`) — KPI Faz-2 open follow-up "Telegram sprint-end özeti". New `src/connectors/kpi-sprint-summary.ts` = a PURE formatter `buildKpiSprintSummary(views, lang)` that turns `KpiService.listSprintViews(sprintId)` output into a compact connector message (sprint id + the headline KPIs: cost_per_sprint / token_per_task / no-go rate / done — id/value/formatted/status), reusing EXISTING `kpi.*` `getMessage` keys for labels (do NOT edit messages.ts; no new keys). Wire it as an opt-in, **non-blocking** sprint-end hook in `src/connectors/connector-notify-adapter.ts` (the connector notify bridge — telegram/discord/whatsapp broadcast), so a finalized sprint emits the KPI summary alongside the existing end-of-sprint notification (`try { … } catch { debugLog }` — never fails the sprint or the notify path). Reads the same memory.db `KpiService` (READ-only; tenant `'default'`). Do NOT touch `connector-bootstrap.ts` (uncommitted social-identity work) or any telegram identity file. Tier-0 (connector internal; the formatter is the unit proof).
### goNogo
- goCriteria: hermetic test feeds seeded `KpiView[]` → `buildKpiSprintSummary` returns a deterministic message containing the sprint id + numeric headline KPI values with i18n labels (en + tr); empty views → an honest short message (no crash); the notify-adapter hook is non-blocking (an injected throw does NOT break the notify path); `tsc --noEmit` 0-new; `npx vitest run tests/connectors/kpi-sprint-summary.test.ts` GREEN + existing connector-notify tests GREEN.
- nogo: editing messages.ts or adding new keys (reuse existing `kpi.*`); the hook blocking/failing finalize or the notify path; touching `connector-bootstrap.ts`/identity files; hardcoded TR/EN; network.

## Task 15: W-B parity — `deckent_cost` MCP tool (CLI/MCP surface parity)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/mcp/tools/cost.ts, src/mcp/tools/index.ts, tests/mcp/cost-tool.test.ts
- Scope: src/mcp/tools/, tests/mcp/
### Description
MASTER-PLAN §10.5 W-B (`:735`) — "MCP missing vs CLI: … `deckent_cost`". The cost/usage surface exists on the CLI/data side (`src/core/cost-calculator.ts`, the usage/limit ledger) but there is no `deckent_cost` MCP tool, breaking CLI/MCP parity. New `src/mcp/tools/cost.ts`: `registerCostTool(server, deps)` exposing `deckent_cost` (args `{ sprint?, tenantId? }`, `readOnlyHint:true`) → returns the machine JSON cost view by delegating to the EXISTING cost/usage computation (READ-only; same SSOT the CLI uses — do NOT reimplement cost math). Register it in `src/mcp/tools/index.ts` following the existing `registerXTool` import+call pattern (additive — one import + one registration, no reordering). Provider-agnostic; tenant-aware; no network; no DB write. `index.ts` is this task's alone (Task 10 extends `kpi.ts` only).
### goNogo
- goCriteria: hermetic test invokes the registered tool against a seeded tmpdir state → returns valid cost JSON (numeric, delegated to the existing cost SSOT; empty → honest empty, no throw); registration additive in `index.ts` (existing tools untouched); `tsc --noEmit` 0-new; `npx vitest run tests/mcp/cost-tool.test.ts` GREEN.
- nogo: re-implementing cost computation instead of delegating to the existing SSOT; reordering/rewriting `index.ts` registrations; network; hardcoded pricing literals.

## Task 16: docs — sprint-332 status into MASTER-PLAN §10 (no silent debt, no over-claim)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Scope: docs/
### Description
Update `docs/MASTER-PLAN.md` §10 (and the relevant feature-matrix rows) to reflect the sprint-332 landings WITHOUT over-claim, flipping a status marker ONLY if the corresponding task actually landed DONE (else keep the current marker + note the remaining gap): KPI proof-of-function closed (`deckent kpi` no-arg latest-finalized fallback; forward-collection fires at finalize with REAL per-task cost/token); KPI Faz-2 surfaces added (dashboard card+trend page, `/api/kpi/trend`, `deckent_kpi --trend`, Telegram sprint-end summary, `deckent_cost` MCP); Windows beta-onboarding cluster (SPAWN-1 DEP0190, CFG-1 legacy-mode, F1-IMG-2 `image build`, DOC-PKG-1, F1-005 multi-CLI build-arg); F1-013 agentic HTTP-worker v1; 331-007 B-ZOMBIE doctor live-wire; F11-012 Ink encoding guard. Mark remaining open follow-ups EXPLICITLY (no silent debt): F1-013 multi-worker concurrency + ollama tool-loop parity (phase2); B-ZOMBIE i18n-centralization into messages.ts; F1-IMG-2 init/upgrade auto-integration; KPI Faz-2 dashboard polish + tool_calls/PR/ADR/bug instrumentation (remaining 2 KPIs) + Faz-3 multi-tenant RBAC/custom-KPI/SLO; W-H broader doc deliverables. Do NOT touch the uncommitted social-identity ADR/spec/connector files.
### goNogo
- goCriteria: MASTER-PLAN §10 reflects the sprint-332 deltas live; every still-open item explicitly flagged (no over-claim, no silent debt); a status marker is flipped ONLY where its task landed DONE; `npm run lint:link` + `npm run lint:adr` GREEN.
- nogo: marking any Faz-2/follow-up item "complete" when it is not; flipping a marker to done if its task did not land DONE; editing the uncommitted social-identity ADR/spec/connector files; touching any non-docs source file.
