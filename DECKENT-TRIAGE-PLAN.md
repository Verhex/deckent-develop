# DECKENT TRIAGE PLANI — Bulgu Havuzu → A-fix / B-karar / C-cleanup (+ R1-R8)

> **Amaç:** Cross-check havuzundaki ~431 crit/high (+ medium/low kuyruğu) bulguyu **üç kovaya** ayır, A'ları R1-R8 kök-nedene bağla, B-kararları Alperen'in önüne getir. Bu doküman fix-kampanyasının **SSOT backlog**'u. Kaynak: `deckent-last-standing-crosscheck.md` (Phase-1 CC ⨯ Phase-2 deckent). Her satır file:line taşır; "bazıları zaten sistemsel karardı" → o satırlar **Bucket B**'ye düştü, A'ya değil.

---
## 🌙 OVERNIGHT OTONOM OTURUM LOG (2026-06-22) — Alperen sabah review

> Alperen "sabaha kadar ilerlet + deckent-dogfood verify + build:all izinli" dedi. **8 fix + 3 doc commit, hepsi unpushed (main ahead 9, push YOK — sabah onayın bekleniyor), her biri faithful-regression-locked (pre-fix RED / post-fix GREEN) + affected-suite green.**

**Bu oturum tamamlanan (8 fix):**
| # | Fix | Commit | Kök | Faithful |
|---|-----|--------|-----|----------|
| 1 | audit-chain per-stream isolation | `420d2dce` | A21/R2 (security) | 3-test, 238 yeşil |
| 2 | OpenAI tool-call stream-end flush | `c35c6540` | R6 | 2-test, 1345 yeşil |
| 3 | dashboard 401 UnauthorizedBanner | `bc3b42e2` | R6 (Tier-1) | 4 DOM-test + build:all |
| 4 | Discord sendMessage unsendable→throw | `3a2170e6` | R6 | 2-test, 235 yeşil |
| 5 | deckent_plan dryRun force | `823b8bb4` | R7 | 2-test, 22 yeşil |
| 6 | budget false-OK→unreadable | `c7a89f97` | R6 | 1-test, 63 yeşil |
| 7 | bot resolveAndAck failure-reply | `4e002a70` | R6 | 2-test, 146 yeşil |
| 8 | SprintControlPanel error+i18n | `80f9c45e` | R6 (Tier-1) | DOM-test + build:all |

**Dogfood-verify:** `npm run build:all` ✅ (2289 modül, temiz) + `deckent doctor` ✅ (4/4 provider ready, memory healthy, auth intact). **Full-suite:** 23.8k test pass; **39 fail TÜMÜ pre-existing** (disk-verify: source'umu origin/main'e revert edip kanıtladım — `mcp/server` config-mock-stale, `notify-lifecycle`/`sprint-160` e2e, `npm-pack` env, `builtin-skills` `.deckent`-mirror-drift, `nav-render` Sidebar-count). **Hiçbiri benim 8 fix'imden değil.**

**Kalan disposition (sabah karar/iş):**
- ⛔ **R3 sprint_timeout_minutes** dormant (config hiç `timeoutMs`'e thread edilmiyor, 30dk default config-0'ı eziyor) — fix DAVRANIŞ-DEĞİŞTİREN (default→unlimited) → **B-ruling: honor-config vs 30dk-safety-cap?** (otonom yapmadım).
- ◑ feature-completion (surgical değil): flow-run action-executor eksik · resume completed-list runSprint'e geçmiyor (signature-ripple) · native-chat/`/provider`-switch stub.
- ⛔ borderline-B/kasıtlı: `--auto-approve` forced (workers-always-full-write) · `deckent_kill` description-dürüst-PAUSED · `writeNervousIpcApproval` advisory-doc · `nextSequence` within-process-safe (docstring "atomically" cross-process yanıltıcı — known-issue) · rbac-CLI enterprise-persistence.
- ⬜ R8 spawnSync→async (mekanik ama signature-ripple + faithful-test-zor, ayrı odaklı batch) · R4 SSOT (risky, canlı-kopya-seçimi) · marketplace/skill-sandbox (B11-KES).

> **POST-PUSH DEVAM (06-22, ikinci blok — 6 unpushed commit, main ahead 6):** 10-overnight-commit push'landıktan sonra Alperen "devam" dedi. ✅ **R5 README de-fabrike** (`7b89dec1`) · ✅ **R5 DebtTrend metadata-wire** (`132afa49`) · ➕ **noGoRate test-hygiene** (`8d2e3766`, prior-session loose-end) · ✅ **R3 sprint_timeout_minutes wire** (`92359eab`, Alperen-ruling: config-onurla, default→unlimited) · ✅ **R8 captureVitestBaseline async** (`45f86208`, en-yüksek freeze). Hepsi faithful-locked + affected-suite-green. **Toplam oturum: 16 commit, 14 gerçek fix.** Kalan R8 (5 site), feature-completion, R4-SSOT, history_scaling/PromptVersion (bigger-wire) açık.

> **R8 SURFACE TAM-SINIFLANDIRMA (06-22, build+restart sonrası — kanıt-temelli, file:line):** Kalan R8 spawnSync site'larını tek-tek prod-consumer + canlılık + ripple açısından inceledim. **Sonuç: temiz-surgical R8 vein TÜKENDİ** (baseline-tracker o vein'di). Sınıflandırma:
> | Site | Canlı? | Freeze | Ripple | Karar |
> |------|--------|--------|--------|-------|
> | `baseline-tracker.ts` | ✅ | dakikalar | await-able | ✅ FIXED (`45f86208`) |
> | `monitor-adapter.ts` execCommand | ❌ **prod-DEAD** (yalnız testi tüketir; `src/monitor/*` import etmez) | — | **SKIP** (dead-code conversion = busywork) |
> | `output-collector.ts` poll-path (docker/tmux) | ◑ **DORMANT** — `server.ts:1323` instantiate eder ama `.collect()` prod'da HİÇ çağrılmaz → poll-loop hiç başlamaz, spawnSync ateşlenmez | (potansiyel 10s) | zero | **SKIP-R8** + **YENİ R7 bulgu** (aşağıda) |
> | `worker-liveness.ts` defaultDockerProbe | ✅ canlı (EVALUATE) | 3s-bounded, yalnız timeout-şüpheli task | sync→async, 5-file ripple | düşük-değer/maliyet (DI-seam zaten var) |
> | `mid-sprint-adapter.ts` reconcile (git+tsc+vitest) | ✅ canlı (EVALUATE spurious-NO_GO) | **~190s** (git10+tsc60+vitest120 ardışık sync) — **codebase'in EN KÖTÜ freeze'i** | core EVALUATE-path async-refactor: `reconcileSpuriousNoGo`+`evaluateWithRubric`(sprint-phases'te 4 + backlog-eval 1 call-site)+`evaluateResult`+`ReconciliationDeps` imza+**7 test dosyası** | **YÜKSEK değer, surgical DEĞİL** — safety-critical path (yanlışsa her sprint grading bozulur) |
> | `task-restoration.ts` tar | ◑ resume-only one-shot | saniyeler | resume-path | düşük (hot-loop değil) |
> | CLI one-shot (doctor/sync/upgrade/onboard/attach/cleanup/start/skill/plugin) | n/a tek-process | alakasız (eşzamanlı async iş yok) | — | **SKIP** (freeze önemsiz) |
>
> **YENİ INSIDENTAL BULGULAR (bu araştırmadan):**
> - 🔴 **R7 — `/api/output-stream` SSE boş yayın:** `OutputCollector.collect()` prod'da hiç çağrılmıyor (`grep '\.collect(' src/` boş) → dashboard worker-output görünümü her zaman BOŞ. Wire etmek spawn-path entegrasyonu ister (worker container-name'leri) → surgical değil.
> - 🪦 **`followDockerOutput` (output-collector.ts:480, async+injectable, "event loop never blocked" dökümante) — caller'ı YOK** = inşa-edilmiş-ama-wire-edilmemiş ölü-yol.
> - 🪦 **`monitor-adapter.ts` tüm modül prod-DEAD** (5-class adapter, yalnız test tüketir).

> **R8-RECONCILE ✅ FIXED (06-22, Alperen-onaylı el-refactor — codebase'in EN KÖTÜ freeze'i kapandı):** `reconcileSpuriousNoGo` git-diff(10s)+tsc(60s)+vitest(120s) **~190sn sync Brain-freeze**'i async'e çevrildi. **Option-B' surgical extraction** (full-async'in 20-test-dosyası ripple'ından kaçındı): spurious-block `evaluateWithRubric`'ten ÇIKARILDI → `evaluateWithRubric` saf-sync grader kaldı (64 projectRoot'suz grading-test çağrısı DOKUNULMADI), yeni async `reconcileEvaluationSpuriousNoGo()` helper'ı 5 prod-call-site'ı (runEvaluatePhase ×3 + runFixPhase + evaluateBacklogResult) sarmalıyor. **TAM davranış-koruyucu** (success-path pre-enrich `{decision,totalScore,rubricScores,retryCount}` shape'i birebir; OOM-skip korundu). **Değişen:** 6 src (mid-sprint-adapter async-runner+3-fn+reconcile · result-evaluator extract+deprecated-evaluateResult-async · result-promoter · sprint-phases · backlog-eval · execute-dispatcher) + 11 test (M) + 1 yeni faithful test. **Verify:** tsc EXIT=0 · `tests/orchestra/` 422 dosya/6233 test yeşil + docker-timeout + f10-policy + autonomous-command yeşil · **faithful: `mid-sprint-adapter-async.test.ts` pre-fix 5/5 RED (sync `{0,[]}` döndü, Promise değil) → post-fix 5/5 GREEN** (source-revert ile kanıtlandı). Mock-fix: 4 sprint-phases-entegrasyon testi `reconcileEvaluationSpuriousNoGo` passthrough-mock aldı (partial-mock undefined-export + spread-original gerçek-subprocess riskini kapattı). **✅ COMMIT+PUSH+BUILD (`7852d23d` fix + `7cd87e3f` docs, origin/main senkron, `npm run build` EXIT=0 — `/mcp restart` Alperen).** Kalan R8: hepsi dead/dormant/CLI-one-shot → R8 vein KAPALI.

---
## 0. Kova Özeti

| Kova | Ne demek | Yaklaşık adet | Kim koşar | Sıra |
|------|----------|--------------|-----------|------|
| **A — Gerçek defect** | Kod söylediğini yapmıyor; kasıtlı karar DEĞİL | ~75-95 fix-task | deckent + **CC-verify** (auth'u CC el-kodlar) | 1. öncelik |
| **B — Sistemsel karar** | Soft/off/advisory = (muhtemelen) kasıtlı V1.0 kararı | **14 ruling** (+ B11'de ~18 feature tag'i) | **Alperen karar verir**, ~0 dev | A'dan ÖNCE (A'yı şekillendirir) |
| **C — Dead cleanup** | Gerçekten ölü scaffolding, sil | ~100 modül → ~4 batch-sprint | deckent (mekanik) + CC zero-caller doğrula | A'dan sonra |

**Kritik prensip:** R1 (fail-open) ve R3 (dormant-knob) bulgularının bir kısmı **kasıtlı V1.0** (ADR-037 advisory, scope soft-enforce, API-mode deferred) → bunlar **B**. Aynı R1 içindeki **auth/tenant/IDOR** bypass'ları kasıtlı DEĞİL → **A**. Triage'ın asıl işi bu ayrım.

---

## 1. BUCKET B — SENİN KARARIN (önce bunlar; A'yı şekillendirir)

> Her ruling: **ne soft**, **kanıt**, **karar seçenekleri**, **CC önerisi**. Bunlar kod-işi değil; senin "koru / hard'a-çevir / dökümante / kes" kararın. A-fix'ler bu kararlara göre yön alır (örn. B1 "hard-flip" dersen R1-RBAC bulguları A'ya terfi eder).

### B1 — RBAC `enforce_rbac` default-false → advisory-only · R1 · ~10 bulgu
**Ne soft:** `enforce_rbac` standart config'de undefined/false → authority gate warn-only, hard-deny path erişilemez. Yerler: `core/rbac.ts`, `nervous/authority-matrix.ts`, `orchestra/sprint-runtime.ts`, `orchestra/autonomous/runtime-loop.ts`, `orchestra/backlog-trigger.ts` (crosscheck TIER-1 L46-93, TIER-3 L686-697).
**Kanıt-niteliği:** CLAUDE.md gotcha + ADR-037 V1.0 **açıkça** "runtime advisory/soft, hard-flip post-GA V2" diyor → **bu kasıtlı karar, A değil.**
**Seçenekler:** (a) V1.0-soft koru, post-GA hard; (b) şimdi hard-flip; (c) **product-default soft kalsın AMA deckent-dev'in KENDİ config'inde hard-mode aç (dogfood kendi enforcement'ını yesin) + hard-path'i wire+test et.**
**CC önerisi:** (c). Ürün default'u bozmadan, hard-deny path'in gerçekten çalıştığını dogfood'da kanıtlarız. Bugün hard-path **test-only/erişilemez** olduğu için "advisory" aslında "yok" demek — en azından erişilebilir+test-edilir yap.

### B2 — Worker scope-authority hard-block soft (`checkWorkerAuthority`) · R1/R2 · 2 bulgu
**Ne soft:** `agents/worker.ts:602-620` her iki branch `return true` → scope-violation bloke etmiyor.
**Kanıt-niteliği:** CLAUDE.md gotcha "scope enforcement runtime advisory/soft (V1.0 Layer-2 kasıtlı eksik), ihlal `git diff --stat` ile izlenir + warn/emit, **bloke ETMEZ**" → soft-block **kasıtlı (B)**. **AMA:** eğer warn/emit path'i de ölüyse (sadece `return true`, hiç emit yok) → o kısım **A** (kasıtlı olan "bloke etme", "sessiz kalma" değil).
**Seçenekler:** (a) soft koru + emit'i doğrula/tamir et; (b) hard-flip.
**CC önerisi:** (a). Block kararı V1.0 soft kalsın; ama **emit/audit-trail gerçekten fire ediyor mu** diske-doğrula — etmiyorsa A-fix olarak emit'i canlandır (Auditor'ın izleyebilmesi için şart).

### B3 — PanicGuard BLOCK kararı advisory (kill yine de devam) · R1 · 2 bulgu
**Ne soft:** `core/panic-guard.ts` / `sprint-controller.ts` — PanicGuard BLOCK dönse de worker-kill yine ilerliyor (TIER-2 L509, TIER-3 L692).
**Karar:** Panic gerçekten hard-block etmeli mi? (Güvenlik-guard'ı soft olunca amacı kalmıyor.)
**CC önerisi:** **hard-block** (bu aslında A'ya yakın — ama davranış-değiştiren olduğu için senin onayın). Panic nadir + kasıtlı tetik; soft olması koruma vaadini boşa çıkarıyor.

### B4 — `assertSpawnSafe` / ADR-006 spawn-safety advisory · R1 · 2 bulgu
**Ne:** `core/spawn-safety.ts` `assertSpawnSafe`/`isSpawnSafe` **zero production caller** (TIER-1 L48, L278) → ADR-006 spawn-safety dokümante ama enforce edilmiyor. **AYRICA** `orchestra/spawn-backend.ts` DockerSpawnBackend (default backend) **SAFETY_FLOOR lethal-guard'ı bypass** ediyor (TIER-3 L688).
**Ayrım:** SAFETY_FLOOR (rm -rf / force-push / secret) bypass'ı = **A, lethal, kasıtsız**. Genişletilmiş spawn-safety (assertSpawnSafe) advisory kalması = **B**.
**CC önerisi:** SAFETY_FLOOR **her backend'de hard** (A-fix, B4 değil) + assertSpawnSafe'i ya wire et ya da sil (B/C kararı).

### B5 — Adversarial cross-verify default-OFF · R2 · 1 bulgu
**Ne:** `orchestra/cross-verify-runner.ts:204` — XVER feature wired ama default-off; REFUTED verdict advisory.
**Karar:** Dogfood'da açalım mı? (Maliyet/latency artar ama "trust-without-verify"i kapatır.)
**CC önerisi:** deckent-dev dogfood'da **AÇ**, ürün-default off kalsın (maliyet). REFUTED'ın enforcement-path'i (advisory→block) = ayrı A-fix.

### B6 — Cost-gate `daily_max_usd`/`monthly_max_usd` enforce edilmiyor · R3 · 2 bulgu
**Ne:** `core/cost-config-loader.ts` — alanlar tanımlı/settable/displayed ama harcama-gate'i olarak hiç enforce edilmiyor (TIER-1 L218).
**Kanıt-niteliği:** memory "API-mode cost-cap post-beta deferred" → kısmen kasıtlı.
**CC önerisi:** Şimdi **warn-only** wire (ucuz, görünürlük verir), hard-gate post-beta. Veya tamamen post-beta'ya ertele (senin çağrın).

### B7 — Telemetry + SIEM-forwarder default-off (no-op) · R3 · ~4 bulgu
**Ne:** `core/telemetry.ts` (`telemetry_enabled`/`telemetry_anonymous` hiç okunmaz, TelemetryCollector zero-caller), `core/siem-forwarder.ts` (default-off, missing transport sessizce tüm audit-event'i atar) (TIER-1 L270, L282-285, TIER-3 L758).
**Karar:** Privacy-default off **kasıtlı**. Ama kod dormant duruyor.
**CC önerisi:** Off kalsın + **opt-in dökümante et**; dormant TelemetryCollector'ı ya wire et ya C-sil. SIEM "missing transport = sessiz-discard" yerine **en az bir uyarı** emit etsin (A-mini).

### B8 — API-mode worker-auth post-beta deferred · doğrulama · referans
**Ne:** memory `project_api_mode_deferred_post_beta`. Havuzda buna bağlı auth-fallback bulguları var.
**CC önerisi:** Deferred'ı **teyit et** (1 Haziran geçti, hâlâ subscription-default). Değişmeyecekse bu satırları B-kapalı işaretle.

### B9 — autonomous / nervous default-off · doğrulama · referans
**Ne:** İkisi de kasıtlı default-off (memory `project_automation_usability_state`). Havuzdaki "X never runs in live pipeline" bulgularının bir kısmı bundan.
**CC önerisi:** Koru + dökümante. "Default-off yüzünden dormant" olanları **B-kapalı** işaretle ki A/C'yi şişirmesin.

### B10 — Writer-lease-gate fs-error'da fail-open · R1 · 1 bulgu
**Ne:** `mcp/writer-lease-gate.ts:64` — lease fs-error'da TÜM write-tool için fail-open.
**Kanıt-niteliği:** memory + commit a0ac4f71 "fail open on lease fs-error (**spec compliance**, final review)" → **kasıtlı** (availability > safety).
**CC önerisi:** Spec gereği fail-open **koru** + risk-yorumu ekle. Değişmeyecekse B-kapalı.

### B11 — Dormant FEATURE'lar: WIRE mi, KES mi? (her biri "bu özelliği istiyor muyuz?")
Bunlar saf-dead değil; **yarım-kalmış özellik**. Karar: **istiyorsan → A-wire**, istemiyorsan → **C-sil**. Tag'le:

| Feature | Yer | Durum | CC önerisi |
|---------|-----|-------|-----------|
| Mission crash-recovery (`recover()`) | `orchestra/autonomous/mission-store/*` | interface'de var, hiç çağrılmıyor → crash'te 'running' kalanlar orphan | **WIRE** (boot'ta recover çağır) |
| Proof-of-function gate | `orchestra/proof-of-function.ts` | zero-caller → Tier-1 smoke hiç uygulanmıyor | **WIRE** (ADR-079 vaadi) |
| Post-sprint-smoke | `orchestra/post-sprint-smoke.ts` | ⛔ **SUPERSEDED by A17** (06-23) — proof-of-function (Smoke: directive, LIVE) verify-task pattern'i değiştirdi; runner hiç-invoke-edilmiyor | **KES** (C, test-coupled) |
| Self-modifying enforce | `orchestra/self-modifying-detector.ts` | ⛔ **DEFER→B1** (06-23) — `enforceSelfModifyingTask` zero-caller ama hard-block mekanizması yok + authority TAMAMI soft (ADR-037-V1.0) = ilk-hard-block B1-decision | **DEFER (B1 batch)** |
| F5 evolution loop | `agents/prompt-version.ts` | ✅ **WIRED** (`d7309b1b`) — `recordCurrentVersionUse` finalizer V1+V2 per-task; stats artık gerçek (reader'lar zaten live = one-sided) | **DONE** |
| Marketplace (dependency-resolver, rating) | `core/marketplace/*` | zero-caller | **KES** (post-GA) |
| Credentials / credential-encryption | `core/credentials.ts`, `credential-encryption.ts` | ⛔ **DEFER→enterprise-arch** (06-23 disk-verify: zero-real-caller teyit; wire = auth-path değişimi (yeni credential-source) + yeni CLI + A12 sessiz-key-auto-gen provenance + karar; behavior/security-sensitive) | **DEFER (enterprise batch + A12)** |
| Enterprise-config runtime | `core/enterprise-config.ts` | ⛔ **DEFER→enterprise-arch** (06-23: saf schema/parse-merge, `loadEnterpriseConfig` YOK + consumer YOK — FlowRuntime maxConcurrent honor-etmiyor, tenancy/rbac=A4/B1-deferred; load-only=half-wire) | **DEFER (enterprise batch + A4/B1)** |
| Notification-providers (slack/discord/webhook) | `core/notification-providers/*` + eski `notifications.ts` | ✅ **WIRED webhook** (`54034d6d`) — generic-webhook canonical chain'e köprülendi (connector'lar telegram/discord'u zaten kapsıyor); dead `NotificationDispatcher` class KES → C-cleanup defer (test-bağlı) | **DONE** (KES-class deferred) |
| ERP-connector `.deck` factory | `core/erp-connector.ts` | zero-caller | KES (IFS round-trip post-beta) |
| Self-dispatch queue | `core/self-dispatch.ts` | zero-caller |  WIRE (autonomous) |
| Cascade-detector | `core/cascade-detector.ts` | zero-caller + paused-state re-check yok | WIRE (cost-guard değerli)  | **WIRE** 
| Timeout-watcher | `orchestra/timeout-watcher.ts` | dead + sprint-phases ile çelişen default | **KES** (sprint-phases canlı) |
| Sprint-estimator | `orchestra/sprint-estimator.ts` | ✅ **WIRED** (`4346dbf2`) — deckent_start fabrike '~10-30 min'→gerçek estimateSprintFull | **DONE**  |
| Multi-agent pipeline | `orchestra/multi-agent.ts` | zero-caller | **WIRE**  |
| CLI dead-class kümesi (Progress*, QueueDisplay, ReviewSummary, SelectiveRetry, WorkerStatusTracker, RecommendationEngine) | `cli/helpers/*` | zero-caller | **KES** (C-batch) |
| Dashboard dead-component (AppShell, WorkerGrid, RoutingDistribution, analytics×4, theme.ts) | `dashboard/src/*` | zero-caller | **WIRE** (UI'da gösterilecekse) |

→ **B11 aksiyonu:** bu tabloyu sen "WIRE/KES" diye işaretle; WIRE'lar A-backlog'a, KES'ler C-batch'e taşınır.

---

## 1.X — B-RULING SONUÇLARI (RESOLVED 2026-06-21, Alperen) ✅

> Tüm B1-B11 karara bağlandı. **Genel yön: WIRE-ağırlıklı** (god-level/enterprise hedefi → dormant kod = yarım-kalmış altyapı, çoğu wire'lanacak). C-kovası 5 gruba indi.

| Ruling | Karar | Aksiyon |
|--------|-------|---------|
| **B1** RBAC default-soft | **(c) kabul** | product-default soft; **deckent-dev config'inde hard-mode AÇ** + hard-deny-path wire+test → **A-task** |
| **B2** worker scope-block | **(a) kabul** | soft-block koru; **emit/audit-trail diske-doğrula**, ölüyse canlandır → **A-task** |
| **B3** PanicGuard advisory | **kabul** | PanicGuard BLOCK **hard-block** et → **A-task** |
| **B4** spawn-safety | **assertSpawnSafe WIRE** | assertSpawnSafe prod-callsite'lara wire + SAFETY_FLOOR her backend hard → **A-task** |
| **B5** cross-verify off | **kabul** | dogfood config **AÇ**, product off; REFUTED→block enforcement → **A-task** |
| **B6** cost-gate | **kabul** | **warn-only wire şimdi**; hard-gate API-modunda test edilince (sonra) → **A-task (warn-only)** |
| **B7** telemetry/siem | **kabul AMA SİLME YOK** | telemetry **WIRE** (altyapı-ref kalsın, gelecekte geliştirilecek) + off-default opt-in doc + SIEM warn-emit → **A-task** |
| **B8** API-mode | **TÜM API ÖZELLİKLERİ WIRE — tartışmaya kapalı** | API-mode worker-auth 2-hafta-içinde finanse+test; ama **her api/* dormant/unwired feature ŞİMDİ wire** → **A-API grubu** |
| **B9** autonomous/nervous | **autonomous kanıtlandı kalır; nervous GELİŞTİR+İZLE** | nervous detector'ları wire + canlı-gözlem → **A-nervous grubu** |
| **B10** writer-lease fail-open | **kabul** | spec gereği fail-open koru + risk-yorum (doc-only) |
| **B11** dormant feature | **WIRE×13 / KES×5** | aşağı reflow |

**B11 WIRE → A'ya taşındı (13):** mission-crash-recovery, proof-of-function-gate, post-sprint-smoke, self-modifying-enforce (ADR-038), F5-evolution-loop, credentials/credential-encryption (enterprise), enterprise-config-runtime, notification-provider (BİR tanesi), self-dispatch-queue, cascade-detector, sprint-estimator, multi-agent-pipeline, dashboard-components (AppShell/WorkerGrid/RoutingDistribution/analytics×4/theme).

> **B11-WIRE İCRA İLERLEME (06-22):** ✅ **proof-of-function-gate** = A17 (`afa7955a`, daha önce) · ✅ **mission-crash-recovery** (`3def44a5`) — `store.recover()` zero-caller'dı; `runV2Engine` boot'unda `migrate()` ardına wire'landı (crashed-'running' work-item'leri 'pending'e resetler; queryDue yalnız 'pending' döndüğünden recover'sız orphan sonsuza takılıydı). Faithful (pre-fix RED: orphan re-dispatch edilmiyor / post-fix GREEN, wire-revert kanıtlı), tsc=0, autonomous 51/383 yeşil. · ✅ **cascade-detector** (`06eac04b`) — Sprint-140 $42-felaket circuit-breaker'ı (`CascadeDetector`+`pauseSprint` ikisi de inşa+unit-test'li ama detector zero-caller, tetikleyici-yok) `runSprint`'te `runEvaluatePhase` ardına wire'landı: `applyCascadeCircuitBreaker` outcome'ları task-sırasıyla detector'a besler, 5-ardışık-NO_GO → PAUSE_SPRINT → pauseSprint + early-return (FIX/RETRO atlanır, `deckent resume`). Faithful (5→pause/4→no/DONE-reset-streak; protective-contract), tsc=0, orchestra 422/6231 yeşil (normal-flow false-trigger yok). · ✅ **self-dispatch** (`6b2a5839`) — disk-verify: core (`evaluateDispatch`+nervous-approval) autonomous-yolunda ZATEN canlıydı; dormant `createSelfDispatchCallback`/`PendingDispatchQueue` = `deckent flow run`'un (gerçek komut, print-only=R7) building-block'ları. `handleFlowDispatchTick` ile flow-daemon'a wire'landı: her tick due-flow'ları scheduled-policy'ye göre değerlendirir + approved'ları persisted pending-approval queue'ya (`.deckent/flows/pending-dispatch.json`) push eder (requiresApproval:true → auto-start YOK). **R7 "flow run only prints" de kapandı.** Faithful (due→queue+persist/empty→no-file/accumulate; pre-wire RED), tsc=0, cli 304/4809 yeşil, repo-pollution yok. act-on-approval ayrı follow-up. · ✅ **sprint-estimator** (`4346dbf2`) — disk-verify: `estimateSprintFull`+duration-heuristics (unit-test'li) ZERO-prod-caller'dı; bu arada `deckent_start` her sprint için fabrike `estimatedDuration:'~10-30 minutes'` sabiti döndürüyordu (`format.ts` "Estimated duration:" ile user'a basılıyor). Cost-gate pre-plan'i REUSE edilerek (ekstra planSprint YOK) `estimateSprintFull(planForCost.tasks, maxWorkers, root)` wire'landı → response artık gerçek `estimatedDurationMin` + tek-değer string ("~25 minutes"/"~1h 5m"). Gate-passed-sonrası hesaplanır (estimator-hiccup cost-gate'i bypass edemez); plan-yok'ta (force=true/planner-fail) heuristic-range fallback (fabrike-sabit YOK). Faithful (`start-estimate.test.ts` pre-fix 2/2 RED estimatedDurationMin-undefined → post-fix 3/3 GREEN, stash-kanıtlı), tsc=0, tests/mcp 845 yeşil (tek-fail `server.test.ts`=pre-existing config-mock-stale, clean-source'ta da fail). · ⛔ **multi-agent = DEFER** (disk-verify: gerçek zero-caller ama wire-noktası temiz değil — sprint "1task→1agent" modeli, pipeline "1task→N-agent" = design-kararı + çok-dosya executor/dispatch; `MultiAgentPipelineStep` saf-tip-dup, integration-test self-contained=test-theater). · ✅ **notification-provider** (`54034d6d`) — disk-verify 3 sistem ortaya çıkardı: LIVE=`NotifyDispatcher`+adapters (cli/file/mcp)+connector-broadcast (telegram/discord external ZATEN-wired) · DORMANT/superseded=`notifications.ts NotificationDispatcher`+`notification-providers/` (webhook/slack/discord-HTTP, zero-caller; `notify_channel`/`notify_url` dashboard-UI'da var ama prod'da OKUNMUYOR="never wired"). R4 çözümü: connector'ların KAPSAMADIĞI **generic webhook** = "WIRE bir tanesi" → `WebhookNotificationAdapter` dormant `WebhookNotificationProvider`'ı (retry+JSONL-log korundu) canonical chain'e köprüledi; `resolveWebhookBootstrapOption` gate + 3 sprint-entry (runner/start/autonomous) thread; `NotificationEventType` canonical-event'lere widen (lossless payload); fetch-HttpClient (Node24 zero-dep). **Dashboard "Notify URL" field artık işlevsel.** KES-eski (dead `NotificationDispatcher` class) = test-bağlı (`notifications.test.ts`) → ayrı C-cleanup'a defer. Faithful (`notify-webhook-bootstrap.test.ts` injected-HttpClient e2e delivery pre-fix 2/2 RED→post-fix GREEN, stash-kanıtlı), tsc=0, affected 45 dosya/414 test + caller-testleri yeşil. · ✅ **post-sprint-smoke A16 KARAR (06-23): SUPERSEDED by A17** (proof-of-function Smoke:-directive LIVE; verify-TASK pattern no-op+hiç-invoke; wire=R4-dup) → **C-KES** (test-coupled, wire DEĞİL). · ✅ **F5-evolution** (`d7309b1b`) — disk-verify: `PromptVersion.stats` frozen `{0,0}` çünkü `updateVersionStats` ZERO-caller; reader'lar (prompt-analytics:313, `/api/evolution/prompt-metrics`) ZATEN live = **one-sided writer-wire** (two-sided DEĞİLMİŞ). Yeni `recordCurrentVersionUse(agentId, eval)` (current-version resolve + record; versiyonsuz-agent'ta no-op) `sprint-finalizer`'da HER İKİ routing-path'te (V1 agent.json + V2 learnings.json loop) per-task çağrılıyor, branch'lerin re-finalize-guard'ı içinde (finalize --force double-count yok), DEFERRED skip. Faithful (`finalize-sprint.test.ts` V1+V2 pre-fix 2/2 RED→post-fix GREEN stash-kanıtlı + 3 unit), tsc=0, affected 13 dosya/264 test (re-finalize idempotency + evolution-pipeline/endpoint) yeşil. · ⛔ **self-modifying-enforce = DEFER → B1 enforcement-batch** (disk-verify: `enforceSelfModifyingTask` zero-caller AMA (1) config-flag yok, (2) pre-dispatch block-mekanizması yok, (3) authority-enforcer TAMAMI `mode:'soft'` ADR-037-V1.0 → ilk hard-block = B1-decision, (4) deckent-dev'de hep advisory → runtime-test edilemez). · ⛔ **credentials/enterprise-config = DEFER→enterprise-arch batch** (06-23 disk-verify: ikisi de zero-real-caller; enterprise-config consumer-yok+loadEnterpriseConfig-yok=half-wire, credentials=auth-path+A12-provenance+karar; A4/A5/A12/B1 ile konsolide — "multi-tenant deployment yok→latent"). · **Kalan 1 WIRE:** dashboard-components (UI, design-gerek) — B11 temiz-cerrahi-wire damarı ESASEN TÜKENDİ (multi-agent/self-modifying/credentials/enterprise-config DEFER, post-sprint-smoke SUPERSEDE). **B11 net: 7 WIRED + 1 SUPERSEDE + 4 DEFER (enterprise/design/B1) + 1 UI-kalan.**
> **cache_warm (B11-style yeni-karar) ✅ KES (`a7735c84`):** ineffective feature kaldırıldı (warm-delay-gate + config + 2 test); evaluateCacheGate info-only korundu. Detay R7-bölümü + memory [[project_worker_prompt_cache_finding]].

**B11 KES → C'de kaldı (7):** marketplace (dependency-resolver+rating, post-GA), erp-connector `.deck` factory (IFS round-trip post-beta), timeout-watcher (sprint-phases canlı), CLI-dead-class kümesi — ✅ **7 KES'lendi** (`c3e365e4`, 06-23): QueueDisplay/ReviewSummary/SelectiveRetry/WorkerStatusTracker/RecommendationEngine/ReviewActions/AgentPerformanceFormatter (7 src + 7 test + 2 integration-test; zero-prod-caller Sprint-032-097 early-UX scaffolding; tsc=0 + zero-dangling + 1132/1133 yeşil). **⬜ Kalan entangled dead-cluster** (ayrı focused C-batch): progress/progress-persistence/eta-calculator/sprint-comparison/change-categorizer — her biri dedicated unit-test'li + eta-calculator cross-cutting `non-null-safety.test.ts`'te → per-test surgery gerek; `sprint-summary` LIVE-kalır (sprint-finalizer). doctor-format ayrı doğrula. eski-notification-dup (R4 ile birlikte — dead `NotificationDispatcher` class `notifications.ts`, webhook artık canonical chain'de), **post-sprint-smoke (A16 SUPERSEDED by A17 — `post-sprint-smoke.ts`+`verify-task-pattern.test.ts`+`smoke-field-flow.test.ts`-portion+sprint-reporter dead-re-export)**, **dead `NotificationDispatcher` class** (notification webhook wire'ından kaldı, test-coupled).

### Reflow sonucu — kova yeniden boyutlandı
- **Bucket A büyüdü:** orijinal ~80 defect-fix **+ 13 WIRE-feature grubu + A-API (B8) + A-nervous (B9) + telemetry-wire (B7) + 6 B1-B5 enforcement-wire** → **~110-130 A-task**.
- **Bucket C küçüldü:** ~100 modül değil → **yalnız 5 KES grubu** (~25-30 modül). Geri kalan "dead" sanılan kod aslında **wire-edilecek altyapı**.
- **Yeni estimate:** A ~7-9 fix-sprint (WIRE-heavy) + C ~2 batch → **~2-3 haftalık denetimli dogfood** (önceki ~1-2 haftadan büyüdü; WIRE > delete).

**B-özet:** 14 ruling RESOLVED. Artık A'ya başlanabilir — kasıtlı mimari korundu (RBAC product-soft, writer-lease fail-open, autonomous default), istenen altyapı wire-backlog'una alındı.

> **🔍 ENFORCEMENT-VEIN DISK-VERIFY (06-23) — B1/B2/B3/B6 hiçbiri temiz-committable-surgical-wire DEĞİL (design-first batch):**
> - **B1 RBAC:** capability-RBAC hard-deny-path (`nervous/authority-matrix.ts checkWorkerAuthority(req,{enforceRbac})`) GERÇEK + ÇALIŞIYOR + test-li (`enforce_rbac` ON → `allowed:false,level:'deny'`+audit-event) AMA yalnız **autonomous-only** wired (`checkSprintSpawnRbac`/`checkBacklogEntryRbac` ← `autonomous/runtime-loop`). MAIN sprint EXECUTE/dispatch'te HİÇBİR authority-check yok. Gap'ler: (a) main-sprint genişletme = **actor/capability-model design** (task'ta capability modeli yok), (b) deckent-dev enforce_rbac=true = **`.deckent/config.json` gitignored → committable kod-wire değil**, (c) file-scope per-write = **subprocess-worker mimari-engelli** (ADR-037 V1.0 kasıtlı). "hard-path erişilemez" iddiası kısmen YANLIŞ (autonomous'ta erişilebilir+çalışıyor).
> - **B2 worker-scope:** `agents/worker.ts:584 checkWorkerAuthority` (file-scope) = **ZERO-caller dead** (R4-dup: canlı olan `authority-matrix` capability-version); post-hoc scope-violation zaten `boundaryViolations` (sprint-metrics, results×scope) ile sayılıyor → emit-canlandırma gereksiz. Per-write enforce subprocess'te imkânsız (kasıtlı-soft).
> - **B3 PanicGuard:** `panicGuard.evaluate` TEK call-site (`sprint-controller.ts:1274` graceKill = riskli auto-kill path) ve orada BLOCK **honor ediliyor** (synthetic NO_GO, kill yok). Diğer kill'ler (`sprint-lifecycle` cleanup/pause/dispose) **meşru** (sprint-sonu/pause). → büyük ölçüde **zaten-doğru**, "BLOCK'ta kill ilerliyor" bu path'te yanlış.
> - **B6 cost-warn:** `daily_max_usd`/`monthly_max_usd` settable+displayed (`cost.ts`) ama enforce-yok; **cumulative-spend aggregation YOK** (getDailySpend/usage-ledger-sum yok) → warn-wire önce spend-data-katmanı ister.
> - **B1-B2 R4-dup:** 2× `checkWorkerAuthority` (worker.ts:584 dead-file-scope + authority-matrix live-capability) — dead-olanı **C-KES** adayı (test-coupled doğrula).
> - **KARAR:** enforcement-vein = **design-first batch** (opportunistic-clean-wire DEĞİL). B-ruling'ler zaten product-soft seçti (ADR-037 V1.0 → V2 post-GA). Temiz dormant-feature-wire'ları (B11×7) tükendi. → enforcement hard-flip **post-GA V2'ye defer** VEYA dedicated design-sprint (actor/capability-model + spend-aggregation). Opportunistic surgical-wire ile yapılamaz.

> **🏢 ENTERPRISE-LAYER TRACK (Alperen kararı 06-23) — bu kampanya DIŞI, MOD-SPLIT'e devredildi:**
> Alperen: "enterprise tarafı ayrı ele alalım — deckenti zaten modüler olarak ileride böleceğiz." → enterprise-arch item'ları opportunistic fix-kampanyasından ÇIKARILDI; **MOD-SPLIT enterprise-layer** track'ine (aynı-kod-tabanı + modüler eklenebilir enterprise-layer, **EN SON iş**, [[project_community_pro_split_strategy]]) devredildi. Bu liste, MOD-SPLIT memory'sinin istediği **"enterprise-layer dosya envanteri"** prep'ini de oluşturur (sırası gelince başlangıç noktası):
> - **A4** `strictTenantIsolation` → query-layer request-principal scoping (`core/memory-store.ts`, 51 callsite) — multi-tenant izolasyon
> - **A5** `enforce_least_privilege` → `core/capability-runtime.ts` (`createAuditedCapabilityRegistry`'e ulaşmıyor) — least-privilege RBAC
> - **A12** credential keyring sessiz auto-gen → `core/credential-encryption.ts` — key-provenance/audit
> - **credentials / credential-encryption** (`core/credentials.ts`, `credential-encryption.ts`) — encrypted-at-rest credential store
> - **enterprise-config** (`core/enterprise-config.ts` — `TenancyConfig`/`RbacConfig`/`FlowConfig`) + load + consumer'lar
> - **B1 multi-tenant RBAC** (capability-RBAC'in tenant/enterprise portion'ı; dogfood-RBAC ayrı enforcement-design kalır)
> - _(ileride: SSO, SIEM-forwarder B7, ERP-connector, audit-query — enterprise yüzeyi)_
>
> **Not:** Bunlar "dormant/dead" DEĞİL → **bilinçli geleceğe-dönük enterprise-layer altyapısı** (MOD-SPLIT memory: "modül sınırlarını bilinçli koru, erken soyutlama yapma"). Triage'da C-KES'e DÜŞMEZLER. Sırası: REPL/dashboard + publish-readiness arc'ları bitince.

---

## 2. BUCKET A — GERÇEK DEFECT (fix + CC-verify), R1-R8 ile

> Bunlar tartışmasız bug. Kod X vaat edip Y yapıyor; kasıtlı karar değil. R-mekanizmasına göre gruplu — her grup bir fix-sprint çekirdeği. **Auth (R1) CC el-kodlar** (en yüksek risk); mekanik olanları (R5/R6/R8) deckent worker + CC-verify.

### A·R1 — Fail-open AUTH/TENANT/IDOR (kasıtsız güvenlik açığı) — CC el-kodlar 🔴
| # | Bulgu | file:line | Not |
|---|-------|-----------|-----|
| ✅ A1 | **Lineage IDOR**: `registerAutonomousRoutes`'a `req` geçmiyor → tenant-filter kalıcı bypass | `api/server.ts:820,861` | **DONE (06-21)** — req thread edildi; server-level regresyon `tests/api/server-tenant-scope-wire.test.ts` (pre-fix'te fail kanıtlı); tsc+740 api-test yeşil |
| ✅ A2 | Enterprise missions-audit tenant-isolation dead: `registerEnterpriseRoutes`'a `req` yok | `api/server.ts:824` | **DONE (06-21)** — req thread (6. arg); aynı regresyon-testte kanıtlandı |
| ✅ A3 | mTLS client-cert detect edilip warn'lanıp **ignore** ediliyor (block yok) | `api/terminal/ws-gateway.ts` | **DONE (06-21, 760a38e8)** — verifier wire-li+cert-presented'ta fail-closed (null/throw→4401); regresyon `ws-gateway-mtls.test.ts` (pre-fix fail kanıtlı); terminal 63/63 yeşil |
| ⚠️ A4 | `strictTenantIsolation` default-false + MemoryStore'a hiç thread edilmiyor → tenant-leak yapısal | `core/memory-store.ts` | **MİMARİ (cerrahi değil) — KARAR GEREK.** 51 prod `new MemoryStore(` callsite, 0'ı thread; config-types'ta alan yok. Flag'i 51 yere thread = yanlış-şekil (49'u single-tenant iç-store). Doğru fix = query-layer **request-principal scoping** (enterprise multi-tenancy, B9-bitişik). Bugün multi-tenant deployment yok → **latent**, live-exploit değil. → enterprise-arch backlog'a |
| A5 | `enforce_least_privilege` flag `createAuditedCapabilityRegistry`'e hiç ulaşmıyor | `core/capability-runtime.ts` | → **ENTERPRISE-LAYER TRACK** (MOD-SPLIT, 06-23) — least-privilege RBAC enterprise yüzeyi |
| ✅ A6 | AgentDetail.tsx raw fetch `Authorization` header'ı atlıyor → token'lı modda sessiz boş | `dashboard/src/components/AgentDetail.tsx` | **DONE (101c241d)** — fetchJson()'a geçti; regresyon (pre-fix fail); dashboard 72/72 |
| ✅ A7 | Session token (OIDC/manual) shared API-fetch'e hiç forward edilmiyor → non-bootstrap çağrılar unauth | `dashboard/src/lib/api.ts` | **DONE (2d48efc6)** — authHeaders/buildSseUrl `bootstrap ?? session`; regresyon (pre-fix fail); 10/10 |
| ✅ A8 | Command-guard deny-list HER prod session'da sessiz bypass | `api/terminal/session-manager.ts:99` | **DONE (09f3a972)** — TIER-2 doğrulandı (server.ts:1451 host geçmiyordu); bind-host thread + manager test-expose; server-level lock (pre-fix remote-test fail); api 746/746. _(peer-host = sub-project #3 ayrı)_ |
| A9 | `enforceAdrCompliance` internal-error'da **fail-open** → ADR ihlali sessiz maskeleniyor | `orchestra/authority-enforcer.ts` | |
| ✅ A10 | Auto-edit bash-guard ölü: literal `'bash'` karşılaştırıyor, kayıtlı tool yok | `agent/permission.ts` | **DONE (d8bf1b25)** — gerçek tool `deckent_bash`; `*_bash` match; regresyon gerçek-tool-adıyla (pre-fix fail); 35 yeşil |
| ✅ A11 | SAFETY_FLOOR lethal-guard DockerSpawnBackend'de bypass (default backend!) | `orchestra/spawn-backend.ts` | **DONE (540a361f)** — checkLethalGuard export + Docker spawn ilk-satır; regresyon Docker-block (pre-fix fail); 841 yeşil |
| A12 | Credential keyring ilk-erişimde sessiz auto-gen → key-provenance audit imkânsız | `core/credential-encryption.ts` | → **ENTERPRISE-LAYER TRACK** (MOD-SPLIT, 06-23) — credentials ile birlikte; KES değil, geleceğe-dönük altyapı |

### A·R2 — Verification-spine stub/unwired (trust-without-verify) — CC + deckent 🔴
> **İLERLEME (06-21):** ✅ **A17 proof-of-function gate WIRED** (`afa7955a`) — `verifyProofOfFunction` artık `runEvaluatePhase`'de Tier-1-DONE task'lara fire ediyor; failing-smoke → GO_WITH_TECH_DEBT + PROOF_OF_FUNCTION_MISMATCH event (zero-caller'dı, Tier-1 gate hiç çalışmıyordu = false-DONE'un kökü). Faithful (pre-wire'da DONE kalıyor). · ✅ **A13 reconcileRubricNoGo** (`6379680d`) — NO_GO→clean-DONE flip'i (worker-uydurulabilir-coverage'a güveniyordu) **GO_WITH_TECH_DEBT'e indirildi** (reconcileSpuriousNoGo-verified-path paritesi); 2 false-DONE-kodlayan test GWTD'ye güncellendi.
>
> **İLERLEME (06-22) — A21 ✅ + R2-tail triage:** ✅ **A21 audit-chain per-stream isolation** — `audit-writer.ts` module-level singleton `chainHead`'i (her sprint+partition'ı paylaşıyordu → 2.+ stream GENESIS'le başlamıyor → `verifyAuditChain` cross-sprint hep `brokenAt:0`) **per-(projectRoot,sprintId) Map**'e çevrildi + ilk-yazımda disk-seed (restart-contiguity). Faithful 3-test (pre-fix `brokenAt` RED / post-fix GREEN); 21 dosya/238 test yeşil, tsc EXIT=0. **GERÇEK live-leak (security/audit-integrity).**
> **DISK-VERIFY BULGUSU:** kalan R2-tail'in çoğu **temiz-live-leak DEĞİL** → ⛔ **A15** `runHonestyCheck` ölü-stub AMA gerçek honesty zaten `runSelfAuditGate` Step-3'te **inline-wired** (R4-dup/hijyen, live-impact düşük) · ✅ **A16 KARAR (06-23): SUPERSEDED by A17** — post-sprint-smoke (verify-TASK pattern Sprint-182: title-heuristic classify + no-op runner; `runPostSprintSmoke` hiç-invoke-edilmiyor, sprint-reporter sadece dead-re-export) → per-task `Smoke:` directive proof-of-function'a (Sprint-216, gerçek host-runner, LIVE sprint-phases:1399 DONE→GWTD) evrildi. Wire-distinct = R4-dup (kırılgan title-heuristic + no-op runner; talep-sinyali yok; sprint-phases verify-task üretmiyor). → **C-KES** (test-coupled) · ⛔ **A14** verify-delta **iki-uç-ölü** (worker `writeVerifyDeltaBaseline`/`computeVerifyDelta` import-edip-çağırmıyor + Brain `applyTechDebtDowngrade` zero-caller); CI-regression gate'iyle örtüşür + surgical-task'ta false-downgrade riski (**karar: brain-side-compute-wire vs supersede**) · ⛔ **A22** coverage no-JSON-trust branch'i **iki caller'da da `vitestJsonOutput!==undefined` guard'lı → prod'dan erişilemez** (boş-string edge); gerçek sızıntı yapısal (caller `result.coverage` self-report'a güveniyor) = davranış-değiştiren risk. **KALAN gerçek-aday:** ⬜ A19 execute-dispatcher koşulsuz ok=true (eval-infra mevcut, doğrula) · ⬜ A20 handleWorkerQuestion hep 'continue' · ⬜ A18 cross-verify REFUTED advisory · ⬜ A23 Claude auth-yok. **R2 genuine-leak (A17+A13+A21) KAPALI; tail = karar/hijyen/yapısal.**
> **R2-TAIL DISK-VERIFY + A23 ✅ (06-22):** 4 aday tek-tek file:line doğrulandı: ⛔ **A18** `cross-verify-runner.ts:8` "ADR-070 no-hard-coded-mutation" → **kasıtlı**, bug değil · ⛔ **A19** `execute-dispatcher.ts:448` `ok = finalEval.decision !== 'NO_GO'` (timeout/no-taskId→false) → **refuted**, eval-infra zaten-wired · ⛔ **A20** `ipc-registry.ts:227` gerçekten hep 'continue' AMA docstring "Future: Human Checkpoint" → **documented-stub→feature** (defer) · ✅ **A23 GERÇEK bug FIXED** — `authHealthCheck` (worker.ts:680) tam-implemente ama **ZERO-caller**; Docker `CLAUDE_AUTH_REQUIRED=1` enjekte ama container raw-claude-CLI çalıştırıyor (JS-worker yok) → auth-kaybeden worker sessiz exit-0/.result-yok. **Host-side pre-spawn wire** (Alperen-onaylı): `spawn-backend-docker.ts runSpawn`'da claude-worker-öncesi authHealthCheck (container host-creds mount → host-auth temsili, line-566 honest-fail precedent); fail→AUTH_FAILED NO_GO yazılı + doomed-container spawn'lanmaz. Faithful `spawn-backend-docker.test.ts` A23-describe (claude --version fail→docker-run skip + AUTH_FAILED-content) pre-fix RED→GREEN (source-revert kanıtlı). Test-ripple: 8 docker-spawn-test'in spawn-router'ı `claude --version` success modellemeli (1-satır/dosya) — auth-path exercise-edilir kalır. tsc=0, orchestra+agents 462/7153 yeşil. **→ R2-tail KAPANDI: A23 tek-gerçek-bug fixlendi, kalan 3 intentional/refuted/feature.**
| # | Bulgu | file:line |
|---|-------|-----------|
| A13 | `reconcileRubricNoGo` worker-self-reported coverage'ı ground-truth alıp NO_GO→DONE çeviriyor | `orchestra/mid-sprint-adapter.ts` |
| A14 | `applyTechDebtDowngrade` worker'dan istediği verify-delta dosyasını **okumadan** DONE kabul ediyor + zero-caller | `orchestra/result-evaluator.ts:358,360` |
| A15 | `runHonestyCheck` stub hep `0` döner + zero-caller → honesty-gate hiç tetiklenmez | `orchestra/sprint-finalizer.ts:380` |
| ⛔ A16 | post-sprint-smoke `defaultSmokeRunner` koşulsuz no-op + `runPostSprintSmoke` zero-caller → faz hiç fire etmez | `orchestra/post-sprint-smoke.ts` | **SUPERSEDED by A17 (06-23 karar)** — verify-TASK pattern (Sprint 182, title-heuristic + no-op runner, hiç-invoke-edilmiyor) → per-task `Smoke:` directive proof-of-function'a (Sprint 216, gerçek runner, LIVE sprint-phases:1399) evrildi. Wire = R4-dup. → **C-KES** (test-coupled: `verify-task-pattern.test.ts`+`smoke-field-flow.test.ts`+sprint-reporter dead re-export) |
| A17 | `applyProofOfFunctionGate`/`verifyProofOfFunction` zero-caller → Tier-1 gate hiç uygulanmaz | `orchestra/proof-of-function.ts:376` |
| A18 | Cross-verify REFUTED verdict enforcement-path'siz advisory | `orchestra/cross-verify-runner.ts` |
| A19 | execute-dispatcher sprint-kind koşulsuz `ok=true` (Brain/Auditor eval yok) | `orchestra/autonomous/execute-dispatcher.ts` |
| A20 | `handleWorkerQuestion` hep `'continue'` auto-yanıt → worker'ın abort/retry/skip'i atılıyor | `orchestra/ipc-registry.ts` |
| ✅ A21 | `audit-writer.chainHead` process-wide singleton → cross-sprint chain hep `brokenAt:0` | `core/audit-writer.ts` | **DONE (06-22)** — per-(root,sprintId) Map + disk-seed; faithful 3-test; 238 test yeşil |
| A22 | coverage-validator vitest-JSON yoksa self-reported sayıya güveniyor; validateWorkerCoverage hiç data almıyor | `orchestra/coverage-validator.ts:301` |
| A23 | Claude availability = binary-var (auth-doğrulama yok); detectClaude `authMethod='session'` koşulsuz | `providers/claude.ts:285`, `core/provider.ts` |

### A·R4 — No-SSOT: divergent reimpl topla (fix ölü-kopyaya inmesin) — CC + deckent 🟠
3-5× yeniden-yazılmış, fix yanlış kopyaya gidiyor. Tek-doğru-kaynağa indir:
- 2× `ROLE_CAPABILITY_MAP` divergent → `core/capability-broker.ts` + `nervous/authority-matrix.ts` 🔴
- 2× `checkWorkerAuthority` divergent → `agents/worker.ts` + `authority-matrix.ts`
- 2× `evaluateResult` divergent → `orchestra/result-evaluator.ts`
- 2× `waitForResults` (DI-versiyon hiç çağrılmıyor) → `result-evaluator.ts`
- 3× `RateLimiter` (core/api/server) → `core/rate-limiter.ts`
- 3× `parseVitestOutput` → `orchestra/baseline-tracker.ts`
- 3× `getCurrentSprintId` farklı dosya okuyor → `monitor/sprint-state.ts` 🔴
- 3× `extractKeywords` → `core/agent-selector.ts`
- 3× `max_workers` algo → `host-detector`/`system-capacity`/`system-profile`
- 3× `isNoColor` → `cli/commands/dashboard.ts`
- 3× `redactSensitive` → `orchestra/sensitive-redactor.ts`
- 3× MCP-tool-catalog kaynağı drifted → `mcp/tools/index.ts`
- 3× alert-dedup aynı array'e yazıyor → `monitor/alert-emitter.ts`
- 2× notification sistemi (+ R6) → `core/notifications.ts`
- 2× `NervousSystemConfig` divergent → `core/nervous-types.ts` vs `config-types.ts` 🔴
- 2× `CrossSprintAnalyzer` → agents vs orchestra
- 2× `useApi` hook → `dashboard/src/lib/useApi.ts`
- 2× VS Code extension impl → `extensions/vscode/extension.ts`
- capability dot-vs-hyphen notasyon → `core/capability-handlers-data.ts`
- audit-writer SHA-256 vs audit-export HMAC (uyumsuz chain) → `core/audit-writer.ts`
- `RichSprintSummary` 3 yer → retro/retro-parser/sprint-summary

### A·R5 — Hardcoded-0 / fabrike metrik (learning-loop'u öldürüyor) — deckent + CC-verify 🟠
> **DOGFOOD BATCH R5-A ✅ (sprint-316, 06-21):** 4 contained item — ✅ assignVariant balanced (`f49a13d3`) · ✅ failedTasks gerçek NO_GO (`f49a13d3`) · ✅ agent-stats conflation (`f49a13d3`) · ✅ noGoRate canonical-fraction + retro-writer consumer (`dca20d7d`, worker-fix + CC-completion: worker retro-writer tüketicisini kaçırdı, CC tamamladı). **Brain 4/4 DONE dedi ama CC-verify Task-4'ü kırık buldu (R2 canlı) → CC tamamladı.** **R5 cross-module (CC-hand-code):** ✅ **coverage** ← vitest json-summary (plugin-hooks, `parseCoverageSummary`, `daa2fe2e`) · ✅ **boundaryViolations** ← results×scope (sprint-metrics, canonical `findBoundaryViolations` reuse, `92007ae6`) · ✅ **README test-count fabrikasyonu** (`7b89dec1`, 06-22) — `coveragePercent*10` kör-replace README örneklerini de bozuyordu ("+5 tests"→"880+ tests"); gerçek-kaynak doc-update'te yok + badge dokunulmuyor → fabrike+bozucu replace KALDIRILDI (R5: literal'i literal'le değiştirme) · ✅ **DebtTrendAnalyzer 0%** (`132afa49`, 06-22) — TWO-SIDED wire: writer (`sprint-retro-writer.ts`) memory-entry'ye `metadata:{totalTasks,debtCount}` yazmıyordu → detector `{}` parse edip rate=0 → wire'landı, faithful (real-store) · ✅ **PromptVersion.stats frozen** (B11-F5) **DONE** (`d7309b1b`, 06-23) — `recordCurrentVersionUse` finalizer V1+V2 per-task wire; **one-sided'mış** (reader'lar zaten live: prompt-analytics + /api/evolution/prompt-metrics), two-sided değil · ⬜ **history_scaling zero-fill** — `sprint-spawner.ts:92` `NO_SPRINT_HISTORY={avgTaskDurationMs:0}` hardcoded → factor hep 1.0; fix = geçmiş-sprint avg-duration **aggregation** (mevcut değil) = bigger/feature-completion → defer. · ➕ **noGoRate test-hygiene** (`8d2e3766`, 06-22) — R5-A noGoRate-fraction değişiminden kalan 5 stale-test (sprint-reporter+brain, main'de RED'di) canonical-fraction'a hizalandı (feedback_ccverify dersi: full-importing-suite koş).
Self-improvement makinesini besleyen sayılar sahte → sistem kendi drift'ini göremiyor:
- `boundaryViolations: 0` literal → `orchestra/sprint-metrics.ts:128,215` + retro "No boundary violations" 🔴
- coverage hep `0` → `core/plugin-hooks.ts` (track_coverage etkisiz) 🔴
- `noGoRate` %(0-100) saklanıp fraction(0-1) tüketiliyor (2 path) → `sprint-metrics.ts`, `managed-docs/content-generators.ts` 🔴
- `failedTasks: 0` hardcode → `mcp/tools/status.ts` (NO_GO sayısı gizleniyor)
- `assignVariant()` experimentId'yi ignore → A/B atama untracked random 🔴
- ✅ DebtTrendAnalyzer hep `0%` → `nervous/detectors/debt-trend.ts` **DONE (06-22, `132afa49`)** — writer metadata-wire
- ✅ PromptVersion.stats hep `{uses:0,successRate:0}` → `agents/prompt-version.ts` **DONE** (06-23, `d7309b1b`) — `recordCurrentVersionUse` finalizer V1+V2 wire (one-sided: reader'lar zaten live)
- ✅ README fabrike test-count → `orchestra/doc-updaters/readme-metrics.ts` **DONE (06-22, `7b89dec1`)** — fabrike+bozucu replace kaldırıldı
- agent sprint-stats mentions'ı success sayıyor → %100 şişme → `cli/commands/agent.ts` ✅ (R5-A `f49a13d3`)
- history_scaling SprintHistory hep zero-fill → factor 1.0 → `orchestra/timeout-estimator.ts` ⬜ bigger (avg-duration aggregation eksik)

### A·R6 — Silent fallback / yutulan-hata — deckent + CC-verify 🟠
> **İLERLEME (06-22):** ✅ **OpenAI tool-call drop FIXED** (`agent/provider-tooluse/openai.ts`) — stream `finish_reason:'tool_calls'` yerine `'stop'`/finish-yok/`[DONE]`-break ile biterse biriken tool-call'lar sessizce düşüyordu (vLLM/Ollama/Azure/proxy bunu yapar). `drainToolCalls` helper (DRY) loop-içi + loop-sonrası flush (`clear()` çift-emit önler). Faithful 2-test (stop-drop + no-finish-drop) pre-fix RED + 1 double-emit guard; **79 affected dosya/1345 test yeşil**, tsc EXIT=0. **Gerçek provider-correctness leak.**
> **R6-TRIAGE (disk-verify):** ⛔ `nextSequence` non-atomic — within-process ZATEN sync-safe (read+write arası await yok); yalnız cross-process collision, fix = O_EXCL-lock-per-event hot-path overhead/churn → risk>değer, **defer + docstring "atomically" düzelt** · ⛔ `writeNervousIpcApproval` HTTP200 — docstring **"Advisory — a write failure never breaks the HTTP response" = KASITLI** (borderline-B; availability>consistency) · ◑ `getMessage` missing-key — `return key` makul prod-fallback; fix yalnız dev-warn (zayıf-sinyal) ya da call-site-key-guard-test (involved) → marjinal · ✅ **`deckent:unauthorized` listener-yok DOĞRULANDI** — dispatch var (api.ts:56) ama hiçbir `addEventListener` yok → 401 sessiz blank-page; **Tier-1 dashboard fix** (banner-component + i18n + listener + DOM-test + proof-of-function) = ayrı odaklı iş.
- ✅ Discord sendMessage kanal-yoksa sessiz drop → `connectors/discord.ts` **DONE (06-22, `3a2170e6`)** — null/non-text/non-sendable channel'da throw (not-started throw paritesi); faithful 2-test, 235 connector test yeşil
- ✅ resolveAndAck başarısız approval'da sıfır feedback → `connectors/incoming-command-router.ts` **DONE (06-22, `4e002a70`)** — resolver-throw'da `bot.resolve_failed` failure-reply (poller-safe korunur); faithful 2-test, 146 test yeşil. _(non-command silent-ignore back-compat'i kasıtlı, korundu)_
- ✅ SprintControlPanel kill/cleanup hatası sessiz yutuluyor → dashboard **DONE (06-22, `80f9c45e`)** — `actionError` state + lucide-alert (no-emoji) + 3 confirm i18n'lendi (binding-rule) + 2 yeni en/tr key; faithful + build:all proof. _(WorkersPage'in silent-catch'i "next-tick reconcile" yorumlu = kısmen-kasıtlı; diğer SprintControlPanel display-string'leri ayrı i18n-debt)_
- `getMessage()` eksik-key'de key-string döner → typo görünmez → `cli/helpers/messages.ts` ◑ marjinal
- ✅ OpenAI adapter `finish_reason='stop'`'ta tool-call'ları sessiz drop → `agent/provider-tooluse/openai.ts` **DONE (06-22, `c35c6540`)**
- `nextSequence()` non-atomic read-modify-write → eşzamanlı worker'da duplicate seq → `core/event-stream.ts` ⛔ within-process-safe, defer
- writeNervousIpcApproval write-fail'i yutar, HTTP 200 → `api/nervous-endpoint.ts` ⛔ docstring-kasıtlı (borderline-B)
- ✅ output.ts budget DB-unreadable'da false-OK → `cli/helpers/output.ts` **DONE (06-22, `c7a89f97`)** — `getMemoryEntryCount` unreadable'da `null` (absent=0 korunur) → budget "unreadable" uyarısı; faithful (corrupt-DB→unreadable), 63 test yeşil
- skill-sandbox AST-scan tsc-yoksa no-op'a düşer → `core/marketplace/skill-sandbox.ts` ⬜ (marketplace = B11-KES alanı)
- runPostFinalizeHooks catch-and-continue → `core/identity-generator.ts` ⛔ DÜZELTME: her step `result.errors`'a push EDİYOR (swallow değil); caller-surface ayrı kontrol, düşük öncelik
- ✅ `deckent:unauthorized` event dispatch edilir ama listener yok → 401 sessiz → `dashboard/src/lib/api.ts` **DONE (06-22, `bc3b42e2`)** — `UnauthorizedBanner` (App-root listener + i18n en/tr + DOM-test + build:all proof-of-function)

### A·R7 — Wired-but-broken / advertised no-op + soft arch-rule — CC + deckent 🟠
> **R7-TRIAGE (06-22 disk-verify):** ✅ **plan dry-run FIXED** (`823b8bb4`). ⛔ **`--auto-approve`** = KASITLI (`run.ts:257`/`start.ts:426` `autoApprove=true` hardcode, yorum "Deckent standard: workers MUST have full write permissions") → borderline-B, flag-misleading-ama-bug-değil · ⛔ **`deckent_kill`** = description PAUSED'ı dürüst belgeliyor ("Sets task status to PAUSED, removes hb, releases locks"), process-kill iddiası yok; gerçek-kill fix riskli+faithful-test-zor → defer · ◑ **resume** done-task re-run DOĞRULANDI (`resume.ts:169` runSprint'e completed-list geçmiyor) ama fix runSprint signature-change/ripple → non-surgical, defer · ◑ **flow run** `runtime.tick()`/`start()` çağrılıyor, dispatch-count basıyor; action gerçekten koşuyor mu = FlowRuntime.tick() iç-incelemesi gerek · ⛔ **rbac CLI** in-memory Map (persistence = enterprise-RBAC, B1-bitişik) → defer.
- `/provider` switch confirm der ama adapter rebuild etmez (no-op) → `cli/commands/chat-native.ts` 🔴 ⬜ (büyük, native-chat subsystem)
- `chat --native` stub-dispatcher tüm tool-call'a placeholder döner → `cli/commands/chat.ts` 🔴 ⬜ (büyük)
- `chat --local` "not yet wired" hatası → `cli/commands/chat.ts` ⬜
- selectBestAgent skill-affinity sinyalini atlıyor → "agent imbalance fix" no-op → `core/activation-engine.ts` 🔴 ⬜ (ADR-075 affinity, memory'de dead-code-known)
- `deckent_watch` MCP watchFile() çağırmıyor → sıfır canlı event → `orchestra/event-bus.ts` ⬜
- 'deckent-event' EventEmitter'da listener yok → NervousObserver faz-değişimi almıyor → `orchestra/sprint-controller.ts` ⬜
- `deckent flow run` daemon sadece flow-count basıyor, action koşmuyor → `cli/commands/flow.ts` ◑ FlowRuntime.tick() incelenecek
- `deckent_kill` MCP sadece JSON'da PAUSED işaretliyor, gerçek process'i öldürmüyor → `mcp/tools/kill.ts` ⛔ description-dürüst, defer
- ✅ `deckent_plan` dry-run dökümante ama diske task yazıyor → `mcp/tools/plan.ts` **DONE (06-22, `823b8bb4`)** — tool `dryRun:true` force ediyor (planSprint write-guard'ı tetikler); faithful 2-test
- `nervous edit` IPC-gate bypass → two-writer race → `cli/commands/nervous.ts` ◑ moderate
- `resume` completed-task list geçmeden runSprint → done-task'lar yeniden koşuyor → `cli/commands/resume.ts` ◑ doğrulandı, non-surgical (runSprint signature)
- rbac CLI grant/revoke ölü in-memory Map'e yazıyor → `cli/commands/rbac.ts` ⛔ enterprise-persistence, defer
- `--auto-approve` ignore/forced-true → `cli/commands/run.ts`, `start.ts` ⛔ KASITLI (workers-always-full-write)
- ESM: `runtime-scope-check` bare `require()` ESM'de hep stderr-fallback → `nervous/runtime-scope-check.ts` (R7 ESM-disiplin) ⬜
- ⬜ **`cache_warm` wired-but-INEFFECTIVE** (YENİ, 06-22 ampirik — sprint-317 deney) → `orchestra/sprint-spawner.ts:335` (boot-cw warm-delay) + `core/limit-ledger-report.ts evaluateCacheGate`. cache_warm=true + 45s warm-delay (görünür uygulandı) + identik agent/skill/ADR prefix → **warm-share HÂLÂ %0**; her worker ~26.8K boot-prefix'i sıfırdan yazıyor, cross-worker sharing OLMUYOR. Kök-neden: spawn-`claude -p` CLI cross-invocation-shareable cached-prefix üretmiyor (per-session içerik/session-scope). Feature 45s-latency ekler %0-kazanç. **Disposition: ya kaldır (ölü-latency) ya da CLI-stabilize-araştır; gerçek-sharing yalnız direct-HTTP-API (anthropic-http-client) yolu = native-worker mimarisi (büyük).** Detay memory [[project_worker_prompt_cache_finding]].

### A·R8 — spawnSync async-context'te (ADR-087 ihlali, event-loop freeze) — deckent mekanik 🟠
> **R8-İLERLEME (06-22, Alperen vein-seçimi):** ✅ **baseline-tracker captureVitestBaseline** (`45f86208`) — EN YÜKSEK freeze (180s vitest, runSelfAuditGate + pre-sprint-baseline'da event-loop'u dakikalarca donduruyordu) → async `spawn` + injectable `VitestRunner` (stdout/stderr stream-collect + SIGKILL-timer); `checkWorkerHonesty` cascade-async, 2 prod-caller await; shell-win32 korundu; faithful DI-test ("returns Promise" pre-fix RED). 196 affected yeşil. · **NOT (test-zorluğu):** R8 async-conversion'lar faithful-regression'a (wrong-value-assert) uygun değil — çıktı aynı, yalnız bloklamama değişir → **DI-injectable runner** pattern'i (fake-runner enjekte) test-edilebilirliği sağlar; her site bu pattern'le yapılmalı.
> **R8-RECONCILE ✅ + VEIN KAPANDI (06-22, `7852d23d` pushed):** ✅ **mid-sprint-adapter reconcileSpuriousNoGo** — EVALUATE spurious-NO_GO'da git10+tsc60+vitest120 **~190sn sync Brain-freeze** (codebase'in EN KÖTÜSÜ) async'e çevrildi. **Option-B' surgical extraction**: spurious-block `evaluateWithRubric`'ten çıkarıldı (saf-sync grader kaldı, 64 grading-test çağrısı dokunulmadı), yeni async `reconcileEvaluationSpuriousNoGo()` helper'ı 5 prod-site'ı (runEvaluatePhase ×3/runFixPhase/evaluateBacklogResult) sarıyor; tam davranış-koruyucu. 6 src + 12 test; tsc=0, orchestra 422/6233 yeşil, faithful `mid-sprint-adapter-async.test.ts` pre-fix 5/5 RED→GREEN. · **KALAN SITE'LAR — file:line doğrulandı, hepsi NON-actionable:** ⛔ `monitor-adapter.ts` **prod-DEAD** (yalnız test tüketir; `src/monitor/*` import etmez) · ⛔ `output-collector.ts` poll-path **DORMANT** (`.collect()` prod'da hiç çağrılmıyor → poll hiç başlamaz; ayrıca **yeni R7 bulgu**: `/api/output-stream` SSE BOŞ yayın) · ⛔ `task-restoration.ts` tar = resume-only one-shot (hot-loop değil) · ⛔ `planner.ts` **spawnSync KULLANMIYOR** (eski-iddia yanlış; zaten async) · ⛔ CLI one-shot (doctor/sync/upgrade/onboard/attach/cleanup/start/skill/plugin) = tek-process, eşzamanlı-async-iş yok → freeze önemsiz. **→ R8 VEIN KAPALI: tek gerçek-canlı-freeze (reconcile) fixlendi.**
- ✅ `baseline-tracker.ts` captureVitestBaseline spawnSync **DONE (`45f86208`)** — DI-runner async
- ✅ `mid-sprint-adapter.ts` reconcileSpuriousNoGo (git+tsc+vitest ~190s) **DONE (`7852d23d`)** — Option-B' extraction, async helper
- ⛔ `monitor-adapter.ts` — prod-DEAD (skip)
- ⛔ `output-collector.ts` poll-path — dormant (`.collect()` çağrılmıyor) → R7 SSE-boş bulgusu
- ⛔ `task-restoration.ts` tar — resume-only one-shot (düşük)
- ⛔ `planner.ts` — spawnSync yok (eski-iddia yanlış)
- ⛔ CLI one-shot — freeze önemsiz (tek-process)

**A-özet:** ~75-95 distinct fix-task. Auth (A·R1, 12) CC-el-kodu. Geri kalan deckent-worker + zorunlu CC-verify.

---

## 3. BUCKET C — DEAD CODE CLEANUP (batch-delete, zero-caller doğrulanarak)

> Gerçekten ölü scaffolding (broken-feature DEĞİL — onlar B11/A). **Silmeden önce CC her birini repo-grep ile zero-caller doğrular** (test+def hariç). ~100 modül, ~4 batch-sprint:

- **C1 cli/helpers dead-class** (~10): progress-persistence, progress, queue-display, recommendations, review-summary, review-actions, selective-retry, sprint-summary, terminal-utils, worker-status, doctor-format
- **C2 core dead-module** (~20): global-config, interaction-policy, marketplace/dependency-resolver, marketplace/rating-system, notification-config, notification-providers/*, telemetry (B7'ye bağlı), provider-capabilities, skill-cache, skill-registry, self-dispatch, credentials (B11), decision-config factories, audit-export (zero-caller), session-store (auth-session), token-counter (B7-token)
- **C3 orchestra dead-module** (~15): monitor-adapter (R8-fix sonrası), result-merger, sprint-estimator, task-retry, timeout-watcher (B11-KES), multi-agent, batch-stats, brain-context, capability-realizer, pattern-recorder/reader, temp-skill-generator orphans
- **C4 dashboard dead-component** (~10): AppShell, WorkerGrid, RoutingDistribution, analytics×4, theme.ts, terminal-sessions, SprintControlPanel-zero-caller (B11'de WIRE dersen kalır)
- **C5 dead-test** (~12, R8 test-tiyatrosu): tautological/mock-only/dead-code-pinned testler → ya gerçek-assert'e çevir ya sil (chat-mode, skill-marketplace, doctor-format, sprint-summary×9, mcp-tool-count, repl-status-line-wire, checkpoint, metrics-updater, notification-flow, live-merge, terminal-no-overlap)

**C-uyarı:** C2/C3'teki bazı modüller B11'de "WIRE" işaretlenirse C'den A'ya taşınır. **Önce B11'i karara bağla.**

---

## 4. Sprint Planı & Tahmin

**Sıralama (bağımlılık):**
1. **B-ruling oturumu (sen)** — B1-B11 karar. ~0 dev. A/C sınırını çizer. **Bunsuz A'ya başlanmaz.**
2. **A·R1-auth sprint (CC el-kodu)** — A1-A12. En acil (live-IDOR). ~1 oturum + CC-verify.
3. **A·R5+R6 sprint (deckent + CC-verify)** — hardcoded-metrik + silent-fallback. ~1 batch (≤20).
4. **A·R4 sprint (SSOT collapse)** — duplicate'ler. ~1-2 batch (dikkatli, canlı-kopya seç).
5. **A·R2+R7 sprint** — verification-spine wire + advertised-no-op. ~1-2 batch (B11-WIRE'larla birlikte).
6. **A·R8 sprint** — spawnSync→async. ~1 batch (mekanik).
7. **C1-C5 cleanup** — ~4 batch-delete (zero-caller doğrulamalı).

**Tahmin (deckent + zorunlu CC-verify, bilinen kısıtlarla):**
- deckent dispatch 30dk-cap + ≤20-26 task/sprint + rate-limit + R2-gereği-CC-verify (DONE'a güvenmiyoruz) → her batch ~1.5-2h.
- **A: ~5-6 fix-sprint. C: ~4 sprint.** Senin 5h/günlük + haftalık limitlerine yayılı.
- **Gerçekçi toplam: ~1-2 haftalık denetimli dogfood oturumu.** Tek-gecede-biter değil; darboğaz CC-verify throughput'u + usage-limit.
- **Kaç madde:** ~75-95 A-fix + 14 B-ruling (+18 B11-tag) + ~100 C-silme (≈4 batch'e iner).

**Not (meta):** deckent'in 30dk-cap'i (R3 dormant `sprint_timeout_minutes`, `result-collector.ts:530`) kendi audit-sprint'imizi bile yarıda kesti. Bu **A·R3'te erken-fix** edilmeli (sprint_timeout_minutes→timeoutMs thread) yoksa her fix-sprint aynı duvara çarpar. → **Sprint-2'ye ekle.**

---
_Kaynak: deckent-last-standing-crosscheck.md (Phase-1 CC ⨯ Phase-2 deckent) · 2026-06-21 triage · file:line-grounded, doc-inference yok._
