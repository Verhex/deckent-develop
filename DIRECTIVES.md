# DIRECTIVES — Sprint 331: sprint-330 verification fixes + Beta-forward hardening (dogfood)

## Goal
Two-track sprint. **Track A (must-fix):** close the three sprint-330 post-sprint-verify findings
(`docs/audits/OVERNIGHT-2026-06-27-findings.md` → POST-SPRINT VERIFY): (1) the 3 generic
`throw new Error` convention regressions, (2) the recurring opus `outputTokens:null` token-capture
under-count, (3) the `deckent kpi` empty-until-next-finalize data-gap (009 TECH_DEBT). **Track B
(Beta-forward):** pull high-value, well-scoped, **distinct-file** next-work toward the Beta publish —
KPI Faz-1 closure + Faz-2 surfaces (MCP/API/trend), provider-independence finishers (F1-012 /
F1-014r), the F1-DF install Beta-blocker, provider token-capture parity (codex), and lifecycle/
observability hygiene (handoff-prune wire, zombie-daemon doctor surface). Every item below is sourced
to a read doc line — nothing invented.

**Records of truth (READ FIRST):**
- Findings: `docs/audits/OVERNIGHT-2026-06-27-findings.md` (§ POST-SPRINT VERIFY → the 3 fixes).
- Triage SSOT: `DECKENT-TRIAGE-PLAN.md` (B-HANDOFF-STALE storage-prune follow-up · B-ZOMBIE Faz-4 · R7).
- Forward plan: `docs/MASTER-PLAN.md` §10 + F1 matrix (F1-012:925/139 · F1-014r:927 · F1-DF:920 · MF-5:942 · F11-012:267) + KPI spec §13 Faz-2 follow-up.
- Error pattern: `src/core/errors.ts:3` `DeckentError` + `:583` `ErrorRegistry.createError` (highest registered code today = `DECKENT_E071`).

## 🔒 BAĞLAYICI — her task (3 Yasa anchor + collision-safety)
- **DISTINCT-FILE (KRİTİK):** hiçbir iki task `Files`/`Scope`'ta AYNI dosyayı listelemez. İki task tek dosyaya yazarsa = lock-collision-hang (sprint öldüren). Bu DIRECTIVES sıfır-dosya-kesişimi doğrulandı; worker yalnız kendi `Files` listesine yazar.
- **PROVIDER-AGNOSTIC (Yasa #2):** claude-varsayımı YOK; provider-yolları simetrik (opus/codex/ollama capture aynı kontrat). Desteklenmeyen provider **dürüstçe fail** eder, sessizce "claude"a düşmez. Cross-platform (macOS·Linux·Win-native+WSL): process-listeleme/spawn/shell platform-adapter ardına, unsupported = honest-fail.
- **DUAL-LENS + ÖLÇEK (Yasa #1):** her task hem deckent dogfood orkestrasyonunu hem son-kullanıcı ürününü (solo→en-büyük-şirket, milyon user/proje, multi-tenant) düşünür.
- **NO-MVP / god-level (Yasa #3):** kestirme/placeholder YOK; eksik bırakılan açıkça işaretlenir (gerekçeli `TODO(phase2)` tek istisna) — sessiz borç kabul edilmez.
- **Cerrahi + additive:** mevcut davranış byte-for-byte korunur; minimum-diff; ESM `.js` import zorunlu (Node16); `process.cwd()` YASAK → `join(root, …)`; mevcut export-imzaları kırılmaz.
- **i18n-first:** kullanıcı-görünür string `getMessage(key, lang)` (en/tr) — hardcode TR/EN = borç. Mekanizma modülleri string-free.
- **Hermetik test (zorunlu):** tmpdir, async (no `spawnSync`), no HOME/`.deckent`-leak, network **mock**'lı; her task **faithful** test (pre-fix RED / post-fix GREEN). `tsc --noEmit` 0-yeni-hata; değişen modülü import eden **affected-suite** yeşil; `npm run test:ci-sim` kırılmaz. **No haiku** (kod).
- **PROOF-OF-FUNCTION (ADR-079):** Tier-1 task (`src/cli/commands/`·`src/api/`·`src/dashboard/` veya o yüzeyi süren) `Smoke:` gerçek-binary satırı ile kapanır (mock yetmez). Tier-0 (core/orchestra/providers/mcp internal) unit-test-sufficient.
- **Dependencies konvansiyonu (sprint-330 kanıtlı):** `- Dependencies: 0` = bağımsız (bağımlılık yok). Gerçek bağımlılık varsa 1-tabanlı task numaraları (`- Dependencies: 3` = Task 3'e bağımlı).

---

## Task 1: Error-convention fix — 3 generic throws → DeckentError registry (sprint-330 fix #1)
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/kpi/kpi-definitions.ts, src/core/catalog/models-dev-source.ts, src/core/catalog/openrouter-source.ts, src/core/errors.ts, tests/core/error-handling-unification.test.ts
- Scope: src/core/, tests/core/
### Description
Findings POST-SPRINT VERIFY 🔴 FIX-#1. Replace the three remaining generic `throw new Error(...)` with the project `DeckentError` registry pattern (`src/core/errors.ts:3` + `ErrorRegistry.createError`). Sites: `kpi-definitions.ts:93` (KPI formula-error in `validateKpiDefinition`), `models-dev-source.ts:155` (HTTP `!res.ok`), `openrouter-source.ts:180` (HTTP `!res.ok`). In `errors.ts` register NEW codes (next free range after `DECKENT_E071`, e.g. `DECKENT_E072` catalog-source HTTP-fetch error, `DECKENT_E073` KPI definition formula-error) each with `message`+`suggestion` (+ human `whatHappened`/`why`/`howToFix`); use `ErrorRegistry.createError(code, {message})` at the 3 sites — preserving each site's existing control flow (catalog sources still catch→`return []` graceful, never propagate; the kpi validator still surfaces the formula message). Extend `error-handling-unification.test.ts` with a small describe asserting the 3 sites throw/produce `DeckentError` with the new codes. These 3 source files are EXCLUSIVELY this task's — no other task touches them.
### goNogo
- goCriteria: `npx vitest run tests/core/error-handling-unification.test.ts` GREEN (incl. new assertions); the 3 sites use `ErrorRegistry.createError`/`DeckentError` (zero `new Error(` left at those lines); new codes registered + `ErrorRegistry.has()` true; `npx vitest run tests/kpi/ tests/catalog/` still GREEN (graceful-`[]` + formula-validate behavior unchanged); `tsc --noEmit` 0-new.
- nogo: changing the catalog `return []` graceful contract (must NOT start propagating); leaving a bare `new Error` at any of the 3 lines; touching any file outside the 5 listed.

## Task 2: opus outputTokens:null robust capture — claude.ts extractUsage (sprint-330 fix #2)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/providers/claude.ts, tests/providers/claude-usage.test.ts
- Scope: src/providers/, tests/providers/
### Description
Findings POST-SPRINT VERIFY 🔴 FIX-#2 (recurring: 330-019 + 330-020 opus runs). `claude.ts` `extractUsage` (~`:447`) + `claudeUsageFromEnvelope` intermittently surface `outputTokens: null` for opus while `inputTokens`/`cacheReadTokens`/`cost` are real — i.e. capture is NOT systemically broken, but the opus `--output-format json` envelope's output-token field is not parsed robustly. Capture a FAITHFUL real opus-shaped envelope sample (the actual opus `{type:"result", usage:{...}}` shape — output may sit under a differently-named/nested field or arrive in a later/secondary envelope that the last-wins scan drops) and parse `output_tokens` so the result is a real number whenever the envelope reports it. Keep provider-agnostic `normalizeUsage` mapping intact; `null` MUST remain the honest signal ONLY when no output is reported at all (do NOT fabricate). Add a regression test with the real opus envelope asserting a non-null numeric `outputTokens`.
### goNogo
- goCriteria: new faithful test feeds a REAL opus `--output-format json` envelope → `extractUsage(...).outputTokens` is a real number (pre-fix RED: was null) while input/cacheRead/cost stay correct; existing `claude-usage.test.ts` cases (sonnet REAL_ENVELOPE, last-wins, no-cache, empty→null) still GREEN; `tsc --noEmit` 0-new; `npx vitest run tests/providers/claude-usage.test.ts` GREEN.
- nogo: fabricating an output-token number when the envelope truly carries none (must stay null); breaking the sonnet/haiku/no-cache paths; coupling to claude-only field names in a way that regresses `normalizeUsage`.

## Task 3: KPI live-backfill — `deckent kpi` computes from sprint history (sprint-330 fix #3, closes 009)
- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: typescript-expert, database-migration
- Files: src/core/kpi/kpi-backfill.ts, src/core/kpi/kpi-service.ts, tests/kpi/kpi-backfill.test.ts
- Scope: src/core/kpi/, tests/kpi/
### Description
Findings POST-SPRINT VERIFY 🔴 FIX-#3 (C5/009 data-gap: collection is forward-only → sprint-330 finalized pre-build → `deckent kpi` returns empty `kpis[]`). New `kpi-backfill.ts`: `backfillFromHistory(dbPath, tenantId)` — read existing sprint records from `.brain/memory.db` (via `MemoryStore` sprint history) → `deriveMeasurements` (reuse `collection.ts`, READ-only import) → `recordKpiMeasurements` for any sprint that has NO `kpi_measurements` yet (IDEMPOTENT — never double-records; guard on measurement-absence). Wire a single self-healing `ensureBackfill` into BOTH `KpiService` read paths (`listSprintViews` AND `getTrend`) so a fresh DB (no forward-collected data) is populated on first read using the SAME SSOT evaluator — no drift vs the live/rollup paths. Do NOT touch `kpi-store.ts` (kept distinct), `kpi.ts` CLI (Task 15), or `kpi-definitions.ts` (Task 1). Tenant-filtered throughout; default tenant `'default'`. Tier-1: the user-facing effect is `deckent kpi --json`.
### goNogo
- goCriteria: hermetic test seeds memory.db sprint history (no kpi_measurements) → `KpiService.listSprintViews` returns non-empty results with numeric `cost_per_sprint`; backfill IDEMPOTENT (2× = identical, no duplicate rows); tenant isolation preserved (tenant-A backfill never yields tenant-B rows); `tsc --noEmit` 0-new; `npx vitest run tests/kpi/` GREEN.
- nogo: double-recording on repeat reads; writing to `kpi-store.ts`/`kpi.ts`/`kpi-definitions.ts`; a backfill path that bypasses the SSOT evaluator (formula drift); network/`process.cwd()`.
Smoke: node dist/cli/entry.js kpi --json → kpis[] non-empty with a numeric cost_per_sprint value (computed from existing sprint history, not empty)

## Task 4: F1-012 — de-hardcode the 3 provider-registration sites (config-driven registry)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/core/provider.ts, tests/core/provider-registry-config.test.ts
- Scope: src/core/, tests/core/
### Description
MASTER-PLAN F1-012 (`:925` `[~]` + `:139`): the `config.providers.registry` field + bootstrap read-path landed (Sprint 292), but the THREE hardcoded registration sites in `provider.ts` remain: `adapterFactories` (~`:759`), `openaiCompatCandidates` (~`:823`), `applyDeckSecretsToEnv` (~`:659`). Make all three fully config-driven so adding a provider via `.deckent/config.json providers[]` (`{name, kind, baseURL?, apiKeyEnv?, region?, models[]}`) registers it dynamically WITHOUT widening a `ProviderName` union or editing code. Built-in providers stay byte-for-byte (config absent ⇒ today's behavior); config entries MERGE over built-ins (config precedence). Backward-compat is load-bearing. Do NOT change `applyDeckSecretsToEnv` token-isolation semantics (Task 13 tests them) beyond making the provider list config-sourced.
### goNogo
- goCriteria: hermetic test with a synthetic `providers[]` config registers an arbitrary openai-compat provider through all 3 sites (adapter resolvable + secret-env applied via `apiKeyEnv` + candidate-listed) with NO union edit; config-absent path = built-in claude/codex/gemini/ollama unchanged (backward-compat assertion); `tsc --noEmit` 0-new; `npx vitest run tests/core/auth-matrix.test.ts tests/core/provider-registry-config.test.ts` GREEN.
- nogo: breaking the built-in (config-absent) path; widening a `ProviderName` union instead of registry-validated string; changing per-provider credential isolation; cross-leak of one provider's key into another.

## Task 5: F1-DF — ship `Dockerfile.worker` in the npm package (Beta install-blocker)
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing
- Files: package.json, tests/build/npm-pack-dockerfile.test.ts
- Scope: ./, tests/build/
### Description
MASTER-PLAN F1-DF (`:920`, 🔴 HIGH, Windows-install bug report): with `spawn_backend=docker` deckent mandates `deckent-worker:latest` and tells the user to build from `Dockerfile.worker`, but `package.json files[]` = `["dist","bin","README.md","LICENSE"]` so the file is ABSENT on a fresh `npm i deckent` → docker backend unusable out-of-the-box (five code paths reference the un-shipped file: `worker-image-check.ts:157`, `spawn-backend-docker.ts:520`, `doctor.ts:1219`, `doctor-checks.ts:195`, `init-steps.ts:222`). Minimal god-level fix: add the canonical `Dockerfile.worker` (already at repo root, 2244 B, ca-certs-fixed) to `package.json files[]` so it ships on install. Surgical: add ONE array entry, do not reorder/reformat the rest of `package.json`. Hermetic test asserts `npm pack`'s file manifest includes `Dockerfile.worker` (parse `npm pack --dry-run --json` output in a tmpdir; no real publish). NOTE the F1-IMG consent-rebuild + `deckent image build` generator as an out-of-scope follow-up (do not implement here).
### goNogo
- goCriteria: `package.json files[]` contains `"Dockerfile.worker"`; test parses `npm pack --dry-run --json` and asserts the entry is present; no other `package.json` field changed (diff = one line); `tsc --noEmit` 0-new.
- nogo: reformatting/reordering `package.json`; bundling unrelated files into `files[]`; implementing the F1-IMG generator (scope creep).
Smoke: npm pack --dry-run 2>&1 | grep -q Dockerfile.worker → Dockerfile.worker present in the packed tarball manifest

## Task 6: B-HANDOFF-STALE — wire `pruneCompletedSprints` into sprint finalize (storage prune)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, tests/orchestra/handoff-prune-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
TRIAGE Faz-3 B-HANDOFF-STALE "storage-prune follow-up-noted" (`84adba34` scoped the HANDOFF_SUMMARY, but `.tasks/handoffs/` itself keeps accumulating cross-sprint). `HandoffProtocol.pruneCompletedSprints(currentSprintTaskIds)` (`handoff-protocol.ts:152`) is fully implemented + unit-tested but has ZERO prod callers. Wire it as a **non-blocking** hook at sprint finalize in `sprint-finalizer.ts` (alongside the existing end-of-sprint hooks): `try { new HandoffProtocol(projectRoot).pruneCompletedSprints(new Set(sprint.tasks.map(t => t.id))); } catch (e) { debugLog(...) }` — prune stale handoff files whose endpoints are NOT in the current sprint, leaving in-flight handoffs intact. Must never fail/block finalize. Reuse the existing `HandoffProtocol` import; do not modify `handoff-protocol.ts` (its prune logic is already correct + tested).
### goNogo
- goCriteria: faithful test — seed `.tasks/handoffs/` with stale (old-sprint) + current-sprint handoff files in a tmpdir, run finalize, assert stale files pruned + current retained + pruned-count > 0 (pre-wire RED: prune never called); hook is non-blocking (an injected throw does NOT fail finalize); existing finalize output byte-for-byte unchanged; `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/handoff-prune-wire.test.ts tests/orchestra/handoff-recovery-wire.test.ts` GREEN.
- nogo: pruning in-flight (current-sprint) handoffs; the hook blocking/failing the sprint; editing `handoff-protocol.ts`; using `process.cwd()`.

## Task 7: B-ZOMBIE — stale-daemon hygiene surfaced in `deckent doctor`
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/daemon-hygiene.ts, src/cli/commands/doctor-checks.ts, tests/core/daemon-hygiene.test.ts
- Scope: src/core/, src/cli/commands/, tests/core/
### Description
TRIAGE Faz-4 B-ZOMBIE (`:75`,`:82`): stale `dist/mcp/server.js` + old bot/serve/watch daemons from prior builds linger and emit spurious approvals; today CC hand-supplies PIDs for Alperen to kill — deckent should DETECT + SURFACE them honestly (it never auto-kills). New `daemon-hygiene.ts`: a PURE `detectStaleDaemons(snapshot: ProcessInfo[], opts): StaleDaemon[]` (flags long-lived `deckent`-owned `mcp/server.js`/`bot`/`serve`/`watch` processes that look orphaned) + a THIN cross-platform `listDeckentProcesses()` adapter behind a platform seam (unix `ps`-style / win `tasklist`-style via async `spawn`; unsupported platform → honest empty + flag, never silent). Wire a new ADVISORY check into `doctor-checks.ts` that prints found stale daemons + a copy-paste kill hint (i18n via `getMessage`, en/tr) or a PASS line — advisory only, never auto-kills, never fails doctor. The pure detector is fully hermetically testable with a fake snapshot.
### goNogo
- goCriteria: `detectStaleDaemons` flags a fabricated stale `dist/mcp/server.js` snapshot entry + ignores fresh/non-deckent processes (hermetic, no real spawn); platform lister behind an injectable seam (test passes a fake); doctor check is advisory (never kills, never throws, never fails the run); user-visible strings via `getMessage`; `tsc --noEmit` 0-new; `npx vitest run tests/core/daemon-hygiene.test.ts` GREEN.
- nogo: auto-killing any process; hardcoded TR/EN strings; a unix-only lister with no Windows path/honest-fail (Yasa #2); blocking/failing doctor; `process.cwd()`.
Smoke: node dist/cli/entry.js doctor → output includes the daemon-hygiene advisory line (stale-daemon list or a clean PASS), command exits without error

## Task 8: KPI Faz-2 — `deckent_kpi` MCP tool surface
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/mcp/tools/kpi.ts, src/mcp/tools/index.ts, tests/mcp/kpi-tool.test.ts
- Scope: src/mcp/tools/, tests/mcp/
### Description
KPI spec §13 Faz-2 follow-up (surfaces: dashboard/API/MCP/Telegram). New `src/mcp/tools/kpi.ts`: `registerKpiTool(server, deps)` exposing `deckent_kpi` (args: `{ sprint?, tenantId? }`) → reads `KpiService.listSprintViews` (READ-only import; no DB writes beyond the service's own self-heal) → returns the same machine JSON shape as `deckent kpi --json` (`{ sprintId, kpis:[{id,title,value,formatted,target,status,direction,format,unit}] }`). Register it in `src/mcp/tools/index.ts` following the existing `registerXTool` import+call pattern (additive — one import + one registration, no reordering). Tier-0 (MCP internal). Provider-agnostic; tenant-aware; no network.
### goNogo
- goCriteria: hermetic test invokes the registered tool against a seeded tmpdir memory.db → returns valid JSON `kpis[]` with numeric `cost_per_sprint`; registration is additive in `index.ts` (existing tools untouched); `tsc --noEmit` 0-new; `npx vitest run tests/mcp/kpi-tool.test.ts` GREEN.
- nogo: re-implementing the KPI computation instead of delegating to `KpiService` (SSOT); reordering/rewriting `index.ts` registrations; network; hardcoded titles (use `def.title[lang]`).

## Task 9: KPI Faz-2 — `/api/kpi` HTTP endpoint (Tier-1 surface)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/api/kpi-endpoint.ts, src/api/server.ts, tests/api/kpi-endpoint.test.ts
- Scope: src/api/, tests/api/
### Description
KPI spec §13 Faz-2 follow-up (API surface). New `src/api/kpi-endpoint.ts` mirroring the existing modular endpoint files (`coverage-endpoint.ts`/`evolution-endpoint.ts`/`autonomous-endpoint.ts` pattern): `registerKpiEndpoint(...)` serving `GET /api/kpi[?sprint=&tenantId=]` → `KpiService.listSprintViews` → JSON `{ sprintId, kpis:[...] }`. Tenant-scope MUST flow from the authenticated request principal (no cross-tenant leak — reuse the same `req`-threading the other endpoints use; do NOT register without `req` — ref A1/A2 IDOR lessons). Wire it into `src/api/server.ts` additively at the existing endpoint-registration site (one registration; do not refactor server.ts). Empty data → `200` with `{ kpis: [] }` (honest "no data", not 500). Tier-1.
### goNogo
- goCriteria: hermetic supertest-style test hits `GET /api/kpi` → `200` + valid JSON `kpis[]` (seeded DB → numeric value; empty DB → `[]`, never 500); tenant param scopes results (cross-tenant isolation assertion); registration additive in server.ts; `tsc --noEmit` 0-new; `npx vitest run tests/api/kpi-endpoint.test.ts` GREEN.
- nogo: registering the route without request-principal tenant scoping (IDOR); refactoring server.ts beyond the one registration; 500 on empty data; re-implementing KPI math (delegate to `KpiService`).
Smoke: node dist/cli/entry.js serve --port 3317 then curl -s localhost:3317/api/kpi → HTTP 200 with a JSON body carrying a kpis[] array

## Task 10: Ollama `/api/tags` health-gate before routing (Phase-2 hardening)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/ollama.ts, tests/providers/ollama-health-gate.test.ts
- Scope: src/providers/, tests/providers/
### Description
MASTER-PLAN AS-2 §4A Phase-2 hardening (`:341`): "`/api/tags` health-gate". Harden the ollama adapter so a worker is not dispatched to an unreachable ollama host. Add/extend `isAvailable()`/`diagnoseAvailability()` to probe `/api/tags` (the already-referenced locally-installed-models endpoint, `ollama.ts:139`) with the existing HTTP probe-timeout (`:52`) and report model availability honestly (host down / model absent → actionable false, NOT a silent hang). Keep the probe injectable (the adapter already exposes a `spawnImpl`/fetch seam) so the test never hits a real ollama. Network ONLY through the injectable seam; provider-agnostic honest-fail (no claude fallback).
### goNogo
- goCriteria: hermetic test — injected `/api/tags` mock returning models → gate true with model list; host-down (rejected fetch) → gate false + actionable reason (no throw, no hang); requested-model-absent → false; `tsc --noEmit` 0-new; `npx vitest run tests/providers/ollama-health-gate.test.ts` GREEN.
- nogo: real network in tests; silent fallback to another provider on ollama-down (must honest-fail); blocking/synchronous probe.

## Task 11: Codex token-capture parity — tokenUsage no longer zero (MF-5)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/providers/codex.ts, tests/providers/codex-usage.test.ts
- Scope: src/providers/, tests/providers/
### Description
MASTER-PLAN MF-5 (`:942`): "codex tokenUsage=0" — codex worker results land with zero token usage, breaking the Worker-Output-Contract (the F1-TOK/cost ledger) for the codex provider. `codex.ts` `extractUsage` (`:409`) / `extractUsageFromPayload` (`:596`) parse `completion_tokens ?? output_tokens` and default to `0`. Capture a FAITHFUL real codex `--output-format json` (or session-store) envelope sample and verify which usage fields it actually carries; fix the parse so real codex output yields real non-zero `inputTokens`/`outputTokens` (incl. `cached_input_tokens`/`reasoning_output_tokens` per the documented shape) whenever the envelope reports them. If the real envelope already parses correctly, lock it with the regression guard and record the true root cause (e.g. the log/source the worker feeds it) in result notes — honest, no invented fix. Provider-agnostic mapping via `normalizeUsage`; `null` stays the honest no-usage signal.
### goNogo
- goCriteria: faithful test with a REAL codex usage envelope → `extractUsage(...)` returns real non-zero input+output (pre-fix RED if a parse bug exists; if pre-existing-correct, the test still asserts the contract + notes document the upstream gap); existing codex tests GREEN; `tsc --noEmit` 0-new; `npx vitest run tests/providers/codex-usage.test.ts` GREEN.
- nogo: fabricating token numbers absent from the envelope; claiming a fix without a faithful real-shape test; coupling to claude/opus-only field names.

## Task 12: Cost-calculator honest-signal when outputTokens is unmeasured (no silent under-count)
- Model: opus
- Effort: normal
- Agent: data-engineer
- Skills: typescript-expert
- Files: src/core/cost-calculator.ts, tests/core/cost-calculator-null-output.test.ts
- Scope: src/core/, tests/core/
### Description
Findings (d) consequence: when `outputTokens` is `null`/unmeasured, `cost-calculator.ts:325` `Math.max(0, usage.outputTokens || 0)` silently treats it as `0` → cost under-counted with no signal. Defense-in-depth (complements Task 2/11 source fixes, distinct file): when the output side is `null`/`undefined` (NOT a real `0`), compute the cost but mark the result with an explicit `source:'output-unmeasured'` (or an equivalent honest flag in the existing return shape) so downstream (KPI/ledger) can distinguish "genuinely zero output" from "not captured". Additive only — existing export signatures + the real-numbers path stay byte-for-byte; the regime API (330-016) is untouched in behavior.
### goNogo
- goCriteria: test — `outputTokens:null` input → cost computed from input/cache side + an explicit under-count/unmeasured marker on the result (pre-fix: indistinguishable from real 0); `outputTokens:0` real-zero → NO under-count marker; existing cost-calculator tests (incl. regime) GREEN; `tsc --noEmit` 0-new; `npx vitest run tests/core/cost-calculator-null-output.test.ts tests/core/cost-calculator-regime.test.ts` GREEN.
- nogo: changing the numeric cost for the already-correct (real-number) path; breaking an existing export signature; removing the regime API; treating a real `0` as unmeasured.

## Task 13: F1-014r — runtime spawn-time per-worker auth non-leak (load-bearing contract)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/worker-auth-isolation.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
MASTER-PLAN F1-014r (`:927`): the per-worker auth-isolation UNIT contract landed (`auth-matrix.test.ts` on `applyDeckSecretsToEnv`), but the RUNTIME spawn-time guarantee is unverified — exactly the inverse that KILLED Sprint 213 (unconditional `ANTHROPIC_API_KEY` → API-mode → mass synthetic NO_GO; ADR-076). Add a runtime non-leak guarantee at the docker spawn env-assembly (`spawn-backend-docker.ts`): a subscription-Claude worker's spawned container env carries NO `ANTHROPIC_API_KEY`, and a non-Claude (codex/gemini/ollama) worker carries ONLY its own provider's credential — zero cross-leak. PRIMARILY a regression guard locking the invariant (hermetic, capturing the assembled env via the existing spawn seam without real docker); add a minimal guard ONLY if the test exposes a real leak (then faithful RED→GREEN), otherwise document the verified-correct state in notes. Do NOT alter `applyDeckSecretsToEnv` (Task 4 owns provider.ts); this is the downstream spawn-time assertion.
### goNogo
- goCriteria: hermetic test asserts the assembled per-worker spawn env: subscription-Claude → no `ANTHROPIC_API_KEY`; per non-claude provider → only its `apiKeyEnv`, no foreign keys (cross-leak = fail); no real docker/network (env captured via injectable seam); `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/worker-auth-isolation.test.ts` GREEN; existing docker-spawn tests GREEN.
- nogo: forwarding `ANTHROPIC_API_KEY` into a subscription worker; any cross-provider key leak; editing `provider.ts`/`applyDeckSecretsToEnv`; real docker spawn in tests.

## Task 14: MF-5 — enrich `-fix.result` with `brainEvaluation` (result-format consistency)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/fix-result-brain-eval.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
MASTER-PLAN MF-5 (`:942`): the main `.result` carries `brainEvaluation` post-EVALUATE (`sprint-phases.ts:1193-1203`) but the FIX-phase `-fix.result` LACKS it — a result-format inconsistency (consumers reading a fix-result get no brain verdict). Enrich the fix-result write so it carries the same `brainEvaluation` block as the main path (rubricScores stay intentionally audit-only in `.deckent/evaluations/`, `:1218-1225` — DOCUMENT, do not move them). Additive + surgical: mirror the existing main-path enrichment shape; preserve all other fix-result fields byte-for-byte; non-blocking (enrichment failure must not break the FIX phase).
### goNogo
- goCriteria: faithful test — a FIX-phase result write includes `brainEvaluation` with the same shape as the main `.result` (pre-fix RED: absent); rubricScores still audit-only (not in the fix-result); other fix-result fields unchanged; enrichment non-blocking; `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/fix-result-brain-eval.test.ts` GREEN + existing sprint-phases eval tests GREEN.
- nogo: moving rubricScores into the result; changing main-path `.result` output; the enrichment failing/blocking the FIX phase; a broad sprint-phases refactor.

## Task 15: KPI Faz-2 — `deckent kpi --trend <kpiId>` CLI (surface existing getTrend)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/kpi.ts, tests/kpi/kpi-trend-cli.test.ts
- Scope: src/cli/commands/, tests/kpi/
- Dependencies: 2
### Description
KPI spec §13 Faz-2 (trend surface). `KpiService.getTrend(kpiId, n)` exists but no CLI exposes it. Add `deckent kpi --trend <kpiId> [--n <count>] [--json]` to `src/cli/commands/kpi.ts`: render the old→new series (table via existing `formatTable`/i18n headers + `formatKpiValue`, or `--json` `{ kpiId, series:[{periodKey,value,status}] }`). Reuse the existing command's root/dbPath/lang resolution (no new sources). i18n-first; reuse existing `kpi.*` message keys where possible (do NOT touch `messages.ts` — kept collision-free; if a new label is truly required, justify and add minimally — but prefer reusing existing keys + the KPI title). Depends on Task 3 so the trend has backfilled historical results to read.
### goNogo
- goCriteria: `kpi --trend cost_per_sprint --json` emits valid JSON series (old→new) from `getTrend`; table mode renders i18n headers + formatted values + direction arrow; empty history → honest empty series / `kpi.no_data` (not a crash); `tsc --noEmit` 0-new; `npx vitest run tests/kpi/kpi-trend-cli.test.ts` GREEN.
- nogo: re-implementing trend math (delegate to `KpiService.getTrend`); hardcoded TR/EN; editing `messages.ts` if existing keys suffice; crash on empty history.
Smoke: node dist/cli/entry.js kpi --trend cost_per_sprint --json → valid JSON with a series[] array (≥1 point after backfill)

## Task 16: docs — sprint-331 status into MASTER-PLAN §10 (no silent debt)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Scope: docs/
- Dependencies: 2, 3
### Description
Update `docs/MASTER-PLAN.md` §10 to reflect sprint-331 landings WITHOUT over-claim: KPI Faz-1 live-backfill closes the 009/C5 data-gap (`deckent kpi` now computes from history) + Faz-2 surfaces (MCP/API/trend) added; F1-012 3-site de-hardcode line-verified → flip `[~]`→`[x]` ONLY if Task 4 actually landed DONE (else keep `[~]` + note remaining); F1-DF Dockerfile.worker now shipped; F1-014r runtime non-leak guard added; B-HANDOFF-STALE storage-prune wired; codex token-capture + opus output-capture fixed. Mark remaining open follow-ups explicitly: KPI Faz-2 dashboard/Telegram surfaces + tool_calls/PR/ADR/bug instrumentation; F1-IMG consent-rebuild + `deckent image build` generator; SPAWN-1 DEP0190 (`provider.ts:346` + `subprocess.ts:159`) deferred (provider.ts owned this sprint by F1-012); F11-012 render-path encoding regression for the Ink path. Do NOT touch the uncommitted social-identity ADR/spec files.
### goNogo
- goCriteria: MASTER-PLAN §10 reflects the sprint-331 deltas live; every still-open item explicitly flagged (no over-claim, no silent debt); `npm run lint:link` + `npm run lint:adr` GREEN.
- nogo: marking any Faz-2/follow-up item "complete" when it is not; flipping F1-012 to `[x]` if Task 4 did not land DONE; editing the uncommitted social-identity ADR/spec files.
