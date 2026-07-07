# Deckent Terminal (REPL) — Correctness Code-Review · FİNAL RAPOR

> **Tarih:** 2026-07-08 · **HEAD:** `5abd2bd5` · **Yöntem:** read-only çok-ajanlı code-review — 10 subsystem-dilimi + 8 kesit-lens, iki-aşamalı adversarial doğrulama (satır-ref HEAD-denetimi + P0/P1 refute + severity kalibrasyonu), ölçülmüş coverage + live-PTY probe. Analiz ajanları sonnet-5; okuma read-only (`Explore`/`code-reviewer` — yazma-aracı yok). `tests/` kaynak-okuması hariç (coverage'da sayıldı).
> **Kapsam (kanıtlı):** 73 dosya / 14.508 satır — `src/cli/repl/*` (27) + `src/cli/commands/chat-*` + agentic (24) + `src/agent/*` (21) + `src/cli/entry.ts`.
> **İki-run birleşimi:** API mid-stream flakiness nedeniyle review iki geçişte tamamlandı; Run-A slash-agentic+render-ux dilimlerini, Run-B probe+i18n-ölçüm+async-race+tool-loop lenslerini taşıdı. Bu rapor ikisinin **deterministik union'ı** (dedup file:line~±6) — otoriter bulgu tabloları aşağıda, iki Fable-anlatısı §Ek'te.

## Özet — birleşik bulgu dağılımı

| Severity | Adet | Ne demek |
|---|---|---|
| **P0** | 2 | default yolda crash/data-loss/security |
| **P1** | 30 | erişilebilir correctness bug |
| **P2** | 53 | latent / edge / non-default config |
| **P3** | 33 | nit / stil / DRY |
| **Toplam** | **118** | 10 dilim + 8 lens, 18 kaynak |

**Tek kesin P0:** `chat-session.ts:272` — persistent-claude child'ında `error` listener yok → `claude` PATH'te değilse çıplak `deckent` ilk mesajda ENOENT ile TÜM process'i çökertiyor (Node uncaughtException, ampirik `node -e` ile doğrulandı). Kardeş `chat.ts:595` doğru pattern'i uyguluyor → tekil, tek-satırlık fix.

**En yüksek-frekans P1 teması:** slash **menü↔motor drift'i** — default native-agent motoru (`app.tsx`) `resolveSlash`'i hiç çağırmıyor; `resolveSlash` yalnız legacy `chat-native.ts:843`'te. ~23 slash komutu (`/help`, `/kill`, `/approve`, `/config`…) menüde görünüyor ama motorda sessizce düz-sohbet metnine düşüyor. 2026-07-07 native-flip (376-003) regresyonu.

**Kritik meta-bulgu:** bu 118 bulgunun **hiçbiri mevcut testlerce yakalanmıyor** — REPL test-subset yeşil (49 test) ama defect'lerin hiçbirini exercise etmiyor. "Testler yeşil" burada güvenlik vermiyor.

> ⚠️ **TAZELİK UYARISI:** HEAD `5abd2bd5`; live-probe `app.tsx`/`chat-loop`'ta satır-drift buldu (dosyalar aktif düzenleniyor). Memory'de "REPL kesilme kök-neden FIX SHIPPED 2026-07-07 (canlı /model-switch + dürüst empty/truncated sinyaller + native_provider pin)" kaydı var → **slash-drift ve model-switch/usage kümesindeki bulgular kısmen giderilmiş OLABİLİR**; aksiyondan önce güncel HEAD'e cross-check gerek. P0-crash · ApprovalCard çift-tüketim · emoji-cursor · silent-failure ailesi bu dosyalardan bağımsız.

---

## Otoriter Bulgu Listesi (118, birleşik + kalibre)

### P0 — 2 bulgu

**[P0] defaultPersistentSpawn's child has no 'error' listener — ENOENT on the default `claude` REPL crashes the process**  
- `src/cli/commands/chat-session.ts:272` · dimension: `` · kaynak: R05-chat-loop

**[P0] InputBar has no mutual exclusion with ApprovalCard — any keystroke while an approval is pending is silently double-consumed as both text input and an approve/deny/approve-all decision**  
- `src/cli/repl/app.tsx:1121` · dimension: `` · kaynak: R01-tui-render
- **Senaryo:** A worker submits a high/critical-risk approval request (e.g. `rm -rf ./build`) while the user is mid-conversation; ApprovalCard renders. Because InputBar's `active` only checks `confirm === null` (still true) and ApprovalCard's useInput only checks its own `head !== null` (also true), BOTH useInput handlers are simultaneously active for the same Ink stdin event. The user continues typing an ordinary chat message containing the letter 'y' (e.g. "yes, let's continue") — that single keystroke is captured by ApprovalCard's handler as 'approve' (mapApprovalKey('y') === 'approve', approval-card.tsx:137), silently approving the destructive worker action, while the same character is also inserted into the InputBar buffer via editInput. No deliberate approval interaction was intended.

### P1 — 30 bulgu

**[P1] Context-budget compaction can emit a window whose sole message is an orphaned tool-result, which providers reject with 400**  
- `src/agent/context-budget.ts:69` · dimension: `` · kaynak: lens:resource-leak

**[P1] primaryResource() reads args['command'], never args['cmd'] — deckent_bash's schema-declared arg key — so bash calls always resolve resource=''**  
- `src/agent/loop.ts:48` · dimension: `` · kaynak: R09-agent-transport
- **Senaryo:** Native agent enabled, model calls deckent_bash with schema-compliant {cmd:'...'}. Every deny rule targeting deckent_bash command patterns silently never fires (resource is always ''). Worse: this is on the DEFAULT confirm flow — deckent_bash's default tier is 'confirm' (native-tool-registry.ts execToolTier; not in permission-policy.ts's alwaysFloor), and default approvalMode is 'suggest' (run.tsx:251), so the very first shell command prompts the user once/session/always/deny. If the user picks the natural 'always' choice to avoid repeated prompts, loop.ts:145 persists {tool:'deckent_bash', pattern:'**'} to disk — silently granting UNLIMITED unconfirmed shell execution for every future command, forever (until manually revoked), rather than just the one reviewed command.
- **Kanıt:** Confirmed verbatim at loop.ts:48: `const v = args['path'] ?? args['file_path'] ?? args['command'] ?? args['url'] ?? args['pattern'] ?? '';`. Confirmed native-tool-registry.ts:99 declares only `cmd` (required) for deckent_bash's schema, no `command` key. Confirmed chat-tool-exec.ts:132 internally reads `args['cmd'] ?? args['command']`, but that's downstream of the already-broken permission gate. Confirmed permission-types.ts's matchRule (globToRegExp) never matches a non-empty pattern like `*rm -rf*` against resource=''. Confirmed permission-store.ts:114-122 `grant()` persists 'always' rules to `.deckent/settings.local.json` (permanent, across restarts) with pattern `resource \|\| '**'`.

**[P1] primaryResource() reads args['command'] but deckent_bash's schema key is 'cmd' — permission resource is always empty for bash calls**  
- `src/agent/loop.ts:62` · dimension: `security` · kaynak: R09-agent-transport
- **Senaryo:** Native agent enabled, default approval mode ('suggest', permission-policy.ts:27). Model calls deckent_bash with {cmd:'rm -rf /important-dir'}. The permission-request the user sees (native-agent-bridge.ts:155) reads only 'Run tool: deckent_bash' — no command text at all — because resource is always '' for this tool. The user approves blind. If they pick 'always' once, loop.ts:201 persists pattern '**' for deckent_bash, silently auto-approving every future shell command for the rest of the session. A deny rule scoped to a command pattern also never fires for the same reason.
- **Kanıt:** loop.ts:61-64 `function primaryResource(...) { const v = args['path'] ?? args['file_path'] ?? args['command'] ?? args['url'] ?? args['pattern'] ?? ''; ... }` never checks 'cmd'. native-tool-registry.ts:99 declares deckent_bash's schema as `{properties:{cmd:{type:'string'}}, required:['cmd']}` — no 'command' key. chat-tool-exec.ts:132 reads `args['cmd'] ?? args['command']` internally, but that happens after the permission gate already computed resource=''. decide() step1 (permission.ts:36) glob-matches deny patterns against resource — a pattern like '*rm -rf*' compiled by globToRegExp never matches '' so a command-scoped deny rule silently never fires. loop.ts:201 `deps.ruleStore.grant({tool: call.name, pattern: resource \|\| '**'}, ...)` — since resource is always '' for bash, any 'always' grant on one bash call persists pattern '**', auto-approving ALL future shell commands. Additionally, native-agent-bridge.ts:155 renders the ask-prompt as `${ev.tool}${ev.resource ? ' ('+ev.resource+')' : ''}` — with resource='' this means the user-facing confirm dialog for EVERY deckent_bash call (default 'suggest' mode, SAFE_DEFAULT_POLICY has no tierMap override so deckent_bash stays 'confirm') shows only 'Run tool: deckent_bash' with the actual command completely invisible to the approver.

**[P1] Parallel tool_use round-trip splits sibling tool_results into separate consecutive user messages instead of one merged user message**  
- `src/agent/provider-tooluse/anthropic.ts:19` · dimension: `tool-loop-integrity` · kaynak: lens:tool-loop-integrity
- **Senaryo:** Default REPL + default 'claude' provider; user asks to read two files in one message. Claude proposes two parallel tool_use blocks in one assistant turn; loop.ts appends two separate role:'tool' Transcript entries; the very next same-turn provider call (loop.ts:95-109, no new user input needed) serializes them as two consecutive {role:'user'} messages instead of one — the documented-wrong shape. This is a real, reachable defect, but I could not verify the finding's speculative claim of an outright 400/hard-abort: Anthropic's own docs frame this specific shape as a soft behavioral degradation ('reduces parallel tool use' / 'teaches Claude to avoid parallel calls'), not as a validation error — the hard-error text they document ('tool_use ids were found without tool_result blocks immediately after') applies to a different malformation (missing/misplaced results, not extra message splitting). Severity kept at P1 (reachable, real correctness/formatting bug that degrades documented behavior) rather than escalated on the unconfirmed crash claim.
- **Kanıt:** Confirmed at HEAD: anthropic.ts:19-22 toAnthropicMessage maps role:'tool' -> {role:'user', content:[tool_result]} 1:1 with no coalescing; anthropic.ts:46 `messages: req.messages.map(toAnthropicMessage)` is a bare .map with no grouping of adjacent 'tool' entries. transcript.ts:23-25 appendToolResult pushes one role:'tool' message per call; loop.ts's `for (const call of calls)` (loop.ts:165) calls appendToolResult once per iteration (loop.ts:209) with nothing else interleaved between iterations, so N parallel tool_use blocks produce N separate role:'tool' Transcript entries that anthropic.ts turns into N separate consecutive user-role messages. Fetched the live Anthropic docs (platform.claude.com/docs/.../parallel-tool-use, Troubleshooting section) and confirmed verbatim: 'Wrong: a separate user message for each tool result' / 'Correct: all tool results together in a single user message' -- this exact shape is documented as the #1 cause of Claude 'teaching itself' to avoid parallel tool calls. Default path confirmed: run.tsx:370-372 native-agent is default-ON, default provider is claude/anthropic (no disable_parallel_tool_use is set anywhere in src/, confirmed via grep), so parallel tool_use is enabled by default and reachable on a plain two-file-read prompt.

**[P1] /approve <mode> never reaches the native-agent session -- AgentSession.setApprovalMode is dead code in production, so the 'onay modu' confirmation is false**  
- `src/agent/session.ts:489` · dimension: `silent-failure` · kaynak: lens:slash-menu-vs-engine
- **Senaryo:** Default project, native-agent engine active (the default). User types `/approve full-auto`, sees 'onay modu: full-auto' confirming the switch. Next turn, the LLM calls any confirm-tier tool (e.g. deckent_bash) -- the native engine still emits a 'permission-request' event and shows the identical y/a/n confirm card as under 'suggest' mode, because AgentSession's internal `mode` was never updated. The advertised full-auto/auto-edit behavior never activates on the native engine.
- **Kanıt:** Confirmed. run.tsx:269 `let approvalMode: ... = 'suggest'` is a LOCAL variable read only by askConfirm (run.tsx:270-278), which feeds the LEGACY `dispatcher`/execDispatcher/cliDispatcher path (run.tsx:288-292, wired into runChatNativeLoop via app.tsx's `else` branch only). The native engine's confirm callback is wired separately at run.tsx:456: `confirm: (summary, toolName) => (confirmTrigger ? confirmTrigger(summary, toolName) : Promise.resolve('n'))` -- this reads confirmTrigger directly and never touches `approvalMode`. native-agent-bridge.ts:154-157 calls `deps.confirm(...)` on every 'permission-request' event and forwards the raw y/a/n answer via `session.respondPermission`, with no mode short-circuit anywhere in that file. session.ts:61 initializes `let mode: ApprovalMode = deps.policy.defaultMode` (permission-policy.ts:27 `defaultMode: 'suggest'`) and session.ts:113-115 defines `setApprovalMode(next) { mode = next; }` as a public method -- but `grep -rn '\.setApprovalMode(' src/` returns ZERO call sites in all of src/. agent/permission.ts:44 `decide()` step 5 (`if (ctx.mode === 'full-auto') return 'allow'`) is the ONLY code path that would let full-auto skip confirmation, and it reads `ctx.mode` from `deps.getMode()` (session.ts:77, loop.ts:181) which is permanently pinned to 'suggest' since setApprovalMode is never invoked. Verified this dead-code gap is NOT part of the in-progress uncommitted diff (git diff on session.ts/loop.ts/native-agent-bridge.ts touches unrelated /model-switch and truncation-notice code, confirmed by direct diff read) -- it is a pre-existing, stable bug. app.tsx:1029 `onApprovalMode(mode); setApproval(mode); pushTurn('seg', \`${labels.approvalSet}: ${mode}\`)` unconditionally shows a success confirmation regardless. Recalibrated from the candidate's P2 to P1: this is a reachable correctness bug on the pure default path (no config flag required, /approve is not gated behind replSurfaceEnabled) that produces a materially false state-change confirmation and silently no-ops the entire documented full-auto/auto-edit feature for the native engine -- squarely 'real input triggers wrong behavior' under the rubric, not merely a latent edge case.

**[P1] Overly broad natural-language intent regexes silently hijack ordinary chat turns as tool calls**  
- `src/cli/commands/chat-agentic-dispatch.ts:63` · dimension: `silent-failure` · kaynak: R06-chat-slash-agentic
- **Senaryo:** Any Turkish-speaking user on the default Ink REPL or the chat-bridge connector types an ordinary sentence containing 'durum...' (e.g. 'Bu durumda ne yapmalıyım?') or standalone 'ara' (e.g. 'Şimdi kısa bir ara verelim'); the turn is silently reclassified as deckent_status/deckent_memory_query, dispatched with no confirmation, and the user's actual message is never sent to the provider — with no error or notice that a substitution occurred.
- **Kanıt:** Confirmed STATUS_RE at line 63 and RECALL_RE at line 65 exactly as cited. node repro: STATUS_RE.test("bu durumda ne yapmaliyim?") -> true; RECALL_RE.test("simdi kisa bir ara verelim") -> true. Confirmed classifyAgenticIntent (line 106) fires the first matching rule with no length/anchor guard. Confirmed chat-native.ts:577-580 agenticToolRequiresConfirm looks up COMMAND_REGISTRY by mcpNames and returns false (no confirm) for 'Oku' tier; command-registry.ts:94 'status' and :152 'recall' are both tier 'Oku' with mcpNames ['deckent_status']/['deckent_memory_query']. Confirmed chat-native.ts:943-966 dispatches directly and `continue`s the outer loop when agenticDispatch is set, silently dropping the user's real turn. Confirmed default-on: src/cli/repl/app.tsx:881 `agenticDispatch: true` and src/connectors/chat-bridge.ts:410 `agenticDispatch: true` (both real, unconditional, at the shipped default entry points).

**[P1] chat-enterprise-bridge.ts's defaultSpawnFn has no timeout (and no `reject` at all) — a hung `/audit` freezes the whole REPL turn forever**  
- `src/cli/commands/chat-enterprise-bridge.ts:56` · dimension: `correctness` · kaynak: R07-chat-tool-bridges
- **Senaryo:** A user types bare `/audit` (no subaction) at the REPL prompt — confirmed to be the natural/common invocation, since resolveAuditSlash (chat-slash-registry.ts:447-449) explicitly returns `{action:'none'}` when the first arg is empty, which routes it OUT of the tool-bridge path and INTO chat-native.ts's raw `/`-prefix fallback (lines 912-928), which calls dispatchEnterpriseSlash → this file's defaultSpawnFn (lines 56-70). That Promise executor only destructures `resolve` (no `reject`, no setTimeout, no child.kill) and only settles on the child's `close` event. If the underlying provider call hangs, this promise never settles, and since the REPL's `for await (const rawLine of input)` loop (chat-native.ts:636) awaits this call before reading the next line, the session becomes unresponsive with no built-in recovery.
- **Kanıt:** Confirmed exact: chat-enterprise-bridge.ts:56-70, `return new Promise<string>((resolve) => {...})` at line 57 — no reject parameter, no timer, only `child.once('close', ...)` at line 68. Confirmed reachability is even stronger than originally described: chat-slash-registry.ts:447-449 `resolveAuditSlash` returns `{action:'none'}` for a bare `/audit` (the most natural way to type it), which chat-native.ts:905-911's own comment says falls through to the enterprise bridge ('bare /audit ... intercept here'). Confirmed chat-native.ts:636 `for await (const rawLine of input)` — the outer loop that would stall. Confirmed contrast: chat-tool-bridge.ts:81,106-135 has SPAWN_TIMEOUT_MS=30000 + SIGKILL; this sibling has neither.

**[P1] defaultSubscriptionSpawn also lacks an 'error' handler, defeating gracefulErrors for the documented ENOENT case**  
- `src/cli/commands/chat-native.ts:1156` · dimension: `` · kaynak: R05-chat-loop

**[P1] `/clear` on the default persistent-session REPL only wipes the JS-side transcript; the warm child's actual conversational context is untouched, so the command silently no-ops**  
- `src/cli/commands/chat-native.ts:646` · dimension: `` · kaynak: R05-chat-loop

**[P1] REPL `/nervous accept\|reject` never notifies the nervous executor and always logs a false 'success' outcome**  
- `src/cli/commands/chat-nervous-bridge.ts:190` · dimension: `silent-failure` · kaynak: R07-chat-tool-bridges
- **Senaryo:** User types `/nervous accept <id>` in the REPL with a live nervous executor process running. handleNervousSlash (chat-nervous-bridge.ts:176-197) splices the item from nervous-pending.json and calls appendNervousHistory (line 190) which hardcodes outcome:'success' for 'accepted' (line 71) — it never calls NervousIpcQueue.writeApproval nor checks isNervousPollerAlive, so the executor never learns of the decision and the underlying action never runs. User sees a green confirmation for an action that silently did nothing.
- **Kanıt:** Confirmed exact code at chat-nervous-bridge.ts:176-197 (splice+write, no IPC dispatch, no isNervousPollerAlive/NervousIpcQueue import anywhere in file) and :57-75 appendNervousHistory hardcoding outcome:'success'. Confirmed sibling nervous.ts:307-341/345-379 (handleAccept/handleReject) does route through isNervousPollerAlive + NervousIpcQueue.writeApproval and explicitly avoids the false-success history write in the fallback branch (comment cites W0-TRUTH #491), exactly as claimed — chat-nervous-bridge.ts was not updated to match. Reachability confirmed: chat-native.ts:656-677 intercepts any `/nervous` line unconditionally in the production REPL loop and calls handleNervousSlash directly.

**[P1] CLI subprocess exit code is never inspected — a failed subscription call is reported as a successful empty reply**  
- `src/cli/commands/chat-provider-parity.ts:77` · dimension: `silent-failure` · kaynak: R08-chat-render-ux
- **Senaryo:** Real: expired auth / rate-limit / crash on the wrapped CLI exits non-zero writing only to stderr; stdout (the only source read into `text`/`collected`) stays empty, and the REPL shows an empty successful turn with no error surfaced.
- **Kanıt:** Confirmed at HEAD: `send()` (chat-provider-parity.ts:72-79) does `await wait;` at line 77 then unconditionally `return { text, stopReason: 'end_turn' };` — `wait` resolves to `{exitCode}` (per defaultSubscriptionSpawn, chat-native.ts:1151-1169) but the value is never read or branched on anywhere. Same pattern in `stream()` (lines 80-92, `await wait;` at line 89) before the unconditional `done` yield.
- **Guard/neden-gerçek:** Only partial: the non-streaming `/api/chat` JSON path (chat-handler.ts:140-144) surfaces an "empty_reply" error when adapter.send() returns empty text, which softens (but doesn't fully fix — no exitCode/stderr surfaced, so cause is always misreported as generic "empty reply") the exact symptom for that one call site. The `/api/chat/stream` SSE path (chat-stream.ts) and the native REPL loop (chat-native.ts runChatNativeLoop) have no equivalent guard at all and silently report success with empty output.

**[P1] subscriptionEnv() strips API keys for claude and gemini but omits OPENAI_API_KEY/DECKENT_OPENAI_API_KEY for codex**  
- `src/cli/commands/chat-provider-parity.ts:51` · dimension: `correctness` · kaynak: R08-chat-render-ux
- **Senaryo:** Real: a developer with OPENAI_API_KEY set in their shell (common for anyone using OpenAI tooling) selects the codex REPL provider; the child process still sees OPENAI_API_KEY, which — per the project's own probe logic — forces API-key billing instead of the intended subscription/OAuth path.
- **Kanıt:** Confirmed subscriptionEnv() (chat-provider-parity.ts:51-63) deletes ANTHROPIC_API_KEY/DECKENT_CLAUDE_API_KEY and GEMINI_API_KEY/GOOGLE_API_KEY/DECKENT_GOOGLE_API_KEY but has zero references to any OPENAI/codex key, while being called uniformly for all 3 CLI providers via buildCliSpawnAdapter (verified no `codex` string appears in subscriptionEnv at all). Cross-checked src/core/provider-auth-probe.ts:257-260, which explicitly treats `OPENAI_API_KEY`/`DECKENT_OPENAI_API_KEY` presence as forcing 'api auth' for codex — confirming the codebase's own model of codex auth precedence, making the omission an inconsistency with the parallel claude/gemini stripping (whose own comment at lines 55-58 states the intent is to strip 'above' matching all 3 branches). Grepped the whole src/cli tree for any other codex-key scrub point in this call path — none found.

**[P1] End-of-turn reconciliation silently swaps in longer resultText/assistantText into `collected` with no catch-up yield to the screen**  
- `src/cli/commands/chat-session.ts:522` · dimension: `streaming` · kaynak: lens:streaming
- **Senaryo:** Persistent-claude streaming session where a turn's content_block_delta events under-report vs. the final assistant/result event text (a case the code's own comment says can happen). The terminal shows only the shorter delta-streamed text, but transcript (sent to model next turn) and chat-memory (visible via /resume) silently contain the longer reconciled text — a reply-content mismatch between what the user saw and what's recorded as having been said.
- **Kanıt:** chat-session.ts:495-524 read at HEAD confirms: `collected` accumulates only from `content_block_delta` (line 503) which IS what gets yielded to output (line 504: `yield { text: parsed.text }`). At turn end (511-526), the only catch-up yield is gated on `collected.length === 0` (515-517) — the partial-but-nonzero case has no equivalent. Lines 522-524 unconditionally replace `collected` with `resultText`/`assistantText` if longer, with the comment at 358-361 in parseStreamJsonLine explicitly acknowledging 'Delta streams can be partial' as the reason reconciliation exists. Traced forward: chat-native.ts:548-554 `runProviderTurn` only overrides `finalResponse.text` when NOT a string (line 551), so the reconciled string passes through unchanged; chat-native.ts:1058-1063 pushes this `assistantText` to transcript and `memStore.appendChatTurn`, and (1062) only calls `trackedOutput(assistantText)` `if (!provider.stream)` — i.e. for the default streaming persistent-claude provider, no additional screen output happens for the reconciled diff.

**[P1] /help — the flagship onboarding command — never renders the catalog under the default native-agent engine**  
- `src/cli/commands/chat-slash-registry.ts:111` · dimension: `slash-menu-vs-engine` · kaynak: lens:slash-menu-vs-engine
- **Senaryo:** A first-time user with a provider credential configured (native engine active by default) types `/help`. app.tsx has no special case for it (grep-confirmed zero '/help' references in app.tsx), so it is queued and sent to `nativeEngine` → `session.send('/help')`, which the model answers conversationally instead of showing the command catalog — the most basic onboarding path silently does nothing useful.
- **Kanıt:** Confirmed at HEAD: chat-slash-registry.ts:109-113 shows `/help` (line 111 `name: '/help',`) has no `agenticTool` field. Its only handler is chat-native.ts:843-864 (`slashAction.action === 'help'` → `renderHelp`/`buildHelpCatalogEntries`), itself only reachable from inside `runChatNativeLoop` (chat-native.ts:594), which app.tsx only invokes from the `else` branch at app.tsx:864-900 — the branch native-agent bypasses (app.tsx:850).

**[P1] Flat 30s SPAWN_TIMEOUT_MS kills `deckent_audit`/`deckent_plan` on their own documented normal duration**  
- `src/cli/commands/chat-tool-bridge.ts:81` · dimension: `correctness` · kaynak: R07-chat-tool-bridges
- **Senaryo:** The strongest trigger is `deckent_audit`'s default 'gate' action: cliArgsFor (lines 173-178) defaults action to 'gate' when omitted, producing ['audit'] / ['audit', sprintId], which is NOT in isDetachedCommandClass, so it runs through defaultSpawnFn's 30s-kill path. The file's own comment (lines 74-75) documents this exact action as a 'provider-backed self-audit gate, 30-60s+' — i.e., the code's own author states normal duration meets/exceeds the 30s kill timeout, so a large fraction of ordinary `/audit` (recognized-subaction) or `deckent_audit` tool invocations will be SIGKILLed and return `[mcp-error] …: timed out after 30s` under completely normal conditions, not just a slow edge case. `deckent_plan` (line 61) is a secondary, workload-dependent instance of the same gap: it also bypasses isDetachedCommandClass and is confirmed reachable via the default `/plan` slash (chat-slash-registry.ts:127-130, agenticTool: deckent_plan) → dispatcher.dispatch → chat-tool-bridge.ts, so any AI-planning call that legitimately runs past 30s (plausible for reasoning-heavy models/large directives) is also killed prematurely, though whether it exceeds 30s is more workload-dependent than the audit-gate case.
- **Kanıt:** Confirmed exact: line 81 `const SPAWN_TIMEOUT_MS = 30_000;`; line 61 `deckent_plan: ['plan'],`; lines 173-178 deckent_audit action defaults to 'gate'; timeout-kill logic at lines 118-123 (reject after SPAWN_TIMEOUT_MS + SIGKILL). Confirmed reachability: chat-slash-registry.ts:127-130 maps `/plan` → agenticTool deckent_plan; chat-native.ts:885-897 dispatches agentic actions through `dispatcher.dispatch`, which in entry.ts:705 is `createCliToolDispatcher()` (this file). NOTE — two evidence corrections from the original candidate: (1) the '30-60s+' comment is actually at lines 74-75, not 73-74 as cited (off-by-one); (2) 'ai_planner_timeout defaults to 60000ms (config-types.ts:708-709)' mischaracterizes a doc-comment on an optional field — the operative default when unset is actually `BRAIN_PLAN_TIMEOUT_MS` = 900_000ms (confirmed via sprint-planner.ts:330-333 falling back to `undefined` → planner.ts:463 `timeout ?? BRAIN_PLAN_TIMEOUT_MS`). This detail does not change the conclusion (both 60000 and 900000 exceed the 30000ms kill) but the finding should lead with the `deckent_audit` gate case (self-documented 30-60s+, so this is squarely a default-path P1) rather than `deckent_plan` (whose actual severity is closer to P2, workload-dependent).

**[P1] Hardcoded Turkish user-facing strings in the write/edit/bash confirm prompt and tool error paths, bypassing getMessage()/i18n entirely**  
- `src/cli/commands/chat-tool-exec.ts:43` · dimension: `i18n` · kaynak: R07-chat-tool-bridges
- **Senaryo:** Any REPL user (including an English-only user) who triggers deckent_write_file/deckent_edit_file/deckent_bash sees a confirm-prompt built by summarize() (lines 43-54) returning raw Turkish text ('Dosya yaz: …', 'Dosya düzenle: …', 'Komut çalıştır: …') regardless of configured `lang`. Error strings are likewise hardcoded Turkish (lines 109, 115, 122, 127, 133).
- **Kanıt:** Confirmed: summarize() at lines 43-54 returns literal Turkish strings for all three side-effecting tool names; grep for 'lang'/'getMessage'/'messages.js' in the file returns zero matches, confirming no i18n plumbing exists at all. Confirmed CLAUDE.md:41-44 explicitly mandates 'i18n-FIRST — kullanıcıya görünen string'i ASLA hardcode etme … Hardcode TR/EN = teknik borç, kabul edilmez.' Confirmed production wiring exactly as claimed: entry.ts:706 `const execDispatcher = createToolExecDispatcher({...})` and run.tsx:274 `const execDispatcher = createToolExecDispatcher({ cwd: () => process.cwd(), confirm: askConfirm });`, plus agentic-worker-runner.ts:328 and http-agentic-worker.ts:227 both call `createToolExecDispatcher(opts)`.

**[P1] deckent_bash's default spawn has no timeout/cancellation; a hanging shell command freezes the current turn indefinitely**  
- `src/cli/commands/chat-tool-exec.ts:291` · dimension: `` · kaynak: lens:resource-leak
- **Guard/neden-gerçek:** None found. No timeout/AbortController exists in defaultBashRun (chat-tool-exec.ts:56-66) or ToolExecOptions (28-40); no caller overrides bashRun with a timeout (entry.ts:706-709, native-tool-registry.ts:323, agentic-worker-runner.ts:328, http-agentic-worker.ts:227); the tool-dispatch await in chat-native.ts:1051 has no per-call timeout/race; busy-controls.ts's /interrupt-Esc/Ctrl-C wiring is explicitly a documented unfinished scaffold, not a real cancel path; the only real interrupt (entry.ts:797-807 SIGINT->onSignal) hard-exits the whole process instead of cancelling the one tool call, and doesn't kill the orphaned bash child. The original finding's cited line (chat-tool-exec.ts:291) does not exist (file is 145 lines) — evidence/line must be corrected to lines 56-66/131-135 of chat-tool-exec.ts plus chat-native.ts:1051 and entry.ts:706-709/797-807, but the substantive defect is real.

**[P1] Interactive `chat --native`/`--local` REPL omits `gracefulErrors: true`; a mid-session provider rejection propagates and kills the whole session**  
- `src/cli/commands/chat.ts:523` · dimension: `` · kaynak: R05-chat-loop

**[P1] Default native-agent engine bypasses chat-native.ts's resolveSlash dispatcher — ~24 of 37 SLASH_CATALOG agenticTool commands silently degrade to raw chat text**  
- `src/cli/repl/app.tsx:850` · dimension: `slash-menu-vs-engine` · kaynak: lens:slash-menu-vs-engine
- **Senaryo:** A user with ANTHROPIC_API_KEY set (the tool's own documented primary run mode) types `/plan`; handleSubmit (app.tsx:910-1024) has no special case for it, so it falls through to `queue.current!.enqueue(trimmed)` (app.tsx:1024) and is handed verbatim to `nativeEngine('/plan', ...)`, which sends it to the LLM as chat with no matching tool to call — the model replies in prose and the command silently never runs.
- **Kanıt:** Confirmed at HEAD (5abd2bd5): app.tsx:850 `if (nativeEngine) {` / 864 `} else {` gate whether runChatNativeLoop (and its chat-native.ts:843 `resolveSlash(line, buildSlashRegistry())` call) ever runs. run.tsx:55-62 `isNativeAgentSelected` returns true unless `--legacy-loop` or `terminal.native_agent:false`; run.tsx:357-399 builds `nativeEngine` whenever `resolveNativeProvider` succeeds (provider-detect.ts:24-32 confirms ANTHROPIC_API_KEY/OPENAI_API_KEY/ollama_host precedence — any one credential suffices). native-agent-bridge.ts:128,131 `runTurn` calls `session.send(input)` with zero slash handling; session.ts's `send()` (actual location lines 80-84, NOT 90-95 as originally cited — corrected below) just calls `runAgentTurn(loopDeps, transcript, userInput)`, confirmed no '/'-prefix handling anywhere in src/agent/. native-tool-registry.ts:319-334 confirms the native tool registry only ever wires deckent_read_file/write_file/edit_file/bash + deckent_status/history/retro/doctor/models/review (plus an opt-in deckent_skill_dispatch and MCP/tool_surface tools that run.tsx never enables) — none of the other 24 agenticTool-bearing SLASH_CATALOG entries (grep-confirmed: 24 `agenticTool:` occurrences in a 37-entry catalog, not 32) have a matching native tool name, so even a cooperative LLM cannot invoke them.

**[P1] Menu-vs-engine drift: ~27 of the 37 slash commands in SLASH_CATALOG are never dispatched on the default native REPL engine and are silently sent to the model as plain chat text**  
- `src/cli/repl/app.tsx:1033` · dimension: `correctness/silent-failure` · kaynak: lens:silent-failure
- **Senaryo:** User runs bare `deckent` (native engine default). They select or type `/kill` (shown in the menu with description implying a real confirm-gated stop action). It is enqueued as literal chat text, sent to the LLM, which has no deckent_kill tool to call — nothing is killed, no error surfaces, user only sees a conversational reply.
- **Kanıt:** app.tsx:910-1037, 853-866; src/cli/commands/chat-slash-registry.ts:109-329; src/cli/commands/chat-native.ts:843; src/cli/repl/native-tool-registry.ts:319-386; src/cli/repl/input-bar.tsx:163,195-198; src/cli/repl/run.tsx:73-80

**[P1] /approve suggest\|auto-edit\|full-auto never reaches the default native-agent engine's permission gate**  
- `src/cli/repl/app.tsx:1020` · dimension: `menu-vs-engine-drift` · kaynak: lens:cross-platform
- **Senaryo:** User types `/approve full-auto` on the default engine expecting tool calls to stop prompting. The status bar shows `· ⚡full-auto` (app.tsx:1135) but the native AgentSession's internal mode stays fixed at `policy.defaultMode` from boot — every tool call still routes through the interactive confirm/permission-request flow regardless of the stated mode.
- **Kanıt:** app.tsx:1015-1023 (HEAD) /approve handler calls only onApprovalMode/setApproval; run.tsx:421 `onApprovalMode={(m) => { approvalMode = m; }}` feeds a local var used solely by the legacy loop's askConfirm; agent/session.ts:43,103 declares `setApprovalMode` but `git grep -n "\.setApprovalMode(" HEAD -- src` returns zero call sites in tracked non-test source (only tests/agent/session.test.ts:44 calls it); native-agent-bridge.ts's createNativeEngine (line 107 onward) never calls session.setApprovalMode.

**[P1] /model and /provider bypass the busy gate and can splice two backends into one in-flight native-agent turn**  
- `src/cli/repl/app.tsx:1004` · dimension: `async-race` · kaynak: lens:async-race
- **Senaryo:** A user message that requires 2+ sequential tool round-trips is in flight (working=true). Because InputBar stays active, the user types `/model gpt-4` and hits Enter before the turn finishes. handleSubmit's /model branch fires immediately (no queueing, no busy check), mutating the shared live-adapter object. On the NEXT loop.ts iteration of the SAME still-running turn, the new adapter/model serves the rest of a transcript built against the old model's tool calls, with the status bar now showing 'switched' before the original turn even completed — a real, silent mid-turn backend handoff with no warning.
- **Kanıt:** app.tsx:1004-1023 matches at HEAD: the /model\|/provider regex branch pushes the turn and calls onSwitch(...) synchronously with zero check of `working` (declared app.tsx:643) or `confirm`. InputBar's `active` prop is `confirm === null` only (app.tsx:1130), independent of `working`, so it stays interactive mid-turn. run.tsx:409-433 confirms `nativeSwitch` mutates a shared `live.adapter/model/provider` object with no in-flight guard (comment at run.tsx:375-379 dates this getter-based live-swap to '2026-07-07 incident fix' and is an UNCOMMITTED change per `git diff`, i.e. presently live code, not settled/reviewed history). agent/loop.ts:88-90 confirms `getAdapter?.()`/`getModel?.()` are re-read on every iteration of the turn's own `while(true)` loop (loop.ts:79), and app.tsx:853-866 shows `await nativeEngine(line, ...)` is a single JS call awaited straight through inside `inputIter`, so nothing yields control back to gate a mid-call keypress.

**[P1] Backspace/Delete/Left/Right operate on raw UTF-16 code units, splitting astral-plane surrogate pairs**  
- `src/cli/repl/line-edit.ts:59` · dimension: `i18n` · kaynak: R02-input-edit
- **Senaryo:** User types a message ending in an emoji, e.g. types 🚀 (U+1F680, a UTF-16 surrogate pair occupying 2 buffer indices) and then presses Backspace ONCE, expecting to delete the whole emoji — buffer.slice(0, cursor-1) removes only the high-surrogate half, leaving the low surrogate dangling unpaired in `buffer`. This requires no arrow-key combo at all; a single Backspace immediately after typing any astral character reproduces it, corrupting the string (renders as mojibake / gets replaced with U+FFFD on UTF-8 encode at submit time).
- **Kanıt:** Confirmed at HEAD: line 59 is exactly `return { state: { buffer: buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor: cursor - 1 } };` (backspace), delete at 60-62 and left/right at 63-66 are likewise raw-index arithmetic with no code-point awareness. Confirmed cursor-model.ts (the code-point-safe CursorState/applyCursorEdit fix) has ZERO importers anywhere in src/ (grep for 'cursor-model' matches only its own file's header comment) and its own header explicitly states 'this is a standalone model + harness, not a line-edit.ts rewrite or an input-bar.tsx wire' (cursor-model.ts:19-21) — confirming the fix is not wired into the live path (input-bar.tsx:13,188 imports editInput from line-edit.ts, not cursor-model.ts).

**[P1] Control-byte filter for pasted sequences only inspects the first code unit of a multi-char paste**  
- `src/cli/repl/line-edit.ts:80` · dimension: `security` · kaynak: R02-input-edit
- **Senaryo:** User pastes clipboard text whose first character is printable but which contains embedded ANSI/control bytes further in, e.g. 'go run main.go\x1b[2J\x1b[31mFAKE PROMPT' with no CR/LF. `ch.charCodeAt(0)` is 'g' (0x67), so the entire string — escape bytes included — is spliced into `buffer` untouched (line 82) and subsequently rendered raw to the real terminal by Ink's <Text>, letting the terminal interpret the embedded escape codes (screen clear / color / spoofed text) — a live terminal-escape-injection path on ordinary paste, no flag required.
- **Kanıt:** Confirmed at HEAD: line 80 is exactly `if (ch.charCodeAt(0) < 0x20 && ch !== '\t') return { state };`, and line 76's own comment says 'Printable sequence (incl. pasted text — comes as a multi-char `sequence`)'. Confirmed inkToKey's default branch (input-bar.tsx:91) sets `sequence: input` where `input` is Ink's full batched paste string, and this reaches editInput's default branch at input-bar.tsx:188 whenever the paste has no embedded \r/\n (the newline branch at input-bar.tsx:172-186 handles only that case, with no control-byte stripping either). Confirmed normalizePasted (input-history.ts:135-146) is defined but has ZERO callers anywhere in src/ (grep matches only its own definition) — it is dead code, never invoked by input-bar.tsx or line-edit.ts.

**[P1] initReplMcpBridge()'s documented opt-in mcp_client_enabled gate is dead code — the real default-path wire (run.tsx) constructs its own broker+bridge and calls loadAndConnectAll() unconditionally, auto-connecting any configured MCP server (project .mcp.json/.mcp.local.json OR user-level ~/.deckent/mcp.json) on every default native-agent REPL launch**  
- `src/cli/repl/mcp-bridge.ts:90` · dimension: `security` · kaynak: R04-repl-bridges
- **Senaryo:** Any user who has EVER configured an MCP server in `~/.deckent/mcp.json` (home-level, persists across all projects) — a normal MCP-ecosystem setup independent of deckent's advertised 'default-OFF, opt-in' flag — has those servers silently connected and their tools registered on every subsequent plain `deckent` REPL launch (default native-agent path, no flags needed), even though this module's own header explicitly documents 'Flag absent/false -> initReplMcpBridge returns null...no external surface' as the safety contract. The repo itself has no such file today so it's not firing in THIS sandbox, but the precondition (a pre-existing user- or project-level MCP config) is a realistic, non-deckent-specific state many real users already have, and no deckent-side opt-in is required at all — this is why I raise it from the first-pass P2 to P1 rather than leaving it as 'requires non-default config': the bypassed config is deckent's own, but the triggering precondition isn't.
- **Kanıt:** mcp-bridge.ts:90-105 (initReplMcpBridge, gated by isMcpClientEnabled at line 78-80) confirmed to have zero callers anywhere outside its own file (grepped src/). run.tsx:398-407 confirmed as the REAL wire: inside the native-agent branch entered whenever `isNativeAgentSelected(...)` is true (the DEFAULT — run.tsx:73-80, true unless `--legacy-loop` or `terminal.native_agent:false`), it does `new McpClientBroker({})` + `buildMcpBridge({...})` + `await bridge.loadAndConnectAll()` with NO check of any `mcp_client_enabled` config flag anywhere in that block. Traced `loadAndConnectAll` -> chat-mcp-bridge.ts:223-224 `loadMcpServers(projectRoot)` -> src/mcp-client/config.ts:37-45, which merges THREE sources: `~/.deckent/mcp.json` (user-level, home dir), `<root>/.mcp.json` (project), and `<root>/.mcp.local.json` — none gated by deckent's own opt-in flag.

**[P1] Native-engine runTurn overwrites (not accumulates) 'usage' stat across a multi-round turn**  
- `src/cli/repl/native-agent-bridge.ts:163` · dimension: `correctness` · kaynak: R03-native-transport
- **Senaryo:** Real, unchanged: any turn where the model calls >=1 tool before its final answer (the normal case for a coding agent) undercounts the turn's total tokens in the footer 'Σ N tok' display, keeping only the last round's numbers.
- **Kanıt:** Confirmed at native-agent-bridge.ts:162-164 (`case 'usage': inputTokens = ev.inputTokens; outputTokens = ev.outputTokens;` — plain assignment, not `+=`), inside the `for await (const ev of session.send(input))` loop (line 149). Confirmed agent/loop.ts:74-213's `runAgentTurn` is a `while(true)` generator (one `session.send()` call == one generator, per session.ts:90-94) that yields a fresh 'usage' event (loop.ts:118) on every round when tool calls occur, so >=2 rounds in one external turn does produce >=2 'usage' events collapsed into one bridge-level runTurn call — only the last round's counts survive to `cbs.onTurnEnd` (native-agent-bridge.ts:180) and app.tsx's `sessionTok`/footer-stat display (app.tsx:847-863). Confirmed guards/cost.ts:28-29 `accrue()` uses `+=` so the hard cost-ceiling enforcement itself is unaffected — only the displayed/session token counter is wrong.
- **Guard/neden-gerçek:** None that neutralizes the display bug itself. guards/cost.ts:28-29 accrue() correctly uses += per round (via loop.ts:119-120), so the hard cost-ceiling enforcement and actual USD spend tracking are unaffected — only the user-facing "Σ N tok" footer / per-turn stats counter is wrong. This limits blast radius to informational telemetry (no crash, no data loss, no security/cost-safety impact), which is the mitigating factor against the impact of the bug though not enough to refute reachability or correctness-defect status.

**[P1] resolveClaudeWireModel's own-provider guard is dead code (inferProviderFromId's unconditional 'claude' fallback), so an unrecognized /model id silently reaches the Anthropic API while the REPL reports a false 'switched' success**  
- `src/cli/repl/native-transport.ts:93` · dimension: `correctness` · kaynak: lens:i18n-measured
- **Senaryo:** REPL boots with the native engine (default) and ANTHROPIC_API_KEY set (or native_provider:'claude' pinned). User types `/model deepseek-chat` (or any other unrecognized bare id, e.g. a typo or a foreign vendor model name with no colon and no gpt/o-series/claude prefix). The switch reports success (`switched: claude · deepseek-chat`) but the live adapter is still the Anthropic adapter now carrying model:'deepseek-chat'; the next chat turn's request to the real Anthropic API is rejected with an invalid-model error, reproducing the exact 'false-positive switch, then confusing downstream failure' incident class the surrounding code's comments explicitly reference.
- **Kanıt:** Verified end-to-end at HEAD: native-transport.ts:93 `if (inferProviderFromId(candidate) !== 'claude') return DEFAULT_MODEL['anthropic-api'];` can never fire for an id like 'deepseek-chat' because model-registry.ts:275 `return 'claude';` is inferProviderFromId's unconditional fallback for anything not matching gemini/gpt-codex/o-series/ollama-colon prefixes (model-registry.ts:253-276). Traced the full call path: run.tsx:412-433 nativeSwitch computes impliedProvider=null for a bare `/model deepseek-chat` (inferNativeProviderForModel at native-transport.ts:79-85 doesn't recognize it), so target.provider stays live.provider ('claude'); resolveNativeSelection's 'claude' branch (native-transport.ts:118-134) calls resolveClaudeWireModel(sel.model) with no further validation, returning a non-error ResolvedProvider; app.tsx:1010-1018 then renders the false-positive `switched: claude · deepseek-chat` confirmation since next.switchError is undefined. Also confirmed reachability is NOT contingent on this repo's local (gitignored) config: native-transport.ts:217-247 shows the boot path (resolveNativeProvider) picks providerName 'claude' via detectTransport whenever plain ANTHROPIC_API_KEY is set in the environment -- a common baseline for this Claude-oriented tool, independent of any explicit native_provider pin. run.tsx:63 also documents 'Native is the DEFAULT' REPL engine (isNativeAgentSelected returns true unless --legacy-loop or terminal.native_agent:false), so this whole switch path is reachable on the default engine.

**[P1] switchTo() crashes the REPL on an invalid /provider name via the unguarded rebuild(next) call — reachable whenever native-agent transport detection fails (no ANTHROPIC_API_KEY/OPENAI_API_KEY/ollama_host), not only via --legacy-loop**  
- `src/cli/repl/provider-switch.ts:77` · dimension: `correctness` · kaynak: R04-repl-bridges
- **Senaryo:** First-pass claimed this fires on 'the default (native-agent) path' via run.tsx:420, but that line number is wrong and the reasoning is incomplete: run.tsx:482-488 (the ACTUAL onSwitch wrapper) checks `if (nativeSwitch) return nativeSwitch(sel);` first, and nativeSwitch (run.tsx:412-433) resolves through resolveNativeSelection, which NEVER throws — it returns a `{switchError}` string for a bad name (native-transport.ts:194-199), handled gracefully by app.tsx:1011-1014. So when native-agent IS active, an invalid `/provider foo` is safe. HOWEVER: nativeSwitch/nativeEngine are only set inside the `else` branch at run.tsx:397, reached only when `resolveNativeProvider` (native-transport.ts:217-258) does NOT return an error. resolveNativeProvider delegates to detectTransport (provider-detect.ts:20-37), which returns `{kind:'none'}` — an error — whenever env has no ANTHROPIC_API_KEY, no OPENAI_API_KEY/openai_base_url, and no ollama_host configured. This is the normal state for a subscription-authenticated Claude Code user (no API-key env vars at all — exactly the class of user entry.ts:420's own SSOT-gap table calls out as 'claude, no spawnFn/persistentSpawnFn (REPL boot)'). In that state nativeEngine/nativeSwitch stay undefined, ReplApp still runs real turns via the legacy `provider={switcher.proxy}` adapter (app.tsx:853 `if (nativeEngine)` gates the native-turn branch; else falls to the working legacy path), but the `/model`·`/provider` handler (run.tsx:482-488) now falls through straight to the unguarded `switcher.switchTo(sel)` → provider-switch.ts:77 throws for a typo'd `/provider foo` → uncaught exception → error-handler.ts's installFatalHandlers (`process.on('uncaughtException', formatFatalAndExit)`, line ~159) exits the whole process. No `--legacy-loop` flag or config override is needed — only the very common 'no native-transport credentials set' default state plus a typo'd slash command.
- **Kanıt:** provider-switch.ts:76-79 confirmed: `const prev = active; active = rebuild(next) as MaybeSession; selection = next; void teardown(prev);` — rebuild(next) is unguarded while teardown(prev) (line 48-51) is try/catched. entry.ts:437-440 confirms buildReplProvider throws `Unknown REPL provider: "x"...` for a bad name; entry.ts:582-583 confirms this throwing function IS the `rebuild` closure passed into runInkRepl.

**[P1] Chat history is never persisted on the default native REPL engine — /resume has nothing to show for the just-completed conversation**  
- `src/cli/repl/run.tsx:439` · dimension: `silent-failure` · kaynak: lens:silent-failure
- **Senaryo:** User runs bare `deckent` (native default), has a full conversation, then types `/resume` expecting to see/continue it. app.tsx's resume picker calls memory.listChatSessions() which returns no row for the session just had (never written), so the conversation silently appears never to have happened — no error or warning shown anywhere.
- **Kanıt:** run.tsx:202-210, 439-453, 482; native-agent-bridge.ts:36-75, 146-182; memory-store.ts:1222-1237, 1328; chat-native.ts appendChatTurn call sites; app.tsx:887, 960-963

**[P1] MAX_CODE_BLOCK_LINES force-flush resets mode to 'prose' mid-fence, so the block's real closing ``` is later misparsed as a new fence-open, corrupting the rest of the streamed reply**  
- `src/cli/repl/stream-segmenter.ts:80` · dimension: `streaming` · kaynak: R03-native-transport
- **Senaryo:** Assistant streams one fenced code block with content reaching 200 total buffered lines before its real closing fence appears (e.g., dumping a large file/diff) — the safety-cap forces an early flush + mode reset, and the real closing ``` line is then reinterpreted as opening a NEW code block, swallowing/misrendering the remainder of that turn's prose as code.
- **Kanıt:** stream-segmenter.ts:74-90 (code-mode block, fenceGuard force-flush, prose-mode fence-reopen); stream-segmenter.ts:44 (MAX_CODE_BLOCK_LINES = 200); app.tsx:784,840-843 (single unconditional segmenter instance feeding output()).

### P2 — 53 bulgu (latent/edge)

| file:line | dimension | başlık | tetikleyici |
|---|---|---|---|
| `src/agent/guards/self-modifying.ts:21` |  | checkSelfModifying() tests raw (possibly-absolute) write-target strings against relative source-path prefixes with startsWith, so an absolute-path write silently skips the mandatory elevation | Inside the deckent-dev repo (detectDeckentRepo=true) with approval mode 'auto-edit' (a documented, non-default mode set via `/approve auto-e |
| `src/agent/loop.ts:150` |  | cancel() cannot interrupt a tool handler already in flight — no isCancelled()/abort check wraps `await def.handler(call.args)` | A tool call to deckent_bash with cmd:'sleep 300' is executing; a caller invokes session.cancel() mid-execution (the public AgentSession.canc |
| `src/agent/loop.ts:206` | race | cancel() cannot interrupt a tool handler already in flight — no isCancelled check wraps `await def.handler(call.args)` | Model calls deckent_bash with cmd:'sleep 300'. While bashRun's child process (chat-tool-exec.ts's spawn) is running, the user triggers sessi |
| `src/agent/loop.ts:168` | tool-loop | Mid-batch cancel() during a multi-tool-call turn can leave orphaned tool_use blocks (no matching tool_result) in the transcript — but AgentSession.cancel() has no caller anywhere in the wired REPL surfaces today, so the path is currently unreachable | Would require a UI action that calls session.cancel() mid-tool-batch while a permission prompt for one of several parallel tool calls is pen |
| `src/agent/permission-store.ts:88` | silent-failure | persist() silently discards ALL of settings.local.json's content (not just permissions.rules) when the file is malformed, then overwrites it — contradicting the sibling chat-permissions.ts's documented 'preserves other fields' intent | If `.deckent/settings.local.json` becomes malformed (e.g. truncated by a crash mid-write or hand-edited with a syntax error) and the user th |
| `src/agent/provider-tooluse/openai.ts:47` |  | Synthesized tool-call IDs are only index+name-scoped per request, so a backend that never emits real tool_call ids can reuse an identical synthesized ID across separate turn iterations | Against an OpenAI-compatible local/self-hosted backend whose tool-calling template never populates `tc.id`, two different loop iterations of |
| `src/agent/transcript.ts:11` |  | Transcript has no truncation/eviction — a session's message history grows unbounded and is resent in full on every round-trip, eventually guaranteeing a context-length-exceeded failure with no recovery path | A long-running native-agent session (many turns, each with multiple tool round-trips) eventually exceeds the model's context window; the pro |
| `src/api/terminal/session-manager.ts:34` | cross-platform | Web/API terminal 'shell' session kind defaults to a hardcoded 'bash' when SHELL is unset | A user opens a `shell`-kind PTY session via the dashboard/API terminal on native Windows, where `process.env.SHELL` is normally undefined. ` |
| `src/cli/commands/agentic-confirm.ts:46` | race | confirmAction opens a second readline.Interface on the shared stdin/stdout while the caller's own interface is already active | Running `DECKENT_INK=0 deckent` or `deckent chat --native` (interactive, no --once/--message) and typing `/autonomous status` or `/usage` re |
| `src/cli/commands/chat-banner.ts:35` | i18n | renderBanner hardcodes a Turkish-only hint string with no getMessage()/lang path | Real: any non-Turkish user running the legacy readline REPL (DECKENT_INK=0) sees the Turkish hint regardless of configured language. |
| `src/cli/commands/chat-mcp-bridge.ts:280` | correctness | A successful external MCP tool call whose result isn't JSON-serializable is double-audited (once 'ok', once 'error') and incorrectly reported as a failure to the caller | An external MCP server returns a non-JSON-serializable result (e.g. containing a BigInt) from a successful callTool; the caller sees a contr |
| `src/cli/commands/chat-permissions.ts:57` | race | writePermissions overwrites permissions.allow from the in-memory Set only, losing concurrent grants from another running REPL session | Real: two concurrent REPL sessions in the same project each grant a different tool 'always allow'; the second session's writePermissions cal |
| `src/cli/commands/chat-render-region.ts:68` | correctness | writeAbove only clears the current terminal row before redrawing, leaving stale content when the pinned input line has wrapped to multiple rows | Real: user's input wraps across 2+ terminal rows while an async response streams above via writeAbove; only the row the cursor sits on gets  |
| `src/cli/commands/chat-render-region.ts:87` | i18n | THINKING_VERBS / TOOL_VERBS are hardcoded Turkish-only strings, bypassing the project's getMessage() i18n system | Real, but confirmed scoped to the legacy readline path only (DECKENT_INK=0) — the default Ink REPL uses properly localized labels via run.ts |
| `src/cli/commands/chat-render.ts:146` | correctness | renderMarkdown: inner inline-code/link RESET prematurely terminates outer heading/bold styling for the rest of the line | Real and reproduced by direct execution of the two relevant regex steps in isolation, exactly matching the coded order. |
| `src/cli/commands/chat-render.ts:134` | correctness | Markdown link regex truncates URLs containing balanced parentheses, corrupting the link and leaking a stray ')' | Confirmed via direct regex execution; Wikipedia-style URLs with parens are a common real-world shape in assistant answers. |
| `src/cli/commands/chat-session.ts:437` | leak | `ensureSpawn()` never resets the `exited` flag after teardown — a post-exit reuse would misreport `isAlive()` and leak an unkilled child per call | Only reachable if a future/alternate caller invokes send()/stream() on the SAME session object after calling exit() on it — not exercised by |
| `src/cli/commands/chat-slash-registry.ts:350` | i18n | /help ignores session language and always renders hardcoded Turkish text | An English-language session (lang='en') types `/help`; the header and every command description print in Turkish while the adjoining 'Tools/ |
| `src/cli/commands/chat-slash-registry.ts:199` | slash-menu-vs-engine | In-repo comments for /nervous, /interrogate, /resume, /mcp claim guaranteed pre-registry interception in chat-native.ts — now false whenever the default native-agent engine is active | Under the default engine, typing `/nervous accept t-1` or `/mcp list` sends the literal text to the LLM as chat instead of running the docum |
| `src/cli/commands/chat-tool-bridge.ts:109` | correctness | Neither chat-tool-bridge.ts's nor chat-enterprise-bridge.ts's defaultSpawnFn registers a `child.on('error', …)` handler — an ENOENT/EMFILE spawn failure crashes the whole process | spawn() emits an async 'error' event (e.g. ENOENT if dist/cli/entry.js or the resolved cwd is missing, or EMFILE under fd exhaustion from ma |
| `src/cli/commands/chat-tool-exec.ts:86` | security | `inScope()`'s path-traversal guard is purely lexical (path.relative) and never resolves symlinks — a symlink planted inside the project bypasses the scope check | The model first issues a confirm-gated `deckent_bash` call such as `ln -s /etc/passwd leak.txt`. It then issues `deckent_read_file {path:'le |
| `src/cli/commands/chat-tool-exec.ts:127` | correctness | `deckent_edit_file` silently replaces only the FIRST occurrence of `old`, and an empty/missing `old` silently prepends `new` instead of erroring | (a) If `old` occurs more than once in the file, `before.replace(oldStr, newStr)` (line 128, string-pattern replace) only replaces the first  |
| `src/cli/commands/chat-tool-exec.ts:58` | cross-platform | deckent_bash hardcodes spawn('bash', ['-lc', cmd], ...) — fails on native Windows without WSL/Git-Bash | On native Windows with no bash on PATH, every deckent_bash tool call fails with an ENOENT-derived `[mcp-error] deckent_bash: ...` (at least  |
| `src/cli/commands/chat.ts:58` |  | Provider-detection/spawn-path user-facing strings are hardcoded English, bypassing the getMessage(key, lang) mechanism used elsewhere in the same file |  |
| `src/cli/entry.ts:333` | streaming | buildCliStream NDJSON mode-lock has no fallback for parsed-but-non-assistant JSON lines (delta===null), silently dropping content from both the live stream and the transcript | provider=codex or provider=gemini selected via DECKENT_CHAT_PROVIDER; assistant reply begins with '{' and a later complete line happens to b |
| `src/cli/entry.ts:200` | security | subscriptionReplEnv() (used unconditionally for .stream()) omits the Gemini API-key env vars that the project's own SSOT (chat-provider-parity.ts) strips for the documented OAuth-vs-API-key reason | User has GEMINI_API_KEY set in shell env (common for gemini CLI/API users), selects provider=gemini in the REPL; the spawned gemini child in |
| `src/cli/entry.ts:233` | i18n | Ollama-unreachable error message is hardcoded Turkish regardless of configured language | User sets provider=ollama but hasn't started the Ollama daemon; regardless of config.language='en', the thrown error is Turkish-only. |
| `src/cli/entry.ts:687` | i18n | Hardcoded Turkish tool-confirmation hint in the legacy (DECKENT_INK=0) path bypasses the existing localized key tui.confirm_hint that the Ink path already uses | User runs with DECKENT_INK=0 (documented legacy rollback path) on a TTY with config.language='en'; every tool-confirmation prompt still show |
| `src/cli/entry.ts:797` | leak | SIGTERM/SIGINT handler (onSignal) has zero awareness of the persistent REPL provider session, so it never tears down the warm claude CLI child, leaking an orphaned subprocess | deckent run under a process supervisor or `docker stop <container>` sends SIGTERM to the deckent PID; onSignal runs sprint/tmux cleanup and  |
| `src/cli/entry.ts:708` | security | Off-TTY (piped stdin) invocation auto-approves every side-effecting tool call with no confirmation gate | `cat prompts.txt \| deckent` where prompts.txt (or content it causes the model to process) induces a deckent_write_file/deckent_bash tool-ca |
| `src/cli/entry.ts:807` | cross-platform | SIGTERM cleanup handler never fires on Windows, leaving sprints/tmux sessions un-cleaned on process kill | On Windows, a service-manager stop or `taskkill` of `deckent` skips `interruptActiveSprint()`/`killAllSessions()` (entry.ts:799-802), leavin |
| `src/cli/entry.ts:686` | i18n | Hardcoded Turkish tool-confirmation hint in the legacy REPL bypasses the existing bilingual key tui.confirm_hint | User runs with DECKENT_INK=0 (documented legacy-readline path) on an interactive TTY with config.language='en'; when the agent requests a wr |
| `src/cli/entry.ts:803` | resource-leak | Global SIGINT/SIGTERM handler exits immediately, bypassing the REPL's own provider/session teardown | A running deckent REPL using the default persistent-claude session (or an active MCP bridge/child) receives an external `kill -TERM <pid>` ( |
| `src/cli/repl/app.tsx:721` |  | clearScreen()/'/clear' never emits an ANSI clear sequence — it only resets React state, which cannot erase content Ink's <Static> has already permanently flushed to the real terminal | User runs `/clear` (or Ctrl-L) after a long conversation with several completed turns. The old turns remain visibly printed in the terminal  |
| `src/cli/repl/app.tsx:928` | menu-vs-engine-drift | /resume (and /ask /run /control /queue /interrupt /steer) only work on the native engine when repl_surface.enabled=true (default false); on a fresh/default project they fall through as literal chat text just like Finding 1 | Fresh project (repl_surface.enabled unset/false, the default), native engine active. User types `/resume` or `/resume 2` expecting the sessi |
| `src/cli/repl/app.tsx:866` | silent-failure | An exception escaping the native engine's turn loop (e.g. a permission-grant disk-write failure) is swallowed and silently exits the whole REPL with no message | User is in a project directory where `.deckent/` (or its parent) is unwritable (read-only container/CI/restricted perms). During a session,  |
| `src/cli/repl/app.tsx:724` | race | /clear during an in-flight streaming reply does not cancel the turn; its remaining output repopulates the just-cleared screen under a phantom new '● deckent' head | User submits `/clear` while a reply is still streaming (permitted since InputBar has no working-gate). The screen empties, but the in-flight |
| `src/cli/repl/app.tsx:1130` | race | InputBar stays active while ApprovalCard is pending — no mutual exclusion between the two useInput surfaces | Only reachable when the project config sets `repl_surface.approvals: true` (run.tsx:152 `approvalsEnabled = surf.approvals === true`, defaul |
| `src/cli/repl/app.tsx:824` | silent-failure | Turn-end steer-note/queue merge re-enqueues through the same duplicate-guard, silently dropping a legitimately repeated message | With repl_surface.enabled=true (non-default), during a busy turn the user issues `/steer wait` twice deliberately. Both notes are stored dis |
| `src/cli/repl/approval-card.tsx:233` |  | ApprovalCard's key handler ignores Ink's ctrl/meta modifier flags, so Ctrl+A (or Ctrl+N/Ctrl+D) is mis-read as approve-all/deny/details | While an ApprovalCard is pending (e.g. a worker requests approval for a destructive shell command), the user presses Ctrl+A out of habit (re |
| `src/cli/repl/dual-stream.ts:54` | streaming | truncateToWidth (and live-footer.ts's identical `truncate`) slice by UTF-16 code units, unlike the surrogate-pair-safe truncation already used elsewhere in the same streaming UI code | `state.running`/`state.next` footer labels (real task/next-step text) containing an astral character (emoji or any code point outside the BM |
| `src/cli/repl/input-bar.tsx:88` |  | Home/End key detection checks Ink Key properties that Ink never populates, so Home/End are a permanent silent no-op | User presses Home or End while editing a non-trivial input line to jump the cursor. Nothing happens — the escape sequence is silently swallo |
| `src/cli/repl/input-bar.tsx:98` |  | CaretText slices the input buffer by UTF-16 code unit, bisecting surrogate pairs (emoji/astral chars) at the cursor | User types/pastes an emoji (surrogate pair) and arrow-navigates so the cursor sits between the high and low surrogate; CaretText renders the |
| `src/cli/repl/input-history.ts:107` | correctness | HistoryNavigator discards in-buffer edits made between two Up/Down navigation steps | User presses Up to recall 'git status', types ' --short' to extend it (now 'git status --short' on screen), then presses Down (e.g. reaching |
| `src/cli/repl/input-queue.ts:59` | silent-failure | Duplicate-Enter guard also swallows a legitimate identical entry when app.tsx rebuilds the queue after a /steer drain | With repl_surface.enabled=true in project config: during a busy turn, user queues plain message 'fix bug' and separately runs '/steer fix bu |
| `src/cli/repl/native-agent-bridge.ts:145` | correctness | runTurn overwrites (not accumulates) 'usage' stats across a multi-round turn, undercounting displayed tokens whenever the model calls a tool | With DECKENT_NATIVE_AGENT=1, any turn where the model makes >=1 tool call before its final answer produces 2+ 'usage' events; only the last  |
| `src/cli/repl/native-tool-registry.ts:375` | correctness | An MCP tool with an empty-string (not undefined) description crashes the entire REPL launch on the native engine | A configured MCP server connects successfully but returns a tool descriptor with `description: ''` (spec-valid — merely optional, not necess |
| `src/cli/repl/native-transport.ts:161` | correctness | deepseek/qwen/glm credential resolution never consults the `.deck` secrets store, unlike claude/openai in the same function | A user follows the app's own ADR-G-005 convention and puts `DECKENT_DEEPSEEK_API_KEY=sk-...` in their project's `.deck` file without also ex |
| `src/cli/repl/run.tsx:313` |  | CLI-bridge tool confirm-denial returns early, bypassing the toolSink 'honest outcome' block that renders a dim ✗ acknowledgment for EXEC_TOOLS | Agentic dispatch resolves a request into `deckent_kill` (ALWAYS_CONFIRM tier); user denies. The confirm card simply disappears with no dim ✗ |
| `src/cli/repl/run.tsx:403` | resource-leak | MCP broker/subprocess connections are opened but never torn down on REPL exit | A project configures a stdio-transport MCP server in .mcp.json. The user runs a REPL session and exits via /exit (default teardown path). Th |
| `src/cli/repl/run.tsx:493` | i18n | ReplLabels' mode/resume/busy-control fields are never populated from getMessage, so /ask·/run·/control, /queue·/interrupt·/steer, and the /resume picker always render hardcoded English text even with lang=tr, and this is reachable on the DEFAULT repl_surface config (candidate's 'non-default' framing is factually wrong) | A user with project config language:'tr' (repl_surface defaults ON, requiring no other opt-in) runs /ask, /run, /control, /queue, /interrupt |
| `src/cli/repl/tool-permissions.ts:64` | correctness | classifyTool()'s catch-all `return 'read'` never special-cases deckent_start/deckent_run/deckent_process, contradicting chat-tool-bridge.ts's own comment that these are "confirm-gated one layer up ... via tool-permissions.classifyTool" | Only reachable when a user runs the REPL with `--legacy-loop` (or `terminal.native_agent: false`) AND the persistent-claude tag protocol or  |
| `src/cli/repl/tool-permissions.ts:95` | security | classifyExternalTool()'s read-only classification is a pure name-prefix heuristic with no verification of actual side effects, so a destructive external MCP tool with a matching prefix (e.g. `check_out`, `get_and_delete`) auto-approves with no confirmation | A connected third-party MCP server exposes a tool literally named `check_out` (lock/claim semantics) or `get_and_delete`; it matches `check_ |

### P3 — 33 nit

| file:line | dimension | nit |
|---|---|---|
| `src/agent/identity.ts:42` |  | composeSystemPrompt() accepts a lang option but never reads it — the immutable core and default persona are always emitted in Turkish regardless of requested language |
| `src/agent/provider-tooluse/anthropic.ts:61` |  | On a non-OK HTTP response, the adapter throws a bare status code and discards the response body, dropping the actual provider error detail |
| `src/cli/commands/chat-mcp-bridge.ts:234` | silent-failure | A misconfigured/misbehaving MCP server is silently dropped from the tool catalogue with no indication to the user of which server failed or why |
| `src/cli/commands/chat-native.ts:894` |  | Slash/agentic cancellation messages ('[slash] cancelled: ...', '[agentic] cancelled: ...') are hardcoded English, unlike neighboring getMessage-routed output |
| `src/cli/commands/chat-native.ts:563` | tool-loop-integrity | getRecentTurns does a naive tail-slice with zero tool_use/tool_result pairing safety; currently dead code since no production caller sets contextWindowSize |
| `src/cli/commands/chat-provider-parity.ts:109` | correctness | Ollama/openai-compatible HTTP calls have no timeout or AbortController — an unresponsive local server hangs the turn indefinitely |
| `src/cli/commands/chat-render-region.ts:55` | silent-failure | safePrompt swallows ALL exceptions from rl.prompt(true), not just the documented 'readline was closed' case |
| `src/cli/commands/chat-render-region.ts:279` | nit | createLineQueue is a fully-implemented async generator that is never invoked anywhere — dead code contradicting entry.ts's own comment |
| `src/cli/commands/chat-repl-ux.ts:147` |  | createReplLines and its readline-history/SIGINT/multi-line helpers are dead code with zero production callers |
| `src/cli/commands/chat-slash-registry.ts:384` | i18n | slugifyBacklogId drops non-ASCII (Turkish) characters instead of transliterating them, risking backlog-id collisions |
| `src/cli/commands/chat-slash-registry.ts:369` | ux-drift | slashCompleter is case-sensitive, unlike resolveSlash's dispatch and chat-slash-menu's filter, so an uppercase prefix returns the entire command list instead of a filtered one |
| `src/cli/commands/chat-slash-registry.ts:491` | correctness | /usage and /resources subaction flags are matched case-sensitively, unlike every sibling subaction parser |
| `src/cli/commands/chat-slash-registry.ts:669` | correctness | resolveSlash's blanket split(/\s+/) followed by downstream join(' ') silently collapses multi-space runs in slash payload text |
| `src/cli/commands/chat-slash-registry.ts:235` | slash-menu-vs-engine | /kill, /cleanup, /recover silently no-op under the default engine (same mechanism as the broader agenticTool bypass, not a distinct safety-guarantee violation) |
| `src/cli/commands/chat-status-line.ts:40` | nit | renderStatusLine is fully implemented and documented but never called anywhere in the codebase |
| `src/cli/commands/chat-tool-bridge.ts:364` | nit | `[mcp-error] tool not allowed: <name>` is returned both for genuinely disallowed tools and for allowed tools called with missing/invalid required arguments |
| `src/cli/entry.ts:760` | i18n | createSpinner label hardcodes Turkish 'düşünüyor…' (unused key tui.thinking), and its stderr-only TTY guard can diverge from the caller's combined stdin&&stdout TTY check |
| `src/cli/entry.ts:782` | i18n | Node-version guard hardcodes an English-only message, bypassing the existing bilingual key error.node_version_low |
| `src/cli/entry.ts:35` | ux-drift | reduceSlashMenu (arrow-key/select navigation for the `/` command menu) is never imported or called anywhere in src/, leaving the legacy `/` menu display-only despite the module's own doc comments describing full interactive navigation |
| `src/cli/repl/approval-terminal-channel.ts:85` | nit | dispose() detaches the relay channel but leaves the closure-captured decisionHandler live, so a decide() call after dispose() silently still resolves the approval instead of erroring |
| `src/cli/repl/busy-controls.ts:158` | ux-drift | /queue, /interrupt, /steer parsing is case-sensitive while every other slash command nearby is case-insensitive |
| `src/cli/repl/input-bar.tsx:181` |  | Multi-line/trailing-newline paste path pushes an empty line into the in-memory history entries array without a length guard |
| `src/cli/repl/input-bar.tsx:128` | cross-platform | Debug keylog path hardcoded to /tmp, silently no-ops on non-POSIX hosts |
| `src/cli/repl/line-edit.ts:55` | nit | Whitespace-only submitted lines create phantom in-memory (but not on-disk) history entries |
| `src/cli/repl/native-agent-bridge.ts:180` | correctness | Bg-turn drain loop reuses the caller's single onTurnEnd closure (fixed startMs) across multiple synthetic turns, so each drained turn's reported elapsed time is measured from the ORIGINAL turn's start, not its own — currently unreachable, feature not wired in production |
| `src/cli/repl/native-agent-bridge.ts:204` | correctness | Bg-turn drain loop reuses the caller's single onTurnEnd closure (baked-in startMs) across multiple synthetic turns |
| `src/cli/repl/native-tool-registry.ts:280` | tool-loop | deckent_describe_tool always reports an empty params list for every bridged tool because the tool-surface catalog gives every entry the same generic z.record passthrough schema — currently dead code, tool_surface never enabled at the production call site |
| `src/cli/repl/native-transport.ts:205` |  | Doc comment claims Ollama's default context budget is 32k tokens; the code two lines below returns 24k |
| `src/cli/repl/run.tsx:412` |  | ReplErrorBoundary is mounted without its `label` prop, so a render-error fallback always shows the hardcoded English string regardless of active language |
| `src/cli/repl/run.tsx:331` | silent-failure | Non-EXEC (CLI-bridge) tool confirm-denial returns early, bypassing the toolSink 'honest outcome' UI block that file/bash tool denials get |
| `src/cli/repl/run.tsx:474` | i18n | ReplErrorBoundary is mounted without a `label` prop, so its fallback text is always the hardcoded English string regardless of active language |
| `src/cli/repl/run.tsx:53` | i18n | localizeNativeError builds message key 'native.switch.no-transport' for the errorCode returned when no transport is configured, but that key does not exist in messages.ts (harmless due to a designed key-miss fallback) |
| `src/cli/repl/stream-segmenter.ts:83` | streaming | Table-mode buffering has no length cap analogous to the code-fence guard, so a long run of pipe-containing prose lines buffers with no bound |

### Adversarial refute'ta ELENEN (dürüstlük-kanıtı)

| başlık | dosya | neden düştü |
|---|---|---|
| /model and /provider are silent no-ops for the default native-agent engine while the UI reports success | `src/cli/repl/app.tsx` | The claimed finding ("/model and /provider are silent no-ops for the native-agent engine while the UI reports success") describes a bug pattern that does NOT ex |
| HistoryNavigator silently discards in-buffer edits made between two Up/Down navigation steps | `src/cli/repl/input-history.ts` | Traced the exact code at current HEAD (input-history.ts and line-edit.ts are clean/uncommitted-diff-free; input-bar.tsx has an unrelated pending diff that doesn |
| classifyExternalTool()'s read-only classification is a pure name-prefix heuristic with no verification of actual side effects — reachable on the default engine path once any MCP server is connected (see mcp-bridge.ts finding), so a destructive tool named e.g. find_and_replace/check_out auto-approves with no confirmation | `src/cli/repl/tool-permissions.ts` | Verified the full call chain from tool-permissions.ts through both actual production callers of `buildMcpBridge().dispatch()`.  Confirmed as read: tool-permissi |
| chat-enterprise-bridge.ts's defaultSpawnFn has no timeout and no reject path — a hung /audit (bare, no subcommand) or /rbac /flow /cost freezes the whole REPL turn forever | `src/cli/commands/chat-enterprise-bridge.ts` | Verified the core code claim is accurate: chat-enterprise-bridge.ts:56-70 `defaultSpawnFn` really does only destructure `resolve` (no `reject`), has no `setTime |

---

## Live-PTY Probe (gerçek binary)
- **dist tazeliği:** STALE-then-FRESH (moving target): git log -1 for src/cli/repl + src/cli/commands = 2026-07-07 12:17:12 (last commit), but 8 files in those dirs are currently uncommitted with mtimes 20:43-22:23. At probe start, dist/cli's newest build was 21:05:05, which predates the 22:22-22:23 edits to app.tsx, input-bar.tsx, run.tsx, term-mode.ts, and chat-slash-registry.ts (dist was stale for those). Partway through the probe, a background build completed (dist/cli/entry.js and all repl/commands outputs re-timestamped 22:32:28), making dist fresh again relative to all current uncommitted src edits. As of the final check (22:36:30) dist remains fresh (newest dist mtime 1783452748 > newest uncommitted src mtime 1783452211).
- **Harness koşuları:**
  - ✅ `scripts/ink-pty-native-verify.mjs` — First invocation printed 'SKIP: dist/cli/entry.js not found' — transient race with a concurrent rebuild that had momentarily removed/was rewriting entry.js. Re-ran seconds later against the now-complete fresh build: PASS (tool round-trip: confirm card, proof-file write, artifact in scrollback). Uses hermetic mkdtemp() cwd, isolated from real project state.
  - ✅ `scripts/ink-pty-tool-verify.mjs` — PASS on all 4 scenarios: write+approval, bash-tek, deny, multi-tag (both tools execute). Hermetic mkdtemp() cwd.
  - ✅ `scripts/repl-smoke-verify.mjs` — PASS on all 7 checks (/help-quick, status-line, perf-reuse, layout-separation, terminal-mode, perms-auto-approve, slash-menu). No cwd override (runs dist/cli/entry.js against real repo dir via piped non-TTY stdio) but verified via before/after md5+line-count of .deckent/settings/repl-history that it does not persist to real project state. Re-ran once for verification, identical PASS result both times.
  - ✅ `scripts/chat-native-smoke.mjs` — PASS on all 4 (flow-simulation, tool-round-trip, persist, exit). Fully in-memory simulation, no real CLI spawn, no state risk.
  - ✅ `manual: printf '/help\n' | node dist/cli/entry.js chat --native --once` — Rendered full /help catalog (Komutlar list + trust-badged Core/Danger Actions catalog) and exited cleanly with code 0 after the single turn (maxTurns:1 in --once mode). No fall-through to LLM/provider; slash interception confirmed to happen ahead of the native provider round-trip, consistent with chat-native.ts's handleReplCommand gate.
- **Davranışsal bulgular:**
  - dist/cli was STALE at probe start: git log -1 for src/cli/repl+src/cli/commands showed last commit 2026-07-07 12:17:12, but there are 8 UNCOMMITTED modified files (chat-slash-registry.ts, app.tsx, input-bar.tsx, native-agent-bridge.ts, native-transport.ts, run.tsx, term-mode.ts, trace-wire.ts) with mtimes up to 22:23:31. The first dist/cli build snapshot I captured was 21:05:05 — i.e. dist did NOT yet contain the edits to app.tsx, input-bar.tsx, run.tsx, term-mode.ts, chat-slash-registry.ts made after that build (those five files were touched at 22:22-22:23, ~77-146s after the 21:05 build). native-agent-bridge.ts/native-transport.ts/trace-wire.ts were touched before 21:05 so were already reflected.
  - CONTRADICTS a naive 'dist is stale, tests exercise old code' assumption in one respect: a background rebuild completed DURING this probe (dist/cli/entry.js and all repl/commands .js outputs re-timestamped to 22:32:28, after every uncommitted src edit), so by the time the four verify harnesses and the manual smoke actually ran, dist/cli/entry.js was fresh and did reflect the current uncommitted working-tree state. This is a live, actively-built environment (some other agent/process is compiling and using the REPL concurrently) — freshness is a moving target, not a fixed fact.
  - All four harnesses PASS against the (now-fresh) build: ink-pty-native-verify.mjs -> PASS (tool round-trip: confirm card, proof file write, artifact in scrollback); ink-pty-tool-verify.mjs -> PASS on all 4 scenarios (write+approval, bash-tek, deny, multi-tag); repl-smoke-verify.mjs -> PASS on all 7 checks (/help-quick, status-line, perf-reuse, layout-separation, terminal-mode, perms-auto-approve, slash-menu); chat-native-smoke.mjs -> PASS on all 4 (flow-simulation, tool-round-trip, persist, exit). None hung; all completed in well under the 45s timeout.
  - Manual smoke `printf '/help\n' | node dist/cli/entry.js chat --native --once` renders the full /help catalog immediately (Komutlar list + trust-badged 'Actions' catalog with Core/Danger tiers) rather than falling through to the LLM/provider — confirms slash-command interception happens before the native provider round-trip, matching the code path seen in src/cli/commands/chat-native.ts (handleReplCommand intercepts before enterprise+registry dispatch). Exit code 0, no stray stack traces or warnings.
  - State-safety check: .deckent/settings/repl-history and several unrelated src/tests files show as modified/untracked in `git status`, but this is from a genuinely concurrent LIVE user session in this same repo (Turkish-language conversational entries about REPL responsiveness/model switching, clearly not automated-test strings) — confirmed NOT caused by this probe: (1) ink-pty-native-verify.mjs and ink-pty-tool-verify.mjs run in hermetic mkdtemp() cwds per ADR-087, never touching the real project dir; (2) chat-native-smoke.mjs is fully in-memory, no CLI spawn at all; (3) repl-smoke-verify.mjs spawns dist/cli/entry.js with piped (non-TTY) stdio and no cwd override (so it does run against the real repo dir), but I re-ran it and captured repl-history's line count/md5 before and after — both were identical (42 lines, same hash) both times, proving its piped/non-TTY invocation does not persist to repl-history. No writes to tracked project state were caused by this probe.


## Ölçülmüş Coverage (tahmin yok)
- Bulgu→test eşlemesi: **1 kapsanıyor · 14 kısmi · 59 kapsanmıyor** (n=74)

  Kapsanmayan (ilk 20):
  - Backspace/Delete/Left/Right operate on raw UTF-16 code units, splitting astral-plane chara
  - Native-engine runTurn overwrites (not accumulates) 'usage' stat across a multi-round turn
  - switchTo() crashes the REPL on an invalid /provider name via unguarded rebuild(next)
  - initReplMcpBridge()'s mcp_client_enabled gate is dead code — real run.tsx path auto-connec
  - Persistent claude child spawn has no 'error' listener — ENOENT crashes the REPL process
  - defaultSubscriptionSpawn (chat --native) also lacks an 'error' handler
  - Interactive chat --native/--local REPL omits gracefulErrors:true
  - /clear is a silent no-op on the default persistent-session REPL
  - Flat 30s SPAWN_TIMEOUT_MS kills deckent_plan / deckent_audit prematurely
  - Hardcoded Turkish user-facing strings in confirm-prompt/tool-error paths bypass i18n
  - primaryResource() reads args['command'] but deckent_bash's schema key is 'cmd'
  - SLASH_CATALOG's agentic commands are undispatched on the default native-agent REPL engine
  - Parallel tool_use round-trip splits sibling tool_results into separate user messages
  - /model and /provider bypass the busy gate, can splice two backends into one in-flight turn
  - resolveClaudeWireModel's own-provider guard is dead code (inferProviderFromId's unconditio
  - InputBar stays active while ApprovalCard is pending — no mutual exclusion
  - ApprovalCard's key handler ignores ctrl/meta modifier flags
  - Home/End detection checks Ink Key properties that may not exist at runtime
  - CaretText / cursor movement operate on UTF-16 code units, bisecting surrogate pairs
  - Non-EXEC (CLI-bridge) tool confirm-denial returns early, bypassing the toolSink 'honest ou


---

## Kalibrasyon Notu — bu turun dürüstlük-kanıtı

- Ham aday bulgu (iki run, slice+lens): ~171 → dedup sonrası **118**.
- İki-aşamalı doğrulama: her dilimin bulguları ayrı bir ajanca **HEAD'e karşı satır-denetiminden** geçti (kayık ref = düzeltildi/elendi); ~8 satır-ref düzeltildi, **1 fabrike cross-reference** ve birkaç spurious bulgu `keep=false` ile düştü.
- Severe (P0/P1) bulgular **bireysel adversarial refute**'a girdi: en az 3 severe aday çürütülüp elendi (bkz. tablo), 2 "P0" iddiası P1'e kalibre edildi (ApprovalCard/InputBar çift-tüketim).
- Bu, yapıştırılan review'ın üç zaafını (severity şişmesi · kayık satır-ref · uydurma %-coverage) mimari olarak engelleyen tasarımın çıktısıdır.

---

## §Ek-A — Run-A tam anlatısı (slash-agentic + render-ux dilimleri ağırlıklı)

<sub>Not: aşağıdaki iki anlatı bağımsız Fable sentezleridir; numaralandırmaları kendi içindedir. Otoriter/dedup'lu liste yukarıdadır.</sub>

5 REPL test files green (49 tests, ~565ms), none exercising the mapped defects — §6 thesis is now concrete. Writing the synthesis.

---

# Deckent Terminal (REPL) — Correctness Code-Review · Final Sentez

> HEAD `5abd2bd5` · lens R01–R10 + 5 çapraz-lens (slash-menu-vs-engine, silent-failure, resource-leak, streaming, cross-platform) · adversarial-refute + satır-denetimi + severity-kalibrasyonu sonrası.

## 1. TLDR

Deckent'in terminal (REPL) yüzeyi — `src/cli/repl/*`, `src/cli/commands/chat-*`, `src/agent/*`, `src/cli/entry.ts` — boyunca ~55 kaynak dosya / binlerce satır, 12 lens tarandı; doğrulanmış ve kalibre edilmiş **96 bulgu** kaldı: **1 P0 · 24 P1 · 41 P2 · 30 P3** (1 severe aday adversarial-refute'ta elendi, 1 çift-bulgu birleştirildi, 1 bulgu P0→P1 yeniden-etiketlendi). En ciddi üç bulgu: **(a)** çıplak `deckent` komutu, `claude` CLI kurulu değilse tüm process'i çökertir — child'da `error` listener yok (P0, `chat-session.ts:272`); **(b)** varsayılan native-agent motoru `resolveSlash`'i hiç çağırmadığı için slash menüsü büyük ölçüde tiyatro — `/kill`, `/help`, `/approve` dahil ~24 komut sessizce düz sohbet metnine dönüşüyor (P1 kök-neden, `app.tsx:853`); **(c)** bir ApprovalCard beklerken basılan her tuş hem metin girişi hem approve/deny kararı olarak çift-tüketiliyor (P1, `app.tsx`). Genel correctness sağlığı: çekirdek 8-faz orchestration sağlam, ama **terminal yüzeyi kırılgan** — bulguların ezici çoğunluğu i18n-hardcode, timeout/error-handler eksikliği, ve 2026-07-07 native-flip'inden doğan menü↔motor drift'i etrafında kümeleniyor. Kritik olan: bu bulguların **hiçbiri mevcut testlerce yakalanmıyor** — REPL test-subset yeşil koşuyor ama defect'lerin hiçbirini exercise etmiyor (§6). Live-PTY probe, aktif düzenlenen dosyalarda (loop/app) satır-drift'i ortaya çıkardı ancak her bug'ın drift'e rağmen sürdüğünü doğruladı (§7).

## 2. P0 / P1 BULGULAR (severe, adversarial-onaylı)

### P0-1 · Varsayılan persistent-REPL child'ında `error` listener yok → `claude` CLI eksikse process çöker
- **file:line** — `src/cli/commands/chat-session.ts:272` (spawn) / `:289` (yalnız `close` listener). *Probe-doğrulandı: `:289`'da sadece `child.once('close', ...)`, dosyada hiçbir `child.on/once('error')` yok.*
- **failure_scenario** — Çıplak `deckent` (arg'sız) → `entry.ts:842 launchDefaultRepl()` → `createPersistentClaudeSession` (`entry.ts:452-460`, `resolveChatProvider` default'u 'claude', `config.ts:98-113`). PATH'te `claude` binary yoksa child async ENOENT `error` event'i fırlatır, sıfır listener → Node uncaughtException. Bu path `buildProgram()`/`installFatalHandlers` (`index.ts:83-84`)'ı geçmez, dolayısıyla custom FATAL banner değil, Node'un **default** uncaughtException davranışı (stderr stack + exit 1) tetiklenir. Kardeş handler `chat.ts:595`'te doğru pattern'i uyguluyor → bu tekil bir eksiklik.
- **neden-gerçek** — `claude` CLI kurulu-değil, milyonlarca ilk-çalıştırma ortamı için tamamen makul bir durum; ürünün en temel giriş noktası.
- **coverage** — **YOK.** `tests/cli/chat-session-persistent.test.ts` yalnız `true` binary'siyle başarı-yolu smoke; ENOENT case yok.
- **fix yönü** — `defaultPersistentSpawn` child'ına `child.once('error', ...)` ekleyip hatayı graceful bir provider-hatasına çevir (kardeş `chat.ts:595` pattern'i).

---

### Slash-menü ↔ motor drift'i — TEK KÖK-NEDEN, 6 P1 yüzeyi (headline)
> Bunlar 6 ayrı arıza değil; 2026-07-07 native-flip'inden (`376-003`, `run.tsx` yorumu) doğan **tek regresyon**. Varsayılan native-agent motoru (`app.tsx:853 if (nativeEngine) {`, probe'da `:850`'den `:853`'e drift) turn-loop'unda `resolveSlash`'i hiç çağırmaz — `resolveSlash` yalnız legacy `chat-native.ts:843`'te var, `app.tsx` onu import bile etmez. Definitif komut-listesi §5'te.

- **P1-cluster/a** — `app.tsx:853` (`~850`): native motor `resolveSlash` dispatcher'ını bypass eder; native-tool-registry yalnız 6 CLI-bridge tool (`deckent_status/history/retro/doctor/models/review`) kaydeder → diğer ~18 agenticTool komutu düz sohbete düşer.
- **P1-cluster/b** — `chat-slash-registry.ts:111` `/help`: hiçbir `agenticTool`'u yok; tek handler'ı bypass edilen `chat-native.ts:843` → en temel onboarding komutu default motorda sessizce çalışmaz.
- **P1-cluster/c** — `app.tsx:1033`: `handleSubmit` yalnız ~15 komutu özel-durum yapar; kalan ~27 SLASH_CATALOG girişi `queue.enqueue`'a düşer.
- **P1-cluster/d** — `run.tsx:439`: native motor `memory` almaz → sohbet hiç persist edilmez → `/resume` az önceki konuşmayı gösteremez (`memory.listChatSessions()` boş satır döndürür).
- **P1-cluster/e** — `app.tsx:1020` `/approve suggest|auto-edit|full-auto`: `setApprovalMode` çağrı-sitesi yok (`agent/session.ts:43` tanımlı ama sıfır caller); status-bar `⚡full-auto` gösterir ama native session `policy.defaultMode`'da donuk kalır.
- **P1-cluster/f** — `chat-native.ts:646` `/clear`: persistent-session'da yalnız JS transcript'i (`transcript.length = 0`) siler; warm child'ın gerçek context'i dokunulmaz → komut sessizce no-op.
- **failure_scenario** — `ANTHROPIC_API_KEY` set (ürünün belgelenmiş birincil modu) kullanıcı `/kill` veya `/help` yazar → LLM'e düz metin olarak gider, eşleşen tool yok → model prose ile yanıtlar, komut hiç çalışmaz, hata yok.
- **coverage** — **YOK** (tüm alt-yüzeyler). `native-stabilization-proof.test.ts` yalnız FAKE nativeEngine üzerinden FIFO/stream test eder; `help-surface-wire.test.ts` legacy `runChatNativeLoop`'u test eder (bypass edilen path'i değil).
- **fix yönü** — `app.tsx`'in native-engine turn-loop'una submit-öncesi `resolveSlash` interception katmanı ekle (legacy path'le aynı dispatcher'ı paylaştır); persistled/session-scoped tool'ları native registry'ye köprüle.

---

### P1-1 · InputBar ↔ ApprovalCard karşılıklı-dışlama yok — tuş çift-tüketiliyor
- **file:line** — `src/cli/repl/app.tsx:1121` (`InputBar active={confirm === null}`) — *probe: `approvalPending` `:690`'da declare, yalnız `:1117` footer'da tüketiliyor; InputBar onu referans etmiyor.* ApprovalCard'ın kendi `useInput`'u yalnız `{ isActive: head !== null }`'a bağlı (`approval-card.tsx:260`), `confirm`'den bağımsız.
- **failure_scenario** — Worker high/critical-risk onay talebi (örn. `rm -rf ./build`) gönderir, ApprovalCard render olur. InputBar'ın `active`'i hâlâ `true` (confirm===null), ApprovalCard `useInput`'u da aktif → aynı Ink stdin event'i için **iki handler eş-zamanlı**. Kullanıcı sıradan bir mesaj yazarken 'y' harfi (`"yes, let's continue"`) → `mapApprovalKey('y')==='approve'` (`approval-card.tsx:137`) yıkıcı worker eylemini sessizce onaylar, aynı karakter InputBar buffer'ına da yazılır.
- **neden-gerçek** — `config.ts:1734 repl_surface ?? { enabled: true, approvals: true }` → onaylar taze/ayarsız projede **default AÇIK** (`run.tsx:134 approvalsEnabled`); pending-approval, aracın çok-agent sprint akışının normal bir eş-zamanlı durumu.
- **coverage** — **YOK.** `approval-card.test.tsx` yalnız queue sıralama/cascade mantığını test eder, ham key-mapping'i veya InputBar ile mutex'i değil.
- **fix yönü** — InputBar `active`'ini `confirm === null && !approvalPending` yap; ApprovalCard `isActive`'ini de karşılıklı gate et.
- **§8 not** — Bu bulgu `P0:` array'inde geldi ama kendi `reason`'u *"capped this at P1 rather than P0"* diyor; kalibre edilmiş değer **P1**; array-etiketi bayat (§8).

### P1-2 · Backspace/Delete/Left/Right ham UTF-16 code-unit üstünde çalışır — surrogate pair'i böler
- **file:line** — `src/cli/repl/line-edit.ts:59` (backspace), `:60-62` delete, `:63-66` left/right — hepsi ham-index aritmetiği. Code-point-safe `cursor-model.ts` fix'inin `src/` içinde SIFIR importer'ı var (dead).
- **failure_scenario** — Kullanıcı 🚀 (U+1F680, 2 index) yazıp bir kez Backspace → `slice(0, cursor-1)` yalnız high-surrogate'i siler, dangling low-surrogate kalır → mojibake / submit'te U+FFFD.
- **coverage** — **YOK.** `line-edit.test.ts` (probe: 22 test yeşil) yalnız ASCII buffer; surrogate case yok.
- **fix yönü** — `[...buffer]` code-point iterasyonuyla düzenle (kod tabanının kendi `truncateQueuePreview`/`cursor-model.ts` precedent'i) ve input-bar'a wire et.

### P1-3 · Yapıştırma kontrol-byte filtresi yalnız ilk code-unit'e bakar — terminal-escape injection
- **file:line** — `src/cli/repl/line-edit.ts:80` (`if (ch.charCodeAt(0) < 0x20 && ch !== '\t') return {state}`). `normalizePasted` (`input-history.ts:135`) tanımlı ama SIFIR caller (dead).
- **failure_scenario** — `\r`/`\n` içermeyen bir paste (`'go run main.go\x1b[2J\x1b[31mFAKE PROMPT'`); ilk char 'g' (0x67) → tüm string, embed escape byte'ları dahil, buffer'a girip Ink `<Text>` ile ham render → terminal escape'leri yorumlar (ekran-temizleme/renk/sahte-prompt).
- **coverage** — **YOK.** `line-edit.test.ts` yalnız tek-char 'escape' test eder, embed-kontrol-byte'lı çok-char paste'i değil.
- **fix yönü** — default (paste) branch'te sequence'ın **tüm** code-unit'lerini tara/strip et (mevcut `normalizePasted`'i wire et).

### P1-4 · `MAX_CODE_BLOCK_LINES` force-flush mode'u fence-ortasında 'prose'a resetler → yanıtın kalanı bozulur
- **file:line** — `src/cli/repl/stream-segmenter.ts:80` (force-flush + `mode='prose'`), sabit `:44 MAX_CODE_BLOCK_LINES=200`.
- **failure_scenario** — Model, gerçek kapanış ``` gelmeden 200 satıra ulaşan tek code-block stream'ler (büyük dosya/diff dump'ı) → güvenlik-cap erken flush + reset yapar, gerçek kapanış ``` satırı YENİ code-block açar sanılır (`:88`), turn'ün kalan prose'u yanlış-render.
- **coverage** — **YOK.** `stream-segmenter.test.ts` (probe: 8 test yeşil) 200-satır eşiğine ulaşmıyor.
- **fix yönü** — Force-flush'ta `mode`'u 'code'da tut (fence-devam durumu), yalnız gerçek kapanış-fence'te 'prose'a dön.

### P1-5 · `defaultSubscriptionSpawn` da `error` handler'sız — belgelenmiş ENOENT case'i için `gracefulErrors`'ı boşa çıkarır
- **file:line** — `src/cli/commands/chat-native.ts:1156` (spawn) / `:1166` yalnız `close`. `:231-239` 'spawn ENOENT'i `gracefulErrors:true`'nun yakalaması gerektiğini belgeler; try/catch (`:1028-1077`) yalnız promise-rejection'ı yakalar, `error` event'ini değil.
- **failure_scenario** — `deckent chat --native` (NO_PROVIDER_MESSAGE'ın host-CLI'siz kullanıcıya önerdiği fallback), `claude` yoksa child `error` fırlatır → try/catch'i bypass, process çöker.
- **coverage** — **YOK.** `chat-native-provider.test.ts` yalnız `true`-binary smoke.
- **fix yönü** — `error` listener ekle, hatayı graceful turn-error'a çevir.

### P1-6 · Interaktif `chat --native/--local` REPL `gracefulErrors: true`'yu atlar — mid-session rejection tüm session'ı öldürür
- **file:line** — `src/cli/commands/chat.ts:523` (interactive `runChatNativeLoop` çağrısı) — `isOnce` branch'i (`:501-510`) `gracefulErrors:true` set ederken bu branch atlar; `chat-native.ts:1065` falsy'de rethrow eder.
- **failure_scenario** — `--local` altında Ollama mid-session restart (geçici provider rejection, gerçek Promise-rejection) → `--once` dışında yakalanmaz, session çöker.
- **coverage** — **YOK.** `commands/chat.test.ts` yalnız dispatcher-identity/maxTurns kontrol eder.
- **fix yönü** — Interactive çağrıya da `gracefulErrors: true` ekle.

### P1-7 · Aşırı-geniş NL intent regex'leri sıradan sohbet turn'lerini sessizce tool-call'a çevirir
- **file:line** — `src/cli/commands/chat-agentic-dispatch.ts:63` (STATUS_RE), `:65` (RECALL_RE) — anchor/uzunluk guard'ı yok. Node-repro: `STATUS_RE.test("bu durumda ne yapmalıyım?")→true`, `RECALL_RE.test("şimdi kısa bir ara verelim")→true`. Default-on: `app.tsx:881` + `chat-bridge.ts:410 agenticDispatch:true`.
- **failure_scenario** — TR kullanıcı 'durum...' veya 'ara' içeren sıradan cümle yazar → `deckent_status`/`deckent_memory_query`'e reclassify, 'Oku' tier confirm'siz dispatch (`command-registry.ts:94/152`), gerçek turn hiç gönderilmez, bildirim yok.
- **coverage** — **YOK.** `chat-agentic-dispatch.test.ts` no_match case'i yalnız alakasız genel cümle; trigger-keyword'lü adversarial ifade yok.
- **fix yönü** — Regex'leri kelime-sınırı/anchor ile daralt; kısa-cümle NL-dispatch'e min-uzunluk/güven eşiği koy.

### P1-8 · REPL `/nervous accept|reject` executor'ı hiç haberdar etmez, daima sahte 'success' loglar
- **file:line** — `src/cli/commands/chat-nervous-bridge.ts:190` (`appendNervousHistory`, outcome:'success' hardcode `:71`) — `NervousIpcQueue.writeApproval`/`isNervousPollerAlive` çağrısı yok. Kardeş `nervous.ts:307-379` doğru IPC'yi yapar (W0-TRUTH #491).
- **failure_scenario** — Canlı nervous executor varken `/nervous accept <id>` → item splice edilir + yeşil onay gösterilir, ama executor kararı öğrenmez, altta yatan eylem hiç çalışmaz.
- **coverage** — **YOK.** `repl-nervous-wire.test.ts` pending-list kaldırma + output metnini assert eder, executor-bildirimini değil.
- **fix yönü** — `nervous.ts`'in IPC-dispatch + false-success-önleme mantığını bu bridge'e ayna yap.

### P1-9 · Düz 30s `SPAWN_TIMEOUT_MS`, `deckent_audit`/`deckent_plan`'i kendi belgelenmiş normal süresinde öldürür
- **file:line** — `src/cli/commands/chat-tool-bridge.ts:81` (`SPAWN_TIMEOUT_MS = 30_000`, probe-doğrulandı). `deckent_audit` default action 'gate' (`:173-178`), `isDetachedCommandClass`'ta değil; kod-yorumu `:74-75` bu action'ı '30-60s+' olarak belgeler.
- **failure_scenario** — Sıradan `/audit` (veya `deckent_audit` gate) 30s'yi normal koşulda aşar → SIGKILL + `[mcp-error] ... timed out after 30s`. `deckent_plan` ikincil, workload-bağımlı örnek (gerçek default `BRAIN_PLAN_TIMEOUT_MS=900000`).
- **coverage** — **YOK.** `chat-tool-bridge.test.ts`'te timeout testi yok.
- **fix yönü** — Provider-backed/uzun-koşan tool sınıfına (audit-gate, plan) ayrı, uzun/konfigüre-edilebilir timeout ver veya detached-class'a al.

### P1-10 · write/edit/bash confirm-prompt ve tool-error path'lerinde hardcoded Türkçe string'ler — i18n bypass
- **file:line** — `src/cli/commands/chat-tool-exec.ts:43` (`summarize()`, 'Dosya yaz:'/'Dosya düzenle:'/'Komut çalıştır:'), error'lar `:109,115,122,127,133`. Dosyada `lang`/`getMessage` SIFIR. CLAUDE.md:41-44 hardcode'u açıkça yasaklar.
- **failure_scenario** — İngilizce-configured kullanıcı `deckent_write_file`/`edit`/`bash` tetikler → confirm-prompt ham Türkçe. Production wiring: `entry.ts:706`, `run.tsx:274`, `agentic-worker-runner.ts:328`, `http-agentic-worker.ts:227`.
- **coverage** — **YOK.** `chat-tool-exec.test.ts` (probe: 7 test yeşil) Türkçe substring'leri ('yazıldı') beklenen sonuç olarak assert eder.
- **fix yönü** — `summarize()` ve error'ları `getMessage(key, lang)`'e taşı, label'ları caller'dan enjekte et.

### P1-11 · `chat-enterprise-bridge.ts` defaultSpawnFn'de timeout YOK (ve `reject` yok) — hung `/audit` turn'ü sonsuza dek dondurur
- **file:line** — `src/cli/commands/chat-enterprise-bridge.ts:56` (`new Promise((resolve) => {...})`, reject/setTimeout/kill yok, yalnız `:68 close`).
- **failure_scenario** — Çıplak `/audit` (subaction'sız) → `resolveAuditSlash {action:'none'}` (`chat-slash-registry.ts:447-449`) → `chat-native.ts:905-928` enterprise-bridge'e düşer. Provider hang ederse promise asla settle olmaz; `for await (const rawLine of input)` (`chat-native.ts:636`) bunu await ettiğinden REPL yanıtsız kalır.
- **coverage** — **YOK.** `chat-enterprise-bridge.test.ts`'te hang testi yok.
- **fix yönü** — Kardeş `chat-tool-bridge.ts`'in SPAWN_TIMEOUT + SIGKILL pattern'ini bu spawnFn'e ekle (+ `reject`).

### P1-12 · CLI subprocess exit-code hiç incelenmez — başarısız subscription çağrısı boş-yanıtlı başarı olarak raporlanır
- **file:line** — `src/cli/commands/chat-provider-parity.ts:77` (`await wait;` sonra koşulsuz `return { text, stopReason:'end_turn' }`); `stream()` aynı (`:89`). `wait` `{exitCode}`'a resolve olur ama hiç okunmaz.
- **failure_scenario** — Expired-auth/rate-limit/crash → non-zero exit, yalnız stderr'e yazar; stdout boş → REPL boş başarılı turn gösterir, hata surface edilmez. 3 CLI provider (claude/codex/gemini) için default path.
- **coverage** — **YOK.** `repl-provider-parity.test.ts` fake-spawn daima exitCode:0 döndürür.
- **fix yönü** — `wait`'in exitCode'unu branch'le; non-zero'da stderr'i içeren hata surface et.

### P1-13 · `subscriptionEnv()` codex için `OPENAI_API_KEY`/`DECKENT_OPENAI_API_KEY`'i strip etmez (claude+gemini eder)
- **file:line** — `src/cli/commands/chat-provider-parity.ts:51-63` — OPENAI/codex key'ine SIFIR referans; `provider-auth-probe.ts:257-260` OPENAI key varlığını codex için 'api auth' zorlar.
- **failure_scenario** — `OPENAI_API_KEY` shell'de set (OpenAI-tooling kullanan geliştiricide yaygın) + codex REPL provider seçimi → child hâlâ key'i görür → subscription/OAuth yerine API-key billing (subscription-auth tasarım-hedefini bozar).
- **coverage** — **YOK.** `repl-provider-parity.test.ts` yalnız claude ANTHROPIC strip'ini test eder.
- **fix yönü** — codex branch'i için OPENAI/DECKENT_OPENAI key'lerini de sil (claude/gemini simetrisi).

### P1-14 · `primaryResource()` `args['cmd']`'i hiç okumaz (bash'in şema-arg'ı) → bash çağrılarında resource=''
- **file:line** — `src/agent/loop.ts:48` → *probe-drift: gerçek `:62`* (`const v = args['path'] ?? ... ?? args['command'] ?? ...`). `native-tool-registry.ts:99` yalnız `cmd` declare eder. `permission-store.ts:114-122 grant()` 'always' rule'ları kalıcı diske yazar.
- **failure_scenario** — Native agent bash'i `{cmd:'...'}` ile çağırır → her deny-rule sessizce eşleşmez (resource=''); kullanıcı prompt-yorgunluğunu azaltmak için 'always' seçerse `loop.ts:145` `pattern:'**'` diske yazar → sınırsız confirm'siz shell, kalıcı.
- **coverage** — **YOK.** Testlerde `primaryResource` referansı yok.
- **fix yönü** — `args['cmd']`'i öncelik listesine ekle; `grant` pattern'ini boş-resource'ta '**'e genişletme.

### P1-15 · Context-budget compaction, tek mesajı orphaned tool-result olan pencere emitleyebilir → provider 400 reddi
- **file:line** — `src/agent/context-budget.ts:69` (pairing-safety guard `start < messages.length - 1` tek-mesaj-tutulan durumda hiç ateşlenmez). *Not: dosya git'te untracked (`?? src/agent/context-budget.ts`) ama tracked dosyalara canlı-wire (`loop.ts:22,96-107`, `run.tsx:446`, Ollama default 24k token `native-transport.ts:199`).*
- **failure_scenario** — `deckent_read_file` (cap'siz, `chat-tool-exec.ts:111`) tek başına budget'ı aşan büyük dosya okur → backward-walk son mesajı koşulsuz tutar, orphan 'tool' penceresi → `toAnthropicMessage` eşleşmeyen tool_result üretir, `validateProviderRequest` pairing kontrol etmez → wire'a malformed istek → 400, turn 'error'.
- **coverage** — **YOK.** `context-budget.test.ts` transcript'i daima assistant mesajıyla bitirir.
- **fix yönü** — Tek-mesaj-tutulduğunda orphan tool-result'ı içeren pencereyi reddet/önceki assistant'ı da zorla-tut.

### P1-16 · `deckent_bash` default spawn'unda timeout/cancellation yok — hanging komut turn'ü sonsuza dek dondurur
- **file:line** — `src/cli/commands/chat-tool-exec.ts:56-67` (`defaultBashRun`, yalnız close/error, setTimeout/kill yok). Her iki çağrı-sitesi override geçmez: `native-tool-registry.ts:323`, `run.tsx:291` (*bulgu :274 dedi, drift*).
- **failure_scenario** — Agent uzun-yaşayan/hanging komut çalıştırır (dev-server/watch), kullanıcı confirm'i onaylar (bash SIDE_EFFECTING) → tüm turn + REPL hang, process-kill dışında kurtuluş yok. Kardeş `chat-tool-bridge.ts:81` bu modu 30s+SIGKILL ile korurken bu path korumasız.
- **coverage** — **YOK.** `chat-tool-exec.test.ts` daima mock `bashRun` enjekte eder.
- **fix yönü** — Konfigüre timeout + AbortController/kill; tool-dispatch await'ine per-call race.

### P1-17 · Turn-sonu reconciliation daha-uzun `resultText`/`assistantText`'i ekrana catch-up yield'siz `collected`'a swap eder
- **file:line** — `src/cli/commands/chat-session.ts:522` (`collected`'ı `resultText`/`assistantText` daha uzunsa koşulsuz değiştirir); catch-up yield yalnız `collected.length===0`'da (`:515-517`), nonzero-partial'da yok. Yorum `:358-361` 'Delta streams can be partial' der.
- **failure_scenario** — Persistent-claude streaming'de delta'lar final'den az raporlarsa → ekran kısa delta'yı gösterir, ama transcript (bir sonraki turn'e giden) + chat-memory (`/resume`) daha-uzun reconciled metni sessizce içerir → görülen ≠ kaydedilen.
- **coverage** — **partial.** `chat-session-stream-collect.test.ts` reconciliation'ı final-text için test eder ama streamed-chunk-toplamı == final assert'i yok.
- **fix yönü** — Reconciled diff için ekrana catch-up yield ekle (nonzero-partial branch).

## 3. P2 BULGULAR (latent/edge)

| file:line | başlık | tetikleyici |
|---|---|---|
| `repl/provider-switch.ts:77` | `switchTo()` guard'sız — geçersiz `/provider` adı uncaught throw | Legacy-loop'ta `/provider foo` typo'su |
| `commands/chat-render.ts:146` | İç inline-code/link RESET dış heading/bold'u satır-sonuna dek keser | Heading/bold içinde inline-code veya link (default Ink path) |
| `repl/approval-card.tsx:233` | Key-handler ctrl/meta flag'lerini yoksayar → Ctrl+A/N/D approve-all/deny/details | ApprovalCard beklerken Ctrl+letter chord |
| `repl/input-bar.tsx:88` | Home/End Ink'in hiç set etmediği key-prop'a bakar → kalıcı sessiz no-op | Home/End tuşu |
| `repl/input-bar.tsx:98` | CaretText buffer'ı UTF-16 unit ile dilimler → cursor'da surrogate böler | Emoji + arrow-nav |
| `repl/run.tsx:313` | Confirm-deny erken return → EXEC_TOOLS toolSink 'honest outcome' bloğunu atlar | ALWAYS_CONFIRM tier (kill/cleanup) deny |
| `repl/app.tsx:721` | `clearScreen`/`/clear` ANSI-clear emit etmez → `<Static>`'a flush edilmiş içerik silinmez | `/clear` veya Ctrl-L, önceki turn'ler varken |
| `repl/input-history.ts:107` | HistoryNavigator iki Up/Down arası buffer-edit'i atar | Recall→düzenle→tekrar-navigate |
| `repl/input-queue.ts:59` | Duplicate-Enter guard'ı `/steer` drain rebuild'inde meşru aynı-girdiyi yutar | `repl_surface.enabled=true` + aynı-metin queue+steer |
| `repl/native-agent-bridge.ts:145/163` | `usage` istatistikleri overwrite (accumulate değil) → multi-hop turn'de token under-count *(iki lens aynı bug, birleştirildi)* | `DECKENT_NATIVE_AGENT=1` + ≥1 tool-call'lı turn |
| `repl/tool-permissions.ts:64` | `classifyTool` catch-all 'read' `deckent_start/run/process`'i özel-durumlamaz | Legacy-loop + NL-classifier bu tool'ları emit |
| `repl/tool-permissions.ts:95` | `classifyExternalTool` saf prefix-heuristic → `check_out`/`get_and_delete` auto-approve | Bağlı external MCP + yanıltıcı read-prefix'li yıkıcı tool |
| `repl/provider-switch.ts:79` | `void teardown(prev)` in-flight send/stream sürerken fire-and-forget | Streaming ortası `/provider x` |
| `commands/chat.ts:58` | Provider-detect/spawn string'leri hardcoded İngilizce (aynı dosyada getMessage var) | Herhangi non-EN kullanıcı |
| `commands/chat-slash-registry.ts:350` | `/help` (`renderHelp`) daima hardcoded Türkçe | EN session `/help` |
| `commands/agentic-confirm.ts:46` | Caller'ın readline'ı aktifken ikinci `readline.Interface` açar | `DECKENT_INK=0`/`chat --native` + `/autonomous status`/`/usage` |
| `commands/chat-tool-bridge.ts:109` | defaultSpawnFn'de `error` listener yok → ENOENT/EMFILE process çökertir | Bozuk kurulum ENOENT / fd-exhaustion |
| `commands/chat-tool-exec.ts:86` | `inScope()` saf lexical (`path.relative`), symlink resolve etmez | bash ile symlink dik + read-file |
| `commands/chat-tool-exec.ts:127` | `edit_file` yalnız İLK occurrence'ı değiştirir; boş `old` `new`'i prepend eder | Çok-occurrence snippet / boş `old` |
| `commands/chat-render.ts:134` | Link-regex dengeli-parantezli URL'i keser, stray `)` bırakır | Wikipedia-tarzı parantezli URL |
| `commands/chat-permissions.ts:57` | `writePermissions` diskteki eşzamanlı grant'ları üzerine yazar | İki eşzamanlı REPL, aynı proje |
| `commands/chat-render-region.ts:68` | `writeAbove` yalnız mevcut satırı temizler → wrap'lı input'ta stale kalır | Legacy readline (`DECKENT_INK=0`) + wrap'lı input |
| `commands/chat-render-region.ts:87` | `THINKING_VERBS`/`TOOL_VERBS` hardcoded Türkçe | Legacy path, non-TR |
| `commands/chat-banner.ts:35` | `renderBanner` hardcoded Türkçe hint | Legacy path, non-TR |
| `agent/guards/self-modifying.ts:21` | Absolute-path write, relative source-prefix `startsWith`'i bypass eder → elevation atlanır | dogfood-repo + auto-edit/full-auto + absolute path |
| `agent/loop.ts:150` | `cancel()` in-flight tool handler'ı kesemez (no abort-check) | Uzun bash sürerken `session.cancel()` |
| `agent/provider-tooluse/openai.ts:47` | Sentezlenen tool-call ID'leri per-request → id-emit-etmeyen backend turn'ler arası tekrar | Self-hosted/id-vermeyen OpenAI-compat backend |
| `agent/transcript.ts:11` | Truncation/eviction yok — history sınırsız büyür, her round tam resend | Çok-turn uzun native session → context-length aşımı |
| `entry.ts:333` | `buildCliStream` NDJSON mode-lock'ta `delta===null` fallback'i yok → içerik düşer | codex/gemini + '{' ile başlayan non-assistant JSON satırı |
| `entry.ts:200` | `subscriptionReplEnv()` Gemini API-key env'lerini strip etmez (SSOT eder) | `GEMINI_API_KEY` set + gemini provider |
| `entry.ts:233` | Ollama-erişilemez hatası hardcoded Türkçe | ollama provider + daemon kapalı |
| `entry.ts:687` | Legacy (`DECKENT_INK=0`) confirm-hint hardcoded Türkçe (localized `tui.confirm_hint` var) | `DECKENT_INK=0` + non-TR |
| `entry.ts:797` | SIGTERM/SIGINT handler persistent REPL session'ı bilmez → orphan child | `docker stop`/supervisor SIGTERM |
| `entry.ts:708` | Off-TTY (piped stdin) her side-effecting tool-call'ı confirm'siz auto-approve | `cat untrusted.txt \| deckent` |
| `commands/chat-slash-registry.ts:199` | `/nervous /interrogate /resume /mcp` yorumları 'pre-registry interception' garanti eder — native-flip'te yanlış | Default motorda `/nervous`/`/mcp` |
| `repl/app.tsx:866` | Native turn-loop'undan kaçan exception yutulur, REPL sessizce çıkar | Yazılamaz `.deckent` dizini + 'always'-grant persist |
| `repl/native-tool-registry.ts:375` | Empty-string (undefined değil) description'lı MCP tool tüm REPL launch'ını çökertir | Bağlı MCP server `description:''` döndürür |
| `repl/dual-stream.ts:54` | `truncateToWidth`/live-footer `truncate` UTF-16 unit ile keser | Footer'da astral-char + dar terminal |
| `repl/app.tsx:722` | Stream ortası `/clear` turn'ü iptal etmez → kalan output phantom '● deckent' altında geri-doldurur | Streaming sürerken `/clear` |
| `api/terminal/session-manager.ts:34` | Web/API terminal 'shell' `SHELL` yoksa hardcoded 'bash'e düşer | Native Windows dashboard/API terminal |
| `entry.ts:807` | SIGTERM handler Windows'ta hiç ateşlenmez → sprint/tmux temizlenmez | Windows `taskkill`/service-stop |

## 4. P3 NİT LİSTESİ

| file:line | nit |
|---|---|
| `repl/input-bar.tsx:181` | Trailing-newline paste, in-memory history'ye guard'sız boş satır push eder (disk temiz) |
| `repl/run.tsx:412` | `ReplErrorBoundary` `label` prop'suz mount → fallback daima İngilizce |
| `repl/busy-controls.ts:158` | `/queue //interrupt /steer` case-sensitive (komşular case-insensitive) |
| `repl/line-edit.ts:55` | Whitespace-only submit → phantom in-memory (disk-dışı) history girdisi |
| `repl/stream-segmenter.ts:83` | Table-mode buffering'de code-fence gibi length-cap yok |
| `repl/native-agent-bridge.ts:179` | Bg-turn drain, tek `onTurnEnd` closure'ını (fixed startMs) reuse eder (unreachable/unwired) |
| `repl/native-tool-registry.ts:280` | `deckent_describe_tool` her tool için boş params (z.record; dead — tool_surface kapalı) |
| `repl/native-agent-bridge.ts:142` | Tool-result verb metni fail'de bile '(tool ran)' (fail yalnız flag/stil ile) |
| `repl/mcp-bridge.ts:90` | `initReplMcpBridge`/`isMcpClientEnabled` sıfır caller; gerçek boot `mcp_client_enabled`'ı hiç danışmaz |
| `commands/chat-repl-ux.ts:147` | `createReplLines` + yardımcıları dead code (sıfır production caller) |
| `commands/chat-native.ts:894` | `[slash]/[agentic] cancelled` mesajları hardcoded İngilizce |
| `commands/chat-slash-registry.ts:383` | `slugifyBacklogId` non-ASCII'yi transliterasyon yerine düşürür → id-çakışma (explicit-error'la yakalanır) |
| `commands/chat-slash-registry.ts:347` | `/help` sütun-genişlik yorumu (12) gerçek `padEnd(10)` ile uyumsuz |
| `commands/chat-slash-registry.ts:369` | `slashCompleter` case-sensitive (dispatch/menü-filtre değil) |
| `commands/chat-slash-registry.ts:491` | `/usage /resources` subaction-flag'leri case-sensitive |
| `commands/chat-slash-registry.ts:669` | `split(/\s+/)`+`join(' ')` slash-payload'daki çoklu-boşluğu sessizce daraltır |
| `commands/chat-tool-exec.ts:58` | `deckent_bash` `spawn('bash', ...)` hardcode — native Windows'ta çalışmaz (tagged-error ile fail) |
| `commands/chat-tool-bridge.ts:364` | `[mcp-error] tool not allowed` hem izinsiz tool hem eksik-arg'lı izinli tool için |
| `commands/chat-render-region.ts:55` | `safePrompt` `rl.prompt`'un TÜM exception'larını yutar |
| `commands/chat-status-line.ts:40` | `renderStatusLine` tam-implemente ama hiç çağrılmaz |
| `commands/chat-render-region.ts:279` | `createLineQueue` async-generator hiç invoke edilmez (entry.ts kendi buffer'ını duplike eder) |
| `commands/chat-provider-parity.ts:109` | Ollama/openai-compat HTTP çağrıları timeout/AbortController'sız |
| `agent/identity.ts:42` | `composeSystemPrompt` `lang`'ı hiç okumaz → core+persona daima Türkçe |
| `agent/provider-tooluse/anthropic.ts:61` | Non-OK HTTP'de bare status-code fırlatır, response-body'yi atar |
| `entry.ts:760` | `createSpinner` label hardcoded 'düşünüyor…'; stderr-only TTY-guard caller check'inden ayrışabilir |
| `entry.ts:782` | Node-version guard hardcoded İngilizce (bilingual `error.node_version_low` var) |
| `entry.ts:35` | `reduceSlashMenu` (arrow-nav) hiç import/çağrı edilmez → legacy `/` menü display-only |
| `commands/chat-slash-registry.ts:235` | `/kill /cleanup /recover` default motorda sessiz no-op (§5 kök-neden alt-kümesi) |
| `repl/app.tsx:927` | Ters-drift: `/ask /run /control /queue /interrupt /steer` SLASH_CATALOG'da yok → Tab-menü göstermez |
| `commands/chat-mcp-bridge.ts:234` | Hatalı MCP server sessizce catalog'dan düşer, hangisi/neden gösterilmez |

## 5. SLASH MENÜ ↔ MOTOR MATRİSİ (kesinleşmiş)

Varsayılan Ink / native-agent motoru (`app.tsx:853`, `run.tsx:55-62 isNativeAgentSelected` → `--legacy-loop`/`terminal.native_agent:false` dışında default). SLASH_CATALOG = 37 giriş / 24 `agenticTool`-taşıyan.

| Durum | Komutlar | Mekanizma |
|---|---|---|
| **✅ Dispatch OLUR** (6, native-tool eşleşmesi var) | `/status` `/sprint` `/retro` `/doctor` `/models` `/review` | `native-tool-registry.ts:319-334` → `deckent_status/history/retro/doctor/models/review` |
| **⚠️ Handle edilir AMA native'de kırık** (3) | `/clear` (yalnız JS transcript, warm-context değil · `chat-native.ts:646`) · `/approve` (`setApprovalMode` çağrılmaz · `app.tsx:1020`) · `/resume` (native session hiç persist edilmez · `run.tsx:439`) | `app.tsx handleSubmit` özel-durum ama etkisiz |
| **🔴 Dispatch OLMAZ → düz sohbete düşer** (18 agenticTool) | `/kill` `/cleanup` `/recover` `/sync` `/checkpoint` `/autonomous` `/audit` `/usage` `/resources` `/directives` `/config` `/plan` `/recall` `/agents` `/skills` `/features` `/analyze` `/explain` | Eşleşen native-tool YOK; `resolveSlash` hiç çağrılmaz |
| **🔴 Meta-komut, yalnız bypass edilen path'te** (4) | `/help` `/nervous` `/interrogate` `/mcp` | Tek handler'ları `chat-native.ts` `runChatNativeLoop` içinde (`:843/656/716/782`), native motor girmez |
| **↩︎ Ters-drift: motorda var, menüde YOK** (6) | `/ask` `/run` `/control` `/queue` `/interrupt` `/steer` | `app.tsx:925-950` handle eder ama SLASH_CATALOG'da yok (`repl_surface.enabled` gated) → Tab-menü hiç göstermez |

**Net:** default motorda menünün ~24/37 komutu ya sessiz no-op ya prose; yalnız 6'sı sağlam çalışır. Legacy path (`--legacy-loop`) bunları doğru dispatch eder → bu native-flip regresyonudur.

## 6. ÖLÇÜLMÜŞ COVERAGE (bulgu→test, tahmin yok)

Yukarıdaki MEASURED COVERAGE bloğundaki 96 bulgu→test eşlemesinin ezici çoğunluğu **`covered: "no"`**; yalnız 6 bulgu **`partial`** (`/clear`-transcript, reconciliation, `renderStatusLine`, `createLineQueue`, `reduceSlashMenu`, `initReplMcpBridge` — hepsinde test var ama defect-özel-assert yok), **sıfır bulgu tam-covered.** Tekrarlanan desen: mevcut testler ya (a) bug'lı davranışı **beklenen çıktı** olarak lock'lar (i18n hardcode: `entry-provider-ssot.test.ts` Türkçe 'erişilemedi'yi assert eder; `chat-tool-exec.test.ts` 'yazıldı'yı bekler; `nl-dispatch-class-gate.test.ts` hardcoded İngilizce cancel-string'lerini kilitler), ya (b) mock/fake enjekte edip gerçek-path'i hiç exercise etmez (`chat-tool-exec` daima mock `bashRun`; `repl-provider-parity` daima exitCode:0; `native-stabilization-proof` FAKE nativeEngine), ya da (c) düzeltilmiş-ama-kullanılmayan modülü test eder (`repl-cursor-model.test.ts` code-point-safe `cursor-model.ts`'i kapsamlı test eder — ama `input-bar.tsx` onu import etmez).

**REPL test-subset koşu sonucu (gerçek, tahmin değil):** 5 mapped dosya, fork-cap'li (`VITEST_MAX_FORKS=2`):
- `line-edit.test.ts` (22) · `provider-switch.test.ts` (5) → **27 passed / 209ms**
- `stream-segmenter.test.ts` (8) · `chat-tool-exec.test.ts` (7) · `tool-permissions.test.ts` (7) → **22 passed / 356ms**
- **Toplam 49/49 yeşil** — ve bu 5 dosyanın hiçbiri kendi modülündeki mapped defect'i (surrogate-backspace, provider-throw, 200-satır-flush, symlink/edit-first-occurrence, `deckent_start` classify) exercise etmiyor. "Yeşil ama defect'e kör" tezinin canlı kanıtı.

## 7. LIVE-PTY PROBE

- **dist tazeliği:** ✅ TAZE. `dist/cli/repl/app.js` mtime `1783447505` > en-yeni `src/cli` (`run.tsx` `1783447163`); dist, 2026-07-07 src-edit'lerinden SONRA build edilmiş.
- **Harness/PTY:** Girdideki LIVE PROBE `null` (upstream koşmadı). Onun yerine hedefli statik+test probe koştum (§6 koşu sonuçları + aşağıki grep-doğrulamalar). Tam-suite PTY-harness WSL-OOM riski nedeniyle koşulmadı (kural: ≤16GB, split-batch).
- **Statik bulguları DOĞRULAYAN davranışlar:**
  - P0-1 doğrulandı: `chat-session.ts:289` yalnız `child.once('close')`, dosyada `error`-listener yok.
  - P1-14 doğrulandı: `loop.ts:62` (`args['command']`, `cmd` yok) — bug sürüyor.
  - Slash-cluster doğrulandı: `app.tsx:853 if (nativeEngine)`; `resolveSlash` yalnız `chat-native.ts:843`'te.
  - P1-1 doğrulandı: `approvalPending` `app.tsx:690`'da declare, yalnız `:1117` footer'da tüketiliyor — InputBar referans etmiyor.
  - `config.ts:1734 repl_surface ?? { enabled:true, approvals:true }` — approvals default AÇIK doğrulandı.
- **Statik ref'i DÜZELTEN davranış — satır-drift:** Aktif düzenlenen (2026-07-07 uncommitted edit'li) dosyalarda satır-numaraları kaydı: `loop.ts` bulgu `:48` → gerçek `:62` (+14); `app.tsx` `:850` → `:853` (+3), InputBar bloğu benzer kayma. **Her bug drift'e rağmen sürüyor** — yalnız satır-numarası hareket etti. §2'de bulgunun doğrulanmış baseline-satırı anchor, sıcak-dosyalar (loop/app/run/session/native-agent-bridge) için güncel satır probe-not'uyla verildi.

## 8. KALİBRASYON NOTU (bu turun dürüstlük-kanıtı)

- **Raporlanan bulgu:** 96 (1 P0 · 24 P1 · 41 P2 · 30 P3), tümü HEAD `5abd2bd5`'e karşı satır-denetimli + adversarial-doğrulanmış.
- **Severe refute'ta elenen:** 1. "`/model`/`/provider` native motorda sahte-başarılı no-op" iddiası — dosyaların GÜNCEL halinde (2026-07-07 incident-fix: `run.tsx:375-379`+`loop.ts:88-90`'da `getAdapter`/`getModel` getter'ları live-mutated cell'i okuyor) **çürütüldü**; bulgu tarihçede geçerliydi, HEAD'de fix'li.
- **Yeniden-etiketlenen (mis-bucket):** 1. InputBar↔ApprovalCard bulgusu `P0:` array'inde geldi ama kendi `reason`'u *"capped this at P1 rather than P0"* diyor → kalibre değer **P1**; array-etiketi bayat. Bu yüzden **1 temiz P0** (chat-session ENOENT, 'P0 stands'), InputBar P1'e taşındı. Düz "2 P0" raporlamak bu turun premise'iyle çelişirdi.
- **Birleştirilen çift-bulgu:** 1. `native-agent-bridge.ts:145` (R03) ≡ `:163` (resource-leak lens) — aynı usage-overwrite bug'ı iki lensten; toplama bir kez sayıldı, iki-lens korroborasyon **güç** olarak not edildi (çift sayılmadı).
- **Satır-ref/kanıt düzeltmeleri (düşürülmedi, işaretlendi):** ≥8 evidence-düzeltmesi verifikasyonda loglandı — `entry.ts:687` ve `app.tsx:722` `line_ok:false` (yazma-span'i içinde düzeltildi); `native-agent-bridge :179→180`, `chat-slash-registry :383→384`, `run.tsx :274→291` corrected_line; **fabricated citation elendi** (`chat-tool-exec.ts:58`'in "authority-enforcer.ts'te de var" iddiası — grep boş, struck); comment off-by-one (`chat-tool-bridge` audit-yorumu `73-74→74-75`); `'ai_planner_timeout 60000ms default'` yanlış-nitelemesi (gerçek `BRAIN_PLAN_TIMEOUT_MS=900000`); `session.ts send() :90-95→:80-84`; SLASH_CATALOG `32→37 giriş / 24 agenticTool`; P0-2'nin ilk `formatFatalAndExit` mekanizma-atfı düzeltildi (bare-REPL path `buildProgram`'a girmiyor).
- **Kanıt:** Bir tam "2 P0" iddiası P1'e indirildi, bir severe aday tamamen elendi, bir çift birleştirildi, ≥8 satır/kanıt hatası bulgu-içi düzeltildi ve bir fabricated cross-reference struck — kalibrasyonun laf değil uygulama olduğunun kanıtı.

## 9. SONUÇ + Öncelikli Fix Sırası

**Genel:** Deckent'in orchestration çekirdeği sağlam; **terminal yüzeyi** ise iki sistemik kök-neden etrafında kırılgan: (1) 2026-07-07 native-flip'inin yarattığı **menü↔motor drift'i**, (2) yaygın **timeout/error-handler eksikliği + i18n-hardcode**. Bulguların hiçbiri mevcut testlerce yakalanmıyor.

Önerilen sıra:
1. **P0 — `chat-session.ts:272` ENOENT crash**: child'a `error` listener. Tek satırlık ama en temel giriş noktasını çökertiyor.
2. **P1 kök-neden — slash-menü↔motor (`app.tsx:853` + §5)**: native turn-loop'una `resolveSlash` interception; `/kill /help /approve /clear /resume` dahil ~24 komut. Tek fix, 6+ yüzey.
3. **P1 — güvenlik/veri-etkili tekiller**: InputBar↔ApprovalCard mutex (`app.tsx:1121`, yıkıcı-onay çift-tüketimi) · `loop.ts:62` bash-permission `cmd`-key (kalıcı '**' grant) · paste control-byte injection (`line-edit.ts:80`).
4. **P1 — hang/crash tekiller**: `defaultSubscriptionSpawn` error-handler (`chat-native.ts:1156`) · enterprise-bridge timeout (`chat-enterprise-bridge.ts:56`) · bash/audit timeout (`chat-tool-exec.ts:56`, `chat-tool-bridge.ts:81`) · interactive `gracefulErrors` (`chat.ts:523`).
5. **P1 — sessiz-yanlışlık tekiller**: `/nervous` false-success (`chat-nervous-bridge.ts:190`) · NL-intent hijack (`chat-agentic-dispatch.ts:63`) · exit-code inceleme (`chat-provider-parity.ts:77`) · tool-exec i18n (`chat-tool-exec.ts:43`) · surrogate-backspace (`line-edit.ts:59`) · orphan-tool-result 400 (`context-budget.ts:69`) · reconciliation-swap (`chat-session.ts:522`).
6. **Yüksek-frekans P2**: i18n-hardcode kümesi (chat.ts/entry.ts/render-region/banner — tek getMessage-pass) · spawn `error`-listener eksikliği (chat-tool-bridge/enterprise) · UTF-16 dilimleme kümesi (input-bar/dual-stream/live-footer — ortak code-point util) · off-TTY auto-approve gözden geçirme (`entry.ts:708`).
7. **Test-borcu (paralel)**: her fix'e defect-özel test — özellikle bug'ı beklenen-çıktı olarak lock'layan i18n testlerini tersine çevir; mock yerine gerçek-path (ENOENT, non-zero exit, surrogate, 200-satır-flush) exercise et.

---

## §Ek-B — Run-B tam anlatısı (probe + i18n-ölçüm + async-race + tool-loop lensleri ağırlıklı)

# Deckent Terminal (REPL) Correctness Review — Final Sentez

## 1. TLDR

Bu tur, Deckent terminal (REPL) yüzeyinin ~30 kaynak dosyasını (default Ink/native-agent yolu + legacy chat loop + agent transport katmanı) 10 lens'te taradı ve HEAD'e karşı doğrulanmış **74 bulgu** üretti: **1 P0, 18 P1, 34 P2, 21 P3**. En ciddi üç bulgu: (a) default `deckent` REPL'inde persistent `claude` child'ına `error` listener yokluğu — `claude` PATH'te değilken ilk mesajda tüm process ENOENT ile çöküyor (`chat-session.ts:272`); (b) default native-agent motorunda **23 slash komutu** (`/status`, `/plan`, `/config`, `/kill`, /nervous …) hiç dispatch edilmeden LLM'e düz metin olarak gidiyor (`app.tsx:1033`); (c) `deckent_bash` permission-resource'u her zaman boş çünkü `primaryResource()` `args['command']` okuyor ama şema anahtarı `cmd` — onay kartı komutu göstermeden kör-onay + aşırı-geniş `**` grant riski (`loop.ts:62`). Bulguların çoğu **default yolda** (native-agent 376-003 ile default-ON) tetiklenebilir; i18n hardcode-TR/EN sızıntıları ve tool-loop bütünlüğü (parallel tool_use, context-budget pairing) tekrarlayan temalar. Adversarial refute turunda 3 severe aday (biri P0 iddiası) çürütüldü, 2 P0 adayı P1'e kalibre edildi, ~8 satır-referansı düzeltildi, 1 fabrike edilmiş cross-reference tespit edildi. Live-PTY probe'ta 4 harness + manuel `/help` smoke PASS verdi ama hiçbiri listelenen bug'ları tetiklemiyor (happy-path). **Genel correctness sağlığı: orta-riskli** — motor mimarisi sağlam ama default-path'te bir crash (P0) + geniş bir "menü var, motor yok" drift'i + i18n borç yığını mevcut; hemen düzeltilmesi gereken 3-4 net kusur var.

---

## 2. P0 / P1 BULGULAR (severe, adversarial-onaylı)

### P0-1 · Persistent `claude` child'ında `error` listener yok → default REPL process ENOENT ile çöküyor
- **file:line** — `src/cli/commands/chat-session.ts:272` (fonksiyon `defaultPersistentSpawn`, `chat-session.ts:259-303`)
- **failure_scenario** — Temiz kurulum, `.deckent/config.json` yok (ya da `chat_provider`/`brain_provider` içermiyor); kullanıcı çıplak `deckent` çalıştırıyor, PATH'te `claude` yok (yalnız codex/gemini/ollama kurulu). İlk mesaj → `ensureSpawn()` `claude` spawn eder → Node async `error` (ENOENT) event'i **sıfır listener** ile emit eder → `uncaughtException` → `error-handler.ts:130` `process.exit(1)` → tüm `deckent` process'i FATAL banner ile ölür (per-turn graceful hata yerine).
- **guard/neden-gerçek** — `272`'de yalnız `child.once('close', ...)` (`:289`) var, hiçbir yerde `child.on('error', ...)` yok. `entry.ts:452-461` bunu `buildReplProvider`'ın claude branch'ine (no-flag default) bağlar; `resolveReplProviderForCwd` (`entry.ts:504-513`) config yokken 'claude'a düşer; `config.ts:100-113` 'claude'u universal-safe default olarak belgeler. Node EventEmitter davranışı (listener'sız `error` → try/catch'i **bypass** eden uncaughtException) bu oturumda `node -e` ile ampirik doğrulandı.
- **coverage** — YOK (chat-session.ts için spawn-ENOENT/`error`-event testi yok).
- **fix yönü** — `defaultPersistentSpawn`'daki child'a `error` listener ekleyip hatayı per-turn graceful sonuca dönüştür (reject/tagged-error), uncaughtException'a bırakma.

### P1-1 · Backspace/Delete/Left/Right UTF-16 code-unit'te çalışıyor → surrogate-pair (emoji) bölünüp buffer'da eşleşmemiş surrogate kalıyor
- **file:line** — `src/cli/repl/line-edit.ts:59` (backspace; delete `:60-62`, left/right `:63-66`)
- **failure_scenario** — Kullanıcı `'ship 🚀'` yazar (🚀 = 2 buffer-index birimi), cursor emoji sonrasında; tek Backspace `buffer.slice(0, cursor-1)` ile yalnız LOW surrogate'i siler, HIGH surrogate yalnız kalır → geçersiz UTF-16 → render bozulur, submit'te (history yazımı, provider JSON payload) UTF-8 encode'da bozulma/throw.
- **guard/neden-gerçek** — Hiçbir dal code-point-aware değil. Fix'i içeren `cursor-model.ts` bir sibling ama **wire edilmemiş** (kendi header'ı söylüyor, grep'te src içi importer yok); canlı reducer `line-edit.ts`'in `editInput`'u (`input-bar.tsx:188/202` üzerinden) hâlâ buggy.
- **coverage** — YOK (`tests/cli/line-edit.test.ts` yalnız ASCII test eder; surrogate-pair input yok).
- **fix yönü** — Cursor/silme mantığını `[...buffer]` code-point iterasyonuna geçir (app.tsx:343'te `truncateQueuePreview` için zaten uygulanan desen).

### P1-2 · `editInput` kontrol-byte filtresi yalnız İLK code-unit'e bakıyor → paste içindeki gömülü escape byte'ları geçiyor (terminal-escape injection)
- **file:line** — `src/cli/repl/line-edit.ts:80` (`if (ch.charCodeAt(0) < 0x20 && ch !== '\t') return { state };`, `ch = key.sequence` `:77`)
- **failure_scenario** — Kullanıcı printable ile başlayıp içinde `\x1b[2J\x1b[31mFAKE` gibi ESC/CSI byte'ları taşıyan, CR/LF içermeyen bir metin paste eder. Multi-line-paste dalına (`input-bar.tsx:172`, `\r\n` yok) girmez → `editInput` default dalına akar; `charCodeAt(0)` = 'g' (0x67) olduğundan tüm string escape byte'larıyla buffer'a girer, gerçek terminale yazılır (screen-clear/renk/prompt-spoof) ve disk history'ye persist edilir.
- **guard/neden-gerçek** — `normalizePasted()` (`input-history.ts:135-146) tanımlı ama **hiçbir importer'ı yok** (dead code); multi-line-paste dalı (`input-bar.tsx:172-186`) de gömülü kontrol byte'larını strip etmiyor. Impact escape-injection/spoofing (RCE değil) → bu yüzden P1.
- **coverage** — PARTIAL (`line-edit.test.ts` tek-char ESC ve düz multi-char paste'i ayrı test eder; pozisyon>0'da gömülü kontrol-byte'lı paste yok).
- **fix yönü** — Paste string'inin tüm code-unit'lerini tara (ilkini değil), veya `normalizePasted()`'ı hem tek-satır hem multi-line paste yoluna wire et.

### P1-3 · Native-engine `runTurn` çok-round bir turda `usage` istatistiğini biriktirmek yerine üzerine yazıyor
- **file:line** — `src/cli/repl/native-agent-bridge.ts:163-164` (aday `:145`'ti — düzeltildi; `case 'usage': inputTokens = ev.inputTokens; outputTokens = ev.outputTokens;` — düz atama, `+=` değil), `session.send()` loop'u içinde (`:149`)
- **failure_scenario** — Tool çağrısı içeren her tur (bir coding-agent için normal durum): `agent/loop.ts:118` her round'da taze `usage` event yield eder; ≥2 round tek external turda ≥2 usage event'i tek `runTurn`'e çöktürür → footer `Σ N tok` (app.tsx:847-863) yalnız son round'un sayısını gösterir, turun toplamını **düşük sayar**.
- **guard/neden-gerçek** — `guards/cost.ts:28-29` `accrue()` `+=` kullanır → hard cost-ceiling **etkilenmez**, yalnız gösterilen token sayacı yanlış. Aday P2'yi "opt-in native flag" diye gerekçelendirmişti; bu **stale** — native-agent `run.tsx:61-71` (376-003 M5-NATIVE-FLIP) ile default-ON → P1.
- **coverage** — YOK (her scripted tur en fazla 1 usage event emit eder).
- **fix yönü** — `usage` case'inde `inputTokens += …; outputTokens += …` yap (round başına biriktir).

### P1-4 · `MAX_CODE_BLOCK_LINES` force-flush fence ortasında mode'u 'prose'a resetliyor → gerçek kapanış ` ``` ` yeni fence-open sanılıyor
- **file:line** — `src/cli/repl/stream-segmenter.ts:80` (`emit(...); block = []; mode = 'prose';`, `mode === 'code'` dalında; MAX=200 `:44`; prose re-open `:88`)
- **failure_scenario** — ~199+ satırlık tek bir fenced code block (coding-agent'ın tam dosya/diff dump'ı) guard'ı block ortasında tetikler; guard genuinely-unclosed-fence için yapılmıştı ama kapanmak üzere olan legitimate uzun block için de aynı ateşlenir → gerçek kapanış fence'i yeni open olarak okunur, sonraki prose flush()'a kadar sahte 'code' moda yutulur.
- **guard/neden-gerçek** — `flush()` (`:104-112`) tur sonunda buffer'ı emit eder → metin kalıcı kaybolmaz ama misclassify/gecikir. Kod yorumları yalnız runaway-block cap'ini gerekçelendirir, fence-line yanlış-yorumlama cascade'ini değil → documented-design istisnasını geçer.
- **coverage** — PARTIAL (`ink-stabilize.test.ts` guard'ın prose'a resetlediğini assert eder ama sonrasında ` ``` ` besleyip misparse'ı kanıtlamaz).
- **fix yönü** — Force-flush'ta bir "hâlâ-fence-içi" re-entry marker koru; genuinely-unclosed ile mid-block'u ayır.

### P1-5 · `switchTo()` geçersiz `/provider` adında guard'sız `rebuild(next)` ile REPL'i çökertiyor — native-transport credential yokken (yalnız `--legacy-loop` değil) ulaşılabilir
- **file:line** — `src/cli/repl/provider-switch.ts:77` (`active = rebuild(next)` guard'sız; `teardown(prev)` `:48-51` try/catch'li)
- **failure_scenario** — Subscription-auth Claude Code kullanıcısı (env'de ANTHROPIC/OPENAI API-key yok, ollama_host yok — normal durum). `detectTransport` (`provider-detect.ts:20-37`) `{kind:'none'}` döner → `nativeEngine/nativeSwitch` undefined kalır; `/model`·`/provider` handler'ı (`run.tsx:482-488`) doğrudan guard'sız `switcher.switchTo(sel)`'e düşer → typo'lu `/provider foo` → `entry.ts:437-440` throw → uncaught → `installFatalHandlers` tüm process'i exit eder. Flag/override gerekmez.
- **guard/neden-gerçek** — Native-agent AKTİF iken `nativeSwitch` (`run.tsx:412-433`) hataları `{switchError}` string'i olarak güvenli döner (native-transport.ts:194-199); tehlike yalnız native-transport credential-yok durumunda. P0'dan P1'e kalibre (extra user-input = typo gerekir).
- **coverage** — YOK (`provider-switch.test.ts`'te rebuild hiç throw etmiyor; `chat-native-provider-switch.test.ts` başka modülü test eder).
- **fix yönü** — `rebuild(next)`'i try/catch'e al; hatayı graceful "unknown provider" turuna dönüştür.

### P1-6 · `initReplMcpBridge()`'in `mcp_client_enabled` opt-in gate'i dead code — gerçek default-path (run.tsx) her launch'ta koşulsuz `loadAndConnectAll()` çağırıyor
- **file:line** — `src/cli/repl/mcp-bridge.ts:90` (gated fonksiyon, sıfır dış-caller); gerçek wire `run.tsx:398-407`
- **failure_scenario** — `~/.deckent/mcp.json` (home-level, tüm projelerde persist) veya proje `.mcp.json`/`.mcp.local.json` yapılandırmış her kullanıcı — MCP-ekosistemi için normal setup — her düz `deckent` REPL launch'ında (default native-agent, flag'siz) o server'ları sessizce connect eder ve tool'larını register eder, modülün kendi header'ı "Flag absent/false → no external surface" güvenlik kontratını belgelemesine rağmen.
- **guard/neden-gerçek** — `run.tsx:398-407` `new McpClientBroker({})` + `buildMcpBridge` + `await bridge.loadAndConnectAll()`'ı **hiçbir `mcp_client_enabled` kontrolü olmadan** çağırır; `loadMcpServers` (`mcp-client/config.ts:37-45`) üç kaynağı merge eder, hiçbiri deckent'in kendi opt-in flag'iyle gated değil. Tetikleyici precondition (var olan MCP config) deckent-dışı gerçek bir durum → P1.
- **coverage** — YOK (`mcp-bridge.test.ts` `initReplMcpBridge`'i izole test eder; run.tsx'in gerçek koşulsuz composition'ını test etmez).
- **fix yönü** — `run.tsx`'teki broker+bridge inşasını `mcp_client_enabled`/opt-in flag arkasına al veya belgelenen kontratı gerçekle hizala.

### P1-7 · `defaultSubscriptionSpawn` (`deckent chat --native`) da child'da `error` handler'sız
- **file:line** — `src/cli/commands/chat-native.ts:1156` (yalnız `child.once('close', ...)` `:1166`)
- **failure_scenario** — Host AI CLI yok, kullanıcı `NO_PROVIDER_MESSAGE`'ın (`chat.ts:58-66`) önerdiği `--native`/`--message`'ı çalıştırır → ENOENT unhandled child `error` event'i olarak fırlar (promise rejection değil) → uncaughtException try/catch'i tamamen bypass eder → process çöker.
- **guard/neden-gerçek** — `gracefulErrors` kontratı (`chat-native.ts:231-239, 1066`) spawn-ENOENT'i yakalamak için var ama listener'sız `error` event'i bu try/catch'e hiç ulaşmadan fırlar; `--message`/`--once`'ta (`chat.ts:507` `gracefulErrors:true`) en temiz repro. Process-wide `uncaughtException` handler'ı (`index.ts:84`) controlled `✗ FATAL` + exit(1) verir — ham crash değil ama gene de graceful-turn davranışı bozulur.
- **coverage** — YOK (yalnız `defaultSubscriptionSpawn('true', ...)` structural smoke; ENOENT senaryosu yok).
- **fix yönü** — Child'a `error` listener ekle, hatayı gracefulErrors kontratına yönlendir.

### P1-8 · İnteraktif `chat --native`/`--local` REPL `gracefulErrors:true` atlamış → herhangi bir provider hatası tüm oturumu öldürüyor
- **file:line** — `src/cli/commands/chat.ts:523` (interactive dal; isOnce dalı `:507`'de `gracefulErrors:true` set eder, interactive dalda anahtar hiç yok)
- **failure_scenario** — Kullanıcı `deckent chat --local` (interactive, Ollama) çalıştırır; server oturum ortasında kill/restart edilir (yaygın local-LLM failure) → genuine Promise rejection → `chat-native.ts:1065` try/catch'ine ulaşır ama `opts.gracefulErrors` undefined olduğu için koşulsuz rethrow → tek transient hatada tüm interaktif REPL sonlanır.
- **guard/neden-gerçek** — `entry.ts:841-856` top-level `.catch(handleCliError)` reject'i yakalar → ham FATAL değil, ama oturum error-exit ile biter (resilient olmayan yanlış davranış).
- **coverage** — YOK (grep: `gracefulErrors` testlerde hiç geçmiyor).
- **fix yönü** — Interactive dalın `runChatNativeLoop()` çağrısına da `gracefulErrors: true` ekle.

### P1-9 · REPL `/nervous accept|reject` canlı nervous executor'ı hiç bilgilendirmiyor, history'ye daima sahte success/pending outcome yazıyor
- **file:line** — `src/cli/commands/chat-nervous-bridge.ts:190` (`handleNervousSlash` `:176-197`; `appendNervousHistory` `:57-75` outcome'u `:71`'de hardcode eder)
- **failure_scenario** — Canlı nervous executor çalışıyor; kullanıcı `/nervous accept <id>` yazar → REPL yeşil `✓ accepted` gösterir ve `outcome:'success'` kaydı yazar ama executor (yalnız `.deckent/nervous-ipc/pending/*.json` tüketir) kararı **hiç öğrenmez**, altyapı aksiyonu asla koşmaz.
- **guard/neden-gerçek** — Sibling `nervous.ts` `handleAccept/handleReject` (`:307-379`) `isNervousPollerAlive` + `NervousIpcQueue.writeApproval` üzerinden düzeltildi (açık "W0-TRUTH #491 … audit lie" yorumuyla); REPL bridge güncellenmedi. Yalnız 'edit' sub-command (`:199-250`) `writeIpcApprovalSync`'e route eder.
- **coverage** — PARTIAL (`chat-nervous-bridge.test.ts` sahte-outcome yarısını exercise eder; canlı executor'ın bilgilendirilmediğini kanıtlayan test yok).
- **fix yönü** — Accept/reject dalını da `isNervousPollerAlive` + IPC-write üzerinden nervous.ts pattern'ine hizala.

### P1-10 · Düz 30s `SPAWN_TIMEOUT_MS`, `deckent_plan`/`deckent_audit`'i normal-belgelenmiş süresinde öldürüyor
- **file:line** — `src/cli/commands/chat-tool-bridge.ts:81` (`const SPAWN_TIMEOUT_MS = 30_000;`; `deckent_plan: ['plan']` mapping `:61`; `isDetachedCommandClass` `:301-304` yalnız start/run/process içerir)
- **failure_scenario** — Kullanıcı `/plan`'ı proje default'u 'auto' planlama modunda çalıştırır (`config.ts:443/450/457/466`); AI-planner subprocess'i içeride 60s-900s bütçeli ama defaultSpawnFn 30s'de SIGKILL edip `[mcp-error] deckent_plan: timed out after 30s` döner.
- **guard/neden-gerçek** — `deckent_plan`/`deckent_audit` (default 'gate' action `:174`) detached-sınıf dışı → 30s path. `BRAIN_PLAN_TIMEOUT_MS=900_000` (`constants.ts:137`), `ai_planner_timeout` default 60000ms (`config-types.ts:715-716` — aday `:708-709` demişti, ~7 satır off; primary etkilenmez).
- **coverage** — YOK (`chat-tool-bridge.test.ts`'te timeout/`SPAWN_TIMEOUT_MS` referansı yok).
- **fix yönü** — Timeout'u tool-sınıfına göre parametrele (plan/audit için uzun bütçe, ya da BRAIN_PLAN_TIMEOUT_MS'e bağla).

### P1-11 · Write/edit/bash confirm-prompt özeti ve tool hata yollarında hardcoded Türkçe string'ler, i18n `getMessage()` bypass
- **file:line** — `src/cli/commands/chat-tool-exec.ts:43` (`summarize()` `:43-54` koşulsuz Türkçe döner: 'Dosya yaz: …' vb.; hata string'leri `:109,115,122,127,133`)
- **failure_scenario** — Herhangi bir REPL kullanıcısı (yapılandırılmış `lang`'dan bağımsız) `deckent_write_file`/`edit_file`/`bash` tetiklerse confirm-özetini ham Türkçe görür; scope/match/empty-arg hataları da Türkçe — İngilizce-yapılandırılmış oturumda bile.
- **guard/neden-gerçek** — Dosyada `messages.js`/`getMessage` import'u yok. `createToolExecDispatcher` production REPL'e wire (`entry.ts:706`, `run.tsx:292` — aday `:274` demişti, düzeltildi). `CLAUDE.md:41-44` i18n-first'ü zorunlu kılar ('Hardcode TR/EN = kabul edilmez').
- **coverage** — YOK (i18n/dil assertion yok).
- **fix yönü** — Tüm user-facing string'leri `getMessage(key, lang)`'e taşı, İngilizce default.

### P1-12 · `primaryResource()` `args['command']` okuyor ama `deckent_bash` şema anahtarı `cmd` — bash çağrılarında permission-resource daima boş
- **file:line** — `src/agent/loop.ts:62` (aday `:48`'di — o satır doc-comment; düzeltildi. `const v = args['path'] ?? args['file_path'] ?? args['command'] ?? …` — 'cmd' hiç yok)
- **failure_scenario** — Native agent, default 'suggest' modu. Model `deckent_bash {cmd:'rm -rf /important-dir'}` çağırır. Kullanıcının gördüğü permission-request (`native-agent-bridge.ts:155`) yalnız 'Run tool: deckent_bash' — **komut metni hiç yok** çünkü resource=''. Kör-onay; 'always' seçilirse `loop.ts:201` pattern `**`'ı persist eder → oturum boyu tüm shell komutlarını sessizce auto-onaylar. Komut-scope'lu deny kuralı da hiç ateşlenmez.
- **guard/neden-gerçek** — `native-tool-registry.ts:99` deckent_bash şemasını `{cmd}` ile deklare eder; `chat-tool-exec.ts:132` içeride `args['cmd'] ?? args['command']` okur ama permission gate resource'u zaten '' hesaplamış olur. P2'den P1'e (her deckent_bash çağrısında default modda repro).
- **coverage** — YOK (primaryResource/deckent_bash permission-resource assertion'ı yok).
- **fix yönü** — `primaryResource`'a `args['cmd']` ekle (ve tool-şema anahtarlarını resource-extraction ile senkronla).

### P1-13 · `SLASH_CATALOG`'un agentic komutları default native-agent motorunda dispatch edilmiyor, düz chat metni olarak düşüyor
- **file:line** — `src/cli/repl/app.tsx:1033` (`if (nativeEngine) { … nativeEngine(line, …) }` `:822-833`, sıfır slash-parse)
- **failure_scenario** — Fresh proje, default config. Kullanıcı Tab menüden `/kill` (veya `/status`, `/config`, `/plan` …) seçer → literal string `nativeEngine → session.send('/kill')`'e gider; LLM `/kill`'i ham chat mesajı olarak alır, `deckent_kill` tool şeması register değil → yalnız konuşma-tahmini üretebilir, belgelenen confirm-card aksiyonu asla ateşlenmez. **Etkilenen 23 komut:** `/status, /help, /recall, /plan, /config, /kill, /autonomous, /audit, /nervous, /mcp, /directives, /checkpoint, /sync, /cleanup, /recover, /usage, /resources, /explain, /agents, /skills, /features, /analyze, /interrogate`.
- **guard/neden-gerçek** — `resolveSlash`/`handleReplCommand` yalnız legacy `runChatNativeLoop` (app.tsx:868 else-dalı) tarafından kullanılır; app.tsx grep'inde SLASH_CATALOG/handleReplCommand yok. `native-tool-registry.ts:319-334` yalnız 6 CLI-bridge tool register eder; meta-dispatch `deckent_call_tool` opt-in (default OFF) ve register-snapshot dışına ulaşamaz.
- **coverage** — YOK (app.tsx testleri yalnız pure helper'ları exercise eder, SLASH_CATALOG dispatch tablosunu değil).
- **fix yönü** — Native-engine yolunda satırı `nativeEngine`'e vermeden önce slash-registry dispatch'i geçir; agentic komutları tool olarak native registry'ye register et.

### P1-14 · `/approve <mode>` native-agent session'a hiç ulaşmıyor — `setApprovalMode` production'da dead code, 'onay modu' onayı sahte
- **file:line** — `src/agent/session.ts:489` (aday `:113`'tü; `setApprovalMode(next){ mode = next; }` public ama `grep '\.setApprovalMode(' src/` = SIFIR call-site)
- **failure_scenario** — Default proje, native motor. Kullanıcı `/approve full-auto` yazar, 'onay modu: full-auto' onayını görür (`app.tsx:1029`). Sonraki tur LLM confirm-tier tool çağırır — native motor hâlâ 'suggest' altındaki aynı y/a/n confirm kartını gösterir çünkü AgentSession'ın iç `mode`'u hiç güncellenmedi. Belgelenen full-auto/auto-edit native motorda asla aktive olmaz.
- **guard/neden-gerçek** — `run.tsx:269` `approvalMode` yalnız legacy dispatcher-yolunu besleyen local; native confirm callback `run.tsx:456`'da `confirmTrigger`'ı okur, `approvalMode`'a hiç dokunmaz. `permission.ts:44` full-auto short-circuit'ü `getMode()`'dan okur, o da kalıcı 'suggest'. Uncommitted diff'in parçası değil (pre-existing stable bug). P2'den P1'e.
- **coverage** — PARTIAL (`session.test.ts` `setApprovalMode`'u doğrudan çağırır ama gerçek `/approve` REPL komutu üzerinden wire-gap'i kanıtlamaz).
- **fix yönü** — `/approve` handler'ını native session'ın `setApprovalMode`'una wire et.

### P1-15 · Parallel tool_use round-trip'inde kardeş tool_result'lar tek birleşik user mesajı yerine ayrı ardışık user mesajlarına bölünüyor
- **file:line** — `src/agent/provider-tooluse/anthropic.ts:19` (`toAnthropicMessage` role:'tool'→{role:'user',[tool_result]} 1:1, `:46` bare `.map` coalesce yok)
- **failure_scenario** — Default REPL + default 'claude' provider; kullanıcı tek mesajda iki dosya okumak ister. Claude tek turda iki parallel tool_use önerir; `loop.ts` iki ayrı role:'tool' Transcript girdisi ekler; aynı-tur sonraki provider çağrısı bunları iki ardışık `{role:'user'}` olarak serialize eder — Anthropic dokümanının açıkça "Wrong" dediği şekil.
- **guard/neden-gerçek** — Canlı Anthropic docs (parallel-tool-use Troubleshooting) doğrulandı: "all tool results together in a single user message" doğrusu; bu şekil parallel-tool-use'u azaltan #1 neden. Ancak spekülatif "400/hard-abort" iddiası **doğrulanamadı** — docs bunu soft davranışsal degradation olarak çerçeveler; failure_scenario buna göre yumuşatıldı. `disable_parallel_tool_use` src'de set edilmemiş → default reachable.
- **coverage** — YOK (tool_result/ardışık-user-mesajı merge assertion'ı yok).
- **fix yönü** — `toAnthropicMessage` map'inde ardışık 'tool' girdilerini tek `{role:'user', content:[...tool_results]}` mesajına coalesce et.

### P1-16 · `fitMessagesToBudget` pairing-safety guard'ı yalnız trailing tool-result hayatta kaldığında ateşlenemiyor → tool_use'suz orphan tool_result dönüyor
- **file:line** — `src/agent/context-budget.ts:69` (guard `:69-72` `start < messages.length - 1` gated; final mesaj koşulsuz force-keep `:58-65`)
- **failure_scenario** — Default native REPL, ollama (24_000-token/~96KB default bütçe, `native-transport.ts:212`). Model `deckent_read_file`'ı, serialize edilmiş tool-result token'ı + önceki tool_use mesajı bütçeyi aşacak ama tool-result tek başına bütçeden küçük olacak kadar büyük bir dosyada (örn. ~90KB) çağırır. Sonraki aynı-tur provider çağrısında `fitMessagesToBudget` yalnız o trailing tool mesajını force-keep eder, pairing-safety loop (`start == length-1`, guard strictly-less ister) advance edemez → provider sole/opening girdisi tool_use'suz orphan tool_result olan bir array alır → Anthropic ve OpenAI/Ollama adapter'larında geçersiz, loop.ts generic catch'iyle opak hata.
- **guard/neden-gerçek** — Doc-comment (`:42-43`) 'kept window asla dropped-tool_use'lu tool_result ile başlamaz' der ama boundary koşulu bu sözü çiğner. `deckent_read_file` (`chat-tool-exec.ts:107-111`) `readFileSync` ile **size cap'siz** → oversized premise gerçek. Budget default REPL'e koşulsuz wire (`run.tsx:454`).
- **coverage** — PARTIAL (`context-budget.test.ts` guard'ın genel success case'ini exercise eder; bu köşe durumunu değil).
- **fix yönü** — Boundary koşulunu `start <= messages.length - 1` yap ve tek-hayatta-kalan tool mesajını da orphan-check'e dahil et.

### P1-17 · `/model` ve `/provider` busy-gate'i bypass edip iki backend'i tek in-flight native-agent turuna splice ediyor
- **file:line** — `src/cli/repl/app.tsx:1004` (`/model|/provider` regex dalı `working` (`:643`) veya `confirm` kontrolü olmadan `onSwitch(...)` çağırır)
- **failure_scenario** — 2+ sıralı tool round-trip gerektiren bir mesaj in-flight (working=true). InputBar `active` yalnız `confirm===null`'a bağlı (`:1130`), `working`'e değil → interaktif kalır. Kullanıcı tur bitmeden `/model gpt-4` yazar → /model dalı hemen ateşlenir (queue/busy-check yok), shared live-adapter object'ini mutate eder. Aynı-turun sonraki `loop.ts` iterasyonunda (`:88-90` her iterasyonda `getAdapter?.()`/`getModel?.()` re-read) yeni adapter, eski modelin tool çağrılarıyla kurulmuş transcript'in kalanını servis eder — sessiz mid-turn backend handoff.
- **guard/neden-gerçek** — `nativeSwitch` (`run.tsx:409-433`) shared `live.adapter/model/provider`'ı in-flight guard'sız mutate eder ('2026-07-07 incident fix', **uncommitted** — şu an canlı kod). `await nativeEngine(...)` tek JS çağrısı awaited (app.tsx:853-866), kontrol geri verilmez. Default native yol.
- **coverage** — YOK (busy-state ile /model·/provider etkileşimini exercise eden test yok).
- **fix yönü** — /model·/provider'ı `working` iken queue'le veya reddet (queue/interrupt/steer'in `busyCtl` konsültasyonu gibi).

### P1-18 · `resolveClaudeWireModel`'ın own-provider guard'ı dead code (`inferProviderFromId`'in koşulsuz 'claude' fallback'i) → tanınmayan `/model` id sessizce Anthropic API'ye ulaşır, REPL sahte 'switched' başarısı raporlar
- **file:line** — `src/cli/repl/native-transport.ts:93` (`if (inferProviderFromId(candidate) !== 'claude') return …` — `model-registry.ts:275` koşulsuz `return 'claude'` yüzünden hiç ateşlenemez)
- **failure_scenario** — REPL native motor (default) + ANTHROPIC_API_KEY set. Kullanıcı `/model deepseek-chat` (veya gpt/o-series/claude-prefix'siz, colon'suz tanınmayan bir id) yazar. `inferNativeProviderForModel` tanımaz → target.provider 'claude' kalır; `resolveClaudeWireModel(sel.model)` non-error ResolvedProvider döner; `app.tsx:1010-1018` `switched: claude · deepseek-chat` sahte-pozitif onayı render eder. Canlı adapter hâlâ Anthropic, model:'deepseek-chat' taşıyor → sonraki tur invalid-model hatasıyla reddedilir.
- **guard/neden-gerçek** — Boot path (`resolveNativeProvider :217-247`) düz ANTHROPIC_API_KEY ile 'claude' seçer (local config'e bağlı değil). `run.tsx:63` native default.
- **coverage** — YOK (`resolveClaudeWireModel`/`inferProviderFromId` testlerde referanslanmıyor).
- **fix yönü** — `/model` id'sini registry'ye karşı gerçekten validate et; tanınmayan id'de switchError döndür.

---

## 3. P2 BULGULAR (latent / edge — kompakt)

| file:line | başlık | tetikleyici |
|---|---|---|
| `chat-native.ts:646` | `/clear` persistent-session REPL'de silent no-op (JS transcript siler, model context'i değil) | non-interactive/piped `deckent` veya `DECKENT_INK=0`; warm child reset almaz |
| `app.tsx:1130` | InputBar ApprovalCard pending iken aktif kalır (mutual-exclusion yok) | `repl_surface.approvals:true` (non-default) + tek 'y' hem edit hem approve |
| `approval-card.tsx:233` | key handler ctrl/meta flag'lerini yoksayar (Ctrl+A/N approve/deny sanılabilir) | `approvals:true` + Ink'in ctrl-combo delivery şekli (PLAUSIBLE, node_modules doğrulanamadı) |
| `input-bar.tsx:88` | Home/End Ink `.home`/`.end` prop'larını okur, runtime'da olmayabilir | Fiziksel Home/End tuşu; Ink 7 gerçek Key objesi bu prop'ları doldurmuyorsa silent no-op |
| `input-bar.tsx:98` | CaretText/cursor UTF-16 code-unit'te, surrogate-pair bisect | Emoji yazıp Left/Backspace; render mangle + submit'te corrupt surrogate |
| `input-queue.ts:59` | duplicate-Enter guard `/steer` drain sonrası legitimate identical girdiyi düşürür | `repl_surface.enabled:true` + busy turda identical queue+`/steer` |
| `tool-permissions.ts:64` | catch-all 'read' default deckent_start/run/process'i atlar | Latent — bugün hiçbir canlı caller bu adları classifyTool'a route etmiyor |
| `provider-switch.ts:79` | `teardown(prev)` fire-and-forget, in-flight send()/stream() koşarken | Native-transport credential-yok state + mid-stream `/model x` |
| `chat.ts:58` | Provider-detection/spawn yolunda hardcoded İngilizce string'ler | TR-lang kullanıcı, host CLI yok / unknown `--tool` / MCP attach |
| `chat-session.ts:437` | `ensureSpawn()` teardown sonrası `exited` flag'ini resetlemez → isAlive() yanlış, child leak | Latent — bugün hiçbir caller exit sonrası aynı session'ı reuse etmiyor |
| `chat-tool-bridge.ts:109` | defaultSpawnFn'de `child.on('error')` yok → ENOENT/EMFILE process çökertir | Taşınmış cwd veya fd-exhaustion sırasında headless subcommand spawn |
| `chat-tool-exec.ts:86` | `inScope()` guard'ı pure-lexical, symlink resolve etmez | Confirm'li `deckent_bash ln -s /etc/passwd` + sonra unconfirmed read_file |
| `chat-tool-exec.ts:127` | `edit_file` yalnız ilk occurrence'ı değiştirir; boş/eksik 'old' dosyayı prepend eder | Model `old=''` verir → `before.replace('', new)` başa ekler, silent corrupt |
| `chat-mcp-bridge.ts:280` | JSON-serialize edilemeyen başarılı MCP sonucu çift-audit + false failure raporu | MCP server BigInt/circular result döner → `JSON.stringify` throw, catch 'error' audit |
| `chat-tool-exec.ts:58` | `deckent_bash` `spawn('bash',['-lc',cmd])` hardcode → WSL/Git-Bash'siz native Windows'ta fail | Native Windows, PATH'te bash yok; her deckent_bash `[mcp-error]` |
| `self-modifying.ts:21` | `checkSelfModifying()` raw write-target'ı relative prefix'e startsWith-match eder → absolute-path bypass | dogfood repo + 'auto-edit'/'full-auto' + absolute `/…/src/core/config.ts` write |
| `loop.ts:206` | `cancel()` in-flight tool handler'ı kesemez (`await def.handler` etrafında isCancelled yok) | `deckent_bash sleep 300` koşarken Ctrl+C; 300s bitene dek etkisiz |
| `openai.ts:47` | Sentezlenen tool-call ID'leri per-send() scoped → id-emit-etmeyen backend'de aynı-tur duplicate | tc.id doldurmayan OpenAI-uyumlu backend + aynı-isim/index tekrar |
| `entry.ts:333` | `buildCliStream` mode-detection '{' ile başlayıp claude-event parse etmeyen satırları düşürür | provider=codex/gemini + JSON-şekilli output |
| `entry.ts:200` | `subscriptionReplEnv()` yalnız ANTHROPIC/DECKENT_CLAUDE key strip eder, Gemini/Google key'leri atlar | GEMINI_API_KEY set + provider=gemini → yanlış OAuth-precedence |
| `entry.ts:233` | Ollama-unreachable hatası dile bakılmaksızın hardcoded Türkçe | provider=ollama + `ollama serve` yok + lang=en |
| `entry.ts:686` | Legacy REPL tool-confirm hint'i hardcoded Türkçe (`tui.confirm_hint` bypass) | `DECKENT_INK=0` + lang=en + write/edit/bash onayı |
| `entry.ts:797` | SIGTERM handler persistent claude child'ı teardown etmeden exit eder | `kill -TERM <pid>`/docker stop → warm child orphan |
| `entry.ts:708` | Off-TTY (piped stdin) her side-effecting tool çağrısını onaysız auto-approve eder | `cat prompts.txt \| deckent` + agentic tool-call directive |
| `app.tsx:928` | `/resume` (+/ask//run//control//queue//interrupt//steer) yalnız `repl_surface.enabled=true`'da çalışır | Fresh proje (default false) → literal chat metni olarak düşer |
| `app.tsx:824` | Tur-sonu steer-note/queue merge aynı duplicate-guard'dan geçer, legitimate tekrarı düşürür | `repl_surface.enabled:true` + iki identical `/steer wait` |
| `app.tsx:866` | Top-level engine-driver promise beklenmedik exception'ı yutup REPL'i sessiz exit eder | `registry.toNativeSchemas()`/`toProviderMessages()` throw (malformed MCP şema) |
| `chat-tool-bridge.ts:106` | defaultSpawnFn'de 'error' listener yok, kendi 'dispatch NEVER throws' kontratını çiğner | EMFILE/EACCES gibi atipik OS-resource koşulunda child 'error' event'i |
| `loop.ts:168` | Mid-batch `cancel()` orphan tool_use blokları bırakabilir | Latent — AgentSession.cancel()'in bugün wired REPL'de hiçbir caller'ı yok |
| `permission-store.ts:88` | `persist()` malformed settings.local.json'un TÜM içeriğini sessizce atıp overwrite eder | Bozuk settings dosyası + tool-permission grant ('a') |
| `run.tsx:403` | MCP broker/subprocess bağlantıları REPL exit'te hiç teardown edilmez | `.mcp.json` stdio-server + `/exit` → orphan child riski |
| `entry.ts:803` | Global SIGINT/SIGTERM handler hemen exit eder, REPL'in kendi provider/session teardown'ını bypass eder | External `kill -TERM`/docker/systemd stop |
| `native-transport.ts:161` | deepseek/qwen/glm credential resolution `.deck` secrets store'a bakmaz (claude/openai bakar) | `DECKENT_DEEPSEEK_API_KEY` yalnız `.deck`'te + native_provider:'deepseek' → missing-api-key |
| `run.tsx:493` | ReplLabels mode/resume/busy-control field'ları getMessage'dan doldurulmaz → daima İngilizce | lang=tr + `/ask`//run`//control`//queue`//interrupt`//steer`//resume` (repl_surface DEFAULT-ON, aday 'non-default' yanlıştı) |

---

## 4. P3 NİT LİSTESİ (kompakt)

| file:line | nit |
|---|---|
| `run.tsx:331` (aday `:313`) | Non-EXEC CLI-bridge tool confirm-denial erken return, toolSink 'honest outcome' UI bloğunu atlar; yalnız `--legacy-loop` |
| `run.tsx:474` (aday `:412`) | `ReplErrorBoundary` `label` prop'suz mount → fallback metni daima hardcoded İngilizce (`tui.render_error` `:1079` wire edilmemiş) |
| `busy-controls.ts:158` | `/queue`//interrupt`//steer` parsing case-sensitive, komşu case-insensitive komutlarla tutarsız |
| `line-edit.ts:55` | Whitespace-only submit'ler in-session history objesine kaydedilir (disk history + queue reddeder) |
| `stream-segmenter.ts:83` | Table-mode buffering'de MAX_CODE_BLOCK_LINES-eşdeğeri cap yok; uzun pipe-içeren prose real-time stream'i dondurabilir |
| `native-agent-bridge.ts:204` (aday `:179`) | Bg-turn drain loop tek `onTurnEnd` closure'ını (baked-in startMs) çok synthetic tur boyunca reuse eder (bugün dead) |
| `native-tool-registry.ts:280` | `deckent_describe_tool` daima boş params (paylaşılan generic `z.record` passthrough şema); tool-surface unwired |
| `native-agent-bridge.ts:160` (aday `:142`) | Tool-result verb metni başarısız çağrıda bile '(tool ran)' okur (✗ glyph ayrı emit edilir) |
| `approval-terminal-channel.ts:85` | `dispose()` closure-captured `decisionHandler`'ı canlı bırakır → dispose sonrası `decide()` hâlâ sessizce resolve eder |
| `chat-repl-ux.ts:147` | `createReplLines` + destek sınıfları sıfır production caller'lı dead code; arrow-key history hiç wire değil |
| `chat-native.ts:894` | Slash/agentic cancellation mesajları hardcoded İngilizce (komşu output'lar getMessage kullanır) |
| `chat-tool-bridge.ts:364` | '[mcp-error] tool not allowed' gerçekten-disallowed tool ile eksik-arg'lı izinli tool için aynı döner |
| `identity.ts:42` | `composeSystemPrompt()` `lang` kabul eder ama `opts.lang` okumaz → immutable core + default persona daima Türkçe |
| `anthropic.ts:61` | Non-OK HTTP'de bare status code throw, response body atılır (provider hata detayı kaybolur); `openai.ts:76` aynı |
| `entry.ts:760` | Off-TTY spinner hardcoded Türkçe label + stderr-TTY no-op check'i stdin&&stdout gating'den sapabilir |
| `entry.ts:782` | Node-version guard hardcoded İngilizce (`error.node_version_low` bilingual key bypass) |
| `input-bar.tsx:128` | Debug keylog `/tmp`'e hardcoded, non-POSIX host'ta silent no-op (opt-in `DECKENT_INK_DEBUG=1`) |
| `chat-native.ts:563` | `getRecentTurns` naive tail-slice, tool_use/tool_result pairing-safety'siz; `contextWindowSize` production'da hiç set edilmez (dead) |
| `chat-native.ts:562` | (aynı) sibling budget-fitter'daki pairing-safety'nin DRY-eksik ikizi |
| `run.tsx:53` | `localizeNativeError` var-olmayan `native.switch.no-transport` key'i kurar (key-miss fallback sayesinde zararsız) |
| `native-transport.ts:205` | Doc-comment Ollama default context'i 32k der; kod iki satır aşağıda 24k döner |

---

## 5. SLASH MENÜ-vs-MOTOR MATRİSİ (kesinleşmiş liste)

**Kaynak:** `app.tsx:822-833` (native dispatch, sıfır slash-parse) · `app.tsx:928` (`if(replSurfaceEnabled)` gate) · `native-tool-registry.ts:319-334` (yalnız 6 tool) · `session.ts:489` (`/approve` dead).

**Grup A — SLASH_CATALOG'da var, default (Ink) native-agent motorunda HİÇ dispatch edilmez (config-bağımsız, P1-13):**
`/status`, `/help`, `/recall`, `/plan`, `/config`, `/kill`, `/autonomous`, `/audit`, `/nervous`, `/mcp`, `/directives`, `/checkpoint`, `/sync`, `/cleanup`, `/recover`, `/usage`, `/resources`, `/explain`, `/agents`, `/skills`, `/features`, `/analyze`, `/interrogate` (23 komut → LLM'e düz metin).

**Grup B — yalnız `repl_surface.enabled=true` iken dispatch, fresh/default projede Grup A gibi düşer (P2, `app.tsx:928`):**
`/ask`, `/run`, `/control`, `/queue`, `/interrupt`, `/steer`, `/resume` (7 komut).

**Grup C — motora ulaşır ama davranışı yanlış (dispatch var, effect yok):**
`/approve <mode>` → app-UI onayı gösterir, `setApprovalMode` production'da çağrılmaz → native session mode'u değişmez (P1-14, `session.ts:489`).

**Motorda GERÇEKTEN çalışan (referans):** `/model`, `/provider` (dispatch edilir — ama P1-17/P1-18/P1-5 kusurlarını taşır); native registry'nin 6 tool'u (`deckent_status/history/retro/doctor/models/review`).

---

## 6. ÖLÇÜLMÜŞ COVERAGE

74 bulgunun test-eşlemesi (test-dosyası inceleme + grep ile ölçüldü; tahmin yok):

- **covered: yes — 1** · `entry.ts:233` (Ollama-Türkçe) → `tests/cli/repl-provider-resolve.test.ts` hardcoded Türkçe string'i **beklenen çıktı olarak pin'ler** (dile-duyarlı yapılınca test kırılır — yani test yanlış davranışı sabitliyor).
- **covered: partial — ~14** · Öne çıkanlar: `line-edit.ts:80` (tek-char ESC + düz paste ayrı, gömülü-byte yok) · `stream-segmenter.ts:80` (reset assert edilir, misparse edilmez) · `chat-nervous-bridge.ts:190` (sahte-outcome yarısı test edilir, executor-not-notified yarısı değil) · `session.ts:489` (`setApprovalMode` doğrudan çağrılır, `/approve` wiring değil) · `context-budget.ts:69` (genel success case, köşe-durum değil) · `input-queue.ts:59` & `app.tsx:824` (re-enqueue mekanizması exercise edilir, duplicate-set yok) · `loop.ts:168` (mid-batch cancel test edilir, orphan tool_use transcript'i inspect edilmez) · `entry.ts:797`/`:803` (sigterm sprint-cleanup test edilir, persistent REPL child değil) · `anthropic.ts:61` (throw doğrulanır, atılan body içeriği değil) · `run.tsx:493` (modeAsk/Run/Control test edilir, resume/busy-control field'ları değil) · `native-agent-bridge.ts:204`.
- **covered: no — ~59** · P0-1 dahil tüm severe'lerin çoğu regresyonsuz: `chat-session.ts:272` (spawn-ENOENT testi yok) · `provider-switch.ts:77` (rebuild hiç throw etmiyor) · `mcp-bridge.ts:90` (run.tsx composition test edilmiyor) · `loop.ts:62` (primaryResource assertion yok) · `app.tsx:1033` (SLASH_CATALOG dispatch tablosu test edilmiyor) · `anthropic.ts:19`, `native-transport.ts:93`, `chat.ts:523` (grep: `gracefulErrors` testlerde yok), `entry.ts` `buildCliStream`/`subscriptionReplEnv` (grep sıfır hit).

**REPL test-subset koşusu:** Ölçüm test-dosyası incelemesi + grep ile yapıldı; ayrı bir vitest-subset koşu çıktısı sağlanmadı. Live-PTY probe'ta 4 harness koştu (bkz. §7) — hepsi PASS ama **hiçbiri listelenen bulguları tetiklemiyor** (happy-path tool round-trip / `/help` render). Yani mevcut yeşil-CI, bu turun bulgularının hiçbirini yakalamaz; regresyon-testi yazımı P0/P1'ler için sıfırdan gerekli.

---

## 7. LIVE-PTY PROBE

- **dist tazeliği (moving target):** Probe başında `dist/cli` STALE'di — son commit `2026-07-07 12:17:12` ama `src/cli/repl`+`src/cli/commands` altında 8 uncommitted dosya (mtime 20:43-22:23); en yeni dist-build 21:05:05, yani `app.tsx`/`input-bar.tsx`/`run.tsx`/`term-mode.ts`/`chat-slash-registry.ts`'in 22:22-22:23 edit'lerini içermiyordu. Probe ortasında **bir arka-plan build tamamlandı** (dist re-timestamp 22:32:28), böylece harness'ler koşarken dist güncel working-tree'yi yansıtıyordu. Bu **canlı, aktif-build edilen** bir ortam (başka bir agent/oturum eşzamanlı compile+kullanım yapıyor) — tazelik sabit değil.
- **Harness sonuçları (hepsi PASS, none hung, <45s):**
  - `ink-pty-native-verify.mjs` → PASS (tool round-trip: confirm card, proof-file write, scrollback artifact); ilk çağrı `SKIP: dist not found` verdi (concurrent rebuild race), saniyeler sonra fresh-build'de PASS. Hermetic mkdtemp cwd.
  - `ink-pty-tool-verify.mjs` → PASS (4 senaryo: write+approval, bash-tek, deny, multi-tag). Hermetic.
  - `repl-smoke-verify.mjs` → PASS (7 check). Gerçek repo dir'ine piped non-TTY koşar ama `.deckent/settings/repl-history` md5+satır-sayısı before/after identik (42 satır) — proje state'ine persist etmiyor.
  - `chat-native-smoke.mjs` → PASS (4 check). Tamamen in-memory, spawn yok.
  - Manuel: `printf '/help\n' | node dist/cli/entry.js chat --native --once` → tam `/help` katalog (Komutlar + trust-badged Core/Danger Actions) hemen render, exit 0, LLM'e fall-through yok.
- **Statik bulguları DOĞRULAYAN davranış:** Manuel `/help` smoke, slash-interception'ın native provider round-trip'ten **önce** olduğunu gösterir — ama bu **legacy `chat --native` (runChatNativeLoop) yolu** (`handleReplCommand` gate), P1-13'ün etkilediği **default Ink native-engine** değil. Yani probe P1-13'ü çürütmez: `--native --once` intercept eden kod (`chat-native.ts`) ile Ink `app.tsx:822-833` (intercept-etmeyen) ayrı yollar.
- **State-safety:** `git status`'taki `.deckent/settings/repl-history` + bazı src/tests değişiklikleri **eşzamanlı canlı kullanıcı oturumundan** (Türkçe konuşma girdileri) — probe kaynaklı değil; 3 harness'in hermetik/in-memory olduğu, 4.'ünün persist etmediği ölçümle kanıtlandı. Probe hiçbir tracked proje state'ine yazmadı.

---

## 8. KALİBRASYON NOTU (bu turun dürüstlük-kanıtı)

- **Adversarial olarak incelenen aday:** 74 kept + 3 dropped = **77 bulgu**.
- **Severe refute'ta elenen (3):** (a) HistoryNavigator in-buffer-edit discard → mekanik gerçek ama fonksiyonun **kendi docstring'inde** (`input-history.ts:90-92`) belgelenen intended kontrat (readline/bash/zsh standard semantiği) → documented-design, düşürüldü; ayrıca "Escape reset() line 161" iddiası HEAD'de mevcut değil (evidence-inaccuracy). (b) `classifyExternalTool` prefix-heuristic auto-approve → default native yolda **name-agnostic** hardcoded `tier:'confirm'` (`native-tool-registry.ts:378`) + default 'suggest' gerçek prompt sorar → iddia edilen silent-auto-approve tutmuyor, yalnız kullanıcının kendi yazdığı `/mcp call` (explicit consent) yolunda önemli → çürütüldü. (c) `chat-enterprise-bridge.ts` timeout-yok hang → kod-smell gerçek ama ulaşılabilir hiçbir input unbounded/network işe varmıyor (bare `/audit` sprint-id-yok'ta fail-fast; `/rbac`//flow`//cost` sabit sync subcommand'lar) → concrete-trigger kurulamadı, P1/P0 olarak refute (defensif P3 değeri kaldı).
- **Severity recalibration:** 2 P0-adayı → P1 (`provider-switch.ts:77`, first-pass native-default zinciri factually yanlıştı; corrected default-adjacent trigger bulundu). Yukarı: `native-agent-bridge usage` P2→P1 (stale native-flag gerekçesi), `mcp-bridge` P2→P1, `session.ts /approve` P2→P1, `loop.ts primaryResource` P2→P1. Aşağı: `app.tsx InputBar` P1→P2 (non-default flag), `chat-tool-bridge:106` P1→P2 (atipik OS-koşul), `run.tsx:331` P2→P3 (legacy-only), `getRecentTurns` P2→P3 (dead), `permission-store persist` P3→P2 (documented-intent çelişkisi).
- **Satır-referansı düzeltmeleri (~8 `line_ok:false`):** `native-agent-bridge.ts` 145→163, `loop.ts` 48→62, 150→206, `app.tsx` 1121→1130, `run.tsx` 313→331, 412→474, `native-agent-bridge.ts` 179→204, 142→160.
- **Secondary-citation hataları (düşürülmedi, kalite-notu):** `config-types.ts` 708→715, `run.tsx` 274→292 / 390→449 / 881→`app.tsx:884`, `native-transport.ts` 33→32, `messages.ts` 1055→1079.
- **Fabrike/yanlış cross-reference (1):** `authority-enforcer.ts`'in aynı hardcoded-bash pattern'i taşıdığı iddiası **YANLIŞ** (grep: o dosyada 'bash'/spawn hiç yok) — bulgunun kendisi (`chat-tool-exec.ts:58`) doğru olduğu için tutuldu ama evidence-defect flag'lendi.

Net: 77 aday → 3 severe refute + çok sayıda satır/severity düzeltmesi hayatta kalan 74 bulguyu üretti; kalibrasyon two-way (4 yukarı, 5 aşağı) → sistematik severity-inflation yok.

---

## 9. SONUÇ + ÖNCELİKLİ FIX SIRASI

Deckent terminalinin motor mimarisi (deterministik agent-loop, cost-guard, transcript) sağlam; kusurlar **kenar-katmanlarda** yoğunlaşıyor: default-path crash, "menü var / motor yok" dispatch drift'i, permission-resource kör-noktası, i18n hardcode borcu, ve tool-loop mesaj-şekli bütünlüğü.

**Fix sırası:**

1. **P0-1** `chat-session.ts:272` — child `error` listener (default REPL crash; tek satırlık ama en yüksek blast-radius).
2. **P1 güvenlik/veri-bütünlüğü kümesi (birlikte):** `loop.ts:62` primaryResource `cmd` (kör-onay + `**` grant), `app.tsx:1033` SLASH_CATALOG dispatch (23 komut ölü), `session.ts:489` `/approve` wiring (sahte onay-modu).
3. **P1 spawn/resilience kümesi:** `chat-native.ts:1156` + `chat.ts:523` (`--native`/interactive graceful-error), `provider-switch.ts:77` (invalid-provider crash), `mcp-bridge.ts:90` (unconditional auto-connect).
4. **P1 tool-loop bütünlüğü:** `anthropic.ts:19` (parallel tool_result merge), `context-budget.ts:69` (orphan tool_result boundary) — provider-reject'e yol açan mesaj-şekli hataları.
5. **P1 UX/telemetri/model-switch:** `native-agent-bridge.ts:163` (usage biriktirme), `stream-segmenter.ts:80` (fence misparse), `app.tsx:1004` + `native-transport.ts:93` (mid-turn/invalid model-switch), `chat-tool-bridge.ts:81` (plan/audit 30s kill).
6. **P1 i18n:** `chat-tool-exec.ts:43` (confirm-prompt hardcode-TR) — CLAUDE.md zorunlu kuralı; sonra `line-edit.ts:59`/`:80` (surrogate + paste-injection).
7. **Yüksek-frekans P2'ler:** `run.tsx:493` (ReplLabels i18n, default-ON surface), `app.tsx:928` (repl_surface gated slash drift), `entry.ts:200`/`:333` (gemini env-strip + line-drop), `chat-tool-exec.ts:127` (empty-`old` prepend corruption), `entry.ts:797`/`:803`+`run.tsx:403` (SIGTERM/MCP teardown leak).
8. **P3'ler:** batch temizlik — i18n hookup'ları (`identity.ts:42`, `entry.ts:760`/`:782`, `run.tsx:474`), dead-code (`chat-repl-ux.ts`, `getRecentTurns`), doc-drift (`native-transport.ts:205`).

Her P0/P1 fix'i, §6'da "covered: no/partial" işaretli olduğu için **beraberinde bir regresyon-testi** getirmeli (özellikle spawn-ENOENT, SLASH_CATALOG dispatch, primaryResource-`cmd`, parallel-tool_result-merge — bugün sıfır kapsam).
