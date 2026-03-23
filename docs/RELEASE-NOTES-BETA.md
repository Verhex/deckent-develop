# Deckent v0.2.0-beta.1 — Release Notes

**Release Date:** 2026-03-23
**Status:** Beta — ready for tester evaluation

---

## What's New

Deckent is an AI agent orchestration CLI that coordinates multiple AI agents (Claude, Codex, Gemini) to execute software engineering tasks in parallel. This beta release marks the first externally testable version after 42 development sprints.

### Multi-Provider Support
- **3 AI Providers**: Claude (via tmux/subprocess), OpenAI Codex, and Google Gemini
- **Automatic Fallback**: If a provider fails, tasks route to the next available provider
- **Model Equivalence**: Tier-based mapping ensures tasks use the right model class regardless of provider
- **Per-Provider Config**: Separate API keys, endpoints, and model preferences per provider

### Orchestration Engine
- **Brain Orchestrator**: 8-phase sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP)
- **AI Task Planning**: Zod-validated AI planner with structured fallback (3 modes: ai/structured/auto)
- **Parallel Execution**: Dependency-aware task waves with topological sort
- **GO/NO-GO Evaluation**: Every task result evaluated with tech debt tracking and cross-dependency resolution
- **Worker Verification Loop**: Internal tsc + vitest checks within worker execution

### Agent & Skill System
- **8 Built-in Agents**: security-auditor, test-writer, doc-writer, code-reviewer, refactorer, bug-fixer, api-builder, performance-analyzer
- **10 Built-in Skills**: typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer
- **Skill Marketplace**: Registry client with search, publish, and rating system
- **Auto-Detection**: Project stack detection (TypeScript/React/Python/Rust/Go/Docker) with agent+skill auto-selection

### Developer Experience
- **Human-Friendly Output**: Colored CLI status, doctor health check, error messages with suggestions, worker progress logs
- **Web Dashboard**: React+Vite+Tailwind dashboard with real-time SSE updates at localhost:3100
- **MCP Integration**: 10 MCP tools + 5 resources for IDE integration (Cursor, Claude Code)
- **Interactive Review**: `deckent review` for per-task approve/reject/retry
- **Notification System**: Terminal bell, webhook, Discord, and Slack notifications

### Security & Reliability
- **Timing-Safe Auth**: Constant-time token comparison (prevents timing attacks)
- **Credential Redaction**: Automatic masking of API keys and secrets in logs
- **Skill Sandbox**: AST-based static analysis to detect unsafe code (eval, Function, child_process)
- **Plugin System**: Install lifecycle with rollback and runtime hooks
- **Subprocess Fallback**: tmux-free operation via child_process backend

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Total Sprints | 42 |
| Test Count | 9,300+ |
| Code Coverage | ~94% |
| CLI Commands | 28+ |
| MCP Tools | 10 |
| MCP Resources | 5 |
| Built-in Agents | 8 |
| Built-in Skills | 10 |
| Supported Providers | 3 (Claude, Codex, Gemini) |
| Supported Platforms | macOS, Linux, WSL2 |
| Runtime Dependencies | 1 (commander) |

---

## Getting Started

### Prerequisites
- Node.js >= 18
- git
- At least one AI provider configured:
  - **Claude**: `claude` CLI installed and authenticated
  - **Codex** (optional): `codex` CLI installed with `OPENAI_API_KEY`
  - **Gemini** (optional): `GOOGLE_API_KEY` set

### Install
```bash
npm install -g deckent
```

### Quick Start
```bash
# Initialize a new project
deckent init

# Check system health
deckent doctor

# Set sprint directives
deckent set-directives "Add user authentication with JWT tokens"

# Plan the sprint (preview tasks before execution)
deckent plan --mode auto

# Review the plan
deckent status

# Execute the sprint
deckent start

# Watch progress in real-time
deckent status --watch

# View retrospective after completion
deckent retro
```

### MCP Integration
Deckent auto-registers as an MCP server. After `deckent init`, your IDE (Cursor, Claude Code) can use:
- `deckent_status` — Sprint status
- `deckent_plan` — Plan a sprint
- `deckent_start` — Start execution (background job)
- `deckent_doctor` — Health check
- `deckent_history` — Sprint history

---

## Known Limitations

### Provider Support
- **Gemini adapter**: API integration not fully verified — mock-only testing in place. Real API calls may need adjustment.
- **Codex adapter**: CLI integration works but has limited testing with real Codex CLI instances.
- **Provider fallback**: Single retry only — no exponential backoff or circuit breaker.

### Platform
- **Windows**: Not supported natively. Use WSL2 for Windows development.
- **tmux**: Required for parallel worker execution. Subprocess backend available as fallback but lacks real-time log capture.

### Orchestration
- **Worker .result files**: tmux workers occasionally exit without writing .result, causing false NO_GO evaluations. Subprocess backend is more reliable.
- **NO_GO rate**: Complex sprints with many tasks can have high NO_GO rates (>50%). This is expected — failed tasks are retried in subsequent sprints.
- **AI planner**: May under-plan (fewer tasks than directives specify). Structured fallback compensates but lacks AI context awareness.

### Scale
- **Sprint size**: Tested up to 20 parallel tasks. Larger sprints may hit memory or token limits.
- **Memory budget**: 600 lines in .brain/ — very active projects may need manual decay via `deckent archive-debt`.

### Beta Limitations
- **No Windows support** — Linux/macOS/WSL2 only
- **No interactive mode** — all operations are non-interactive by design
- **Plugin marketplace** — local-only for now, no remote registry
- **Telemetry** — infrastructure exists but collection is disabled in beta

---

## Roadmap

### v0.2.x (Post-Beta)
- Provider fallback improvements (circuit breaker, exponential backoff)
- Gemini adapter full verification with real API
- Windows native support investigation
- Plugin marketplace remote registry
- Performance benchmarks and optimization

### v0.3.0 (Planned)
- Multi-project orchestration (monorepo awareness)
- Team collaboration features (shared agent pools, skill libraries)
- Cost tracking dashboard per provider
- CI/CD integration (GitHub Actions, GitLab CI)

### v1.0.0 (Stable)
- Production-grade stability
- Telemetry opt-in with anonymous usage analytics
- Official plugin marketplace
- Enterprise features (SSO, audit log, compliance)

---

*Generated from Sprint 042 — the last sprint before beta tester evaluation.*
