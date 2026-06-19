# DIRECTIVES — Sprint: Governance & Module-Uniformity wire-ups (§14 ADR-W + CORE-W surgical)

## Goal: MASTER-PLAN §14'ün **surgical governance-wire (ADR-W) + module-uniformity (CORE-W)** kalemlerini kapat — deckent'i ADR-tutarlı + dormant-temiz + drift-siz yap. 9 task, çoğu paralel (distinct files). Her madde MASTER-PLAN'da file:line + kanıt ile belgeli — birebir izle. Cerrahi, davranış-korunumlu, TDD. **Honest-defer:** epic-split'ler (MON-W1/CLI-W2/ORCH-W4/API-W3) + ADR-002-W (global tsconfig) + dormant-disposition-judgment (CORE-W6/W7/CLI-W1/AGNT-W1) bu batch DIŞI.

## Ortak kurallar (BAĞLAYICI)
- **Cerrahi + davranış-korunumlu** — yalnız Files/Scope, minimal-diff. **ESM** `.js`. **i18n-first.** **No emoji.** **haiku yalnız ADR-010-W (doc).**
- **Hermetik test**, `tsc --noEmit` temiz, **CC-verify gate:** sprint-sonu CC FULL `tests/` (değişen-alanlar) yeşil; davranış-değişikliği YOK (regression-korunumu). **md+db senkron:** ADR amendment-log'a işle (kanıt-satırı).
- Worker: test-yazıp-impl-bırakma YASAK (grep-kanıtı impl'i göstermeli).

---

## Task 1: ADR-001-W — Node 24+ full-sweep (no "Node 18" anywhere)
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/core/erp-driver-sap.ts, src/core/erp-driver-dynamics.ts, src/core/erp-driver-odoo.ts, src/core/pricing-updater.ts, src/core/anthropic-http-client.ts, src/core/siem-transport-http.ts, src/core/builtins/agents/devops-engineer/PROMPT.md, src/core/builtins/agents/migration-specialist/PROMPT.md
- Scope: src/core/, .github/
### Description
Node 24+ tek-baseline; "Node 18" referansı kalmayacak. Fix: erp-driver-{sap,dynamics,odoo}.ts + pricing-updater.ts + anthropic-http-client.ts + siem-transport-http.ts'teki "Node 18+ fetch" yorum/hata-mesajları → "Node 24+ built-in fetch"; devops-engineer/PROMPT.md "18.x,20.x,22.x" → 24.x+; migration-specialist/PROMPT.md "Node 18→20" örnek → nötrle/24; `.github/workflows/*` node-version matrix → 24+ doğrula. Davranış değişmez (yorum/string).
**Kanıt:** `grep -rniE "node[ ._-]*18" src/ docs/ tests/ scripts/ .github/ --include="*.ts" --include="*.md" --include="*.yml" | grep -i node | grep -v node_modules` = 0.
**Test:** grep-kanıtı 0; tsc temiz.

## Task 2: ADR-066-W — `?? 'claude'` invariant-drift re-audit (9→≤3)
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/core/provider.ts, src/core/config.ts, src/orchestra/cross-verify-runner.ts, src/orchestra/sprint-utils.ts, tests/core/adr066-claude-invariant.test.ts
- Scope: src/core/, src/orchestra/, tests/core/
### Description
ADR-066 "≤3 occurrence" derken bugün 9 (`provider.ts:889`, `config.ts:92`, `cross-verify-runner.ts:215`, `sprint-utils.ts:214`, +5). Her birini re-audit: meşru-son-çare → inline-justification-comment; değilse `getDefaultProviderName()`'e (sprint-utils öneriyor) konsolide/kaldır. Davranış-korunumlu (default 'claude' aynı kalır, kaynak tekilleşir).
**Kanıt:** `grep -rn "?? 'claude'" src/ | grep -v test` ≤3 + her kalanda inline-justification; routing-testleri regresyonsuz.
**Test:** getDefaultProviderName tekil-kaynak; mevcut routing/provider testleri geçer.

## Task 3: ADR-064-W — wire planDispatch into live dispatch-path
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert
- Files: src/orchestra/result-collector.ts, tests/orchestra/adr064-plandispatch-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
`planDispatch` (saf-planlayıcı, `result-collector.ts:227`, G1-G10-testli) **runtime'da 0-caller** — `dispatchTick` onu çağırmadan `processQueue+maybeRespawn` imperatif koşuyor (`:180` yorum yanlış). Risk: testler saf-modeli pinlerken canlı-semantik sapabilir. Fix: `dispatchTick` kararlarını (`toSpawn/toKill/mode`) `planDispatch(state)`'ten alsın → pinlenen-model = canlı-yol; `:180` yorum düzelt. Davranış-korunumlu (G1-G10 + S279/280 continuous-dispatch baseline).
**Kanıt:** `grep -n "planDispatch(" src/orchestra/result-collector.ts` → dispatchTick-gövdesinde ≥1 çağrı; G1-G10 + continuous-dispatch regresyonsuz.
**Test:** dispatchTick planDispatch-sonucunu uygular; mevcut G1-G10 + dispatch testleri geçer (canlı=pinlenen).

## Task 4: ADR-028-W — V1 routing minor inconsistencies
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/orchestra/sprint-planner.ts, docs/reference/features.md, tests/orchestra/adr028-routing.test.ts
- Scope: src/orchestra/, docs/reference/, tests/orchestra/
### Description
(1) `features.md` `decision-orchestrator-v1`'i "dead" sayıyor ama ADR-028 "deprecated-retained-selectable" (DecisionOrchestrator `decision-engine.ts:101` canlı+selectable) → manifest-sınıfını "deprecated/retained" yap. (2) `sprint-planner.ts:468` `config.routing_engine ?? 'v1'` config-default `'v2'` ile tutarsız → `?? 'v2'`. Davranış-korunumlu (full-config fire etmez ama default doğrulanır).
**Kanıt:** features.md reclassify + `grep "?? 'v1'" src/orchestra/sprint-planner.ts` = 0.
**Test:** routing_engine-default 'v2'; mevcut routing testleri geçer.

## Task 5: ADR-008-W — resolve core→orchestra import violation
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert, code-simplifier
- Files: src/core/routing-engine.ts, src/orchestra/ecosystem-intelligence.ts, tests/core/adr008-import.test.ts
- Scope: src/core/, src/orchestra/, tests/core/
### Description
ADR-008 (core tek-yönlü-bağımlılık) ihlali: `routing-engine.ts:30` → `../orchestra/ecosystem-intelligence.js` (`analyzeSkillInMemory`). Fix: tüketilen `analyzeSkillInMemory`'yi `core/`'a taşı (ecosystem-intelligence'ın core-tarafı) **ya da** bağımlılığı tersine çevir (orchestra inject etsin). Davranış-korunumlu. authority-enforcer ADR-008-check zaten advisory.
**Kanıt:** `grep -rnE "from ['\"]\.\.?/orchestra/" src/core/ | grep -v "\.test\."` = 0.
**Test:** routing-engine core-only-import; analyzeSkillInMemory çağrısı çalışır; mevcut routing testleri geçer.

## Task 6: CORE-W1 — directive-interrogator core→cli import (move i18n to core)
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert
- Files: src/core/messages.ts, src/cli/helpers/messages.ts, src/core/directive-interrogator.ts, tests/core/corew1-i18n-core.test.ts
- Scope: src/core/, src/cli/helpers/, tests/core/
### Description
İkinci ADR-008-ihlali: `directive-interrogator.ts:18` core→cli (`getMessage`). Modül CANLI (plan.ts+chat-native.ts tüketir) → aktif-ihlal. Fix: i18n `messages.ts` altyapısını `core/`'a taşı (`src/core/messages.ts`), `cli/helpers/messages.ts` thin-re-export yapsın (mevcut import'lar KIRILMAZ — getMessage signature/davranış aynı). directive-interrogator core-içi import'a geçsin.
**Kanıt:** `grep -rnE "from ['\"]\.\.\/(cli|orchestra)\/" src/core/ | grep -v test` = 0 (directive-interrogator dahil).
**Test:** getMessage(en/tr) core'dan çözülür; cli/helpers re-export çalışır; mevcut i18n testleri geçer (signature-korunumu).

## Task 7: ADR-021-W — output_splash dormant-knob → real gate
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/adr021-splash-gate.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
`showSplash` ilk-sprint'te gate'siz çağrılıyor (`sprint-phases.ts:665-669`); config-gate'li `showSplashIfEnabled` **0-caller** → `output_splash` knob (default true `config.ts:1117`) **no-op** (ayar-dürüstlüğü ihlali). Fix: sprint-phases çağrısını `showSplashIfEnabled`'a bağla (gerçek-gate) → `output_splash:false` splash'ı kapatır. (knob'u kaldırma yarım-yolu YOK — gate'le.)
**Kanıt:** `grep -n "showSplashIfEnabled" src/orchestra/sprint-phases.ts` ≥1; `output_splash:false` → sprint-start splash basmaz (davranış-testi).
**Test:** output_splash:false → splash yok; true → splash var (gerçek-gate).

## Task 8: ADR-010-W — dependency ADR-backing justification
- Model: haiku | Effort: low | Agent: doc-writer | Skills: documentation-writer
- Files: docs/architecture/adr/010-single-runtime-dependency.md, docs/reference/dependencies.md
- Scope: docs/architecture/, docs/reference/
### Description
ADR-010 "her dep ADR-backed" ilkesi; eksik-atıf: **`cli-highlight`** (REPL syntax-highlight) + **`zod`** (planner validation — formal-ADR yok). Fix: ADR-010 Amendment-2 tablosuna her ikisi için "Governing ADR" atfı ekle (cli-highlight→REPL-ADR-081/083 ailesi-altı not, zod→validation-justification mini-not). `ink`/`react` zaten ADR-081/083/080. **Doc-only** (package.json'a dokunma — yalnız ADR-tablosu/dep-doc). _(NOT: ADR-010 DB-first ise md-doc'a yaz, memory-export sonra senkronlar.)_
**Kanıt:** ADR-010 amendment-tablosunda cli-highlight + zod için boş-olmayan Governing-ADR satırı.
**Test:** N/A (doc); grep-kanıtı.

## Task 9: CORE-W3 — duplicate dedup (skill-registry + RateLimiter)
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert, code-simplifier
- Files: src/core/skill-registry.ts, src/core/rate-limiter.ts, src/api/rate-limiter.ts, src/api/server.ts, tests/core/corew3-dedup.test.ts
- Scope: src/core/, src/api/, tests/core/
### Description
(1) `skill-registry.ts` (SkillRegistry, **0-caller**) ↔ canlı `skill-pool.ts` (SkillPoolManager, 9-tüketici) → registry'yi KALDIR (CLAUDE.md ikisini sayıyor, yanıltıcı; not: CLAUDE.md güncellemesi shared-worktree → DOKUNMA, kod-tarafı kaldır). (2) **RateLimiter üçleme:** `core/rate-limiter.ts` + `api/rate-limiter.ts` İKİSİ DE dormant; canlı `server.ts:75` inline-class → tek modüle indir (inline'ı `api/rate-limiter.ts`'e çek, core-dormant'ı kaldır/birleştir). Davranış-korunumlu (rate-limit aynı çalışır).
**Kanıt:** `grep -rc "class RateLimiter" src/` = 1 (tek-tanım); skill-registry.ts silindi (0-caller doğrulandı).
**Test:** rate-limit mevcut testleri geçer (server.ts inline→modül); skill-pool testleri etkilenmez.

---

**Beklenen:** 9 task, çoğu paralel (distinct files; 5/6 ikisi de core/'a taşır ama farklı modül). Sprint-sonu: `tsc --noEmit` temiz; CC FULL (değişen-alanlar) yeşil; **davranış-değişikliği YOK** (governance/uniformity wire — regression-korunumu). md+db senkron (ADR amendment-log). CC: build sonrası ADR-tutarlılık + dormant-temizlik canlı. Honest-defer: epic-split'ler + global-tsconfig + dormant-judgment + CLAUDE.md-contested → sonraki slice.
