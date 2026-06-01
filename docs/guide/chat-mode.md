# Chat Mode

> Conversational AI with access to your full Deckent toolkit.

`deckent chat` is the Trinity AI Assistant face of Deckent. It connects your installed AI CLI (Claude, Codex, or Gemini) to the Deckent MCP server, giving the assistant access to all 31 Deckent tools — while also supporting plain casual conversation with no tool use at all.

---

## How It Works (Path B)

Deckent does not ship its own conversation UI. Instead it attaches to the AI CLI you already have installed and injects the Deckent MCP server as a tool provider:

```
  Your terminal
       |
  deckent chat
       |
  ┌──────────────────────────────────────────┐
  │  Your AI CLI (claude / codex / gemini)   │
  │                                          │
  │  +  Deckent MCP (31 tools)               │
  │     deckent_start, deckent_status,       │
  │     deckent_memory_query, …              │
  └──────────────────────────────────────────┘
```

The AI CLI handles the conversation. Deckent's MCP server handles tool calls. You get a fully capable assistant that can manage sprints, query memory, and run tasks — from a plain chat prompt.

---

## Prerequisites

You need at least one AI CLI installed:

| CLI | Install | Auth |
|-----|---------|------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | Claude subscription or API key |
| OpenAI Codex | `npm install -g @openai/codex` | `OPENAI_API_KEY` env var |
| Google Gemini | `npm install -g @google/gemini-cli` | `GOOGLE_API_KEY` env var |

Check what is available:

```bash
deckent doctor --providers
```

Expected output:

```
  ✓ Claude  (ready)
  ⚠ Codex   (binary OK, auth missing — set OPENAI_API_KEY)
  ✗ Gemini  (binary not found)
```

---

## Starting a Chat Session

Auto-detect the best available provider:

```bash
deckent chat
```

Or specify a provider explicitly:

```bash
deckent chat --tool claude
deckent chat --tool codex
deckent chat --tool gemini
```

On first run, Deckent asks for permission to attach its MCP server to your AI CLI:

```
Attach Deckent MCP to claude? [y/N] y
✓ Deckent MCP ready — 31 tools available
```

Once attached, future sessions skip this step automatically.

---

## Naïve Mode — Casual Conversation

You can chat without triggering any Deckent tools at all. Ask general questions, brainstorm, or just say hello:

```
You: Hi, what can you help me with?

Claude: I am your Deckent assistant. I can chat casually, help you plan sprint
tasks, query your project memory, start sprints, check status, and more.
What would you like to do?
```

```
You: What does the Auditor do in Deckent?

Claude: The Auditor is a monitoring agent that runs a scan loop every 30 seconds.
It checks worker heartbeats for staleness, scans git diffs for scope boundary
violations, detects stale file locks, and writes alerts to the dashboard. It
never writes source code — it only observes and reports.
```

The assistant decides on its own whether to call a Deckent tool. For casual questions it responds directly. For task requests it uses the appropriate tool.

---

## Task-Driven Mode — Triggering Deckent Actions

When you ask Deckent to do something actionable, the assistant invokes the matching MCP tool automatically:

### Check sprint status

```
You: What is the current sprint status?

Claude: [calls deckent_status]

Sprint sprint-190 — EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  190-001     DONE        opus     2m ago
  190-002     EXECUTING   opus     8s ago

Progress: 1/2 done | 0 failed | 1 running
```

### Query memory

```
You: What did we decide about the Ollama provider?

Claude: [calls deckent_memory_query with "ollama provider"]

Found 2 results:
— ADR-027: Hybrid Spawn Backend (accepted) — Ollama added as local provider option
— Sprint 190 T-009 notes: OllamaAdapter HTTP API /api/generate, isAvailable() via fetch
```

### Start a sprint

```
You: Start a sprint to add rate limiting to the API

Claude: I will create a directive for that. Here is the task I am planning:

  Task: API Rate Limiting
  - Model: sonnet
  - Effort: normal
  - Files: src/api/rate-limiter.ts, tests/api/rate-limit.test.ts
  - Scope: src/api/, tests/api/

  Shall I write this to DIRECTIVES.md and start the sprint? [y/N]
```

### Save a note to memory

```
You: Remember that the deploy freeze starts on June 1st

Claude: [calls deckent_memory_query then saves note]
Saved to memory: "Deploy freeze begins 2026-06-01 — no non-critical merges after this date."
```

---

## Resuming a Previous Session

Chat history is saved to the Deckent memory database. Resume a previous session by ID:

```bash
deckent chat --resume <session-id>
```

Or list recent sessions:

```bash
deckent chat --list-sessions
```

Search past conversations:

```bash
deckent recall "rate limiting discussion"
```

---

## Decision Heuristic

The assistant uses this simple rule built into its system prompt:

- **Casual input** (greeting, question about Deckent, brainstorming) → respond naturally, no MCP tool
- **Actionable input** (start sprint, check status, query memory, run task) → invoke the matching MCP tool

If it is ambiguous, the assistant asks for clarification before acting.

### How the Prompt Is Built

`deckent chat` builds the system prompt at launch time from `buildNaiveSystemPrompt()` in `src/cli/commands/chat.ts:chat.ts` and forwards it two ways so each host CLI can pick the channel it supports:

| Channel | Hosts | Purpose |
|---------|-------|---------|
| `DECKENT_CHAT_SYSTEM_PROMPT` env var | claude, codex, gemini | Universal — any wrapper or future adapter can read it |
| `--append-system-prompt <text>` CLI arg | claude only | Documented Claude CLI flag for system prompt injection |

The prompt itself contains three numbered rules — CASUAL, TASK, AMBIGUOUS — plus a suggested verb → tool mapping (`start sprint` → `deckent_start`, `check status` → `deckent_status`, `query memory` → `deckent_memory_query`, etc.).

The same classification logic is exported as `classifyChatIntent(input)` for tests and runtime hints:

```ts
classifyChatIntent('merhaba');                        // 'casual'
classifyChatIntent('start a sprint to fix the API');  // 'task'
classifyChatIntent('hmm what about that thing');      // 'ambiguous'
```

Keeping the heuristic in one helper means the user-facing docs, the injected system prompt, and the classifier table cannot drift apart.

---

## No AI CLI Found

If no supported AI CLI is installed, `deckent chat` shows a helpful message:

```
No AI CLI found. Install one of:
  claude   — npm install -g @anthropic-ai/claude-code (Anthropic)
  codex    — npm install -g @openai/codex (OpenAI, requires OPENAI_API_KEY)
  gemini   — npm install -g @google/gemini-cli (Google, requires GOOGLE_API_KEY)

Or use a local model:
  deckent chat --local   — requires Ollama running at localhost:11434
```

---

## Related

- [Getting Started](getting-started.md) — Install and initialize Deckent
- [First Sprint](first-sprint.md) — Sprint-mode walkthrough
- [MCP Guide](../reference/mcp-guide.md) — Full list of 31 MCP tools
- [Memory](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/memory-system.md) — How chat history is stored and searched
