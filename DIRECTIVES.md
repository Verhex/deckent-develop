# DIRECTIVES — Run 475: Deneme 50-Task Heterogeneous File-Creation Sprint

## Goal
Create a root-level `deneme/` fixture tree through 50 independent tasks. Every task owns one isolated subdirectory and produces exactly one simple Markdown document plus one directly runnable TypeScript example.

## Execution Contract
- This sprint is intentionally provider-neutral at the product level; concrete worker provider/model values below are the current effective-config projection required by the structured planner.
- Concurrency and worker count are resolved from effective config; they are not prescribed here.
- Effective billing is explicitly `subscription` for every task; subscription workers are governed by provider quota evidence, not the API/USD sprint ledger.
- Worker projection is heterogeneous: Codex Terra handles tasks 001–020, Codex Luna handles tasks 021–035, and Claude Sonnet handles tasks 036–050.
- Claude Haiku is intentionally excluded: the active performance config has `haiku_allowed=false`, and every task writes TypeScript while the project contract restricts Haiku to documentation-only work.
- Tasks are independent and may run in any wave/order.
- Each task may write only its declared `deneme/task-NNN/` scope.
- A task may replace a partial file left in its own scope by an earlier aborted run, but must not inspect or modify another task's directory.
- No task may modify product source, configuration, memory, ADRs, lockfiles, or existing tests.
- Every `example.ts` must use `node:assert/strict`, contain exactly one meaningful passing assertion, and be runnable by its declared Node 24 type-stripping command.
- The owner has explicitly authorized both planning and sprint start for this run.

## Task 1: DENEME-001 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-001/README.md, deneme/task-001/example.ts
- Scope: deneme/task-001/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 001` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `001`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-001/README.md && test -f deneme/task-001/example.ts`
**Test:** `node --experimental-strip-types deneme/task-001/example.ts`

## Task 2: DENEME-002 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-002/README.md, deneme/task-002/example.ts
- Scope: deneme/task-002/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 002` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `002`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-002/README.md && test -f deneme/task-002/example.ts`
**Test:** `node --experimental-strip-types deneme/task-002/example.ts`

## Task 3: DENEME-003 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-003/README.md, deneme/task-003/example.ts
- Scope: deneme/task-003/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 003` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `003`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-003/README.md && test -f deneme/task-003/example.ts`
**Test:** `node --experimental-strip-types deneme/task-003/example.ts`

## Task 4: DENEME-004 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-004/README.md, deneme/task-004/example.ts
- Scope: deneme/task-004/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 004` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `004`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-004/README.md && test -f deneme/task-004/example.ts`
**Test:** `node --experimental-strip-types deneme/task-004/example.ts`

## Task 5: DENEME-005 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-005/README.md, deneme/task-005/example.ts
- Scope: deneme/task-005/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 005` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `005`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-005/README.md && test -f deneme/task-005/example.ts`
**Test:** `node --experimental-strip-types deneme/task-005/example.ts`

## Task 6: DENEME-006 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-006/README.md, deneme/task-006/example.ts
- Scope: deneme/task-006/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 006` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `006`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-006/README.md && test -f deneme/task-006/example.ts`
**Test:** `node --experimental-strip-types deneme/task-006/example.ts`

## Task 7: DENEME-007 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-007/README.md, deneme/task-007/example.ts
- Scope: deneme/task-007/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 007` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `007`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-007/README.md && test -f deneme/task-007/example.ts`
**Test:** `node --experimental-strip-types deneme/task-007/example.ts`

## Task 8: DENEME-008 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-008/README.md, deneme/task-008/example.ts
- Scope: deneme/task-008/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 008` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `008`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-008/README.md && test -f deneme/task-008/example.ts`
**Test:** `node --experimental-strip-types deneme/task-008/example.ts`

## Task 9: DENEME-009 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-009/README.md, deneme/task-009/example.ts
- Scope: deneme/task-009/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 009` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `009`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-009/README.md && test -f deneme/task-009/example.ts`
**Test:** `node --experimental-strip-types deneme/task-009/example.ts`

## Task 10: DENEME-010 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-010/README.md, deneme/task-010/example.ts
- Scope: deneme/task-010/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 010` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `010`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-010/README.md && test -f deneme/task-010/example.ts`
**Test:** `node --experimental-strip-types deneme/task-010/example.ts`

## Task 11: DENEME-011 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-011/README.md, deneme/task-011/example.ts
- Scope: deneme/task-011/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 011` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `011`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-011/README.md && test -f deneme/task-011/example.ts`
**Test:** `node --experimental-strip-types deneme/task-011/example.ts`

## Task 12: DENEME-012 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-012/README.md, deneme/task-012/example.ts
- Scope: deneme/task-012/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 012` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `012`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-012/README.md && test -f deneme/task-012/example.ts`
**Test:** `node --experimental-strip-types deneme/task-012/example.ts`

## Task 13: DENEME-013 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-013/README.md, deneme/task-013/example.ts
- Scope: deneme/task-013/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 013` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `013`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-013/README.md && test -f deneme/task-013/example.ts`
**Test:** `node --experimental-strip-types deneme/task-013/example.ts`

## Task 14: DENEME-014 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-014/README.md, deneme/task-014/example.ts
- Scope: deneme/task-014/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 014` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `014`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-014/README.md && test -f deneme/task-014/example.ts`
**Test:** `node --experimental-strip-types deneme/task-014/example.ts`

## Task 15: DENEME-015 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-015/README.md, deneme/task-015/example.ts
- Scope: deneme/task-015/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 015` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `015`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-015/README.md && test -f deneme/task-015/example.ts`
**Test:** `node --experimental-strip-types deneme/task-015/example.ts`

## Task 16: DENEME-016 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-016/README.md, deneme/task-016/example.ts
- Scope: deneme/task-016/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 016` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `016`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-016/README.md && test -f deneme/task-016/example.ts`
**Test:** `node --experimental-strip-types deneme/task-016/example.ts`

## Task 17: DENEME-017 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-017/README.md, deneme/task-017/example.ts
- Scope: deneme/task-017/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 017` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `017`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-017/README.md && test -f deneme/task-017/example.ts`
**Test:** `node --experimental-strip-types deneme/task-017/example.ts`

## Task 18: DENEME-018 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-018/README.md, deneme/task-018/example.ts
- Scope: deneme/task-018/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 018` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `018`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-018/README.md && test -f deneme/task-018/example.ts`
**Test:** `node --experimental-strip-types deneme/task-018/example.ts`

## Task 19: DENEME-019 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-019/README.md, deneme/task-019/example.ts
- Scope: deneme/task-019/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 019` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `019`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-019/README.md && test -f deneme/task-019/example.ts`
**Test:** `node --experimental-strip-types deneme/task-019/example.ts`

## Task 20: DENEME-020 — simple document and test
- Provider: codex
- Model: gpt-5.6-terra
- Auth: subscription
- Effort: low
- Files: deneme/task-020/README.md, deneme/task-020/example.ts
- Scope: deneme/task-020/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 020` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `020`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-020/README.md && test -f deneme/task-020/example.ts`
**Test:** `node --experimental-strip-types deneme/task-020/example.ts`

## Task 21: DENEME-021 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-021/README.md, deneme/task-021/example.ts
- Scope: deneme/task-021/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 021` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `021`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-021/README.md && test -f deneme/task-021/example.ts`
**Test:** `node --experimental-strip-types deneme/task-021/example.ts`

## Task 22: DENEME-022 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-022/README.md, deneme/task-022/example.ts
- Scope: deneme/task-022/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 022` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `022`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-022/README.md && test -f deneme/task-022/example.ts`
**Test:** `node --experimental-strip-types deneme/task-022/example.ts`

## Task 23: DENEME-023 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-023/README.md, deneme/task-023/example.ts
- Scope: deneme/task-023/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 023` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `023`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-023/README.md && test -f deneme/task-023/example.ts`
**Test:** `node --experimental-strip-types deneme/task-023/example.ts`

## Task 24: DENEME-024 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-024/README.md, deneme/task-024/example.ts
- Scope: deneme/task-024/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 024` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `024`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-024/README.md && test -f deneme/task-024/example.ts`
**Test:** `node --experimental-strip-types deneme/task-024/example.ts`

## Task 25: DENEME-025 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-025/README.md, deneme/task-025/example.ts
- Scope: deneme/task-025/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 025` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `025`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-025/README.md && test -f deneme/task-025/example.ts`
**Test:** `node --experimental-strip-types deneme/task-025/example.ts`

## Task 26: DENEME-026 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-026/README.md, deneme/task-026/example.ts
- Scope: deneme/task-026/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 026` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `026`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-026/README.md && test -f deneme/task-026/example.ts`
**Test:** `node --experimental-strip-types deneme/task-026/example.ts`

## Task 27: DENEME-027 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-027/README.md, deneme/task-027/example.ts
- Scope: deneme/task-027/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 027` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `027`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-027/README.md && test -f deneme/task-027/example.ts`
**Test:** `node --experimental-strip-types deneme/task-027/example.ts`

## Task 28: DENEME-028 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-028/README.md, deneme/task-028/example.ts
- Scope: deneme/task-028/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 028` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `028`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-028/README.md && test -f deneme/task-028/example.ts`
**Test:** `node --experimental-strip-types deneme/task-028/example.ts`

## Task 29: DENEME-029 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-029/README.md, deneme/task-029/example.ts
- Scope: deneme/task-029/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 029` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `029`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-029/README.md && test -f deneme/task-029/example.ts`
**Test:** `node --experimental-strip-types deneme/task-029/example.ts`

## Task 30: DENEME-030 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-030/README.md, deneme/task-030/example.ts
- Scope: deneme/task-030/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 030` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `030`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-030/README.md && test -f deneme/task-030/example.ts`
**Test:** `node --experimental-strip-types deneme/task-030/example.ts`

## Task 31: DENEME-031 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-031/README.md, deneme/task-031/example.ts
- Scope: deneme/task-031/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 031` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `031`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-031/README.md && test -f deneme/task-031/example.ts`
**Test:** `node --experimental-strip-types deneme/task-031/example.ts`

## Task 32: DENEME-032 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-032/README.md, deneme/task-032/example.ts
- Scope: deneme/task-032/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 032` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `032`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-032/README.md && test -f deneme/task-032/example.ts`
**Test:** `node --experimental-strip-types deneme/task-032/example.ts`

## Task 33: DENEME-033 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-033/README.md, deneme/task-033/example.ts
- Scope: deneme/task-033/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 033` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `033`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-033/README.md && test -f deneme/task-033/example.ts`
**Test:** `node --experimental-strip-types deneme/task-033/example.ts`

## Task 34: DENEME-034 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-034/README.md, deneme/task-034/example.ts
- Scope: deneme/task-034/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 034` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `034`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-034/README.md && test -f deneme/task-034/example.ts`
**Test:** `node --experimental-strip-types deneme/task-034/example.ts`

## Task 35: DENEME-035 — simple document and test
- Provider: codex
- Model: gpt-5.6-luna
- Auth: subscription
- Effort: low
- Files: deneme/task-035/README.md, deneme/task-035/example.ts
- Scope: deneme/task-035/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 035` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `035`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-035/README.md && test -f deneme/task-035/example.ts`
**Test:** `node --experimental-strip-types deneme/task-035/example.ts`

## Task 36: DENEME-036 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-036/README.md, deneme/task-036/example.ts
- Scope: deneme/task-036/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 036` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `036`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-036/README.md && test -f deneme/task-036/example.ts`
**Test:** `node --experimental-strip-types deneme/task-036/example.ts`

## Task 37: DENEME-037 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-037/README.md, deneme/task-037/example.ts
- Scope: deneme/task-037/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 037` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `037`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-037/README.md && test -f deneme/task-037/example.ts`
**Test:** `node --experimental-strip-types deneme/task-037/example.ts`

## Task 38: DENEME-038 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-038/README.md, deneme/task-038/example.ts
- Scope: deneme/task-038/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 038` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `038`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-038/README.md && test -f deneme/task-038/example.ts`
**Test:** `node --experimental-strip-types deneme/task-038/example.ts`

## Task 39: DENEME-039 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-039/README.md, deneme/task-039/example.ts
- Scope: deneme/task-039/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 039` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `039`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-039/README.md && test -f deneme/task-039/example.ts`
**Test:** `node --experimental-strip-types deneme/task-039/example.ts`

## Task 40: DENEME-040 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-040/README.md, deneme/task-040/example.ts
- Scope: deneme/task-040/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 040` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `040`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-040/README.md && test -f deneme/task-040/example.ts`
**Test:** `node --experimental-strip-types deneme/task-040/example.ts`

## Task 41: DENEME-041 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-041/README.md, deneme/task-041/example.ts
- Scope: deneme/task-041/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 041` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `041`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-041/README.md && test -f deneme/task-041/example.ts`
**Test:** `node --experimental-strip-types deneme/task-041/example.ts`

## Task 42: DENEME-042 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-042/README.md, deneme/task-042/example.ts
- Scope: deneme/task-042/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 042` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `042`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-042/README.md && test -f deneme/task-042/example.ts`
**Test:** `node --experimental-strip-types deneme/task-042/example.ts`

## Task 43: DENEME-043 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-043/README.md, deneme/task-043/example.ts
- Scope: deneme/task-043/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 043` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `043`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-043/README.md && test -f deneme/task-043/example.ts`
**Test:** `node --experimental-strip-types deneme/task-043/example.ts`

## Task 44: DENEME-044 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-044/README.md, deneme/task-044/example.ts
- Scope: deneme/task-044/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 044` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `044`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-044/README.md && test -f deneme/task-044/example.ts`
**Test:** `node --experimental-strip-types deneme/task-044/example.ts`

## Task 45: DENEME-045 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-045/README.md, deneme/task-045/example.ts
- Scope: deneme/task-045/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 045` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `045`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-045/README.md && test -f deneme/task-045/example.ts`
**Test:** `node --experimental-strip-types deneme/task-045/example.ts`

## Task 46: DENEME-046 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-046/README.md, deneme/task-046/example.ts
- Scope: deneme/task-046/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 046` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `046`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-046/README.md && test -f deneme/task-046/example.ts`
**Test:** `node --experimental-strip-types deneme/task-046/example.ts`

## Task 47: DENEME-047 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-047/README.md, deneme/task-047/example.ts
- Scope: deneme/task-047/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 047` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `047`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-047/README.md && test -f deneme/task-047/example.ts`
**Test:** `node --experimental-strip-types deneme/task-047/example.ts`

## Task 48: DENEME-048 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-048/README.md, deneme/task-048/example.ts
- Scope: deneme/task-048/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 048` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `048`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-048/README.md && test -f deneme/task-048/example.ts`
**Test:** `node --experimental-strip-types deneme/task-048/example.ts`

## Task 49: DENEME-049 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-049/README.md, deneme/task-049/example.ts
- Scope: deneme/task-049/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 049` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `049`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-049/README.md && test -f deneme/task-049/example.ts`
**Test:** `node --experimental-strip-types deneme/task-049/example.ts`

## Task 50: DENEME-050 — simple document and test
- Provider: claude
- Model: claude-sonnet-5
- Auth: subscription
- Effort: low
- Files: deneme/task-050/README.md, deneme/task-050/example.ts
- Scope: deneme/task-050/

### Description
Create only the assigned directory and files. Write a short Markdown document titled `# Deneme Task 050` and a directly runnable TypeScript example using `node:assert/strict` with one passing assertion whose identity is `050`. Do not modify files outside this task scope.

**Proof:** `test -f deneme/task-050/README.md && test -f deneme/task-050/example.ts`
**Test:** `node --experimental-strip-types deneme/task-050/example.ts`
