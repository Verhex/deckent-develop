# ADR-019: Language-Agnostic Worker Verify (Sprint 046)

**Status:** accepted

**Date:** 2026-04-16

---

> ⚠️ **Implementation gap — status under review.** The *decision* was accepted,
> but the codebase does **not** implement it as written. There is **no
> `STACK_COMMANDS` map** in `src/` (the string only appears in the ADR seed
> data, `src/core/adr-seed.ts`). What exists today:
> - **Language/framework detection only:** `DetectedTestFramework` type
>   (`src/core/config-types.ts`) and an analyzer heuristic
>   (`src/core/analyzer.ts` — `python ? 'pytest' : 'vitest'`); `.deckent/project-stack.json` is written.
> - The runtime worker verify loop (`src/agents/worker-verify.ts`) is
>   **`tsc` + `vitest` oriented** — it does **not** dispatch
>   `pytest` / `go test` / `cargo test`.
> - Per **ADR-037 V1.0** the verify loop is advisory / prompt-driven, not
>   code-enforced (`enforceVerifyLoop`/`runTestVerifyLoop` have 0 runtime
>   callers).
>
> Net: language **detection** is partially realized; stack-aware verify
> **execution** is **not implemented**. This ADR's `accepted` status is kept
> only because the enum is constrained; the accuracy/scope is **flagged for
> review and completion** (tracked as a follow-up work item — see Sprint
> 173+ handoff / ADR-019 reconciliation).

**Context:** Worker verify loop sadece `tsc --noEmit` ve `vitest run` çalıştırıyordu. TypeScript dışı projelerde Deckent kullanılamıyordu.

**Decision (as recorded — partially unimplemented, see note above):** `STACK_COMMANDS` ile dil bazlı build/test komutu belirlendi: Python → `pytest`, Go → `go test ./...`, Rust → `cargo test`. `.deckent/project-stack.json` dosyasından stack okunur.

**Consequence (intended — not fully realized):** Deckent TypeScript dışı projelerde de çalışır. Verify döngüsü stack-aware hale geldi. Yeni dil eklemek `STACK_COMMANDS` map'ine bir entry eklemekle yapılır.
