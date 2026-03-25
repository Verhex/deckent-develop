# deckent -- Landing Page Content

---

## Hero Section

### Headline

Your AI development team, orchestrated.

### Subheadline

Write your goals in plain English. Deckent plans, assigns, and runs multiple AI workers in parallel -- delivering tested, evaluated code in a single sprint.

### Call to Action

```bash
npm install -g deckent
```

---

## Problem Statement

### Building software with AI is powerful but chaotic

1. **One agent, one task** -- Current AI coding tools run one conversation at a time. Complex projects with many moving parts grind to a halt.

2. **No quality control** -- AI agents write code, but who checks if it actually works? Who catches boundary violations, stale processes, or broken tests?

3. **No memory between sessions** -- Every time you start a new conversation, the AI forgets everything. Context is lost. Mistakes are repeated. There is no learning curve.

---

## Solution

### Deckent turns chaos into a coordinated development team

Deckent is an open-source CLI that orchestrates multiple AI agents working in parallel. A central Brain plans tasks, assigns scoped workers, monitors quality through a dedicated Auditor, and evaluates every result with GO/NO-GO criteria. The system learns from every sprint and gets better over time.

---

## How It Works

### Step 1: Describe

Write your goals in `DIRECTIVES.md` using plain language. Describe what you want built, which files to create or modify, and what tests should pass.

```markdown
## Task 1: User Authentication
- Implement JWT login and registration endpoints
- Add bcrypt password hashing
- Write tests with 90%+ coverage

## Task 2: Profile Page
- Create responsive user profile component
- Fetch data from GET /users/me
```

### Step 2: Plan

Brain reads your goals, analyzes your codebase, and creates scoped tasks. Each task gets a model assignment (Opus, Sonnet, or Haiku), priority level, effort estimate, and GO/NO-GO criteria.

```bash
deckent plan
# Sprint 001 -- 2 tasks planned
# 001-001  User Authentication   opus    HIGH
# 001-002  Profile Page          sonnet  NORMAL
```

### Step 3: Execute

Workers run in parallel, each in an isolated scope. The Auditor monitors heartbeats, detects boundary violations, and enforces quality. Brain evaluates every result and writes a retrospective.

```bash
deckent start
# Workers spawned. Auditor scanning. Sprint in progress...
# Sprint complete: 2/2 DONE. 0 NO-GO. Coverage: 97.5%
```

---

## Features

### Multi-Agent Parallel Execution

Up to 10 AI workers running simultaneously, each scoped to specific directories and files. No cross-contamination, no conflicts.

### Sprint Lifecycle Management

Structured phases: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY. Every sprint runs to completion. Nothing is left incomplete.

### Quality Auditor

Continuous monitoring during execution. Detects stale heartbeats, boundary violations, circular dependencies, and stale locks. Alerts are surfaced in real time.

### Memory and Learning

Brain stores learnings in `.brain/MEMORY.md` and patterns in `PATTERNS.md`. Each sprint builds on the last. Technical debt is tracked and escalated automatically.

### GO / NO-GO Evaluation

Every task result is evaluated against defined success criteria. Tasks that fail get logged as technical debt. Failed tasks can be auto-retried with backoff.

### Provider Agnostic

Works with tmux backend (default) or subprocess backend for environments without tmux. Claude Code CLI, with support for additional providers planned.

---

## Comparison

| Feature | deckent | OpenClaw | OpenHands | Devin |
|---------|---------|----------|-----------|-------|
| Multi-agent parallel | Yes (up to 10) | Supervisor-worker | 1 agent | 1 agent |
| Sprint lifecycle (10-phase) | Yes | No | No | No |
| Quality gates (GO/NO-GO) | Yes | No | No | No |
| Self-learning with decay | Yes (native) | Limited (3rd party) | No | Partial |
| Multi-provider (Claude+Codex+Gemini) | Yes | Multiple | Partial | No |
| Skill ecosystem | 10 built-in | **13K+ (ClawHub)** | Agent registry | N/A |
| SWE-bench score | Not tested | Not tested | **66.4%** | 13.86% |
| Community | New | **331K+ stars** | 65K stars | Proprietary |
| Open source | MIT | MIT | Apache-2.0 | No |
| Price | **Free** | **Free** | **Free** | $20-500/mo |

> **Deckent vs rakipler:** Sprint lifecycle, quality gates ve native learning sistemi Deckent'e özgü. Skill ekosistemi ve community'de OpenClaw lider. SWE-bench'te OpenHands lider.

---

## Pricing

**Free. Open source. MIT licensed.**

Deckent itself is completely free. You bring your own Claude subscription:

| Plan | Monthly Cost | Max Workers | Brain Model |
|------|-------------|-------------|-------------|
| Claude Pro | $20/mo | 3 | Sonnet |
| Claude Max 5x | $100/mo | 5 | Sonnet |
| Claude Max 20x | $200/mo | 8 | Opus |
| API Key | Pay-as-you-go | 10 | Opus |

---

## Getting Started

### 1. Install

```bash
npm install -g deckent
```

### 2. Initialize

```bash
cd my-project
deckent init
```

### 3. Write Goals

Edit `DIRECTIVES.md` with what you want to build.

### 4. Run

```bash
deckent start
```

### 5. Monitor

```bash
deckent status --watch
# Or use the web dashboard:
deckent web
```

---

## Footer

- [GitHub](https://github.com/VerhexIO/deckent)
- [Documentation](https://github.com/VerhexIO/deckent/tree/main/docs)
- [npm](https://www.npmjs.com/package/deckent)
- [Contributing](https://github.com/VerhexIO/deckent/blob/main/CONTRIBUTING.md)
- [License (MIT)](https://github.com/VerhexIO/deckent/blob/main/LICENSE)
- [Website](https://deckent.agency)

---

Built by [Verhex](https://deckent.agency). MIT License.
