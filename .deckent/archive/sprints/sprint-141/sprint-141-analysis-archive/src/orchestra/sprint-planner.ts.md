# Analysis: src/orchestra/sprint-planner.ts
**Task ID:** 141-002 | **LoC:** 672

## 1. Amaci
Sprint planlama fonksiyonlarını içerir: `readContext()` (brain context okuma), `planSprint()` (AI veya structured mod ile task oluşturma), `confirmDraftTasks()`, `cleanupDraftTasks()`. Sprint 136'da sprint-controller.ts'den ayrıştırılmıştır.

## 2. Public API (export listesi)
- `readContext(projectRoot)` → `BrainContext`
- `planSprint(projectRoot, config, context, recommendation, options)` → `Sprint`
- `confirmDraftTasks(projectRoot, sprint)` → `void`
- `cleanupDraftTasks(projectRoot)` → `void`

## 3. Ic + Dis Bagimliliklar
- **İç:** ./sprint-utils.js, ./planner.js, ./model-selector.js, ./task-builder.js, ./sprint-lifecycle.js, ./outcome-tracker.js, ./temp-skill-generator.js, ./rule-evolver.js, ./decision-logger.js
- **Dış:** ../core/types.js, ../core/constants.js, ../core/utils.js, ../core/provider.js, ../core/stack-detector.js, ../core/skill-pool.js, ../core/skill-selector.js, ../core/agent-pool.js, ../core/agent-selector.js, ../core/routing-engine.js, ../core/routing-types.js, ../monitor/auditor.js
- **Memory V2:** ../core/memory-store.js (doğrudan import)
- **Node:** fs, path, child_process

## 4. Complexity
`planSprint`: ~445 LoC, cyclomatic complexity ~30+. V2/V1 routing dalları, AI planner, structured fallback, evoved rules injection, task file yazma. `readContext`: ~85 LoC, DB-first ile multiple type query. Toplam cyclomatic tahmini: ~45.

## 5. Type Safety
- `tasks[0]!` non-null assertion (line ~379) — `tasks.length > 0` guard var, SAFE
- `evolvedRules.filter(r => r.status === 'auto-applied')` — tip cast mevcut
- `(allLearnings.evolvedRules ?? []) as import('./rule-evolver.js').EvolvedRule[]` — inline import type cast
- `currentStatus as Sprint['status']` benzeri kullanımlar yok ama değişken `planMode` string union

## 6. ADR Compliance
- **ADR-040 (Memory V2 DB-first):** FULLY COMPLIANT — `readContext` DB-first. `existsSync(dbPath)` kontrolü sonrası MemoryStore açılıyor; hata durumunda boş string/array fallback (V1 parse yok).
- **ADR-008:** COMPLIANT — planner sadece core/ ve orchestra/ içinden import ediyor.
- **ADR-006 (spawnSync):** `spawnSync('git', ...)` kullanımı var (line ~156, ~160) — ADR-006 kapsamında; `cwd` parametre ile güvenli.
- **ADR-028 (V2 Routing):** V1/V2 dal ayrımı `config.routing_engine` ile kontrol ediliyor.

## 7. Test Coverage
- `tests/orchestra/sprint-planner.test.ts` mevcut beklenir.
- `readContext` DB mevcut / DB yok iki dalı için test edilmeli.
- V2 routing ile evolved rules injection dalı test edilmeli.

## 8. TODO/FIXME/HACK inventory
- `const directiveSources: Array<{ ... }>` tip annotation oldukça uzun — ayrı interface olabilir.

## 9. Dead Code Candidates
- V1 routing bloğu (else branch, line ~535) — routing_engine=v2 standart hale gelirse V1 dal kaldırılabilir.

## 10. Security Findings
- `spawnSync('git', ['status', '--porcelain'], { cwd: projectRoot })` — cwd ile güvenli.
- `spawnSync('git', ['ls-files'], ...)` — güvenli.
- `JSON.parse(raw)` (cleanupDraftTasks, line ~664) try/catch içinde — SAFE.

## 11. Memory V2 Uyumu
EXCELLENT: `readContext` memory, retro, patterns, decisions, identity, debt tümünü DB'den çekiyor. V1 fallback yok. DB mevcut değilse boş değerler dönüyor. `store.close()` finally bloğunda çağrılıyor — bağlantı sızıntısı yok.

## 12. Oneriler
- `planSprint` fonksiyonu daha küçük helper'lara bölünebilir (özellikle V2 routing bloku).
- `Array<{ title: string; description: string; ... }>` satır içi tip yerine named interface kullanılmalı.
- Sprint 142'de V1 routing dalı kaldırılabilir (routing_engine=v2 default yapılırsa).

## 13. Verdict: ANALYZED
