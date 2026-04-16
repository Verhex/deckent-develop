# Analysis: src/cli/commands/run.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 332 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint döngüsü olmadan tek seferlik (one-shot) task çalıştırır. Task JSON dosyası oluşturur, worker spawn eder, result dosyasını bekler ve sonucu raporlar. `fs.watch` ile anlık result tespiti, heartbeat monitoring ile stale worker algılama, verbose mod ile gerçek zamanlı log streaming sunar. Hızlı tek görev çalıştırmak isteyen kullanıcılar ve CI pipeline'ları için tasarlanmış.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `interface RunCommandOpts` — JSDoc YOK ✗
- `interface SingleTaskResult` — JSDoc YOK ✗
- `createRunTaskId(): string` — JSDoc YOK ✗
- `buildRunTask(taskId, description, model, scopeDir)` — JSDoc YOK ✗ — return type eksik (implicit)
- `cleanupRunTask(projectRoot: string, taskId: string): void` — JSDoc YOK ✗
- `readHeartbeat(projectRoot, taskId): {...} | null` — JSDoc VAR ✓
- `waitForRunResult(projectRoot, taskId, timeoutMs): Promise<TaskResult | null>` — JSDoc VAR ✓
- `streamWorkerLog(projectRoot, taskId, timeoutMs): Promise<void>` — JSDoc VAR ✓
- `registerRun(program: Command): void` — JSDoc YOK ✗

## 3. İç Bağımlılıklar
- `../../core/types.js` → ModelType, TaskResult, Task, TaskStatus, ALL_MODELS
- `../../core/constants.js` → TASKS_DIR
- `../../core/utils.js` → readJsonSafe
- `../../core/config.js` → loadConfig
- `../../orchestra/brain.js` → buildWorkerPrompt — **ADR-008 notu: CLI → orchestra import**
- `../../orchestra/sprint-controller.js` → resolveAgentPrompt, resolveSkillPrompts — **orchestra import**
- `./spawn.js` → spawnWorkerMultiProvider
- **ADR-008 riski:** CLI komutunun brain.js ve sprint-controller.js'den doğrudan import yapması. review.ts'deki gibi dynamic import değil, static import. Bu bir parity ihtiyacı — run komutu worker prompt'u oluşturmak zorunda.

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 9 fonksiyon
- En karmaşık: `waitForRunResult` (satır 114-181) — fs.watch + polling fallback + heartbeat monitoring + timeout — cyclomatic ~8
- `streamWorkerLog` (satır 186-222) — file streaming with offset tracking — cyclomatic ~5
- `registerRun` action (satır 236-331) — spawn + wait + report + cleanup — cyclomatic ~7
- **Yüksek karmaşıklık** — async koordinasyon yoğun

## 6. Type Safety
- `as ModelType` — satır 238 — string → ModelType cast. ALL_MODELS.includes check ile doğrulanıyor ✓
- `as Task` — satır 271, 277 — buildRunTask sonucu Task'a cast. buildRunTask'ın return type'ı implicit — **P3: explicit return type ekle**
- `as string` — satır 211, 212 — createReadStream chunk type assertion
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **non-null !: 0** ✓

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/run.ts` MEVCUT ✓. CLI: --model, --scope, --timeout, --keep, --auto-approve, --verbose. MCP: muhtemelen temel run. **GAP: MCP'de --verbose, --keep flag'leri muhtemelen yok**
- **ADR-006 spawnSync:** Kullanmıyor — spawn.js abstraction ✓
- **ADR-008:** brain.js ve sprint-controller.js static import — mimari olarak gerekli ama ADR-008'in ruhu açısından tartışmalı
- **ADR-027 Hybrid Spawn:** SpawnBackendFactory üzerinden multi-backend desteği ✓

## 8. Test Coverage
- `tests/cli/commands/run.test.ts` — MEVCUT ✓
- `tests/cli/commands/run-overhaul.test.ts` — MEVCUT ✓
- **Kapsam: İYİ** — 2 test dosyası

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- `SingleTaskResult` interface — kullanılıyor mu? grep gerekli. `waitForRunResult` TaskResult döndürüyor, SingleTaskResult başka yerde kullanılmıyor olabilir. **Potansiyel dead code**
- `_runTaskCounter` — module-level mutable state, test isolation riski
- `sleep` helper — sadece `streamWorkerLog` içinde kullanılıyor ✓

## 11. Security
- `autoApprove = true` (satır 242) — **P1: Hardcoded true, --auto-approve flag'inin etkisi yok**. Comment: "Deckent standard: workers MUST have full write permissions". Bu tasarım kararı ama kullanıcı flag'i yanıltıcı.
- Worker spawn — dış process çalıştırma. Güvenlik spawn.js abstraction'da.
- Task ID: `run-${Date.now()}-${counter}` — tahmin edilebilir ama CLI bağlamında sorun değil
- **Güvenlik: ORTA** — autoApprove hardcode dikkat çekici

## 12. Memory V2 Uyumu
- Run komutu memory kullanmıyor — one-shot task
- resolveAgentPrompt ve resolveSkillPrompts aracılığıyla dolaylı DB erişimi olabilir
- **Uyum: N/A** ✓

## 13. i18n
- Tüm mesajlar İngilizce hardcoded: "Running task...", "Worker spawned via...", "Waiting for result...", "Task timed out..."
- `messages.ts` kullanılmıyor — **GAP: i18n desteği yok**

## 14. Dokümantasyon Tutarlılığı
- `(D)` ve `(E)` comment tag'leri mevcut — waitForRunResult ve heartbeat monitoring
- buildRunTask return type implicit — DeckentConfig'e uygun mu?

## 15. Performance
- `waitForRunResult`: fs.watch + 5s polling fallback — **iyi performans pattern**
- `streamWorkerLog`: 500ms polling + createReadStream offset — verimli
- Heartbeat check: 30s interval — makul
- `sleep(500)` loop'ları — streamWorkerLog'da polling. Acceptable for CLI.

## 16. Öneriler
1. **P1:** `autoApprove = true` hardcode'u — ya flag'i kaldır ya da gerçekten kullanılabilir yap. Şu an `--auto-approve` flag'i yanıltıcı.
2. **P2:** `SingleTaskResult` interface — dead code ise kaldır
3. **P2:** ADR-008 — brain.js/sprint-controller.js static import'larını sarmalayıcı fonksiyon/modül arkasına al
4. **P3:** buildRunTask return type'ını explicit yap
5. **P3:** i18n desteği ekle
6. **P3:** `_runTaskCounter` module-level state — test isolation için resetRunTaskCounter() ekle veya factory pattern kullan

## Verdict: ANALYZED
