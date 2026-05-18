# Analysis: src/orchestra/dependency-scheduler.ts
**Task ID:** 142-011 | **Model:** opus | **LoC:** 687 | **Effort:** max

## 1. Amacı
Sprint task'larının bağımlılık graf'ını oluşturup topolojik sıralama ile wave bazlı execution planı çıkaran scheduler. Kahn's algorithm ile topological sort, scope collision detection entegrasyonu, cascade blocking (NO_GO → transitive dependents PAUSED), unblocking (fix → dependents re-enabled), ve graph persistence (JSON + Mermaid .mmd). Sprint 139 Task 028-030'un konsolide implementasyonu. 5. canlı dogfood (Sprint 135 T-005).

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `DependencyGraph` | interface | ✅ Her field açıklamalı |
| `DependencyWave` | interface | Yok — basit type |
| `EnforcementResult` | interface | ✅ Var |
| `CascadeResult` | interface | Yok — basit type |
| `UnblockResult` | interface | Yok — basit type |
| `CascadeEventCallback` | type | ✅ Var — detaylı |
| `CascadeTransitionEvent` | interface | ✅ Her field açıklamalı |
| `CascadeBlockOptions` | interface | ✅ Var |
| `ApplyFailureCascadeResult` | interface | Yok — extends CascadeResult |
| `SerializedDependencyGraph` | interface | ✅ Her field açıklamalı |
| `buildDependencyGraph()` | `(tasks, includeCollisions?) => DependencyGraph` | ✅ Detaylı |
| `enforceWaveDependency()` | `(graph, candidateTaskIds, doneTasks) => EnforcementResult` | ✅ Detaylı |
| `cascadeBlockDependents()` | `(graph, failedTaskId, tasks, onTransition?) => CascadeResult` | ✅ Detaylı |
| `applyFailureCascade()` | `(graph, failedTaskId, tasks, options) => ApplyFailureCascadeResult` | ✅ Detaylı |
| `unblockDependents()` | `(graph, resolvedTaskId, tasks, doneTasks, onTransition?) => UnblockResult` | ✅ Detaylı |
| `serializeDependencyGraph()` | `(graph, sprintId) => SerializedDependencyGraph` | ✅ Var |
| `deserializeDependencyGraph()` | `(serialized) => DependencyGraph` | ✅ Var |
| `generateMermaidDiagram()` | `(graph, taskStatusMap?) => string` | ✅ Var |
| `persistDependencyGraph()` | `(projectRoot, sprintId, graph, taskStatusMap?) => boolean` | ✅ Var |
| `loadDependencyGraph()` | `(projectRoot, sprintId) => DependencyGraph \| null` | ✅ Var |

JSDoc coverage: **~85%** — basit interface'lerde eksik ama fonksiyonlar %100.

## 3. İç Bağımlılıklar
- `../core/types.js` → `Task`, `TaskStatus` (value import — çünkü enum)
- `../core/constants.js` → `DECKENT_DIR`
- `../core/utils.js` → `debugLog`
- `./conflict-resolver.js` → `detectScopeCollisions`
- **Döngüsel bağımlılık riski:** conflict-resolver.js → parallel-pipeline.js'i import ediyor ve dependency-scheduler.ts → conflict-resolver.js. Cycle yok çünkü akış tek yönlü: dependency-scheduler → conflict-resolver → parallel-pipeline.

## 4. Dış Bağımlılıklar
- `node:fs` → writeFileSync, readFileSync, mkdirSync, existsSync
- `node:path` → join
- **ADR-010 uyumu:** ✅

## 5. Complexity
- **Fonksiyon sayısı:** 12 (10 export, 2 private: depGraphJsonPath, depGraphMmdPath)
- **En karmaşık fonksiyon:** `buildDependencyGraph()` (satır 123-228) — 105 satır, Kahn's algorithm + collision edge injection
- **Max cyclomatic complexity:** ~10 (buildDependencyGraph: while loop + cycle detection + collision edge)
- **İkinci en karmaşık:** `generateMermaidDiagram()` (satır 547-607) — 60 satır, 4 status category

## 6. Type Safety
- **any sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **as unknown:** 0
- **Non-null `!`:** 8 yerde — satır 153(×2), 155, 156, 159, 294, çoğu Map.get() sonrası. Güvenli çünkü üstte taskIds.has() veya has() kontrolü var.
- **Unsafe cast:** 1 — satır 677: `JSON.parse(raw) as SerializedDependencyGraph` — validation sonrasında field check var (satır 678)

**Değerlendirme:** İyi. Non-null assertions güvenli kontekstlerde.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 (spawnSync) | N/A | spawnSync yok |
| ADR-008 (brain import) | ✅ | core/ + orchestra/ internal import |
| ADR-010 (tek dep) | ✅ | Built-in only |
| ADR-035 (event stream) | ✅ | CascadeEventCallback ile event stream entegrasyonu |
| ADR-037 (RBAC) | N/A | RBAC ile doğrudan ilişkisi yok |

## 8. Test Coverage
- **Test dosyası:** `tests/orchestra/dependency-scheduler.test.ts` (1036 satır!)
- **Eşleşme:** ✅ Kapsamlı — en büyük test dosyası bu batch'te
- **Test konuları:** buildDependencyGraph, enforceWaveDependency, cascadeBlockDependents, applyFailureCascade, unblockDependents, serialize/deserialize, persistence, Mermaid diagram
- **Mock kalitesi:** Gerçekçi Task nesneleri ile test ediliyor
- **Edge case coverage:** Cycle detection, boş task listesi, collision edge'ler, serialization roundtrip

## 9. TODO/FIXME/HACK Inventory
**Yok.** 0 adet.

## 10. Dead Code
- **Unused exports:** `generateMermaidDiagram` sadece `persistDependencyGraph` içinden çağrılıyor — ama export ediliyor. Test'lerde de kullanılıyor → değil dead code.
- **Unreachable branch:** Yok
- **@deprecated:** Yok

## 11. Security
- **JSON.parse:** loadDependencyGraph'da — dosya sistemi kaynağı, güvenli
- **Injection riski:** Mermaid diagram'da task ID'leri `-` → `_` replace ediliyor — XSS riski yok (dosya output)
- **Disk yazma:** persistDependencyGraph mkdirSync + writeFileSync — güvenli

## 12. Memory V2 Uyumu
- N/A — bağımlılık scheduler'ı Memory V2 ile doğrudan ilişkili değil
- Eski .md parse yok

## 13. i18n
- debugLog mesajları İngilizce — internal, i18n gereksiz
- Mermaid diagram İngilizce etiketler — teknik output
- **Değerlendirme:** Temiz

## 14. Dokümantasyon Tutarlılığı
- Dosya başındaki sprint referansları (Task 028/029/030) doğru
- JSDoc ↔ davranış: Tutarlı
- `CascadeBlockOptions.shouldCascade` açıklaması "false for RUNTIME/AMBIGUOUS" — Alperen'in Q1 risk-taking policy'si ile uyumlu

## 15. Performance
- **Sync I/O:** writeFileSync(×2) + readFileSync(×1) + mkdirSync(×1) + existsSync(×1) — sadece persist/load işlemlerinde
- **Kahn's algorithm:** O(V + E) — optimal
- **detectScopeCollisions çağrısı:** buildDependencyGraph içinde — O(T × F) where T=tasks, F=filesWrite
- **Memory:** Map/Set tabanlı — large sprint'lerde (100+ task) bile sorunsuz
- **Değerlendirme:** Performans iyi

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | `cascadeBlockDependents` sadece PENDING → PAUSED yapıyor. EXECUTING durumundaki task'lar için de cascade düşünülmeli |
| P3 | `loadDependencyGraph` Zod validation ile güçlendirilebilir |
| P3 | generateMermaidDiagram'da DONE/NO_GO dışında (DOCUMENTING, TESTING) status'lar için style ekle |

## Verdict: ANALYZED
