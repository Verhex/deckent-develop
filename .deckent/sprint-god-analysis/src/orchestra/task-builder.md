# Analysis: src/orchestra/task-builder.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 891 | **Effort:** max

## 1. Amaci (detayli)
Task creation, DIRECTIVES.md parsing, worker prompt building modülü. Brain'in PLAN fazında DIRECTIVES.md'yi parse edip yapılandırılmış task nesnelerine dönüştürür. Worker spawn edilmeden hemen önce buildWorkerPrompt() ile tam prompt string oluşturur. Zod schema validasyonu, scope extraction, ADR injection, skill/agent prompt embedding — tümü bu dosyada.

## 2. Public API
- `DirectiveTaskSchema` (z.object) — Zod schema, JSDoc ✓
- `DirectiveSchema` (z.object) — Zod schema, JSDoc ✓
- `DirectiveTask` (type) — inferred, JSDoc yok (auto-infer kabul edilebilir)
- `Directive` (type) — inferred, JSDoc yok
- `validateDirective(input)` → Result type, JSDoc ✓
- `CreateTaskParams` (interface) — JSDoc yok, EKSIK
- `ParsedDirectiveTask` (interface) — JSDoc yok, EKSIK
- `parseSkillsDirective(line)` → {forceSkills, excludeSkills}, JSDoc ✓
- `parseDependenciesDirective(line)` → string[] | undefined, JSDoc ✓
- `parsePriorityDirective(line)` → TaskPriority | undefined, JSDoc ✓
- `createTask(params, sequence)` → Task, JSDoc ✓
- `extractScopeFromDirective(line)` → TaskScope, JSDoc ✓
- `enrichScopeWithTestFiles(scope, files)` → TaskScope, JSDoc ✓
- `parseStructuredDirectives(content)` → ParsedDirectiveTask[], JSDoc ✓
- `parseBulletOrNumberedTasks(content)` → ParsedDirectiveTask[], JSDoc ✓
- `plannerTaskToParams(pt, sprintId, model, status?)` → CreateTaskParams, JSDoc ✓
- `resolveWorkerEffort(task)` → effort string, JSDoc ✓
- `truncateAtParagraph(content, maxLen)` → string, JSDoc ✓
- `queryRelevantADRs(desc, scope, root?)` → string, JSDoc ✓
- `buildWorkerPrompt(task, agentPrompt?, skillPrompts?)` → string, JSDoc ✓

## 3. Ic Bagimliliklar
- `../core/types.js` (Task, TaskScope, ModelType, TaskStatus, ALL_MODELS, PROVIDER_MODEL_MAP)
- `../core/routing-types.js` (TaskDNA)
- `./model-selector.js` (calculateModelScore)
- `../core/utils.js` (debugLog)
- `./prompt-token-optimizer.js` (filterSkillPromptsByDNA)
- `../core/token-counter.js` (TokenCounter)
- `../core/memory-store.js` (MemoryStore)
- `../core/memory-query.js` (searchMemory)
- `../core/constants.js` (BRAIN_DIR, MEMORY_DB_FILE)
- Döngüsel bağımlılık riski: YOK — yalnızca core/ ve orchestra/ içinden tek yönlü

## 4. Dis Bagimliliklar
- `zod` — schema validation (ADR-010: zod allowlisted dependency)
- `node:fs` (existsSync) — file existence check
- `node:path` (join)
- ADR-010 uyumu: ✓ (zod izinli, geri kalanı Node.js built-in)

## 5. Complexity
- Fonksiyon sayısı: 15 exported + 1 private (now())
- Max cyclomatic complexity: `parseStructuredDirectives()` (satır 398-494) — nested loop + regex + multi-field extraction ≈ CC 12
- En karmaşık: `buildWorkerPrompt()` (satır 752-890) — multi-section string interpolation, 139 satır
- `extractScopeFromDirective()` (satır 269-363) — 7 regex match pass, CC ≈ 10

## 6. Type Safety
- `as unknown as [string, ...string[]]` — satır 22, MODEL_ENUM_VALUES (Zod z.enum tuple requirement)
- `as unknown as [string, ...string[]]` — satır 25, PROVIDER_NAMES (same pattern)
- `as ModelType | undefined` — satır 450 (guarded by ALL_MODELS.includes)
- `as TaskEffort | undefined` — satır 459 (guarded by validEfforts.includes)
- `as ProviderName | undefined` — satır 468 (guarded by validProviders.includes)
- `as 'max' | 'high' | 'medium' | 'low'` — satır 663 (forceEffort, subset assumption — could fail silently for 'normal')
- `as TaskDNA` — satır 775 (rawDNA from routingMeta, unvalidated)
- Non-null `!`: satır 517 (`lines[i]!`), 519 (`match[1]!`) — within bounds check
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A (no spawnSync in this file) ✓
- **ADR-008 brain import**: Imports from core/ and orchestra/ only — ✓ (task-builder is part of orchestra, allowed)
- **ADR-010 deps**: zod (allowed), Node.js built-ins — ✓
- **ADR-022 CLI/MCP parity**: N/A (not a command/tool)
- **ADR-033 product vision**: Builds worker prompts — consistent with product model ✓
- **ADR-037 RBAC**: Worker prompt includes scope rules and heartbeat instructions — ✓
- **ADR-039 self-modifying**: N/A
- **Memory V2 DB-first**: queryRelevantADRs uses MemoryStore + searchMemory (DB-first) ✓
  - Comment on line 803 says "falls back to V1" but NO V1 fallback exists in code — comment is STALE

## 8. Test Coverage
- `tests/orchestra/task-builder.test.ts` — EXISTS ✓
- `tests/orchestra/task-builder-skill.test.ts` — skill prompt tests ✓
- `tests/orchestra/task-builder-routing.test.ts` — routing-related builder tests ✓
- 3 test files for 891 LoC → good coverage ratio
- queryRelevantADRs Memory V2 mock: needs verification (likely mocks MemoryStore)
- Edge cases: truncateAtParagraph tested? parseBulletOrNumberedTasks edge cases?

## 9. TODO/FIXME/HACK inventory
- NONE found ✓

## 10. Dead Code
- `now()` (satır 204-206) — private, used only in createTask. Minimal utility but not dead.
- No `@deprecated` tags
- No unreachable branches detected
- `buildClaudeCommand` alias is in tmux.ts, not here

## 11. Security
- Prompt injection risk: buildWorkerPrompt embeds task.description directly into prompt string (satır 815). If DIRECTIVES.md contains malicious content, it flows into worker prompts. HOWEVER: DIRECTIVES.md is authored by the project owner (trusted input).
- queryRelevantADRs: searchMemory uses parameterized FTS5 queries via MemoryStore — no SQL injection ✓
- No secret exposure ✓
- No external HTTP calls ✓

## 12. Memory V2 Uyumu
- queryRelevantADRs: DB-first ✓ (MemoryStore constructor, searchMemory FTS5)
- No readFileSync + DECISIONS.md parse ✓ (loadADRContent removed)
- No legacy V1 fallback code ✓
- STALE COMMENT satır 803: "falls back to V1" — this is inaccurate, no V1 fallback exists. **P2 fix needed**.

## 13. i18n
- No hardcoded TR/EN strings (worker prompt is English-only, appropriate for LLM consumption)
- turkishNormalize: not used here (correct — ADR search uses memory-query.ts which handles normalization)
- Prompt language: fixed English — acceptable for worker prompt context

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: 14/16 exported items have JSDoc — **good**
- CreateTaskParams, ParsedDirectiveTask missing JSDoc — minor gap
- Line 803 comment "falls back to V1" is STALE — no V1 code path exists

## 15. Performance
- Sync I/O: `existsSync` (satır 712, queryRelevantADRs) — cold path, DB open guard, acceptable
- MemoryStore open/close per queryRelevantADRs call — could be cached, but called once per task, acceptable
- `TokenCounter.estimatePromptSize` called synchronously (satır 877) — CPU-bound, fast
- No hot path concerns — called once per worker spawn

## 16. Oneriler
- **P2**: Remove stale comment "falls back to V1" on satır 803
- **P3**: Add JSDoc to CreateTaskParams and ParsedDirectiveTask interfaces
- **P3**: Line 663 `as 'max' | 'high' | 'medium' | 'low'` — TaskEffort includes 'normal' which maps to nothing; `resolveWorkerEffort` with forceEffort='normal' returns 'normal' which is NOT in the declared return type union. Type-level inconsistency — works at runtime but misleading type signature.
- **P3**: Consider caching MemoryStore instance across multiple queryRelevantADRs calls within same sprint

## Verdict: ANALYZED
