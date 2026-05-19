# ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Brain, projede diğer modülleri (tmux, auditor, worker) import eden TEK modüldür. Diğer modüller brain'i import etmez.
**Context:** Döngüsel import'lar Node.js ESM'de tanımsız davranışa yol açar. Brain orkestratör rolünde — tmux/auditor/worker'ı çağırır ama onlar brain'den bağımsız çalışır.
**Consequence:** `grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` her zaman boş sonuç vermeli. Yeni modüller eklenirken bu kural korunmalı.

**Note (current enforcement & refinement):** The enforced lint (`src/orchestra/authority-enforcer.ts`, ADR-008 check) specifically scans the **import direction `core/ → orchestra/`**: `core/` must not depend on `orchestra/`; the orchestra Brain layer is the only place that imports `orchestra/` internals — a broader rule than the original `from.*brain` grep. Per ADR-037 V1.0 this check is **advisory/soft** (warns + emits, does not hard-block). After the god-object split, `src/orchestra/brain.ts` is a thin re-export layer; the actual importer is `sprint-controller`, and `planner` imports only from `core/`. The canonical refined statement of these import rules lives in `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules). Behavior unchanged; documentation alignment only.
