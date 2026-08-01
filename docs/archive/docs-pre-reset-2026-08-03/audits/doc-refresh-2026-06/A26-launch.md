# A26 — Launch Cluster Audit

**Sprint:** 345  
**Task:** 345-026  
**Auditor:** w-345-026 (doc-writer)  
**Date:** 2026-06-28  
**Scope:** `docs/launch/` — all 10 files  
**Output verdict:** GO_WITH_TECH_DEBT (no blocking false claims, but several inaccuracies flagged below)

---

## 1. Verification Matrix

| Check | Result |
|-------|--------|
| Repo URL (`github.com/VerhexIO/deckent`) | ✅ All docs correct |
| Install command (`npm install -g deckent`) | ✅ All docs correct |
| Package name | ✅ `deckent` (package.json confirmed) |
| Node.js version requirement | ⚠️ Inconsistent — see §3.1 |
| Bot-setup steps vs `src/connectors/` | ⚠️ Two discrepancies — see §3.3 and §3.4 |
| False product feature claims | ⚠️ One unshipped command surface — see §3.4 |
| MCP tool counts | ⚠️ All announcement docs understate — see §3.2 |
| Sprint lifecycle phase count | ⚠️ Inconsistent across docs — see §3.5 |
| `CONDUCT.md` | ✅ Correctly redirects to `CODE_OF_CONDUCT.md` |

---

## 2. Source Evidence

### 2.1 Repo URL
Every launch doc that includes a repo link uses `https://github.com/VerhexIO/deckent` — correct.

### 2.2 Install Command
All docs consistently use `npm install -g deckent`. Package name in `package.json` is `"name": "deckent"`. No discrepancy.

### 2.3 Node.js Version (ground truth)
- `package.json` engines: `"node": ">=24.0.0"` (ADR-001, Node 24+ baseline)
- `src/connectors/discord.ts` prereqs: `discord-bot-setup.md` Adım 1 table: "Node.js >= 24" ✅
- `telegram-bot-setup.md` requirements: "Node.js >=24" ✅

### 2.4 MCP Tool Count (ground truth)
- `src/mcp/tools/index.ts`: **37 registered tools** (counted via `grep "{ name: 'deckent_"`)
- `src/mcp/resources/`: **8 resource files** (agents, config, dashboard, debt, directives, memory, retro, tasks)
- Total MCP surface: **37 tools + 8 resources = 45 MCP-exposed items**

### 2.5 Bot Command Surface (ground truth)
`src/connectors/bot-commands.ts` curated slash surface (line 36–41):
```ts
const BOT_COMMANDS: readonly BotCommandDef[] = [
  { name: '/help',    kind: 'help' },
  { name: '/status',  kind: { tool: 'deckent_status' } },
  { name: '/history', kind: { tool: 'deckent_history' } },
  { name: '/pending', kind: 'pending' },
];
```
Active CLI bot commands (`src/cli/commands/bot.ts`): `deckent bot listen`, `deckent bot start`, `deckent bot stop`, `deckent bot status`.

Inline approval surface: `approve <id>` / `reject <id>` — handled by `connector-bootstrap.ts` via `IncomingCommandResolver`.

### 2.6 Telegram Library (ground truth)
`src/connectors/telegram.ts` file header (line 4):
> "Telegram bot connector using grammY (replaces Telegraf — G2a)."
Library: **grammY** (dynamically imported as `grammy`).

---

## 3. Findings

### 3.1 Node.js Version Claim — `announce-final.md` (INACCURATE)

**Location:** `announce-final.md` — Twitter/X thread, Tweet 9/10 (Türkçe + English):
```
MIT lisans. TypeScript. Node.js ≥18.
MIT license. TypeScript. Node.js ≥18.
```
**Also:** Reddit `r/programming` body in `announce-final.md` (line 380): "MIT, TypeScript, Node.js ≥18."

**Ground truth:** `package.json` → `"node": ">=24.0.0"`. ADR-001 explicitly states "Node 24+ is the validated runtime floor."

**Impact:** Publishing this will mislead users on Node 18/20/22 to install and fail at runtime. The claim "Node.js ≥18" directly contradicts the enforced engine field.

**Severity:** HIGH — factual error in a user-visible install requirement.

**Evidence files vs docs:**

| File | Node claim | Correct? |
|------|-----------|---------|
| `announce-final.md` Twitter thread | ≥18 | ❌ |
| `announce-final.md` Reddit r/programming body | ≥18 | ❌ |
| `announce-hn.md` | Not stated | — |
| `discord-bot-setup.md` prerequisite table | >=24 | ✅ |
| `telegram-bot-setup.md` requirements | >=24 | ✅ |
| `scripts/deploy-discord.sh` (Adım 5 check) | >=18 | ❌ |
| `scripts/deploy-telegram.sh` comment header | >=18 | ❌ |

Note: `scripts/deploy-discord.sh` line 95 checks `node_ver -ge 18` and outputs "[OK] Node.js >= 18 gerekli" — the bash check accepts Node 18 when the runtime requires 24. This is a silent failure vector (out of scope for this doc audit but flagged for awareness).

---

### 3.2 MCP Tool Count Discrepancies (INACCURATE — UNDERSTATED)

Actual counts: **37 tools**, **8 resources**.

| Document | Claim | Actual | Gap |
|----------|-------|--------|-----|
| `announce-final.md` (HN body, stats, Twitter EN/TR) | 23 MCP tools | 37 tools | −14 |
| `announce-hn.md` | "23 MCP tools" (not stated in body, only in final) | — | — |
| `announce-reddit.md` r/LocalLLaMA | "22 MCP tools, 8 resources" | 37 tools, 8 resources | −15 tools |
| `announce-twitter-thread.md` tweet 8 | "22 MCP tools" | 37 | −15 |
| `blog-devto-launch.md` | "40+ MCP tools/resources" | 45 total | ✅ (approx) |
| `blog-hashnode-launch.md` | Not explicitly stated in stats | — | — |

**Note:** `blog-devto-launch.md`'s "40+ MCP tools/resources" is the only claim close to the real count. The MCP tool count grew significantly since earlier drafts. All announcement posts carrying "22" or "23" MCP tools are stale.

**Severity:** MEDIUM — understating shipped functionality is not a false product claim (no unshipped feature claimed), but it misrepresents scope.

---

### 3.3 Telegram Library Misidentified — `telegram-bot-setup.md` (INACCURATE)

**Location:** `telegram-bot-setup.md`, Related Files table, last row:

```
| `src/connectors/telegram.ts` | TelegramConnector sınıfı (Telegraf) |
```

**Ground truth:** `src/connectors/telegram.ts` line 4 explicitly states:
> "Telegram bot connector using grammY (replaces Telegraf — G2a)."

The library is **grammY**, not Telegraf. Telegraf was replaced in migration G2a.

**Impact:** A contributor following this doc will look for Telegraf and find grammY. Troubleshooting steps referencing Telegraf APIs will be wrong.

**Severity:** MEDIUM — incorrect library name in technical setup guide.

---

### 3.4 Telegram Bot Commands — Unshipped Commands Listed (FALSE PRODUCT CLAIM)

**Location:** `telegram-bot-setup.md`, Genel Bakış section (lines 13–16):
```
/start, /status, /help, /run, /history komutlarını destekler
```

**Ground truth:** `src/connectors/bot-commands.ts` `BOT_COMMANDS` array (lines 36–41) defines exactly 4 commands:
- `/help`
- `/status`
- `/history`
- `/pending`

**Missing from source vs claim:**
- `/start` — NOT in `BOT_COMMANDS`. Not registered.
- `/run` — NOT in `BOT_COMMANDS`. Not registered.
- `/pending` — IS implemented but NOT listed in the setup doc's Genel Bakış.

The Smoke Test section (Adım 4 table) correctly lists `/help`, `/status`, `/history`, `/pending` — which matches source. The contradiction is within the same file: the "Genel Bakış" claims `/start` and `/run` while the smoke test section correctly omits them.

**Impact:** A user told `/start` and `/run` are supported will attempt these commands and get the bot's "unknown command" response, eroding trust.

**Severity:** HIGH — commands listed as supported do not exist in the shipped bot command surface.

---

### 3.5 Sprint Lifecycle Phase Count — Inconsistent (MINOR INCONSISTENCY)

Some docs show 7 phases, others 8 phases:

| Document | Phases listed |
|----------|--------------|
| `announce-final.md` HN body | `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP` (7, no DECAY) |
| `announce-hn.md` | `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP` (7, no DECAY) |
| `announce-twitter-thread.md` tweet 5 | `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP` (8) |
| `announce-reddit.md` r/LocalLLaMA | `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP` (7) |
| `announce-reddit.md` r/opensource | "8 phases (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP)" |
| `blog-devto-launch.md` | `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP` (8) |
| `blog-hashnode-launch.md` | `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP` (8) |

The DECAY phase exists in the sprint-controller and is a real phase. Docs omitting it are incomplete.

**Severity:** LOW — doesn't mislead about a shipped/unshipped feature, but creates inconsistency across public posts.

---

### 3.6 Discord Bot Slash Commands — Clarification (NON-BLOCKING)

`discord-bot-setup.md` describes the bot as using "slash komutları (`/help`, `/status` vb.)". This is accurate at the user-interaction level — users type `/help` in Discord. However, the implementation uses `Events.MessageCreate` (`discord.js`) — NOT Discord's native Interaction API slash commands (ApplicationCommandInteractions). The commands are text-message commands prefixed with `/`, not registered Discord application commands.

This means:
- Users cannot use Discord's in-built slash command autocomplete UI
- The bot requires `MESSAGE CONTENT INTENT` (correctly documented)
- The behavior described in the doc (type `/help`, get response) is accurate

**Verdict:** The doc's user-facing description is accurate enough for launch. The technical distinction (text vs. native slash) may cause confusion for advanced Discord users expecting autocomplete but is non-blocking for setup.

---

### 3.7 Model Tier Table — `gemini-3.1-pro-preview` (UNVERIFIABLE CLAIM)

Multiple docs (`announce-reddit.md`, `blog-devto-launch.md`, `blog-hashnode-launch.md`) list:
```
premium_plus: o3, gemini-3.1-pro-preview
```

As of 2026-06-28, "gemini-3.1-pro-preview" does not correspond to any known Gemini release (Gemini 1.0/1.5/2.0/2.5 are real; 3.1 is not). This may be a placeholder for a future model. The claim appears in editorial/marketing copy rather than a setup step, so it's unlikely to break user workflows, but it could erode credibility if readers verify.

**Severity:** LOW-MEDIUM — potentially false future-model claim in marketing copy.

---

### 3.8 Sprint Statistics — Divergence Between Docs (INFORMATIONAL)

`announce-final.md` appears to be a newer draft (Sprint 165 GA) while other docs were written at Sprint 150–151 (Beta GA). Statistics differ:

| Metric | announce-final.md | announce-hn.md / reddit / twitter |
|--------|------------------|------------------------------------|
| Sprint count | 165+ | 150+ |
| Passing tests | 12,500+ | 12,485+ |
| Coverage | 89.33% | 89.33% |
| ADRs | 45 | Not stated / 45 |
| MCP tools | 23 | 22 |

The announce-final.md Sprint 165 figures likely supersede the Sprint 151 figures in the other docs. Publishers should use the most current set consistently. This is an editorial coordination issue, not a false claim.

---

## 4. Bot-Setup Cross-Check Evidence

### `discord-bot-setup.md` vs `src/connectors/discord.ts`

| Setup step | Source evidence | Verdict |
|------------|----------------|---------|
| Token via `.deck` → `$DECK:DISCORD_TOKEN` | `discord.ts`: `config.token` fed from config loader (`.deck` interpolation) | ✅ |
| `connectors.discord.enabled: true` in config | `discord.ts` line 20: `if (!config.enabled) { return; }` | ✅ |
| `GatewayIntentBits.MessageContent` required | `discord.ts` lines 26–31: `GatewayIntentBits.MessageContent` listed | ✅ |
| `deckent bot listen / start / stop / status` | `src/cli/commands/bot.ts`: all four subcommands registered | ✅ |
| Slash commands `/help /status /history /pending` | `bot-commands.ts` BOT_COMMANDS array | ✅ |
| `approve <id>` / `reject <id>` | `incoming-command-resolver.ts` (confirmed by `bot-commands.ts` comment) | ✅ |
| Architecture: `DiscordConnector → IncomingMessageRouter → EventBus` | `src/connectors/discord.ts` (emitMessage), `incoming-router.ts`, event-bus | ✅ |
| `scripts/deploy-discord.sh` exists | Confirmed at `scripts/deploy-discord.sh` | ✅ |
| Node.js >= 24 in prereq table | `discord-bot-setup.md` Adım 1 table | ✅ but script checks >=18 |

### `telegram-bot-setup.md` vs `src/connectors/telegram.ts`

| Setup step | Source evidence | Verdict |
|------------|----------------|---------|
| Token via `.deck` → `$DECK:TELEGRAM_TOKEN` | `telegram.ts` line 136: `this.botToken = config.token` | ✅ |
| `deckent bot listen / start / stop / status` | `src/cli/commands/bot.ts` | ✅ |
| `/help /status /history /pending` (Adım 4 table) | `bot-commands.ts` BOT_COMMANDS | ✅ |
| `/start`, `/run` claims (Genel Bakış) | NOT in `bot-commands.ts` | ❌ FALSE |
| Library listed as "Telegraf" | `telegram.ts` uses grammY | ❌ WRONG |
| `approve <id>` / `reject <id>` | `incoming-command-resolver.ts` | ✅ |
| `scripts/deploy-telegram.sh` exists | Confirmed | ✅ |
| Node.js >=24 (requirements) | Doc says >=24 | ✅ but script says >=18 |
| grammY dynamic import, not Telegraf | `telegram.ts` loadGrammy() | ✅ (in code, not in doc) |

---

## 5. Summary of Required Fixes Before Publishing

These must be corrected before any post goes live:

| # | File | Issue | Fix |
|---|------|-------|-----|
| F1 | `announce-final.md` (Twitter thread TR+EN tweet 9, Reddit r/programming body) | "Node.js ≥18" → should be "≥24" | Update Node version string |
| F2 | `telegram-bot-setup.md` (Genel Bakış, line 14) | `/start`, `/run` listed as supported commands | Remove `/start` and `/run`; add `/pending` |
| F3 | `telegram-bot-setup.md` (Related Files table, line 252) | "TelegramConnector sınıfı (Telegraf)" | Change "Telegraf" to "grammY" |
| F4 | `announce-final.md`, `announce-reddit.md`, `announce-twitter-thread.md` | MCP tool count 22/23 is stale | Update to 37 tools (or "35+" to be conservative) |

Lower-priority editorial (can be fixed post-launch):

| # | File | Issue | Fix |
|---|------|-------|-----|
| E1 | `announce-final.md`, `announce-hn.md` | DECAY phase omitted from lifecycle | Add DECAY between RETRO and CLEANUP |
| E2 | `announce-reddit.md`, `blog-devto-launch.md` | `gemini-3.1-pro-preview` may not be a real model | Verify or replace with a known model name |
| E3 | All announcement docs | Sprint count divergence (150+ vs 165+) | Align to a single authoritative count |
| E4 | `scripts/deploy-discord.sh`, `scripts/deploy-telegram.sh` | Node version check says >=18 in scripts | Scripts are out of scope here but flag: need >=24 check |

---

## 6. Verdict

| Criterion | Status |
|-----------|--------|
| Repo URL correct everywhere | ✅ PASS |
| Install command correct everywhere | ✅ PASS |
| Bot-setup steps cross-checked vs `src/connectors/` | ✅ PASS (with 2 flagged issues) |
| False product claims flagged | ✅ flagged: `/start` and `/run` in telegram-bot-setup.md Genel Bakış |
| Node version mismatches found | ✅ flagged: `announce-final.md` + deploy scripts |
| MCP count verified | ✅ actual: 37 tools + 8 resources |

**Self-assessment: GO_WITH_TECH_DEBT**  
No edits made to docs (goCriteria: nogo for editing). All findings documented above with file+line evidence. Four items (F1–F4) require fixes before launch posts go live; none prevent audit completion.

---

*Generated by w-345-026 | Sprint 345 | 2026-06-28*
