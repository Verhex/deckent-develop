# ADR-009: DEBT.md Markdown Tablo Formatı

**Status:** deprecated

**Date:** 2026-04-16

**Superseded by:** ADR-088 (Memory V2 — DB-First Architecture). Debt — like all brain knowledge — now lives in `.brain/memory.db` (`type='debt'`); `.brain/exports/debt.md` is a generated export, not the source.

---

**Decision:** DEBT.md, 9 kolonlu markdown tablo formatında tutulur. Brain `parseDebtTable`/`generateDebtTable` ile programatik okuma/yazma yapar.
**Context:** DebtItem interface'inin tüm alanlarını (id, description, originTaskId, originSprintId, priority, sprintsOpen, resolved, resolvedInSprintId, createdAt) saklamalıyız. JSON yerine markdown tercih edildi çünkü git diff'lerde okunabilir.
**Consequence:** Tablo parse'ı `|` split + `slice(1,-1)` ile yapılır. Boş kolon değerleri korunur. Yeni kolon eklemek parse/generate'i güncellemeyi gerektirir.

**Note (superseded by Memory V2 — DB-first):** This ADR records the **V1 design** where `DEBT.md` was the hand-maintained source of truth. Under **Memory V2**, technical debt lives in `.brain/memory.db` (SQLite, entries with `type='debt'` — see `src/orchestra/debt-manager.ts`, `store.getByType('debt')`); `.brain/exports/debt.md` is now a **generated export**, not the source. The original `parseDebtTable`/`generateDebtTable` markdown model is superseded by `MemoryStore` (consistent with the Memory V2 model in `docs/architecture/memory-system.md` and `docs/reference/api-surface.md`). Behavior unchanged; documentation alignment only.

---

**Amendment log:** 2026-06-11 — Status `accepted` → **`deprecated`** (Note zaten "superseded" diyordu, status çelişiyordu). **Superseded by ADR-088** (Memory V2 — DB-First Architecture, yeni accepted, agent-inject) — Memory V2'nin ilk resmî ADR'si; bu eski V1 DEBT.md kararını genelleştirir (Alperen ADR-review).
