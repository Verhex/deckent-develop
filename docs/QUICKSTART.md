# Deckent — Quick Start Tutorial

> Get from zero to your first AI-driven sprint in 5 minutes.

---

## Table of Contents

1. [Installation](#1-installation)
2. [First Project — `deckent init`](#2-first-project--deckent-init)
3. [First Sprint — Write DIRECTIVES.md → `deckent start`](#3-first-sprint--write-directivesmd--deckent-start)
4. [See Results — `deckent status` & `deckent history`](#4-see-results--deckent-status--deckent-history)
5. [MCP Integration — Using with Claude Code](#5-mcp-integration--using-with-claude-code)
6. [Frequently Asked Questions](#6-frequently-asked-questions)

---

## 1. Installation

### Prerequisites

| Requirement | Minimum Version | Check |
|-------------|-----------------|-------|
| Node.js | ≥ 18 | `node --version` |
| git | any | `git --version` |
| tmux | any | `tmux -V` |
| Claude CLI | any | `claude --version` |

> **tmux** is required because Deckent spawns worker agents in isolated tmux windows. Install via `brew install tmux` (macOS) or `apt install tmux` (Ubuntu/Debian).

### Install Deckent

```bash
npm install -g deckent
```

Verify:

```bash
deckent --version
# 0.x.x
```

If you see `command not found`, add npm's global bin to your PATH:

```bash
export PATH="$(npm bin -g):$PATH"
# Add this line to ~/.bashrc or ~/.zshrc permanently
```

### Health Check

Before initialising a project, run the doctor to confirm all prerequisites are met:

```bash
deckent doctor
```

Expected output:

```
✓ node_version   v20.11.0 (>=18 required)
✓ git            git 2.43.0
✓ tmux           tmux 3.3a
✓ claude_cli     claude 1.2.3
✗ workspace      .deckent/ not found — run deckent init
```

The `workspace` check will fail until you initialise the project — that is normal at this stage.

---

## 2. First Project — `deckent init`

Navigate to your project directory and run:

```bash
cd my-project
deckent init
```

The interactive wizard will ask:

- **Project name** — e.g. `my-project`
- **Plan mode** — your Claude subscription tier:
  - `max_plan` — Claude Max (recommended, up to 5 parallel workers)
  - `max5x_plan` — Claude Max 5x (up to 10 workers)
  - `pro_plan` — Claude Pro (up to 2 workers)
  - `api` — Claude API key (custom limits)
- **Language** — `en` (English) or `tr` (Turkish) for agent prompts

Deckent creates the following structure:

```
my-project/
├── DECKENT.md             ← Single source of truth for agent config
├── DIRECTIVES.md          ← You write sprint goals here (created empty)
├── CLAUDE.md              ← Claude Code adapter (@DECKENT.md reference)
├── AGENTS.md              ← Generic agent adapter
├── .deckent/
│   ├── config.json        ← Project config (mode, language, sprint ID)
│   └── workspace/
├── .brain/
│   ├── MEMORY.md          ← Learned patterns (auto-updated)
│   ├── DEBT.md            ← Tech debt log
│   └── sprints/           ← Per-sprint logs
├── .tasks/                ← Task JSON files (written by Brain)
├── .locks/                ← File locks (managed by workers)
└── .claude/
    ├── settings.json      ← MCP server registration (auto-created)
    └── rules/             ← Agent rule files
```

Verify the setup:

```bash
deckent doctor
# All checks should now pass
```

---

## 3. First Sprint — Write DIRECTIVES.md → `deckent start`

### Step 1 — Write Your Sprint Goals

Open `DIRECTIVES.md` and describe what you want to build. Use the `## Task N:` format:

```markdown
# DIRECTIVES — Sprint 1

## Task 1: User Authentication
- File: src/auth/index.ts (yeni)
- Scope: src/auth/

### Description
Implement JWT-based login and registration endpoints.
- POST /auth/login → returns access token
- POST /auth/register → creates user, returns token
- Add bcrypt password hashing
- Write tests for both endpoints

### Test
- All auth tests pass
- 90%+ coverage on src/auth/

---

## Task 2: User Profile Page
- File: src/pages/profile.tsx (yeni)
- Scope: src/pages/, src/components/

### Description
Create a user profile page showing name, email, and avatar.
- Fetch user data from GET /users/me
- Display in a responsive card layout
- Add loading and error states

### Test
- Component renders correctly
- API integration test passes
```

**Tips for writing good directives:**
- Be specific about what files should be created or modified
- Define the scope (which directories workers can touch)
- Include test requirements — workers run tests before marking a task done
- Each `## Task N:` block becomes one parallel worker agent

### Step 2 — Preview the Plan (Optional)

See what Brain will plan without running it:

```bash
deckent plan
```

Output:

```
Sprint 001 — 2 tasks planned

  ID        TITLE                    MODEL    PRIORITY   EFFORT
  001-001   User Authentication      sonnet   HIGH       normal
  001-002   User Profile Page        haiku    NORMAL     low

Max workers: 5 (max_plan)
Planning mode: ai
```

### Step 3 — Start the Sprint

```bash
deckent start
```

Brain will:

1. Read `DIRECTIVES.md`
2. Plan tasks (AI mode by default) and write `.tasks/task-NNN.json` files
3. Spawn one Claude worker per task in separate tmux windows
4. Start the auditor scan loop (health checks every 30 seconds)
5. Wait for all workers to complete
6. Evaluate each result (GO / NO_GO / GO_WITH_TECH_DEBT)
7. Write retrospective to `.brain/RETRO.md` and update `.brain/MEMORY.md`

> Workers run in **tmux windows** — you can attach to any window to watch a worker live:
> ```bash
> tmux ls                       # List all sessions
> tmux attach -t deckent-001    # Attach to sprint session
> # Press Ctrl+B, then window number to switch between workers
> ```

#### Dry Run

To preview what will happen without spawning workers:

```bash
deckent start --dry-run
```

#### Auto-Approve Mode

Workers occasionally need permission to run tools. To skip all permission prompts:

```bash
deckent start --auto-approve
```

> Use `--auto-approve` only in trusted environments. Workers are scoped to their assigned directories, but auto-approve removes the permission confirmation step.

---

## 4. See Results — `deckent status` & `deckent history`

### Live Sprint Status

```bash
deckent status
```

Example output during an active sprint:

```
Sprint sprint-001 — EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  001-001     EXECUTING   sonnet   5s ago
  001-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running

No alerts.
```

#### Watch Mode

Refresh status automatically every 2 seconds:

```bash
deckent status --watch
```

Press `Ctrl+C` to stop.

#### JSON Output

For scripting or piping:

```bash
deckent status --json
```

### Sprint History

View completed sprint logs:

```bash
deckent history
# Shows last 5 sprints by default

deckent history --last 10
# Show last 10 sprints
```

### Retrospective

Read what Brain learned from the last sprint:

```bash
deckent retro
```

### Tech Debt Log

```bash
cat .brain/DEBT.md
```

Brain automatically logs technical debt items discovered during sprint evaluation.

---

## 5. MCP Integration — Using with Claude Code

Deckent integrates with Claude Code (and other MCP-compatible IDEs) via the Model Context Protocol. When you ran `deckent init`, it automatically registered the MCP server in `.claude/settings.json`.

### Verify MCP Registration

In Claude Code's terminal:

```
/mcp
```

You should see `deckent` listed with 10 tools available.

### Starting a Sprint via Claude Code

Instead of editing `DIRECTIVES.md` manually, you can describe your goals in natural language and let Claude structure them:

```
You: I want to add a shopping cart feature with product listing, cart management, and checkout flow

Claude: I'll set up the directives for you.
[calls deckent_set_directives with structured task blocks]

Sprint plan:
- Task 1: Product Listing API (sonnet, HIGH)
- Task 2: Cart State Management (sonnet, HIGH)
- Task 3: Checkout Flow UI (haiku, NORMAL)

Shall I start the sprint?

You: Yes, go ahead

Claude: [calls deckent_start]
Sprint started! Job ID: sprint-1710768000000
I'll monitor progress for you.
[calls deckent_status periodically]
```

### Available MCP Tools

| Tool | What it does |
|------|-------------|
| `deckent_init` | Initialise project structure |
| `deckent_set_directives` | Write sprint goals to DIRECTIVES.md |
| `deckent_plan` | Preview the sprint plan (dry-run) |
| `deckent_start` | Start a sprint in the background |
| `deckent_status` | Get current sprint status |
| `deckent_doctor` | Run health checks |
| `deckent_retro` | Read last retrospective |
| `deckent_history` | View sprint history |
| `deckent_analyze_project` | Analyse project stack and get recommendations |
| `deckent_sync` | Sync CLAUDE.md / AGENTS.md adapter files |

### MCP Resources (Context Window)

These resources can be injected into Claude's context automatically:

| Resource URI | Contents |
|--------------|---------|
| `deckent://dashboard` | Live sprint dashboard (JSON) |
| `deckent://directives` | Current DIRECTIVES.md |
| `deckent://memory` | Learned patterns from past sprints |
| `deckent://debt` | Tech debt items |
| `deckent://config` | Project configuration |

### Manual MCP Registration

If you skipped `deckent init` or need to register manually:

```bash
# Create .claude/settings.json
mkdir -p .claude
cat > .claude/settings.json << 'EOF'
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": []
    }
  }
}
EOF
```

Restart Claude Code after saving.

---

## 6. Frequently Asked Questions

### Q: How many tasks can run in parallel?

Depends on your Claude plan mode:

| Mode | Max Workers |
|------|-------------|
| `api` | 2 (configurable) |
| `pro_plan` | 2 |
| `max_plan` | 5 |
| `max5x_plan` | 10 |

Brain respects these limits and queues tasks when the limit is reached. With 12 tasks and 8 max workers, the first 8 start immediately and the remaining 4 queue up.

---

### Q: What models do workers use?

Brain assigns a model to each task based on complexity:

| Model | When assigned |
|-------|---------------|
| `opus` | Critical, complex architectural tasks |
| `sonnet` | Standard implementation tasks |
| `haiku` | Simple, well-defined tasks (docs, formatting, small fixes) |

You can override in DIRECTIVES.md:

```markdown
## Task 1: Complex Algorithm
- Model: opus
```

---

### Q: A worker seems stuck. What do I do?

1. Check the status: `deckent status`
2. Attach to the tmux window to see what the worker is doing: `tmux attach`
3. If the worker is stale (no heartbeat for >2 minutes), the auditor will alert automatically
4. To kill a specific task: `deckent kill <taskId>`
5. To clean up all task artifacts: `deckent cleanup`

---

### Q: Can I pause and resume a sprint?

Yes. Workers write `.tasks/task-NNN.paused` files when paused:

```bash
# Pause a specific worker task
deckent kill 001-001

# To resume, re-start the sprint — Brain reads existing task status
deckent start
```

---

### Q: Where does Brain store what it learns?

In `.brain/MEMORY.md` (max 300 lines). After each sprint, Brain appends learnings — things like "avoid mocking the database in these tests" or "use async sleep instead of sleepSync". This context is loaded at the start of every future sprint.

---

### Q: How do I change the planning mode?

Edit `.deckent/config.json`:

```json
{
  "brain_planning": "ai"
}
```

| Value | Behaviour |
|-------|-----------|
| `"ai"` | Claude plans tasks (recommended) |
| `"structured"` | Rule-based planning from DIRECTIVES.md structure |
| `"auto"` | AI first, falls back to structured if AI underdelivers |

Or via CLI:

```bash
deckent config set brain_planning ai
```

---

### Q: What if a task fails (NO_GO)?

Brain evaluates each result. If a worker marks a task `NO_GO`:

1. Brain logs the failure in `.brain/DEBT.md`
2. The sprint completes (never left incomplete)
3. The retrospective notes the failure
4. In the next sprint, you can fix it by including the task in `DIRECTIVES.md` again

---

### Q: How do I see what changed during a sprint?

```bash
# Git diff since sprint started
git diff HEAD~1

# Specific task result files
cat .tasks/task-001-001.result

# Full retrospective
deckent retro
```

---

### Q: Can multiple people use Deckent on the same repo?

Yes — each developer runs their own sprint on their own branch. `.tasks/`, `.locks/`, and `.dashboard` files are gitignored by default. Brain uses file locks to prevent write conflicts within a single sprint.

---

## Next Steps

- **[MCP-GUIDE.md](MCP-GUIDE.md)** — Full MCP tool reference with all parameters and example responses
- **[CONFIG-REFERENCE.md](CONFIG-REFERENCE.md)** — All configuration options in detail
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — How Brain, Workers, and Auditor fit together
- **[SPRINT-LIFECYCLE.md](SPRINT-LIFECYCLE.md)** — The full PLAN → SPAWN → EXECUTE → EVALUATE → RETRO cycle
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — Solutions for common issues
- **[GLOSSARY.md](GLOSSARY.md)** — Terminology reference

---

*Deckent — AI Agent Orchestration CLI | Node.js ≥18 | TypeScript ESM*
