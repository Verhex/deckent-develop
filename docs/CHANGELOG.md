# Changelog

> **This file has been consolidated.** The canonical changelog is at the project root: [CHANGELOG.md](../CHANGELOG.md).

## [1.0.0-beta.1-sprint284] - 2026-06-12

### Added

- Canlı-olay köprüsü — hb + event-stream → /api/events typed-push
- Dashboard client anlık-merge — snapshot üstüne event-akışı
- Worker-log SSE endpoint — backend-agnostik file-tail
- WorkersPage canlı log-paneli UI

### Fixed

- DASH-FIX-1 — terminal-sessions 401 + directives 404


_Tasks: 8 total, 6 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint283] - 2026-06-12

### Added

- DebtPage route + /settings yüzeyi (eski 282-009)
- Dashboard sayfa-içi i18n-temizliği (eski 282-012)

### Fixed

- Terminal-bar overlap — z-index/layout fix (eski 282-007)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint282] - 2026-06-11

### Added

- Chat stream-boşluğu kök-teşhis — EventSource-auth mu, serve-içi CLI-spawn mı?
- chat-backend.ts disposition — API-W2

### Changed

- POST /api/chat adapter-backed — classifier yalnız açık-komutlara (completed with tech debt)
- Stream-yolu kök-fix — teşhise göre auth/spawn onarımı (completed with tech debt)
- Stale sprint-state — finalize terminal-snapshot + /api/status reconcile (completed with tech debt)
- Nav tek-kaynak — Layout↔Sidebar birleştir, Workers/Directives erişilir (completed with tech debt)
- Alert-dedup — auditor staleness-uyarısı tek-satır (completed with tech debt)

### Fixed

- ChatPage stream-hata dürüstlüğü — onError yutma + POST-yarışı fix


_Tasks: 13 total, 10 done, 5 tech debt, 3 no-go_

## [1.0.0-beta.1-sprint281] - 2026-06-11

### Added

- Mimari & Eşzamanlılık Doğruluğu Denetimi
- Adversarial Kırmızı-Takım — Tasarımı Kır
- Ürün & User/Enterprise Perspektifi Denetimi


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint280] - 2026-06-11

### Added

- PLANOBS-001 — event-stream PROGRESS channel + emitProgress helper
- PLANOBS-002 — notify 'progress' + 'phase-change' event-tipleri (3 surface)
- APPROVE-007b — modifiedPayload IPC transport + executor consume (OPUS)
- PLANOBS-004 — planner-fail notify + plan spinner
- APPROVE-007b — REPL /nervous edit (chat-nervous-bridge handleEdit)

### Changed

- REPL /mcp broker wire — G1 (mcp-bridge → chat-native) (OPUS, Tier-1) (completed with tech debt)
- PLANOBS-001 emit-site'ları — EXECUTE-% + spawn + pre-vitest (completed with tech debt)


_Tasks: 10 total, 7 done, 2 tech debt, 3 no-go_

## [1.0.0-beta.1-sprint279] - 2026-06-10

### Added

- WK-import — core→orchestra import-cycle çöz (ADR-008) (OPUS)
- WK-cost — mid-sprint token-usage abort (limit-ledger besleme)
- WK-7 — auditor async-batch liveness (O(n) spawnSync → parallel)
- DASH-001 — /api/kill/all + autonomous SSE watch
- DASH-002 — sidebar bell pending-count badge (lucide, emoji-yasak)
- WK-5-kalan — docker live-monitor: output-stream PTY worker-attach + watch --follow
- F7-ENT-verify — enterprise dashboard backend doğrula + 4 tab gerçek-veri
- WK-5/COMM-1 dashboard görünürlük — Worker Comms + Resources panel
- features + cli-commands — M-küme satırları
- MASTER-PLAN — M-küme işaretleri

### Changed

- WK-nervous — panic-gate timeout wire (0-caller → spawn yolu) (completed with tech debt)


_Tasks: 11 total, 11 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint278] - 2026-06-10

### Added

- worker_comms config + .result sharedNotes/messages şeması
- worker→shared yazım köprüsü — .result sharedNotes → SharedMemory
- worker prompt talimatı — sharedNotes/handoffNotes nasıl yazılır
- multi-agent.ts disposition — runPipeline 0-caller (ADR-038)
- worker-comms görünürlük — CLI durum + shared/handoff listesi
- e2e comms akışı — iki-worker shared+handoff round-trip smoke
- api-surface + config-reference — worker_comms + sharedNotes
- features + MASTER-PLAN — COMM-1 işaretleri

### Changed

- shared→worker okuma — spawn-time SharedMemory prompt enjeksiyonu (OPUS) (completed with tech debt)
- handoff→downstream worker prompt enjeksiyonu (OPUS) (completed with tech debt)
- structured handoff-notes — upstream worker'dan downstream'e mesaj (completed with tech debt)


_Tasks: 11 total, 11 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint277] - 2026-06-10

### Added

- /api/auth/me whoami endpoint — bearer'dan kimlik + rol
- useAuth hook/context — dashboard auth-state SSOT
- AuthStatus komponenti — "kim giriş yaptı" + logout
- ManualTokenInput — api_oidc modunda JWT test girişi
- OIDC redirect-flow çekirdeği — PKCE + authorize-URL + state (OPUS)
- OIDC token-exchange backend endpoint — code→token (OPUS)
- dashboard wire — Provider + AuthStatus + Login/Callback rotaları
- EnterprisePage "BENİM rolüm" bağlamı
- api_oidc test smoke — gerçek-binary serve + JWT-bearer dashboard yolu
- config-reference + api-surface — dashboard_oidc + auth/me + crossVerify-komşu

### Fixed

- audit-actor JWT sub'dan türetme — hardcoded 'local' fix


_Tasks: 14 total, 14 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint276] - 2026-06-10

### Added

- directive-interrogator çekirdeği — zorlayıcı soru üretimi + taslak öneri
- interrogation config + i18n soru sözlüğü
- deckent plan --interrogate CLI wire
- cross-verify çekirdeği — high-stakes tespit + farklı-provider seçimi
- cross_verify config bloğu (default-off)
- adversarial-refute prompt builder
- cross-verify dispatch + eval advisory-wire (OPUS)
- cross-verify outcome-tracker beslemesi — öğrenilen verifier eşleşmeleri
- REPL /interrogate slash — pre-plan sorgulamaya REPL erişimi
- api-surface + config-reference — yeni alanlar


_Tasks: 12 total, 12 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint275] - 2026-06-10

### Added

- /usage REPL slash — üç katman birden
- /resources REPL slash — üç katman birden
- deckent_usage MCP tool — ADR-022 parite
- 273-010 debt kapanışı — kalan "full test suite" eşleşmeleri denetimi
- cli-commands + features — usage/resources slash + MCP satırları
- mcp-tools.md regen — 34 tool
- resource-profile — F1-TOK optimizasyon bölümü iskeleti
- MASTER-PLAN — F1-TOK durum konsolidasyonu


_Tasks: 8 total, 8 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint274] - 2026-06-10

### Added

- cache_warm config bloğu
- cache-warm spawn stratejisi — ilk worker yazar, fleet okur (OPUS)
- ledger cache-gate — sprint'in 2.+ worker'ları cache okuyor mu?
- retro limit-satırı genişletmesi — hit-rate + warm-share
- docs — cache_warm + adr_render + usage cache-gate
- MASTER-PLAN — F1-TOK Faz 2 işaretleri


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint273] - 2026-06-10

### Added

- limit-ledger çekirdeği — transcript parse + maliyet-eşdeğeri birim
- ledger session→task eşleme + sprint agregasyonu
- `deckent usage` CLI — pencere + sprint görünümü
- sprint-reporter "limit-yakım" satırı — retro entegrasyonu
- result-evaluator tokenUsage hizalaması — beyan artık zorunlu değil
- prompt-determinizm guard testi
- prompt-template revizyonu — Skills-first blok sırası + tokenUsage metni (OPUS)
- persona/skill "full test suite" envanteri + targeted-verify hizalaması
- ADR seçici — açık `ADR-NNN` referansı topN'e zorla dahil
- ADR render dedupe + operative-extract (opt-in, default-off)

### Fixed

- .gitignore sprint-runtime artıkları — git-status prefix stabilizasyonu
- goCriteria şablonu — full-suite çelişkisi + Kanıt-interpolasyon fix'i


_Tasks: 13 total, 13 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint272] - 2026-06-10

### Added

- dispatch-kuyruğu/EVALUATE yarışı — koşmamış task varken değerlendirme başlamaz
- exit-without-result kökü (a) — docker wrapper son-şans + zengin marker
- F1-LIM faz-2a — task-tipine göre memory limiti (kod 1.5g / doc 768m önerisi)
- docs — resource-profile kind-limit bölümü + config/features satırları
- MASTER-PLAN işaretleri — 272 kapananlar

### Fixed

- GHOST-FINALIZE fix — checkpoint artığı temizliği + start'ın dürüst davranışı
- exit-without-result kökü (b) — eval'de workPresent → verify-and-complete FIX yolu
- F1-LIM faz-2b — provider-limit tespit modülü + FIX ölü-limit guard'ı


_Tasks: 8 total, 8 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint271] - 2026-06-10

### Added

- resource-monitor çekirdeği — docker stats örnekleyici → JSONL
- resource_monitor config bloğu
- resource-log analiz fonksiyonları — per-task peak/avg
- `deckent resources` CLI — anlık snapshot + log özeti
- resource-profile referansı — kod-türevli kaynak haritası
- pack diyeti — 4.8MB → eşik altı
- link lint — 17 kırık link
- manifest F3-009 pre-existing test çifti
- crash-hardening — .spawnlock bayat-kilit temizliği kurtarma araçlarında
- features + cli-commands — resources/resource_monitor satırları

### Changed

- sprint-yaşamdöngüsü wire — opt-in izleme SPAWN→CLEANUP (completed with tech debt)
- doctor "Worker Resources" satırı — limit görünürlüğü + tavan uyarısı (completed with tech debt)


_Tasks: 14 total, 13 done, 2 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint270] - 2026-06-10

### Added

- validate-publish güçlendirme — exec-bit + dashboard-bundle assertion'ları
- npm pack hermetik smoke — paketten kurulan deckent gerçekten açılıyor
- README quickstart — 3-komut kurulum çıtası
- dev/tsc exec-bit kaybı kökü — watch yolunda da +x garantisi
- PSL-6 doctor auth-probe — CLI var ≠ login; gerçek oturum durumu
- doctor wire — auth-probe satırları ("CLI var ama login DEĞİL" görünür)
- F1-IMG part 1 — worker-image readiness denetim modülü
- F1-IMG part 2 — doctor satırı + consent-based rebuild önerisi (ADR-063)
- docs/reference/multi-provider.md — kod-gerçeği rewrite (W-K #8a)
- docs/guide/multi-provider.md — rehber senkronu (W-K #8b)


_Tasks: 20 total, 20 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint269] - 2026-06-10

### Added

- Dashboard SPA-fallback token-inject — alt-sayfa refresh'i artık 401'e düşmüyor (P0)
- Enterprise sayfası canlı: `/api/enterprise/{tenants,rbac,audit,rate}` endpoint'leri
- WorkersPage + DirectivesPage rotaları; Nervous sayfası SSE; kanonik API-client birleştirmesi
- Dashboard chat-stream adapter wiring (gerçek SSE streaming)
- REPL: `/autonomous` `/audit` `/directives` slash'leri + i18n hardcode temizliği
- MCP parite: `deckent_run` modelEffort/timeoutMs/keep; `deckent_audit` query/compliance/retention action'ları

### Changed

- Doc-drift kapatma — kod-türevli drift testi + features 268 satırları

_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go (ilk koşu Anthropic usage-limit kesintisi yedi; CC retry ile tamamlandı)_

## [1.0.0-beta.1-sprint268] - 2026-06-10

### Added

- SPAWN-LIFECYCLE — modelEffort pass-through + completion status finalize
- JWKS async AuthProvider seam — terminal auth RS256/JWKS canlı
- Dynamics 365 OData read-only ErpDriver
- Enterprise-depth reference — api_oidc + JWKS-seam + Dynamics ekleri

### Fixed

- RESUME-RACE fix — resume respawn'dan önce bayat worker-artifact reset
- FINALIZE fix üçlüsü — recount + archive-blind + orphan-state


_Tasks: 7 total, 7 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint267] - 2026-06-10

### Added

- HTTP API bearer middleware — statik-key OIDC JWT uzantısı (`api_oidc`, default-off; statik token yolu bit-bit korunur)
- SAP OData read-only ErpDriver (`createSapErpDriver` — ikinci somut ERP driver'ı, v2/v4 zarf desteği, secret-redaction)
- CLI commands reference — retention + syslog + forward önceliği
- Config reference — `api_oidc` bloğu (koddan birebir)
- Enterprise integrations — Odoo/retention/archive-aware compliance ekleri
- Features reference — 266/267 satırları (Odoo driver, audit-retention, syslog, FlowBacklogBridge)

_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go (gece crash sonrası CC manuel kurtarma ile tamamlandı)_

## [1.0.0-beta.1-sprint266] - 2026-06-09

### Added

- Odoo read-only ErpDriver (JSON-RPC search_read)
- audit CLI tamamlama — syslog forward wire + retention subcommand
- Enterprise integrations reference — sprint-265 çıktıları
- Enterprise depth — JWKS/OIDC/transport ekleri
- Autonomous operations — forward --url/--syslog ekleri


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint265] - 2026-06-09

### Added

- ERP capability wake — erp.read handler + runtime wiring + referans driver
- SIEM HTTP transport + `audit forward --url` canlı wire
- SIEM syslog transport (RFC5424, injectable socket)
- JWKS fetch + RS256 key resolver
- Embedded-terminal OidcAuthProvider (spec §1d rezerve slot)
- features.md sahte auto-gen başlığı düzelt (Sprint 264 worker bulgusu)


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint264] - 2026-06-09

### Added

- Autonomous engine internals doc — yeni dispatch yolları
- Autonomous user guide — backlog add yeni yüzeyleri
- Autonomous operations guide — governance + audit ops
- Enterprise depth reference — read-side + enforcement
- Config reference — yeni anahtarlar
- CLI commands reference — audit + backlog yeni flag'ler
- Features reference — yeni yetenek satırları
- Feature matrix guide — satır güncellemeleri
- Event channels reference — capability audit aksiyonları
- API surface contract — autonomous backlog formatı

### Fixed

- Init-test kümesi gerçek fix — readline-mock timeout


_Tasks: 12 total, 12 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint263] - 2026-06-09

### Added

- Architecture & Module Inventory Analysis
- Enterprise & Autonomous Capability Maturity Analysis
- Test & Quality Posture Analysis


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint262] - 2026-06-09

### Added

- ENT-5a — OIDC/JWT verification (SSO foundation)
- ENT-5a2 — SSO session store
- ENT-5b — SIEM event forwarder
- ENT-5c — compliance report generator
- ENT-3 — audit log retention & rotation policy
- ERP-1 — read-only ERP/DB connector capability
- actor data-plumbing — carry ActorContext onto the Task (seam, not enforcement)
- AUT-9 — work-generator trigger source (composable, not auto-wired)
- capability-audit bridge — emit an audit event per capability invocation
- Hygiene — green deterministic stale test assertions

### Changed

- Doc — Enterprise Integrations reference (SSO/SIEM/compliance/ERP) (completed with tech debt)

### Fixed

- AUT-4 fix — full 5-field cron in CORE (close the live latent bug)


_Tasks: 13 total, 12 done, 1 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint261] - 2026-06-09

### Added

- F10-001 — unified policy engine (compose RBAC + activation + condition)
- ENT-1 / ADR-037 V2 — `authorizeExecution(req)` bridge in the authority matrix
- ENT-3 — tamper-evident audit hash-chain (additive field)
- ENT-2 — strict tenant isolation flag (omit NULL-tenant leak)
- F8-002 — multi-backend capability selection (availability/priority)
- AUT-5 — recurring backlog re-enqueue (true cron cadence)
- AUT-7 — wire the ExecutionPool into the dispatcher (bounded concurrency)
- AUT-1 — actually drive the nervous observer in the autonomous loop
- AUT-9 — proactive work-generator (backlog candidate generation)
- AUT cleanup — consolidate the duplicate scheduled-flow cron evaluator

### Changed

- Doc — Enterprise-Depth reference (enforcement + secret vault + capability handlers) (completed with tech debt)


_Tasks: 17 total, 14 done, 1 tech debt, 3 no-go_

## [1.0.0-beta.1-sprint260] - 2026-06-09

### Added

- ENT-1 — actor.role → worker authority (ADR-037 V2 step)
- ENT-2 — tenantId threading (replace hardcoded 'local')
- ENT-3 — correlationId / causationId audit lineage
- WM-6 / F10-002 — riskClass → risk-gated approval
- budget → pre-spawn cost-gate enforcement
- F8-001 — capability.invoke abstraction (capabilityTarget consumer)
- AUT-4 — nextRun() full cron evaluation
- AUT-6 — backlog done/failed purge + autonomous artifact cleanup
- AUT-8 — deckent_autonomous* MCP tool parity
- AUT-1 — drive the nervous observer inside `autonomous start`

### Changed

- Doc — Enterprise Foundation reference (consume-the-contract) (completed with tech debt)


_Tasks: 17 total, 17 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint259] - 2026-06-09

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint258] - 2026-06-09

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint257] - 2026-06-09

### Added

- CODE-FULLSUITE-NOGO — worker self-verify must be TARGETED, not full-suite
- GEMINI-LOGIN-HANG (real) — fail fast on interactive login / 429, don't hang


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint256] - 2026-06-09

### Added

- GEMINI-LOGIN-HANG — gemini worker must fail-fast, never hang on interactive login

### Changed

- PLAN-SCOPE-1 — planner must NOT pull description-mentioned file paths into scope.filesWrite (completed with tech debt)


_Tasks: 2 total, 2 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint255] - 2026-06-09

### Added

- DOC-1 — ExecutionRequest contract reference (WM-1)
- DOC-2 — Stack-aware criteria & routing (WM-7)
- DOC-3 — Positioning: agentic-OS + agentic-run ecosystem


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint254] - 2026-06-09

### Added

- V-002 — claude docker + reasoning-effort (F1-RE)

### Changed

- V-001 — codex docker + reasoning-effort (MF-8 + F1-RE) (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 249-009-fix: Created/updated docs/guide/architecture-overview.md 


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint253] - 2026-06-09

### Added

- 253-001 — codex IN docker
- 253-002 — gemini IN docker


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint252] - 2026-06-09

### Added

- 253-001 — codex IN docker
- 253-002 — gemini IN docker


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint251] - 2026-06-09

### Added

- 251-001 — event channels reference (code-derived)
- 251-002 — recover a stuck sprint (cookbook)
- 251-003 — evolution & learning (guide)
- 251-004 — feature matrix (redo; codex)
- 251-005 — cost & budget (cookbook; codex)
- 251-008 — checkpoints & approval (cookbook; gemini)

### Changed

- 251-007 — cookbook index (gemini) (completed with tech debt)
- 251-010 — nervous alerts (cookbook; ollama, small) (completed with tech debt)


_Tasks: 13 total, 11 done, 2 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint250] - 2026-06-09

### Added

- 250-V1 — claude verify
- 250-V3 — gemini verify

### Changed

- 250-V4 — ollama verify (completed with tech debt)


_Tasks: 4 total, 3 done, 1 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint249] - 2026-06-09

### Added

- 249-001 — benchmark/memory-v2 (verify the 96% claim)
- 249-002 — lifecycle + API-surface diagrams
- 249-005 — provider-parity fleet regression test
- 249-011 — cookbook: autonomous mode

### Changed

- 249-006 — why-deckent comparison (factual) (completed with tech debt)
- 249-009 — architecture overview (EN) (completed with tech debt)
- 249-010 — cookbook: memory recall (completed with tech debt)
- 249-012 — getting-started (EN) (completed with tech debt)
- 249-014 — glossary (ollama, small) (completed with tech debt)
- 249-015 — cookbook: status & watch (ollama, small) (completed with tech debt)


_Tasks: 21 total, 11 done, 7 tech debt, 10 no-go_

## [1.0.0-beta.1-sprint248] - 2026-06-09

### Added

- 248-002 — gemini worker gate

### Changed

- 248-001 — codex worker gate (completed with tech debt)


_Tasks: 2 total, 2 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint247] - 2026-06-08

### Added

- 247-001 — docs/adr-index.md


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint246] - 2026-06-08

### Added

- 246-001 — docs/security/threat-model.md


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint245] - 2026-06-08

### Added

- 245-001 — .codex + .gemini rules → .claude parity


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint244] - 2026-06-08

### Added

- 243-001 — multi-provider docs kod-gerçeğine hizala


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint243] - 2026-06-08

### Added

- No completed tasks


_Tasks: 2 total, 0 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint242] - 2026-06-08

### Added

- 242-001 — MCP-run provider-free + autonomous agent/skill inject


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint241] - 2026-06-08

### Added

- 241-001 — decidePolicy'ye computed EffectClass wire


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint240] - 2026-06-08

### Added

- 240-001 — task-router + adr-selector canonical-consume (fallback korunur)


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint239] - 2026-06-08

### Added

- 239-001 — rubric-registry + task-builder canonical TaskKind migration


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint238] - 2026-06-08

### Added

- 238-001 — Canonical work-model SSOT modülü (additive)


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint237] - 2026-06-06

### Added

- 236-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu

### Changed

- 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu (completed with tech debt)


_Tasks: 2 total, 2 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint236] - 2026-06-06

### Added

- 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu
- 236-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint235] - 2026-06-06

### Added

- 235-001 — [P0] Per-task ollama provider+model plan-time acceptance


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint234] - 2026-06-06

### Added

- 234-001 — [P0] Per-provider host-adapter spawn routing (ollama docker'a düşmesin)
- 234-002 — [P1] entry .result tamlığı (linesAdded/Removed + tokenUsage)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint233] - 2026-06-06

### Added

- 233-001 — [Wave 1] Core agentic worker runner + tool şemaları + scope-guard
- 233-002 — [Wave 2 · depends 233-001] Subprocess entry + OllamaAdapter wiring + dinamik model kabul


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint232] - 2026-06-05

### Added

- 232-001 — [P0] decay_after_sprints config wire (PRIMARY kök)
- 232-002 — [P0] learnings decay-exempt (memory/retro/sprint/pattern)
- 232-003 — [P1] abort >= operatörü + WAL-safe deckent memory backup CLI
- 232-004 — [P1] ci-sim SIGINT/SIGTERM restore handler (GAP A)
- 232-005 — [P1] writeGuardedExports dbCount===0 disk-protect (GAP B)


_Tasks: 7 total, 7 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint231] - 2026-06-05

### Added

- 231-001 — [P0] exit-0-no-result uniform disk-verify (FALSE NO_GO kökü)
- 231-002 — debt.md export-wipe guard (asimetri kapat)
- 231-004 — [forward] HandoffProtocol recovery wiring (failHandoff + listHandoffs)

### Fixed

- 231-003 — decay catastrophic-abort küçük-DB bypass fix


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint230] - 2026-06-05

### Added

- 230-001 — Windows-native backend (win32 → subprocess, POSIX-sleep → Node timer)
- 230-002 — [P0] ⭐ models.dev native wire (PROVIDER_MODEL_MAP statik → dinamik)
- 230-003 — ecosystem-intelligence → routing-engine tüketimi
- 230-004 — self-modifying-detector enforcement (user-project flag-gated)
- 230-005 — Ölü/orphan disposition (ADR-038): multi-agent.ts + decision-replay.ts
- 230-006 — Worker-koordinasyon lifecycle wire (handoff + heartbeat-daemon → sprint-controller)
- 230-007 — shared-memory wire (worker↔worker, read-mostly)


_Tasks: 10 total, 8 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint229] - 2026-06-04

### Added

- 229-001 — McpClientBroker çekirdek (SDK Client + stdio/HTTP transport)
- 229-002 — 3-scope config (.mcp.json project/user/local merge)
- 229-003 — Dynamic discovery + namespaced tool registry
- 229-004 — [Tier-1] `deckent mcp` yönetim CLI (add/list/remove/get)
- 229-005 — [Tier-1] REPL `/mcp` dispatch + confirm-gate + audit composition


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint228] - 2026-06-04

### Added

- 228-001 — [P0] autonomous CLI i18n retrofit (hardcode → getMessage)
- 228-002 — features-manifest entry (sync-manifest.mjs → regenerate)
- 228-003 — Autonomous usage doc (TR/EN, güvenlik modeli dahil)
- 228-004 — Autonomous e2e smoke harness (gerçek-binary start→status→stop)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint227] - 2026-06-04

### Added

- 227-002 — [P0] Export-wipe guard (dolu .md'yi boşla EZME)
- 227-003 — [P0] Decay safety (decay_after_sprints'e uy, collapse ETME)

### Fixed

- 227-001 — Rubric total diagnostic fix (coverage:null → renormalize)
- 227-004 — Brain-integrity regression e2e (3 bug birlikte)


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint226] - 2026-06-04

### Added

- 226-001 — Authority adapter (checkAuthority → AuthorityChecker)
- 226-002 — Audit adapter (writeEvent → AuditSink)
- 226-003 — Approval gate adapter (nervous Executor → ApprovalGate, OTO-APPROVE YOK)
- 226-004 — Action executor adapter (ActionHandler registry → ActionExecutor)
- 226-005 — Trigger source adapter (scheduled-flow + self-dispatch → TriggerSource)
- 226-006 — [P0] Sürekli loop + composition root (DORMANT'I ÖLDÜRÜR)
- 226-007 — [P0] `deckent autonomous` CLI (start/stop/status, Tier-1 user-surface)


_Tasks: 7 total, 7 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint225] - 2026-06-03

### Added

- FX-01 — Genel Bakış + Mimari
- FX-02 — Sprint Yaşam Döngüsü + Task Routing
- FX-03 — Model Registry/Multi-Provider + Memory V2
- FX-04 — Agents + Skills
- FX-05 — Spawn Backend'ler + Dependency Waves
- FX-06 — Result Evaluation + Auditor/RBAC
- FX-07 — Event-Stream/Observability + Native REPL
- FX-08 — Dashboard + MCP Entegrasyonu
- FX-09 — CLI Komutları + Evolution Pipeline
- FX-10 — Nervous System (roadmap) + Vizyon/Yol Haritası


_Tasks: 12 total, 12 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint224] - 2026-06-02

### Added

- 224-008 — [P0] `/nervous` slash wire (kurtarılan bridge → chat-native caller)
- 224-009 — Banner wire (kurtarılan chat-banner → entry.ts REPL açılış)
- 224-010 — Nervous güvenli re-enable + A/B (panic-gate non-blocking main'de)
- 224-027 — Smoke harness'lar (agentic-DO + REPL run-proven, scripts/)
- 224-012 — ADR-086 (Native CLI Parity) + MASTER-PLAN §10 güncel

### Changed

- 224-015 — [P0] AI plan-mode fix (dürüst hata + gerçekten-çalışır) (completed with tech debt)


_Tasks: 6 total, 6 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint222] - 2026-06-02


### Changed

- 222-001 — [P0] Persistent claude session (per-turn cold-start 4.5s → reuse <1s) (completed with tech debt)
- 222-002 — Gerçek token-token streaming (claude --print toplu → incremental akış) (completed with tech debt)
- 222-003 — Spinner/progress feedback (yanıt beklerken görsel, donma hissi bitsin) (completed with tech debt)
- 222-004 — Markdown + renk render (claude-code gibi zengin output) (completed with tech debt)
- 222-005 — slash-registry REPL'e GERÇEK-wire (/help anında, 221-003 hollow fix) (completed with tech debt)
- 222-006 — status-line REPL'e GERÇEK-bas (221-004 hollow fix) (completed with tech debt)
- 222-007 — agentic-dispatch + enterprise-bridge runtime-wire (221-002/008 hollow fix) (completed with tech debt)
- 222-012 — README + blueprint güncel (hızlı native REPL + nervous-canlı) (completed with tech debt)


_Tasks: 13 total, 8 done, 8 tech debt, 5 no-go_

## [1.0.0-beta.1-sprint221] - 2026-06-02

### Added

- 221-001 — [P0] runChatNativeLoop → handleReplCommand canlı slash-wire
- 221-002 — [P0] runChatNativeLoop → agentic dispatch canlı-wire (220-004 carry, doğal dil→aksiyon)
- 221-003 — Canlı slash-registry (/help /status /recall /plan dinamik, hard-code değil) + sade liste
- 221-004 — REPL status-line (provider/sprint/dizin) + özelleştirilebilir (config-driven)
- 221-005 — [P0] Provider-resolve genişlet: ollama-local + openai-compat REPL round-trip (zero-API)
- 221-006 — Provider-parity test matrisi (5 provider REPL round-trip eşitliği)
- 221-007 — Provider fallback chain + yoklukta net hata (skeleton-yasak)
- 221-008 — REPL'den enterprise komut köprüsü (/audit /rbac /flow /cost → mevcut CLI)
- 221-009 — User/Enterprise mod (sade-default, enterprise opt-in, config-driven)
- 221-010 — Özelleştirilebilir chat config (schema + default) — provider/mod/status-line/slash

### Fixed

- 221-013 — [P0] CLI kurulum/komut-çıktı fix (`deckent`/`npx deckent serve` terminalde sessiz → çalışsın)
- 221-014 — Smoke-219-016 hotfix (plannerTaskToParams smoke-field gate'e geçsin)
- 221-017 — AI planner subscription-spawn fix + sessiz-fallback → AÇIK uyarı (dürüstlük)


_Tasks: 17 total, 17 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint220] - 2026-06-02

### Added

- 220-001 — [P0] Native REPL gerçek provider-wire (config-driven: chat_provider→brain_provider→claude)
- 220-002 — `chat --native` flag + --message/--once gerçek round-trip
- 220-004 — Canlı worker grid (sabit-6 değil, real-time SSE)
- 220-005 — Status sayfası gerçek-zaman (done işler "done" görünsün)
- 220-006 — Refresh + cooldown (user-tetikli güncelleme)
- 220-007 — Evolution/ADR-timeline veri + ChatPage gerçek-wire
- 220-009 — Tech-debt sayfası filtre (sprint/severity/status)
- 220-010 — Enterprise sayfa auth-wire + alerts dedup (provider-neutral tek-uyarı)
- 220-011 — Nervous bootstrap + config enable (dormant→aktif)
- 220-012 — Nervous action-handlers (MVP 8 low-risk) + smoke

### Changed

- 220-003 — Agentic REPL canlı MCP dispatch (doğal dil→gerçek aksiyon) (completed with tech debt)

### Fixed

- Fix debt: Sprint sprint-217 rollback SUCCESS
- 220-008 — Config brain-budget fix + coverage takip (history)


_Tasks: 18 total, 18 done, 1 tech debt, 0 no-go_

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
