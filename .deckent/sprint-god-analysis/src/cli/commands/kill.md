# Analysis: src/cli/commands/kill.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 224 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Çalışan worker process'lerini durdurur (kill). Tek worker veya `--all` ile tüm aktif worker'ları öldürebilir. Multi-provider desteği var — Claude (tmux), Codex/Gemini (subprocess). Kill sonrası task status'ü PAUSED'a günceller, lock'ları serbest bırakır, prompt dosyalarını temizler. Sprint yönetiminde stuck worker'ları durdurmak için kritik operasyonel komut.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `registerKill(program: Command): void` — JSDoc YOK ✗
- Diğer fonksiyonlar module-private (export yok):
  - `findTaskFile` — JSDoc VAR ✓
  - `updateTaskStatus` — JSDoc VAR ✓
  - `releaseLocks` — JSDoc VAR ✓
  - `cleanPromptFiles` — JSDoc VAR ✓
  - `detectTaskProvider` — JSDoc VAR ✓
  - `killSingle` — JSDoc VAR ✓
  - `findActiveTaskIds` — JSDoc VAR ✓
- **İyi JSDoc pratiği** — private fonksiyonlarda bile dokümantasyon var ✓

## 3. İç Bağımlılıklar
- `../../orchestra/tmux.js` → killWorker, TmuxError — **static import**
- `../../orchestra/spawn-backend.js` → SpawnBackendFactory
- `../../core/types.js` → ModelType
- `../../core/task-types.js` → getProviderForModel
- `../../core/config.js` → loadConfig
- `../../core/constants.js` → TASKS_DIR, LOCKS_DIR
- `../helpers/output.js` → print, printError
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/messages.js` → getMessage
- **ADR-008 notu:** tmux.js ve spawn-backend.js static import — CLI bağlamında kabul edilebilir

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 8 fonksiyon
- En karmaşık: `killSingle` (satır 108-160) — multi-provider kill chain (subprocess → tmux → subprocess fallback) — cyclomatic ~8
- `registerKill` --all action (satır 193-211) — loop + kill + cleanup — cyclomatic ~4
- **Orta-yüksek karmaşıklık** — multi-provider fallback zinciri

## 6. Type Safety
- `as ModelType` — satır 100 — JSON'dan gelen model değeri. getProviderForModel try/catch ile sarmalanmış ✓
- JSON.parse sonuçları type assertion ile — standart pattern
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **non-null !: 0** ✓

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/kill.ts` MEVCUT ✓. CLI: kill [taskId] --all. MCP: target="all"|"worker", workerId. **Parity: İYİ** ✓
- **ADR-006 spawnSync:** Kullanmıyor — spawn-backend abstraction ✓
- **ADR-008:** tmux.js static import — CLI bağlamında kabul edilebilir
- **ADR-027:** Multi-backend desteği (tmux + subprocess fallback) ✓

## 8. Test Coverage
- `tests/cli/commands/kill.test.ts` — MEVCUT ✓
- `tests/cli/commands/kill-enhanced.test.ts` — MEVCUT ✓
- **Kapsam: İYİ** — 2 test dosyası, enhanced test multi-provider senaryoları

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- Tüm private fonksiyonlar killSingle veya registerKill tarafından kullanılıyor ✓
- **Dead code: YOK** ✓

## 11. Security
- Process kill operasyonu — tmux session name ve subprocess PID üzerinden
- `unlinkSync` lock dosyaları — LOCKS_DIR içinde sınırlı ✓
- `unlinkSync` prompt dosyaları — TASKS_DIR içinde sınırlı ✓
- Task status PAUSED'a yazma — writeFileSync ile
- **Güvenlik: İYİ** — operasyonel risk var ama doğru sınırlamalar mevcut

## 12. Memory V2 Uyumu
- Kill komutu memory kullanmıyor — operasyonel komut
- **Uyum: N/A** ✓

## 13. i18n
- **İYİ i18n implementasyonu** ✓ — `getMessage()` helper kullanımı
- `loadConfig(root)` → config.language → lang parametresi
- Message key'leri: 'kill.worker_killed', 'kill.task_status_updated', 'kill.locks_released', 'kill.prompts_cleaned', 'kill.worker_not_found', 'kill.no_active_workers', 'kill.all_killed'
- **Tek hardcoded EN string:** "taskId is required (or use --all)" — satır 217 — **P3: getMessage'a taşı**

## 14. Dokümantasyon Tutarlılığı
- **İyi JSDoc pratiği** — 7/8 fonksiyonda dokümantasyon var
- DECKENT.md'de `deckent_kill` MCP tool: destructive ✓, target: "all" veya "worker" + workerId ✓
- CLI ve MCP parametreleri uyumlu

## 15. Performance
- `findActiveTaskIds` — tüm task JSON'larını okuyor — O(N) disk I/O
- `findTaskFile` — readdirSync + linear search — O(N)
- **Hot path değil** — kill operasyonu nadir çağrılır

## 16. Öneriler
1. **P3:** Satır 217 hardcoded EN string → getMessage() entegrasyonu
2. **P3:** --all modunda killWorker try/catch sonrası updateTaskStatus çağrılıyor ama killSingle'daki multi-provider fallback mantığı yok — **P2: --all modunda da multi-provider kill chain kullanılmalı** (satır 200-201 sadece tmux deniyor)
3. **P3:** `readdirSync` + `readFileSync` loop — çok sayıda task dosyası olduğunda performans riski ama CLI bağlamında kabul edilebilir

## Verdict: ANALYZED
