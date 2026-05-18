# Analysis: src/cli/commands/spawn.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 144 | **Effort:** max

## 1. Amaci
Tek bir task icin manuel worker spawn etmeyi saglar. `deckent spawn <taskId>` komutu ile kullanici belirli bir task icin worker baslatabilir. Multi-provider destegi sunar: Claude → tmux, Codex/Gemini → subprocess, config override → SpawnBackendFactory. Task'in scope'undan allowedTools hesaplar ve rich prompt (agent prompt + skill prompts) olusturur. Brain'in sprint-controller'indan bagimsiz olarak tekil task calistirma imkani verir.

## 2. Public API
- `buildAllowedToolsFromScope(task: Task): string | undefined` — Task scope'undan izin verilen arac listesi olustur
- `spawnWorkerMultiProvider(taskId, model, prompt, root, opts): { backend, provider }` — Multi-provider worker spawn
- `registerSpawn(program: Command): void` — Commander'a spawn komutunu kayit et
- JSDoc: IYI. `buildAllowedToolsFromScope` ve `spawnWorkerMultiProvider` icin detayli JSDoc mevcut.

## 3. Ic Bagimliliklar
- `../../core/types.js` — Task, ModelType, ProviderName
- `../../agents/worker.js` — readTask
- `../../orchestra/tmux.js` — ensureSession, spawnWorker
- `../../core/config.js` — loadConfig
- `../helpers/messages.js` — getMessage
- `../../core/task-types.js` — TaskStatus, getProviderForModel
- `../../orchestra/task-builder.js` — buildWorkerPrompt
- `../../orchestra/sprint-controller.js` — resolveAgentPrompt, resolveSkillPrompts
- `../../orchestra/spawn-backend.js` — SpawnBackendFactory
- **ADR-008 UYARI:** `sprint-controller.js`'den import var (resolveAgentPrompt, resolveSkillPrompts). CLI → orchestra → sprint-controller zinciri. Bu ADR-008'in ruhuna aykiri olabilir — sprint-controller helper fonksiyonlari CLI'dan cagiriliyor.
- Dongusel bagimllik riski: DUSUK. Tek yonlu import ama sprint-controller'a bagimllik mimarinin tartisilabilir noktasi.

## 4. Dis Bagimliliklar
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 3 (3 exported)
- En karmasik fonksiyon: `spawnWorkerMultiProvider` (satir 35-81) — 3 branch: config override, claude tmux, fallback subprocess
- Max cyclomatic complexity (rough): ~5
- Genel karmasiklik: ORTA. Multi-provider logic acik ve iyi yapilandirilmis.

## 6. Type Safety
- `any` sayisi: 0 (dogrudan any yok)
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast:
  - `model as ModelType` (satir 52, 63, 76) — string → ModelType cast. Model validation CLI action'da yapilMIYOR.
  - `config as Record<string, unknown>` (satir 95) — config type narrowing, guvenli degil.
  - `config as { spawn_backend?: string; ... }` (satir 119) — unsafe cast.
  - `opts.spawnBackend as 'docker' | 'tmux' | 'subprocess' | 'auto'` (satir 47) — string → union cast, validation yok.
- Genel: ORTA. Birden fazla unsafe cast var.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — spawnSync kullanilmiyor (tmux/subprocess backend'ler ayri modullerde).
- **ADR-008 (brain import):** POTANSIYEL IHLAL — sprint-controller'dan resolveAgentPrompt, resolveSkillPrompts import ediliyor. ADR-008 "planner imports ONLY from core" diyor — CLI icin bu kural acik degil ama mimariye aykiri.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** UYUMLU — `deckent_run` MCP tool mevcut (benzer fonksiyon).
- **ADR-027 (hybrid spawn):** UYUMLU — SpawnBackendFactory ile multi-backend destek.

## 8. Test Coverage
- `tests/cli/commands/spawn.test.ts` — MEVCUT
- `tests/cli/commands/spawn-enhanced.test.ts` — MEVCUT
- Test eslesmesi: IYI — 2 test dosyasi.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- Dead code: YOK. Tum 3 exported fonksiyon aktif kullaniliyor.

## 11. Security
- Task read: `readTask(root, taskId)` — guvenli, filesystem-based task okuma.
- Model cast: `model as ModelType` validation olmadan — hata durumunda undefined behavior yerine runtime exception olusabilir ama CLI kontekstinde risk dusuk (task.model zaten task-builder tarafindan ayarlanmis).
- allowedTools: `buildAllowedToolsFromScope` scope'suz task'lar icin undefined dondurerek tam arac erisimi veriyor. Bu kasitli tasarim ama guvenlik perspektifinden scope'suz task = sinir yok.

## 12. Memory V2 Uyumu
- N/A — Spawn komutu Memory V2 ile dogrudan etkilesmiyor.
- Agent/skill prompt resolving sprint-controller uzerinden — o moduldeki DB-first uyumu ayri analiz konusu.

## 13. i18n
- `getMessage('spawn.worker_spawned', lang, ...)` kullaniliyor (satir 128). IYI.
- Ancak "Backend:", "Provider:", "Scope dirs:", "Write files:" mesajlari HARDCODED (satir 129-138).
- KISMI i18n — getMessage entegrasyonu baslamis ama tamamlanmamis.

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: `buildAllowedToolsFromScope` JSDoc dogru — scope varsa sabit tool listesi, yoksa undefined.
- `spawnWorkerMultiProvider` JSDoc backend selection priority'yi acikliyor — dogru.
- DECKENT.md MCP tool tablosunda `deckent_run` mevcut — UYUMLU.

## 15. Performance
- Sync I/O sayisi: 0 dogrudan (loadConfig async, readTask sync ama worker.js'de)
- Hot path mi? HAYIR — CLI komutu.
- `await loadConfig(root).catch(...)` — async config loading, iyi pattern.

## 16. Oneriler
- **P1:** Unsafe cast'leri azalt — `config as Record<string, unknown>` yerine loadConfig'in tipi genisletilebilir. `model as ModelType` icin runtime validation ekle.
- **P2:** sprint-controller import'unu gozden gecir — `resolveAgentPrompt/resolveSkillPrompts` ayri bir utility module extract edilebilir (ADR-008 ruhu).
- **P2:** Hardcoded mesajlari ("Backend:", "Provider:" vb.) getMessage'a tasI.
- **P3:** `buildAllowedToolsFromScope` tool listesi hardcoded — configurable yapilabilir.

## Verdict: ANALYZED
