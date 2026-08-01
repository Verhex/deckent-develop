# Chat Mode

> Native Ink REPL — talk to deckent, run tools, manage sprints from your terminal.

Running `deckent` without arguments opens the native REPL: an Ink-based (React-for-CLI) interactive terminal that lets you chat with an AI, run deckent tools, query memory, and manage sprints — all from a single persistent session.

---

## Starting the REPL

```bash
deckent
```

That is the full command. deckent detects an available AI provider (Claude by default, or `config.chat_provider`) and opens the TUI. The provider is shown in the status bar at the bottom.

The full agentic Ink REPL is the bare `deckent` command:

```bash
deckent
```

> `deckent chat --native` is an experimental stub (the native LLM/tool path is not yet fully wired) — use bare `deckent` for the real REPL.

---

## Interface Overview

```
● deckent
The sprint has 3 tasks in EXECUTE phase.
⏱ 1.4s · 312 tok

  ⋯ queued 1: what is the status of task 001?

✓ hazır · sıra sende
deckent  claude · sonnet  ~/my-project
> _
```

- **Scrollback** — completed turns flow into the native terminal scrollback; no tall re-render
- **Status anchor** — always visible: spinner while thinking/generating, ✓ when idle
- **Queue preview** — shows messages typed while deckent is busy (they run after the current turn)
- **Status bar** — provider, model, working directory, cumulative token count

---

## Slash Commands

Type `/` to open the interactive command menu (Tab to autocomplete, ↑↓ to navigate, Enter to select).

| Command | Description |
|---------|-------------|
| `/help` | List available commands |
| `/status` | Show active sprint status |
| `/recall <query>` | Search memory (e.g. `/recall docker heartbeat`) |
| `/plan` | Plan a sprint from DIRECTIVES.md |
| `/sprint` | Show sprint history |
| `/retro` | Show last sprint retrospective |
| `/review` | Evaluate sprint result (GO/NO_GO) |
| `/doctor` | Check codebase health |
| `/models` | List registered models and providers |
| `/analyze` | Analyze project stack and health |
| `/explain` | Explain sprint results |
| `/agents` | List registered agent pool |
| `/skills` | List registered skill pool |
| `/features` | Query feature manifest |
| `/config` | Show or set config (e.g. `/config set max_workers 4`) |
| `/directives` | Show DIRECTIVES.md · `/directives set <content>` to write |
| `/nervous` | Pending nervous system notifications |
| `/interrogate` | Show pre-plan interrogation questions |
| `/resume` | Resume a previous chat session (e.g. `/resume 1`) |
| `/sync` | Sync agent/skill manifests (asks for confirmation) |
| `/checkpoint` | Approve or reject a checkpoint |
| `/kill` | ⚠ Stop active sprint/worker (always confirms) |
| `/cleanup` | ⚠ Archive task files, clean sprint (always confirms) |
| `/recover` | ⚠ Recover a crashed sprint (always confirms) |
| `/autonomous` | Autonomous engine (e.g. `/autonomous status`, `/autonomous backlog add <title>`) |
| `/audit` | Sprint audit (e.g. `/audit gate sprint-286`) |
| `/usage` | Token/limit usage (e.g. `/usage --sprint 285`) |
| `/resources` | MCP resource snapshot |
| `/mcp` | External MCP tools (project `.mcp.json`) |
| `/model <id>` | Switch model at runtime (e.g. `/model claude-sonnet-5`) |
| `/provider <name>` | Switch provider at runtime (e.g. `/provider codex`) |
| `/approve <mode>` | Set approval mode (see below) |
| `/cd <path>` | Change working directory |
| `/cancel` | Cancel queued messages waiting to run |
| `/clear` | Clear the screen |
| `/exit` or `/quit` | Exit the REPL |

---

## In-Turn Tool Confirmations (FIFO Queue)

When deckent needs to run a tool that writes files or executes commands, it pauses and asks for your approval before acting. Multiple tool calls in one turn are queued and presented one at a time:

```
● deckent_write_file src/api/rate-limiter.ts
[1/2] (y = allow · a = always allow · N = deny)
```

- **y** — allow this one call
- **a** — allow this call and all subsequent calls to the same tool in this turn
- **N** (or any other key) — deny

This FIFO queue ensures no tool call is silently dropped or overwritten, even when multiple tools run in the same turn.

---

## Approval Mode

Control how aggressively deckent auto-approves tool calls. Set with `/approve`:

| Mode | Behavior |
|------|---------|
| `suggest` | Ask before every file write and shell command (default) |
| `auto-edit` | Auto-approve file reads/writes; still ask for shell (`deckent_bash`) |
| `full-auto` | Auto-approve everything — no confirmation prompts |

```
/approve auto-edit
```

The current mode is shown in the status bar when not in `suggest` mode (e.g. `· ⚡auto-edit`).

---

## Agentic Tool-Use Protocol

deckent uses a text-tag protocol for file/shell actions. When you ask deckent to write, read, or edit a file, or run a shell command, the AI emits a structured tag that deckent parses and executes:

```
<deckent_tool>{"name":"deckent_write_file","args":{"path":"src/api/rate-limiter.ts","content":"..."}}</deckent_tool>
```

Available tools:

| Tool | Arguments | Action |
|------|-----------|--------|
| `deckent_write_file` | `path`, `content` | Write a file |
| `deckent_read_file` | `path` | Read a file |
| `deckent_edit_file` | `path`, `old`, `new` | Edit a file (old→new substitution) |
| `deckent_bash` | `cmd` | Run a shell command |

deckent confirms each tool call with you (subject to approval mode) before executing. After execution, deckent reports the result back to the AI, which then summarizes the outcome for you.

Change blocks are shown inline:

```
● edited  src/api/rate-limiter.ts
  ⎿ +24 -3
```

---

## Chat Memory and /resume

When a deckent project is initialized (`.brain/memory.db` present), each REPL session is persisted to the memory database. You can resume a previous session:

```bash
/resume       # show recent sessions
/resume 1     # resume session #1 (most recent)
```

You can also search past conversations:

```bash
/recall "rate limiting discussion"
```

---

## Path B — External AI CLI (deckent chat)

`deckent chat` (without `--native`) launches Path B: it attaches your installed AI CLI (Claude Code, Codex, or Gemini) to the deckent MCP server, giving the external AI access to all 37 deckent MCP tools.

```bash
deckent chat              # auto-detect best available provider
deckent chat --tool claude
deckent chat --tool codex
deckent chat --tool gemini
```

Prerequisites — install at least one AI CLI:

| CLI | Install | Auth |
|-----|---------|------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | Claude subscription or API key |
| OpenAI Codex | `npm install -g @openai/codex` | `OPENAI_API_KEY` env var |
| Google Gemini | `npm install -g @google/gemini-cli` | `GOOGLE_API_KEY` env var |

Path B differs from the native REPL in that the AI runs in the external CLI process; deckent acts as the MCP server only. The native REPL (`deckent` without arguments) is the recommended path for most workflows.

---

## Native-Agent Engine (Experimental, Opt-In)

The native-agent engine is a separate AI inference path inside the REPL that replaces the default provider loop with a direct LLM API connection. It is **off by default** — the standard REPL works without it.

Enable with an environment variable or flag:

```bash
DECKENT_NATIVE_AGENT=1 deckent     # via env var
deckent --native                    # via flag
```

This is experimental (SP-1 M3). The default will change in a future milestone (M4). Until then, the standard `runChatNativeLoop` path is the stable production path.

---

## Related

- [Installation](installation.md) — Install and initialize deckent
- [First Sprint](first-sprint.md) — Sprint-mode walkthrough
- [Terminal](terminal.md) — Embedded web terminal in the dashboard
- [Memory](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/memory-system.md) — How chat history is stored and searched
- [Config Reference](../reference/config.md) — `chat_provider` and related settings
