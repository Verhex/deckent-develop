# ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Brain, projede diğer modülleri (tmux, auditor, worker) import eden TEK modüldür. Diğer modüller brain'i import etmez.
**Context:** Döngüsel import'lar Node.js ESM'de tanımsız davranışa yol açar. Brain orkestratör rolünde — tmux/auditor/worker'ı çağırır ama onlar brain'den bağımsız çalışır.
**Consequence:** `grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` her zaman boş sonuç vermeli. Yeni modüller eklenirken bu kural korunmalı.

**Note (current enforcement & refinement):** The enforced lint (`src/orchestra/authority-enforcer.ts`, ADR-008 check) specifically scans the **import direction `core/ → orchestra/`**: `core/` must not depend on `orchestra/`; the orchestra Brain layer is the only place that imports `orchestra/` internals — a broader rule than the original `from.*brain` grep. Per ADR-037 V1.0 this check is **advisory/soft** (warns + emits, does not hard-block). After the god-object split, `src/orchestra/brain.ts` is a thin re-export layer; the actual importer is `sprint-controller`, and `planner` imports only from `core/`. The canonical refined statement of these import rules lives in `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules). Behavior unchanged; documentation alignment only.

**Sprint 279 (WK-import):** the `core/audit-writer.ts` + `core/audit-query.ts` → `orchestra/event-stream.js` cycle was resolved by **moving `event-stream` into `core/`** (`src/core/event-stream.ts`; `orchestra/event-stream.ts` is now a re-export shim). 

**🔴 Residual violation (2026-06-11 ADR-review, tracked):** ONE `core/ → orchestra/` import remains — `src/core/routing-engine.ts:30` imports `analyzeSkillInMemory` from `../orchestra/ecosystem-intelligence.js`. The advisory/soft enforcement (ADR-037 V1.0) let it persist. Fix tracked as MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-008-W" (move the consumed function/module to `core/`, or invert the dependency).

---

**Amendment log:** 2026-06-11 — Note'a Sprint-279 cycle-fix (event-stream→core/) + **kalan 1 ihlal** (routing-engine→ecosystem-intelligence) kaydedildi; ADR-008-W iş-maddesi açıldı (Alperen ADR-review).

---

## Amendment — Sprint 281 (2026-06-11, faz-2 orchestra-analizi: "Brain-ailesi" tanımı)

**Kanun-güncellemesi (Alperen onaylı):** Orijinal lafız "tmux/auditor/worker'ı import eden TEK modül Brain'dir" der; ADR-024/026 god-object split'i Brain'i kasıtlı olarak organlara böldü. Bugün tmux/auditor/worker'ı import eden 10+ orchestra-modülü var ve bunlar İHLAL DEĞİL — Brain'in split-organlarıdır. Kural şöyle netleştirilir:

> **Brain-ailesi** = `sprint-controller` + ondan extract edilen faz/yardımcı organlar: `sprint-phases`, `sprint-spawner`, `sprint-lifecycle`, `sprint-planner`, `sprint-finalizer`, `sprint-utils`, `result-collector`, `result-evaluator`, `debt-manager`, `resource-monitor` + spawn-soyutlaması (`spawn-backend`, `spawn-backend-docker`) + ince re-export `brain.ts`/`index.ts`. **tmux/auditor/worker'ı YALNIZ Brain-ailesi import edebilir.** Aile-dışı orchestra-modülü, cli/, api/, mcp/ bu üçlüyü doğrudan import edemez. Tek-yön ilkesi değişmez: tmux/auditor/worker brain'i import etmez; `core/` hiçbir üst-katmanı import etmez.

**Faz-2 tespitleri (MASTER-PLAN ORCH-W):** (1) `debt-manager → agents/worker.js` importu aile-içi ama amaç-incelemesi bekliyor (ORCH-W2). (2) **Ters-yön sızıntı:** `task-mode-runner.ts:18-19 → cli/commands/run+spawn` — 302-LoC `spawnWorkerMultiProvider` spawn-mantığı CLI'da yaşıyor ve orchestra ona bağımlı; fix = spawn-mantığını orchestra'ya taşı, cli thin-wrapper (ORCH-W1). (3) `sprint-finalizer:85`/`sprint-phases:88` → cli/helpers (presentation/splash) — orchestra→cli importları temizlenecek (ORCH-W1). (4) İkinci core→cli ihlali `directive-interrogator.ts:18` (CORE-W1). md+db senkron (Alperen ADR-review).
