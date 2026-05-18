# Analysis: src/orchestra/result-collector.ts
**Task ID:** 141-002 | **LoC:** 384

## 1. Amaci (1-2 cumle)
Sprint'teki worker task sonuçlarını bekler ve toplar; fs.watch + IPC heartbeat ile polling yerine event-driven yaklaşım kullanır. Kuyruk yönetimi ile mevcut slot açılınca bekleyen task'ları spawn eder.

## 2. Public API (export listesi)
- `buildResultsMap(results)` → Map<string, TaskResult>
- `estimateTokenUsage(task, result)` → TokenUsage
- `enrichResultTokenUsage(result, task)` → void
- `resolveAgentPrompt(projectRoot, task)` → Promise<string|undefined>
- `resolveSkillPrompts(projectRoot, task)` → Promise<Array<{name, content}>>
- `waitForResults(projectRoot, sprint, timeoutMs?, queue?, spawnOpts?, channelRegistry?)` → Promise<TaskResult[]>
- Re-export: `handleWorkerQuestion`, `checkWorkerQuestions` (from ipc-registry.js)

## 3. Ic + Dis Bagimliliklar
**Node.js:**
- `node:fs/promises` — readFile, stat, writeFile
- `node:path` — join

**Core:**
- `../core/types.js` — Task, TaskResult, Sprint
- `../core/constants.js` — TASKS_DIR
- `../core/utils.js` — readJsonSafe, debugLog
- `../core/observability.js` — metric
- `../core/task-types.js` — BrainAnswer, WorkerQuestion, TokenUsage

**Orchestra:**
- `./result-watcher.js` — createResultWatcher
- `./ipc-registry.js` — writeAnswerFile, checkWorkerQuestions
- `./spawn-backend.js` — SpawnBackend
- `./task-builder.js` — buildWorkerPrompt
- `./tmux.js` — spawnWorker, killWorker
- `../agents/worker-ipc.js` — ChannelRegistry

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Export fonksiyonlar: 7 (+ 2 re-export)
- waitForResults: en büyük fonksiyon (~120 satır), yüksek cyclomatic (~15)
- collectResults iç fonksiyonu: timeout marker desteği dahil karmaşık
- IPC/fs.watch dual-mode racing mantığı: yüksek cyclomatic

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `raw['systemPrompt'] as string | undefined` — unsafe cast (satır 131)
- `Array.isArray(raw['expertise'])` — runtime kontrol, güvenli
- `(result as TaskResult & { ... })` — annotation cast, nispeten güvenli
- `as Record<string, unknown>` — birkaç yerde kullanılmış

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** Uyumlu — `.js` uzantılı importlar
- **ADR-006:** Uyumlu — tmux.js aracılığıyla spawnSync, doğrudan değil
- **ADR-008:** Uyumlu — brain import yok
- **ADR-010:** Uyumlu — harici bağımlılık yok
- **ADR-037:** Kısmen — `processQueue` worker spawning yapar ama yetki kontrolü sınırlı
- **ADR-040:** Uyumlu — Memory V2 ile ilgisiz

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/result-collector.test.ts` — **MEVCUT** ✓
- waitForResults için özellikle IPC/fs.watch dual-mode ve timeout marker senaryoları kritik

## 8. TODO/FIXME/HACK inventory
- Satır 295: `// IPC dual-mode: register HEARTBEAT listeners` — niyeti açık, ama uygulama karmaşık
- Satır 383: `// Sprint 135 T-004: Moved to ipc-registry.ts. Re-exported here for backward compat.` — migration notu

## 9. Dead Code Candidates
- `estimateTokenUsage`: sadece `enrichResultTokenUsage` içinden çağrılıyor ama kendi de export; dışarıdan kullanılıp kullanılmadığı kontrol edilmeli

## 10. Security Findings
- `readFile` ile agent/skill promptlarını okuma: dosya yolu join() ile birleştirilmiş, güvenli
- `writeAnswerFile`: IPC cevap dosyası yazımı — yazma izni kontrolü worker scope'a bırakılmış
- `allowedTools` string birleştirme: `Write(${writeTargets.join(',')})` — path injection riski; writeTargets normalizasyonu sprint-spawner'da yapılıyor

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile doğrudan ilgisiz — task result dosyaları .tasks/ altında JSON
- Eski .md parse yok

## 12. Oneriler (Sprint 142+ input)
1. **Refactor (P2):** waitForResults fonksiyonu çok büyük (~120 satır); collectResults ve processQueue ayrı modüle taşınabilir
2. **Type Safety (P2):** `raw['systemPrompt'] as string` → Zod veya tip guard ile güvenli parse
3. **Timeout Config (P2):** WATCH_FALLBACK_MS ve PROGRESS_LOG_INTERVAL_MS konfigüre edilebilir olmalı

## 13. Verdict: ANALYZED
