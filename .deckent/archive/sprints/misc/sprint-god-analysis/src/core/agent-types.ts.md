# Analysis: src/core/agent-types.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 97 | **Effort:** max

## 1. Amaci
Agent pool sistemi tip tanımları. `AgentDefinition` interface'i bir agent'ın tüm özelliklerini tanımlar — id, name, systemPrompt, expertise, trigger'lar, V2 activation kuralları, istatistikler. `AgentPool` tipi `Map<string, AgentDefinition>` olarak tanımlanır. agent-pool.ts, routing-engine.ts, task-router.ts tarafından kullanılır. Factory fonksiyonları (`createDefaultStats`, `createAgentDefinition`) test ve runtime'da kolaylık sağlar.

## 2. Public API
### Interfaces (4):
- `AgentStats` — totalUses, successRate, avgCoverage, lastUsedInSprint
- `AgentDefinition` — 18 field: id, name, description, systemPrompt, expertise[], allowedTools[], deniedTools[], preferredModel, effortMultiplier, triggerKeywords[], triggerScopes[], triggerFilePatterns[], persistent, enabled, source, stats, manifestVersion?, activation?
- `AgentSelectionResult` — agent | null, score, reason
- `MultiAgentPipelineStep` — agentId, phase

### Types (1):
- `AgentPool` — `Map<string, AgentDefinition>`

### Functions (2):
- `createDefaultStats()` → AgentStats — zeroed counters
- `createAgentDefinition(partial)` → AgentDefinition — sensible defaults

JSDoc: Fonksiyonlarda mevcut, interface field'larında kısmen mevcut (triggerKeywords açıklaması yok). YETERLI.

## 3. Ic Bagimliliklar
- `./types.js` → ModelType (type import — barrel üzerinden)
- `./routing-types.js` → ActivationConfig (type import)

Döngüsel bağımlılık riski: **YOK** — types.ts barrel → task-types.ts → model-registry.ts. agent-types.ts → types.ts barrel (tek yönlü). routing-types.ts bağımsız.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 2. Max cyclomatic: 1. Çok düşük.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0

Tamamen temiz.

**Gözlem:** `AgentDefinition.effortMultiplier: number` — range kısıtlaması (0.1-3.0) JSDoc'ta var ama compile-time'da enforce edilmiyor. Runtime validation agent-pool.ts'de olabilir.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A
- **ADR-008 (brain import):** N/A — type-only
- **ADR-010 (tek runtime dep):** Uyumlu
- **ADR-028 (V2 routing):** `manifestVersion?: 1 | 2` ve `activation?: ActivationConfig` ile V2 desteği eklendi. V1→V2 migration path korunmuş.
- **ADR-037 (RBAC):** AgentDefinition'da `allowedTools`, `deniedTools` — RBAC V1 kapsamında. ADR-037 authority matrix ile uyumlu.
- **Memory V2:** N/A — agent domain

## 8. Test Coverage
- `tests/core/agent-types.test.ts` — MEVCUT
- Beklenen coverage: `createDefaultStats()`, `createAgentDefinition()` factory'leri, partial override doğrulaması

YETERLI.

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- `MultiAgentPipelineStep` — multi-agent.ts modülünde kullanılıyor mu? Bu interface'in aktif kullanımı kontrol edilmeli. multi-agent.ts dosyası orchestra'da var — muhtemelen kullanılıyor. **P3 — potansiyel.**
- Geri kalan tüm export'lar aktif kullanımda.

## 11. Security
- `systemPrompt: string` — agent system prompt'u. Prompt injection riski var mı? Bu prompt, worker'a inject edilen sabit string — kullanıcı input'u DEĞİL. GÜVENLI.
- `allowedTools`/`deniedTools` — RBAC enforcement. ADR-037 kapsamında.

## 12. Memory V2 Uyumu
N/A — agent domain, memory ile doğrudan ilişki yok. Agent stats DB'de değil, dosya tabanlı (`agent.json`). Bu, Memory V2 DB-first prensibine aykırı gibi görünse de agent metadata farklı bir domain — V2 sadece brain knowledge (ADR, sprint, debt, vb.) kapsar.

## 13. i18n
- Tüm string'ler İngilizce — doğru, agent system prompt'ları locale-agnostic
- Agent name/description CLI/dashboard'da gösterilebilir — i18n gap? Dashboard i18n tablosunda agent isimleri çevrilmiyor (İngilizce kalıyor).

## 14. Dokumantasyon Tutarliligi
- `AgentDefinition` 18 field — DECKENT.md'de "16 built-in agents" yazılı, her agent bu interface'in instance'ı. Uyumlu.
- `effortMultiplier: number` yorumunda "0.1-3.0" yazılı — validation nerede? Dokümante edilmemiş.
- `source: 'builtin' | 'user' | 'learned'` — 3 kaynak tipi. DECKENT.md'de sadece "built-in" ve "custom" belirtilmiş. 'learned' kaynak tipi dokümante edilmemiş. **P3.**

## 15. Performance
Sıfır runtime maliyeti — tamamen tip + factory fonksiyonları.

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P3 | `MultiAgentPipelineStep` aktif kullanımını doğrula — dead code ise kaldır |
| 2 | P3 | `effortMultiplier` range validation'ı nerede yapılıyor dokümante et |
| 3 | P3 | `source: 'learned'` değerini DECKENT.md'de dokümante et |

## Verdict: ANALYZED
