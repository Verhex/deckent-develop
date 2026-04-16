# Analysis: src/orchestra/ipc-registry.ts
**Task ID:** 142-011 | **Model:** opus | **LoC:** 270 | **Effort:** max

## 1. Amacı
Merkezi IPC (Inter-Process Communication) modülü. İki sorumluluk:

1. **WorkerChannel Registry** (satır 18-59): Subprocess worker'lar için kanal kayıt defteri. `ChannelRegistry` sınıfını lazy-initialize eder. Sprint-controller ve result-collector tarafından kullanılır.

2. **File-based Question/Answer IPC** (satır 61-270): tmux/docker backend'lerde process.send() olmadığı için dosya tabanlı Q&A mekanizması. Worker `.question` dosyası yazar, Brain `.answer` dosyası ile cevaplar. `askBrain()` fonksiyonu her iki IPC kanalını (process + file) destekler.

Sprint 135 T-004'te worker-ipc.ts ve result-collector.ts'den taşınmış.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `getChannelRegistry()` | `() => ChannelRegistry` | ✅ `@internal` tagged |
| `registerWorkerChannel()` | `(taskId, channel) => void` | ✅ `@internal` tagged |
| `unregisterWorkerChannel()` | `(taskId) => void` | ✅ `@internal` tagged |
| `getQuestionPath()` | `(projectRoot, taskId) => string` | ✅ Var |
| `getAnswerPath()` | `(projectRoot, taskId) => string` | ✅ Var |
| `writeQuestionFile()` | `(projectRoot, question) => void` | ✅ Var |
| `readQuestionFile()` | `(projectRoot, taskId) => WorkerQuestion \| undefined` | ✅ Var |
| `writeAnswerFile()` | `(projectRoot, answer) => void` | ✅ Var |
| `readAnswerFile()` | `(projectRoot, taskId) => BrainAnswer \| undefined` | ✅ Var |
| `cleanupQuestionFiles()` | `(projectRoot, taskId) => void` | ✅ Var |
| `askBrain()` | `async (projectRoot, taskId, workerId, question, options?) => Promise<BrainAnswer>` | ✅ Detaylı — 5 adım açıklanmış |
| `handleWorkerQuestion()` | `(projectRoot, taskId) => BrainAnswer \| undefined` | ✅ Var |
| `checkWorkerQuestions()` | `(projectRoot, taskIds, collectedIds) => string[]` | ✅ Var |

JSDoc coverage: **%100** — `@internal` annotation'lar da mevcut.

## 3. İç Bağımlılıklar
- `../agents/worker-ipc.js` → `ChannelRegistry`, `WorkerChannel`, `WorkerSideChannel`
- `../core/constants.js` → `TASKS_DIR`
- `../core/task-types.js` → `WorkerQuestion`, `BrainAnswer`, `QuestionAction`
- `../core/utils.js` → `debugLog`

### Potansiyel Döngüsel Bağımlılık:
- `ipc-registry.ts` → `agents/worker-ipc.js` (import)
- `agents/worker-ipc.ts` (satır 369) → `orchestra/ipc-registry.js` (re-export)

Bu bir **bilateral import** — ama TypeScript bunu handle edebiliyor çünkü:
1. ipc-registry sadece class/type import yapıyor (ChannelRegistry)
2. worker-ipc sadece re-export yapıyor
Fiili runtime cycle yok ama mimari olarak karışık. Dosya başındaki yorum bunu kabul ediyor: "Lazy-initialized to avoid circular dependency issues"

## 4. Dış Bağımlılıklar
- `node:fs` → readFileSync, writeFileSync, unlinkSync, existsSync
- `node:path` → join
- **ADR-010 uyumu:** ✅

## 5. Complexity
- **Fonksiyon sayısı:** 13 (13 export)
- **En karmaşık:** `askBrain()` (satır 134-215) — 81 satır, dual-path (IPC vs file-based), Promise + polling + timeout
- **Max cyclomatic complexity:** ~8 (askBrain: IPC path + file path + timeout)
- **Genel karmaşıklık:** ORTA

## 6. Type Safety
- **any sayısı:** 0
- **@ts-ignore / @ts-expect-error:** 0
- **as unknown:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** 2 — satır 86: `JSON.parse(raw) as WorkerQuestion`, satır 103: `JSON.parse(raw) as BrainAnswer` — file I/O, runtime validation yok ama dosya format'ı kontrollü (biz yazıyoruz)

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-008 (brain import) | ⚠️ | agents/worker-ipc'den import — ama ipc-registry orchestra/ modülü, agents/ import etmek questionable |
| ADR-010 (tek dep) | ✅ | Built-in only |
| ADR-035 (event stream) | ✅ | Q&A event stream ile paralel çalışıyor |

**ADR-008 notu:** Teknik olarak ADR-008 "Brain is the ONLY module that imports from tmux, auditor, worker" diyor — ipc-registry → worker-ipc tam olarak bu. Ama ipc-registry kendisi de "worker infra" — gri alan.

## 8. Test Coverage
- **Test dosyası:** `tests/orchestra/ipc-registry.test.ts` (330 satır)
- **Eşleşme:** ✅ Var
- **Test konuları:** Channel registry (register, unregister, get), file-based Q&A (write/read question/answer, cleanup), askBrain (IPC + file-based + timeout), handleWorkerQuestion, checkWorkerQuestions
- **Mock kalitesi:** vi.mock fs, WorkerSideChannel mock — iyi
- **Edge case coverage:** Timeout, IPC closed, malformed JSON

## 9. TODO/FIXME/HACK Inventory
**Yok.** 0 adet.

## 10. Dead Code
- **`_channelRegistry` lazy init:** Gerekli — döngüsel bağımlılık koruması
- **Unused exports:** Yok — tüm exports production'da kullanılıyor (sprint-controller, result-collector, worker-ipc re-exports)
- **`handleWorkerQuestion` auto-continue:** Her zaman `'continue'` döndürüyor — Human Checkpoint entegrasyonu henüz yapılmamış (yorum satır 222 bunu belirtiyor)

## 11. Security
- **File I/O:** .question/.answer dosyaları `.tasks/` altında — scope dışı erişim mümkün ama ADR-037 koruması var
- **JSON parse:** Malformed JSON → undefined dönüyor (try/catch) — güvenli
- **Timeout:** askBrain 60s default — resource exhaustion koruması
- **PollInterval:** 1s default — CPU spinning yok

## 12. Memory V2 Uyumu
- N/A — IPC mekanizması, Memory V2 ile ilişkisiz

## 13. i18n
- Auto-continue mesajları İngilizce — internal logging
- **Değerlendirme:** Temiz

## 14. Dokümantasyon Tutarlılığı
- Sprint 135 T-004 referansı doğru
- "worker-ipc.ts re-exports for backward compatibility" — doğru, worker-ipc.ts satır 369'da re-export var
- JSDoc ↔ davranış: Tutarlı
- `@internal` annotation'lar doğru kullanılmış

## 15. Performance
- **Sync I/O:** readFileSync(×3), writeFileSync(×2), existsSync(×3), unlinkSync(×2)
- **askBrain polling:** while loop + setTimeout polling — blocking değil ama CPU-idle süresi yüksek
- **checkWorkerQuestions:** Her poll cycle'da tüm active task'lar için existsSync → O(n) dosya kontrolü
- **Potansiyel optimizasyon:** File watcher (fs.watch) ile polling yerine event-driven yaklaşım (P3)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P1 | agents/worker-ipc.ts ↔ orchestra/ipc-registry.ts bilateral import'u çözülmeli — ChannelRegistry'yi core/'a taşı |
| P2 | `handleWorkerQuestion` her zaman auto-continue — Human Checkpoint entegrasyonu için TODO yok ama comment var |
| P2 | `readQuestionFile`/`readAnswerFile` JSON.parse runtime validation (Zod) ekle |
| P3 | File polling yerine fs.watch event-driven yaklaşım düşünülebilir |

## Verdict: ANALYZED
