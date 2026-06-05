---
name: feedback_planner_dependency_parse_gap
description: "structured-planner DIRECTIVES \"- Dependencies:\" satırını task JSON'a yazmıyor → dependencies boş → wave kayması (pipeline true olsa bile tek-wave paralel)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Bug (cc+Alperen 2026-06-02, Sprint 223):** DIRECTIVES task'larında `- Dependencies: 223-006` satırı yazılsa bile, structured-planner (`deckent plan`) bunu task JSON'un `dependencies` alanına **YAZMIYOR** — tüm task'lar `"dependencies": []` ile çıkıyor. `dependency_pipeline_enabled: true` (wave aktif) OLSA BİLE bölecek dependency olmadığı için **13 task tek-wave'de paralel** başlar → **wave kayması**.

**Why (risk):** Sıralı olması gereken task'lar paralel çalışır → hollow/takılma:
- En tehlikeli: nervous-re-enable (örn 223-009) ⊥ panic-gate-non-blocking (223-006) paralel → nervous 006'sız enable → **sprint takılma deadlock** ([[project_nervous_panic_gate_silent_block]]).
- wire-task'lar ⊥ modül-task'lar paralel → modül-yokken wire → hollow ([[feedback_wiring_pct_vs_user_working]], Sprint 222 persistent tekrarı).

**How to apply:**
- **Her `deckent plan` sonrası dependency-kontrol:** `for f in .tasks/task-NNN-*.json; do node -e "const t=require('fs').readFileSync('$f');..."; done` — kritik sıralı task'ların `dependencies` dolu mu DOĞRULA. Boşsa elle ekle (task spawn-olmadan/PENDING iken):
  ```bash
  node -e "const fs=require('fs');const f='.tasks/task-NNN-XXX.json';const t=JSON.parse(fs.readFileSync(f,'utf8'));t.dependencies=['NNN-YYY'];fs.writeFileSync(f,JSON.stringify(t,null,2))"
  ```
- Pipeline true → eklenen dependency wave'i doğru sıralar (task PENDING/spawn-olmamış iken eklenmeli).
- ÇİFT KORUMA: ayrıca riskli task'ı (nervous re-enable) izle — bağımlısı DONE olmadan tehlikeli aksiyon yaparsa geri-al.
- **Fix iş maddesi (Sprint 224):** task-builder/planner DIRECTIVES `- Dependencies:` satırını parse edip task.dependencies'e yazsın (forceX override gibi). İlgili: [[feedback_directive_kanit_letter_vs_goal]], [[feedback_finalize_force_orphan_state]].
