# Changelog

> **This file has been consolidated.** The canonical changelog is at the project root: [CHANGELOG.md](../CHANGELOG.md).

## [1.0.0-beta.1-sprint219] - 2026-06-02

### Added

- 219-001 — `deckent` argümansız → agentic chat REPL (claude modeli) [P0]
- 219-002 — `deckent chat --native` gerçek round-trip run-proven
- 219-003 — REPL UX god-level (prompt, history, çok-satır, exit, Ctrl-C)
- 219-004 — REPL'de doğal dil → MCP/deckent aksiyon dispatch (agentic)
- 219-005 — Agentic aksiyon onay kapısı (riskli → confirm)
- 219-006 — Agentic session persist (REPL hafıza + devam)
- 219-007 — chat-backend token-streaming (F2-007, gerçek SSE)
- 219-008 — REPL + dashboard stream render (akan cevap göster)
- 219-009 — Dashboard nav tek-kaynak + RENDER-based test (kaynak-grep değil)
- 219-011 — TR MASTER-PLAN (Türkçe, güncel dürüst durumla)


_Tasks: 17 total, 16 done, 0 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint218] - 2026-06-01

### Added

- 218-013 — [✅ KONTROL — kod izole `deckent run` ile yapıldı + commit 64c97c2f; YENİDEN YAZMA YASAK] Git self-mutation guard
- 218-001 — [✅ KONTROL — kod izole `deckent run` ile yapıldı + commit 9e2e7d34; YENİDEN YAZMA YASAK] sprint-start detach
- 218-002 — Eksik sayfaları route+sidebar'a bağla (Evolution/Nervous/Enterprise/MemoryExplorer)
- 218-003 — Chat gerçek round-trip (ChatPage → backend, status-only DEĞİL)
- 218-004 — Dashboard DIRECTIVES editörü (gerçek içerikli sprint başlat, boş "new sprint" değil)
- 218-005 — Dashboard sayfaları gerçek veri bağlı (Nervous loading+error+empty)
- 218-006 — God-level layout shell (modern bilgi mimarisi, responsive, sıfır skeleton-freeze)
- 218-007 — Native hız: skeleton-freeze kaldır, akıllı polling/SSE, stale-while-revalidate
- 218-008 — Tema tutarlılık + görsel polish (dark/light token, component tutarlılık)
- 218-009 — Sprint kontrol paneli polish (canlı durum + worker grid + faz göstergesi)


_Tasks: 13 total, 13 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint217] - 2026-06-01

### Added

- No completed tasks


_Tasks: 2 total, 0 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint215] - 2026-06-01

### Added

- 215-001 — `deckent test:ci-sim` clean-state reproducer
- 215-002 — CI-hermeticity lint guard (test gitignored state okumasın)
- 215-003 — test-HOME isolation helper + sızan testlere uygula
- 215-004 — F1-009 bootstrap-register: OpenAI-compat provider'ları kaydet (dormant→usable) [P0]
- 215-005 — F1-010 subs→API overflow orchestration
- 215-006 — F6-006 per-worker auth/provider task JSON (Sprint/Task/Process)
- 215-007 — Multi-provider eşzamanlı e2e smoke (3-subs + API + local mix)
- 215-008 — F7-003 UI/UX redesign (bilgi mimarisi + responsive + dark/light tutarlılık)
- 215-009 — F7-004 terminal güçlendirme (çok-oturum + geçmiş + kopyala/yapıştır)
- 215-010 — F7-006 enterprise view (multi-tenant + RBAC UI)

### Fixed

- Fix debt: Tech debt from 210-009-fix: Root cause of NO_GO (test_coverage=65): original wor


_Tasks: 24 total, 24 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint214] - 2026-06-01

### Added

- 214-001 — Docker env-forwarding provider+auth-aware (ANTHROPIC_API_KEY subscription'da strip)
- 214-002 — Auth-mode resolution guard + smoke (config subscription effective)
- 214-004 — dashboard: inject API token'ı isteğe ekle (useApi Bearer)
- 214-005 — serve localhost out-of-box smoke (POST 200, API-disabled YOK)
- 214-006 — Path A embedded chat backend (host-CLI'SIZ, server-side ProviderAdapter)
- 214-007 — Dashboard Chat tab → chat-backend wire (Path A frontend)
- 214-008 — F7-003 UI/UX pass: Layout responsive + dark/light + Sidebar
- 214-009 — VS Code extension gerçek activation + CLI/MCP köprü
- 214-010 — Command palette handler'lar (Start Sprint / Show Dashboard / Status)
- 214-011 — Sidebar TreeView: canlı agent/sprint durumu

### Fixed

- Fix debt: Tech debt from 210-009-fix: Root cause of NO_GO (test_coverage=65): original wor
- 214-003 — serve: API token'ı dashboard'a inject (localhost out-of-box, 401 fix)
- 214-020 — README badge sync (190+→214) + ci-baseline garbage fix


_Tasks: 25 total, 25 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint212] - 2026-06-01

### Added

- 212-001 — prompt-evolution RETRO'ya gerçek caller (sprint-reporter wire)
- 212-002 — adaptive-agent outcome-tracker'a gerçek caller wire
- 212-003 — agent-genealogy promotion-pipeline'a gerçek caller wire
- 212-004 — agent-retirement DECAY/promotion'a gerçek caller wire
- 212-005 — specialization-drift retro/outcome'a gerçek caller wire
- 212-006 — prompt-rollback evolution flow'a gerçek caller wire
- 212-007 — Retro "Next Sprint Behavior Changes" bölümü (evrim görünürlüğü)
- 212-009 — Routing çeşitlilik guard testi (regresyon önleme)
- 212-010 — managed-docs generator: code-derived module sayıları
- 212-011 — VISION/IDENTITY "by the numbers" generator: live MCP/CLI sayıları

### Fixed

- 212-008 — Routing skew fix: skill→agent aktivasyon sinyali


_Tasks: 15 total, 15 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint211] - 2026-06-01

### Added

- 211-001 — chat-native gerçek ProviderAdapter round-trip (subscription CLI)
- 211-002 — chat-native tool dispatch gerçek MCP tool çağrısı
- 211-003 — chat session persist + resume (memory.db chat entry)
- 211-004 — chat CLI canlı smoke (deckent chat --native end-to-end)
- 211-005 — RBAC runtime enforcement wire (sprint komutlarına gate)
- 211-006 — Audit compliance export (SOC2/GDPR JSON/CSV)
- 211-007 — Rate/resource limit guard (enterprise hardening)
- 211-008 — RBAC CLI grant/revoke tamamla
- 211-009 — prompt-evolution outcome-tracker wire (dormant→canlı)
- 211-010 — adaptive-agent runtime adaptation wire


_Tasks: 16 total, 16 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint210] - 2026-06-01

### Added

- 210-001 — error-handling + error-registry-lint allowlist (honest-gate çöp-tespit)
- 210-004 — Routing canlı doğrulama testi (build sonrası çeşitlilik)
- 210-005 — Routing imbalance CI guard (dağılım eşik)
- 210-008 — Brain NO_GO note doğruluğu (gerçek sebep yaz)
- 210-010 — Dashboard agent/skill dağılım görünümü (routing şeffaflık)
- 210-011 — Dashboard API routing endpoint
- 210-012 — Dashboard onboarding/empty-state iyileştirme (sade kişi)
- 210-013 — Self-dispatch pending-approval kuyruğu (otonom mod onay-gate)
- 210-014 — RBAC CLI komut (deckent rbac check/grant iskelet)
- 210-015 — Audit log CLI sorgu (deckent audit query iskelet)

### Changed

- 210-009 — Dashboard sprint kontrol paneli (plan/start/status UI) (completed with tech debt)

### Fixed

- 210-002 — health-check gece-yarısı tarih flaky fix
- 210-003 — docker-backend full-suite contamination kalıcı fix
- 210-006 — FIX prompt enrichment (orijinal task description inject)
- 210-007 — FIX agent seçimi task türüne göre (sadece bug-fixer değil)
- 210-016 — ADR-073 (routing canlı + FIX prompt + dashboard) + ROADMAP


_Tasks: 20 total, 20 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint209] - 2026-05-31

### Added

- 209-001 — Intent-classifier çeşitlendirme (domain/scope→intent)
- 209-002 — Multi-sinyal agent scoring (domain+scope ağırlık)
- 209-003 — refactorer impl skor dengeleme (7→tier)
- 209-004 — Skill routing denetimi + çeşitlendirme
- 209-005 — Routing dağılım analiz raporu (outcome-tracker)
- 209-006 — API auth disabled-flag bağımlılığı kaldır (F7-001)
- 209-007 — Dashboard API endpoint canlı veri parite (F7-002)
- 209-008 — mcp-attach tool count hardcode kaldır (208-002 bayrak)
- 209-010 — Sprint 208 worker-artefakt önleme (honest-gate güçlendir)
- 209-011 — Self-dispatch flow-runtime entegrasyon (otonom tetik)

### Fixed

- 209-009 — docker-backend e2e izolasyon kalıcı fix (son fail)


_Tasks: 15 total, 15 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint208] - 2026-05-31

### Added

- 208-002 — CLI sabit sayı çıktıları parametrik (agent/skill/tool count)
- 208-003 — Model distribution çıktısı brain-context parametrik
- 208-004 — Zero-hardcode audit raporu + lint guard
- 208-005 — Flow scheduler runtime daemon (tick loop)
- 208-006 — Self-dispatch protokol iskelet (otonom sprint tetikleme)
- 208-007 — deckent flow run CLI (scheduled flow manuel tetik)
- 208-008 — Tenant runtime context wire (multi-tenant izolasyon aktif)
- 208-009 — RBAC role hierarchy + permission matrix tamamla
- 208-010 — Flow-registry RBAC gate (flow:manage izni)
- 208-011 — Audit event yazım API (query'nin yazma tarafı)

### Fixed

- 208-001 — mergeFromCatalog id eşleşme kök-bug fix
- 208-015 — docker-backend e2e izolasyon kalıcı fix


_Tasks: 16 total, 16 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint207] - 2026-05-31

### Added

- 207-002 — bootstrapFromCatalog apiId merge doğrula + wire
- 207-003 — Cost-estimate çıktısı catalog-aware (parametrik model adı)
- 207-004 — docker-backend test izolasyon (kill/list state)
- 207-005 — managed-docs auditor template memory.db pattern
- 207-007 — RBAC enforce wire (audit-query'ye can() gate)
- 207-008 — Flow scheduler + event-trigger birleşik dispatch
- 207-009 — ADR-070 (Brain Evaluation Integrity + Zero-Hard-Code) + ROADMAP

### Changed

- 207-001 — Model registry bundled apiId güncel + "stale" işareti (completed with tech debt)

### Fixed

- 207-006 — Brain-fix canlı doğrulama testi (coverage:null → 0 false-FIX)


_Tasks: 9 total, 9 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint206] - 2026-05-31

### Added

- 206-001 — flow CLI registerFlow → CLI entry wire (gerçek gap)
- 206-005 — F3-003 webhook/event trigger tipi + handler iskelet
- 206-006 — F2 native chat gerçek provider adapter binding
- 206-007 — Scheduled-flow runtime tick/scheduler iskelet
- 206-008 — F4 RBAC role-check iskelet (tenant-aware permission)
- 206-009 — ADR-069 (event-driven + RBAC) + ROADMAP tracker güncelle

### Fixed

- 206-002 — docker-backend test izolasyon fix (kill/list state)


_Tasks: 16 total, 12 done, 0 tech debt, 4 no-go_

## [1.0.0-beta.1-sprint205] - 2026-05-31

### Added

- 205-001 — Agent routing canlı doğrulama testi (implementation→built-in)
- 205-002 — spawn-backend-docker max_workers testi config-agnostic
- 205-005 — Scheduled flow tipi + parser iskelet
- 205-006 — Flow registry (CRUD + persist)
- 205-007 — deckent flow CLI komut iskelet (list/add)
- 205-008 — Audit log query API iskelet
- 205-009 — F4 ADR taslağı + ROADMAP tracker güncelle

### Fixed

- 205-003 — start-lifecycle flaky fix
- 205-004 — docker-backend + identity-generator + error-handling flaky fix


_Tasks: 12 total, 12 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint204] - 2026-05-31

### Added

- 204-004 — Stale temp-agent demote eşiği + react-template stack-guard
- 204-006 — Multi-turn context window (son N turn inject)
- 204-007 — Chat resume (--resume son oturumu yükle)
- 204-009 — F3 ADR taslağı + ROADMAP tracker güncelle

### Fixed

- 204-001 — Circular import fix: MODEL_TIERS lazy-init
- 204-002 — ci-baseline auto-regen gerçek-değer fix


_Tasks: 15 total, 9 done, 0 tech debt, 6 no-go_

## [1.0.0-beta.1-sprint203] - 2026-05-31

### Added

- 203-001 — Docker provider-binary seçimi (claude/codex/gemini)
- 203-003 — Dockerfile.worker multi-CLI (build-arg opt-in)
- 203-004 — Provider-free smoke genişlet (Docker yolu dahil)
- 203-008 — Kalan hardcode-3 değerlendirme + temizlik
- 203-009 — ADR-066 provider-independence finalize + doc

### Changed

- 203-002 — Docker provider-aware auth mount (completed with tech debt)


_Tasks: 14 total, 8 done, 1 tech debt, 6 no-go_

## [1.0.0-beta.1-sprint202] - 2026-05-31

### Added

- 202-001 — Ollama provider bootstrap kaydı (detectOllama + factory)
- 202-003 — Claude-hardcode temizliği (registry-default fallback)
- 202-005 — Doc-align (Gate #8 PARTIAL + chat.ts live + Sprint 185-200 arşiv)


_Tasks: 9 total, 4 done, 0 tech debt, 5 no-go_

## [1.0.0-beta.1-sprint201] - 2026-05-31

### Added

- 201-001 — README + landing içerik kullanıcı-dostu elden geçirme
- 201-002 — W-H doc-drift long-tail kapat (api.md + reference temizlik)
- 201-003 — develop→ürün yayın senkronizasyon script'i
- 201-004 — İki-repo konumlandırma ADR + audit-report immutable note
- 201-005 — Clean-clone smoke verify (deckent son haliyle çalışıyor kanıtı)


_Tasks: 7 total, 5 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint200] - 2026-05-31

### Added

- 198-004 — Kapsamlı plan dosyaları Sprint 195-197 status refresh (3 dosya)
- 198-005 — 6-worker × 2g config verify + RAM deney readiness audit
- 198-007 — Sprint 191-196 retroactive reclassify re-run (12/12 hedef)
- 198-008 — Beta launch smoke pre-check (npm pack dry-run + 20-gate verify)

### Fixed

- 198-001 — Sentetik NO_GO KAYNAK 6+7 fix (sprint-phases + sprint-controller gate wire)


_Tasks: 15 total, 7 done, 0 tech debt, 8 no-go_

## [1.0.0-beta.1-sprint199] - 2026-05-31

### Added

- 198-004 — Kapsamlı plan dosyaları Sprint 195-197 status refresh (3 dosya)
- 198-009 — Memory backup auto-sync mekanizması (user-memory ↔ core-memory)
- 198-008 — Beta launch smoke pre-check (npm pack dry-run + 20-gate verify)

### Fixed

- 198-001 — Sentetik NO_GO KAYNAK 6+7 fix (sprint-phases + sprint-controller gate wire)
- 198-002 — memory.db sprint-log finalize bug fix + Sprint 194/196 row backfill


_Tasks: 9 total, 5 done, 0 tech debt, 4 no-go_

## [1.0.0-beta.1-sprint197] - 2026-05-26

### Added

- 197-002 — Sprint 191-196 retroactive reclassify çalıştır (script run + audit)
- 197-003 — CHANGELOG Sprint 172-194 kalan 19 entry backfill (script run)
- 197-005 — Persona-task matcher canlı doğrulama + threshold tuning

### Fixed

- 197-001 — disk-verify gate untracked file detection fix


_Tasks: 8 total, 6 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint196] - 2026-05-26

### Added

- 196-001 — Sprint 191/192/193/194/195 retroactive bulk reclassify
- 196-004 — WP-3 Boundary guard scope auto-derive (test dizini otomatik)
- 196-007 — Test fail kategorize update (Sprint 195 sonrası 53 fail)

### Fixed

- 196-002 — WP-1 Persona-task domain matcher (worker prompt routing fix)
- 196-006 — WP-2 FIX worker idempotency mode flag (verify-only vs re-implement)


_Tasks: 11 total, 6 done, 0 tech debt, 5 no-go_

## [1.0.0-beta.1-sprint195] - 2026-05-26

### Added

- 195-002 — CHANGELOG Sprint 157-194 backfill scripti
- 195-003 — SECURITY.md ADR-037 V2 disclosure + README pre-beta durumu
- 195-005 (OPSIYONEL) — Dockerfile.worker Codex/Gemini install + sanity guide

### Fixed

- 195-001 — Brain disk-verify gate (sentetik NO_GO 5 kaynak fix, W-INTEGRITY)


_Tasks: 8 total, 6 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint194] - 2026-05-26

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint193] - 2026-05-24

### Added

- No completed tasks

_Tasks: 1 total, 0 done, 0 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint192] - 2026-05-24

### Added

- 192-005 — sprint-finalizer retro hook DB write (Sprint 191 191-008 carry-over)
- 192-007 — Provider isAvailable 3-state + Ollama TECH_DEBT (Sprint 191 191-017 carry-over)
- 192-010 — TaskEvaluation.DEFERRED enum + retro reporting (W-INTEGRITY I-4)

### Changed

- 192-003 — outcome-tracker reclassifyTaskOutcome GERÇEK implementation (Sprint 191 191-003 carry-over — dishonest worker case) (completed with tech debt)

### Fixed

- 192-008 — Hotfix telemetri — never-dispatched + alive-grace event sayım retro'ya (W-INTEGRITY I-1)

_Tasks: 25 total, 5 done, 1 tech debt, 20 no-go_

## [1.0.0-beta.1-sprint191] - 2026-05-23

### Added

- 191-001 — Docker worker memory budget — max_workers 6→3 + per-worker memory tuning
- 191-006 — MCP `deckent_start` fire-and-forget Promise lifecycle hardening

### Fixed

- 191-005 — ci-guardian agent activation fix (Sprint 190 warning loop)

_Tasks: 29 total, 3 done, 0 tech debt, 26 no-go_

## [1.0.0-beta.1-sprint190] - 2026-05-23

### Added

- 190-002 — Provider isAvailable 3-state (binary+auth) + doctor mesajları
- 190-008 — 19 TDD test (api-md+identity-refs) + 7 env-fail (codex-config ENOSPC + alert-emitter) yeşillenmesi
- 190-011 — `deckent models list/refresh/tier` CLI + `deckent_models` MCP tool
- 190-012 — README.md baştan yaz (Trinity vision + OSS GA-ready)
- 190-013 — Getting Started 5dk + first-sprint + chat-mode docs

### Changed

- 190-009 — Ollama provider adapter (Local LLM, RTX 5090 vision) (completed with tech debt)

### Fixed

- 190-001 — IDENTITY.md sat30 AUTOGEN extend + Memory DB retro entry hook fix
- 190-003 — Release workflow npm publish step + provenance + 9 test fix
- 190-014 — docs/cookbook/ 3 örnek tarif (REST API, bug fix, doc update)

_Tasks: 25 total, 9 done, 1 tech debt, 16 no-go_

## [1.0.0-beta.1-sprint189] - 2026-05-22

### Added

- 189-002 — Coverage threshold kapısı + CI gate (WrongStack WS-Z1)
- 189-003 — MCP_INSTRUCTIONS 27→31 + 4 eksik tool + lint regression-guard
- 189-004 — docs/reference/api.md Memory V2 stale referans temizliği
- 189-005 — docs/reference/cli.md + cli-commands.md PROJECT-IDENTITY.md temizliği
- 189-007 — Provider CLI detection RC + deckent doctor --providers
- 189-008 — deckent_start MCP cost-gate ekleme (Sprint 140 $42 aşımı tekrarı önleme)
- 189-010 — SECURITY.md threat model + ADR-037 advisory notu (WrongStack WS-Z3)
- 189-013 — .claude/rules/auditor.md PATTERNS.md → memory.db rule güncelleme
- 189-014 — directives-stress-simulator.mjs koruma + validate-publish duplicate temizlik
- 189-016 — CHANGELOG sprint-reporter otomatik update wire (WrongStack WS-Z2 follow-up)

### Fixed

- 189-001 — core/notify.ts ADR-008 ihlali fix (dependency inversion)
- 189-006 — Dashboard StatusPage 404 fix (App.tsx wire)
- 189-012 — IDENTITY.md MCP 27→31 sync + AUTOGEN drift fix
- 189-015 — Test fail 36 kategorize + Sprint 190 fix plan (audit)

_Tasks: 23 total, 19 done, 0 tech debt, 4 no-go_

## [1.0.0-beta.1-sprint188] - 2026-05-22

### Added

- W1-T01 — CLI komut envanteri ve bütünlük denetimi
- W1-T02 — MCP araç ve resource envanteri
- W1-T03 — core/ çekirdek modül sağlığı
- W1-T04 — orchestra/ sprint lifecycle sağlığı
- W1-T05 — agents/ + monitor/ sağlığı
- W1-T06 — nervous/ + connectors/ + providers/ sağlığı
- W1-T07 — api/ + dashboard/ tutarlılığı
- W1-T08 — scripts/ + build/test config envanteri
- W1-T09 — feature envanteri ve doğruluk denetimi
- W2-T10 — CLI↔MCP parity tam haritası

_Tasks: 12 total, 12 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint187] - 2026-05-22

### Added

- api-surface.md Memory V2 atıf güncellemesi

_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint186] - 2026-05-21

### Added

- Audit src/agents/adaptive-agent.ts
- Audit src/agents/agent-genealogy.ts
- Audit src/agents/agent-retirement.ts
- Audit src/agents/auditor.ts
- Audit src/agents/cross-sprint-analyzer.ts
- Audit src/agents/index.ts
- Audit src/agents/permission-guard.ts
- Audit src/agents/prompt-ab-test.ts
- Audit src/agents/prompt-analytics.ts
- Audit src/agents/prompt-evolution.ts

_Tasks: 69 total, 31 done, 0 tech debt, 38 no-go_

## [1.0.0-beta.1-sprint185] - 2026-05-21

### Added

- Audit src/core/ tüm modüller (≈90 dosya, types/config/memory/routing/agent-pool/skill-pool)
- Audit src/orchestra/ tüm modüller (≈76 dosya, sprint lifecycle/brain/planner/evaluator)
- Audit src/cli/ tüm komutlar (≈46+ dosya, commander.js + register pattern)
- Audit src/agents/ + src/nervous/ + src/monitor/ runtime modülleri (≈40 dosya)
- Audit src/api/ + src/mcp/ + src/connectors/ + src/providers/ entegrasyon yüzeyleri (≈50 dosya)
- Audit src/dashboard/ + src/extensions/vscode/ frontend yüzeyleri (≈100+ dosya)

_Tasks: 7 total, 7 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint184] - 2026-05-21

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint183] - 2026-05-21

### Added

- W1-1 — P0-1 Nervous PLAN-phase pasif (FSWatcher debounce + phase guard)
- W1-2 — P0-2 DEPENDENCY_BLOCKED event spam debounce (state-change emit)
- W2-1 — Sprint 182 W1-1 recovery: mock hygiene orphan-cleaner-ipc + archive-debt
- W2-2 — Sprint 182 W1-3 recovery: vitest CI=true parity smoke
- W2-4 — Sprint 182 W3-PQ-7 recovery: integration smoke regression tamamla
- W3-1 — Sprint 182 W4-1 recovery: validate:publish 6/6 GREEN recheck + Brain re-eval RC
- W3-2 — Beta launch hijyen: npm pack + lint:adr + lint:link final

### Fixed

- W1-3 — P0-3 Worker timeout root cause investigation + fix
- W2-3 — Sprint 182 W2-2 recovery: title-prefix Dependencies resolver tamamla

_Tasks: 13 total, 11 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint182] - 2026-05-21

### Added

- W1-2 — cli/run.test.ts SpawnBackendFactory mock chain
- W2-1 — `dependency_pipeline_enabled: true` ADR-045 wire verify
- W2-3 — Verify task pattern redesign
- W3-PQ-2 — F2 + F3 truncation kaldır (skill + ADR full content)
- W3-PQ-3 — F4 Agent prompt single source (PROMPT.md kanonik)
- W3-PQ-5 — F7 ADR relevance threshold (default 0.3)
- W3-PQ-6 — F8 Agent override semantic warning
- W4-2 — package.json final + lint:adr + lint:link
- W4-3 — ADR-048 Prompt Lifecycle Contract amendment
- W4-4 — Sprint 182 retro + Sprint 183 post-beta stub

### Fixed

- W3-PQ-1 — F1 `${IDEMPOTENCY_KEY}` injection fix
- W3-PQ-4 — F5 + F6 DIRECTIVES parser fix (Files + title/desc)

_Tasks: 24 total, 14 done, 0 tech debt, 10 no-go_

## [1.0.0-beta.1-sprint181] - 2026-05-21

### Added

- W1-2 — package.json root scripts gözden geçir + tsc:dashboard alias
- W2-1 — Sprint smoke + CI yeşil verify

_Tasks: 5 total, 3 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint180] - 2026-05-20

### Added

- W0 — Nervous config schema sync (Step F)
- W2-2 — Nervous IPC queue MCP→Executor (Step E)

### Changed

- W1-2 — Nervous bootstrap fabrika (Step A) (completed with tech debt)
- W2-1 — Nervous action handlers (Step C) (completed with tech debt)
- W3-1 — Sprint-controller nervous wire (Step D) (completed with tech debt)
- W3-3 — Nervous integration runtime test (completed with tech debt)
- W4-1 — Worker .result coverage zorunluluk ★ BETA MUST (completed with tech debt)
- W4-2 — Panic guard onay UI (Layer 3 synergy) (completed with tech debt)
- W5-2 — OSS GA docs review ★ BETA LAUNCH (completed with tech debt)
- W5-3 — auto_restore=true + nervous user guide kısa giriş (completed with tech debt)

_Tasks: 20 total, 12 done, 8 tech debt, 8 no-go_

## [1.0.0-beta.1-sprint179] - 2026-05-20

### Added

- W1-2 — Re-plan orphan task file cleanup
- W2-4 — Coverage hard-floor / aspirational split
- W4-10 — Outbound rate-limit (I5 tenant isolation) ★ BETA MUST
- W5-12 — Audit HMAC chain + verify CLI (I4 invariant) ★ BETA MUST

### Changed

- W0-1 — Dependency aggregate fix-aware (Bug A foundation) (completed with tech debt)
- W1-1 — Auto-debt empty-scope inheritance (completed with tech debt)
- W2-3 — DEP0190 shell:true win32-only conditional (completed with tech debt)
- W2-7 — CI-only test flakes (PID portability + mock hygiene) (completed with tech debt)
- W3-5 — Dashboard TS errors + root lint wire (completed with tech debt)
- W3-6 — doctor DECISIONS.md obsolete + 5-file cascade (completed with tech debt)
- W4-8 — Prompt guard (I1 + I2 invariants) ★ BETA MUST (completed with tech debt)
- W4-9 — Command guard (I3 default-deny remote) ★ BETA MUST (completed with tech debt)
- W5-11 — mTLS hook (AuthProvider interface) ★ BETA MUST (completed with tech debt)

_Tasks: 17 total, 17 done, 9 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint178] - 2026-05-20

### Added

- 178-001 — Node 24/26 test assertion sweep
- 178-002 — Doc updates (Node 24/26 yayılma)
- 178-003 — Tmux backend code removal
- 178-005 — TOPP B+C continuous-dispatch ★ MUST

### Fixed

- Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented
- 178-004 — CI flake fix (PID portability + mock hygiene)

_Tasks: 11 total, 9 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint177] - 2026-05-20

### Added

- 177-001 — Worker rollback: git-stash snapshot-on-spawn
- 177-004 — Config template-regen guard + restore docs
- 177-005 — nervous_system directives_protection baseline-update hook

### Changed

- 177-003 — Tmux backend deprecate path (completed with tech debt)

### Fixed

- 177-002 — deckent kill cascade fix

_Tasks: 7 total, 5 done, 1 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint176] - 2026-05-20

### Added

- No completed tasks

_Tasks: 25 total, 0 done, 0 tech debt, 25 no-go_

## [1.0.0-beta.1-sprint175] - 2026-05-19

### Added

- W0.1 — Runtime deps (node-pty + ws)
- W0.2 — ADR-010 amendment ext + ADR-062
- W0.3 — TerminalConfig → DeckentConfig
- W0.4 — Shared terminal types
- W1.1 — AuthProvider (bypass-independent)
- W1.3 — TerminalAudit (tenant-scoped DB)
- W2.1 — WS gateway (auth-before-bridge + reattach)
- W2.3 — serve CLI surface
- W3.1 — xterm deps + terminal-api
- W3.2 — useTerminalSocket

### Changed

- W4.3 — Final verification (completed with tech debt)

_Tasks: 37 total, 21 done, 2 tech debt, 16 no-go_

## [1.0.0-beta.1-sprint174] - 2026-05-18

### Added

- Pitch deck — marketing-ai-pitch.md (15 slide)
- Canva template map — canva-kit/canva-bulk-template-map.md
- Canva bulk CSV — canva-kit/canva-bulk-sample.csv
- Aylık üretim rehberi — canva-kit/monthly-brand-report-howto.md
- Kit index + tutarlılık — canva-kit/README.md

_Tasks: 7 total, 5 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint173] - 2026-05-18

### Added

- Slide 1 — Cover
- Slide 2 — The Problem
- Slide 3 — What is Deckent (Synthesis)
- Slide 4 — Core Roles
- Slide 5 — Sprint Lifecycle
- Slide 6 — DIRECTIVES-Driven Planning
- Slide 7 — Task Routing
- Slide 8 — 15 Built-in Agents
- Slide 9 — 21 Built-in Skills
- Slide 10 — Multi-Provider & ModelRegistry

### Fixed

- Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp

_Tasks: 22 total, 22 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint172] - 2026-05-18

### Added

- A1 — dependency_pipeline_enabled provenance drift
- A2 — RBAC + verify-gate enforcement honesty
- A3 — ADR-010 amendment (7 runtime dep)
- A4 — README 5-drift badge gerçek değer
- B3 — kök → docs/ taşıma + redirect
- B4 — worker-guide 3→1 + ADR-046 dup merge + reference rename

_Tasks: 17 total, 6 done, 0 tech debt, 11 no-go_

## [1.0.0-beta.1-sprint171] - 2026-05-15

### Added

- orchestra Lifecycle Audit
- orchestra Routing + Evaluation Audit
- orchestra Infra Audit
- core Types + Config Audit
- core Memory Subsystem Audit
- core Pools + Routing Audit
- agents Audit
- nervous Audit
- monitor + connectors Audit
- providers + api Audit

_Tasks: 31 total, 29 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint170] - 2026-05-15

### Added

- P0-5 Docker Spawn Race Window Closure

### Changed

- P0-3 Tmux Prompt Filename TaskId-Aware (completed with tech debt)

_Tasks: 6 total, 4 done, 2 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint169] - 2026-05-14

### Added

- H2 Stub Memory Entries Backfill
- H3 OSS Pre-Flip Secret Scan Baseline

### Changed

- W3.2 Smoke Directive Dependency Parser Fix (completed with tech debt)
- C1 Memory Relations Migration (completed with tech debt)
- H4 Dashboard Build CI Gate (completed with tech debt)
- C2 Bug Z3 Memory Rebuild Safety (completed with tech debt)
- H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook (completed with tech debt)
- H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix (completed with tech debt)

_Tasks: 25 total, 24 done, 12 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint168] - 2026-05-14

### Added

- No completed tasks

_Tasks: 4 total, 2 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint167] - 2026-05-16

### Added

- T3 — ADR Compliance + Status Audit
- T4 — Memory.db + Data Integrity Audit
- T6 — Test + Build + Security + OSS Readiness Audit
- T7 — Cross-Cutting Synthesis (Wave 2, T1-T6 dependent)
- Sprint 167 T1 — Code Inventory + Dead Code + Unused Features Audit. READ-ONLY au
- Sprint 167 T2 — Doc Inventory + Reference Validation + Ground-Truth Audit. READ-
- Sprint 167 T7 RETRY — Cross-Cutting Synthesis with T1+T2 included. READ-ONLY met

### Changed

- T1 — Code Inventory + Dead Code + Unused Features Audit (completed with tech debt)

_Tasks: 10 total, 9 done, 2 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint166] - 2026-05-14

### Added

- No completed tasks

_Tasks: 11 total, 11 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint165] - 2026-05-13

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint164] - 2026-05-13

### Added

- ADR-045 — Wave-Based Execution Semantics Contract (E3)
- Gitignore Housekeeping — Runtime Artifact Patterns
- respawnEligibleTasks Runtime Wire + task.status Inline Sync — Composite (E1+E2)
- Integration Test Suite — Sprint 161 Forensic Replay + Multi-Wave Coverage (E-tests)

### Fixed

- Fix debt: Tech debt from 156-011-fix: Code physically verified despite missing .result (Sp

_Tasks: 6 total, 5 done, 0 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint163] - 2026-05-12

### Added

- Brain Spurious NO_GO Reconciliation Wire Restore (B1)
- Docker container_start_failed Health Check + Retry Policy (B2)
- ADR-043 — Brain Crash Recovery Protocol (A1)
- ADR-044 — Sprint State Observability Contract (A2)
- Sprint 160 Security Review 3/3 (A3)
- Brain Dogfood Smoke — Sprint 163 Self-Validation (C1)

_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint162] - 2026-05-12

### Added

- State Recovery on Brain Restart (T-004)

### Changed

- Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite) (completed with tech debt)

_Tasks: 4 total, 2 done, 1 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint161] - 2026-05-13

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint160] - 2026-05-13

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint159] - 2026-05-13

### Changed

- EvaluationAuditTrail Foundation (completed with tech debt)
- Dual-Evaluator Race Close (Bug X) (completed with tech debt)

_Tasks: 15 total, 2 done, 2 tech debt, 13 no-go_

## [1.0.0-beta.1-sprint158] - 2026-05-13

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint157] - 2026-05-13

### Added

- No completed tasks

_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_
