# DIRECTIVES — Sprint 231: Brain Convergence / Kalite (beta-gate hardening)

## Goal: **Beta gate'in "az-buglu + güvenilir çekirdek" parçası.** Bu dalga, son sprint'lerin (226-230) dogfood'unda yakalanan Brain defter-tutma + değerlendirme bug'larını kökten kapatır: (1) **exit-0-no-result FALSE NO_GO** — disk-verify'ın `.result`-var yolunda **non-uniform** uygulanması (Sprint 230: 003 kurtarıldı, 008 kurtarılamadı), (2) **debt.md export-wipe** asimetrisi, (3) **decay catastrophic-abort** küçük-DB bypass'ı, (4) ileri-vizyon: **HandoffProtocol recovery wiring**. Her iddia file:line grep-doğrulandı. **Her task DISTINCT filesWrite → tam paralel-güvenli (tek wave). src/dashboard'a DOKUNULMAZ** (paralel dashboard re-theme çalışması var). **god-level, hermetik, CI yeşil KORUNUR.**

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt **çağıran** dosyada (def DIŞLA, [[feedback_directive_kanit_letter_vs_goal]]). Bu sprint tamamen **Tier-0 (internal/orchestra/core)** → unit-test yeterli, Smoke YOK.
- **🔴 HERMETİK ([[project_ci_green_root_causes]]):** tmpdir + sandbox HOME, **async spawn (spawnSync YASAK)**, `test:ci-sim` yeşil. CI yeşil KORUNUR.
- **🔴 DISK-VERIFY GROUND TRUTH ([[feedback_trust_brain_eval_not_worker]]):** Brain kararı disk + testsPassed'e dayanır, rubric'e değil.
- ESM `.js`. Subscription (`env -u ANTHROPIC_API_KEY`). ≤200 LoC tercih, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz** (paralel-güvenlik). Tek wave (4 task distinct dosya); `dependency_pipeline_enabled=false` → Brain manuel.

---

## Task 1: 231-001 — [P0] ⭐ exit-0-no-result uniform disk-verify (FALSE NO_GO kökü)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/result-collector.ts, tests/orchestra/synthetic-nogo-diskverify.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** Docker EXIT-trap (`spawn-backend-docker.ts:397`) worker exit-0-no-result'ta sentetik `{selfAssessment:"NO_GO", filesChanged:[], notes:"Worker exited without writing result (exitCode=…)"}` `.result` yazar. `collectResults` (`result-collector.ts:503`) bu `.result`-var yolunu (`:508-521`) **disk-verify'sız** toplar; oysa `.timeout` marker yolu (`:523-614`, `:548-550`) `verifyDiskAgainstClaim(projectRoot, scope)` uygular → **NON-UNIFORM**. Sonuç (Sprint 230): 230-003 evaluateWithRubric'in `reconcileSpuriousNoGo` git-diff'iyle tesadüfen kurtuldu ama 230-008 kurtulamadı — iş diskte tam olmasına rağmen NO_GO kaldı (`verifyDiskAgainstClaim` `disk-verify.ts:78`).
**Çözüm:** `collectResults`'ta sentetik-NO_GO tespitini (`selfAssessment==="NO_GO"` && `notes` "Worker exited without writing result" içerir && `filesChanged.length===0`) `.timeout` yoluyla **AYNI** disk-verify'a tabi tut: `verifyDiskAgainstClaim` → `hasDiskEvidence` ise sonucu zenginleştir (filesChanged/linesAdded doldur) + `MANUAL_REVIEW_REQUIRED`'a reklasifiye et (sentetik raw-NO_GO YERİNE), `BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH` emit (mevcut pattern). Disk-evidence yoksa NO_GO kalır. Caller `result-collector.ts` (def `disk-verify.ts` DIŞLA). **Davranış uniform: initial-eval = timeout-path = synthetic-path.**
**Kanıt:** `grep -c "verifyDiskAgainstClaim\|hasDiskEvidence" src/orchestra/result-collector.ts` → **≥3** (timeout yolu 1 + sentetik yolu ≥2 yeni ÇAĞRI); `npx vitest run tests/orchestra/synthetic-nogo-diskverify.test.ts` → 4+ pass
**Test:** ≥4 (sentetik-NO_GO + disk-evidence → MANUAL_REVIEW/zenginleşir; sentetik-NO_GO + disk-evidence-yok → NO_GO kalır; normal DONE result dokunulmaz; timeout-path regresyon-yok) — hermetik (tmpdir, sahte .result + git-diff mock)
**Smoke:** (Tier-0 orchestra) unit yeterli.

## Task 2: 231-002 — debt.md export-wipe guard (asimetri kapat)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/memory-export.ts, tests/core/debt-export-guard.test.ts
- Scope: src/core/, tests/core/
### Description
**Problem (doğrulandı):** `writeGuardedExports` (`memory-export.ts:408`) `GUARDED_EXPORT_SPECS` (`:390-394`) summary/decisions/memory'yi `dbCount>0 && renderIsEmpty → yazma` ile korur ama **debt.md guarded-loop DIŞINDA** koşulsuz yazılır (`:436-442`) → DB'de debt VARKEN render boş çıkarsa fuller git-tracked debt.md **EZİLİR** (§4F residual; diğer export'larla asimetri).
**Çözüm:** debt.md'yi `GUARDED_EXPORT_SPECS`'e ekle (`entryType:'debt'`, uygun `emptyMarker` — `exportDebtMd`'nin 0-debt çıktısıyla eşleş) VEYA aynı `dbCount>0 && renderIsEmpty` guard'ına al; koşulsuz yazımı kaldır. **0-legit-debt → minimal yazım DOĞRU (wipe değil)**; korunan senaryo: DB'de debt var + render collapse. Caller `memory-export.ts`.
**Kanıt:** `grep -A6 "GUARDED_EXPORT_SPECS" src/core/memory-export.ts | grep -c "debt"` → ≥1 (guarded'a girdi); `npx vitest run tests/core/debt-export-guard.test.ts` → 3+ pass
**Test:** ≥3 (DB'de debt var + render-empty → debt.md EZİLMEZ; DB 0-debt → minimal yazılır OK; debt var + render dolu → normal yazılır) — hermetik (tmpdir DB)
**Smoke:** (Tier-0) unit yeterli.

## Task 3: 231-003 — decay catastrophic-abort küçük-DB bypass fix
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/memory-store.ts, tests/core/decay-catastrophic-small-db.test.ts
- Scope: src/core/, tests/core/
### Description
**Problem (doğrulandı):** `decay()` (`memory-store.ts:838`) catastrophic-abort (`:849` `CATASTROPHIC_BATCH_MIN=10`, `:850` `CATASTROPHIC_RATIO=0.5`) **`toDecay.length >= 10 && ratio > 0.5`** ister → küçük DB'de (ör. 5 entry, 3 decay = %60) abort **bypass edilir** → tüm learnings uçabilir (onboarding/dev DB riski; §4F açık design-debt).
**Çözüm:** Floor'u DB-boyut-farkında yap: `nonExemptTotal > 0` ise **ratio-abort her zaman** uygulansın (küçük DB dahil), `CATASTROPHIC_BATCH_MIN` sadece çok-küçük meşru-decay'i (ör. 1-2 entry) korusun — öneri: floor=3 + ratio>0.5 VEYA `nonExemptTotal<10` iken ratio-only. **Riskli-default-on EDİLMEZ** — mevcut meşru decay bozulmamalı. Caller `memory-store.ts`.
**Kanıt:** `grep -c "CATASTROPHIC\|nonExemptTotal\|aborted" src/core/memory-store.ts` → ≥3; `npx vitest run tests/core/decay-catastrophic-small-db.test.ts` → 3+ pass
**Test:** ≥3 (küçük DB %60 decay → aborted:true; meşru küçük decay (1-2/küçük) → proceeds; büyük DB normal decay → proceeds, regresyon-yok) — hermetik (tmpdir DB)
**Smoke:** (Tier-0) unit yeterli.

## Task 4: 231-004 — [forward] HandoffProtocol recovery wiring (failHandoff + listHandoffs)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, tests/orchestra/handoff-recovery-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `HandoffProtocol` (`handoff-protocol.ts`) Sprint 230-006'da wire edildi ama yalnız `createHandoff`+`executeHandoff` çağrılıyor; **`failHandoff()` + `listHandoffs()` 0-caller** (state machine pending→ready/failed populate ediliyor ama recovery/sorgu yok).
**Çözüm:** sprint-controller recovery yoluna wire et: bağımlı task NO_GO/fail olduğunda o task'ın bekleyen handoff'unu **`failHandoff()`** ile işaretle (downstream'i yanlış-ready bırakma) + sprint-finalize/observability'de **`listHandoffs()`** ile durum özetle (audit/event-stream). **🔴 Wire-point `sprint-controller.ts` — def `handoff-protocol.ts` DIŞLA.** Mevcut handoff wire pattern'ini (230-006) izle, kırma. Caller `sprint-controller.ts`.
**Kanıt:** `grep -c "failHandoff\|listHandoffs" src/orchestra/sprint-controller.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/handoff-recovery-wire.test.ts` → 3+ pass
**Test:** ≥3 (bağımlı-task-fail → handoff failHandoff'lanır, listHandoffs durum döner, mevcut createHandoff/executeHandoff akışı bozulmaz) — hermetik (tmpdir)
**Smoke:** (Tier-0 orchestra) unit yeterli.

---

**Beklenen:** 4/4 DONE, 0 false-FIX (231-001 zaten false-NO_GO kökünü kapatıyor — meta-doğrulama), 0 scope-collision (distinct dosya: result-collector / memory-export / memory-store / sprint-controller → tek wave). **src/dashboard'a SIFIR dokunuş** (paralel dashboard re-theme güvenli). 231-001 (disk-verify P0) en yüksek değer — beta güvenilirlik. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu ✅ (reset-bug güvenli — [[project_deckent_self_git_mutation_bug]]). DB backup. **CLI'dan `env -u ANTHROPIC_API_KEY`** (API yasak). Tek wave (4 task paralel ayrık-dosya). Her wave sonrası `git log -1` + `git stash list` (reset kontrol). Sprint sonrası `deckent memory export` → ADR export sayısı ≥75 korunmalı (decisions/memory/debt wipe YOK).

İlgili memory: [[feedback_brain_synthetic_nogo_disk_verify]] · [[feedback_proof_of_function_dod]] · [[project_ci_green_root_causes]] · [[feedback_trust_brain_eval_not_worker]] · [[project_brain_integrity_sprint226_cluster]] · [[feedback_directive_kanit_letter_vs_goal]]
İlgili ADR: ADR-070 (eval integrity + disk-verify) · ADR-035 (verification protocol) · ADR-027 (spawn backend) · ADR-045 (wave/handoff)
