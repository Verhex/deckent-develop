# DESIGN — R4-remainder (design-first divergent items, post-campaign)

> §B-tarzı architect-design. Her item: kod-gerçeği (file:line) → canonical/semantik kararı →
> ADR-008-layering → sprint-task-spec (collapse / disambiguate / defer). Kaynak: DECKENT-TRIAGE-PLAN.md
> R4-divergent kalanı (sınıf-b design-first). 319/321 ile clean-cerrahi-damar tükendi; bunlar karar-gerektirir.

---

## D1 — evaluateResult (sync vs async) → CLEANUP (disambig zaten yapıldı, alias-temizliği kaldı)
**Kod-gerçeği:** `sprint-controller.ts:842` `evaluateResultSync` (sync — "no event-loop suspension desired", 321'de rename'lendi) vs `result-evaluator.ts:120` async `evaluateResult` (canonical, reconcile+coverage). 321-001 disambiguate etti + `@deprecated evaluateResult` alias bıraktı. Alias'ın TEK-caller'ı: `cli/commands/finalize.ts:8,140` (re-grade fallback).
**KARAR:** full-migration YANLIŞ — sync-versiyon DELIBERATELY-different + gerekli (finalize sync-context). Kalan = **alias-CLEANUP**: finalize.ts'i `evaluateResult`→`evaluateResultSync`'e geçir → `sprint-controller.ts`'ten `@deprecated evaluateResult` alias'ını + `brain.ts` re-export'unu KALDIR. İki fonksiyon distinct-isimle yaşar (sync vs async), ambiguous-`evaluateResult`-in-sprint-controller biter. async `evaluateResult` (result-evaluator) dokunulmaz (o ayrı, canonical).
**ADR-008:** finalize(cli)→sprint-controller(orchestra) import OK (cli üst-katman).
### Sprint-task: R-EVALRESULT-CLEANUP (refactorer, opus, low) — Files: cli/commands/finalize.ts, orchestra/sprint-controller.ts, orchestra/brain.ts + test. KANIT: finalize evaluateResultSync çağırır + tsc=0 + zero-dangling (`evaluateResult` artık YALNIZ result-evaluator'da async-tanım; sprint-controller'da ne alias ne sync-isim kalır). Saf-rename, davranış-sıfır.

## D2 — ROLE_CAPABILITY_MAP (core array vs nervous Set) → DISAMBIGUATE (true-unif defer)
**Kod-gerçeği:** `core/capability-broker.ts:33` `Record<string, Capability[]>` (array; roller: viewer/developer/operator/admin — GENERAL RBAC). `nervous/authority-matrix.ts:213` `Readonly<Record<WorkerRole, ReadonlySet<Capability>>>` (Set; roller: admin/engineer/... + enterprise-caps db-write/gpu/tenant-scope/erp-write — WORKER/NERVOUS RBAC). FARKLI: shape (array vs Set) + role-model (string vs WorkerRole) + capability-seti + domain.
**KARAR:** FALSE-collision (aynı-isim-farklı-domain, parseVitestOutput sınıfı) → **DİSAMBİGÜASYON-rename**: `nervous/authority-matrix.ts` → `WORKER_ROLE_CAPABILITY_MAP` (+ `getRoleCapabilities` gibi yerel-caller'lar). `core/capability-broker` `ROLE_CAPABILITY_MAP` (general) kalır. İsim-çakışması/kafa-karışıklığı biter. **TRUE-unification (tek-RBAC-kaynağı) DEFER → enforcement-design-sprint** (actor/capability-model + ADR-037-V2 post-GA; core nervous'tan import edemez=ADR-008, ortak-RBAC core'a inmeli ama role-modelleri uyuşmuyor → ayrı design).
**ADR-008:** rename-only, import-yönü değişmez (nervous kendi map'ini tutar).
### Sprint-task: R-ROLECAP-DISAMBIG (refactorer, opus, normal) — Files: nervous/authority-matrix.ts + caller/test. KANIT: pure-rename → tsc=0 + nervous/authority test yeşil + zero-dangling (nervous-tarafı `WORKER_ROLE_CAPABILITY_MAP`, core-tarafı `ROLE_CAPABILITY_MAP` ayrı). notes: "false-collision rename, true-unif enforcement-design'a defer".

## D3 — max_workers (3 modül) → system-profile CANONICAL + capacity-algo dispozisyonu
**Kod-gerçeği:** (a) `core/system-profile.ts:9` `calcRecommendedMaxWorkers(freeMemMB, cpuCores)` — **CANONICAL** (`config.ts resolveEffectiveWorkers` `SystemProfile` kullanıyor). (b) `core/system-capacity.ts:62` `suggestOptimalMaxWorkers` (RAM-tier: <4GB→1/4-8→2…) — RAKİP worker-count algo. (c) `core/host-detector.ts:59` `detectHostMemory` — **FARKLI-amaç** (per-worker RAM-budget detection, worker-COUNT değil → FALSE-collision, no-op).
**KARAR:** (c) host-detector = no-action (farklı-amaç, dokunma). (a) vs (b) = 2 worker-count algo (freeMem+cpu vs RAM-tier) → **system-profile CANONICAL**; `suggestOptimalMaxWorkers` caller'larını TRACE et → zero/redundant-caller ise `calcRecommendedMaxWorkers`'e re-derive/collapse; canlı+farklı-amaç ise disambiguate-rename. Belirsizse NO_GO+trace-raporla.
**ADR-008:** üçü de core/ — sorun yok.
### Sprint-task: R-MAXWORKERS-CANONICAL (bug-fixer, opus, high) — Files: core/system-capacity.ts, core/system-profile.ts + caller/test. KANIT: `suggestOptimalMaxWorkers` caller-trace (grep notes'ta) → collapse-to-canonical (faithful: aynı-input→aynı-output system-profile'dan) VEYA disambiguate-rename VEYA NO_GO. tsc=0 + core test yeşil + zero-dangling. host-detector DOKUNULMADI.

---
## Sprint planı (sprint-322 adayı — 3 task, distinct-file, collision-yok)
- T1 R-EVALRESULT-CLEANUP (finalize+sprint-controller+brain) · T2 R-ROLECAP-DISAMBIG (nervous/authority-matrix) · T3 R-MAXWORKERS-CANONICAL (core/system-capacity+system-profile). Distinct-file → paralel. Hepsi faithful/zero-dangling + NO_GO-escape. opus.
**Defer (enforcement-design-sprint, post-GA):** ROLE_CAPABILITY_MAP true-unification · B1-B5/A9/A15/A18 enforcement-vein · NervousSystemConfig V1→V2 full-migration · useApi (dashboard/build:all). Bunlar opportunistic-cerrahi DEĞİL — dedicated design (actor/capability-model) gerektirir.
