---
name: feedback-brain-synthetic-nogo-disk-verify
description: "Brain `Worker exited without writing result, exitCode=0` durumunda sentetik NO_GO `.result` yazıyor (filesChanged:[], linesAdded:0); ama disk'te gerçek kod olabilir. Her NO_GO için disk-verify ŞART."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

Brain Sprint 192 ve Sprint 194 dogfood kanıtı: worker container API rate-limit / credit drain / auth-loss nedeniyle erken exit ettiğinde Brain sentetik `.result` yazıyor:

```json
{"filesChanged":[],"linesAdded":0,"selfAssessment":"NO_GO",
 "notes":"Worker exited without writing result (exitCode=0)"}
```

**ANCAK** worker, ölmeden önce dosya yazmış olabilir — `.tasks/task-NNN.result`'a yazamadan önce disk'e source code commit eden timing window var. Bu durumda:
- `.result` NO_GO (Brain raporu) ← sahte
- `git diff HEAD --stat` + `git ls-files --others --exclude-standard` disk'te DURUYOR ← gerçek (push gerekmiyor, local committed code yeterli)

### Sentetik NO_GO yazımının 5 KAYNAĞI (2026-05-26 derinleşme)

1. **Container EXIT trap** — `spawn-backend-docker.ts:330-331`: `git diff --name-only` (numstat değil!) ile dosya sayısına bakıyor. 0 dosya → sentetik NO_GO; >0 dosya → TIMEOUT_WITH_WORK. LoC delta hesaplaması YOK.
2. **result-collector.ts:461-484** — `.timeout` marker varsa ve `.result` yoksa sentetik NO_GO yazıyor (backend-agnostic, tüm 3 backend'i etkiler).
3. **honest-gate.ts:160** — `filesChanged.length === 0` early return → sentetik NO_GO'da dishonesty check by-pass (FILES_NOT_TOUCHED / LOC_DELTA_MISMATCH atlanır).
4. **Brain recovery restoreSprintFromCheckpoint** — `sprint-checkpoint.ts:596-607`: stale EXECUTING task'lara otomatik NO_GO yazımı (inline writeFileSync, mid-write JSON truncate riski).
5. **MCP stale config** — Singleton config eski state'de → SPAWN_FAILED → fallback NO_GO. Worker hiç çağrılmaz ama Brain "task fail" yazar.

### Sprint 196 dogfood (2026-05-26) — disk-verify gate UNTRACKED gap

Sprint 195 195-001 disk-verify gate (`src/orchestra/disk-verify.ts`) runtime'a girdi (build edildi + /mcp restart). Sprint 196'da 11 task, Brain 5 NO_GO bildirdi. Disk-verify rescue: 8/8 zorunlu task DONE (+3043 LoC). 

**Bulgu:** Gate'in `verifyDiskAgainstClaim()` muhtemelen `git diff --numstat HEAD` ile sadece **tracked** dosya değişikliklerine bakıyor, **`git ls-files --others --exclude-standard`** untracked yeni dosyaları yakalamıyor. 196-005 (token-counter.ts YENİ DOSYA) ve 196-008 (CHANGELOG entry — tracked) için pattern farklı sonuç verdi.

**Sprint 197+ acil fix:** disk-verify.ts'te `untrackedFiles` aggregation'ı doğrula + entegre et — `hasDiskEvidence = linesAdded > 0 || untrackedFiles.length > 0`. 195-001 worker'ı bu helper'ı yazdı (gitLsOthersProvider seam mevcut) ama wire %100 değil.

**Why:** Sprint 194 (2026-05-26) 14-task'ın 12'si timeout/NO_GO. Disk-verify sonrası 4 task gerçekten kod yazmıştı:
- 194-001: +321 LoC auth health check (5 test pass)
- 194-002: +911 LoC honest-gate dishonest detector (19 test pass)
- 194-004: +10 LoC NODE_OPTIONS container env
- 194-005: +328 LoC host-detector + adaptive scheduler (14 test pass)

Toplam **1570 LoC** Brain raporunda "filesChanged:[], linesAdded:0" diye geçti, disk'te tsc clean + test pass durumda land etmişti. 4 rescue commit ile kurtarıldı (37ba9532, 1bec2144, a6aa86ce, ana wire 6d9c62c8).

**How to apply:**
- **Her NO_GO sprint sonunda ZORUNLU disk-verify**:
  ```bash
  git diff --stat HEAD~N  # N=sprint commit sayısı
  git ls-files --others --exclude-standard  # yeni dosya
  for f in .tasks/task-*.result; do
    grep -oE '"selfAssessment":"[^"]*"' $f
  done
  ```
- Brain `.result` ile disk arasında ±%50 LoC delta varsa disk-verify zorunlu
- 194-002 honest-gate detector ÇIKINDAN sonra worker-tarafı yalanları yakalar AMA Brain-tarafı yalanları (sentetik NO_GO + disk'te kod) **HENÜZ YAKALAMIYOR** — gelecek sprint için ek detector ihtiyacı (BRAIN_SYNTHETIC_NOGO_DISK_MISMATCH)
- Sprint kill durumunda da disk-verify YAP (Sprint 194 kill sonrası rescue commit'leri sayesinde 1570 LoC kazanıldı)

İlgili: [[feedback_container_auth_precedence]], [[feedback_no_synthetic_results]] (eski Sprint 191/192)
