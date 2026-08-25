# Changelog

> **Engineering sprint ledger — NOT product release notes.** Product, per-version release notes are
> the repository-root [CHANGELOG.md](../CHANGELOG.md) (the single source of truth that
> `.github/workflows/release.yml` reads). This file is the machine-written, verbose per-sprint
> engineering log (each sprint's task-level Added/Changed/Fixed, appended by the sprint finalizer).
> Since the `0.100.0` rebaseline its headers are sprint numbers (`## [sprintNN]`) only — never
> product-version-shaped tags.
>
> Pre-`0.100.0` sprint history (the retired `1.0.0-beta.1-sprintNNN` ledger) is archived at
> [docs/archive/docs-pre-reset-2026-08-14/CHANGELOG.md](archive/docs-pre-reset-2026-08-14/CHANGELOG.md);
> the earlier reset is at
> [docs/archive/docs-pre-reset-2026-08-03/CHANGELOG.md](archive/docs-pre-reset-2026-08-03/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [sprint677] - 2026-08-25

### Added

- 3350a plan-purity cekirdegi — dry-run temp-agent yazmaz, katalog sessiz-cokusu typed olur
- 3350b preview-parity yuzeyleri — CLI writeScopePolicy paritesi + MCP dryRun gercek olur
- 3351 spawn-retry immunity — runtime-only alanlar drift-karsilastirmasindan cikar
- 541 artifact-class — prompt-delivery receipt'i task sayilmaz
- 3352a lock-ownership — sprint.lock startToken kaniti + resume typed reconciliation
- 3352b close-stale kapsami — start-attempt journal'i operator sweep'ine girer
- 3353 budget-authoring — calisamayan subprocess+finite-budget kombinasyonu init/config'te onlenir
- 540 clean-HOLD exit-kontrati — kalici alt-surec pini (kanitla-kapanis)


_Tasks: 8 total, 8 done, 0 tech debt, 0 no-go_

## [sprint676] - 2026-08-25

### Added

- config knob — routing_v3.explorationBonus (default 0)
- bonus mekanigi + gorunurluk (finalScore-katmani blend)
- davranis-bekcisi — default-0 notrluk + nonzero davranis pinleri


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint675] - 2026-08-25

### Added

- kalan bagimsiz hb yazicilarinin primitive'e rewire'i
- MCP + API readiness parity
- dalga evidence harness

### Fixed

- CLI status — sweep senkron + UNAVAILABLE yerine readiness + dedup + fixRetry render


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint669] - 2026-08-24

### Added

- Append the next sequential bench case


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint668] - 2026-08-24

### Added

- Append the next sequential bench case


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint667] - 2026-08-24

### Added

- Append the next sequential bench case


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint661] - 2026-08-24

### Added

- Canonical scope compiler and prompt admission
- Scheduler admission settlement, quiescence and journal truth

### Changed

- Repair preserved modular layer gate implementation (completed with tech debt)


_Tasks: 9 total, 3 done, 1 tech debt, 0 no-go_

## [sprint659] - 2026-08-24

### Added

- Core gate and API ingress acceptance
- MCP ingress and registry acceptance
- Canonical pending producer-to-consumer fan-in acceptance


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint657] - 2026-08-24

### Added

- Prompt receipt and result-contract acceptance

### Changed

- Docker settlement and finalizer attribution acceptance (completed with tech debt)

### Fixed

- Dependent and FIX shared-boundary fan-in acceptance


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [sprint653] - 2026-08-24

### Added

- Typed PromptCompilePlan and applicability-aware result ingress
- Read-only role policy and ADR/scope authority repair

### Changed

- Single-source verification, scope and criterion compiler fan-in (completed with tech debt)

### Fixed

- Prefix-default and production prompt authority canary


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [sprint652] - 2026-08-24

### Added

- Declarative criterion applicability authority
- Normative verdict production-chain conformance
- Applicability-aware evaluator and durable reconstruction

### Fixed

- Initial-attempt/FIX parity and production fan-in


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint649] - 2026-08-24

### Added

- Make terminal Brain adoption replay temporally stable
- Preserve idempotent finalizer re-entry across later Brain refreshes

### Changed

- Read canonical sidecars and multi-attempt lineages without false rejection (completed with tech debt)

### Fixed

- Prove sequential archives and FIX lineage through the real usage ingress


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [sprint648] - 2026-08-24

### Added

- Plan-time task authority verification
- Catalog-mask production wiring verification
- Archive, kernel and receipt verification
- CLI and end-to-end canary verification


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint647] - 2026-08-24

### Added

- Plan-time task authority verification
- Catalog-mask production wiring verification
- Archive, kernel and receipt verification

### Changed

- CLI and end-to-end canary verification (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [sprint646] - 2026-08-24

### Added

- Canonical response-budget authority
- Prompt and parser adoption
- Durable receipt and bootstrap budget parity
- Production fan-in regression


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint645] - 2026-08-24

### Added

- Provider-source hostile model-window proof
- Provider-evidence producer downstream admission proof
- XVerify preparation integration fan-in


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint641] - 2026-08-24

### Added

- Composite runtime-adoption contract and immutable store
- Ownership-bound bot runtime build identity
- Fresh dist build-identity read model
- Provider-observation runtime adoption CLI composition


_Tasks: 5 total, 4 done, 0 tech debt, 1 no-go_

## [sprint639] - 2026-08-24

### Added

- Cursor production image CLI and complete image-command i18n
- Canonical Cursor catalog visibility
- Cross-platform Cursor Docker auth isolation
- Cursor production wiring fan-in


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint638] - 2026-08-24

### Added

- Verified approval lineage
- Durable monotonic receipt
- Canonical batch CLI UX and i18n
- Production fan-in

### Changed

- Multi-run batch planning authority (completed with tech debt)
- XVerify retirement fail-closed hardening (completed with tech debt)


_Tasks: 6 total, 6 done, 2 tech debt, 0 no-go_

## [sprint636] - 2026-08-23

### Added

- Core reconciliation plan and apply authority
- Durable reconciliation receipt store (depends on Task 1)
- Authenticated approval bridge (depends on Task 1)
- Future XVerify retirement wiring
- Canonical CLI reconciliation ingress (depends on Tasks 1, 2, 3)
- Production fan-in and regression proof (depends on Tasks 1, 2, 3, 4, 5, 6)

### Changed

- Future ABORTED sprint retirement wiring (completed with tech debt)


_Tasks: 7 total, 7 done, 1 tech debt, 0 no-go_

## [sprint635] - 2026-08-23

### Added

- Verify terminal archive commit and replay invariants
- Verify both production finalizer entry paths
- Verify observability publication containment
- Verify the production writer ratchet (depends on Tasks 1, 2, 3)
- Fan-in acceptance (depends on Tasks 1, 2, 3, 4)


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [sprint634] - 2026-08-23

### Added

- Verify terminal archive commit and replay invariants
- Verify both production finalizer entry paths
- Verify observability publication containment
- Fan-in acceptance (depends on Tasks 1, 2, 3, 4)

### Fixed

- Fix debt: Task evaluated as GO_WITH_TECH_DEBT. Residual gap (worker-typed): package.json lint:gates still need…
- Verify the production writer ratchet (depends on Fix debt and Tasks 1, 2, 3)


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [sprint632] - 2026-08-23

### Added

- Fail-closed canonical artifact publisher
- Observability producer adopts canonical publisher
- Retire the metrics raw-writer allowlist
- Fan-in writer-authority acceptance (depends on Tasks 1, 2, 3)


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint631] - 2026-08-23

### Added

- Remove unconsumed product-doc load-report churn
- Seal-owned counter retirement and handoff settlement
- Single manifest writer and computed-writer ratchet closure
- Fan-in production acceptance (depends on Tasks 1, 2, 3, 4)

### Changed

- Truthful stable archive operator contract (completed with tech debt)


_Tasks: 5 total, 5 done, 1 tech debt, 0 no-go_

## [sprint630] - 2026-08-23

### Added

- Core terminal seal and Brain adoption authority
- Terminal lifecycle ingress and outermost ordering
- Archive CLI and i18n production surface
- Event ownership and archive-writer ratchet
- Fan-in terminal acceptance battery


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [sprint628] - 2026-08-23


### Fixed

- FO01 ingress wiring inventory (logical lineage settled through FIX recovery)
- FO02 policy and provenance inventory (logical lineage settled through FIX recovery)
- FO03 conformance matrix inventory (logical lineage settled through FIX recovery)
- FO04 shared containment authority resolver
- FO05 manual spawn production consumer
- FO06 sprint and continuation consumer parity
- FO07 adversarial parity fan-in proof

### Changed

- Root acceptance replaced the worker's producer-less authorization wrapper with the
  canonical task-stamped `budgetPolicy.finalOnlyUsage` authority and preserved the
  independent XVerify runtime-grant seam.
- Mixed `filesRead` + `filesWrite` prompts now preserve both authority sets; checkpoint
  and post-FIX aggregation recover correctly from terminal FIX lineages.

_Tasks: 7 logical total, 7 done, 0 tech debt, 0 unresolved_

## [sprint1780659451558] - 2026-08-22

### Added

- POMR01-STORE-CLOSURE Receipt store implementation plus executable proof
- POMR03-CLI-CLOSURE Real adopt producer→durable store→fresh-read
- POMR04-I18N-CLOSURE EN/TR receipt surface and parity
- POMR05-CLI-NEGATIVE CLI restart, replay and zero-write regressions
- POMR07-SNAPSHOT-REGRESSION Immutable SQLite boundary audit
- POMR08-STORE-RESTART Fresh-process and privacy assurance
- POMR10-INVENTORY-TRUTH Predecessor and current authority inventory
- POMR12-WIRING-AUDIT Production closure map
- POMR14-ARCHIVE-INVARIANT Normal-finalizer proof contract
- POMR15-RESULT-EVIDENCE Work 480 result superseding cut

### Changed

- POMR02-STORE-SCALE 10k lookup and concurrent publication proof (completed with tech debt)
- POMR06-ADVERSARIAL Receipt forgery and project-boundary proof (completed with tech debt)
- POMR11-CONTRACT-TRUTH Receipt contract implementation synchronization (completed with tech debt)
- POMR13-CURRENT-MEASUREMENT Aggregate live re-measurement (completed with tech debt)
- POMR18-MASTER-TRUTH Work 480 acceptance correction (completed with tech debt)

### Fixed

- Fix: POMR09-REAL-BINARY-E2E Compiled command lifecycle fixture
- Fix: Fix: Fix: Fix: POMR20-FINAL-CONSISTENCY Ordered package report


_Tasks: 20 total, 20 done, 5 tech debt, 0 no-go_

## [sprint1780659451557] - 2026-08-22

### Added

- POM02-RECEIPT-CONTRACT Durable adoption receipt contract
- POM03-IMMUTABLE-READ Side-effect-free SQLite snapshot reader
- POM10-I18N-PROOF Message parity regression

### Changed

- POM01-DISK-INVENTORY Exact adoption authority inventory (completed with tech debt)
- POM04-IMMUTABLE-READ-PROOF Snapshot/WAL/concurrency regression proof (completed with tech debt)
- POM09-I18N Adoption receipt user messages (completed with tech debt)

### Fixed

- Fix: Fix: Fix: Fix: POM05-RECEIPT-STORE Content-addressed durable receipt authority


_Tasks: 20 total, 7 done, 3 tech debt, 0 no-go_

## [sprint1780659451556] - 2026-08-22

### Added

- R01-LINK-REPAIR Closure gate source-reference repair
- R02-PROJECTION-EVIDENCE Current MASTER projection measurement
- R03-BRIEF-REPAIR Transition brief current-truth correction
- R04-RESULT-REPAIR Work 7084 bounded result synchronization
- R05-VERIFICATION-REPAIR Verification record synchronization
- R06-FINAL-CONSISTENCY Ordered repair proof


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [sprint1780659451549] - 2026-08-22

### Added

- Canonical CLI consumer and text-source byte hygiene


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint1780659451548] - 2026-08-22

### Added

- CLI default-path parity and real handler regression

### Changed

- Canonical provider-observation path authority (completed with tech debt)


_Tasks: 2 total, 2 done, 1 tech debt, 0 no-go_

## [sprint1780659451547] - 2026-08-22

### Added

- Compiled adoption and closure evidence


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint1780659451546] - 2026-08-22

### Added

- Graceful terminal-notification drain

### Fixed

- Fix-lineage evidence


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint1780659451545] - 2026-08-22

### Added

- Adoption schema and duplicate-identity authority
- Disposable notification lifecycle contract
- Finite CLI and detached-runner teardown wiring
- Autonomous notification teardown wiring
- Terminal closure evidence reconciliation


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [sprint1780659451544] - 2026-08-22

### Added

- Core compile and canonicalization closure
- Adoption verifier proof
- Exact CLI wiring and real-process proof

### Changed

- Migration authority proof (completed with tech debt)
- Critical ApprovalBroker bridge proof (completed with tech debt)
- Continuation evidence reconciliation (completed with tech debt)


_Tasks: 6 total, 6 done, 3 tech debt, 0 no-go_

## [sprint1780659451539] - 2026-08-22

### Added

- Outcome capsule
- Live phase-chain inventory
- Projection drift inventory
- Transition brief inventory
- Approval capability-policy inventory
- Core-memory inventory
- Product residual inventory
- Health and ETA readiness
- Row 3296 supersession inventory
- Transition brief update


_Tasks: 20 total, 17 done, 0 tech debt, 0 no-go_

## [sprint622] - 2026-08-22

### Added

- Continuation current-truth inventory
- Recovery sidecar projection parity pin
- Checkpoint PENDING to disk PAUSED resume parity
- Status projection recovery reconciliation
- Recovery truth nine-case end-to-end matrix
- Recovery authority ratchet and result evidence

### Changed

- Immutable evaluation receipt restart replay pin (completed with tech debt)
- Recover force checkpoint-policy production wiring (completed with tech debt)


_Tasks: 8 total, 8 done, 2 tech debt, 0 no-go_

## [sprint619] - 2026-08-22

### Added

- Durable LLM authority binding and restart verifier
- Serve dual-authority default composition and ownership
- Authority duplication ratchet
- End-to-end restart, race and real composition proof


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint613] - 2026-08-21

### Added

- Hermetic provider-probe broker clock


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint612] - 2026-08-21

### Added

- Canonical bounded probe risk envelope
- Rule application production-chain proof


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint611] - 2026-08-21

### Added

- Wave-level verification placement
- Worker prompt verification placement
- Typed criterion evidence grammar
- Planner to evaluator recovery integration

### Fixed

- FIX provenance circuit breaker


_Tasks: 5 total, 5 done, 0 tech debt, 0 no-go_

## [sprint606] - 2026-08-21

### Added

- Claude Docker evidence-source ve authoring composition tasarimi


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint605] - 2026-08-21

### Added

- D4 blueprint canonical-path ve closure-DAG düzeltmesi


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint604] - 2026-08-21

### Added

- D4 olculmus lifecycle blueprint ve closure matrisi


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint603] - 2026-08-21

### Added

- VS Code decide istemci-ucu (T11)
- orphan-delisting + kanal-matrisi i18n (T12)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint602] - 2026-08-21

### Added

- bot-sürecinde relay + kanal-karar zinciri (T7)
- VS Code decide sunucu-ucu (T10)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint601] - 2026-08-21

### Added

- bootstrap callback-dallanması (T3 — 'brk' rotası)
- ingress 4. slot + decideChannel (T5)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint599] - 2026-08-21

### Added

- callback-payload sözleşmesi (nonce + ad-uzayı + kısa-kod)
- approval_channels config — telegram girdisi + tipler (T8)
- y/n grameri + DE1 kısa-kod absorbe (T9)


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint598] - 2026-08-21

### Added

- AI-operatör dersi 26 (pgrep kendi-desen tuzağı; iki dil senkron)


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint597] - 2026-08-21

### Added

- registry cache-read fiyat-girişleri (T4)
- coreExternalized yetenek-tabanlı gate (T5)
- Dockerfile codex sürüm-pini (T6)

### Fixed

- docker-backend prefix-bileşimi (T2, tek-sahip)


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint596] - 2026-08-21

### Added

- config şema-mührü (T7)

### Fixed

- ProviderCommandSpec prefix-alanları (T3 arayüz-mührü)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint595] - 2026-08-21

### Added

- tier-çözümü fail-soft (kök-neden-1)
- cursor-katalog sayım-pinleri


_Tasks: 4 total, 2 done, 0 tech debt, 2 no-go_

## [sprint594] - 2026-08-20

### Added

- codex çekirdek-kaybı düzeltmesi (7094-T4a, CANLI-KANITLI DEFEKT)
- F2c wiring-kapanışı (593-001 debt'i)

### Changed

- F4 model-tier prompt-farklılaşması (7094-T5) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [sprint593] - 2026-08-20

### Added

- F5 görev-sınıfı profil SSOT'u (config-resolved)
- AI-operatör dersleri güncellemesi (iki dil senkron)

### Changed

- F2c katalog/mount maskeleme (flag-gated) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [sprint592] - 2026-08-20

### Added

- 7094-F3 comment-drift temizliği (yorum-only)
- cross_verify config-şema sertleştirmesi
- cursor registry-bootstrap defekti
- xverify cursor backend-simetrisi

### Changed

- cursor Docker imaj-dilimi (INSTALL_CURSOR) (completed with tech debt)


_Tasks: 5 total, 5 done, 1 tech debt, 0 no-go_

## [sprint591] - 2026-08-20

### Added

- cost-gate kullanıcı-metinleri i18n
- prompt-gate kullanıcı-metinleri i18n
- scope-gate kullanıcı-metinleri i18n
- MCP autonomous ana-tool metinleri i18n
- MCP start-tool metinleri i18n
- api/server approvals hata-metinleri i18n


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [sprint590] - 2026-08-20


### Changed

- status blocked-satırı — i18n + neden-dürüst ifade (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [sprint589] - 2026-08-20

### Added

- MCP nervous karar-mesajları i18n
- MCP autonomous karar-mesajları i18n
- sprint-lifecycle checkpoint-notify hardcode i18n
- checkpoint CLI option-desc i18n


_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

## [sprint587] - 2026-08-20

### Added

- V3 assignedSkills force-preserving merge (kaynak-tarafı)
- brain-skill test-literal → kanonik SKILL_PROFILE_VERSION


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint586] - 2026-08-20

### Added

- Mini not


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint585] - 2026-08-20

### Added

- Mini not


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint584] - 2026-08-20

### Added

- Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Selam dokümanı (sonnet özdeş-basit — taban ölçümü)
- Denetim raporu (yalnız-okuma analiz)
- Sonnet-3 notu (özdeş-basit — sonnet zincir sonu)


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [sprint583] - 2026-08-20

### Added

- Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Selam dokümanı (sonnet özdeş-basit — taban ölçümü)
- Denetim raporu (yalnız-okuma analiz)
- Sonnet-3 notu (özdeş-basit — sonnet zincir sonu)


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [sprint582] - 2026-08-19

### Added

- Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Selam dokümanı (sonnet özdeş-basit — taban ölçümü)
- Denetim raporu (yalnız-okuma analiz)
- Sonnet-3 notu (özdeş-basit — sonnet zincir sonu)


_Tasks: 6 total, 6 done, 0 tech debt, 0 no-go_

## [sprint579] - 2026-08-19

### Added

- Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Selam dokümanı (sonnet özdeş-basit — taban ölçümü)
- Denetim raporu (yalnız-okuma analiz)
- Sonnet-3 notu (özdeş-basit — sonnet zincir sonu)


_Tasks: 6 total, 5 done, 0 tech debt, 1 no-go_

## [sprint578] - 2026-08-19

### Added

- ADR-uygunluk notu (basit — tek dosya)


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint575] - 2026-08-19

### Added

- Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Selam dokümanı (sonnet özdeş-basit — taban ölçümü)
- Denetim raporu (yalnız-okuma analiz)
- Sonnet-3 notu (özdeş-basit — sonnet zincir sonu)


_Tasks: 6 total, 5 done, 0 tech debt, 1 no-go_

## [sprint567] - 2026-08-19

### Added

- Deckent araç rehberi (kapsamlı — cache'i dolduran iş)
- Merhaba Dünya (özdeş-basit — cache-hit ölçüm noktası A)
- Opus-3 notu (özdeş-basit — cache-hit ölçüm noktası B)
- Denetim raporu (yalnız-okuma analiz)
- Sonnet-3 notu (özdeş-basit — sonnet zincir sonu)

### Changed

- Selam dokümanı (sonnet özdeş-basit — taban ölçümü) (completed with tech debt)


_Tasks: 6 total, 6 done, 1 tech debt, 0 no-go_

## [sprint562] - 2026-08-18

### Added

- Bütçe-bilinçli @ref kararı — inline vs descriptor modu
- Typed UX + i18n + incident battery (depends on Task 1, Task 2)

### Changed

- deckent_read_file ranged-read — offset/limit satır-aralığı (completed with tech debt)


_Tasks: 3 total, 2 done, 1 tech debt, 1 no-go_

## [sprint560] - 2026-08-18

### Added

- Provider-neutral istek ölçümü + typed admission authority
- Hidden-reasoning farkındalığı + bounded continuation + atomik tool güvenliği (depends on Task 2)
- Context epoch'ları + yapılandırılmış @ref soyağacı + /renew semantiği (depends on Task 1)
- Typed UX + i18n + canonical audit (depends on Task 3, Task 4)
- Incident-şekilli hermetik battery — 11 regresyon kanıtı (depends on Task 5)

### Changed

- Dinamik output tavanı + adapter paritesi (depends on Task 1) (completed with tech debt)


_Tasks: 6 total, 4 done, 1 tech debt, 2 no-go_

## [sprint559] - 2026-08-18

### Added

- Canonical language authority — tek çözücü, dört yolun tasfiyesi
- Lint ratchet — .description hardcode taraması + parity gate genişletmesi
- Hermetic surface battery — iki dilli sadakat + sözleşme envanteri


_Tasks: 6 total, 3 done, 0 tech debt, 3 no-go_

## [sprint557] - 2026-08-18

### Added

- session budget-exhaustion truth + renewable working epoch (core authority)
- propose_run lazy provider bootstrap on the native path

### Changed

- REPL renewal surface — typed offer + /renew command (depends on Task 1) (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [sprint556] - 2026-08-18

### Added

- approval freshness + durable adjudication evidence (channel authority core)

### Changed

- xverify CLI waiting signal + approval-phase timeout (depends on Task 1) (completed with tech debt)
- finalize/kill already-terminated truth (depends on nothing) (completed with tech debt)


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint554] - 2026-08-18

### Added

- provider tool-exposure policy + registry surface view (NT-06 core)
- 1000-tool bounded-surface regression (depends on Tasks 1,2)

### Changed

- loop consumes the exposure view per round (NT-06 wire) (completed with tech debt)


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint553] - 2026-08-18

> Run ABORTED (2/5 dogfood DONE); remainders hand-completed by Brain per owner
> directive ("553 kalanlarını elle işle", ADR-D-007 seam) and landed together.

### Added

- universal tool-result containment broker — bounded envelope + exit-code truth (NT-01/04/05)
- hard per-request context admission + output ceiling on the wire (NT-02/08)
- scratch production wire, durable auto-decision audit, trace config authority (NT-03/12/13)
- qwen-incident deterministic regression fixture + correction baseline document

### Changed

- context budget authority: registry model-advertised FULL window is the ceiling (opus/sonnet/fable 1M); config only narrows
- worker/time budget caps loosened per owner directive (maxTokens 40M, cacheRead 60M, turns 300, docker/final-only 7200s)

### Fixed

- landing-proposal generated-bash `${...}` JS-interpolation protocol bug (brace-free + regression)


_Tasks: 5 total, 2 done, 0 tech debt, 3 no-go_

## [sprint551] - 2026-08-18

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [sprint546] - 2026-08-17

### Added

- authored GO/NO-GO criteria reach the task verbatim
- declared Files enter filesWrite even when not yet on disk (depends on nothing)

### Fixed

- scale-honest post-FIX circuit breaker


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint544] - 2026-08-17

### Added

- Terminal — `deckent inspect --follow` (depends on Task 1)

### Changed

- core — bounded log-tail lineage (completed with tech debt)
- API — task detail serves the log tail (depends on Task 1) (completed with tech debt)
- Desktop — stream adoption on Runs/console (depends on Task 2) (completed with tech debt)
- documentation — follow + tail + stream adoption (depends on Tasks 1,2,3) (completed with tech debt)


_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [sprint542] - 2026-08-17

### Added

- read-model expansion — logical run listing + run lineage detail
- Terminal face — `deckent inspect` (depends on Task 1)
- bilingual reference documentation (depends on Task 1)

### Fixed

- Fix: API face — inspector runs endpoints (depends on Task 1)


_Tasks: 5 total, 4 done, 0 tech debt, 1 no-go_

## [sprint541] - 2026-08-17

### Added

- canonical inspector read-model v1 (core module + hermetic suite)


_Tasks: 2 total, 1 done, 0 tech debt, 1 no-go_

## [sprint540] - 2026-08-17

### Added

- No completed tasks


_Tasks: 1 total, 0 done, 0 tech debt, 1 no-go_

## [sprint539] - 2026-08-17

### Added

- phase5-writer.mjs — claim filing + verified append + projections
- phase5-sign.mjs — owner sign ceremony (depends on Task 1)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint538] - 2026-08-17

### Added

- Phase-5 dry-run bundle builder + hermetic proof


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint537] - 2026-08-17


### Changed

- Canary no-op doc touch (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [sprint536] - 2026-08-17

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [sprint535] - 2026-08-17

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [sprint534] - 2026-08-17

### Added

- No completed tasks


_Tasks: 1 total, 0 done, 0 tech debt, 0 no-go_

## [sprint533] - 2026-08-16

### Added

- close the local-llm agentic worker and settlement lineage
- close the deckent local-llm lifecycle command lineage


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_
