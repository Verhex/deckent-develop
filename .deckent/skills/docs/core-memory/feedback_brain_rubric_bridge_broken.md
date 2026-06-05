---
name: feedback_brain_rubric_bridge_broken
description: "Brain eval bug — worker rubricScores/evaluationDecision tutarsız/eksik yazıyor, Brain eksik veriyi düşük-kalite sanıp DONE task'lara gereksiz FIX başlatıyor (Sprint 207 P0, forensic-doğrulandı)"
metadata: 
  node_type: memory
  originSessionId: 89c2bcbe-de85-4468-bb6d-2fa12f4b7622
---

Forensic audit (Sprint 206, 2026-05-31, workflow brain-eval-forensic-audit: 5 modül + 4 confirmed bug, 657K token). Alperen sorusu: "resultlar DONE diyor ama Brain FIX başlatıyor — Brain doğru mu katı?" **CEVAP: Brain katı değil, EKSİK VERİYLE çalışıyor — gerçek bug.**

**KÖK NEDEN (kaynak-doğrulandı, sprint-phases.ts 1163-1183):**
FIX trigger zinciri: `readTaskResult` → `evaluateResult` → eğer NO_GO/GO_WITH_TECH_DEBT ise `handleEvaluation()` priority-fix task yaratır (satır 1181-1183). `runFixPhase` (1599) fixableTasks = status NO_GO OR DONE+_evaluation=TECH_DEBT.

**ASIL HATA — FIX-task EXECUTE'te erken yaratılıyor, final eval'i beklemeden:** evaluateResult ASLINDA DOĞRU (result-evaluator.ts:163 `coverage !== null && coverage < THRESHOLD` null-guard'lı; :157 testsPassed+test-dosyası → DONE). 206-003 final eval = DONE. AMA FIX zaten EXECUTE sırasında tetiklenmiş. Deep-reader bulgusu (sprint-phases.ts): `runFixPhase` (1599) fixableTasks'ı `evaluations` Map'inden DEĞİL, `.tasks/task-*.json`'da `isPriorityFix && PENDING` tarayarak buluyor. Bu priority-fix task'ları `handleEvaluation`/`handleCrossDependencies`/mid-sprint-adapter tarafından final EVALUATE'ten ÖNCE (EXECUTE/continuous-dispatch sırasında, .result henüz eksik/yokken — satır 1164 `result yoksa NO_GO`) yaratılıyor. Sonuç: task disk'te DONE ama erken-NO_GO ile fix-task açılmış, geri alınmıyor.

Yan etmenler: (a) worker rubricScores/evaluationDecision tutarsız yazıyor, (b) evaluationDecision .result'a geri-yazılmıyor, (c) reconcileRubricNoGo rescue eşiği çok katı (rubricAvg≥85 AND coverage≥80), (d) erken-eval ile final-eval reconcile edilmiyor (DONE'a dönen task'ın priority-fix'i iptal edilmiyor).

**KESİN İSPAT:** Sprint 206 -fix.result'lar (002/005/006/007/008-fix) hepsi **+0/-0 files=0** — fix worker "düzeltilecek şey yok, zaten doğru" buldu. Orijinal NO_GO/TECH_DEBT sahteydi.

**ETKİ:** Her sprint ~5-7 gereksiz FIX worker → ~150-350K israf token + EVALUATE/FIX ~8-10dk uzama + sentetik "N NO_GO" raporları (203-206 hepsi) + gerçek NO_GO (206-004) gürültüye karışıyor.

**Why:** Deckent'in omurgası Brain evaluation. Bu bug TÜM "disk-verify zorunlu" + "sentetik NO_GO" feedback'lerinin kök nedeni. Düzelirse [[feedback_brain_synthetic_nogo_disk_verify]] + [[feedback_trust_brain_eval_not_worker]] büyük ölçüde çözülür.

**How to apply (Sprint 207 P0 "Brain Evaluation Integrity" — kaynak-doğrulandı):**
- P0 ASIL FIX: priority-fix task yaratımı (handleEvaluation/handleCrossDependencies/mid-sprint) final-eval'i beklemeli VEYA disk-verify gate'ten geçmeli. Erken-NO_GO (result yok/eksik) ile fix açıldıysa, final EVALUATE'te task DONE'a dönerse priority-fix'i İPTAL et (sprint-phases.ts:1599 fixableTasks filtresi final evaluations Map'ini de okusun, sadece isPriorityFix flag'ine güvenmesin).
- P0: runFixPhase fixable filter → `.tasks` isPriorityFix scan'i + evaluations Map cross-check. Task final-DONE ise fix-task'ı skip/iptal.
- P1: worker.ts → .result'a rubricScores + evaluationDecision tutarlı YAZ; evaluationDecision'ı .result'a GERİ YAZ (writeRubricToResult'a ekle).
- P1: erken-eval (EXECUTE, result eksik) NO_GO yerine PENDING/WAIT sinyali kullansın — .result yokluğu kalıcı NO_GO sayılmasın (satır 1164).
- P2: reconcileRubricNoGo eşiğini coverage-null-aware yap.
- Regresyon: 9 DONE + disk-landed → 0 priority-fix fixture; erken-eval sonra DONE → fix iptal fixture.

İlgili: [[feedback_brain_synthetic_nogo_disk_verify]], [[feedback_trust_brain_eval_not_worker]], [[feedback_zero_hardcode_live_data]], [[feedback_docker_oom_false_no_go]].
