# Quickstart Guide

> Get from zero to your first AI-driven sprint in 5 minutes.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [First Project Setup](#3-first-project-setup)
4. [Writing Directives](#4-writing-directives)
5. [Running a Sprint](#5-running-a-sprint)
6. [Understanding Results](#6-understanding-results)
7. [Next Steps](#7-next-steps)

---

## 1. Prerequisites

| Requirement | Minimum Version | How to Check |
|-------------|-----------------|--------------|
| Node.js | >= 18 | `node --version` |
| git | any | `git --version` |
| Claude Code CLI | any | `claude --version` |
| tmux | any (optional) | `tmux -V` |

**tmux** is the default backend for spawning workers. If tmux is not available, Deckent falls back to the subprocess backend automatically.

Install tmux if needed:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

You also need an active Claude subscription (Pro, Max 5x, Max 20x) or an Anthropic API key. Alternatively, you can use OpenAI Codex or Google Gemini as providers -- see [MULTI-PROVIDER-GUIDE.md](MULTI-PROVIDER-GUIDE.md).

---

## 2. Installation

Install Deckent globally:

```bash
npm install -g deckent
```

Verify the installation:

```bash
deckent --version
```

If you see `command not found`, add the npm global bin to your PATH:

```bash
export PATH="$(npm bin -g):$PATH"
```

Add that line to `~/.bashrc` or `~/.zshrc` to make it permanent.

Run the health check to confirm all dependencies are available:

```bash
deckent doctor
```

Expected output:

```
  node_version   v20.11.0 (>=18 required)     [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
  claude_cli     claude 1.2.3                  [pass]
  workspace      .deckent/ not found           [fail]
```

The `workspace` check will fail until you initialize a project. That is expected at this stage.

---

## 3. First Project Setup

Navigate to your project directory and run the init wizard:

```bash
cd my-project
deckent init
```

The wizard will prompt you for:

- **Project name** -- for example, `my-project`
- **Plan mode** -- your Claude subscription tier:
  - `Max 20x ($200/mo)` -- up to 8 parallel workers, Opus for Brain
  - `Max 5x ($100/mo)` -- up to 5 workers, Sonnet for Brain
  - `Pro ($20/mo)` -- up to 3 workers, Sonnet only
  - `API (pay-as-you-go)` -- up to 10 workers, any model
- **Language** -- `en` (English) or `tr` (Turkish)

After initialization, your project will contain:

```
my-project/
  DECKENT.md             # Single source of truth for agent config
  DIRECTIVES.md          # Your sprint goals (edit this before each sprint)
  CLAUDE.md              # Claude Code adapter
  AGENTS.md              # Generic agent adapter
  .deckent/
    config.json          # Runtime config (mode, language, sprint ID)
    workspace/
  .brain/
    MEMORY.md            # Learned patterns (auto-updated)
    DEBT.md              # Technical debt log
    sprints/             # Per-sprint logs
  .tasks/                # Task JSON files (written by Brain)
  .locks/                # File locks (managed by workers)
  .claude/
    settings.json        # MCP server registration (auto-created)
    rules/               # Agent rule files
```

Verify the setup:

```bash
deckent doctor
```

All checks should pass now.

---

## 4. Writing Directives

Open `DIRECTIVES.md` and describe what you want to build. Use the `## Task N:` format so Brain can parse your goals into individual tasks:

```markdown
# DIRECTIVES -- Sprint 1

## Task 1: User Authentication
- Files: src/auth/index.ts (new), tests/auth/auth.test.ts (new)
- Scope: src/auth/, tests/auth/

### Description
Implement JWT-based login and registration endpoints.
- POST /auth/login returns an access token
- POST /auth/register creates a user and returns a token
- Add bcrypt password hashing
- Write tests for both endpoints

### Tests
- All auth tests pass
- 90%+ coverage on src/auth/

## Task 2: User Profile Page
- Files: src/pages/profile.tsx (new)
- Scope: src/pages/, src/components/

### Description
Create a user profile page showing name, email, and avatar.
- Fetch user data from GET /users/me
- Display in a responsive card layout
- Add loading and error states

### Tests
- Component renders correctly
- API integration test passes
```

**Tips for effective directives:**

- Be specific about which files to create or modify
- Define the scope so workers know their boundaries
- Include test requirements -- workers run tests before marking done
- Each `## Task N:` block becomes one parallel worker agent
- Use higher priority and the `opus` model for complex tasks

---

## 5. Running a Sprint

### Preview the Plan (Optional)

See what Brain will create without running anything:

```bash
deckent plan
```

Output:

```
Sprint 001 -- 2 tasks planned

  ID        TITLE                    MODEL    PRIORITY   EFFORT
  001-001   User Authentication      sonnet   HIGH       normal
  001-002   User Profile Page        haiku    NORMAL     low

Max workers: 5 (max_plan)
Planning mode: ai
```

### Start the Sprint

```bash
deckent start
```

Brain will:

1. Read `DIRECTIVES.md`
2. Plan tasks (AI mode by default) and write `.tasks/task-NNN.json` files
3. Spawn one Claude worker per task in separate tmux windows
4. Start the auditor scan loop (health checks every 30 seconds)
5. Wait for all workers to complete
6. Evaluate each result (GO / NO-GO / GO_WITH_TECH_DEBT)
7. Write a retrospective and update memory

Workers run in tmux windows. Attach to watch a worker live:

```bash
tmux attach -t deckent
# Press Ctrl+B, then a window number to switch workers
```

### Dry Run

Preview without spawning workers:

```bash
deckent start --dry-run
```

### Auto-Approve Mode

Skip all worker permission prompts:

```bash
deckent start --auto-approve
```

Use `--auto-approve` only in trusted environments. Workers are scoped to assigned directories, but auto-approve removes confirmation prompts.

---

## 6. Understanding Results

### Live Status

```bash
deckent status
```

Example output during a sprint:

```
Sprint sprint-001 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  001-001     EXECUTING   sonnet   5s ago
  001-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running

No alerts.
```

Auto-refresh every 2 seconds:

```bash
deckent status --watch
```

JSON output for scripting:

```bash
deckent status --json
```

### Sprint History

```bash
deckent history
```

### Retrospective

Brain writes what it learned after each sprint:

```bash
deckent retro
```

### Task Results

Each completed task produces a `.result` file:

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
  "coverage": 97.5,
  "selfAssessment": "DONE",
  "notes": "Implemented JWT auth with bcrypt hashing"
}
```

Evaluation values:

- **DONE** -- Task complete, all criteria met
- **GO_WITH_TECH_DEBT** -- Task complete with known debt (logged in `.brain/DEBT.md`)
- **NO_GO** -- Task failed; Brain logs the failure and it can be retried next sprint

### Technical Debt

Brain tracks technical debt automatically:

```bash
cat .brain/DEBT.md
```

### What Brain Learned

Brain stores learnings that persist across sprints:

```bash
cat .brain/MEMORY.md
```

---

## 7. Next Steps

- **[CONFIG-REFERENCE.md](CONFIG-REFERENCE.md)** -- All configuration options in detail
- **[API.md](API.md)** -- Full TypeScript API and HTTP API reference
- **[MCP-GUIDE.md](MCP-GUIDE.md)** -- Using Deckent inside Claude Code via MCP
- **[ARCHITECTURE.md](ARCHITECTURE.md)** -- How Brain, Workers, and Auditor work together
- **[SPRINT-LIFECYCLE.md](SPRINT-LIFECYCLE.md)** -- The full PLAN, SPAWN, EXECUTE, EVALUATE, RETRO, DECAY cycle
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** -- Solutions for common issues
- **[MULTI-PROVIDER-GUIDE.md](MULTI-PROVIDER-GUIDE.md)** -- Using Claude, Codex, and Gemini together
- **[PLUGIN-GUIDE.md](PLUGIN-GUIDE.md)** -- How to extend Deckent with plugins
- **[GLOSSARY.md](GLOSSARY.md)** -- Terminology reference

---

*Deckent -- AI Agent Orchestration CLI | Node.js >=18 | TypeScript ESM | MIT License*
