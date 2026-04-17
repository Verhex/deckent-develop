# Analysis: src/core/constants.ts
**Task ID:** 140-001 | **LoC:** 113

## 1. Amaci
Tüm proje genelinde kullanılan sabit değerleri (dosya yolları, bellek limitleri, zamanlama değerleri, tmux sabitleri) tek bir yerden sağlar. Memory V2 sabitleri (`MEMORY_DB_FILE`, `MEMORY_EXPORTS_DIR`) dahil edilmiş.

## 2. Public API (export listesi)
- Path constants: `DECKENT_DIR`, `PROJECT_CONFIG_PATH`, `GLOBAL_CONFIG_PATH`, `BRAIN_DIR`, `TASKS_DIR`, `LOCKS_DIR`, `MEMORY_DB_FILE`, `MEMORY_EXPORTS_DIR`
- Memory limits: `MEMORY_MAX_LINES=1500`, `PATTERNS_MAX_LINES=800`, `RETRO_MAX_LINES=400`, `SPRINT_LOG_MAX_LINES=500`, `ERRORS_MAX_LINES=600`
- Deprecated constants: `BRAIN_TOTAL_LINE_BUDGET=5000`, `MEMORY_DECAY_SPRINTS=20`, `AUDITOR_SCAN_INTERVAL_MS`, `HEARTBEAT_STALE_THRESHOLD_MS`, `LOCK_STALE_THRESHOLD_MS`
- Timing: `HEARTBEAT_WRITE_INTERVAL_MS=15000`, `LOCK_TIMEOUT_MS=30000`
- Defaults: `DEFAULT_LANGUAGE='en'`, `DEFAULT_MODE='performance'`, `DECKENT_VERSION`

## 3. İç + Dış Bağımlılıklar
- İç: `node:fs`, `node:path`, `node:url`, `node:os`
- Bu dosyayı import eden: hemen hemen tüm src/ modülleri

## 4. Complexity
- `DECKENT_VERSION` için 1 IIFE (readFileSync ile package.json okuma)
- Cyclomatic: ~3 (DECKENT_VERSION try/catch)

## 5. Type Safety
- `any` kullanımı: 0
- `@ts-ignore`: 0
- Non-null assertion: 0
- `as const` kullanımı düzgün

## 6. ADR Compliance
- **ADR-001** (ESM): UYUMLU — `import.meta.url` kullanımı doğru
- **ADR-008** (Brain Merkezi Import): UYUMLU — bu dosya sadece sabit sağlar, kimseyi import etmez
- **Memory V2**: `MEMORY_DB_FILE = 'memory.db'` ve `MEMORY_EXPORTS_DIR = 'exports'` sabitlerinin varlığı UYUMLU

## 7. Test Coverage
- `tests/core/constants.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Deprecated notlar açıkça belgelenmiş, iyi pratik

## 9. Dead Code Candidates
- `BRAIN_TOTAL_LINE_BUDGET`, `MEMORY_DECAY_SPRINTS` — `@deprecated` işaretli ama testlerde hala kullanılıyor olabilir. Kontrol gerektiriyor.
- `AUDITOR_SCAN_INTERVAL_MS`, `HEARTBEAT_STALE_THRESHOLD_MS`, `LOCK_STALE_THRESHOLD_MS` — `@deprecated` ama backward compat için tutulmuş

## 10. Security Findings
- `DECKENT_VERSION` için `readFileSync` kullanımı module-load zamanında — özel senaryo. Risk yok.

## 11. Memory V2 Uyumu
- `MEMORY_DB_FILE = 'memory.db'` ✅
- `MEMORY_EXPORTS_DIR = 'exports'` ✅
- Sprint 140 pre-flight memory budget değerleri commit edilmiş: `memory_budget: 5000`, `decay_after_sprints: 20`

## 12. Öneriler
- Sprint 142'de deprecated `BRAIN_TOTAL_LINE_BUDGET` vb. constants kaldırılabilir. Test suite'leri güncellenmeli.

## 13. Verdict: ANALYZED
