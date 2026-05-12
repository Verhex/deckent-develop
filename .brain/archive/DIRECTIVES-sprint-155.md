# DIRECTIVES — Sprint 155 (Bug B Fix Smoke Validation)

> Hedef: Sprint 154 sonrası `npm run build` ile canlanan TaskType registry + coverage:null tolerance fix'inin **Brain rubric'inde gerçekten devrede** olduğunu kanıtla. 10 paralel doc-write task — beklenen: 10/10 DONE, fix worker spawn YOK.

## Bağlam

Sprint 153 smoke 9/10 false NO_GO almıştı (coverage:null patolojisi). Sprint 154 dogfood kendi kendini fixledi (rubric-registry.ts + result-evaluator.ts modifikasyonları). `npm run build` + MCP restart yapıldı. Bu sprint o fix'in canlı kanıtı.

**Acceptance:**
- 10/10 task DONE evaluation (NO fix-of-fix spawn)
- Brain `getRubric(task)` → DOC_WRITE_RUBRIC dispatch eder
- `validateResultSchema` coverage:null tolerate eder doc task'larda

---

## Task 1: deckent_start MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-01.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_start MCP tool'unun ne yaptığını anlat. Parametreleri (autoApprove/dryRun/force/sandbox/timeout) ve nasıl çalıştığını yaz. 200+ kelime.

---

## Task 2: deckent_status MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-02.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_status MCP tool'unu anlat. Dönen alanlar (sprint phase, workers, progress, alerts, eventStreamTail). outputMode seçenekleri (standart/explainatory/verbose/json). 200+ kelime.

---

## Task 3: deckent_plan MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-03.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_plan MCP tool'unu anlat. mode seçenekleri (ai/structured/auto). DIRECTIVES'ten task listesi nasıl türetilir. Dry-run davranışı. 200+ kelime.

---

## Task 4: deckent_set_directives MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-04.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_set_directives MCP tool'unu anlat. content parametresi formatı (## Task N başlıkları). Parser nasıl çalışıyor (parseStructuredDirectives). 200+ kelime.

---

## Task 5: deckent_retro MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-05.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_retro MCP tool'unu anlat. Sprint sonu retro nasıl üretilir. Brain'in metric summary + learning extraction süreci. 200+ kelime.

---

## Task 6: deckent_cleanup MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-06.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_cleanup MCP tool'unu anlat. .tasks/ arşivleme, lock release, metrics rotation. Sprint sonu disiplini. 200+ kelime.

---

## Task 7: deckent_doctor MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-07.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_doctor MCP tool'unu anlat. Health check'ler (Node, git, Claude CLI, providers, Memory V2). Status NOT READY ne anlama gelir. 200+ kelime.

---

## Task 8: deckent_recover MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-08.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_recover MCP tool'unu anlat. Orphan sprint detection, stale PID temizliği, archive promotion. Hangi durumda çağrılır. 200+ kelime.

---

## Task 9: deckent_audit MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-09.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_audit MCP tool'unu anlat. Brain Self-Audit gate. tsc/vitest/honesty/observability dimension'ları. gate.json çıktısı. 200+ kelime.

---

## Task 10: deckent_memory_query MCP Tool Özet
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-13/T-SMOKE-10.md
- Scope: docs/smoke-2026-05-13/

### Description
deckent_memory_query MCP tool'unu anlat. Memory V2 SQLite FTS5 query. Type filter (debt/adr/memory/retro/sprint/identity). Recall vs promote. 200+ kelime.
