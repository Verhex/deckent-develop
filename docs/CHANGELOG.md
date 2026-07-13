# Changelog

> **Auto-generated per-sprint log — do not hand-edit.** Every section below is appended
> automatically by the sprint-finalizer's changelog updater
> (`src/orchestra/doc-updaters/changelog.ts`) at the end of each sprint, one
> `## [VERSION-sprintNNN]` entry per sprint with the task-level Added/Changed/Fixed breakdown. This
> is a verbose machine-written archive, **not** release notes. The **canonical, hand-curated
> release notes** (one exact-anchored section per shipped version, read by
> `.github/workflows/release.yml` at publish time) live at the project root:
> [CHANGELOG.md](../CHANGELOG.md).

## [1.0.0-beta.1-sprint433] - 2026-07-13

### Added

- Hermetik STATUS-JSON-CONTRACT regresyon testlerini ekle

### Changed

- STATUS-JSON-CONTRACT CLI düzeltmesini uygula (completed with tech debt)


_Tasks: 6 total, 4 done, 2 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint432] - 2026-07-13

### Added

- SURF-0.1 — RunSprintOptions correlation contract
- SURF-0.2 — start CLI flowId ingress
- SURF-0.3 — Finalizer completion receipt
- SURF-0.5 — Completion watch ve uçtan uca truth-receipt doğrulaması

### Changed

- SURF-0.4 — Sprint phases finalizer propagation (completed with tech debt)


_Tasks: 7 total, 7 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint431] - 2026-07-12

### Added

- config.ts: resolveDefaultModel(config) + resolveBrainModel(config) SSOT resolver
- run-proposal-compiler.ts: hardcoded 'sonnet' → resolveBrainModel wiring
- Entegrasyon: model-literal ratchet + resolver wiring uçtan-uca doğrulama

### Changed

- scripts/lint-no-model-literal.mjs ratchet + baseline (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint430] - 2026-07-12

### Added

- Scheduler-shadow retention config şeması (config-types.ts + config.ts defaults + config-reference.md)
- 14-günlük yaş-bazlı retention motoru (scheduler-shadow-retention.ts) + unit testler
- Finalize akışına scheduler-shadow retention wiring (sprint-finalizer.ts Step 12f)
- Uçtan-uca entegrasyon kanıtı: finalize sırasında eski scheduler-shadow jsonl arşivleme doğrulaması


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint429] - 2026-07-12

### Added

- N678A — run-proposal-compiler'a planner-çekirdeği: NL→gerçek çok-task plan
- N678B — do/propose_run gate-yeşil uçtan-uca (511 hermetik kabulü)
- P675 — scope-sanitizer çok-noktalı basename düşürmesi
- L676 — scheduler executed-engine loud-log + journal alanı (SCHED-8 önkoşulu)
- D71 — api/run-flow-routes: REST consumer (TERM-7)
- D72 — run-flow SSE event-stream + server wiring (TERM-7)
- D73 — API composition + consumer-pin güncellemesi (TERM-7 kapanışı)

### Changed

- N677 — directives-builder delimiter-güvenliği (completed with tech debt)
- HYG — 427-011 inventory-dosyası .deckent hijyeni doğrulaması (completed with tech debt)

### Fixed

- PLNR1 — brain_planning top-level precedence (eski-🔴 Bug-1)
- PLNR2 — structured-force guard'ına Agent/Skills override'ları (Bug-2 artığı)


_Tasks: 11 total, 11 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint428] - 2026-07-12

### Added

- W674A — ctx-doldurma: toolInventory + verifyCommands (born-674)
- W674B — tools.allowlist_enabled flag'i + toolAllowlist ctx (born-674)
- W674C — üç-blok uçtan-uca render kanıtı (born-674)
- T6A — cli-bridge-tool-specs canonical-yol notu (TERM-6)
- T6B — DECKENT.md canonical-akış dokümantasyonu (TERM-6)
- T6C — do.ts compatibility-adapter (TERM-6; sync-stdio + DIRECTIVES-swap ölür)
- T6D — plan-nl compatibility-preview-adapter (TERM-6)
- T6E — cli/index route-wiring (TERM-6)
- T6F — term-flow composition-pin testi (TERM-6)
- S7A — scheduler FIFO dependency-safety (SCHED-7)


_Tasks: 13 total, 13 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint427] - 2026-07-12

### Added

- TERM5-FIN — sprint-finalizer rich completion-record (flowId'li)
- TERM5-FEED — run-state-feed flowId-korelasyonu
- TERM5-WATCH — run-completion-watch korelasyon (yanlış-eşleşme ölür)
- TERM5-QUEUE — chat-turn-queue correlated result-turn (idle-wake)
- TERM5-CTRL — controller terminal-state reduce (correlated event'ten)
- TERM5-UI — REPL result-turn render + i18n
- SCHED6-RED — reducer cascade/restore kararları
- SCHED6-EFF — CascadeSkip/WriteCheckpoint executor (persist-before-commit)
- SCHED6-CKPT — checkpoint restore reducer-parity (MRR korunur)
- SCHED6-COMP — cascade composition-testi + debt tek-yol

### Changed

- WIRE-PROBE — sprint-start env-probe doldurma (born-670a) (completed with tech debt)
- WIRE-VERIFY — worker-prompt verify-komut dürüstlüğü (born-670b) (completed with tech debt)
- ALLOW-WIRE — allowlist'in prompt/yüzeye flag'li uygulanması (559) (completed with tech debt)
- STORE-CORE — run-flow-store'un core'a taşınması (born-671) (completed with tech debt)


_Tasks: 24 total, 24 done, 4 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint426] - 2026-07-12

### Added

- TERM4B — REPL canlı-mount: controller run/app'e + approve→start tetiği (flag'li)
- SCHED5 — continuous live-switch: initial+watcher tek injected driver (engine-config'li)

### Changed

- TERM4A — run-flow-store + run-job-service + snapshot-tüketen start (flag'li) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint425] - 2026-07-12

### Added

- SCHED5K — divergence-raporunun KOŞULLU-GO koşullarını kapat (kapsam-boşlukları)

### Changed

- TERM3 — native RunProposal akışı: tool→coordinator→plan-preview-card→approval (flag'li) (completed with tech debt)


_Tasks: 2 total, 2 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint424] - 2026-07-12

### Added

- TERM2 — shared actual-preview: plan-preview-service + proposal-compiler (CLI/MCP adapter'lı)
- SCHED5ON — shadow-journal divergence-analizi: 9-sprint verisinden sınıflandırma-raporu (SALT-ANALİZ, kod-yok)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint423] - 2026-07-12

### Added

- TERM1 — run-flow-contract + reducer: typed RunProposal→…→Completion durum-makinesi (flag'li, production-caller YOK)

### Changed

- TT556 — PLANNER-PREFLIGHT: scope-satisfiability genişletme + gate-false-positive ailesi (born-661+650+653) (completed with tech debt)

### Fixed

- Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Notes: CORE COMPLETE (7/8 goCriteria verified). Two production …


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint422] - 2026-07-12

### Added

- TERM1 — run-flow-contract + reducer: typed RunProposal→…→Completion durum-makinesi (flag'li, production-caller YOK)

### Changed

- TT556 — PLANNER-PREFLIGHT: scope-satisfiability genişletme + gate-false-positive ailesi (born-661+650+653) (completed with tech debt)


_Tasks: 2 total, 2 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint421] - 2026-07-12

### Added

- DEP669B — nodemailer 9.x semver-MAJOR bump (GHSA-rcmh + GHSA-p6gq; son 2 istisna)
- TT555 — TURN-ECONOMY-2: pipe-exit-maskesi + verify_task tool + artifact-tekrarı + env-probe (veri-kanıtlı)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint420] - 2026-07-12

### Added

- DEP669A — non-major dependency-bump dilimi: fast-uri · hono · path-to-regexp · undici · ws (⏰2026-07-26)

### Changed

- LIVE668A — decideWorkerLiveness ADOPT (3. deneme; iki gerçek kill-yolu) (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint419] - 2026-07-12

### Added

- MET668B — TT554-artıkları: haiku yardımcı-maliyet ledger-flip + reporter canlı-wiring

### Changed

- LIVE668A — decideWorkerLiveness ADOPT: iki gerçek kill-yolu host-primary'ye döner (completed with tech debt)
- SEC05 — dependency-audit fail-closed + imzalı-istisna allowlist (RC-6 dilimi) (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint418] - 2026-07-12

### Added

- SEC04 — model-catalog fetch'i lazy: her CLI-komutu network'e çıkmasın (RC-6 dilimi)

### Changed

- TT554 — METERING-TRUTH: tarife/capability-drift + ledger-eksiği + estimator + reporter (COST-10X ölçüm-tabanı) (completed with tech debt)
- TT553 — HOST-LIFECYCLE: heartbeat HOST-sinyaline döner (worker dosya-disiplini ölür) (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint417] - 2026-07-11

### Added

- TT550D — result-ingest taskId-normalize (DAR kapsam — kazı YOK)
- TT552 — TRACE-V2: sidecar/projection ayrımı + prompt-inject + gerçek tool_calls + quarantine

### Changed

- WIN665 — Windows init exit-code ezilmesi: SETUP_INCOMPLETE basıyor, exit 1 dönüyor (XPLAT-kilidi) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint416] - 2026-07-11

### Added

- TT549 — CAPTURE-TRUTH: docker-log yakalama 1MiB'ta kesiliyor (%44 korpus kesik, usage-patch ölüyor)

### Changed

- TT550 — RESULT-INGEST-IDNORM: malformed result-taskId phantom-fix + trace-kaybı üretiyor (+üçüncü-neden kazısı) (completed with tech debt)

### Fixed

- TT551 — FIX-PHASE-TRACE: FIX-fazı trace yazmıyor → korpus success-biased (0 NO_GO etiketi)


_Tasks: 6 total, 6 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint415] - 2026-07-11

### Added

- RC5A — cross-platform packed-install matrix: üç-OS gerçek-kurulum smoke'u (XPLAT-01)
- RC5B — release-attestation'a cross-platform şartı: matrix-yeşili olmadan publish yok
- SEC03 — API/terminal token-redaction: raw-token stderr'den ölür (RC-6 öne-alım)


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint414] - 2026-07-11

### Added

- RC4B — changelog-kanonikliği + release-prepare (REL-03/04): tek-kaynak notes + bump-version retire
- SCHED4 — full reducer SHADOW-only + differential journal (strangler dilim-4)

### Changed

- RC4A — release.yml bütünlük-zinciri: tag-eşitliği + required-CI attestation + SHA-pin + trusted-publishing (REL-01/02 + SEC-06) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint413] - 2026-07-11

### Added

- RC3A — PUB-01+PUB-02+PKG-05: validate-publish JSON-parser + kategorili-baseline-ratchet + drift-gate
- RC3B — PKG-01: packed-install-contract — tarball gerçekten kurulabilir-mi kanıtı

### Changed

- RC2C — born-652: init gerçek non-interactive akış + EOF-dürüstlüğü (RC-2 kapanış-kilidi) (completed with tech debt)
- SCHED3 — canonical spawn executor: tüm spawn-yolları tek kapıdan (strangler dilim-3) (completed with tech debt)


_Tasks: 4 total, 4 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint412] - 2026-07-11

### Added

- DOCTOR-TWIN — born-651: runDoctorChecks canlı-ikizini öldür (tek canonical liste)
- SCHED2 — checkpoint-v2: MRR restore'da kaybolmaz (strangler dilim-2)

### Changed

- RC2-A — init outcome-makinesi: READY · SETUP_INCOMPLETE · FAILED dürüst-çıkış (INIT-01) (completed with tech debt)
- RC2-B — backend-transaction: Docker CLI+daemon+image birlikte-değerlendirme (INIT-02) (completed with tech debt)


_Tasks: 5 total, 5 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint411] - 2026-07-11

### Added

- RC1-A — .deck secret-lifecycle çekirdeği (SEC-01: overwrite-guard + 0600 + Windows-ACL)
- SCHED1 — semantics-kernel: effective-dependency-state tekleme (strangler dilim-1, davranış-koruyucu)

### Changed

- RC1-B — subprocess-backend .deck görünürlüğü dürüstlük-dilimi (SEC-02) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint410] - 2026-07-11

### Added

- tests/dashboard/dash-perf-494.test.tsx (14 tests) as this task's dedicated MASTER-PLAN-494 proof artifact, covering ground the existing suites don't: (a) eager-import negative-pin for the 9 lazy pages scoped to this task's page list, (b) lazy+Suspense positive-pin, (c) a literal 3-concurrent-caller dedup fixture on dedupedFetch (task text explicitly asked for '3 çağrı'; the pre-existing request-dedup.test.ts only exercises 2 callers) plus a 3-consumer useLiveData polling-storm variant, (d) abort-on-unmount pin, (e) no-emoji guard on App.tsx source.
- CLI-EPIPE — MASTER-PLAN 501: borulu-kullanımda zarif çıkış
- DOCTOR-DEDUP — MASTER-PLAN 505: runPreFlightHealthCheck ölü-ikizi tekleştir


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint409] - 2026-07-11

### Added

- DENIED-TOOL-HONESTY — born-528: confirm-red'i toolSink dürüst-çıktı yolundan geçir
- ROUTING-TEK-OTORİTE — 641-spawner: spawn-time agent-override'ı plan-time otoriteyle birleştir

### Fixed

- INPUT-BAR-FIXES — born-527: Home/End algılama + paste-history + keylog platform-farkındalığı


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint408] - 2026-07-11

### Added

- BG-TURNS-PRODUCER — born-642 (P0): detached-run bitişi → REPL yeni-turn (ChatTurnQueue üreticisi)
- BUILD-VIOLATION-GUARD — born-644 (P1): sprint-içi izinsiz-build audit + önleme
- TRACE-QOL — born-639(3): worker-logs ham-tail'e insan-okur LogEvent render


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint407] - 2026-07-11

### Added

- RELEASE-UNIFY — born-608 (P0 PUBLISH-BLOCKER): tek release-workflow + tek npm-publish otoritesi
- COST-K1 — born-636-K1: worker tur-azaltma (paralel tool-çağrısı + verify-döngüsü disiplini)
- PLAN-SURFACE-KALAN — born-629(b,c): post-adoption gösterim + scope-gate yeni-dizin sınıfı

### Changed

- COST-K2 — born-636-K2: task-tipi→effort tiering (flag'li, default-off) (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint406] - 2026-07-11

### Added

- BUILTINS-DRIFT-GATE — 502 dilim-1: drift-envanteri + mekanik drift-check gate
- APPROVAL-QOL — born-630: allowStore-wire + deny-spam kesici + bekleme-heartbeat
- MANIFEST-SCHEMA-LINT — 641-kalan: skill/agent manifest zorunlu-alan validasyonu + pool-load normalizasyonu


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint405] - 2026-07-11

### Added

- MEM-TENANT — born-609 (P0): MemoryQuery tenant-scoping (additive)

### Changed

- PLUGIN-AUTH — born-612 (P1): plugin özgünlük + path-containment (completed with tech debt)
- STATS-SIDECAR — born-605 (P1): canlı agent/skill stats'ı git-tracked manifest'ten gitignored sidecar'a (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint404] - 2026-07-11

### Added

- TRUTH-CORE — born-640a: feature-truth zincir-derleyici çekirdeği
- TRUTH-SURFACE — born-640b: `deckent truth` CLI + MCP + --check ratchet
- PLAN-SURFACE-TRUTH — born-629: start-replan ezmesi + Model/Agent-hint drop + post-adoption gösterim
- APPROVAL-EXPIRY-DRIVER — born-631: prod-sürücü bağla
- TRACE-TAIL — born-639: codex/gemini docker stream + token-counter tier-2 LogEvent-farkındalığı


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint403] - 2026-07-11

### Added

- RUN-RENAME-D1 — sprint→run kullanıcı-yüzeyi kelime-revizyonu (dilim-1: messages.ts)
- FLAKE-WALLCLOCK — born-632: duvar-saati assert ailesi hermetikleştir
- NESTED-HONESTY — born-633: call_tool nested-dispatch dürüstlük ailesi (4 kalem)

### Changed

- GATE-FLAG-THREAD — 628-kalan: --force-prompt-gate CLI + MCP acknowledgePromptGate (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint402] - 2026-07-11

### Added

- TRACE-CONTENT-PARITY — born-637 (P0): docker-backend trace-içerik kanalı
- ROUTING-DECISION-JOURNAL — born-622: selectBestAgent skor-dökümü kalıcı-journal'a
- E005-SPLIT — born-623: path-resolution'a ayrı error-code

### Changed

- PROMPT-GATE-BLOCK-START — born-628: gate-BLOCK'u start/MCP ana-yoluna taşı (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint401] - 2026-07-11

### Added

- DOC-AFFECTED-GATE — affected-tests kullanım rehberi


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint400] - 2026-07-10

### Added

- AFFECTED-RESOLVER — import-graph ile değişen-dosya→etkilenen-test çözücüsü
- GATE-RUNNER — affected-set'i koşturan ccverify kapısı


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint399] - 2026-07-10

### Added

- G1b-CORE — YENİ scope-satisfiability lint modülü (görev-metni ↔ yazma-yetkisi tutarlılık kontratı)

### Changed

- SAN-1-CORE — sanitizeScope Rule-5 trackedRootFiles-aware (sessiz kök-dosya drop biter) (completed with tech debt)
- G6a-CORE — STACK_COMMANDS typecheck alanı + criteria-deriver tercih zinciri (DoD'daki çıplak-tsc dist-emit talimatı biter) (completed with tech debt)
- SAN-2-CORE — scope-gate suggestion-adoption çözümleyici (typo-suspect'ler otomatik çözülür, force-scope daralır) (completed with tech debt)


_Tasks: 4 total, 4 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint398] - 2026-07-10

### Added

- LAT-ADR — brain/decisions + dead-code-decisions: yeni-taksonomiye taşı (17 fail)
- LAT-ORPHAN — governance orphan-allowlist ratchet-refresh (1 fail)
- LAT-EXEC — tmux-backend + docker-oom + docker-hb (4 fail)
- LAT-NERVOUS — nervous-faz1-smoke (2 fail)

### Changed

- LAT-KPI-SEED — kpi-backfill + init-builtin-seed (3 fail) (completed with tech debt)


_Tasks: 12 total, 10 done, 2 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint397] - 2026-07-10

### Added

- T1-ARITY — born-585 4.arg assert'leri (2 dosya)
- T3-START-NERVOUS-CLEANUP — F2+F3+F4 (4 dosya)
- T4-DISPATCH — born-514 evidence→regression-guard (2 dosya)
- T5-SIGNAL-SENTINEL — F6a registry-deseni + F7 sentinel (3 dosya)
- T6-CORE-STALE — C2+C3+C6+M1 (4 dosya)
- T9-MATERIALIZE — C5 hermetik tmp-kopya (2 dosya)
- T11-DOCS-SAYILAR — README/refdocs gerçeğe + K4 badge-RESTORE (5 dosya)
- T12-BASELINES — spawnsync + secrets ratchet-refresh (2 data-dosyası)

### Changed

- T7-ELOOP — chat-tool-exec raw-throw → DeckentError (CODE-FIX) (completed with tech debt)

### Fixed

- T2-STATUS — f0a03b6f orphan-gate mock+fixture (4 dosya)
- T8-KATALOG-REZERO+RULESHAPE — stats-sıfırlama + 396-$or uyum (DATA+TEST-FIX, 5 dosya)
- T10-DOCS-SITE — vitepress 2-blocker (4 dosya, DOC-FIX)


_Tasks: 15 total, 15 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint396] - 2026-07-10

### Added

- born-601b — SKILL-RULE-REWRITE — 6 skill-manifest kural-onarımı (P1)

### Changed

- born-601a — AGENT-RULE-REWRITE — 4 agent-manifest kural-onarımı (P1) (completed with tech debt)

### Fixed

- born-603 — DEBT-INJECTION-NOOP-ECHO — dürüst no-op fix-wave debt'i yeniden doğmasın (P2)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint395] - 2026-07-10

### Added

- born-594 — TESTING-INTENT — test-ağırlıklı task'lar testing sınıflansın + sahiplik (P1)
- born-595 — OVERRIDE-WARNING-SURFACE — router uyarıları plan-çıktısına (P1)

### Changed

- born-585 — PROJECTROOT-THREAD — buildWorkerPrompt 7 çağrı-sitesine gerçek projectRoot (P2) (completed with tech debt)
- born-587 — DEAD-LISTENER-MIGRATION — 5 komut shutdown-hook registry'ye (P1) (completed with tech debt)
- born-588 — START-EXIT-HONESTY — gate-blok `deckent start` non-zero exit (P2) (completed with tech debt)

### Fixed

- born-599 — VOICE-BODYINIT — Buffer→Uint8Array fetch-body tip-fixi (P2)


_Tasks: 6 total, 6 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint394] - 2026-07-10

### Added

- DESK-B3-HARDENING — perm-check twin + session-notu + onConnected-tokens (P1)

### Changed

- born-597+598+600 — IPC kanal-katmanlama + adopt-URL + transport (P0, RELEASE-GATE) (completed with tech debt)
- DESK-B3-I18N-LINT — lint-i18n-hardcode'a desktop-glob (P2) (completed with tech debt)


_Tasks: 4 total, 4 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint393] - 2026-07-10

### Added

- born-589 — DOMAIN-ALIAS — detectDomains↔kural-vocabulary alias-map + kural-lint (P0)
- born-590 — ACTIVATION-VALIDATION — zod-şema + sessiz-drop'u görünür yap (P0)
- born-591 — AVGCOVERAGE-REPAIR — phantom-zero-dilution + skill-tarafı hiç-yazılmıyor (P0)
- born-592 — MANIFEST-REPAIR — api-design hayaleti + i18n-quality/secure-coding canlıya insin (P0)
- born-593 — DNA-FILTER-STAT-CREDIT — düşürülen skill'e kredi yazma (P0)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint392] - 2026-07-10

### Added

- DESK-B2-LIFECYCLE — daemon-lifecycle + meta-client (Electron-FREE çekirdek) (P0)
- DESK-B2-RENDERER — thin pre-daemon UI (P1)
- DESK-B2-DASHBOARD-BRIDGE — useIsDesktop + d.ts-aynası + sync-lint (P1)

### Changed

- DESK-B2-PROFILE-STORE — connection-profile-store (P0) (completed with tech debt)
- DESK-B2-WINDOW-APP — index + window-manager + constants (P1) (completed with tech debt)
- DESK-B2-IPC-SECURITY — ipc-handlers + security (P0, güvenlik) (completed with tech debt)
- DESK-B2-TRAY-MENU-I18N — tray + menu + i18n köprüsü + update-stub (P1) (completed with tech debt)


_Tasks: 15 total, 13 done, 7 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint391] - 2026-07-09

### Added

- RED-2 — BRAIN-PROVIDER-MOCK — path-duyarlı mock (F0.3 _orphaned drain) (P2)
- RED-3 — PID-MANAGER-ARCHIVE-PATH — sprints/ alt-dizin assert güncelle (P2)
- RED-4/5 — DEBT-INTEGRATION-LSFILES-MOCK — scope-gate uyumlu git-mock (P2, 2 test)
- RED-6/7/8 — DOCS-CLEANUP-ARCHIVE-PATH — sprints/ alt-dizin assert güncelle (P2, 3 test)
- RED-9 — TMUX-EDGE-GUARD-AWARE — battaniye mkdirSync asserti hedefli yap (P2)
- RED-10..13 — ROUTING-AFFINITY-SKILL-POOL — sentetik skill'leri pool'a kaydet (P1, 4 test)
- RED-14 — ROUTING-HEALTH-SKILL-POOL — emptySkillPool → kayıtlı skill'ler (P2)
- RED-15/16 — ARCHIVE-DIRECTIVES-PATH — directives/ alt-dizin assert güncelle (P2, 2 test)

### Fixed

- RED-1 — TASK-BUILDER-ADR-CWD-LEAK — buildWorkerPrompt projectRoot honor + hermetik test (P1, CODE-FIX)


_Tasks: 9 total, 9 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint390] - 2026-07-09

### Added

- born-501 — CLI-EPIPE-GRACEFUL — process-level EPIPE handler (P2)
- born-576 — SDK-PACKAGE-EXPORTS — publish embeddable SDK entry in package.json (P2)
- born-580 — PROVIDER-SPAWN-SAFE — bare spawn() → buildCliInvocation (P1, cross-platform Law#2)
- born-500 — BRAIN-EXPORTS-FORMAT-AUDIT — format+consumer+size analizi (P1, doc)

### Changed

- born-565 — AI-SESSION-TOOL-ALLOWLIST — kind==='ai' client-tool validation (P1, güvenlik) (completed with tech debt)
- born-579 — DOCTOR-PREFLIGHT-HONESTY — pre-flight npm-install honesty (P2) (completed with tech debt)


_Tasks: 6 total, 6 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint389] - 2026-07-08

### Added

- born-529 — REPL-ERRORBOUNDARY-I18N — ReplErrorBoundary label prop (P3)
- born-530 — REPL-CLEAR-ANSI — /clear gerçek ANSI-clear + in-flight stream cancel (P2)
- born-537 — EDIT-FILE-UNIQUE — edit_file unique-match/replace-all + empty-old error (P2)
- born-541 — RENDER-REGION-SAFEPROMPT — safePrompt narrow catch (P3)
- born-548 — CRED-RESOLUTION — Gemini env + deepseek/qwen/glm .deck cred (P2)
- born-575 — ENT-RBAC-ROUNDTRIP — enterprise RBAC/rate write-then-read round-trip (P2)

### Changed

- born-583 — GOV-MINORS — plugin-sig + opaque-bearer + deny-list loopback (P2) (completed with tech debt)


_Tasks: 7 total, 7 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint388] - 2026-07-08

### Added

- born-533 — REPL-MODEL-BUSY-GATE — /model /provider backend-splice race (P1)
- born-527 — INPUT-BAR-CLUSTER — Home/End no-op + paste empty-history + /tmp keylog (P2)
- born-521 — DESCRIBE-TOOL-PARAMS — describe_tool boş params raporluyor (P3)
- born-536 — TOOL-EXEC-SYMLINK — inScope symlink-resolution eksik (P2)
- born-540 — RENDER-REGION-CLEAR — writeAbove full-region clear eksik (P2)
- born-547 — ENTRY-NDJSON-FALLBACK — non-assistant fallback branch eksik (P2)
- born-556 — NATIVE-TRANSPORT-DOC — 32k/24k doc↔kod uyuşmazlığı (P3)
- born-578 — INIT-REPAIR-FAILEDSTEPS — --repair failedSteps doldurmuyor (P3)
- born-531 — SLASH-CASE-TRANSLIT — slash case-insensitive + slugify transliteration (P3)
- born-504 — RECLASSIFY-BACKFILL — 10 eksik sprint-log satırı + re-run (P2)

### Changed

- born-557 — DOCTOR-ICON-CONSOLIDATE — 3 ikon-vokabülü birleştir (P3) (completed with tech debt)


_Tasks: 13 total, 12 done, 1 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint387] - 2026-07-08

### Added

- born-492 — W1-EXPERIENCE-ON — repl_surface i18n flip'i tamamla (P0)
- born-551 — REPL-TURN-EXCEPTION-SURFACE — turn-loop istisnaları yutulmuyor (P1)
- born-549 — SIGTERM-TEARDOWN — sinyal-temizliği eksik (warm-child/MCP/Windows) (P1)
- born-564 — PANIC-GATE-FAILCLOSED — fail-closed marker yanlış yorumlanıyor (P1)
- born-567 — SPAWN-SAFETY-WIRE — assertSpawnSafe her spawn call-site'ına (P1)
- born-571 — FLOW-EVENT-DISPATCH — flow approve reader + `flow approve` komutu (P1)
- born-203 — ONB-2 — rich doctor: Windows-native profil + auth-state probe (P1)
- born-523 — AGENTIC-CONFIRM-HARDEN — readline reuse + SAFE-before-RISKY sıralama (P2)
- born-524 — TOOL-PERM-TIER — deckent_start/run/process explicit tier (P2)
- born-534 — APPROVAL-CHANNEL-DISPOSE — dispose() decisionHandler null'lamıyor (P2)

### Changed

- born-493 — W2-WIRE — native-engine'i slash-dispatcher'a köprüle (24/37 komut sessiz-düşüyor) (P0) (completed with tech debt)
- born-563 — MEMORY-TENANT-ISOLATION — tenant izolasyonu default-ON (P1) (completed with tech debt)
- born-568 — PROCESS-GROUP-KILL — 6 adapter'da SIGTERM→SIGKILL process-group (P1) (completed with tech debt)
- born-83 — TOOL-CU — computer-use wire + navigate/region-screenshot + injection-harden (P2) (completed with tech debt)
- born-503 — HUB-P0 — Ed25519 signing + sandbox-on-install + BUILTIN_TRUSTED_SKILLS id fix (P2) (completed with tech debt)
- born-522 — MCP-CLIENT-GATE — mcp_client_enabled ölü-gate: wire ya da kaldır (P2) (completed with tech debt)

### Fixed

- born-553 — MCP-BRIDGE-DROP-WARN — görünür drop-warning + double-audit fix (P2)
- born-581 — ESM-IMPORT-FIX — require('fs')→ESM import (P2)


_Tasks: 27 total, 24 done, 6 tech debt, 3 no-go_

## [1.0.0-beta.1-sprint386] - 2026-07-08

### Added

- born-542 — SELF-MODIFY-GUARD-BYPASS — path-normalizasyon eksik (ADR-039 SEC)
- born-532 — ANTHROPIC-PARALLEL-TOOLRESULT — sibling tool_result'lar bölünüyor
- born-519 — BASH-PERM-RESOURCE — primaryResource yanlış anahtar okuyor
- born-510 — CONTEXT-BUDGET-ORPHAN-TOOLRESULT — compaction tool-pair'i bölüyor
- born-511 — CHAT-SESSION-RECONCILE-SWAP — stream'lenen ile final sessizce farklı


_Tasks: 12 total, 6 done, 0 tech debt, 6 no-go_

## [1.0.0-beta.1-sprint383] - 2026-07-08

### Added

- born-552 — MCP-TOOL-EMPTY-DESC — boş-string açıklama REPL-launch'ı çökertiyor
- born-550 — OFF-TTY-AUTOAPPROVE — piped stdin her yan-etkiyi kör-onaylıyor (SEC)
- born-542 — SELF-MODIFY-GUARD-BYPASS — path-normalizasyon eksik (ADR-039 SEC)
- born-532 — ANTHROPIC-PARALLEL-TOOLRESULT — sibling tool_result'lar bölünüyor
- born-520 — NATIVE-TURN-ACCOUNTING — usage üzerine-yazılıyor + onTurnEnd reuse
- born-519 — BASH-PERM-RESOURCE — primaryResource yanlış anahtar okuyor
- born-510 — CONTEXT-BUDGET-ORPHAN-TOOLRESULT — compaction tool-pair'i bölüyor
- born-511 — CHAT-SESSION-RECONCILE-SWAP — stream'lenen ile final sessizce farklı


_Tasks: 8 total, 8 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint382] - 2026-07-08

### Added

- born-573-REDO — WORKER-APPROVAL-GATE gerçek-site'a wire (Sprint-1 wrong-path düzelt)
- born-508 — INPUTBAR↔APPROVALCARD MUTEX — tuş çift-tüketimi (yıkıcı kör-onay)
- born-574 — NERVOUS-UNDO gerçek compensating-executor
- born-569 — NERVOUS-DETECTOR-REACH — 3 detektör ACTION_REGISTRY mismatch
- born-555 — PERMISSION-STORE READ-MERGE-WRITE — settings.local.json'u ezmesin

### Changed

- born-518-REDO — CRED-SCRUB gerçek leak-site'a wire (Sprint-1 wrong-path düzelt) (completed with tech debt)
- born-566 — WRITER-LEASE FAIL-CLOSED — fs-hatasında yazma reddedilsin (completed with tech debt)
- born-561 — AUTO-APPROVE-CONSISTENCY — CLI start/run hardcoded true'ları kaldır (completed with tech debt)


_Tasks: 8 total, 8 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint381] - 2026-07-08


### Changed

- born-499-HARD — WORKER-GIT-GUARD — spawn-backend'lere git-shim enjekte et (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint380] - 2026-07-07

### Added

- born-559 — LIFECYCLE-CRITICAL-2 — approval sonsuz-bekleme + ADR-gate fail-open
- born-509 — SPAWN-ERROR-LISTENERS — REPL spawn-site'larında error/state-reset eksik → ENOENT crash
- born-512 — PROVIDER-SWITCH-CRASH — geçersiz /provider adı REPL'i çökertiyor
- born-515 — NERVOUS-SLASH-FALSE-SUCCESS — /nervous accept|reject executor'a hiç ulaşmıyor
- born-516 — TOOL-BRIDGE-TIMEOUT — düz 30s SPAWN_TIMEOUT uzun deckent_audit/plan'ı öldürüyor
- born-526 — PROVIDER-PARITY-ROBUST — exit-code okunmuyor + Ollama/HTTP timeout'suz + codex env-key boşluğu
- born-535 — DECKENT-BASH-HARDEN — hanging-komut timeout'suz + bash hardcode (Win-native kırık)
- born-62 — CURSOR-MODEL-WIRE — line-edit UTF-16 surrogate böler; code-point-safe cursor-model'i wire et (WIRE-ON)
- born-513 — CHAT-NATIVE-CLEAR-CONTEXT — /clear yalnız JS-transcript'i siliyor, warm-child context'i kalıyor

### Changed

- born-558 — SKILL-LIST-V2-CRASH — `deckent skill list` v2-manifest'te exit 1 (completed with tech debt)
- born-573 — WORKER-APPROVAL-GATE-WIRE — WorkerApprovalGate prod'da hiç `new` edilmiyor (WIRE-ON) (completed with tech debt)
- born-518 — CROSS-PROVIDER-CRED-SCRUB — provider secret'ları paylaşılan process.env'de sızıyor (P0-SEC) (completed with tech debt)
- born-514 — AGENTIC-DISPATCH-OVERMATCH — NL-intent regex'leri sıradan sohbeti tool-call'a kaçırıyor (completed with tech debt)
- born-505 — DOCTOR-DUP-PREFLIGHT — iki özdeş runPreFlightHealthCheck tanımı (completed with tech debt)


_Tasks: 15 total, 15 done, 5 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint379] - 2026-07-07


### Changed

- DOCS-NUM-TRUTH — README/DECKENT sayı-ve-dil doğruluğu (completed with tech debt)
- PACK-SIZE — npm-paketi <5MB (completed with tech debt)
- DIRECTIVES-RESTORE-QUIRK — kapanışta eski-içeriğe dönme fix'i (completed with tech debt)


_Tasks: 3 total, 3 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint378] - 2026-07-06

### Added

- RUN-SURFACE-TEXT — görünür-metinlerde run-dili

### Changed

- RUN-CLI-ALIAS — `deckent run` çatı-komutu + sprint-alias (completed with tech debt)
- RUN-MODE-BRIDGE — `deckent mode run` + config-alias (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint377] - 2026-07-06

### Added

- DASH-POLLING-DEDUP — istek-tekilleştirme katmanı

### Changed

- MISSION-VERDICT-FIX — dürüst-DEBT fail sayılmaz (completed with tech debt)
- DASH-LAZY-LOAD — route-bazlı code-splitting (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint376] - 2026-07-06

### Added

- M5-NATIVE-FLIP — native-agent default-ON (kanıt-paketi yeşil; rollback-flag'li)

### Changed

- TOOL-QB-FLIP — tool_surface + approval.question_bridge default-ON (completed with tech debt)
- MODE-HELP-FIX — `deckent mode` yardımı gerçeğe eşitlenir (RUN-RENAME ön-adımı) (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint375] - 2026-07-06

### Added

- XPLAT-TEST-DOC — Win-native + macOS kapsamlı test-dokümanı (PROJE KÖKÜNE)
- ADR-DB-SYNC — 5 accepted-ADR'nin memory.db kaydı
- D013C-WIRING — sınıf-bazlı NL-dispatch canlıya
- TERM5-I18N-DILIM-1 — CommandRisk display-çeviri katmanı
- D004-AMEND + DOCS-P0-ADR — ADR-amend paketi
- M5-PROOF-HARNESS — native-flip stabilizasyon-kanıt koşumu

### Changed

- DOCS-P0-DELTA — analiz-delta-kutuları + features-index (completed with tech debt)
- ORPHAN-WIRE-DALGA-1 — en-değerli 5 bağlanmamış-teslimin wire'ı (completed with tech debt)


_Tasks: 8 total, 8 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint374] - 2026-07-06

### Added

- CLOSING-DATA-EXTEND — kapanış-verisini 357-373'e genişlet
- DASH-MOUNT-CARDS — orphan kartları dashboard'a bağla
- ORPHAN-DELIVERABLE-SWEEP — bağlanmamış-teslim sistematik keşfi

### Changed

- CU-STATUS-CLI — `deckent cu-status` (computer-use ilk kullanıcı-yüzeyi) (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint373] - 2026-07-06

### Added

- ADR-ONB-GLOBAL — global-kurulum + proje-scope katman ADR-taslağı
- ADR-TERM-5 — sade risk-dili ADR-taslağı (Oku/Değiştir/Çalıştır/Otonom)
- ADR-NL-DISPATCH — agenticDispatch default kararı ADR-taslağı
- SERVE-E2E-SMOKE — auth'lu gerçek-200 smoke harness'ı
- DEBT-371-CLOSE — 002 artığı + süpürme-doğrulaması
- CURSOR-HARNESS — F11-016 kalan-envanterinden cursor-drift test-harness'i


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint372] - 2026-07-05

### Added

- ADR-TERM-5 — sade risk-dili ADR-taslağı (Oku/Değiştir/Çalıştır/Otonom)
- DEBT-371-CLOSE — 002 artığı + süpürme-doğrulaması


_Tasks: 10 total, 2 done, 0 tech debt, 8 no-go_

## [1.0.0-beta.1-sprint371] - 2026-07-05

### Added

- TOOL-CU-DILIM-3 — exec-adapter (injectable-spawn, flag-zincirli)
- CHAT-EXEC-ENGINE — dispatch-descriptor executor motoru
- F11-016-ADR — REPL-stabilizasyon ADR-taslağı + kalan-envanter
- DEBT-370-CLOSE — 370-006 kalanını kapat
- CLOSING-DATA-PACK — 357-370 kapanış-veri-paketi (7-Tem hazırlığı)

### Changed

- CATALOG-MATERIALIZE — builtin 3+3'ü pool-görünür yap (370-003 kapanışı) (completed with tech debt)
- SERVER-WIRE-ENDPOINTS — limits + evaluate-health kayıtları (completed with tech debt)


_Tasks: 7 total, 7 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint370] - 2026-07-05

### Added

- EVAL-PREMATURE-RETRY — gate-dönüşü sessiz-boş bırakmasın
- DEBT-369-CLOSE — 002/006 kalanlarını kapat
- CATALOG-SYNC-PARITY — yeni 3+3 katalog-öğesinin sync-görünürlüğü
- TOOL-CU-DILIM-2 — platform-capability negotiation (impl'siz, dürüst-tespit)
- CHAT-INTENT-DISPATCH — intent-köprülerinin gerçek-dispatch seam'i
- EVAL-OBS-DASH — evaluate-sağlık işaretlerinin dashboard'a taşınması

### Changed

- DOCS-FEATURES-5 — computer-use + connect-auth + panel feature-doc'ları (completed with tech debt)


_Tasks: 7 total, 7 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint369] - 2026-07-05

### Added

- RUBRIC-ARMOR-COMPLETE — kalan 4 rubric-sitesine born-484 zırhı
- AGSK-1-DILIM-3 — 3 yeni builtin-AGENT
- CHAT-IDE-DILIM-3 — panel canlı-yenileme + task-detay (read-only)
- ADR-RESULT-NORMALIZE — sınır-normalizasyon politikası ADR-D taslağı
- V1-STRICT-REPORT — TaskResultV1 doğrulamasının report-only ön-kablosu

### Changed

- DOCTOR-FOLLOWUPS — checkTmux win32 etiketi + 368-002 debt-süpürme (completed with tech debt)
- TOOL-CU-DILIM-1 — computer-use pack sözleşme-katmanı (flag-gated) (completed with tech debt)
- PSL-6-DILIM — connect-wizard'a auth-state entegrasyonu (completed with tech debt)


_Tasks: 8 total, 8 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint368] - 2026-07-05

### Added

- AGSK-1-DILIM-2-CARRY — 3 yeni builtin-skill (DOĞRU ağaç-yolu)
- F11-016-STAB — REPL cursor/queue stabilizasyon dilimi
- ONB-CHAT-DILIM-2 — sohbet-setup intent genişlemesi
- DEFER-002 — nervous askBrain escalation kapanışı
- SERIES-357-367 — seri-raporu güncelle + 484-saga bölümü
- CHAT-IDE-DILIM-2 — VS Code panel veri-bağlama

### Changed

- ONB-2-DILIM-3 — doctor windows-native profil + auth-state probe (completed with tech debt)

### Fixed

- DOCS-FEATURES-4 — doctor-fix + onboard-apply + approval-history feature-doc'ları


_Tasks: 8 total, 8 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint367] - 2026-07-05

### Added

- BORN-485 — spawn-timeout/tmux kırmızı-test onarımı (9 test)
- BORN-486 — cleanup stale-hb süpürme
- RESULT-SHAPE-SOURCE-GUARD — worker-prompt'a result-şema sözleşmesi (born-484 kaynak-önleme)
- APR-HISTORY-DILIM — dashboard approval-history görünümü

### Changed

- 366-003-DEBT-CLOSE — openrouter-probe debt-notunu oku-kapat (completed with tech debt)
- ONB-APPLY-WIRE — onboarding-apply'ı onboard-komutuna bağla (completed with tech debt)
- ONB-2-DOCTOR-FIX — zengin doctor dilimi (--fix) (completed with tech debt)


_Tasks: 10 total, 8 done, 3 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint366] - 2026-07-03

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint365] - 2026-07-03


### Fixed

- Fix debt: Tech debt from 362-001-fix: VERIFY-AND-COMPLETE of the OOM-killed prior 362-001-


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint364] - 2026-07-03

### Added

- SUBPROC-PROVIDER-CLI — worker-komutu CLI-binary'yi provider'dan seçsin (born-481)
- DOCKER-PROVIDER-CLI — docker-backend paritesi + imaj-gerçeği
- 363-DEBT-CLOSE — 3 debt-notunu oku-kapat
- GEMINI-PARITY-GATED — F11-014 gemini-dalı key-gated testler
- ONB-DOC — onboarding kullanıcı-dokümanı (deckent onboard + wizard + global)
- AGSK-4 — provider-cli-matrix skill'i
- FEATURES-DOC-2 — limit/rpc/openrouter feature-doc'ları

### Changed

- Fix debt: Tech debt from 361-001-fix: Worker timeout/killed (exitCode=1) but git diff show (completed with tech debt)
- TMUX-PROVIDER-CLI — aynı fix tmux-backend'e (Yasa #2 paritesi) (completed with tech debt)
- RETRO-SERIES-METRICS — 357-363 seri-metrik agregatörü (7-Tem raporu altyapısı) (completed with tech debt)


_Tasks: 12 total, 10 done, 3 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint363] - 2026-07-03

### Added

- RPC-WRITE-METHODS — run.start-detached + approval.decide (dilim-2c)
- ONB-GLOBAL-PRECEDENCE — global-katmanı config-zincirine bağla (dilim-3)
- SDK-2 — sprint-yüzeyi: startDetached + results + retro (F2-008 dilim-2)
- 362-DEBT-CLOSE — 362'nin 4 debt-notunu oku-kapat
- TERM5-EVIDENCE — sade risk-dili karar-paketi (Sıra-45 🔬→karar)
- AGSK-3 — rpc-protocol + onboarding-ux skill'leri (dilim-3)
- VSCODE-EXT-1 — CHAT-IDE gerçek-impl dilim-1 (Sıra-64)
- TOOLCU-DESIGN — computer-use/browser pack tasarım-notu (Sıra-83, P2)

### Changed

- ONB-ENTRY-WIRE — wizard'ı `deckent onboard` komutuna bağla (completed with tech debt)
- AUTONOMOUS-APPROVAL-MCP — DEFER-001 kalan yüzey (completed with tech debt)
- WATCH-SESSION-WARN — 4+ paralel-oturum uyarısı (session-registry wire) (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L


_Tasks: 15 total, 13 done, 3 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint362] - 2026-07-02

### Added

- HERMETIC-RUNSTATE — start-testleri gerçek-repo'dan kopar (born-480)
- APRHIST-DEBT-CLOSE — 360-013 debt-notunu kapat
- DOMAIN-ROUTE-WIRE — routeTaskV2'ye domainFromScope + openrouter-doc-route bağla
- CLIENTS-RELAY-WIRE — Slack/Teams adaptörlerini relay-config'e bağla
- ONB-GLOBAL-STORE — global-katman deposu dilim-2
- WIZARD-INK — onboarding-wizard Ink yüzeyi (dilim-2)
- D004-SHIM-REGISTRY — bilinçli katman-geçişleri için istisna-kaydı (361-014 debt)

### Changed

- Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L (completed with tech debt)
- LIMITS-WARN-FIELDS — pencere-başına warn eşiği (361-002 debt) (completed with tech debt)
- RPC-API-WIRE — TERM-RPC'yi HTTP yüzeyine bağla (dilim-2a) (completed with tech debt)

### Fixed

- MODEL-DROP-FIX — forceModel zinciri kök+fix (born-479, P0)
- RPC-REPL-WIRE — REPL'e rpc-client + /rpc debug-komutu (dilim-2b-read)
- CODEX-DOGFOOD-V3 — gerçek codex analiz-işi (479-fix sonrası)


_Tasks: 14 total, 14 done, 4 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint361] - 2026-07-02

### Added

- OPENROUTER-DOC-ROUTE — doc-kind→free-model önerisi (CARRYOVER 360-008, aynı-spec)
- CODEX-RETRY-RCA — codex-timeout kök-analizi + yeniden-deneme (GERÇEK codex-worker)
- OPENROUTER-BOOTSTRAP — adapter'ı provider-bootstrap'a flag'li kaydet
- ONB-GLOBAL-DESIGN — global-install + proje-scope mimari tasarımı (Sıra-200 dilim-1)
- ONB-WIZARD-CORE — install→init sihirbaz çekirdeği (Sıra-201 dilim-1)
- APR-CLIENTS-CORE — Slack/Teams onay-kanal adaptörleri (Sıra-70 dilim-1)
- TERM-RPC-CORE — ortak session/action RPC protokol çekirdeği (Sıra-54 dilim-1)
- AGSK-2 — katalog dilim-2: integration-engineer + terminal-ux-engineer agent'ları (Sıra-85)
- TOOL-REG-SHADOW — shadow/override-policy dilimi (Sıra-24 kapanışı)
- F7-MULTISESSION — terminal çok-oturum hardening dilimi (Sıra-65 devam)

### Changed

- Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L (completed with tech debt)
- LIMIT-GATE-WIRE — `deckent limits` + start-gate (CARRYOVER 360-003, aynı-spec) (completed with tech debt)
- DEFER-002-NERVOUS — nervous MCP undo/edit + askBrain-escalation dilimi (Sıra-75) (completed with tech debt)

### Fixed

- POSTFIX-PENDING-SCAN — FIX-sonrası hiç-başlamamış eligible'ları koştur (born-475)
- FIX-MODEL-PRESERVE — fix-task orijinalin model/provider/backend mirası (born-476)


_Tasks: 17 total, 17 done, 4 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint360] - 2026-07-02

### Added

- LIMIT-PREFLIGHT — abonelik-pencere probu (claude -p "/usage" parse)
- GPT55-CATALOG — gpt-5.5 model-kaydı (feed-fiyatlı, zero-hardcode)
- CODEX-SPAWN-READINESS — codex worker-yolunun canlı-hazırlık denetimi
- OPENROUTER-ADAPTER — OpenRouter worker/chat adaptör çekirdeği
- OPENROUTER-FREE-PROBE — ücretsiz-model envanteri + settings + doc
- F11-016-STAB — Ink REPL stabilizasyon dilimi (app.tsx)
- TERM-NAT-M5 — parite-kapısındaki bilinen-sapmaları kapat
- F11-014-CODEX-PARITY — REPL codex send-yolu parite testleri
- F2-008-SDK-1 — gömülebilir SDK round-trip dilim-1 (zero-CLI-prereq)
- CODEX-DOGFOOD-A — üç-sprint worker-kalite karşılaştırma analizi (GERÇEK codex-worker)

### Changed

- APR-HISTORY-WIRE — endpoint'i canlı server'a bağla (71 kapanışı) (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L


_Tasks: 28 total, 26 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint359] - 2026-07-02

### Added

- WRAPPER-HB-GATE + ALLOWLIST-SSOT (born-468 + born-471)
- ADR-POINTER-PATH — tiered-injection pointer'ı erişilebilir dosyaya (born-469)
- ROUTE-DOMAIN-SCOPE — domain-sinyalini scope-path'ten türet (born-470, flag'li)
- TOOL-REG-2 — dynamic-schema-override + generation-memo dilimi (Sıra-24 devam)
- TERM-COMPAT — REPL compat test-matrisi + PTY smoke (Sıra-52)
- NL-DISPATCH-EVIDENCE — agenticDispatch default kararı için kanıt-paketi (Sıra-57)
- F7-HARDEN — terminal hardening dilimi: session-history + copy-paste (Sıra-65)
- RUNTIME-GITIGNORE — çalışma-zamanı artefakt hijyeni
- TOOL-HOOK-SEAM — plugin/hook seam çekirdeği (Sıra-84)
- AUTONOMOUS-MCP — autonomous start/backlog/status MCP yüzeyi (Sıra-74 dilim)

### Changed

- DEP-NORMALIZE — dependency-ref'leri plan-yazımında slot-ID'ye çevir (born-465) (completed with tech debt)
- TMUX-TIMEOUT-PARITY — tmux wrapper'ına 466-ailesi paritesi (completed with tech debt)
- TERM-SIMPLE — Simple-Mode edition (Sıra-53) (completed with tech debt)
- PARITY-CLI-MCP — agent/skill/memory_manage + cost tool paritesi (Sıra-86 dilim) (completed with tech debt)
- AGSK-EXPAND — katalog genişleme dilim-1: 3 yeni horizontal skill (Sıra-85) (completed with tech debt)
- APR-HISTORY — dashboard onay-geçmişi paneli (Sıra-71) (completed with tech debt)


_Tasks: 16 total, 16 done, 6 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint358] - 2026-07-02

### Added

- APR-XPROC-CORE — approval-store dizin-izleyici çekirdeği (born-462 dilim-1)
- APR-XPROC-WIRE — REPL'e cross-process onay beslemesi (born-462 dilim-2)
- APP-SURFACE-WIRE — /resume picker + açılış-teaser + busy-kontrolleri (app.tsx)
- CKPT-QUESTION-BRIDGE-WIRE — worker-soruları gerçek onaya (Sıra-73 kapanışı)
- ALLOWSCOPE-COMPOSE — always-allow'u worker-gate önüne bağla (Sıra-69 kapanışı)
- DEP-REF-LOUD — çözülemeyen dependency-ref sessiz düşmesin (born-458)
- RETRO-DEBT-COUNT — retro sayaç-kaynağı düzelt (born-460)
- REFDOCS-ADR-REGEX — docs:ref yeni ADR-taksonomisini tanısın (born-461)
- PKG-SSOT-CLOSE — kalan 13 hardcode-hint SSOT'a (Sıra-207 kapanışı)
- CONFIG-ROUNDTRIP-GUARD — flag-drop sınıfına kalıcı mekanik kapan (born-464 guard)

### Changed

- REPL-DETACHED-START — REPL'den kilitlemeyen sprint-start (completed with tech debt)
- REPL-DISPATCH-PARITY — /nervous köprü-tüketimi + /autonomous /mcp parite (completed with tech debt)
- HELP-SURFACE-WIRE — /help'e katalog + mode-filtre (Sıra-26+56 kapanışı) (completed with tech debt)
- TRN-PIPE-WIRE — pipeline outcome-etiketi taksonomiden (Sıra-79 kapanışı) (completed with tech debt)


_Tasks: 18 total, 18 done, 4 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint357] - 2026-07-02

### Added

- TOOL-CAT — tool/action katalog veri-modeli + trust-tier
- TERM-CAT — katalog render + trust badge (string-free)
- TOOL-REG — availability-cache (TTL) + toolset enable/disable dilimi
- CKPT-1 — WorkerQuestion → ApprovalBroker köprüsü (gerçek human-checkpoint)
- APR-ALLOWSCOPE — scoped always-allow (asla global)
- APPROVE-007b — REPL /nervous köprüsü + handleEdit
- TERM-RESUME — recent-session teaser + /resume picker çekirdeği
- TERM-BUSY — /queue /interrupt /steer durum-makinesi
- PROVIDER-SSOT — buildReplProvider → resolveChatAdapter tekleştirme
- TRN-LABEL — run-outcome etiket taksonomisi

### Changed

- TERM-CONFIG-WIRE — TerminalConfig'i runtime'a bağla (completed with tech debt)
- SLASH-MODE-WIRE — filterRegistryByMode'u /help yoluna bağla (completed with tech debt)
- ONB-HONEST — doctor "hazır/eksik/tek-tık-fix" dürüst mesaj katmanı (completed with tech debt)
- LINK-SWEEP — eski-ADR linklerinin crosswalk taraması (born-455) (completed with tech debt)

### Fixed

- TOK-AUT — autonomous task-mode tokenUsage 0/0/0 fix


_Tasks: 17 total, 17 done, 5 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint356] - 2026-07-02

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint355] - 2026-07-01

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint354] - 2026-07-01

### Added

- TOOL-REPL-WIRE — deckent tool-yüzeyini native-tool-registry'ye köprüle
- APR-SHELLCLIENT — Ink onay-kartı (row 33)
- APR-DUALSTREAM — çift-bölge kompozitörü (row 36)
- WORKERGATE-WIRE — riskli worker-tool'ları gate'le (flag-gated)
- DECKBROKER-WIRE — subprocess secret'ları broker'dan (flag-gated)
- TERM-FLOW — altın-akış orkestratörü (row 40)
- DIR1-CMD — `deckent plan-nl` + komut-kayıtları (index.ts TEK-yetkili)
- CONNECT-CMD — `deckent connect` komutu (kayıtsız — kayıt Task 8'de)
- APR-EXPIRY-DRIVER — TTL süpürücü (G-013-güvenli)
- STATE-FEED — live-footer gerçek besleme

### Changed

- REPL-SURFACE-WIRE — footer+mode+queue'yu Ink-app'e bağla (completed with tech debt)
- MOAT3-FIXPHASE — NOT_DISPATCHED → FIX re-dispatch (completed with tech debt)
- DEBT-LEDGER-COVERAGE — self-DEBT'ler neden ledger'a düşmüyor (completed with tech debt)
- APR-RULES-LOAD — policy-kuralları config'ten (saf yükleyici) (completed with tech debt)


_Tasks: 15 total, 15 done, 4 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint353] - 2026-07-01

### Added

- SCOPECHECK-CORE — realpath scope-check primitive'ini core'a taşı (352-010 ADR-debt)
- APR-STORE — durable approval store (row 31)
- APR-POLICY — karar-motoru (row 32)
- APR-WORKERGATE — riskli-aksiyon önü worker kapısı (row 34)
- APR-FALLBACK — FallbackResolver (row 35)
- APR-EVENTSTREAM — çok-client yayın (row 68)
- TERM-LIVE — canlı run-status footer üretici (row 43)
- TERM-MODE — Ask/Run/Control 3-mod makinesi (row 39)
- TERM-2 — chat-turn çekirdeği (row 41)
- TERM-CONNECT — /connect sihirbaz çekirdeği (row 46)


_Tasks: 16 total, 16 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint352] - 2026-07-01

### Added

- TOOL-2 — progressive disclosure köprüsü (row 21 YENİDEN-KOŞUM)
- EXEC-THROW-HUNT — waitForResults istisna-avı + tick-zırhı (row 452 🔴)
- EVAL-AUDIT-REVIVE — ölü audit-trail'i canlandır (row 451 🔴)
- SWEEP2 — stale model-ID part-2 (row 431 kalanı, YENİDEN-KOŞUM)
- DPP — dead provision-helper purge/consent (row 208, YENİDEN-KOŞUM)
- CFG-1 — legacy `mode` config-set blokajı (row 209, YENİDEN-KOŞUM)
- DOCTOR-1 — backend-aware platform-check (row 210, YENİDEN-KOŞUM)
- TOOL-CORE — core-tool-set eager listesi wire (row 23, P1)
- TOOL-SCOPE — out-of-scope yazımı tool-gate'le (row 22, P0)
- APR-2 — çok-kanallı onay-relay çekirdeği (row 67, P0)

### Changed

- W5C — kind-affinity, config-gated (row 447, YENİDEN-KOŞUM) (completed with tech debt)
- ROUTING-VERSION-LABEL — 'v3'-return vs 'v2'-stamp uzlaştır (ADR-G-006 P2) (completed with tech debt)


_Tasks: 15 total, 15 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint350] - 2026-07-01

### Added

- TRN-1 — trace-recorder'ı sprint-worker turn'lerine WIRE (row 76)
- TRN-2 — trace-recorder'ı native-REPL'e WIRE (row 77)
- TRN-3 — cc-trace-extractor driver (row 78)
- APR-CONTRACT — ApprovalRequest tam kontratı (row 30)
- SIGTERM-CLEANUP — SIGTERM'i SIGINT temizlik-yoluna bağla (ADR-G-013 born)
- STALE-MODEL-ID-SWEEP — 30 test dosyasında sonnet-ID güncelle (row 431)


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint349] - 2026-07-01

### Added

- FINALIZE-ERROR-SURFACE — swallowed finalize failures become visible (row 436)
- CRED-HARDEN-PACK — AAD binding + atomic writes + Windows honesty (row 438)
- REDACT-COVERAGE — extend the secret-mask allowlist (row 437)
- PCOMP-W8 — test-strategy hints for exit-path tasks (row 445)

### Fixed

- DOCKER-FIXPACK — stale-shadow EACCES + inert kind-memlimit (rows 434+433)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint347] - 2026-07-01

### Added

- No completed tasks


_Tasks: 5 total, 0 done, 0 tech debt, 5 no-go_

## [1.0.0-beta.1-sprint346] - 2026-06-28


### Fixed

- F01 — fix guide onboarding-core
- F02 — fix guide concepts
- F03 — fix guide autonomous & learning
- F04 — fix guide nervous, dashboard & REPL
- F05 — fix guide workers, troubleshooting & misc
- F06 — fix guide providers & backends
- F10 — fix reference MCP (hand-authored only)
- F11 — fix reference routing, execution & dependencies
- F12 — fix reference enterprise (+ broken self-anchors)
- F13 — fix reference ops & security


_Tasks: 24 total, 13 done, 0 tech debt, 11 no-go_

## [1.0.0-beta.1-sprint345] - 2026-06-28

### Added

- A01 — guide onboarding-core
- A02 — guide onboarding-concepts
- A03 — guide autonomous & learning
- A04 — guide nervous, dashboard & REPL
- A05 — guide workers, troubleshooting & misc
- A06 — guide providers & backends


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint344] - 2026-06-27

### Added

- 008-redo — skill-sandbox AST-scan honest-fail when TypeScript is unavailable

### Changed

- 009-redo — getMessage deduplicated prod-warn on missing i18n key (completed with tech debt)

### Fixed

- 002-redo — B1 RBAC: fix the stale `enforce_rbac` comment in sprint-runtime.ts (+ verify worker honor)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint343] - 2026-06-27

### Added

- Track A — EVALUATE-phase enforcement gates (A14 verify-delta downgrade + A9 ADR-compliance), flag-gated default-off
- Track B — R4: consolidate the two VS Code extension trees onto the canonical one (delete the stub)
- Track D — skill-sandbox AST-scan honest-fail when TypeScript is unavailable (no silent no-op)
- Track D — `getMessage` deduplicated prod-warn on missing i18n key (visibility without spam)
- Track E — ADR-094: flag-gated enforcement-vein seam (verify-delta · ADR-compliance · spend-warn · RBAC hard-deny)
- Track E — LAST-STANDING campaign closeout findings note (NEW dated doc; NOT MASTER-PLAN/TRIAGE)

### Changed

- Track A — B6 cumulative-spend warn-gate at PRE-SPAWN (daily/monthly), flag-gated default-off (completed with tech debt)
- Track B — R4: remove the dead `@deprecated async evaluateResult`, leave `evaluateWithRubric` canonical (completed with tech debt)
- Track C — native-chat `/provider` switch rebuilds the adapter (wire the callback) (completed with tech debt)
- Track C — routing-affinity (ADR-075): thread `skill_agent_affinity` config → RoutingOptions + balance-observability, default-off (completed with tech debt)

### Fixed

- Track A — B1 RBAC: worker `checkWorkerAuthority` honors `enforceRbac` (hard-deny) + stale-comment fix, flag-gated default-off


_Tasks: 12 total, 12 done, 4 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint328] - 2026-06-26

### Added

- rich normalized usage schema (foundation)
- Class-A claude usage-emit (CLI-agent, native source)
- Class-A gemini verify + extractUsage→result (CLI-agent)
- Class-B API usage-accumulate → result (HTTP-response providers)
- Class-C OpenRouter first-class (unified gateway, API side)

### Changed

- Class-A codex usage-emit (CLI-agent, native source) (completed with tech debt)


_Tasks: 6 total, 6 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint327] - 2026-06-26


### Changed

- live-proof doc note (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint326] - 2026-06-26

### Added

- Result Zod schema + validator (the spine)
- result-assembler (orchestrator-owned, git-authoritative)
- token capture — extractUsage adapter contract + codex + normalizer
- remove worker token self-count placeholder
- cost — calculateActualCost (cross-provider, local→$0)
- structured-JSONL log-event contract
- complete-stream capture into log
- archive-then-delete log integrity
- dashboard live log-renderer + result-display
- Auditor 2nd-layer validation + finding-ledger

### Changed

- tokenizer-fallback (usage-raporlamayan provider) (completed with tech debt)

### Fixed

- live SSE stream wire (dead-stream fix)


_Tasks: 19 total, 19 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint311] - 2026-06-19

### Added

- ADR-001-W — "Node 18" → "Node 24+" sweep (LIVE src only)
- ADR-021-W — output_splash dormant-knob → gerçek gate
- ADR-028-W — routing_engine default 'v1'→'v2' (config-tutarlılık)
- ADR-010-W — cli-highlight + zod ADR-attribution (doc-only)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint290] - 2026-06-18

### Added

- CORE-UNIFORMITY slice 2 — mod-bağımsız Lifecycle kernel
- ADR-NOISE — checkADRCompliance count_check'i task-spesifik yap
- DOC-35 — DECKENT.md tool-count 34→35 + process

### Changed

- F3-008 — process-mode executor (mod-geçişi 3/3) (completed with tech debt)

### Fixed

- TOK-AUT — autonomous tokenUsage 0/0/0 fix
- IDLE-SPIN — autonomous idle busy-spin teşhis + fix


_Tasks: 6 total, 6 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint289] - 2026-06-15

### Added

- Process anti-IDOR + positive-OIDC tenant-stamp testleri
- Actor.id audit-lineage — gerçek OIDC sub audit-chain'e düşsün
- deriveRequestPrincipal defense-in-depth (verified-claims sinyali)
- Test-kapsama kapanışı (N3 drain integration + N2 401/sub-flag + D8 guard)
- Stale-comment süpürmesi (doc-drift temizliği)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint288] - 2026-06-15

### Added

- Tema A — Genel Bakış & Vizyon
- Tema B — Orkestrasyon Çekirdeği
- Tema C — Agent / Skill / Provider Sistemi
- Tema D — Hafıza, Yönetişim, Gözlem
- Tema E — Arayüzler & Operasyon


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint287] - 2026-06-14

### Added

- roadmap.md — user-facing yol-haritasına dönüştür
- blueprint.md + blueprint-TR.md — de-competitor + de-stale
- enterprise referansları — derinleştir (286-020 yüzeysel kaldı)


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint286] - 2026-06-14

### Added

- README.md — proje vitrini (flagship)
- README-TR.md — TR ayna
- SECURITY.md + CONTRIBUTING.md
- CODE_OF_CONDUCT.md + CHANGELOG.md
- examples/ — çalıştırılabilir örnekler
- docs/ giriş + sözlük + indeks
- docs/ politika + worker rehberi
- guide — başlangıç + kurulum
- guide — quickstart + ilk sprint + kavramlar
- guide — deckent-nedir + mimari-bakış + özellik-matrisi

### Fixed

- cookbook — alarmlar + uygulama tarifleri (10 + add-rest-api + fix-bug)


_Tasks: 57 total, 53 done, 0 tech debt, 4 no-go_

## [1.0.0-beta.1-sprint285] - 2026-06-12

### Added

- Enstrümante kök-teşhis — 3 hipotezi ayrıştır + failing-repro
- Stream-toplama sağlamlığı — prose-konum bağımsızlığı
- Çoklu tool-sonucu geri-beslemesi — model HEPSİNİ görür

### Changed

- Tur-içi tool-KUYRUĞU + per-tool sıralı onay (Ink) (completed with tech debt)


_Tasks: 8 total, 7 done, 1 tech debt, 1 no-go_

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
