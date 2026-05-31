---
name: feedback-docker-oom-false-no_go
description: "Docker container OOM kill (exit 137 SIGKILL) Brain'in sentetik NO_GO yazmasına neden olur AMA worker disk'te kod yazmış olabilir; her OOM NO_GO için disk-verify zorunlu (git diff --stat + git ls-files --others)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** Docker worker container OOM-killed (exit 137 SIGKILL) → Brain `.result` boş veya `.partial-result` görüp **sentetik NO_GO** yazar. AMA worker exit'ten ÖNCE disk'e source code yazmış olabilir. **Her OOM/auth-fail NO_GO için disk-verify zorunlu**.

**Why:** Sprint 189-190 chronic Docker OOM cycle:
- WSL2 host 12-16GB
- 3 paralel opus worker × 4-5GB peak = 12-15GB
- Linux OOM-killer container SIGKILL
- Worker shell trap çalışmaz (SIGKILL), `.result` yazılmaz
- Brain sentetik NO_GO yazar (filesChanged:[], linesAdded:0)
- **AMA disk'te +500 LoC kod var** (Sprint 194 kanıt: 1633 LoC rescue)

**How to apply:**
- Her sprint sonu (özellikle NO_GO varsa) **MANUAL disk-verify**:
  ```bash
  git diff --stat HEAD
  git ls-files --others --exclude-standard
  for f in .tasks/task-*.result; do grep selfAssessment $f; done
  ```
- Disk'te kod varsa → rescue commit yap (Sprint 194 pattern: 4 commit, 1633 LoC)
- Sprint 195 195-001 `disk-verify.ts` gate Brain raporuna alternative — MANUAL_REVIEW_REQUIRED status
- Sprint 197 197-001 keşfetti: 2 ek synthetic NO_GO callsite (sprint-phases runEvaluatePhase, sprint-controller graceKill) → Sprint 198-001 fix
- WSL2 mitigation: max_workers düşür (Sprint 197 3→2) veya host RAM artır (~/.wslconfig memory=24GB)
- Kullanıcı tercihi (2026-05-26): max_workers=6, worker_memory_limit=2g (kompromi)

**Anti-pattern:**
- "NO_GO görünüyor, task fail" → ✗ önce disk-verify
- "Brain raporu kesin" → ✗ Brain raporu ipucu, disk ground truth ([[feedback_trust_brain_eval_not_worker]])
- "Cleanup yap, hızlı git" → ✗ rescue commit kaçır, kod kaybı

İlgili: [[feedback_brain_synthetic_nogo_disk_verify]], [[feedback_trust_brain_eval_not_worker]], [[project_system_risk_inventory]]
