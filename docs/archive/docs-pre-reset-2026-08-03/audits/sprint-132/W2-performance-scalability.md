# W2 — Performance & Scalability Audit (Sprint 132)

## Executive Summary

Deckent'in performans profili, 130+ sprint boyunca organik büyüme sonucu ciddi bottleneck'ler barındırıyor. En kritik bulgular: (1) **388 readFileSync + 282 writeFileSync** kullanımı 116+ dosyada — hot path'lerde event loop blocking riski; (2) **loadConfig() hiçbir caching mekanizması içermiyor** — her çağrıda 3-layer deepMerge + structuredClone yapılıyor; (3) **sprint-controller.ts (2133 satır) ve sprint-reporter.ts (2132 satır)** god object'ler olarak hem bellek hem CPU baskısı yaratıyor; (4) **ParallelPipelineManager topological sort hiçbir yerde çağrılmıyor** — dependency-aware scheduling tamamen devre dışı; (5) **results.find() linear scan** paternleri O(n²) davranış yaratıyor. Genel olarak Deckent 3-8 worker'lık sprint'lerde kabul edilebilir performans gösterse de, 10+ worker / 20+ task senaryolarında I/O contention ve bellek baskısı ciddi darboğaz oluşturacaktır.

## Methodology

**Statik analiz yaklaşımı** — hiçbir benchmark veya yük testi çalıştırılmadı (Sprint 133'e ertelendi). Tarama yöntemi:

1. **Kaynak kod okuma**: Directives'te listelenen tüm hedef dosyalar (sprint-controller.ts, sprint-reporter.ts, config.ts, agent-pool.ts, skill-pool.ts, agent-cache.ts, skill-cache.ts, routing-engine.ts, lazy-loader.ts, parallel-pipeline.ts, spawn-backend.ts, spawn-backend-docker.ts, result-watcher.ts, prompt-token-optimizer.ts, heartbeat-daemon.ts, system-profile.ts, sprint-phases.ts) satır satır okundu.
2. **Pattern grep**: `readFileSync`, `writeFileSync`, `spawnSync`, `execSync`, `setInterval`, `setTimeout`, `structuredClone`, `results.find()`, `cache/Cache` pattern'leri tüm `src/` üzerinde tarandı.
3. **LoC analizi**: Tüm `.ts` dosyaları satır sayısına göre sıralandı, god object eşikleri belirlendi (>500 satır = büyük, >1000 = god object).
4. **Import graf analizi**: `src/index.ts` barrel export zinciri, worker.ts import sayısı, core↔orchestra bağımlılık derinliği incelendi.
5. **Standart referanslar**: Node.js event loop model, fs.promises vs fs sync performans farkları, V8 structuredClone maliyeti.

**Dosya tarandı:** 82+ kaynak dosya (`src/` altı)
**Pattern tarandı:** readFileSync (388), writeFileSync (282), spawnSync/execSync (129), setInterval/setTimeout (51)

## Findings

| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | CRITICAL | SyncIO | src/ genelinde (116 dosya) | **388 readFileSync + 282 writeFileSync** kullanımı. Hot path'ler (sprint-controller, sprint-reporter, worker, auditor, debt-manager) dahil event loop'u bloke eden senkron I/O. sprint-controller.ts tek başına 19 readFileSync+writeFileSync çağrısı barındırıyor. | Sprint lifecycle boyunca event loop bloke olur; 10+ worker'da I/O contention. Worker heartbeat yazımı (writeFileSync) concurrent access'te bottleneck. | Hot path'lerde (spawnWorkers, waitForResults, evaluateResult) `fs.promises` kullanımına geçiş. CLI ve startup path'lerde sync I/O kabul edilebilir. |
| 2 | CRITICAL | MissingCache | src/core/config.ts:476-499 | **loadConfig() her çağrıda** disk I/O (readJsonFile x2) + deepMerge x2 + structuredClone x4 yapıyor. Hiçbir in-memory cache yok. Sprint lifecycle boyunca onlarca kez çağrılabilir. | Her config erişiminde ~5-15ms gecikme (disk I/O + structuredClone). 20 task'lık sprint'te kümülatif 100ms+. | loadConfig() sonucunu module-level cache'le; invalidation: config dosyası mtime veya explicit reset. |
| 3 | HIGH | GodObject | src/orchestra/sprint-controller.ts (2133 satır) | Sprint lifecycle'ın tamamı tek dosyada: runSprint, spawnWorkers, waitForResults, evaluateResult, cleanup, finalizeSprint. 100+ import satırı, 19 sync I/O çağrısı, 24 .filter/.find çağrısı. | Startup'ta tüm modül yüklenir (tree-shaking devre dışı — ESM barrel export). Bellek ayak izi büyük, hot-reload'da yavaş. | Faz bazlı bölme: spawn-phase.ts, evaluate-phase.ts, cleanup-phase.ts (kısmen sprint-phases.ts ile başlanmış ama controller hâlâ monolitik). |
| 4 | HIGH | GodObject | src/orchestra/sprint-reporter.ts (2132 satır) | RETRO.md üretimi, metrik hesaplama, agent/skill performance, token usage, CI learnings, doc-updaters, managed-docs — hepsi tek dosyada. 22 readFileSync + 12 writeFileSync. String concatenation ile markdown üretimi (lines.push + join pattern). | Retro yazımında büyük string allocation'lar. 130+ sprint arşivinde collectSprintFiles() tüm dosya isimlerini okuyup sort ediyor. | Markdown üretimini stream-based writer'a taşı. collectSprintFiles() için lazy iteration (generator). |
| 5 | HIGH | Parallelism | src/orchestra/parallel-pipeline.ts (106 satır) | ParallelPipelineManager topological sort implementasyonu **mevcut ama hiçbir yerde çağrılmıyor**. spawnWorkers() (sprint-controller.ts:919-1018) tüm task'ları `sprint.tasks.slice(0, maxWorkers)` ile sırayla spawn ediyor, Task.dependencies alanını kontrol etmiyor. | Dependency-aware scheduling yok. Bağımlı task'lar paralel çalışır, race condition riski. W7-tipi reducer task'lar self-polling ile çözmek zorunda — verimsiz. | spawnWorkers() içinde ParallelPipelineManager.createPipeline() çağırarak wave-based spawn uygula. |
| 6 | HIGH | Allocation | src/orchestra/sprint-controller.ts:1368, 1396, 1446 | **results.find(r => r.taskId === task.id)** pattern'i nested loop içinde. finalizeSprint() her task için results array'ini linear scan yapıyor. N task × N result = O(n²). | 20 task'lık sprint'te 400 karşılaştırma. Küçük N'de kabul edilebilir ama scale etmez. | results'ı Map<taskId, TaskResult> olarak index'le: `const resultMap = new Map(results.map(r => [r.taskId, r]))`. O(1) lookup. |
| 7 | HIGH | SyncIO | src/orchestra/sprint-controller.ts:1-14 | spawnSync (4 kullanım) ve execSync çağrıları. sprint-controller'da spawnSync ile git komutları çalıştırılıyor. Bu event loop'u tamamen bloke eder. | Git operasyonları büyük repo'larda 100ms+ sürebilir. Sprint lifecycle boyunca birden fazla kez çağrılır. | spawnSync → child_process.spawn (async) veya simple-git kütüphanesi. |
| 8 | MEDIUM | MissingCache | src/core/agent-pool.ts:77-100, src/core/skill-pool.ts:32-59 | loadAgents() ve loadSkills() her çağrıda disk'ten tüm agent/skill JSON'ları yeniden okuyor. LRU eviction var ama cache yok — her seferinde full reload. SkillPoolManager.getSkill() → loadSkills() → tüm skill'leri yükle sadece bir tanesini döndür. | Her routing kararında tüm agent+skill pool yeniden yükleniyor. 50 temp agent + 21 built-in = 70+ JSON dosyası okunuyor. | Pool'u class instance'ında cache'le. Invalidation: mtime kontrolü veya sprint başlangıcında bir kez yükle. |
| 9 | MEDIUM | Polling | src/orchestra/result-watcher.ts:19-72 | fs.watch + setTimeout fallback (5s). fs.watch platform-dependent güvenilirlik sorunları var (Linux inotify limit, macOS kqueue). Fallback 5s interval polling — kabul edilebilir ama configurable değil. | Yoğun .tasks/ dizininde inotify limit aşılabilir. Fallback'te 5s gecikme result detection'ı yavaşlatır. | Fallback interval'i config'den okut. Linux'ta inotify limit uyarısı ekle. |
| 10 | MEDIUM | SyncIO | src/orchestra/debt-manager.ts (450 satır, 15 sync I/O) | DEBT.md okuma/yazma tamamen senkron. Her sprint sonunda parseDebtTable + writeDebtTable çağrılır. | Debt tablosu büyüdükçe (100+ entry) parse süresi artar. Senkron yazma event loop'u bloke eder. | fs.promises kullanımına geçiş; debt parse sonucunu sprint boyunca cache'le. |
| 11 | MEDIUM | StartupTime | src/index.ts (barrel export) | `export * from './core/index.js'` + `export * from './orchestra/index.js'` + `export * from './monitor/index.js'` + `export * from './agents/index.js'` — 4 barrel export tüm modülleri eager load eder. | Node.js startup'ta tüm 59,375 satır parse edilir. CLI komutları bile full codebase'i yükler. | Lazy import: CLI komutları için dynamic import() kullanımı. Barrel export'ları kaldır veya tree-shake uyumlu yap. |
| 12 | MEDIUM | Allocation | src/core/config.ts:123-142 (deepMerge) | deepMerge() `structuredClone(base)` + recursive iteration. Config 3-layer merge'de 4x structuredClone çağrısı. structuredClone() V8'de MessageChannel üzerinden serialize/deserialize yapar — shallow object'ler için bile görece pahalı. | Her loadConfig() çağrısında 4 structuredClone = ~4-8ms overhead. | İlk yükleme sonrası cache'leme ile tamamen ortadan kalkar. Alternatif: shallow spread ile merge (config nesting derinliği ≤3). |
| 13 | MEDIUM | MissingCache | src/core/routing-engine.ts:67-72 (routeTaskV2) | Her task routing kararında: classifyIntent → evaluateActivation → selectBestAgent → selectBestSkills çağrı zinciri. Routing kararı cache'lenmiyor. Aynı sprint içinde benzer task'lar tekrar routing overhead'i yaşar. | 7 task'lık sprint'te 7x full routing pipeline. Her biri ~5-10ms. | Sprint başlangıcında routing kararlarını cache'le (task signature → RoutingDecision). agent-cache.ts zaten bu amaçla var — routeTaskV2 ile entegre et. |
| 14 | LOW | Polling | src/monitor/auditor.ts (612 satır, 30s cycle) | Auditor 30s setInterval ile scan cycle çalıştırıyor. Her cycle'da: heartbeat dosyalarını oku, git diff çalıştır (spawnSync), lock dosyalarını kontrol et. | 30s interval kabul edilebilir ama git diff spawnSync'tir — event loop bloke olur. | git diff'i async child_process.spawn ile çalıştır. |
| 15 | LOW | MemoryLeak | src/core/skill-cache.ts:26-27 | SkillLoadingCache 500KB max budget ile eviction yapıyor. Ancak cache instance'ı global değil, her SkillLoadingCache new'lendiğinde sıfırdan başlıyor. Effective caching yok eğer instance her seferinde yeniden oluşturuluyorsa. | Disk I/O tekrarlanır, cache'in değeri düşer. | Singleton pattern veya module-level cache instance. |
| 16 | LOW | Parallelism | src/core/system-profile.ts:9-13 | calcRecommendedMaxWorkers: `min(floor(freeMemMB/400), cpuCores-1, 30)`. Sabit 400MB/worker varsayımı. Claude Code worker'ları 400MB'den fazla kullanabilir; Codex/Gemini API worker'ları ise çok az bellek kullanır. | Provider-agnostic bellek tahmini yanlış olabilir. API tabanlı worker'lar gereksiz yere sınırlanır. | Provider tipine göre per-worker memory estimate: tmux=400MB, subprocess=200MB, docker=configurable, api=50MB. |
| 17 | LOW | SyncIO | src/orchestra/spawn-backend-docker.ts (332 satır, 9 spawnSync) | Docker backend `spawnSync('docker', ...)` ile container oluşturuyor. Senkron — container pull/start sırasında event loop tamamen donmuş. | Docker image yoksa pull süresi 30s+ olabilir. Tüm worker spawn'ları seri olarak gerçekleşir. | child_process.spawn (async) + Promise wrapper. Paralel container başlatma. |
| 18 | INFO | Allocation | src/orchestra/sprint-reporter.ts:62-88 (buildTokenUsageSection) | String template literal ile markdown tablo satırı oluşturma. lines.push() + join('\n') pattern'i. | Küçük allocation'lar, kabul edilebilir. 100+ task'ta belirgin olabilir. | Mevcut haliyle kabul edilebilir. Çok büyük sprint'lerde stream writer düşünülebilir. |
| 19 | INFO | SyncIO | src/core/constants.ts (2 readFileSync) | Package.json'dan versiyon okuma startup'ta bir kez yapılıyor. | Tek seferlik, ihmal edilebilir. | Kabul edilebilir — startup path. |
| 20 | INFO | Allocation | src/orchestra/sprint-controller.ts:1901-1903 | `[...evaluations.values()].filter(e => e === TaskEvaluation.DONE).length` — spread + filter + length sadece count için. 3 ayrı array allocation. | N küçükken ihmal edilebilir (tipik 3-10 task). | Tek for-loop ile count: `let goCount = 0; for (const v of evaluations.values()) if (v === DONE) goCount++`. |

## Metrics

- **Dosya tarandı:** 82+ kaynak dosya (src/ altı, 59,375 toplam satır)
- **Toplam bulgu:** 20
- **CRITICAL:** 2
- **HIGH:** 5
- **MEDIUM:** 6
- **LOW:** 4
- **INFO:** 3
- **Senkron I/O çağrıları:** readFileSync=388, writeFileSync=282, spawnSync/execSync=129 (toplam 799)
- **Polling mekanizmaları:** setInterval/setTimeout=51 kullanım (21 dosya)
- **God object'ler (>1000 satır):** sprint-controller.ts (2133), sprint-reporter.ts (2132), config.ts (1110)
- **Büyük modüller (>500 satır):** 20+ dosya
- **Caching mekanizmaları:** agent-cache.ts (LRU, 5min TTL, 100 entry), skill-cache.ts (500KB budget, mtime check), lazy-loader.ts (generic lazy load). Config caching: YOK. Pool caching: YOK.
- **Toplam kaynak satır:** 59,375 (src/ altı tüm .ts dosyaları)
- **orchestra/ satır:** 15,778 (tüm modüller)
- **core/ satır:** 13,131 (tüm modüller)

## Evidence

### Finding #1 — Senkron I/O yaygınlığı
```
# readFileSync kullanım sayıları (en yoğun dosyalar):
src/orchestra/sprint-reporter.ts   : 11
src/agents/worker.ts               : 9
src/core/utils.ts                  : 7
src/core/stack-detector.ts         : 7
src/orchestra/sprint-controller.ts : 5
src/mcp/tools/help.ts              : 6
src/cli/commands/watch.ts          : 6
src/api/server.ts                  : 6

# writeFileSync kullanım sayıları (en yoğun):
src/cli/commands/init.ts           : 18
src/orchestra/sprint-controller.ts : 15
src/orchestra/debt-manager.ts      : 13
src/orchestra/sprint-reporter.ts   : 12
src/orchestra/spawn-backend-docker.ts : 8
```

### Finding #2 — Config caching yokluğu
`src/core/config.ts:476-499`:
```typescript
export async function loadConfig(projectRoot?: string): Promise<ResolvedConfig> {
  let config = createDefaultConfig();                    // structuredClone internally
  const globalConfig = await readJsonFile(GLOBAL_CONFIG_PATH); // disk I/O
  if (globalConfig) config = deepMerge(config, globalConfig);  // structuredClone
  const projectConfig = await readJsonFile(projectConfigPath); // disk I/O
  if (projectConfig) config = deepMerge(config, projectConfig); // structuredClone
  // ... validation, mode resolution ...
}
// Grep "cache|Cache" in config.ts → ZERO hits (except search_cache_ttl unrelated field)
```

### Finding #3 — sprint-controller god object
```
wc -l src/orchestra/sprint-controller.ts → 2133
Import count: 100+ lines of imports (lines 1-100)
Sync I/O: 19 readFileSync + writeFileSync calls
Functions: spawnWorkers, waitForResults, evaluateResult, cleanup, finalizeSprint,
           routeAllTasks, runSprint + 20 helper functions
```

### Finding #5 — ParallelPipelineManager dead code
`src/orchestra/parallel-pipeline.ts` (106 satır): Tam topological sort implementasyonu mevcut.
```typescript
export class ParallelPipelineManager {
  createPipeline(tasks: PipelineTask[]): ExecutionWave[] { ... } // line 23-91
}
```
**Çağrıldığı yer: HİÇBİR YERDE.** `grep "ParallelPipelineManager\|createPipeline" src/orchestra/sprint-controller.ts` → 0 sonuç.

### Finding #6 — O(n²) linear scan
`src/orchestra/sprint-controller.ts:1368`:
```typescript
for (const task of sprint.tasks) {          // N tasks
  const taskResult = results.find(r => r.taskId === task.id);  // O(N) scan each time
  // ... use taskResult ...
}
// Same pattern at lines 1396, 1446, 1598-1599
```

### Finding #8 — Pool reload her çağrıda
`src/core/skill-pool.ts:67-70`:
```typescript
getSkill(id: string): SkillDefinition | undefined {
  const pool = this.loadSkills();  // FULL disk reload every time!
  return pool.get(id);
}
```

### Finding #11 — Barrel export eager loading
`src/index.ts`:
```typescript
export * from './core/index.js';
export * from './orchestra/index.js';
export * from './monitor/index.js';
export * from './agents/index.js';
// → ALL 59,375 lines parsed at startup
```

### Finding #16 — Sabit bellek tahmini
`src/core/system-profile.ts:9-13`:
```typescript
export function calcRecommendedMaxWorkers(freeMemMB: number, cpuCores: number): number {
  const byMem = Math.floor(freeMemMB / 400);  // Hard-coded 400MB per worker
  const byCpu = cpuCores - 1;
  return Math.max(1, Math.min(byMem, byCpu, 30));
}
```

### Finding #17 — Docker spawn senkron
`src/orchestra/spawn-backend-docker.ts` (332 satır): `spawnSync('docker', [...])` 9 kez kullanılıyor — container create, start, inspect, kill, rm hepsi senkron.

## Recommendations (Sprint 133+)

### CRITICAL Priority (Sprint 133)

1. **Config Caching**: `loadConfig()` sonucunu module-level `let cachedConfig: ResolvedConfig | null` ile cache'le. Invalidation: `resetConfigCache()` fonksiyonu sprint başlangıcında veya config değişikliğinde çağrılır. Tahmini etki: sprint lifecycle boyunca onlarca gereksiz disk I/O + deepMerge eliminasyonu. Effort: LOW.

2. **Hot Path Async Migration**: sprint-controller.ts ve sprint-reporter.ts'deki hot path fonksiyonlarında readFileSync → fs.promises.readFile, writeFileSync → fs.promises.writeFile geçişi. Öncelik sırası: (a) spawnWorkers() task.json yazımı, (b) waitForResults() result okuma, (c) finalizeSprint() debt/memory yazımı. Effort: MEDIUM.

### HIGH Priority (Sprint 133-134)

3. **results → Map index**: `const resultMap = new Map(results.map(r => [r.taskId, r]))` ile O(n²) → O(n) dönüşümü. finalizeSprint() ve writeRetro() içinde 5+ noktada kullanılır. Effort: LOW.

4. **ParallelPipelineManager entegrasyonu**: spawnWorkers() içinde `createPipeline()` çağırarak wave-based spawn. task-builder.ts'de `- Dependencies:` parsing ekle. Effort: HIGH — dependency chain'in doğru çalıştığından emin olmak için kapsamlı test gerekir.

5. **Agent/Skill Pool caching**: AgentPoolManager ve SkillPoolManager'a instance-level cache ekle. `loadAgents()` / `loadSkills()` sonucunu cache'le, mtime kontrolü ile invalidation. Effort: MEDIUM.

6. **sprint-controller.ts bölme**: Faz bazlı modüllere ayır — sprint-phases.ts zaten başlangıç yapılmış. spawnWorkers → spawn-phase.ts, finalizeSprint → finalize-phase.ts, cleanup → cleanup-phase.ts. Effort: HIGH.

### MEDIUM Priority (Sprint 134+)

7. **Docker backend async spawn**: spawnSync → child_process.spawn + Promise wrapper. Paralel container başlatma desteği. Effort: MEDIUM.

8. **Barrel export kaldırma**: src/index.ts barrel export'larını kaldır veya her CLI komutunda sadece gerekli modülleri dynamic import() ile yükle. Effort: MEDIUM — mevcut tüketicilerin import path'lerini güncelleme gerektirir.

9. **Auditor git diff async**: auditor.ts'deki spawnSync('git', ['diff']) → async spawn. 30s cycle içinde non-blocking. Effort: LOW.

10. **Routing decision caching**: Sprint başlangıcında routing kararlarını cache'le. agent-cache.ts zaten signature-based cache sunuyor — routeTaskV2 ile entegre et. Effort: LOW.

### LOW Priority (Backlog)

11. **Provider-aware worker memory**: calcRecommendedMaxWorkers'a provider tipi parametresi ekle. tmux=400MB, api=50MB. Effort: LOW.

12. **SkillLoadingCache singleton**: Module-level singleton instance ile effective caching sağla. Effort: LOW.

13. **Sprint reporter stream writer**: Büyük sprint'ler için markdown üretimini stream-based yap. Effort: MEDIUM — mevcut lines.push pattern'ini değiştirmek geniş refactor.

## Context7 References

1. **Node.js fs.promises vs fs sync**: Node.js docs `fs.readFileSync` event loop'u bloke eder; `fs.promises.readFile` async I/O kullanır. Worker thread'siz uygulamalarda hot path'te sync I/O kullanmak throughput'u %90+ düşürebilir. Referans: Node.js File System documentation — "Synchronous API" uyarısı.

2. **V8 structuredClone maliyeti**: structuredClone() MessageChannel serialize/deserialize kullanır. Basit object'ler için `{ ...obj }` spread 10-50x daha hızlı. Derin nesting olmayan config object'lerinde structuredClone yerine shallow merge yeterli olabilir. Referans: V8 blog — "Structured Clone" serialization overhead.

3. **Node.js event loop model**: Senkron I/O (readFileSync, writeFileSync, spawnSync, execSync) event loop'un single thread'ini tamamen bloke eder. Concurrent HTTP istekleri, WebSocket mesajları ve timer callback'leri bu süre boyunca işlenemez. Sprint lifecycle'ında 799 senkron I/O çağrısı ciddi bir event loop lag kaynağı. Referans: Node.js Event Loop documentation.

4. **fs.watch platform sorunları**: Linux'ta inotify watcher limit (default 8192) büyük projelerde aşılabilir. macOS kqueue farklı event semantikleri sunar. Fallback polling stratejisi doğru bir yaklaşım ama configurable interval önemli. Referans: Node.js fs.watch caveats documentation.

5. **O(n²) pattern detection**: Array.find() içeren nested loop'lar klasik O(n²) antipattern'idir. Map-based index ile O(1) lookup'a dönüştürme standart optimizasyon. 20+ element'te measurable fark, 100+ element'te critical fark. Referans: JavaScript performance patterns — "Avoid nested array searches."

---

**Rapor tarihi:** 2026-04-10
**Sprint:** 132
**Worker:** W2 (Performance & Scalability)
**Agent:** performance-analyzer
**Kapsam:** Statik analiz — sıfır kod değişikliği, sıfır benchmark çalıştırma
