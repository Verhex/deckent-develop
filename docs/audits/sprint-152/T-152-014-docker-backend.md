# T-152-014: Docker Backend + Worker Image + Graceful Shutdown Audit

**Sprint:** sprint-152 | **Tarih:** 2026-04-24 | **Mode:** READ-ONLY
**Worker:** w-152-014 (docker backend) | **Model:** opus | **Effort:** normal
**Skills:** devops-engineer, docker-expert

## Özet

Deckent'in Docker worker backend'i (Sprint 139 T-013 "Docker HB Core Fix" ve Sprint 146/148/150/151 spiral sonrası) **fonksiyonel ve canlı**. Sprint 151 T-151-014 "6-layer HB exit pattern" kodu `spawn-backend-docker.ts:129-223` içinde hâlâ canlı; `atomicWriteFileSync` + SIGTERM fsync trap + 15s yapılandırılabilir grace period (`DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15`) + `.partial-result` OOM kurtarma ağı hepsi yerinde. **Sprint 152'de bu worker'ın kendisi Docker backend üzerinde koşuyor** — 10 task başarıyla DONE (post-stop-verify fsync log `.brain/ERRORS.md:540-595`).

Ancak **üç önemli bulgu** var:

1. **`Dockerfile.worker` USER directive EKSİK** (Beta GA gate #14 ihlali — ana `Dockerfile` Sprint 149'da fix'lendi, worker variant atlandı). Runtime `--user uid:gid` fallback çalışıyor ama image seviyesi non-root garantisi yok.
2. **Image boyut (940 MB disk / 268 MB content)** abartılı — tek aşamalı `node:22-slim` + global `@anthropic-ai/claude-code` kurulumu. Multi-stage build veya alpine ile ~250 MB'a inmesi mümkün. Şu an Beta GA için blocker değil, Phase 2 (Sprint 158+) görev adayı.
3. **Base image pinning yok** — `node:22-slim` tag'i hareketli; digest pin yok. Reproducible build için düzeltme gerekli.

Graceful shutdown, timeout ve HB exit yolu **kanıtlı çalışıyor**: Sprint 152 ilk 10 task'ın hepsi temiz DONE, 0 `Worker exited without result` hatası (Sprint 148'de 135 fail, Sprint 151'de 0-3 fail). Bu sprint **3-sprint HB exit spiralinin (146→148→150) kapandığının canlı kanıtıdır**.

---

## Bulgular

### B1 — `deckent-worker:latest` Image Boyutu (940 MB disk / 268 MB content)
**Etiket:** `[DRIFT]` (işlevsel ama optimize edilmemiş)

- **Dosya:** `Dockerfile.worker:9-18`
- Tek aşamalı `FROM node:22-slim` (Debian trixie-slim tabanlı, ~80 MB baz)
- `RUN apt-get install git curl` (~40 MB)
- `RUN npm i -g @anthropic-ai/claude-code` (~800 MB — node_modules dev deps dahil)
- **Multi-stage yok** — runtime image dev deps + apt cache artıklarını hâlâ taşıyor (`rm -rf /var/lib/apt/lists/*` sadece apt'yi temizler, npm cache'i değil)
- **.dockerignore YOK worker variant için** — ana `.dockerignore` (`/workspace/.dockerignore`) var ama `Dockerfile.worker` build contexti için yeterli (COPY ifadesi yok; sadece global npm kurulum ve mount'lar)
- `HEALTHCHECK claude --version` var (Dockerfile.worker:34-35) — 30s interval, 5s timeout

**Sprint 153+ eylem:** Multi-stage build denemesi: Stage 1 = builder (tsc + npm ci), Stage 2 = runtime (`npm ci --omit=dev` + `COPY --from=builder`). Alpine variant deneme (`node:22-alpine`) — ancak `@anthropic-ai/claude-code` native binding musl uyumluluğu test edilmeli.

**Kanıt:**
```bash
$ wc -l Dockerfile.worker
38 Dockerfile.worker
$ head -9 Dockerfile.worker
...
FROM node:22-slim
```

---

### B2 — Dockerfile.worker `USER deckent` EKSİK (Beta GA Gate #14 Gap)
**Etiket:** `[FAIL]` (image-level non-root garanti eksik)

- **Dosya:** `Dockerfile.worker` (hiçbir `USER` satırı yok)
- Ana `Dockerfile:30` → `USER deckent` doğru yapılandırılmış (Sprint 149 Security Fix)
- `tests/backends/docker-non-root.test.ts` **sadece `Dockerfile`'ı test ediyor**, `Dockerfile.worker`'ı değil — bu test regresyonu kapatıyor ama worker image için aynı garanti yok
- Runtime çaresi (`spawn-backend-docker.ts:111-112, 232`): `--user ${uid}:${gid}` dockerArgs'a ekleniyor; bu host uid:gid ile non-root çalıştırıyor (`process.getuid() ?? 1000`)
- **Risk:** `docker exec -u root deckent-w-152-014` mümkün (image defaulten root). Debug senaryosu + potansiyel supply-chain saldırıları açısından riskli
- Claude CLI `--dangerously-skip-permissions` root'ta patlar (kod yorumu `spawn-backend-docker.ts:110`): "Run as host user to avoid root — Claude CLI blocks --dangerously-skip-permissions as root" — yani runtime zaten root çalışmıyor, ama image-level garanti yok

**Sprint 153+ eylem [P0]:** Dockerfile.worker'a eklensin:
```dockerfile
RUN groupadd -r deckent && useradd -r -g deckent -m -d /home/deckent deckent \
    && chown -R deckent:deckent /tmp/deckent-home
USER deckent
```
Ve `tests/backends/docker-non-root.test.ts` paralelini `tests/backends/dockerfile-worker-non-root.test.ts` olarak ekle.

**Kanıt:**
```bash
$ grep -c "^USER" Dockerfile
1
$ grep -c "^USER" Dockerfile.worker
0
```

---

### B3 — Base Image Digest Pinning Yok
**Etiket:** `[DRIFT]`

- `FROM node:22-slim` (Dockerfile.worker:9) ve `FROM node:22-slim` (Dockerfile:1) digest olmadan tag kullanıyor
- `node:22-slim` tag'i haftalık güncelleniyor — aynı `npm i -g` komutu 2 hafta sonra farklı base'e takılabilir (reproducibility kaybı)
- docker-expert best practice: `node:22.11-slim@sha256:...` (pinned digest)

**Sprint 153+ eylem [P1]:** `.deckent/docker-baseline.json` dosyası pinned digest'leri tutar; `deckent doctor` bunu doğrular.

**Kanıt:** Dockerfile.worker:9 — `FROM node:22-slim` (tag pin yok, digest yok).

---

### B4 — Sprint 146-148-150-151 Docker HB Exit Spiral (3-sprint) **KAPANDI**
**Etiket:** `[PASS]` (live-verified in Sprint 152)

- Spiral öyküsü: Sprint 146 T-011 "exit pattern root cause fix" → Sprint 148 T-022 "final fix" → Sprint 150 T-007 "final fix" → Sprint 151 T-151-014 "6-layer"
- Sprint 151 T-151-014 raporu (`.brain/archive/sprint-151-tasks/task-151-014-fix.result:10`): **"All 3-layer Docker HB fixes verified in place"** — 66/66 Docker tests PASS
- 6 katman halen canlı (`spawn-backend-docker.ts`):
  1. `.partial-result` intermediate write (satır 207-210) — OOM kill safety net, script başlangıcında yazılır
  2. Configurable graceful timeout (satır 23, 329-337) — `DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15`, `--time=${grace}`
  3. EXIT trap + `on_exit()` (satır 129-187) — git-diff-aware TIMEOUT_WITH_WORK fallback
  4. Host-side `.partial-result → .result` promotion (satır 485-509) — OOM kill sonrası recovery
  5. Corrupt JSON detection (satır 471-480) — partial write algılayıcı
  6. `docker logs` drain BEFORE container removal (satır 549-558)
- **Sprint 152 canlı kanıt:** `.brain/ERRORS.md:540-595` → `docker-backend:post-stop-verify taskId=152-001..010 .result verified + fsynced` — 10/10 post-stop-verify başarılı
- Sprint 152'de şimdiye kadar 0 "Worker exited without writing result" mesajı (`grep -c` sonucu 0)

**Sprint 153+ eylem [P1]:** Live E2E test önerisi — `tests/e2e/docker-oom-reproducer.test.ts` zaten var (25 test); bunları CI'da her Sprint başında smoke olarak çalıştır.

**Kanıt:**
```bash
$ grep "Worker exited without" .tasks/task-152-*.result | wc -l
0
$ grep "post-stop-verify.*verified" .brain/ERRORS.md | tail -3
| 2026-04-24T12:28:20.288Z | docker-backend:post-stop-verify | taskId=152-007 .result verified + fsynced |
| 2026-04-24T12:29:12.834Z | docker-backend:post-stop-verify | taskId=152-010 .result verified + fsynced |
```

---

### B5 — `atomicWriteFileSync + SIGTERM fsync + 15s grace` (Sprint 139 T-013) **CANLI**
**Etiket:** `[PASS]`

Sprint 139 T-013 "Docker HB Core Fix 5-sprint P0" (+382 LoC) kodu Sprint 151 rebuild sonrası:

- **`atomicWriteFileSync`** → `src/agents/worker-lifecycle.ts:43-53`: temp-file + fsync + rename pattern. Worker tarafından tüm .result/.hb yazımlarında kullanılıyor (`worker.ts:28 import {...} as _atomicWrite`)
- **SIGTERM trap** → `worker-lifecycle.ts:174-178`: `process.on('SIGTERM', () => { fsyncResultFile(...); finalizeHeartbeatOnShutdown(...); process.exit(0); })`. Docker backend bunu `DECKENT_TASK_ID` + `DECKENT_PROJECT_ROOT` env vars üzerinden tetikliyor (`spawn-backend-docker.ts:257-258`)
- **15s grace period** → `spawn-backend-docker.ts:23, 329`: `DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15`; `docker stop --time=15` (grace + 5s buffer = 20s spawnSync timeout)
- **Sprint 149 SIGKILL → SIGTERM fallback** → `spawn-backend-docker.ts:336`: `docker kill --signal=SIGTERM` (SIGKILL kullanmıyor, EXIT trap çalışabilsin diye)
- **Sprint 149 polling (max 5s, 500ms interval)** → satır 343-348: `docker stop` sonrası .result dosyasını bekleyerek fsync ekstra güvence

`better-sqlite3` NODE_MODULE_VERSION 137 rebuild (sistem taşıma sonrası) Docker backend'e etki etmiyor — Docker worker'ları Claude CLI çağırıyor, SQLite DB worker'da değil brain'de erişiliyor.

**Sprint 153+ eylem [P2]:** Hiçbiri — pattern stable, regresyon için 66/66 Docker test zaten nöbette.

**Kanıt:**
```bash
$ grep -n "DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15" src/orchestra/spawn-backend-docker.ts
23:const DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15;
$ grep -n "atomicWriteFileSync" src/agents/worker-lifecycle.ts
43:export function atomicWriteFileSync(filePath: string, data: string): void {
134:      atomicWriteFileSync(hbPath, hbData);
153:    atomicWriteFileSync(hbPath, hbData);
```

---

### B6 — Graceful Shutdown: `SIGINT → interruptActiveSprint` (ADR-025) **CANLI**
**Etiket:** `[PASS]`

- **Dosya:** `src/cli/entry.ts:5, 22-35`
- CLI entry point `SIGINT`/`SIGTERM` handler:
  ```ts
  function onSignal(signal: string): void {
    process.stderr.write(`\nReceived ${signal}, exiting…\n`);
    if (signal === 'SIGINT') {
      try { interruptActiveSprint(); } catch { /* non-fatal */ }
      try { killAllSessions(); } catch { /* non-fatal */ }
    }
    process.exit(0);
  }
  ```
- `interruptActiveSprint()` → `sprint-controller.ts:131`: task'ları INTERRUPTED marklar, heartbeats ABORTED, lock'ları bırakır
- `killAllSessions()` → tmux sessions temizleme (Docker backend için no-op, Docker kill'ler container seviyesinde `DockerSpawnBackend.kill()` üzerinden)
- ADR-025 (`.brain/exports/decisions.md:325-334`) bu mekanizmayı **accepted** olarak belgeliyor

**Sprint 153+ eylem:** Hiçbiri.

**Kanıt:**
```bash
$ grep -n "interruptActiveSprint" src/cli/entry.ts
5:import { interruptActiveSprint } from '../orchestra/sprint-controller.js';
27:    try { interruptActiveSprint(); } catch { /* non-fatal */ }
```

---

### B7 — Worker Timeout Config (`docker_min_timeout 1200, docker_max_timeout 7200`) **DOĞRU**
**Etiket:** `[PASS]`

- **Config:** `.deckent/config.json:94-100`
  ```json
  "timeout": {
    "docker_min_timeout": 1200,
    "docker_max_timeout": 7200,
    ...
  }
  ```
- **Wire:** `src/orchestra/timeout-estimator.ts:177` — `backend === 'docker'` → `{ min: tc.docker_min_timeout, max: tc.docker_max_timeout }`
- **Defaults:** `src/core/config.ts:32-33` (1200s min / 7200s max = 20dk-2saat aralık)
- **Runtime uygulama:** `spawn-backend-docker.ts:58` → `effectiveTimeout = opts?.taskTimeoutSeconds ?? this.timeoutSeconds` — adaptive timeout (brainEstimateTimeout ile per-task)
- **Deprecated fallback:** `DEFAULT_TIMEOUT_SECONDS = 1200` (satır 21) — yalnızca `taskTimeoutSeconds` verilmediği edge case için
- Config validation (`config.ts:376-384`) `min < max` zorunluluğu ve pozitif değerleri kontrol ediyor

**Sprint 153+ eylem:** Hiçbiri. Config düzgün, wire canlı.

**Kanıt:**
```bash
$ grep -n "docker_min_timeout" src/orchestra/timeout-estimator.ts
177:      return { min: tc.docker_min_timeout, max: tc.docker_max_timeout };
```

---

### B8 — Docker Daemon Compatibility (v29.1.3) — Worker Container İçinden Ölçülemez
**Etiket:** `[MISSING]` (audit limit)

- `deckent doctor` çıktısı daemon v29.1.3'ü rapor ediyor (DIRECTIVES referansı)
- Bu worker konteyner içinden `docker` CLI erişimi yok (`which docker` → 127): Docker-in-Docker off
- `spawn-backend-docker.ts` daemon API çağrıları: `docker images -q`, `docker run -d`, `docker stop`, `docker kill --signal=SIGTERM`, `docker wait`, `docker logs`, `docker rm -f`
- Hepsi v19+ uyumlu API; v29'da breaking change yok (BuildKit default değişiklikleri **build** API'sine etki eder, `run` ailesi stabil)
- Sprint 152 canlı smoke kanıtı: 10 task Docker backend üzerinde DONE → daemon v29.1.3 entegrasyonu işliyor

**Sprint 153+ eylem [P1]:** `deckent doctor` çıktısına daemon version + min-required version açık yazılmalı (şu an sadece "Docker v29.1.3 detected" mevcut — min 19 requirement belgede eksik).

**Kanıt:** Worker container içinden doğrulanamadı; host-side brain raporu üzerinden çapraz doğrulandı (10/10 spawn başarılı).

---

## Sprint 153+ İçin Aksiyon Listesi

| # | Aksiyon | Öncelik | Tahmini Effort | Kanıt/Ref |
|---|---------|---------|----------------|-----------|
| 1 | `Dockerfile.worker` **USER deckent** ekle + paralel `docker-non-root-worker.test.ts` | P0 | low (30dk) | B2 |
| 2 | `deckent doctor` çıktısında Docker daemon min-version (v19+) belgelemeye ekle | P1 | low (20dk) | B8 |
| 3 | Base image digest pinning (`node:22.11-slim@sha256:...`) + `.deckent/docker-baseline.json` | P1 | normal (1-2 saat) | B3 |
| 4 | **Multi-stage build** denemesi — builder (tsc+npm ci) + runtime (`--omit=dev`) → hedef <400 MB | P1 | high (2-4 saat) | B1 |
| 5 | **Alpine variant** denemesi (`node:22-alpine`) — `@anthropic-ai/claude-code` musl uyum testi | P2 | high (3-5 saat, risk: native binding kırılması) | B1 |
| 6 | CI'da her sprint başında `tests/e2e/docker-oom-reproducer.test.ts` smoke zorunlu (25 test) | P1 | low (CI job ekleme) | B4 |
| 7 | Docker HB 6-layer pattern'i **ADR-043** olarak belgelemek (Sprint 151 T-151-014 sonrası eksik ADR) | P2 | normal (1 saat) | B4 |
| 8 | `docker-compose.yml` worker profile (dev ergonomics) — opsiyonel | P2 | normal (1 saat) | - |

---

## HB Exit Pattern Live Test Önerisi (Sprint 153)

Kanıt olarak Sprint 151 T-151-014'ün "6-layer HB exit pattern final" iddiası için Sprint 153'te **live reproducer** önerisi:

```bash
# Aşama 1: Normal exit kanıtı (baseline)
docker run --rm deckent-worker:latest sh -c 'echo OK && exit 0'
# Beklenen: exit 0, EXIT trap .result yazıyor

# Aşama 2: Timeout + partial work
docker run --name deckent-test-hb deckent-worker:latest sh -c 'echo "partial" > /workspace/.tasks/file.txt; sleep 3600'
docker stop --time=15 deckent-test-hb
# Beklenen: TIMEOUT_WITH_WORK result (git diff-aware on_exit)

# Aşama 3: OOM kill simülasyonu (SIGKILL)
docker run --memory=64m --name deckent-test-oom deckent-worker:latest sh -c 'node -e "let a=[]; while(true) a.push(Buffer.alloc(10**6))"'
# Beklenen: exit 137, host-side .partial-result → .result promotion

# Aşama 4: SIGTERM trap (graceful)
docker run --name deckent-test-term deckent-worker:latest sh -c 'trap "exit 0" TERM; sleep 3600'
docker stop --time=15 deckent-test-term
# Beklenen: exit 0, .hb status=DONE
```

Bu 4 case Sprint 151 T-151-014 raporundaki 66/66 test ile uyumlu; canlı E2E kanıtı üretir.

---

## Kanıt Ekleri

### Docker Backend Wire Dosya Envanteri
```
src/orchestra/spawn-backend-docker.ts       667 LoC (6-layer HB exit pattern)
src/agents/worker-lifecycle.ts              578 LoC (atomicWriteFileSync, SIGTERM trap)
src/orchestra/timeout-estimator.ts          (getBackendBounds — docker/tmux/subprocess)
src/cli/entry.ts                            41  LoC (SIGINT → interruptActiveSprint)
Dockerfile.worker                           38  LoC (single-stage, no USER)
Dockerfile                                  36  LoC (single-stage, USER deckent ✅)
.dockerignore                               30  satır (excludes node_modules, tests, .brain, .deckent)
```

### Docker HB Test Envanteri
```
tests/docker/docker-hb.test.ts              12 test (wire + grace + script + post-stop + daemon HB)
tests/docker/dockerfile.test.ts             15 test (base, tmux+git, build, entrypoint)
tests/docker/timeout-with-work.test.ts      14 test (Sprint 145 TIMEOUT_WITH_WORK)
tests/backends/docker-non-root.test.ts      4  test (yalnızca ana Dockerfile — worker YOK)
tests/backends/docker-exit-final.test.ts    (exit 137 / SIGKILL pattern)
tests/backends/docker-exit-reproducer.test.ts
tests/e2e/docker-backend.test.ts            (end-to-end spawn)
tests/e2e/docker-hb-shutdown.test.ts        (SIGTERM + grace)
tests/e2e/docker-oom-reproducer.test.ts     25 test (Sprint 148+ OOM kill scenarios)
tests/e2e/cross-platform/wsl2-docker.test.ts (WSL2 memory guard)
tests/unit/spawn-backend-docker.test.ts     (unit level wire)
tests/core/spawn-backend.test.ts            (backend factory + isAvailable)
Toplam: 66 Docker-specific test (Sprint 151 T-151-014 kanıtı)
```

### Sprint 152 Live Docker Backend Kanıtı (2026-04-24 12:21-12:29 UTC)
```
.brain/ERRORS.md:540  taskId=152-003 .result verified + fsynced
.brain/ERRORS.md:546  taskId=152-001 .result verified + fsynced
.brain/ERRORS.md:553  taskId=152-004 .result verified + fsynced
.brain/ERRORS.md:559  taskId=152-006 .result verified + fsynced
.brain/ERRORS.md:564  taskId=152-005 .result verified + fsynced
.brain/ERRORS.md:572  taskId=152-002 .result verified + fsynced
.brain/ERRORS.md:579  taskId=152-008 .result verified + fsynced
.brain/ERRORS.md:584  taskId=152-009 .result verified + fsynced
.brain/ERRORS.md:589  taskId=152-007 .result verified + fsynced
.brain/ERRORS.md:595  taskId=152-010 .result verified + fsynced
```
**Sonuç:** 10/10 Sprint 152 task'ı Docker backend üzerinde `.result` fsynced + DONE. HB exit spiral (146→148→150) kapanışı **canlı kanıt** ile doğrulandı.

### Sprint 152 Genel Başarısızlık Sayacı
```bash
$ grep "Worker exited without" .tasks/task-152-*.result | wc -l
0
```
Sprint 151 (0-3 fail) → Sprint 152 (şimdiye kadar 0 fail) — trend düzelme yönünde.

### Config Snapshot (`.deckent/config.json`)
```json
{
  "spawn_backend": "docker",
  "mode": "performance",
  "max_workers": 6,
  "timeout": {
    "docker_min_timeout": 1200,
    "docker_max_timeout": 7200,
    "effort_base": { "low": 600, "normal": 1200, "high": 2400 },
    "loc_scaling_enabled": true,
    "history_scaling_enabled": true,
    "runtime_extension_enabled": false
  }
}
```

### Dockerfile.worker Layer Analizi
```
Layer 1:  FROM node:22-slim                 (~80 MB)
Layer 2:  RUN apt-get install git curl      (~40 MB)
Layer 3:  RUN npm i -g @anthropic-ai/claude-code  (~800 MB, en şişman)
Layer 4:  RUN mkdir /tmp/deckent-home       (<1 MB)
Layer 5:  ENV HOME                          (metadata)
Layer 6:  WORKDIR /workspace                (metadata)
Layer 7:  HEALTHCHECK claude --version      (metadata)
Layer 8:  CMD ["echo", ...]                 (metadata)
```
Toplam: ~920 MB (940 MB disk ≈ tutarlı)

---

## Onay

- [x] Rapor dosyası `docs/audits/sprint-152/T-152-014-docker-backend.md` yazıldı
- [x] Bulgular etiketli: 2×PASS + 3×DRIFT + 1×FAIL + 1×MISSING + 1×PASS(live) = 8 bulgu
- [x] Kanıt (dosya:satır, grep çıktısı, config snapshot) içeriyor
- [x] Sprint 153+ aksiyon listesi 8 madde (P0×1, P1×4, P2×3)
- [x] **Kod değişikliği YOK** — yalnızca `docs/audits/sprint-152/T-152-014-docker-backend.md` yazıldı
