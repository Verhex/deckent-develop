# ADR-019: Language-Agnostic Worker Verify (Sprint 046)

**Status:** accepted

**Date:** 2026-04-16

---

> ✅ **Reconciliation note (Sprint 178, 2026-05-20).** The implementation gap
> previously flagged in this ADR has been closed. The codebase now implements
> the decision as written:
>
> - **`STACK_COMMANDS` map** lives in `src/core/stack-detector.ts` and covers
>   18 stacks: typescript, javascript, python, go, rust, java_maven,
>   java_gradle, kotlin_maven, kotlin_gradle, csharp, swift, c_cmake, c_make,
>   ruby, php, dart, flutter (and an empty-fallback path for `unknown`).
> - **`detectFullStack(projectRoot)`** (`src/core/stack-detector.ts`) returns
>   `FullStackResult { language, framework, buildTool, testFramework,
>   commands: { build, test, lint } }` using a 4-layer detection chain
>   (user override → exclusive marker → file-count weighted → fallback).
> - **Runtime verify is stack-aware:** `src/agents/worker-verify.ts` exports
>   `getVerifyCommands()`, `verifyCompilation()`, and `verifyTests()`; both
>   verify functions dispatch the stack-detected `build` / `test` command
>   (vitest gets the `--reporter=verbose` flag; other runners get the bare
>   command with optional scope args). Empty build/test commands are treated
>   as "skip — language not supported", returning success.
> - **Worker barrel** (`src/agents/worker.ts`) re-exports
>   `getVerifyCommands`, `verifyCompilation`, `verifyTests` so existing
>   imports remain stable.
> - **Coverage:** `tests/agents/worker-verify-lang.test.ts` (20 tests, all
>   GREEN as of Sprint 178) exercises TypeScript, Python, Java Maven /
>   Gradle, Go, Rust, C CMake / Make, plus failure paths and scope arg
>   forwarding.
>
> Per **ADR-037 V1.0** the verify loop remains advisory / prompt-driven
> rather than code-enforced (`enforceVerifyLoop`/`runTestVerifyLoop` retain
> their advisory call surface). That property is orthogonal to ADR-019 —
> ADR-019 only mandates that *when* the verify loop runs, it dispatches the
> correct stack command. Hard runtime enforcement is tracked separately
> under ADR-037 V2 (post-GA).

**Context:** Worker verify loop sadece `tsc --noEmit` ve `vitest run` çalıştırıyordu. TypeScript dışı projelerde Deckent kullanılamıyordu.

**Decision:** `STACK_COMMANDS` ile dil bazlı build/test komutu belirlendi: Python → `pytest`, Go → `go test ./...`, Rust → `cargo test`. `.deckent/project-stack.json` dosyasından stack okunur.

**Consequence:** Deckent TypeScript dışı projelerde de çalışır. Verify döngüsü stack-aware hale geldi. Yeni dil eklemek `STACK_COMMANDS` map'ine bir entry eklemekle yapılır.

---

**Cross-ref — eval-side companion (WM-7, Sprint 254):** This ADR governs the **verify-command** side (stack-aware `build`/`test` dispatch). The **evaluation-criteria** side is its companion: `src/core/criteria-deriver.ts` (`deriveBaseCriteria(kind, stack, commands)` — never hardcodes `tsc`; doc→files-on-disk, audit→findings, code→detected stack commands) + `src/core/coverage-adapters.ts` (per-stack `testFilePattern`/`coverageCommand`, `isCoverageMeasurable`) + `src/core/work-model.ts` (`COVERAGE_MEASURABLE_STACKS`). Together they ensure a C++/Go task is NOT false-NO_GO'd for "tsc not clean" / "no vitest coverage". The WM-7 evaluation-integrity work has no standalone ADR yet (MASTER-PLAN work-item, DONE Sprint 254) — cross-ref ADR-070 (Brain Evaluation Integrity); a dedicated eval-criteria ADR is a candidate (assessed during ADR-070 review).

**Amendment log:** 2026-06-11 — eval-side companion (WM-7: criteria-deriver / coverage-adapters / work-model) cross-ref'i eklendi (Alperen ADR-review). md+db senkron.
