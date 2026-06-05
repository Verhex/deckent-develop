---
name: feedback_fix_prompt_quality
description: FIX fazı prompt sorunları — boş Task bölümü + yönlendirmesiz fix + bağlama uymayan bug-fixer agent; Sprint 210 ele al
metadata: 
  node_type: memory
  originSessionId: 89c2bcbe-de85-4468-bb6d-2fa12f4b7622
---

Alperen "ara iş" analizi (Sprint 209, 2026-06-01, 209-009-fix bug-fixer prompt incelemesi).

**DÜZELTME (kendi ilk analiz hatam):** 209-009'un `.result`'ı `selfAssessment=NO_GO, files=0, +0/-0, tests=false` — yani worker GERÇEKTEN başaramadı (sahte-NO_GO DEĞİL). hb `status=DONE` sadece "worker süreci bitti" (heartbeat status ≠ task verdict — KARIŞTIRMA). Brain bu sefer DOĞRU: Sprint 209'da sadece 1 FIX (önceki 7 sahte-FIX yok), Brain-fix hâlâ çalışıyor. 13/14 DONE, 209-009 (docker-backend e2e izolasyon) kronik zor task (206/207/208'de de çözülemedi).

**Brain note yanıltıcı:** "Worker exited without writing result (exitCode=0)" diyor ama result VAR (NO_GO). Doğru not: "Worker self-assessed NO_GO" olmalı. Note kalitesi düşük ama karar doğru.

**GEÇERLİ FIX PROMPT SORUNLARI (NO_GO doğru olsa da prompt kalitesi düşük):**

1. **FIX prompt `=== Task ===` bölümü BOŞ:** fix worker'a asıl görev tanımı (orijinal task description/Çözüm) verilmiyor. Sadece "Original worker notes: Worker exited without writing result" — yani NE düzelteceği YOK, nasıl yaklaşacağı YOK. Worker körlemesine çalışıyor. Düzeltme: fix prompt'a orijinal task'ın FULL description + somut düzeltme yönergesi inject et.

2. **Bağlama uymayan agent: hep bug-fixer:** 209-009 test-izolasyon task'ı (kaynak bug değil, vitest state-sızıntısı) ama FIX bug-fixer agent (5 Whys, bisect, regression-test disiplini) ile geliyor — task türüne uymuyor. Düzeltme: fix agent'ı orijinal task türüne göre seç (test-izolasyon→ci-testing, doc→doc-writer).

3. **Brain note kalitesi:** "exited without writing result" yanlış (result var, NO_GO). Doğru sebep yazılmalı (debug için).

4. **✅ İyi:** ADR-070 prompt'a tam inject (coverage:null signal-based worker'da). Karpathy disiplini + skill (ci-testing) var. Korunmalı.

**Why:** FIX fazı Brain omurgası. Boş-task + yanlış-agent = fix worker etkisiz çalışır (209-009-fix muhtemelen yine NO_GO — çünkü ne yapacağını bilmiyor + docker e2e zaten zor). Token israfı + düzeltme başarısızlığı.

**How to apply (Sprint 210):**
- FIX prompt enrichment: orijinal task FULL description + NO_GO reason + somut fix yönergesi (task-builder fix-task oluşturma).
- FIX agent seçimi: orijinal task türü/agent'ına göre (sadece bug-fixer değil).
- Brain note doğruluğu: "exited without result" yerine gerçek sebep (self=NO_GO, files=0 vb.).

İlgili: [[feedback_brain_synthetic_nogo_disk_verify]], [[feedback_brain_rubric_bridge_broken]], [[feedback_agent_routing_imbalance]], [[feedback_trust_brain_eval_not_worker]].
