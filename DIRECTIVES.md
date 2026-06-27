# DIRECTIVES — Sprint 334: TOKEN/COST REAL-capture (P0) + AS-2/lifecycle hardening + KPI Faz-2 close-out + Beta-onboarding docs (dogfood)

## Goal
**P0-led sprint.** The overnight audit (`docs/audits/OVERNIGHT-2026-06-27-findings.md` §
"🔴 P0 BULGU: token/cost HEURISTIC") proved that every `.result` carries a **heuristic
estimate, NOT Anthropic's real usage**: across 61 results `cacheRead = inputTokens × 4`
exactly, `outputTokens = linesAdded × 15` exactly, `cacheCreationTokens = undefined` (61/61),
`tokenUsage.source = undefined` (61/61). Root cause (KESİN): `src/orchestra/token-counter.ts`
reads `.tasks/task-{id}.log`/`.cli-output.json` (worker stdout — the `--output-format json`
envelope never lands there) → falls back to `estimateTokenUsage` (token-counter.ts:401-403).
The REAL usage lives in the claude session-store `~/.claude/projects/{slugified-cwd}/*.jsonl`
as per-turn `message.usage{input_tokens,output_tokens,cache_read_input_tokens,
cache_creation_input_tokens}` (proven: a real worker session = in=18644/out=2314/
cacheRead=28324/**cacheCreate=47514** — vs heuristic 332-001 in=8354/out=825/cacheRead=33416/
**cacheCreate=0**; cacheCreation, the limit-dominant cost, was TOTALLY missed). **Task 1 is the
single most important fix in the whole campaign** — provider-agnostic real-usage capture.

A code-level disk-verify confirms what sprint-333 **already landed (committed `a297b99a`) — DO
NOT REDO**: F1-014 subprocess auth NON-LEAK (`subprocess.ts` `CROSS_PROVIDER_CREDENTIAL_KEYS`
scrub), F1-010 pre-spawn overflow gate (`provider-overflow-gate.ts`, flag-gated), KPI
threshold-breach advisor (`breach-advisor.ts` wired into retro), KPI Tier-1 e2e live-proof
harness (`tests/e2e/kpi-surface-smoke.test.ts`, value≈1.23 real cost round-trip), cost-gate
WARN-only finalize (`sprint-finalizer.ts`), status `failedTasks` honesty, SIEM warn-once,
DOC-PKG-1 close, F1-IMG-2 init integration, i18n + B-ZOMBIE centralization, EN getting-started
cookbook. The COST-CALCULATOR already prices cacheCreation correctly
(`cost-calculator.ts:349/387` `cacheWrite = cacheCreationTokens ?? 0`, ×1.25) — so once Task 1
feeds REAL cacheCreation through, cost auto-corrects with **zero** cost-calculator edits.

This sprint pulls the **genuinely-remaining, code-verified, surgical, distinct-file** work
across four tracks. **Track A (P0 token/cost real-capture):** Task 1 replaces the heuristic with
the summed session-store usage (incl. cacheCreation, `source='session-store'`) behind a
provider-adapter seam (codex/gemini can plug their own native store — Law #2). **Track B (AS-2 /
lifecycle hardening):** F1-014 phase-2 (unify + dynamic-ize the cross-provider key scrub so
config-declared `apiKeyEnv` providers are also covered — the explicit TODO at
`subprocess.ts:127`), the P0-C **recurrence** (sprint-333 start-process lingered ~27 min
post-close — wire orphan-termination into NORMAL finalize, not only `--force`), A20
`handleWorkerQuestion` honoring the worker's `suggestedAction` (flag-gated), and F1-013 phase-2
SCOPE_INSUFFICIENT event-stream parity in `http-agentic-worker.ts`. **Track C (KPI Faz-2
close-out):** Telegram sprint-end KPI dispatch (wired WITHOUT the off-limits
`connector-bootstrap.ts`) + threshold-breach advisory surfaced in the `deckent kpi` CLI.
**Track D (Beta-onboarding + records):** an EN multi-provider/cost cookbook recipe, ADR-093 for
the new native-usage-store seam, and a dated sprint-334 findings note. Every item is sourced to a
read-doc/code line — nothing invented; padding to a higher task count would mean redoing finished
work or inventing, which is forbidden.

**Deliberately DROPPED (not invented, not redone — explicit, no silent debt):**
- **Separate cost-calculator task** — UNNECESSARY: `cost-calculator.ts` already prices
  cacheCreation (`RegimeCostUsage.cacheCreationTokens` :236 → `calculateRegimeCost` :349/:387).
  Task 1 alone closes the cost gap; a cost-calc task would be redo.
- **avg-tool-call + output/accepted-PR KPIs (2 remaining Faz-2 KPIs)** — the `tool_calls` count
  is not in `TaskResultV1`; instrumenting it needs `agentic-worker-runner.ts` (off-limits dirty
  tree) OR a session-store-derived counter that would COLLIDE with Task 1's token-counter path.
  Defer to phase2 (a clean follow-on once Task 1's reader lands).
- **REPL web-search parity (F11)** — blocked: WebSearch needs an in-session approval UI (no
  permission-gate yet, memory `native_repl_tool_parity_gap`); skill-dispatch alone is included
  (Task 11). Web-search = `TODO(phase2)`.
- **R7 `OutputCollector.collect`→SSE** — not surgical (needs spawn-path container-name wiring
  across 3 backends; TRIAGE confirms). Drop.
- **F1-010 mid-flight / multi-worker overflow** — phase2 (TODO in code); pre-spawn gate landed
  333-002. **B-MIRROR** finalize-side-effect (skills-mirror delta misattribution) — grading-path,
  not a clean one-file fix; watch. **Telemetry wire (B7)** — privacy-sensitive, design-first.
- **§10 MASTER-PLAN ledger row** — **OFF-LIMITS this sprint** (`docs/MASTER-PLAN.md` +
  `DECKENT-TRIAGE-PLAN.md` are owned by another agent). The sprint-334 record goes into a NEW
  dated findings note (Task 9) + ADR-093 (Task 10), never MASTER-PLAN/TRIAGE.

**Records of truth (READ FIRST):**
- Findings: `docs/audits/OVERNIGHT-2026-06-27-findings.md` (§ "🔴 P0 BULGU: token/cost HEURISTIC"
  — root-cause + session-store approach + the 4-field FIX; § "Genuinely open after sprint-333").
- Triage SSOT (READ-ONLY): `DECKENT-TRIAGE-PLAN.md` (A20 ipc-question · F1-014 phase2 scrub-unify
  · lifecycle-robustness P0-C orphan recurrence · KPI Faz-2 Telegram/breach).
- Forward plan (READ-ONLY): `docs/MASTER-PLAN.md` §10 sprint-330..333 rows + open follow-ups +
  KPI spec §13 Faz-2.
- Code anchors: `src/orchestra/token-counter.ts:208/401-403` (log-read → heuristic fallback) ·
  `src/core/task-types.ts:410-413` (`TokenUsage` lacks `cacheCreationTokens`+`source`) ·
  `src/core/cost-calculator.ts:349/387` (cacheCreation ALREADY priced) ·
  `src/providers/subprocess.ts:127-133` (TODO(phase2): unify scrub-set + cover config `apiKeyEnv`) ·
  `src/orchestra/spawn-backend-docker.ts:820-847` (inline docker allowlist to unify) ·
  `src/cli/commands/finalize.ts:209-222` (`terminateOwnedSprintProcess` only on `--force`) ·
  `src/orchestra/sprint-pid-manager.ts:180-195` (the ownership-guarded terminator) ·
  `src/orchestra/ipc-registry.ts:227-244` (`handleWorkerQuestion` hardcodes `'continue'`,
  ignores `question.suggestedAction`) · `src/agents/http-agentic-worker.ts:33-36` (TODO(phase2)
  SCOPE_INSUFFICIENT event parity) · `src/connectors/kpi-sprint-summary.ts:43`
  (`buildKpiSprintSummary`, pure+tested) · `src/connectors/connector-notify-adapter.ts:32-42/193-213`
  (`kpiSummaryFn` hook) · caller-sites `src/cli/commands/start.ts:293`,
  `src/cli/commands/autonomous.ts:678`, `src/orchestra/sprint-runner-entry.ts:228` ·
  `src/cli/commands/kpi.ts` (scorecard render) · `src/cli/repl/native-tool-registry.ts:86-124`
  (no skill-dispatch tool).

## 🔒 BAĞLAYICI — her task (3 Yasa anchor + collision-safety)
- **DISTINCT-FILE (KRİTİK):** hiçbir iki task `Files`/`Scope`'ta AYNI dosyayı listelemez. İki task
  tek dosyaya yazarsa = lock-collision-hang (sprint öldüren). Bu DIRECTIVES **sıfır-dosya-kesişimi
  doğrulandı** (11 task, dosya-kesişim taraması yapıldı); worker yalnız kendi `Files` listesine
  yazar (başka task'ın dosyasını yalnız READ edebilir — örn. `src/core/task-types.ts`'i SADECE
  Task 1 YAZAR; Task 4 ondan `QuestionAction` tipini yalnız okur). **`src/cli/helpers/messages.ts`
  bu sprint OFF-LIMITS** (commit-edilmemiş/dirty) → HİÇBİR task ona dokunmaz; user-facing string
  isteyen task **mevcut `getMessage` anahtarlarını** veya **built-in-i18n helper'ları**
  (`breach-advisor` / `kpi-sprint-summary` zaten en+tr üretir) yeniden kullanır, gerçekten-yeni
  string → gerekçeli `TODO(phase2)`. Çalışma-ağacındaki **commit-edilmemiş/dirty** dosyalar
  (`src/cli/helpers/messages.ts`, `package.json`, `src/connectors/bot-agentic.ts` +
  `tests/connectors/bot-agentic-tool-approval.test.ts`, `docs/cookbook/getting-started-en.md`,
  identity `.deckent/identity.db*` + `tests/core/identity-config-faz3.test.ts`) ve prompt-avoid
  dosyaları (`src/core/config-types.ts`, `src/connectors/connector-bootstrap.ts`,
  `src/connectors/identity/providers/scim.ts`, `src/agents/agentic-worker-runner.ts`) **hiçbir
  task tarafından dokunulmaz**. `docs/MASTER-PLAN.md` + `DECKENT-TRIAGE-PLAN.md` **başka ajan'a
  ait → SALT-OKUNUR** (hiçbir task yazmaz).
- **PROVIDER-AGNOSTIC (Yasa #2):** claude-varsayımı YOK; provider-yolları simetrik
  (opus/codex/ollama/openai-compat aynı kontrat). Desteklenmeyen provider/platform **dürüstçe
  fail** eder, sessizce "claude"a düşmez. Cross-platform (macOS·Linux·Win-native+WSL):
  process-listeleme/spawn/shell/env/path platform-adapter ardına, unsupported = honest-fail.
  (Task 1 session-store reader, Task 2 dynamic-scrub, Task 3 orphan-terminate doğrudan bu yasanın
  altında — Task 1 native-usage-store **provider-adapter seam**'i ardında olur, codex/gemini kendi
  store'unu plug edebilsin; reader tmpdir-fixture ile test edilir, GERÇEK `~/.claude` ASLA okunmaz.)
- **DUAL-LENS + ÖLÇEK (Yasa #1):** her task hem deckent dogfood orkestrasyonunu hem son-kullanıcı
  ürününü (solo→en-büyük-şirket, milyon user/proje, multi-tenant) düşünür.
- **NO-MVP / god-level (Yasa #3):** kestirme/placeholder YOK; eksik bırakılan açıkça işaretlenir
  (gerekçeli `TODO(phase2)` tek istisna) — sessiz borç kabul edilmez.
- **Cerrahi + additive:** mevcut davranış byte-for-byte korunur; minimum-diff; ESM `.js` import
  zorunlu (Node16); `process.cwd()` YASAK → `join(root, …)`; mevcut export-imzaları kırılmaz.
  Riskli/davranış-değiştiren kod (Task 4 ipc-action, Task 2 dynamic-scrub) **flag-gated/additive
  default-byte-for-byte**.
- **i18n-first:** kullanıcı-görünür string `getMessage(key, lang)` (en/tr) — hardcode TR/EN = borç;
  `messages.ts` OFF-LIMITS olduğundan **yalnız mevcut anahtarlar / built-in-i18n helper'lar**
  kullanılır. Mekanizma modülleri string-free.
- **Hermetik test (zorunlu):** tmpdir, async (no `spawnSync`), no HOME/`.deckent`-leak, network
  **mock**'lı; her task **faithful** test (pre-fix RED / post-fix GREEN). `tsc --noEmit`
  0-yeni-hata; değişen modülü import eden **affected-suite** yeşil; `npm run test:ci-sim`
  kırılmaz. **No haiku** (kod).
- **PROOF-OF-FUNCTION (ADR-079):** Tier-1 task (`src/cli/commands/`·`src/api/`·`src/dashboard/`)
  `Smoke:` gerçek-binary satırı ile kapanır (mock yetmez). Tier-0
  (core/orchestra/providers/mcp/connectors/repl internal) unit-test-sufficient.
- **Dependencies konvansiyonu (sprint-331 BUG düzeltmesi — DİKKAT):** `- Dependencies: N`
  **0-TABANLI task index**'tir (`0` = İLK task = Task 1, `1` = Task 2, …). **Bağımsız task'ta
  `- Dependencies:` SATIRI HİÇ YAZILMAZ** (tamamen atlanır). `- Dependencies: 0` ASLA "bağımsız"
  anlamına gelmez — Task 1'e (ve self-task'ta kendine = deadlock) bağlar; sprint-331 planını bu
  kırdı. **Bu sprint'te 11 task'ın HEPSİ distinct-file + bağımsızdır → hiçbirinde
  `- Dependencies:` satırı YOKTUR.**

---

## Task 1: P0 — TOKEN-REAL-CAPTURE: replace heuristic token/cost with Anthropic's REAL session-store usage (THE top fix)
- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/token-counter.ts, src/core/task-types.ts, src/providers/session-usage-store.ts, tests/providers/session-usage-store.test.ts, tests/orchestra/token-counter-real-usage.test.ts
- Scope: src/orchestra/, src/core/, src/providers/, tests/providers/, tests/orchestra/
### Description
**The single most important fix in the campaign.** Today `src/orchestra/token-counter.ts` extracts
usage from `.tasks/task-{id}.cli-output.json` / `.tasks/task-{id}.log` (token-counter.ts:207-218);
the `--output-format json` envelope never lands in those (≈65-byte stdout) → it falls back to
`estimateTokenUsage` (token-counter.ts:401-403). Structural proof across 61 results: `cacheRead =
input×4` exactly, `output = linesAdded×15` exactly, `cacheCreationTokens=undefined` 61/61,
`tokenUsage.source=undefined` 61/61. The REAL per-turn usage lives in the claude session-store
`~/.claude/projects/{slugified-cwd}/*.jsonl` as `message.usage{input_tokens,output_tokens,
cache_read_input_tokens,cache_creation_input_tokens}` (proven real: in=18644/out=2314/
cacheRead=28324/cacheCreate=47514 — cacheCreation is the limit-dominant cost and was 100% missed).
**God-level provider-agnostic fix:** (1) **type** — add two ADDITIVE optional fields to
`TokenUsage` (`src/core/task-types.ts:410`): `cacheCreationTokens?: number` and `source?:
'session-store' | 'envelope' | 'estimate' | string` (additive; do NOT reorder/break the existing
shape; this file is Task 1's SOLE write — other tasks only read it). (2) **reader** — NEW pure
module `src/providers/session-usage-store.ts` exposing a provider-keyed `readNativeUsage(provider,
{ projectRoot, taskId, sessionId?, spawnWindow?, sessionRoot? })` that, for `provider==='claude'`,
resolves the worker's session jsonl under a configurable `sessionRoot` (default the slugified-cwd
path; **injectable for tests — the real `~/.claude` is NEVER touched in tests**), matches the
worker's session (by `session_id` captured from the `--output-format json` envelope at spawn IF
available, ELSE correlate by cwd + spawn-time window — newest jsonl modified within the window),
and SUMS all turns' `message.usage` into the 4 fields (input/output/cacheRead/**cacheCreation**);
codex/gemini return `null` with an honest `TODO(phase2)` (their native stores plug here later —
the Law #2 seam). Returns `null` when no real source exists. (3) **counter** — in
`token-counter.ts`, BEFORE the heuristic fallback, call `readNativeUsage(...)`; on a hit, build the
`TokenUsage` from the summed real usage and set `source='session-store'`; when the existing
envelope/`extractUsage` path yields data set `source` accordingly (`'envelope'`); ONLY when no real
source exists, keep `estimateTokenUsage` AND set `source='estimate'` honestly. Behavior for the
estimate path stays byte-equivalent EXCEPT the new honest `source` tag. NOTE: once real
cacheCreation flows, the EXISTING `cost-calculator.ts` (`RegimeCostUsage.cacheCreationTokens`
:236 → :349/:387) prices it — NO cost-calculator edit (would be redo). Tier-0 (orchestra/provider
internal; the fixture-sum test is the proof). `token-counter.ts` + `session-usage-store.ts` +
the `TokenUsage` fields are this task's alone — do NOT touch `cost-calculator.ts`,
`collection.ts`, `sprint-finalizer.ts`, `subprocess.ts`, `claude.ts`.
### goNogo
- goCriteria: FAITHFUL hermetic test seeds a tmpdir `sessionRoot` with a fixture session-store
  jsonl (≥2 turns carrying `message.usage` with all 4 fields incl. `cache_creation_input_tokens`)
  + a tmpdir `.tasks` → `readNativeUsage('claude', …)` returns usage where each of the 4 fields ==
  the jsonl SUM (input/output/cacheRead/**cacheCreation**), and the full `token-counter` path
  yields `tokenUsage.cacheCreationTokens === <sum>` (>0) and `tokenUsage.source==='session-store'`
  (pre-fix RED: heuristic `cacheRead===input×4`, `cacheCreationTokens===undefined`, `source===undefined`);
  a no-session fallback case → heuristic usage with `source==='estimate'` (honest); codex/gemini →
  `null` (honest seam); `tsc --noEmit` 0-new; `npx vitest run tests/providers/session-usage-store.test.ts
  tests/orchestra/token-counter-real-usage.test.ts` GREEN + existing token-counter tests GREEN.
- nogo: reading the REAL `~/.claude` in any test (must use an injected tmpdir `sessionRoot`);
  fabricating cacheCreation/source when no real source exists (estimate must self-label `'estimate'`);
  a claude-only path with no provider seam (codex/gemini must be a documented `null` extension
  point — Yasa #2); editing `cost-calculator.ts`/`subprocess.ts`/`claude.ts`/`collection.ts`;
  breaking the existing `TokenUsage` consumers (fields must be ADDITIVE optional); `process.cwd()`.

## Task 2: F1-014 phase-2 — unify + dynamic-ize the cross-provider credential scrub (config-driven apiKeyEnv coverage)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/providers/cross-provider-keys.ts, src/providers/subprocess.ts, src/orchestra/spawn-backend-docker.ts, tests/providers/cross-provider-keys-scrub.test.ts
- Scope: src/providers/, src/orchestra/, tests/providers/
### Description
Sprint-333 landed the F1-014 subprocess auth NON-LEAK via a STATIC `CROSS_PROVIDER_CREDENTIAL_KEYS`
set (`subprocess.ts:133`), with an explicit `TODO(phase2)` at `subprocess.ts:127-133`: "unify this
scrub-set with the docker forward-allowlist behind one place" + "Config-driven providers (F1-012)
with arbitrary `apiKeyEnv` are not [covered]". On a config-declared provider (F1-012 dynamic
registry, e.g. a custom `openai-compatible` provider whose `apiKeyEnv` is `MY_LLM_KEY`), that key
is NEITHER in the static scrub set NOR re-injected per-worker → it leaks cross-provider into every
subprocess worker (the Sprint-213 inverse-failure class, ADR-076). **God-level fix:** (1) NEW pure
module `src/providers/cross-provider-keys.ts` exposing `resolveCrossProviderCredentialKeys(opts?)`
= the static base set ∪ every registered provider's `apiKeyEnv` derived from the provider registry
config (`config.providers?.registry` / F1-012 `applyDeckSecretsToEnv` source) when supplied;
deterministic, deduped, provider-agnostic. (2) `subprocess.ts` — replace the inline static set with
a call to the shared resolver (passing the provider registry when available; absent → byte-for-byte
the current static-set behaviour), keeping the existing scrub→re-inject contract intact
(subscription claude → NO `ANTHROPIC_API_KEY`; codex → ONLY `OPENAI_API_KEY`). (3)
`spawn-backend-docker.ts` — replace its inline forward-allowlist (`:820-847`) with the same shared
resolver so the two allowlists are ONE source of truth (docker behaviour byte-for-byte preserved —
faithful regression required). Unknown/unsupported provider → honest base-env only, never a silent
full-env leak. Tier-0 (provider/orchestra internal; the env-isolation test is the proof).
`cross-provider-keys.ts` + `subprocess.ts` + `spawn-backend-docker.ts` are this task's alone — do
NOT touch `claude.ts` / `token-counter.ts` (Task 1) / `session-usage-store.ts` (Task 1).
### goNogo
- goCriteria: faithful hermetic test — `resolveCrossProviderCredentialKeys` returns the static base
  ∪ a config provider's `apiKeyEnv` (e.g. `MY_LLM_KEY`); a subprocess spawn for a config provider
  scrubs `MY_LLM_KEY` from foreign workers and re-injects ONLY the owning worker's key (pre-fix RED:
  `MY_LLM_KEY` leaks because the static set misses it); subscription claude → NO `ANTHROPIC_API_KEY`;
  docker backend still scrubs/forwards identically to today (regression GREEN); base PATH/LANG
  preserved; `tsc --noEmit` 0-new; `npx vitest run tests/providers/cross-provider-keys-scrub.test.ts`
  GREEN + existing subprocess/spawn-backend-docker tests GREEN.
- nogo: leaving config `apiKeyEnv` providers unscrubbed; changing docker forward-allowlist behaviour
  (must be byte-for-byte via the shared resolver); a claude subscription worker receiving
  `ANTHROPIC_API_KEY` (ADR-076 inverse-failure); real process spawn in the test; touching
  Task-1 files; `process.cwd()`.

## Task 3: P0-C recurrence — terminate the orphan start-process at NORMAL finalize (not only --force)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/finalize.ts, tests/cli/finalize-orphan-normal.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
DECKENT-TRIAGE lifecycle-robustness P0-C (`a1fb52de`) made `finalize --force` SIGTERM the orphan
`deckent start` coordinator via `terminateOwnedSprintProcess(root, sprintId)`
(`src/orchestra/sprint-pid-manager.ts:180`). **It RECURRED in sprint-333:** after a NORMAL sprint
close the start-process **lingered ~27 minutes** post-finalize (audit observation). Disk-verify:
in `src/cli/commands/finalize.ts:209-222` the terminator is called ONLY inside the
`incomplete.length > 0` (force) branch; the normal-finalize path calls `clearPid` (via
`persistFinalSprintState`) but never terminates a still-alive owned coordinator that lingers (idle
event-loop). **Surgical fix:** after `finalizeSprint` completes on the NORMAL (non-force) path in
`finalize.ts`, call the EXISTING ownership-guarded `terminateOwnedSprintProcess(root, sprintId)`
too — BUT guarded so it NEVER suicides when finalize runs IN the coordinator itself: read the
recorded pid and SKIP the signal when it equals `process.pid` (self) — the existing
`verifySprintOwnership` start-token check already refuses a recycled/`reused` pid, this adds the
self-guard for the in-process case; emit the same advisory print the `--force` path uses when an
external owned pid is terminated. Do NOT re-implement the terminator (delegate to
`sprint-pid-manager.ts` — READ-only import) and do NOT touch `sprint-pid-manager.ts` /
`sprint-finalizer.ts` / `sprint-controller.ts`. NOTE the deeper "why does an idle coordinator
linger 27 min" (unref'd handle audit) as an explicit `TODO(phase2)` — this task delivers the
requested SIGTERM-at-finalize mitigation. Tier-1 (`src/cli/commands/`).
### goNogo
- goCriteria: faithful hermetic test (injected `kill`/`isAlive` deps via the terminator seam +
  tmpdir pid file) — NORMAL finalize with a recorded owned-and-alive pid that is NOT `process.pid`
  → terminator SIGTERMs it + clears pid + prints the advisory (pre-fix RED: normal path never
  terminates, pid lingers alive); recorded pid === `process.pid` (in-process) → NO self-signal;
  recorded-but-dead pid → no signal; `--force` path behaviour byte-for-byte; `tsc --noEmit` 0-new;
  `npx vitest run tests/cli/finalize-orphan-normal.test.ts` GREEN + existing finalize tests GREEN.
- nogo: self-killing the current process when finalize runs in the coordinator; re-implementing the
  terminator instead of delegating; signalling a `reused`/recycled pid; a real `process.kill` in the
  test; touching `sprint-pid-manager.ts`/`sprint-finalizer.ts`/`sprint-controller.ts`.
Smoke: seed a tmpdir project with a COMPLETE sprint-state + a recorded pid pointing at a live throwaway sleep process, run node dist/cli/entry.js finalize <sprintId> (no --force) → exits 0, prints the orphan-termination note, the sleep process is SIGTERM'd, and the pid file is cleared

## Task 4: A20 — `handleWorkerQuestion` honors the worker's suggestedAction (flag-gated default-off)
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/ipc-registry.ts, tests/orchestra/ipc-worker-question-action.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
DECKENT-TRIAGE A20 — `handleWorkerQuestion` (`src/orchestra/ipc-registry.ts:227-244`) hardcodes
`action: 'continue'` and DROPS the worker's `question.suggestedAction` (the `WorkerQuestion` type
carries `suggestedAction?: QuestionAction` where `QuestionAction = 'continue'|'skip'|'abort'|'retry'`
— `task-types.ts:420/428`), so a worker that asks to abort/retry/skip is always auto-continued; the
docstring calls this a "Future: Human Checkpoint" stub. **Surgical, flag-gated fix (behaviour-changing
→ default-off):** read `question.suggestedAction`; behind a new config flag (e.g.
`config.honor_worker_question_action === true`, default `undefined`/off → byte-for-byte today's
`'continue'`), when the flag is ON AND `suggestedAction` is present, write that action into the
`BrainAnswer` instead of the hardcoded `'continue'` (message reflects the honored action); when the
flag is off OR no `suggestedAction` → unchanged `'continue'`. READ `QuestionAction` from
`task-types.ts` (do NOT write it — Task 1 owns that file). Tenant-agnostic; no new DB access.
Tier-0 (orchestration internal; unit-test sufficient). `ipc-registry.ts` is this task's alone.
### goNogo
- goCriteria: hermetic test — flag-on + a question with `suggestedAction:'abort'` → the written
  `BrainAnswer.action === 'abort'` (pre-fix RED: always `'continue'`); flag-on + no `suggestedAction`
  → `'continue'`; flag-OFF (default) + `suggestedAction:'retry'` → `'continue'` (byte-for-byte
  today); `tsc --noEmit` 0-new; `npx vitest run tests/orchestra/ipc-worker-question-action.test.ts`
  GREEN + existing ipc-registry/result-collector tests GREEN.
- nogo: changing the default (flag-off) auto-answer; writing `task-types.ts`; honoring an action the
  worker did not request; an unbounded/destructive default; touching other orchestra files.

## Task 5: F1-013 phase-2 — http-agentic-worker SCOPE_INSUFFICIENT event-stream emission parity
- Model: opus
- Effort: normal
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/agents/http-agentic-worker.ts, tests/agents/http-agentic-scope-event.test.ts
- Scope: src/agents/, tests/agents/
### Description
F1-013 (sprint-332) landed the provider-agnostic agentic HTTP worker
(`src/agents/http-agentic-worker.ts`) with an explicit `TODO(phase2)` at lines 33-36:
"SCOPE_INSUFFICIENT event-stream emission parity with the Ollama runner (here the scope error is
fed to the model only)". Disk-verify: when a write/edit tool targets a path outside scope
(`isPathInScope` reject), the HTTP worker returns the violation to the MODEL only — it does NOT
emit a scope-violation event on the event-stream the way the ollama agentic runner does, so the
Auditor/Brain get no `NERVOUS_SCOPE_VIOLATION`/`SCOPE_INSUFFICIENT` signal for HTTP-provider
workers (asymmetric observability across providers — Yasa #2). **Surgical, additive fix:** at the
existing scope-reject site, ALSO emit the scope-violation event (mirror the ollama runner's
event-stream emission contract — reuse the existing event helper/type, do NOT invent a new event
shape), in ADDITION to feeding the error back to the model (behaviour for the model unchanged). The
scope HARD-reject (ADR-037 advisory→model) stays; only the missing event emission is added. The
deeper TODOs (streaming, tool-retries, multi-worker concurrency) stay explicit `TODO(phase2)` —
noted, not stubbed. Tier-0 (agent/provider internal; the emitted-event test is the proof).
`http-agentic-worker.ts` is this task's alone — do NOT touch `openai-compatible.ts` / `ollama.ts`
/ `agentic-worker-runner.ts` (off-limits dirty).
### goNogo
- goCriteria: hermetic test (injected event-emitter + injected tool dispatcher, no real spawn/network)
  — an out-of-scope write tool → the worker (a) still returns the violation to the model AND (b)
  emits exactly one scope-violation event with the offending path + taskId on the event-stream
  (pre-fix RED: zero event emitted); an in-scope write → no scope event; `tsc --noEmit` 0-new;
  `npx vitest run tests/agents/http-agentic-scope-event.test.ts` GREEN + existing tests/agents
  http-agentic suite GREEN.
- nogo: inventing a new event shape instead of reusing the ollama-runner contract; removing/altering
  the model-facing error feed; a real spawn/network in the test; touching openai-compatible.ts /
  ollama.ts / agentic-worker-runner.ts; per-tool event spam (one event per violation).

## Task 6: KPI Faz-2 — Telegram/connector sprint-end KPI summary dispatch (wired WITHOUT connector-bootstrap.ts)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/connectors/kpi-summary-dispatch.ts, src/cli/commands/start.ts, src/cli/commands/autonomous.ts, src/orchestra/sprint-runner-entry.ts, tests/connectors/kpi-summary-dispatch.test.ts
- Scope: src/connectors/, src/cli/commands/, src/orchestra/, tests/connectors/
### Description
MASTER-PLAN §10 (`:819`) + findings "Genuinely open after sprint-333" — the Telegram sprint-end
KPI summary is built+tested but NOT dispatched. Disk-verify: `buildKpiSprintSummary`
(`src/connectors/kpi-sprint-summary.ts:43`, pure + en/tr i18n + tested) and the `kpiSummaryFn` hook
(`src/connectors/connector-notify-adapter.ts:32-42`, consumed at `:193-213` on a `sprint-finalized`
notification, non-blocking) BOTH exist, but the hook is never passed at adapter-construction. The
ONLY prod adapter-construction sites are `buildConnectorNotificationAdapter` callers
(`src/cli/commands/start.ts:293`, `src/cli/commands/autonomous.ts:678`,
`src/orchestra/sprint-runner-entry.ts:228`). `connector-bootstrap.ts` is **OFF-LIMITS** (active
connector area) — so wire it at the THREE CLEAN caller-sites instead. **God-level, DRY fix:** NEW
module `src/connectors/kpi-summary-dispatch.ts` exposing `buildSprintKpiSummaryFn(root, lang)` →
returns a `(sprintId) => Promise<string|null>` closure that opens a READ-only `KpiService`
(`join(root,'.brain','memory.db')`, tenant `'default'`), `listSprintViews(sprintId)`, formats via
`buildKpiSprintSummary` (reuse — do NOT re-implement), and ALWAYS closes the store in `finally`
(Windows handle-guard); returns `null` on empty/missing data (honest no-op, never throws). Then at
each of the 3 caller-sites, pass `{ kpiSummaryFn: buildSprintKpiSummaryFn(root, lang) }` into the
adapter construction (additive — when `notify_connectors` is unset the adapter is `null` and the
path is byte-for-byte today's behaviour). The summary's i18n is built into
`buildKpiSprintSummary` (no `messages.ts`). Do NOT touch `connector-bootstrap.ts` /
`connector-notify-adapter.ts` / `kpi-sprint-summary.ts` / `bot-agentic.ts`. Tier-1 (`start.ts`/
`autonomous.ts` are `src/cli/commands/`).
### goNogo
- goCriteria: hermetic test — `buildSprintKpiSummaryFn(root,'en')(sprintId)` over a tmpdir seeded
  `.brain/memory.db` (real `KpiStore.upsertResults`, finalized sprint) returns the formatted
  summary string (non-empty, names a KPI); empty/missing sprint → `null` (no throw); the store is
  closed (no leaked handle); each caller-site passes `kpiSummaryFn` and is a no-op when
  `notify_connectors` is unset (default path byte-for-byte); `tsc --noEmit` 0-new; `npx vitest run
  tests/connectors/kpi-summary-dispatch.test.ts` GREEN + existing start/autonomous/sprint-runner
  + connector-notify-adapter tests GREEN.
- nogo: editing connector-bootstrap.ts / connector-notify-adapter.ts / kpi-sprint-summary.ts;
  a throwing/blocking kpiSummaryFn (must be non-blocking, return null); leaking the KpiService
  handle; changing the default (no-notify) path; hardcoded TR/EN (reuse buildKpiSprintSummary i18n);
  `process.cwd()`.
Smoke: node dist/cli/entry.js start --help → exits 0 (start command unaffected, no regression); the kpiSummaryFn sprint-end dispatch is unit-proven (a live Telegram round-trip is the host-side follow-up gate)

## Task 7: KPI Faz-2 — surface the threshold-breach advisory in the `deckent kpi` CLI
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/kpi.ts, tests/cli/kpi-breach-surface.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
Sprint-333 (`breach-advisor.ts`) surfaced the KPI threshold-breach advisory in the RETRO only; the
interactive `deckent kpi` scorecard (`src/cli/commands/kpi.ts`) still shows per-KPI `status` in the
table but no consolidated breach advisory — a user running `deckent kpi` gets no at-a-glance "these
KPIs breached target" summary. **Surgical fix:** after the scorecard renders in `kpi.ts`, call the
EXISTING `buildKpiBreachAdvisory(views, lang)` (from `src/core/kpi/breach-advisor.ts` — READ-only
import; it already filters `status !== 'healthy'` and produces deterministic en/tr output reusing
`kpi.*` keys) and `print` its output as a "KPI Breaches" section; empty/all-healthy → no section
(honest no-op). Reuse the existing `getLanguage`/`getMessage` already imported in `kpi.ts`
(`messages.ts` is OFF-LIMITS — do NOT add keys; `breach-advisor` already carries the i18n). Keep
the rest of the scorecard byte-for-byte. Do NOT touch `breach-advisor.ts` / `kpi-service.ts` /
`messages.ts`. Tier-1 (`src/cli/commands/`).
### goNogo
- goCriteria: hermetic test — `deckent kpi` handler over a seeded view-set with one breached
  (`status:'critical'`) + one healthy KPI → output includes a breach section naming ONLY the
  breached KPI (en + tr) (pre-fix RED: no breach section); all-healthy → no section; the rest of the
  scorecard unchanged; `tsc --noEmit` 0-new; `npx vitest run tests/cli/kpi-breach-surface.test.ts`
  GREEN + existing kpi CLI tests GREEN.
- nogo: re-computing breach status (consume `buildKpiBreachAdvisory`); editing messages.ts/
  breach-advisor.ts; altering the scorecard table; hardcoded TR/EN; a section when all-healthy.
Smoke: node dist/cli/entry.js kpi (or kpi --sprint <id>) against a project whose latest sprint breached a KPI → exits 0, renders the scorecard AND a "KPI Breaches" advisory section naming the breached KPI(s); an all-healthy sprint renders the scorecard with no breach section

## Task 8: W-H — EN multi-provider + cost/KPI cookbook recipe (Beta onboarding)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/multi-provider-and-cost-en.md
- Scope: docs/cookbook/
### Description
MASTER-PLAN §10 (`:821`) noted "deeper cookbook recipes (per-connector, ERP, autonomous,
multi-provider) as out-of-scope follow-ups" to the sprint-333 getting-started cookbook. Beta needs
an English recipe a fresh user follows end-to-end for the multi-provider + cost/visibility story.
**Write `docs/cookbook/multi-provider-and-cost-en.md`** (NEW file in the existing `docs/cookbook/`
dir — zero collision; do NOT touch `getting-started-en.md`): config-driven provider registry
(subscription vs API keys; per-worker auth isolation — no cross-provider key leak), running a
mixed-provider fleet, then the cost/visibility surface — `deckent cost`, `deckent usage`,
`deckent kpi` (scorecard + `--trend` + breach advisory) — and a short note that token/cost is now
captured from real provider usage (session-store) not an estimate. God-level (not MVP), accurate to
the CURRENT CLI surface (verify command/flag names against `src/cli/` before writing — no
stale/invented commands, `feedback_zero_hardcode_live_data`). Use ONLY canonical absolute GitHub
links or in-repo links that exist (do NOT reintroduce a relative `docs/…` link that DOC-PKG-1 would
flag as dangling). English, no emoji. Do NOT touch README.md/package.json/any source.
### goNogo
- goCriteria: `docs/cookbook/multi-provider-and-cost-en.md` exists with accurate runnable steps
  (provider config → mixed fleet → cost/usage/kpi) verified against the real `src/cli/` command/flag
  names (no invented commands); links resolve (absolute or in-repo-present); `npm run lint:link`
  GREEN; no source/README/package.json/getting-started-en.md touched.
- nogo: referencing a non-existent command/flag; dangling/relative `docs/…` links that 404; an MVP
  stub; emoji; touching README.md/package.json/any source/getting-started-en.md.

## Task 9: docs — sprint-334 campaign findings note (NEW dated doc; NOT MASTER-PLAN/TRIAGE)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/audits/OVERNIGHT-2026-06-28-findings.md
- Scope: docs/audits/
### Description
Record sprint-334 in a NEW dated findings note (`docs/MASTER-PLAN.md` + `DECKENT-TRIAGE-PLAN.md`
are owned by another agent → DO NOT TOUCH them; the existing `OVERNIGHT-2026-06-27-findings.md` is
the source-of-truth READ, not edited here). **Write `docs/audits/OVERNIGHT-2026-06-28-findings.md`**
recording, with disk-verify discipline (only confirmed `.result` truth, no over-claim): the P0
TOKEN-REAL-CAPTURE landing (session-store reader, cacheCreation captured, `source='session-store'`,
cost auto-corrected via the existing cost-calculator) — mark DONE only if Task 1's `.result` is
DONE; otherwise note the gap. Record the other sprint-334 landings (F1-014 phase-2 dynamic scrub,
P0-C orphan-at-normal-finalize, A20 ipc suggestedAction flag-gated, F1-013 SCOPE_INSUFFICIENT event
parity, Telegram KPI dispatch, kpi-CLI breach surface, cookbook, ADR-093) ONLY where each task
lands DONE; else keep the gap explicit. Mark remaining EXPLICITLY (no silent debt): avg-tool-call +
output/accepted-PR KPIs (phase2, needs off-limits agentic-worker OR a Task-1-derived counter),
REPL web-search parity (permission-gate UI), R7 SSE (not-surgical), F1-010 mid-flight overflow
(phase2), B-MIRROR finalize-side-effect (watch), telemetry wire (design-first), cost-gate HARD
enforcement (post-beta), KPI Faz-3 multi-tenant (post-beta). Do NOT touch
MASTER-PLAN.md/DECKENT-TRIAGE-PLAN.md or any source.
### goNogo
- goCriteria: `docs/audits/OVERNIGHT-2026-06-28-findings.md` exists summarizing sprint-334 with
  every still-open item explicitly flagged (no over-claim, no silent debt); a task marked DONE ONLY
  when its `.result` is DONE; `npm run lint:link` GREEN; MASTER-PLAN.md/DECKENT-TRIAGE-PLAN.md and
  all source untouched.
- nogo: editing MASTER-PLAN.md/DECKENT-TRIAGE-PLAN.md/the 06-27 findings or any source; over-claiming
  a task DONE before it lands; marking any phase2/post-beta/blocked item "complete".

## Task 10: ADR-093 — real token/cost capture via provider-native usage stores (architecture record)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/adr/093-real-token-usage-capture.md
- Scope: docs/adr/
### Description
The P0 fix (Task 1) introduces a new architectural seam — **provider-native usage stores read
behind a provider-adapter contract** (claude → session-store jsonl; codex/gemini → their own native
store; honest `null` when none) replacing the stdout-envelope/heuristic path as the source of
truth for token/cost. That is an accepted architectural decision and warrants an ADR (next id after
ADR-092). **Write `docs/adr/093-real-token-usage-capture.md`** following the repo's ADR format
(Status: accepted; Context: heuristic 61/61 inaccuracy + cacheCreation totally missed + session-store
ground truth; Decision: provider-agnostic native-usage-store seam, summed real usage incl.
cacheCreation, `source` provenance tag, heuristic only as honest last-resort fallback; Consequences:
cost auto-corrects via existing cost-calculator, codex/gemini are documented future extension
points, tests use injected tmpdir sessionRoot never the real `~/.claude`). Accurate to Task 1's
design as specified in this DIRECTIVES; cross-reference ADR-076 (auth) and the cost-calculator
regime model. `npm run lint:adr` must pass. Do NOT touch any other ADR / source / MASTER-PLAN.
### goNogo
- goCriteria: `docs/adr/093-real-token-usage-capture.md` exists, Status accepted, matching the repo
  ADR template/format, faithfully describing the native-usage-store seam + provenance + fallback;
  `npm run lint:adr` + `npm run lint:link` GREEN; no other ADR/source/MASTER-PLAN touched.
- nogo: an ADR id collision (must be 093); contradicting Task 1's design; editing another ADR or any
  source; a stub/MVP ADR; emoji.

## Task 11: F11 — wire skill-dispatch into the native REPL tool registry (parity slice)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/repl/native-tool-registry.ts, tests/cli/repl/native-tool-skill-dispatch.test.ts
- Scope: src/cli/repl/, tests/cli/repl/
### Description
Memory `native_repl_tool_parity_gap` + F11 — the native agentic REPL registers exec tools
(read/write/edit/bash) + CLI tools (status/history/retro/doctor/models/review) in
`buildNativeToolRegistry()` (`src/cli/repl/native-tool-registry.ts:86-124`) but does NOT register a
**skill-dispatch** tool, so the native REPL agent cannot invoke a deckent skill the way a worker
can (parity gap vs the worker tool-loop). **Surgical, additive fix:** register ONE new
skill-dispatch tool in `native-tool-registry.ts` whose handler delegates to the EXISTING skill
executor / skill-pool (reuse the live dispatch path — do NOT re-implement skill execution), bridged
to the REPL's tool-result contract; tool metadata is technical/model-facing (NOT user-facing i18n —
no `messages.ts`). Provider-agnostic; additive (existing tool dispatch byte-for-byte). **Web-search
is OUT of scope** (needs an in-session approval UI / permission-gate — explicit `TODO(phase2)`).
Own `native-tool-registry.ts` ONLY — do NOT touch `chat-tool-bridge.ts` (keep the surface
single-file); if skill-dispatch genuinely cannot be wired without another file, write an honest
NO_GO explaining the seam (do NOT touch off-limits/dirty files). Tier-0 (`src/cli/repl/` internal;
unit-test sufficient).
### goNogo
- goCriteria: hermetic test (injected skill executor seam, no real spawn) — the native tool registry
  now exposes a skill-dispatch tool that, given a skill id + args, invokes the existing skill
  executor and returns its result in the REPL tool-result shape (pre-fix RED: no skill-dispatch tool
  registered); existing exec/CLI tool registrations unchanged; `tsc --noEmit` 0-new; `npx vitest run
  tests/cli/repl/native-tool-skill-dispatch.test.ts` GREEN + existing native-tool-registry tests GREEN.
- nogo: re-implementing skill execution instead of delegating to the live skill executor; wiring
  web-search (out of scope — permission-gated); touching chat-tool-bridge.ts or any off-limits/dirty
  file; changing existing tool registrations; user-facing string hardcode.
