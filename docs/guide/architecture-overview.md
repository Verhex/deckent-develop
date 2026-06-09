# Architecture Overview

Deckent is organized as a multi-agent sprint orchestrator. The main runtime flow starts from user-facing commands, moves through the orchestration layer, delegates bounded work to workers, records results in project memory, and exposes status through MCP and dashboard surfaces. This overview follows the Architecture section in `CLAUDE.md` and the contracts in `docs/reference/api-surface.md`.

## `orchestra/`

`orchestra/` owns the sprint lifecycle and the Brain-facing control plane. It plans tasks, builds worker prompts, routes tasks to providers, agents, and skills, spawns workers through tmux or subprocess backends, evaluates results, runs FIX retries, writes retrospectives, applies memory decay, and completes cleanup across the PLAN -> SPAWN -> EXECUTE -> EVALUATE -> FIX -> RETRO -> DECAY -> CLEANUP lifecycle.

## `core/`

`core/` contains the stable shared foundation: task and config types, configuration loading and merging, provider interfaces, routing types, agent and skill pools, the built-in skill registry, model registry and tier mapping, intent/routing engines, utilities, and Memory V2. Memory is DB-first through SQLite and FTS5, with generated markdown exports for summary, ADRs, memory, and debt.

## `agents/`

`agents/` is the worker execution layer. Workers claim tasks, respect file scope and locks, write heartbeats, execute assigned work, and emit result files using the shared `.tasks/` contract; adaptive agent modules support runtime adjustment without making workers into planners.

## `nervous/`

`nervous/` is the proactive meta-orchestrator described by ADR-040. It observes repository and sprint signals through detectors, evaluates them with a decision engine and authority matrix, proposes actions, dispatches approved work, checks runtime scope, and records history without replacing the Brain's sprint authority.

## `monitor/`

`monitor/` contains the Auditor and observability support. It runs scan loops, tracks sprint state, manages dashboard-facing status, and detects boundary or protocol violations from durable artifacts such as task files, result files, heartbeats, and git diffs.

## `providers/`

`providers/` contains concrete provider adapters for Claude, Codex, Gemini, and related execution backends. The rest of the system talks through provider abstractions and model tiers from `core/`, so provider-specific model names do not leak into task routing logic.

## `cli/`

`cli/` is the native command surface. It registers Deckent commands, parses user input, loads localized messages and helper utilities, and calls the orchestration, memory, configuration, documentation, and status workflows exposed by the internal modules.

## `mcp/`

`mcp/` exposes Deckent to MCP clients through stdio transport. It registers the canonical tool and resource surface, including sprint lifecycle commands, memory query, status, docs, audit, recovery, and nervous-system operations.

## `dashboard/`

`dashboard/` is the React, Vite, and Tailwind web interface for observing and controlling Deckent, implemented under `src/dashboard/`. It consumes backend status and control APIs to show sprint state, worker activity, logs, chat/control flows, analytics, and dashboard-specific user experience.

## One-Way Dependency Rule

ADR-008 keeps orchestration dependencies one-way: Brain, implemented through `sprint-controller`, is the only orchestrator importing tmux, auditor, and worker execution modules. `planner` imports only from `core/`; Auditor and Worker communicate through task files and result files instead of importing Brain; circular dependencies are forbidden.
