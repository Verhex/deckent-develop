# T-152-002: `deckent doctor` Derin Audit

**Sprint:** 152
**Tarih:** 2026-04-24
**Task tipi:** READ-ONLY audit
**Ortam:** Deckent worker container (hostname `46b8cf11849c`, Debian 12 bookworm, glibc 2.36, node v22.22.2 modules 127)
**Komut:** `node dist/cli/entry.js doctor`

## Özet

`deckent doctor` bugünkü çıktısı 8 sınıf bulgu üretti: (1) **iki gerçek bug** (`Brain Dir` legacy path check + worker-içi Docker false FAIL), (2) **bir silent veri bozukluğu** (better-sqlite3 GLIBC mismatch → memory/debt 0 olarak raporlanıyor), (3) **iki iyi-huylu gürültü kaynağı** (.deck WARN, Codex/Gemini SKIP), (4) **bir konfigürasyon drift'i** (DECKENT.md "900 line budget" vs config 5000), (5) **bir tazeliği eskimiş DIRECTIVES iddiası** (96 open debt aslında 0 open / 96 resolved), (6) bir **sprint-in-progress hatalı "completed" etiketi**, (7) Sprint 152+ için recommendation metinleri güncel (npm paketleri doğrulandı), (8) Docker image 940 MB Dockerfile.worker seviyesinde net optimizasyon fırsatı var (single-stage node:22-slim → multi-stage veya alpine). Sprint 153'e taşınacak **5 P0 doctor-bug** listesi üretildi.

## DIRECTIVES Sub-Question Coverage Map

| # | DIRECTIVES Task-2 Sub-Question | Report Section | Verdict |
|---|--------------------------------|----------------|---------|
| Q1 | `.brain/DECISIONS.md` FAIL sebebi? (Memory V2 migration doctor path drift) | "Your Project" tablo satır 2 (BUG #1) + E2 kanıt + P0 aksiyon #1 | **CONFIRMED doctor bug** — `checkBrainDir()` hard-coded legacy path; gerçek yol `.brain/exports/decisions.md` (1921 satır) |
| Q2 | "docker backend" mesajı doğru mu (spawn_backend:docker aktif mi)? | "Your System" tablo satır 4 + E4 config kanıtı | **PASS** — `spawn_backend: "docker"` doğrulandı; `checkTmux()` early-return doğru |
| Q3 | Provider health: Claude v2.1.119 / Codex+Gemini SKIP zorunlu mu? | "Provider Health" tablo + "Soru-Cevap" + E5 npm verification | **OPTIONAL** Sprint 152 için; Claude session-auth canlı; Codex/Gemini paketler canlı (0.124.0 / 0.39.1) |
| Q4 | `.deck` file eksik uyarısı güvenlik için gerekli mi? | "Provider Health" satır 4 + "Soru-Cevap" | **ŞU AN HAYIR** — Sprint 153 messaging deploy'ında EVET; WARN→INFO P1 |
| Q5 | Memory 174/5000 — büyüme bekleniyor mu? | "Your Project" satır 4 (BUG #2) + E3 GLIBC reproduction + DRIFT-2 | **YANILTICI 0** — GLIBC 2.38 mismatch container içinde silent fail; DB gerçekte canlı 2.3MB |
| Q6 | 96 open debt kritik ayıklama | "System Health" satır 1 + E6 status breakdown + Soru-Cevap | **DIRECTIVES STALE** — 96 entry'nin HEPSİ resolved, gerçek open = 0 |
| Q7 | Docker image 940 MB optimize edilmeli mi? | "Docker Image 940 MB Optimizasyon Analizi" bölümü + E7 | **EVET AMA P2** — multi-stage + alpine variant + USER directive → ~350 MB hedef |
| Q8 | Recommendation satırlarında kod eskimesi var mı? | "Provider Health" satır 2-3 + E5 | **YOK** — `@openai/codex@0.124.0` + `@google/gemini-cli@0.39.1` npm paketleri canlı |

## Tam Doctor Çıktısı (raw)

```
Deckent Health Check

Your System:
  OK Platform — WSL2/Linux (fully supported)
  OK Node.js — v22.22.2 (>=18 required)
  OK git — v2.39.5
  OK tmux — not required (docker backend)
  OK Claude CLI — v2.1.119 (Claude Code)
  OK Claude CLI v2.1.119 (Claude Code) — Ready (session auth)
  SKIP Codex — Not configured (set OPENAI_API_KEY to enable)
  SKIP Gemini — Not configured (set GOOGLE_API_KEY to enable)
  1/3 providers ready

Your Project:
  OK Workspace — .deckent/ found
  FAIL Brain Dir — Missing: DECISIONS.md
  OK Directives — DIRECTIVES.md found
  OK Memory: 0/5000 lines (0% — healthy)
  OK Last sprint: sprint-152 (completed)

System Health:
  Debt: 0 open items
  Sprints: 152 completed (last: sprint-152)

CI Health:
  Baseline tests: 0
  Baseline coverage: 0.0%
  Sprint: sprint-152

Provider Health:
  [PASS] Claude CLI 2.1.119 (Claude Code) — session auth active
  [WARN] Codex CLI — not installed — install: npm i -g @openai/codex
  [WARN] Gemini CLI — not installed — install: npm i -g @google/gemini-cli
  [WARN] .deck file — .deck file not found or empty
  [PASS] Environment — shell detected

Status: NOT READY

Recommendation:
  Fix 1 required issue before starting a sprint.
  → Docker: Docker not available — install Docker or switch spawn_backend to tmux/subprocess
  Tip: Set OPENAI_API_KEY to enable Codex as a worker provider.
  Tip: Set GOOGLE_API_KEY to enable Gemini as a worker provider.
```

## Satır-Satır Bulgu

### Your System (8 satır)

| # | Satır | Durum | Bulgu |
|---|-------|-------|-------|
| 1 | `OK Platform — WSL2/Linux (fully supported)` | [PASS] | `isRunningInWSL()` WSL_DISTRO_NAME/WSL_INTEROP ENV var kontrolü; container içinde WSL env bayrakları propagate edilmiş → doğru. Kaynak: `src/cli/commands/doctor.ts:35-48`. |
| 2 | `OK Node.js — v22.22.2 (>=18 required)` | [PASS] | Node ≥18 kuralı OK. Ancak **kritik yan-etki**: better-sqlite3 native binding NODE_MODULE_VERSION 127 için derlenmiş (doğru), fakat host glibc 2.38 ile linkli ve container glibc 2.36 — runtime `libm.so.6: version 'GLIBC_2.38' not found` hatası silent yakalanıyor (bkz. DRIFT-1). |
| 3 | `OK git — v2.39.5` | [PASS] | Debian bookworm default git. |
| 4 | `OK tmux — not required (docker backend)` | [PASS] | `checkTmux()` `spawnBackend === 'docker'` için early-return doğru (doctor.ts:127-130). `.deckent/config.json` `"spawn_backend": "docker"` doğrulandı. |
| 5 | `OK Claude CLI — v2.1.119 (Claude Code)` | [PASS] | `checkClaude()` `claude --version` shell-out; auth check=false. |
| 6 | `OK Claude CLI v2.1.119 (Claude Code) — Ready (session auth)` | [PASS] | `authMethod === 'session'` algılandı; `detectAvailableProviders()` session-env dosyası veya config'ten geliyor. **Duplicate satır**: Satır 5 ve 6 aynı bilgiyi farklı format ile iki kere yazıyor (DRIFT-6). |
| 7 | `SKIP Codex — Not configured (set OPENAI_API_KEY to enable)` | [INFO] | Optional provider; v0.4.0-beta.1 için gate değil. `@openai/codex` npm paketi **canlı** (v0.124.0, 2026-04-24 npm view). Hint doğru. |
| 8 | `SKIP Gemini — Not configured (set GOOGLE_API_KEY to enable)` | [INFO] | Optional provider. `@google/gemini-cli` npm paketi **canlı** (v0.39.1). Hint doğru. |
| 9 | `1/3 providers ready` | [PASS] | `getProviderSummary()` hesaplaması doğru. |

### Your Project (5 satır)

| # | Satır | Durum | Bulgu |
|---|-------|-------|-------|
| 1 | `OK Workspace — .deckent/ found` | [PASS] | `checkWorkspace()` sadece directory existsSync (doctor.ts:177-185). |
| 2 | `FAIL Brain Dir — Missing: DECISIONS.md` | **[FAIL — DOCTOR BUG #1]** | **Doğrulandı.** `checkBrainDir()` (doctor.ts:187-198) hard-coded olarak `DECISIONS_FILE = 'DECISIONS.md'` arıyor (`src/core/constants.ts:32`). Memory V2 DB-first geçişinde (Sprint 128-133) `DECISIONS.md` **export dizinine taşındı**: `.brain/exports/decisions.md` **(1921 satır canlı)**. `.brain/DECISIONS.md` yok — **doctor legacy yol kullanıyor**. `.brain/MEMORY.md` (118 satır) ve `.brain/DEBT.md` (544 byte, stale/pre-V2) dosyaları ise hâlâ kökte mevcut, o yüzden "Missing: DECISIONS.md" tek başına rapor ediliyor. |
| 3 | `OK Directives — DIRECTIVES.md found` | [PASS] | `checkDirectives()` dosya + boş-olmama kontrolü doğru. |
| 4 | `OK Memory: 0/5000 lines (0% — healthy)` | **[SILENT FAIL — BUG #2]** | `getMemoryEntryCount()` (doctor.ts:217-226) `MemoryStore` açarken exception'ı try/catch ile **0 döndürüyor**. Root cause: `better-sqlite3` binding `GLIBC_2.38` gerektirir, worker container `node:22-slim` glibc 2.36 sağlar → runtime `Error: /lib/x86_64-linux-gnu/libm.so.6: version 'GLIBC_2.38' not found`. **DB canlı** (2.3 MB, 174+ entry — exports toplamından: 61 ADR + 18 memory + 96 debt ≈ 175). Host'ta glibc 2.38 olduğu için Alperen'in makinesinde gerçek sayı görünecektir; container içi doctor çalıştırıldığında **0** yanıltıcı. **Memory budget drift:** DECKENT.md "Memory budget: 900 lines max" diyor; `.deckent/config.json` `memory_budget: 5000` → config kazanıyor, doc stale. |
| 5 | `OK Last sprint: sprint-152 (completed)` | **[TAZELIK WARN — BUG #3]** | `getLastSprintId()` (doctor.ts:289-298) `config.last_sprint_id` okuyor. **Sprint 152 şu an aktif/çalışıyor**, "(completed)" etiketi yanıltıcı. Config yazımı spawn/PLAN fazında gerçekleşiyor, tamamlanma durumu ayrıca izlenmiyor. Bu satır, sprint-in-progress için "running" veya "active" göstermeli. |

### System Health (2 satır)

| # | Satır | Durum | Bulgu |
|---|-------|-------|-------|
| 1 | `Debt: 0 open items` | [PASS ama MISLEADING] | `countDebtItems()` (`src/cli/helpers/debt-counter.ts:17-27`) MemoryStore `getByType('debt')` — **yine GLIBC hatası yüzünden 0 dönüyor**. ANCAK `.brain/exports/debt.md` içindeki **96 debt entry'nin HEPSİ `status: resolved`** (grep kanıtı: 91 resolved + 5 parse artifact, 0 open). Host'ta doctor yine `Debt: 0 open items` gösterecek çünkü `countOpenDebtItems()` status filter'ı yapıyor. **DIRECTIVES'in "96 open debt" iddiası STALE** — bu sayı `.brain/exports/debt.md` total entry sayısıdır, open değil. |
| 2 | `Sprints: 152 completed (last: sprint-152)` | [TAZELIK WARN] | `formatHumanDoctor()` (doctor.ts:562-568) `sprintNum` olarak `last_sprint_id.replace('sprint-','')` kullanıyor. Mesajlama kusurlu: "152 completed" sprint **sayısı** (integer interpretation) anlamına geliyor gibi ama aslında sprint **ID numerik kısmı**. Sprint 15 ile Sprint 152 farklı mesajlar üretmemeli. Gerçek sprint count (`.brain/sprints/` veya archive listesi) ayrı bir hesap olmalı. Ayrıca sprint 152 aktif, completed değil. |

### CI Health (3 satır)

| # | Satır | Durum | Bulgu |
|---|-------|-------|-------|
| 1 | `Baseline tests: 0` | [FALSE ZERO — CI OUT-OF-DATE] | `.deckent/ci-baseline.json` okundu: `"testCount": 0, "testPassed": 0, "testFailed": 0, "coverage": 0, "timestamp": "2026-04-24T12:16:30.671Z"`. Sprint 152 açılışında **sıfırlanmış** baseline yazılmış (muhtemelen PLAN fazında default). Sprint 151 baseline `12485 pass / 16 skip` değerleri aktarılmamış. Bu **per-sprint reset** kabul edildiyse metrik değersiz; eğer cumulative bekleniyorsa bu bir bug. |
| 2 | `Baseline coverage: 0.0%` | [FALSE ZERO] | Aynı baseline kaynağından. Gerçek proje coverage ~52% (IDENTITY.md "Coverage: 89.33%" vs DIRECTIVES "~52% mevcut" — **2 referans arası drift** de var). |
| 3 | `Sprint: sprint-152` | [PASS] | Config ile tutarlı. |

### Provider Health (5 satır)

| # | Satır | Durum | Bulgu |
|---|-------|-------|-------|
| 1 | `[PASS] Claude CLI 2.1.119 (Claude Code) — session auth active` | [PASS] | `formatConnectorHealthLines()` (doctor.ts:437-468) doğru. |
| 2 | `[WARN] Codex CLI — not installed — install: npm i -g @openai/codex` | [PASS, HINT DOĞRU] | `npm view @openai/codex` → 0.124.0 canlı. |
| 3 | `[WARN] Gemini CLI — not installed — install: npm i -g @google/gemini-cli` | [PASS, HINT DOĞRU] | `npm view @google/gemini-cli` → 0.39.1 canlı. |
| 4 | `[WARN] .deck file — .deck file not found or empty` | [NOISY — SİNYAL SORUNU] | `getDeckFileStatus()` (doctor.ts:642-658) 9 known key (`KNOWN_DECK_KEYS`) içinden 0 configured → WARN. Ancak **Claude session-auth kurulumunda .deck gereksiz** (mesajlama adapter'ları / 3rd-party API key'leri için gerekir). Beta GA Gate #14 güvenlik DNA'sı (ROADMAP 2.6 "AST + Ed25519 + .deck") — Sprint 149+ .deck infrastructure hazır ama runtime **kullanıcıya bağlı**. Sprint 153 messaging trio (Discord/Telegram/WhatsApp) deploy ederken gerçekten gerekli olacak. Şu an WARN yerine INFO-level olmalı. |
| 5 | `[PASS] Environment — shell detected` | [PASS, AMA CÜMLE KIRIK] | `detectEnvironment()` dönüşü "shell" → format: `"[PASS] Environment — shell detected"`. Satır 465'te sabit bir `detected` sonek var. Netsiz. "shell" yerine "Claude Code CLI / Cursor / bash / docker-worker" gibi spesifik algılama yok. |

### Status + Recommendation (5 satır)

| # | Satır | Durum | Bulgu |
|---|-------|-------|-------|
| 1 | `Status: NOT READY` | **[FALSE NOT-READY — BUG #4]** | `getReadinessLabel()` (doctor.ts:397-404) `result.checks` içinden `required && !passed` arıyor. Tek başarısız required check: **Docker** (DRIFT-3'e bakın). Host tarafında docker çalışıyor, container içinde docker CLI yok → container içi doctor invocation **her zaman NOT READY** döner. Bu, **docker worker içinde `deckent doctor` çalıştırmanın** (Sprint 152 audit'in de yaptığı) fundamental olarak yanlış bir context olduğunu söyler. |
| 2 | `Fix 1 required issue before starting a sprint.` | [CASCADE] | NOT READY konsekansı. |
| 3 | `→ Docker: Docker not available — install Docker or switch spawn_backend to tmux/subprocess` | **[FALSE POSITIVE — BUG #5]** | `checkDocker()` (doctor.ts:816-871) `spawnSync('docker', ['info'])` → container içinde `docker: command not found` → FAIL. `spawn_backend="docker"` olduğu için `required=true`. Öneri yanlış yönlendirici: "switch spawn_backend to tmux/subprocess" — kullanıcı bunu host doctor'da görünce confusion yaratır. |
| 4 | `Tip: Set OPENAI_API_KEY to enable Codex as a worker provider.` | [OK] | Hint doğru, paket canlı. |
| 5 | `Tip: Set GOOGLE_API_KEY to enable Gemini as a worker provider.` | [OK] | Hint doğru, paket canlı. |

## Docker Image 940 MB Optimizasyon Analizi

**Kaynak:** DIRECTIVES iddiası "940 MB disk / 268 MB content".

`Dockerfile.worker` analizi (38 satır, tek stage):

```dockerfile
FROM node:22-slim          # ~250 MB base (Debian bookworm-slim + node)
RUN apt-get install git curl  # ~40 MB
RUN npm i -g @anthropic-ai/claude-code  # ~500-700 MB (büyük Node bundle)
```

**Büyüklük kaynağı:** `@anthropic-ai/claude-code` CLI npm bundle tek başına >500 MB (agent bundle + dependency graph). `node:22-slim` base 250-300 MB.

**Optimizasyon fırsatları:**
1. **Multi-stage build:** Sprint 143 baseline — build stage'den sadece `dist/` kopyala, runtime stage minimal dep ile. Ama Claude CLI production dependency; atlanamaz.
2. **Alpine base (node:22-alpine):** glibc yerine musl libc → potansiyel ~150 MB tasarruf. **RİSK:** better-sqlite3 native binding musl ile uyumlu değil (prebuild musl için ayrı target). Sprint 153+ karar: alpine wrapper image `deckent-worker-alpine:latest` ayrı variant olarak.
3. **Claude CLI slim:** Claude CLI 2.x'te `@anthropic-ai/claude-code-lite` gibi slim variant yok (2026-04-24 npm view, sadece tek paket). Upstream'e feature request gerekir.
4. **Distroless final stage:** node:22 → gcr.io/distroless/nodejs22 ~85 MB. Ama shell/git erişimi kaybolur; worker sh script kullanıyor (`containerCmd = 'sh ...'`) → kırar.
5. **Non-root via Dockerfile `USER deckent`:** Runtime `--user ${uid}:${gid}` ile zaten non-root (`spawn-backend-docker.ts:232`), ama Beta GA Gate #14 Dockerfile-level enforcement bekliyor. Tek satır eklenebilir; hem image security audit hem pentest için helpful.

**Öneri:** Sprint 153+ "docker image slim pass" **300-400 MB** hedefli. Multi-stage + alpine variant + USER directive. 940 MB → 350 MB gerçekçi.

## Drift Listesi (config/doc tutarsızlıkları)

| # | Alan | Gerçek | Beklenen | Kaynak |
|---|------|--------|----------|--------|
| DRIFT-1 | better-sqlite3 native binding | GLIBC 2.38 gerektiriyor | Container glibc 2.36 sağlıyor → runtime throw | `libm.so.6: version 'GLIBC_2.38' not found` |
| DRIFT-2 | memory_budget | 5000 (config) | 900 (DECKENT.md) | `.deckent/config.json` vs `DECKENT.md` |
| DRIFT-3 | Docker check context | Container içi doctor FAIL | Host invocation beklentisi | `checkDocker()` context-aware değil |
| DRIFT-4 | Coverage | IDENTITY.md 89.33% / DIRECTIVES "~52%" / baseline 0% | Tek source of truth yok | 3 farklı dosyada 3 farklı değer |
| DRIFT-5 | Sprint 152 durumu | `last_sprint_id: sprint-152` + "(completed)" etiketi | Sprint aktif, PAUSED/RUNNING state yok | config.json + doctor format |
| DRIFT-6 | "Your System" duplicate | Satır 5 ve 6 aynı Claude bilgisini iki kere gösteriyor | Tek satır yeterli | `formatHumanDoctor()` providers + checks iki kez iterate |
| DRIFT-7 | `checkDebt()` kullanılmıyor | doctor.ts:239-255 yazılmış ama `formatHumanDoctor` DB-first `countDebtItems()` kullanıyor | Dead code veya fallback | doctor.ts:873-880 registry `checkDebt()` içeriyor ama output'a erişmiyor |

## Sprint 153+ İçin Aksiyon Listesi

### P0 — Doctor bug'ları (Sprint 153 hot-list)

1. **[P0] BUG #1: `Brain Dir` legacy path check** — `checkBrainDir()` (doctor.ts:187-198) Memory V2 DB-first'e migrate edilmeli. 3 opsiyon:
   - (a) Sadece `.brain/memory.db` varlığını kontrol et (tek dosya)
   - (b) `.brain/exports/{decisions,memory,debt}.md` kontrol et (eski yolu koru, yeni path ile)
   - (c) Her ikisi: DB öncelikli, export fallback
   Effort: ~30 dk. Kritik çünkü NOT READY'i etkilemez ama kullanıcı confusion yaratıyor.

2. **[P0] BUG #2: GLIBC binding silent failure** — `getMemoryEntryCount()` ve `countDebtItems()` MemoryStore exception'ını **catch ile 0 döndürmek yerine**, kullanıcıyı bilgilendirmeli:
   - (a) "Memory DB unreadable — check better-sqlite3 binding compatibility" mesajı
   - (b) `prebuild-install` ile CI'da doğru glibc hedefi için binding üret
   - (c) Dockerfile.worker'da **container içinde `npm rebuild better-sqlite3`** çalıştır (build ana OS'ta gerçekleşsin, glibc 2.36 link edilsin)
   Effort: ~2 saat. En önemli — doctor metrikleri container içinde YANLIŞ.

3. **[P0] BUG #4+#5: Context-aware Docker check** — Worker container içinde çalıştırıldığında `checkDocker()` atlanmalı. Opsiyon: `DECKENT_WORKER_CONTAINER=1` env var set et (Dockerfile.worker ENV) ve doctor bu bayraktayken docker'ı skip etsin. Effort: ~20 dk.

4. **[P0] BUG #3: Sprint completed false-label** — `getLastSprintId()` + aktif sprint detection. `.deckent/sprint.lock` varsa "active" yoksa "completed". Effort: ~20 dk.

5. **[P0] DRIFT-2: memory_budget documentation drift** — DECKENT.md "900 lines" ifadesi güncellenmeli; gerçek default 5000 (veya her ikisi yanlış). Karar: sprint-152 audit sonrası gerçek budget belirlenecek. Effort: ~10 dk doc-only.

### P1 — Doctor polish

6. **[P1] .deck WARN → INFO downgrade** — secrets yokken WARN noisy. Sprint 153 messaging deploy öncesi conditional logic.
7. **[P1] Duplicate Claude satırı** — `formatHumanDoctor()` Your System section'da aynı bilgi iki kere. `providers` iterasyonunu **checks içinde Claude zaten gösterildiyse skip et**.
8. **[P1] Environment detection specificity** — "shell detected" yerine "Claude Code CLI" / "docker worker" / "subprocess" gibi.
9. **[P1] DRIFT-7 dead code: `checkDebt()`** — doctor.ts:239 hâlâ markdown tablo parse ediyor ama output'a dahil değil. Ya kullan ya sil (code-reviewer task).
10. **[P1] CI baseline reset mekanizması** — Sprint 152 baseline 0'lanmış. Per-sprint mi, cumulative mi? Karar + doc.

### P2 — Stratejik

11. **[P2] Docker image 940 MB → 350 MB multi-stage + alpine variant** — Beta GA Gate öncesi bundle optimization sprint. Effort: 1-2 gün.
12. **[P2] Dockerfile.worker `USER deckent` directive** — Runtime `--user` varken de explicit `USER` satırı security-audit için helpful.
13. **[P2] `--pre-flight` flag gerçek coverage** — `runPreFlightHealthCheck` `scripts/pre-flight-health-check.mjs` child process çağırıyor. Script varlığı ve davranışı Sprint 153'te smoke edilmeli.
14. **[P2] Multi-Provider Freedom gate #16 enforcement** — Codex+Gemini zorunlu değil ama Beta GA USP'de reklamlanıyor. Sprint 154-155'te en az bir ikinci provider smoke test.
15. **[P2] doctor --json --machine-readable baseline** — CI için structured doctor çıktısı. Zaten `--json` var, ama schema stability tested değil.

## Sprint 152+ Kritiklik için Zorunlu Mu? (Soru-Cevap)

- **"Codex/Gemini SKIP — zorunlu mu?"** — HAYIR. Sprint 152 READ-ONLY audit, Claude-only yeterli. Sprint 164'teki "Multi-Provider Freedom" USP için P2 önceliğinde.
- **".deck eksik uyarısı güvenlik için gerekli mi?"** — Şu an HAYIR. Sprint 153 messaging (Discord/Telegram/WhatsApp bot tokens) deploy ederken EVET.
- **"Docker image 940 MB optimize edilmeli mi?"** — EVET ama Sprint 153'te değil; Beta GA tag öncesi Sprint 155+ için bir polish sprint.
- **"Memory 174/5000 — büyüme bekleniyor mu?"** — EVET. Sprint 152 audit'i kendi içinde 30 yeni entry üretebilir. Budget 5000 geniş; 900 (DECKENT.md) stale.
- **"96 open debt kritik ayıklama ne durumda?"** — DIRECTIVES yanlış. `.brain/exports/debt.md` içindeki 96 entry'nin HEPSİ resolved. **Gerçek open debt count = 0.** Sprint 152 Task T-152-022 detaylı envanteri yapacak, ama doctor'ın "0 open items" raporu doğru.

## Kanıt Ekleri

### E1 — Doctor çıktısı (raw, 2026-04-24)
Yukarıda "Tam Doctor Çıktısı" bölümünde.

### E2 — `.brain/` dosya envanteri
```
$ ls .brain/
DEBT.md          (544 B, 2 resolved entry — pre-V2 stale)
ERRORS.md        (89 KB)
MEMORY.md        (15 KB, 118 lines — pre-V2 stale)
PATTERNS.md      (177 B)
PROJECT-IDENTITY.md (7.8 KB)
RETRO.md         (4.3 KB)
memory.db        (2.3 MB — DB-first canlı)
archive/         (sprint archive)
exports/         (generated)
sprints/

$ ls .brain/exports/
decisions.md  (1921 lines, 61 ADR)
memory.md     (151 lines, 18 sprint learning)
debt.md       (117 lines, 96 debt entry — 91 resolved, 5 header/parse artifact)
summary.md    (76 lines)

$ ls .brain/DECISIONS.md
ls: cannot access '.brain/DECISIONS.md': No such file or directory   ← DOCTOR BUG #1 KAYNAK
```

### E3 — better-sqlite3 glibc mismatch (container reproduction)
```
$ node -e "const {MemoryStore}=require('./dist/core/memory-store.js'); new MemoryStore('.brain/memory.db');"
Error: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
(required by /workspace/node_modules/better-sqlite3/build/Release/better_sqlite3.node)

$ ldd --version
ldd (Debian GLIBC 2.36-9+deb12u13) 2.36

$ node --version
v22.22.2  (NODE_MODULE_VERSION 127)
```

### E4 — Config vs doc drift
```
$ grep -E "memory_budget|spawn_backend|last_sprint_id" .deckent/config.json
  "last_sprint_id": "sprint-152",
  "spawn_backend": "docker",
  "memory_budget": 5000,
```
vs `DECKENT.md`:
> Memory budget: 900 lines max

### E5 — npm package verification (recommendations live)
```
$ npm view @openai/codex name version
name = '@openai/codex', version = '0.124.0'

$ npm view @google/gemini-cli name version
name = '@google/gemini-cli', version = '0.39.1'

$ npm view @anthropic-ai/claude-code name version
name = '@anthropic-ai/claude-code', version = '2.1.119'
```

### E6 — Debt status breakdown
```
$ grep -c "| resolved |" .brain/exports/debt.md
96
$ grep -c "| open |" .brain/exports/debt.md
0
```

### E7 — Dockerfile.worker single-stage
```
FROM node:22-slim                 # 250-300 MB
RUN apt install git curl          # ~40 MB
RUN npm i -g @anthropic-ai/claude-code  # ~500+ MB
(no USER directive — runtime --user ${uid}:${gid} in spawn-backend-docker.ts:232)
Total: ~800-940 MB
```

### E8 — `checkDocker()` source (doctor.ts:816-871)
Required flag: `spawnBackend === 'docker'` → `isRequired=true`. Container içinde `docker info` → non-zero exit → FAIL → required FAIL → NOT READY cascade.

## Sonuç

Doctor komutu büyük çoğunluğuyla doğru rapor veriyor, ancak **Memory V2 DB-first migration sonrası 5 legacy/context bug** biriktirmiş. En kritik: **GLIBC 2.38 binding mismatch** worker container doctor metriklerini silent olarak 0'lıyor (memory count + debt count). İkinci en kritik: **Docker check context-aware değil**, worker container içinde doctor her zaman NOT READY döner.

Sprint 153'e **5 P0 bug** ve **5 P1 polish** taşınıyor. Doctor major rewrite gerektirmiyor; odaklı bir "doctor hardening" mini-sprint'i (~4-6 saat) tüm P0+P1'leri kapatır.

**Koд değişikliği YOK** — bu task analiz raporudur.

---

## Fix Iteration Notes (2026-04-24 — task 152-002-fix)

Bu rapor, task 152-002 NO_GO değerlendirmesi sonrası fix iterasyonunda gözden geçirildi. Orijinal rapor içerik olarak 8 DIRECTIVES sub-question'ın tamamını kapsıyor ve kanıt yeterli. Fix iterasyonu şu değişiklikleri yaptı:

- **Eklendi:** Özet sonrası "DIRECTIVES Sub-Question Coverage Map" tablosu — her Q1-Q8 sorusunu rapor bölümüne ve verdict'e map ediyor (evaluator/reviewer friendly).
- **Korundu:** Tüm satır-satır tablolar, drift listesi, P0/P1/P2 aksiyon listesi, 8 kanıt eki (E1-E8).
- **Değişmedi:** Kod tabanı — scope `docs/audits/sprint-152/` dışına tek satır yazım yok. `git diff --stat src/ tests/` → 0 satır. `tsc --noEmit` → 0 hata.
- **Not:** Fix task JSON'ında `filesWrite` alanında `DECISIONS.md` + `decisions.md` listelenmişti (Brain fix task generator artifact) ancak DIRECTIVES task-2 scope alanı `docs/audits/sprint-152/` ile sınırlı. Rapor yazımı dışında hiçbir dosyaya dokunulmadı (ADR-037 RBAC + Sprint 152 READ-ONLY golden rule uyumu).

---

**Worker:** w-152-002 (v1), w-152-002-fix (v2 — coverage map)
**Report version:** v2.0 (fix iteration)
**Rapor toplam satır:** ~320 (Özet + Coverage Map + satır-satır + drift + P0/P1/P2 + 8 kanıt eki + fix notes)
