# Deckent — Tam-Kod Öz-Analizi (Final Rapor)

> **Tarih:** 2026-07-07 · **Yöntem:** read-only çok-ajanlı workflow — 41 dilim tam-okuma (sonnet-5, `Explore` tipi = yazma-aracı yok) + 3 mop-up ajanı + 11 kesit-lensi + canlı-binary probe (15 komut) + adversarial refutation turu + Fable sentezi. `tests/` **bilinçli hariç** (hedef: production-kod gerçekliği).
> **Kapsam:** 1.009 manifest dosyasından **1.008'i güvenilir okundu** (1 dosya analiz sırasındaki repo-temizliğinde silinmiş) · ~247K satır · src + scripts. Referans HEAD: `26e43689` (2026-07-07 12:17). dist probe-anında ~31 dk stale idi (§6).
> **Önceki turlar:** `.analysis/deckent-objective-audit-2026-07-07.md` (ilk iç-denetim) · `.analysis/deckent-deep-research-2026-07-07.md` (dış kanıt) · `.analysis/deckent-competitor-telemetry-round2-2026-07-07.md` (rakip+fiyat). Bu rapor onlardan bağımsız, **her dosyayı fiilen okuyan** en derin turdur.

# DECKENT TAM-KOD ÖZ-ANALİZİ — FİNAL SENTEZ RAPORU
**Tarih:** 2026-07-07 · **Kapsam:** 928/1009 src-dosyası + canlı-binary probe + 41 dilim + 6 lens · **Referans build:** dist @ 11:46 (src'den 1 commit / ~31 dk geride, bkz. §6)

---

## 1) TLDR

Deckent, kod-kanıtıyla: **dosya-tabanlı state (`.tasks/`, `.deckent/`, `.brain/memory.db`) üzerinde çalışan, deterministik 8-fazlı (PLAN→SPAWN→EVALUATE→FIX→RETRO→DECAY→CLEANUP) sprint-orkestrasyon motoru** + bunu saran 5 yüzey: ~90 CLI komutu, 37 REPL-slash, 46 MCP tool, ~24 API endpoint ailesi ve 8 çalışma modu — çok-provider (Claude/Codex/Gemini/Ollama/OpenAI-compat/OpenRouter/Bedrock) worker filosunu tmux/docker/subprocess backend'leriyle spawn eden gerçek bir üründür. Ana 5 yüzeyin **%80.5'i REAL** (190/236 satır), REPL-slash katmanı %100, MCP-tool katmanı 42/46 REAL; canlı probe 15 komuttan 14'ünü doğruladı. **En güçlü 3 gerçeklik:** (1) sprint yaşam-döngüsü makinesi olgun ve geçmiş-olay-sertleştirilmiş — checkpoint crash-resume, OOM/exit-137 trap'leri, worker self-honesty gate, cost-cascade breaker (`sprint-controller.ts:986-1732`); (2) veri katmanı disiplinli — SQLite WAL + FTS5, additive-only migration, decay catastrophic-batch guard, O_EXCL atomic file-lock (`core/file-lock.ts`); (3) MCP+REPL yüzeyleri neredeyse boşluksuz bağlı ve gerçek veri döndürüyor (canlı probe: history 233 sprint, usage $780.87/7g, kpi, recall FTS5). **En zayıf 3 gerçeklik:** (1) governance bir **fasad** — RBAC mainline spawn'da hiç çağrılmıyor + her yerde soft (`sprint-phases.ts:~965-1027`, `worker.ts:557-565`), ADR-compliance gate kendi crash'inde fail-open (`authority-enforcer.ts:600-629`); (2) sistemik **"build-ahead-of-wiring"** deseni — WorkerApprovalGate, cost_guard, `resumeSprint`, snapshot-restore, RPC yazma-handler'ları gibi ~40+ tam-inşa modülün sıfır canlı çağıranı var; (3) cross-provider **credential sızıntısı** — tüm provider secret'ları paylaşılan `process.env`'e yazılıyor, yalnız `subprocess.ts` scrub ediyor (`provider.ts:806-869`). Ayrıca canlı-reproduce edilmiş 1 gerçek crash var: `deckent skill list` v2-schema manifest'te exit 1 (`skill.ts:234`).

---

## 2) YETENEK MATRİSİ

### 2.1 Sayısal özet (ana 5 yüzey, 236 satır)

| Verdict | Adet | % |
|---|---|---|
| REAL | 190 | %80.5 |
| PARTIAL | 33 | %14.0 |
| UNWIRED | 11 | %4.7 |
| STUB | 2 | %0.8 |

| Yüzey | REAL | PARTIAL | UNWIRED | STUB |
|---|---|---|---|---|
| CLI (121: kullanıcı + eğitim/script) | 90 | 20 | 9 | 2 |
| REPL-slash (37) | 37 | 0 | 0 | 0 |
| MCP tool (46/46 kayıtlı) | 42 | 4 | 0 | 0 |
| API endpoint (24) | 16 | 6 | 2 | 0 |
| Mod (8) | 5 | 3 | 0 | 0 |

Ayrı sayılan ek katmanlar: MCP Resources 8/8 REAL; core derin-dalış (Approval alt-sistemi + config artıkları) **25 satır → 4 REAL / 21 UNWIRED-STUB** — iç mimaride ölü-kod yoğunluğu kullanıcı yüzeyinden belirgin şekilde yüksek.

### 2.2 REAL çekirdek (öne çıkanlar)
Tam sprint pipeline'ı (`start.ts:158-501` cost-gate/doctor/sandbox dahil), `do <goal>` golden-flow (`do.ts:187` → `golden-flow.ts:153`), bare-`deckent` native tool-calling REPL (`entry.ts:537-776`, default-ON), `serve` (probe: `/health` 200), agent/skill/memory/audit/config/docs/nervous/autonomous CLI aileleri, MCP'nin 42 tool'u, dashboard REST demeti (~25 route, `server.ts:697-1268`), embedded web-terminal + WS gateway (`server.ts:1953-2033`), SSE worker-log tailer (path-traversal guard'lı, `worker-logs.ts:59-254`).

### 2.3 KISMEN (kritik PARTIAL'lar)
| Öğe | Sorun | Kanıt |
|---|---|---|
| `skill list` | v2-manifest'te canlı crash (exit 1) | `skill.ts:234` `s.triggers.slice(0,3)` — probe ile doğrulandı |
| `run --auto-approve` | Bayrak yok sayılıyor, hep true | `run.ts:260` |
| `flow` | cron gerçek, event-trigger dispatch ölü | `flow-runtime.ts:37` |
| `rbac grant/revoke` | Yalnız process-içi Map, check okumuyor | `rbac.ts:36-46` |
| `init --repair` | `failedSteps` hiç dolmuyor — rapor kör | init.ts |
| Enterprise RBAC/rate API | Yaz-sonra-oku round-trip kırık (POST config'e, GET statik matris/canlı snapshot) | `enterprise-endpoint.ts:630-866` |
| `deckent_autonomous action=start` | Yalnız `.stop` marker siler, loop spawn etmez | tool description self-disclosed |
| `deckent_nervous_edit/undo` | Plan-only; `applyNervousBridgePlan`/`markUndone` hiç çağrılmıyor | nervous.ts |
| Embeddable SDK | Kod tam, `package.json` exports yayınlamıyor | S39 |
| `mission` modu | SQLite satırı yazılır ama default config'de drenaj eden engine (v2) kapalı — kalıcı inert | runtime-loop / config cast |
| `nervous` modu | Default-off; 3 detektör ACTION_REGISTRY uyuşmazlığından sessiz-ölü; maintenance-dışı eylem full-auto'da bile inbox-önerisine düşer | `decision-engine.ts:58-63` |

### 2.4 UNWIRED/STUB (yüzey katmanı)
`checkStartLimitGate` (`limits.ts:218-255`, start.ts import etmiyor) · `startAuditor` (`tmux.ts:333-350`, Sprint-14'te kasıtlı koparılmış) · RPC yazma metodları `run.start-detached`/`approval.decide` (`rpc-write-handlers.ts:190-201`, server import etmiyor) · `handleLogStream` (`output-stream.ts:301`) · ShareGPT pipeline (`pipeline.ts:305`) · Corpus Lint (STUB, kendi header itirafı) · `sync-to-product.mjs` (STUB, ADR-D-008 ile emekli) · 7 referanssız script (`agentic-do-verify`, `audit-user-surfaces`, backfill'ler, `hub-validate` [repo-dışına taşınmış], `multi-provider-smoke`, `prompt-linter`).

### 2.5 NEYİ YAPAMAZ (kesinleşmiş liste)
**Yapısal olarak imkânsız:**
1. Bir `flow` asla otomatik sprint/task tetikleyemez — `approveDispatch()`'in okuyucusu yok, `flow approve` alt-komutu da yok.
2. Nervous, maintenance-dışı hiçbir eylemi kendiliğinden yürütemez — full-auto'da bile inert Brain-inbox önerisi.
3. Nervous'un 3 detektörü (build-failure-recurrence, dead-event-stream, notification-delivery-health) hiçbir kanala ulaşamaz — sessizce yutulur.
4. `deckent_autonomous action=start` motoru gerçekten başlatmaz; asıl loop yalnız `deckent autonomous start` (terminal).
5. `autonomous-mission create-*` ile açılan mission default config'de asla çalışmaz (v2 engine tipsiz-cast arkasında kapalı; migration tek-yönlü).
6. API'den `run.start-detached`/`approval.decide` çağrılamaz — implemente ama route edilmemiş.
7. Enterprise RBAC/rate ayarı API'den yaz-sonra-oku yapılamaz.
8. `skill list` v2-schema manifest'li hiçbir projede çalışmaz (canlı crash).
9. Worker-taraf approval gate hiçbir seviyesiyle aktif değil (`WorkerApprovalGate` hiç `new` edilmiyor); Slack/Teams onay fan-out'u da bağlı değil.
10. `limits`, `start`'ı gerçekten engelleyemez (`checkStartLimitGate` unwired).
11. Embeddable SDK dış npm tüketicisi tarafından kullanılamaz.
12. ShareGPT pipeline + Corpus Lint hiçbir komuttan tetiklenemez.
13. `deckent_nervous_undo` hiçbir şeyi geri alamaz — compensating-action executor kod tabanında yok.

**Default-kapalı (mümkün ama aktifleştirilmemiş):** SIEM forward, marketplace imza-doğrulama, bot medya/ses/kimlik, approval-API decide, OIDC exchange, DeckBroker, `startAuditor` (kalıcı koparılmış).

**Yanıltıcı-raporlama:** `run --auto-approve=false` sessizce yok sayılır; `init --repair` başarısız adım raporlamaz; `doctor --pre-flight` npm-installed kurulumda sessizce devre-dışı (scripts/ pakete girmiyor).

---

## 3) TERMİNAL UYUM RAPORU + PLATFORM MATRİSİ

### 3.1 Terminal (severity sıralı)

**🔴 KRİTİK**
1. **Default REPL ~20 slash-komutu sessizce chat-metnine düşürüyor.** InputBar tam `SLASH_CATALOG`'u Tab-menüde gösteriyor (`app.tsx:1125`) ama `handleSubmit` (`app.tsx:907-1028`) yalnız ~15 komutu özel-durumluyor; `/nervous, /autonomous, /audit, /directives, /usage, /recall` vb. LLM'e düz metin gidiyor. `native-agent-bridge.ts`'de `resolveSlash` izi yok — komut ailesi yalnız `--legacy-loop`'ta çalışıyor. Menü vaat ediyor, motor yok sayıyor.
2. **`tool_surface` "ships ON by default" ama kalıcı-ölü.** `config.ts:1733-1737` default-on diyor; tek production caller `run.tsx` bayrağı hiç okumuyor/geçirmiyor — kullanıcı hiçbir yolla açamıyor.
3. **`repl_surface` default-ON flip'i (2026-07-06) i18n'siz gitti.** `run.tsx:425-446` labels'a `modeAsk/Run/Control` koymuyor, `approvalLabels` set edilmiyor → mode-indicator + ApprovalCard hep hardcoded İngilizce (`app.tsx:364,543,631,1095`) — `messages.ts:2352-2354`'te TR çevirileri hazır olmasına rağmen. TR-configured kullanıcıda canlı, default-görünür regresyon.

**🟠 MAJÖR**
4. `/nervous`'un ikinci, hiç-bağlanmamış "plan-object bridge" implementasyonu (`chat-slash-registry.ts:661-684`) — çift-implementasyon drift'i; aynı desen dashboard'da tekrarlıyor (`ApprovalsPanel.tsx` route edilmemiş, tek erişilebilir yüzey daha basit `NervousPage.tsx`).
5. **Sistemik i18n-kaçağı:** yüzeylerin ~yarısı 793-key en/tr kataloğunu bypass ediyor. Doğrulanmış: THINKING_VERBS ticker hep Türkçe (`chat-render-region.ts:87-96`), `entry.ts:687` tool-confirm hardcode TR, `chat-session.ts:95-105` LLM system-prompt TR-only; tam-EN taraf: `cost.ts`, `flow.ts`, `DebtPage.tsx`, `models.ts`; tam-TR taraf: SLASH_CATALOG açıklamaları, `enrich.ts` HINTS, `bot-agentic.ts` prompt. Her iki dil kullanıcısı da öngörülemez karışım görüyor.
6. tmux hard-dependency: attach/watch/cleanup/doctor — native Windows'ta dokümante-UNSUPPORTED (`doctor.ts:74-96`, `attach.ts:11-18` fallback'siz).
7. `repl_surface` ailesinin resume-picker + busy-controls label-key'leri `messages.ts`'de hiç yok — bağlansa bile çeviri sıfırdan yazılmalı.

**🟡 MİNÖR:** `health.session_warn` key'i yok + `registerSession` sıfır caller (eşzamanlı-oturum uyarısı uçtan-uca ölü); durum-ikon vocabulary tutarsızlığı (`doctor.ts` tek başına 3 sözlük); `mcp-attach.ts:63-90` hardcoded 30-tool listesi gerçek 46'dan drift; `agentic-confirm.ts:23-37` SAFE-önce-RISKY substring sınıflandırma riski.

**ℹ️ Ters-kutup:** `/provider` ve `/model` default REPL'de gerçekten çalışıyor (`run.tsx:245`, `app.tsx:1000-1014`) — eski korpus bulgusu yalnız `--legacy-loop`'a özgüydü.

### 3.2 Platform Matrisi

| Yetenek | Linux | WSL2 | macOS | Windows-native |
|---|---|---|---|---|
| Subprocess provider spawn | REAL | REAL | REAL | **KISMİ** — `buildCliInvocation()` doğru ama `codex.ts:175`, `gemini.ts:277` (+ollama/openai-compat/openrouter) bare `spawn()` ile bypass → `.cmd`-shim `ENOENT` riski |
| Deckent'in kendi CLI spawn'ı | REAL | REAL | REAL | **RİSK** — `sprint-job-runner.ts:28` bare `spawn('deckent')`, shell yok |
| tmux orkestrasyon | REAL | REAL | REAL | **DESTEKLENMİYOR** (dokümante) |
| Docker orkestrasyon | REAL | REAL | REAL | REAL (Docker Desktop) |
| Path handling | REAL | REAL | REAL | Çoğunlukla REAL — `global-scope-resolver.ts:138-199` örnek-tasarım 4-platform matrisi; `mcp/tools/init.ts:85,101` kozmetik POSIX-`/` bug |
| File locking | REAL | REAL | REAL | KISMİ/doğrulanmamış |
| Sinyal/kill (PID) | REAL | REAL | KISMİ (pid-reuse yok) | **KISMİ** — process-group kill yok, grandchild orphan (`subprocess.ts:481-499`) |
| PTY (web terminal) | REAL | REAL | REAL | KISMİ (pre-1.0 node-pty; shell default `bash`) |
| SQLite | REAL | REAL | REAL | REAL/KISMİ (prebuild-bağımlı) |
| Credentials/chmod | REAL | REAL | REAL | **KIRIK** — mode-bit NTFS'te no-op; secret'lar erişim-kısıtlanmadan yazılıyor (`credentials-per-project.ts:138-143` kendi itirafı) |
| Spawn güvenliği | REAL | REAL | REAL | TUTARSIZ — `onboard.ts:225-230` kendi dosyasındaki win32-shell flag'ini atlıyor → sessiz "skipped" init |
| Node baseline | `>=24.0.0` zorunlu (tüm platformlar) — Node 18/20 LTS ortamlarını dışlıyor | | | |

Net hüküm: Linux/WSL2/macOS birinci-sınıf; **native Windows, Yasa #2'ye ("her ortam") rağmen ikinci-sınıf** — dört bağımsız kırılma noktası (bare-spawn ENOENT, tmux, chmod no-op, finalize `spawnSync('npx')` shell'siz → self-audit gate kırık, `sprint-finalizer.ts:279-311`).

---

## 4) MİMARİ + VERİ + GÜVENLİK + FAILURE

### 4.1 Katman haritası
Giriş yüzeyleri (`cli/` · `mcp/` · `api/`) → **orchestra/** (Brain, 8-faz lifecycle) → **agents/** (worker exec + IPC) → **providers/** (7 adapter ailesi) → **core/** (config/memory/RBAC/routing — hiçbir üst katman bypass etmiyor) → **nervous/** (opt-in) → **connectors/** → **dashboard/** (yalnız-okunur).

### 4.2 Sprint E2E hop-map (12 hop)
| # | Hop | Durum + ana bulgu |
|---|---|---|
| 1 | CLI `start` (`start.ts:158-501`) | REAL, senkron/in-process; `--auto-approve` `runSprint`'e ulaşmıyor, satır 455 `autoApprove:true` hardcoded |
| 2 | MCP `deckent_start` (`mcp/tools/start.ts:270-333`) | REAL, **detached fork** + jobId; `autoApprove` doğru onurlandırılıyor (default false) — CLI ile tutarsız |
| 3 | `sprint-runner-entry.ts` | REAL, IPC config + crash handler |
| 4 | `runSprint()` (`sprint-controller.ts:986-1732`) | REAL — lock, checkpoint crash-resume, backend seçimi (docker default non-Win) |
| 5 | PLAN (`sprint-planner.ts`) | REAL; dependency-graph çözülemeyen referansları **sessizce düşürüyor** (`dependency-scheduler.ts:137-147`) |
| 6 | SPAWN (`sprint-spawner.ts`, 1774 LOC) | REAL, Docker hardened; scope-collision "en düşük task-id kazanır" (Sprint-319 tradeoff'u) |
| 7 | Worker (`worker.ts`) | REAL; `claimTask()` **TOCTOU race** (:246-273); `checkWorkerAuthority()` **soft-by-default** (:557-565); `.result` atomic + self-honesty gate |
| 8 | Result collection | REAL; daha doğru `resolveTokenUsage()` (`token-counter.ts:303-315`) **hiç çağrılmıyor** |
| 9 | EVALUATE (`sprint-phases.ts`, ~900 LOC) | REAL ama en ağır 2 açık: **SPAWN fazı RBAC'ı hiç çağırmıyor** + ADR-scanner crash'te **fail-open** (`authority-enforcer.ts:600-629`) |
| 10 | FIX | REAL, bounded one-shot re-dispatch |
| 11 | RETRO/DECAY | REAL, yalnız memory.db; DB yoksa sessiz no-op |
| 12 | CLEANUP/finalize (`sprint-finalizer.ts`, ~1900 LOC) | REAL; native-Win `spawnSync('npx')` ENOENT (:279-311); pre-archive snapshot **write-only** (`restoreFromSnapshot` çağrılmıyor) |

Mimari uyuşmazlık: CLI senkron (terminal ölürse coordinator ölür) vs MCP detached; tek kurtarma = sonraki start'ın checkpoint-resume'u. CLAUDE.md'nin "`deckent_start` event-loop bloke edebilir" gotcha'sı **bayat** (Sprint 143'te detached fork'a geçilmiş).

### 4.3 Veri katmanı
Envanter: `.brain/memory.db` (3 bağımsız connection sınıfı aynı dosyada; WAL; additive-only migration; HMAC audit chain) · approval JSON çifti (atomic) · `.tasks/*` (status/hb plain-write, `.result` atomic) · routing learnings JSON · O_EXCL lock'lar · `autonomous.db` (FK deklare, `PRAGMA foreign_keys=ON` **çalıştırılmıyor**) · `global-store.ts` (kasıtlı UNWIRED).

Riskler: **MAJOR** — tenant izolasyonu default OFF, NULL-tenant satır sızıntısı (`memory-store.ts:756-767,99-101`); **MAJOR** — `ApprovalStore.prune()` prodüksiyonda hiç çağrılmıyor → sınırsız dosya birikimi; **MINOR** — `.json`/`.hb` cross-process race sınıfı yamasız; **INFO** — `getDebtItems()` "pure read" görünümüyle gizli yazma yan-etkisi. **Pozitif:** decay ≥%50-batch silme reddi; `memory-export.ts` boş-render koruması (Sprint-226 olayı sonrası).

### 4.4 Güvenlik (severity sıralı)
1. **CRITICAL** — Cross-provider credential sızıntısı: `applyDeckSecretsToEnv()` tüm secret'ları paylaşılan `process.env`'e yazıyor; yalnız `subprocess.ts:190` scrub ediyor — codex/gemini/ollama etmiyor, Claude default'u tmux (`provider.ts:806-869`).
2. **CRITICAL** — RBAC (ADR-037) mainline spawn'da hiç çağrılmıyor + her yerde soft (`sprint-phases.ts~965-1027`, `authority-enforcer.ts:261-271`).
3. **MAJOR** — Embedded terminal `'ai'` kind: client-supplied `tool` string doğrulanmadan spawn (`server.ts:1961-1969`; deny-list yalnız `kind==='shell'`).
4. **MAJOR** — `run`/`deckent_run` koşulsuz auto-approve (CLI hardcoded true, MCP default true; sibling `deckent_start` false — tutarsız).
5. **MAJOR** — Audit HMAC secret'ı hardcoded+public (`audit-writer.ts:35,269` `'deckent-audit'`) — tahrifata karşı korumaz.
6. **MAJOR** — RBAC üç-katmanlı fasad (soft enforcer + sıfır-okuyuculu grant/revoke + okumasız enterprise CRUD).
7. **MAJOR** — `WorkerApprovalGate` hiç instantiate edilmiyor; 8. **MAJOR** — "mandatory" `assertSpawnSafe` hiçbir gerçek spawn'dan önce çağrılmıyor (`spawn-safety.ts`).
9-13. MINOR/INFO: plugin `require_signature` default false + trusted-key yok; herhangi opak bearer = tam tenant-admin (`enterprise-endpoint.ts:359-375`); terminal deny-list loopback'te no-op; bot SAFE-önce-RISKY sınıflandırma; gateway credential bootstrap'i (PLAUSIBLE).

### 4.5 Failure-Mode Top-10
1. **CRITICAL/default-ON** — `waitForHumanApproval` sonsuz bekleme, timeout yok (`sprint-lifecycle.ts:490-511` `while(true)`).
2. **CRITICAL/default-ON** — ADR-compliance scanner crash'te fail-open `pass:true`.
3. **MAJOR** — finalize+phases'te yaygın error-swallowing (121+93 catch).
4. **MAJOR** — Orphan child birikimi: yalnız Claude-subprocess SIGTERM→SIGKILL escalation yapıyor; diğer 5 adapter tek `kill()` atıp map'ten siliyor.
5. **MAJOR** — PANIC_IPC marker reader: explicit reject yoksa her parse-edilebilir marker APPROVED (`panic-gate.ts:105-116`).
6. **MAJOR** — MCP writer-lease fs-hatasında fail-open (`writer-lease-gate.ts:65-73`).
7. **MAJOR** — Unwired güvenlik-ağı kümesi: cost_guard monitor + `resumeSprint` + `ApprovalExpiryDriver` — üçü tam inşa, sıfır çağıran.
8. **MAJOR** — Native-Win finalize ENOENT (Yasa #2 ihlali).
9. **CRITICAL ama opt-in** — Nervous'un stall/event-health detektörleri işlevsiz (ACTION_REGISTRY mismatch).
10. **MAJOR** — Transient-hata auto-retry default'ta yok (`retry_transient_failures` default false, `task-retry.ts` ana API'si sıfır çağıran).

---

## 5) UNWIRED / DEAD-CODE ENVANTERİ (refutation-sonrası kesin)

**Refutation'la REAL'e dönenler (yanlış-pozitif temizliği):** `ApprovalRelay` + `ApprovalEventStream` + `createApprovalStoreWatch` (repl_surface default-ON yolundan canlı, `run.tsx:144`) · `auth-jwks.ts` (header "zero callers" dese de OIDC/terminal auth üzerinden bağlı) · `/api/limits` ve `/api/evaluate-health` (dosya-içi "NOT wired" yorumları bayat, `server.ts:1044-1046` bağlı) · `/provider`/`/model` default REPL'de canlı.

**Kesinleşmiş UNWIRED/DEAD (küme halinde):**
- **Approval alt-sistemi (worker-taraf):** `WorkerApprovalGate` · `ApprovalAllowScopeStore` · `ApprovalExpiryDriver` · `decidePolicy` (approval-policy.ts) · `storeRawArgs/resolveRawArgs` · `resolveFallback` · `approval.gate_enabled/relay_enabled` bayrakları (self-disclosed "reserves config surface").
- **Orchestra güvenlik-ağları:** mid-sprint `cost_guard` monitor (`sprint-phases.ts:3084-3196`) · `resumeSprint` (`sprint-lifecycle.ts:615-680`) · `resolveTokenUsage` · `restoreFromSnapshot` · `capability-realizer.ts` · self-learning suggestions/ADR-debt auto-maintenance (S15).
- **Config ölü-anahtarları:** Auditor bloğu 5 alan (dashboard'da canlı toggle olarak render edilmesine rağmen scan-loop'a iletilmiyor!) · `heartbeat_timeout` (isim tuzağı) · `tool_surface` · `rollback` (resolver kopyalamıyor) · `training_trace`/`live_trace` · `worker_output_contract` (yalnız advisory, "reddet" vaadi yanıltıcı) · `decision_engine`/`collaboration` blokları · `mergeConfigs()` · `global-config.ts` · `global-store.ts` (kasıtlı) · `interaction-policy.ts` · `event-trigger.ts` · `enterprise-config.ts` · `lazy-loader.ts` · `agent-selector.ts` (routing-engine'in `selectBestAgent`'ı tarafından yerinden edilmiş).
- **CLI/REPL katmanı:** `chat-repl-ux.ts` readline generator · `agentic-session.ts` · `risk-language.ts` · `onboarding-chat-flow.ts` (564 LOC, i18n-temiz, tümüyle erişilemez) · `retro-parser/formatter.ts` (retro.ts inline kopyalıyor) · `chat-status-line.ts` · `chat-slash-menu.ts` reducer · `agent-templates.ts` · `hints.ts` · `chat-intent-executor.ts` · `resolveNervousSlash` bridge · `session-registry.ts` yazma-tarafı.
- **API/Dashboard:** `rpc-write-handlers.ts` · `handleLogStream` · `SprintControlPanel` · `AppShell` · `ApprovalsPanel`/`ApprovalHistoryPanel` · `RoutingDistribution` · `Onboarding` · 4 analytics modülü · Slack/Teams rich-approval adapter alt-sistemi (connectors).
- **Diğer:** `alert-dedup` helper (auditor zaten inline yapıyor) · finding-lifecycle modülü · VS Code extension 4 modülü (hiç assemble edilmemiş) · `notification-config.ts` · Discord/Slack standalone notification provider'ları · Codex-parity model registration · afterSprint CI report · `codex-spawn-readiness.ts` + `metrics-updater.ts` (repo'nun kendi governance testine göre resmi orphan).

**Desen hükmü:** Bu izole kazalar değil; **"özellik yeniden inşa ediliyor, eskisi ne bağlanıyor ne siliniyor"** tekrarlayan bir mühendislik-süreç açığı — aynı desen REPL slash-katmanı, dashboard approvals, retro-parser, agent-selector ve approval ailesinde bağımsız olarak tekrarlıyor.

---

## 6) LIVE-PROBE SONUCU

**Dist tazeliği:** STALE, ~31 dk / 1 commit (26e43689) geride. Tek bilinen fark: `serve.ts:82` i18n-fix build'e girmemiş — probe edilen komutlar etkilenmedi, sonuçlar temsili.

**15 komut probe'u — 14 OK, 1 crash:**
| Komut | Sonuç |
|---|---|
| `--version`, `help`, `doctor` (4/4 provider ready), `status`, `config list`, `history` (233 sprint), `kpi` (sprint-379: $11.44 "critical"), `usage` (16,198 çağrı / $780.87 7g), `cost show`, `recall "adr"` (5 FTS5 hit), `serve` + `/health` 200 | ✅ Exit 0, gerçek veri |
| `agent list` | ✅ 19 agent, gerçek kullanım sayıları (Doc Writer 595) — top-help'te listelenmiyor ama çalışıyor |
| `models list` | ✅ ama remote-catalog fetch HTML-hata sayfası döndü → 14 bundled modele sessiz fallback (uyarı satırıyla) — endpoint bu ortamda unreachable/misconfigured |
| `limits` | ✅ çıktı sağlam (Session %97 BLOCKED) — **exit 1 kasıtlı** (scriptable gate sinyali), crash değil; "limit_gate.enabled=false" dürüstçe söyleniyor |
| `skill list` | ❌ **CRASH exit 1** — `skill.ts:234` `s.triggers.slice(0,3)`, `loadAllSkills()` (:39-58) sıfır şema-doğrulama; `secure-coding` manifest'i v2 (activation.rules) → `triggers` yok. `skill-types.ts:42-46` alanları required deklare ediyor ama v2 için render kodu güncellenmemiş |

**Davranış-vs-kaynak farkı yok** (statik analizle çelişen tek bulgu skill-list crash'iydi ve statik REAL hükmü canlı kanıtla PARTIAL'a düşürüldü). Yanlış-alarm temizliği: history'nin ilk exit-1'i `head` SIGPIPE artefaktıydı.

---

## 7) KAPSAMA KANITI

- **Manifest:** 1009 src-dosyası · **okunan: 928** · **1 missing** (analiz sırasındaki repo-temizliğinde silinmiş dosya — kapsam kaybı değil) · `tests/` **bilinçli hariç** (analiz hedefi production-kod gerçekliğiydi).
- 41 dilim özeti üretildi; bunlardan **6'sı (S02, S12, S13, S14, S28, S32) fabrikasyon/placeholder içerik** olduğu tespit edilip tamamen dışlandı — hiçbir bulgu bu dilimlerden alınmadı (ör. uydurma `src/orchestra/reconciler.ts` kanıtı reddedildi).
- Bayatlama kontrolü: S19-S28 dilim korpusu 2026-07-06/07 default-flip commit'lerinden (repl_surface #492, tool_surface 376-001) **önce** üretilmişti; flag/wiring iddiaları HEAD'e karşı yeniden doğrulandı, iki iddia düzeltildi (repl_surface artık default-ON; tool_surface default-ON ama yine de ölü). Doğrulanamayan iddialar raporda `[rapor edildi]` etiketiyle ayrıştırıldı.
- Canlı-probe (15 komut, gerçek binary) + repo-geneli grep refutation turu, statik hükümlerin üzerine ikinci doğrulama katmanı olarak koşuldu.

---

## 8) SONUÇ HÜKMÜ

**Deckent bugün ne?** Deckent, çekirdeğinde **gerçek ve olgun** bir üründür: 8-fazlı sprint-orkestrasyon makinesi, çok-provider worker filosu, SQLite-FTS5 hafıza katmanı ve %80.5'i canlı-doğrulanmış 236-satırlık yüzey envanteriyle "vaporware" değil, günde yüzlerce sprint koşmuş (history: sprint-136→379), kendi geliştirmesini dogfood'layan çalışan bir sistemdir. Zayıflığı yeteneksizlik değil, **iki sistemik açıktır**: (1) güvenlik/governance katmanı büyük ölçüde fasad — RBAC soft+çağrılmıyor, ADR-gate fail-open, credential'lar provider'lar arası sızıyor, approval'ın worker-tarafı hiç bağlanmamış; sistem bugün fiilen "yetenekli ama güvenlik-ağları kağıt üzerinde" modunda çalışıyor; (2) "build-ahead-of-wiring" kültürü — tam-inşa, test-edilmiş ~40+ modül sıfır çağıranla duruyor ve eski implementasyonlar silinmeden yenileri yazılıyor, bu da hem bakım yükü hem de "config'de var ama çalışmıyor" türü kullanıcı-yanıltıcı yüzeyler üretiyor. Native Windows, Yasa #2'ye rağmen dört bağımsız kırılmayla ikinci-sınıf. Terminal-merkez pivot (2026-06-29) için temel sağlam; öncelik yeni özellik değil, **var olanı bağlamak ve kapıları gerçek yapmaktır**.

**Öncelikli 10 aksiyon:**
1. **`skill list` crash fix** — `loadAllSkills()`'e v2-manifest normalizasyonu/şema-doğrulama ekle (`skill.ts:39-58,234`); tek canlı-reproduce edilmiş kullanıcı-crash'i, düşük maliyet.
2. **Credential-scrub'ı tüm spawn path'lerine taşı** — `subprocess.ts:190`'daki scrub'ı codex/gemini/ollama/openai-compat/openrouter + tmux invocation'a genelle (CRITICAL güvenlik).
3. **Default REPL'e slash-dispatch bağla** — `native-agent-bridge.ts`'e `resolveSlash` entegrasyonu; menünün vaat ettiği ~20 komutu gerçek yap, ya da menüden düşür (dürüstlük).
4. **`waitForHumanApproval`'a timeout + ADR-scanner'ı fail-closed yap** — iki default-ON CRITICAL failure-mode (`sprint-lifecycle.ts:490-511`, `authority-enforcer.ts:600-629`).
5. **Unwired güvenlik-ağı üçlüsünü bağla:** cost_guard monitor + `resumeSprint` + `ApprovalExpiryDriver.prune()` — kod hazır, yalnız wiring eksik.
6. **`repl_surface` i18n'ini tamamla** — `run.tsx:425-446` labels + `approvalLabels` thread'le; resume-picker/busy-controls key'lerini `messages.ts`'e ekle (default-görünür regresyon).
7. **Auto-approve tutarlılığı:** CLI `start`/`run`'da hardcoded `true`'ları kaldır, `--auto-approve` bayrağını MCP semantiğiyle (default false) hizala (`start.ts:455`, `run.ts:260`).
8. **Windows-native dört kırılmayı kapat:** bare-`spawn` → `buildCliInvocation` (codex/gemini/ollama/sprint-job-runner), finalize `spawnSync('npx')` shell-gate, credentials ACL-hardening (ADR-G-017 takibi), onboard win32-shell flag'i.
9. **Dead-code temizlik sprinti** — §5 envanterindeki kesinleşmiş listeyi ADR'li karar ile ya bağla ya sil; özellikle çift-implementasyon çiftlerini (nervous-bridge, retro-parser, agent-selector, ApprovalsPanel) tekilleştir; "reserves config surface" bayraklarını config şemasından düşür veya işler yap.
10. **Yanıltıcı yüzeyleri dürüstleştir:** dashboard'daki işlevsiz Auditor toggle'ları, `worker_output_contract`'ın "reddet" vaadi, `deckent_autonomous start`'ın adı, `init --repair` raporu, `mcp-attach` 30-tool listesi, CLAUDE.md'nin bayat `deckent_start` gotcha'sı — kullanıcıya görünen her iddia kodla eşleşsin (Yasa #1 dogfood+user lensi).
---

## EK: Mop-Up Bulguları (81 atlanan/şüpheli dosyanın yeniden-okuması — kapsama %100'e tamamlandı)

Sentez sonrası, `files_read` birleşimi manifest'le deterministik diff'lendi; 80 okunmamış + fabrikasyon-şüpheli S13/S32 dilimleri (13 dosya) 3 ek sonnet-5 ajanıyla yeniden okundu. Bulgular ana raporu **doğruladı ve genişletti** (çelişki çıkmadı):

**Yeni kesinleşmiş UNWIRED (ana §5 envanterine eklenir):**
- **`src/core/catalog/` alt-sisteminin TAMAMI** (7 dosya, ~900 satır — Sprint-330 fiyat-kataloğu: CatalogRegistry + local/models.dev/OpenRouter kaynakları + cache-archetype) — `catalog/` dışında sıfır çağıran. Tam-inşa, entegre-edilmemiş ada.
- **`src/orchestra/prompt-segmentation.ts` + tier/cache API'sinin tamamı** (Sprint-330 "provider-agnostik prompt cache": `buildTaskPromptSegmented`, `segmentByTier`, `classifyTier`, `leadingT0Reorder`) — canlı derleme yolunda sıfır çağıran; yalnız düz `buildTaskPrompt` bağlı.
- **`src/orchestra/reconciler.ts`** (cost-reconciliation) — 0-caller; kendi header'ı "finalize-summary + dashboard panel tüketir" diyor ama **iddia yanlış** (barrel'da bile yok).
- **`src/orchestra/multi-agent.ts`** — dosya bütünüyle ölü.
- **`src/core/auth-session.ts` `SessionStore`** · **`config-validator.ts` re-export** · **`runIdentityMutation`** · **`recordCrossVerifyVerdict`** (ADR-070 "canlı ROUTE-1 sinyali" iddiasına rağmen 0-caller) · **`recordSprintWorkerTrace`** (0-caller teyit — training-trace hâlâ UNWIRED) · **`loadUserGeneratorsAsync`** (referans verdiği `docs run --with-plugins` bayrağı yok).

**Yeni platform/güvenilirlik riskleri:**
- `promotion-pipeline.ts:504` — ESM modülde çıplak `require('fs')` → build-shim yoksa `ReferenceError` (runtime-crash adayı).
- `spawn-backend-docker.ts:1471-1476` — `Atomics.wait`/`SharedArrayBuffer` ile senkron busy-sleep → event-loop'u çağrı başına 5 sn'ye kadar bloke; ayrıca `sleepSync` `sleep` binary'sine shell-out (Win-native'de yok).
- `resource-monitor.ts` — `docker` binary hardcoded (podman fallback yok) + `deckent-w-` prefix tek keşif yolu → farklı-adlı/non-docker backend telemetride görünmez; her docker-hatasında sessizce no-op.
- `computer-use-exec.ts` — `executeComputerUseAction` 0-caller (yalnız `cu-status` introspection'ı bağlı); `navigate` ve region-screenshot kalıcı unimplemented; AppleScript/PowerShell string-injection yüzeyi el-yazımı escape ile hafifletilmiş.

**Ana raporu düzelten pozitif bulgular (yanlış-negatif temizliği):**
- **`proof-of-function.ts` (Tier-1 smoke-gate) artık REAL** — yakın zamanda un-orphan edilmiş; `sprint-phases.ts:1591` `runEvaluatePhase` içinde canlı. (Eski "unwired" bulgusu bayat.)
- `capability-broker` REAL (runtime-loop + process-runtime çağırıyor) · `cascade-detector` sprint-controller'a bağlı (5-NO_GO→PAUSE, 3-RATE_LIMIT→HALT) · `compliance-report` audit CLI'da · `ci-learning` ci-reporter'da · `auth-oidc` güvenlik-kritik ve yaygın bağlı (header'ın "zero callers" yorumu bayat) · 12 dashboard sayfası router'da · managed-docs + process modu REAL.

**Tasarımsal (kaza değil) kararlar — dead sanılmasın:**
- `rollback.ts` deckent-dev repo'sunda git safety-point'i **kasıtlı no-op** (ADR-039 self-modify koruması); dogfood sprint'i bu mekanizmayla git-güvenlik-ağsız koşar.
- `RUBRIC_REGISTRY`/`EFFECT_CLASS_REGISTRY` bilinçle frozen + export-edilmez (eşik-gaming önlemi, ADR-038).
- docker credential env-forward'ı per-provider allowlist (F1-014r — eski sızıntı olayı sonrası).
- `question-approval-bridge.ts` header'ında kendi bağlanmamışlığını **dürüstçe** belgeliyor ("deliberately NOT wired — CKPT wire follow-up") — reconciler'ın yanıltıcı iddiasının tersi.

**Kapsama kanıtı (kesin):** 41 dilim + 3 mop-up = manifest'in 1.008/1.009 dosyası okundu; kalan 1 dosya diskte artık yok. Ana sentez, fabrikasyon tespit edilen 6 dilimi (S02/S12/S13/S14/S28/S32) dışlamıştı; mop-up bu dosyaları temiz yeniden-okumayla kapattı, dolayısıyla final envanter fabrikasyon-içermez.
