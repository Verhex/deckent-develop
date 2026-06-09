<!-- Dil: TR | Teknik terimler EN -->
# Deckent Beta Tracker

**Son güncelleme:** 2026-05-20 (Sprint 175 — Gömülü Web Terminali teslim edildi) | **Son sprint:** 175 (Alperen tarafından smoke ile doğrulandı) | **Versiyon:** v1.0.0-beta.1 → v1.0.0-beta.2 hedef | **Branch:** `docs/embedded-web-terminal-spec` (origin push'lı)

---

## Sprint 175 — Gömülü Web Terminali (2026-05-19 → 2026-05-20) — TESLİM

Dashboard içinde VSCode-benzeri dock-edilebilir terminal paneli. **4-parçalı agentic-OS yolunun #1 alt-projesi.** Alperen 2026-05-20 smoke kanıtı: `+claude` / `+gemini` / `+shell` sekmeleri gerçek interaktif PTY oturumları tetikledi.

**Teslim edilenler:**
- `node-pty` PTY backend `SessionBackend` interface'i arkasında (#3 k8s pod-exec için enterprise dikişi)
- WebSocket gateway, token `Sec-WebSocket-Protocol` subprotocol'ünde; auth pty spawn'dan ÖNCE doğrulanır (tarayıcı `WebSocket`'te `Authorization` header set edemez)
- `LocalTokenAuthProvider` — bypass-bağımsız (`DECKENT_API_AUTH_DISABLED`'ı **kasıtlı yok-sayar**; SHA-256 + `timingSafeEqual`)
- HTTP control route'ları (`/api/terminal/sessions` CRUD) + servis edilen `index.html`'e localhost-only `window.__DECKENT_TERMINAL_TOKEN__` enjeksiyonu
- Çoklu-sekme UI: `claude` / `gemini` / `codex` / `deckent` / shell quick-launch; `DockPanel` React Router `Outlet` DIŞINDA mount'lu (sayfa geçişlerinde oturum kalıcı)
- tmux-vari reattach: oturum başına sınırlı in-memory scrollback ring buffer, `detach ≠ kill`, e2e test client disconnect sonrası MARKER replay'i doğruluyor (sunucu restart desteklenMEZ — bilinçli sınır)
- Şeffaf tenant-scoped audit → `memory.db` (sadece düşük-hacim yapısal event; ham PTY çıktısı **asla** persist edilmez)
- `deckent serve --host` / `--no-terminal` CLI; uzak bind, açık token olmadan terminal'i etkinleştirmeyi reddeder
- ADR-062 (Embedded Web Terminal) accepted; ADR-010 Sprint-172 Amendment table iki yeni runtime dep ile genişledi (`node-pty`, `ws`) — dep count 7→9, hepsi ADR-gerekçeli

**Metrikler:**
- 46/46 terminal-spesifik test PASS (backend 30, frontend 15, e2e reattach 1)
- `tsc --noEmit` temiz; `vite build` SUCCESS (1066KB / gzip 296KB)
- `npm pack --dry-run` temiz (node-pty + ws bundled)
- `docs/embedded-web-terminal-spec` üzerinde 17 commit (5 wave-bazlı feature + 2 hotfix + spec/plan/DIRECTIVES + debt closure + #2 backlog notları)

**Dürüst kalan iş:**
- node-pty linux-x64 prebuild `node-pty@^1.0.0`'da yok — Sprint 175'te manuel workaround uygulandı (`@lydell/node-pty-linux-x64`'tan kopyala); kalıcı fix (optionalDep) Sprint 176 hedefi (~5 dk iş)
- `DECKENT_API_AUTH_DISABLED=1` dashboard'un terminal-dışı data call'ları (SSE / status / events) için hâlâ gerekli — frontend genel API auth altyapısı yok. Bu terminal regresyonu **değildir** (terminal auth bağımsız), alt-proje #1'in bilinen sınırı (frontend auth altyapısı #2/#3'e ertelendi).

**Alt-proje #2-#4 backlog (spec §1d resmi kayıt):**
1. Self-security prosedürü (prompt/komut guard) + planner state-hygiene (6 yakalanmış madde: auto-debt-inject empty-scope, re-plan orphan cleanup, DEP0190 `shell:true`, schema-gate `coverage` enforcement, pre-existing WorkerCard/DashboardPage TS errors, doctor `DECISIONS.md` obsolete check)
2. Milyon-ölçek: multi-tenant izolasyon, gerçek `tenantId`, `SessionBackend` k8s pod-exec impl, sandbox, rate/kaynak limit, OIDC/SSO `AuthProvider` impl
3. Enterprise dış-dünya entegrasyon + güvenli veri alışverişi (audit zenginleştirme, compliance: SOC2/GDPR)

**Süreç öğrenimleri (kalıcı hafıza yazıldı):**
- `feedback_trust_brain_eval_not_worker` — worker `.result.selfAssessment` ipucu; Brain evaluation verdict gerçek karar. Çelişebilirler; zor yoldan öğrendim.
- `feedback_trust_deckent_recovery` — deckent'in kendi FIX phase / recovery kanalları var; manuel müdahale öneri listesinin SON maddesi, ilki değil.

Spec: `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`. Plan: `docs/superpowers/plans/2026-05-19-embedded-web-terminal.md`. Kullanıcı rehberi: `docs/guide/terminal-tr.md`. PR: `https://github.com/VerhexIO/deckent-develop/pull/new/docs/embedded-web-terminal-spec`.

---

## Mevcut Durum
| Metric | Value |
|--------|-------|
| Version | 1.0.0-beta.1 |
| Sprint | sprint-255 |
| MCP Tools | 32 |
| MCP Resources | 8 |
| CLI Commands | 55+ |
| Dashboard Pages | 12 |
| Agents | 15 built-in + 2 custom |
| Skills | 21 built-in |
| Providers | 3 (Claude, Codex, Gemini) |

## Genel Bakış

145+ sprint, 12,485+ test, 250+ TypeScript modülü. Üç spawn backend doğrulandı: tmux (en hızlı, 2dk55sn), subprocess (çalışıyor, 6dk53sn), Docker (canlı doğrulandı — Sprint 119-129). Self-dogfooding aktif — Deckent kendi test regresyonlarını ve dokümantasyonunu sprint'lerle düzeltiyor. Dokümantasyon konsolide edildi: BETA-TRACKER (EN+TR), docs.json 7 dokümanı otomatik güncelliyor.

**Strateji:** npm paketle → kendi projelerinde dogfood → feedback → düzelt → public repo (VerhexIO/deckent)

**Vizyon (Alperen Direktifi):**
> **"Perşembe 23 Nisan 2026 — Beta GA. Eksiksiz, milyon user hazır. Tüm hedefimize ulaşıyoruz: otonom AI orkestrator agent + web/user toolları, OpenClaw–CoWork rakibi/muadili/iş ortağı."**

**Mevcut Durum:** v0.4.0-beta.1 — Üç backend canlı doğrulandı. Docker backend tam operasyonel (Sprint 119-129): worker'lar container içinde tsc/vitest çalıştırabiliyor. Sprint 125-126 Rubric-Based Grading + Context-Aware Routing + Token Usage Tracker implemente edildi. Sprint 127-128 kalite reformu: 7 kritik düzeltme + litmus testi. Sprint 129 enterprise tech debt temizliği: DEBT.md parse fix, evaluator tutarlılığı, tüm debt kapatıldı. Sprint 130 codebase doğruluk reformu: MCP instructions 21 tool fix, decision-engine V1 @deprecated arşivleme + ADR-028, gerçek coverage ölçümü (89.33%). Sprint 131 HTTP API Auth + Config Cache + 4 ADR (029-032). Sprint 132 360° Enterprise Readiness Audit (118 bulgu, 3.2/5 baseline). Sprint 133 güvenlik sertleştirme: plugin SHA-256 + AST sandbox, 12/12 task DONE. Sprint 134 üçlü dogfooding + god object split + ADR-033/034 ürün vizyonu. Sprint 135 operasyonel sertleştirme: sıfır koordinatör çökmesi, Docker graceful shutdown. Sprint 136 mimari derinleştirme: sprint-controller.ts 1890→209 LoC. Sprint 137 test suite restorasyonu + tryCodeVerifiedDone wire. Sprint 138 ADR Governance Integration + Structured Event Stream + Worker Honest Assessment + Sprint Resume MVP. Sprint 139 chain reform + Docker HB fix + backend parity 3/3 + RBAC V1.0 + self-modifying detection. Sprint 140-141 Memory V2 DB-First Architecture (SQLite FTS5, dual-layer i18n normalize). Sprint 142-144 dead code audit + cleanup. Sprint 145 adaptive timeout + observability + doküman reformu. 12,485+ test geçiyor, açık borç yok.

---

## Faz Planı

### Faz 1: "Kendin Kullan" — TAMAMLANDI ✅
### Faz 1.5: "Init UX + Onboarding" — TAMAMLANDI ✅ (Sprint 070-071)

### Faz 2: "Genel Kullanılabilirlik" — AKTİF

**Sprint 072 — TAMAMLANDI (2026-03-27):**
- [x] P1-7: Plan tier'ları → performance/balanced/economic + backward compat
- [x] P1-8: Init wizard → genel provider seçimi, $ kaldırıldı
- [x] P1-9: MODEL_API_IDS mapping + resolveApiModelId()
- [x] P2-13: README.md → 12,192+ test, 86+ sprint, Windows full, 19 MCP tools
- [x] P5-31: sprint-controller.ts → 7 phase fonksiyonu sprint-phases.ts'ye extract

**Sprint 073 — TAMAMLANDI (2026-03-30) — Self Dogfooding:**
- [x] 100 test regresyonu düzeltildi (43+16+9+23+3 = 100 fail → 0 fail)
- [x] test-writer agent 5/5 task DONE, 17m 41s

**Sprint 074 — TAMAMLANDI (2026-03-30) — Docs + Debt:**
- [x] P2-13: README.md sayılar güncellendi (12,176+ test, 73+ sprint)
- [x] P2-16: CHANGELOG + SPRINT-LOG Sprint 072-073 entry'leri
- [x] .brain/ tutarlılık (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md modül sayıları düzeltildi (orchestra 47, core 49, MCP 19)
- [x] debt-069-005 (TempAgent) + debt-069-006 (scope parser) kapandı
- [x] doc-writer agent 5/5 + bug-fixer 2/2, 7m 29s

**Sprint 075 — TAMAMLANDI (2026-03-30) — Dil Tutarlılığı + Vizyonu:**
- [x] P2-14: docs/CHANGELOG.md Türkçeleştirildi — 300+ EN → TR çevirisi
- [x] P2-18: VISION.md oluşturuldu — 7 bölüm, rakip analizi (5 tablo), roadmap
- [x] P2-19: docs/ link audit — 4 broken link tespit ve düzeltildi
- [x] P4-29: .detect-secrets v1.5.0 kuruldu — .pre-commit-config.yaml
- [x] P5-31: God object split Faz 2 — sprint-controller.ts → result-collector.ts extract

**Sprint 076 — TAMAMLANDI (2026-03-31):**
- [x] P3-20: Stale heartbeat root cause fix — finalizeHeartbeat + auditor DONE skip
- [x] P3-22: Dashboard API entegrasyon testi — 10 yeni test, 6 describe block
- [x] P6-40: Graceful shutdown — SIGINT → interruptActiveSprint + killAllSessions
- [x] P5-31: God object split Faz 3 — result-collector.ts extract (233 satır)

**Sprint 077 — TAMAMLANDI (2026-03-31) — Docs:**
- [x] CHANGELOG + SPRINT-LOG Sprint 076 entry'leri
- [x] .brain/ güncelleme (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md modül sayıları güncellendi

**Sprint 078 — TAMAMLANDI (2026-04-01), 6m 57s:**
- [x] Blueprint senkronizasyonu, i18n altyapısı, TR/EN docs, /api/tasks
- [x] CHANGELOG + SPRINT-LOG catch-up, HistoryPage success rate trend

**Sprint 079 — TAMAMLANDI (2026-04-01), ~15m:**
- [x] README-TR fix, dashboard kontrol butonları, init dil-ilk, /api/cleanup

**Sprint 080 — TAMAMLANDI (2026-04-01), 9m 06s:**
- [x] Dashboard UX Overhaul: WorkerCard, SprintPhaseTimeline, ActivityFeed

**Sprint 081 — TAMAMLANDI (2026-04-01), 12m 38s:**
- [x] Settings+Config birleştirme, i18n tam kapsam (44 key), terminal logları

**Sprint 082 — TAMAMLANDI (2026-04-02):**
- [x] MCP/CLI parity: 19 tool, 33 CLI, ADR-022
- [x] Usage card kaldırma, v0.3.0-beta.1, init test fix
- [x] Dashboard Faz B: skeleton loading, AgentDetail zenginleştirme, EmptyState, polish

**Sprint 130 — TAMAMLANDI (2026-04-10) — Codebase Doğruluk Reformu:**
- [x] MCP server.ts instructions string düzeltildi: Tools (15) → Tools (21), eksik 6 tool eklendi
- [x] README.md, README-TR.md, CONTRIBUTING.md MCP tool sayıları 21 olarak düzeltildi
- [x] README.md + README-TR.md'ye 4 yeni Key Feature eklendi (Rubric Grading, Worker Questions, Context-Aware Routing, Token Tracker)
- [x] Decision-engine V1 modülleri @deprecated yapıldı (4 dosya), ADR-028 yazıldı
- [x] Gerçek coverage ölçüldü: 89.33% (96%+ iddiası düzeltildi)
- [x] .contracts/api-surface.md rubricScores + evaluationDecision alanları eklendi

**Sprint 131 — TAMAMLANDI (2026-04-10) — HTTP API Auth + Config Cache:**
- [x] HTTP API Bearer Token Authentication (auth.ts middleware)
- [x] loadConfig() modül seviyesi cache: cachedConfig/cacheStamp/cachedProjectRoot
- [x] 4 ADR yazıldı (ADR-029'dan ADR-032'ye, her biri ≥50 satır)
- [x] Rakip analizi Nisan 2026 için tamamen güncellendi

**Sprint 132 — TAMAMLANDI (2026-04-10) — 360° Kurumsal Hazırlık Denetimi:**
- [x] Tam statik denetim: 6 paralel worker, 118 bulgu (5 KRİTİK, 22 YÜKSEK, 40 ORTA, 28 DÜŞÜK, 23 BİLGİ)
- [x] Hazırlık puanı baseline: 3.2/5
- [x] W5 sprint-reporter.ts'i (2132 LoC) üst god object olarak tespit etti — Sprint 134 hedefi
- [x] W2 799 sync I/O çağrısı tespit etti — Sprint 135-137 async migration hedefi

**Sprint 133 — TAMAMLANDI (2026-04-10) — Güvenlik Sertleştirme:**
- [x] Plugin SHA-256 imza doğrulaması (PluginSecurityError)
- [x] SkillSandbox AST tarama + allowed_paths enforcer
- [x] 12/12 task DONE, 27dk 21sn, +147 net test (12,372 → 12,485+ geçiyor)
- [x] Hazırlık: 3.2/5 → 3.6/5 (+0.4)

**Sprint 134 — TAMAMLANDI (2026-04-10/11) — Üçlü Dogfooding + Ürün Vizyonu:**
- [x] sprint-reporter.ts 4'lü bölme (2297 → 96 satır barrel): sprint-metrics, sprint-retro-writer, sprint-docs-updater, ci-reporter
- [x] Task Dependency Pipeline (T-001): parseStructuredDirectives dependencies parsing
- [x] Local Observability Seviye 2 (T-011): veri yerelliği doğrulandı, metrics.jsonl canlı
- [x] Brain Self-Audit Gate (T-014): .deckent/run-self-audit.mjs ile canlı PASS
- [x] ADR-033 Product-Not-Service Vizyonu + ADR-034 Multi-Project Isolation
- [x] docs/vision/roadmap.md (202 satır) + docs/design/multi-project-isolation.md (421 satır)
- [x] 11 DONE + 4 GO_WITH_TECH_DEBT + 0 NO_GO (koordinatör çökmesi sonrası manuel kurtarma)
- [x] Testler: 12,372 → 12,485 (+113 net), Hazırlık: 3.6/5 → 3.86/5 (+0.26)

**Sprint 135 — TAMAMLANDI (2026-04-12) — Operasyonel Sertleştirme:**
- [x] Koordinatör dayanıklılığı: sprint-pid-manager.ts (258 LoC) — sıfır koordinatör çökmesi
- [x] Docker graceful shutdown: docker stop --time=10 (sahte NO_GO pattern düzeltmesi)
- [x] askBrain() çıkarımı: ipc-registry.ts 37→270 LoC
- [x] Planner Priority/Dependencies parsing (6 regex testi)
- [x] GO_WITH_GATE_FAILURE durum yayılımı wire
- [x] Brain bellek bütçesi DECAY_EXEMPT + config drift fix (600→900 satır bütçe)
- [x] 10 DONE + 4 TECH_DEBT + 3 NO_GO (fiziksel kod kontrolü: 13/13 mevcut)
- [x] Testler: 12,485 → 12,478 pass (505 → 512 dosya, +14 yeni, -5 regresyon)
- [x] Hazırlık: 3.86/5 → 3.93/5 (+0.07), 1s 0dk 54sn doğal tamamlanma

**Sprint 136 — TAMAMLANDI (2026-04-13) — Mimari Derinleştirme + Regresyon:**
- [x] sprint-controller.ts **1890 → 209 LoC** (-1681 satır) — god object tamamen zayıflatıldı
- [x] T-005 canlı dogfood: sprint-controller.ts:528 priority wire bug sprint içinde düzeltildi
- [x] tryCodeVerifiedDone() helper: result-evaluator.ts +408 satır (Sprint 137'de wire)
- [x] gate.json + load-report.md wire hooks kod-hazır (Sprint 137'de runtime restore)
- [x] 5 test regresyon düzeltmesi (start-sandbox, start, i18n-integration, docker-backend, error-handling-unification)
- [x] 7 DONE + 3 NO_GO (docker HB shutdown bug pattern), vitest 124 fail (Task 8 refactor yan etki)
- [x] Testler: 12,478 → 12,684 geçiyor hedefi (Sprint 137 T-001 restorasyonu sonrası), tsc 0 hata
- [x] Hazırlık: 3.93/5 → 3.925/5 (marjinal -0.005, mimari kazanım vitest regresyonunu dengeliyor)

**Sprint 137 — TAMAMLANDI (2026-04-13) — Test Restorasyonu + Wire Düzeltmeleri:**
- [x] Brain Budget Decay No-Op Bug Fix: runDecay() düzeltildi
- [x] tryCodeVerifiedDone wire: canlı onaylandı
- [x] Brain Spurious NO_GO Reconciliation Helper: Sprint 136 T-003 canlı onay
- [x] Test suite restorasyonu: 124 fail → 0 fail hedefi

**Sprint 138 — TAMAMLANDI (2026-04-14) — ADR Governance + Event Stream:**
- [x] ADR Governance Integration (MADR v3 hibrit + 37 ADR migration + ADR-036)
- [x] ADR-035 Verification Protocol Standard (15 kanal kodu V1.0)
- [x] Auditor Authority Extension 3-Pipeline (verifyWorkerResult + verifyFunctional + validateTechDebt)
- [x] Structured Event Stream + Plan-Time Scope Collision Detection (event-stream.ts 305 LoC)
- [x] Layer 4 Runtime Wire Forensic Fix (ADR-006 canlı enforcement)
- [x] Auto-Archive ArchiveOrphanTasks Extension
- [x] Worker Honest Assessment Calibration v2 (Honest Self-Assessment block + verify-delta)
- [x] Long-Running Sprint Resume Capability MVP (sprint-checkpoint.ts + resume.ts)

**Sprint 139 — TAMAMLANDI (2026-04-15) — Chain Reform + RBAC:**
- [x] Docker HB Core Fix 5-sprint P0 (atomicWriteFileSync + SIGTERM fsync handler)
- [x] Chain Dependency Scheduler Wave 1 (Kahn's algorithm topological + detectScopeCollisions, +620 LoC)
- [x] Backend Parity 3/3 (Docker + tmux + subprocess E2E test suite)
- [x] ADR-037 Brain-Auditor-Worker Authority Matrix RBAC V1.0 (+1370 LoC)
- [x] ADR-038 Self-Modifying Task Detection (+789 LoC)
- [x] Worker Event Hook + Notification Dispatcher (notification-dispatcher.ts + notify-adapters/)
- [x] Event Stream Runtime E2E Test (full pipeline simulation)

**Sprint 140-141 — TAMAMLANDI (2026-04-16/17) — Memory V2 DB-First Architecture:**
- [x] Memory V2: SQLite (better-sqlite3) single source of truth
- [x] FTS5 full-text search: dual-layer Turkish normalize (TR/EN/DE %100 recall)
- [x] DB path: `.brain/memory.db` (gitignored, rebuilt from exports)
- [x] Exports: `.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` (git-tracked)
- [x] CLI: `deckent recall`, `deckent remember`, `deckent memory rebuild|export|stats`
- [x] MCP: `deckent_memory_query` tool — cross-source hafıza arama
- [x] 96% context azaltımı (eski .brain/ markdown → DB)

**Sprint 142-144 — TAMAMLANDI (2026-04-18/19) — Dead Code Audit + Cleanup:**
- [x] Sprint 142: src/core/ batch 1 analysis (Memory V2 modülleri)
- [x] Sprint 143: chain reform complete — 19/20 DONE + coordinator post-sprint regression fixes
- [x] Sprint 144: god split + ADR-008 Cycle 2 + perf + debt — 24/27 DONE

**Sprint 145 — AKTİF (2026-04-20) — Adaptive Timeout + Observability + Doküman Reformu:**
- [ ] Adaptive timeout reform
- [ ] Unified observability
- [ ] CLI/MCP audit
- [ ] BETA-TRACKER EN/TR parity + 10 sprint kayıp kalibrasyonu
- [ ] MASTER-BLUEPRINT güncelleme

**Sonraki Planlar:**
- [ ] P1-10..12: Multi-provider test (BLOCKED — API key gerekli)

### Faz 3: "Dokümantasyon" — ✅ TAMAMLANDI
TR+EN çift dil, VISION, link audit, config dashboard — Sprint 074-082'de tamamlandı.

### Faz 4: "Public Repo" — AKTİF (Beta GA: 23 Nisan 2026)
.detect-secrets, VerhexIO/deckent'e taşıma, CI/CD, npm publish

---

## 🚀 Beta GA Yol Haritası — Sprint 150 (23 Nisan 2026)

> **"Perşembe 23 Nisan 2026 — Beta GA. Eksiksiz, milyon user hazır. Tüm hedefimize ulaşıyoruz: otonom AI orkestrator agent + web/user toolları, OpenClaw–CoWork rakibi/muadili/iş ortağı."**
> — Alperen Direktifi

### 5-Sprint Roadmap

| Sprint | Gün | Tema | Hedef Readiness |
|--------|-----|------|-----------------|
| 145 | Pzt 20 Nis | Adaptive Timeout + Observability + Runtime Wire + Doküman Reformu | 4.10/5 |
| 146 | Pzt 20 - Sal 21 Nis | Ölü Kod Wave C + Config Audit + CLI --root parity + MCP outputSchema | 4.25/5 |
| 147 | Sal 21 Nis | Multi-Provider Beta-Sertleştirme + Web Dashboard cilalama | 4.45/5 |
| 148 | Çar 22 Nis | Cross-platform doğrulama + Plugin sandbox | 4.65/5 |
| 149 | Çar 22 - Per 23 Nis | Final doküman konsolidasyonu + npm publish dry-run | 4.85/5 |
| 150 | Per 23 Nis | 🚀 Beta GA Cutover (npm publish, tag v1.0.0-beta.1, public duyuru) | 5.0/5 |
| 151-156 | 24 Nis – 5 May | Post-GA stabilizasyon — Public repo flip (VerhexIO/deckent) + Sprint 156 dogfood (Bug X dual-eval race + Sprint-Stall + state freeze) | Stabilizasyon |
| 157-162 | 6-10 May | TaskType + Wave Scheduler + Survivor wire — 5-layer pipeline, ADR-044 Wave semantics, sprint-controller survivor branch fix | Mimari derinleştirme |
| 163 | 11 May | **Brain Stability Hattı SEALED** (6/6 DONE, 0 NO_GO — brain processQueue + state freeze regression chain kapandı) | 6/6 ✅ |
| 164 | 12-13 May | **Wave-Based Execution Semantics + ADR-045** — 5/6 DONE + 1 hayalet stub (164-006 worker docker HB shutdown), wire 13 grep match code-complete, runtime gated `dependency_pipeline_enabled: false`, vitest gate FAIL +1, Brain processQueue legacy FIFO stall canlı reproduce, Bug X (Sprint 156-011 stub) replay, Bug W (Auditor dead_event_stream) Sprint 148'den uyuyor | GO_WITH_GATE_FAILURE |
| 165 | 13 May | **Bug X/Y/Z/W kapama + Dokümantasyon freeze + npm publish hazırlık** — 5/5 DONE: T1 Bug X stub kaldırma (sprint-156-011 kapandı), T2 Bug Y Sprint-Stall fix, T3 Bug Z kronik vitest +1 fail kapandı, T4 Bug W dead_event_stream aktive edildi, T5 docs freeze + public repo hazırlık, v1.0.0-beta.1 npm publish hazır | 18/20 PASS ✅ |
| 166 | 13-14 May | **Brain Self-Update + Veri Bütünlüğü Kapanışı + ADR-046** — 11/11 (10 DONE + 1 GO_WTD), ~2735 LoC, 35+ yeni test. Bug M (adrInsert hook + Step 3 wire), Bug N (onRuleRegen manuel finalize wire + AUTO/CUSTOM block), Bug S (doc-cache sprint-aware key), Bug Y2 (3-katmanlı ground-truth defense — 15 agent anchor), Bug R+T+U+V+C+X+P+Q+W+K+L bundled, ADR-046 Brain Self-Update Hook Architecture kabul edildi. 4 yeni bug E+G+Z2+Z3 tespit → Sprint 167 P0 | 19/20 PASS ✅ |
| 167 | 15 May+ | **Bug E+G+Z2+Z3 Fix + dependency_pipeline_enabled Flip + M1-M4 Monitoring Baseline** — Sprint 166 tespit edilen 4 yeni bug fix + `dependency_pipeline_enabled: true` flip canlı (Wave scheduling devrede, Sprint 135 T-005 6. canlı dogfood), minimal 3-task multi-wave smoke + M1-M4 (cache key + rule regen + adr insert + stale_md) baseline tracking kuruldu | Stabilizasyon |
| 168 | 16 May+ | 🚀 **Open Source GA — Public Repo Flip + npm publish v1.0.0-beta.2 + Show HN** — Public repo flip (`VerhexIO/deckent` → `VerhexIO/deckent` public), npm publish v1.0.0-beta.2, GitHub release, Show HN + Reddit + Twitter duyuru, topluluk onboarding | 🚀 5.0/5 |

### Beta GA Exit Criteria — Sprint 166 Sonrası (2026-05-14)

Sprint 166 final durumu: **19/20 PASS, 1 PENDING (#11 docker e2e canlı yeniden doğrulama), 0 FAIL** — vitest kronik +1 fail Sprint 165 T3'te kapandı, Sprint 166'da 35+ yeni test delta 0 fail.

| # | Kriter | Hedef | Durum |
|---|--------|-------|-------|
| 1 | `tsc --noEmit` sıfır hata | 0 hata | ✅ PASS |
| 2 | `npx vitest run` ≥%99.5 pass | ≥%99.5 | ✅ **PASS** (Sprint 165 T3 Sprint 159'dan beri kronik +1 kapattı; Sprint 166 +35 yeni test, delta 0 fail) |
| 3 | Coverage ≥ %85 | %85+ | ✅ **%89.33** (artık gate #2'ye bağlı değil) |
| 4 | Tüm MCP tool'ları çalışıyor | 27+/27 | ✅ PASS (27 tool — audit, recover, feature_query, watch, nervous_* canlı) |
| 5 | Tüm CLI komutları çalışıyor | 45+ | ✅ PASS (55-56 komut — recall, remember, memory rebuild/export/stats dahil) |
| 6 | `npm pack --dry-run` temiz | 0 uyarı | ✅ PASS (1.08 MB) |
| 7 | Çapraz platform: macOS + Linux + WSL2 | 3/3 | ✅ Sprint 148 |
| 8 | Multi-provider: Claude + Codex + Gemini test edildi | 3/3 | ✅ Sprint 148 |
| 9 | i18n: CLI %100 + MCP %100 + Dashboard %95+ | %95+ | ✅ Sprint 145 |
| 10 | Memory V2 stress test pass | FTS5 + decay + rebuild | ✅ Sprint 145 + Sprint 166 (ADR-046 self-update hook chain doğrulandı) |
| 11 | Dokümantasyon: README, API ref, config ref güncel | Tümü senkronize | 🟡 Sprint 166 T8 living docs devrede (TOOLS/BOOT/WORKER-GUIDE auto-generator wire edildi) — Sprint 168 docker e2e canlı yeniden doğrulama bekliyor |
| 12 | Sıfır açık CRITICAL/HIGH borç | 0 madde | ✅ Sprint 165 tüm kronik borçları kapattı (Bug X stub replay kapandı, sprint-156-011 resolved); Sprint 166 M+N+S+Y2 fix eklendi |
| **13** | **Mesajlaşma üçlüsü smoke** — Discord + Telegram + WhatsApp | 2/2 + WhatsApp scaffold | 🟡 Token aktivasyonu bekliyor |
| **14** | **`deckent_style` toggle** — sprint/task switch config-driven | Canlı | ✅ Sprint 150A |
| **15** | **DeckentHub 20 seed skill** — Ed25519 imzalı, AST sandbox | 20/20 yayımlandı | ✅ Sprint 165 publish hedefine ulaşıldı |
| 16 | ADR governance — 46 ADR kabul | 46 ADR | ✅ ADR-046 Brain Self-Update Hook Architecture Sprint 166'da eklendi (Wave 1.5 bootstrap gate) |
| 17 | Brain stability — 5/6 task gate | ≥5/6 DONE | ✅ Sprint 163 (6/6 DONE, mühürlendi); Sprint 166 (11/11, 10 DONE + 1 GO_WTD) |
| 18 | Wire code-complete (dependency pipeline) | 13 grep eşleşmesi | ✅ Sprint 164 (`respawnEligibleTasks` 13 eşleşme); Sprint 167 `dependency_pipeline_enabled` flip canlı |
| 19 | Bug X (Sprint 156-011 stub) replay analizi | Reproduce + Kapatma | ✅ Sprint 165 T1 (Bug X stub kaldırıldı, Brain processQueue legacy FIFO stall kapandı) |
| 20 | Bug W (Auditor `dead_event_stream`) | Sprint 148'den açık | ✅ Sprint 165 T4 (dead_event_stream aktive edildi); Sprint 166 T9 (emitAlert helper + stale_md detector wire edildi) |

---

## Öncelik Matrisi (P0-P6)

### P0 — npm Paketleme + Dogfooding — TAMAMLANDI ✅

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 1 | npm publish test | **DONE** | 518KB, 479 dosya, local install çalışıyor |
| 2 | `deckent init` gerçek proje testi | **DONE** | Windows'ta Vizetron (Python/FastAPI) test edildi |
| 3 | `deckent doctor` dış ortam | **DONE** | WSL2 + Windows, SKIP/OK/FAIL, healthScore fix |
| 4 | Shebang + bin entry | **DONE** | `deckent` + `deckent-mcp` çalışıyor |
| 5 | İlk sprint UX | **DONE** | Vizetron'da sprint-002 başarıyla tamamlandı |
| 6 | Windows native desteği | **DONE** | 7 dosyada shell:true, heartbeat periodic, log capture |

### P1 — Provider & Tier Generalizasyonu

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 7 | Plan tier'ları Claude-specific | **DONE** | performance/balanced/economic + backward compat (Sprint 072) |
| 8 | Claude subscription bağımlılığı | **DONE** | Init wizard provider-agnostic, $ kaldırıldı (Sprint 072) |
| 9 | Model isimleri güncelliği | **DONE** | MODEL_API_IDS + resolveApiModelId() (Sprint 072) |
| 10 | Multi-provider aynı anda test | **YAPILACAK** | Claude + Codex + Gemini aynı sprint'te hiç test edilmedi |
| 11 | API + Subscription birlikte | **YAPILACAK** | API key ile subscription aynı anda çalışıyor mu? |
| 12 | Codex/Gemini CLI binary check | **YAPILACAK** | Gerçek CLI binary'leri doğrulama |

### P2 — Dokümantasyon

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 13 | README.md eski veriler | **DONE** | Badge + sayılar güncellendi (Sprint 074) |
| 14 | Dil tutarsızlığı | **DONE** | docs/CHANGELOG.md Türkçeleştirildi (Sprint 075) |
| 15 | TR+EN çift dil | **KISMEN** | .deckent/docs/ TR/EN desteği eklendi |
| 16 | CHANGELOG.md boş | **DONE** | docs/CHANGELOG.md 1159 satır, Sprint 1-073 (Sprint 074) |
| 17 | Config referans eksik | **DONE** | .deckent/docs/config-reference.md |
| 18 | VISION.md eksik | **DONE** | VISION.md oluşturuldu — vizyon, rakip analizi, roadmap (Sprint 075) |
| 19 | docs/ link kontrolü | **DONE** | 4 broken link tespit edildi ve düzeltildi (Sprint 075) |

### P3 — UX & Dashboard

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 20 | Dashboard veri doğruluğu | **DONE** | Idle state + son sprint özeti, /api/status artık 404 dönmüyor |
| 21 | Dashboard config arayüzü | **DONE** | 13 kategori, 50+ alan, API üzerinden okuma/yazma, tam fonksiyonel |
| 22 | Dashboard gerçek test | **DONE** | 7+ gerçek sprint kaydı, 429 dashboard test geçiyor, API entegrasyonu test edildi |
| 23 | Config.json karmaşıklığı | **KISMEN** | config-reference.md var, dashboard'dan seçim eksik |
| 24 | İlk kullanım deneyimi | **DONE** | quick-start.md, directives-guide.md, workflow rehberi |

### P4 — Platform & Altyapı

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 25 | Windows native | **DONE** | Tam destek: spawn, heartbeat, log, encoding, ps guard |
| 26 | Node >= 18 neden? | **YAPILACAK** | OpenClaw Node 22+, ES2022+ feature check |
| 27 | Docker/Sandbox | **TAMAMLANDI** | Sprint 119-122 canlı doğrulandı: CLI+MCP, 10 e2e test, CI skip guard |
| 28 | CI/CD billing | **YAPILACAK** | Public repo ile çözülür |
| 29 | .detect-secrets | **DONE** | .pre-commit-config.yaml kuruldu, detect-secrets v1.5.0 (Sprint 075) |

### P5 — Kod Kalitesi

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 30 | .gitignore runtime state | **DONE** | |
| 31 | God objects | **DONE** | Faz 1 (Sprint 072), Faz 2 (Sprint 075), Faz 3 (Sprint 076) — result-collector.ts extract tamamlandı |
| 32 | V2 routing test-writer bias | **KISMEN** | Exclude kuralı yazıldı |

### P6 — Kullanıcı Deneyimi İyileştirmeleri

| # | Sorun | Durum | Not |
|---|-------|-------|-----|
| 33 | Error messages kullanıcı-dostu değil | **DONE** | DeckentError + suggestion + howToFix (53 error kodu) |
| 34 | `deckent explain` MCP'de yok | **DONE** | MCP tool eklendi (Sprint 125), 43 test geçiyor |
| 35 | Telemetry/analytics | **YAPILACAK** | Opt-in kullanım analitikleri |
| 36 | `deckent upgrade` test | **DONE** | `--local` flag eklendi, beta workflow |
| 37 | Skill marketplace backend | **YAPILACAK** | CLI komutu var ama backend yok |
| 38 | Plugin system e2e test | **YAPILACAK** | Gerçek plugin ile test edilmedi |
| 39 | Rate limiting production | **YAPILACAK** | 100 req/60s yeterli mi? |
| 40 | Graceful shutdown | **DONE** | SIGINT handler + interruptActiveSprint + killAllSessions (Sprint 076) |

---

## Rakip Analizi

### A. OpenClaw (Acik Kaynak Kisisel AI Asistan)

**Genel:** Peter Steinberger tarafindan olusturulmus acik kaynak (MIT) kisisel AI asistani. **343,000+ GitHub yildizi** (Nisan 2026 — React'i 60 gunde gecti, GitHub'un en cok yildizli yazilim projesi), **1,000+ katkici**, **2 milyon aylik aktif kullanici**, **27 milyon aylik web ziyareti** (%925 buyume). Onceki adlari: Clawdbot → Moltbot → OpenClaw.

**Mimari (5 Katman):**

| Katman | Isim | Islem | Deckent Karsiligi |
|--------|------|-------|-------------------|
| 1 | **Gateway** | Always-on daemon (port 18789), mesaj yonlendirme, session yonetimi, Control UI + WebChat | api/server.ts + mcp/server.ts |
| 2 | **Brain** | ReAct reasoning loop ile LLM orkestrasyonu | orchestra/sprint-controller.ts |
| 3 | **Memory** | Markdown dosyalarinda persistent context (local-first) | .brain/ dizini |
| 4 | **Skills** | 13,729 ClawHub skill (%65+ MCP server wrap): dosya sistemi, shell, browser, email, 400+ uygulama | 21 built-in skill |
| 5 | **Heartbeat** | 30dk aralikla otonom gorev taramasi daemon'u | ✅ heartbeat-daemon.ts (Sprint 088) |

**OpenClaw'un Deckent'te Olmayan Ozellikleri:**

1. ~~**Heartbeat Daemon**~~ — ✅ Sprint 088'de eklendi: `deckent heartbeat --daemon` ile periyodik gorev taramasi, `.deckent/HEARTBEAT.md` okuyup calistirma.
2. **50+ Kanal Entegrasyonu** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix. Deckent sadece CLI + MCP + Dashboard.
3. **Browser Kontrolu** — Web tarayici otomasyonu, sayfa tasima, form doldurma. Deckent'te yok.
4. **Always-On Gateway** — Surekli calisan daemon. Deckent sprint-bazli (basla-bitir modeli).
5. **Otonom Zamanlanmis Gorevler** — HEARTBEAT.md ile kullanici sormadan calisma. Deckent her zaman insan tetiklemesi bekliyor.
6. **Local-First Memory** — Markdown'da kalici bellek. Deckent'te .brain/MEMORY.md benzer ama kapsamdasi (300 satir limit).

**OpenClaw'un Deckent'e Gore Zayif Yanlari:**

1. Tek-agent — coklu paralel worker yok
2. Sprint planlamasi yok — her istek tek seferlik
3. Scope enforcement yok — tum dosya sistemine erisim
4. Multi-provider orkestrasyonu yok — tek LLM
5. Yapılandırılmış task decomposition yok
6. Kalite degerlendirme (GO/NO_GO) yok

**Deckent Icin Dersler:**
- Heartbeat daemon modeli onemli — proaktif calisan sistem
- Kanal entegrasyonlari (Slack, Telegram) kullanici erisimini genisletir
- Always-on gateway modeli sprint-bazli modelden daha otonom
- Skill marketplace (13,729 skill, ClawHub) ekosistem buyutme stratejisi — SKILL.md markdown pattern'i basit ve etkili
- 2M MAU, 27M web ziyareti — acik kaynak topluluk buyutme stratejisi ogrenilebilir

---

### B. Microsoft Copilot Cowork (Kurumsal AI Orkestrator)

**Genel:** Microsoft'un Anthropic isbirligi ile gelistirdigi kurumsal AI agent sistemi. M365 Frontier urununde sunuluyor. Mart 2026'da lansman.

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Multi-model | GPT + Claude "critique layer" — GPT yazar, Claude dogrular | Multi-provider (Claude + Codex + Gemini) |
| Enterprise Graph | Outlook, Teams, Calendar, SharePoint, Excel entegrasyonu | Sadece dosya sistemi + git |
| Otonom Plan | Kullanici sonuc tanimlar, Cowork plan yapar | DIRECTIVES.md → plan → execute |
| Checkpoints | Plan yuruturken insan onay noktalari | ✅ human_checkpoints config (Sprint 088) |
| Arka Plan Calisma | Gorevler arka planda devam eder | Sprint arka planda calisiyor (tmux/subprocess) |

**Cowork'un Deckent'te Olmayan Ozellikleri:**

1. ~~**Human Checkpoints**~~ — ✅ Sprint 088'de eklendi: plan/evaluate/fix fazlarinda onay noktalari, `waitForHumanApproval()` mekanizmasi.
2. **Critique Layer** — Model A yazar, Model B dogrular. Deckent'te tek model per task.
3. **Enterprise Data Graph** — Email, takvim, dosya iliskileri. Deckent sadece kod + dosya.
4. **Progressive Disclosure** — Kullanici istedigi kadar detay gorebilir. Deckent'te tum-veya-hic (dashboard veya terminal).

**Cowork'un Deckent'e Gore Zayif Yanlari:**

1. Kod yazma yetkinligi sinirli — genel is otomasyonu odakli
2. Self-hosted yok — Microsoft bulut zorunlu
3. Acik kaynak degil — genisletilemez
4. Fiyat: $30+/kullanici/ay zorunlu M365 lisansi

**Deckent Icin Dersler:**
- Critique layer (Model A yaz + Model B dogrula) kalite arttirir
- Human checkpoint'ler otonom ama guvenilir is akisi saglar
- Enterprise data entegrasyonu (Jira, Linear, GitHub) onemli genisleme alani

---

### C. Perplexity Computer (Multi-Model AI Agent Sistemi)

**Genel:** 25 Subat 2026'da lansman. $200/ay (Max, 10,000 kredi dahil), $325/koltuk/ay (Enterprise Max). **19 uzmanlasmis AI modeli** orkestre ediyor. Harcama limiti: varsayilan $200, max $2,000.

**Model Rolleri:**

| Model | Rol | Deckent Karsiligi |
|-------|-----|-------------------|
| Claude Opus 4.6 | Merkezi reasoning engine | brain_provider: claude |
| GPT-5.2 | Long-context recall, web search | worker_provider alternatif |
| Gemini | Deep research | worker_provider alternatif |
| Grok (xAI) | Lightweight, hiz-oncelikli islemler | haiku tier karsiligi |
| Nano Banana | Gorsel uretim | YOK |
| Veo 3.1 | Video uretim | YOK |
| +13 diger | Ozel gorevler | YOK |

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Multi-model | 19 model, gorev bazli otomatik secim | 3 provider, 13 model, ModelRegistry + routing engine |
| Task Decomposition | Hedef → alt-gorev → sub-agent → uzman model | DIRECTIVES → task JSON → worker |
| Paralel Calisma | Birden fazla sub-agent ayni anda | Max 4-5 worker paralel |
| Cloud Sandbox | Izole ortam, gercek dosya sistemi, browser | Lokal dosya sistemi |
| 400+ Uygulama | Slack, Gmail, GitHub, Notion entegrasyonu | Sinirli (git, dosya, test) |
| Sure | Saatler, gunler, hatta aylar boyunca calisabilir | Sprint bazli (dakikalar-saatler) |
| Kredi Sistemi | 10K kredi/ay, task karmasikligina gore tuketim | YOK (flat usage) |

**Perplexity Computer'in Deckent'te Olmayan Ozellikleri:**

1. **19 Uzmanlasmis Model** — Her alt-gorev icin en uygun model otomatik secilir. Deckent 13 model + ModelRegistry + routing engine benzer mantik, ama daha az model.
2. **Gunler/Aylar Suren Gorevler** — Uzun sureli otonom calisma. Deckent sprint-bazli (kisa sureli).
3. **400+ Uygulama Entegrasyonu** — Web, e-posta, sosyal medya, veritabani. Deckent sadece gelistirme araclari.
4. **Cloud Sandbox** — Izole ortam, guvenlik. Deckent lokal (avantaj ve dezavantaj).
5. **Kredi-Bazli Fiyatlandirma** — Kullanimla olceklenen maliyet. Deckent flat (ucretsiz ama kaynak sinirli).

**Perplexity Computer'in Deckent'e Gore Zayif Yanlari:**

1. $200-325/ay fiyat — Deckent ucretsiz + acik kaynak
2. Self-hosted yok — veri guvenligi endisesi
3. Kod uzmanligi sinirli — genel amacli
4. Sprint planlama/retrospektif yok
5. Scope enforcement yok

**Deckent Icin Dersler:**
- Model sayisini artirmak (Grok, Llama, Mistral) rekabet avantaji
- Uzun sureli gorev destegi (multi-sprint zincirleme)
- ✅ Dinamik model secimi ModelRegistry ile guclendirildi (Sprint 097) — 13 model, tier-based routing

---

### D. Devin 2.0/3.0 (Otonom Yazilim Muhendisi)

**Genel:** Cognition Labs. $20/ay (Core, $2.25/ACU), $500/ay (Team, $2.00/ACU, 250 ACU dahil). 1 ACU ≈ 15dk calisma. v2.0 Mart 2026, v3.0 dynamic replanning eklendi.

**Compound AI Mimarisi (Tek Model Degil, Model Surusi):**

| Bileşen | Rol | Deckent Karsiligi |
|---------|-----|-------------------|
| **Planner** | High-reasoning model, strateji belirleme | planner.ts (AI mode) |
| **Coder** | Kod-uzman model, trilyonlarca token egitimli | Worker (genel amacli) |
| **Critic** | Adversarial model, guvenlik + mantik review | YOK — tek model per task |

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Interactive Planning | Kullanici ile isbirlikci, karsilikli plan olusturma | DIRECTIVES.md (tek yonlu) |
| Cloud IDE | Paralel Devin instance'lari, browser'da editor | tmux/subprocess worker'lar |
| Devin Wiki | Otomatik repo indeksleme, mimari diagram, kaynak link | .brain/ bellek sistemi |
| Dynamic Replanning (v3.0) | Takildiyinda stratejiyi tamamen degistirme | mid-sprint-adapter.ts (sinirli, max 1 reroute) |
| Legacy Refactoring | COBOL/Fortran → Rust/Go/Python | Stack detection var, refactoring sinirli |
| UI Mockup → Kod | Figma/gorsel → kod uretme | YOK |
| Kod + Test + Deploy | Tam yazilim dongusu | Kod + test (deploy yok) |

**Devin'in Deckent'te Olmayan Ozellikleri:**

1. **Interactive Planning** — Kullanici ile karsilikli plan olusturma. Deckent'te DIRECTIVES yazilir, plan tek yonlu.
2. **Dynamic Replanning** — Takildiyinda tamamen farkli strateji. Deckent'te mid-sprint reroute sinirli (max 1 deneme).
3. **Devin Wiki** — Repo otomatik indeksleme + mimari diagram. Deckent'te yok.
4. **Cloud IDE** — Browser'da canli kod editoru. Deckent CLI-bazli.
5. **Deploy Yetkinligi** — Production'a deploy. Deckent'te yok.

**Devin'in Deckent'e Gore Zayif Yanlari:**

1. Tek-agent — paralel coklu agent yok
2. Sprint/retrospektif sistemi yok — ogrenme sinirli
3. $20-500/ay — Deckent ucretsiz
4. Self-hosted yok
5. Multi-provider orkestrasyonu yok
6. Scope enforcement yok

**Deckent Icin Dersler:**
- Interactive planning (kullanici isbirligi) onemli UX iyilestirme
- Codebase Wiki/indeksleme (semantic search) buyuk avantaj
- Dynamic replanning (mid-sprint'te plan degisikligi) guclendirmek lazim

---

### E. Claude Agent SDK + Computer Use (Anthropic Ekosistemi)

**Genel:** Anthropic'in resmi agent SDK'si. Claude Code altyapisini kullanir. Mart 2026'da Computer Use Agent lansmani.

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Computer Use | Desktop kontrolu: tikla, yaz, uygulama ac | YOK |
| Agent SDK | Otonom agent olusturma altyapisi | MCP entegrasyonu |
| Worktree Isolation | Git worktree ile izole calisma | Scope enforcement |
| Background Agents | Paralel alt-gorev | Worker'lar (benzer) |
| Voice Mode | 20 dil sesli kontrol | YOK |
| Loop/Schedule | Cron-tarzı zamanlanmis gorevler | ✅ heartbeat-daemon.ts (Sprint 088) |
| Dispatch | Kullanici yokken otonom calisma | Sprint arka plan calismasi (benzer) |

**Deckent Icin Dersler:**
- Claude Agent SDK entegrasyonu dogal genisleme yolu
- Computer Use yetkinligi (browser, desktop) fark yaratir
- Loop/schedule (zamanlanmis gorevler) heartbeat daemon benzeri
- Worktree isolation zaten scope enforcement'ta var — guclendirilebilir

---

### F. Claude Managed Agents — CMA (Anthropic Bulut Ajan Platformu)

**Genel:** Anthropic'in yonetilen ajan altyapisi. 1 Nisan 2026'da beta lansmani (`managed-agents-2026-04-01` header). Tum ajanlar Anthropic altyapisinda calisan bulut-barindirmali, API-odakli platform — Claude Agent SDK'dan (Bolum E) farkli bir urun (lokal degil, bulut). REST API + 7 dilde SDK (Python, TypeScript, Java, Go, C#, Ruby, PHP). Ajanlar hazir paketlerle ve yapilandirilabilir ag kurallariyla bulut container'larda calisiyor. Fiyat: kullanimla API faturasi. CLI araci: `ant` (Go tabanli).

**Mimari:**

| Ozellik | Detay | Deckent Karsiligi |
|---------|-------|-------------------|
| Versiyonlu Ajanlar | Her guncelleme degistirilemez versiyon olusturur, rollback mumkun | agent.json (statik, versiyonlama yok) |
| Versiyonlu Bellek | SHA-based optimistic concurrency ile API-yonetimli bellek, uyumluluk icin redact | .brain/MEMORY.md (duz dosya, versiyonlama yok) |
| Rubrik Bazli Notlama | Rubrik tanimla, ayri context window'da grader ile notla, 20x'e kadar iterasyon | result-evaluator.ts (basit GO/NO_GO) |
| Yonetilen Ortamlar | Hazir paketlerle (pip/npm/apt/cargo/gem/go) bulut container'lar, ag kurallari | Docker backend (Sprint 101+, daha az yapilandirilmis) |
| Coklu SDK | Python, TS, Java, Go, C#, Ruby, PHP SDK'lari | Sadece TypeScript CLI |
| Oturum Thread'leri | Ajan basina izole context window ile multi-agent | Worker scope enforcement (dosya-seviyesi, context-seviyesi degil) |
| Custom Tools API | JSON schema arac tanimlari, client-side execution | MCP araclari (benzer, ama ozel arac tanim API'si yok) |
| Progressive Skills | Anthropic on-tanimli (xlsx, pptx, pdf, docx) + ozel skill'ler, on-demand yukleme | skill-registry (benzer, AST sandbox) |
| SSE Streaming | Gercek zamanli ajan ciktisi icin Server-Sent Events | HTTP API + SSE (Sprint 10, daha az yapilandirilmis) |

**CMA'nin Deckent'te Olmayan Ozellikleri:**

1. **Rubrik Bazli Notlama** — Degerlendirme rubrikleri tanimla, ayri context window'da grader ile notla, rubrik gecene kadar 20x'e kadar tekrar et. Deckent'in result-evaluator.ts'i yapilandirilmis rubrik tanimlamalari olmadan basit GO/NO_GO yapiyor.
2. **Versiyonlu Bellek Deposu** — Degistirilemez versiyon gecmisi, SHA-based optimistic concurrency, uyumluluk icin redact islemleriyle API-yonetimli bellek. Deckent'in .brain/MEMORY.md'si versiyonlama veya esamanlilik kontrolu olmayan duz dosya.
3. **Ajan Versiyonlama** — Her guncelleme yeni degistirilemez versiyon olusturur, herhangi bir onceki versiyona rollback. Deckent'in agent.json'u statik — versiyon gecmisi yok.
4. **Coklu SDK Destegi** — 7 dilde SDK'lar. Deckent sadece TypeScript CLI.
5. **Yonetilen Bulut Container'lari** — 6 paket yoneticisiyle hazir paketler ve ag erisim kurallari (sinirsiz/sinirli). Deckent'te Docker backend var ama daha az yapilandirilmis ortam yonetimi.
6. **Oturum Thread Izolasyonu** — Multi-agent oturumdaki her ajanin kendi context window'u ve konusma gecmisi var. Deckent'in scope enforcement'i dosya-seviyesinde, context-seviyesinde degil.

**CMA'nin Deckent'e Gore Zayif Yanlari:**

1. Tek saglayici (sadece Claude) — Deckent ModelRegistry ile 3 saglayici, 13 model destekliyor
2. Sprint yasam dongusu yok — oturum-bazli, oturumlar arasi durumsuz
3. Ogrenme dongusu / self-improvement yok — routing evrimi yok, sinergy takibi yok
4. Scope enforcement / sinir ihlali tespiti yok — ajanlar tum container erisimi var
5. Auditor deseni yok — bagimsiz calisma zamani kalite izleme yok
6. Tech debt takibi yok — DEBT.md karsiligi yok
7. Retrospektif sistemi yok — oturumlar arasi ogrenme yok
8. Sadece bulut, self-hosting secenegi yok — veri altyapinizdan cikiyor
9. Ucretli API servisi — Deckent ucretsiz + acik kaynak
10. Sadece tek-seviye delegasyon (koordinator → ajanlar, daha derin yuvalama yok)

**Deckent Icin Dersler:**
- Rubrik bazli notlama result-evaluator.ts'i ikili GO/NO_GO'dan yapilandirilmis, iteratif kalite degerlendirmesine donusturur
- Versiyonlu bellek deposu .brain/ sistemine rollback + uyumluluk yetenekleri ekler
- Ajan versiyonlama guvenli A/B testi ve ajan konfigurasyonlarinin rollback'ini saglar
- Coklu SDK yaklasimi (en azindan OpenAPI spec ile REST API) Deckent'i TypeScript kullanicilari otesine genisletir
- Yonetilen ortam sablonlari Docker backend'i daha fazla yapilandirabilir

---

### G. Karsilastirma Matrisi

| Yetenek | OpenClaw | Cowork | Perplexity | Devin | Claude SDK | CMA | **Deckent** |
|---------|----------|--------|------------|-------|------------|-----|-------------|
| **Acik Kaynak** | MIT | Hayir | Hayir | Hayir | SDK evet | Hayir | **MIT** |
| **Self-Hosted** | Evet | Hayir | Hayir | Hayir | Kismi | Hayir | **Evet** |
| **Fiyat** | Ucretsiz | M365 | $200/ay | $20/ay | API | API kullanim-bazli | **Ucretsiz** |
| **Multi-Agent Paralel** | Hayir | Sinirli | Evet | Hayir | Kismi | Evet (thread) | **Evet** |
| **Sprint Planlama** | Hayir | Hayir | Hayir | Hayir | Hayir | Hayir | **Evet** |
| **Scope Enforcement** | Hayir | Hayir | Cloud | Hayir | Worktree | Hayir | **Evet** |
| **Multi-Provider** | Hayir | 2 | 19 | Hayir | 1 | 1 | **3 (13 model, ModelRegistry)** |
| **Retrospektif/Ogrenme** | Sinirli | Hayir | Hayir | Wiki | Hayir | Hayir | **Evet** |
| **MCP Native** | Hayir | Hayir | Hayir | Hayir | Evet | Hayir | **Evet** |
| **Heartbeat Daemon** | 30dk | Hayir | Evet | Hayir | Loop | Hayir | **✅ Evet (Sprint 088)** |
| **Human Checkpoints** | Hayir | Evet | Hayir | Evet | Hayir | Hayir | **✅ Evet (Sprint 088)** |
| **Interactive Plan** | Hayir | Evet | Hayir | Evet | Hayir | Hayir | **Hayir** |
| **Browser Kontrolu** | Evet | Hayir | Evet | Evet | Evet | Hayir | **Hayir** |
| **Kanal Entegrasyonu** | 50+ | M365 | 400+ | Slack | Hayir | API | **Hayir** |
| **Codebase Indeks** | Hayir | Hayir | Hayir | Wiki | Hayir | Hayir | **Hayir** |
| **Always-On** | Evet | Evet | Evet | Hayir | Dispatch | Evet (bulut) | **Hayir** |
| **Uzun Sureli Gorev** | Evet | Evet | Gunler | Saatler | Saatler | Saatler | **Sinirsiz (Sprint 088)** |
| **Skill Ekosistemi** | 13,729 | - | - | - | 5,700 | Custom tools | **21** |
| **Critique Layer** | Hayir | GPT+Claude | Hayir | Planner+Critic | Hayir | Rubrik grader | **Hayir** |
| **Rubrik Notlama** | Hayir | Hayir | Hayir | Hayir | Hayir | Evet (20x iterasyon) | **Hayir** |
| **Ajan Versiyonlama** | Hayir | Hayir | Hayir | Hayir | Hayir | Evet (degistirilemez) | **Hayir** |
| **Versiyonlu Bellek** | Sinirli | Hayir | Hayir | Hayir | Hayir | Evet (SHA-based) | **Hayir** |
| **Coklu SDK** | Hayir | Hayir | Hayir | Hayir | Sinirli | 7 dil | **Sadece TS** |
| **GitHub Stars** | 343K+ | - | - | - | - | - | **~0 (beta)** |
| **Community** | 1,000+ contrib | - | - | - | - | - | **1 (solo)** |

### H. Deckent'in Benzersiz Konumu

**Hicbir rakipte BIRLIKTE bulunmayan ozellikler:**
1. Multi-agent paralel calisma + scope enforcement + sprint planlama + retrospektif ogrenme + multi-provider + MCP native + acik kaynak + ucretsiz + self-hosted

**Stratejik pozisyon:** Deckent, "gelistirici takim orkestratoru" nisinde tek acik kaynak cozum. Rakipler ya tek-agent (Devin, OpenClaw), kapali/pahali (Cowork, Perplexity) ya da sadece-bulut API servisleri (CMA).

**Buyume karsilastirmasi:**
- OpenClaw: 0 → 343K stars, 4 ayda. Yildiz/gun: ~2,860
- Deckent: Henuz acik kaynak olarak yayinlanmadi. Lansman stratejisi belirleyici olacak.

---

## Doğrulanmış Engeller

Her engel codebase'de dogrudan dogrulandi. Yanlis iddialar duzeltildi.

### ENGEL-1: OGRENME DONGUSU KIRIK — ✅ COZULDU (Sprint 091)

**Orijinal durum:** 3/4 alt-iddia dogruydu

| Alt-Iddia | Orijinal | Sprint 091 Cozumu |
|-----------|----------|-------------------|
| RuleEvolver kurallar uretir ama uygulamaz | **DOGRUYDU** | ✅ Evolved rules artik planSprint() icinde auto-applied olanlari agent/skill activation'a inject ediyor |
| Agent tiebreaker V2'de calismiyor | **DOGRUYDU** | ✅ getLearningBonus() ile learnings.json'dan okuyor (agent.json stats yerine) |
| Promotion/demotion execute edilmiyor | **DOGRUYDU** | ✅ pipeline.promote() ve pipeline.demote() artik cagrilyor |
| Quality score kullanilmiyor | **DOGRUYDU** | ✅ avgQualityScore routing bonus hesabina entegre edildi |
| Skill stats guncellenmez | **DOGRUYDU** | ✅ updateSkillStats() V1'de cagrilyor, RETRO'da skill tablosu olusturuluyor |
| Hard-coded sabitler | **DOGRUYDU** | ✅ LearningConfig'den okunuyor (minSamplesForBonus, recentSprintWindow) |

**Sonuc:** Ogrenme dongusu tamamen kapatildi. 8 kopuk nokta Sprint 091'de duzeltildi.

### ENGEL-2: INTENT CLASSIFIER STATIK (DOGRULANDI)

**Durum:** DOGRULANDI

- `intent-classifier.ts:10-44` — `INTENT_KEYWORDS`, `OPERATION_KEYWORDS`, `SCOPE_INTENT_SIGNALS` tamami `const` olarak tanimli
- `updateWeights()`, `learn()`, `feedback()` gibi dinamik fonksiyonlar YOK
- Keyword agirliklari 84 sprint boyunca hic degismedi
- Yanlis siniflandirma geri bildirimi icin mekanizma YOK

### ENGEL-3: SESSIZ HATA YUTMA — ✅ COZULDU (Sprint 085+086+087+088)

**Orijinal:** 49 sessiz catch blogu
**Cozum:** debugLog'a donusturuldu (Sprint 085: 15, Sprint 086: 14, Sprint 088: kalan ~20)
- Dönüştürülenler: cleanup(7), finalizeSprint(7), spawnWorkers(5), evaluateResults(5), planSprint(5), utility fonksiyonlari

### ENGEL-4: COVERAGE THRESHOLD — ✅ COZULDU (Sprint 086)

**Orijinal:** %90 hardcoded, config override yok
**Cozum:** `config.coverage_threshold` (varsayilan 90) — 6 dosya guncellendi:
- config-types.ts: DeckentConfig + ResolvedConfig'e field eklendi
- config.ts: defaults + loadConfig return'a eklendi
- result-evaluator.ts: evaluateResult() parametresi olarak aliniyor
- sprint-phases.ts: runEvaluatePhase() + runFixPhase() geciriyor
- sprint-controller.ts: config.coverage_threshold geciriyor

### Duzeltilen Yanlis Iddialar

| Iddia | Gercek | Kanit |
|-------|--------|-------|
| "AI planner fallback YOK" | **YANLIS** — `auto` modunda structured'a fallback VAR | sprint-controller.ts:601-643 |
| "Agent stats persist edilmiyor" | **YANLIS** — `updateAgentStats()` sprint sonunda cagirilir, agent.json'a yazilir | agent-pool.ts:344-371, sprint-controller.ts:1292 |
| "goNogo.goCriteria ignored" | **YANLIS** — Sinirli da olsa kontrol ediliyor | result-evaluator.ts:68-76 |

---

## Self-Improvement Yol Haritası

### FAZ 0: Gozlemlenebilirlik Temeli — ✅ TAMAMLANDI (Sprint 085)

- ✅ debugLog() 3-param overload + .brain/ERRORS.md (max 200 satir, append)
- ✅ Decision trail: .deckent/routing/decisions/decision-{sprint}-{task}.json
- ✅ applyEvolvedRules(): confidence >= 0.85 → manifest otomatik guncelleme + rollback
- ✅ getSynergyBonuses(): skill cift basari orani → routing bonus/penalty (+2/-2)

### FAZ 1: Ogrenme Dongusunu Kapat — ✅ TAMAMLANDI (Sprint 086)

- ✅ routeTaskV2 cagri yerlerine sprintId/taskId/projectRoot eklendi (decision trail aktif)
- ✅ 14 ek sessiz catch → debugLog (toplam 29/49 donusturuldu)
- ✅ coverage_threshold: hardcoded 90 → config.coverage_threshold (DeckentConfig + ResolvedConfig)
- ✅ INTENT_WEIGHTS: dinamik agirlik sistemi + updateIntentWeights() + loadIntentWeights()
- ✅ getWorstCombinations(5): AI planner prompt'una GECMIS SONUCLAR blogu eklendi
- ⚠️ Kalan tech debt: ~20 sessiz catch, task-router.ts cagri yeri, planner entegrasyon

### FAZ 2: Otonom Adaptasyon — ✅ TAMAMLANDI (Sprint 088+091)

**Hedef:** Sistem kendi yapisini degistirsin

**2.1 Adaptive Thresholds** — ✅ TAMAMLANDI (Sprint 088)
- ✅ applyAdaptiveThresholds() + getRecentSprintStats()
- ✅ NO_GO rate > %30 → agent_min_score otomatik dusur
- ✅ Coverage surekli dusuk → threshold'u proje ortalamasina ayarla
- ✅ `adaptive_thresholds: true` + `adaptive_config` ayarlanabilir

**2.2 Dinamik Model Secimi Iyilestirme** — ✅ TAMAMLANDI (Sprint 097 — ModelRegistry)
- ✅ ModelRegistry class: 13 model, 3 provider, tek kaynak (model-registry.ts)
- ✅ Tier-based routing: premium_plus/premium/standard/economy tier'lari
- ✅ Provider-agnostic config: brain_tier/worker_tier (model isimleri yerine)
- ✅ MODE_PRESETS: performance/balanced/economic/api stratejileri (mode-presets.ts)
- ✅ BUILTIN_MODELS katalogu: maliyet, hiz, context bilgileri
- ✅ Init wizard tier secimi: selectTiers() + tierToModel() refactor
- ✅ Token kullanimi tracking — Sprint 124'te Token Usage Tracker implemente edildi
- ✅ Context-Aware Routing — Sprint 124'te contextFit puanlama implemente edildi

**2.3 Mid-Sprint Reroute Guclendirme** — ✅ TAMAMLANDI (Sprint 088)
- ✅ Max reroute: config.max_reroutes (varsayilan 3)
- ✅ GO_WITH_TECH_DEBT'te reroute opsiyonu (config.reroute_on_tech_debt)
- ✅ Confidence threshold: sadece confidence > 0.7 ise reroute

**2.4 Agent/Skill Evrim Pipeline** — ✅ TAMAMLANDI (Sprint 091)
- ✅ Agent tiebreaker: learnings.json'dan getLearningBonus() ile okuyor
- ✅ Promotion/demotion: pipeline.promote() ve pipeline.demote() execute ediliyor
- ✅ Evolved rules: auto-applied kurallar activation'a inject ediliyor
- ✅ Skill stats: updateSkillStats() V1'de cagriliyor, RETRO'da skill tablosu
- ✅ Quality score: avgQualityScore routing bonus'a entegre
- ✅ Config-driven: LearningConfig'den minSamplesForBonus, recentSprintWindow okunuyor
- ✅ Integration test: evolution-pipeline.test.ts uctan uca test

### FAZ 3: Proaktif Sistem — ✅ KISMI TAMAMLANDI (Sprint 088)

**Hedef:** OpenClaw'daki heartbeat daemon modeli — sistem kendi basina calissin

**3.1 Heartbeat Daemon** — ✅ TAMAMLANDI (Sprint 088)
- ✅ `.deckent/HEARTBEAT.md` tarama dosyasi
- ✅ `HeartbeatDaemon` class: periyodik calistirma (configurable interval)
- ✅ `deckent heartbeat` CLI komutu (tek seferlik + daemon + stop)
- ✅ Sonuclar `.brain/heartbeat-log.md`'ye kaydedilir
- ⏳ Sonuclari kullaniciya bildir (Slack/terminal/dashboard) — henuz yok

**3.2 Always-On Gateway (Opsiyonel)** — ⏳ BEKLIYOR
- API server'i daemon olarak calistirma
- SSE ile surekli izleme
- Uzaktan kontrol: telefon/web uzerinden sprint baslat/durdur

**3.3 Multi-Sprint Zincirleme** — ⏳ BEKLIYOR
- Sprint A tamamlaninca otomatik Sprint B baslat
- DIRECTIVES.md'de `## Next Sprint:` blogu
- Uzun sureli gorevler: gunler boyunca calisan sprint zincirleri

### FAZ 3.5: Memory V2 + Governance — ✅ TAMAMLANDI (Sprint 138-145)

**Hedef:** Kurumsal seviye bellek ve yönetişim altyapısı

**3.5.1 Memory V2 DB-First** — ✅ TAMAMLANDI (Sprint 140-141)
- ✅ SQLite (better-sqlite3) single source of truth — Sprint 140 Phase 1
- ✅ FTS5 dual-layer Turkish normalize (TR/EN/DE %100 recall) — Sprint 141
- ✅ `deckent recall` + `deckent remember` CLI — Sprint 141
- ✅ `deckent_memory_query` MCP tool — Sprint 141
- ✅ 96% context azaltımı (eski .brain/ markdown → DB) — Sprint 141
- ✅ Memory export/import: DB ↔ .md snapshot generation — Sprint 140

**3.5.2 ADR Governance Integration** — ✅ TAMAMLANDI (Sprint 138)
- ✅ MADR v3 hibrit format + 37 ADR migration — Sprint 138
- ✅ ADR-036 self-referential governance — Sprint 138
- ✅ ADR validator script: scripts/adr-validator.mjs — Sprint 138
- ✅ Worker prompt ADR injection — Sprint 138

**3.5.3 RBAC V1.0** — ✅ TAMAMLANDI (Sprint 139)
- ✅ ADR-037 Brain-Auditor-Worker Authority Matrix — Sprint 139
- ✅ Runtime scope enforcement (+1370 LoC) — Sprint 139
- ✅ worker-lifecycle.ts RBAC entegrasyonu — Sprint 139

**3.5.4 Chain Dependency Scheduler** — ✅ TAMAMLANDI (Sprint 139-143)
- ✅ Kahn's algorithm topological sort — Sprint 139
- ✅ detectScopeCollisions plan-time — Sprint 139
- ✅ Chain reform complete — Sprint 143 (19/20 DONE)

**3.5.5 Dead Code Audit** — ✅ TAMAMLANDI (Sprint 142-144)
- ✅ Wave A: src/core/ batch 1 analysis — Sprint 142
- ✅ Wave B: god split + ADR-008 Cycle 2 — Sprint 144
- ✅ Sprint 144 24/27 DONE

### FAZ 4: Human-in-the-Loop — ✅ KISMI TAMAMLANDI (Sprint 088)

**Hedef:** Cowork/Devin seviyesinde insan isbirligi

**4.1 Worker Soru Sorma Mekanizmasi** — ⏳ BEKLIYOR
- Worker: `askBrain(question)` → Brain'e IPC mesaji
- Brain → kullaniciya soru ilet (CLI prompt / dashboard dialog / Slack)
- Cevap → worker'a dondur
- Timeout: 5dk cevap gelmezse varsayilan hareket

**4.2 Human Checkpoint'ler** — ✅ TAMAMLANDI (Sprint 088)
- ✅ Plan fazindan sonra: `waitForHumanApproval('plan', ...)` onay
- ✅ Evaluate fazindan sonra: `waitForHumanApproval('evaluate', ...)` onay
- ✅ Fix fazindan once: `waitForHumanApproval('fix', ...)` onay
- ✅ Configurable: `human_checkpoints: ['plan', 'evaluate', 'fix']`
- ✅ Dosya bazli approve/reject: `.deckent/checkpoints/` dizini
- ✅ `SprintStatus.ABORTED` — reddedilirse sprint durdurulur

**4.3 Interactive Planning** — ⏳ BEKLIYOR
- Devin modeli: kullanici ile karsilikli plan olusturma
- DIRECTIVES draft → AI oner → kullanici duzenle → finalize
- Dashboard'da plan editoru

### FAZ 5: Ekosistem Genisleme (4+ sprint)

**Hedef:** Perplexity/OpenClaw seviyesinde entegrasyon genisligi

**5.1 Kanal Entegrasyonlari**
- Slack bot: sprint durumu, bildirim, komut
- GitHub Issues/PR entegrasyonu: issue → otomatik task
- Linear/Jira: ticket → DIRECTIVES

**5.2 Codebase Semantik Indeksleme**
- Devin Wiki benzeri: repo otomatik indeksleme
- AST-based dependency graph
- "Bu dosyayi degistirirsen su dosyalar etkilenir" bilgisi
- RAG ile worker context zenginlestirme

**5.3 Critique Layer (Cowork Modeli)**
- Model A yazar, Model B dogrular
- result-evaluator.ts'de AI-powered degerlendirme
- Worker'in kendi kodunu farkli provider ile review ettirme

**5.4 Browser/Computer Use**
- Claude Computer Use SDK entegrasyonu
- Web uygulamasi test otomasyonu
- UI/UX review (screenshot analizi)

**5.5 Provider Genisleme**
- Grok, Llama, Mistral, DeepSeek adaptorler
- 13 → 19+ model destegi (ModelRegistry altyapisi hazir — Sprint 097)
- Perplexity'nin 19 model modeline yaklasma

**5.6 Rubrik Bazli Notlama (CMA Modeli)**
- Task tipine gore degerlendirme rubrikleri tanimla (kod kalitesi, test kapsamasi, dokumantasyon tamligi)
- Ayri grader context window — degerlendirici worker ile context paylasmiyor
- Iteratif iyilestirme: rubrik gecene kadar N'e kadar tekrar et
- result-evaluator.ts'i ikili GO/NO_GO'dan rubrik-puanli degerlendirmeye yukselt

**5.7 Versiyonlu Bellek ve Ajan Versiyonlama (CMA Modeli)**
- .brain/MEMORY.md → SHA-based concurrency ile versiyonlu bellek deposu
- Ajan versiyon gecmisi: her agent.json degisikligi degistirilemez versiyon olusturur
- Herhangi bir onceki ajan veya bellek versiyonuna rollback
- Uyumluluk icin redact islemleri (bellek gecmisinden PII kaldirma)

**5.8 Coklu SDK / REST API (CMA Modeli)**
- HTTP API uzerine programatik erisim icin REST API katmani
- Dil-bagimsiz client: herhangi bir HTTP client Deckent sprint'lerini yurutebilir
- OpenAPI spec → SDK jeneratorleri (Python/Go/Java client'lar)

### Öncelik Matrisi

```
                    ETKI (is degeri)
              DUSUK         YUKSEK
         ┌────────────┬────────────┐
  KOLAY  │ P3         │ P1         │
  EFOR   │ Coverage   │ Kural      │
  (1-2   │ config     │ auto-apply │
  sprint)│ Hata log   │ Synergy →  │
         │            │ router     │
         ├────────────┼────────────┤
  ZOR    │ P4         │ P0         │
  EFOR   │ Browser    │ Ogrenme    │
  (3+    │ control    │ dongusu    │
  sprint)│ Dagitik    │ Heartbeat  │
         │ workers    │ HitL       │
         └────────────┴────────────┘
```

#### P0 — ✅ TAMAMLANDI (Sprint 085)
1. ~~Yapilandirilmis hata loglama~~ → debugLog + .brain/ERRORS.md
2. ~~Karar loglama (decision trail)~~ → .deckent/routing/decisions/ JSON
3. ~~Kural auto-apply pipeline~~ → applyEvolvedRules() + rollback
4. ~~Synergy matrix → routing engine~~ → getSynergyBonuses() entegre

#### P1 — ✅ TAMAMLANDI (Sprint 086)
5. ~~Intent classifier feedback loop~~ → INTENT_WEIGHTS + updateIntentWeights()
6. ~~Planner'a gecmis bilgisi~~ → getWorstCombinations() + prompt blogu
7. ~~Coverage threshold config~~ → config.coverage_threshold
8. ~~Tech debt kapatma~~ → routeTaskV2 cagri yerleri + 14 catch
- ⏳ Adaptive thresholds → JSDoc eklendi, implementasyon Faz 2'de
- ⏳ Mid-sprint reroute guclendirme → Faz 2'de

#### P2 — ✅ TAMAMLANDI (Sprint 088+091+097)
9. ✅ ~~Adaptive thresholds (NO_GO rate bazli otomatik ayar)~~ → Sprint 088
10. ✅ ~~Mid-sprint reroute guclendirme (1 → 3, configurable)~~ → Sprint 088
11. ✅ ~~Heartbeat daemon (OpenClaw modeli, proaktif calisma)~~ → Sprint 088
12. ✅ ~~Human checkpoint'ler (plan + evaluate fazlarinda onay)~~ → Sprint 088
13. ✅ ~~Kalan sessiz catch → debugLog~~ → Sprint 085-088 (tamamlandi)
13b. ✅ ~~Sprint timeout reform (sinirsiz calisma)~~ → Sprint 088
14. ✅ ~~ModelRegistry + tier-based routing (13 model, 3 provider)~~ → Sprint 097

#### P3 — ✅ TAMAMLANDI (Sprint 124-145)
14. ✅ Worker soru sorma mekanizması (askBrain IPC) — Sprint 125-129
15. ⏳ Interactive planning (kullanıcı-AI işbirlikçi plan) — post-Sprint 150
16. ⏳ Codebase semantik indeksleme (AST + RAG) — post-Sprint 150
17. ⏳ Kanal entegrasyonları (Slack, GitHub Issues) — post-Sprint 150
18. ✅ Otomatik agent oluşturma pipeline — Sprint 134 evolution pipeline
19. ✅ **Context-Aware Routing** — Sprint 124'te implemente edildi (contextFit puanlama)
20. ✅ **Token Usage Tracker** — Sprint 124'te implemente edildi (RETRO.md token summary)
21. ✅ **Memory V2 DB-First** — Sprint 140-141'de implemente edildi (SQLite FTS5)
22. ✅ **ADR Governance** — Sprint 138'de implemente edildi (MADR v3 hibrit)
23. ✅ **RBAC V1.0** — Sprint 139'da implemente edildi (Authority Matrix)
24. ✅ **Chain Dependency** — Sprint 139'da implemente edildi (Kahn's topological)
25. ✅ **Dead Code Audit** — Sprint 142-144'te tamamlandı (Wave A/B/C)

#### P4 — BETA GA HAZIRLIK (Sprint 146-150)
26. Sprint 146: Prompt God Template Reform + 3 bug fix + rubric konsolidasyon (17 task)
27. Sprint 147: Nervous System Çekirdeği — 13 modül + 25 test dosyası + ADR-040 kabul ✅
28. Sprint 148: Meta-Dogfood + Agent Taksonomi Reform + Nervous Canlı Aktivasyon + Çapraz Platform ✅
29. Sprint 149: Final doküman konsolidasyonu + npm publish dry-run
30. Sprint 150: 🚀 Beta GA Cutover

#### P5 — POST-GA UZUN VADE (Sprint 150+)
31. Critique layer (multi-model doğrulama, Cowork modeli)
32. Multi-sprint zincirleme (günlerce çalışan görevler)
33. Browser/Computer Use (Claude SDK entegrasyonu)
34. Provider genişleme (Grok, Llama, Mistral, DeepSeek)
35. Always-on gateway (daemon modu)

---

## Sprint Metrikleri

### Tamamlanan Hedefler (Sprint 085 + 086)

| Hedef | Durum | Sprint | Detay |
|-------|-------|--------|-------|
| Yapilandirilmis hata loglama | ✅ DONE | 085 | debugLog 3-param overload, .brain/ERRORS.md (max 200 satir) |
| Karar loglama (decision trail) | ✅ DONE | 085+086 | .deckent/routing/decisions/ JSON + cagri yerleri sprintId/taskId eklendi |
| Kural auto-apply pipeline | ✅ DONE | 085 | applyEvolvedRules() confidence>=0.85 → manifest, rollback JSON |
| Synergy matrix → routing | ✅ DONE | 085 | getSynergyBonuses() +2/-2 bonus/penalty, min 5 ornek |
| routeTaskV2 cagri yerleri | ✅ DONE | 086 | task-router.ts + mid-sprint-adapter.ts + sprint-controller.ts guncellendi |
| 14 ek catch → debugLog | ✅ DONE | 086 | cleanup(7) + finalizeSprint(7) fonksiyonlari |
| Coverage threshold config | ✅ DONE | 086 | config.coverage_threshold (varsayilan 90), 6 dosya guncellendi |
| Intent classifier feedback | ✅ DONE | 086 | INTENT_WEIGHTS Map + updateIntentWeights() + loadIntentWeights() |
| Planner'a gecmis bilgisi | ✅ DONE | 086 | getWorstCombinations(5) + AI prompt GECMIS SONUCLAR blogu |
| Adaptive thresholds | ✅ DONE | 088 | applyAdaptiveThresholds() + getRecentSprintStats() |

### Sprint 085 Metrikleri
- **Kod:** +400 / -37 satir
- **Sure:** 25dk 22s
- **Sonuc:** 4/4 tamamlandi (2 DONE, 2 GO_WITH_TECH_DEBT)
- **Yeni dosyalar:** .brain/ERRORS.md, .deckent/routing/decisions/, .deckent/routing/applied-rules.json

### Sprint 086 Metrikleri
- **Kod:** +172 / -21 satir
- **Sure:** 25dk 4s
- **Sonuc:** 4/4 tamamlandi (2 DONE, 2 GO_WITH_TECH_DEBT)
- **Yeni dosyalar:** .deckent/routing/intent-weights.json

### Sprint 097 Metrikleri
- **Kapsam:** ModelRegistry + Provider Config Evrimi (Enterprise Refactor)
- **Task:** 10 task (tümü GO_WITH_TECH_DEBT)
- **Yeni dosyalar:** src/core/model-registry.ts, src/core/mode-presets.ts
- **Onemli degisiklikler:**
  - ModelRegistry class: 13 model, 3 provider, tek kaynak
  - Tier-based routing: premium_plus/premium/standard/economy
  - Provider-agnostic config: brain_tier/worker_tier
  - Init wizard refactor: selectTiers() + tierToModel()
  - Codex + Gemini adapter CLI uyumluluk guncellemeleri

### Sprint 131-139 Özet Metrikleri

| Sprint | Task | DONE | TD | NO_GO | Süre | Öne Çıkan |
|--------|------|------|----|-------|------|-----------|
| Sprint 131 | 8 | 8 | 0 | 0 | ~20dk | HTTP API Auth + 4 ADR |
| Sprint 132 | 6 | 6 | 0 | 0 | ~45dk | 360° Enterprise Audit |
| Sprint 133 | 12 | 12 | 4 | 0 | 27dk 21sn | Güvenlik sertleştirme |
| Sprint 134 | 15 | 11 | 4 | 0 | ~60dk | Üçlü dogfood + vizyon |
| Sprint 135 | 17 | 10 | 4 | 3 | 60dk 54sn | Operasyonel sertleştirme |
| Sprint 136 | 10 | 7 | 0 | 3 | ~35dk | Mimari derinleştirme |
| Sprint 137 | 8 | 5 | 3 | 0 | ~25dk | Test restorasyonu |
| Sprint 138 | 9 | 8 | 0 | 1 | ~50dk | ADR governance + event stream |
| Sprint 139 | 51+ | 34 | 0 | 17 | 180dk 22sn | Chain reform + RBAC |

### Sprint 140-145 Özet Metrikleri

| Sprint | Task | DONE | TD | NO_GO | Süre | Öne Çıkan |
|--------|------|------|----|-------|------|-----------|
| Sprint 140 | 16 | 13 | 2 | 1 | ~45dk | Memory V2 Phase 1 |
| Sprint 141 | 18 | 15 | 0 | 3 | 74dk 16sn | Memory V2 CLI/MCP |
| Sprint 142 | 12 | 10 | 2 | 0 | ~30dk | Core audit batch 1 |
| Sprint 143 | 20 | 19 | 0 | 1 | ~55dk | Chain reform |
| Sprint 144 | 27 | 24 | 0 | 3 | ~65dk | God split + ADR-008 |
| Sprint 145 | 28 | 27 | 24 | 1 | 92dk 30sn | Timeout + observability ✅ |
| Sprint 146 | 17 | 17 | 0 | 0 | ~50dk | Prompt god template + 3 bug fix + rubric ✅ |
| Sprint 147 | 23 | 23 | 0 | 0 | 49dk 34sn | Nervous System çekirdeği + ADR-040 ✅ |
| Sprint 148 | 28 | 28 | 0 | 0 | ~8s | Meta-dogfood + agent taksonomi + nervous live ✅ |

### Sprint 098 Metrikleri
- **Kapsam:** Dokümantasyon + Sprint Output + History Fix
- **Task:** 5/5 (tümü GO_WITH_TECH_DEBT)
- **Süre:** 8dk 25sn
- **Kod:** +77 / -56 satır
- **Önemli değişiklikler:**
  - MCP history tool .brain/archive/ okuyor (85 sprint log erişilebilir)
  - sprint-reporter.ts debug log eklendi (evaluations map debug)
  - ANALYSIS, README, DECKENT.md ModelRegistry güncellemeleri

### Sprint 099 Metrikleri
- **Kapsam:** RETRO Debug + Job Output Reform + Docs Güncelleme
- **Task:** 5/5 (tümü GO_WITH_TECH_DEBT)
- **Süre:** 16dk 16sn
- **Kod:** +77 / -56 satır
- **Önemli değişiklikler:**
  - RETRO Done Sayacı: evaluations map debug eklendi (Sprint 093 fix doğrulandı)
  - Job Output Reform: finalizeSprint() job summary zenginleştirildi
  - VISION.md + health-check.md + roadmap.md sayı güncellemeleri
  - README sprint badge 97+ → 98+ güncellendi
  - PROJECT-IDENTITY.md Test Count 12 → 12,193+ düzeltildi

### Sprint 100 Metrikleri
- **Kapsam:** Docs sayı güncellemeleri (Sprint 100 numaraları)
- **Güncellenen dosyalar:** docs/architecture/architecture.md, docs/ANALYSIS-2026-04-02.md
- **Önemli değişiklikler:**
  - architecture.md: Version Sprint 100+, CLI 35+, orchestra 63 modules, MCP 20 tools
  - ANALYSIS: Toplam Sprint 100, test 12,051+, orchestra 55, CLI 35+, MCP 20 tool
  - Sonuç bölümü Sprint 100 sonrası olarak güncellendi

### Sprint 101 Metrikleri
- **Kapsam:** Sprint Lock + Result Timeout + autoApprove + Docker Backend
- **Task:** 4/10 (2 DONE, 2 GO_WITH_TECH_DEBT, 6 NO_GO)
- **Sure:** ~42dk
- **Onemli degisiklikler:**
  - Sprint lock mekanizmasi (coklu process cakisma engeli)
  - autoApprove=true standart hale getirildi
  - Docker Spawn Backend + MockSpawnBackend + E2E Sprint Lifecycle Tests
  - README/DECKENT.md usage temizligi + flaky test fix

### Sprint 102 Metrikleri
- **Kapsam:** Tech Debt Fix (098 borclari) + Docker Smoke Test
- **Task:** 0/6 (tumu NO_GO — worker timeout)
- **Sure:** 12dk 9sn
- **Not:** Tum worker'lar zaman asimina ugradi, sprint rollback yapildi

### Kalan Tech Debt
1. ~~**085-001-debt (kısmi)**~~: ✅ Tamamlandi — sessiz catch'ler Sprint 085-088'de debugLog'a donusturuldu
2. ~~**086-001-debt**~~: ✅ Tamamlandi — routeTaskV2 cagri yerleri Sprint 086'da guncellendi
3. ~~**086-003-debt**~~: ✅ Tamamlandi — planner entegrasyonu Sprint 086'da tamamlandi
4. ~~**Token kullanimi tracking**~~: ✅ Tamamlandi — Token Usage Tracker Sprint 124'te implemente edildi
5. ~~**Sprint 132 Sync I/O**~~: ✅ Kısmen — 799 sync I/O çağrısının azaltılması Sprint 135-144'te devam etti
6. ~~**Sprint 134 God Object Split**~~: ✅ Tamamlandi — sprint-reporter.ts 2297→96 (Sprint 134), sprint-controller.ts 1890→209 (Sprint 136)

### Sprint 140-145 Detaylı Metrikler

**Sprint 140 — TAMAMLANDI (2026-04-16):**
- Memory V2 Phase 1: SQLite schema + MemoryStore class + FTS5 setup
- Sprint 140 16 task planlandı, Memory V2 migration başlatıldı
- Sprint 140 Memory V2 temel CRUD operasyonları

**Sprint 141 — TAMAMLANDI (2026-04-17):**
- Sprint 141 toplam 18 task, 15 tamamlandı, 3 NO_GO
- Sprint 141 süre: 74dk 16sn
- Sprint 141 coverage: 25.0%
- Sprint 141 Memory V2 CLI/MCP entegrasyonu tamamlandı
- Sprint 141 `deckent recall` + `deckent remember` + `deckent_memory_query` MCP tool canlı

**Sprint 142 — TAMAMLANDI (2026-04-18):**
- Sprint 142 src/core/ batch 1 derin analiz (read-only)
- Sprint 142 Memory V2 modüllerinin kalite denetimi
- Sprint 142 GO_WITH_TECH_DEBT — derin analiz tamamlandı

**Sprint 143 — TAMAMLANDI (2026-04-18):**
- Sprint 143 chain reform: 19/20 DONE
- Sprint 143 coordinator post-sprint regression düzeltmeleri
- Sprint 143 Memory V2 tam migration (ci-reporter + managed-docs)

**Sprint 144 — TAMAMLANDI (2026-04-19):**
- Sprint 144 god split + ADR-008 Cycle 2: 24/27 DONE
- Sprint 144 performans optimizasyonu + debt kapatma
- Sprint 144 worker.ts split (1669 → 4 dosya) planlandı

**Sprint 145 — AKTİF (2026-04-20):**
- Sprint 145 adaptive timeout + unified observability
- Sprint 145 CLI/MCP audit
- Sprint 145 BETA-TRACKER EN/TR parity
- Sprint 145 MASTER-BLUEPRINT güncelleme
- Sprint 145 hedef readiness: 4.10/5

---

## Sprint History (Sprint 136-166)

| Sprint | Task | Done | NO_GO | Süre | Tema |
|--------|------|------|-------|------|------|
| sprint-136 | 10 | 7 | 3 | ~1s | sprint-controller.ts 1890→209 LoC |
| sprint-137 | 6 | 6 | 0 | 35dk 53sn | Verification protocol wire |
| sprint-138 | 11 | 11 | 0 | 53dk 46sn | ADR governance + event stream |
| sprint-139 | 41 | 41 | 0 | ~3s | Massive codebase analysis |
| sprint-141 | 18 | 15 | 3 | 1s 14dk | Read-only codebase audit |
| sprint-142 | 49 | 44 | 5 | 2s 54dk | Deep source analysis |
| sprint-143 | 20 | 19 | 1 | ~5s | Chain reform |
| sprint-144 | 27 | 24 | 3 | 1s 47dk | God split cycle 2 + ADR-008 |
| sprint-145 | 27 | 27 | 1 | 92dk 30sn | Adaptive timeout + observability |
| sprint-146 | 17 | 17 | 0 | ~50dk | Prompt god template + rubric konsolidasyon |
| sprint-147 | 23 | 23 | 0 | 49dk 34sn | Nervous System çekirdek + ADR-040 |
| sprint-148 | 28 | 28 | 0 | 60dk 47sn | Meta-dogfood + Agent taksonomi + Nervous canlı |
| sprint-149 | 4 | 4 | 0 | 33dk 23sn | npm publish + last mile |
| sprint-150 | — | — | — | — | 🚀 Beta GA Cutover |
| sprint-151 | — | — | — | — | Public repo flip (VerhexIO/deckent) |
| sprint-153 | 16 | 3 | 13 | 35dk 32sn | watch --ms CLI promote, doc-writer odak |
| sprint-156 | 22 | 7 | 0 | — | T4 dogfood — Bug X dual-eval race + Sprint-Stall + state freeze (3 major bug reproduce) |
| sprint-157-162 | — | — | — | — | TaskType + Wave Scheduler + Survivor wire |
| sprint-163 | 6 | 6 | 0 | — | **Brain stability hattı MÜHÜRLENDİ** (6/6 DONE, sıfır NO_GO) |
| sprint-164 | 6 | 5 | 0 | — | Wave-Based Execution Semantics + ADR-045, wire 13 grep match code-complete, runtime gated, GO_WITH_GATE_FAILURE (vitest +1) |
| sprint-165 | 5 | 5 | 0 | ~2s | **Bug X/Y/Z/W kapama + docs freeze** — Bug X stub kaldırma (sprint-156-011), Bug Y Sprint-Stall fix, Bug Z kronik vitest +1 fail kapandı, Bug W dead_event_stream aktive, T5 docs freeze + public repo hazırlık, v1.0.0-beta.1 npm publish hazır |
| sprint-166 | 11 | 10 + 1 GO_WTD | 0 | ~3s | **Brain Self-Update + Veri Bütünlüğü Kapanışı** — Bug M (adrInsert hook), Bug N (onRuleRegen wire), Bug S (sprint-aware cache key), Bug Y2 (3-katmanlı ground-truth defense), Bug R+T+U+V+C+X+P+Q+W+K+L bundled, ADR-046 kabul (~2735 LoC, 35+ test). 4 yeni bug E+G+Z2+Z3 tespit → Sprint 167 P0 |

## Bug Tracker

### Sprint 070 — Init UX Overhaul (15 fix)

| Bug | Açıklama | Fix |
|-----|----------|-----|
| BUG-3 | Claude CLI spawn ENOENT (Windows) | `shell: process.platform === 'win32'` — 7 dosyada |
| BUG-4 | Worker rules hardcoded `tsc --noEmit` | `detectFullStack()` sonucunu worker rules'a aktar |
| BUG-6 | Stack detection `Language: unknown` | Stack detection HER ZAMAN çalıştır |
| BUG-7 | Doctor FAIL+OK çelişkisi | FAIL → SKIP etiketi (optional provider'lar) |
| BUG-8 | Framework `next` (fastapi olmalı) | Python/Go/Rust projede JS framework algılama atla |
| BUG-9 | IDENTITY.md dosyası eksik | Init'te workspace IDENTITY.md oluştur |
| BUG-10 | DECKENT.md `Build: tsc` (Python projede) | `!== undefined` kontrolü + `echo "no build step"` |
| BUG-11 | DIRECTIVES.md boş placeholder | Stack-aware örnek task formatı + TR/EN şablon |
| BUG-12 | Worker rules hardcoded `npx vitest run` | `detectFullStack().commands.test` kullan |
| BUG-13 | Brain rules yanlış limitler | 200→300, 600→900 |
| BUG-14 | TempAgent oluşturulmuyor | `detectedLanguages` ile genişletilmiş eşleşme |
| BUG-15 | BOOT.md kullanıcı ipucu yok | Kullanıcı-dostu açıklama + ipuçları (TR/EN) |
| BUG-16 | `ps: unknown option -- o` (Windows) | `process.platform !== 'win32'` guard |
| BUG-18 | MCP binary adı tutarsız | Dokümantasyon: `deckent-mcp` ayrı binary |

### Sprint 071 — Dogfooding Bug Fixes (7 fix + upgrade)

| Bug | Açıklama | Fix |
|-----|----------|-----|
| BUG-19 | UTF-8 encoding Windows | LANG + PYTHONIOENCODING env vars subprocess'e eklendi |
| BUG-21 | Doctor healthScore=0 tüm check passed | `c.ok` → `c.passed` field mismatch düzeltildi |
| BUG-22 | Review "No tasks found" sprint sonrası | `loadTaskResults()` archive/ fallback eklendi |
| BUG-23 | Heartbeat 28x stale, sequence=1 | setInterval 15s periyodik heartbeat update |
| BUG-24 | Worker .result dosyası yazmıyor | Fallback .result on child exit |
| BUG-25 | Scope parser Files/Scope ignorluyor | Explicit `Files:` / `Scope:` label parsing |
| BUG-26 | Task log boş (Windows) | closeSync(logFd) child exit handler'a taşındı |
| — | Versiyon bump + upgrade --local | `deckent upgrade --local <path.tgz>` beta workflow |

### Sprint 070 — Yeni Özellikler

| Özellik | Açıklama |
|---------|----------|
| `.deckent/workspace/IDENTITY.md` | Stack detection sonuçlarıyla dolu proje kimliği |
| `.deckent/docs/quick-start.md` | 5 adımda ilk sprint rehberi (TR/EN) |
| `.deckent/docs/directives-guide.md` | DIRECTIVES format rehberi + alan açıklamaları |
| `.deckent/docs/config-reference.md` | Tüm config.json ayarları referansı |
| TempSkill init'te | `project-conventions` skill otomatik oluşturuluyor |
| TempAgent init'te | Proje stack'ine göre temp agent'lar oluşturuluyor |
| DECKENT.md Workflow | Workflow adımları, DIRECTIVES format, Providers bölümü |
| Worker prompt stack-aware | Hardcoded `tsc`/`vitest` yerine DECKENT.md referansı |
| allowedTools genişletme | `Edit`, `Glob`, `Grep` worker tool'larına eklendi |

### Bilinen Açık Bug'lar

| Bug | Açıklama | Önem | Not |
|-----|----------|------|-----|
| BUG-17 | Worker .result yazmıyor (orijinal) | Low | BUG-24 fallback ile kısmen çözüldü |
| BUG-20 | İzin dialogu worker'ı yavaşlatıyor | Low | `--dangerously-skip-permissions` ile bypass edilebilir |

---

## Docker & Altyapı

### A. Bulunan ve Duzeltilen 3 Kritik Sorun

| Sorun | Kök Neden | Çözüm |
|-------|-----------|-------|
| Container auth fail | `~/.cache/claude/` mount → credentials `~/.claude/.credentials.json`'da | `~/.claude/` mount |
| `--dangerously-skip-permissions` blocked | Container root olarak çalışıyor, Claude CLI root'ta engelliyor | `--user uid:gid` ile non-root |
| Config uyarıları | `~/.claude.json` mount edilmiyordu | Conditional `.claude.json` mount |

### B. E2E Test Sonuclari

- **Tek worker**: `.result` dosyası container'dan host'a ulaştı ✅
- **2 paralel worker**: Her ikisi de bağımsız başarılı ✅
- **Container auto-cleanup**: `docker wait` + `docker rm -f` ✅
- **Heartbeat**: `exitCode: 0`, `status: DONE`, `backend: docker` ✅
- **Timeout marker**: Başarılı işte oluşmadı ✅

### C. Sprint 103 Sonuclari (7 Task)

| Sonuç | Sayı | Detay |
|-------|------|-------|
| DONE | 5 | ANALYSIS güncelleme, README badge, module sayıları, Docker test, Docker rehber |
| NO_GO | 1 | don't-ask mode → Edit/Write izni yok (debt-098-001) |
| GO_WITH_TECH_DEBT | 1 | Zaten çözülmüş debt, sadece DEBT.md marking kaldı |

### D. Eklenen Yeni Ozellikler

1. **`checkDocker()`** — Doctor'a Docker daemon + worker image kontrolü (14 check)
2. **Init Docker algılama** — Docker varsa otomatik `spawn_backend: docker` set
3. **`tests/e2e/docker-backend.test.ts`** — 10 integration test (spawn, heartbeat, cleanup, concurrent, log extraction)
4. **`docs/guide/docker-backend.md`** — 362 satır kapsamlı rehber

### E. Container Exit Code Analizi (Sprint 103 Test Container'lari)

| Exit Code | Anlam | Sayı | Detay |
|-----------|-------|------|-------|
| 0 | Başarılı | 1 | debug2 container |
| 137 | SIGKILL (timeout) | 8 | Test timeout sonrası kill |

### F. Tespit Edilen ve Cozulen Sorunlar

| # | Sorun | Durum | Cozum |
|---|-------|-------|-------|
| 1 | MCP server eski dist/ cache'liyor | ⚠️ Bilinen | `tsc` sonrasi MCP restart gerekli (dynamic import ESM'de cache bypass etmiyor) |
| 2 | Worker don't-ask mode | ✅ **COZULDU** | MCP start `autoApprove: default(true)` — commit `574ef65` |
| 3 | autoApprove gecmiyor | ✅ **COZULDU** | MCP start default(false)→default(true) — commit `574ef65` |
| 4 | Worker .result birakmadan cikiyor | ✅ **COZULDU** | Shell EXIT trap eklendi (tmux + docker) — commit `c5d2c89` |
| 5 | Config revert (spawn_backend siliniyor) | ✅ **COZULDU** | `updateLastSprintId()` null guard — commit `574ef65` |
| 6 | MCP run worker spawn etmiyor | ✅ **COZULDU** | `buildWorkerPrompt` + `SpawnBackendFactory` eklendi — commit `574ef65` |
| 7 | Docker auth mount yanlis | ✅ **COZULDU** | `~/.cache/claude/`→`~/.claude/` + non-root — commit `e807891` |
| 8 | Doctor Docker check eksik | ✅ **COZULDU** | `checkDocker()` eklendi — commit `e807891` |
| 9 | debt-098-001 duplicate ID | ✅ **COZULDU** | `debtId` guard eklendi — commit `5080d16` |

### G. `deckent run` Test Sonuclari

**Onceki durum (fix oncesi):**

| Yontem | Model | Sonuc | Detay |
|--------|-------|-------|-------|
| MCP `deckent_run` | sonnet | **TIMEOUT** | Worker spawn edilmiyordu (sadece JSON yaziyordu) |
| CLI `deckent run --auto-approve` | haiku | **TIMEOUT** | EXIT trap yoktu, .result birakmiyordu |

**Sonraki durum (fix sonrasi — dogrulama bekliyor):**
- MCP run: `SpawnBackendFactory` ile config-aware worker spawn
- EXIT trap: worker crash/timeout durumunda fallback NO_GO result
- autoApprove: `default(true)` — `--dangerously-skip-permissions` otomatik

### H. Guncel Is Plani (Sprint 104+)

**Oncelik 1 — Docker Sprint Canli Dogrulama**
1. ✅ MCP server restart sonrasi Docker sprint canli testi (Sprint 120-122)
2. ✅ `deckent run` MCP + CLI canli dogrulama (Sprint 121 CLI exit 0, Sprint 122 MCP reconnect OK)
3. ✅ Docker container timeout config'den okunuyor (`docker_timeout` config.json'da, varsayilan 1200s)

**Oncelik 2 — Beta Hazirligi**
4. ✅ README Docker backend bolumu + Quick Start (README.md:387-405, docs/guide/docker-backend.md)
5. ✅ Version bump 0.4.0-beta.1 (zaten yapildi)
6. ✅ CLI/MCP start parity (iki taraf da config.spawn_backend okuyor, MCP doctor skip dokumante)

**Oncelik 3 — Ozellik Genisleme**
7. ⏳ Hibrit backend (Docker worker + subprocess auditor) — ADR yazilacak
8. ⏳ Dashboard Docker container status goruntuleme
9. ✅ spawnWorkerMultiProvider config-aware (config.spawn_backend + docker_image + docker_timeout okuyor)

### Oturum Kapanisi (7 Nisan 2026 — 10 commit)

Bu oturumda Docker backend canli ortamda calisir hale getirildi. Ozet:

| Kategori | Detay |
|----------|-------|
| Commit | 10 (3 feat, 6 fix, 1 docs) |
| Yeni dosya | `tests/e2e/docker-backend.test.ts` (7 test), `docs/guide/docker-backend.md` (362 satir) |
| CI | ❌ 3 fail → ✅ 19/19 GREEN |
| Debt | 2 acik → 0 acik |
| Test | 12,062 pass, 0 fail |
| Coverage | 90% line, 89% branch, 95% function |

**Kritik fixler:** Docker auth (3 fix), Worker EXIT trap (.result garantisi), Config revert guard, MCP autoApprove default(true), MCP run worker spawn, MockSpawnBackend CI crash.

### Oturum Ozeti (8-9 Nisan 2026 — Docker Canli Dogrulama)

Docker backend canli E2E sprint dogrulamasi Sprint 119-122 boyunca tamamlandi. Ozet:

| Kategori | Detay |
|----------|-------|
| Sprint | 119 (NO_GO), 120 (NO_GO), 121 (CLI GO), 122 (MCP GO) |
| Docker test | 7 → 10 e2e test (log extraction, monitor updates) |
| CI fix | Coverage job Docker e2e `skipIf(!dockerAvailable)` guard eklendi |
| Canli sonuc | CLI exit 0 dogrulandi, MCP reconnect dogrulandi, smoke dosyalari olusturuldu |
| Dosyalar | `docs/docker-smoke/cli-test.md`, `docs/docker-smoke/mcp-ok.md` |

**Onemli tespit:** Sprint 119-120 Docker worker result dosyasi birakmadan cikti — MCP cache sorunu olarak tanimlandi. MCP server restart + CLI fallback sonrasi Sprint 121 CLI ve Sprint 122 MCP basarili oldu.

### I. Token Kullanim Analizi + Context-Aware Routing Is Plani

#### Mevcut Durum (7 Nisan 2026 — Gercek JSONL Verisi)

**Son 30 gun gercek token kullanimi** (Claude Code JSONL transcript parse):

| Metrik | Deger |
|--------|-------|
| Session sayisi | 1,189 (1,001'inde usage verisi) |
| API cagrisi | 56,713 |
| Input tokens | 1.6M |
| Output tokens | 13.0M |
| Cache write tokens | 176.2M |
| Cache read tokens | 5,084.9M |
| **Toplam (cache dahil)** | **5.28 Milyar token** |

**Model bazli dagilim:**

| Model | Input | Output | Cache Read | API Cagrisi | API Maliyeti |
|-------|-------|--------|------------|-------------|--------------|
| Opus 4.6 | 1.18M | 6.92M | 3,677M | 32,253 | $9,527 |
| Sonnet 4.6 | 0.32M | 5.50M | 1,253M | 21,525 | $669 |
| Haiku 4.5 | 0.07M | 0.57M | 154M | 2,885 | $8 |

**Cache etkisi:**

| Senaryo | Maliyet |
|---------|---------|
| Cache ile (gercek) | $10,212 |
| Cache olmasaydi | $61,468 |
| Cache tasarrufu | $51,256 (%83 indirim) |
| Claude Code Max Plan | $200 |
| **ROI** | **51x** |

**Kritik metrikleri:**
- Ortalama API cagri basina: 89,666 token cache'den, 28 token yeni input, 229 token output
- Context'in %97'si cache'den geliyor
- Cache hit orani: %99.9
- Max cache read: 553,047 token (tek cagri)
- Haftalik trend: +%122 artis (Deckent sprint yogunlugu artiyor)

#### Sorun: Cache ≠ Context Tasarrufu

Cache sadece maliyet azaltir — tokenlar yine context window'da yer kaplar:
- 90K token cache'den okunsa bile model o 90K'yi "goruyor"
- Opus/Sonnet 4.6: 200K context limit
- Uzun conversation'larda context compression devreye giriyor → bilgi kaybi

#### Is Plani: Context-Aware Routing (Sprint 104+)

**Katman 1: Context Estimator**
- Task basina context butcesi tahmini
- System prompt boyutu (CLAUDE.md + rules + skill prompts) hesapla
- Task scope dosyalarinin toplam token sayisini tahmin et
- Beklenen tool call overhead'i ekle
- Mevcut `token-counter.ts` (orphan, test'li) aktive edilecek

**Katman 2: Context-Aware Router**
- `task-router.ts`'e context boyutunu faktor olarak ekle
- ModelRegistry'ye `contextLimit` alani ekle (her model icin)
- Routing karari: Budget < %75 model limit → bu model OK, degilse yukselt veya parcala
- Karar mantigi:
  ```
  Budget < 150K → Sonnet 200K (ucuz, yeterli)
  Budget 150K-180K → Opus 200K (daha akilli, sikiisik)
  Budget > 180K → Task'i PARCALA veya 1M context modele yonlendir
  Budget > 800K → Kesinlikle parcala
  ```

**Katman 3: Task Splitter**
- Context butcesi model limitini astiginda otomatik scope bolme
- Dosya gruplamasina gore alt-task'lar olustur
- Her alt-task bagimsiz calisabilir olmali (shared context minimize)

**Katman 4: Token Usage Tracker (Sprint Reporter Entegrasyonu)**
- Worker result dosyasina `tokenUsage` alani ekle:
  ```json
  { "inputTokens": 15420, "outputTokens": 3200, "provider": "claude", "model": "opus" }
  ```
- Claude: JSONL transcript'ten post-hoc parse
- Gemini: Mevcut `parseGeminiOutput()` sonucunu kaydet (zaten parse ediyor)
- Codex: API response usage alanini yakala
- Sprint reporter'a token summary tablosu ekle (RETRO.md)

**Tahmini efor:** 3-4 sprint (Katman 1-2 oncelikli, Katman 3-4 sonraki fazda)

---

## Başarı Metrikleri & Risk

### Self-Improvement Olcumleri
| Metrik | Sprint 084 Oncesi | Sprint 086 Sonrasi | Hedef (10 sprint) | Olcum |
|--------|-------------------|--------------------|--------------------|-------|
| Sprint NO_GO rate | ~%15 | %0 (085+086) | <%5 | Sprint retro |
| Agent secim accuracy | Bilinmiyor | Olculebilir (decision trail) | >%85 | Decision JSON |
| Otomatik uygulanan kural | 0 | Altyapi hazir | 5+ per sprint | applied-rules.json |
| Intent classifier ogrenme | Yok | updateIntentWeights() aktif | <%10 yanlis | intent-weights.json |
| Sessiz hata | 49 | ~20 | 0 | grep count |
| Planner gecmis bilgisi | Yok | getWorstCombinations() | Her sprint | Planner prompt |
| Coverage threshold | Hardcoded %90 | Config'den okunuyor | Proje-bazli | config.json |

### Otonomi Olcumleri
| Metrik | Mevcut | Hedef (15 sprint) | Olcum |
|--------|--------|-------------------|-------|
| Insan mudahale / sprint | ~3-5 | <1 | Sprint log |
| Proaktif gorev sayisi | ✅ Daemon aktif | 5+ / gun | Heartbeat log |
| Self-heal orani | %0 | >%50 | Auto-fix / total error |
| Cross-sprint ogrenme | Minimal | Tam | Memory recall accuracy |

### Rakip Yakinlastirma
| Metrik | Mevcut | Hedef | Referans Rakip |
|--------|--------|-------|----------------|
| Skill/entegrasyon sayisi | 21 | 50+ | OpenClaw (13,729) |
| Model sayisi | 13 (ModelRegistry) | 15+ | Perplexity (19) |
| Kanal entegrasyonu | 0 | 5+ | OpenClaw (50+) |
| Human checkpoint | ✅ 3 faz (Sprint 088) | 3+ faz | Cowork |
| Codebase indeks | Yok | AST+RAG | Devin Wiki |

### Risk Analizi

| Risk | Olasilik | Etki | Azaltma |
|------|----------|------|---------|
| Auto-apply kurallar sistemi bozarsa | Dusuk | Yuksek | Kural versiyonlama + rollback + sandbox test |
| Heartbeat daemon kaynak tuketimi | Orta | Orta | Configurable interval, idle detection |
| Human checkpoint UX friction | Yuksek | Orta | Progressive disclosure, smart defaults |
| Intent feedback yanlis ogrenme | Orta | Yuksek | Minimum sample (10+), slow decay |
| Multi-sprint zincirleme sonsuz dongu | Dusuk | Yuksek | Max chain depth, cost guard |
| Browser control guvenlik acigi | Orta | Yuksek | Sandbox, permission system |

---

## Stratejik Konumlandırma

### ✅ Kısa Vade — TAMAMLANDI (Sprint 085-086): "Öğrenen Orkestratör"
- ✅ Ogrenme dongusu kapatildi (rule auto-apply + synergy + intent feedback + planner gecmis)
- ✅ Kurallar otomatik evrilir (applyEvolvedRules, confidence >= 0.85)
- ✅ Karar loglama + gozlemlenebilirlik (decision trail + .brain/ERRORS.md)
- ✅ Intent classifier sonuclardan ogreniyor (INTENT_WEIGHTS)
- **Rakiplerden farki:** Hicbir rakip (OpenClaw, Devin, Perplexity, Cowork) ogrenme dongusu kapatmis degil

### ✅ Orta Vade — TAMAMLANDI (Sprint 087-097): "Proaktif Gelistirici Asistani"
- ✅ Heartbeat daemon ile proaktif calisma (OpenClaw modeli) — Sprint 088
- ✅ Human checkpoint'ler ile guvenilir otonomi (Cowork modeli) — Sprint 088
- ✅ Sprint timeout reform — sinirsiz sureli calisma — Sprint 088
- ✅ Adaptive thresholds (NO_GO rate bazli otomatik ayar) — Sprint 088
- ✅ Mid-sprint reroute guclendirme (max 3 deneme) — Sprint 088
- ✅ Agent/Skill Evrim Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + tier-based routing (13 model, 3 provider, tek kaynak) — Sprint 097
- ⏳ Slack/GitHub entegrasyonlari
- **Rakiplerden farki:** Multi-agent + ogrenme + proaktif + checkpoints + acik kaynak

### ✅ Yakın Vade — TAMAMLANDI (Sprint 130-145): "Kurumsal Hazırlık + Memory V2"
- ✅ HTTP API Auth + Config Cache (Sprint 131)
- ✅ 360° Enterprise Readiness Audit — 118 bulgu (Sprint 132)
- ✅ Security Hardening — Plugin SHA-256 + AST sandbox (Sprint 133)
- ✅ Product Vision ADR-033/034 (Sprint 134)
- ✅ God Object Split — sprint-reporter 2297→96, sprint-controller 1890→209 (Sprint 134-136)
- ✅ Operational Hardening — koordinatör dayanıklılığı (Sprint 135)
- ✅ ADR Governance — MADR v3 hibrit + 37→39 ADR (Sprint 138)
- ✅ RBAC V1.0 — Brain-Auditor-Worker Authority Matrix (Sprint 139)
- ✅ Chain Dependency Scheduler — Kahn's topological (Sprint 139)
- ✅ Backend Parity 3/3 — Docker + tmux + subprocess (Sprint 139)
- ✅ Memory V2 DB-First — SQLite FTS5, dual-layer i18n (Sprint 140-141)
- ✅ Dead Code Audit — Wave A/B/C temizlik (Sprint 142-144)
- ✅ Adaptive Timeout + Observability (Sprint 145)
- **Rakiplerden farkı:** DB-first bellek + RBAC + chain scheduling + 39 ADR governance

### Beta GA (Sprint 146-150): "Ürün Lansmanı"
- Sprint 146: ✅ Prompt God Template Reform + 3 bug fix (DIRECTIVES koruması, SDL rehab, agent exclusion dinamik) + rubric konsolidasyon — 17 task
- Sprint 147: ✅ Nervous System çekirdeği — 13 modül, 25 test, ADR-040 kabul, NervousObserver + Dispatcher + SafetyFloor + 5 Dedektör + CLI TUI + 5 MCP aracı
- Sprint 148: ✅ Meta-Dogfood + Agent Taksonomi Reform + Nervous Canlı — test-writer kaldırıldı, testing-expert auto-aktiv, nervous enabled=true, 5 dedektör canlı, çapraz platform 3/3, routing V3
- Sprint 149: Final doküman konsolidasyonu + npm publish dry-run
- Sprint 150: 🚀 Beta GA Cutover (npm publish, tag v1.0.0-beta.1, public duyuru)
- **Hedef:** 23 Nisan 2026'da Beta GA — milyon user hazır

### Uzun Vade (Sprint 150+): "Otonom Yazılım Takımı"
- Codebase semantik anlayış (Devin Wiki modeli)
- Critique layer ile çok-modelli doğrulama (Cowork modeli)
- Browser/desktop kontrol (Claude Computer Use)
- Multi-sprint zincirleme (günlerce çalışan görevler, Perplexity modeli)
- Provider genişleme: Grok, Llama, Mistral, DeepSeek (ModelRegistry altyapısı hazır)
- Rubrik bazlı notlama ile iteratif iyileştirme (CMA modeli — GO/NO_GO ötesinde yapılandırılmış değerlendirme)
- Versiyonlu bellek + ajan versiyonlama ile rollback (CMA modeli — uyumluluk, A/B testi)
- REST API / Çoklu SDK erişimi (CMA modeli — TypeScript CLI ötesinde)
- **Rakiplerden farkı:** Tam takım simülasyonu — tek kişiden çok ekip

---

## Sonuç

**Deckent'in mevcut durumu (Sprint 166, v1.0.0-beta.1 → v1.0.0-beta.2 Sprint 168 GA):**
- 166+ sprint, 16,434+ test (413 dashboard), %89.33 coverage
- 15 built-in agent (+2 temp), 21 built-in skill — ADR-041 Agent Taksonomi reformu stable (Sprint 148, Sprint 150 + Sprint 166 ground-truth defense ile yeniden teyit)
- 13 model, 3 provider (Claude, Codex, Gemini), ModelRegistry ile tek kaynak
- 27 MCP tool + 8 resource, 55-56 CLI komutu
- 46 ADR kabul edildi (ADR-046 Brain Self-Update Hook Architecture Sprint 166'da eklendi)
- Self-improving routing AKTIF (kural evrimi, synergy, intent ogrenme, planner gecmis)
- Decision trail ile tam gozlemlenebilirlik
- ✅ Heartbeat Daemon AKTIF (proaktif gorev calistirma) — Sprint 088
- ✅ Human Checkpoints AKTIF (plan/evaluate/fix onay noktalari) — Sprint 088
- ✅ Sprint Timeout Reform (sinirsiz calisma destegi) — Sprint 088
- ✅ Adaptive Thresholds (NO_GO rate bazli otomatik ayar) — Sprint 088
- ✅ Mid-Sprint Reroute (max 3, configurable) — Sprint 088
- ✅ Agent/Skill Evrim Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + Tier-Based Routing (13 model, 3 provider) — Sprint 097
- ✅ Provider-Agnostic Config (brain_tier/worker_tier) — Sprint 097
- ✅ Docker Spawn Backend (container-based worker isolation) — Sprint 101
- ✅ Sprint Lock Mekanizmasi (coklu process cakisma engeli) — Sprint 101
- ✅ Memory V2 DB-First (SQLite FTS5, dual-layer i18n normalize) — Sprint 140-141
- ✅ ADR Governance Integration (MADR v3 hibrit, 39 ADR) — Sprint 138
- ✅ RBAC V1.0 (Brain-Auditor-Worker Authority Matrix) — Sprint 139
- ✅ Chain Dependency Scheduler (Kahn's topological sort) — Sprint 139

**Tamamlanan stratejik hedefler (Sprint 085-145):**
1. ✅ **Ogrenme dongusunu kapat** — rule auto-apply + synergy → router + intent feedback + planner gecmis (Sprint 085-086)
2. ✅ **Gozlemlenebilirlik** — sessiz catch → debugLog + decision trail + .brain/ERRORS.md (Sprint 085-088)
3. ✅ **Coverage config** — hardcoded %90 → config.coverage_threshold (Sprint 086)
4. ✅ **Heartbeat daemon** — OpenClaw modelinden proaktif calisma (Sprint 088)
5. ✅ **Human checkpoint'ler** — sprint fazlarinda insan onay noktalari (Sprint 088)
6. ✅ **Sprint timeout reform** — sinirsiz sureli sprint destegi (Sprint 088)
7. ✅ **Adaptive thresholds** — NO_GO rate bazli otomatik score ayarlama (Sprint 088)
8. ✅ **Mid-sprint reroute guclendirme** — max 3 deneme, configurable (Sprint 088)
9. ✅ **Agent/Skill evrim pipeline** — promotion/demotion execute, evolved rules inject (Sprint 091)
10. ✅ **ModelRegistry** — 13 model, 3 provider, tier-based routing, tek kaynak (Sprint 097)
11. ✅ **Sprint History Fix** — MCP history tool .brain/archive/ okuyor, 85+ sprint log erisilebilir (Sprint 098)
12. ✅ **Job Output Reform** — finalizeSprint() detayli gerekce/metrik/kanit (Sprint 099)
13. ✅ **Docs Surekli Guncel** — ANALYSIS, README, VISION, architecture sayilari tutarli (Sprint 098-100)
14. ✅ **Docker Spawn Backend** — container-based worker isolation, MockSpawnBackend, E2E tests (Sprint 101)
15. ✅ **Sprint Lock Mekanizmasi** — coklu process cakisma engeli, autoApprove standart (Sprint 101)
16. ✅ **Docker Canli E2E Dogrulama** — CLI+MCP sprint test, CI coverage skip guard, 10 e2e test (Sprint 119-122)
17. ✅ **Context-Aware Routing** — context butcesi tahmini → model secimi, contextFit puanlama (Sprint 124)
18. ✅ **Token Usage Tracker** — provider-native token sayimi + RETRO.md token summary tablosu (Sprint 124)
19. ✅ **Rubrik Bazli Notlama** — 4 kriterli rubrik (correctness, coverage, scope, docs), evaluateWithRubric() varsayilan evaluator (Sprint 125-129)
20. ✅ **Worker Soru Sorma Mekanizmasi** — askBrain IPC + tmux/docker icin file-based fallback, 63 test (Sprint 125-129)
21. ✅ **DEBT.md Parse Duzeltmesi** — JSON.parse→parseDebtTable, markdown tablo formati duzgun handle ediliyor (Sprint 129)
22. ✅ **Evaluator Tutarliligi** — evaluateWithRubric() tek evaluator, evaluateResult() deprecated (Sprint 129)
23. ✅ **Enterprise Tech Debt Temizligi** — 8 CRITICAL/HIGH borc kapatildi, acik borc sifir (Sprint 129)
24. ✅ **MCP Instructions Dogrulugu** — server.ts Tools (15)→(21) fix, 6 eksik tool instructions string'e eklendi (Sprint 130)
25. ✅ **Decision-Engine V1 Arsivleme** — 4 dosya @deprecated, ADR-028 yazildi, V1 referans olarak korundu (Sprint 130)
26. ✅ **Coverage Gercegi** — gercek olcum 89.33%, yanlis 96%+ iddiasi IDENTITY.md'de duzeltildi (Sprint 130)
27. ✅ **HTTP API Auth + Config Cache** — Bearer Token Authentication + loadConfig() module cache + 4 ADR (Sprint 131)
28. ✅ **360° Enterprise Readiness Audit** — 118 bulgu, 3.2/5 baseline, god object + sync I/O tespit (Sprint 132)
29. ✅ **Security Hardening** — Plugin SHA-256 + AST sandbox, 12/12 DONE, hazırlık 3.6/5 (Sprint 133)
30. ✅ **Product Vision ADR-033/034** — Product-Not-Service + Multi-Project Isolation (Sprint 134)
31. ✅ **God Object Split** — sprint-reporter.ts 2297→96 + sprint-controller.ts 1890→209 (Sprint 134-136)
32. ✅ **Operational Hardening** — Koordinatör dayanıklılığı + Docker graceful shutdown (Sprint 135)
33. ✅ **ADR Governance Integration** — MADR v3 hibrit + 37→39 ADR + ADR-036 self-referential (Sprint 138)
34. ✅ **Structured Event Stream** — event-stream.ts 305 LoC + scope collision detection (Sprint 138)
35. ✅ **RBAC V1.0** — ADR-037 Brain-Auditor-Worker Authority Matrix (+1370 LoC) (Sprint 139)
36. ✅ **Chain Dependency Scheduler** — Kahn's algorithm topological sort + detectScopeCollisions (Sprint 139)
37. ✅ **Backend Parity 3/3** — Docker + tmux + subprocess E2E test suite (Sprint 139)
38. ✅ **Memory V2 DB-First** — SQLite FTS5, dual-layer i18n normalize, 96% context azaltımı (Sprint 140-141)
39. ✅ **Dead Code Audit** — Wave A/B/C ölü kod temizliği (Sprint 142-144)

**Beta GA hedefi: Sprint 150 — 23 Nisan 2026**

**Siradaki 4 aksiyon:**
1. **Sprint 146-149** — Ölü kod Wave C, config audit, dashboard cilalama, npm publish dry-run
2. **Sprint 150** — 🚀 Beta GA Cutover (npm publish, tag v1.0.0-beta.1, public duyuru)
3. **Post-GA** — Codebase semantik indeksleme (AST + RAG), kanal entegrasyonları
4. **Post-GA** — Multi-sprint zincirleme, dinamik yeniden planlama

**Self-improving orkestrator: ✅ TAMAMLANDI (Sprint 102+)**
**Beta GA Readiness: 4.10/5 (Sprint 145)**

---

## Kaynaklar (Dogrulanmis — Nisan 2026)

### OpenClaw
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) — 343K+ yildiz (Nisan 2026), MIT lisans
- [OpenClaw Architecture](https://docs.openclaw.ai/concepts/architecture) — Gateway, Brain, Memory, Skills, Heartbeat
- [OpenClaw 250K Milestone](https://openclaws.io/blog/openclaw-250k-stars-milestone) — React'i 60 gunde gecti (3 Mart 2026)
- [OpenClaw 335K Stats](https://openclawvps.io/blog/openclaw-statistics) — 2M MAU, 27M web ziyareti, 1000+ contributor
- [OpenClaw Surpasses React](https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software) — GitHub'un en cok yildizli yazilim projesi
- [OpenClaw vs Claude Code](https://claudefa.st/blog/tools/extensions/openclaw-vs-claude-code) — Kategori farki analizi
- [ClawHub Skills](https://github.com/openclaw/clawhub) — 13,729 topluluk skill, %65+ MCP server wrap
- [OpenClaw Security](https://thenewstack.io/openclaw-github-stars-security/) — Guvenlik endise analizi

### Microsoft Copilot Cowork
- [Cowork Lansman](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/09/copilot-cowork-a-new-way-of-getting-work-done/) — Multi-model orkestrator (GPT + Claude critique)
- [Cowork Frontier](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/30/copilot-cowork-now-available-in-frontier/) — Anthropic isbirligi, Mart 2026
- [Cowork Fortune](https://fortune.com/2026/03/09/microsoft-copilot-cowork-ai-agents-anthropic-e7-m365-saas/) — Kurumsal detaylar
- [Cowork SiliconANGLE](https://siliconangle.com/2026/03/30/microsoft-accelerates-agentic-automation-copilot-cowork-complex-workflows/) — Agentic otomasyon

### Perplexity Computer
- [Perplexity Computer](https://www.perplexity.ai/hub/blog/introducing-perplexity-computer) — 19 model, $200/ay
- [Perplexity VentureBeat](https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at/) — Lansman detayi
- [Perplexity Enterprise](https://theaiinsider.tech/2026/02/28/perplexity-unveils-enterprise-focused-ai-agent-system-powered-by-multi-model-architecture/) — $325/koltuk/ay
- [Perplexity vs OpenClaw](https://www.pymnts.com/artificial-intelligence-2/2026/perplexity-enters-autonomous-ai-race-with-launch-of-computer/) — Rekabet analizi
- [Perplexity Pricing](https://www.sentisight.ai/how-much-perplexity-computer-cost/) — 10K kredi/ay, harcama limiti

### Devin
- [Devin 2.0 VentureBeat](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500/) — $500 → $20 fiyat dususu
- [Devin Pricing](https://devin.ai/pricing) — Core $20/ay, Team $500/ay, ACU sistemi
- [Devin Alternatives](https://www.augmentcode.com/tools/best-devin-alternatives) — Rakip analizi
- [Devin Review 2026](https://vibecoding.app/blog/devin-review) — v3.0 dynamic replanning, Compound AI

### Claude Ekosistemi
- [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) — Resmi agent altyapisi
- [Claude Computer Use](https://www.cnbc.com/2026/03/24/anthropic-claude-ai-agent-use-computer-finish-tasks.html) — Desktop otomasyon
- [Claude Dispatch](https://claude.com/blog/dispatch-and-computer-use) — Telefon → bilgisayar gorev akisi
- [Claude Code Features](https://help.apiyi.com/en/claude-code-2026-new-features-loop-computer-use-remote-control-guide-en.html) — Loop, Schedule, Computer Use
- [AI Agents Comparison 2026](https://blog.iskohm.com/en/posts/ai-agents-comparison-2026-cursor-copilot-kilo-code-claude-code/) — Tam karsilastirma

### Claude Managed Agents (CMA)
- [CMA Overview](https://platform.claude.com/docs/en/managed-agents/overview) — Yonetilen ajan altyapisi (beta Nisan 2026)
- [CMA Quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart) — Ajan olusturma, oturumlar, streaming rehberi

## Sprint Metrikleri (Güncel — Sprint 164)
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-164 |
| Toplam Task | 6 |
| Tamamlanan | 5 (+ 1 hayalet stub: 164-006 worker docker HB shutdown) |
| Tech Debt | 1 (Sprint 156-011 stub replay) |
| No-Go | 0 |
| Sonuç | GO_WITH_GATE_FAILURE (vitest +1 kronik) |
| Yeni Test | 14 (8 wire + 6 integration) |
| Coverage | %89.33 |

## Sprint Metrics (Current — Sprint 164)
| Metric | Value |
|--------|-------|
| Sprint | sprint-164 |
| Total Tasks | 6 |
| Completed | 5 (+ 1 phantom stub) |
| Tech Debt | 1 |
| No-Go | 0 |
| Outcome | GO_WITH_GATE_FAILURE |
| New Tests | 14 |
| Coverage | 89.33% |

## Sprint 146 — Detaylı Özet

**Tema:** Prompt God Template Reform + Kritik Bug Fix + Rubric Konsolidasyon
**Tarih:** Pzt 20 Nis – Sal 21 Nis 2026
**Task sayısı:** 17 | **Wave sayısı:** 6 | **Durum:** Aktif

### Sprint 146 Deliverables

**Wave 1 — Temel (paralel):**
- T1: Agent Truncation Bug Fix — agent-pool.ts satır 29 kırpma kaldırıldı (tam PROMPT.md yükleme)
- T2: Agent Routing V2 Retrain — intent classifier yenilendi, test-writer %52 → ≤%22
- T3: ADR Relevance Scoring Engine — adr-selector.ts, topN=3, yaş penaltisi
- T4: Scope Sanitizer — dist/ kaldır, global dosya koru, yol tekrarı kaldır

**Wave 2 — İnşa (paralel):**
- T5: Generative God Template — prompt-god-template.ts ~400 LoC, buildTaskPrompt() tek giriş
- T6: ADR Preset Matrix + Boş Başlık Temizleme — 7 task tipi preset, boş başlık atla
- T7: Prompt Kalite Linter — scripts/prompt-linter.mjs, avg ≥75/100 gate

**Wave 3 — Bug Fix (paralel):**
- T8: DIRECTIVES Orta-Sprint Koruma — phase guard, yalnızca CLEANUP'ta arşivle
- T9: SDL Decision Log Rehabilitasyon — v2-only log, anlamlı adımlar, deckent explain entegre
- T10: Rubric Konsolidasyon — Quality Assessor kanonik, worker self-report kaldırıldı

**Wave 4 — Ön Hazırlık (paralel):**
- T11: Sprint 145 vitest Regresyon Fix — 3 fail düzeltildi, ≥%99.3 geçme oranı
- T12: Nervous System Ön Hazırlık — `src/core/nervous-types.ts`, ADR-040 status: proposed
- T13: Sprint 146 Retro + Docs — Sprint-146.md, CHANGELOG 0.4.0-beta.2

**Wave 5 — Entegre (paralel):**
- T14: Agent Exclusion Dinamik — getDynamicExclusions(), global hard-code kaldırıldı
- T15: Zincir Güvenlik Gate — scripts/chain-gate-check.mjs, 6 kontrol

**Wave 6 — Doküman (paralel):**
- T16: Canlı Kayıt Güncelleme — FINAL-EXECUTIVE-REPORT.md bölüm 1/5/6/8 + ek
- T17: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 ekleme (bu bölüm)

### Sprint 147 Preview — Nervous System

Sprint 147 teması: **Deckent Sinir Sistemi** — runtime yetki zorlaması + bildirim motoru + güvenlik katmanı.

- **nervous-types.ts** placeholder hazır (Sprint 146 T12)
- **ADR-040** taslak kayıtlı, status: `proposed` → Sprint 147 sonunda `accepted`
- Bileşenler: AuthorityMode, ApprovalPolicy, NervousNotification, SafetyFloorAction
- Tasarım spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`

## Sprint Metrikleri (Sprint 146 Güncel)
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-146 |
| Toplam Task | 17 |
| Tamamlanan | aktif |
| Tech Debt | - |
| No-Go | - |
| Süre | aktif |
| Coverage | - |

## Sprint Metrics (Sprint 146 Current)
| Metric | Value |
|--------|-------|
| Sprint | sprint-146 |
| Total Tasks | 17 |
| Completed | active |
| Tech Debt | - |
| No-Go | - |
| Duration | active |
| Coverage | - |

**Beta GA yolu:** Sprint 146 ✅ → Sprint 147 ✅ → Sprint 148 ✅ → Sprint 149 🟡 → Sprint 150 🔵 (Per 🚀 GA 23 Nis)

---

## Sprint 148 — Detaylı Özet

**Tema:** Meta-Dogfood + Agent Taksonomi Reform + Nervous Dogfood Aktivasyonu + Çapraz Platform Doğrulama
**Tarih:** Pzt 20 Nis 2026
**Görevler:** 28 | **Dalgalar:** 6 | **Durum:** Tamamlandı
**BETA-TRACKER Kanonik Durum:** Sprint 145 ✅ 146 ✅ 147 ✅ 148 ✅ 149 🟡 150 🔵

### Temel İçgörüler — Sprint 148

**Agent Taksonomi Reformu (Kırıcı Değişiklik):**
- `test-writer` agent **kaldırıldı** — 16 → 15 built-in agent
- Kök neden: Sprint 145 %52, Sprint 146 %53, Sprint 147 **%95** anomali (%100 eşik aşıldı)
- Çözüm: `testing-expert` skill — görev scope'u `tests/**` veya `*.test.ts` içerdiğinde otomatik aktive olur
- Intent 'testing' sınıflandırıcıdan kaldırıldı → yerine 'test-coverage' etiketi kullanılıyor
- Router V2 yedek zinciri: `core-dev → architect → refactorer` (test-writer yok)

**Nervous System Canlı Aktivasyonu:**
- `nervous_system.enabled = true` (balanced preset) — ilk üretim sprinti
- Ana PID kısıtı zorunlu: tüm spawn script'lerde `DECKENT_WORKER_MODE=1` kontrolü (ADR-037)
- Tüm 5 dedektör aktif: StaleWorker, ScopeCollision, DebtTrend, AgentRouting, DirectivesProtection
- `AgentRoutingHealth` önem derecesi düşürüldü: `critical` → `warning` (reform başarı kanıtı)

**Çapraz Platform Doğrulama (Beta GA 1 gün kaldı):**
- macOS E2E (tmux): ✅ | Linux E2E (subprocess): ✅ | WSL2 E2E (Docker): ✅
- GitHub Actions matrix: `cross-platform-e2e.yml` eklendi
- Node 18/20/22 fresh install: tümü geçti
- i18n pariti: TR/EN routing aynı (8/8 test çifti)

**Vitest Triage:**
- Sprint 147 başlangıç: 135 hata
- Sprint 148 hedef: < 50 hata ✅

### Sprint 148 Deliverable Özeti

| Blok | Görevler | Tema | Durum |
|------|---------|-------|-------|
| A | T1-T5 | Agent Taksonomi Reformu | ✅ 5/5 |
| B | T6-T13 | Nervous Dogfood Aktivasyonu | ✅ 8/8 |
| C | T14-T19 | Çapraz Platform Doğrulama | ✅ 6/6 |
| D | T20-T28 | Cilalama + Borç + Dokümantasyon | ✅ 9/9 |

### 5 Günlük Beta GA Yol Haritası (Güncel)

| Gün | Sprint | Tema | Durum |
|-----|--------|-------|-------|
| Pzt 20 Nis | Sprint 146 | Prompt God Template Reform | ✅ |
| Sal 21 Nis | Sprint 147 | Nervous System Çekirdeği | ✅ |
| Çar 22 Nis | Sprint 148 | Meta-Dogfood + Taksonomi Reform | ✅ |
| Çar-Per | Sprint 149 | Son Mil — npm publish + dok konsolidasyon | 🟡 |
| Per 23 Nis | Sprint 150 | 🚀 Beta GA Kesim — npm publish v1.0.0-beta.1 | 🔵 |

### Sprint 149 Preview — Son Mil

Sprint 149 teması: **"Son Mil"** — npm publish + dok konsolidasyon + ADR-041 kabul.

- `npm publish v1.0.0-beta.1` (Sprint 148 dry-run provası yapıldı)
- ADR-041: Agent Taksonomi → proposed → **kabul**
- vitest hata: < 10 hedef (Sprint 148'de < 50'ye düşürüldü)
- **Beta GA 1 gün kaldı: Sprint 150 Per 23 Nis 🚀**

## Sprint Metrikleri (Sprint 148 Güncel)
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-148 |
| Toplam Task | 28 |
| Tamamlanan | 28 |
| Tech Debt | 0 |
| No-Go | 0 |
| Blok | 4 |
| Dalga | 6 |

## Sprint Metrics (Sprint 148 Current)
| Metric | Value |
|--------|-------|
| Sprint | sprint-148 |
| Total Tasks | 28 |
| Completed | 28 |
| Tech Debt | 0 |
| No-Go | 0 |
| Blocks | 4 |
| Waves | 6 |

---

## Sprint 163 — Detaylı Özet

**Tema:** Brain Stability Hattı MÜHÜRLENDİ
**Tarih:** 11 Mayıs 2026
**Görevler:** 6 | **Durum:** Tamamlandı (6/6 DONE, 0 NO_GO)

Brain processQueue + state freeze regression zinciri KAPATILDI. RETRO satır temizliği uygulandı. Çoklu sprint regression zinciri sonrası Brain stability hattı sıfır NO_GO ile mühürlendi.

---

## Sprint 164 — Detaylı Özet

**Tema:** Wave-Based Execution Semantics + ADR-045
**Tarih:** 12-13 Mayıs 2026
**Görevler:** 6 | **Durum:** GO_WITH_GATE_FAILURE (5/6 DONE + 1 hayalet stub)

### Temel Çıktılar

- **ADR-045 Wave-Based Execution Semantics** kabul edildi (45. ADR)
- **Wire code-complete:** `respawnEligibleTasks` sprint-controller zincirinde 13 grep eşleşmesi
- **Runtime gated:** `dependency_pipeline_enabled: false` — wire hazır, runtime Sprint 165 vitest gate kapanışına kadar devre dışı
- **Hayalet stub:** 164-006 worker docker HB shutdown stub olarak bırakıldı (runtime'a bağlanmadı)
- **+14 yeni test:** 8 wire doğrulama + 6 integration

### Reproduce Edilen / Uyuyan Bug'lar (Sprint 164 kanıtı)

- **Bug X (Sprint 156-011 stub):** Brain processQueue legacy FIFO stall Sprint 164'te **canlı reproduce edildi** — replay stub'ın hâlâ aktif olduğunu doğruladı
- **Bug W (Auditor `dead_event_stream`):** Sprint 148'den beri uyuyor — Sprint 165 uyandırma & kapatma kuyruğunda
- **Vitest kronik +1 fail:** Sprint 159'dan beri devam ediyor — Sprint 165 T3 kapanış hedefi

### Sprint 165 Hedefleri

- **T3:** Vitest gate temizliği (Bug Y kapama — Sprint 159'dan beri kronik +1 fail)
- **Bug X kapama:** Brain processQueue legacy FIFO stall — Sprint 156-011 stub replay close
- **Bug W kapama:** Auditor `dead_event_stream` uyandır & çöz
- **T5:** Dokümantasyon freeze (README, API ref, config ref final sync)
- **DeckentHub seed skill:** 20/20 publish hedefi (Gate #15)
- **Hedef:** 17/20 → 19/20 PASS

---

## Sprint 165 — Detaylı Özet

**Tema:** Bug X/Y/Z/W Kapama + Dokümantasyon Freeze + npm publish hazırlık
**Tarih:** 13 Mayıs 2026
**Görevler:** 5 | **Durum:** Tamamlandı (5/5 DONE, 0 NO_GO)

### Temel Çıktılar

- **T1 — Bug X stub kaldırma:** sprint-156-011 stub kapandı; Sprint 164'te canlı reproduce edilen Brain processQueue legacy FIFO stall nihayet kökten temizlendi
- **T2 — Bug Y Sprint-Stall fix:** Sprint state freeze regression kapandı
- **T3 — Bug Z kronik vitest +1 fail:** Sprint 159'dan beri devam eden kronik regression kapandı — vitest gate temiz
- **T4 — Bug W `dead_event_stream` aktivasyonu:** Auditor dead_event_stream uyandırıldı, event emission Sprint 148'den beri uyuyan haldeyken artık canlı
- **T5 — Docs freeze + public repo hazırlık:** README, API ref, config ref final senkronizasyon — Open Source GA yolu için
- **npm publish v1.0.0-beta.1 hazırlandı** — paket Sprint 168 GA cutover'a hazır

### Forensic Çıktı

Sprint 165 forensic baseline, Sprint 166 kök sebep analizi için kuruldu:
- 4 daha derin mimari bug tespit edildi (Bug M, N, S, Y2) — Sprint 166 P0 hedefi haline geldi
- Token forensic baseline: 377K in+out + 514K cache = 891K grand total (5 task × ~75K avg)
- Manuel recovery zinciri doğrulandı (kill → cleanup → recover → run → spawn)

---

## Sprint 166 — Detaylı Özet

**Tema:** Brain Self-Update + Veri Bütünlüğü Kapanışı + ADR-046
**Tarih:** 13-14 Mayıs 2026
**Görevler:** 11 | **Durum:** Tamamlandı (10 DONE + 1 GO_WITH_TECH_DEBT, 0 NO_GO)

### Temel Çıktılar

Sprint 164-165 forensic'inden gelen 4 mimari kök sebep kalıcı olarak çözüldü:

- **Bug M Fix (T1) — adrInsert hook + Step 3 wire:** `src/core/adr-file-sync.ts` yeni modül (MADR v3 parsing + memory.db upsert); `identity-generator.ts` postFinalizeHooks zincirinde Step 3 (adrInsert) eklendi, Step 4 (ruleRegen) yeniden numaralandırıldı. ADR-043/044/045/046 artık memory.db'ye akıyor
- **Bug N Fix (T2) — onRuleRegen manuel finalize path wire:** `cli/commands/finalize.ts:166` `finalizeSprint(...)` çağrısı artık `onRuleRegen` parametresini geçiriyor (Sprint 152+ manuel finalize `.claude/rules/*.md`'i 13 sprint boyunca stale bırakıyordu). Bonus Bug O: AUTO+CUSTOM block design fix
- **Bug S Fix (T3) — doc-cache sprint-aware cache key:** `doc-cache.ts` cache key `fileHash + entryHash + sprint.id` olarak genişletildi (Sprint 154+ managed-doc-runner per-sprint CLAUDE.md güncellemeleri artık aktif)
- **Bug Y2 Fix (T4) — 3-katmanlı ground-truth defense:** Unit test + integration test + Auditor runtime (`verifyDocSyncGroundTruth`); `.deckent/ground-truth-overrides.json` whitelist (agents_count=15 anchor, ADR-041 Sprint 148 reform stable)
- **Bug R+T Fix (T5):** AGENTS.md docs.json autoSections'a eklendi; identityRegen DEPRECATED; 5 root .md dosyası düzeltildi (CLAUDE.md, DECKENT.md, README.md, README-TR.md, IDENTITY.md) — Sprint 164 commit `a4f3be4`'te yanlış inject edilen agent sayısı 15'e (ADR-041 ground truth) çekildi, eski test taksonomi referansları kaldırıldı
- **Bug U+V Fix (T6):** Sprint type insert Sprint 140 sonrası kırılıyordu — onarıldı; 100 debt entry'nin `sprint_id` parseDebtMd regex ile backfill; 9 sprint memory backfill (134, 140, 152, 157-161, 165)
- **Bug C+X Fix (T7):** DECKENT.md kırık `.brain/DECISIONS.md` referansı → `.brain/exports/decisions.md`; `memory-export.ts` summary debt filter `status != 'resolved'`
- **Bug P Fix (T8):** TOOLS.md/BOOT.md/WORKER-GUIDE.md auto-content generator wire edildi (27 MCP tool + 56 CLI enumerate + verify-ran marker discipline + RBAC ADR-037)
- **Bug Q+W Fix (T9):** Provider parity (.codex/.gemini/.cursor frontmatter sync) + emitAlert helper (`src/monitor/alert-emitter.ts` +30 LoC) + stale_md detector (M4 monitoring source codepath)
- **Bug K+L Fix (T10):** verify-ran marker atomic write pattern (writeFileSync → renameSync); 3 stale doc test sprint sayısı güncellendi
- **T11 — ADR-046 Brain Self-Update Hook Architecture (Wave 1.5 bootstrap gate):** MADR v3 hibrit format, kabul edildi; Step ordering kontratı (Step 1-5) dokümante; hook çağrı sırası için regression test

### Metrikler

- **LoC:** ~2735 net
- **Yeni test:** 35+ (vitest delta 0 fail — Sprint 165 GO_WITH_TECH_DEBT kapanışı)
- **ADR sayısı:** 45 → 46 (ADR-046)
- **maxWorkers:** 6
- **Plan yapısı:** 4-wave + bootstrap gate (Wave 1.5 strictly serial Alperen manuel `npx deckent memory rebuild` CHECKPOINT)

### Tespit Edilen 4 Yeni Bug → Sprint 167 P0

Sprint 166 mimari forensic'inde 4 yeni follow-up bug tespit edildi (Sprint 167 öncelik):

- **Bug E:** [Sprint 166 tespit — Sprint 167 forensic]
- **Bug G:** [Sprint 166 tespit — Sprint 167 forensic]
- **Bug Z2:** [Sprint 166 tespit — Sprint 167 forensic]
- **Bug Z3:** [Sprint 166 tespit — Sprint 167 forensic]

---

## Sprint 167 + 168 Zaman Çizelgesi — Open Source GA Yolu

### Sprint 167 — Bug E+G+Z2+Z3 Fix + Dependency Pipeline Flip + M1-M4 Monitoring Baseline (15 Mayıs+ 2026)

- **4 yeni bug fix:** Bug E, G, Z2, Z3 (Sprint 166 forensic'i sırasında tespit edildi)
- **`dependency_pipeline_enabled: true` flip:** Wave scheduling devreye alınıyor — Sprint 135 T-005 6. canlı dogfood (Sprint 167 DIRECTIVES için anchor)
- **Minimal 3-task multi-wave smoke:** İlk production wave scheduling doğrulaması
- **M1-M4 baseline tracking:**
  - **M1:** Cache key kompletliği (Bug S anchor monitoring)
  - **M2:** Rule regen (Bug N anchor monitoring)
  - **M3:** ADR insert (Bug M anchor monitoring)
  - **M4:** Stale-md detector (Bug W anchor monitoring)
- **Token cumulative >900K checkpoint policy:** Sprint 166 advisory → Sprint 167 P0 otomatik blocker

### Sprint 168 — 🚀 Open Source GA Cutover (16 Mayıs+ 2026)

- **Public repo flip:** `VerhexIO/deckent` → `VerhexIO/deckent` (public)
- **npm publish v1.0.0-beta.2:** Tag, GitHub release
- **Show HN duyuru:** Hacker News launch
- **Reddit + Twitter duyuru:** r/programming, r/MachineLearning, AI/dev Twitter
- **Topluluk onboarding:** Issue template, contribution guide, Discord kanal canlı
- **Sprint 169:** VS Code extension adapter (Sprint 166 T9 kapsamından çıkmıştı)
- **Sprint 170:** ADR-046 refactor trigger değerlendirmesi (M1-M4 monitoring veri review'u)

---

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Sprint | sprint-255 |
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Duration | 0dk 0sn |
| Coverage | 0.0% |

## Sprint History
_No sprint history._
