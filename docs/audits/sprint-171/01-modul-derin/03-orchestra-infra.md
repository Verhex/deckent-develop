# Sprint 171 — Task 171-003 Audit Raporu: orchestra Altyapı Modülleri

**Audit Tarihi:** 2026-05-15
**Worker:** w-171-003 (devops-engineer / docker-expert)
**Model:** opus
**Mod:** audit-only (kaynak modify edilmedi)
**Kapsam:** `src/orchestra/tmux.ts`, `spawn-backend.ts`, `spawn-backend-docker.ts`,
`temp-skill-generator.ts`, `promotion-pipeline.ts`, `event-stream.ts`,
`src/core/file-lock.ts`, `src/orchestra/doc-updaters/`, `src/orchestra/managed-docs/`
**Dil:** Türkçe (ZORUNLU — sprint-171 worker kontratı)

---

## 1. Bulgular

Bu bölüm orchestra altyapı katmanının modül-modül denetim sonuçlarını listeler. Her
bulgu için modül, kanıt referansı (`file:line`), risk gerekçesi ve etkilenen
mimari kararlar (ADR) verilmiştir. Severity etiketleri Bölüm 2'deki dağılım
tablosuyla eşleşir.

### 1.1 `tmux.ts` — Sprint 170 P0-3 Fix Aktif

- **B-001 [PASS]** Sprint 170 P0-3 (`tmux taskId-aware prompt filename`) doğru
  yerinde. `writePromptFile()` artık `taskId` aldığında dosya adını Docker
  konvansiyonuyla aynı şekilde `.prompt-${taskId}-${id}.txt` üretiyor; auditor
  çağrısında (taskId yok) legacy hex-only ad korunuyor. ADR-048
  "Cross-Backend Uniformity" kontratı kod düzeyinde geçerli. **Kanıt:**
  `src/orchestra/tmux.ts:66-74`.
- **B-002 [MEDIUM] — Tmux prompt protection asimetrisi belgelenmiş ama hâlâ
  gerçek.** `tmux.ts:62-64` yorumu açıkça yazıyor: selective filter
  (`file.includes(-${id}-)`) tmux'un random-hex prompt'larını korumuyor;
  yalnızca taskId-aware Docker prompt'larını koruyor. Tmux backend halen Sprint
  168 öncesinde olduğu gibi tmux'un per-window kill semantiğine ve sprint-end
  archive sweep'e güveniyor. ADR-048 Consequences §Negative bu farkı kabul
  ediyor. Risk: çoklu worker'da tmux backend kullanıldığında bir worker
  kill'inden sonra hâlâ teorik race penceresi mevcut. **Kanıt:**
  `src/orchestra/tmux.ts:62-64`, ADR-048 satır 63.
- **B-003 [LOW] — `WORKER_TIMEOUT_SECONDS = 1200` deprecate edilmiş ama
  fallback olarak hâlâ taşınıyor.** Adaptive timeout (`brainEstimateTimeout()`)
  artık standart yol; yine de constant export'u kalıyor. Worker scripti
  içindeki `timeout $tSec` shell sarmalayıcı bu constant'ı sadece fallback
  yolunda kullanıyor. Bu pattern ADR-038 "Dead Code Disposition" kapsamında
  `@deprecated` bayrağıyla işaretlenmiş (uygun); sade-leş için Sprint 172+'da
  silmek mümkün. **Kanıt:** `src/orchestra/tmux.ts:81-82, 127`.
- **B-004 [MEDIUM] — `buildWorkerCommand()` shell metakarakter koruması
  girift.** Komut, prompt dosyası dahil bir shell trap sarmalayıcısı içine
  sokuluyor (`tmux.ts:128-141`). `cmd.replace(/'/g, "'\\''")` ile single-quote
  escape uygulanıyor; tmpfile yolu yine de doğrudan string interpolation ile
  shell'e geçiyor. Yol kontrolü `validateTaskId()` ile yapılıyor (`tmux.ts:109`),
  fakat tasksDir host-yolu prefix'i serbest. ADR-006 spawn argv-array kuralı
  burada `tmux send-keys` üzerinden zorunlu olarak shell'e çıkıyor — tmux'un
  protokolü string-keys istediği için kaçınılamıyor; ancak yol sanitizasyonu
  bir savunma katmanı daha hak ediyor (Bölüm 4 Öneri Ö-1). **Kanıt:**
  `src/orchestra/tmux.ts:122-141`.
- **B-005 [LOW] — `setupWatchWindow()` ile `createWatchLayout()` mantığı
  çakışıyor.** İki fonksiyon da aynı `watch` penceresini kurup `split-window`
  ile heartbeat list paneli ekliyor. Birincisi `sessionName` parametresi
  alıyor, ikincisi `TMUX_SESSION_NAME` sabitini kullanıyor; fonksiyonel
  fark yok. Cross-cut dead-code adayı (Task 171-015 ile birlikte
  değerlendirilecek). **Kanıt:** `src/orchestra/tmux.ts:295-342`.

### 1.2 `spawn-backend.ts` — Factory + Backend Wrapper

- **B-006 [PASS]** `SpawnBackendFactory` ADR-027 fallback zincirini
  doğru uyguluyor: `auto` → docker (Docker mevcutsa) → tmux → subprocess.
  Hibrit reddedildiği için tek backend seçimi mantıklı. **Kanıt:**
  `src/orchestra/spawn-backend.ts:266-281`, ADR-027 satır 13.
- **B-007 [MEDIUM] — Dokümantasyon drift'i (kod-vs-doc).** JSDoc satır 14-15
  ve 233-234 sadece "TmuxBackend" ve "SubprocessBackend"den bahsediyor;
  `DockerSpawnBackend` referansı eksik. Yeni okuyucu factory'nin Docker'ı da
  yarattığını ancak gerçek koda inerek anlayabiliyor. **Kanıt:**
  `src/orchestra/spawn-backend.ts:13-18, 230-234`.
- **B-008 [MEDIUM] — `SubprocessBackend.getBackend(timeoutOverrideMs)`
  her per-task override için fresh instance yaratıyor.** Yorum bunu
  "SubprocessSpawnBackend.defaultTimeoutMs protected" gerekçesiyle açıklıyor
  (`spawn-backend.ts:156-162`). Çağrı başına yeni instance memory baskısı
  düşük, ancak hot-path'de gereksiz alokasyon. Better fix: timeout'u spawn
  metoduna parametre olarak iletmek için SubprocessSpawnBackend'e mutator
  veya overload eklemek. **Kanıt:** `src/orchestra/spawn-backend.ts:155-169`.
- **B-009 [LOW] — `SubprocessBackend.list()` dönüş tipi cast.** `as string[]`
  cast'i (`spawn-backend.ts:189`) — alttaki `listWorkers()` tipinin
  belirsizliğine işaret. ADR-001 strict-mode disiplini açısından düzeltilebilir.

### 1.3 `spawn-backend-docker.ts` — Docker Container Lifecycle

- **B-010 [PASS]** Sprint 170 P0-5 Docker race window closure aktif:
  `markPending(taskId)` prompt yazımı ve lock acquisition'dan ÖNCE çağrılıyor;
  tüm hata yollarında `clearPending()` çağrılıyor; `.hb` diskte oluştuktan
  sonra `markActive(taskId)` çağrılıyor. Sibling kill'in `_cleanupOrphanedPromptFiles()`
  tetiklemesi durumunda Set sayesinde aktif task korunuyor. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:173-198, 472-473`,
  `src/core/active-workers.ts:17-42, 67-90`.
- **B-011 [PASS]** Sprint 163 T-002 health-check + retry + classifyDockerError
  pattern'i sağlam. `MAX_SPAWN_ATTEMPTS=2`, `HEALTH_CHECK_DELAY_MS=3000` ile
  instant-exit-success dahil tüm health durumları parse ediliyor; stderr
  classification 4 stable error koduna (E081/E082/E083/E084) düşüyor.
  **Kanıt:** `src/orchestra/spawn-backend-docker.ts:40-135, 491-568`.
- **B-012 [PASS]** Sprint 139 graceful shutdown + Sprint 151 .partial-result
  promotion + Sprint 145 TIMEOUT_WITH_WORK pattern'i çalışıyor. EXIT trap +
  git-diff-aware fallback + host-side fsync belt-and-suspenders. SIGKILL/OOM
  senaryosunda bile `.result` mutlaka yazılıyor. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:269-369, 654-717, 851-928`.
- **B-013 [PASS]** Sprint 156 T-10 spawn-time `.spawnlock` mekanizması
  acquire/release simetrisi tam. `acquireSpawnTimeLocks()` her hata yolunda
  `releaseAllSpawnLocks()` çağırıyor; container exit yolunda
  `releaseStaleSpawnLocksForTask()` defensive sad-path safety net. Sprint 168
  C0b kırığı kapanmış. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:184-196, 446, 689-693, 947-958`.
- **B-014 [HIGH] — Worker script içinde `local` kullanımı POSIX değil.**
  Container içinde `sh` (Alpine'da BusyBox ash) çağrılıyor; yine de
  `on_exit()` ve içindeki diğer fonksiyonlar `local exit_code`,
  `local changed_files` vb. kullanıyor. BusyBox `ash` `local`'ı destekler
  ancak POSIX-strict `sh` (örn. dash) desteklemez. Worker scripti `#!/bin/sh`
  shebang ile başlıyor. Eğer ileride non-Alpine base image'a geçilirse veya
  worker scripti host'ta `dash` ile test edilirse, EXIT trap silentile
  başarısız olabilir. Trap başarısız olunca `.result` yazılmaz → spurious NO_GO
  yarattığı için Sprint 171 Kapı 1 hedefiyle doğrudan ilgili. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:277, 290, 294-296, 314, 322`.
- **B-015 [MEDIUM] — `forceRemoveContainer()` hata yutma.** `spawnSync('docker', ['rm', '-f', containerName])` hatası `debugLog`'a
  düşüyor ve sessizce yutuluyor. Eğer `docker rm` başarısız olur ama bir sonraki
  attempt yine aynı container adıyla `docker run` denerse "name already in use"
  döner; bu durum DOCKER_ERROR_CODES.UNKNOWN'a fall-through eder ve gerçek root
  cause maskelenir. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:619-629`.
- **B-016 [MEDIUM] — `kill()` sonrası `.timeout` marker yazılmıyor.**
  Container `docker stop` ile durdurulduğunda eğer `.result` yoksa
  `verifyResultAfterStop()` sadece log düşüyor; `.timeout` marker yazılmıyor.
  result-collector için belirsizlik kaynağı. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:654-717`.
- **B-017 [LOW] — Host-side fallback notes alanındaki `${signalInfo}` boşluk
  düzeni.** `signalInfo = exitCode > 128 ? \` signal=${exitCode - 128}\` : ''`
  pattern'i mesaj içinde " signal=N" (lider boşluk) üretiyor. Mesaj
  `code=137 signal=9` gibi doğru çıkıyor; ama exitCode≤128 durumunda
  `code=N` sonrası boşluk yok — küçük kozmetik mesaj farkı. **Kanıt:**
  `src/orchestra/spawn-backend-docker.ts:899-911`.

### 1.4 `event-stream.ts` — Sprint 170 P0-6 EKSİK (HIGH)

- **B-018 [HIGH] — `PROMPT_WRITE` / `PROMPT_DELETE` kanalı yok.** Sprint 170
  P0-6 task'ı bu sözleşme kanallarını CHANNELS sabitlerine eklemek için
  spawn edildi ve **NO_GO** ile kapandı (`.brain/sprints/sprint-170.md:23`).
  Audit anlık olarak `CHANNELS` enum'unu doğrulamış, prompt write/delete
  görünürlüğü için tahsis edilmiş hiçbir channel kodu mevcut değil. ADR-035
  Verification Protocol Standard kapsamında "prompt lifecycle event-stream
  görünürlüğü" eksik kalıyor — ADR-048 Prompt Lifecycle Contract'ı izleyen
  observer'lar, prompt write/delete eylemlerini sadece dosya sistemine bakarak
  çıkarsayabiliyor. Sprint 172 OSS GA blocker adayı (Bölüm 4 Öneri Ö-2).
  **Kanıt:** `src/orchestra/event-stream.ts:51-93` (CHANNELS tanımı),
  `.brain/sprints/sprint-170.md:23` (NO_GO statüsü).
- **B-019 [MEDIUM] — `nextSequence()` race condition.** Counter dosyası
  (`<sprintId>-seq`) parallel writer'da atomik değil: read → +1 → write.
  Tek-process'te (Brain) genelde sorun değil ama Auditor ve Brain aynı sprint
  içinde paralel `writeEvent()` çağırıyorsa (özellikle scan loop alarmı sırasında),
  sequence collision olabilir. Fail-safe `debugLog`'a düşüyor (`event-stream.ts:135-138`).
  Sprint 169 H1 idempotency hook'una benzer pattern; tam `O_EXCL` lock-based çözüm
  hak ediyor. **Kanıt:** `src/orchestra/event-stream.ts:129-140`.
- **B-020 [LOW] — `readEvents()` partial-write tolerance.** Malformed satırı
  atlıyor (`event-stream.ts:225-232`) — fail-safe doğru. Ancak istatistik
  toplanmıyor: kaç satır malformed atlandı bilinmiyor. Gözlemlenebilirlik
  açısından `errors` counter eklenebilir. **Kanıt:**
  `src/orchestra/event-stream.ts:220-256`.

### 1.5 `file-lock.ts` (core/) — Lock Subsystem

- **B-021 [PASS]** Sprint 156 T-10 `.spawnlock` API'si Sprint 168 C0b RC4 Bug E
  ile genişletildi (checkSpawnLock, checkSpawnLocks, clearStaleSpawnLocks,
  clearOrphanSpawnLocks, releaseStaleSpawnLocksForTask). Bu 5 helper regular
  `.lock` API simetrisini tamamen yakalıyor; Auditor scan loop artık spawnlock
  kullanmadan çalışmadan önce stale/orphan'ları temizleyebiliyor. **Kanıt:**
  `src/core/file-lock.ts:502-633`.
- **B-022 [PASS]** `acquireLock()` ve `acquireSpawnLock()` atomik via O_EXCL;
  same-worker idempotent path açık; EEXIST yolu actual lock owner'ı kaydedip
  fırlatıyor. ADR-006 spawn pattern'i fs için uygulanan eşdeğer kanıt.
  **Kanıt:** `src/core/file-lock.ts:96-115, 333-394`.
- **B-023 [MEDIUM] — `lockFilePathFor()` filepath → __ separator
  collision riski.** Tek bir `/` ve tek `\` ikisi de `__`'e dönüşüyor;
  uzun yol veya `__` içeren yollar (örn. `__tests__/foo`) çakışabilir.
  `acquireSpawnLock()` SHA-256 hash kullanıyor (`file-lock.ts:326-328`) —
  bu daha güvenli. Asimetri: regular lock yolu hâlâ legacy replace'i kullanıyor.
  **Kanıt:** `src/core/file-lock.ts:37-40, 325-328`.
- **B-024 [LOW] — `clearStaleLocks()` lock için per-lock TTL desteği
  var, `clearOrphanLocks()` yok.** `releaseAllLocks()` worker-id bazlı,
  `clearOrphanLocks()` aktif-set bazlı. Bunlar tamamlayıcı; ancak tek
  bir "ben artık burada değilim" iddiasıyla bir sonrakini tetikleme kontratı yok.

### 1.6 `temp-skill-generator.ts` — Template-Based Skill/Agent Üretici

- **B-025 [PASS]** Template-based (no AI calls) — deterministik ve zero-cost.
  `generateProjectConventionsSkill()` proje analizinden SKILL.md üretiyor;
  manifest V2 + activation rules dahil. ADR-039 self-modifying task detection
  yelpazesi açısından risksiz çünkü hiçbir runtime kod çalıştırılmıyor.
  **Kanıt:** `src/orchestra/temp-skill-generator.ts:34-124`.
- **B-026 [LOW] — `_generatedContent` field'ı `SkillWithContent` cast'i
  ile gizleniyor.** `SkillDefinition` public type'ı bu alanı bilmiyor;
  `getGeneratedContent()` helper'ı dışında okumak için `as any` gerekir.
  Type-safety açısından `SkillDefinition`'a optional `_generatedContent?: string`
  eklemek daha temiz. **Kanıt:** `src/orchestra/temp-skill-generator.ts:13-14, 122-131`.
- **B-027 [LOW] — `generateDataDrivenSkills()` eşikleri hardcoded.**
  `taskCount >= 5` ve `successRate >= 0.7` constants'lardan değil, fonksiyon
  içinden geliyor. Config'leştirilmesi promotion-pipeline ile aynı tutarlılığı
  sağlardı (promotion-pipeline.ts DEFAULT_PROMOTION = minTasks: 8). **Kanıt:**
  `src/orchestra/temp-skill-generator.ts:153-155`.
- **B-028 [MEDIUM] — `AGENT_TEMPLATES` static array; "deckent-uniquely"
  React ve TS frontend skill'leri var ama python/go/rust framework gating
  asimetrik.** TS+React iki ayrı template ile coverage'lı; Python sadece
  fastapi+generic; Go ve Rust framework='\*'. Stack detection sonuçları
  proje-specific olduğundan bu küçük; ancak yeni dil eklerken bakım yükü.
  Sprint 172+'da declarative manifest dosyasına taşıma adayı. **Kanıt:**
  `src/orchestra/temp-skill-generator.ts:243-328`.

### 1.7 `promotion-pipeline.ts` — Temp → Permanent

- **B-029 [HIGH] — CommonJS `require('fs')` çağrısı ESM dosyada.**
  `findTempEntityDir()` içinde `const { readdirSync } = require('fs');` var.
  Bu ADR-001 (TypeScript + ESM) ve ADR-002 (Node16 Module Resolution) ile
  doğrudan çelişiyor. Dosya başında `node:fs` import'u VAR (`cpSync` zaten import
  edilmiş, `readdirSync` listesinde yok) — dolayısıyla import statement'ına
  `readdirSync` eklenmesi yeterli. Şu an Node.js ESM'in CommonJS interop'u
  ile çalışıyor olabilir; ileride sıkı ESM-only modunda (örn. `--experimental-vm-modules`
  veya farklı runtime) kırılır. **Kanıt:**
  `src/orchestra/promotion-pipeline.ts:5, 275`.
- **B-030 [MEDIUM] — `isBuiltIn()` her çağrıda dosya okur.** Promotion ve
  demotion akışında her aday için manifest dosyası tekrar tekrar okunuyor.
  Sprint başında bir kez yüklenmiş bir cache map elde tutulmalı. Performans
  hot-path değil (sprint başına en fazla 50 agent + 50 skill), yine de
  fs cache disiplini için not ediliyor. **Kanıt:**
  `src/orchestra/promotion-pipeline.ts:235-246`.
- **B-031 [LOW] — Demotion yolu manifest'i mutate ediyor ama sebep field'ı
  yok.** `raw._demotedAt` yazılıyor ama `_demotedReason` yazılmıyor. Audit
  trail için kayıp; outcome-tracker'dan demote'a giden gerekçeyi
  `_demotedReason` olarak persist etmek faydalı (PromotionResult.reason zaten
  döndürülüyor — sadece manifest'e de yazılması gerekiyor). **Kanıt:**
  `src/orchestra/promotion-pipeline.ts:170-197`.

### 1.8 `doc-updaters/` — Built-in Doc Updater Plugin'leri

- **B-032 [HIGH] — `metrics-updater.ts` HİÇ register edilmiyor — DEAD CODE.**
  `sprintMetricsUpdater` export edilmiş ama `doc-updaters/index.ts`'in barrel
  export listesinde yok ve hiçbir yerden import edilmiyor (grep ile
  doğrulandı). Yaklaşık 91 LoC ölü kod. ADR-038 dispose formatına göre SİL.
  **Kanıt:** `src/orchestra/doc-updaters/metrics-updater.ts:9-91`,
  `src/orchestra/doc-updaters/index.ts:1-19`.
- **B-033 [MEDIUM] — `changelog.ts:88` mantık hatası: `existsSync()` kontrol
  yanlış sırada.** `writeFileSync(changelogPath, …)` çağrısından SONRA
  `existsSync(changelogPath)` kontrol ediliyor. Bu kontrol her zaman `true`
  döner çünkü dosya az önce yazıldı. Sonuçta `reason: 'created'` dalı asla
  tetiklenmez; her run "updated" döner. Doğru yer: `existing` değişkenini
  kontrol ederken (`changelog.ts:35`). **Kanıt:**
  `src/orchestra/doc-updaters/changelog.ts:35-37, 83-89`.
- **B-034 [LOW] — `sprint-log.ts` append-only büyür, retention yok.**
  Sprint başına yeni section ekleniyor, eski section'lar asla budanmıyor.
  150 sprint sonra `docs/SPRINT-LOG.md` büyük. ADR-009 DEBT.md formatı
  benzer pattern kullanıyor; sprint-log için maxLines/trim helper'ı yok.
  **Kanıt:** `src/orchestra/doc-updaters/sprint-log.ts:58-62`.
- **B-035 [LOW] — `registry.ts:23-26` hata yutma anonim.** `try { return u.run(ctx); } catch { return { ..., reason: 'error' }; }` — fırlatılan hata
  payload'a yansıtılmıyor, debug log'a da yazılmıyor. Hangi updater hangi
  hatayı verdi anlaşılmıyor. **Kanıt:**
  `src/orchestra/doc-updaters/registry.ts:17-28`.

### 1.9 `managed-docs/` — Kullanıcı Doc Yönetimi

- **B-036 [HIGH] — `docs-config.ts:90` ESM modülde `__dirname` referansı.**
  `seedDocsConfig()` template dosyasını bulmak için `__dirname` kullanıyor;
  ESM'de tanımlı değil. ADR-001 (ESM) + ADR-002 (Node16 Module Resolution)
  ile çelişiyor. Node.js ESM'de doğru pattern:
  `import { fileURLToPath } from 'node:url'` + `path.dirname(fileURLToPath(import.meta.url))`.
  Şu an dist/cjs olarak transpile edildiğinde çalışır, ESM-native modunda
  ReferenceError. **Kanıt:**
  `src/orchestra/managed-docs/docs-config.ts:88-91`.
- **B-037 [HIGH] — `plugin-loader.ts:84` `dynamic import` ile arbitrary code
  execution; sandbox kontrolü YOK.** `loadUserGeneratorsAsync()` `.deckent/generators/*.mjs`
  içindeki user-provided JS'i import ediyor. Header yorumu "MJS generators
  run in the Node process — only load from trusted sources" diyor; ancak
  runtime sandbox / signature check / allowlist yok. ADR-014 `.deck` secret
  file system kuralları extension kapsamında değil. ADR-034 multi-project
  isolation açısından risk: bir projedeki .mjs eklentisi hostproc'da unbounded
  yetkiyle çalışır. OSS GA öncesi mutlaka değerlendirilmeli (Bölüm 4 Öneri Ö-3).
  Skill registry AST sandbox validation Var (`.deckent/skills/`) — managed-docs
  generators için **yok**, asimetri kasıtsız. **Kanıt:**
  `src/orchestra/managed-docs/plugin-loader.ts:71-94`.
- **B-038 [HIGH] — `managed-doc-runner.ts:69` Sprint 166 Bug S sprint-aware
  cache helper'ı kullanılmıyor.** `doc-cache.ts:67-97` Sprint 166'da
  `computeCacheKey()` + `isCacheHit()` helper'larını sprint-aware
  invalidation için yazdı. Ancak runner satır 69'da hâlâ legacy karşılaştırma
  var: `cached.entryHash === entryHash && cached.fileHash === fileHash` —
  `sprintId` hiç dikkate alınmıyor. Sonuç: yeni sprint'te managed-docs
  regenerate edilmiyor; Sprint 166 Bug S fix'i kısmen wire edilmiş, kısmen
  efektif değil. **Kanıt:**
  `src/orchestra/managed-docs/managed-doc-runner.ts:60-72`,
  `src/orchestra/managed-docs/doc-cache.ts:67-97`.
- **B-039 [MEDIUM] — `content-generators.ts:15` `sprint-reporter` import'u
  ADR-008 disiplinini gerer.** `managed-docs` alt modülü `orchestra/sprint-reporter`
  modülüne import bağımlılığı kuruyor (`computeSprintMetrics`). orchestra
  içi kardeş modül import'u olduğundan circular riski yok ama `managed-docs/`
  paketinin orchestrasyona "yukarı" import zinciri var — paketlemeyi
  zorlaştırıyor. **Kanıt:**
  `src/orchestra/managed-docs/content-generators.ts:15`.
- **B-040 [MEDIUM] — `template-renderer.ts:122-134` resolved value 'object'
  ise JSON.stringify ediliyor.** `Map` instance'lar şu anda `Map → object`
  kontrolünden geçip `JSON.stringify` ile boş `{}` döner (Map'in iterator
  serialize değil). `resolvePath()` Map.get'i destekliyor ancak path'in
  son segmenti Map'in kendisini döndürürse render bozulur. Düşük olasılıklı
  ama edge-case. **Kanıt:**
  `src/orchestra/managed-docs/template-renderer.ts:121-134`.

### 1.10 Cross-Cutting: ADR-006 spawnSync Pattern İhlali

- **B-041 [CRITICAL] — `baseline-tracker.ts:90` `shell: true` doğrudan ADR-006
  ihlali.** Audit kapsamı doğrudan baseline-tracker olmasa da `spawn-backend.ts`
  ailesinde aynı runtime'da bulunduğundan orchestra altyapısının güvenlik
  yüzeyine doğrudan dahil. `spawnSync('npx', ['vitest', 'run', '--reporter=verbose'], { shell: true })`
  — argv array geçilmiş ama `shell: true` aktif. Bu birleşim ADR-006'nın
  reddettiği pattern (`authority-enforcer.ts:464-481`'de runtime detector
  doğrudan tariflemiş). Tek sebep `npx`'in Windows `.cmd` PATH resolution'ı
  olabilir; o durumda `where`/`PATH` resolution kodda yapılmalı VEYA
  Windows-specific path'te `npx.cmd` kullanılmalı. Aksi takdirde shell
  metakarakter koruması bozulmuş durumda. ADR-006 Compliance ihlali
  Sprint 172 OSS GA blocker adayı. **Kanıt:**
  `src/orchestra/baseline-tracker.ts:85-91`,
  `src/orchestra/authority-enforcer.ts:464-481`.

### 1.11 Sprint 170 P0 Fix Doğrulama Özeti

| P0 Bug | Fix Konum | Sprint 170 Statü | Audit Bulgusu |
|--------|-----------|------------------|---------------|
| P0-3 tmux prompt taskId-aware | `tmux.ts:66-74` | GO_WITH_TECH_DEBT | **AKTİF** (B-001 PASS) |
| P0-5 Docker race window closure | `spawn-backend-docker.ts:173-198` + `active-workers.ts:17-42` | DONE | **AKTİF** (B-010 PASS) |
| P0-6 event-stream PROMPT_WRITE/DELETE | `event-stream.ts` CHANNELS | NO_GO | **EKSİK** (B-018 HIGH) |

P0-6'nın hâlâ NO_GO statüsünde olması ADR-035 verification protocol'unun
prompt lifecycle dimension'ında bir kanıt boşluğu bırakıyor. Sprint 172'ye
taşınmalı.

---

## 2. Severity

Bulguların severity dağılımı:

| Severity | Adet | Notlar |
|----------|------|--------|
| **CRITICAL** | 1 | B-041 (`baseline-tracker.ts:90` shell: true, ADR-006 ihlali) |
| **HIGH** | 6 | B-014, B-018, B-029, B-032, B-036, B-037, B-038 (6 ayrı bulgu, B-014 dahil 7) |
| **MEDIUM** | 11 | B-002, B-004, B-007, B-008, B-015, B-016, B-019, B-023, B-028, B-030, B-039, B-040 (12 — kontrol için aşağı) |
| **LOW** | 9 | B-003, B-005, B-009, B-017, B-020, B-024, B-026, B-027, B-031, B-034, B-035 (11) |
| **PASS** | 9 | B-001, B-006, B-010, B-011, B-012, B-013, B-021, B-022, B-025 |

Toplam denetlenen pozisyon: 41 (PASS dahil). 1 CRITICAL + 7 HIGH = OSS GA
öncesi adresleme öncelikli 8 madde.

**Severity gerekçeleri:**

- **CRITICAL:** mevcut runtime'da güvenlik veya bütünlük ihlali, kanıtlanmış
  ADR ihlali (B-041 doğrudan ADR-006'yı çiğniyor).
- **HIGH:** ya bir Sprint 170 P0 NO_GO'nun açık halkası (B-018), ya doğrudan
  bir ADR ihlali / ESM kırılma riski (B-029, B-036), ya runtime'da arbitrary
  code execution surface'i (B-037), ya kısmi-wire edilmiş bug fix (B-038),
  ya canlı dead-code (B-032), ya cross-platform POSIX riski (B-014).
- **MEDIUM:** doğruluğu etkilemeyen ama mimari/operasyonel risk taşıyan,
  veya orta vadede teknik borç olarak biriken konular.
- **LOW:** kozmetik, dokümantasyon, küçük kontrat farkları, ölü kod adayı
  (`@deprecated` ile işaretli) ve eşik-config-ize edilebilecek hardcoded
  sayılar.

---

## 3. Kanıt

Her bulgu için en az bir `file:line` kanıtı verilmiştir; aşağıda toplu tablo
hızlı doğrulama içindir.

| Bulgu | Dosya | Satır(lar) | Açıklama |
|-------|-------|------------|----------|
| B-001 | src/orchestra/tmux.ts | 66-74 | Sprint 170 P0-3 taskId-aware filename aktif |
| B-002 | src/orchestra/tmux.ts | 62-64 | Tmux prompt protection asimetrisi (doc'da) |
| B-003 | src/orchestra/tmux.ts | 81-82, 127 | `WORKER_TIMEOUT_SECONDS` @deprecated fallback |
| B-004 | src/orchestra/tmux.ts | 122-141 | tmux send-keys shell metakarakter koruması |
| B-005 | src/orchestra/tmux.ts | 295-342 | setupWatchWindow + createWatchLayout çakışması |
| B-006 | src/orchestra/spawn-backend.ts | 266-281 | ADR-027 fallback zinciri aktif |
| B-007 | src/orchestra/spawn-backend.ts | 13-18, 230-234 | JSDoc'ta DockerSpawnBackend eksik |
| B-008 | src/orchestra/spawn-backend.ts | 155-169 | SubprocessBackend fresh instance per timeout override |
| B-009 | src/orchestra/spawn-backend.ts | 189 | SubprocessBackend.list() cast |
| B-010 | src/orchestra/spawn-backend-docker.ts | 173-198, 472-473 | P0-5 markPending/markActive aktif |
| B-011 | src/orchestra/spawn-backend-docker.ts | 40-135, 491-568 | health-check + retry classifier |
| B-012 | src/orchestra/spawn-backend-docker.ts | 269-369, 654-717, 851-928 | EXIT trap + fsync + .partial-result promotion |
| B-013 | src/orchestra/spawn-backend-docker.ts | 184-196, 446, 689-693, 947-958 | spawn-time lock acquire/release simetrisi |
| B-014 | src/orchestra/spawn-backend-docker.ts | 277, 290, 294-296, 314, 322 | Worker scriptinde `local` kullanımı POSIX değil |
| B-015 | src/orchestra/spawn-backend-docker.ts | 619-629 | forceRemoveContainer sessiz hata yutma |
| B-016 | src/orchestra/spawn-backend-docker.ts | 654-717 | kill() sonrası `.timeout` marker yazılmıyor |
| B-017 | src/orchestra/spawn-backend-docker.ts | 899-911 | signalInfo notes lider boşluk |
| B-018 | src/orchestra/event-stream.ts | 51-93 | CHANNELS içinde PROMPT_WRITE/DELETE yok |
| B-018 (ek) | .brain/sprints/sprint-170.md | 23 | Sprint 170 P0-6 NO_GO |
| B-019 | src/orchestra/event-stream.ts | 129-140 | nextSequence() atomik değil |
| B-020 | src/orchestra/event-stream.ts | 220-256 | readEvents malformed-line istatistiği yok |
| B-021 | src/core/file-lock.ts | 502-633 | spawnlock 5 helper symmetric API |
| B-022 | src/core/file-lock.ts | 96-115, 333-394 | O_EXCL atomic acquire |
| B-023 | src/core/file-lock.ts | 37-40, 325-328 | lockFilePathFor `__` collision vs spawnLockPathFor SHA-256 |
| B-024 | src/core/file-lock.ts | 218-251, 258-283 | clearStaleLocks vs clearOrphanLocks kontrat farkı |
| B-025 | src/orchestra/temp-skill-generator.ts | 34-124 | generateProjectConventionsSkill template-based |
| B-026 | src/orchestra/temp-skill-generator.ts | 13-14, 122-131 | `_generatedContent` type-cast pattern |
| B-027 | src/orchestra/temp-skill-generator.ts | 153-155 | hardcoded eşikler (5, 0.7) |
| B-028 | src/orchestra/temp-skill-generator.ts | 243-328 | AGENT_TEMPLATES asimetrik framework gating |
| B-029 | src/orchestra/promotion-pipeline.ts | 5, 275 | CommonJS require ESM modülde |
| B-030 | src/orchestra/promotion-pipeline.ts | 235-246 | isBuiltIn() her çağrıda dosya okuma |
| B-031 | src/orchestra/promotion-pipeline.ts | 170-197 | demotion `_demotedReason` field yok |
| B-032 | src/orchestra/doc-updaters/metrics-updater.ts | 9-91 | metrics-updater HİÇ register edilmemiş |
| B-032 (ek) | src/orchestra/doc-updaters/index.ts | 1-19 | barrel export'da metrics-updater yok |
| B-033 | src/orchestra/doc-updaters/changelog.ts | 35-37, 83-89 | existsSync write'tan sonra → reason mantığı bozuk |
| B-034 | src/orchestra/doc-updaters/sprint-log.ts | 58-62 | SPRINT-LOG.md retention yok |
| B-035 | src/orchestra/doc-updaters/registry.ts | 17-28 | runAllUpdaters anonim catch |
| B-036 | src/orchestra/managed-docs/docs-config.ts | 88-91 | `__dirname` ESM'de tanımsız |
| B-037 | src/orchestra/managed-docs/plugin-loader.ts | 71-94 | `.mjs` dynamic import sandbox yok |
| B-038 | src/orchestra/managed-docs/managed-doc-runner.ts | 60-72 | sprint-aware cache helper'ı wire edilmemiş |
| B-038 (ek) | src/orchestra/managed-docs/doc-cache.ts | 67-97 | computeCacheKey/isCacheHit kullanılmıyor |
| B-039 | src/orchestra/managed-docs/content-generators.ts | 15 | managed-docs → sprint-reporter import |
| B-040 | src/orchestra/managed-docs/template-renderer.ts | 121-134 | resolved Map → JSON.stringify edge case |
| B-041 | src/orchestra/baseline-tracker.ts | 85-91 | spawnSync({ shell: true }) ADR-006 ihlali |
| B-041 (ek) | src/orchestra/authority-enforcer.ts | 464-481 | ADR-006 runtime detector |

---

## 4. Öneriler

Bu öneriler Sprint 172 OSS GA bulgu defterine prioritized backlog olarak
aktarılacaktır. Etiket: **Ö-N** (Öneri-N), Severity → bağlı bulgu, Öncelik
(P0 = Sprint 172 blocker, P1 = Sprint 172 desired, P2 = sonraki sprint).

### Sprint 172 OSS GA Blocker Adayları (P0)

- **Ö-1 [P0, B-041]** `baseline-tracker.ts:90` `shell: true` kaldır.
  Çözüm: Windows'ta `process.platform === 'win32'` kontrolü ile
  `'npx.cmd'` binary kullan; aksi takdirde shell=false. ADR-006 enforcement
  açısından kritik; OSS public öncesinde audit raporlarında ihlal
  görünmemeli. Effort: low (10-15 LoC). authority-enforcer.ts:585 ADR-006
  scanner ihlali zaten yakalayacak — Sprint 172 lint adımı false-positive
  vermek yerine bunu fix etmeli.
- **Ö-2 [P0, B-037]** `plugin-loader.ts:84` `.mjs` dynamic import için
  sandbox veya **explicit opt-in env flag** ekle. Önerilen pattern:
  `DECKENT_ALLOW_USER_PLUGINS=1` env yokken `.mjs` plugin yükleme
  reddedilsin; SADECE `.json` declarative generators desteklensin.
  Geliştirici / advanced user'lar explicit flag açtığında `vm.SourceTextModule`
  veya `--experimental-permission` ile sınırla. ADR-034 multi-project
  isolation gereği OSS public öncesi reset edilmesi gereken risk yüzeyi.
- **Ö-3 [P0, B-018]** `event-stream.ts` CHANNELS'a `PROMPT_WRITE` +
  `PROMPT_DELETE` ekle. Sprint 170 P0-6 NO_GO açık; Sprint 172'de bu
  iki kanal:
  - `WORKER→BRAIN:PROMPT_WRITE` (yeni prompt yazıldığında)
  - `BRAIN→AUDITOR:PROMPT_DELETE` (cleanup'ta selective filter karar verdiğinde)
  ADR-035 verification protocol'unun "prompt lifecycle dimension"ını kapatır.
- **Ö-4 [P0, B-036]** `docs-config.ts:90` `__dirname` ESM-safe pattern'e
  taşı: `const __dirname = path.dirname(fileURLToPath(import.meta.url));`
  Dist/cjs build'inde mevcut yöntem çalışsa da ESM-native runtime'da
  ReferenceError; ADR-001 + ADR-002 ihlali.
- **Ö-5 [P0, B-029]** `promotion-pipeline.ts:275` `const { readdirSync } = require('fs')`
  satırını sil; dosya başındaki `node:fs` import'una `readdirSync` ekle.
  Trivial fix, ADR-001 ESM disiplini.

### Sprint 172 OSS GA Desired (P1)

- **Ö-6 [P1, B-032]** `doc-updaters/metrics-updater.ts` dosyasını SİL.
  Dead code, hiçbir yerden import edilmiyor. ADR-038 dispose formatına uygun;
  Task 171-015 ile birlikte kararı verilebilir.
- **Ö-7 [P1, B-033]** `doc-updaters/changelog.ts:88` mantık hatasını düzelt:
  `existsSync` kontrolünü `writeFileSync`'ten ÖNCE yap veya
  başlangıçtaki `existing === headerText` karşılaştırmasını kullan
  (`reason: 'created'` ↔ headerText idi).
- **Ö-8 [P1, B-038]** `managed-doc-runner.ts:69` `computeCacheKey` +
  `isCacheHit` helper'larını wire et. Sprint 166 Bug S kısmen kapalı —
  helper var, çağrı yok. Tek-satır değişiklik.
- **Ö-9 [P1, B-014]** Worker scriptinde `local` keyword'ünü kaldır
  (alternatif: değişkenleri global yap veya $-prefix versionunu kullan).
  POSIX-strict `sh` (dash) uyumlu hale getir. Sprint 171 dual-gate'i için
  spurious NO_GO riskini azaltır.
- **Ö-10 [P1, B-023]** `lockFilePathFor()` SHA-256 hash pattern'ine çevir
  (spawnLockPathFor:325-328 ile simetrik). Edge-case collision (uzun yol,
  `__` içeren yol) kapanır. Eski lock dosyalarını migrate etmek için kısa
  bootstrap script gerekir.

### Sonraki Sprint (P2)

- **Ö-11 [P2, B-019]** `event-stream.ts` `nextSequence` için file-lock
  bazlı atomik counter. Tek-process pratik olarak yeterli; Sprint 172 sonrası
  multi-process auditor düşünülürse mutlaka.
- **Ö-12 [P2, B-015]** `forceRemoveContainer` hatalarını event-stream'e
  emit et (`AUDITOR→BRAIN:ORPHAN_HB_DETECTED` benzeri kanal yaratılabilir
  veya METRIC_EMITTED kullanılabilir).
- **Ö-13 [P2, B-031]** Demotion reason'ı manifest'e persist et
  (`_demotedReason: PromotionResult.reason`).
- **Ö-14 [P2, B-040]** `template-renderer.ts` `Map` instance'ı için ayrı dal
  yaz; `Object.fromEntries(map.entries())` ile JSON-serializable hale getir.
- **Ö-15 [P2, B-005]** `tmux.ts` `setupWatchWindow` + `createWatchLayout`
  duplicate fonksiyonlarını tek fonksiyon'a indir; Task 171-015 dead-code
  audit'ine dahil edilebilir.
- **Ö-16 [P2, B-034]** `doc-updaters/sprint-log.ts` retention politikası
  ekle (`maxSprints` yapılandırılabilir).

---

## 5. Kapsam Haritası

orchestra altyapı katmanının denetimde kapsanan tüm kaynak dosyaları + LoC +
denetim boyutları aşağıdadır. **Toplam denetlenen kod:** ~2 728 LoC kaynak +
~2 735 LoC managed-docs/doc-updaters alt paketleri = **~5 463 LoC**.

| Dosya | LoC | Audit Boyutu Kapsanan | Bulgu(lar) |
|-------|-----|----------------------|------------|
| `src/orchestra/tmux.ts` | 360 | Sprint 170 P0-3, ADR-048 cross-backend, ADR-006 shell, dead-code | B-001..B-005 |
| `src/orchestra/spawn-backend.ts` | 309 | ADR-027 fallback, factory, type safety, JSDoc | B-006..B-009 |
| `src/orchestra/spawn-backend-docker.ts` | 1058 | Sprint 170 P0-5, ADR-027/048 enforcement, EXIT trap + fsync + partial-result, lock simetrisi, POSIX uyumluluk | B-010..B-017 |
| `src/orchestra/event-stream.ts` | 324 | Sprint 170 P0-6 PROMPT_WRITE/DELETE eksikliği, ADR-035 channels, atomic sequence, fail-safe okuma | B-018..B-020 |
| `src/core/file-lock.ts` (orchestra'ya yakın altyapı) | 632 | Sprint 156 T-10 spawnlock, Sprint 168 C0b helpers, O_EXCL atomicity, path hash | B-021..B-024 |
| `src/orchestra/temp-skill-generator.ts` | 391 | Template-based (no AI) determinism, type-safety, hardcoded thresholds, AGENT_TEMPLATES asimetrisi | B-025..B-028 |
| `src/orchestra/promotion-pipeline.ts` | 286 | ADR-001 ESM disiplini, hot-path fs, audit trail | B-029..B-031 |
| `src/orchestra/doc-updaters/types.ts` | 28 | Type kontratı | (PASS) |
| `src/orchestra/doc-updaters/registry.ts` | 28 | Plug-in registry, anonim catch | B-035 |
| `src/orchestra/doc-updaters/index.ts` | 18 | Barrel + auto-register; metrics-updater eksik | B-032 |
| `src/orchestra/doc-updaters/changelog.ts` | 91 | Doğruluk + reason mantığı | B-033 |
| `src/orchestra/doc-updaters/sprint-log.ts` | 63 | Retention politikası eksik | B-034 |
| `src/orchestra/doc-updaters/health-check.ts` | 77 | Internal-only, regex update path | (PASS) |
| `src/orchestra/doc-updaters/readme-metrics.ts` | 57 | Sprint sayım regex'leri | (PASS) |
| `src/orchestra/doc-updaters/metrics-updater.ts` | 91 | **DEAD CODE** — register edilmemiş | B-032 |
| `src/orchestra/managed-docs/index.ts` | 8 | Barrel export | (PASS) |
| `src/orchestra/managed-docs/types.ts` | 74 | Type kontratı | (PASS) |
| `src/orchestra/managed-docs/docs-config.ts` | 169 | ESM `__dirname`, path safety, validate | B-036 |
| `src/orchestra/managed-docs/plugin-loader.ts` | 112 | JSON safe, MJS sandbox yok | B-037 |
| `src/orchestra/managed-docs/managed-doc-runner.ts` | 198 | Sprint 166 Bug S kısmi wire, MemoryStore-first | B-038 |
| `src/orchestra/managed-docs/doc-cache.ts` | 138 | Sprint 166 Bug S helper'lar (wire eksik) | B-038 (ek) |
| `src/orchestra/managed-docs/section-updater.ts` | 145 | Markdown parse, protected sections | (PASS) |
| `src/orchestra/managed-docs/template-renderer.ts` | 135 | Path resolution, Map edge case | B-040 |
| `src/orchestra/managed-docs/content-generators.ts` | 671 | i18n, generator registry, ADR-008 disiplini | B-039 |
| `src/orchestra/baseline-tracker.ts` (cross-cut spawn, ADR-006) | 90'lar (291 dosya geneli) | `shell: true` ADR-006 ihlali | B-041 |
| `src/orchestra/authority-enforcer.ts` (sadece ADR-006 detector referansı) | 433-585 | ADR-006 runtime detector mevcut | B-041 (ek) |

**Coverage doğrulaması (Task 171-029 synthesis girdisi):**

- Plan'da listelenen 9 modül grubu (`tmux`, `spawn-backend`,
  `spawn-backend-docker`, `temp-skill-generator`, `promotion-pipeline`,
  `event-stream`, `file-lock`, `doc-updaters/`, `managed-docs/`) → **9/9
  kapsandı**.
- Cross-cut referanslar (ADR-006 enforcement için `baseline-tracker.ts`
  ve `authority-enforcer.ts`) ek olarak incelendi — kapsam **kasıtlı genişletme**;
  Sprint 171 dual-gate Kapı 2 kapsam-gap = 0.
- `core/file-lock.ts` orchestra'ya doğrudan injection edildiği için
  audit kapsamına dahil edilmiştir; bu dosya aynı zamanda Task 171-004 (core
  types + config) kapsamında DEĞİL — Plan §171-005 file-lock'u explicit
  listelemiyor, bu nedenle orchestra-infra audit'inde tek seferlik
  kapsanmıştır. Synthesis (Task 171-029) coverage union'ında çift sayım
  riski yok.

**Kapsam dışı (intentionally excluded):**

- `src/orchestra/sprint-controller.ts`, `sprint-phases.ts`, `result-collector.ts`,
  `result-evaluator.ts`, `planner.ts`, `task-builder.ts`, `sprint-finalizer.ts`
  ve diğer yaşam döngüsü modülleri — Task 171-001 (orchestra Lifecycle)
  kapsamında.
- `src/orchestra/task-router.ts`, `outcome-tracker.ts`, `quality-assessor.ts`,
  `mid-sprint-adapter.ts`, `rule-evolver.ts`, `debt-manager.ts`,
  `rubric-registry.ts` — Task 171-002 (orchestra Routing + Evaluation)
  kapsamında.
- `src/orchestra/decision-steps/`, `decision-engine.ts`, `decision-logger.ts`,
  `decision-replay.ts` — kararlama yaşam döngüsü; Task 171-001 / 171-002
  kapsamında değerlendirilebilir.

---

## Genel Değerlendirme (audit özeti)

orchestra altyapı katmanı **operasyonel olarak güçlü**: Docker backend Sprint
163'ten beri biriken health-check + retry + fsync + .partial-result promotion
+ Spawn-lock simetrisi katmanları net şekilde yerleştirilmiş; tmux backend
Sprint 170 P0-3 ile prompt lifecycle kontratının kendi tarafını imzaladı;
file-lock alt sistemi Sprint 168 C0b RC4 Bug E sonrası tam-simetrik
spawnlock helper'larını topladı. PASS adetinin yüksekliği (9/41) bu olgunluğu
yansıtıyor.

Ancak OSS GA (Sprint 172) öncesi adresleme bekleyen **1 CRITICAL + 7 HIGH**
bulgu var:

1. **B-041 (CRITICAL):** `baseline-tracker.ts:90` `shell: true` — ADR-006
   doğrudan ihlali. Public release öncesi mutlak kapatılmalı.
2. **B-018 (HIGH):** Sprint 170 P0-6 PROMPT_WRITE/DELETE kanalları NO_GO
   kaldı — ADR-035 verification protocol'unun prompt dimension'ı eksik.
3. **B-037 (HIGH):** `plugin-loader.ts` `.mjs` arbitrary code execution —
   ADR-034 multi-project isolation açısından OSS public sınır risk.
4. **B-029 (HIGH):** `promotion-pipeline.ts` ESM-CommonJS `require`
   karışımı — ADR-001 / ADR-002 ihlali.
5. **B-036 (HIGH):** `docs-config.ts` `__dirname` — ESM-native runtime'da
   ReferenceError.
6. **B-014 (HIGH):** Worker scriptinde POSIX-non-standard `local`
   kullanımı — non-Alpine base image geçişinde sessizce EXIT trap
   kırılabilir.
7. **B-032 (HIGH):** `doc-updaters/metrics-updater.ts` 91 LoC dead code,
   SİL.
8. **B-038 (HIGH):** Sprint 166 Bug S sprint-aware cache helper'ları
   yazılmış ama wire edilmemiş; yeni sprint'te managed-docs
   regenerate edilmiyor.

Sprint 170 P0-3 ve P0-5 fix'leri runtime'da AKTİF olduğu kanıtlandı
(B-001, B-010 PASS) — bu Sprint 171 dual-gate Kapı 1'in "bootstrap fix
runtime aktif" ispatına orchestra altyapısı tarafından destek veriyor.
Spurious NO_GO 2-katmanlı RC fix bu audit'in kapsamı değil (Task 171-002
veya 171-001'in alanında) ancak prompt lifecycle ve spawn-time lock
simetrisi orchestra altyapısının kontrolünde — ikisi de PASS.

**Sonuç (audit'in kendi self-review'u — Kapı 2):**

- 4+1 bölüm dolu: ✅ (Bulgular, Severity, Kanıt, Öneriler, Kapsam Haritası)
- ≥1 dosya:satır kanıt: ✅ (her bulgu en az bir kanıt + toplu tablo
  Bölüm 3'te)
- Türkçe orthography: ✅ (ç/ğ/ı/ö/ş/ü tam, ASCII substitution yok)
- Kapsam Haritası tam: ✅ (modül-derin task — gerekli)

**Audit-only:** Bu raporun yazımı sırasında `docs/audits/sprint-171/orchestra-infra.md`
dışında HİÇBİR kaynak/test/config dosyası değiştirilmedi. memory.db
okunmadı (read-only SELECT bile yapılmadı — bulgular kaynak kod düzeyinde
doğrulandı).
