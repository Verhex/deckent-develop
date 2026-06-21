# cli#2 — REPL chat surface (src/cli/commands/chat-*)

Code-only audit of 14 modules (chat-enterprise-bridge, chat-layout, chat-mcp-bridge, chat-mode,
chat-native, chat-nervous-bridge, chat-permissions, chat-provider-parity, chat-render-region,
chat-render, chat-repl-ux, chat-resume, chat-session, chat-slash-menu). Every finding carries
file:line + a proving snippet; zero-caller claims are grep-verified across `src/` (test + def files
excluded). Source unchanged.

## Findings

### unwired (zero production caller — grep-verified)

- [unwired|high] Whole `chat-mode.ts` module is dead in production — `src/cli/commands/chat-mode.ts:36,55,67` — `grep -rn "resolveChatMode\|filterRegistryByMode\|isEnterpriseSlash" src` returns ONLY the def file; the sole consumer is `tests/cli/chat-mode.test.ts`. — The REPL renders `/help` from the UNFILTERED registry (`chat-native.ts:662-665` `resolveSlash(line, buildSlashRegistry())` → `renderHelp(slashAction.registry)`), so the user/enterprise mode filter (`filterRegistryByMode`) is never invoked and the `config.chat.mode` knob (`resolveChatMode:41`) is dead config. Enterprise slashes are always visible regardless of mode.
- [unwired|med] `parseToolCallFromText` exported fallback parser never called in prod — `src/cli/commands/chat-native.ts:367` — `const TOOL_CALL_TAG_RE = /<tool_use\b…/i; export function parseToolCallFromText(text)…`; `grep -rn "parseToolCallFromText" src` outside the def is empty (only `tests/cli/chat-native.test.ts`). — `runChatNativeLoop` branches on `response.toolCalls` directly (`:826`) and `chat-session.ts` uses `parseDeckentToolCalls`; the `<tool_use>` text-tag heuristic is orphaned.
- [unwired|med] `createLineQueue` async line buffer never wired — `src/cli/commands/chat-render-region.ts:279` — `export async function* createLineQueue(rl, onIdle?)…`; `grep -rn "createLineQueue(" src` outside the def is empty. `entry.ts:529` references it in a COMMENT only ("createLineQueue buffers lines typed during a turn"); the live REPL uses a local `enqueue`-based queue instead. Consumer = `tests/cli/repl-render-region.test.ts`. — The `onIdle` callback + back-to-back ("art arda") buffering described in the docstring is dormant.
- [unwired|med] `reduceSlashMenu` keypress reducer is dead; only the "safe variant" is wired — `src/cli/commands/chat-slash-menu.ts:106` — `grep -rn "reduceSlashMenu" src` outside the def is empty; `entry.ts:557,560` wires only `slashMenuOnKeypress` + `renderSlashMenu` + `filterSlashCommands`. The module docstring (`:63-72`) admits entry.ts uses the "GÜVENLİ varyant". — The interactive ↑/↓/select/escape reducer (`SlashKey`/`SlashMenuResult`/`CLOSED_MENU` nav, `:84-141`) is exercised only by `tests/cli/chat-slash-menu.test.ts`.
- [unwired|low] `enterpriseSlashNames` exported helper has zero callers — `src/cli/commands/chat-enterprise-bridge.ts:104` — `export function enterpriseSlashNames(): readonly string[] { return Object.keys(ENTERPRISE_COMMANDS); }`; `grep -rn "enterpriseSlashNames" src` outside the def is empty (only `tests/cli/chat-enterprise-bridge.test.ts`). — Docstring claims "Slash-registry consumers use this to register the enterprise group" but no consumer exists.
- [unwired|med] `createMcpAuditSink` documented construction pattern is never followed — `src/cli/commands/chat-mcp-bridge.ts:121` — `export function createMcpAuditSink(projectRoot, sprintId?)…`; `grep -rn "createMcpAuditSink" src` outside the def is empty (and absent from tests). — Docstring (`:114`) says pass it as `new McpClientBroker({ onCall: createMcpAuditSink(root) })`, but ALL THREE live broker construction sites omit the onCall hook — `repl/run.tsx:189 new McpClientBroker({})` (the DEFAULT Ink REPL path), `chat-native.ts:620 new McpClientBroker()` (legacy loop), `repl/mcp-bridge.ts:97 new McpClientBroker()` (bridge default) — so the broker-level audit-to-event-stream is never installed on any path.

### dormant (defined-but-unread path / no-op gate)

- [dormant|low] `renderSlashMenu` selection-highlight branch never renders in prod — `src/cli/commands/chat-slash-menu.ts:48-58` — the only prod call passes a literal `0`: `entry.ts:560 region.writeAbove(renderSlashMenu(filterSlashCommands(slashRegistry, '/'), 0, isTty))`. — Because the ↑/↓ reducer (`reduceSlashMenu`) is unwired, `selected` is always 0, so the `❯`/CYAN-BOLD highlighted-row branch (`:56-57`) only ever marks the first item; the dim/selected divergence is dead at runtime.
- [dormant|low] `createSubscriptionChatAdapter` resolves a provider then discards it — `src/cli/commands/chat-native.ts:983-986` — `const adapter: ProviderAdapter = opts.providerName !== undefined ? registry.getProvider(opts.providerName) : registry.getDefault(); void adapter;` — The resolved adapter is intentionally voided; `send`/`stream` always spawn `binary = opts.binary ?? 'claude'` (`:988`). The resolution exists only for its throw-on-missing side-effect and never routes codex/gemini to a different binary.

### inconsistent (duplicate / divergent / conflicting default)

- [inconsistent|med] Duplicated subscription-spawn adapter implementation — `src/cli/commands/chat-provider-parity.ts:43,51,58` vs `src/cli/commands/chat-native.ts:990,992,976` — `chat-provider-parity` re-implements `subscriptionEnv()` (`:51`, byte-identical delete of ANTHROPIC_API_KEY/DECKENT_CLAUDE_API_KEY), `cliExtraArgs` (`:43`), and `buildCliSpawnAdapter` (`:58`) which duplicate `chat-native.ts createSubscriptionChatAdapter`/`subscriptionEnv` (`:992`)/`extraArgs=['--print']` (`:990`). — Two parallel CLI-spawn paths drift independently: parity adds codex (`exec --full-auto`)/gemini (`-p`) extraArgs while chat-native hardcodes claude `--print`.
- [inconsistent|med] "provider-parity" is incomplete — HTTP providers have no `stream()` — `src/cli/commands/chat-provider-parity.ts:90,118` — `buildCliSpawnAdapter` implements both `send` + `stream` (`:65,73`), but `buildOllamaAdapter` (`:99`) and `buildOpenAiCompatAdapter` (`:127`) return objects with ONLY `send`. — Despite the module name, ollama/openai-compatible silently fall back to non-streaming via `runProviderTurn`'s `if (!provider.stream) return provider.send(messages)` (`chat-native.ts:393`); no streaming parity.
- [inconsistent|med] Hardcoded Turkish user-facing strings diverge from the i18n-first `getMessage` convention — `src/cli/commands/chat-render-region.ts:87,209`; `src/cli/commands/chat-session.ts:95,478,487` — `THINKING_VERBS = ['düşünüyor',…]` (`region:87`), `TOOL_VERBS = { deckent_write_file: 'dosya yazıyor',… }` (`region:209`), `DECKENT_AGENTIC_SYSTEM_PROMPT` (`session:95`, full TR), `turnInput` returns `"[deckent tool sonucu]\n…\n\nKullanıcıya kısaca sonucu bildir."` (`session:478,487`). — Sibling modules (`chat-resume.ts`, `chat-nervous-bridge.ts`, `chat-native.ts`) route every surface string through `getMessage(key, lang)`; these literals violate CLAUDE.md "i18n-FIRST — never hardcode user-facing strings".
- [inconsistent|med] Two divergent markdown renderers — the default Ink REPL and the legacy/piped path style reply text differently — `src/cli/commands/chat-render.ts:95` (`renderMarkdown`) vs `src/cli/commands/chat-render.ts:221` (`createStreamMarkdown`) — `renderMarkdown` is the FULL block renderer (code boxes `:32`, tables `:48`, admonitions `:81`, OSC-8 links `:27`, path-colouring `:185`) and IS wired — `src/cli/repl/app.tsx:16,248` `return <Text>{renderMarkdown(turn.text, true)}</Text>` renders every completed reply segment in the default Ink REPL (`entry.ts:510-513` `inkMode = isTtyEarly && DECKENT_INK !== '0'` → `runInkRepl`). The legacy/non-TTY path (`DECKENT_INK=0` or piped) instead streams via `createStreamMarkdown` (`entry.ts:36,654`), a stateful transform that only toggles `**bold**`/`` `code` `` (`chat-render.ts:201-204`). — Same reply renders RICH (tables/code-boxes/admonitions/links) under Ink but those constructs silently degrade to raw markdown in legacy/piped output; no shared renderer, so the two paths drift.

### dead-test (coverage of unwired/dormant code → false confidence)

- [dead-test|high] `chat-mode.test.ts` green-tests a module with zero production callers — `tests/cli/chat-mode.test.ts:2-7` imports `resolveChatMode/filterRegistryByMode/isEnterpriseSlash` (all unwired, see above). — Passing assertions imply the user/enterprise `/help` filter works, but it is never invoked in the live REPL; the suite covers dead code.
- [dead-test|med] Tests exercise other unwired exports — `tests/cli/chat-slash-menu.test.ts` (`reduceSlashMenu`), `tests/cli/chat-native.test.ts` (`parseToolCallFromText`), `tests/cli/chat-enterprise-bridge.test.ts` (`enterpriseSlashNames`), `tests/cli/repl-render-region.test.ts` (`createLineQueue`) — each export has zero prod callers (grep-verified). — Coverage exists without a runtime wire, so "tests pass" overstates the feature surface that actually executes. (NOTE: `tests/cli/chat-render.test.ts`/`renderMarkdown` is NOT in this list — `renderMarkdown` is wired into the default Ink REPL at `app.tsx:248`; see the divergent-renderer finding above.)

### root-cause (silent-fallback / hardcoded-0-metric)

- [root-cause|med] MCP server connect/list failures are silently swallowed — `src/cli/commands/chat-mcp-bridge.ts:227-236` — `try { if (!broker.isConnected(name)) await broker.connect(name, def); const tools = await broker.listTools(name); registerNamespaced(…); connected.push(name); } catch { /* Skip a misbehaving server — the REPL stays usable. */ }` — A server that never connects is dropped with no event-stream/audit/user signal (the bridge's `audit` sink only fires on `dispatch`, not on connect), so a broken `.mcp.json` server is invisible.
- [root-cause|med] `/mcp` lazy-build conflates "no servers" with "config/build error" — `src/cli/commands/chat-native.ts:612-627` — `try { configured = Object.keys(loadMcpServers(mcpRoot)).length > 0; } catch { configured = false; }` and `try { liveMcpBridge = buildMcpBridge({…}); } catch { liveMcpBridge = null; }` — Both failure modes fall through to the honest "not wired" notice (`:646-647`); a malformed `.mcp.json` or a broker-construction throw is indistinguishable from "no MCP server configured" — no diagnostic surfaced.
- [root-cause|low] Token-usage parser hardcodes 0 on shape mismatch → footer can show a false `0 tok` — `src/cli/commands/chat-session.ts:351-353` — `const inTok = typeof ur['input_tokens'] === 'number' ? ur['input_tokens'] : 0; const outTok = typeof ur['output_tokens'] === 'number' ? ur['output_tokens'] : 0;` — When `result.usage` is absent/renamed, usage is reported as `{0,0}` (truthy object), so `renderTurnStatsFooter` (`chat-native.ts:350`) prints `⏱ 3.2s · 0 tok` indistinguishably from a genuine zero rather than omitting the token count.

## Summary

14 modules read in full. The cluster splits cleanly into **wired core** (chat-native loop,
chat-session persistent claude, chat-repl-ux, chat-permissions, chat-render-region's
region/ticker/coalescer/sink, chat-layout, chat-resume, chat-nervous-bridge, chat-provider-parity
resolver, chat-mcp-bridge `buildMcpBridge`) and a **dead/partial tail**:

- **unwired (6):** entire `chat-mode.ts` (mode filtering never runs), `parseToolCallFromText`,
  `createLineQueue`, `reduceSlashMenu` (interactive menu reducer), `enterpriseSlashNames`,
  `createMcpAuditSink` (broker audit hook never installed on any of the 3 construction sites).
- **dormant (2):** `renderSlashMenu` selection-highlight (always selected=0), resolved-but-voided
  provider adapter in `createSubscriptionChatAdapter`.
- **inconsistent (4):** duplicated CLI-spawn adapter (parity vs native), no `stream()` parity for
  ollama/openai-compatible despite the "provider-parity" name, hardcoded-TR strings vs getMessage,
  two divergent markdown renderers (`renderMarkdown` full-block in the default Ink REPL vs
  `createStreamMarkdown` bold/code-only in the legacy/piped path → rich constructs degrade off-Ink).
- **dead-test (2):** chat-mode + 4 other suites green-test zero-caller exports.
- **root-cause (3):** silent MCP connect-failure swallow, `/mcp` no-server-vs-error conflation,
  hardcoded-0 token-usage footer.

Highest-leverage: `chat-mode.ts` is fully built + tested but never wired into `/help` rendering;
the broker-level MCP audit (`createMcpAuditSink`) is documented but absent from all three live
broker wires; and reply markdown renders RICH under the default Ink REPL but silently degrades to
raw text in legacy/piped output (two unshared renderers). No source modified (read-only audit).
