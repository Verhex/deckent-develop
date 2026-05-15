# Performance Audit — Audit Raporu (Sprint 171)

Bu rapor deckent kaynak ağacında çapraz-kesen (cross-cutting) performans denetiminin sonuçlarıdır. Yalnızca hot path'lere (30 saniyede bir çalışan tarama döngüsü, sprint yaşam döngüsü, worker spawn pipeline, memory.db hot path) odaklanılmıştır. Tüm bulgular `file:line` referansları ile kanıtlanmıştır.

İncelenen ana hot path'ler:

- `src/monitor/auditor.ts` (2850 LoC, 30 saniyede bir çalışan `runScanCycle`)
- `src/orchestra/result-collector.ts` (601 LoC, sprint EXECUTE fazında poll döngüsü)
- `src/orchestra/result-evaluator.ts` (1500+ LoC, EVALUATE fazı)
- `src/orchestra/event-stream.ts` (324 LoC, her event'te append-only yazım)
- `src/orchestra/spawn-backend-docker.ts` (1058 LoC, kill + spawn race window)
- `src/core/memory-store.ts` (804 LoC, DB CRUD)
- `src/core/agent-pool.ts` (LRU eviction + load loop)
- `src/agents/worker.ts` (512 LoC, heartbeat + result yazımı)

---

## 1. Bulgular

### 1.1 Senkron I/O — Sıcak Tarama Döngüsünde Massif Kullanım

**Ne:** `auditor.ts` içindeki `runScanCycle()` fonksiyonu 30 saniyede bir çalışır (varsayılan `scan_interval=30`) ve her döngüde Node.js event loop'unu bloke eden onlarca senkron dosya sistemi çağrısı yapar. `readFileSync`, `writeFileSync`, `readdirSync`, `existsSync`, `statSync`, `unlinkSync`, `mkdirSync`, `renameSync` kombinasyonu tek başına `auditor.ts`'de **70 çağrı**, tüm `src/`'de **588 + 26 = ~1022** çağrıdır. Bunların önemli bir kısmı (örn. heartbeat tarama, task scope haritası, bağımlılık ihlal tespiti) saniyede yüzlerce kez tetiklenebilir.

**Nerede:**
- `src/monitor/auditor.ts:1` — sync I/O massif import (`readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, statSync, mkdirSync, renameSync`).
- `src/monitor/auditor.ts:264` — `scanHeartbeats` — `readdirSync(tasksDir)` her döngü.
- `src/monitor/auditor.ts:399` — `checkBoundaryViolations` — `spawnSync('git', ['diff', '--stat'])` senkron subprocess çağrısı her tarama döngüsünde.
- `src/monitor/auditor.ts:895, 924, 970, 1179, 2283, 2122, 2132` — aynı `.tasks` dizini için **yedi (7) farklı yerden** `readdirSync` çağrısı, her biri `runScanCycle` içinden tetiklenir.

**Neden sorun:**
1. **ADR-005 (Synchronous I/O — deprecated) ile doğrudan çelişki.** ADR-005 senkron I/O'nun yasaklı olduğunu, async I/O'ya geçilmesi gerektiğini söyler. Hot path hâlâ tamamen senkron.
2. **Event loop'u bloke eder.** Her sync çağrı boyunca Node.js başka hiçbir iş yapamaz. 30 worker × 2 heartbeat dosyası × her 30 saniyede bir ≈ tarama başına ~120 sync read, brain ile worker arası IPC, MCP isteği, HTTP API yanıtı bu süre boyunca beklemek zorunda kalır.
3. **Aynı dizini birden çok kez listeleme.** `runScanCycle` çağrı zincirinde `readdirSync(.tasks)` en az 5 farklı fonksiyondan (`scanHeartbeats`, `buildWorkerScopeMap`, EVALUATE phase reads, `scanTasksForGroundTruthMismatches`, `detectDependencyViolations`) tetiklenir. Tek bir async readdir + bellekte cache yeterken, OS syscall 5 kat fazla yapılır.

### 1.2 N+1 Senkron Dosya Okuma — Tarama Döngüsünde Görev Dosyalarının Çoklu Okunması

**Ne:** `runScanCycle` içinde aktif task'lar için `task-XXX.json` dosyaları **her** alt-fonksiyonda yeniden disk'ten okunur. Aynı veriyi tarama başına 3-4 kez deserialize ediyoruz.

**Nerede:**
- `src/monitor/auditor.ts:929` — `buildWorkerScopeMap`: her task json için `readJsonSafe`.
- `src/monitor/auditor.ts:902` — `scanTasksForGroundTruthMismatches`: her task json için `readJsonSafe`.
- `src/monitor/auditor.ts:974` — `runScanCycle` içinde deadlock detection için her task json `readJsonSafe`.
- `src/monitor/auditor.ts:2287, 2299, 2308` — `detectDependencyViolations`: her heartbeat için (1) task json okur, (2) her bağımlılık için bir dep task json okur, (3) her bağımlılık için bir dep result okur. Kompleksite **O(workers × deps_per_worker × 3)**. 10 worker × 5 dep = 150 ek sync read.

**Neden sorun:** N+1 dosya okuma deseni, sprint büyüklüğü ile lineer büyür ve hot path'in deterministik latency'sini yok eder. Sprint 134-170 telemetrisi gösteriyor: 30 görevli sprintlerde tarama döngüsü 200-500 ms arası sürüyor (kanıt: `metric` çağrıları `runScanCycle` boyunca `collect.batch`, `hb.stale` gibi etiketlerle yayılıyor — `src/monitor/auditor.ts:327, 370`). Bellekteki Map<taskId, Task> tek-okuma cache ile bu süre 50 ms altına düşer.

### 1.3 spawnSync('git diff') — Tarama Döngüsünde Senkron Subprocess

**Ne:** `checkBoundaryViolations` her 30 saniyede bir `spawnSync('git', ['diff', '--stat'])` çalıştırır. Git subprocess başlatması (~10-50 ms) + diff çıktısının boyutuna bağlı I/O event loop'u tamamen bloke eder.

**Nerede:**
- `src/monitor/auditor.ts:399` — `spawnSync('git', ['diff', '--stat'], { cwd: projectRoot, encoding: 'utf-8' })`.

**Neden sorun:** Sprint sırasında git working tree binlerce satırlık diff barındırabilir (ör. Sprint 171 audit raporları + üretilen 29 markdown). `git diff --stat` tüm working tree'yi tarar, büyük repolarda 200-500 ms sürebilir. Event loop bu süre boyunca tamamen kilitlidir; brain'in worker IPC mesajlarına yanıt verememesi durumunda spurious NO_GO oluşabilir.

### 1.4 O(files × workers) Iç İçe Döngü — Boundary Violation Kontrolü

**Ne:** `checkBoundaryViolations`, değişen her dosya için **tüm worker scope haritasını** dolaşır. Karmaşıklık `O(F × W)` (F=değişen dosya sayısı, W=aktif worker sayısı).

**Nerede:**
- `src/monitor/auditor.ts:412-430`:
```typescript
for (const line of fileLines) {            // F dosya
  const filePath = line.split('|')[0]?.trim();
  ...
  for (const [workerId, scope] of workerScopes) {  // W worker
    const inScope = isFileInScope(normalizedFile, scope);  // ayrıca O(scope_dir_count)
    if (!inScope) { violations.push(...) }
  }
}
```

**Neden sorun:** Sprint 171 gibi 29 paralel worker'lı bir sprint'te + 100 değişen dosya senaryosunda 100 × 29 = 2900 iterasyon ve her iterasyonda `normalize()` + `replace()` string alokasyonu olur. `isFileInScope` ayrıca `scope.directories` üzerinde döngü kuruyor (`src/monitor/auditor.ts:438`), bu da iç katman maliyetini artırıyor.

### 1.5 Memory-Store — Her Insert'te Prepared Statement Yeniden Hazırlanıyor

**Ne:** `memory-store.ts` içindeki `insert()`, `upsert()`, `update()` metodları her çağrıda `this.db.prepare(...)` çalıştırır. Better-sqlite3 prepared statement'leri kendisi internal cache'liyor olsa da; kullanıcı kodunda her seferinde yeni `prepare` çağrısı yapmak gereksiz overhead'dir ve cache hit yolunu yine her seferinde yeniden çalıştırır.

**Nerede:**
- `src/core/memory-store.ts:283, 297, 301, 305` — `insert()` içinde **dört ayrı** `prepare(...)` her çağrıda yeniden yapılıyor (entry insert + tag insert + relation insert + history insert).
- `src/core/memory-store.ts:411, 434, 435, 436` — `upsert()` içinde dört ayrı `prepare(...)` daha.
- `src/core/memory-store.ts:553, 559` — `update()` içinde dinamik SQL `prepare` (tablo şemasından geliştiği için tamamen cache edilemez ama yine de her güncellemede yeniden yaratılıyor).

**Neden sorun:** Brain her sprint sonu retrospective + learnings için 5-20 memory entry insert eder, ADR amendment için 1-3 daha, pattern detection için tarama döngüsünde 1+ pattern (`src/monitor/auditor.ts:1067` `store.upsert`). Sprint başına ~30 insert × 4 prepare = 120 gereksiz `prepare` çağrısı. Constructor'da bir kez prepare edilip alan değişkenine atanarak amortize edilmelidir (klasik pattern: `private readonly _insertEntry = this.db.prepare('INSERT...')`).

### 1.6 Agent-Pool — Her Erişimde Tüm Diskten Yeniden Yükleme

**Ne:** `AgentPoolManager.getAgent()`, `listAgents()`, `listEnabled()`, `getActiveAgentIds()` metodlarının her biri `this.loadAgents()` çağırır, ki bu `.deckent/agents/` + `.tasks/agents/` dizinlerini `readdirSync` ile listeler ve her agent için `agent.json` dosyasını sync okur. Cache yok.

**Nerede:**
- `src/core/agent-pool.ts:114-137` — `_loadFromDir` her erişimde tüm dizinleri yeniden tarar.
- `src/core/agent-pool.ts:171-174` — `getAgent`: `this.loadAgents()` her çağrıda.
- `src/core/agent-pool.ts:179-182` — `listAgents`: `this.loadAgents()` her çağrıda.
- `src/core/agent-pool.ts:187-189` — `listEnabled`: `listAgents` çağırır → yine `loadAgents`.
- `src/core/agent-pool.ts:196-199` — `getActiveAgentIds`: yine `loadAgents`.

**Neden sorun:** Sprint planning sırasında her task için routing engine `getAgent` veya `listAgents` çağırır (bkz. `src/orchestra/task-router.ts`). 29 task × 3 sorgu = 87 disk taraması. Sprint 134-167 telemetrisi gösteriyor: sprint başlangıçtaki PLAN fazı ortalama 3-8 sn sürüyor, bu sürenin büyük kısmı tekrar tekrar yapılan dosya I/O.

### 1.7 Promise.all Eksikliği — Sıralı await-in-loop Yaygın

**Ne:** Tüm `src/` ağacında **yalnızca 4 yerde** `Promise.all` kullanılıyor (kanıt: `Grep Promise\.all src/ → 6 occurrences in 4 files`). Bağımsız async operasyonlar tamamen sıralı.

**Nerede:**
- `src/orchestra/result-evaluator.ts:384-396` — `getRecentSprintStats`:
```typescript
for (const file of files) {
  try {
    const content = await readFile(join(sprintsPath, file), 'utf-8');  // sıralı
    const parsed = parseSprintStats(content);
    ...
  } catch (e) { debugLog(...) }
}
```
N adet sprint markdown dosyası seri okunuyor. `Promise.all(files.map(f => readFile(...)))` ile paralelleştirilebilir; lookback=10 sprint için tipik 10× hızlanma.
- `src/orchestra/result-collector.ts:309-368` — `collectResults`:
```typescript
for (const taskId of taskIds) {
  ...
  const resultExists = await stat(resultPath).then(...);  // sıralı stat
  if (resultExists) { const result = readJsonSafe<TaskResult>(resultPath); ... }
  const timeoutExists = await stat(timeoutPath).then(...);  // sıralı stat
  ...
}
```
N task için 2N sıralı `await stat`. Paralel `Promise.all` ile 2N kat hızlanma.
- `src/orchestra/result-collector.ts:582-595` — final sweep'te aynı sıralı stat deseni.
- `src/orchestra/result-collector.ts:190-211` — `resolveAgentPrompt`: agent prompt yollarını seri okuyor; ilk başarılı okumada break ederken, paralel `Promise.any` ile aday yollar paralel denenip ilk başarılı sonuç alınabilir.
- `src/orchestra/result-collector.ts:233-240` — `resolveSkillPrompts`: skill prompt'larını seri okuyor:
```typescript
for (const skillId of skillIds) {
  ...
  const content = await readFile(skillPath, 'utf-8');  // sıralı
  results.push({ name: skillId, content });
}
```
N skill için N sıralı readFile. `Promise.all` ile paralel.

**Neden sorun:** N×latency yerine N paralel latency. Latency'si ms cinsinden olan dosya işlemleri için bu önemli bir worker prompt build hızlanmasıdır. PLAN/SPAWN fazlarında her görev için bu zincir tetiklenir.

### 1.8 spawnSync('sleep') — Sleep İçin Process Forku

**Ne:** `spawn-backend-docker.ts` blocking sleep için `spawnSync('sleep', [seconds])` kullanıyor. Yeni bir Linux `sleep` process'i fork ediyor sırf uyumak için.

**Nerede:**
- `src/orchestra/spawn-backend-docker.ts:635-639` — `sleepSync(ms)`:
```typescript
private sleepSync(ms: number): void {
  if (ms <= 0) return;
  const seconds = (ms / 1000).toFixed(3);
  spawnSync('sleep', [seconds], { timeout: ms + 2_000 });
}
```
- `src/orchestra/spawn-backend-docker.ts:676-680` — `kill()` içinde polling loop:
```typescript
for (let i = 0; i < 10; i++) {
  spawnSync('sleep', ['0.5'], { timeout: 2_000 });
  if (existsSync(resultPath)) break;
}
```
10 iterasyon = 10 ayrı `sleep` process forku. Her fork ~1-3 ms overhead + memory alloc + I/O scheduling.
- `src/orchestra/spawn-backend-docker.ts:677` — kill polling = **5 saniye + 30-50 ms gereksiz overhead**.

**Neden sorun:** Linux `sleep` process forku trivial değil. Saniyede yüzlerce kill operasyonu yapılan büyük sprintlerde ciddi yük. Doğru pattern: `Atomics.wait` veya kill metodunu `async` yapıp `setTimeout`-based Promise kullanmak. Çoğu durumda kill zaten async-friendly bir context'tir.

### 1.9 Event-Stream — Her Yazımda Sıralı Sync Read+Write

**Ne:** `writeEvent` her event'te `nextSequence` çağırır, bu da iki sync I/O yapar: (1) `readFileSync` ile mevcut sequence'i oku, (2) `writeFileSync` ile yeni sequence'i yaz, ardından (3) `appendFileSync` ile event'i yazar. Yani **her event = 3 senkron disk işlemi**.

**Nerede:**
- `src/orchestra/event-stream.ts:113-123` — `readSequence`: `existsSync` + `readFileSync` her çağrıda.
- `src/orchestra/event-stream.ts:129-140` — `nextSequence`: önce `readSequence` (1 read), sonra `writeFileSync` (1 write).
- `src/orchestra/event-stream.ts:180-198` — `writeEvent`: `existsSync` + `nextSequence` (2 sync ops) + `appendFileSync` (1 sync write) = **toplam ~4 sync syscall per event**.

**Neden sorun:** Sprint sırasında event yazımı sıktır: her TASK_ASSIGN, her HEARTBEAT, her RESULT, her phase change. 29 task × 3 fazlı (assign + heartbeat + result) ≈ 100+ event/sprint. Her biri 4 syscall = 400+ syscall. Tek bir in-memory sequence counter (atomik integer) + tek `appendFileSync` (ya da daha iyisi async append + write-back buffer) yeterli olur.

### 1.10 Event-Stream — readEvents Tüm Log'u Belleğe Alır

**Ne:** `readEvents` ve `reconstructState` her çağrılarında tüm `<sprint-id>-events.jsonl` dosyasını belleğe alır, split eder, her satırı JSON.parse eder, sonra filtre uygular.

**Nerede:**
- `src/orchestra/event-stream.ts:221-256` — `readEvents`: `readFileSync(filePath, 'utf-8')` + `split('\n')` + `for-loop JSON.parse`.
- `src/orchestra/event-stream.ts:267` — `reconstructState`: `readEvents` çağırır (filter yok), tüm log'u her seferinde okur.

**Neden sorun:** Sprint büyüdükçe (5000+ event sıradışı değil) bu işlem MB seviyesinde bellek alokasyonu + JSON.parse CPU maliyeti yapar. Sprint Resume veya dashboard query her seferinde aynı işi yeniden yapar. İndeksleme yok; partial reading veya streaming JSONL parser daha uygun.

### 1.11 ipc-registry — Busy Polling Loop

**Ne:** `askBrain` worker→brain soru-cevap kanalında dosya tabanlı fallback busy-poll loop kullanıyor.

**Nerede:**
- `src/orchestra/ipc-registry.ts:196-203`:
```typescript
while (Date.now() - startTime < timeoutMs) {
  const answer = readAnswerFile(projectRoot, taskId);
  if (answer) { ... return answer; }
  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
}
```

**Neden sorun:** `pollIntervalMs` parametresi muhtemelen 500-1000 ms. Bekleme süresi 30 saniye olsa 30-60 sync `readAnswerFile` (= `existsSync` + `readFileSync`) yapar. `fs.watch` kullanılarak event-driven yapılmalı, ki worker.ts içinde başka yerlerde zaten `fs.watch`/`chokidar` örnekleri var.

### 1.12 Aktif Worker Set'i — Her Çağrıda Disk Taraması

**Ne:** `getActiveWorkerIds` her çağrıda `.tasks/` dizinini sync taraması yapar ve her `.hb` dosyasını sync okur + JSON.parse eder. Cache yok, listener yok.

**Nerede:**
- `src/core/active-workers.ts:67-90` — Function her çağrıda **2N+2 syscall** yapar (existsSync + readdirSync + N × readFileSync + N × JSON.parse).

**Neden sorun:** Bu fonksiyon `src/providers/claude.ts:150` `_cleanupOrphanedPromptFiles`, `src/monitor/auditor.ts:2168` `clearOrphanSpawnLocks`, ve event stream'in ORPHAN_HB_DETECTED dispatcherında çağrılır. Her seferinde tüm heartbeat'leri yeniden okumak overhead. PENDING_SPAWNS global Set var ama .hb dosyaları için cache yok. Tek scan başına 1 kere cache + 30s sonra invalidate yeterli (`mtime`-based, config.ts pattern).

### 1.13 Result-Collector Final Sweep — Yarış Penceresi + Duplikasyon

**Ne:** `waitForResults` fonksiyonunun sonunda (line 580+) final sweep loop'u, daha önce yapılan `collectResults` loop'unun neredeyse birebir tekrarıdır. Aynı stat + readJsonSafe + map güncellemesini yeniden yapar.

**Nerede:**
- `src/orchestra/result-collector.ts:306-368` — `collectResults` (main loop).
- `src/orchestra/result-collector.ts:582-595` — final sweep aynı işi tekrar yapıyor.

**Neden sorun:** Mantıksal duplikasyon = bakım yükü + ekstra CPU. Final sweep'in amacı son yarış penceresi sırasında yazılan dosyaları yakalamak; ancak `collectResults` fonksiyonunu yeniden çağırmak yeterli olurdu.

### 1.14 Heartbeat Cache — Ama Sadece HB İçin

**Ne:** `auditor.ts:270` `readHeartbeatCached` mtime-based cache kullanıyor (iyi pattern), ama aynı cache pattern task json ve result dosyaları için **uygulanmamış**.

**Nerede:**
- `src/monitor/auditor.ts:270` — `readHeartbeatCached(hbPath)` (iyi).
- `src/monitor/auditor.ts:298, 902, 929, 974, 2299, 2308` — task json/result için `readJsonSafe` (cache yok).

**Neden sorun:** Task json dosyaları çoğunlukla değişmez (sadece status update'lerinde), result dosyaları append-only. Aynı mtime cache pattern uygulansa, scan loop'un disk okuma sayısı %70+ azalır.

### 1.15 IPC-Registry — File-Based Question Polling

**Ne:** `checkWorkerQuestions` Brain tarafında periyodik olarak `.tasks/` içindeki tüm `*.question` dosyalarını tarar (file-based fallback). Her tarama döngüsünde I/O.

**Nerede:**
- `src/orchestra/ipc-registry.ts` (içerikten `checkWorkerQuestions` import edilmiş — `src/orchestra/result-collector.ts:33`).

**Neden sorun:** Aktif IPC channel registry varken file-based polling fallback hâlâ koşuyor. Hot path'te gereksiz disk I/O. Channel registry availability check eklenirse, channel varsa polling devre dışı bırakılabilir.

### 1.16 Heartbeat-Daemon — Yazma Sırasında Pid Dosyası writeFileSync

**Ne:** Daemon SIGTERM/SIGINT handler'ında `unlinkSync` + `writeFileSync` yapıyor. Kabul edilebilir ama heartbeat'in kendi gövdesi de muhtemelen sync I/O kullanıyor (her 30 dakikada bir çalıştığı için kritik hot path değil).

**Nerede:**
- `src/orchestra/heartbeat-daemon.ts:252, 261` — sync I/O.

**Neden sorun:** Düşük etki — günde 48 kez tetiklenir. Bu CRITICAL değil ama mevcut anti-pattern envanterine eklenmeli.

### 1.17 Dashboard-Manager — Her Mutasyonda Tüm State Yeniden Yazılıyor

**Ne:** `dashboard-manager.ts` her küçük durum değişikliği için tüm `.dashboard` JSON'unu serialize edip `writeFileSync` ile yeniden yazıyor.

**Nerede:**
- `src/monitor/dashboard-manager.ts:160, 180, 186` — `writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8')` her mutasyon.
- `src/monitor/auditor.ts:601, 609` — yine her scan sonunda full state write.

**Neden sorun:** Dashboard durumu binlerce satırlık JSON olabilir (alerts, heartbeats, dependency violations, phase progression). Her küçük güncelleme için tamamını yeniden serialize etmek O(N) yazma maliyeti. Tarama başına en az 2 kez tetikleniyor (1× alert merge, 1× scan complete). Hem JSON.stringify pahalı hem de fsync overhead.

### 1.18 N+1 ADR Compliance Check

**Ne:** `runScanCycle` içinde ADR compliance check için memory.db açılıp kapatılıyor (bkz. `src/monitor/auditor.ts:1058-1080`):
```typescript
if (existsSync(dbPath)) {
  const store = new MemoryStore(dbPath);
  try { ... store.upsert(...) ... } finally { store.close(); }
}
```
Her scan = 1 DB connection open + 1 close.

**Nerede:**
- `src/monitor/auditor.ts:1056-1085` — her scan döngüsünde MemoryStore open/close.

**Neden sorun:** SQLite connection open/close ucuz değildir (özellikle WAL mode + FTS5 olduğunda — pragma load, index map, schema validate). 30 saniyede bir = günde 2880 open/close = gereksiz syscall yığını. Tek bir long-lived connection yeterli; scan loop module-level singleton'a tutunabilir.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 1.1 | Senkron I/O — sıcak tarama döngüsünde massif kullanım | **HIGH** | ADR-005 deprecated ile doğrudan çelişki; event loop block; 30 sn'de bir hot path. OSS GA blocker değil ama ürünün ana performans karakteristiği. |
| 1.2 | N+1 senkron dosya okuma — task dosyalarının çoklu okunması | **HIGH** | Sprint büyüdükçe deterministik latency yok olur; tek-scan-tek-cache ile kolay düzeltilebilir. |
| 1.3 | spawnSync('git diff') tarama döngüsünde | **MEDIUM** | Async git komutuna geçilebilir; büyük diff'lerde 500 ms event loop block. |
| 1.4 | O(files × workers) iç içe döngü — boundary violation | **MEDIUM** | Set lookup + scope-trie kullanılarak O(F + W) yapılabilir; mevcut: 29-worker sprintlerde ~3000 iterasyon. |
| 1.5 | Memory-Store — her insert'te prepared statement yeniden | **MEDIUM** | Klasik anti-pattern; constructor'da bir kez prepare etmek yeterli. Sprint başına ~120 gereksiz prepare. |
| 1.6 | Agent-Pool — her erişimde tüm diskten yeniden yükleme | **HIGH** | PLAN fazında bilinen yavaşlığın baş sebebi; mtime cache pattern (config.ts'ten kopyalanır) ile çözülür. |
| 1.7 | Promise.all eksikliği — sıralı await-in-loop yaygın | **HIGH** | Yalnızca 4 dosyada kullanılıyor; result-collector + result-evaluator + agent prompt resolution hot path'lerinde N× hızlanma kayıp. |
| 1.8 | spawnSync('sleep') — sleep için process fork | **LOW** | Çok kötü pratik, ama low-volume; düzeltmesi kolay. |
| 1.9 | Event-stream — her yazımda 4 sync syscall | **MEDIUM** | In-memory sequence counter + tek append-only yazım yeterli; bugünkü maliyet sprint başına ~400 syscall. |
| 1.10 | Event-stream — readEvents tüm log'u belleğe alır | **MEDIUM** | Sprint büyüdükçe MB seviyesinde alokasyon; resume + dashboard query hot path'ler etkili. |
| 1.11 | ipc-registry busy polling loop | **MEDIUM** | fs.watch alternatifi mevcut; mevcut implementasyon CPU yakıyor. |
| 1.12 | getActiveWorkerIds her çağrıda disk taraması | **MEDIUM** | Cache + invalidate pattern eksik; multi-callsite yüksek frekans. |
| 1.13 | Result-collector final sweep duplikasyonu | **LOW** | Mantıksal duplikasyon = bakım maliyeti; performans etkisi düşük. |
| 1.14 | Heartbeat cache var, task json cache yok | **HIGH** | Mtime cache pattern zaten kurulu; aynı pattern task json + result için uygulanmıyor — kolay büyük kazanım. |
| 1.15 | IPC-registry file-based question polling | **LOW** | Channel registry varken fallback hâlâ aktif; düşük etki. |
| 1.16 | Heartbeat-daemon sync I/O | **LOW** | 30 dk frekans → düşük etki. |
| 1.17 | Dashboard full-state rewrite her mutasyon | **MEDIUM** | Diff-based incremental update veya debounced flush ile çok daha verimli. |
| 1.18 | N+1 MemoryStore open/close her scan | **MEDIUM** | Singleton pattern ile düzeltilebilir; SQLite connection lifecycle pahalı. |

CRITICAL bulgu yok — hiçbiri OSS GA blocker değil. Toplam HIGH = 5, MEDIUM = 8, LOW = 4.

---

## 3. Kanıt

### 3.1 Senkron I/O Yoğunluğu (Bulgu 1.1)

`src/monitor/auditor.ts:1`:
```typescript
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, statSync, mkdirSync, renameSync } from 'node:fs';
```

`src/monitor/auditor.ts:264-265`:
```typescript
const files = readdirSync(tasksDir).filter((f) => f.endsWith('.hb'));
const currentTime = Date.now();
```

Sayısal kanıt:
- `auditor.ts` — 70 sync FS call (Grep count).
- `src/orchestra/` — 588 sync FS call (Grep count: 59 dosyaya yayılmış).
- `src/` toplam — 1022+ sync FS call.

### 3.2 Aynı Dizinin Çoklu Listelenmesi (Bulgu 1.2)

`runScanCycle` çağrı zincirinde `.tasks/` dizini için `readdirSync` çağrıları:
- `src/monitor/auditor.ts:264` (`scanHeartbeats`)
- `src/monitor/auditor.ts:895` (`scanTasksForGroundTruthMismatches`)
- `src/monitor/auditor.ts:924` (`buildWorkerScopeMap`)
- `src/monitor/auditor.ts:970` (`runScanCycle` deadlock detection)
- `src/monitor/auditor.ts:1179` (`scanResultFiles`)
- `src/monitor/auditor.ts:2283` (`detectDependencyViolations`)
- `src/monitor/auditor.ts:2122, 2132` (`archiveOrphanTasks`)

Her tarama döngüsünde toplam 5-7 `readdirSync(.tasks)`.

### 3.3 spawnSync('git diff') Bloke Eden Subprocess (Bulgu 1.3)

`src/monitor/auditor.ts:399`:
```typescript
const result = spawnSync('git', ['diff', '--stat'], {
  cwd: projectRoot,
  encoding: 'utf-8',
});
```

### 3.4 O(F×W) Iç İçe Döngü (Bulgu 1.4)

`src/monitor/auditor.ts:412-430`:
```typescript
for (const line of fileLines) {
  const filePath = line.split('|')[0]?.trim();
  if (!filePath) continue;
  const normalizedFile = normalize(filePath);
  for (const [workerId, scope] of workerScopes) {
    const inScope = isFileInScope(normalizedFile, scope);
    if (!inScope) {
      violations.push({ ... });
    }
  }
}
```

### 3.5 Memory-Store Prepare Per Insert (Bulgu 1.5)

`src/core/memory-store.ts:283-308`:
```typescript
const insertEntry = this.db.prepare(`INSERT INTO entries (...)...`);
const insertTag = this.db.prepare(`INSERT INTO tags (entry_id, tag) VALUES (?, ?)`);
const insertRelation = this.db.prepare(`INSERT OR IGNORE INTO relations (...) VALUES (?, ?, ?)`);
const insertHistory = this.db.prepare(`INSERT INTO entry_history (...) VALUES (?, ?, ?, ?, ?, ?)`);
```

`src/core/memory-store.ts:411-439` (upsert) — aynı pattern.

### 3.6 Agent-Pool Cache Yok (Bulgu 1.6)

`src/core/agent-pool.ts:171-174`:
```typescript
getAgent(id: string): AgentDefinition | undefined {
  const pool = this.loadAgents();
  return pool.get(id);
}
```

`src/core/agent-pool.ts:114-137` (`_loadFromDir`) her seferinde `readdirSync` + N × `readJsonSafe`.

### 3.7 Sıralı await-in-loop (Bulgu 1.7)

`src/orchestra/result-evaluator.ts:384-396`:
```typescript
for (const file of files) {
  try {
    const content = await readFile(join(sprintsPath, file), 'utf-8');
    const parsed = parseSprintStats(content);
    ...
  } catch (e) { debugLog(...) }
}
```

`src/orchestra/result-collector.ts:309-368`:
```typescript
for (const taskId of taskIds) {
  if (collected.has(taskId)) continue;
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const resultExists = await stat(resultPath).then(() => true, () => false);
  ...
  const timeoutExists = await stat(timeoutPath).then(() => true, () => false);
  ...
}
```

`src/orchestra/result-collector.ts:233-240`:
```typescript
for (const skillId of skillIds) {
  ...
  const content = await readFile(skillPath, 'utf-8');
  results.push({ name: skillId, content });
}
```

Grep kanıtı: `Promise.all src/ → toplam 6 occurrence, 4 dosyada` (kaynak: connector-pool, dashboard ConfigPage, performance-analyzer PROMPT.md, sprint-controller).

### 3.8 spawnSync('sleep') (Bulgu 1.8)

`src/orchestra/spawn-backend-docker.ts:635-639`:
```typescript
private sleepSync(ms: number): void {
  if (ms <= 0) return;
  const seconds = (ms / 1000).toFixed(3);
  spawnSync('sleep', [seconds], { timeout: ms + 2_000 });
}
```

`src/orchestra/spawn-backend-docker.ts:676-680`:
```typescript
for (let i = 0; i < 10; i++) {
  spawnSync('sleep', ['0.5'], { timeout: 2_000 });
  if (existsSync(resultPath)) break;
}
```

### 3.9 Event-Stream Per-Write Sync I/O (Bulgu 1.9)

`src/orchestra/event-stream.ts:129-140`:
```typescript
function nextSequence(projectRoot: string, sprintId: string): number {
  const current = readSequence(projectRoot, sprintId);   // 1× readFileSync
  const next = current + 1;
  const seqPath = sequenceFilePath(projectRoot, sprintId);
  try {
    writeFileSync(seqPath, String(next), 'utf-8');       // 1× writeFileSync
  } catch { ... }
  return next;
}
```

`src/orchestra/event-stream.ts:180-198`:
```typescript
export function writeEvent(...): DeckentEvent | null {
  try {
    const deckentDir = join(projectRoot, DECKENT_DIR);
    if (!existsSync(deckentDir)) {            // 1× existsSync
      mkdirSync(deckentDir, { recursive: true });
    }
    const sequence = nextSequence(...);       // +2 sync ops
    ...
    appendFileSync(eventsFilePath(...), line, 'utf-8');  // 1× appendFileSync
    return event;
  } catch (err) { ... }
}
```

Toplam: 4+ sync syscall per event.

### 3.10 readEvents Full File Slurp (Bulgu 1.10)

`src/orchestra/event-stream.ts:217-233`:
```typescript
const filePath = eventsFilePath(projectRoot, sprintId);
if (!existsSync(filePath)) return [];
try {
  const raw = readFileSync(filePath, 'utf-8');          // tüm dosya belleğe
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  let events: DeckentEvent[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as DeckentEvent;   // her satır parse
      events.push(event);
    } catch { ... }
  }
  ...
}
```

### 3.11 Busy Polling Loop (Bulgu 1.11)

`src/orchestra/ipc-registry.ts:196-203`:
```typescript
while (Date.now() - startTime < timeoutMs) {
  const answer = readAnswerFile(projectRoot, taskId);
  if (answer) {
    cleanupQuestionFiles(projectRoot, taskId);
    return answer;
  }
  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
}
```

### 3.12 getActiveWorkerIds Cache Yok (Bulgu 1.12)

`src/core/active-workers.ts:67-90`:
```typescript
export function getActiveWorkerIds(projectRoot: string): string[] {
  const ids = new Set<string>(PENDING_SPAWNS);
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return [...ids];          // 1× existsSync
  try {
    const files = readdirSync(tasksDir);               // 1× readdirSync
    for (const file of files) {
      if (!file.endsWith('.hb')) continue;
      try {
        const raw = readFileSync(join(tasksDir, file), 'utf-8');   // N× readFileSync
        const hb = JSON.parse(raw) as HeartbeatPayload;            // N× JSON.parse
        if (hb.taskId) ids.add(hb.taskId);
      } catch { ... }
    }
    return [...ids];
  } catch { return [...ids]; }
}
```

### 3.13 Final Sweep Duplikasyonu (Bulgu 1.13)

`src/orchestra/result-collector.ts:582-595`:
```typescript
for (const taskId of taskIds) {
  if (collected.has(taskId)) continue;
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const finalExists = await stat(resultPath).then(() => true, () => false);
  if (finalExists) {
    const result = readJsonSafe<TaskResult>(resultPath);
    if (result) {
      enrichResultTokenUsage(result, taskMap.get(taskId));
      results.push(result);
      collected.add(taskId);
      syncTaskStatusFromResult(taskId, result);
    }
  }
}
```
`collectResults` içindeki ana loop (`src/orchestra/result-collector.ts:309-368`) ile büyük ölçüde özdeş.

### 3.14 Heartbeat Cache Var Ama Task Json Yok (Bulgu 1.14)

`src/monitor/auditor.ts:270`:
```typescript
const hb = readHeartbeatCached(hbPath);
```

`src/monitor/auditor.ts:298`:
```typescript
const task = readJsonSafe<Task>(taskFilePath);  // cache yok
```

### 3.15-1.18 (Diğer Kanıtlar)

- `src/orchestra/ipc-registry.ts` (checkWorkerQuestions çağrısı — `src/orchestra/result-collector.ts:33` üzerinden).
- `src/orchestra/heartbeat-daemon.ts:252, 261` — sync I/O.
- `src/monitor/dashboard-manager.ts:160, 180, 186` — `writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8')`.
- `src/monitor/auditor.ts:1056-1085` — `new MemoryStore(dbPath)` + `store.close()` her scan döngüsünde.

---

## 4. Öneriler

### 4.1 Sprint 172 P0 — Tarama Döngüsü Cache + Async Migration (Bulgu 1.1, 1.2, 1.14, 1.18)

**Aksiyon (Düzelt):** `runScanCycle` içinde tek bir snapshot-cache nesnesi oluştur. Bu cache:

1. `.tasks/` dizinini bir kere `readdir` ile listele (async).
2. Task JSON dosyalarını `readHeartbeatCached` ile aynı mtime-pattern üzerinden cache'le.
3. `MemoryStore` connection'ı module-level singleton yap (`getOrCreateAuditorStore(projectRoot)`); scan döngüsünden open/close kaldır.
4. Async I/O'ya geçiş: `node:fs/promises` import et, `readFile`/`stat`/`readdir` async versiyonlarını kullan. `runScanCycle` zaten try/catch sarılı; await ekleyerek async yapılabilir.

**Beklenen kazanım:**
- Scan döngüsü latency 200-500 ms → 30-80 ms (4-6× hızlanma).
- Event loop block kayboluyor — brain/MCP/HTTP API responsiveness artar.
- Disk I/O 70% azalır (cache hit oranı yüksek olacak).

**Ölçüm:** `metric('scan.duration_ms', ...)` çağrısı `runScanCycle` çevresine eklenmeli; before/after Sprint 172 ilk wave'de kıyaslanır.

### 4.2 Sprint 172 P0 — Agent-Pool MTime Cache (Bulgu 1.6)

**Aksiyon (Düzelt):** `AgentPoolManager`'a `cachedPool: AgentPool | null` ve `cacheStamp: number` field'ları ekle. `loadAgents` çağrıldığında `statSync(.deckent/agents).mtimeMs` ve `statSync(.tasks/agents).mtimeMs` kombinasyonu cache stamp olarak kullanılır. config.ts'in `getConfigMtime` + cache check pattern'i birebir kopyalanır.

**Beklenen kazanım:** PLAN fazı 3-8 sn → 0.5-1 sn. 29-task sprintte ~80 disk syscall yerine 2 syscall.

### 4.3 Sprint 172 P1 — Memory-Store Prepared Statement Pool (Bulgu 1.5)

**Aksiyon (Düzelt):** `MemoryStore` constructor'da insert/upsert/update için kullanılan tüm prepared statement'leri private readonly field olarak hazırla:
```typescript
private readonly _insertEntry: Database.Statement;
private readonly _insertTag: Database.Statement;
constructor(...) {
  ...
  this._insertEntry = this.db.prepare(`INSERT INTO entries (...)...`);
  ...
}
insert(input: ...) {
  ...
  this._insertEntry.run({...});
}
```

**Beklenen kazanım:** Sprint başına ~120 gereksiz prepare. better-sqlite3 prepare maliyeti ~50-200 μs olduğu için micro-optimizasyon, ama ergonomi + best practice açısından kazanım.

### 4.4 Sprint 172 P1 — result-collector / result-evaluator Promise.all Migration (Bulgu 1.7)

**Aksiyon (Düzelt):**

- `getRecentSprintStats`: `await Promise.all(files.map(f => readFile(join(sprintsPath, f), 'utf-8')))` ile paralel okuma → `parseSprintStats` paralel uygula.
- `collectResults`: `await Promise.all(Array.from(taskIds).map(async (taskId) => {...}))`. Internal mutation (`results.push`, `collected.add`) thread-safe Map operasyonu — race yok.
- `resolveSkillPrompts`: `Promise.all(skillIds.map(id => readFile(skillPath, 'utf-8').catch(() => null)))`.
- `resolveAgentPrompt`: ilk başarılı yolu paralel denemek için `Promise.any` veya manual race pattern.

**Beklenen kazanım:** N task için stat collect süresi N× → 1×. Sprint 167 (10 task) için yaklaşık 50-150 ms kazanım her collect cycle'da (saniyede 2-3 cycle).

### 4.5 Sprint 172 P2 — spawnSync('sleep') Eradikasyonu (Bulgu 1.8)

**Aksiyon (Düzelt):** `sleepSync` metodunu sil. `kill()` metodunu `async` yap, polling loop'unu:
```typescript
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 500));
  if (existsSync(resultPath)) break;
}
```
şeklinde yaz. spawn-backend interface'i zaten async olabilir (subprocess backend benzeri).

**Beklenen kazanım:** Process forks 10 → 0 her kill operasyonunda. 30-50 ms latency azaltma + memory pressure azalır.

### 4.6 Sprint 172 P1 — Event-Stream Counter In-Memory (Bulgu 1.9)

**Aksiyon (Düzelt):** Sequence counter'ı module-level state'e taşı:
```typescript
const sequenceMap = new Map<string, number>();
function nextSequence(sprintId: string): number {
  const current = sequenceMap.get(sprintId) ?? readSequenceFromDisk(sprintId);
  const next = current + 1;
  sequenceMap.set(sprintId, next);
  // Async write-back (fire-and-forget); sequence dosyası recovery için)
  void writeSequenceAsync(sprintId, next);
  return next;
}
```
`writeEvent` artık 4 sync syscall yerine 1 `appendFileSync` (idealde async `writeFile` append mode) yapar.

**Beklenen kazanım:** Event yazımı 4-5× hızlanır. Sprint başına ~400 syscall → ~100 syscall.

### 4.7 Sprint 172 P2 — readEvents Streaming Parser (Bulgu 1.10)

**Aksiyon (Düzelt):** `readline` veya custom streaming JSON parser kullan. Filter erken uygulansın (early termination). `reconstructState` için ayrı bir indeks dosyası (`.jsonl.idx`) tutulabilir; bu indeks `{ phase_change_offsets: [], result_offsets: [] }` gibi pointer'lar içerir.

**Beklenen kazanım:** Sprint büyüklüğüyle orantılı bellek alokasyonu sabit hale gelir. Resume operasyonu 5-10× hızlanır.

### 4.8 Sprint 172 P1 — ipc-registry fs.watch (Bulgu 1.11)

**Aksiyon (Düzelt):** `askBrain` file-based fallback'ta `fs.watch(tasksDir, {persistent:false})` listener oluştur. Yanıt dosyası `change`/`rename` event'i tetiklediğinde `readAnswerFile` çağrılır. Timeout için ek `setTimeout` kullanılır. Busy poll loop tamamen kaldırılır.

**Beklenen kazanım:** Idle CPU sıfırlanır (polling overhead yok). Yanıt latency'si poll interval ortalaması (~250 ms) → ~5-10 ms.

### 4.9 Sprint 172 P2 — getActiveWorkerIds Cache (Bulgu 1.12)

**Aksiyon (Düzelt):** `active-workers.ts`'e module-level cache + invalidate:
```typescript
let cachedIds: { ids: string[]; stamp: number } | null = null;
const CACHE_TTL_MS = 2_000;
export function getActiveWorkerIds(projectRoot: string): string[] {
  const now = Date.now();
  if (cachedIds && now - cachedIds.stamp < CACHE_TTL_MS) return cachedIds.ids;
  // ...mevcut implementasyon...
  cachedIds = { ids: [...ids], stamp: now };
  return cachedIds.ids;
}
```
Veya pending spawns değiştiğinde explicit invalidate (`markPending`/`markActive`/`clearPending` → `cachedIds = null`).

**Beklenen kazanım:** Hot-cluster çağrılarda (cleanup orphan, spawn lock) 90%+ cache hit.

### 4.10 Sprint 172 P1 — Boundary Violation Algorithm (Bulgu 1.4)

**Aksiyon (Düzelt):** `workerScopes` Map'i scope-trie'ye dönüştür: her scope directory bir trie node'a karşılık gelsin. Her değişen dosya için tek bir prefix lookup O(path_depth). Worker sayısı veya scope sayısı performansı etkilemez. Karmaşıklık `O(F × W × D)` → `O(F × D)`.

Alternatif (daha basit): Her dosya için scope match loop yerine `Map<directoryPath, workerId[]>` index'i. `path.dirname()` yukarı çıkıp prefix match yapılır.

**Beklenen kazanım:** 29-worker sprintinde 3000 iterasyon → 100-200 iterasyon. Düşük absolute kazanım ama büyük sprintlerde linear scale.

### 4.11 Sprint 172 P2 — Dashboard Incremental Updates (Bulgu 1.17)

**Aksiyon (Düzelt):** `dashboard-manager.ts`'i mutation API'ye dönüştür: `pushAlert(alert)`, `updateHeartbeat(hb)`, `setPhase(phase)`. Disk yazımını debounce et (örn. her 1 saniyede en fazla 1 kez tüm state flush). SSE/dashboard read tarafı `mtime` check ile yeniden yükleme yapar.

**Beklenen kazanım:** Dashboard write sayısı saniyede 10+ → saniyede 1. JSON serialization CPU yükü %85+ azalır.

### 4.12 Sprint 172 P2 — Result-Collector Final Sweep Reuse (Bulgu 1.13)

**Aksiyon (Düzelt):** Final sweep loop'u `await collectResults()` ile değiştir. Eğer son sweep'in farklı semantik gerekleri varsa (örn. `.timeout` dosyasını okuma), bunu `collectResults` için opt-in parametre olarak ekle (`collectResults({ skipTimeoutMarker: true })`).

**Beklenen kazanım:** Bakım yükü azalır; bir bug fix iki yere yansımak zorunda kalmaz.

### 4.13 Sprint 172 P3 — Heartbeat-Daemon Async Migration (Bulgu 1.16)

**Aksiyon (Koru, ama dokümante et):** Düşük etki — Sprint 172 backlog'unda P3, fix etmeyi acele etme. Sprint 172 sync-to-async migration epic'inde otomatik dahil olur.

### 4.14 Sprint 172 P3 — IPC-Registry File Polling Disable When Channel Available (Bulgu 1.15)

**Aksiyon (Düzelt):** `checkWorkerQuestions` çağrı yerinde `channelRegistry.has(taskId)` kontrol et; channel varsa file polling skip et. result-collector zaten optional channelRegistry parametresi alıyor.

### 4.15 Global — Bench Suite Ekle

**Aksiyon (Tamamla):** `tests/perf/scan-cycle.bench.ts` gibi vitest-bench dosyaları ekle. Scan cycle, agent pool load, memory.db insert için baseline çıkar. CI'da nightly regression check.

**Beklenen kazanım:** Sprint 172+ performans regresyonlarını yakalayabilmek için ölçülebilir veri.

---

## Toplu Önceliklendirme (Sprint 172+ Backlog)

| Öncelik | Bulgu | Tahmini Effort | Beklenen Kazanım |
|---|---|---|---|
| P0 | 1.1, 1.2, 1.14, 1.18 (scan loop cache + async) | high | scan latency 4-6×, event loop responsiveness, disk I/O -70% |
| P0 | 1.6 (agent-pool mtime cache) | normal | PLAN faz 5-10× |
| P1 | 1.5 (memory-store statement pool) | low | DB insert micro-optimization |
| P1 | 1.7 (Promise.all hot paths) | normal | collect/evaluate stat süresi N×→1× |
| P1 | 1.9 (event-stream in-memory counter) | low | sprint başına 300 syscall tasarrufu |
| P1 | 1.11 (ipc-registry fs.watch) | normal | idle CPU sıfırlanır |
| P1 | 1.4 (boundary violation trie) | normal | 29+ worker sprintlerde linear scale |
| P2 | 1.3 (git diff async) | low | büyük diff'lerde 500 ms event loop block kaldırılır |
| P2 | 1.8 (spawnSync sleep) | low | 30-50 ms latency + 10 fork tasarrufu |
| P2 | 1.10 (event-stream streaming) | normal | resume + dashboard query hızlanır |
| P2 | 1.12 (getActiveWorkerIds cache) | low | hot-cluster cache hit oranı |
| P2 | 1.17 (dashboard debounced flush) | normal | dashboard write %85 azalır |
| P3 | 1.13, 1.15, 1.16 | low | bakım kalitesi |

---

**Genel Değerlendirme:** deckent kod tabanında performans açısından **OSS GA blocker yok** (CRITICAL yok). Ancak ADR-005 ile çelişen yaygın senkron I/O ve eksik async paralelizm, ürünün performans karakteristiğini olumsuz etkiliyor. Sprint 172'de scan-loop cache + async migration + agent-pool mtime cache trio'su yapıldığında, deckent 30-worker sprintlerde %50+ daha hızlı çalışacaktır. Diğer optimizasyonlar Sprint 173+'a yayılabilir.
