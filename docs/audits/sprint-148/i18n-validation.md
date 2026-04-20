# Sprint 148 i18n Parity Validation Report

**Status:** GO ✅  
**Date:** 2026-04-20  
**Task:** T-148-018 — i18n Parity — TR/EN Task Description Routing Identical

## Summary

Validated that semantically equivalent tasks described in Turkish (TR) and English (EN) produce
**identical routing decisions** from the Deckent intent classifier and agent fallback chain.

All 8 parity assertions passed (4 TR/EN pairs × 2 assertions each).

## Test Results

```
✓ tests/i18n/task-description-parity.test.ts (9 tests) 6ms
  ✓ Pair 1: src/core/ scope — TR primary intent === EN primary intent
  ✓ Pair 1: src/core/ scope — TR agent === EN agent
  ✓ Pair 2: tests/nervous/ scope — TR primary intent === EN primary intent
  ✓ Pair 2: tests/nervous/ scope — TR agent === EN agent
  ✓ Pair 3: src/mcp/ scope — TR primary intent === EN primary intent
  ✓ Pair 3: src/mcp/ scope — TR agent === EN agent
  ✓ Pair 4: docs/ scope — TR primary intent === EN primary intent
  ✓ Pair 4: docs/ scope — TR agent === EN agent
  ✓ test-writer not reachable via any fallback chain (Sprint 148 reform)
```

## Task Pairs Validated

| Pair | TR Description | EN Description | Scope | Expected Intent | Agent |
|------|----------------|----------------|-------|----------------|-------|
| 1 | Nervous types runtime tiplerini genişlet | Extend nervous types runtime types | `src/core/` | `implementation` | `architect` |
| 2 | DIRECTIVES.md koruma detektörü test et | Test DIRECTIVES.md protection detector | `tests/nervous/` | `implementation` | `architect` |
| 3 | MCP nervous tool 5 adet ekle | Add 5 MCP nervous tools | `src/mcp/` | `implementation` | `architect` |
| 4 | Dokümantasyon güncelle | Update documentation | `docs/` | `documentation` | `doc-writer` |

## Why TR/EN Parity Works

The `classifyIntent()` function (Sprint 148 taxonomy reform) uses **scope-based signals** as the
dominant factor for intent classification:

1. **Scope directories are language-agnostic** — both TR and EN tasks use the same directory paths
   (e.g., `src/core/`, `tests/nervous/`). Directory paths are always ASCII.

2. **`SCOPE_INTENT_SIGNALS`** pattern-match on paths, not on text descriptions. Identical scope →
   identical scope signals.

3. **Write ratio analysis** (lines 126–144 of intent-classifier.ts) determines `testWriteRatio` and
   `docRatio` from file paths, not text — inherently language-agnostic.

4. **AGENT_FALLBACK_CHAIN** is a pure `Record<IntentType, string[]>` — deterministic given the same
   primary intent.

5. **Turkish keyword matching** — While Turkish descriptions may not match all English INTENT_KEYWORDS,
   the scope signals dominate sufficiently for consistent routing.

## Turkish Character Handling

Turkish descriptions contain locale-specific characters (ş, ğ, ı, ç, ö, ü). The intent classifier
applies `.toLowerCase()` on the text, which JavaScript handles correctly for Unicode characters.
However, the INTENT_KEYWORDS are all ASCII English, so Turkish descriptions rely more heavily on
scope signals for accurate classification.

This is the expected and correct behavior: **scope is truth, text is a hint**.

## Sprint 148 Reform Note

- `test-writer` agent is NOT present in any `AGENT_FALLBACK_CHAIN` path (validated by bonus test)
- Tasks with `tests/` scope get `test-coverage` tag (TaskDNA.tags) + `testing-expert` skill
- Primary intent for test files is `implementation`, routed to `architect`

## Commands

```bash
# Run parity tests
npx vitest run tests/i18n/task-description-parity.test.ts

# TypeScript check
npx tsc --noEmit
```

## Verdict

**GO** — TR/EN routing parity confirmed. The scope-dominant design of `classifyIntent()` ensures
language-agnostic routing decisions. Sprint 148 taxonomy reform (test-writer removal) applies
consistently across both languages.
