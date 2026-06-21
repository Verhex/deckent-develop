# cli#8 — cli/helpers (config + i18n + output + mcp-attach + error/eta)

Cluster `cli#8` — 14 files: codex-config, config-reader, cursor-config, dashboard-dir,
debt-counter, error-handler, eta-calculator, gemini-config, hints, i18n, mcp-attach,
messages, output-mode, output. Code-only audit (5 categories). Source UNCHANGED. Every
finding carries file:line + proving snippet; zero-caller claims grep-verified across
`src/**` and `tests/**` (def + test excluded).

## Findings

### unwired (zero production caller — grep-verified)

- [unwired|high] Entire `output-mode.ts` module is never wired into any command — `src/cli/helpers/output-mode.ts:12,19,26,44,60` — `export function setOutputMode/getOutputMode/resetOutputMode/shouldOutput/wrapLogger`; grep of `setOutputMode|getOutputMode|resetOutputMode|wrapLogger|shouldOutput` over `**/*.{ts,tsx}` returns ONLY `output-mode.ts` (self) + `tests/cli/helpers/output-mode.test.ts`. No CLI command reads `--quiet/--verbose` through this. The whole quiet/normal/verbose gating infra (`let currentMode: OutputLevel = 'normal'` :5) is dead — every command writes via `print()`/`process.stdout` directly.

- [unwired|high] `getContextualHints` has zero production callers — `src/cli/helpers/hints.ts:9` — `export function getContextualHints(phase, status?, lang='en'): string[]`; the only reference outside the def is `tests/cli/hints.test.ts:2`. No `status`/`watch`/`repl` command imports `helpers/hints.js`. Whole contextual-hint feature (COMPLETE/EXECUTE/PLAN/IDLE) is built + tested but never surfaced.

- [unwired|high] `ETACalculator` class is dead in production — `src/cli/helpers/eta-calculator.ts:3` — `export class ETACalculator`; grep `ETACalculator|new ETACalculator` finds only `tests/integration/progress-summary.test.ts` + `tests/cli/helpers/eta-calculator.test.ts`. The wired ETA path is the divergent twin `output.ts:355 estimateRemaining` (used by `formatHumanStatus` :502). Two ETA engines, one tested-only.

- [unwired|med] `getAttachCommand` exported but only tests call it — `src/cli/helpers/mcp-attach.ts:130` — `export function getAttachCommand(host): AttachCommand | null`; sole consumer is `tests/cli/mcp-attach.test.ts:55,66`. The production attach path (`ensureMcpAttached`, wired at `chat.ts:501,518`) reads `HOST_COMMANDS[host]` directly (:142), bypassing `getAttachCommand`.

- [unwired|med] `DECKENT_MCP_TOOL_COUNT` re-export consumed only by tests — `src/cli/helpers/mcp-attach.ts:89-90` — `const _mcpToolCountSnapshot = getMcpToolCount(); export { _mcpToolCountSnapshot as DECKENT_MCP_TOOL_COUNT }`; grep shows production code calls `getMcpToolCount()` live; the snapshot constant appears only in `tests/cli/mcp-attach.test.ts` + `tests/cli/mcp-tool-count.test.ts`. A second, frozen-at-import-time copy of the same number that nothing in `src/` reads.

- [unwired|med] i18n `getMessages` bound-getter + `MessageKey` type are test-only — `src/cli/helpers/i18n.ts:95` (`export function getMessages(lang)`) and `:51` (`export type MessageKey`) — every command calls `getMessage(key, lang, vars)` directly (e.g. `hints.ts:18`); the `getMessages(lang) → t('key')` convenience wrapper is referenced only in `tests/cli/i18n.test.ts:106-132`. `MessageKey` is used solely to type `getMessages`’ unused signature.

- [unwired|low] `isSupportedLang` / exported `SUPPORTED_LANGS` are test-only — `src/cli/helpers/i18n.ts:102,106` — `export const SUPPORTED_LANGS` / `export function isSupportedLang`; sole consumer `tests/cli/i18n.test.ts:16,249-259`. Production lang-narrowing happens inside `messages.ts:getLanguage` (its own private `SUPPORTED_LANGS` :1778), never via this exported pair.

### dormant (defined-but-unreachable / no-op gate)

- [dormant|med] `getMcpToolCount` try/catch can never reach catch — `src/cli/helpers/mcp-attach.ts:80-86` — `try { return _MCP_TOOL_NAMES.length; } catch { return 0; }`; `_MCP_TOOL_NAMES` is a module-frozen array (`:63 Object.freeze([...])`), so `.length` cannot throw. The `catch { return 0 }` "graceful registry-unavailable" branch is unreachable dead code; the docstring "Returns 0 gracefully if the registry is unavailable" describes behavior that cannot occur.

- [dormant|low] `formatFatalAndExit`/`installFatalHandlers` exist but the install path self-disables under tests and is gated out at runtime by VITEST — `src/cli/helpers/error-handler.ts:152-159` — `if (isTestEnv() && !opts.force) return false;`; the handler body (`:103`) is real, but every test run takes the early-return, so the wired install is exercised only via `{force:true}` in `__resetFatalHandlersForTest` paths — the actual `process.on('uncaughtException', …)` wiring (:156-157) is never validated end-to-end in CI.

### inconsistent (conflicting default / duplicate / divergent)

- [inconsistent|high] Two divergent language-detection helpers — same user, different lang per command — `src/cli/helpers/config-reader.ts:9` (`getLangFromConfig`: config-only, no env, returns raw `config.language`) vs `src/cli/helpers/i18n.ts:30` (`detectLang`: config→LC_ALL→LANG→'en', normalized via `getLanguage`). `retro/explain/finalize/resources/doctor/cleanup` call `getLangFromConfig`; `web/mcp/features/history/config/recall/remember/recover/help/autonomous-mission/dashboard` call `detectLang`. A user with `LANG=tr_TR` and no `config.language` gets TR for `deckent history` but EN for `deckent retro`.

- [inconsistent|high] `getLangFromConfig` returns un-normalized locale → silently mis-rendered — `src/cli/helpers/config-reader.ts:13-14` — `return config.language ?? 'en';`; if `config.language='tr_TR'`, the raw `'tr_TR'` flows into `getMessage` whose `messages.ts:1768 normalizedLang = lang === 'tr' ? 'tr' : 'en'` treats anything ≠ exact `'tr'` as English. `detectLang` (i18n) normalizes `'tr_TR'→'tr'` (`messages.ts:1788 slice(0,2)`). Same config, opposite output across the two readers.

- [inconsistent|high] Stale hardcoded MCP tool-name snapshot diverges from real registry — `src/cli/helpers/mcp-attach.ts:63-73` — `_MCP_TOOL_NAMES = Object.freeze([... 31 names ...])`; actual registry = **35** `server.registerTool(` calls across `src/mcp/tools/*` (nervous.ts alone = 5). User-facing message `Deckent MCP ready — ${getMcpToolCount()} tools available.` (:225,267,292) therefore reports 31, while `IDENTITY.md` claims 35 and `CLAUDE.md` claims 33 — three different counts for one fact.

- [inconsistent|med] Duplicate `formatTable` with divergent signature — `src/cli/helpers/output.ts:120` (`formatTable(headers: string[], rows: string[][])`, generic ASCII grid) vs `src/cli/commands/features.ts:64` (`function formatTable(entries, lang)`, feature-specific). Same name, different contract; `features.ts` shadows the shared helper, so a maintainer editing `output.ts:formatTable` silently does not affect `features`.

- [inconsistent|med] Two divergent weighted-average ETA algorithms — `src/cli/helpers/eta-calculator.ts:46-60` (`weightedAverage`: last-3 entries ×2 weight) vs `src/cli/helpers/output.ts:355-381` (`estimateRemaining`: last-5 entries, linear `weight=i+1`). Both estimate "remaining sprint time" from task durations but with different windows/weights; only `estimateRemaining` is wired (`output.ts:502`).

- [inconsistent|med] Two divergent elapsed/ETA formatters — `src/cli/helpers/eta-calculator.ts:29-44` (`formatETA`: `~5m 3s`, `calculating...`, `~0s`) vs `src/cli/helpers/output.ts:338-348` (`formatElapsed`: `45 sec`, `5 min`, `1 hr 5 min`). Different unit words and zero/negative handling for the same "humanize ms" concept.

- [inconsistent|med] Divergent MCP-entry shape across config generators — `src/cli/helpers/cursor-config.ts:6-10` & `src/cli/helpers/gemini-config.ts:7-11` use `{ command:'deckent-mcp', args:[], timeout:600 }` while `src/cli/helpers/codex-config.ts:9-12` writes TOML `tool_timeout_sec = 600`. Three generators, two different timeout key-names for the identical 600s setting → no single source of truth.

- [inconsistent|med] Divergent ANSI-strip regexes in the same cluster — `src/cli/helpers/output.ts:56` & `:141` use `/\x1b\[[0-9;]*m/g` (SGR/`m`-terminated only) while `src/cli/helpers/mcp-attach.ts:316` uses `/\x1b\[[0-9;]*[A-Za-z]/g` (all CSI finals). `output.stripAnsi`/`visibleLength` will leave cursor/clear codes intact that `mcp-attach.containsDeckent` strips — inconsistent "strip ANSI" semantics.

- [inconsistent|low] Duplicate MemoryStore-open helper, one leaks the handle — `src/cli/helpers/debt-counter.ts:7-15` (`openStore`: opens `new MemoryStore`, **never** `.close()`) vs `src/cli/helpers/output.ts:10-18` (`getMemoryEntryCount`: `try { return store.totalCount() } finally { store.close() }`). Same open-DB-guard pattern, divergent lifecycle — `countDebtItems`/`countOpenDebtItems` leave the SQLite handle open every call.

- [inconsistent|low] Duplicate `SUPPORTED_LANGS` const — `src/cli/helpers/i18n.ts:102` (`export const SUPPORTED_LANGS = ['en','tr']`) and `src/cli/helpers/messages.ts:1778` (`const SUPPORTED_LANGS = ['en','tr']`). Two independent definitions of the supported-language list; adding a locale requires editing both.

### dead-test (tautological / coverage-of-dead-code)

- [dead-test|high] `mcp-tool-count` test is tautological — cannot catch the drift it implies it guards — `tests/cli/mcp-tool-count.test.ts:16,20-21` — `expect(getMcpToolCount()).toBe(DECKENT_MCP_TOOL_COUNT)` (both derive from the SAME `_MCP_TOOL_NAMES` array) and `expect(() => getMcpToolCount()).not.toThrow()`. It asserts the array equals itself and that `.length` doesn’t throw; it never compares against the real `registerTools()` registry, so the live 31-vs-35 drift passes green.

- [dead-test|med] `hints.test.ts` gives 14-case coverage to an unwired function — `tests/cli/hints.test.ts:4-88` — full COMPLETE/EXECUTE/PLAN/IDLE/case-insensitive/default-lang matrix over `getContextualHints`, which has zero production callers (see unwired). Green coverage here reads as "feature works" while the feature ships nowhere.

- [dead-test|med] `output-mode.test.ts` exhaustively tests a module no command uses — `tests/cli/helpers/output-mode.test.ts:19-122` — set/get/reset/shouldOutput/wrapLogger across all three levels; all pass, but the module is unwired (see unwired). False-confidence coverage of dormant infra.

### root-cause (silent-fallback / trust-without-verify / hardcoded-0 — exact softening line)

- [root-cause|high] `countDebtItems` collapses DB-missing AND DB-error to `{0,0}` — debt failure is indistinguishable from "no debt" — `src/cli/helpers/debt-counter.ts:19` (`if (!store) return { total: 0, critical: 0 };`) + `:24-26` (`catch { return { total: 0, critical: 0 }; }`). A corrupt/locked `memory.db` reports zero technical debt; downstream surfaces (doctor/status) then show a clean bill of health that is actually a read failure.

- [root-cause|high] `countOpenDebtItems` same hardcoded-0 on missing/error — `src/cli/helpers/debt-counter.ts:31` (`if (!store) return 0;`) + `:35-37` (`catch { return 0; }`). Open-debt count silently becomes 0 when the store can't be read.

- [root-cause|high] Budget line reads "OK" on a DB read error — `src/cli/helpers/output.ts:13-17` (`getMemoryEntryCount`: `catch { return 0; }`) feeding `output.ts:597-607` — `brainLines=0` falls into the `else` branch → `Budget: 0/600 lines (OK)`. A broken memory.db is rendered to the user as a healthy budget.

- [root-cause|high] `_MCP_TOOL_NAMES` is a hand-maintained literal masquerading as derived — `src/cli/helpers/mcp-attach.ts:59-62` (comment: "derived from registerTools() … not a hardcoded number literal. ADR-070 zero-hardcode compliant. Keep in sync with registerTools() body when adding/removing tools.") The list is in fact a manual copy that must be edited by hand on every tool add/remove; it has already drifted (31 vs 35). The "zero-hardcode/derived" claim is false — trust-without-verify with no test that reads the actual registry.

- [root-cause|med] Unreadable existing TOML is overwritten with deckent-only content (silent data loss) — `src/cli/helpers/codex-config.ts:40-45` — `try { content = readFileSync(...) } catch { content = ''; }` then `writeFileSync(filePath, mergeDeckentSection(content))` (:48-49). If a user's `~/.codex/config.toml` exists but is transiently unreadable (perm/EBUSY), the read error silently discards it and writes back only the `[mcp_servers.deckent]` block — the "merge" guarantee in the docstring is violated on read failure.

- [root-cause|med] `getLangFromConfig` swallows malformed-config errors to 'en' with no signal — `src/cli/helpers/config-reader.ts:16-18` — `catch { /* fallback */ }` → `return 'en'`. A JSON-broken `.deckent/config.json` yields English silently with no warning, hiding the misconfiguration from the user.

- [root-cause|med] `spawnSync` host probe violates the project async-spawn/hermeticity standard — `src/cli/helpers/mcp-attach.ts:15,115-120` — `import { spawnSync }` + `DEFAULT_RUNNER = (cmd,args) => spawnSync(cmd, args, { timeout: 10_000 })`. ADR-087 / karpathy CUSTOM rule mandate async `spawn` ("No spawnSync for subprocesses — blocks the event loop"); `deckent chat` runs up to a 10s blocking host-CLI probe (`detectAttachStatus` :153,164) on the main loop.

## Summary

14 files audited code-only. Dominant theme: **tested-but-unwired modules** — three whole units
(`output-mode.ts`, `hints.ts`, `eta-calculator.ts`) plus several exports
(`getAttachCommand`, `DECKENT_MCP_TOOL_COUNT`, i18n `getMessages`/`MessageKey`/`isSupportedLang`)
ship with green test suites yet zero production callers, giving false coverage confidence
(3 dead-test findings). The sharpest correctness risk is the **fork in language detection**
(`getLangFromConfig` config-only/un-normalized vs `detectLang` config+env+normalized) causing
per-command locale divergence, and the **stale hardcoded MCP tool snapshot**
(`_MCP_TOOL_NAMES`=31 vs registry=35, doc claims 33/35) whose guard test is tautological.
Root-cause cluster: `debt-counter`/`getMemoryEntryCount` collapse DB-error→0, so a broken
`memory.db` surfaces as "no debt / budget OK"; `codex-config` overwrites unreadable user TOML;
`mcp-attach` uses `spawnSync` against the async-spawn standard. Counts —
unwired:7, dormant:2, inconsistent:10, dead-test:3, root-cause:7. No source modified.
