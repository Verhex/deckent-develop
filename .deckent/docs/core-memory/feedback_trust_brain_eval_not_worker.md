---
name: feedback-trust-brain-eval-not-worker
description: "Brain evaluation verdict gerçek karar — worker .result selfAssessment ipucu/öneri. Brain rubric + honest-gate + disk-verify ile worker iddiasını override edebilir. AMA Brain'in kendi sentetik NO_GO'su DA disk-verify ile çürütülebilir (Sprint 194-197 kanıt)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** Worker `.result.selfAssessment` (DONE/GO_WITH_TECH_DEBT/NO_GO) **worker'ın kendi iddiası** — ipucu/öneri seviyesinde. **Brain evaluation** (`evaluateWithRubric` + `honest-gate`) verdict — gerçek karar. AMA Brain sentetik NO_GO yazdığında DA **disk-verify ile çürütülebilir** (Sprint 194: 1633 LoC rescue).

**Why:**
- Worker honest assessment uyarılı (Karpathy Discipline 4) AMA dürüstlük garantisi yok
- Honest-gate (Sprint 194 a6aa86ce) worker yalan iddialarını yakalar (LOC_DELTA_MISMATCH, FILES_NOT_TOUCHED)
- AMA Brain'in KENDİSI sentetik NO_GO yazabiliyor (5 → 7 kaynak haritası, [[feedback_brain_synthetic_nogo_disk_verify]])
- Disk durumu (`git diff --stat HEAD` + `git ls-files --others`) **GROUND TRUTH**

**3-katmanlı hiyerarşi:**
```
1. Worker selfAssessment (DONE/GO_WITH_TECH_DEBT/NO_GO) ← IPUCU
        ↓
2. Brain evaluateWithRubric + honest-gate ← KARAR
        ↓
3. Disk-verify (git diff + ls-files) ← GROUND TRUTH (Sprint 195+ gate'li)
```

**How to apply:**
- Sprint sonu Brain raporunu **disk-verify** ile cross-check
- Brain "NO_GO" + disk'te kod var → MANUAL_REVIEW_REQUIRED (Sprint 195 195-001 gate)
- Worker "DONE" + disk boş → honest-gate FILES_NOT_TOUCHED catch
- Worker "DONE" + Brain "NO_GO" + disk dolu → rescue commit pattern (Sprint 194-197)
- `deckent retro` output Brain bakışı, disk-verify Alperen disiplini

**Anti-pattern:**
- "Brain NO_GO dedi, task fail" → ✗ disk-verify zorunlu
- "Worker DONE dedi, geç" → ✗ honest-gate kontrol et
- "Self-assessment yeterli" → ✗ Brain rubric override edebilir
- "Brain rubric yeterli" → ✗ disk-verify ground truth

**Sprint 195-197 dogfood:** 17 rescue commit, ~6500 LoC kurtarıldı — Brain raporunda görünmeyen ama disk'te land etmiş kod.

İlgili: [[feedback_brain_synthetic_nogo_disk_verify]], [[feedback_docker_oom_false_no_go]]
