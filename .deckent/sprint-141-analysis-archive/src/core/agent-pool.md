# Analysis: src/core/agent-pool.ts
**Task ID:** 140-001 | **LoC:** 474

## 1. Amaci
Agent havuzu yönetimi. `AgentPoolManager` ile `.deckent/agents/` ve `.tasks/agents/` dizinlerinden agent yükleme, LRU eviction (max 50 temp agent), kaydetme, istatistik güncelleme ve temizlik işlemleri.

## 2. Public API (export listesi)
- `DEFAULT_MAX_TEMP_AGENTS=50`, `DEFAULT_MAX_AGENT_AGE=5`
- `isTempAgentStale()` (helper)
- `AgentPoolManager` class: loadAgents, saveAgent, removeAgent, getAgent, listAgents, listEnabled, saveTempAgentToPool, cleanupPersistentTempAgents, createTempAgent, cleanupTempAgents, cleanup, updateAgentStats
- `AgentPoolManager.validateAgentDefinition()` (static)

## 3. İç + Dış Bağımlılıklar
- **Dış**: `node:fs`, `node:path`
- **İç**: `agent-types.ts`, `utils.ts` (readJsonSafe), `types.ts` (ALL_MODELS)

## 4. Complexity
- `loadAgents()`: orta — 2 dir, LRU eviction
- `cleanup()`: orta — stale detection
- `validateAgentDefinition()`: yüksek — 10+ alan doğrulama

## 5. Type Safety
- `any` kullanımı: 0
- `as unknown as AgentDefinition` — parse sonrası tip güveni, orta risk

## 6. ADR Compliance
- **ADR-001** (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/agent-pool.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `cleanupPersistentTempAgents()` — sprint cleanup akışında kullanılıyor ✅

## 10. Security Findings
- `fs.rmSync(..., { recursive: true, force: true })` — path validation yok ama `AGENTS_DIR` sabiti kontrollü

## 11. Memory V2 Uyumu
- N/A — agent pool, memory ile doğrudan ilişkili değil

## 12. Öneriler
- `validateAgentDefinition()` `preferredModel` doğrulaması `VALID_MODELS` ile yapılıyor — model-registry.ts singleton'ı kullanılabilir

## 13. Verdict: ANALYZED
