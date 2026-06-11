# DIRECTIVES — Sprint NNN: Resource-Arbiter V1 — İzin-Önce-Eylem Kaynak Hakemi (ADR-090)

> **Kullanım:** Zamanı gelince bu dosyayı `DIRECTIVES.md`'ye kopyala, başlığı gerçek sprint numarasıyla güncelle (`Sprint NNN`), `deckent plan --structured` → `deckent start`. **Kaynak dokümanlar (kaybolmasın):** spec v2 `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md` · 6 denetim raporu `docs/reviews/resource-arbiter-spec/` · TDD plan `docs/superpowers/plans/2026-06-11-resource-arbiter.md`. Bu DIRECTIVES = plan'ın deckent-çalıştırılabilir modül-boy hâli (14 task, dependency-wave). **Büyük sprint** — istersen Wave-1+2'yi (Task 1-3) ayrı koşup çekirdeği oturt, sonra kalanı.

## Goal: deckent worker'ları aynı anda ağır komut (tam vitest/jest/pytest suite, npm install, native build, db migration) koşunca makineyi kilitliyor (resource-log kanıtlı: RAM'den önce CPU/IO aşırı-aboneliği). Çözüm **izin-önce-eylem admission-control**: korumalı komut, deckent-spawn'lı worker'da **lease almadan exec olamaz**. Mimari **Host-Hakem + İnce-İstemci (K5)**: tüm karar host'ta tek süreçte (result-collector dispatch tick'i) → seq/TOCTOU/çift-grant yarışları tasarım gereği yok; container tarafı import'suz `arbiter-client.mjs` (deckent kurulu olmasa da çalışır). İki-seviyeli kapasite (sınıf + global `heavy` havuz). Saat-donması host-ledger'da (bekleyen worker timeout'tan ölmez). cgroup `--memory` (L4) eş-birincil backstop kalır. **Bu V1** — A3 kötü-niyetli-worker + A4 korumasız-katılımcı açık Non-Goal; ERP capability-lease V2.

## Ortak kurallar
- **TDD + hermetik (ADR-087):** önce RED test; tmpdir + injectable fs/clock/spawn; testte gerçek ağ YASAK; **spawnSync YASAK (async spawn)**; gitignored-state okunmaz (`test:ci-sim` yeşil korunur). FileLeaseBackend testleri client'ı "request dosyası yaz" ile simüle eder (gerçek subprocess yalnız client/shim/smoke testlerinde).
- **i18n-FIRST:** TÜM user-facing string `getMessage(key, lang)` (en+tr). Mekanizma modülleri (arbiter/istemci/shim/loop) **string-free** — etiketler caller'dan. Hardcode TR/EN YASAK.
- **Davranış korunumu / opt-in:** `resource_classes` config default `undefined` → yapılandırılmamışsa sistem byte-bayt eskisi gibi. Fail-open ana ilke: arbiter/shim İÇ hatası ana akışı (sprint/REPL) ASLA düşürmez (K8: bozuk→fail-degraded havuz=1+alarm; reject→fail-closed).
- **Surgical + mevcut-pattern:** `file-lock.ts` (O_EXCL/clearStaleLocks), `host-detector.detectHostMemory`, `system-capacity.detectSystemCapacity().cores`, `event-stream.emitProgress` (`:610`), `notify.notifyProgress` (`:98`), `config.validatePartialConfig` (`:1575`), CHAT_CONFIG_SCHEMA (Zod), `register<Name>(program)` (ADR-012) — BAĞLA, yeniden icat etme. ESM `.js` uzantısı zorunlu (ADR-002).
- **`.tasks/task-XXX.result` YAZ** + Kanıt komutlarını gerçekten koş. Tier-1 user-surface (CLI/`deckent lease`) → gerçek-binary smoke (ADR-079).
- **ADR-008 ✓** arbiter+classes `core/`, shim+loop `orchestra/` (core→orchestra import YOK). **ADR-010 ✓** yeni runtime dependency YOK (node:fs + tek-dosya .mjs; zod zaten var).

---

## Task 1: resource-class types + classes çekirdeği (şema/match/merge/auto-capacity)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/core/resource-class-types.ts, src/core/resource-classes.ts, tests/core/resource-classes.test.ts
- Scope: src/core/, tests/core/

### Description
Plan Faz 0.1+0.2. (1) `resource-class-types.ts`: `ResourcePolicy='queue'|'reject'`, `Capacity=number|'auto'`, `ResourceClass{match[],binaries[],pool,capacity,policy,ttlSeconds:number|null,enabled?,tenant?,scope?}`, `ResourcePool{capacity}`, `LeaseRequest`, `LeaseGrant`, `LedgerEntry{holder,classId,seenAt,grantedAt?,releasedAt?,waitMs,pid?}`, `LeaseStatus{classId,pool,capacity,granted,waiting,longestWaitMs}` (tipler-only). (2) `resource-classes.ts`: `BUILTIN_RESOURCE_CLASSES` (heavy-test/package-install/native-build/db-migration — spec §11), `BUILTIN_RESOURCE_POOLS={heavy:{capacity:'auto'}}`, Zod `CLASS_SCHEMA`, `validateResourceClasses` (geçersiz regex/capacity<1/policy-enum/binary-charset `^[a-zA-Z0-9._-]+$`/**denylist {node,sh,bash,env,claude,codex,gemini}** self-deadlock guard F2-F10), `mergeResourceClasses` (3-katman per-key; `enabled:false`→sınıfı düşür), `matchCommandToClass(cmd,classes)`, `resolveAutoCapacity(kind)` (sınıf `max(1,min(3,floor(GB/16),floor(cores/4)))` · havuz `max(1,min(4,floor(GB/12),floor(cores/3)))` — RAM=`detectHostMemory().totalGB`, cores=`detectSystemCapacity().cores`), `resolveCapacity(c,kind)`. Tam kod örneği: plan Faz 0.2.

**Kanıt:** `npx vitest run tests/core/resource-classes.test.ts` yeşil; `grep -c "BUILTIN_RESOURCE_CLASSES\|validateResourceClasses\|resolveAutoCapacity" src/core/resource-classes.ts` ≥ 3. **Test:** 12+ (built-in seti, hepsi heavy-pool, db-migration reject/cap-1, bad-regex/capacity/policy/binary-charset/denylist red, override-match-yaşar, enabled:false-düşer, match-classify ×3).

---

## Task 2: config wiring — resource_classes/resource_pools + validatePartialConfig
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/config.ts, src/core/types.ts, tests/core/config-resource-classes.test.ts
- Scope: src/core/, tests/core/
- Dependencies: NNN-001

### Description
Plan Faz 0.3. `DeckentConfig`'e `resource_classes?: Record<string,Partial<ResourceClass>>` + `resource_pools?: Record<string,ResourcePool>` ekle (types.ts); config-key metadata nesnesine (config.ts `worker_memory_limit_by_kind:` `~:1743` yanına) iki giriş (default `undefined`, category 'Sprint'). `validateConfig(merged)`'e: `merged.resource_classes` varsa `validateResourceClasses(mergeResourceClasses(BUILTIN_RESOURCE_CLASSES, merged.resource_classes))` çağır (EFEKTİF set doğrulanır). Import stili sync ise üstte statik `.js` import. Davranış: yapılandırılmamışsa default config değişmez (opt-in). ÖNCE config.ts'in mevcut bir key-metadata + validateConfig yolunu oku.

**Kanıt:** `npx vitest run tests/core/config-resource-classes.test.ts` yeşil; `npx tsc --noEmit` temiz; `grep -c "resource_classes" src/core/config.ts` ≥ 2. **Test:** 3+ (default-undefined, bad-capacity red, valid-override geçer).

---

## Task 3: FileLeaseBackend — Host-Hakem çekirdeği (TÜM eşzamanlılık) (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: system-architect, typescript-expert, testing-expert
- Files: src/core/resource-arbiter.ts, tests/core/resource-arbiter-intake.test.ts, tests/core/resource-arbiter-capacity.test.ts, tests/core/resource-arbiter-release.test.ts, tests/core/resource-arbiter-reap.test.ts, tests/core/resource-arbiter-status.test.ts, tests/core/resource-arbiter-reject.test.ts, tests/core/resource-arbiter-failmode.test.ts, tests/core/resource-arbiter-stress.test.ts
- Scope: src/core/, tests/core/
- Dependencies: NNN-001

### Description
Plan Faz 1 (8 alt-task tek modülde — tek opus worker TDD ile bütün kurar; tek-yazar host ⇒ yarış sınıfı yok). `LeaseBackend` arayüzü + `FileLeaseBackend(root, classes, pools, now?=Date.now, isAlive?=pid-probe)` async I/O (node:fs/promises; ADR-087 — `file-lock.ts` sync deseni MİRAS ALINMAZ). `tick()`: (1) `arbiter-alive.json` yaz; (2) `release/*` markerlarını tüket (granted sil + ledger.releasedAt); (3) **probe-reap** iki AYRI eşik: `requests/` ts > **15sn** → düşür (ölü bekleyen kuyruğu dondurmaz — F2-F5); `granted/` ts > **60sn VE `!isAlive(pid)`** → reap (SIGKILL/OOM saniyeler, TTL son-çare — F2-F9); (4) intake: yeni request'e ledger'da `seenAt`+`pid` ata; (5) **grant arrival-order + ÇİFT KAPI**: `seenAt` sırasıyla, yalnız `grantedByClass<classCap` VE `grantedByPool<poolCap` ise grant (K6 sınıf-çaprazı — F3-B9); (6) `reject`-policy + kapı dolu → `rejected/<holder>.json` (queue DEĞİL, dürüst red — istemci non-zero → worker NO_GO); (7) `queue.json` snapshot yaz; (8) K8 fail-mode: tick body try/catch, 3-ardışık-fail → `degraded`, havuz-cap=1 + CRITICAL emit (injected emitter, default no-op), `isDegraded()`, reject-sınıfı degraded'da fail-closed. `status(classId?)` canlı dizinden okur (loop'suz CLI). Lease store: `.deckent/leases/{arbiter-alive,ledger,queue}.json + <classId>/{requests,granted,release,rejected}/<holder>.json`. holderId=`<taskId|manual>-<pid>-<nonce>` (istemci-side sayaç YOK). Tam kod: plan Faz 1.1-1.7. **Stress (1.8):** N=12 istek/2-sınıf/pool=3, seed'li 30-tick interleave + release → HER ARA DURUMDA `granted ≤ capacity` (sınıf+havuz) invariant'ı (Math.random YASAK — index-seed).

**Kanıt:** `npx vitest run tests/core/resource-arbiter-*.test.ts` yeşil (8 dosya); `grep -c "class FileLeaseBackend\|grantedByPool\|WAITER_STALE_MS\|HOLDER_STALE_MS\|isDegraded" src/core/resource-arbiter.ts` ≥ 4. **Test:** 20+ (intake/alive, FIFO-cap, pool-ceiling, release+promote, waiter-reap, holder-reap, status, reject-tek-grant, fail-degraded, **stress-invariant**).

---

## Task 4: arbiter-client.mjs — import'suz ince-istemci (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: assets/arbiter-client.mjs, tests/orchestra/arbiter-client.test.ts, tests/orchestra/arbiter-client-fidelity.test.ts
- Scope: assets/, tests/orchestra/
- Dependencies: NNN-003

### Description
Plan Faz 2. `assets/arbiter-client.mjs` — **import'suz** (yalnız node: core: fs/child_process/crypto/path). Kullanıcı container'ında deckent KURULU OLMASA da çalışır (node:24 imajda var — F3-B1 dogfood-körlüğü çözümü). CLI: `acquire <class> -- <cmd...>` (ve `--gate-only` modu: acquire→"granted" yazıp exit 0, caller komutu kendi koşar — preload için). Algoritma: holderId üret; taze `arbiter-alive.json` yok + `MAX_WAIT`(env, default 60sn) → **fail-open** + `bypass-log.jsonl` ekle → komutu koş; aksi `requests/<holder>.json` yaz, `POLL_MS`(default 1000) poll: `granted/` → gerçek komutu **child-spawn** (`exec` YASAK — F1-A1/F3-B2 deneyle kanıtlı), SIGTERM/SIGINT child'a ilet, `ts`'i 5sn'de bir yenile (granted dosyasını rewrite), child-exit → `release/<holder>.json` + child exit-code ile çık; `rejected/` → non-zero çık. Re-entrancy: `DECKENT_LEASE_HELD===class` ise acquire atla, doğrudan koş (vitest fork çocukları yeniden lease almaz — F1-E5). Testler gerçek subprocess + sahte-host harness (async spawn). Tam akış: plan Faz 2.1-2.2.

**Kanıt:** `npx vitest run tests/orchestra/arbiter-client*.test.ts` yeşil; `grep -c "release\|DECKENT_LEASE_HELD\|bypass-log\|child" assets/arbiter-client.mjs` ≥ 4; `grep -c "exec(" assets/arbiter-client.mjs` = 0. **Test:** 6+ (grant→çalıştır, alive-yok→fail-open+log, exit-code propagation 7→7, ts-renew, SIGTERM-forward+release, re-entrancy-skip).

---

## Task 5: lease-shim üretimi — enforcement matrisi (binary+preload+PM) (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/lease-shim.ts, tests/orchestra/lease-shim-binary.test.ts, tests/orchestra/lease-shim-preload.test.ts, tests/orchestra/lease-shim-pm.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: NNN-001, NNN-004

### Description
Plan Faz 3 (spec §8 kapsama matrisi — PATH-shim TEK BAŞINA yetmez: npm/npx `node_modules/.bin`'i öne koyar). `generateShims(root, classes)` üretir: (8.1) **binary PATH-shim** her `binaries[]` adı için (`.deckent/shims/current/<bin>`, 0755) — gerçek binary'yi **PATH'ten shim-dizini ÇIKARARAK mutlak yolla** çözer (`command -v`), PATH'i torunlar için OLDUĞU GİBİ bırakır (F1-E4), `arbiter-client.mjs acquire <class> -- "$REAL" "$@"`; ad denylist+charset re-doğrula. (8.2) **`preload.cjs`** (NODE_OPTIONS `--require`): `process.argv`→komut, yanındaki `classes.json` snapshot'la inline-match; eşleşir VE `DECKENT_LEASE_HELD!==class` ise `arbiter-client.mjs ... --gate-only` ile bloke-acquire + env-set (node_modules/.bin doğrudan + login-shell PATH-reset'e dayanıklı — F1-E6/F2-F1). (8.3) **PM-shim** (npm/npx/pnpm/yarn): `pm-classify.cjs` `package.json` script-gövdesini match eder (npm test→vitest), eşleşirse acquire+gerçek-PM, yoksa passthrough (bilinçli-delik §8.5 yorumla). `assets/arbiter-client.mjs`'i shims dizinine kopyala. `buildLeaseEnv({taskId,workerId,shimDir})` (PATH-prepend + NODE_OPTIONS + DECKENT_* — Task 7 tüketir). Tam kod: plan Faz 3.1-3.3.

**Kanıt:** `npx vitest run tests/orchestra/lease-shim-*.test.ts` yeşil; `grep -c "generateShims\|preload\|buildLeaseEnv\|pm-classify" src/orchestra/lease-shim.ts` ≥ 3. **Test:** 9+ (binary-shim 0755+abs-resolve+PATH-passthrough, preload-match+re-entrancy, PM npm-test→heavy-test, npm-install-direct, passthrough).

---

## Task 6: arbiter-loop driver — tick + singleton interval
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/arbiter-loop.ts, tests/orchestra/arbiter-loop.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: NNN-003

### Description
Plan Faz 4.1. `arbiterTick(root, classes, pools, emitter?)` — resolve edilmiş classes/pools'tan `FileLeaseBackend` kurar, `tick()` koşar, `status()` snapshot döner. `startArbiterLoop(root)` — `setInterval(1000)` **process-singleton** (modül-seviye ref; result-collector + standalone çift-koşmaz), iki-çağrı aynı handle. `stopArbiterLoop()` temizler. Classes/pools `loadConfig`+`mergeResourceClasses(BUILTIN, cfg.resource_classes)`'tan resolve; **auto-capacity host'ta BİR KEZ** snapshot (container-içi tutarsız hesap riski — F3-B3). Emitter yoksa no-op (Task 8 gerçeğini enjekte eder).

**Kanıt:** `npx vitest run tests/orchestra/arbiter-loop.test.ts` yeşil; `grep -c "startArbiterLoop\|arbiterTick\|stopArbiterLoop" src/orchestra/arbiter-loop.ts` ≥ 3. **Test:** 5+ (tick→grant snapshot, singleton aynı-handle, stop temizler, iki-istek birkaç-tick'te grant, emitter-no-op default).

---

## Task 7: 3-backend env enjeksiyonu (PATH+NODE_OPTIONS+DECKENT_*)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/spawn-backend-docker.ts, src/orchestra/tmux.ts, src/orchestra/spawn-backend.ts, tests/orchestra/spawn-env-injection.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: NNN-005

### Description
Plan Faz 4.2. Üç spawn yolunun env builder'ı `buildLeaseEnv({taskId,workerId,shimDir})` (Task 5) tüketir → env'de `DECKENT_TASK_ID` + `DECKENT_WORKER_ID` + `shimDir`-prepend PATH + `--require .../preload.cjs` içeren NODE_OPTIONS. Docker bugün yalnız `DECKENT_TASK_ID` (`:724`) → WORKER_ID+PATH+NODE_OPTIONS ekle; tmux (`:150` çevresi) + subprocess hepsini ekle. Shim'ler sprint-başı spawn-anında bir kez üretilir (`generateShims`). Davranış: `resource_classes` yoksa shim üretilmez/env eklenmez (opt-in korunur). ÖNCE her backend'in mevcut env/PATH kurulum noktasını oku.

**Kanıt:** `npx vitest run tests/orchestra/spawn-env-injection.test.ts` yeşil; `grep -c "buildLeaseEnv\|DECKENT_WORKER_ID\|NODE_OPTIONS" src/orchestra/spawn-backend-docker.ts src/orchestra/tmux.ts src/orchestra/spawn-backend.ts | awk -F: '{s+=$2} END{print s}'` ≥ 3. **Test:** 6+ (3 backend × env-alanları + opt-in-yokken-değişmez).

---

## Task 8: host-side PROGRESS/notify emit + result-collector hook
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/arbiter-loop.ts, src/orchestra/result-collector.ts, tests/orchestra/arbiter-emit.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: NNN-006

### Description
Plan Faz 4.3 (spec §15 — emit YALNIZ host'ta; shim emit edemez, F3-B4). `arbiterTick`'e gerçek emitter enjekte: `emitProgress` (`event-stream.ts:610`) + `notifyProgress` (`notify.ts:98`); grant/queue-değişim ve bir-kez uzun-bekleme uyarısı (>sınıf-TTL) emit eder. `result-collector.ts` `dispatchTick` (`:787`) içine `arbiterTick(root,...)` çağrısı ekle → sprint boyunca her dispatch döngüsünde hakem koşar (ayrı interval'a gerek kalmaz; singleton korunur). Fail-safe (emit hatası sprint düşürmez). ÖNCE dispatchTick + emitProgress imzasını oku. (NNN-006'nın arbiter-loop.ts'i + result-collector.ts'i değiştirir → dep NNN-006; result-collector NNN-009/010'dan ÖNCE.)

**Kanıt:** `npx vitest run tests/orchestra/arbiter-emit.test.ts` yeşil; `grep -c "emitProgress\|notifyProgress\|arbiterTick" src/orchestra/arbiter-loop.ts src/orchestra/result-collector.ts | awk -F: '{s+=$2} END{print s}'` ≥ 2. **Test:** 5+ (waiting>0→emit çağrılır, grant→emit, uzun-bekleme bir-kez, emit-hata sprint-düşürmez, dispatch-hook).

---

## Task 9: K2 saat-donması — host aktif-süre muhasebesi + deadline (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: performance-analyzer
- Skills: typescript-expert, performance-optimizer, testing-expert
- Files: src/core/resource-arbiter.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/result-collector.ts, src/providers/subprocess.ts, tests/core/resource-arbiter-accounting.test.ts, tests/orchestra/k2-deadline.test.ts
- Scope: src/core/, src/orchestra/, src/providers/, tests/
- Dependencies: NNN-003, NNN-007, NNN-008

### Description
Plan Faz 5 (spec §9 — v1'in "watchdog hb'ye bakar" kontratı 3 kez çürüdü: container-içi sabit `timeout $TIMEOUT` host'tan uzatılamaz F1-C1; hb-daemon 15sn'de ezer F2-C2; Auditor JSON-timestamp okur F1-C3). v2: (1) **muhasebe host-ledger'da** — holder başına bekleme aralıkları toplanır (`waitMs`), `effectiveElapsed = duvar − Σbekleme`; `accounting(holder)` API. (2) **hassas deadline host'ta** — `effectiveElapsed > task_timeout` → host worker'ı öldürür (mevcut docker-stop/pid-kill) + dürüst `.timeout`; subprocess `setTimeout` (`subprocess.ts:184`) lease-aware. (3) **container-içi `timeout` BACKSTOP'a iner** — değer `task_timeout + max_wait_budget` (config default = task_timeout), spawn-script tek-satır. **hb'ye lease durumu YAZILMAZ (K7)** → WAITING_LEASE sentineli YOK, dual-writer/sahte-bekleme istismarı sınıfı yok (S2-B4/B5). Auditor değişmez (Signal-B canlılık bekleyeni zaten stale saymaz — `auditor.ts:386`). ÖNCE spawn-docker `:652-656` timeout + subprocess `:184` + result-collector deadline yolunu oku. (resource-arbiter←3, spawn-docker←7, result-collector←8.)

**Kanıt:** `npx vitest run tests/core/resource-arbiter-accounting.test.ts tests/orchestra/k2-deadline.test.ts` yeşil; `grep -c "effectiveElapsed\|waitMs\|max_wait_budget\|accounting" src/core/resource-arbiter.ts src/orchestra/spawn-backend-docker.ts | awk -F: '{s+=$2} END{print s}'` ≥ 3. **Test:** 6+ (10sn-bekleme waitMs≈10000, effectiveElapsed bekleme-hariç, backstop=task+wait, host-kill effectiveElapsed'la, kuyrukta-bekleyen kill-olmaz, subprocess lease-aware).

---

## Task 10: L1 dispatch-deferral — expectedResourceClasses + saturation filter
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/task-builder.ts, src/orchestra/result-collector.ts, docs/reference/api-surface.md, tests/orchestra/task-builder-resourceclass.test.ts, tests/orchestra/dispatch-saturation.test.ts
- Scope: src/orchestra/, docs/reference/, tests/orchestra/
- Dependencies: NNN-001, NNN-009

### Description
Plan Faz 6 (spec §6 L1 — OPTİMİZASYON, doğruluk hâlâ L3'te). (1) `task-builder.ts`: DIRECTIVES `- ResourceClass: heavy-test` satırını parse → task JSON `expectedResourceClasses?: string[]` (mevcut `Agent:`/`Skills:` override deseni); `api-surface.md` `.tasks` şemasına alan. (2) `result-collector.ts planDispatch` (`:227`): `queue.json` snapshot'tan doygun sınıfı oku → `expectedResourceClasses`'ı doygun-sınıf içeren ready-task'ı bu tick **ertele**, çakışmayanı seç (saf filtre, TOPP-uyumlu dispatch-deferral); **reject-policy sınıfına dokunan task'lar ASLA aynı pass'te** (F3-B18 retry-burn önler). ÖNCE task-builder override-parse + planDispatch eligible-seçim yolunu oku. (result-collector NNN-009'dan SONRA — aynı dosya.)

**Kanıt:** `npx vitest run tests/orchestra/task-builder-resourceclass.test.ts tests/orchestra/dispatch-saturation.test.ts` yeşil; `grep -c "expectedResourceClasses" src/orchestra/task-builder.ts src/orchestra/result-collector.ts docs/reference/api-surface.md | awk -F: '{s+=$2} END{print s}'` ≥ 3. **Test:** 5+ (ResourceClass-parse, saturated-defer+non-conflict-pick, reject-sınıfı eş-dispatch-yok, api-surface alan).

---

## Task 11: deckent lease CLI (ls|release|clear|test) + i18n
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/lease.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/lease-command.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: NNN-003

### Description
Plan Faz 7.1 (Tier-1 user-surface — ADR-079 smoke). `register<Lease>(program)` (ADR-012): `deckent lease ls` (`FileLeaseBackend.status()` → sınıf/granted-capacity/waiting/longest-wait tablosu), `lease test "<cmd>"` (`matchCommandToClass` → sınıf veya `(none)` — dry-run debug F3-B12), `lease release <class> <holder>` (granted sil), `lease clear --stale` (stale temizle). TÜM string `getMessage` (en+tr): `lease.ls_header/test_match/test_none/released/stale_cleared`. CLI entry'ye register. ÖNCE mevcut bir `register<Name>` komutunu + status.ts okuma-desenini oku. (messages.ts NNN-012'den önce — chain.)

**Kanıt:** `npx vitest run tests/cli/lease-command.test.ts` yeşil; **Smoke (Tier-1):** `node dist/cli/entry.js lease ls` EXIT temiz + `node dist/cli/entry.js lease test "vitest run"` → `heavy-test`. **Test:** 6+ (ls-snapshot, test→heavy-test, test→none, release, clear-stale, i18n tr/en).

---

## Task 12: status + .dashboard kuyruk satırı + config-invalid surfacing
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/status.ts, src/monitor/auditor.ts, src/cli/commands/config.ts, src/cli/commands/doctor.ts, src/cli/helpers/messages.ts, tests/cli/status-queue-line.test.ts, tests/cli/config-resource-invalid.test.ts
- Scope: src/cli/, src/monitor/, tests/cli/
- Dependencies: NNN-003, NNN-011

### Description
Plan Faz 7.2+7.3. (1) `status.ts` + Auditor `.dashboard`: `queue.json`'dan sınıf-başına `granted/capacity + waiting + longest-wait` satırı ("neden yavaş?" cevabı — F3-B5); Auditor INFO satırı (alert DEĞİL, yeni stale-mantık YOK — K7). (2) `config.ts set`: `validatePartialConfig` hatasını dostça i18n mesaja sar (sınıf+alan+beklenen-tip); `doctor.ts`: runtime'da geçersiz sınıf → kalıcı bulgu (F3-B12). i18n `lease.config_invalid`/`lease.queue_summary` (en+tr). ÖNCE status.ts render + config set hata-yolu + doctor check desenini oku. (messages.ts NNN-011'den SONRA.)

**Kanıt:** `npx vitest run tests/cli/status-queue-line.test.ts tests/cli/config-resource-invalid.test.ts` yeşil; **Smoke:** `node dist/cli/entry.js config set resource_classes.heavy-test.capacity 0` EXIT≠0 + i18n mesaj. **Test:** 6+ (status-kuyruk-satırı, .dashboard-info, config-set-0→red, doctor-bulgu, i18n).

---

## Task 13: Tier-1 smoke — 3-worker serileşme (deckent-DIŞI fixture) + ADR-090
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: ci-guardian
- Skills: ci-testing, testing-expert
- Files: tests/e2e/arbiter-smoke.test.ts, tests/fixtures/arbiter-userproj/package.json, tests/fixtures/arbiter-userproj/sleep-test.mjs, docs/adr/090-resource-arbiter.md
- Scope: tests/, docs/adr/
- Dependencies: NNN-005, NNN-006, NNN-007
- ModelEffort: high

### Description
Plan Faz 8.3 + ADR. **Dogfood-körlüğü gate'i (F3-B1):** fixture `tests/fixtures/arbiter-userproj/` deckent DEĞİL — kendi `package.json`'ı (`"test":"node sleep-test.mjs"` ağır-test simülasyonu). Smoke: arbiter-loop fixture'a yönelik, 3 gerçek-subprocess "worker" fixture'ın `npm test`'ini shim+client üzerinden koşar, sınıf-capacity=1 → `queue.json`/event-log'dan **aynı anda ≤1 koştu + 3'ü de bitti** kanıtı (serileşme). Kanıtlar: client deckent-kurulu-OLMADAN çalışıyor. + `docs/adr/090-resource-arbiter.md` MADR v3 hibrit (Host-Hakem kararı, K5-K8, tehdit modeli A1-A5, kapsama matrisi, V1/V2). **CC sprint-sonu:** ADR'yi `store.insert({type:'adr',status:'accepted'})` + `deckent memory export` (md+db eş-zaman). async spawn (spawnSync YASAK).

**Kanıt:** `npx vitest run tests/e2e/arbiter-smoke.test.ts` yeşil (serileşme kanıtlı); `test -f docs/adr/090-resource-arbiter.md`. **Test:** 1 kapsamlı e2e (3-worker cap-1 serileşme, non-deckent fixture).

---

## Task 14: docs — cli-commands + features + DECKENT.md gotchas + MASTER-PLAN §4I
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/cli-commands.md, docs/reference/features.md, DECKENT.md, docs/MASTER-PLAN.md
- Scope: docs/, .
- Dependencies: NNN-011, NNN-012, NNN-013
- ModelEffort: low

### Description
Plan Faz 8.2. DİSKTEKİ koddan (inmemişleri yazma): `cli-commands.md`'ye `deckent lease ls|release|clear|test`; `features.md`'ye Resource-Arbiter satırı (host-hakem admission-control, izin-önce-eylem, iki-seviyeli kapasite); `DECKENT.md` Gotchas'a "test'leriniz kuyruklanıyorsa kasıtlı — `deckent lease ls`" + `resource_classes` config özeti; `MASTER-PLAN.md` §4I'yi ✅ işaretle. Mevcut format. (resource_classes şema + auto-capacity tablosu varsa config-referansına.)

**Kanıt:** `grep -ciE "deckent lease|resource_classes|resource.arbiter|admission" docs/reference/cli-commands.md docs/reference/features.md DECKENT.md | awk -F: '{s+=$2} END{print s}'` ≥ 3. **Test:** yok — .result YAZ.

---

**Beklenen:** 14 task (opus 4: çekirdek/client/shim/K2 · sonnet 8 · haiku 2). **Dependency-wave (deckent otomatik, dependency_pipeline_enabled=true):**
- **Wave-1:** 001 (deps-yok)
- **Wave-2:** 002←001 · 003←001
- **Wave-3:** 004←003 · 006←003 · 011←003
- **Wave-4:** 005←001,004 · 007←005 · 008←006 · 012←003,011
- **Wave-5:** 009←003,007,008 · 013←005,006,007
- **Wave-6:** 010←001,009
- **Wave-7:** 014←011,012,013

Aynı-dosya çakışmaları deps ile serileşti: `resource-arbiter.ts` (003→009) · `result-collector.ts` (008→009→010) · `spawn-backend-docker.ts` (007→009) · `arbiter-loop.ts` (006→008) · `messages.ts` (011→012). Hepsi opt-in/additive (resource_classes yoksa byte-bayt eski davranış) + i18n (en+tr) + fail-open + TDD-hermetik. **Sprint-sonu CC:** tsc + tüm testler + dashboard-tsc + Tier-1 smoke (lease ls/test, config-set-0, 3-worker serileşme) + ADR-090 md+db + commit/push + build:all + notlar. **Sonraki (V2):** capability-dispatch ERP lease · A3/A4 sertleştirme (RO-mount/HMAC/host-scoped/shell-init) · coalesce · öncelik · Brain-devri · dashboard panel · cross-machine.
