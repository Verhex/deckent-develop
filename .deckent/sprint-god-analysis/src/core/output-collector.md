# Analysis: src/core/output-collector.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 460 | **Effort:** max

## 1. Amaç (detaylı)
Docker, tmux ve subprocess backend'lerinden worker çıktısını toplayan multi-backend output collector. Sprint 139 Task 045 ürünü. Her worker için CircularBuffer (max 10k satır, bellek koruması) ile adaptif polling (aktif 1s, boşta 5s) sağlar. Toplanan çıktılar `.deckent/sprint-NNN-outputs/task-NNN.out` dosyalarına yazılır. Backend hataları fatal değildir — warn + continue.

## 2. Public API
- `OutputCollectorError` class — DeckentError'dan türetilmiş. JSDoc yok (class adı self-documenting)
- `OutputEntry` interface — timestamp, line, stream. JSDoc yok
- `OutputBackendType` type — 'docker' | 'tmux' | 'subprocess'
- `CollectOptions` interface — Toplama seçenekleri. JSDoc ✅ (alanlar JSDoc'lu)
- `OutputSnapshot` interface — Worker çıktısı snapshot'ı
- `CircularBuffer` class — Fixed-capacity circular buffer. JSDoc ✅
  - `push(...entries)`, `length`, `received`, `dropped`, `getAll()`, `clear()`
- `OutputCollector` class — Ana collector sınıfı. JSDoc ✅
  - `collect(opts)`, `stop(workerId, flush?)`, `getSnapshot(workerId)`, `getActiveWorkers()`, `flushToDisk(workerId, sprintId?)`, `dispose(sprintId?)`, `getBuffer(workerId)`
- `createOutputCollector(projectRoot): OutputCollector` — Factory fonksiyonu. JSDoc ✅

## 3. İç Bağımlılıklar
- `./constants.js` → `DECKENT_DIR`
- `./errors.js` → `DeckentError`
- `./utils.js` → `debugLog`
- **Döngüsel bağımlılık riski:** Yok.

## 4. Dış Bağımlılıklar
- `node:child_process` → `spawnSync` (docker logs, tmux capture-pane)
- `node:fs` → existsSync, mkdirSync, writeFileSync, readFileSync
- `node:path` → join
- ADR-010: ✅ — Yalnızca Node.js built-in

## 5. Complexity
- Fonksiyon sayısı: 3 standalone + CircularBuffer 6 method + OutputCollector 10 method = 19
- Max cyclomatic complexity: ~6 (`poll` — backend switch + idle detection)
- En karmaşık fonksiyon: `captureFromBackend` (satır 419) — 3-way switch

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- Non-null `!`: 2 adet (satır 423: `state.containerName!`, satır 425: `state.tmuxTarget!`)
  - **Güvenli:** `collect()` metodunda backend === 'docker' ise containerName zorunlu, 'tmux' ise tmuxTarget zorunlu — throw ile doğrulanıyor (satır 251-256). Yani switch case'e ulaşıldığında değerler kesinlikle mevcut.
- Unsafe cast: `JSON.parse(readFileSync(statePath, 'utf-8')) as { sprintId?: string }` (satır 442) — Minimal risk, internal dosya.

## 7. ADR Compliance
- ADR-006 (spawnSync): ✅ — `spawnSync` kullanımları timeout'lu (10s docker, 5s tmux), encoding 'utf-8', stdio pipe.
- ADR-008: ✅ — Brain'den import yok
- ADR-010: ✅
- ADR-027 (Hybrid Spawn Backend): ✅ — Docker, tmux, subprocess üçünü de destekliyor
- ADR-033: ✅ — Lokal dosya yazma, ağ çağrısı yok
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/core/output-collector.test.ts` ✅
- Mock kalitesi: spawnSync mock'lanması gerekir (docker/tmux komutları)
- Edge case: disposed collector'a collect çağrısı, CircularBuffer overflow, boş backend çıktısı

## 9. TODO/FIXME/HACK Inventory
- **Hiç yok.** ✅

## 10. Dead Code
- `getBuffer(workerId)`: "for testing" notu ile export ediliyor — test utility, kabul edilebilir.
- `createOutputCollector`: Factory function, kullanılıyor.
- Tüm exportlar aktif kullanımda.

## 11. Security
- **spawnSync command injection (P2):** `captureDockerOutput` containerName'i doğrudan `docker logs` argümanı olarak kullanıyor. containerName dışarıdan gelirse command injection riski var. Ancak containerName spawn-backend tarafından üretiliyor, kullanıcı girişi değil. **Düşük risk.**
- tmuxTarget aynı pattern — internal API.
- `readFileSync` ile sprint-state.json okuma: Lokal dosya, risk yok.

## 12. Memory V2 Uyumu
- N/A. Output collector hafıza sistemi ile etkileşmiyor. ✅

## 13. i18n
- Hardcoded string: Hata mesajları İngilizce ("OutputCollector has been disposed", "containerName is required"). Internal API, P3.
- turkishNormalize: N/A

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅
- Modül header comment (satır 1-10): Features listesi doğru — CircularBuffer, adaptive polling, backend abstraction, fail-safe, file write.
- `OutputCollector.dispose()` hem polling'i durdurur hem flush yapar — JSDoc bunu belirtmiyor ama davranış açık.

## 15. Performance
- Sync I/O: spawnSync ×3 backend (polling sırasında tekrarlı!), readFileSync ×1 (subprocess), writeFileSync ×1 (flush), existsSync ×2
- **Hot path uyarısı (P2):** `poll()` 1-5 saniyede bir çağrılıyor. Her poll'da `spawnSync` çalıştırılıyor. Aktif sprint'te 4+ worker ile saniyede 4+ spawnSync çağrısı. Process spawn overhead yüksek olabilir.
- CircularBuffer `splice(0, overflow)`: O(n) shift — yüksek overflow durumunda yavaş olabilir ama pratikte 10k limit yeterli.

## 16. Öneriler
- **P2 — Polling spawnSync overhead:** Her poll'da subprocess spawn etmek ağır. Docker backend için `docker logs --follow` stream kullanmak, tmux için pipe-based capture düşünülebilir.
- **P2 — Timer cleanup:** `dispose()` polling map'i temizliyor ama `buffers` map'i temizlenmiyor. Bellek sızıntısı potansiyeli (Sprint sonunda garbage collect edilir ama explicit cleanup daha iyi).
- **P3 — CircularBuffer splice:** Ring buffer (index-based) daha performanslı olabilir.

## Verdict: ANALYZED
