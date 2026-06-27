# DIRECTIVES — Sprint 333: AS-2 multi-provider hardening + KPI Faz-2 close-out + Beta-forward hygiene (dogfood)

## Goal
**Verify-first sprint.** Sprint-332 (committed `38185e8b`, "17/17, 0 NO_GO") actually landed FAR
more than its mid-sprint §10 ledger row claims (the row under-counts "7 not-executed" — the files
are on disk and committed). A code-level disk-verify (file:line) confirms the following surfaces are
**already DONE — DO NOT REDO**: KPI dashboard `KpiCard`+`KpiTrendPage` (real `useApi`→`/api/kpi`,
routed `App.tsx:54`, nav `Sidebar.tsx:76`, i18n `en/tr`), `/api/kpi`+`/api/kpi/trend` endpoints
(registered `server.ts:831/834`, real `createHttpServer` integration tests), `deckent_kpi --trend`
MCP (`kpi.ts:129/144`), `deckent_cost` MCP (registered `mcp/tools/index.ts:135`, delegates SSOT),
F1-IMG-2 `deckent image build` command (`cli/index.ts:156`), F1-013 agentic HTTP-worker
(`openai-compatible.ts:279` spawn() implemented, `http-agentic-worker.ts` real loop), F1-005
Dockerfile multi-CLI build-arg (`Dockerfile.worker:26-35`, `spawn-backend-docker.ts:372`), F11-012
Ink UTF-8 guard (`stream-segmenter.ts:60-97`), proof-of-function gate wire (`sprint-phases.ts:1449`),
mission crash-recovery (`mission-engine-wire.ts:114`), SAFETY_FLOOR docker enforcement
(`spawn-backend-docker.ts:502`), worker-authority emit (`worker.ts:589`).

This sprint pulls the **genuinely-remaining, code-verified, surgical, distinct-file** work toward the
Beta publish across three tracks. **Track A (AS-2 multi-provider):** F1-014 spawn-time per-worker auth
NON-LEAK for the SUBPROCESS backend (the verified residual gap — `subprocess.ts:199-205` spreads the
full `process.env`, leaking cross-provider keys; the docker allowlist already landed 331-013), and
F1-010 dynamic subs→API overflow gate (flag-gated, default-off — `provider-overflow.ts:resolveWithOverflow`
exists but is only reactive in FIX phase). **Track B (KPI Faz-2 close-out):** the KPI threshold-breach
advisory (status is computed `rollup-engine.ts:41` but never surfaced) + a Tier-1 REAL-BINARY e2e smoke
that closes the ADR-079 proof-of-function gate for the KPI HTTP surfaces (which landed with in-process
tests only) AND live-proves the sprint-332 forward-collection fix (cost/token now populate at the
sprint-333 finalize). **Track C (Beta-forward hygiene):** cost-gate daily/monthly WARN-ONLY wire
(`checkSpendGate` built `cost-gate.ts:232` but zero-caller), `deckent status` `failedTasks:0` honesty,
SIEM missing-transport silent-discard → warn, DOC-PKG-1 README dangling `docs/` link, F1-IMG-2
init/upgrade auto-integration (the explicitly-deferred remainder), i18n hardcode cleanup +
B-ZOMBIE daemon-string centralization into `messages.ts`, an EN getting-started cookbook doc, and a
docs task that **corrects the stale §10 sprint-332 ledger row** + records sprint-333. Every item is
sourced to a read-doc/code line — nothing invented; padding to a higher task count would mean redoing
finished work or inventing, which is forbidden.

**Deliberately DROPPED (not invented, not redone):**
- **Telegram/connector KPI summary wiring** — `buildKpiSprintSummary` (`kpi-sprint-summary.ts`) is built+tested and the `kpiSummaryFn` hook exists (`connector-notify-adapter.ts:41`), but its ONLY prod wire-point is `connector-bootstrap.ts:329/995`, which is in the **off-limits uncommitted social-identity dirty-tree** → wiring would collide; deferred to after that work merges.
- **R7 `OutputCollector.collect`→SSE** — `.collect()` zero prod-caller (`output-stream.ts:181` uses `getSnapshot` only); wiring needs spawn-path container-name integration across 3 backends = NOT surgical (TRIAGE confirms). Drop.
- **avg-tool-call KPI (2 remaining Faz-2 KPIs)** — tool-call count is not in `TaskResultV1`; instrumenting it requires editing `agentic-worker-runner.ts` (off-limits dirty-tree). Defer to phase2.

**Records of truth (READ FIRST):**
- Findings: `docs/audits/OVERNIGHT-2026-06-27-findings.md` (§ "Sprint-332 — POST-SPRINT VERIFY" → cost/token will populate from sprint-333 forward-collection; KPI Faz-2 surfaces that were TECH_DEBT).
- Triage SSOT: `DECKENT-TRIAGE-PLAN.md` (B6 cost-gate warn-only · B7 SIEM/telemetry · küçük-surgical kuyruğu failedTasks · B-ZOMBIE i18n remainder · enterprise/MOD-SPLIT removed 2026-06-26).
- Forward plan: `docs/MASTER-PLAN.md` §10 (sprint-330/331/332 rows `:819-821` — open follow-ups) + F1 matrix (F1-014 per-worker auth isolation · F1-010 subs→api overflow · F1-009 `provider-overflow.ts`) + KPI spec §13 Faz-2 (threshold-breach advisory).
- Code anchors: `src/providers/subprocess.ts:199-205` (env leak) · `src/orchestra/spawn-backend-docker.ts:840-851` (docker allowlist, done) · `src/core/provider-overflow.ts:88-145` (resolveWithOverflow) · `src/core/cost-gate.ts:232-270` (checkSpendGate, unwired) · `src/core/kpi/rollup-engine.ts:41-58` (computeStatus) · `src/mcp/tools/status.ts:456/482` (failedTasks:0) · `src/core/siem-forwarder.ts:134-136` (silent discard) · `src/api/server.ts:831/834` (KPI endpoints registered).

## 🔒 BAĞLAYICI — her task (3 Yasa anchor + collision-safety)
- **DISTINCT-FILE (KRİTİK):** hiçbir iki task `Files`/`Scope`'ta AYNI dosyayı listelemez. İki task tek dosyaya yazarsa = lock-collision-hang (sprint öldüren). Bu DIRECTIVES **sıfır-dosya-kesişimi doğrulandı** (12 task, dosya-kesişim taraması yapıldı); worker yalnız kendi `Files` listesine yazar. **`src/cli/helpers/messages.ts` YALNIZ Task 10'a (i18n-cleanup) aittir** (paylaşılan hot-file) → başka HİÇBİR task messages.ts'i düzenlemez; user-facing string isteyen task **mevcut `getMessage` anahtarlarını yeniden kullanır**, yeni anahtar gerekirse gerekçeli `TODO(phase2)` not düşer. Çalışma-ağacındaki **commit-edilmemiş** dosyalar (`src/core/config-types.ts`, `src/connectors/connector-bootstrap.ts`, `src/connectors/identity/providers/scim.ts`, `src/agents/agentic-worker-runner.ts`, identity test'leri `tests/connectors/identity/*`, `tests/core/identity-config-faz3.test.ts`) **hiçbir task tarafından dokunulmaz** (sosyal-identity Faz-3 işi — karışma).
- **PROVIDER-AGNOSTIC (Yasa #2):** claude-varsayımı YOK; provider-yolları simetrik (opus/codex/ollama/openai-compat aynı kontrat). Desteklenmeyen provider/platform **dürüstçe fail** eder, sessizce "claude"a düşmez. Cross-platform (macOS·Linux·Win-native+WSL): process-listeleme/spawn/shell/env platform-adapter ardına, unsupported = honest-fail. (F1-014/F1-010 doğrudan bu yasanın altında.)
- **DUAL-LENS + ÖLÇEK (Yasa #1):** her task hem deckent dogfood orkestrasyonunu hem son-kullanıcı ürününü (solo→en-büyük-şirket, milyon user/proje, multi-tenant) düşünür.
- **NO-MVP / god-level (Yasa #3):** kestirme/placeholder YOK; eksik bırakılan açıkça işaretlenir (gerekçeli `TODO(phase2)` tek istisna) — sessiz borç kabul edilmez.
- **Cerrahi + additive:** mevcut davranış byte-for-byte korunur; minimum-diff; ESM `.js` import zorunlu (Node16); `process.cwd()` YASAK → `join(root, …)`; mevcut export-imzaları kırılmaz. Riskli/davranış-değiştiren kod (F1-010 dynamic-overflow, cost-gate) **flag-gated default-off** + additive.
- **i18n-first:** kullanıcı-görünür string `getMessage(key, lang)` (en/tr) — hardcode TR/EN = borç. Mekanizma modülleri string-free.
- **Hermetik test (zorunlu):** tmpdir, async (no `spawnSync`), no HOME/`.deckent`-leak, network **mock**'lı; her task **faithful** test (pre-fix RED / post-fix GREEN). `tsc --noEmit` 0-yeni-hata; değişen modülü import eden **affected-suite** yeşil; `npm run test:ci-sim` kırılmaz. **No haiku** (kod).
- **PROOF-OF-FUNCTION (ADR-079):** Tier-1 task (`src/cli/commands/`·`src/api/`·`src/dashboard/`) `Smoke:` gerçek-binary satırı ile kapanır (mock yetmez). Tier-0 (core/orchestra/providers/mcp/connectors/repl internal) unit-test-sufficient.
- **Dependencies konvansiyonu (sprint-331 BUG düzeltmesi — DİKKAT):** `- Dependencies: N` **0-TABANLI task index**'tir (`0` = İLK task = Task 1, `1` = Task 2, …). **Bağımsız task'ta `- Dependencies:` SATIRI HİÇ YAZILMAZ** (tamamen atlanır). `- Dependencies: 0` ASLA "bağımsız" anlamına gelmez — Task 1'e (ve self-task'ta kendine = deadlock) bağlar; sprint-331 planını bu kırdı. **Bu sprint'te 12 task'ın HEPSİ distinct-file + bağımsızdır → hiçbirinde `- Dependencies:` satırı YOKTUR.**

---

## Task 1: F1-014 — spawn-time per-worker auth NON-LEAK for the subprocess backend (AS-2)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/providers/subprocess.ts, tests/providers/subprocess-auth-noleak.test.ts
- Scope: src/providers/, tests/providers/
### Description
MASTER-PLAN F1-014 ("Per-worker auth isolation contract") — status ⚠️ partial: the non-leak UNIT contract landed (`tests/core/auth-matrix.test.ts` tests `applyDeckSecretsToEnv` — the secret-MAP), and the DOCKER spawn path got a runtime per-provider ALLOWLIST in 331-013 (`src/orchestra/spawn-backend-docker.ts:840-851` — claude→`ANTHROPIC_API_KEY` only / codex→`OPENAI_API_KEY` / gemini→`GOOGLE_API_KEY`, zero cross-leak). **The verified RESIDUAL gap is the SUBPROCESS (local, non-docker) backend:** `SubprocessSpawnBackend` spawns the worker with `env: { ...process.env, LANG, PYTHONIOENCODING }` (`src/providers/subprocess.ts:199-205`) — it spreads the FULL host `process.env` and NEVER merges/uses the `opts.env` per-provider credential overrides (grep `opts.env` in the spawn method = absent). On a multi-provider fleet this leaks `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_API_KEY` cross-provider into every subprocess worker — the exact inverse-failure class that KILLED Sprint 213 (unconditional `ANTHROPIC_API_KEY`→API-mode→mass synthetic NO_GO; ADR-076, `feedback_container_auth_precedence`). **God-level fix (mirror the docker allowlist contract, provider-agnostic):** at the subprocess spawn site, build the child env so it carries ONLY the worker's provider credential — start from a base env (non-secret host vars: PATH/LANG/HOME/PYTHONIOENCODING etc.), apply the per-provider secret map (`opts.env` from `applyDeckSecretsToEnv`), and SCRUB all other providers' credential keys (the same allowlist the docker backend uses — extract/share the allowlist source if it is exported, otherwise replicate the small key-set with a `TODO(phase2)` note to unify the two allowlists). Subscription claude worker gets NO `ANTHROPIC_API_KEY` (CLI session-auth, ADR-076). Unsupported/unknown provider → honest pass-through of ONLY base env (never a silent full-env leak). Behavior for a single-provider/no-secret spawn stays byte-for-byte (env still has PATH/LANG). `subprocess.ts` is this task's alone — do NOT touch `spawn-backend-docker.ts` (committed) or `auth-matrix.test.ts` (different layer). Tier-0 (provider internal; env-isolation test is the proof).
### goNogo
- goCriteria: faithful hermetic test seeds `process.env` with ANTHROPIC_API_KEY + OPENAI_API_KEY + GOOGLE_API_KEY and an injected spawn seam → spawning a `codex` worker yields a child env containing ONLY `OPENAI_API_KEY` (no ANTHROPIC/GOOGLE leak); a `claude` subscription worker yields NO `ANTHROPIC_API_KEY`; base non-secret vars (PATH/LANG) preserved (pre-fix RED: child env carries all three keys); `tsc --noEmit` 0-new; `npx vitest run tests/providers/subprocess-auth-noleak.test.ts` GREEN + existing providers/subprocess tests GREEN.
- nogo: spreading full `process.env` without scrubbing cross-provider keys; a claude subscription worker receiving `ANTHROPIC_API_KEY` (ADR-076 inverse-failure); a unix-only path without honest cross-platform handling (Yasa #2); real process spawn in the test; editing spawn-backend-docker.ts / auth-matrix.test.ts.

## Task 2: F1-010 — dynamic subs→API overflow gate (flag-gated, default-off) (AS-2)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/core/provider-overflow-gate.ts, src/orchestra/sprint-spawner.ts, tests/core/provider-overflow-gate.test.ts
- Scope: src/core/, src/orchestra/, tests/core/
### Description
MASTER-PLAN F1-010 ("Provider/auth load-balancing — when a subscription hits its rate/quota limit, overflow that worker to an API provider automatically; subs *and* API together for max throughput") — ⬜ proposed; today the static tier-preserving resolver `resolveWithOverflow` (`src/core/provider-overflow.ts:88-145`, landed Sprint 215 per F1-009) exists and is wired only REACTIVELY in the FIX phase (`src/orchestra/mid-sprint-adapter.ts:259` `applyRateLimitFailover` after a 429 already happened). The remaining piece is a PRE-SPAWN dynamic gate: before dispatching a worker, if the worker's subscription provider is currently rate-limited/quota-exhausted (signal already captured by `RateLimitState`/`shouldThrottle` in `src/core/token-quota.ts`), overflow that one worker to a configured API provider so the fleet keeps throughput. **Build it surgically + flag-gated default-off:** (1) new pure module `src/core/provider-overflow-gate.ts` exposing `decidePreSpawnOverflow({ task, rateLimitState, providerConfig })` → returns the overflow provider name (delegating tier-preservation to the EXISTING `resolveWithOverflow` — do NOT re-implement) or `null` when overflow is disabled / no limit / no configured API overflow target; provider-agnostic (any subs→any configured API provider). (2) Wire ONE additive call-site in `src/orchestra/sprint-spawner.ts` at the per-task provider-resolution point, behind a new config flag (e.g. `config.provider_overflow?.dynamic === true`, default `undefined`/off → byte-for-byte today's behavior). When enabled AND a worker's provider is rate-limited AND an overflow API provider is configured → swap that worker's provider; otherwise unchanged. Honest-fail: overflow requested but no API target configured → keep original provider + advisory note, never silently drop to claude (Yasa #2 + ADR-076). Tier-0 (orchestration internal; the gate decision is the unit proof). Multi-worker rebalancing + mid-flight (not just pre-spawn) overflow are explicit `TODO(phase2)` follow-ups, noted not stubbed.
### goNogo
- goCriteria: hermetic test drives `decidePreSpawnOverflow` over (a) flag-off → always `null` (no overflow); (b) flag-on + provider rate-limited + configured API target → returns that target (delegated through `resolveWithOverflow`); (c) flag-on + rate-limited + NO configured target → `null` + honest advisory (never claude-fallback); (d) flag-on + provider NOT limited → `null`; the `sprint-spawner.ts` wire is additive and a no-op when the flag is off (default config path byte-for-byte); `tsc --noEmit` 0-new; `npx vitest run tests/core/provider-overflow-gate.test.ts` GREEN + existing spawner/overflow tests GREEN.
- nogo: re-implementing tier-preserving overflow instead of delegating to `resolveWithOverflow`; changing default (flag-off) spawn behavior; silent claude fallback when no overflow target configured; touching `provider-overflow.ts` / `mid-sprint-adapter.ts`; `process.cwd()`.

## Task 3: KPI Faz-2 — threshold-breach advisory (status surfaced, not just stored)
- Model: opus
- Effort: normal
- Agent: data-engineer
- Skills: typescript-expert, testing-expert
- Files: src/core/kpi/breach-advisor.ts, src/orchestra/sprint-retro-writer.ts, tests/core/kpi/breach-advisor.test.ts
- Scope: src/core/kpi/, src/orchestra/, tests/core/kpi/
### Description
MASTER-PLAN §10 (`:819` KPI Faz-1 row + `:820/:821` KPI Faz-2 KALAN) lists "threshold-breach advisory" as an open Faz-2 follow-up. The KPI engine ALREADY computes a per-KPI health status — `computeStatus` (`src/core/kpi/rollup-engine.ts:41-58` → 'healthy'|'warning'|'critical'|'unknown' against each definition's target/threshold), persisted on `ResultRow.status` (`src/core/kpi/kpi-store.ts`) and merely DISPLAYED in the scorecard table (`src/cli/commands/kpi.ts`). Nothing surfaces a breach as an ADVISORY — a finalized sprint whose `cost_per_sprint`/`no_go_rate`/etc. breached its target passes silently. **Build it surgically:** new PURE module `src/core/kpi/breach-advisor.ts` = `buildKpiBreachAdvisory(views, lang)` that filters `KpiView[]` for `status !== 'healthy'` and returns a deterministic, compact advisory (each breached KPI: id/title, current value+formatted, target, status), reusing EXISTING `kpi.*` `getMessage` keys for labels (do NOT add new message keys / edit messages.ts — Task 10 owns it; a genuinely-missing label → `TODO(phase2)`). Wire it as ONE additive, NON-BLOCKING call in `src/orchestra/sprint-retro-writer.ts` (at the existing KPI-scorecard integration point, ~`:734`) so the retro appends a "KPI Breaches" advisory section after the scorecard — advisory only, never throws, never alters sprint outcome (`try { … } catch { debugLog }`). READ-only against `KpiService` (tenant `'default'`). Empty/all-healthy → no section (honest no-op, no crash). Tier-0 (core/orchestra internal; the formatter is the unit proof). `breach-advisor.ts` + the retro-writer hook are this task's alone — do NOT touch `kpi.ts`/`kpi-service.ts`/`rollup-engine.ts`/`kpi-store.ts`.
### goNogo
- goCriteria: hermetic test feeds seeded `KpiView[]` with one breached (status 'critical') + one 'healthy' KPI → `buildKpiBreachAdvisory` returns a deterministic message naming ONLY the breached KPI with its value/target/status + i18n labels (en + tr); all-healthy / empty views → empty/no-section (no crash); the retro-writer hook is non-blocking (an injected throw does NOT break retro generation); `tsc --noEmit` 0-new; `npx vitest run tests/core/kpi/breach-advisor.test.ts` GREEN + existing retro-writer/kpi tests GREEN.
- nogo: re-computing KPI status in the advisor (consume `status` from the view); editing messages.ts or adding keys; the hook blocking/failing retro; hardcoded TR/EN; touching kpi.ts/kpi-service.ts/rollup-engine.ts/kpi-store.ts.

## Task 4: KPI Faz-2 — Tier-1 REAL-BINARY e2e smoke harness (proof-of-function + cost/token live-proof)
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing
- Files: tests/e2e/kpi-surface-smoke.test.ts
- Scope: tests/e2e/
### Description
The KPI HTTP surfaces (`/api/kpi` `kpi-endpoint.ts`, `/api/kpi/trend` `kpi-trend-endpoint.ts`, registered `src/api/server.ts:831/834`) and the dashboard `/kpi` route landed in 331/332 with in-process (`createHttpServer`) integration tests — strong, but NOT the ADR-079 **real-binary** Tier-1 proof (the dashboard task 332-008 first hit a synthetic AUTH_FAILED NO_GO, so its real-binary `serve` smoke was not run). This task adds the consolidated e2e harness that proves the BUILT artifact actually serves these surfaces, and (per `OVERNIGHT-2026-06-27-findings.md` Sprint-332 POST-SPRINT VERIFY) live-proves the forward-collection fix: after a real finalize, `/api/kpi` carries non-zero cost. **Build a hermetic e2e harness** `tests/e2e/kpi-surface-smoke.test.ts` that: boots `node dist/cli/entry.js serve --port <free>` against a tmpdir project (seeded `.brain/memory.db` with finalized-sprint `kpi_results` via the real KpiStore, hermetic HOME, no project-root/HOME leak), waits for readiness (async, no `spawnSync`), then asserts `GET /api/kpi` → 200 + valid JSON scorecard (non-empty `kpis[]`, with a numeric `cost`-bearing KPI present), `GET /api/kpi/trend?kpiId=cost_per_sprint` → 200 + `series[]`, and `GET /` → 200 (dashboard shell). Tear down the server in `afterEach` (close handle — Windows handle-leak guard). If `dist/` is absent (fresh checkout, no build), SKIP with a clear message (the host-side `Smoke:` line below is the run-proven gate that deckent executes post-sprint). Cross-platform port/spawn handling (Yasa #2). This is a NEW test file ONLY — touches no source, owns no source surface (zero collision). Tier-1 e2e harness.
### goNogo
- goCriteria: harness boots the real `serve` binary against a seeded tmpdir, asserts `/api/kpi` (200, non-empty `kpis[]`, cost KPI present), `/api/kpi/trend` (200, `series[]`), `/` (200); hermetic (tmpdir HOME, async spawn, server closed in afterEach); dist-absent → honest skip (not a failure); `tsc --noEmit` 0-new; `npx vitest run tests/e2e/kpi-surface-smoke.test.ts` GREEN (or skip when dist absent).
- nogo: a mock-only test that never boots the real binary; HOME/project-root leak; `spawnSync` (event-loop freeze); leaving the server process/handle open; hardcoded port (must pick a free one); touching any source file.
Smoke: node dist/cli/entry.js serve --port 3334 then curl -s -o /dev/null -w "%{http_code}" localhost:3334/api/kpi and localhost:3334/api/kpi/trend?kpiId=cost_per_sprint and localhost:3334/ → all 200 (KPI scorecard + trend + dashboard shell served by the real binary)

## Task 5: B6 — cost-gate daily/monthly WARN-ONLY wire (visibility, never blocks)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, tests/orchestra/cost-gate-advisory.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
DECKENT-TRIAGE-PLAN.md B6 (R3, cost-gate `daily_max_usd`/`monthly_max_usd` defined/settable/displayed but NEVER enforced as a spend gate) — CC önerisi: "Şimdi **warn-only** wire (ucuz, görünürlük verir), hard-gate post-beta." Disk-verify: the warn-only gate logic is already BUILT but ZERO-CALLER — `checkSpendGate` (`src/core/cost-gate.ts:232-270`, returns `CostLimitWarnEvent | null`, hard `enforce_spend_gate` flag default-off) is referenced only in a docstring, never invoked; the config fields live in `cost-config-loader.ts:74-80`. **Wire it warn-only + non-blocking:** at sprint finalize (`src/orchestra/sprint-finalizer.ts`, alongside the existing post-sprint usage/cost summary where cumulative spend is already computed), read the spend window (`readSpendWindow`) + cost config (`loadCostConfig`), call `checkSpendGate`, and if it returns a non-null `CostLimitWarnEvent`, EMIT it as an advisory (`BRAIN→USER:COST_LIMIT_WARN`, non-blocking, visibility only) — wrapped `try { … } catch { debugLog }` so it NEVER fails/blocks finalize. The HARD spend-gate (`enforce_spend_gate`) stays default-off/post-beta (do NOT flip it). Provider-agnostic; tenant-aware; READ-only against the spend ledger (no DB write beyond what finalize already does). `sprint-finalizer.ts` is this task's alone — do NOT touch `cost-gate.ts` (the function is ready), `cost-config-loader.ts`, or `collection.ts`. Tier-0 (orchestration internal). NOTE the hard-gate enforcement as an explicit post-beta follow-up.
### goNogo
- goCriteria: faithful test drives the finalize cost-advisory hook over a tmpdir state where cumulative spend EXCEEDS a configured `daily_max_usd`/`monthly_max_usd` → a `COST_LIMIT_WARN` advisory is emitted (captured via an injected emitter, content carries the cap + actual) (pre-wire RED: no warn emitted); spend UNDER cap → no warn; an injected throw in the hook does NOT fail finalize; `enforce_spend_gate` stays off (finalize never blocked); finalize output otherwise byte-for-byte; `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/cost-gate-advisory.test.ts` GREEN + existing finalizer tests GREEN.
- nogo: hard-blocking/failing finalize on a spend breach (must be warn-only); flipping `enforce_spend_gate`; re-implementing the spend math (delegate to `checkSpendGate`/`readSpendWindow`); touching cost-gate.ts/cost-config-loader.ts/collection.ts; hardcoded thresholds.

## Task 6: status honesty — `failedTasks` reports real NO_GO count (CLI/MCP contract)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/mcp/tools/status.ts, tests/mcp/status-failed-tasks.test.ts
- Scope: src/mcp/tools/, tests/mcp/
### Description
DECKENT-TRIAGE-PLAN.md küçük-surgical kuyruğu — the `deckent_status` MCP tool hardcodes `failedTasks: 0` (`src/mcp/tools/status.ts:456` and `:482`) instead of the already-computed NO_GO count, so an API/MCP consumer always sees zero failures even when a sprint had real NO_GO tasks (dishonest contract; violates `feedback_zero_hardcode_live_data`). **Surgical fix:** replace the two `failedTasks: 0` literals with the live `noGoCount` value already computed in the same handler (grep the function for the NO_GO/terminal-result tally; if a count variable exists, use it; otherwise derive it from the same results array the handler already reads — no new query). Keep the rest of the status payload byte-for-byte. Tenant-aware; READ-only; no new DB access. `status.ts` is this task's alone. Tier-0 (MCP internal; unit-test sufficient).
### goNogo
- goCriteria: hermetic test invokes the `deckent_status` handler against a seeded state with N NO_GO tasks → the returned `failedTasks` equals N (pre-fix RED: 0); a no-failure sprint → `failedTasks: 0` (correctly, from the live count); the rest of the status shape unchanged; `tsc --noEmit` 0-new; `npx vitest run tests/mcp/status-failed-tasks.test.ts` GREEN + existing status/mcp tests GREEN.
- nogo: leaving a hardcoded `0`; introducing a new DB query for a value already in scope; changing the rest of the status payload; touching other mcp tools.

## Task 7: B7 — SIEM forwarder: missing-transport silent discard → advisory warn
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/siem-forwarder.ts, tests/core/siem-forwarder-warn.test.ts
- Scope: src/core/, tests/core/
### Description
DECKENT-TRIAGE-PLAN.md B7 (telemetry + SIEM-forwarder default-off) — CC önerisi: SIEM "missing transport = sessiz-discard" yerine **en az bir uyarı** emit etsin (A-mini, ops-visibility). Disk-verify: `src/core/siem-forwarder.ts:134-136` silently drops the audit-event batch when no transport is configured (`if (!transport) return;` with no log/warn) → an operator who expects audit forwarding has zero signal that events are being discarded. **Surgical fix:** before the silent return, emit a single advisory (`debugLog`/stderr warn — once, not per-event; provider-agnostic) stating that SIEM forwarding is unconfigured and the batch is being discarded, with the config key to set. Keep the default-off behavior (privacy-default is intentional — do NOT auto-enable forwarding); only ADD visibility. Avoid log-spam: emit at most once per process/forwarder instance (guard a `warnedNoTransport` flag) — `TODO(phase2)` if a more structured ops-event channel is wanted later. `siem-forwarder.ts` is this task's alone. Tier-0 (core internal).
### goNogo
- goCriteria: faithful test constructs the forwarder with NO transport, submits a batch → a single advisory warn is emitted (captured via injected logger) AND the batch is still discarded (default-off preserved) (pre-fix RED: silent, no warn); a second submit does NOT re-warn (once-per-instance guard); a configured transport → no warn, normal forward; `tsc --noEmit` 0-new; `npx vitest run tests/core/siem-forwarder-warn.test.ts` GREEN + existing siem/audit tests GREEN.
- nogo: auto-enabling forwarding (must stay default-off); per-event warn spam; throwing instead of warning; touching telemetry.ts / audit pipeline; hardcoded TR/EN user-facing text (use the existing logging convention).

## Task 8: DOC-PKG-1 — no dangling `docs/` link survives in the published tarball (Beta onboarding)
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing
- Files: README.md, package.json, tests/build/readme-package-links.test.ts
- Scope: ./, tests/build/
### Description
MASTER-PLAN §10.5 `:803` #02 DOC-PKG-1 (🟡, Windows beta.1 report) + sprint-332 row `:821` ("DOC-PKG-1 … not executed"). The hermetic guard test `tests/build/readme-package-links.test.ts` exists, but the published README still references at least one RELATIVE `docs/…` path (e.g. `docs/reference/multi-provider.md`) that is NOT in `package.json files[]` (`["dist","bin","assets","Dockerfile.worker","README.md","LICENSE",…]` — `docs/` excluded) → that link 404s on a fresh `npm i deckent` (npmjs.com + local install). **God-level fix = README self-contained for the published package:** for EACH remaining relative `docs/…` link in the packed README, pick the minimal surgical option — rewrite it to the absolute canonical GitHub URL (resolves from npmjs.com + local install alike), OR add the small/canonical referenced doc asset to `package.json files[]` (byte-aligned, no field reorder/reformat). Make the existing test FAITHFUL: it parses `npm pack --dry-run --json` (tmpdir, no real publish) + scans the packed README for relative `docs/…` links and asserts NONE survives that is absent from the manifest (pre-fix RED on the current dangling link). Confirm which README is actually shipped (`files[]` ships root `README.md`) and target that one. NOTE the broader W-H doc deliverables (cookbook, EN user guide — Task 11 starts that) as out-of-scope here. `README.md`+`package.json`+the test are this task's alone.
### goNogo
- goCriteria: test parses `npm pack --dry-run --json` + the packed README and asserts NO relative `docs/…` link absent from the tarball (pre-fix RED: the current dangling link); `package.json` diff minimal (links rewritten and/or whitelisted assets added, no field reorder); `tsc --noEmit` 0-new; `npx vitest run tests/build/readme-package-links.test.ts` GREEN.
- nogo: reformatting/reordering `package.json`; bundling large/unrelated trees into `files[]`; leaving a dangling relative `docs/` link in the published artifact; touching unrelated docs; a real `npm publish`.
Smoke: npm pack --dry-run 2>&1 then verify every relative docs/ link in the packed README is either present in the manifest or rewritten to an absolute URL (no dangling link)

## Task 9: F1-IMG-2 — `deckent init`/`upgrade` opt-in worker-image build integration (Beta onboarding)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/init.ts, tests/cli/init-image-integration.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
MASTER-PLAN §10 sprint-332 row (`:821`) — explicit open follow-up "F1-IMG-2 `deckent image build` standalone command + **init/upgrade auto-integration** (… not executed)". The standalone `deckent image build` command LANDED (`src/cli/commands/image.ts` `handleImageBuild`, registered `cli/index.ts:156`, with `--tag`/`--dry-run`), but the onboarding flow never OFFERS it → a fresh Beta user must discover the worker image manually. **Add the opt-in integration into `src/cli/commands/init.ts`** (the onboarding entry): after the existing init steps, when docker is available and the worker image is absent, offer an OPT-IN "build the deckent-worker image now?" step that delegates to the EXISTING `handleImageBuild` (import READ-only from `image.ts` — do NOT edit it; do NOT re-implement the build) with a `--dry-run`-equivalent preview path; honest-fail/skip with an actionable message when docker is absent/unsupported (never silent, never auto-build without opt-in, never block init on docker). Respect non-interactive/CI mode (a `--yes`/`--no-image` or env guard → no prompt, default skip). Reuse existing init/image `getMessage` keys (do NOT edit messages.ts — Task 10 owns it; a genuinely-new string → `TODO(phase2)`). Surgical/additive — one new optional step, no reordering of existing init logic; existing init behavior (docker absent, or user declines) byte-for-byte. `init.ts` is this task's alone (Task 10 owns `evolve.ts`/`sync.ts`/`doctor-checks.ts`). Tier-1.
### goNogo
- goCriteria: hermetic test (injected docker-present/absent seam + injected `handleImageBuild` + tmpdir) — docker-present + image-absent + opt-in → `handleImageBuild` invoked with the resolved tag (no real docker; via the injected seam); docker-absent → honest skip message, init still succeeds (pre-add RED: init never references image build); non-interactive/`--no-image` → no prompt, no build; existing init steps unchanged; `tsc --noEmit` 0-new; `npx vitest run tests/cli/init-image-integration.test.ts` GREEN + existing init tests GREEN.
- nogo: a real docker build in tests; auto-building without opt-in; blocking/failing init when docker is absent; re-implementing the build (must delegate to `handleImageBuild`); editing `image.ts`/messages.ts; reordering existing init steps; `process.cwd()`.
Smoke: node dist/cli/entry.js init --help (or init in a tmpdir with --no-image) → the worker-image build step is surfaced/offered (opt-in), command exits 0 with no docker spawn

## Task 10: i18n-first cleanup — evolve/sync hardcoded strings + B-ZOMBIE daemon-string centralization (sole messages.ts owner)
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, src/cli/commands/doctor-checks.ts, src/cli/commands/evolve.ts, src/cli/commands/sync.ts, tests/cli/i18n-hardcode-cleanup.test.ts
- Scope: src/cli/helpers/, src/cli/commands/, tests/cli/
### Description
Quality-bar i18n-first (`feedback_god_level_i18n_quality_bar`) + MASTER-PLAN §10 (`:820/:821`) explicit open follow-up "B-ZOMBIE i18n-centralization into `messages.ts`" (331-007 GO_WITH_TECH_DEBT remainder). **This task is the SOLE owner of `src/cli/helpers/messages.ts` this sprint** (centralizes new keys so no other task touches the shared hot-file). Three surgical i18n cleanups, en+tr: (1) **B-ZOMBIE daemon-hygiene strings** — the daemon-hygiene advisory strings emitted from `src/cli/commands/doctor-checks.ts:595` (`checkDaemonHygiene`, wired live into doctor 332-006) are hardcoded; move them to `getMessage('doctor.daemon.*', lang)` keys in messages.ts and replace the literals. (2) **`evolve.ts` hardcoded strings** — `src/cli/commands/evolve.ts:17,21,25,29,38` ('No sprint data found…', 'Evolution Report — …', 'NO_GO trend', 'Agent Trends', 'Skill Trends') → `getMessage('evolve.*', lang)`. (3) **`sync.ts:469`** ('DECKENT.md not found. Run deckent init first.') → `getMessage('sync.*', lang)`. Add the new keys to BOTH `en` and `tr` blocks in messages.ts (mirror existing key structure; tr translations idiomatic). Mechanism unchanged — only the string source moves (behavior/output text byte-equivalent in `en`). Surgical: do NOT reformat unrelated message blocks or command logic; only the literal→`getMessage` swaps + the new keys. Tier-1 (`src/cli/commands/`).
### goNogo
- goCriteria: hermetic test asserts each migrated string resolves via `getMessage('<key>', 'en')` AND `getMessage('<key>', 'tr')` to non-empty, distinct values, and that `doctor-checks.ts`/`evolve.ts`/`sync.ts` no longer contain the hardcoded literals (grep-style assertion); `en` output text matches the prior literals (no user-visible change in English); `tsc --noEmit` 0-new; `npx vitest run tests/cli/i18n-hardcode-cleanup.test.ts` GREEN + existing messages/doctor/evolve/sync tests GREEN.
- nogo: leaving any of the listed literals hardcoded; missing the `tr` translation for a new key; reformatting unrelated messages.ts blocks or command logic; changing the English output text; another task editing messages.ts (this task is the sole owner).
Smoke: node dist/cli/entry.js evolve and node dist/cli/entry.js doctor → the evolution/daemon-hygiene lines render from i18n (English output unchanged), command exits 0

## Task 11: W-H — EN getting-started cookbook doc (Beta onboarding)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/getting-started-en.md
- Scope: docs/cookbook/
### Description
MASTER-PLAN §10 sprint-332 row (`:821`) — explicit open follow-up "W-H broader doc deliverables (cookbook, EN user guide)". Beta needs an English getting-started doc a fresh user can follow end-to-end. **Write `docs/cookbook/getting-started-en.md`** (a NEW file under a new `docs/cookbook/` dir — zero collision): install (`npm i -g deckent` / npx), `deckent init`, first `deckent plan`→`start`→`review` sprint, `deckent doctor` health check, `deckent kpi`/`deckent cost`/`deckent usage` visibility, and the multi-provider basics (config-driven provider registry, subscription vs API keys) — god-level (not MVP), accurate to the CURRENT CLI surface (verify command names/flags against `src/cli/` before writing — no stale/invented commands, `feedback_zero_hardcode_live_data`). Use ONLY canonical absolute links or in-repo links that exist; do NOT introduce links that DOC-PKG-1 (Task 8) would flag as dangling. English. Do NOT touch README.md/package.json (Task 8) or any source. NOTE deeper cookbook recipes (per-connector, ERP, autonomous) as out-of-scope follow-ups.
### goNogo
- goCriteria: `docs/cookbook/getting-started-en.md` exists with accurate, runnable steps (install→init→sprint→doctor→kpi/cost) verified against the real `src/cli/` command/flag names (no invented commands); links resolve (absolute or in-repo-present); `npm run lint:link` GREEN; no source/README/package.json touched.
- nogo: referencing a non-existent command/flag (stale/invented surface); dangling/relative links that 404; an MVP stub; touching README.md/package.json/any source; emoji in the doc.

## Task 12: docs — correct the stale §10 sprint-332 ledger + record sprint-333 (no over-claim, no silent debt)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md, docs/audits/OVERNIGHT-2026-06-27-findings.md
- Scope: docs/
### Description
Two doc updates, no over-claim. (1) **CORRECT the stale sprint-332 §10 row** (`docs/MASTER-PLAN.md:821`): it was written mid-sprint and under-counts ("8 DONE / 1 NO_GO / 7 not-executed"), but the committed reality (`38185e8b`, "17/17, 0 NO_GO") + disk-verify show those surfaces ACTUALLY landed and are committed — KPI dashboard `KpiCard`+`KpiTrendPage`, `/api/kpi/trend`, `deckent_kpi --trend`, `deckent_cost` MCP, F1-013 agentic HTTP-worker, F1-005 Dockerfile multi-CLI build-arg, F1-IMG-2 `deckent image build`, DOC-PKG-1 (test landed; README link remainder = Task 8), Telegram summary formatter (built; wiring blocked by uncommitted connector-bootstrap.ts). Rewrite the row to reflect committed truth, flipping a marker ONLY where disk-verified DONE, and keep the GENUINELY-open items explicit. (2) **Add the sprint-333 §10 row** reflecting THIS sprint's landings (only where each task lands DONE; else keep the gap noted): F1-014 subprocess auth non-leak, F1-010 dynamic overflow gate (flag-gated), KPI threshold-breach advisory, KPI Tier-1 e2e smoke + cost/token live-proof, cost-gate warn-only, status `failedTasks` honesty, SIEM warn, DOC-PKG-1 close, F1-IMG-2 init integration, i18n + B-ZOMBIE centralization, EN cookbook. Mark remaining EXPLICITLY (no silent debt): Telegram KPI wiring (blocked by connector-bootstrap.ts dirty-tree), avg-tool-call + output/accepted-PR KPIs (phase2, needs off-limits agentic-worker instrumentation), R7 SSE (not-surgical), F1-010 multi-worker/mid-flight overflow (phase2), cost-gate HARD enforcement (post-beta), KPI Faz-3 multi-tenant. (3) Append a short sprint-333 note to `OVERNIGHT-2026-06-27-findings.md` (verify-first findings + cost/token live-proof status). Do NOT touch the uncommitted social-identity ADR/spec/connector files.
### goNogo
- goCriteria: §10 sprint-332 row corrected to committed truth + sprint-333 row added; every still-open item explicitly flagged (no over-claim, no silent debt); a status marker flipped ONLY where disk-verified DONE; findings appended with sprint-333 status; `npm run lint:link` + `npm run lint:adr` GREEN.
- nogo: marking any phase2/blocked/Faz-3 item "complete"; over-claiming a sprint-333 task as DONE before it lands; editing the uncommitted social-identity ADR/spec/connector files; touching any non-docs source file.
