# Sprint Learnings (auto-generated)

## Sprint sprint-398 Learnings
- Sprint sprint-398 Learnings: ## Sprint sprint-398 Learnings
- LAT-KPI-SEED — kpi-backfill + init-builtin-seed (3 fail): GO_WITH_TECH_DEBT — FIXED (tests/e2e/init-builtin-seed.test.ts, 2/2 fails resolved) — root-cause: builtin agent/skill catalog legitimately g
- LAT-SWEEP-PROOF — coverage-eşdeğeri tam-suite yerel kanıt (kapanış-task'ı): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [10 

## Gains
- 398-001 — LAT-ADR — brain/decisions + dead-code-decisions: yeni-taksonomiye taşı (17 fail) — Root cause: both test files asserted the OLD sequential ADR-001..021 / ADR-038 taxonomy against ....
- 398-002 — LAT-ORPHAN — governance orphan-allowlist ratchet-refresh (1 fail) — DIAGNOSE (9-drift = 10 additions - 1 removal): (1) REMOVED src/cli/repl/cursor-model.ts from KNOW...
- 398-004 — LAT-EXEC — tmux-backend + docker-oom + docker-hb (4 fail) — Root cause (DIAGNOSE-first): the 4 failures were NOT caused by any of the suggested candidates (b...
- 398-005 — LAT-NERVOUS — nervous-faz1-smoke (2 fail) — DIAGNOSE-first result: the born-587 hypothesis (nervous.ts SIGINT/process.on -> shutdown-hook-reg...

## Sprint sprint-397 Learnings
- Sprint sprint-397 Learnings: ## Sprint sprint-397 Learnings
- T7-ELOOP — chat-tool-exec raw-throw → DeckentError (CODE-FIX): GO_WITH_TECH_DEBT — Fix: resolveRealPathLenient() line 206 raw `throw new Error('ELOOP: too many symlink levels')` -> `throw new DeckentErro

## Gains
- 397-001 — T1-ARITY — born-585 4.arg assert'leri (2 dosya) — RCA F6b: buildWorkerPrompt(task, agentPrompt, skillPrompts, projectRoot) is 4-arg (src/orchestra/...
- 397-002 — T2-STATUS — f0a03b6f orphan-gate mock+fixture (4 dosya) — RCA F1 fix confirmed by pre-fix run: all 4 files together had 17 failing tests before this change...
- 397-003 — T3-START-NERVOUS-CLEANUP — F2+F3+F4 (4 dosya) — F2 (nervous-ipc-route.test.ts): src/cli/commands/nervous.ts:331 already calls removeNervousPendin...
- 397-004 — T4-DISPATCH — born-514 evidence→regression-guard (2 dosya) — RCA F5 fix: born-514 (task 380-007, AGENTIC-DISPATCH-OVERMATCH) tightened every classifyAgenticIn...
- 397-005 — T5-SIGNAL-SENTINEL — F6a registry-deseni + F7 sentinel (3 dosya) — F6a: src/cli/commands/chat.ts (spawnChatProcess) and src/cli/commands/dashboard.ts (registerDashb...
- 397-006 — T6-CORE-STALE — C2+C3+C6+M1 (4 dosya) — RCA confirmed: all 4 corresponding source files already carried the new/correct behavior (born-56...
- 397-008 — T8-KATALOG-REZERO+RULESHAPE — stats-sıfırlama + 396-$or uyum (DATA+TEST-FIX, 5 dosya) — 6/6 eski-kirmizi kapandi (61/61 gecti).
- 397-009 — T9-MATERIALIZE — C5 hermetik tmp-kopya (2 dosya) — RCA confirmed via node scripts/test-ci-sim.mjs (stashes gitignored .deckent/config.json + .brain/...
- …and 3 more delivered

## Sprint sprint-396 Learnings
- Sprint sprint-396 Learnings: ## Sprint sprint-396 Learnings
- born-601a — AGENT-RULE-REWRITE — 4 agent-manifest kural-onarımı (P1): GO_WITH_TECH_DEBT — 4/4 manifests rewritten per Brain's per-agent spec. architecture-planner: domains.$contains('architecture') -> intent.pr

## Gains
- 396-002 — born-601b — SKILL-RULE-REWRITE — 6 skill-manifest kural-onarımı (P1) — All 6 manifests rewritten per-brief; every dead domain word verified gone via scripts/lint-rule-v...
- 396-003 — born-603 — DEBT-INJECTION-NOOP-ECHO — dürüst no-op fix-wave debt'i yeniden doğmasın (P2) — born-603 DEBT-INJECTION-NOOP-ECHO fixed in src/orchestra/sprint-planner.ts (only file in write sc...

## Sprint sprint-395 Learnings
- Sprint sprint-395 Learnings: ## Sprint sprint-395 Learnings
- born-585 — PROJECTROOT-THREAD — buildWorkerPrompt 7 çağrı-sitesine gerçek projectRoot (P2): GO_WITH_TECH_DEBT — All 7 buildWorkerPrompt call sites now pass their in-scope projectRoot/root as the 4th arg, each matching exactly the va
- born-587 — DEAD-LISTENER-MIGRATION — 5 komut shutdown-hook registry'ye (P1): GO_WITH_TECH_DEBT — Migrated all 5 born-587 members off dead process.on(SIGINT/SIGTERM) onto registerShutdownHook, mirroring the serve.ts pr
- born-588 — START-EXIT-HONESTY — gate-blok `deckent start` non-zero exit (P2): GO_WITH_TECH_DEBT — Investigation-first (Discipline 1): reproduced the born-588 scenario with a BrainError-throwing runSprint mock exactly a

## Gains
- 395-004 — born-594 — TESTING-INTENT — test-ağırlıklı task'lar testing sınıflansın + sahiplik (P1) — Root cause (audit sprint-agent-skill-prompt-audit-2026-07-10.md §0/A1/E-P1#8): a test-dominant ta...
- 395-005 — born-595 — OVERRIDE-WARNING-SURFACE — router uyarıları plan-çıktısına (P1) — born-595 OVERRIDE-WARNING-SURFACE: routingMeta.overrideWarnings (F8/Sprint182 forceAgent/forceSki...
- 395-006 — born-599 — VOICE-BODYINIT — Buffer→Uint8Array fetch-body tip-fixi (P2) — Fixed the latent Buffer→BodyInit type mismatch at local-voice.ts:22 (STT fetch call).

## Sprint sprint-394 Learnings
- Sprint sprint-394 Learnings: ## Sprint sprint-394 Learnings
- born-597+598+600 — IPC kanal-katmanlama + adopt-URL + transport (P0, RELEASE-GATE): GO_WITH_TECH_DEBT — All three born-597+598+600 fixes implemented and test-pinned in ipc-handlers.ts (only file in write scope besides the ne
- DESK-B3-I18N-LINT — lint-i18n-hardcode'a desktop-glob (P2): GO_WITH_TECH_DEBT — Extended lint-i18n-hardcode.mjs to scan src/desktop/src/main/**/*.ts recursively, in addition to the existing flat src/c

## Gains
- 394-002 — DESK-B3-HARDENING — perm-check twin + session-notu + onConnected-tokens (P1) — All three hardening items implemented, surgical, no new window features/behavior: (a) security.ts...

## Sprint sprint-393 Learnings
- Sprint sprint-393 Learnings: ## Sprint sprint-393 Learnings

## Gains
- 393-001 — born-589 — DOMAIN-ALIAS — detectDomains↔kural-vocabulary alias-map + kural-lint (P0) — Implemented born-589 domain-vocabulary alias resolution entirely at the rule-evaluation layer, pe...
- 393-002 — born-590 — ACTIVATION-VALIDATION — zod-şema + sessiz-drop'u görünür yap (P0) — born-590 ACTIVATION-VALIDATION.
- 393-003 — born-591 — AVGCOVERAGE-REPAIR — phantom-zero-dilution + skill-tarafı hiç-yazılmıyor (P0) — born-591 AVGCOVERAGE-REPAIR.
- 393-004 — born-592 — MANIFEST-REPAIR — api-design hayaleti + i18n-quality/secure-coding canlıya insin (P0) — SCOPE BLOCKER (primary NO_GO reason): task-393-004.json's scope.filesWrite contains ONLY tests/co...
- 393-005 — born-593 — DNA-FILTER-STAT-CREDIT — düşürülen skill'e kredi yazma (P0) — born-593 DNA-FILTER-STAT-CREDIT fixed entirely inside resolveSkillPrompts (result-collector.ts, t...

## Sprint sprint-392 Learnings
- Sprint sprint-392 Learnings: ## Sprint sprint-392 Learnings
- DESK-B2-PROFILE-STORE — connection-profile-store (P0): GO_WITH_TECH_DEBT — connection-profile-store.ts: factory createConnectionProfileStore({baseDir?}) over connection-profiles.json, default ~/.
- DESK-B2-WINDOW-APP — index + window-manager + constants (P1): GO_WITH_TECH_DEBT — constants.ts: DEFAULT_PORT=3100, HEALTH_CHECK_TIMEOUT_MS/HEALTH_POLL_INITIAL_BACKOFF_MS/HEALTH_POLL_MAX_BACKOFF_MS (2000
- DESK-B2-IPC-SECURITY — ipc-handlers + security (P0, güvenlik): GO_WITH_TECH_DEBT — ipc-handlers.ts: implements every DeckentDesktopApi channel (connection.list/add/remove/connect/disconnect, daemon.statu
- DESK-B2-TRAY-MENU-I18N — tray + menu + i18n köprüsü + update-stub (P1): GO_WITH_TECH_DEBT — i18n.ts: Electron-import-free bridge over getMessage/getLanguage (../../../cli/helpers/messages.js). resolveDesktopLangu
- DESK-B2-PRELOAD — contextBridge kontrat-implementasyonu (P0): NO_GO — Write-scope path src/desktop/src/preload/index.ts was flagged 'unverified' in the task prompt (no such path existed pre-

## Gains
- 392-001 — DESK-B2-LIFECYCLE — daemon-lifecycle + meta-client (Electron-FREE çekirdek) (P0) — All 4 blueprint functions implemented in daemon-lifecycle.ts: decideConnectionAction (meta-read -...
- 392-007 — DESK-B2-RENDERER — thin pre-daemon UI (P1) — Thin, framework-free TS+DOM renderer for the 3 pre-daemon screens (ProfilePicker -> Connecting ->...
- 392-008 — DESK-B2-DASHBOARD-BRIDGE — useIsDesktop + d.ts-aynası + sync-lint (P1) — Implemented: (1) src/dashboard/src/types/desktop-global.d.ts — ambient `declare global { interfac...

## Sprint sprint-391 Learnings
- Sprint sprint-391 Learnings: ## Sprint sprint-391 Learnings

## Gains
- 391-001 — RED-1 — TASK-BUILDER-ADR-CWD-LEAK — buildWorkerPrompt projectRoot honor + hermetik test (P1, CODE-FIX) — Root cause confirmed exactly as described: buildWorkerPrompt's ADR-load block (task-builder.ts:15...
- 391-002 — RED-2 — BRAIN-PROVIDER-MOCK — path-duyarlı mock (F0.3 _orphaned drain) (P2) — Root cause confirmed by reading src/orchestra/spawn-backend-docker.ts:1922-1965 (archivePromptFil...
- 391-003 — RED-3 — PID-MANAGER-ARCHIVE-PATH — sprints/ alt-dizin assert güncelle (P2) — Root cause: archiveOrphan (src/orchestra/sprint-pid-manager.ts:277, untouched) writes archived ar...
- 391-004 — RED-4/5 — DEBT-INTEGRATION-LSFILES-MOCK — scope-gate uyumlu git-mock (P2, 2 test) — Root cause confirmed by running the suite before fixing: 2 failures ('resolves fixForTaskId debt ...
- 391-005 — RED-6/7/8 — DOCS-CLEANUP-ARCHIVE-PATH — sprints/ alt-dizin assert güncelle (P2, 3 test) — Updated 3 archiveDir path assertions in the 'archiveOrphanTasks — extended extension support' des...
- 391-006 — RED-9 — TMUX-EDGE-GUARD-AWARE — battaniye mkdirSync asserti hedefli yap (P2) — Root cause: born-499 git-guard made spawnWorker (src/orchestra/tmux.ts:298-299) unconditionally c...
- 391-007 — RED-10..13 — ROUTING-AFFINITY-SKILL-POOL — sentetik skill'leri pool'a kaydet (P1, 4 test) — Root cause confirmed: the 5 routeTaskV2 calls in the 'routing-affinity enablement (343-007, ADR-0...
- 391-008 — RED-14 — ROUTING-HEALTH-SKILL-POOL — emptySkillPool → kayıtlı skill'ler (P2) — Root cause confirmed: emptySkillPool() (line 174) returned a truly empty Map shared by all 12 tests.
- …and 1 more delivered

## Sprint sprint-390 Learnings
- Sprint sprint-390 Learnings: ## Sprint sprint-390 Learnings
- born-565 — AI-SESSION-TOOL-ALLOWLIST — kind==='ai' client-tool validation (P1, güvenlik): GO_WITH_TECH_DEBT — Root cause confirmed by reading code: terminal/types.ts AiTool = 'claude'|'gemini'|'codex' is a TS-only union that erase
- born-579 — DOCTOR-PREFLIGHT-HONESTY — pre-flight npm-install honesty (P2): GO_WITH_TECH_DEBT — Root cause: runPreFlightHealthCheck() (doctor-checks.ts:584, OUT of this task's write scope) spawns scripts/pre-flight-h

## Gains
- 390-001 — born-501 — CLI-EPIPE-GRACEFUL — process-level EPIPE handler (P2) — Added a module-scope 'error' listener on process.stdout and process.stderr in src/cli/entry.ts (n...
- 390-003 — born-576 — SDK-PACKAGE-EXPORTS — publish embeddable SDK entry in package.json (P2) — Added "./sdk" subpath to package.json exports map -> { import: "./dist/sdk/index.js", types: "./d...
- 390-005 — born-580 — PROVIDER-SPAWN-SAFE — bare spawn() → buildCliInvocation (P1, cross-platform Law#2) — Replaced all 5 bare spawn()/spawnImpl() call sites (codex.ts:191 spawn('codex',...), gemini.ts:30...
- 390-006 — born-500 — BRAIN-EXPORTS-FORMAT-AUDIT — format+consumer+size analizi (P1, doc) — Completed comprehensive audit of .brain/exports/ directory.

## Sprint sprint-389 Learnings
- Sprint sprint-389 Learnings: ## Sprint sprint-389 Learnings
- born-583 — GOV-MINORS — plugin-sig + opaque-bearer + deny-list loopback (P2): GO_WITH_TECH_DEBT — HONESTY DISCLOSURE FIRST (LP-10 disk-verify): the raw finding source (born-backlog.json) referenced by DIRECTIVES.md is 

## Gains
- 389-001 — born-529 — REPL-ERRORBOUNDARY-I18N — ReplErrorBoundary label prop (P3) — Root cause: ReplErrorBoundary (src/cli/repl/app.tsx:681-688, out of write scope) was ALREADY corr...
- 389-002 — born-530 — REPL-CLEAR-ANSI — /clear gerçek ANSI-clear + in-flight stream cancel (P2) — Root cause: clearScreen() (app.tsx) only reset the JS/Ink `turns` state — Ink's <Static> already ...
- 389-003 — born-537 — EDIT-FILE-UNIQUE — edit_file unique-match/replace-all + empty-old error (P2) — deckent_edit_file now: (1) rejects empty old_string with an explicit [mcp-error] before any match...
- 389-004 — born-541 — RENDER-REGION-SAFEPROMPT — safePrompt narrow catch (P3) — Narrowed safePrompt's blanket catch in src/cli/commands/chat-render-region.ts.
- 389-005 — born-548 — CRED-RESOLUTION — Gemini env + deepseek/qwen/glm .deck cred (P2) — Two concrete, verified cred-resolution gaps fixed, both within write scope.
- 389-006 — born-575 — ENT-RBAC-ROUNDTRIP — enterprise RBAC/rate write-then-read round-trip (P2) — Root cause: GET /api/enterprise/rbac (listRbacRoles) read only core/rbac.ts PERMISSION_MATRIX, an...

## Sprint sprint-388 Learnings
- Sprint sprint-388 Learnings: ## Sprint sprint-388 Learnings
- born-528 — REPL-DENY-TOOLSINK — confirm-red toolSink honest-outcome bypass (P2): NO_GO
- born-557 — DOCTOR-ICON-CONSOLIDATE — 3 ikon-vokabülü birleştir (P3): GO_WITH_TECH_DEBT — Investigated doctor.ts's icon vocabularies and found 4 distinct ones in practice, not 3: (A) Unicode ✓/⚠/✗ in formatProv

## Gains
- 388-001 — born-533 — REPL-MODEL-BUSY-GATE — /model /provider backend-splice race (P1) — Root cause: handleSubmit's /model·/provider branch (src/cli/repl/app.tsx) called onSwitch (which ...
- 388-003 — born-527 — INPUT-BAR-CLUSTER — Home/End no-op + paste empty-history + /tmp keylog (P2) — Investigated all three findings by reading node_modules/ink 7.0.5 source (parse-keypress.js + hoo...
- 388-004 — born-521 — DESCRIBE-TOOL-PARAMS — describe_tool boş params raporluyor (P3) — Root cause: buildToolSurfaceCatalog registered every bridged tool with a hardcoded BRIDGE_PARAMS_...
- 388-005 — born-536 — TOOL-EXEC-SYMLINK — inScope symlink-resolution eksik (P2) — Fixed inScope() symlink-escape (born-536).
- 388-006 — born-540 — RENDER-REGION-CLEAR — writeAbove full-region clear eksik (P2) — Root cause confirmed via .analysis/deckent-repl-code-review-2026-07-08.md:199 + source read: writ...
- 388-007 — born-547 — ENTRY-NDJSON-FALLBACK — non-assistant fallback branch eksik (P2) — Root cause verified against the real claude --output-format stream-json protocol (WebSearch again...
- 388-008 — born-556 — NATIVE-TRANSPORT-DOC — 32k/24k doc↔kod uyuşmazlığı (P3) — Root cause: git history shows the 24_000 ollama constant (resolveContextBudgetTokens, native-tran...
- 388-010 — born-578 — INIT-REPAIR-FAILEDSTEPS — --repair failedSteps doldurmuyor (P3) — Root cause: failedSteps array was declared but nothing ever pushed into it, so both the --repair ...
- …and 3 more delivered

## Sprint sprint-387 Learnings
- Sprint sprint-387 Learnings: ## Sprint sprint-387 Learnings
- born-493 — W2-WIRE — native-engine'i slash-dispatcher'a köprüle (24/37 komut sessiz-düşüyor) (P0): GO_WITH_TECH_DEBT — Root-cause read (not assumed): bare `deckent` with piped stdin never mounts Ink at all (entry.ts launchDefaultRepl only 
- born-563 — MEMORY-TENANT-ISOLATION — tenant izolasyonu default-ON (P1): GO_WITH_TECH_DEBT — Fix implemented exactly as specified: MemoryStore constructor now defaults strictTenantIsolation to true (fail-closed) i
- born-568 — PROCESS-GROUP-KILL — 6 adapter'da SIGTERM→SIGKILL process-group (P1): GO_WITH_TECH_DEBT — subprocess.ts already implemented POSIX process-group kill + SIGTERM->SIGKILL escalation (PGID-TEARDOWN, ADR-G-013, prio
- born-83 — TOOL-CU — computer-use wire + navigate/region-screenshot + injection-harden (P2): GO_WITH_TECH_DEBT — Implemented within scope (src/core/computer-use-exec.ts + its test file only — write authority confirmed limited to thes
- born-503 — HUB-P0 — Ed25519 signing + sandbox-on-install + BUILTIN_TRUSTED_SKILLS id fix (P2): GO_WITH_TECH_DEBT — BUILTIN_TRUSTED_SKILLS fix (skill-sandbox.ts:196-207): replaced the 4 stale ids (react-expert, node-expert, test-expert,
- born-522 — MCP-CLIENT-GATE — mcp_client_enabled ölü-gate: wire ya da kaldır (P2): GO_WITH_TECH_DEBT — Investigated the mcp_client_enabled gate. Confirmed root cause: isMcpClientEnabled/initReplMcpBridge (mcp-bridge.ts) are
- born-525 — CHAT-RENDER-MARKDOWN — inline-reset bleed + link paren truncation (P2): NO_GO
- born-544 — OPENAI-TOOLCALL-ID — tool-call ID benzersizliği (P2): NO_GO
- born-545 — ANTHROPIC-ERR-BODY — hata gövdesini yanıta dahil et (P3): NO_GO

## Gains
- 387-001 — born-492 — W1-EXPERIENCE-ON — repl_surface i18n flip'i tamamla (P0) — Fixed the repl_surface i18n flip gap.
- 387-003 — born-551 — REPL-TURN-EXCEPTION-SURFACE — turn-loop istisnaları yutulmuyor (P1) — Root-cause (read, not assumed): app.tsx's nativeEngine turn-loop effect (line ~957 pre-change) ra...
- 387-004 — born-549 — SIGTERM-TEARDOWN — sinyal-temizliği eksik (warm-child/MCP/Windows) (P1) — Root cause: onSignal() (ADR-G-013) only ever ran interruptActiveSprint()+killAllSessions() (Brain...
- 387-006 — born-564 — PANIC-GATE-FAILCLOSED — fail-closed marker yanlış yorumlanıyor (P1) — Fixed readDecisionFromMarker() in src/nervous/panic-gate.ts (lines ~105-149).
- 387-007 — born-567 — SPAWN-SAFETY-WIRE — assertSpawnSafe her spawn call-site'ına (P1) — Root cause of the 'kısmi-koruma' (partial protection) gap: assertSpawnSafe/isSpawnSafe required c...
- 387-009 — born-571 — FLOW-EVENT-DISPATCH — flow approve reader + `flow approve` komutu (P1) — Root cause: FlowRuntime.tick() hardcoded scheduler.collectDue(flows, [], [], now) — an event-kind...
- 387-011 — born-203 — ONB-2 — rich doctor: Windows-native profil + auth-state probe (P1) — Closed the two disk-verified 'KALAN' gaps in born-203.
- 387-014 — born-523 — AGENTIC-CONFIRM-HARDEN — readline reuse + SAFE-before-RISKY sıralama (P2) — Fix 1 (readline reuse): ConfirmOptions gained an optional `rl?: import('node:readline/promises')....
- …and 10 more delivered

## Sprint sprint-386 Learnings
- Sprint sprint-386 Learnings: ## Sprint sprint-386 Learnings
- born-552 — MCP-TOOL-EMPTY-DESC — boş-string açıklama REPL-launch'ı çökertiyor: NO_GO — DUPLICATE of already-completed sprint-383 task-383-001 (identical title/scope/goCriteria; see .brain/archive/sprints/spr
- born-550 — OFF-TTY-AUTOAPPROVE — piped stdin her yan-etkiyi kör-onaylıyor (SEC): NO_GO — born-550 (this exact bug) was already fixed and committed in 8bcb0e32 (sprint-383, task 383-002) — verified via `git sta
- born-520 — NATIVE-TURN-ACCOUNTING — usage üzerine-yazılıyor + onTurnEnd reuse: NO_GO — DUPLICATE-DEBT ASSIGNMENT: 386-005 targets born-520 (NATIVE-TURN-ACCOUNTING), but this exact debt item was already fully

## Gains
- 386-003 — born-542 — SELF-MODIFY-GUARD-BYPASS — path-normalizasyon eksik (ADR-039 SEC) — Investigated before coding (per plan).
- 386-004 — born-532 — ANTHROPIC-PARALLEL-TOOLRESULT — sibling tool_result'lar bölünüyor — Investigated (Discipline 1) before touching anything: the parallel-tool_result-merge fix describe...
- 386-006 — born-519 — BASH-PERM-RESOURCE — primaryResource yanlış anahtar okuyor — Investigated primaryResource() in src/agent/loop.ts:61-64 — it already reads args['cmd'] (not arg...
- 386-007 — born-510 — CONTEXT-BUDGET-ORPHAN-TOOLRESULT — compaction tool-pair'i bölüyor — born-510's primary fix (budget cut landing on the assistant-toolcall/tool-result boundary within ...
- 386-008 — born-511 — CHAT-SESSION-RECONCILE-SWAP — stream'lenen ile final sessizce farklı — This task is a duplicate of sprint-383's task-383-008 (identical title, description, and scope.fi...

## Sprint sprint-383 Learnings
- Sprint sprint-383 Learnings: ## Sprint sprint-383 Learnings

## Gains
- 383-001 — born-552 — MCP-TOOL-EMPTY-DESC — boş-string açıklama REPL-launch'ı çökertiyor — Root cause: native-tool-registry.ts MCP-bridge registration loop used `t.descriptor.description ?...
- 383-002 — born-550 — OFF-TTY-AUTOAPPROVE — piped stdin her yan-etkiyi kör-onaylıyor (SEC) — born-550 SEC fix: launchDefaultRepl's off-TTY confirm gate (src/cli/entry.ts) unconditionally aut...
- 383-003 — born-542 — SELF-MODIFY-GUARD-BYPASS — path-normalizasyon eksik (ADR-039 SEC) — Root cause: checkSelfModifying() compared the raw write-target string directly against DECKENT_SO...
- 383-004 — born-532 — ANTHROPIC-PARALLEL-TOOLRESULT — sibling tool_result'lar bölünüyor — Root cause: toAnthropicMessage() in src/agent/provider-tooluse/anthropic.ts mapped each ProviderM...
- 383-005 — born-520 — NATIVE-TURN-ACCOUNTING — usage üzerine-yazılıyor + onTurnEnd reuse — Root cause: runTurn's 'usage' case did a plain `=` assignment (inputTokens = ev.inputTokens; outp...
- 383-006 — born-519 — BASH-PERM-RESOURCE — primaryResource yanlış anahtar okuyor — Fixed primaryResource() in src/agent/loop.ts:62 — it read args['command'] but the real deckent_ba...
- 383-007 — born-510 — CONTEXT-BUDGET-ORPHAN-TOOLRESULT — compaction tool-pair'i bölüyor — Root cause: fitMessagesToBudget() force-kept only the single final message regardless of budget, ...
- 383-008 — born-511 — CHAT-SESSION-RECONCILE-SWAP — stream'lenen ile final sessizce farklı — Root cause: runTurn()'s parsed.done reconciliation block in chat-session.ts silently swapped `col...

## Sprint sprint-382 Learnings
- Sprint sprint-382 Learnings: ## Sprint sprint-382 Learnings
- born-518-REDO — CRED-SCRUB gerçek leak-site'a wire (Sprint-1 wrong-path düzelt): GO_WITH_TECH_DEBT — Moved the CRED-SCRUB logic to the real leak site as directed. src/core/provider.ts now hosts scrubCrossProviderEnv + bui
- born-566 — WRITER-LEASE FAIL-CLOSED — fs-hatasında yazma reddedilsin: GO_WITH_TECH_DEBT — Fixed fail-open bug in installWriterLeaseGate's gated handler (src/mcp/writer-lease-gate.ts): the catch block around acq
- born-561 — AUTO-APPROVE-CONSISTENCY — CLI start/run hardcoded true'ları kaldır: GO_WITH_TECH_DEBT — Fix: start.ts:455 `autoApprove: true` (hardcoded) -> `autoApprove: opts.autoApprove === true` (honors the --auto-approve

## Gains
- 382-001 — born-573-REDO — WORKER-APPROVAL-GATE gerçek-site'a wire (Sprint-1 wrong-path düzelt) — born-573 REDO fixed.
- 382-003 — born-508 — INPUTBAR↔APPROVALCARD MUTEX — tuş çift-tüketimi (yıkıcı kör-onay) — born-508 fixed: added a pure exported resolveStdinOwner(confirmOpen, approvalPending) truth-table...
- 382-004 — born-574 — NERVOUS-UNDO gerçek compensating-executor — Root cause: `deckent_nervous_undo` (registered in src/mcp/tools/nervous-edit.ts, OUT of this task...
- 382-005 — born-569 — NERVOUS-DETECTOR-REACH — 3 detektör ACTION_REGISTRY mismatch — Root cause confirmed by reading source: build-failure-recurrence emits suggestedActions.id='BUILD...
- 382-008 — born-555 — PERMISSION-STORE READ-MERGE-WRITE — settings.local.json'u ezmesin — Investigated the actual audit source (.analysis/deckent-repl-findings-board.html, finding on perm...

## Sprint sprint-381 Learnings
- Sprint sprint-381 Learnings: ## Sprint sprint-381 Learnings
- born-499-HARD — WORKER-GIT-GUARD — spawn-backend'lere git-shim enjekte et: GO_WITH_TECH_DEBT — DONE core: new src/orchestra/git-worker-guard.ts builds+installs a POSIX git shim (buildGitGuardShim/installGitGuard) de

## Sprint sprint-380 Learnings
- Sprint sprint-380 Learnings: ## Sprint sprint-380 Learnings
- born-558 — SKILL-LIST-V2-CRASH — `deckent skill list` v2-manifest'te exit 1: GO_WITH_TECH_DEBT — Root cause confirmed: loadAllSkills() (skill.ts) JSON.parse'd manifest.json verbatim with zero normalization, and the sk
- born-573 — WORKER-APPROVAL-GATE-WIRE — WorkerApprovalGate prod'da hiç `new` edilmiyor (WIRE-ON): GO_WITH_TECH_DEBT — Scope note: scope.filesWrite named src/orchestra/worker.ts, which does not exist anywhere in the repo or git history (ve
- born-518 — CROSS-PROVIDER-CRED-SCRUB — provider secret'ları paylaşılan process.env'de sızıyor (P0-SEC): GO_WITH_TECH_DEBT — SCOPE TYPO FOUND + RESOLVED: write scope listed 'src/providers/provider.ts', which did not exist. The audit's own citati
- born-514 — AGENTIC-DISPATCH-OVERMATCH — NL-intent regex'leri sıradan sohbeti tool-call'a kaçırıyor: GO_WITH_TECH_DEBT — Fixed AGENTIC-DISPATCH-OVERMATCH by narrowing all 4 classifyAgenticIntent regexes in chat-agentic-dispatch.ts so a bare,
- born-505 — DOCTOR-DUP-PREFLIGHT — iki özdeş runPreFlightHealthCheck tanımı: GO_WITH_TECH_DEBT — Consolidated the duplicate runPreFlightHealthCheck: doctor-checks.ts keeps the single canonical definition (zero changes

## Gains
- 380-002 — born-559 — LIFECYCLE-CRITICAL-2 — approval sonsuz-bekleme + ADR-gate fail-open — Fix 1 (sprint-lifecycle.ts waitForHumanApproval): replaced the unbounded `while(true)` approval p...
- 380-005 — born-509 — SPAWN-ERROR-LISTENERS — REPL spawn-site'larında error/state-reset eksik → ENOENT crash
- 380-006 — born-512 — PROVIDER-SWITCH-CRASH — geçersiz /provider adı REPL'i çökertiyor — Fixed born-512: switchTo() previously called rebuild(next) unguarded; an unrecognized provider na...
- 380-008 — born-515 — NERVOUS-SLASH-FALSE-SUCCESS — /nervous accept|reject executor'a hiç ulaşmıyor — Fixed the false-success bug in handleNervousSlash's accept/reject path (chat-nervous-bridge.ts).
- 380-009 — born-516 — TOOL-BRIDGE-TIMEOUT — düz 30s SPAWN_TIMEOUT uzun deckent_audit/plan'ı öldürüyor — Replaced the flat 30s SPAWN_TIMEOUT_MS in chat-tool-bridge.ts's defaultSpawnFn with a per-command...
- 380-010 — born-526 — PROVIDER-PARITY-ROBUST — exit-code okunmuyor + Ollama/HTTP timeout'suz + codex env-key boşluğu — Fixed all 3 REPL findings (77+109 / born-518-devir P1-12/P1-13) in chat-provider-parity.ts, DID N...
- 380-011 — born-535 — DECKENT-BASH-HARDEN — hanging-komut timeout'suz + bash hardcode (Win-native kırık) — born-535 DECKENT-BASH-HARDEN fixed inside defaultBashRun (chat-tool-exec.ts), the only real-logic...
- 380-012 — born-62 — CURSOR-MODEL-WIRE — line-edit UTF-16 surrogate böler; code-point-safe cursor-model'i wire et (WIRE-ON) — Wired cursor-model.ts's code-point-safe primitives (applyCursorEdit, moveCursor, toBuffer) into l...
- …and 1 more delivered

## Sprint sprint-379 Learnings
- Sprint sprint-379 Learnings: ## Sprint sprint-379 Learnings
- DOCS-NUM-TRUTH — README/DECKENT sayı-ve-dil doğruluğu: GO_WITH_TECH_DEBT — Ground-truth note: the rendered 'Scope Rules' section of my prompt only listed the two test-file paths, but .tasks/task-
- PACK-SIZE — npm-paketi <5MB: GO_WITH_TECH_DEBT — Measured (real, not assumed): npm pack --dry-run --json => tarball 6,033,117 bytes (npm displays '6.0 MB', matches Gate 
- DIRECTIVES-RESTORE-QUIRK — kapanışta eski-içeriğe dönme fix'i: GO_WITH_TECH_DEBT — Root cause CONFIRMED with disk evidence + a real (non-mocked) hermetic repro test (tests/orchestra/directives-restore-qu

## Sprint sprint-378 Learnings
- Sprint sprint-378 Learnings: ## Sprint sprint-378 Learnings
- RUN-CLI-ALIAS — `deckent run` çatı-komutu + sprint-alias: GO_WITH_TECH_DEBT — Converted `run <description>` to `.command('run').argument('<description>')` and added 4 nested subcommands (start/statu
- RUN-MODE-BRIDGE — `deckent mode run` + config-alias: GO_WITH_TECH_DEBT — Implemented RUN-MODE-BRIDGE without touching the deckent_style enum. src/cli/commands/mode.ts: added `mode run` subcomma

## Gains
- 378-002 — RUN-SURFACE-TEXT — görünür-metinlerde run-dili — Curated (not mechanical) bridge-language pass, scoped to status/plan/retro human output per goCri...

## Sprint sprint-377 Learnings
- Sprint sprint-377 Learnings: ## Sprint sprint-377 Learnings
- MISSION-VERDICT-FIX — dürüst-DEBT fail sayılmaz: GO_WITH_TECH_DEBT — Investigation first (per task instructions): src/cli/commands/autonomous.ts:535 (the runV2Engine runTask adapter) alread
- DASH-LAZY-LOAD — route-bazlı code-splitting: GO_WITH_TECH_DEBT — React.lazy()+Suspense route-based code splitting shipped in App.tsx. Eager (critical first paint, per task): "/" (Dashbo

## Gains
- 377-003 — DASH-POLLING-DEDUP — istek-tekilleştirme katmanı — Added src/dashboard/src/lib/request-cache.ts: a module-level in-flight request dedup cache (dedup...

## Sprint sprint-376 Learnings
- Sprint sprint-376 Learnings: ## Sprint sprint-376 Learnings
- TOOL-QB-FLIP — tool_surface + approval.question_bridge default-ON: GO_WITH_TECH_DEBT — DONE (tool_surface half): flipped tool_surface to default-ON (opt-out) in BOTH resolvers (config.ts loadConfig ~1719-172
- MODE-HELP-FIX — `deckent mode` yardımı gerçeğe eşitlenir (RUN-RENAME ön-adımı): GO_WITH_TECH_DEBT — MODE-HELP-FIX: fixed the stale `mode global <style>` description (was 'sprint|task', now 'sprint|task|process' via new i

## Gains
- 376-003 — M5-NATIVE-FLIP — native-agent default-ON (kanıt-paketi yeşil; rollback-flag'li) — M5-NATIVE-FLIP implemented: the Ink REPL's native-agent tool-use loop is now the default engine.

## Sprint sprint-375 Learnings
- Sprint sprint-375 Learnings: ## Sprint sprint-375 Learnings
- DOCS-P0-DELTA — analiz-delta-kutuları + features-index: GO_WITH_TECH_DEBT — Scope conflict discovered before writing, resolved by following the canonical write-authority list (task description exp
- ORPHAN-WIRE-DALGA-1 — en-değerli 5 bağlanmamış-teslimin wire'ı: GO_WITH_TECH_DEBT — SCOPE CONFLICT (flagging for Brain, not worked around): task-375-007.json scope.filesWrite contains ONLY docs/analysis/o

## Gains
- 375-001 — XPLAT-TEST-DOC — Win-native + macOS kapsamlı test-dokümanı (PROJE KÖKÜNE) — Created CROSS-PLATFORM-TESTING.md at project root with all 5 required sections: (1) Setup — Windo...
- 375-002 — ADR-DB-SYNC — 5 accepted-ADR'nin memory.db kaydı — Read the existing adr-type row schema from .brain/memory.db first (adr-d-008) to confirm field sh...
- 375-003 — D013C-WIRING — sınıf-bazlı NL-dispatch canlıya — ADR-D-013 Option C wired.
- 375-004 — TERM5-I18N-DILIM-1 — CommandRisk display-çeviri katmanı — Implemented ADR-D-012 slice-1 display-translation layer in new src/cli/helpers/risk-language.ts: ...
- 375-005 — D004-AMEND + DOCS-P0-ADR — ADR-amend paketi — 3 dated amendment sections eklendi (2026-07-06), her biri mevcut metni silmeden, sadece Reference...
- 375-008 — M5-PROOF-HARNESS — native-flip stabilizasyon-kanıt koşumu — Built createNativeModeHarness() in tests/cli/native-stabilization-proof.test.ts — a module-level ...

## Sprint sprint-374 Learnings
- Sprint sprint-374 Learnings: ## Sprint sprint-374 Learnings
- CU-STATUS-CLI — `deckent cu-status` (computer-use ilk kullanıcı-yüzeyi): GO_WITH_TECH_DEBT — Implemented `deckent cu-status [--json]` — TOOL-CU's first Tier-1 CLI surface. Flag-off path is honest-disabled with a g

## Gains
- 374-001 — CLOSING-DATA-EXTEND — kapanış-verisini 357-373'e genişlet — Wrote docs/analysis/closing-data-357-373.md (only file in scope.filesWrite) as the successor to c...
- 374-003 — DASH-MOUNT-CARDS — orphan kartları dashboard'a bağla — Mounted the two orphan cards (LimitsCard 366-005, EvaluateHealthCard 370-007) into the dashboard ...
- 374-004 — ORPHAN-DELIVERABLE-SWEEP — bağlanmamış-teslim sistematik keşfi — Systematic orphan-deliverable sweep of src/**/*.{ts,tsx} (src/dashboard excluded — separate bundl...

## Sprint sprint-373 Learnings
- Sprint sprint-373 Learnings: ## Sprint sprint-373 Learnings

## Gains
- 373-001 — ADR-ONB-GLOBAL — global-kurulum + proje-scope katman ADR-taslağı — Ground-truth check first (per CLAUDE.md disk-verify rule): docs/adr/adr-d-011-global-install-proj...
- 373-002 — ADR-TERM-5 — sade risk-dili ADR-taslağı (Oku/Değiştir/Çalıştır/Otonom) — Discovery: docs/adr/adr-d-012-terminal-risk-language.md (the exact target write-scope file) alrea...
- 373-003 — ADR-NL-DISPATCH — agenticDispatch default kararı ADR-taslağı — docs/adr/adr-d-013-nl-dispatch-default.md already contained a complete draft on disk when this ta...
- 373-004 — SERVE-E2E-SMOKE — auth'lu gerçek-200 smoke harness'ı — Write-scope file tests/e2e/serve-endpoints-smoke.test.ts already existed on disk (untracked, unco...
- 373-005 — DEBT-371-CLOSE — 002 artığı + süpürme-doğrulaması — Read .brain/archive/sprint-371-tasks/task-371-001.result + task-371-002.result and git show 669b2...
- 373-006 — CURSOR-HARNESS — F11-016 kalan-envanterinden cursor-drift test-harness'i — Found src/cli/repl/cursor-model.ts + tests/cli/repl-cursor-model.test.ts already present on disk,...

## Sprint sprint-372 Learnings
- Sprint sprint-372 Learnings: ## Sprint sprint-372 Learnings
- ADR-ONB-GLOBAL — global-kurulum + proje-scope katman ADR-taslağı: NO_GO — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified. Brain should reconcile via Spurious NO_GO helpe
- ADR-NL-DISPATCH — agenticDispatch default kararı ADR-taslağı: NO_GO — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified. Brain should reconcile via Spurious NO_GO helpe
- SERVE-E2E-SMOKE — auth'lu gerçek-200 smoke harness'ı: NO_GO — Worker timeout/killed (exitCode=1) but git diff shows 37 files modified. Brain should reconcile via Spurious NO_GO helpe
- CURSOR-HARNESS — F11-016 kalan-envanterinden cursor-drift test-harness'i: NO_GO — Worker timeout/killed (exitCode=1) but git diff shows 39 files modified. Brain should reconcile via Spurious NO_GO helpe

## Gains
- 372-002 — ADR-TERM-5 — sade risk-dili ADR-taslağı (Oku/Değiştir/Çalıştır/Otonom) — Wrote docs/adr/adr-d-012-terminal-risk-language.md (only file in scope.filesWrite), porting docs/...
- 372-005 — DEBT-371-CLOSE — 002 artığı + süpürme-doğrulaması — 371-001 (CATALOG-MATERIALIZE) debt-gerekcesi (2 kalem: catalog-sync-parity.test.ts 6 stale assert...

## Sprint sprint-371 Learnings
- Sprint sprint-371 Learnings: ## Sprint sprint-371 Learnings
- CATALOG-MATERIALIZE — builtin 3+3'ü pool-görünür yap (370-003 kapanışı): GO_WITH_TECH_DEBT — Decision (Option A over Option B, per task instruction to justify): pool-loading now reads the builtin tree directly (D-
- SERVER-WIRE-ENDPOINTS — limits + evaluate-health kayıtları: GO_WITH_TECH_DEBT — Wired the two dead endpoints exactly mirroring the registerApprovalHistoryRoute pattern (server.ts:65/:1068 precedent): 

## Gains
- 371-003 — TOOL-CU-DILIM-3 — exec-adapter (injectable-spawn, flag-zincirli) — Implemented executeComputerUseAction(action, {config, platform, spawn}) in src/core/computer-use-...
- 371-004 — CHAT-EXEC-ENGINE — dispatch-descriptor executor motoru — Implemented executeIntentDescriptor(descriptor, { runner, confirm }) as a pure, string-free engin...
- 371-005 — F11-016-ADR — REPL-stabilizasyon ADR-taslağı + kalan-envanter — Wrote docs/adr/adr-d-010-repl-input-stabilization.md (Class ADR-D, Status: proposed) as Row-62's ...
- 371-006 — DEBT-370-CLOSE — 370-006 kalanını kapat — 370-006's GO_WITH_TECH_DEBT rationale (read from .brain/archive/sprint-370-tasks/task-370-006.res...
- 371-007 — CLOSING-DATA-PACK — 357-370 kapanış-veri-paketi (7-Tem hazırlığı) — CLOSING-DATA-PACK written to docs/analysis/closing-data-357-370.md, the only file in write scope.

## Sprint sprint-370 Learnings
- Sprint sprint-370 Learnings: ## Sprint sprint-370 Learnings
- DOCS-FEATURES-5 — computer-use + connect-auth + panel feature-doc'ları: GO_WITH_TECH_DEBT — 3 feature-doc written to disk, all iskele-standart (Ne yapar/Parametreler/Açınca ne değişir/Kapalıyken garanti/Riskler/K

## Gains
- 370-001 — EVAL-PREMATURE-RETRY — gate-dönüşü sessiz-boş bırakmasın — Added exported retryEvaluateIfEmpty() in sprint-controller.ts, called immediately after the prima...
- 370-002 — DEBT-369-CLOSE — 002/006 kalanlarını kapat — Read task-369-002/005/006 .result+.json from .brain/archive/sprint-369-tasks/, plus the live debt...
- 370-003 — CATALOG-SYNC-PARITY — yeni 3+3 katalog-öğesinin sync-görünürlüğü — Root cause found (proof-only, no pool/init-steps/.deckent edits made): the 6 new catalog items (s...
- 370-004 — TOOL-CU-DILIM-2 — platform-capability negotiation (impl'siz, dürüst-tespit) — Built negotiateComputerUseCapabilities(platform, config, prober) in src/core/computer-use-platfor...
- 370-005 — CHAT-INTENT-DISPATCH — intent-köprülerinin gerçek-dispatch seam'i — Added the intent-to-dispatch-descriptor seam for the 4 ONB-CHAT-DILIM-2 (368-004) meta-intents (c...
- 370-007 — EVAL-OBS-DASH — evaluate-sağlık işaretlerinin dashboard'a taşınması — GET /api/evaluate-health implemented in a new src/api/evaluate-health-endpoint.ts, read-only, ser...

## Sprint sprint-369 Learnings
- Sprint sprint-369 Learnings: ## Sprint sprint-369 Learnings
- DOCTOR-FOLLOWUPS — checkTmux win32 etiketi + 368-002 debt-süpürme: GO_WITH_TECH_DEBT — (1) checkTmux win32 honest-label fix: the win32 short-circuit branch used to compute `reason = spawnBackend === 'docker'
- TOOL-CU-DILIM-1 — computer-use pack sözleşme-katmanı (flag-gated): GO_WITH_TECH_DEBT — Delivered the dilim-1 sözleşme-katmanı: src/core/computer-use-contract.ts with zod discriminated-union schemas for the 4
- PSL-6-DILIM — connect-wizard'a auth-state entegrasyonu: GO_WITH_TECH_DEBT — Wired 368-002's buildAuthStateReport (doctor.ts, env+.deck only, no network) into `deckent connect`'s own report. connec

## Gains
- 369-001 — RUBRIC-ARMOR-COMPLETE — kalan 4 rubric-sitesine born-484 zırhı — Extracted the born-484 fault-armor pattern (previously inline only at the main-EVALUATE site ~142...
- 369-003 — AGSK-1-DILIM-3 — 3 yeni builtin-AGENT — Created 3 new builtin-agent PROMPT.md files (api-designer, observability-engineer, i18n-specialis...
- 369-004 — CHAT-IDE-DILIM-3 — panel canlı-yenileme + task-detay (read-only) — New panel-refresh.ts on top of 368-007's panel-data.ts, additive only — no edits to panel-data.ts...
- 369-007 — ADR-RESULT-NORMALIZE — sınır-normalizasyon politikası ADR-D taslağı — Wrote docs/adr/adr-d-009-worker-result-boundary-normalization.md as a proposed ADR-D (status: pro...
- 369-008 — V1-STRICT-REPORT — TaskResultV1 doğrulamasının report-only ön-kablosu — V1-STRICT-REPORT flag-gated report-only wire delivered.

## Sprint sprint-368 Learnings
- Sprint sprint-368 Learnings: ## Sprint sprint-368 Learnings
- ONB-2-DILIM-3 — doctor windows-native profil + auth-state probe: GO_WITH_TECH_DEBT — Both parts delivered. (1) Platform profile: buildPlatformProfileReport(lang) + formatPlatformProfileLines(report, lang) 

## Gains
- 368-001 — AGSK-1-DILIM-2-CARRY — 3 yeni builtin-skill (DOĞRU ağaç-yolu) — 367-008 carryover fixed: correct tree confirmed via `ls src/core/builtins/skills/` (28 existing i...
- 368-003 — F11-016-STAB — REPL cursor/queue stabilizasyon dilimi — Grepped src/cli/repl/ first: no existing input-queue module — the current REPL queue is a raw use...
- 368-004 — ONB-CHAT-DILIM-2 — sohbet-setup intent genişlemesi — Extended 361-016's interpretChatAnswer rule-based core with 4 TR+EN meta-intents (connect_provide...
- 368-005 — DEFER-002 — nervous askBrain escalation kapanışı — Closes the remaining askBrain-escalation half of DEFER-002 (MASTER-PLAN Sıra-75) after 361-014 sh...
- 368-006 — SERIES-357-367 — seri-raporu güncelle + 484-saga bölümü — Ran node scripts/series-metrics.mjs 357 367 unmodified (output redirected to /tmp, not written in...
- 368-007 — CHAT-IDE-DILIM-2 — VS Code panel veri-bağlama — Added panel-data.ts as a new, additive adapter alongside dilim-1's rpc-bridge.ts/deckent-panel.ts...
- 368-008 — DOCS-FEATURES-4 — doctor-fix + onboard-apply + approval-history feature-doc'ları — 3 feature-doc yazıldı (docs/features/doctor-fix.md, onboarding-apply.md, approval-history.md), he...

## Sprint sprint-367 Learnings
- Sprint sprint-367 Learnings: ## Sprint sprint-367 Learnings
- 366-003-DEBT-CLOSE — openrouter-probe debt-notunu oku-kapat: GO_WITH_TECH_DEBT — Read task-366-003.result (the sole sprint-366 GO_WITH_TECH_DEBT note, confirmed by grepping selfAssessment across all 8 
- ONB-APPLY-WIRE — onboarding-apply'ı onboard-komutuna bağla: GO_WITH_TECH_DEBT — Wired 366-006's onboarding-apply.ts (applyOnboardingPlan/dryRunOnboardingApply) into `deckent onboard` as an ADDITIVE pa
- ONB-2-DOCTOR-FIX — zengin doctor dilimi (--fix): GO_WITH_TECH_DEBT — Enriched `deckent doctor --fix` (Sprint 356 Task 356-006 baseline: mkdir/chmod/config-migrate) with 2 new closed-whiteli
- AGSK-1-DILIM-2 — agent/skill katalog genişlemesi: NO_GO — SCOPE-DEFECT self-flag (found before coding, documented in full in .tasks/task-367-008.plan): declared scope.filesWrite 

## Gains
- 367-001 — BORN-485 — spawn-timeout/tmux kırmızı-test onarımı (9 test) — Kontrat-kararı: kod kontrata UYUYOR, testler bayattı.
- 367-002 — BORN-486 — cleanup stale-hb süpürme — BORN-486 fix, two surgical additions in sprint-lifecycle.ts (no other files touched): (1) cleanup...
- 367-003 — RESULT-SHAPE-SOURCE-GUARD — worker-prompt'a result-şema sözleşmesi (born-484 kaynak-önleme) — born-484 source-side guard.
- 367-007 — APR-HISTORY-DILIM — dashboard approval-history görünümü — DUPLICATE-WORK FOUND (disk-verified, not Brain-synthetic) — this task's exact deliverable already...

## Sprint sprint-366 Learnings
- Sprint sprint-366 Learnings: ## Sprint sprint-366 Learnings

## Sprint sprint-365 Learnings
- Sprint sprint-365 Learnings: ## Sprint sprint-365 Learnings

## Gains
- 365-001 — Fix debt: Tech debt from 362-001-fix: VERIFY-AND-COMPLETE of the OOM-killed prior 362-001- — DEBT debt-362-001-fix (CRITICAL, active 3 sprints) — RESOLVED.

## Sprint sprint-364 Learnings
- Sprint sprint-364 Learnings: ## Sprint sprint-364 Learnings
- Fix debt: Tech debt from 361-001-fix: Worker timeout/killed (exitCode=1) but git diff show: GO_WITH_TECH_DEBT — ROOT CAUSE of debt-361-001-fix: a TIMEOUT_WITH_WORK result (worker 361-001-fix killed exitCode=1, but git diff showed 67
- TMUX-PROVIDER-CLI — aynı fix tmux-backend'e (Yasa #2 paritesi): GO_WITH_TECH_DEBT — TMUX-PROVIDER-CLI (364-002/born-481 Yasa#2 parity). Root cause confirmed: TmuxBackend.spawn() (spawn-backend.ts) calls t
- CODEX-V5 — kesin-sınav (481-fix'li dist gerekmez: subprocess kendi sprint'inde fix'lenmiş: NO_GO — Subprocess worker exited with code 1. No explicit result file written by worker.
- RETRO-SERIES-METRICS — 357-363 seri-metrik agregatörü (7-Tem raporu altyapısı): GO_WITH_TECH_DEBT — Built `node scripts/series-metrics.mjs <startSprint> <endSprint>` (no new deps — plain ESM + node:fs/path, follows the p

## Gains
- 364-002 — SUBPROC-PROVIDER-CLI — worker-komutu CLI-binary'yi provider'dan seçsin (born-481) — born-481 root cause (disk-verified): SubprocessBackend (src/orchestra/spawn-backend.ts) always co...
- 364-004 — DOCKER-PROVIDER-CLI — docker-backend paritesi + imaj-gerçeği — DISK-VERIFY: docker backend ALREADY builds workerCmd from the shared provider→cmd table (getProvi...
- 364-006 — 363-DEBT-CLOSE — 3 debt-notunu oku-kapat — Resolved '005-brain-debt, 009, 011' to debt-363-005/009/011 in .brain/memory.db (matched via orig...
- 364-007 — GEMINI-PARITY-GATED — F11-014 gemini-dalı key-gated testler — Plan written to .tasks/task-364-007.plan before coding.
- 364-008 — ONB-DOC — onboarding kullanıcı-dokümanı (deckent onboard + wizard + global) — Both target docs written and disk-verified against the actual 361-363 ONB source (onboard.ts, onb...
- 364-009 — AGSK-4 — provider-cli-matrix skill'i — AGSK-4: new two-tree built-in skill 'provider-cli-matrix' (.deckent/skills/ + src/core/builtins/s...
- 364-010 — FEATURES-DOC-2 — limit/rpc/openrouter feature-doc'ları — 3 feature docs written to docs/features/ following the repl-surface.md skeleton (Ne yapar -> Para...

## Sprint sprint-363 Learnings
- Sprint sprint-363 Learnings: ## Sprint sprint-363 Learnings
- CODEX-V4 — model-pin gerçek sınavı (479-fix'li plan): NO_GO — Subprocess worker exited with code 1. No explicit result file written by worker.
- ONB-ENTRY-WIRE — wizard'ı `deckent onboard` komutuna bağla: GO_WITH_TECH_DEBT — Wired the 361-009 onboarding machine (helpers/onboarding-wizard.ts, runOnboardingWizard) and the 362-011 Ink UI (repl/on
- AUTONOMOUS-APPROVAL-MCP — DEFER-001 kalan yüzey: GO_WITH_TECH_DEBT — Implemented deckent_autonomous_approve + deckent_autonomous_reject in src/mcp/tools/autonomous-approval.ts, mirroring th
- WATCH-SESSION-WARN — 4+ paralel-oturum uyarısı (session-registry wire): GO_WITH_TECH_DEBT — Wired 361-015 session-registry into health-snapshot.ts per goCriteria: buildHealthSnapshot() gained an optional `session

## Gains
- 363-001 — Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L — Worker timeout/killed (exitCode=1) but git diff shows 43 files modified.
- 363-003 — RPC-WRITE-METHODS — run.start-detached + approval.decide (dilim-2c) — run.start-detached + approval.decide implemented as a standalone, injectable handler-map builder ...
- 363-004 — ONB-GLOBAL-PRECEDENCE — global-katmanı config-zincirine bağla (dilim-3) — ONB-GLOBAL-PRECEDENCE (dilim-3, M1 dual-read/legacy-write per docs/design/onb-global-install.md §...
- 363-006 — SDK-2 — sprint-yüzeyi: startDetached + results + retro (F2-008 dilim-2) — Added 3 methods to DeckentClient (360-012's client): startSprintDetached(options?) reuses spawnDe...
- 363-007 — 362-DEBT-CLOSE — 362'nin 4 debt-notunu oku-kapat — Read all 4 debt-notes named by the task from .brain/archive/sprint-362-tasks/ result+json files: ...
- 363-008 — TERM5-EVIDENCE — sade risk-dili karar-paketi (Sıra-45 🔬→karar) — TERM5-EVIDENCE karar-paketi yazıldı: docs/design/term5-risk-language.md.
- 363-010 — AGSK-3 — rpc-protocol + onboarding-ux skill'leri (dilim-3) — 2x2-tree (2 skills x .deckent/skills + src/core/builtins/skills) created, byte-identical across t...
- 363-012 — VSCODE-EXT-1 — CHAT-IDE gerçek-impl dilim-1 (Sıra-64) — DISK-VERIFY finding (see .tasks/task-363-012.plan for full detail): the task's scope assumed the ...
- …and 1 more delivered

## Sprint sprint-362 Learnings
- Sprint sprint-362 Learnings: ## Sprint sprint-362 Learnings
- Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L: GO_WITH_TECH_DEBT — RESOLUTION BASIS (honest): born-455 DOC-ADR-LINK-CROSSWALK-SWEEP — the actual deliverable behind debt-357-015-fix — is V
- LIMITS-WARN-FIELDS — pencere-başına warn eşiği (361-002 debt): GO_WITH_TECH_DEBT — Scope reality check first: the 361-002 debt note ('warn = min(70,block), limit_gate config'e opsiyonel session_warn_pct/
- RPC-API-WIRE — TERM-RPC'yi HTTP yüzeyine bağla (dilim-2a): GO_WITH_TECH_DEBT — POST /api/rpc wired as the first HTTP consumer of TERM-RPC's dispatcher (core/term-rpc.ts, 361-011, read-only). Sits beh

## Gains
- 362-002 — MODEL-DROP-FIX — forceModel zinciri kök+fix (born-479, P0) — born-479 root cause confirmed by disk-read (git log -p -- DIRECTIVES.md): sprint-361 Task 5 CODEX...
- 362-003 — HERMETIC-RUNSTATE — start-testleri gerçek-repo'dan kopar (born-480) — Root cause confirmed by reading src/mcp/tools/start.ts: the handler does `const root = process.cw...
- 362-005 — APRHIST-DEBT-CLOSE — 360-013 debt-notunu kapat — Read .brain/archive/sprint-360-tasks/task-360-013.result AND its ancestor .brain/archive/sprint-3...
- 362-006 — DOMAIN-ROUTE-WIRE — routeTaskV2'ye domainFromScope + openrouter-doc-route bağla — Investigation first: (a) 359-005's domainFromScope was ALREADY fully wired into routeTaskV2 befor...
- 362-007 — CLIENTS-RELAY-WIRE — Slack/Teams adaptörlerini relay-config'e bağla — Implemented attachConfiguredApprovalChannels(relay, config, transports) in src/connectors/approva...
- 362-009 — RPC-REPL-WIRE — REPL'e rpc-client + /rpc debug-komutu (dilim-2b-read) — Second TERM-RPC consumer: rpc-client.ts's createLocalRpcTransport calls dispatchRpcRequest() dire...
- 362-010 — ONB-GLOBAL-STORE — global-katman deposu dilim-2 — Built GlobalStore<T> — a generic, versioned JSON store layer over resolveGlobalScopePaths (361-00...
- 362-011 — WIZARD-INK — onboarding-wizard Ink yüzeyi (dilim-2) — WIZARD-INK dilim-2 complete.
- …and 2 more delivered

## Sprint sprint-361 Learnings
- Sprint sprint-361 Learnings: ## Sprint sprint-361 Learnings
- Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L: GO_WITH_TECH_DEBT — VERIFY-AND-DOCUMENT RESOLUTION (zero src/ diff is correct — see below; this is NOT a crashed-worker stub like original 3
- LIMIT-GATE-WIRE — `deckent limits` + start-gate (CARRYOVER 360-003, aynı-spec): GO_WITH_TECH_DEBT — Part (a) `deckent limits [--json]` is fully implemented and DONE: runs the real Sprint-360 probeSubscriptionLimits() (co
- DEFER-002-NERVOUS — nervous MCP undo/edit + askBrain-escalation dilimi (Sıra-75): GO_WITH_TECH_DEBT — DONE for the write-scope deliverable: 2 new MCP tools (deckent_nervous_edit, deckent_nervous_undo) in src/mcp/tools/nerv

## Gains
- 361-003 — OPENROUTER-DOC-ROUTE — doc-kind→free-model önerisi (CARRYOVER 360-008, aynı-spec) — CARRYOVER of 360-008 (that task never executed — archived as PENDING, no .result found).
- 361-004 — POSTFIX-PENDING-SCAN — FIX-sonrası hiç-başlamamış eligible'ları koştur (born-475) — born-475: added a single-pass POSTFIX-PENDING-SCAN block at the very end of runFixPhase (src/orch...
- 361-005 — FIX-MODEL-PRESERVE — fix-task orijinalin model/provider/backend mirası (born-476) — DISK-VERIFIED all isPriorityFix producers (debt-manager.ts handleEvaluation ~L399, handleCrossDep...
- 361-006 — CODEX-RETRY-RCA — codex-timeout kök-analizi + yeniden-deneme (GERÇEK codex-worker) — CODEX-RETRY-RCA delivered at docs/analysis/codex-dogfood-rca-361.md.
- 361-007 — OPENROUTER-BOOTSTRAP — adapter'ı provider-bootstrap'a flag'li kaydet — Wired OpenRouterProvider (providers/openrouter.ts, 360-006) into bootstrapProviders following the...
- 361-008 — ONB-GLOBAL-DESIGN — global-install + proje-scope mimari tasarımı (Sıra-200 dilim-1) — ONB-GLOBAL-DESIGN (Sıra-200 dilim-1) complete.
- 361-009 — ONB-WIZARD-CORE — install→init sihirbaz çekirdeği (Sıra-201 dilim-1) — 5-step onboarding-wizard core (install->init, Sira-201 dilim-1): provider-detect -> auth-status -...
- 361-010 — APR-CLIENTS-CORE — Slack/Teams onay-kanal adaptörleri (Sıra-70 dilim-1) — APR-CLIENTS-CORE: ApprovalSlackChannel + ApprovalTeamsChannel, both RelayChannel adapters (src/co...
- …and 5 more delivered

## Sprint sprint-360 Learnings
- Sprint sprint-360 Learnings: ## Sprint sprint-360 Learnings
- APR-HISTORY-WIRE — endpoint'i canlı server'a bağla (71 kapanışı): GO_WITH_TECH_DEBT — Wired registerApprovalHistoryRoute (built in 359-013) into server.ts's live GET dispatch, following the wiring note left

## Gains
- 360-001 — Fix debt: Tech debt from 357-015-fix: Verified the crosswalk sweep for born-455 (DOC-ADR-L — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified.
- 360-002 — LIMIT-PREFLIGHT — abonelik-pencere probu (claude -p "/usage" parse) — probeSubscriptionLimits(opts) spawns `claude -p "/usage"` via an injectable async SpawnImpl (work...
- 360-004 — GPT55-CATALOG — gpt-5.5 model-kaydı (feed-fiyatlı, zero-hardcode) — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified.
- 360-005 — CODEX-SPAWN-READINESS — codex worker-yolunun canlı-hazırlık denetimi — Advisory-only codex spawn-readiness module, does not touch spawn/provider code, never performs a ...
- 360-006 — OPENROUTER-ADAPTER — OpenRouter worker/chat adaptör çekirdeği — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified.
- 360-007 — OPENROUTER-FREE-PROBE — ücretsiz-model envanteri + settings + doc — fetchOpenRouterModels(fetchImpl) + writeFreeModelCache(root, list) implemented in src/core/openro...
- 360-009 — F11-016-STAB — Ink REPL stabilizasyon dilimi (app.tsx) — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified.
- 360-010 — TERM-NAT-M5 — parite-kapısındaki bilinen-sapmaları kapat — Worker timeout/killed (exitCode=1) but git diff shows 40 files modified.
- …and 6 more delivered

## Sprint sprint-359 Learnings
- Sprint sprint-359 Learnings: ## Sprint sprint-359 Learnings
- DEP-NORMALIZE — dependency-ref'leri plan-yazımında slot-ID'ye çevir (born-465): GO_WITH_TECH_DEBT — Added normalizeStructuredTaskDependencies(tasks, options) to task-builder.ts: given the FULL completed structured-plan t
- TMUX-TIMEOUT-PARITY — tmux wrapper'ına 466-ailesi paritesi: GO_WITH_TECH_DEBT — born-466 parity implemented in buildWorkerCommand() (src/orchestra/tmux.ts:150): timeout now uses `timeout -k 30 $TSEC .
- TERM-SIMPLE — Simple-Mode edition (Sıra-53): GO_WITH_TECH_DEBT — Implemented Simple-Mode as a SECOND, orthogonal visibility filter in chat-mode.ts (not a 3rd ChatMode union state, per t
- PARITY-CLI-MCP — agent/skill/memory_manage + cost tool paritesi (Sıra-86 dilim): GO_WITH_TECH_DEBT — 3 tools implemented in a single module (src/mcp/tools/catalog-parity.ts) as specified: deckent_agent_manage (add/remove/
- AGSK-EXPAND — katalog genişleme dilim-1: 3 yeni horizontal skill (Sıra-85): GO_WITH_TECH_DEBT — SCOPE-DEFECT self-flag (found before coding, documented in .plan): declared scope.directories name `src/cli/builtins/ski
- APR-HISTORY — dashboard onay-geçmişi paneli (Sıra-71): GO_WITH_TECH_DEBT — APR-HISTORY: standalone GET /api/approvals/history endpoint module (src/api/approval-history-endpoint.ts) over ApprovalS

## Gains
- 359-002 — WRAPPER-HB-GATE + ALLOWLIST-SSOT (born-468 + born-471) — born-468 WRAPPER-HB-GATE: extracted buildHeartbeatGateFn()/buildHeartbeatWrapperLoop() — the wrap...
- 359-004 — ADR-POINTER-PATH — tiered-injection pointer'ı erişilebilir dosyaya (born-469) — born-469 fix: added exported resolveAdrDocPointer(adrId, adrDocsDir) which readdirSync()s the giv...
- 359-005 — ROUTE-DOMAIN-SCOPE — domain-sinyalini scope-path'ten türet (born-470, flag'li) — born-470 fix: introduced RoutingOptions.domainFromScope (default-off) in src/core/routing-engine.ts.
- 359-006 — TOOL-REG-2 — dynamic-schema-override + generation-memo dilimi (Sıra-24 devam) — TOOL-REG-2 (Sıra-24 devam) — iki bağımsız-ama-kompoze parça, tool-availability.ts'nin 'two indepe...
- 359-007 — TERM-COMPAT — REPL compat test-matrisi + PTY smoke (Sıra-52) — Key finding: ink-testing-library is NOT a project dependency (package.json has only `ink`; confir...
- 359-009 — NL-DISPATCH-EVIDENCE — agenticDispatch default kararı için kanıt-paketi (Sıra-57) — Sira-57 karar-kapisi kanit paketi -- KARAR VERILMEDI, yalniz kanit uretildi (nogo: default degist...
- 359-010 — F7-HARDEN — terminal hardening dilimi: session-history + copy-paste (Sıra-65) — Sıra-65 F7-HARDEN input-history çekirdeği: .deckent/settings/repl-history (satır-tabanlı, append-...
- 359-014 — RUNTIME-GITIGNORE — çalışma-zamanı artefakt hijyeni — Investigated .gitignore before touching anything: it already contains all three entries this task...
- …and 2 more delivered

## Sprint sprint-358 Learnings
- Sprint sprint-358 Learnings: ## Sprint sprint-358 Learnings
- REPL-DETACHED-START — REPL'den kilitlemeyen sprint-start: GO_WITH_TECH_DEBT — New src/cli/helpers/detached-start.ts exports spawnDetachedDeckent(argv, opts): spawns dist/cli/entry.js as a fully deta
- REPL-DISPATCH-PARITY — /nervous köprü-tüketimi + /autonomous /mcp parite: GO_WITH_TECH_DEBT — REPL-DISPATCH-PARITY (MASTER-PLAN Sıra-66/REPL-001 + Sıra-72 kalanı). chat-slash-registry.ts genuinely CONSUMES the 357-
- HELP-SURFACE-WIRE — /help'e katalog + mode-filtre (Sıra-26+56 kapanışı): GO_WITH_TECH_DEBT — Wired both required consumers into chat-native.ts's /help handler (line ~823): (1) getVisibleCommands(mode) (chat-mode.t
- TRN-PIPE-WIRE — pipeline outcome-etiketi taksonomiden (Sıra-79 kapanışı): GO_WITH_TECH_DEBT — buildLabels() in src/training/pipeline.ts now routes meta.selfAssessment through mapTaskEvaluationToLabel (src/core/trac

## Gains
- 358-001 — APR-XPROC-CORE — approval-store dizin-izleyici çekirdeği (born-462 dilim-1) — createApprovalStoreWatch(storeDir, handlers, opts) implemented in src/core/approval-store-watch.ts.
- 358-002 — APR-XPROC-WIRE — REPL'e cross-process onay beslemesi (born-462 dilim-2) — APR-XPROC-WIRE: wired Task 1's createApprovalStoreWatch into runInkRepl's repl_surface.approvals=...
- 358-006 — APP-SURFACE-WIRE — /resume picker + açılış-teaser + busy-kontrolleri (app.tsx) — APP-SURFACE-WIRE landed in app.tsx, all additive + gated behind the EXISTING replSurfaceEnabled c...
- 358-007 — CKPT-QUESTION-BRIDGE-WIRE — worker-soruları gerçek onaya (Sıra-73 kapanışı) — Wired handleWorkerQuestion (ipc-registry.ts) to the existing (previously unwired) bridgeQuestionT...
- 358-008 — ALLOWSCOPE-COMPOSE — always-allow'u worker-gate önüne bağla (Sıra-69 kapanışı) — Wired 357-005's ApprovalAllowScopeStore.matchesAllow() in FRONT of WorkerApprovalGate.guard()'s d...
- 358-010 — DEP-REF-LOUD — çözülemeyen dependency-ref sessiz düşmesin (born-458) — born-458 fix, fully scoped to task-builder.ts: (1) resolveDependencyRef gained a 1-based 'Task N'...
- 358-011 — RETRO-DEBT-COUNT — retro sayaç-kaynağı düzelt (born-460) — DISK-VERIFY (reproduced with the sprint-357 archive): .brain/sprints/sprint-357.md (writeSprintLo...
- 358-012 — REFDOCS-ADR-REGEX — docs:ref yeni ADR-taksonomisini tanısın (born-461) — ADR_FILE_RE + ADR_HEADING_RE now recognize both the new adr-(g|d)-NNN-slug.md / # ADR-(G|D)-NNN: ...
- …and 5 more delivered

## Sprint sprint-357 Learnings
- Sprint sprint-357 Learnings: ## Sprint sprint-357 Learnings
- TERM-CONFIG-WIRE — TerminalConfig'i runtime'a bağla: GO_WITH_TECH_DEBT — Wired all six schema-only terminal.* config fields into server.ts's createHttpServer: maxSessions/idleTimeoutMs/scrollba
- SLASH-MODE-WIRE — filterRegistryByMode'u /help yoluna bağla: GO_WITH_TECH_DEBT — DISK-VERIFY: grepped filterRegistryByMode/resolveSlash/renderHelp/buildSlashRegistry across src/. filterRegistryByMode (
- ONB-HONEST — doctor "hazır/eksik/tek-tık-fix" dürüst mesaj katmanı: GO_WITH_TECH_DEBT — ONB-HONEST presentation layer implemented, check logic untouched. doctor.ts: added DoctorHonestState ('ready'|'missing'|
- LINK-SWEEP — eski-ADR linklerinin crosswalk taraması (born-455): GO_WITH_TECH_DEBT — Baseline `npm run lint:link`: 98 broken links. After fix: 10 remain — ALL 10 are outside docs/ and outside this task's filesWrite scope (docs/): 9 under `.claude/worktrees/agent-a43c21887a774f7a5/**` (a stale/prunable git worktree — `git worktree list` confirms `prunable`; it is a frozen snapshot copy, not live docs content) + 1 under `.github/ISSUE_TEMPLATE/question.md` (a GitHub issue-search URL the linter false-positives as a relative file link, pre-existing, unrelated to the ADR redesign). Zero remaining errors inside docs/. Exit code is 1 only because of these two out-of-scope categories.,docs/adr/README.md was the bulk of the 98 (82 rows): its AUTOGEN ADR-index table still listed the pre-2026-06-30 numeric ADR files (001-094) that no longer exist. Could not use `npm run docs:ref` to regenerate — verified `scripts/gen-reference-docs.mjs`'s `ADR_FILE_RE`/`ADR_HEADING_RE` only match old numeric-only filenames/headings (`^(\d+)-.+\.md$`, `ADR-(\d+):`), so `--check` reports '0 entries' for this file post-redesign (script needs a fix for adr-g-NNN/adr-d-NNN naming). Hand-rewrote the AUTOGEN table body to list the current 41 docs/adr/*.md files (7 ADR-D + 34 ADR-G, all status=accepted), matching the exact renderAdrs() format/columns the generator would produce once fixed, so a future regen diff stays minimal. No ADR decision text changed anywhere — index-table only. Added one line above AUTOGEN:END noting docs/adr/archive/ holds pre-redesign historical ADRs (correctly excluded from the index, matching parseAdrs()'s own directory-skip behavior).,docImpact: scripts/gen-reference-docs.mjs ADR_FILE_RE/ADR_HEADING_RE need updating to recognize adr-g-NNN/adr-d-NNN naming (currently numeric-only) so `npm run docs:ref` can mechanically regenerate docs/adr/README.md again — out of my docs/-only scope, flagging for a scripts/ follow-up task.,docImpact: .lintlinkignore (repo root, out of my scope) does not exclude .claude/worktrees/**, so a stale/prunable git worktree pollutes `npm run lint:link` output (9 of the 10 remaining errors). Recommend adding an ignore glob in a follow-up task.,Spot-check — every changed link is crosswalk-correct per each ADR file's own Crosswalk: line: ADR-062->ADR-G-029 (docs/adr/adr-g-029-embedded-web-terminal.md Crosswalk line, used in docs/guide/terminal.md + terminal-tr.md), ADR-087->ADR-D-002 (docs/adr/adr-d-002-test-infra-hermeticity.md Crosswalk line: 'ADR-003 (+ ADR-087 + ADR-078-A) -> ADR-D-002', used in docs/adr/archive/005-synchronous-i-o.md), ADR-010->ADR-D-005 (docs/adr/adr-d-005-dependency-policy-inventory.md Crosswalk line: 'ADR-010 + ADR-011 -> ADR-D-005', used in docs/reference/dependencies.md, all 4 mentions incl. 2 links).,docs/cookbook/fix-bug.md:229 fix was NOT an ADR-crosswalk link (pre-existing, already tracked separately as item F5 in docs/audits/doc-refresh-2026-06/A28-toplevel-global-integrity.md): dead anchor #fix -> real heading '## Phase 5: FIX — Autonomous Recovery Cycle' in docs/architecture/sprint-lifecycle.md. Fixed to #phase-5-fix--autonomous-recovery-cycle, slug verified against scripts/lint-links.mjs's own slugify() function directly (not guessed) to reach full lint:link green on the docs/ tree.,docs/archive/ (Tier-4 frozen historical docs, distinct from docs/adr/archive/) was not touched — none of its links were broken.,docs/MASTER-PLAN.md was not touched, per nogo criteria.,No ADR decision/body text was changed anywhere — only index tables, dead links, and their immediate surrounding label text.

## Gains
- 357-001 — TOOL-CAT — tool/action katalog veri-modeli + trust-tier — TOOL-CAT data model implemented in src/core/tool-catalog.ts, read-only consuming tool-registry.ts...
- 357-002 — TERM-CAT — katalog render + trust badge (string-free) — renderCatalog(entries, labels, options?) implemented as a pure, string-free render mechanism in s...
- 357-003 — TOOL-REG — availability-cache (TTL) + toolset enable/disable dilimi — TOOL-REG first slice: (a) ToolAvailabilityCache — TTL memoization of tool-source probes via check...
- 357-004 — CKPT-1 — WorkerQuestion → ApprovalBroker köprüsü (gerçek human-checkpoint) — CKPT-1 köprü modülü tamam.
- 357-005 — APR-ALLOWSCOPE — scoped always-allow (asla global) — APR-ALLOWSCOPE implemented as a standalone lookup (src/core/approval-allowscope.ts) — approval-po...
- 357-006 — APPROVE-007b — REPL /nervous köprüsü + handleEdit — APPROVE-007b REPL /nervous bridge.
- 357-007 — TERM-RESUME — recent-session teaser + /resume picker çekirdeği — TERM-RESUME data+selection core.
- 357-008 — TERM-BUSY — /queue /interrupt /steer durum-makinesi — Pure state machine (no I/O/rendering), mirrors term-mode.ts's style: discriminated unions with a ...
- …and 4 more delivered

## Sprint sprint-354 Learnings
- Sprint sprint-354 Learnings: ## Sprint sprint-354 Learnings
- REPL-SURFACE-WIRE — footer+mode+queue'yu Ink-app'e bağla: GO_WITH_TECH_DEBT — Wired buildLiveFooter + term-mode.ts + chat-turn-queue.ts into ReplApp (src/cli/repl/app.tsx), all behind a single `repl
- MOAT3-FIXPHASE — NOT_DISPATCHED → FIX re-dispatch: GO_WITH_TECH_DEBT — MOAT-3 FIX-half wired: runFixPhase now actually re-dispatches NOT_DISPATCHED tasks (351-008 built only the classificatio
- DEBT-LEDGER-COVERAGE — self-DEBT'ler neden ledger'a düşmüyor: GO_WITH_TECH_DEBT — Root cause (disk-verified against sprint-352 archive, .brain/archive/sprint-352-tasks/task-352-{005,008,010,012,013}.res
- APR-RULES-LOAD — policy-kuralları config'ten (saf yükleyici): GO_WITH_TECH_DEBT — APR-RULES-LOAD: pure zod-validated loader `loadApprovalRules(rawConfig: unknown)` in src/core/approval-rules-load.ts. Re

## Gains
- 354-002 — TOOL-REPL-WIRE — deckent tool-yüzeyini native-tool-registry'ye köprüle — TOOL-REPL-WIRE: bridged the 353 core primitives (tool-registry.ts TOOL-1, tool-search.ts TOOL-2, ...
- 354-003 — APR-SHELLCLIENT — Ink onay-kartı (row 33) — DONE (code + logic fully correct + verified) with ONE open item outside my write scope: tests/cli...
- 354-004 — APR-DUALSTREAM — çift-bölge kompozitörü (row 36) — composeDualStream({statusLines, approvalLines, width, height}, options?) implemented as a pure, n...
- 354-005 — WORKERGATE-WIRE — riskli worker-tool'ları gate'le (flag-gated) — WORKERGATE-WIRE implemented entirely in src/agents/agentic-worker-tools.ts (the only src/ file in...
- 354-006 — DECKBROKER-WIRE — subprocess secret'ları broker'dan (flag-gated) — DECKBROKER-WIRE implemented, flag-gated DEFAULT-OFF, ADR-G-005/G-017.
- 354-007 — TERM-FLOW — altın-akış orkestratörü (row 40) — runGoldenFlow(goal, seams) implemented as a single pure orchestrator in src/orchestra/golden-flow...
- 354-008 — DIR1-CMD — `deckent plan-nl` + komut-kayıtları (index.ts TEK-yetkili) — Implemented `deckent plan-nl "<goal>"` (src/cli/commands/plan-nl.ts): buildPlanNlIntent() maps th...
- 354-009 — CONNECT-CMD — `deckent connect` komutu (kayıtsız — kayıt Task 8'de) — Implemented registerConnect(program) wrapping the 353-era pure /connect wizard core (helpers/conn...
- …and 3 more delivered

## Sprint sprint-353 Learnings
- Sprint sprint-353 Learnings: ## Sprint sprint-353 Learnings

## Gains
- 353-001 — SCOPECHECK-CORE — realpath scope-check primitive'ini core'a taşı (352-010 ADR-debt) — Created src/core/scope-check.ts as the single source of truth for the realpath-based scope-contai...
- 353-002 — APR-STORE — durable approval store (row 31) — APR-STORE: durable ApprovalStore layer built as a PEER reader/writer of ApprovalBroker's existing...
- 353-003 — APR-POLICY — karar-motoru (row 32) — Pure decision engine: decidePolicy(request, rules) -> {policy, reason, timeoutMs?}.
- 353-004 — APR-WORKERGATE — riskli-aksiyon önü worker kapısı (row 34) — WorkerApprovalGate (APR-WORKERGATE, MASTER-PLAN row 34) added as a new core module, additive-only...
- 353-005 — APR-FALLBACK — FallbackResolver (row 35) — resolveFallback(request, ctx) implemented as a pure, synchronous, total function (no IO, no Date....
- 353-006 — APR-EVENTSTREAM — çok-client yayın (row 68) — ApprovalEventStream built strictly on ApprovalRelay's PUBLIC attachChannel/detachChannel surface ...
- 353-007 — TERM-LIVE — canlı run-status footer üretici (row 43) — buildLiveFooter(state, options) implemented as a pure render module (no fs/network I/O — direct f...
- 353-008 — TERM-MODE — Ask/Run/Control 3-mod makinesi (row 39) — TERM-MODE pure state machine implemented in src/cli/repl/term-mode.ts: TermMode='ask'|'run'|'cont...
- …and 8 more delivered

## Sprint sprint-352 Learnings
- Sprint sprint-352 Learnings: ## Sprint sprint-352 Learnings
- W5C — kind-affinity, config-gated (row 447, YENİDEN-KOŞUM): GO_WITH_TECH_DEBT — PCOMP-W5C kind-affinity, config-gated via RoutingOptions.kindAffinity (default-off) — re-run of never-dispatched 351-018
- ROUTING-VERSION-LABEL — 'v3'-return vs 'v2'-stamp uzlaştır (ADR-G-006 P2): GO_WITH_TECH_DEBT — ADR-G-006 P2 ROUTING-VERSION-LABEL reconcile. (1) src/core/routing-engine.ts:513 — routeTaskV2's RoutingDecision.routing

## Gains
- 352-001 — TOOL-2 — progressive disclosure köprüsü (row 21 YENİDEN-KOŞUM) — TOOL-2 progressive disclosure bridge, built strictly on top of TOOL-1 (src/core/tool-registry.ts,...
- 352-002 — EXEC-THROW-HUNT — waitForResults istisna-avı + tick-zırhı (row 452 🔴) — EXEC-THROW-HUNT (born-452/453).
- 352-003 — EVAL-AUDIT-REVIVE — ölü audit-trail'i canlandır (row 451 🔴) — Root cause (file:line + git-trail, disk-verified): the OLD `.deckent/evaluations/` path being sta...
- 352-004 — SWEEP2 — stale model-ID part-2 (row 431 kalanı, YENİDEN-KOŞUM) — Canonical source: src/core/model-registry.ts BUILTIN_MODELS — sonnet apiId = 'claude-sonnet-5' (o...
- 352-005 — DPP — dead provision-helper purge/consent (row 208, YENİDEN-KOŞUM) — Disk-verify (goCriteria evidence step) DONE: full-repo grep of src/** (750 .ts files, excluding d...
- 352-006 — CFG-1 — legacy `mode` config-set blokajı (row 209, YENİDEN-KOŞUM) — Disk-verified the 351-016/CFG-1 claim ('legacy mode value blocks config-set'): it is ALREADY FIXED.
- 352-007 — DOCTOR-1 — backend-aware platform-check (row 210, YENİDEN-KOŞUM) — Root cause: checkPlatform() in src/cli/commands/doctor.ts took no spawnBackend param and uncondit...
- 352-009 — TOOL-CORE — core-tool-set eager listesi wire (row 23, P1) — TOOL-CORE: new pure module src/core/tool-core.ts built strictly on top of TOOL-2 (ToolSearchIndex...
- …and 5 more delivered

## Sprint sprint-350 Learnings
- Sprint sprint-350 Learnings: ## Sprint sprint-350 Learnings

## Gains
- 350-001 — TRN-1 — trace-recorder'ı sprint-worker turn'lerine WIRE (row 76) — 0-caller claim (disk-verified): `grep -rn "trace-recorder" src --include=*.ts` shows the ONLY pro...
- 350-002 — TRN-2 — trace-recorder'ı native-REPL'e WIRE (row 77) — DISK-VERIFY: the task's '0-caller' claim is FALSE on disk.
- 350-003 — TRN-3 — cc-trace-extractor driver (row 78) — Built `deckent trace extract <input>` driving src/training/cc-trace-extractor.ts::extractFromSess...
- 350-004 — APR-CONTRACT — ApprovalRequest tam kontratı (row 30) — APR-CONTRACT foundation module delivered per spec (row 30, §11.2, ADR-G-020).
- 350-005 — SIGTERM-CLEANUP — SIGTERM'i SIGINT temizlik-yoluna bağla (ADR-G-013 born) — ADR-G-013 SIGTERM-CLEANUP: removed the `if (signal === 'SIGINT')` guard in entry.ts onSignal() so...
- 350-006 — STALE-MODEL-ID-SWEEP — 30 test dosyasında sonnet-ID güncelle (row 431) — Canonical-ID source (disk-verified): src/core/model-registry.ts:61-71 — BUILTIN_MODELS entry { id...

## Sprint sprint-349 Learnings
- Sprint sprint-349 Learnings: ## Sprint sprint-349 Learnings

## Gains
- 349-001 — DOCKER-FIXPACK — stale-shadow EACCES + inert kind-memlimit (rows 434+433) — Both defects addressed within the granted write scope (src/orchestra/spawn-backend-docker.ts + ne...
- 349-002 — FINALIZE-ERROR-SURFACE — swallowed finalize failures become visible (row 436) — Fixed the swallowed-finalize catch path in runRetroPhase (src/orchestra/sprint-phases.ts, was ~:2...
- 349-003 — CRED-HARDEN-PACK — AAD binding + atomic writes + Windows honesty (row 438) — CRED-HARDEN-PACK (a)+(b)+(c) all implemented within the credential-encryption.ts / credentials-pe...
- 349-004 — REDACT-COVERAGE — extend the secret-mask allowlist (row 437) — REDACT-COVERAGE: extended redactSensitive() with 4 new anchored, bounded-quantifier patterns appe...
- 349-005 — PCOMP-W8 — test-strategy hints for exit-path tasks (row 445) — Added exported pure function buildExitPathTestHint(task) in src/orchestra/prompt-god-template.ts ...

## Sprint sprint-347 Learnings
- Sprint sprint-347 Learnings: ## Sprint sprint-347 Learnings
- W0-8 STATE-RESOLVER — env-aware state-path resolver primitive: NO_GO
- W0-9 CRED-PER-PROJECT — per-project encrypted credential store 🔴: NO_GO
- W0-10 SYMLINK-AUTHORITY-WIRE — close the runtime symlink scope-bypass 🔴: NO_GO
- W0-11 AUDIT-WIRE — persist terminal audit to MemoryStore + HMAC chain: NO_GO
- W0-12 CRASH-REDACT — redact secrets from fatal crash output 🔴: NO_GO

## Sprint sprint-346 Learnings
- Sprint sprint-346 Learnings: ## Sprint sprint-346 Learnings
- F07 — fix reference CLI (hand-curated only): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [98 
- F08 — fix reference config: NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=41, untrackedFiles=2
- F09 — fix reference API: NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=399, untrackedFiles=
- F14 — fix reference features/glossary/lifecycle (+ glossary dedup): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=12, untrackedFiles=2
- F17 — fix cookbook task-recipes & meta (+ fix-bug anchor): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=0, untrackedFiles=28
- F18 — fix architecture/architecture.md (the master map): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=3, untrackedFiles=28
- F19 — fix architecture (authority, agents, memory, lifecycle, stray ADRs): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=56, untrackedFiles=2
- F20 — fix development core guides (+ worker-guide dedup): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=27, untrackedFiles=2
- F22 — fix vision cluster (protected prose only): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=14, untrackedFiles=2
- F23 — fix launch cluster: NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=0, untrackedFiles=28

## Gains
- 346-001 — F01 — fix guide onboarding-core — All A01 P0/P1 issues applied:
- 346-002 — F02 — fix guide concepts — Applied all A02 audit findings.
- 346-003 — F03 — fix guide autonomous & learning — All three go-criteria met:
- 346-004 — F04 — fix guide nervous, dashboard & REPL — Applied all 3 A04 audit findings:
- 346-005 — F05 — fix guide workers, troubleshooting & misc — All MUST FIX items from A05 audit applied:
- 346-006 — F06 — fix guide providers & backends — Fixed CRITICAL issue A06-MF-1: routing table in multi-provider-fleet.md incorrectly classified co...
- 346-010 — F10 — fix reference MCP (hand-authored only) — All 7 hand-authored issues from A10-reference-mcp.md fixed:
- 346-011 — F11 — fix reference routing, execution & dependencies — P0 fix: `telegraf ^4.16.0` → `grammy ^1.44.0` in dependencies.md.
- …and 5 more delivered

## Sprint sprint-345 Learnings
- Sprint sprint-345 Learnings: ## Sprint sprint-345 Learnings

## Gains
- 345-001 — A01 — guide onboarding-core — A01 audit file created.
- 345-002 — A02 — guide onboarding-concepts — A02 audit report written.
- 345-003 — A03 — guide autonomous & learning — A03 audit report written.
- 345-004 — A04 — guide nervous, dashboard & REPL — Deep-verified all 5 guide docs against source code.
- 345-005 — A05 — guide workers, troubleshooting & misc — A05 audit complete.
- 345-006 — A06 — guide providers & backends — Audit report A06 written.

## Sprint sprint-342 Learnings
- Sprint sprint-342 Learnings: ## Sprint sprint-342 Learnings

## Gains
- 342-001 — live-proof marker file — File already existed with correct content matching goCriteria exactly: heading '# Token Capture L...

## Sprint sprint-341 Learnings
- Sprint sprint-341 Learnings: ## Sprint sprint-341 Learnings

## Gains
- 341-001 — live-proof marker file — File docs/audits/token-capture-live-proof.md exists with correct heading '# Token Capture Live-Pr...

## Sprint sprint-340 Learnings
- Sprint sprint-340 Learnings: ## Sprint sprint-340 Learnings

## Gains
- 340-001 — live-proof marker file — File docs/audits/token-capture-live-proof.md already existed with correct content matching goCrit...

## Sprint sprint-339 Learnings
- Sprint sprint-339 Learnings: ## Sprint sprint-339 Learnings

## Sprint sprint-338 Learnings
- Sprint sprint-338 Learnings: ## Sprint sprint-338 Learnings

## Gains
- 338-001 — live-proof marker file — File docs/audits/token-capture-live-proof.md exists with exactly '# Token Capture Live-Proof' hea...

## Sprint sprint-337 Learnings
- Sprint sprint-337 Learnings: ## Sprint sprint-337 Learnings

## Gains
- 337-001 — live-proof marker file — File exists at docs/audits/token-capture-live-proof.md with the required heading '# Token Capture...

## Sprint sprint-336 Learnings
- Sprint sprint-336 Learnings: ## Sprint sprint-336 Learnings

## Gains
- 336-001 — live-proof marker file — File docs/audits/token-capture-live-proof.md already existed and contained exactly the required h...

## Sprint sprint-335 Learnings
- Sprint sprint-335 Learnings: ## Sprint sprint-335 Learnings
- live-proof marker file: NO_GO — Created docs/audits/token-capture-live-proof.md with the required heading '# Token Capture Live-Proof' and the specified

## Sprint sprint-334 Learnings
- Sprint sprint-334 Learnings: ## Sprint sprint-334 Learnings
- P0-C recurrence — terminate the orphan start-process at NORMAL finalize (not only --force): GO_WITH_TECH_DEBT — P0-C RECURRENCE fix: the NORMAL (non-force) finalize path now terminates a still-alive owned `deckent start` coordinator
- KPI Faz-2 — Telegram/connector sprint-end KPI summary dispatch (wired WITHOUT connector-bootstrap.ts): GO_WITH_TECH_DEBT — KPI Faz-2 — sprint-end KPI summary now dispatched to connectors, wired WITHOUT touching connector-bootstrap.ts.

Key des
- KPI Faz-2 — surface the threshold-breach advisory in the `deckent kpi` CLI: GO_WITH_TECH_DEBT — Surgical fix: added 2 imports (buildKpiBreachAdvisory + ScorecardLang) and 4 lines after print(formatTable) in kpi.ts ta

## Gains
- 334-001 — P0 — TOKEN-REAL-CAPTURE: replace heuristic token/cost with Anthropic's REAL session-store usage (THE top fix) — P0 TOKEN-REAL-CAPTURE — replaced heuristic-only token capture with the provider's REAL native ses...
- 334-002 — F1-014 phase-2 — unify + dynamic-ize the cross-provider credential scrub (config-driven apiKeyEnv coverage) — F1-014 phase-2 — unified + dynamic-ized the cross-provider credential scrub behind ONE source of ...
- 334-004 — A20 — `handleWorkerQuestion` honors the worker's suggestedAction (flag-gated default-off) — A20 — handleWorkerQuestion now honors the worker's question.suggestedAction behind a flag-gated, ...
- 334-005 — F1-013 phase-2 — http-agentic-worker SCOPE_INSUFFICIENT event-stream emission parity — F1-013 phase-2: HTTP agentic worker now emits the SAME WORKER→BRAIN:SCOPE_INSUFFICIENT event the ...
- 334-008 — W-H — EN multi-provider + cost/KPI cookbook recipe (Beta onboarding) — Created docs/cookbook/multi-provider-and-cost-en.md with all required content.
- 334-009 — docs — sprint-334 campaign findings note (NEW dated doc; NOT MASTER-PLAN/TRIAGE) — Wrote docs/audits/OVERNIGHT-2026-06-28-findings.md (190 lines, 11.9 KB).
- 334-010 — ADR-093 — real token/cost capture via provider-native usage stores (architecture record) — ADR-093 written to docs/adr/093-real-token-usage-capture.md (189 lines).
- 334-011 — F11 — wire skill-dispatch into the native REPL tool registry (parity slice) — F11 parity slice: registered ONE new `deckent_skill_dispatch` tool in buildNativeToolRegistry.

## Sprint sprint-333 Learnings
- Sprint sprint-333 Learnings: ## Sprint sprint-333 Learnings
- DOC-PKG-1 — no dangling `docs/` link survives in the published tarball (Beta onboarding): NO_GO — Sprint-332 commit 38185e8b already completed this task in full. Analysis: README.md had 9 relative docs/ links; sprint-3
- F1-IMG-2 — `deckent init`/`upgrade` opt-in worker-image build integration (Beta onboarding): GO_WITH_TECH_DEBT — F1-IMG-2 — opt-in worker-image build offer integrated into `deckent init`.

WHAT LANDED (src/cli/commands/init.ts, addit
- i18n-first cleanup — evolve/sync hardcoded strings + B-ZOMBIE daemon-string centralization (sole messages.ts owner): GO_WITH_TECH_DEBT — messages.ts: added 7 doctor.daemon_* keys, 5 evolve.* keys, 1 sync.deckent_not_found key — all with en+tr translations.,doctor-checks.ts: removed local DAEMON_MESSAGES dict + daemonMsg helper (42 lines); imported getMessage from messages.ts; replaced all 8 daemonMsg() calls with getMessage().,evolve.ts: imported getMessage + getLanguage; added lang = getLanguage() in renderReport; replaced 5 hardcoded console.log strings with getMessage() calls.,sync.ts: imported getMessage + getLanguage; replaced both occurrences of 'DECKENT.md not found. Run deckent init first.' with getMessage('sync.deckent_not_found', getLanguage()).,tests/cli/i18n-hardcode-cleanup.test.ts: created 49 hermetic tests — all green.,tsc --noEmit: 0 new errors.,Targeted tests: tests/cli/i18n-hardcode-cleanup.test.ts 49/49, messages.test.ts 20/20, doctor-ux.test.ts 14/14, doctor-profile.test.ts 18/18, doctor-json.test.ts 6/6, sync.test.ts 3/3 — all green.,English output text is byte-equivalent to prior literals (verified by exact-match assertions in tests).,No unrelated reformatting or logic changes.

## Gains
- 333-001 — F1-014 — spawn-time per-worker auth NON-LEAK for the subprocess backend (AS-2) — F1-014 — closed the SUBPROCESS (local, non-docker) backend per-worker auth NON-LEAK gap.
- 333-002 — F1-010 — dynamic subs→API overflow gate (flag-gated, default-off) (AS-2) — F1-010 dynamic pre-spawn subs→API overflow gate, flag-gated + default-off.
- 333-003 — KPI Faz-2 — threshold-breach advisory (status surfaced, not just stored)
- 333-004 — KPI Faz-2 — Tier-1 REAL-BINARY e2e smoke harness (proof-of-function + cost/token live-proof) — Created hermetic Tier-1 e2e harness at tests/e2e/kpi-surface-smoke.test.ts.
- 333-005 — B6 — cost-gate daily/monthly WARN-ONLY wire (visibility, never blocks) — B6 cost-gate daily/monthly WARN-ONLY finalize wire.
- 333-006 — status honesty — `failedTasks` reports real NO_GO count (CLI/MCP contract) — The status.ts fix (failedTasks: noGoCount instead of hardcoded 0) was already in place at lines 4...
- 333-007 — B7 — SIEM forwarder: missing-transport silent discard → advisory warn — Surgical 3-part change to siem-forwarder.ts: (1) added optional `warn?: (message: string) => void...
- 333-011 — W-H — EN getting-started cookbook doc (Beta onboarding) — Created docs/cookbook/getting-started-en.md (new file under existing docs/cookbook/ dir).

## Sprint sprint-332 Learnings
- Sprint sprint-332 Learnings: ## Sprint sprint-332 Learnings
- `deckent kpi` no-arg latest-finalized fallback (proof-of-function blocker — fix #1): GO_WITH_TECH_DEBT — FIX-#1: `deckent kpi` (no --sprint) emitted `{ sprintId: null, kpis: [] }` once a sprint was finalized because getCurren
- SPAWN-1 — Node DEP0190 `shell:true` Windows fix (cross-platform + ADR-006): GO_WITH_TECH_DEBT — SPAWN-1 — Node DEP0190 `shell:true`+args-array Windows fix at BOTH live sites, closing the deprecation noise AND the ADR
- CFG-1 — legacy `mode` no longer blocks `config set` (Windows beta install-blocker): GO_WITH_TECH_DEBT — CFG-1 fix — legacy `mode` no longer blocks `config set`.

ROOT CAUSE: asymmetry between the READ path (loadConfig → reso
- 331-007 B-ZOMBIE — wire `checkDaemonHygiene` live into `deckent doctor`: GO_WITH_TECH_DEBT — Wired the already-built checkDaemonHygiene (doctor-checks.ts:595) LIVE into `deckent doctor`. Pre-wire: grep `daemon` in
- KPI Faz-2 — `GET /api/kpi/trend` HTTP endpoint (Tier-1 surface): GO_WITH_TECH_DEBT — KPI Faz-2 trend surface. NEW src/api/kpi-trend-endpoint.ts: registerKpiTrendEndpoint(url,res,projectRoot,req?) serves GE
- F1-IMG-2 — `deckent image build` standalone command (Beta onboarding): GO_WITH_TECH_DEBT — F1-IMG-2 — `deckent image build` standalone command upgraded to the new contract.

GROUND-TRUTH RECONCILIATION (disk-ver
- W-B parity — `deckent_cost` MCP tool (CLI/MCP surface parity): GO_WITH_TECH_DEBT — Created src/mcp/tools/cost.ts with registerCostTool(server, deps) and getCostView(root, deps). Delegates entirely to loa

## Gains
- 332-002 — forward-collection fire at finalize + REAL per-task cost/token capture (fix #2 + #3) — Pre-fix RED is genuine: recordSprintKpis did not exist (inline anonymous block) AND buildUsageTot...
- 332-005 — F1-013 — agentic HTTP-worker v1 (CLI-less providers run real workers) — F1-013 agentic HTTP-worker v1 — CLI-less (OpenAI-compatible / Bedrock-shape / API) providers can ...
- 332-007 — F11-012 — Ink render-path UTF-8/Türkçe chunk-boundary guard — F11-012 Ink render-path UTF-8/Türkçe chunk-boundary guard.
- 332-008 — KPI Faz-2 dashboard surface — scorecard card + trend page (Tier-1) — AUTH_FAILED: claude --version exitCode=null stdout=""
- 332-010 — KPI Faz-2 — `deckent_kpi` MCP tool gains `trend` mode — Extended deckent_kpi MCP tool with optional trend mode.
- 332-012 — DOC-PKG-1 — README links resolve on a fresh `npm i` (Beta onboarding) — Fixed 19 relative docs/ references in README.md by rewriting them to absolute canonical GitHub UR...
- 332-013 — F1-005 — Dockerfile.worker multi-CLI build-arg (opt-in codex/gemini) — F1-005 spawn-side: thread the per-worker provider into the docker build/image selection so a code...
- 332-014 — KPI Faz-2 — Telegram/connector sprint-end KPI summary — All goCriteria met:
- …and 1 more delivered

## Sprint sprint-331 Learnings
- Sprint sprint-331 Learnings: ## Sprint sprint-331 Learnings
- B-ZOMBIE — stale-daemon hygiene surfaced in `deckent doctor`: GO_WITH_TECH_DEBT — B-ZOMBIE stale-daemon hygiene. Built the detection engine + advisory renderer (all hermetically tested, green); two foll
- KPI Faz-2 — `deckent_kpi` MCP tool surface: GO_WITH_TECH_DEBT — All goCriteria met:

1. tsc --noEmit: one pre-existing error in src/providers/claude.ts:503 (TS6133 — unused var in scop
- KPI Faz-2 — `/api/kpi` HTTP endpoint (Tier-1 surface): GO_WITH_TECH_DEBT — KPI Faz-2 /api/kpi HTTP endpoint (Tier-1 surface).

WHAT:
- NEW src/api/kpi-endpoint.ts: registerKpiEndpoint(url,res,pro
- KPI Faz-2 — `deckent kpi --trend <kpiId>` CLI (surface existing getTrend): GO_WITH_TECH_DEBT — Implemented `kpi --trend <kpiId> [--n <count>] [--json]` in kpi.ts:

- Added `renderTrend()` internal function that dele

## Gains
- 331-001 — Error-convention fix — 3 generic throws → DeckentError registry (sprint-330 fix #1) — Migrated the 3 remaining generic `throw new Error(...)` in src/core to the DeckentError registry ...
- 331-002 — opus outputTokens:null robust capture — claude.ts extractUsage (sprint-330 fix #2) — Root cause (disk-verified via /tmp/probe.mjs): the opus `--output-format json` result envelope in...
- 331-003 — KPI live-backfill — `deckent kpi` computes from sprint history (sprint-330 fix #3, closes 009) — KPI live-backfill (009 data-gap / sprint-330 fix #3) — self-healing read-path reconstruction of K...
- 331-004 — F1-012 — de-hardcode the 3 provider-registration sites (config-driven registry) — F1-012 — de-hardcoded the 3 provider-registration sites in src/core/provider.ts so a config.provi...
- 331-005 — F1-DF — ship `Dockerfile.worker` in the npm package (Beta install-blocker) — Surgical one-line addition to package.json files[]: added '"Dockerfile.worker"' between 'assets' ...
- 331-006 — B-HANDOFF-STALE — wire `pruneCompletedSprints` into sprint finalize (storage prune) — Wired HandoffProtocol.pruneCompletedSprints into sprint finalize as a non-blocking storage-prune ...
- 331-010 — Ollama `/api/tags` health-gate before routing (Phase-2 hardening) — Added `HealthGateResult` interface (exported) and `checkHealthGate(requestedModel?: string): Prom...
- 331-011 — Codex token-capture parity — tokenUsage no longer zero (MF-5) — MF-5 codex tokenUsage=0 — FAITHFUL real-envelope capture + honest root cause + surgical in-scope ...
- …and 4 more delivered

## Sprint sprint-330 Learnings
- Sprint sprint-330 Learnings: ## Sprint sprint-330 Learnings
- i18n labels + `deckent kpi` CLI command (Tier-1): GO_WITH_TECH_DEBT — tsc --noEmit: exit 0 (0 new errors). Targeted test tests/kpi/kpi-format.test.ts: 8/8 pass (currency/percent/number/durat

## Gains
- 330-001 — shared types + base-measure catalog (foundation) — Created src/core/kpi/types.ts with all required types (MeasureKind, AggMethod, BaseMeasure, KpiDi...
- 330-002 — sandboxed formula-evaluator (SSOT) — Sandboxed formula-evaluator (SSOT) implemented per DIRECTIVES Task 2 + spec §6.
- 330-003 — KpiStore — better-sqlite3 tables, tenant-filtered — KpiStore (better-sqlite3, tenant-filtered) implemented per spec §7 + DIRECTIVES Task 3, following...
- 330-004 — KPI definitions — zod schema + 8 builtin KPIs + config loader — KPI_DEFINITION_SCHEMA (zod, strict, follows NERVOUS_SYSTEM_SCHEMA pattern config.ts:286) + KpiDef...
- 330-005 — rollup-engine — fold → compute results + direction-aware status — rollup-engine implemented per DIRECTIVES Task 5 + spec §7/§8/§11.
- 330-006 — collection — derive base measures from sprint data + record pipeline — Implemented deriveMeasurements (pure, no I/O) + recordKpiMeasurements (open/close own KpiStore).
- 330-007 — KpiService facade — list sprint views + trend (live fallback) — KpiService facade implemented per DIRECTIVES Task 7 spec.
- 330-008 — wire collection into sprint-finalizer (non-blocking hook) — Wired KPI collection into sprint-finalizer as a NON-BLOCKING hook + added exported buildUsageTotals.
- …and 13 more delivered

## Sprint sprint-329 Learnings
- Sprint sprint-329 Learnings: ## Sprint sprint-329 Learnings

## Gains
- 329-001 — identity config — scim/oidc provider kind + provider-specific config (foundation) — Added LocalIdentityProviderConfig, ScimIdentityProviderConfig, OidcClaimsIdentityProviderConfig i...
- 329-002 — SCIM 2.0 directory provider — sync() pulls Users+Groups → IdentityStore — ScimIdentityProvider implements IdentityDirectoryProvider (id='scim', edition defaults to 'enterp...
- 329-003 — OIDC-claims provider — role+tenant from ID-token claims (verify-bind OIDC yolu) — Implemented OidcClaimsIdentityProvider + pure principalFromClaims function.
- 329-004 — factory wiring — createIdentityProvider supports scim + oidc-claims — Expanded CreateProviderOptions to a discriminated union (local | scim | oidc-claims).
- 329-005 — bootstrap sync wiring — background sync() opt-in + role-map groupKey live (Tier-1) — Bootstrap sync wiring (background sync() opt-in + role-map groupKey live), strictly within the 2-...
- 329-006 — docs — spec §3.3/§11 güncelle + ADR-092 amend (scim/oidc live) — §3.3 güncellendi: başlığa 'Faz 3 ✅ Sprint 329' eklendi; scim+oidc-claims live, resolve=saf-local/...

## Sprint sprint-328 Learnings
- Sprint sprint-328 Learnings: ## Sprint sprint-328 Learnings
- Class-A codex usage-emit (CLI-agent, native source): GO_WITH_TECH_DEBT — Class-A codex usage-emit. ROOT CAUSE: codex `exec --full-auto` emitted NO structured usage, so the worker .log was prose

## Gains
- 328-001 — rich normalized usage schema (foundation) — Added `cacheWriteTokens?: number` and `reasoningTokens?: number` to `TokenUsage`, `RawTokenUsage`...
- 328-002 — Class-A claude usage-emit (CLI-agent, native source) — Class-A claude usage-emit implemented via Approach 1 (--output-format json envelope), chosen by P...
- 328-004 — Class-A gemini verify + extractUsage→result (CLI-agent) — Class-A gemini usage-capture: VERIFIED + COMPLETED.
- 328-005 — Class-B API usage-accumulate → result (HTTP-response providers) — Class-B HTTP-response usage accumulation → .result.tokenUsage.
- 328-006 — Class-C OpenRouter first-class (unified gateway, API side) — Class-C OpenRouter first-class (unified gateway, API side).

## Sprint sprint-327 Learnings
- Sprint sprint-327 Learnings: ## Sprint sprint-327 Learnings
- live-proof doc note: GO_WITH_TECH_DEBT — docs/LIVE-PROOF.md created with the required single-paragraph note. No source files touched. tsc unaffected (doc-only ta

## Sprint sprint-326 Learnings
- Sprint sprint-326 Learnings: ## Sprint sprint-326 Learnings
- tokenizer-fallback (usage-raporlamayan provider): GO_WITH_TECH_DEBT — Cascade-skipped (lifecycle-robustness P0-A): dependency 326-003 ended NO_GO/MANUAL_REVIEW, so this dependent was never d

## Gains
- 326-001 — Result Zod schema + validator (the spine) — Implemented the Worker Output Contract result spine (spec §1.2).
- 326-002 — result-assembler (orchestrator-owned, git-authoritative) — Cascade-skipped (lifecycle-robustness P0-A): dependency 326-003 ended NO_GO/MANUAL_REVIEW, so thi...
- 326-003 — token capture — extractUsage adapter contract + codex + normalizer — VERIFY FAILED tsc=undefined vitest=undefined.
- 326-005 — remove worker token self-count placeholder — Spec §1.1 / plan Task 2.3 — removed the worker token self-count placeholder.
- 326-006 — cost — calculateActualCost (cross-provider, local→$0) — Cascade-skipped (lifecycle-robustness P0-A): dependency 326-003 ended NO_GO/MANUAL_REVIEW, so thi...
- 326-007 — structured-JSONL log-event contract — Phase 4.1 (spec §2.2): created src/core/log-event.ts with LogEvent/LogEventType/StreamLogEvent + ...
- 326-008 — complete-stream capture into log — Phase 4.2 (spec §2.1, plan Task 4.2): created src/orchestra/spawn-backend-subprocess.ts — the pro...
- 326-009 — archive-then-delete log integrity — Implemented spec §2.4 archive-then-delete log integrity in src/cli/commands/cleanup.ts:
- …and 4 more delivered

## Sprint sprint-325 Learnings
- Sprint sprint-325 Learnings: ## Sprint sprint-325 Learnings
- Planner structured-parse — `- Model:` → forceModel + `- Dependencies: N` index→slot-id: GO_WITH_TECH_DEBT — Fixed two structured-plan parser bugs in task-builder.ts:

**Bug 1 — `- Model: opus` → forceModel not set:**
In both `pa

## Gains
- 325-002 — honest-gate deletion false-positive — meşru-deletion ≠ stub/boundary-violation — Fixed two false-positive NO_GO cases in enforceHonestResultGate.
- 325-003 — enforcement A14 — applyTechDebtDowngrade wire (flag-gated) — Implemented enforcement A14: applyTechDebtDowngrade wired in sprint-finalizer.ts (step 10b2) with...
- 325-004 — enforcement B6 — cost-gate cumulative spend warn (flag-gated) — Implemented cumulative spend-gate warn system (flag-gated, warn-only, never blocks).
- 325-005 — enforcement B1 — worker hard-deny (enforce_rbac honor, flag-gated) — Surgical fix to checkWorkerAuthority in src/agents/worker.ts: added optional 7th parameter `opts?...

## Sprint sprint-324 Learnings
- Sprint sprint-324 Learnings: ## Sprint sprint-324 Learnings
- KES lazy-loader (mekanik): NO_GO — Zero prod-caller verified: `grep -rn lazyLoad|LazyMap|LazyHandle src --include=*.ts | grep -v test | grep -v lazy-loader
- KES api/rate-limiter (per-IP duplicate): NO_GO — Zero-caller proof: grep across all of src/ shows api/rate-limiter.ts is only self-referencing; enterprise-endpoint.ts:57

## Gains
- 324-001 — config-flags — yeni feature flag'leri (tek-sahip config dosyaları) — Added three new optional feature flags (all default-off):
- 324-004 — result-merger split — detectOverlaps WIRE + mergeResults KES — All goCriteria met:
- 324-005 — sandbox `--sandbox` flag WIRE (no-Docker hafif izolasyon tier) — Wired --sandbox flag to SandboxSpawnBackend via a SandboxBackend adapter class in spawn-backend.ts.
- 324-006 — task-retry WIRE + exponential backoff — ## What was done
- 324-007 — routing-v2 — agent-cache + skill→agent affinity (skill-first reorder) — All three deliverables implemented:
- 324-008 — whatsapp connector WIRE — Added 'whatsapp' to SUPPORTED array (now ReadonlyArray<'telegram'|'discord'|'whatsapp'>).
- 324-009 — connector-pool WIRE (broadcast-to-all) — Added `broadcastAll()` to ConnectorPool (delegates to existing `broadcast()` with all registered ...

## Sprint sprint-323 Learnings
- Sprint sprint-323 Learnings: ## Sprint sprint-323 Learnings
- A14 — applyTechDebtDowngrade zero-caller (verify-delta downgrade ölü): NO_GO — DESIGN DECISION (made, evidence-backed): SUPERSEDE/DELETE the verify-delta downgrade layer — NOT wire. EXECUTION is bloc
- A18 — cross-verify REFUTED advisory→block: GO_WITH_TECH_DEBT — A18 — cross-verify REFUTED advisory→block enforcement-path, flag-gated + default-OFF.

WHAT CHANGED (src/orchestra/cross
- R4 — getCurrentSprintId canonical tamamlama (318 tech-debt kapat): NO_GO — OBSOLETE-WITHIN-SCOPE — sprint-318 already fully canonicalized getCurrentSprintId for everything reachable from this tas
- R4 — isNoColor tek-form doğrula (318 obsolete-check): NO_GO — DISK-VERIFY: Sprint-318 (318-001 R4-ISNOCOLOR) görevi zaten tam olarak tamamlamış. Herhangi bir değişiklik yapılmadı — g
- /provider switch adapter rebuild (chat-native): GO_WITH_TECH_DEBT — ## What Was Done

### src/cli/commands/chat-native.ts
1. Added try/catch around `opts.switchProvider?.(arg)` in the /pro
- selectBestAgent skill-affinity wire (ADR-075 dead-code): GO_WITH_TECH_DEBT — ADR-075 skill→agent affinity wired into the activation scoring path, flag-gated + default-off.

DISK-VERIFY (NO_GO preco
- MCP status failedTasks gerçek NO_GO sayısı (verify): NO_GO — OBSOLETE — Sprint-316 (316-002 R5-FAILEDTASKS) already fixed this. Disk-verify shows:

- src/mcp/tools/status.ts:176-195
- runtime-scope-check bare require() → ESM import: GO_WITH_TECH_DEBT — DONE ITEMS (all goCriteria core items):,- bare require() replaced with ESM dynamic import() in emitViolationEvent,- .js extension preserved in the dynamic import path,- tsc --noEmit: PASSES (0 errors),- Targeted test file tests/nervous/runtime-scope-check.test.ts: 6/6 PASS,  - Brain context does not throw,  - Worker context throws synchronously (NervousScopeViolationError),  - Error name/message/component/ADR-037 all correct,  - vi.mock intercepts dynamic import() → event-bus.emit IS called (not stderr),  - stderr NOT called when event-bus available (fallback no longer triggered),  - stderr fallback fires when emit throws (honest-fail path works),  - DECKENT_WORKER_MODE values other than '1' do not trigger,,TECH DEBT (one open item, out of scope):,- tests/nervous/runtime-scope.test.ts test 4 ('should emit violation event on deckent-event channel') FAILS,  after this fix. That test was written for the BROKEN require() behavior:,  it accepted (mockEmit || stderrWritten) and passed because synchronous require(),  failure always wrote to stderr. Now that emitViolationEvent uses async dynamic import(),,  the check happens before the Promise resolves. The test needs an 'await flushMicrotasks()',  before its assertions — but that file is outside my scope (tests/nervous/runtime-scope.test.ts).,  This needs a follow-up task to update runtime-scope.test.ts test 4 with proper async handling.,,APPROACH TAKEN:,  emitViolationEvent now uses 'void import(...).then(...).catch(...)' — the canonical,  ESM fire-and-forget pattern. Dynamic import() is intercepted by vitest's vi.mock() hoisting,,  proving the event-bus path is actually reached. The stderr .catch() path is the honest-fail,  fallback for when the module truly cannot be loaded.
- C4 — dashboard dead-component cleanup (zero-caller): NO_GO — ## Finding: All 5 Zero-Caller Candidates Are Protected by External Tests

### Zero-caller components identified (grep ve

## Gains
- 323-001 — A9 — enforceAdrCompliance fail-open + PROD-unwired karar — Design-first task.
- 323-003 — A15 — runHonestyCheck ölü-stub temizliği (R4-dup hijyen) — runHonestyCheck dead-stub removed (R4-dup hygiene).
- 323-005 — B6 — cost-gate daily/monthly enforce + cumulative-spend katmanı — B6 — cost-gate daily/monthly enforce (warn-only) + cumulative-spend layer.
- 323-006 — ROLE_CAPABILITY_MAP true-unification (core-general ↔ nervous-worker) — ROLE_CAPABILITY_MAP true-unification — OWNERSHIP unified into core (faithful, ADR-008-safe).
- 323-009 — R4 — parseVitestOutput disambiguation/canonical (baseline-tracker) — Disambiguation analysis complete.
- 323-010 — R4 — NervousSystemConfig V1→V2 full migration — R4 — NervousSystemConfig V1→V2 full migration, achieved at the TYPE level (the only level my file...
- 323-011 — R4 — useApi 2× disambiguation (dashboard hook vs helper) — Disambiguation complete.
- 323-012 — VS Code extension 2× impl dedup — Created extensions/vscode/extension.ts as the canonical merged VS Code extension entry point.
- …and 14 more delivered

## Sprint sprint-322 Learnings
- Sprint sprint-322 Learnings: ## Sprint sprint-322 Learnings

## Gains
- 322-001 — R-EVALRESULT-CLEANUP — deprecated alias temizliği (321 TECH_DEBT kapat) — alias-cleanup, finalize→Sync, davranış birebir.
- 322-002 — R-ROLECAP-DISAMBIG — nervous ROLE_CAPABILITY_MAP rename (false-collision) — false-collision rename, true-unif defer.
- 322-003 — R-MAXWORKERS-CANONICAL — system-profile canonical + capacity-algo dispozisyonu — R-MAXWORKERS-CANONICAL — disposition = DISAMBIGUATE-RENAME (faithful pure-rename, zero behavior c...

## Sprint sprint-321 Learnings
- Sprint sprint-321 Learnings: ## Sprint sprint-321 Learnings

## Gains
- 321-001 — R321-EVALRESULT-DISAMBIG — sprint-controller evaluateResult disambiguation (007-corrected) — DISAMBIGUATION-rename (007-corrected, NOT collapse).
- 321-002 — R321-WAITRESULTS-KES — result-evaluator dead DI-variant temizle (008-corrected, artık unblocked) — R321-WAITRESULTS-KES — DI-variant waitForResults (result-evaluator.ts:377) CUT.
- 321-003 — R321-ALERTDEDUP-RECHECK — alert-dedup divergence dispozisyonu (010-corrected) — R321-ALERTDEDUP-RECHECK (010-corrected).
- 321-004 — R321-EXTRACTKW-DISAMBIG — 3-4× extractKeywords farklı-gövde rename — PREMISE INVALIDATED BY GROUND TRUTH — task is obsolete (superseded by sprint-318, commit eae5c80b).

## Sprint sprint-320 Learnings
- Sprint sprint-320 Learnings: ## Sprint sprint-320 Learnings

## Gains
- 320-001 — VERIFY-COLLISION-A — collision-verify dosyasına satır ekle (A) — Successfully created docs/COLLISION-VERIFY.md with required line 'Task A — collision serialize ve...
- 320-002 — VERIFY-COLLISION-B — collision-verify dosyasına satır ekle (B) — Task B line successfully added to docs/COLLISION-VERIFY.md.

## Sprint sprint-319 Learnings
- Sprint sprint-319 Learnings: ## Sprint sprint-319 Learnings
- B-WAITRESULTS-KES — waitForResults dead DI-variant temizle: NO_GO

## Gains
- 319-001 — B-MAXWORKERS-WIRE — top-level config.max_workers'ı honor et — B-MAXWORKERS-WIRE — top-level config.max_workers is now honored as an explicit override.
- 319-002 — B-MIRROR — builtin-skills .deckent mirror drift (finalize side-effect) — ROOT CAUSE (disk-verified): builtin-skills-quality.test.ts:70 asserts .deckent/skills/<id>/SKILL....
- 319-003 — B-HANDOFF-PRUNE — handoff-registry per-sprint storage temizliği — B-HANDOFF-PRUNE — added HandoffProtocol.pruneCompletedSprints(currentSprintTaskIds: Set<string>) ...
- 319-004 — B-RATELIMITER-DISAMBIG — 3× RateLimiter sahte-çakışma rename — rename-only, davranış birebir.
- 319-005 — B-CROSSSPRINT-DISAMBIG — 2× CrossSprintAnalyzer rename — B-CROSSSPRINT-DISAMBIG — pure disambiguation rename, behavior birebir korundu (zero-behavior-chan...
- 319-006 — B-NERVOUSCONFIG-V1 — NervousSystemConfig V1 disambiguation — PURE DISAMBIGUATION-RENAME, davranış birebir (zero behavior change).
- 319-007 — B-EVALRESULT-DEDUP — evaluateResult sync-duplicate collapse — B-EVALRESULT-DEDUP — NO_GO (architect-sanctioned escape: sprint-controller version is LIVE + sync...
- 319-009 — B-MCPCATALOG-SSOT — MCP tool-catalog drift tek-kaynağa — B-MCPCATALOG-SSOT — MCP tool-catalog drift collapsed to a single source.
- …and 3 more delivered

## Sprint sprint-318 Learnings
- Sprint sprint-318 Learnings: ## Sprint sprint-318 Learnings
- R4-SPRINTID — getCurrentSprintId core-canonical + active→state semantik (3 dosya → 1): GO_WITH_TECH_DEBT — R4-SPRINTID divergent-collapse — 3 getCurrentSprintId → 1 core-canonical.

SOURCE-OF-TRUTH (read + diffed, not assumed):
- R4-VITESTPARSE — parseVitestOutput disambiguation (sahte-SSOT → rename): NO_GO — rename-only, davranış birebir. Pure-rename disambiguation of 3 same-named-but-genuinely-different functions (sahte-SSOT 

## Gains
- 318-001 — R4-ISNOCOLOR — isNoColor superset SSOT (3 imza → 1) — R4-ISNOCOLOR — collapsed 3 divergent isNoColor into the architect-chosen canonical SSOT in src/cl...
- 318-004 — R4-KEYWORDS — extractKeywords core-canonical superset (3 gövde → 1, param'lı) — R4-KEYWORDS SSOT collapse complete.

## Sprint sprint-317 Learnings
- Sprint sprint-317 Learnings: ## Sprint sprint-317 Learnings

## Gains
- 317-001 — CACHE-EXP-1 — scratch note 1 — Created cache-test-scratch/note-1.md with single-line content as specified.
- 317-002 — CACHE-EXP-2 — scratch note 2 — Created cache-test-scratch/note-2.md with single line: '# Cache experiment note 2 — warm-share va...
- 317-003 — CACHE-EXP-3 — scratch note 3 — Created cache-test-scratch/note-3.md with single-line content as specified.
- 317-004 — CACHE-EXP-4 — scratch note 4 — Created cache-test-scratch/note-4.md with single line: '# Cache experiment note 4 — warm-share va...

## Sprint sprint-316 Learnings
- Sprint sprint-316 Learnings: ## Sprint sprint-316 Learnings

## Gains
- 316-001 — R5-VARIANT — assignVariant balanced assignment (untracked random fix) — ## Fix Applied
- 316-002 — R5-FAILEDTASKS — MCP status failedTasks gerçek NO_GO sayısı — ## Fix Summary
- 316-003 — R5-AGENTSTATS — agent sprint-stats mentions≠success — ## Root cause
- 316-004 — R5-NOGORATE — noGoRate birim tutarlılığı (%-vs-fraction) — pre-fix-red / post-fix-green kanıtı:

## Sprint sprint-315 Learnings
- Sprint sprint-315 Learnings: ## Sprint sprint-315 Learnings

## Gains
- 315-001 — AUDIT cli#6 — cli code-audit (5 categories, code-only) — AUDIT cli#6 (cluster-80) complete — read all 14 scope files in full (recall, recover, remember, r...
- 315-002 — AUDIT cli#7 — cli code-audit (5 categories, code-only) — AUDIT cli#7 — read-only code-audit of 14 cli files (spawn/start/status/sync/test-run/upgrade/usag...
- 315-003 — AUDIT cli#8 — cli code-audit (5 categories, code-only) — AUDIT cli#8 — read-only code-audit of 14 cli/helpers files (codex-config, config-reader, cursor-c...
- 315-004 — AUDIT cli#9 — cli code-audit (5 categories, code-only) — Read-only code-audit of cli#9 (14 helper files).
- 315-005 — AUDIT cli#10 — cli code-audit (5 categories, code-only) — AUDIT cli#10 (cluster-84) — read all 14 files FULLY, wrote 5-category code-only audit to deckent-...
- 315-006 — AUDIT cli#11 — cli code-audit (5 categories, code-only)
- 315-007 — AUDIT mcp-client#1 — mcp-client code-audit (5 categories, code-only) — AUDIT mcp-client#1 — code-only, read-only audit of src/mcp-client/{broker,config,registry,types}.ts.
- 315-008 — AUDIT dashboard#1 — dashboard code-audit (5 categories, code-only) — AUDIT dashboard#1 (cluster-87) — read-only code audit of all 18 in-scope files (4 analytics modul...
- …and 7 more delivered

## Sprint sprint-314 Learnings
- Sprint sprint-314 Learnings: ## Sprint sprint-314 Learnings

## Gains
- 314-001 — AUDIT agent#3 — agent code-audit (5 categories, code-only) — AUDIT agent#3 (read-only code audit) of 5 files — src/agent/session.ts, tools/registry.ts, tools/...
- 314-002 — AUDIT api#1 — api code-audit (5 categories, code-only) — AUDIT api#1 — read-only code audit of 8 src/api files (auth-me-endpoint, auth, autonomous-endpoin...
- 314-003 — AUDIT api#2 — api code-audit (5 categories, code-only) — AUDIT api#2 (cluster-62) — read-only code audit of 8 api modules.
- 314-004 — AUDIT api#3 — api code-audit (5 categories, code-only) — Read-only code-audit of api cluster api#3 (8 files, all read in full): src/api/process-endpoint.t...
- 314-005 — AUDIT api#4 — api code-audit (5 categories, code-only) — AUDIT api#4 — terminal cluster (8 files, code-only, read-only).
- 314-006 — AUDIT api#5 — api code-audit (5 categories, code-only) — Read-only audit of src/api/watcher.ts (28 LoC) and src/api/worker-logs.ts (254 LoC), plus their t...
- 314-007 — AUDIT mcp#1 — mcp code-audit (5 categories, code-only) — AUDIT mcp#1 — code-only structural audit of 10 mcp files (helpers/enrich.ts, helpers/format.ts, h...
- 314-008 — AUDIT mcp#2 — mcp code-audit (5 categories, code-only) — AUDIT mcp#2 — code-only, read-only audit of 10 files (resources/retro.ts, resources/tasks.ts, ser...
- …and 12 more delivered

## Sprint sprint-313 Learnings
- Sprint sprint-313 Learnings: ## Sprint sprint-313 Learnings
- AUDIT agents#4 — agents code-audit (5 categories, code-only): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=0, untrackedFiles=64
- AUDIT agents#5 — agents code-audit (5 categories, code-only): GO_WITH_TECH_DEBT — Read-only audit of src/agents/worker.ts (745 lines). Wrote deckent-last-analyze/cluster-57.md with 11 findings across 4 
- AUDIT agent#3 — agent code-audit (5 categories, code-only): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=0, untrackedFiles=63
- AUDIT api#1 — api code-audit (5 categories, code-only): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=0, untrackedFiles=63
- AUDIT api#2 — api code-audit (5 categories, code-only): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [56 
- AUDIT api#3 — api code-audit (5 categories, code-only): NO_GO — Worker timeout — process exceeded time limit and was killed; disk-verify found evidence (linesAdded=0, untrackedFiles=63
- AUDIT api#4 — api code-audit (5 categories, code-only): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [56 
- AUDIT api#5 — api code-audit (5 categories, code-only): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [56 
- AUDIT mcp#1 — mcp code-audit (5 categories, code-only): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [56 
- AUDIT mcp#2 — mcp code-audit (5 categories, code-only): NO_GO — Worker exited without writing result (exitCode=0, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=true diff [56 

## Gains
- 313-001 — AUDIT core#22 — core code-audit (5 categories, code-only) — Read-only code audit of core#22 (8 files, all read in full): system-profile.ts, task-types.ts, te...
- 313-002 — AUDIT core#23 — core code-audit (5 categories, code-only) — Read-only audit completed.
- 313-003 — AUDIT nervous#1 — nervous code-audit (5 categories, code-only) — AUDIT nervous#1 — read-only code audit of 6 files (action-handlers.ts, action-registry.ts, author...
- 313-004 — AUDIT nervous#2 — nervous code-audit (5 categories, code-only) — AUDIT nervous#2 (cluster-47) — read-only code audit of 6 detector modules: agent-routing-anomaly....
- 313-005 — AUDIT nervous#3 — nervous code-audit (5 categories, code-only) — AUDIT nervous#3 — read-only structural code-audit of 6 nervous detector files.
- 313-006 — AUDIT nervous#4 — nervous code-audit (5 categories, code-only) — AUDIT nervous#4 — read-only structural code-audit of 6 files (src/nervous/dispatcher.ts, executor...
- 313-007 — AUDIT nervous#5 — nervous code-audit (5 categories, code-only) — AUDIT nervous#5 — read-only code-audit of 5 src/nervous/ modules (panic-gate.ts, proposer.ts, rec...
- 313-008 — AUDIT monitor#1 — monitor code-audit (5 categories, code-only) — Read-only audit complete.
- …and 6 more delivered

## Sprint sprint-312 Learnings
- Sprint sprint-312 Learnings: ## Sprint sprint-312 Learnings
- AUDIT core#22 — core code-audit (5 categories, code-only): NO_GO
- AUDIT core#23 — core code-audit (5 categories, code-only): NO_GO
- AUDIT nervous#1 — nervous code-audit (5 categories, code-only): NO_GO
- AUDIT nervous#2 — nervous code-audit (5 categories, code-only): NO_GO
- AUDIT nervous#3 — nervous code-audit (5 categories, code-only): NO_GO
- AUDIT nervous#4 — nervous code-audit (5 categories, code-only): NO_GO
- AUDIT nervous#5 — nervous code-audit (5 categories, code-only): NO_GO
- AUDIT monitor#1 — monitor code-audit (5 categories, code-only): NO_GO
- AUDIT monitor#2 — monitor code-audit (5 categories, code-only): NO_GO
- AUDIT agents#1 — agents code-audit (5 categories, code-only): NO_GO

## Gains
- 312-001 — AUDIT orchestra#1 — orchestra code-audit (5 categories, code-only) — Read-only code-audit of orchestra#1 cluster (7 files, full read): adr-selector.ts, authority-enfo...
- 312-002 — AUDIT orchestra#2 — orchestra code-audit (5 categories, code-only) — Read-only code-audit of orchestra#2 cluster (7 files, every line): authority-adapter, backlog-eva...
- 312-003 — AUDIT orchestra#3 — orchestra code-audit (5 categories, code-only) — Read-only code-audit of orchestra cluster #3 (7 files, every line read): flow-reporter.ts, goal-p...
- 312-004 — AUDIT orchestra#4 — orchestra code-audit (5 categories, code-only) — Read-only code audit of orchestra#4 (autonomous v2 mission-store cluster): mission-dispatch.ts, m...
- 312-005 — AUDIT orchestra#5 — orchestra code-audit (5 categories, code-only) — Read-only code-audit of orchestra#5 cluster (7 files: mission-view.ts, sqlite-mission-store.ts, p...
- 312-006 — AUDIT orchestra#6 — orchestra code-audit (5 categories, code-only) — Read-only code-audit of orchestra#6 cluster (7 source files, all fully read): reactive/repo-watch...
- 312-007 — AUDIT orchestra#7 — orchestra code-audit (5 categories, code-only) — Read-only code audit of orchestra#7 cluster (7 files, fully read).
- 312-008 — AUDIT orchestra#8 — orchestra code-audit (5 categories, code-only) — Read-only code-audit of orchestra cluster #8 (7 files, every line read): conflict-resolver.ts, co...
- …and 33 more delivered

## Sprint sprint-311 Learnings
- Sprint sprint-311 Learnings: ## Sprint sprint-311 Learnings

## Gains
- 311-001 — ADR-001-W — "Node 18" → "Node 24+" sweep (LIVE src only) — ADR-001-W — 'Node 18' → 'Node 24+' sweep on LIVE src only.
- 311-002 — ADR-021-W — output_splash dormant-knob → gerçek gate — Fixed output_splash dormant-knob: replaced gate-less showSplash(DECKENT_VERSION) call on sprint-p...
- 311-003 — ADR-028-W — routing_engine default 'v1'→'v2' (config-tutarlılık) — Fix: sprint-planner.ts:473 `config.routing_engine ?? 'v1'` → `?? 'v2'`.
- 311-004 — ADR-010-W — cli-highlight + zod ADR-attribution (doc-only) — Doc-only task.

## Sprint sprint-310 Learnings
- Sprint sprint-310 Learnings: ## Sprint sprint-310 Learnings

## Gains
- 310-001 — ENT-3-SEC — /api/autonomous/lineage tenant-scope (anti-IDOR) — ENT-3-SEC anti-IDOR fix implemented on the lineage branch of registerAutonomousRoutes.
- 310-002 — doctor os-mock — add homedir to vi.mock('node:os') — Added `homedir: () => '/home/test'` to vi.mock('node:os') in both test files.

## Sprint sprint-308 Learnings
- Sprint sprint-308 Learnings: ## Sprint sprint-308 Learnings
- ADR-064-W — wire planDispatch into live dispatch-path: GO_WITH_TECH_DEBT — ADR-064-W wire complete.

## Changes

### src/orchestra/result-collector.ts
- `dispatchTick` closure body replaced: now 
- CORE-W3 — duplicate dedup (skill-registry + RateLimiter): GO_WITH_TECH_DEBT — CORE-W3 dedup completed:

1. skill-registry.ts DELETED — 0 production callers confirmed (grep verified, only test files 

## Gains
- 308-001 — ADR-001-W — Node 24+ full-sweep (no "Node 18" anywhere) — ADR-001-W Node 24+ sweep — ALL in-scope work complete and verified, but two goCriteria items are ...
- 308-002 — ADR-066-W — `?? 'claude'` invariant-drift re-audit (9→≤3) — ## Changes Applied
- 308-004 — ADR-028-W — V1 routing minor inconsistencies — Two surgical fixes per ADR-028-W:
- 308-005 — ADR-008-W — resolve core→orchestra import violation — ADR-008-W fix: removed the core→orchestra import violation in routing-engine.ts.
- 308-006 — CORE-W1 — directive-interrogator core→cli import (move i18n to core) — All 6/6 DoD items verified:
- 308-007 — ADR-021-W — output_splash dormant-knob → real gate — Fixed ADR-021-W: replaced direct showSplash call with showSplashIfEnabled in sprint-phases.ts.
- 308-008 — ADR-010-W — dependency ADR-backing justification — ADR-010 Amendment 2 dependency table updated:

## Sprint sprint-307 Learnings
- Sprint sprint-307 Learnings: ## Sprint sprint-307 Learnings

## Gains
- 307-001 — LIVE-W1b fix — adaptive threshold additive (preserve base-case staleness) — Root cause: readTaskScope(ctx.projectRoot, taskId) called path.join(undefined, ...) when sprint-s...
- 307-002 — ENT-3 redo — audit causal-lineage propagation + endpoint — ENT-3 causal-lineage propagation fully implemented:

## Sprint sprint-306 Learnings
- Sprint sprint-306 Learnings: ## Sprint sprint-306 Learnings
- ENT-3 — audit causal-lineage propagation + endpoint: NO_GO

## Gains
- 306-001 — PROMOTE-W1b — wire partial-promotion into EVALUATE + commit/revert — All 6 goCriteria items verified:
- 306-002 — SCOPE-W1b — brain-side SCOPE_INSUFFICIENT handler + scope-expand — All 6 goCriteria items verified:
- 306-003 — LIVE-W1b — adaptive stale-HB threshold (per-scope) — All 7/7 DoD items verified:
- 306-004 — NERV-W1b — canAutoApply predicate into more detectors — All 7/7 DoD items verified:
- 306-005 — ENT-1 — hard-RBAC enforcement wire + audit-bridge — ENT-1 hard-RBAC enforcement wire + audit-bridge — all 7 DoD items verified.
- 306-006 — F8-003 — capability least-privilege hard-flip + denial-audit — All 7 DoD items verified:
- 306-007 — F10-001/002 — policy-engine RBAC+risk-gate live wire — All 8 DoD items verified:
- 306-009 — ENT-2 — multi-tenancy strict-isolation enforcement (stores+server) — ENT-2 multi-tenancy strict-isolation enforcement complete.
- …and 6 more delivered

## Sprint sprint-305 Learnings
- Sprint sprint-305 Learnings: ## Sprint sprint-305 Learnings

## Gains
- 305-001 — SCOPE-W1 impl — SCOPE_INSUFFICIENT_CHANNEL + escalation emit — SCOPE-W1 impl complete.

## Sprint sprint-304 Learnings
- Sprint sprint-304 Learnings: ## Sprint sprint-304 Learnings

## Gains
- 304-001 — DATA-W1 impl — synthetic timeout result tokenUsage (both branches) — Added tokenUsage zero-stub to both branches (disk-evidence + no-disk-evidence) of the synthetic t...
- 304-002 — LIVE-W1 test fix — panic-gate-wire deterministic timeout — Fixed LIVE-W1 hermeticity regression.

## Sprint sprint-303 Learnings
- Sprint sprint-303 Learnings: ## Sprint sprint-303 Learnings
- GATE-W2 — toggle-independent proactive lethal-guard: GO_WITH_TECH_DEBT — All 7 DoD items verified:

1. `npx tsc --noEmit` — CLEAN (0 errors)

2. Targeted tests — 18/18 passed (tests/nervous/gat

## Gains
- 303-001 — TEL-W1 — telemetry reason = deciding-mechanism — TEL-W1 implemented:
- 303-002 — DATA-W1 — outputTokens NO_GO/timeout-branch fill + denominator — Added tokenUsage fill to the synthetic NO_GO / timeout result path in result-collector.ts (lines ...
- 303-003 — SCOPE-W2 — plan-time scope-sufficiency check — Implemented validateGoCriteriaScope(task: PlannerTask): ScopeSufficiencyResult in src/orchestra/p...
- 303-004 — SCOPE-W1 — worker scope-insufficiency escalation + diff-salvage seed — SCOPE-W1 escalation primitive implemented.
- 303-005 — ROUTE-W1 — intent-classifier refactor≠bugfix — ROUTE-W1 — intent-classifier refactor≠bugfix.
- 303-006 — PROMPT-W1 — ADR scope-gating + persona/task verify-precedence + checklist parser + conditional boilerplate — PROMPT-W1 — 4 prompt-composition fixes, all additive/backward-safe.
- 303-007 — LIVE-W1 — stale-HB SSOT + presence-aware approval-window — LIVE-W1 completed in full.
- 303-008 — STATE-W1 — richer NO_GO taxonomy (root-cause categorization) — STATE-W1 implemented cleanly.
- …and 3 more delivered

## Sprint sprint-302 Learnings
- Sprint sprint-302 Learnings: ## Sprint sprint-302 Learnings

## Gains
- 302-001 — IDLE-SPIN fix + error-handling allowlist — ## Bug Fix Report
- 302-002 — ENT-1 RBAC — operator (execute role) permit fix — ## ENT-1 RBAC Fix — Root Cause Analysis + Implementation

## Sprint sprint-300 Learnings
- Sprint sprint-300 Learnings: ## Sprint sprint-300 Learnings

## Gains
- 300-001 — Revert enterprise read-gate + tenant-filter missions-audit — All 9/9 DoD items verified:

## Sprint sprint-299 Learnings
- Sprint sprint-299 Learnings: ## Sprint sprint-299 Learnings
- Enterprise-read admin-gate (single-point authorizeTenantAdmin): GO_WITH_TECH_DEBT — Gate added at registerEnterpriseRoutes lines 239-240 — single-point authorizeTenantAdmin before all 5 GET read paths (te

## Gains
- 299-001 — Fail-closed tenant guard — /api/missions + /api/process/* (effective-tenant) — All goCriteria items verified:

## Sprint sprint-298 Learnings
- Sprint sprint-298 Learnings: ## Sprint sprint-298 Learnings

## Gains
- 298-001 — Tenant-scoped /api/missions (anti-IDOR read isolation)
- 298-002 — Mission lifecycle audit-trail bridge (tamper-evident) — Mission lifecycle audit-trail bridge wired to the existing tamper-evident hmac-chained enterprise...
- 298-003 — Scheduler per-tenant fairness cap (no-starvation) — Per-tenant fairness cap (no-starvation) added to the autonomous-v2 mission scheduler.
- 298-004 — GET /api/enterprise/missions-audit endpoint — Added GET /api/enterprise/missions-audit endpoint by:
- 298-005 — EnterprisePage — Missions Audit paneli (i18n-first, no-emoji) — All goCriteria satisfied:

## Sprint sprint-297 Learnings
- Sprint sprint-297 Learnings: ## Sprint sprint-297 Learnings

## Gains
- 297-001 — Wire registerMissionsRoute into server.ts (fix /api/missions 404) — 1) src/api/server.ts: added `import { registerMissionsRoute } from './missions-route.js';` (line ...
- 297-002 — Wire live goalDeps (real planner + accepter) into runV2Engine — Wired live Type-2 goalDeps into the autonomous-v2 cutover.

## Sprint sprint-296 Learnings
- Sprint sprint-296 Learnings: ## Sprint sprint-296 Learnings

## Gains
- 296-001 — i18n — autonomous-mission CLI rendered strings — Added 5 autonomous_mission.* keys + 2 mission.settled.* keys (deliver surface) to messages.ts.
- 296-002 — Dashboard MissionsPage route + nav wire — ## Changes Made
- 296-003 — dispatch process-kind — real process execution — Wired the kind='process' branch of buildMissionDispatch to real, inject-based process execution (...
- 296-004 — goal-loop real-planner wire + engine drive — Goal-loop real-planner wire + engine drive — Type-2 goal missions are now LIVE-drivable end-to-en...

## Sprint sprint-295 Learnings
- Sprint sprint-295 Learnings: ## Sprint sprint-295 Learnings

## Gains
- 295-001 — Real DispatchFn — item.kind → execute (Wave 1) — buildMissionDispatch(deps): DispatchFn — inject-based, test-able dispatcher that runs a WorkItem ...
- 295-002 — Type-1 list ingestion (Wave 1) — Implemented createListMission(store, spec): Mission in mission-ingest.ts.
- 295-003 — Type-2 goal-loop — author + acceptance (Wave 1) — Implemented Type-2 goal-loop in goal-mission.ts.
- 295-004 — Deliver-channel — onMissionSettled → notify (Wave 1) — Implemented makeMissionDeliver(deps) — returns onMissionSettled handler for MissionSchedulerOptions.
- 295-005 — Mission API endpoints (Wave 1) — Implemented registerMissionsRoute(url, method, res, projectRoot): boolean following the autonomou...
- 295-006 — Dashboard Missions page (Wave 2) — MissionsPage.tsx created: renders /api/missions data with render_as badges (checklist→CheckSquare...
- 295-007 — Cutover — flag-gated v2 engine wire (Wave 2) — Flag-gated autonomous-v2 cutover.
- 295-008 — CLI — deckent autonomous mission (Wave 2) — Implemented `deckent autonomous-mission` CLI command group (ADR-012 pattern) with create-list, cr...

## Sprint sprint-294 Learnings
- Sprint sprint-294 Learnings: ## Sprint sprint-294 Learnings

## Gains
- 294-001 — MissionScheduler — concurrent race-free runtime (plan Task 1-3) — Implemented runMissionScheduler per docs/superpowers/plans/2026-06-19-autonomous-v2-scheduler.md ...

## Sprint sprint-293 Learnings
- Sprint sprint-293 Learnings: ## Sprint sprint-293 Learnings

## Gains
- 293-001 — MissionStore core — types + SQLite store (plan Task 1-3) — Implemented plan Task 1+2+3 as a collision-free unit (both source files are new, no live consumer...
- 293-002 — Per-mission jsonl hot-path events (plan Task 4) — Created MissionEventLog class (mission-events.ts) and hermetic test file.
- 293-003 — MissionView projection contract (plan Task 5) — MissionView projection contract implemented per plan Task 5.
- 293-004 — backlog.json → autonomous.db migration (plan Task 6) — Implemented migrateBacklogJson per plan Task 6.

## Sprint sprint-292 Learnings
- Sprint sprint-292 Learnings: ## Sprint sprint-292 Learnings

## Gains
- 292-001 — F1-012 — Config-driven provider registry (zero-hardcode) — F1-012 config-driven provider registry (zero-hardcode).
- 292-002 — F1-PD — De-hardcode model catalog (parametric) — F1-PD — model catalog made parametric & extensible (registry-level de-hardcode).
- 292-003 — F11-016 — Ink REPL stream-segmenter stabilization + ADR — F11-016 stream-segmenter stabilization + ADR delivered.

## Sprint sprint-291 Learnings
- Sprint sprint-291 Learnings: ## Sprint sprint-291 Learnings

## Gains
- 291-001 — `deckent process` CLI komutu — MCP parity — All 5/5 goCriteria items verified:
- 291-002 — MCP-W1 defer'lı review-minor'ları kapat — Two surgical fixes: (a) Added `expect(msg).not.toContain('{pid}')` to the TR test block in messag...
- 291-003 — writer-lease release-hooks idempotency testi — Added `installWriterLeaseReleaseHooks` to the import and appended a new `describe('installWriterL...

## Sprint sprint-290 Learnings
- Sprint sprint-290 Learnings: ## Sprint sprint-290 Learnings
- F3-008 — process-mode executor (mod-geçişi 3/3): GO_WITH_TECH_DEBT — F3-008 process-mode executor — mode-transition 3/3 complete (task✅ sprint✅ process✅).

WHAT CHANGED:
1. NEW src/orchestr

## Gains
- 290-001 — CORE-UNIFORMITY slice 2 — mod-bağımsız Lifecycle kernel — CORE-UNIFORMITY slice 2 — mode-independent post-item lifecycle kernel.
- 290-003 — TOK-AUT — autonomous tokenUsage 0/0/0 fix — Added `enrichResultTokenUsage(result, undefined, deps.projectRoot)` call at execute-dispatcher.ts...
- 290-004 — ADR-NOISE — checkADRCompliance count_check'i task-spesifik yap — Added a guard in the count_check case of checkADRCompliance (auditor.ts:2195-2198) that checks wh...
- 290-005 — IDLE-SPIN — autonomous idle busy-spin teşhis + fix — Root cause: runAutonomousLoop used `outcome === 'no_trigger' ? intervalMs : 0` — only no_trigger ...
- 290-006 — DOC-35 — DECKENT.md tool-count 34→35 + process — Changed '34 tools:' → '35 tools:' and appended **process** to the tool list on line 30 of DECKENT...

## Sprint sprint-289 Learnings
- Sprint sprint-289 Learnings: ## Sprint sprint-289 Learnings

## Gains
- 289-001 — Process anti-IDOR + positive-OIDC tenant-stamp testleri — Added 2 real-HTTP, mock-free security tests to tests/api/process-endpoint.test.ts, closing the au...
- 289-002 — Actor.id audit-lineage — gerçek OIDC sub audit-chain'e düşsün — Actor.id audit-lineage fix — the real OIDC sub now survives into the capability invocation's audi...
- 289-003 — deriveRequestPrincipal defense-in-depth (verified-claims sinyali) — Defense-in-depth claimsVerified signal added to deriveRequestPrincipal (additive, fail-closed).
- 289-004 — Test-kapsama kapanışı (N3 drain integration + N2 401/sub-flag + D8 guard) — All 4 test-coverage gaps closed:
- 289-005 — Stale-comment süpürmesi (doc-drift temizliği) — All 5 stale-comment items addressed (comment-only, zero behavior change):

## Sprint sprint-288 Learnings
- Sprint sprint-288 Learnings: ## Sprint sprint-288 Learnings

## Gains
- 288-001 — Tema A — Genel Bakış & Vizyon — 4 Türkçe doküman başarıyla oluşturuldu:
- 288-002 — Tema B — Orkestrasyon Çekirdeği — 4 Türkçe doküman yazıldı.
- 288-003 — Tema C — Agent / Skill / Provider Sistemi — 4 Türkçe doküman oluşturuldu.
- 288-004 — Tema D — Hafıza, Yönetişim, Gözlem — 4 Turkish documentation files written for Tema D (Hafıza, Yönetişim, Gözlem).
- 288-005 — Tema E — Arayüzler & Operasyon — 4 Turkish documentation files written for Tema E (Arayüzler & Operasyon).

## Sprint sprint-287 Learnings
- Sprint sprint-287 Learnings: ## Sprint sprint-287 Learnings

## Gains
- 287-001 — roadmap.md — user-facing yol-haritasına dönüştür — Transformed docs/vision/roadmap.md (1118 -> 222 lines) from a deprecated internal-strategy/launch...
- 287-002 — blueprint.md + blueprint-TR.md — de-competitor + de-stale — PRIMARY GOAL ACHIEVED: All competitor-comparison references removed from both files.
- 287-003 — enterprise referansları — derinleştir (286-020 yüzeysel kaldı) — Full code-verified audit of enterprise docs completed.

## Sprint sprint-285 Learnings
- Sprint sprint-285 Learnings: ## Sprint sprint-285 Learnings
- Tur-içi tool-KUYRUĞU + per-tool sıralı onay (Ink): GO_WITH_TECH_DEBT — H1-fix: replaced the single confirmResolve slot (app.tsx:178) with a FIFO confirm QUEUE in the Ink view layer ONLY — the
- Dürüst-telemetri + PTY regresyon-guard: NO_GO

## Gains
- 285-001 — Enstrümante kök-teşhis — 3 hipotezi ayrıştır + failing-repro — Kök-teşhis raporu + 9 repro testi (5 normal + 4 it.fails-pin), src'ye DOKUNULMADI.
- 285-003 — Stream-toplama sağlamlığı — prose-konum bağımsızlığı — Fixed stream-collection robustness (H2 verdict from T-285-001):
- 285-004 — Çoklu tool-sonucu geri-beslemesi — model HEPSİNİ görür — Fixed `turnInput` in chat-session.ts to collect ALL consecutive trailing tool messages instead of...

## Sprint sprint-284 Learnings
- Sprint sprint-284 Learnings: ## Sprint sprint-284 Learnings
- Gecikme-ölçüm smoke'u — "anlık" iddiasının kanıt-zinciri: NO_GO — Created scripts/rt-latency-verify.mjs following test-e2e-surfaces.mjs pattern. Boots the real serve binary with DECKENT_

## Gains
- 284-001 — Canlı-olay köprüsü — hb + event-stream → /api/events typed-push — DASH-RT-1 backbone delivered.
- 284-002 — Dashboard client anlık-merge — snapshot üstüne event-akışı — DASH-RT-1 client-side delivered.
- 284-003 — Worker-log SSE endpoint — backend-agnostik file-tail — DASH-RT-2 backend delivered + run-proven.
- 284-004 — WorkersPage canlı log-paneli UI — DASH-RT-2 UI delivered.
- 284-005 — DASH-FIX-1 — terminal-sessions 401 + directives 404 — DASH-FIX-1 complete.

## Sprint sprint-283 Learnings
- Sprint sprint-283 Learnings: ## Sprint sprint-283 Learnings

## Gains
- 283-001 — Terminal-bar overlap — z-index/layout fix (eski 282-007) — Fix: added `pb-10 relative z-50` to Layout.tsx aside element.
- 283-002 — DebtPage route + /settings yüzeyi (eski 282-009) — All goCriteria met: (1) /debt route added to App.tsx with DebtPage import — route-render #1.
- 283-003 — Dashboard sayfa-içi i18n-temizliği (eski 282-012) — Completed i18n cleanup for Dashboard pages (EvolutionPage, NervousPage, MemoryExplorerPage).

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
