# Analysis: src/orchestra/task-builder.ts
**Task ID:** 141-002 | **LoC:** 890

## 1. Amaci
Task oluşturma, direktif parse etme, worker prompt oluşturma ve ADR bağlam enjeksiyonunu yönetir. Memory V2 DB'den ADR sorgusu yaparak (`queryRelevantADRs`) worker prompt'larına zorunlu mimari kural blokları ekler.

## 2. Public API (export listesi)
- Zod schemas: `DirectiveTaskSchema`, `DirectiveSchema`, `DirectiveTask`, `Directive`
- `validateDirective(input)` — direktif doğrulaması
- `CreateTaskParams`, `ParsedDirectiveTask` interfaces
- `parseSkillsDirective(line)` — Skills: direktif satırı parse
- `parseDependenciesDirective(line)` — Dependencies: direktif parse
- `parsePriorityDirective(line)` — Priority: direktif parse
- `createTask(params, sequence)` → `Task`
- `extractScopeFromDirective(line)` → `TaskScope`
- `enrichScopeWithTestFiles(scope, filesWriteSource)` → `TaskScope`
- `parseStructuredDirectives(content)` → `ParsedDirectiveTask[]`
- `parseBulletOrNumberedTasks(content)` → `ParsedDirectiveTask[]`
- `plannerTaskToParams(pt, sprintId, modelOverride, initialStatus)` → `CreateTaskParams`
- `resolveWorkerEffort(task)` — effort string döner
- `truncateAtParagraph(content, maxLen)` — paragraf sınırında kırpma
- `queryRelevantADRs(taskDescription, taskScope, projectRoot)` — Memory V2 ADR sorgusu
- `buildWorkerPrompt(task, agentPrompt, skillPrompts)` — tam worker prompt

## 3. Ic + Dis Bagimliliklar
- **İç:** ./model-selector.js, ./prompt-token-optimizer.js
- **Dış:** ../core/types.js, ../core/task-types.js, ../core/routing-types.js, ../core/utils.js, ../core/token-counter.js, **../core/memory-store.js**, **../core/memory-query.js**, ../core/constants.js
- **Harici:** zod, node:fs, node:path

## 4. Complexity
`buildWorkerPrompt`: ~140 LoC, cyclomatic ~8. `parseStructuredDirectives`: ~90 LoC, cyclomatic ~15. `extractScopeFromDirective`: ~95 LoC, cyclomatic ~20. Genel: ~45 cyclomatic.

## 5. Type Safety
- `ALL_MODELS as unknown as [string, ...string[]]` — Zod enum için zorunlu cast, mantıklı
- `forceModel as ModelType | undefined` — `ALL_MODELS.includes()` guard'lı, SAFE
- `forceEffort as TaskEffort | undefined` — includes() guard'lı, SAFE
- `task.forceEffort as 'max' | 'high' | 'medium' | 'low'` — resolveWorkerEffort'ta cast

## 6. ADR Compliance
- **ADR-040 (Memory V2):** COMPLIANT — `queryRelevantADRs` Memory V2 MemoryStore + searchMemory kullanıyor. V1 DECISIONS.md parse YOK.
- **ADR-006 (spawnSync):** Yok — bu modülde spawnSync kullanılmıyor.
- **ADR-008:** COMPLIANT — planner.ts / sprint-planner.ts bu modülü import ediyor.
- **Worker Prompt Injection:** `queryRelevantADRs` ADR içeriğini `=== Mandatory Architecture Rules (ADR) ===` bloğu olarak enjekte ediyor — ADR-036 compliance.

## 7. Test Coverage
- `tests/orchestra/task-builder.test.ts` mevcut beklenir.
- `queryRelevantADRs` DB mevcut/yok dalları.
- `parseStructuredDirectives` çok sayıda vaka — kalın test edilmeli.

## 8. TODO/FIXME/HACK inventory
- `// BUG-25: Explicit Files:/Dosya: and Scope:/Kapsam: label parsing` — eski bug referansı, çözülmüş.

## 9. Dead Code Candidates
`loadADRContent` fonksiyonu — `queryRelevantADRs` ile replace edilmiş ve ARTIK MEVCUT DEĞİL. Spesifikasyon "queryRelevantADRs, loadADRContent silindi mi?" soruyor — cevap: `queryRelevantADRs` MEVCUT, `loadADRContent` MEVCUT DEĞİL. Temiz.

## 10. Security Findings
- `searchMemory` FTS5 kullanıyor — SQL injection riski parametre binding ile minimize edilmiş (MemoryStore içinde).
- Worker prompt'a ADR içeriği enjekte ediliyor — XSS riski yok (LLM prompt bağlamı).

## 11. Memory V2 Uyumu
EXCELLENT: `queryRelevantADRs` DB-first. `MemoryStore` açılıp kapatılıyor (try/finally), `searchMemory()` fonksiyonu FTS5 dual-layer search kullanıyor. V1 ADR file parse tamamen kaldırılmış. Eski `loadADRContent` fonksiyonu yok.

## 12. Oneriler
- `extractScopeFromDirective` regex chain biraz kırılgan; entegrasyon test kapsamı genişletilebilir.
- `buildWorkerPrompt` içindeki prompt string template güncel DIRECTIVES.md format değişikliklerine karşı kırılgan.

## 13. Verdict: ANALYZED
