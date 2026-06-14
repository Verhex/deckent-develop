# Getting Started

> Your first AI-orchestrated sprint in under 5 minutes.

---

## Prerequisites

| Requirement | Minimum Version | Check Command |
|-------------|-----------------|---------------|
| Node.js | >= 24 | `node --version` |
| git | any | `git --version` |
| Claude Code CLI | any | `claude --version` |
| tmux | any (recommended) | `tmux -V` |

You need an active Claude subscription (Pro, Max 5x, Max 20x) or an Anthropic API key. Alternatively, configure [Codex or Gemini](/reference/multi-provider) as your provider.

If tmux is not installed, Deckent falls back to the subprocess backend automatically.

---

## Step 1: Install Deckent

```bash
npm install -g deckent
```

Verify:

```bash
deckent --version
```

Run the health check:

```bash
deckent doctor
```

Expected output:

```
  node_version   v24.0.0 (>=24 required)      [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
  claude_cli     claude 1.2.3                  [pass]
  workspace      .deckent/ not found           [fail]
```

The `workspace` check fails until you initialize a project -- that is expected.

---

## Step 2: Initialize Your Project

```bash
cd my-project
npx deckent init
```

The wizard asks for:

- **Language** -- `en` or `tr`
- **Plan mode** -- `Performance`, `Balanced`, `Economic`, or `API`
- **Project name** -- e.g. `my-project`

After init, your project looks like this:

```
my-project/
  DECKENT.md             # Agent configuration
  DIRECTIVES.md          # Sprint goals (edit before each sprint)
  CLAUDE.md              # Claude Code adapter
  .deckent/
    config.json          # Runtime config
  .brain/
    memory.db            # SQLite knowledge base (Memory V2 — single source of truth)
    exports/
      summary.md         # Auto-generated context summary
      memory.md          # Auto-generated sprint learnings
      debt.md            # Auto-generated technical debt log
      decisions.md       # Auto-generated ADR list
  .tasks/                # Task files (managed by Brain)
  .locks/                # File locks (managed by workers)
```

---

## Step 3: Choose Your Interface

Deckent offers two entry points — pick the one that fits your workflow:

### Option A: Chat Interface

Start a conversational session. Ask questions, brainstorm goals, or trigger tasks naturally:

```bash
deckent chat
```

Deckent will connect to your installed AI CLI (Claude, Codex, or Gemini) and attach the Deckent MCP server, giving the assistant access to all 34 Deckent tools.

Example session:

```
You: What sprint tasks do we have left?
Deckent: [queries memory and tasks] Here is the current status...

You: Start a sprint to add a /health endpoint
Deckent: [creates DIRECTIVES.md and starts the sprint] Done, spawning workers...
```

See [Chat Mode](chat-mode.md) for a complete walkthrough of naïve and task-driven conversations.

### Option B: Sprint Interface

Write your goals in `DIRECTIVES.md` and run the sprint directly:

```bash
deckent set-directives --file goals.md   # writes DIRECTIVES.md (--content "<text>" or stdin also work)
```

Or edit `DIRECTIVES.md` manually:

```markdown
# DIRECTIVES -- Sprint 1

## Goal: Build a REST API with user authentication

## Task 1: Auth Endpoints
- Model: sonnet
- Effort: normal
- Files: src/auth/index.ts (new), tests/auth/auth.test.ts (new)
- Scope: src/auth/, tests/auth/

### Description
Implement JWT-based login and registration.
- POST /auth/login returns an access token
- POST /auth/register creates a user
- Add bcrypt password hashing
- Write tests for both endpoints
```

Each `## Task N:` block becomes a parallel worker agent.

**Tips:**
- Be specific about files to create or modify
- Define scope so workers stay within boundaries
- Include test requirements -- workers run tests before marking done

---

## Step 4: Run the Sprint

Preview the plan first (optional):

```bash
deckent plan
```

Then start the sprint:

```bash
deckent start
```

Brain will:

1. Parse your `DIRECTIVES.md`
2. Plan and create task files in `.tasks/`
3. Spawn one AI worker per task (parallel execution)
4. Monitor progress via the auditor
5. Evaluate results when workers finish
6. Write a retrospective and update memory

Watch progress in real time:

```bash
deckent status --watch
```

---

## Step 5: See the Results

When the sprint completes, check results:

```bash
deckent status
```

```
Sprint sprint-001 -- EVALUATE phase

  TASK        STATUS   MODEL    ASSESSMENT
  001-001     DONE     sonnet   DONE
  001-002     DONE     haiku    GO_WITH_TECH_DEBT

Progress: 2/2 done  |  0 failed
```

Each task produces a `.result` file with details:

```bash
cat .tasks/task-001-001.result
```

```json
{
  "taskId": "001-001",
  "filesChanged": ["src/auth/index.ts", "tests/auth/auth.test.ts"],
  "linesAdded": 120,
  "linesRemoved": 0,
  "testsPassed": true,
  "selfAssessment": "DONE"
}
```

Evaluation values:

- **DONE** -- All criteria met
- **GO_WITH_TECH_DEBT** -- Complete with known debt (logged in `.brain/exports/debt.md`)
- **NO_GO** -- Failed; Brain logs it for retry in the next sprint

---

## Customize Your Setup

Edit `.deckent/config.json` to tune Deckent for your workflow:

```json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "brain_planning": "ai",
  "max_workers": 5,
  "notify_on_complete": true
}
```

See the full [Config Reference](/reference/config) for all available parameters.

---

## Web Dashboard

Once the sprint starts, open the live dashboard in your browser:

```bash
deckent web   # http://localhost:3100
```

The dashboard shows live worker status, task results, memory, and sprint history. The **embedded terminal** lets you run `claude`, `gemini`, `deckent`, or a plain shell directly from the browser. Terminal security guards (prompt-guard, command-guard, audit HMAC chain) are active by default when using `deckent web`.

---

## Next Steps

- [Core Concepts](/guide/concepts) — Understand Sprint, Task, Agent, Brain, Auditor
- [Your First Sprint](/guide/first-sprint) — Detailed walkthrough with examples
- [Installation Guide](installation.md) — Platform-specific setup and Node 24+ requirements
- [CLI Reference](/reference/cli) — All 55+ commands documented
- [Config Reference](/reference/config) — Every configuration option explained
- [API Reference](/reference/api) — Programmatic API and HTTP endpoints
