# DIRECTIVES — Sprint: LIFECYCLE-ROBUSTNESS + ENFORCEMENT-VEIN (CC-fix backlog)

## Goal
Fix the remaining campaign lifecycle bugs + land the design-ready enforcement-vein, as
distinct-file parallel tasks. The planner-deps + cascade + FIX-skip (producedWork) hang/skip
fixes are live, so the dependency pipeline + FIX phase work correctly. Enforcement spec of record:
`docs/superpowers/specs/2026-06-26-halfwired-feature-disposition-design.md` is the feature spec;
`DESIGN-ENFORCEMENT-VEIN.md` is the enforcement-vein design (flag-gated, default-off). No ADR
references — the ADR set is being overhauled; decisions stand on capability merit.

## Ortak kurallar (BAĞLAYICI — her task)
- **Cerrahi + distinct-file.** Yalnız scope.filesWrite'a yaz. İki task aynı dosyaya yazmaz.
  **`src/orchestra/result-evaluator.ts` YALNIZ T2'nin** (T3 onu yalnız import-eder, edit-etmez).
- **ESM** `.js`. **No haiku.** **Hermetik test** (tmpdir, async spawn, no spawnSync, no HOME-leak).
- **Faithful-regression:** pre-fix RED / post-fix GREEN (git-stash kanıtlı). **CC-verify:**
  `tsc --noEmit` temiz + değişen-modülü import eden affected test-suite YEŞİL.
- Davranış-değiştiren enforcement **flag-gated default-OFF** (T3/T4/T5) → ürün byte-identical.
  `process.cwd()` YASAK → `join(root, …)`. Worker: impl GERÇEKTEN landmalı.

---

## Task 1: Planner structured-parse — `- Model:` → forceModel + `- Dependencies: N` index→slot-id
- Model: opus | Effort: high | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder.test.ts
- Scope: src/orchestra/task-builder.ts, tests/orchestra/
### Description
Structured-plan parser (task-builder.ts) İKİ override'ı düşürüyor (sprint-324 canlı-kanıt):
(1) **`- Model: opus` per-task directive'i `forceModel`'e YANSIMIYOR** → tüm task'lar default sonnet
(`forceModel?` alanı var ama `- Model:` satırından doldurulmuyor; `- Model:` parse-et → forceModel set-et,
`- ModelEffort:` deseniyle tutarlı). (2) **`- Dependencies: 0` gibi INDEX-ref'i sprint-slot-id'ye
(`324-001`) RESOLVE ETMİYOR** → bağımlılık unresolvable kalıyor (`parseDependenciesDirective`'te:
saf-sayı/index ref'i, task-listesindeki o-index'in slot-id'sine çevir; zaten-slot-id olan dokunulmaz).
**Kanıt:** `- Model: opus`-li task forceModel='opus' alır; `- Dependencies: 0`-lı task deps=[ilk-task-id].
**goNogo:** her iki override structured-parse'ta honor edilir (faithful: pre-fix RED — Model-drop +
index-dep-unresolved); tsc=0; task-builder-suite + structured-plan testleri yeşil.

## Task 2: honest-gate deletion false-positive — meşru-deletion ≠ stub/boundary-violation
- Model: opus | Effort: high | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/honest-gate-deletion.test.ts
- Scope: src/orchestra/result-evaluator.ts, tests/orchestra/
### Description
`enforceHonestResultGate` (result-evaluator.ts ~2000-2070) meşru-DELETION task'larını false-NO_GO'luyor
(sprint-324 324-002/003 canlı-kanıt): (1) **EMPTY_WRITE FP** — `filesChanged` boş-değil + `linesAdded===0`
→ "stub" sanılıyor; ama DELETION (modül+test silme) doğal `linesAdded:0`. Fix: disk-verify
(`verifyDiskAgainstClaim` zaten var) ile **gerçek-deletion** (claimed-dosyalar diskte YOK / `linesRemoved>0`)
doğrulanırsa EMPTY_WRITE flag'leme. (2) **BOUNDARY FP** — task'ın açıkça-İSTEDİĞİ doc-update'i (örn.
`architecture.md` satır-silme) scope-dışı sayılıyor. Fix: out-of-scope **doc-file (`*.md`) write'larını**
non-violation say (test-file scope-auto-expand precedent'i task-builder.ts:468 ile aynı mantık — docs
low-risk, source değil). **goNogo:** disk-doğrulanmış-deletion EMPTY_WRITE-FP'siz; out-of-scope `*.md`
BOUNDARY-FP'siz; gerçek-stub (no-disk-evidence) + non-doc-source out-of-scope HÂLÂ flag'lenir (regresyon-yok);
faithful (4-case: deletion→honest / md-out-of-scope→honest / gerçek-stub→flag / source-out-of-scope→flag);
tsc=0; honest-gate + result-evaluator suite yeşil.

## Task 3: enforcement A14 — applyTechDebtDowngrade wire (flag-gated)
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/gate-techdebt-downgrade.test.ts
- Scope: src/orchestra/sprint-finalizer.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/
### Description
`applyTechDebtDowngrade` (result-evaluator.ts:1285) ZERO-prod-caller (computed-not-enforced). `sprint-finalizer.ts`
finalize-akışında, per-task eval SONRASI, sprint'in tech-debt-ratio'su eşiği aşarsa sprint-outcome'u
downgrade etmek için onu WIRE et (DONE→GO_WITH_TECH_DEBT/GATE_FAILURE). **`result-evaluator.ts`'i DÜZENLEME**
(T2 sahibi) — `applyTechDebtDowngrade`'i yalnız import-et/çağır; imza değişmesi gerekiyorsa NO_GO+açıklama.
Yeni flag `gate?: { max_tech_debt_ratio?: number }` (config-types.ts + config.ts boolean/number-validate),
**default-off** (flag yok/0 → davranış değişmez). **goNogo:** flag-on + debt-ratio>eşik → downgraded-outcome
(faithful: pre-wire RED — zero-caller); flag-off byte-identical; tsc=0; sprint-finalizer + gate testleri yeşil.

## Task 4: enforcement B6 — cost-gate cumulative spend warn (flag-gated)
- Model: opus | Effort: high | Agent: devops-engineer | Skills: typescript-expert
- Files: src/core/cost-gate.ts, src/core/cost-config-loader.ts, tests/core/cost-gate-spend.test.ts
- Scope: src/core/cost-gate.ts, src/core/cost-config-loader.ts, tests/core/
### Description
`daily_max_usd`/`monthly_max_usd` (cost-config-loader.ts) validate-edilip settable ama **kümülatif
spend-gate olarak enforce-EDİLMİYOR** (`cost-gate.ts` yalnız per-sprint `auto_confirm_below_usd`-estimate'i
gate'liyor). Wire (warn-only first): usage/resource-ledger'dan (`.deckent/settings/resource-log.jsonl`)
`readSpendWindow(root, 'day'|'month')` oku; pre-spawn `projectedSpend = spentThisWindow + sprintEstimate`
hesapla; `daily_max_usd` (veya monthly) aşılırsa `BRAIN→USER:COST_LIMIT_WARN` event + notify (warn-only,
ASLA bloke-etmez). Yeni flag `cost_limits.enforce_spend_gate?: boolean` (cost-config-loader.ts),
**default-off**. **goNogo:** ledger eşik-üstü + flag-on → warn-event emit (sprint devam-eder); flag-off
veya eşik-altı → event-yok (faithful RED→GREEN); tsc=0; cost-gate + cost-config testleri yeşil.

## Task 5: enforcement B1 — worker hard-deny (enforce_rbac honor, flag-gated)
- Model: opus | Effort: high | Agent: security-auditor | Skills: security-specialist
- Files: src/agents/worker.ts, tests/agents/worker-authority.test.ts
- Scope: src/agents/worker.ts, tests/agents/
### Description
`agents/worker.ts:602-620` `checkWorkerAuthority` her iki branch'te `return true` (Layer-2 soft — V1.0
kasıtlı). `enforce_rbac` flag'i ZATEN config'te (config-types.ts:836) + threaded (sprint-runtime.ts:30) +
hard-deny path ZATEN var (authority-matrix.ts:351). Eksik: worker-side flag'i honor-etsin. Fix:
`opts.enforceRbac === true` + scope-violation → `return false` (DENY) yap; flag-off → eski `return true`
(byte-identical). **`config-types.ts`'e DOKUNMA** (enforce_rbac zaten var; T3 config sahibi). **goNogo:**
flag-on + scope-dışı-write → checkWorkerAuthority false/deny (faithful: pre-fix RED — hep true); flag-off
allow (byte-identical); tsc=0; worker-authority testleri yeşil. (Not: deckent-dev `.deckent/config.json`
gitignored — dogfood'da enforce_rbac=true ayrı/manuel, ürün-default soft kalır.)

---

**Beklenen:** 5 distinct-file paralel task (dep-yok, hepsi bağımsız). Hepsi **opus** (core/davranış-değiştiren),
faithful + `tsc=0` + affected-suite yeşil. T3/T4/T5 enforcement flag-gated default-off (ürün byte-identical).
Sprint full-lifecycle'ı (plan→spawn→execute→evaluate→FIX→retro) koşar; T1 (planner-fix) + T2 (honest-gate-fix)
gelecek-sprint'lerin planlama+değerlendirme kalitesini düzeltir (dogfood self-correction). DEFER (DOKUNMA):
routing-affinity-enable (attended balance-validation) · enterprise/MOD-SPLIT (triage-dışı) · büyük-subsystem.
