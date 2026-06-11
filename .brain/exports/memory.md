# Sprint Learnings (auto-generated)

## Sprint sprint-282 Learnings
- Sprint sprint-282 Learnings: ## Sprint sprint-282 Learnings
- POST /api/chat adapter-backed — classifier yalnız açık-komutlara: GO_WITH_TECH_DEBT — POST /api/chat is now adapter-backed (DASH-UX-1 part-1). resolveChatReply() in chat-handler.ts routes NL messages to the
- Stream-yolu kök-fix — teşhise göre auth/spawn onarımı: GO_WITH_TECH_DEBT — Stream-path ROOT-FIX (DASH-UX-1, the auth root from 282-001). Root = src/api/server.ts:1179 auth-gate built queryTokenPa
- Stale sprint-state — finalize terminal-snapshot + /api/status reconcile: GO_WITH_TECH_DEBT — DASH-UX-2 fix implemented in two layers:

1. sprint-finalizer.ts — Step 16 added: writeTerminalDashboardSnapshot() write
- Nav tek-kaynak — Layout↔Sidebar birleştir, Workers/Directives erişilir: GO_WITH_TECH_DEBT — nav-items.ts created as single source of truth for all 13 routes across 3 groups (Konuş/İzle/Yönet). Layout.tsx imports 
- Terminal-bar overlap — z-index/layout fix: NO_GO
- Alert-dedup — auditor staleness-uyarısı tek-satır: GO_WITH_TECH_DEBT — Implemented identity-based alert dedup (DASH-UX-4).

1. alert-emitter.ts: Added `DedupAlert` type alias (Alert & { lastS
- DebtPage route + /settings yüzeyi: NO_GO
- Dashboard sayfa-içi i18n-temizliği — literal-label'lar i18n-key'e: NO_GO

## Gains
- 282-001 — Chat stream-boşluğu kök-teşhis — EventSource-auth mu, serve-içi CLI-spawn mı? — ROOT-CAUSE DECOMPOSED + PROVEN.
- 282-003 — ChatPage stream-hata dürüstlüğü — onError yutma + POST-yarışı fix — All 3 goCriteria satisfied:
- 282-011 — chat-backend.ts disposition — API-W2 — Successfully removed the dormant chat-backend.ts module and all references.

## Sprint sprint-281 Learnings
- Sprint sprint-281 Learnings: ## Sprint sprint-281 Learnings

## Gains
- 281-001 — Mimari & Eşzamanlılık Doğruluğu Denetimi — Mimari & eşzamanlılık doğruluğu denetimi tamamlandı.
- 281-002 — Adversarial Kırmızı-Takım — Tasarımı Kır — Adversarial kırmızı-takım denetimi tamamlandı.
- 281-003 — Ürün & User/Enterprise Perspektifi Denetimi — Ürün & User/Enterprise perspektifi denetimi tamamlandı.

## Sprint sprint-280 Learnings
- Sprint sprint-280 Learnings: ## Sprint sprint-280 Learnings
- REPL /mcp broker wire — G1 (mcp-bridge → chat-native) (OPUS, Tier-1): GO_WITH_TECH_DEBT — G1 CLOSED — the external-MCP client (buildMcpBridge + McpClientBroker, 0-caller since Sprint 229) is now LIVE-WIRED into
- PLANOBS-001 emit-site'ları — EXECUTE-% + spawn + pre-vitest: GO_WITH_TECH_DEBT — Wired emitProgress at 2/3 required call sites in result-collector.ts:
1. SPAWN emit (line 828): after successful spawnIf
- PLANOBS-005 — start çift-planSprint kaldır + .tasks cache + start-fail notify (OPUS): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=176, untrackedFiles=
- features + cli-commands — L-küme satırları: NO_GO
- MASTER-PLAN — §4G L-küme işaretleri: NO_GO

## Gains
- 280-001 — PLANOBS-001 — event-stream PROGRESS channel + emitProgress helper — Added CHANNELS.PROGRESS = 'PROGRESS' to the CHANNELS const in src/core/event-stream.ts (line 163).
- 280-002 — PLANOBS-002 — notify 'progress' + 'phase-change' event-tipleri (3 surface) — Added 'progress' and 'phase-change' to NotificationEventName union and EVENT_PRIORITY record in n...
- 280-003 — APPROVE-007b — modifiedPayload IPC transport + executor consume (OPUS) — APPROVE-007b modifiedPayload IPC transport + executor consume.
- 280-006 — PLANOBS-004 — planner-fail notify + plan spinner — PLANOBS-004 implemented:
- 280-008 — APPROVE-007b — REPL /nervous edit (chat-nervous-bridge handleEdit) — APPROVE-007b complete.

## Sprint sprint-279 Learnings
- Sprint sprint-279 Learnings: ## Sprint sprint-279 Learnings
- WK-nervous — panic-gate timeout wire (0-caller → spawn yolu): GO_WITH_TECH_DEBT — Fixed executor.ts handleApprove: imported awaitPanicGateApproval+isLockedPanicAction from panic-gate.ts; added optional 

## Gains
- 279-001 — WK-import — core→orchestra import-cycle çöz (ADR-008) (OPUS) — WK-import / ADR-008 — core→orchestra ters bağımlılık çözüldü.
- 279-003 — WK-cost — mid-sprint token-usage abort (limit-ledger besleme) — WK-cost mid-sprint token-usage abort implemented.
- 279-004 — WK-7 — auditor async-batch liveness (O(n) spawnSync → parallel) — WK-7 async-batch liveness — CORE ENGINEERING GOAL DONE; literal Kanıt grep=0 NOT reachable in-sco...
- 279-005 — DASH-001 — /api/kill/all + autonomous SSE watch — DASH-001 complete.
- 279-006 — DASH-002 — sidebar bell pending-count badge (lucide, emoji-yasak) — Created useNervousStatus hook that polls /api/nervous/status every 30s via useLiveData.
- 279-007 — WK-5-kalan — docker live-monitor: output-stream PTY worker-attach + watch --follow — WK-5-kalan completed.
- 279-008 — F7-ENT-verify — enterprise dashboard backend doğrula + 4 tab gerçek-veri — Created tests/api/enterprise-routes-complete.test.ts with 10 tests covering all 4 enterprise endp...
- 279-009 — WK-5/COMM-1 dashboard görünürlük — Worker Comms + Resources panel — DONE criteria met: (1) npx vitest run --config vitest.dashboard.config.ts tests/dashboard/workers...
- …and 2 more delivered

## Sprint sprint-278 Learnings
- Sprint sprint-278 Learnings: ## Sprint sprint-278 Learnings
- shared→worker okuma — spawn-time SharedMemory prompt enjeksiyonu (OPUS): GO_WITH_TECH_DEBT — shared→worker SharedMemory prompt injection wired. prompt-god-template.ts: NEW exported buildSharedContextBlock(entries)
- handoff→downstream worker prompt enjeksiyonu (OPUS): GO_WITH_TECH_DEBT — handoff→downstream worker prompt injection wired (Sprint 278 COMM-1 / 278-004). Mirrors the 278-003 SharedMemory pattern
- structured handoff-notes — upstream worker'dan downstream'e mesaj: GO_WITH_TECH_DEBT — All goCriteria met:

1. handoff-protocol.ts: Added `notes?: string` to Handoff interface and 4th optional param to creat

## Gains
- 278-001 — worker_comms config + .result sharedNotes/messages şeması — All goCriteria met:
- 278-002 — worker→shared yazım köprüsü — .result sharedNotes → SharedMemory — Implemented worker→SharedMemory write bridge in result-collector.ts.
- 278-006 — worker prompt talimatı — sharedNotes/handoffNotes nasıl yazılır — Added buildWorkerCommsInstructionBlock() export to prompt-god-template.ts.
- 278-007 — multi-agent.ts disposition — runPipeline 0-caller (ADR-038) — INVESTIGATION: Production 0-caller confirmed — src/mcp/server.ts and src/cli/helpers/cursor-confi...
- 278-008 — worker-comms görünürlük — CLI durum + shared/handoff listesi — Added `buildWorkerCommsSection(root, lang): string | null` export to status.ts.
- 278-009 — e2e comms akışı — iki-worker shared+handoff round-trip smoke — Created hermetic e2e test file tests/e2e/worker-comms-flow.test.ts with 4 tests covering the full...
- 278-010 — api-surface + config-reference — worker_comms + sharedNotes — Successfully documented worker_comms configuration and result fields.
- 278-011 — features + MASTER-PLAN — COMM-1 işaretleri — Task 278-011 — features + MASTER-PLAN COMM-1 işaretleri.

## Sprint sprint-277 Learnings
- Sprint sprint-277 Learnings: ## Sprint sprint-277 Learnings

## Gains
- 277-001 — /api/auth/me whoami endpoint — bearer'dan kimlik + rol — Implemented GET /api/auth/me whoami endpoint following the enterprise/nervous endpoint register p...
- 277-002 — audit-actor JWT sub'dan türetme — hardcoded 'local' fix — Added dynamic audit actor derivation to enterprise-endpoint.ts:
- 277-003 — useAuth hook/context — dashboard auth-state SSOT — Implemented session.ts (getSessionToken/setSessionToken/clearSessionToken with DECKENT_SESSION_TO...
- 277-004 — AuthStatus komponenti — "kim giriş yaptı" + logout — AuthStatus component created.
- 277-005 — ManualTokenInput — api_oidc modunda JWT test girişi — ManualTokenInput modal implemented.
- 277-006 — OIDC redirect-flow çekirdeği — PKCE + authorize-URL + state (OPUS) — NEW src/dashboard/src/lib/oidc-flow.ts — pure, security-critical OIDC Authorization-Code + PKCE p...
- 277-007 — OIDC token-exchange backend endpoint — code→token (OPUS) — OIDC token-exchange backend endpoint (code→token).
- 277-008 — dashboard wire — Provider + AuthStatus + Login/Callback rotaları — All 5 files wired.
- …and 6 more delivered

## Sprint sprint-276 Learnings
- Sprint sprint-276 Learnings: ## Sprint sprint-276 Learnings

## Gains
- 276-001 — directive-interrogator çekirdeği — zorlayıcı soru üretimi + taslak öneri — PLAN-INT-1 core delivered.
- 276-002 — interrogation config + i18n soru sözlüğü — Added PlanConfig interface + plan? field to DeckentConfig and ResolvedConfig in config-types.ts.
- 276-003 — deckent plan --interrogate CLI wire — Implemented PLAN-INT-1 CLI wire: (1) Added runInterrogation() as an exported, injectable function...
- 276-004 — cross-verify çekirdeği — high-stakes tespit + farklı-provider seçimi — XVER-1 pure decision layer.
- 276-005 — cross_verify config bloğu (default-off) — Added CrossVerifyConfig interface to config-types.ts (near CacheWarmConfig/ResourceMonitorConfig ...
- 276-006 — adversarial-refute prompt builder — XVER-1 adversarial prompt builder.
- 276-007 — cross-verify dispatch + eval advisory-wire (OPUS) — XVER-1 dispatch + eval advisory-wire.
- 276-008 — cross-verify outcome-tracker beslemesi — öğrenilen verifier eşleşmeleri — Added OutcomeTracker.recordCrossVerifyVerdict() method (~38 LoC including JSDoc) that feeds cross...
- …and 4 more delivered

## Sprint sprint-275 Learnings
- Sprint sprint-275 Learnings: ## Sprint sprint-275 Learnings

## Gains
- 275-001 — /usage REPL slash — üç katman birden — Implemented /usage REPL slash across all three layers per the 3-KATMAN KURALI (269 lesson):
- 275-002 — /resources REPL slash — üç katman birden — Implemented /resources REPL slash across all three layers per the 3-KATMAN KURALI (269 lesson):
- 275-003 — deckent_usage MCP tool — ADR-022 parite — Implemented deckent_usage MCP tool (tools count: 33→34).
- 275-004 — 273-010 debt kapanışı — kalan "full test suite" eşleşmeleri denetimi — 273-010 debt closure: all 10 'full test suite' occurrences in src/core/builtins/ classified and h...
- 275-005 — cli-commands + features — usage/resources slash + MCP satırları — Documentation-only task (Tier-0).
- 275-006 — mcp-tools.md regen — 34 tool — Successfully regenerated mcp-tools.md with 34 tools.
- 275-007 — resource-profile — F1-TOK optimizasyon bölümü iskeleti — Added comprehensive 'Token/Cache Optimizasyonu (F1-TOK)' section to resource-profile.md.
- 275-008 — MASTER-PLAN — F1-TOK durum konsolidasyonu — F1-TOK section (lines 137-146) updated with Sprint 275 kanıt-sprint status consolidation.

## Sprint sprint-274 Learnings
- Sprint sprint-274 Learnings: ## Sprint sprint-274 Learnings

## Gains
- 274-001 — cache_warm config bloğu — Added CacheWarmConfig interface to config-types.ts (after ResourceMonitorConfig, same pattern).
- 274-002 — cache-warm spawn stratejisi — ilk worker yazar, fleet okur (OPUS) — F1-TOK Faz 2 cache-warm spawn implemented in spawnWorkers (sprint-spawner.ts) — the least-invasiv...
- 274-003 — ledger cache-gate — sprint'in 2.+ worker'ları cache okuyor mu? — All goCriteria met:
- 274-004 — retro limit-satırı genişletmesi — hit-rate + warm-share — All goCriteria met:
- 274-005 — docs — cache_warm + adr_render + usage cache-gate — Added cache_warm configuration block (section 12.1) with enabled/warm_delay_ms fields; added prom...
- 274-006 — MASTER-PLAN — F1-TOK Faz 2 işaretleri — F1-TOK Faz 2 completion marked in MASTER-PLAN.md.

## Sprint sprint-273 Learnings
- Sprint sprint-273 Learnings: ## Sprint sprint-273 Learnings

## Gains
- 273-001 — limit-ledger çekirdeği — transcript parse + maliyet-eşdeğeri birim — Created src/core/limit-ledger.ts with full API: parseTranscriptUsage (injectable readDir/openStre...
- 273-002 — ledger session→task eşleme + sprint agregasyonu — Created src/core/limit-ledger-report.ts with full API:
- 273-003 — `deckent usage` CLI — pencere + sprint görünümü — Created `deckent usage` command (registerUsage + runUsageCommand with injectable deps):
- 273-004 — sprint-reporter "limit-yakım" satırı — retro entegrasyonu — Added buildLimitBurnRow() to src/orchestra/sprint-reporter.ts:
- 273-005 — result-evaluator tokenUsage hizalaması — beyan artık zorunlu değil — Three surgical text changes in validateTokenUsage area of result-evaluator.ts: (1) TokenUsageVali...
- 273-006 — .gitignore sprint-runtime artıkları — git-status prefix stabilizasyonu — Successfully added sprint-runtime artifacts to .gitignore for cache-prefix stability.
- 273-007 — prompt-determinizm guard testi — Created tests/orchestra/prompt-determinism.test.ts with 5 determinism guard tests:
- 273-008 — prompt-template revizyonu — Skills-first blok sırası + tokenUsage metni (OPUS) — TWO surgical changes, content-preservation absolute (Karpathy minimum-diff).
- …and 5 more delivered

## Sprint sprint-272 Learnings
- Sprint sprint-272 Learnings: ## Sprint sprint-272 Learnings

## Gains
- 272-001 — GHOST-FINALIZE fix — checkpoint artığı temizliği + start'ın dürüst davranışı — GHOST-FINALIZE fix — root cause closed at two layers + a runtime guard.
- 272-002 — dispatch-kuyruğu/EVALUATE yarışı — koşmamış task varken değerlendirme başlamaz — Fixed the Sprint 271-013 dispatch-queue/EVALUATE race.
- 272-003 — exit-without-result kökü (a) — docker wrapper son-şans + zengin marker — exit-without-result kökü (a) — docker wrapper son-şans + zengin marker.
- 272-004 — exit-without-result kökü (b) — eval'de workPresent → verify-and-complete FIX yolu — exit-without-result kökü (b) — eval'de workPresent → verify-and-complete FIX yolu.
- 272-005 — F1-LIM faz-2a — task-tipine göre memory limiti (kod 1.5g / doc 768m önerisi) — Implemented F1-LIM faz-2a opt-in kind-based Docker memory limits.
- 272-006 — F1-LIM faz-2b — provider-limit tespit modülü + FIX ölü-limit guard'ı — F1-LIM faz-2b complete.
- 272-007 — docs — resource-profile kind-limit bölümü + config/features satırları — Documentation task completed: (1) Added Section 11 to resource-profile.md with kind-based memory ...
- 272-008 — MASTER-PLAN işaretleri — 272 kapananlar — Added Sprint 272 entry to MASTER-PLAN.md marking completion of 4 root-cause fixes: (1) GHOST-FINA...

## Sprint sprint-271 Learnings
- Sprint sprint-271 Learnings: ## Sprint sprint-271 Learnings
- sprint-yaşamdöngüsü wire — opt-in izleme SPAWN→CLEANUP: GO_WITH_TECH_DEBT — Wired Task-1 resource-monitor into the sprint lifecycle, opt-in via config.resource_monitor.enabled===true. Chose sprint
- doctor "Worker Resources" satırı — limit görünürlüğü + tavan uyarısı: GO_WITH_TECH_DEBT — Added Worker Resources section to deckent doctor.

Changes:
- src/cli/commands/doctor.ts: Added `totalmem` to os import;
- MASTER-PLAN işaretleri — 271 kapananlar: NO_GO

## Gains
- 271-001 — resource-monitor çekirdeği — docker stats örnekleyici → JSONL — Implemented createResourceMonitor with start/stop/sampleOnce.
- 271-002 — resource_monitor config bloğu — Added ResourceMonitorConfig interface to config-types.ts with enabled (required boolean), interva...
- 271-003 — resource-log analiz fonksiyonları — per-task peak/avg — Implemented pure analysis functions for resource log data:
- 271-004 — `deckent resources` CLI — anlık snapshot + log özeti — Implemented deckent resources CLI command (ADR-012 register pattern).
- 271-007 — resource-profile referansı — kod-türevli kaynak haritası — Created comprehensive resource-profile.md reference document with all code-derived content from s...
- 271-008 — pack diyeti — 4.8MB → eşik altı — ## Pack Analysis (npm pack --dry-run, without dashboard build)
- 271-009 — link lint — 17 kırık link
- 271-010 — manifest F3-009 pre-existing test çifti — Root cause: the test was written in Sprint 228 with label 'Autonomous Runtime — F3-009 authority-...
- …and 2 more delivered

## Sprint sprint-270 Learnings
- Sprint sprint-270 Learnings: ## Sprint sprint-270 Learnings

## Gains
- 270-001 — validate-publish güçlendirme — exec-bit + dashboard-bundle assertion'ları — Added two new publish-readiness gates:
- 270-002 — npm pack hermetik smoke — paketten kurulan deckent gerçekten açılıyor — Created hermetic e2e test with 4 passing tests:
- 270-003 — README quickstart — 3-komut kurulum çıtası — Updated README Quick Start section to follow Odysseus 3-komut çıtası pattern.
- 270-004 — dev/tsc exec-bit kaybı kökü — watch yolunda da +x garantisi — Approach (b) implemented:
- 270-005 — PSL-6 doctor auth-probe — CLI var ≠ login; gerçek oturum durumu — PSL-6 core probe module: NEW src/core/provider-auth-probe.ts exporting probeProviderAuth(provider...
- 270-006 — doctor wire — auth-probe satırları ("CLI var ama login DEĞİL" görünür) — Wired Task 270-005's probeProviderAuth into `deckent doctor`.
- 270-007 — F1-IMG part 1 — worker-image readiness denetim modülü — F1-IMG part 1 — new src/core/worker-image-check.ts exporting checkWorkerImage({image?, requiredPr...
- 270-008 — F1-IMG part 2 — doctor satırı + consent-based rebuild önerisi (ADR-063) — F1-IMG part 2 — wired Task 270-007's checkWorkerImage report into `deckent doctor` + added consen...
- …and 12 more delivered

## Sprint sprint-269 Learnings
- Sprint sprint-269 Learnings: ## Sprint sprint-269 Learnings

## Gains
- 269-001 — SPA token-inject P0 + enterprise endpoints + chat-stream adapter — dashboard auth zinciri uçtan uca (24 test)
- 269-002 — WorkersPage/DirectivesPage + Nervous SSE + kanonik API-client (19 test)
- 269-003 — /autonomous /audit /directives REPL slash'leri + i18n (49 test)
- 269-004 — MCP deckent_run modelEffort/timeoutMs/keep + deckent_audit action'ları (22 test)
- 269-005 — doc-drift kapatma (kod-türevli drift testi)

## Bugs/Dersler (limit olayı)
- F1-LIM — usage-limit tükenmesi → 4 worker + 4 FIX worker toplu exit-without-result (hb DONE'a kadar gelmişlerdi); algıla→park gerekli
- MODEL-KATMANLAMA — fable yalnız planlama+çok-zor task'lara (Alperen 2026-06-10)
- BUILD +x — tsc build entry.js execute bitini düşürüyor → npm-link global deckent "Permission denied" (publish-readiness)

## Sprint sprint-268 Learnings
- Sprint sprint-268 Learnings: ## Sprint sprint-268 Learnings

## Gains
- 268-001 — RESUME-RACE fix — resume respawn'dan önce bayat worker-artifact reset — RESUME-RACE fix landed.
- 268-002 — FINALIZE fix üçlüsü — recount + archive-blind + orphan-state — Worker exited without writing result (exitCode=0)
- 268-003 — SPAWN-LIFECYCLE — modelEffort pass-through + completion status finalize — SPAWN-LIFECYCLE both gaps closed.
- 268-004 — JWKS async AuthProvider seam — terminal auth RS256/JWKS canlı — JWKS async AuthProvider seam opened (additive, backward-compatible).
- 268-005 — Dynamics 365 OData read-only ErpDriver — Dynamics 365 OData v4 read-only ErpDriver landed TDD-first (RED confirmed before impl).
- 268-006 — Enterprise-depth reference — api_oidc + JWKS-seam + Dynamics ekleri — Added Section 10 'HTTP API OIDC Bearer (api_oidc)' to docs/reference/enterprise-depth.md — fully ...

## Sprint sprint-267 Learnings
- Sprint sprint-267 Learnings: ## Sprint sprint-267 Learnings

## Gains
- 267-001 — api_oidc OIDC JWT bearer uzantısı — verifyJwt SSOT tüketimi, default-off, statik yol regresyonsuz (43 dosya/479 test)
- 267-002 — SAP OData ErpDriver — Odoo'dan sonra ikinci driver; ErpDriver sözleşmesi iki somut driver'la doğrulandı
- 267-003..006 — 4 referans doc kod-türevli, Kanıt grep'leri geçti

## Bugs (kurtarmadan)
- RESUME-RACE — deckent resume bayat .hb/.partial-result'ı resetlemeden runSprint'e giriyor; collector respawn'a şans vermeden sentetik NO_GO ile kapatıyor (fix: hb reset + grace period)
- SPAWN-LIFECYCLE — deckent spawn: docker'da bloklayıcı, completion'da status finalize yok (duplicate riski), modelEffort düşürülüyor
- OOM exit 137 (267-002 ilk deneme) — fresh-worker-over-partial-work deseni başarıyla tamamladı

## Sprint sprint-266 Learnings
- Sprint sprint-266 Learnings: ## Sprint sprint-266 Learnings

## Gains
- 266-001 — Odoo read-only ErpDriver (JSON-RPC search_read) — First concrete ErpDriver: createOdooErpDriver(opts) translates CompiledQuery -> Odoo JSON-RPC 2.0...
- 266-002 — audit CLI tamamlama — syslog forward wire + retention subcommand — Syslog wire + retention subcommand landed, both consuming SSOT modules (no re-implementation).
- 266-003 — Enterprise integrations reference — sprint-265 çıktıları — Appended code-derived sections 7-10 to docs/reference/enterprise-integrations.md; existing sectio...
- 266-004 — Enterprise depth — JWKS/OIDC/transport ekleri — Doc-only Tier-0 task (no test suite run, per task instructions).
- 266-005 — Autonomous operations — forward --url/--syslog ekleri — Updated §12.2 of docs/guide/autonomous-operations.md to the CURRENT disk state of src/cli/command...

## Sprint sprint-265 Learnings
- Sprint sprint-265 Learnings: ## Sprint sprint-265 Learnings

## Gains
- 265-001 — ERP capability wake — erp.read handler + runtime wiring + referans driver — E12 wake complete.
- 265-002 — SIEM HTTP transport + `audit forward --url` canlı wire — TDD (RED→GREEN).
- 265-003 — SIEM syslog transport (RFC5424, injectable socket) — NEW src/core/siem-transport-syslog.ts: createSyslogSiemTransport(opts) -> (batch: SiemRecord[]) =...
- 265-004 — JWKS fetch + RS256 key resolver — JWKS fetch + RS256 key resolver (ENT-5 follow-up).
- 265-005 — Embedded-terminal OidcAuthProvider (spec §1d rezerve slot) — OidcAuthProvider added to src/api/terminal/auth-provider.ts (spec §1d reserved slot) as a surgica...
- 265-006 — features.md sahte auto-gen başlığı düzelt (Sprint 264 worker bulgusu) — Replaced the false auto-gen header (line 3) in docs/reference/features.md with an accurate one.

## Sprint sprint-264 Learnings
- Sprint sprint-264 Learnings: ## Sprint sprint-264 Learnings

## Gains
- 264-001 — Autonomous engine internals doc — yeni dispatch yolları — Added 'Dispatch paths — the 2026-06-10 wirings' section (5 subsections) to docs/guide/autonomous-...
- 264-002 — Autonomous user guide — backlog add yeni yüzeyleri — Added user-facing docs for the new backlog-add surfaces to docs/guide/autonomous.md, all derived ...
- 264-003 — Autonomous operations guide — governance + audit ops — Added two new operations sections to docs/guide/autonomous-operations.md, derived from code reali...
- 264-004 — Enterprise depth reference — read-side + enforcement — Added three code-derived sections to docs/reference/enterprise-depth.md.
- 264-005 — Config reference — yeni anahtarlar — Added new section '## 22.
- 264-006 — CLI commands reference — audit + backlog yeni flag'ler — Kanıt PASSED: grep -ciE "audit (compliance|forward)|--cron|--capability|--connector" docs/referen...
- 264-007 — Features reference — yeni yetenek satırları — Added '## Lightly Used Features' section to docs/reference/features.md between Active and Dormant...
- 264-008 — Feature matrix guide — satır güncellemeleri — Updated docs/guide/feature-matrix.md surgically.
- …and 4 more delivered

## Sprint sprint-263 Learnings
- Sprint sprint-263 Learnings: ## Sprint sprint-263 Learnings

## Gains
- 263-001 — Architecture & Module Inventory Analysis — Authored docs/analysis/deckent-architecture-inventory.md (190 lines) — quantitative architecture ...
- 263-002 — Enterprise & Autonomous Capability Maturity Analysis — Authored docs/analysis/deckent-capability-maturity.md (118 lines): quantitative BUILT/PARTIAL/MIS...
- 263-003 — Test & Quality Posture Analysis — Authored docs/analysis/deckent-quality-posture.md (190 lines, number-dense).

## Sprint sprint-260 Learnings
- Sprint sprint-260 Learnings: ## Sprint sprint-260 Learnings
- Doc — Enterprise Foundation reference (consume-the-contract): GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0) | disk-verify found evidence (linesAdded=0, untrackedFiles=1). Status 

## Gains
- 260-001 — ENT-1 — actor.role → worker authority (ADR-037 V2 step) — ENT-1 (ADR-037 V2 step): the nervous authority-matrix now consults ExecutionRequest.actor.role.
- 260-002 — ENT-2 — tenantId threading (replace hardcoded 'local') — ENT-2 tenantId threading complete.
- 260-003 — ENT-3 — correlationId / causationId audit lineage — ENT-3 audit lineage implemented surgically and backward-safely.
- 260-004 — WM-6 / F10-002 — riskClass → risk-gated approval — WM-6 / F10-002 risk-gate wired INTO the nervous DecisionEngine.
- 260-005 — budget → pre-spawn cost-gate enforcement — Added per-request budget ceiling enforcement to evaluateCostGate.
- 260-006 — F8-001 — capability.invoke abstraction (capabilityTarget consumer) — Worker exited without writing result (exitCode=0)
- 260-007 — AUT-4 — nextRun() full cron evaluation — Created src/orchestra/autonomous/scheduled-flow.ts with full 5-field cron evaluator.
- 260-008 — AUT-6 — backlog done/failed purge + autonomous artifact cleanup — Added purgeCompletedBacklog() and cleanupAutonomousArtifacts() to backlog.ts.
- …and 7 more delivered

## Sprint sprint-259 Learnings
- Sprint sprint-259 Learnings: ## Sprint sprint-259 Learnings

## Sprint sprint-258 Learnings
- Sprint sprint-258 Learnings: ## Sprint sprint-258 Learnings

## Sprint sprint-257 Learnings
- Sprint sprint-257 Learnings: ## Sprint sprint-257 Learnings

## Gains
- 257-001 — CODE-FULLSUITE-NOGO — worker self-verify must be TARGETED, not full-suite — Surgical edit to the else-branch (code task) verify section in renderTemplate.
- 257-002 — GEMINI-LOGIN-HANG (real) — fail fast on interactive login / 429, don't hang — Implemented real fast-fail guard in src/providers/gemini.ts.

## Sprint sprint-256 Learnings
- Sprint sprint-256 Learnings: ## Sprint sprint-256 Learnings
- PLAN-SCOPE-1 — planner must NOT pull description-mentioned file paths into scope.filesWrite: GO_WITH_TECH_DEBT — Bug: structured directive parsing pulled path-looking prose lines into scope.filesWrite/directories.,Root Cause: parseStructuredDirectives and bullet fallback collected any line containing src/, tests/, docs/, scripts/, .brain/, .deckent/, .contracts/, or .claude/ as a scope line, so prose mentions were passed to extractScopeFromDirective.,Category: Integration/Logic.,Fix: scope line collection now accepts only explicit Files/Dosya/Scope/Kapsam directive lines; explicit directive extraction behavior is preserved. Added a regression for a doc task mentioning `src/core/work-model.ts` only in description prose.,Also made two existing priority parser tests hermetic by replacing a missing .brain/archive/DIRECTIVES-sprint-136.md dependency with an inline fixture in the allowed test file.,Full suite check: npx vitest run was executed and FAILED with 67 failures across 19 files plus 1 unhandled error. Failures are outside this task scope, including docs/security-md-current.test.ts, tests/core/model-types.test.ts, tests/core/provider-ollama-bootstrap.test.ts, tests/orchestra/model-selector-provider.test.ts, tests/config/nervous-faz1-smoke.test.ts, tests/e2e/tmux-backend.test.ts, tests/cli/doctor-ux.test.ts, and ANSI/output/script/manifest/provider expectation drift. Because full suite did not pass, this result is NO_GO per worker bug-fixer verification rules.

## Gains
- 256-001 — GEMINI-LOGIN-HANG — gemini worker must fail-fast, never hang on interactive login — Added GEMINI_NONINTERACTIVE=1 to buildGeminiSpawnEnv — the single env var that signals to the gem...

## Sprint sprint-255 Learnings
- Sprint sprint-255 Learnings: ## Sprint sprint-255 Learnings

## Gains
- 255-001 — DOC-1 — ExecutionRequest contract reference (WM-1) — Created docs/reference/execution-request.md with full ExecutionRequest contract reference.
- 255-002 — DOC-2 — Stack-aware criteria & routing (WM-7) — Code physically verified despite missing .result (Sprint 135 docker HB shutdown bug pattern).
- 255-003 — DOC-3 — Positioning: agentic-OS + agentic-run ecosystem — Created docs/vision/agentic-run-ecosystem.md as a concrete positioning document for deckent as an...

## Sprint sprint-254 Learnings
- Sprint sprint-254 Learnings: ## Sprint sprint-254 Learnings
- V-001 — codex docker + reasoning-effort (MF-8 + F1-RE): GO_WITH_TECH_DEBT — Created the required three-line documentation file. No test suite was run because this is a Tier-0 doc-only task.

## Gains
- 254-001 — Fix debt: Tech debt from 249-009-fix: Created/updated docs/guide/architecture-overview.md — DISPOSITION: debt-249-009-fix is a VERIFIED FALSE-POSITIVE (phantom) debt — resolved by verificat...
- 254-003 — V-002 — claude docker + reasoning-effort (F1-RE) — Created docs/_verify-combined/claude-effort.md with exactly 3 lines: (1) # Claude Docker + Effort...

## Sprint sprint-253 Learnings
- Sprint sprint-253 Learnings: ## Sprint sprint-253 Learnings

## Gains
- 253-001 — codex IN docker — Created the requested three-line Docker verification document.
- 253-002 — gemini IN docker — Created docs/_verify-docker/gemini-docker.md with the specified three lines.

## Sprint sprint-252 Learnings
- Sprint sprint-252 Learnings: ## Sprint sprint-252 Learnings

## Gains
- 252-001 — codex IN docker — Worker exited without writing result (exitCode=0)
- 252-002 — gemini IN docker — Created docs/_verify-docker/gemini-docker.md with 3 lines as specified.

## Sprint sprint-251 Learnings
- Sprint sprint-251 Learnings: ## Sprint sprint-251 Learnings
- 251-006 — provider fleet notes (benchmark; codex): NO_GO — Created docs/benchmark/provider-fleet-notes.md with qualitative provider fleet routing notes. Verified by reading the fi
- 251-007 — cookbook index (gemini): GO_WITH_TECH_DEBT — Created docs/cookbook/index.md with a navigation index linking all cookbook recipes and their one-line descriptions.
- 251-009 — tech debt tracking (cookbook; gemini): NO_GO — Docker backend received a non-claude provider binary "gemini" (provider "gemini") for task 251-009. The docker worker pa
- 251-010 — nervous alerts (cookbook; ollama, small): GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0) | disk-verify found evidence (linesAdded=0, untrackedFiles=1). Status 

## Gains
- 251-001 — event channels reference (code-derived) — Created docs/reference/event-channels.md with all 27 CHANNELS from src/orchestra/event-stream.ts.
- 251-002 — recover a stuck sprint (cookbook) — Worker exited without writing result (exitCode=0)
- 251-003 — evolution & learning (guide) — Created docs/guide/evolution-and-learning.md (149 lines).
- 251-004 — feature matrix (redo; codex) — Created docs/guide/feature-matrix.md with a CLI/MCP/Dashboard feature matrix.
- 251-005 — cost & budget (cookbook; codex) — Created the cost and budget cookbook page.
- 251-008 — checkpoints & approval (cookbook; gemini) — Created docs/cookbook/06-checkpoints-approval.md as per instructions.

## Sprint sprint-250 Learnings
- Sprint sprint-250 Learnings: ## Sprint sprint-250 Learnings
- 250-V2 — codex verify (MF-1 KEY): NO_GO — Created docs/_verify/codex-v.md with exactly three lines. Line 1 is '# Codex Verify', line 2 is 'Provider: codex', and l
- 250-V4 — ollama verify: GO_WITH_TECH_DEBT — Created docs/_verify/ollama-v.md with exactly 3 lines: line 1 "# Ollama Verify", line 2 "Provider: ollama", line 3 a sho

## Gains
- 250-001 — 250-V1 — claude verify — Created docs/_verify/claude-v.md with exactly 3 lines: line 1 '# Claude Verify', line 2 'Provider...
- 250-003 — 250-V3 — gemini verify — Created docs/_verify/gemini-v.md with the specified 3 lines of content.

## Sprint sprint-249 Learnings
- Sprint sprint-249 Learnings: ## Sprint sprint-249 Learnings
- 249-003 — lint-cli-mcp-parity guard (report-only): NO_GO — Created scripts/lint-cli-mcp-parity.mjs (ESM, Node built-ins only, ADR-010 compliant). Script scans src/cli/commands/*.t
- 249-004 — lint-i18n-hardcode guard (report-only): NO_GO — Created scripts/lint-i18n-hardcode.mjs — ESM, Node built-ins only (ADR-010). Scans src/cli/commands/*.ts for console.log
- 249-006 — why-deckent comparison (factual): GO_WITH_TECH_DEBT — Created docs/comparison/why-deckent.md as a factual, positive positioning doc. Smoke checks passed: file exists, no comp
- 249-007 — cookbook: first sprint: NO_GO — Created docs/cookbook/01-first-sprint.md with a concise first-sprint recipe and verified the requested CLI command seque
- 249-008 — cookbook: multi-provider fleet: NO_GO — Created the multi-provider fleet cookbook recipe. It includes per-task Provider/Model override syntax, a 3-task snippet 
- 249-009 — architecture overview (EN): GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0)
- 249-010 — cookbook: memory recall: GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0) | disk-verify found evidence (linesAdded=0, untrackedFiles=3). Status 
- 249-012 — getting-started (EN): GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0) | disk-verify found evidence (linesAdded=0, untrackedFiles=1). Status 
- 249-013 — feature matrix: NO_GO — Worker exited without writing result (exitCode=0) | disk-verify found evidence (linesAdded=0, untrackedFiles=2). Status 
- 249-014 — glossary (ollama, small): GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0) | disk-verify found evidence (linesAdded=0, untrackedFiles=6). Status 

## Gains
- 249-001 — benchmark/memory-v2 (verify the 96% claim) — Rewrote docs/benchmark/memory-v2.md to HONESTLY assess the '96% context reduction' claim against ...
- 249-002 — lifecycle + API-surface diagrams — Created docs/reference/lifecycle-diagram.md with two accurate mermaid diagrams.
- 249-005 — provider-parity fleet regression test — Created tests/orchestra/provider-parity-fleet.test.ts with 5 hermetic unit tests.
- 249-011 — cookbook: autonomous mode — Created docs/cookbook/04-autonomous-mode.md with a high-level recipe for autonomous mode, describ...

## Sprint sprint-248 Learnings
- Sprint sprint-248 Learnings: ## Sprint sprint-248 Learnings
- 248-001 — codex worker gate: GO_WITH_TECH_DEBT — Created docs/_provider-gate/codex-parity.md with exactly the requested three lines. Typecheck and test suite were not ru

## Gains
- 248-002 — gemini worker gate — Created docs/_provider-gate/gemini-parity.md with specified content.

## Sprint sprint-247 Learnings
- Sprint sprint-247 Learnings: ## Sprint sprint-247 Learnings

## Gains
- 247-001 — docs/adr-index.md — Created docs/adr-index.md with all 57 ADRs present in decisions.md (ADR-001..086, with documented...

## Sprint sprint-246 Learnings
- Sprint sprint-246 Learnings: ## Sprint sprint-246 Learnings

## Gains
- 246-001 — docs/security/threat-model.md — Rewrote docs/security/threat-model.md with honest, code-grounded content.

## Sprint sprint-245 Learnings
- Sprint sprint-245 Learnings: ## Sprint sprint-245 Learnings

## Gains
- 245-001 — .codex + .gemini rules → .claude parity — All four goCriteria verified:

## Sprint sprint-244 Learnings
- Sprint sprint-244 Learnings: ## Sprint sprint-244 Learnings

## Gains
- 244-001 — multi-provider docs kod-gerçeğine hizala — Updated both multi-provider docs to match code reality.

## Sprint sprint-243 Learnings
- Sprint sprint-243 Learnings: ## Sprint sprint-243 Learnings
- 243-001 — multi-provider docs kod-gerçeğine hizala: NO_GO — Model returned no tool calls and no files were changed. Assistant: 

## Sprint sprint-242 Learnings
- Sprint sprint-242 Learnings: ## Sprint sprint-242 Learnings

## Gains
- 242-001 — MCP-run provider-free + autonomous agent/skill inject — Fix A: Removed provider:'claude' hardcode from src/mcp/tools/run.ts.

## Sprint sprint-241 Learnings
- Sprint sprint-241 Learnings: ## Sprint sprint-241 Learnings

## Gains
- 241-001 — decidePolicy'ye computed EffectClass wire — Implemented computeEntryEffectClass(entry): EffectClass in policy-gate.ts.

## Sprint sprint-240 Learnings
- Sprint sprint-240 Learnings: ## Sprint sprint-240 Learnings

## Gains
- 240-001 — task-router + adr-selector canonical-consume (fallback korunur) — WM-2c canonical-consume bridge implemented for task-router + adr-selector.

## Sprint sprint-239 Learnings
- Sprint sprint-239 Learnings: ## Sprint sprint-239 Learnings

## Gains
- 239-001 — rubric-registry + task-builder canonical TaskKind migration — Worker exited without writing result (exitCode=0)

## Sprint sprint-238 Learnings
- Sprint sprint-238 Learnings: ## Sprint sprint-238 Learnings

## Gains
- 238-001 — Canonical work-model SSOT modülü (additive) — WM-2a additive foundation complete.

## Sprint sprint-237 Learnings
- Sprint sprint-237 Learnings: ## Sprint sprint-237 Learnings
- 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu: GO_WITH_TECH_DEBT — docs/guide/local-model-workers.md yazıldı. İçerik: (1) Ollama kurulumu + `ollama pull`, (2) `Provider: ollama` / `Model:

## Gains
- 237-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu — docs/guide/multi-provider-fleet.md exists and is complete (147 lines).

## Sprint sprint-236 Learnings
- Sprint sprint-236 Learnings: ## Sprint sprint-236 Learnings

## Gains
- 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu — Created docs/guide/local-model-workers.md covering all 4 required topics: (1) Ollama installation...
- 236-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu — Created docs/guide/multi-provider-fleet.md (146 lines).

## Sprint sprint-235 Learnings
- Sprint sprint-235 Learnings: ## Sprint sprint-235 Learnings

## Gains
- 235-001 — [P0] Per-task ollama provider+model plan-time acceptance — Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard...

## Sprint sprint-233 Learnings
- Sprint sprint-233 Learnings: ## Sprint sprint-233 Learnings

## Gains
- 233-001 — [Wave 1] Core agentic worker runner + tool şemaları + scope-guard — F1-013 Wave 1 complete.
- 233-002 — [Wave 2 · depends 233-001] Subprocess entry + OllamaAdapter wiring + dinamik model kabul — Wave 2 of F1-013: agentic-worker-entry subprocess shim created (217 LoC) + ollama.ts surgical 2-p...

## Sprint sprint-232 Learnings
- Sprint sprint-232 Learnings: ## Sprint sprint-232 Learnings

## Gains
- 232-001 — [P0] decay_after_sprints config wire (PRIMARY kök) — Sprint 232 PRIMARY memory-loss kök kapatıldı.
- 232-002 — [P0] learnings decay-exempt (memory/retro/sprint/pattern) — Added decay_exempt:true to 6 locations in sprint-retro-writer.ts (writeRetrospective: sprint/retr...
- 232-003 — [P1] abort >= operatörü + WAL-safe deckent memory backup CLI — Worker exited without writing result (exitCode=0)
- 232-004 — [P1] ci-sim SIGINT/SIGTERM restore handler (GAP A) — Added SIGINT/SIGTERM signal handlers to scripts/test-ci-sim.mjs.
- 232-005 — [P1] writeGuardedExports dbCount===0 disk-protect (GAP B) — Added dbCount===0 disk-protect guard to writeGuardedExports.

## Sprint sprint-229 Learnings
- Sprint sprint-229 Learnings: ## Sprint sprint-229 Learnings

## Gains
- 229-001 — McpClientBroker çekirdek (SDK Client + stdio/HTTP transport) — McpClientBroker implemented per Sprint 229 Task 229-001 spec: SDK Client + StdioClientTransport +...
- 229-002 — 3-scope config (.mcp.json project/user/local merge) — Implemented 3-scope MCP config system (local > project > user merge, ADR-004 pattern).
- 229-003 — Dynamic discovery + namespaced tool registry — McpToolRegistry implemented per Sprint 229 Task 229-003 spec.
- 229-004 — [Tier-1] `deckent mcp` yönetim CLI (add/list/remove/get) — Implemented Claude-parity `deckent mcp` management CLI (Sprint 229 — AS-5·P1 Task 229-004).
- 229-005 — [Tier-1] REPL `/mcp` dispatch + confirm-gate + audit composition — Bridge MODULE + 5 hermetic tests delivered (kanit grep 46 ≥ 3; vitest 5 ≥ 4 pass; tsc --noEmit cl...

## Sprint sprint-228 Learnings
- Sprint sprint-228 Learnings: ## Sprint sprint-228 Learnings

## Gains
- 228-001 — [P0] autonomous CLI i18n retrofit (hardcode → getMessage) — Worker exited without writing result (exitCode=0)
- 228-002 — features-manifest entry (sync-manifest.mjs → regenerate) — Added autonomous-runtime to FEATURE_DEFINITIONS in scripts/sync-manifest.mjs with id='autonomous-...
- 228-003 — Autonomous usage doc (TR/EN, güvenlik modeli dahil) — Created docs/guide/autonomous.md covering: all 3 subcommands (start/status/stop) with exact optio...
- 228-004 — Autonomous e2e smoke harness (gerçek-binary start→status→stop) — Created scripts/autonomous-smoke.mjs — real binary e2e smoke harness for `deckent autonomous star...

## Sprint sprint-227 Learnings
- Sprint sprint-227 Learnings: ## Sprint sprint-227 Learnings

## Gains
- 227-001 — Rubric total diagnostic fix (coverage:null → renormalize) — Sprint 227 227-001 — Rubric total diagnostic fix.
- 227-002 — [P0] Export-wipe guard (dolu .md'yi boşla EZME) — Export-wipe guard implemented.
- 227-003 — [P0] Decay safety (decay_after_sprints'e uy, collapse ETME) — 227-003 Decay safety implemented.
- 227-004 — Brain-integrity regression e2e (3 bug birlikte) — Sprint 227 227-004 — Brain-integrity regression e2e.

## Sprint sprint-226 Learnings
- Sprint sprint-226 Learnings: ## Sprint sprint-226 Learnings

## Gains
- 226-001 — Authority adapter (checkAuthority → AuthorityChecker) — Created authority-adapter.ts wrapping checkAuthority from authority-enforcer.ts.
- 226-002 — Audit adapter (writeEvent → AuditSink) — makeAuditSink(projectRoot, sprintId='autonomous') wraps writeEvent from event-stream.ts.
- 226-003 — Approval gate adapter (nervous Executor → ApprovalGate, OTO-APPROVE YOK) — ApprovalGate adapter that wraps the nervous approval queue (Executor.resolveApproval pattern + 22...
- 226-004 — Action executor adapter (ActionHandler registry → ActionExecutor) — Implemented makeActionExecutor(handlers: Map<string, ActionHandler>): ActionExecutor.
- 226-005 — Trigger source adapter (scheduled-flow + self-dispatch → TriggerSource) — Created src/orchestra/autonomous/trigger-adapter.ts (97 LoC) — makeTriggerSource(deps) factory th...
- 226-006 — [P0] Sürekli loop + composition root (DORMANT'I ÖLDÜRÜR) — Composition root + tick loop: src/orchestra/autonomous/runtime-loop.ts (165 LoC).
- 226-007 — [P0] `deckent autonomous` CLI (start/stop/status, Tier-1 user-surface) — Sprint 226 Task 226-007 — `deckent autonomous` CLI (start/stop/status) Tier-1 user-surface delive...

## Sprint sprint-224 Learnings
- Sprint 224 Learnings: - Sprint sprint-224 Learnings: ## Sprint sprint-224 Learnings
- 224-015 — [P0] AI plan-mode fix (dürüst hata + gerçekten-çalışır): GO_WITH_TECH_DEBT — Implemented honest-fallback for AI planner per directive 224-015.

=== What was done ===
- src/orchestra/planner.ts: Add

## Sprint sprint-223 Learnings
- Sprint 223 Learnings: - Sprint sprint-223 Learnings: ## Sprint sprint-223 Learnings

## Sprint sprint-222 Learnings
- Sprint 222 Learnings: - Sprint sprint-222 Learnings: ## Sprint sprint-222 Learnings

## Sprint sprint-221 Learnings
- Sprint 221 Learnings: - Sprint sprint-221 Learnings: ## Sprint sprint-221 Learnings

## Sprint sprint-220 Learnings
- Sprint 220 Learnings: - Sprint sprint-220 Learnings: ## Sprint sprint-220 Learnings
- 220-003 — Agentic REPL canlı MCP dispatch (doğal dil→gerçek aksiyon): GO_WITH_TECH_DEBT — Worker exited without writing result (exitCode=0)

## Sprint sprint-219 Learnings
- Sprint 219 Learnings: - Sprint sprint-219 Learnings: ## Sprint sprint-219 Learnings
- 219-010 — Dashboard cache-bust + tarayıcı-e2e smoke (8 sayfa gerçekten yüklenir): NO_GO

## Sprint sprint-218 Learnings
- Sprint 218 Learnings: - Sprint sprint-218 Learnings: ## Sprint sprint-218 Learnings

## Sprint sprint-217 Learnings
- Sprint 217 Learnings: - Sprint sprint-217 Learnings: ## Sprint sprint-217 Learnings
- new sprint: NO_GO — Placeholder 'new sprint' task — no implementation work defined. DIRECTIVES.md contains only 'new sprint' with no concret

## Sprint sprint-216 Learnings
- Sprint 216 Learnings: - Sprint sprint-216 Learnings: ## Sprint sprint-216 Learnings
- 216-006 — [P0] serve localhost API-token auto-mint + `__DECKENT_API_TOKEN__` inject → /api/status 200: GO_WITH_TECH_DEBT — Implementation:
  src/api/server.ts:921-935 — `finalToken` changed from `const` to `let`, followed by a 4-line auto-mint
- 216-012 — Memory explorer FTS5 gerçek endpoint (arama gerçek sonuç döndürür): GO_WITH_TECH_DEBT — Implementation:
- src/api/memory-search-endpoint.ts (NEW, 47 LoC): registerMemorySearch() — GET /api/memory/search?q= →

## Sprint sprint-214 Learnings
- Sprint 214 Learnings: - Sprint sprint-214 Learnings: ## Sprint sprint-214 Learnings

## Sprint sprint-212 Learnings
- Sprint 212 Learnings: - Sprint sprint-212 Learnings: ## Sprint sprint-212 Learnings

## Sprint sprint-211 Learnings
- Sprint 211 Learnings: - Sprint sprint-211 Learnings: ## Sprint sprint-211 Learnings

## Sprint sprint-210 Learnings
- Sprint 210 Learnings: - Sprint sprint-210 Learnings: ## Sprint sprint-210 Learnings
- 210-009 — Dashboard sprint kontrol paneli (plan/start/status UI): GO_WITH_TECH_DEBT — SprintControlPanel.tsx is fully implemented: useSSEWithStatus for live data, useApi for fallback, SprintPhaseTimeline +

## Sprint sprint-209 Learnings
- Sprint 209 Learnings: - Sprint sprint-209 Learnings: ## Sprint sprint-209 Learnings

## Sprint sprint-208 Learnings
- Sprint 208 Learnings: - Sprint sprint-208 Learnings: ## Sprint sprint-208 Learnings

## Sprint sprint-207 Learnings
- Sprint 207 Learnings: - Sprint sprint-207 Learnings: ## Sprint sprint-207 Learnings
- 207-001 — Model registry bundled apiId güncel + "stale" işareti: GO_WITH_TECH_DEBT — DONE criteria met: (1) bundled opus apiId updated claude-opus-4-6→claude-opus-4-8 (src/core/model-registry.ts:62). (2) B

## Sprint sprint-206 Learnings
- Sprint 206 Learnings: - Sprint sprint-206 Learnings: ## Sprint sprint-206 Learnings
- 206-003 — docker-oom gracefulTimeout forward fix: NO_GO — Root cause: test expectation was stale, not a source bug. SpawnBackendFactory.create() correctly forwards gracefulTimeou
- 206-004 — auditor.md managed-docs template legacy temizlik: NO_GO — Fixed legacy 'store.insert' → 'store.upsert' in auditor.md template and regenerated all provider rule files. The test wa

## Sprint sprint-205 Learnings
- Sprint 205 Learnings: - Sprint sprint-205 Learnings: ## Sprint sprint-205 Learnings

## Sprint sprint-204 Learnings
- Sprint 204 Learnings: - Sprint sprint-204 Learnings: ## Sprint sprint-204 Learnings
- 204-003 — Implementation intent için built-in agent adaylığı: NO_GO — Added BUILTIN_IMPLEMENTATION_INTENT_RULES map (refactorer=7, architect=6) + applyBuiltinImplementationRules() helper in 
- 204-005 — Native chat streaming response (Path C): NO_GO — F2-003 streaming added to chat-native loop via OPTIONAL ChatProviderAdapter.stream() method yielding StreamChunk { text?
- 204-008 — Multi-tenant tenantId iskelet: NO_GO — Created src/core/tenant-context.ts with TenantContext interface, isValidTenantId(), tenantIsolationPath(), and resolveTe

## Sprint sprint-203 Learnings
- Sprint 203 Learnings: - Sprint sprint-203 Learnings: ## Sprint sprint-203 Learnings
- 203-002 — Docker provider-aware auth mount: GO_WITH_TECH_DEBT — Changed auth mount condition at line 502: added `|| providerBinary !== 'claude'` so ~/.claude is only mounted for claude
- 203-005 — Native chat tool-use loop iskelet (Path C foundation): NO_GO — Path C native chat tool-use loop skeleton delivered.

=== What was built ===
src/cli/commands/chat-native.ts (156 LoC, u
- 203-006 — Chat history memory entegrasyonu (appendChatTurn wire): NO_GO — Wired MemoryStore into chat-native loop via dependency-injected ChatMemoryAdapter interface. Added 3 optional fields (me
- 203-007 — chat-native CLI komut kaydı (deckent chat --native): NO_GO — Added --native flag to `deckent chat`. Changes: (1) Added `import { createInterface } from 'node:readline'` and `import

## Sprint sprint-202 Learnings
- Sprint 202 Learnings: - Sprint sprint-202 Learnings: ## Sprint sprint-202 Learnings
- 202-002 — Ollama model registry (tier→local model): NO_GO — Ollama model registry tier→local model resolution wired — Sprint 202 F1 DALGA 0 Task 2.

IMPLEMENTATION:
1. NEW src/core
- 202-004 — Token throttle (computeBackoff wire + pre-spawn quota gate): NO_GO — Worker exited without writing result (exitCode=0)
- 202-006 — Provider-free smoke verify (sıfır-API-key + Ollama senaryosu): NO_GO

## Sprint sprint-201 Learnings
- Sprint 201 Learnings: - Sprint sprint-201 Learnings: ## Sprint sprint-201 Learnings
- 201-006 — Test baseline 28 → ≤20 attack: NO_GO — TASK GOAL: reduce vitest fail count by ≥8 via the easy doc-sync/snapshot/count-drift lane. ACHIEVED: -8 fails (55 → 47),

## Sprint sprint-200 Learnings
- Sprint 200 Learnings: - Sprint sprint-200 Learnings: ## Sprint sprint-200 Learnings
- 198-002 — memory.db sprint-log finalize bug fix + Sprint 194/196 row backfill: NO_GO — Sprint 198 198-002 (memory.db sprint-log finalize bug fix + Sprint 194/196 row backfill) was already authored in a prior
- 198-003 — managed-docs auditor.md template regression fix: NO_GO — All three regression sources fixed:
1. src/core/rule-templates/auditor.template.md — removed 'Append new patterns to PAT
- 198-006 — Test baseline 41 → 26 attack (en kolay 15 fail): NO_GO — Sprint 200 T-200-006 attack on 18 failing tests across 4 target files.

BASELINE (verified at task start, all 4 files): 
- 198-009 — Memory backup auto-sync mekanizması (user-memory ↔ core-memory): NO_GO — All three deliverables were already implemented from prior sprint work and are fully functional:

1. scripts/sync-core-m

## Sprint sprint-199 Learnings
- Sprint 199 Learnings: - Sprint sprint-199 Learnings: ## Sprint sprint-199 Learnings
- 198-003 — managed-docs auditor.md template regression fix: NO_GO — Fixed the managed-docs auditor template regression (198-003).

**Root cause location:** The template is at `src/core/rul
- 198-005 — 6-worker × 2g config verify + RAM deney readiness audit: NO_GO — Worker exited without writing result (exitCode=0)
- 198-006 — Test baseline 41 → 26 attack (en kolay 15 fail): NO_GO — Worker exited without writing result (exitCode=0)
- 198-007 — Sprint 191-196 retroactive reclassify re-run (12/12 hedef): NO_GO — PREREQUISITE BLOCKER: Sprint 198-002 (memory.db sprint-log finalize + backfill) is not complete. The reclassify script e

## Sprint sprint-197 Learnings
- Sprint 197 Learnings: - Sprint sprint-197 Learnings: ## Sprint sprint-197 Learnings
- 197-004 — WSL2 OOM mitigation (max_workers + worker_memory + adaptive): NO_GO — Sprint 197 task 197-004 — WSL2 OOM mitigation.

1. .deckent/config.json: modes.performance.max_workers 3→2, worker_memor

## Sprint sprint-195 Learnings
- Sprint 195 Learnings: - Sprint sprint-195 Learnings: ## Sprint sprint-195 Learnings
- 195-004 — models.dev bootstrap startup wire: NO_GO — bootstrapFromCatalog added to src/core/model-catalog.ts (~36 LoC: idempotency flag, BootstrapOptions interface, exported

## Sprint sprint-193 Learnings
- Sprint 193 Learnings: - Sprint sprint-193 Learnings: ## Sprint sprint-193 Learnings
- SMOKE-001 — i18n en.json duplicate error.lock_conflict temizle: NO_GO — Worker exited without writing result (exitCode=0)

## Sprint sprint-192 Learnings
- Sprint 192 Learnings: - Sprint sprint-192 Learnings: ## Sprint sprint-192 Learnings
- Placeholder — sprint still in-progress; will be overwritten by finalize.

## Sprint sprint-191 Learnings
- Sprint 191 Learnings: - Sprint sprint-191 Learnings: ## Sprint sprint-191 Learnings
- 191-002 — `runtime_extension_enabled: true` default + worker timeout extension wire: NO_GO
- 191-003 — Sprint 190 retroactive agent stats reclassify + outcome-tracker correction tool: NO_GO — Sprint 191 Task 003 — reclassifyTaskOutcome + agent reclassify CLI command + ADR-046 audit-trail wire.

IMPLEMENTATION:

- 191-004 — Cost-gate planSprint mode-respecting (start.ts:349 fix): NO_GO — Sprint 191 Task 191-004 — Cost-gate planSprint() mode-respecting + AI→structured fallback chain wired.

## Changes

### 
- 191-007 — CLI top-level error handler — silent exit kill: NO_GO — CLI top-level error handler — silent exit kill (Sprint 191 P191-10).

IMPLEMENTATION:
1. src/cli/helpers/error-handler.t
- 191-008 — Memory DB retro entry write hook — Sprint 167 chronic gap closure: NO_GO — Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval require
- 191-009 — IDENTITY.md AUTOGEN block extension (Project Status table managed): NO_GO
- 191-010 — Dashboard non-terminal endpoints token bootstrap fix (auth): NO_GO
- 191-011 — Temp agent PROMPT.md generator template (Sprint 190 7x warning): NO_GO
- 191-012 — Karpathy 4-discipline anchor rule doc (.claude/rules/karpathy-discipline.md): NO_GO
- 191-013 — Built-in agent PROMPT.md Karpathy refactor pass 1 (top 5 agents): NO_GO

## Sprint sprint-190 Learnings
- Sprint 190 Learnings: - Sprint sprint-190 Learnings: ## Sprint sprint-190 Learnings
- Docker OOM cycle drove ~14 false NO_GO (reclassify pending Sprint 191 Task 003)
- 190-009 Ollama adapter: TECH_DEBT — list parse/tier mapping incomplete (Sprint 191 Task 017 closure)
- Backfilled retroactively per Sprint 191 Task 008.

## Sprint sprint-189 Learnings
- Sprint 189 Learnings: - Sprint sprint-189 Learnings: ## Sprint sprint-189 Learnings
- 189-009 deckent_kill MCP parite: NO_GO — investigate root cause
- 189-011 API endpoint E2E test suite: NO_GO — investigate root cause
- Backfilled retroactively per Sprint 191 Task 008.

## Sprint sprint-188 Learnings
- Sprint 188 Learnings: - Sprint sprint-188 Learnings: ## Sprint sprint-188 Learnings

## Sprint sprint-187 Learnings
- Sprint 187 Learnings: - Sprint sprint-187 Learnings: ## Sprint sprint-187 Learnings

## Sprint sprint-186 Learnings
- Sprint 186 Learnings: - Sprint sprint-186 Learnings: ## Sprint sprint-186 Learnings
- Audit src/core/cascade-detector.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/ci-learning.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/condition-evaluator.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config-migration.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config-types.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config-validator.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/constants.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/cost-calculator.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/cost-config-loader.ts: NO_GO — Worker exited without writing result (exitCode=0)

## Sprint sprint-185 Learnings
- Sprint 185 Learnings: - Sprint sprint-185 Learnings: ## Sprint sprint-185 Learnings

## Sprint sprint-183 Learnings
- Sprint 183 Learnings: - Sprint sprint-183 Learnings: ## Sprint sprint-183 Learnings
- W3-3 — v1.0.0-beta.1 final smoke (build:all + vitest + dashboard + serve): NO_GO — W3-3 final smoke gate: 6/6 GREEN. Read-only verification task, no source changes. Gate-by-gate: (1) `npm run build:all`

## Sprint sprint-182 Learnings
- Sprint 182 Learnings: - Sprint sprint-182 Learnings: ## Sprint sprint-182 Learnings
- W1-1 — Mock hygiene: orphan-cleaner-ipc + archive-debt `renameSync` ekle: NO_GO — Worker exited without writing result (exitCode=0)
- W1-3 — Full vitest sweep CI=true parity verify: NO_GO — Worker exited without writing result (exitCode=0)
- W2-2 — Auto-debt prepend offset drift fix (Dependencies title-prefix resolver): NO_GO — Worker exited without writing result (exitCode=0)
- W3-PQ-7 — Integration smoke: Sprint 181-001/002 prompt regression: NO_GO — Worker exited without writing result (exitCode=0)
- W4-1 — Beta launch smoke: validate:publish 6/6 gate green: NO_GO — W4-1 Beta launch smoke — validate:publish 6/6 GREEN, exit 0.

Gate verdicts:
  [PASS] pack_size_and_count — 2.7 MB (2,83

## Sprint sprint-181 Learnings
- Sprint 181 Learnings: - Sprint sprint-181 Learnings: ## Sprint sprint-181 Learnings
- W1-1 — CI workflow'una dashboard deps install adımı ekle: NO_GO — W1-1 primary fix tamamlandı: (1) .github/workflows/ci.yml typecheck job'una `npm ci --prefix src/dashboard --ignore-scri

## Sprint sprint-180 Learnings
- Sprint 180 Learnings: - Sprint sprint-180 Learnings: ## Sprint sprint-180 Learnings
- W1-1 — sprint-state-tracker getSprintStateSnapshot (Step B): NO_GO — W1-1 sprint-state-tracker — getSprintStateSnapshot(projectRoot) exports a fresh SprintStateSnapshot built from .deckent/
- W1-2 — Nervous bootstrap fabrika (Step A): GO_WITH_TECH_DEBT — W1-2 — Nervous bootstrap fabrika tamamlandı. `createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider, act
- W2-1 — Nervous action handlers (Step C): GO_WITH_TECH_DEBT — W2-1 — Nervous action handlers (Step C) implemented per NERVOUS-TODO §11.2 Step C. Module exports: ActionHandlerResult (
- W3-1 — Sprint-controller nervous wire (Step D): GO_WITH_TECH_DEBT — Sprint 180 W3-1 — Sprint-controller nervous wire (Step D) tamamlandı. NERVOUS-TODO §11.2 Step D wire eklendi: runSprint(
- W3-2 — Faz 1 smoke config: NO_GO — W3-2 Faz 1 smoke config tamamlandı. nervous_system.mode: balanced→strict, notifications.severity_min: info→critical. 3 d
- W3-3 — Nervous integration runtime test: GO_WITH_TECH_DEBT — W3-3 — Nervous integration runtime test landed: tests/nervous/integration-runtime.test.ts (257 LoC). Drives the full ner
- W4-1 — Worker .result coverage zorunluluk ★ BETA MUST: GO_WITH_TECH_DEBT — Sprint 180 W4-1 — Worker .result coverage zorunluluk implemented across 2 source files + 1 new test file.

## Bug Fix Re
- W4-2 — Panic guard onay UI (Layer 3 synergy): GO_WITH_TECH_DEBT — W4-2 — Panic guard onay UI Sprint 179 dogfood keşfi ([[project-panic-guard-no-approval-ui]]) çözümlendi. 3 path land ett
- W4-3 — Self-audit gate vitest fix ★ BETA MUST: NO_GO — Worker exited without writing result (exitCode=0)
- W5-1 — npm publish v1.0.0-beta.1 readiness ★ BETA LAUNCH: NO_GO — W5-1 npm publish readiness — 6 gate validator + 20 unit tests + package.json wiring. DELIVERABLES: (1) scripts/validate-

## Sprint sprint-179 Learnings
- Sprint 179 Learnings: - Sprint sprint-179 Learnings: ## Sprint sprint-179 Learnings
- W0-1 — Dependency aggregate fix-aware (Bug A foundation): GO_WITH_TECH_DEBT — W0-1 (Bug A foundation) tamamlandı. TDD akışı RED→GREEN. 5/5 case PASS: (a) getAggregateVerdict ana NO_GO + fix DONE → D
- W1-1 — Auto-debt empty-scope inheritance: GO_WITH_TECH_DEBT — W1-1 Auto-debt empty-scope inheritance implemented. (1) DebtItem extended with optional class ('verified-no-result' | 's
- W2-3 — DEP0190 shell:true win32-only conditional: GO_WITH_TECH_DEBT — DEP0190 fix: 3 call-sites changed from shell:true to shell:process.platform==='win32'.
- src/core/plugin-hooks.ts:399 (r
- W2-7 — CI-only test flakes (PID portability + mock hygiene): GO_WITH_TECH_DEBT — W2-7 CI-only test flakes — final hygiene. Pre-work audit: src/core/pid-liveness.ts already shipped (Sprint 178 Task 4 fo
- W3-5 — Dashboard TS errors + root lint wire: GO_WITH_TECH_DEBT — W3-5 implementation per sub-project #2 plan Task 5. (1) NEW src/dashboard/src/i18n/types.ts: Translator (strict, key: Tr
- W3-6 — doctor DECISIONS.md obsolete + 5-file cascade: GO_WITH_TECH_DEBT — W3-6 doctor DECISIONS.md obsolete + 5-file cascade COMPLETE. TDD RED→GREEN: 2 tests in tests/cli/doctor-memory-v2.test.t
- W4-8 — Prompt guard (I1 + I2 invariants) ★ BETA MUST: GO_WITH_TECH_DEBT — W4-8 Prompt Guard (I1 + I2) tamamlandı. matchPromptPatterns() 3 pattern (base_blob ≥256, osc_escape, curl_pipe_shell) + 
- W4-9 — Command guard (I3 default-deny remote) ★ BETA MUST: GO_WITH_TECH_DEBT — W4-9 Command Guard (I3 default-deny remote) — TDD complete.

IMPLEMENTATION (src/api/terminal/command-guard.ts, NEW):
- 
- W5-11 — mTLS hook (AuthProvider interface) ★ BETA MUST: GO_WITH_TECH_DEBT — W5-11 mTLS hook (AuthProvider interface) tam implement edildi. AuthProvider interface'e optional `verifyClientCert?(cert

## Sprint sprint-178 Learnings
- Sprint 178 Learnings: - Sprint sprint-178 Learnings: ## Sprint sprint-178 Learnings
- Fix debt: Tech debt from 175-020-fix: All 5 automatic verification gates executed:

1. npm: NO_GO — Priority fix for debt-175-020-fix (CRITICAL, open 3 sprints). Task JSON ships with EMPTY scope (scope.directories=[], sc

## Sprint sprint-177 Learnings
- Sprint 177 Learnings: - Sprint sprint-177 Learnings: ## Sprint sprint-177 Learnings
- Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented: NO_GO — Worker exited without writing result (exitCode=0)
- 177-003 — Tmux backend deprecate path: GO_WITH_TECH_DEBT — 3 required TDD tests PASS (default→docker + explicit-warns + warn-once). Functional requirements fully met: resolveBacke

## Sprint sprint-176 Learnings
- Sprint 176 Learnings: - Sprint sprint-176 Learnings: ## Sprint sprint-176 Learnings
- Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented: NO_GO — REFUSED — empty-scope debt-injection dispatch. The task as dispatched is a live reproduction of the exact bug that W1-1 
- W1-1 — Auto-debt empty-scope inheritance: NO_GO — Worker exited without writing result file
- W1-2 — Re-plan orphan task file cleanup: NO_GO
- W2-3 — DEP0190 shell:true win32-only conditional: NO_GO — Fixed DEP0190 deprecation: 3 call-sites changed from shell:true to shell:process.platform==='win32'. (1) src/core/plugin
- W2-4 — Coverage hard-floor / aspirational split: NO_GO — Worker exited without writing result file
- W3-5 — Dashboard TS errors + root lint wire: NO_GO — Worker exited without writing result file
- W3-6 — doctor DECISIONS.md obsolete + 5-file cascade: NO_GO — Worker exited without writing result file
- W2-7 — CI-only test flakes (PID portability + mock hygiene): NO_GO — Worker exited without writing result file
- W4-8 — Prompt guard (I1+I2): NO_GO — Worker exited without writing result file
- W4-9 — Command guard (I3 default-deny remote): NO_GO — Worker exited without writing result file

## Sprint sprint-175 Learnings
- Sprint 175 Learnings: - Sprint sprint-175 Learnings: ## Sprint sprint-175 Learnings
- W1.2 — SessionBackend + LocalPtyBackend: NO_GO — W1.2 — SessionBackend interface + LocalPtyBackend implementation, plan §Task 1.2 ile birebir aynı. RED→GREEN TDD akışı:

- W1.4 — PtySessionManager: NO_GO — W1.4 PtySessionManager — implemented per plan §1.4. TDD: wrote 4 tests first (bounded ring, detach≠kill, maxSessions, id
- W2.2 — HTTP control + localhost bootstrap inject: NO_GO — Worker exited without writing result (exitCode=0)
- W3.3 — TerminalView (xterm): NO_GO — W3.3 TerminalView (xterm) — TDD complete. RED phase confirmed: 'Failed to resolve import TerminalView' before implementa
- W3.4 — TerminalTabs + TerminalPanel: NO_GO — W3.4 multi-tab TerminalPanel + quick-launch (claude/gemini/codex/deckent/shell) implemented per plan §3.4 verbatim. TDD 
- W3.5 — DockPanel + Layout: NO_GO — W3.5 DockPanel + Layout integration complete (TDD).

## Deliverables
1. src/dashboard/src/components/DockPanel.tsx (NEW,
- W3.6 — ConfigPage Terminal kategori + i18n: NO_GO — Added 5 Terminal config fields (terminal.enabled, terminal.allowShellKind, terminal.maxSessions, terminal.idleTimeoutMs,
- W4.1 — E2E reattach integration: NO_GO — W4.1 — E2E reattach integration test implemented per Plan §Task 4.1 and DIRECTIVES Task 18.

Flow (1 it(), real `node-pt
- W4.3 — Final verification: GO_WITH_TECH_DEBT — Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval require

## Sprint sprint-174 Learnings
- Sprint 174 Learnings: - Sprint sprint-174 Learnings: ## Sprint sprint-174 Learnings
- Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp: NO_GO — Worker exited without writing result (exitCode=0)

## Sprint sprint-173 Learnings
- Sprint 173 Learnings: - Sprint sprint-173 Learnings: ## Sprint sprint-173 Learnings

## Sprint sprint-172 Learnings
- Sprint 172 Learnings: - Sprint sprint-172 Learnings: ## Sprint sprint-172 Learnings
- C1 — update-readme-stats.mjs auto-gen + CI gate: NO_GO — TDD discipline: önce tests/scripts/update-readme-stats.test.ts yazıldı (RED — script yok, import fail), sonra scripts/up
- C2 — reference docs auto-gen (MCP/ADR/CLI/agents): NO_GO — Sprint 172 Task C2 — reference docs auto-gen (5 üretici TDD). RED: tests/scripts/gen-reference-docs.test.ts ilk çalıştır
- C3 — lint:link dead-link gate: NO_GO — Sprint 172 C3 — lint:link dead-link gate. TDD RED→GREEN: 28/28 unit test pass. `node scripts/lint-links.mjs` exit 0 (156
- B1 — archive DB-parity doğrulama (B2 ön-koşulu): NO_GO — B1 archive ↔ memory.db parity verifier tamamlandı (read-only). Çıktı: 23 parity-OK retro + 196 DB-eksik (121 sprint + 75
- B2 — .gitignore/.npmignore + archive git rm --cached: NO_GO — B2 tamamlandı — kısmi (B1 parity eksikliği nedeniyle). 

## DONE:
1. .gitignore §4.3 bloğu eklendi: sprint-*-tasks/, spr
- B5 — deckent-hub kararı + examples workspace fix: NO_GO — Step 1 TAMAMLANDI: examples/quickstart/package.json 'workspace:*' → '^1.0.0-beta.1'. OSS kullanıcıları artık 'npm instal

## Sprint sprint-171 Learnings
- Sprint 171 Learnings: - Sprint sprint-171 Learnings: ## Sprint sprint-171 Learnings
- Doc Audit Root: NO_GO — Sprint 171 Task 23 — Doc Audit Root tamamlandı. Repo kökündeki 19 markdown dosyası tek tek denetlendi (DIRECTIVES'in idd

## Sprint sprint-170 Learnings
- Sprint 170 Learnings: - Sprint sprint-170 Learnings: ## Sprint sprint-170 Learnings
- P0-3 Tmux Prompt Filename TaskId-Aware: GO_WITH_TECH_DEBT — Sprint 170 P0-3 (Bug 2B / ADR-048 §Negative closure) — fix architecturally complete; 3/3 mandated TDD tests GREEN; 5 pre
- P0-5 Docker Spawn Race Window Closure: GO_WITH_TECH_DEBT — P0-5 Docker Spawn Race Window Closure — Sprint 169 Bug 2A eradication. TDD red-green disciplined: 6 tests written first 
- Fix: P0-6 Event Stream Prompt Write/Delete Visibility: NO_GO — Worker exited without writing result (exitCode=0)
- P0-6 Event Stream Prompt Write/Delete Visibility: GO_WITH_TECH_DEBT — P0-6 Event Stream Prompt Write/Delete Visibility tamamlandı.

## Yapılanlar
1. src/orchestra/event-stream.ts: CHANNELS.P

## Sprint sprint-169 Learnings
- Sprint 169 Learnings: - Sprint sprint-169 Learnings: ## Sprint sprint-169 Learnings
- W3.1 C0c Collision Detection Live Trigger Investigation + Fix: NO_GO — W3.1 RC identified as path-normalization gap (RC-C from plan §2.1). `detectScopeCollisions` (conflict-resolver.ts:173) c
- W3.2 Smoke Directive Dependency Parser Fix: NO_GO — Sprint 169 W3.2 fix: parseDependencyField helper added (src/orchestra/task-builder.ts:186) accepting 3 formats — bare st
- C1 Memory Relations Migration: NO_GO — Sprint 169 C1 — Memory Relations Migration complete.

What changed:
1. src/core/memory-types.ts — added MemoryRelation i
- H2 Stub Memory Entries Backfill: NO_GO — Sprint 169 H2 — Stub Memory Entries Backfill implemented per plan Task 4 (Steps 4.1-4.5, 4.7). Added MemoryStore.update(
- H3 OSS Pre-Flip Secret Scan Baseline: NO_GO — H3 OSS Pre-Flip Secret Scan Baseline — 3/3 deliverable şartı eksiksiz. (1) scripts/security/secret-baseline.mjs: 10 rege
- H4 Dashboard Build CI Gate: NO_GO — H4 Dashboard Build CI Gate tamamlandı. Yeni .github/workflows/dashboard-build.yml workflow'u: Node 18.x/20.x/22.x matrix
- H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook: NO_GO — Sprint 169 H1 — ADR DB→FS Export Pipeline + ADR-046 Bi-Directional Hook amendment COMPLETE. (1) src/core/memory-export.t

## Sprint sprint-168 Learnings
- Sprint 168 Learnings: - Sprint sprint-168 Learnings: ## Sprint sprint-168 Learnings
- T3 Kill Recovery Simulation (DEPENDS T1): NO_GO — Task blocked by unmet dependency. Task 168-003 (T3 Kill Recovery Simulation) depends on task sprint-168-smoke-T1 (T1 Sco

## Sprint sprint-167 Learnings
- Sprint 167 Learnings: - Sprint sprint-167 Learnings: # Sprint sprint-167 Learnings

Sprint 167 Read-Only Self-Audit deliverable'ları (kaynak: .audit/sprint-167/T*.md — hiçbir source/doc mutasyonu yok, salt tespit).

## T1 — Code Inventory + Dead Code + Unused Features (167-001, code-reviewer)
Kaynak: .audit/sprint-167/T1-code-inventory.md. Kod envanteri + ölü kod + kullanılmayan feature taraması (Sprint 171 dead-code audit'inin öncülü).

## T2 — Doc Inventory + Reference Validation + Ground-Truth (167-002, doc-writer)
Kaynak: .audit/sprint-167/T2-doc-inventory.md. READ-ONLY doc envanteri + kırık referans + ground-truth doğrulama. (Sprint 167 retro NO_GO bu task'tı.)

## T3 — ADR Compliance + Status (167-003, code-reviewer)
Kaynak: .audit/sprint-167/T3-adr-compliance.md. 50 ADR enumeration (DB↔FS parity) + 8 ADR runtime compliance + ADR-046 Step 1-4 wire canlı trigger + identity-generator Step 2 decommission önerisi + ADR-053/055/060 (Sprint 156'dan beri proposed) closure önerisi. Tümü Sprint 168 suggested_fix input'u.

## T4 — Memory.db + Data Integrity (167-004, data-engineer)
Kaynak: .audit/sprint-167/T4-memory-integrity.md. memory.db schema + FTS5 + relations integrity (Sprint 171 memory-db-integrity audit'inin öncülü).

## T5 — Brain/Worker/Auditor Wire + Manuel Survival (167-005, bug-fixer FORENSIC)
Kaynak: T5-brain-wire-audit.md + T5-brain-debug-phase1.md + T5-brain-debug-phase2.md. 9 Brain orchestration bug + BUG-HH forensic; 5 cluster pattern analysis; manuel survival pattern kanıtı (ADR-047 input).

## T6 — Test + Build + Security + OSS Readiness (167-006, security-auditor)
Kaynak: .audit/sprint-167/T6-test-build-security.md. tsc PASS / vitest 2 fail / OSS gate readiness forensic.

## T7 — Cross-Cutting Synthesis + Brain Crash Addendum (167-007, architect)
Kaynak: T7-cross-cutting-synthesis.md + T7-brain-crash-addendum.md. Meta-audit konsolidasyon + Alperen request Brain crash sebep detayı (live evidence).

## Kalıcı Öğrenim
- ADR-046 hook chain Sprint 161/163/166/167 dört kez wire denendi, hâlâ kısmî → BA-05'in (Sprint 171) doğrudan kökü; tam crash-safe fix post-GA integrity-V2 sprintine.
- Sprint metrics math guard (Duration negatif / Coverage NaN) sprint-167.md'de canlı kanıt — finalize crash imzası.
- Read-only self-audit deseni Sprint 171'in 29-task mega-audit'inin doğrudan atası.

## Sprint sprint-166 Learnings
- Sprint 166 Learnings: - Sprint sprint-166 Learnings: # Sprint sprint-166 Learnings

## 4 Architectural Root Cause Fix
1. **Bug M (adrInsert hook):** docs/adr/*.md → memory.db migration eksikti. Step 3 unconditional invocation pattern + syncAdrFilesToDb upsert ile çözüldü. ADR-046 Section 5.1 Step Ordering Contract kontract.
2. **Bug N (onRuleRegen wire):** Manuel finalize path .claude/rules/*.md regenerate etmiyordu (13 sprint stale). finalize.ts:166 callback wire + rule-generator.ts CUSTOM_TEMPLATE empty placeholder.
3. **Bug S (sprint-aware cache key):** doc-cache.ts cache key fileHash+entryHash idi, sprint.id eklendi. Runner wire-up Sprint 167'e ertelendi (GO_WITH_TECH_DEBT).
4. **Bug Y2 (ground-truth defense):** Doc-sync agent'lar stale numeric claim üretiyordu (15 vs 16 agents Sprint 164 regression). 3-layer defense (plan-time + helper + runtime) + .deckent/ground-truth-overrides.json whitelist.

## Key Decision: ADR-046 Brain Self-Update Hook Architecture
- Post-finalize hook chain architectural contract dokümante
- Step ordering: Step 1 memoryExport → Step 2 identityRegen (deprecated) → Step 3 adrInsert → Step 4 ruleRegen → Step 5 updateProjectDocs
- 3 mimari prensip: unconditional invocation, cache key completeness, single registration target
- Falsifiable M1-M4 monitoring criteria for Sprint 167-168
- Sprint 170 refactor trigger criteria documented

## Manuel Survival Pattern (Sprint 164→165→166 zincir kanıt)
- Brain SPAWN/finalize otomatik chain çalışmıyor, manuel müdahale ile her sprint başarılı
- npx deckent spawn <task-id> --auto-approve (CLI proven)
- npx deckent run "<description>" (sprint-dışı proven)
- Wave 1.5 strict gate manuel CHECKPOINT (npx deckent memory rebuild + decision JSON)

## 4 New Bug Live Replay (Sprint 167 P0)
- **Bug E:** Spawn-lock leak — DECKENT.md, .md, brain.md bare token lock conflict, 3× replay aynı sprint
- **Bug G:** OOM exit 137 — Container 4GB → 8GB workaround proven (spawn-backend-docker.ts:374)
- **Bug Z2:** Planner Files parser — DIRECTIVES.md Files: listesinden bare token üretiyor (.md, brain.md, git commit hash)
- **Bug Z3:** memory rebuild semantic — destructive (delete-or-error, exports yetersiz). Sprint 167'de fix: rebuild = export, import = new command

## Bug V Backfill Manuel Test
- T6 commit "production backfill ran 100 debt rows" — DB'de hâlâ NULL bulundu (Sprint 166 sonu inspection)
- Worker farklı db kullandığı veya code-path canlı tetiklenmediği için
- Sprint 166 manuel backfill script (bu script) ile bu açık kapatıldı (UPDATE entries SET sprint_id=metadata.originSprintId)

## Sprint sprint-165 Learnings
- Sprint 165 Learnings: - Sprint sprint-165 Learnings: ## Sprint sprint-165 Learnings
- Sprint 165 Learnings: # sprint-165

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 12909690ms |
| Files Changed | - |

## Agents
Agents: -
Skills: -

## Tasks
| Task | Agent | Skills | Status |
|------|-------|--------|--------|

## Sprint sprint-164 Learnings
- Sprint 164 Learnings: - Sprint sprint-164 Learnings: ## Sprint sprint-164 Learnings
- Vitest Gate +1 Fail Closure — Chronic Regression Eradication: NO_GO — Vitest gate +1 fail chronic regression closure — TAMAMLANDI. Discovery: full vitest run 17 fail / 8 dosya tespit etti (n

## Sprint sprint-163 Learnings
- Sprint 163 Learnings: - Sprint sprint-163 Learnings: ## Sprint sprint-163 Learnings

## Sprint sprint-162 Learnings
- Sprint 162 Learnings: - Sprint sprint-162 Learnings: ## Sprint sprint-162 Learnings
- Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite): GO_WITH_TECH_DEBT — T-003 composite (phase observability + EvaluationAuditTrail runtime wire) complete. persistPhaseTransition helper export
- Crash Injection Integration Test + E2E Smoke (T-007): NO_GO — T-007 — 9/9 tests PASS (6 crash injection + 3 e2e smoke). Crash file: 6 it() blocks S1-S6 (grep -nE 'S[1-6]:' → 18 match

## Sprint sprint-161 Learnings
- Sprint 161 Learnings: - Sprint 161 Learnings: Sprint 161 learnings — no .brain/sprints/sprint-161.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-160 Learnings
- Sprint 160 Learnings: - Sprint 160 Learnings: Sprint 160 learnings — no .brain/sprints/sprint-160.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-159 Learnings
- Sprint 159 Learnings: - Sprint 159 Learnings: # sprint-159

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 2 |
| Tech Debt | 2 |
| No-Go | 13 |
| Coverage | NaN% |
| Duration | -106ms |
| Files Changed | - |

## Agents
Agents: temp-react-ts-specialist, doc-writer
Skills: typescript-expert, system-architect, security-specialist, documentation-writer, ci-testing

## Tasks
| Task | Agent | Skills | Status |
|------|-------|--------|--------|
| 159-001: EvaluationAuditTrail Foundation | temp-react-ts-specialist | typescript-expert, system-architect | GO_WITH_TECH_DEBT |
| 159-002: Dual-Evaluator Race Close (Bug X) | temp-react-ts-specialist | typescript-expert, system-architect | GO_WITH_TECH_DEBT |
| 159-003: Sprint-Stall Fix-Fix Spawn Loop | temp-react-ts-specialist | typescript-expert, system-architect | NO_GO |
| 159-004: handleEvaluation → updateTaskStatus Wire | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-005: Heartbeat Write Atomicity | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-006: sprint-state.json Phase Transition Update | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-007: scoreTestCoverage null Neutral Score | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-008: AUDIT_RUBRIC Dinamik Threshold | temp-react-ts-specialist | typescript-expert, system-architect | NO_GO |
| 159-009: Retro Naming Off-By-One Fix | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-010: sprint-phases.ts cleanup 'spawn-fail' Argument | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-011: DeckentConfig dependency_pipeline_enabled Field | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-012: Per-Change Security Review | doc-writer | security-specialist, documentation-writer | NO_GO |
| 159-013: 2 Yeni ADR Draft | doc-writer | system-architect, documentation-writer | NO_GO |
| 159-014: EvaluationAuditTrail E2E Smoke Test | temp-react-ts-specialist | typescript-expert, ci-testing | NO_GO |
| 159-015: Sprint 157 Retro + Bug Close Forensic | doc-writer | documentation-writer | NO_GO |

## Sprint sprint-158 Learnings
- Sprint 158 Learnings: - Sprint 158 Learnings: Sprint 158 learnings — no .brain/sprints/sprint-158.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-157 Learnings
- Sprint 157 Learnings: - Sprint 157 Learnings: Sprint 157 learnings — no .brain/sprints/sprint-157.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-156 Learnings
- Sprint 156 Learnings: - Sprint sprint-156 Learnings: ## Sprint sprint-156 Learnings
- Workflow Rename VERIFY (read-only audit): NO_GO — Audit-only task completed. All 3 primary workflow files (ci.yml, docs.yml, cross-platform-e2e.yml) confirmed to use bran
- dependency_pipeline_enabled Default Flip: NO_GO — Sprint 156 Task 2 — dependency_pipeline_enabled default flipped from undefined (falsy) → true. Three precise changes ins
- Cascade/Unblock Runtime Wire: GO_WITH_TECH_DEBT — Sprint 156 Task 003 complete. Wired applyCascadeToSprint into runEvaluatePhase (after each NO_GO with a real result file
- Task Tmpfile Cleanup Discipline: NO_GO — Sprint 156 Task 4 — Task Tmpfile Cleanup Discipline. Three changes:

1) spawn-backend-docker.ts:567-581 — Removed the in
- IDEMPOTENCY_KEY Worker Prompt Inject: NO_GO — IDEMPOTENCY_KEY worker prompt + container env injection wired end-to-end. (1) spawn-backend-docker.ts dockerArgs: append
- Brain Self-Rebuild Gate (NO BUILD CALL): GO_WITH_TECH_DEBT — Sprint 156 Task 008 — Brain Self-Rebuild Gate (NO BUILD CALL) implemented.

WHAT WAS DONE:
1. src/orchestra/sprint-phase
- assertSpawnSafe Whitelist Runtime: NO_GO — HONEST SELF-ASSESSMENT: Module + tests fully shipped (100% of in-scope work). spawn-backend-docker.ts wire-up explicitly
- Runtime File Lock (flock spawn-time): NO_GO — Implemented spawn-time `.spawnlock` API in src/core/file-lock.ts (acquireSpawnLock, releaseSpawnLock, acquireSpawnLocks 
- EffectClass Annotation rubric-registry: GO_WITH_TECH_DEBT — EffectClass annotation eklendi. src/orchestra/rubric-registry.ts'e: (1) EffectClass type union ('pure'|'reversible'|'ide

## Sprint sprint-155 Learnings
- Sprint 155 Learnings: - Sprint sprint-155 Learnings: ## Sprint sprint-155 Learnings

## Sprint sprint-154 Learnings
- Sprint 154 Learnings: - Sprint sprint-154 Learnings: ## Sprint sprint-154 Learnings
- RubricRegistry Core Foundation: NO_GO — RubricRegistry foundation created at src/orchestra/rubric-registry.ts (196 LoC). Spec compliance: (1) TaskType taxonomy 
- RubricRegistry Test Suite: NO_GO — Created tests/orchestra/rubric-registry.test.ts with 26 test cases (exceeds 20+ requirement): isAuditTask (7), isDocumen

## Sprint sprint-153 Learnings
- Sprint 153 Learnings: - Sprint sprint-153 Learnings: ## Sprint sprint-153 Learnings
- Brain 8-Phase Sprint Lifecycle: NO_GO — Brain 8-Phase Sprint Lifecycle dokümantasyonu oluşturuldu. Her faz için Amaç, Kritik Karar ve Temel I/O bölümleri yazıld
- Memory V2 SQLite Schema: NO_GO — Memory V2 SQLite schema documentation written. File docs/smoke-2026-05-12/T-SMOKE-03.md created with 1001 words (minimum
- Multi-Provider Routing: NO_GO — docs/smoke-2026-05-12/T-SMOKE-04.md oluşturuldu. 587 kelime (gerekli ≥200). İçerik: multi-provider genel bakış tablosu, 
- Nervous System Detector'ları: NO_GO — T-SMOKE-06.md oluşturuldu: 982 kelime (≥200 minimum karşılandı). 11 detector tam olarak belgelendi: stale-worker, scope-
- Ed25519 Skill Signature: NO_GO — T-SMOKE-07.md yazıldı: 722 kelime (≥200 şart karşılandı). Kapsanan konular: OpenClaw %20 malicious skill problemi, Ed255
- Sprint Kill ve Cleanup Disiplini: NO_GO — T-SMOKE-08.md oluşturuldu. 679 kelime (≥200 koşulu sağlandı). Sprint kill kullanıcı onayı zorunluluğu, Nervous System lo
- ADR-008 Unidirectional Imports: NO_GO — ADR-008 Unidirectional Imports dokümantasyonu oluşturuldu. 773 kelime (≥200 eşiği aşıldı). Kapsam: Brain→orchestra→core 
- Beta GA 20-Gate Listesi: NO_GO — Beta GA 20-Gate dökümanı oluşturuldu. Her kapı için açıklama, ölçüm kriteri ve Sprint 152 sonu durumu (PASS/IN_PROGRESS)

## Sprint sprint-152 Learnings
- Sprint 152 Learnings: - Sprint 152 Learnings: Sprint 152 learnings — no .brain/sprints/sprint-152.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-151 Learnings
- Sprint 151 Learnings: - Sprint sprint-151 Learnings: ## Sprint sprint-151 Learnings
- Public Repo Flip — VerhexIO/deckent-dev → VerhexIO/deckent: GO_WITH_TECH_DEBT — DURUM: ../deckent-public dizini mevcut değil — Alperen'in önce git clone yapması gerekiyor. Handoff dökümanı bu senaryoy
- Discord Bot Deploy + Smoke Test: GO_WITH_TECH_DEBT — ## Tamamlanan İşler

**scripts/deploy-discord.sh** (yeni, ~185 satır):
- Prereq kontrolü: Node >= 18, .deck dosyası, DIS
- Nervous System 6-10 Detector Activation (Sprint 147 Plan): GO_WITH_TECH_DEBT — 5 yeni nervous system detector oluşturuldu (6→11 toplam): BuildFailureRecurrenceDetector, TokenSpikeDetector, AgentRouti

## Sprint sprint-150 Learnings
- Sprint 150 Learnings: - Sprint sprint-150 Learnings: ## Sprint sprint-150 Learnings
- Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt): GO_WITH_TECH_DEBT — Docker Worker Exit Pattern Final Fix completed. 3 changes: (1) containers Map now stores {containerId, model} so host-si
- Scope Sanitizer Code Snippet False Positive Fix (Sprint 148 Debt): NO_GO — All requirements from Sprint 148 debt already implemented in Sprint 149. Verified: (1) isPlaceholderPath() rejects foo/b
- Auditor Stale Alert Race Condition Fix (Sprint 148 Debt): GO_WITH_TECH_DEBT — Auditor stale alert race condition fix was already implemented in Sprint 149 (auditor.ts lines 293-316 + heartbeat-types
- VerhexIO/deckent-hub Repo Create + Templates: GO_WITH_TECH_DEBT — deckent-hub/ local dizin scaffold tamamlandı. Docker worker tarafından önceden yazılmış tüm dosyalar doğrulandı ve eksik
- AGENTS.md Refresh (39 Sprint Behind): NO_GO — AGENTS.md dosyası incelendi. Sprint 149'da zaten güncel durumda: 15 built-in agent (ADR-041 reform sonrası), 'test-write
- npm pack --dry-run + Version Bump 1.0.0-beta.1: GO_WITH_TECH_DEBT — npm pack --dry-run PASSES: tarball 1.08MB (<2MB limit), no secrets, no sensitive dirs, all 6 package.json metadata field
- `cleanOrphanIpcDirs` Wire-Up with Live-PID Check: NO_GO — cleanOrphanIpcDirs function updated: new sync API with live-PID check support (opts: { checkLivePid, minAgeMs }). Old as
- Feature Manifest Canlılaştırma (Tam Scope): GO_WITH_TECH_DEBT — Feature Manifest Canlılaştırma — 7 adımlı plan tamamlandı:

1. scripts/sync-manifest.mjs (~230 LoC): 31 feature tanımlı,
- `deckent audit` + `deckent recover` User-Facing CLI + MCP Yüzeyi: GO_WITH_TECH_DEBT — Implemented `deckent audit` + `deckent recover` CLI commands and `deckent_audit` + `deckent_recover` MCP tools. Full ADR

## Sprint sprint-149 Learnings
- Sprint 149 Learnings: - Sprint sprint-149 Learnings: ## Sprint sprint-149 Learnings
- `deckent mode` CLI Command: GO_WITH_TECH_DEBT — Created `deckent mode` CLI command with 5 subcommands: show, sprint, task, auto, global. Follows ADR-012 register<Name>(

## Sprint sprint-148 Learnings
- Sprint 148 Learnings: - Sprint sprint-148 Learnings: ## Sprint sprint-148 Learnings
- Vitest Triage — 135 Fail → < 50 Fail: NO_GO — Docker worker exited without writing result file
- Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix: GO_WITH_TECH_DEBT — Docker Worker Exit Pattern root cause fixed. Problem: Container SIGKILL (exit 137, OOM kill) bypasses all shell traps —

## Sprint sprint-147 Learnings
- Sprint 147 Learnings: - Sprint sprint-147 Learnings: ## Sprint sprint-147 Learnings

## Sprint sprint-146 Learnings
- Sprint 146 Learnings: - Sprint sprint-146 Learnings: ## Sprint sprint-146 Learnings
- Agent Truncation Bug Fix: GO_WITH_TECH_DEBT — Root cause: task-builder.ts:761 had `agentPrompt.slice(0, 2000)` which truncated agent prompts to 2000 chars. This cause
- ADR Relevance Scoring Engine: GO_WITH_TECH_DEBT — ADR Relevance Scoring Engine implemented. Created src/orchestra/adr-selector.ts (~330 LoC) with: selectRelevantAdrs() sc
- Scope Sanitizer: GO_WITH_TECH_DEBT — Created scope-sanitizer.ts with 8 filter rules (absolute path reject, path traversal reject, dist/ remove, extension-onl
- Generative Useful God Template — buildTaskPrompt Single Entry: GO_WITH_TECH_DEBT — buildTaskPrompt() implemented as single entry point in prompt-god-template.ts (~270 LoC). Pipeline: agent block → skill 
- DIRECTIVES.md Mid-Sprint Silme Bug Fix: GO_WITH_TECH_DEBT — Phase guard added to archiveDirectives() — rejects calls outside CLEANUP/COMPLETE phase. Emergency restore function adde
- Rubric System Consolidation: GO_WITH_TECH_DEBT — Rubric system consolidated: (1) Removed rubricScores spec from worker prompt in prompt-god-template.ts — workers no long
- Sprint 145 vitest Regression Fix: NO_GO — Docker worker exited without writing result file

## Sprint sprint-145 Learnings
- Sprint 145 Learnings: - Sprint sprint-145 Learnings: ## Sprint sprint-145 Learnings
- Brain Heuristic Timeout Estimator: NO_GO — Brain Heuristic Timeout Estimator implemented as specified. New file timeout-estimator.ts (~170 LoC) with brainEstimateT
- EventBus Abstraction + Subscribe API: GO_WITH_TECH_DEBT — EventBus Abstraction + Subscribe API implemented as specified.

1. NEW: src/orchestra/event-bus.ts (~250 LoC) — EventBus
- ADR-037 RBAC Runtime Wire — checkWorkerAuthority: GO_WITH_TECH_DEBT — ADR-037 RBAC Runtime Wire completed. Changes:

1. Fixed checkWorkerAuthority() bug — was always returning true even on v
- CHANNELS.NOTIFY writeEvent Emit Wire: GO_WITH_TECH_DEBT — Added emitNotify() helper to event-stream.ts (source='deckent', target='user', channel=CHANNELS.NOTIFY). Added 4 strateg
- NotifyDispatcher Wire + 3 Adapter: GO_WITH_TECH_DEBT — NotifyDispatcher successfully wired in both MCP server and CLI entry points. 3 adapters (MCP, CLI, File) connected via e
- ADR-038 Self-Modifying Detector Runtime Wire: GO_WITH_TECH_DEBT — ADR-038 Self-Modifying Detector Runtime Wire completed. Three changes: (1) Added alias exports to self-modifying-detecto
- registerResume CLI Wire + CLI Registration Test Harness: GO_WITH_TECH_DEBT — Fixed registerResume (audit finding #5) + registerHelp (also unregistered, found during investigation). Added tests/cli/
- T-144-002 Helper Migration — countDebtItems → store.getByType: GO_WITH_TECH_DEBT — DB-first debt counting migration complete. Created src/cli/helpers/debt-counter.ts with MemoryStore.getByType('debt') im
- worker.sh Template Update — TASK_TIMEOUT Env Var: GO_WITH_TECH_DEBT — All 3 backends updated with adaptive timeout wiring:

1. DockerSpawnBackend: worker.sh template now uses `TIMEOUT=${TASK
- Result Atomicity Guarantee — TIMEOUT_WITH_WORK Partial Result: GO_WITH_TECH_DEBT — TIMEOUT_WITH_WORK partial result mechanism implemented across 4 source files + 1 test file (14 tests). Changes: (1) Dock

## Sprint sprint-144 Learnings
- Sprint 144 Learnings: - Sprint sprint-144 Learnings: ## Sprint sprint-144 Learnings
- worker.ts Split (1669 → 4 dosya): NO_GO — Worker timeout — process exceeded time limit and was killed
- Ölü Kod Silme Wave A (Agent + V1 Routing, 17 dosya, 2780 LoC): NO_GO — Worker timeout — process exceeded time limit and was killed
- Ölü Kod Silme Wave B (Orchestra Sahipsiz + Feature Flag, 12 dosya, 2139 LoC): NO_GO — Docker worker exited without writing result file
- Event Stream Emit Wire: GO_WITH_TECH_DEBT — Sprint 138 event-stream.ts foundation wired into Brain, Worker, and Auditor. 7 new CHANNELS constants added: SPRINT_STAR
- Retro sprint-id Normalize: GO_WITH_TECH_DEBT — Retro sprint-id normalize completed: (1) sprint-retro-writer.ts already used canonical `retro-${sprint.id}` format → no

## Sprint sprint-143 Learnings
- Sprint 143 Learnings: - Sprint sprint-143 Learnings: ## Sprint sprint-143 Learnings
- Memory V2 Tam Migrasyon (ci-reporter + managed-docs): NO_GO — Docker worker exited without writing result file
- MCP Disconnect Fix (Background Sprint Runner): GO_WITH_TECH_DEBT — MCP Disconnect Fix implemented. sprint-runner-entry.ts provides a detached child process entry point for running sprints

## Sprint sprint-142 Learnings
- Sprint 142 Learnings: - Sprint sprint-142 Learnings: ## Sprint sprint-142 Learnings
- src/core/ batch 1 — Memory V2 modulleri: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 files completed. 10 per-file reports written to .deckent/sprint-god-analysis/src/core/. Al
- src/core/ batch 2 — Types + Routing: GO_WITH_TECH_DEBT — Read-only deep analysis completed for 10 files in src/core/ batch 2 (Types + Routing). All 10 files analyzed with 16-sec
- src/core/ batch 4 — Provider + Model + Notification: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 assigned files + 1 bonus (webhook.ts) = 11 analysis reports. All reports follow the 16-sec
- src/core/ batch 5 — Utils + Security + Remaining: GO_WITH_TECH_DEBT — Read-only deep analysis completed for all 10 assigned files. Key findings:

**P0 Findings:**
- deck-file.ts: createDeckT
- src/core/ batch 6 — Remaining core files: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 src/core/ files completed. All 10 reports written with 16-section template. Key findings: 
- src/core/ batch 7 — Final core files: GO_WITH_TECH_DEBT — Read-only deep analysis of 13 source files completed. 13 per-file reports written, each ≥40 lines with full 16-section t
- src/orchestra/ batch 1 — Brain + Sprint lifecycle: GO_WITH_TECH_DEBT — Read-only deep analysis of 6 sprint lifecycle core files completed. All 6 reports written with 16-section template, each
- src/orchestra/ batch 2 — Debt + Result + Retro: GO_WITH_TECH_DEBT — Read-only deep analysis of 8 orchestra files (debt-manager, sprint-retro-writer, sprint-reporter, result-evaluator, resu
- src/orchestra/ batch 3 — Task + Routing + Spawn: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 src/orchestra/ files (task-builder, task-router, task-analyzer, task-retry, planner, spawn
- src/orchestra/ batch 4 — Event stream + Pattern + Decision: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 orchestra files completed. 10 per-file reports written using 16-section template. All repo

## Sprint sprint-141 Learnings
- Sprint 141 Learnings: - Sprint sprint-141 Learnings: ## Sprint sprint-141 Learnings
- src/orchestra/ Analysis (82 dosya): NO_GO — Docker worker exited without writing result file
- src/cli/ Analysis (75 dosya): GO_WITH_TECH_DEBT — src/cli/ analizi tamamlandı. 75 rapor dosyası oluşturuldu (.deckent/sprint-140-analysis/src/cli/ altında). Tüm dosyalar 
- src/agents/ + src/providers/ + src/monitor/ + src/api/ + src/extensions/ Analysis (30 dosya): NO_GO — Docker worker exited without writing result file
- tests/ Category Analysis (28 kategori): GO_WITH_TECH_DEBT — 28 test kategorisi READ-ONLY analizi tamamlandı. Tüm raporlar .deckent/sprint-140-analysis/tests/ altında. Toplam 5133 s
- docs/ Analysis (260 markdown): GO_WITH_TECH_DEBT — Batch analysis of 260 markdown docs across 8 categories. Read-only analysis completed successfully. Produced 7 detailed 
- META — Architecture Graph + Circular Dependency: GO_WITH_TECH_DEBT — Comprehensive architecture graph and circular dependency analysis completed. 354 TypeScript files analyzed across 11 mod
- META — Dead Code + Type Safety + Security: GO_WITH_TECH_DEBT — Read-only cross-cutting analysis completed: (1) Dead Code — 4 fully dead modules (~360 LoC), 14+ unused exports, ADR-038
- META — ADR Compliance + CLI/MCP Parity + i18n: GO_WITH_TECH_DEBT — Comprehensive 3-section cross-cutting analysis completed: (1) ADR Compliance: 40/40 ADRs audited — 36 COMPLIANT, 2 PARTI
- META — Test Coverage Map + Performance + Error Handling + TODO inventory: GO_WITH_TECH_DEBT — Completed all 4 cross-cutting analyses. Report at .deckent/sprint-140-analysis/meta/coverage-perf-errors-todo.md (563 li
- META — Memory V2 Integrity Verification: GO_WITH_TECH_DEBT — Memory V2 Integrity Verification completed. 482-line report covering all 7 dimensions: (1) DB Schema: 5/5 tables + FTS5

## Sprint sprint-140 Learnings
- Sprint 140 Learnings: - Sprint 140 Learnings: Sprint 140 learnings — no .brain/sprints/sprint-140.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-139 Learnings
- Sprint 139 Learnings: - Sprint 139 Learnings: ## Sprint sprint-139 Learnings

## Sprint sprint-138 Learnings
- Sprint 138 Learnings: - Sprint 138 Learnings: - ADR-035 Verification Protocol Standard: GO_WITH_TECH_DEBT — ADR-035 Brain ↔ Worker ↔ Auditor Verification Protocol Standard başarıyla .brain/DECISIONS.md dosyasına eklendi. 15 kana
- Worker Honest Assessment Calibration v2: GO_WITH_TECH_DEBT — Worker Honest Assessment Calibration v2 tamamlandı. 3 alt-iş uygulandı:

1. Alt-iş A (task-builder.ts): buildWorkerPromp

## Sprint sprint-137 Learnings
- Sprint 137 Learnings: - Sprint 137 Learnings: - Brain Budget Decay No-Op Bug Fix: GO_WITH_TECH_DEBT — Fixed brain budget decay no-op bug in runDecay() (debt-manager.ts). Root cause: shouldRun guard used total linesBefore (

## Sprint sprint-136 Learnings
- Sprint 136 Learnings: - Sprint 136 Learnings: - 5 Test Regression Fix (Sprint 136 Opener): GO_WITH_TECH_DEBT — 5 target test files (start-sandbox, start, i18n-integration, docker-backend, error-handling-unification) all pass (262 t
- Async I/O İlk Kademe (Hot Path fs.promises Migration): NO_GO — Docker worker exited without writing result file
- Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9): GO_WITH_TECH_DEBT — Brain Spurious NO_GO Evaluation Reconciliation implemented. Added tryCodeVerifiedDone() helper to result-evaluator.ts wi
- `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5): GO_WITH_TECH_DEBT — gate.json wiring implemented. Added `import { promises as fsPromises } from 'node:fs'` to sprint-finalizer.ts. Inside th
- `load-test-report.md` Auto-Generation (Sprint 135 N6): GO_WITH_TECH_DEBT — Wired generateLoadReport() into finalizeSprint() in sprint-finalizer.ts. Added import of generateLoadReport from core/ob
- T-005 Dep Pipeline Canlı Dogfood Rerun (Sprint 135 Chicken-Egg): NO_GO — Fix A (sprint-controller.ts): Added 'priority?' and 'dependencies?' fields to directiveSources type annotation (line 505
- ErrorRegistry Lint Rule Enforcement: NO_GO — Docker worker exited without writing result file
- sprint-controller.ts Full Slim (Sprint 134 T-010 Final): NO_GO — Docker worker exited without writing result file
- Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7): GO_WITH_TECH_DEBT — Added rubric requirement to test-writer agent systemPrompt and worker prompt building in task-builder.ts. Fixed test thr
- sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt): GO_WITH_TECH_DEBT — Wrote comprehensive unit tests for sprint-docs-helpers.ts module. 61 test cases covering all 8 exported functions: build

## Sprint sprint-135 Learnings
- Sprint 135 Learnings: - Sprint 135 Learnings: - Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix): GO_WITH_TECH_DEBT — Docker graceful shutdown offensive root cause fix implemented. Changes: (1) spawn-backend-docker.ts kill() method: docke
- askBrain() Extraction Finish — Conservative Move + Re-Export Shim: NO_GO — Docker worker exited without writing result file
- Structured Planner Priority + Dependencies Parsing: GO_WITH_TECH_DEBT — parseStructuredDirectives() and parseBulletOrNumberedTasks() now parse '- Priority: CRITICAL|HIGH|NORMAL|LOW' lines. New
- GO_WITH_GATE_FAILURE Status Propagation Wire: GO_WITH_TECH_DEBT — GO_WITH_GATE_FAILURE status propagation wire implemented:
1. Added `import { getRecentSprintStats, GO_WITH_GATE_FAILURE 
- Dashboard vs MCP State Divergence Fix: NO_GO — Created src/monitor/sprint-state.ts with getCurrentSprintId() that reads .deckent/sprint-state.json (source 1: sprint-ac
- Brain Memory Budget Enforcement + Config Sync: GO_WITH_TECH_DEBT — Brain Memory Budget Enforcement + Config Sync tamamlandı. (1) DECAY_EXEMPT constant: DECISIONS.md ve PROJECT-IDENTITY.md

## Sprint sprint-134 Learnings
- Sprint 134 Learnings: - Sprint 134 Learnings: Sprint 134 learnings — no .brain/sprints/sprint-134.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-133 Learnings
- Sprint 133 Learnings: - Sprint 133 Learnings: - HTTP API Bearer Token Auth: GO_WITH_TECH_DEBT — HTTP API Bearer Token Authentication implemented. Changes:

1. NEW FILE: src/api/auth.ts — bearerAuthMiddleware with res
- loadConfig() Module-Level Cache: GO_WITH_TECH_DEBT — loadConfig() module-level cache implemented. Changes: (1) Added module-level cachedConfig/cacheStamp/cachedProjectRoot v
- Sprint 131 ADR'leri Yazımı (ADR-029..032): GO_WITH_TECH_DEBT — 4 ADR yazıldı (ADR-029 through ADR-032), her biri ≥50 satır. ADR-029 (51 lines): Managed-Docs Universalization — kullanı
- Competitive Analysis Güncelleme: GO_WITH_TECH_DEBT — Competitive analysis fully updated for April 2026. Changes: (1) competitive-analysis.md — title updated 'March 2026' → '

## Sprint sprint-132 Learnings
- Sprint 132 Learnings: - Sprint 132 Learnings: 

## Sprint unknown Learnings
- help: help
