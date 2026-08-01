# Overview

## Product-user perspective

### What Deckent is

Deckent is a provider-neutral, local-first Agent OS and AI runtime ecosystem. Its product layer combines agentic execution, governance, memory, learning, provider selection, and multiple control surfaces under one authority model. [Evidence: `.deckent/workspace/IDENTITY.md:2-5`]

Its Trinity is **Assistant · Worker · Platform**: one kernel, one policy system, one evidence chain, and one learning loop serving both individual users and multi-tenant enterprise estates. [Evidence: `.deckent/workspace/IDENTITY.md:5-7`]

- **Assistant** turns intent into governed, inspectable work.
- **Worker** executes admitted work under scope, provider, budget, and evidence constraints.
- **Platform** supplies durable orchestration, memory, approvals, routing, recovery, audit, and adapters.

These are product roles derived from the identity contract; they are not three independent runtimes. [Evidence: `.deckent/workspace/IDENTITY.md:4-10`]

### Product direction

Terminal and Desktop are the primary control surfaces. API, CLI, MCP, autonomous/process entry points, and connectors are adapters over the same application-service authority. The Dashboard is an observability projection, not an execution engine or state authority. [Evidence: `.deckent/workspace/IDENTITY.md:8-9,16`]

The execution authority vocabulary is:

`Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`

This is the required product model. The current source has durable models for several links but does not yet expose one normalized end-to-end type graph; that implementation gap is documented in the difference report. [Evidence: `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/mission-types.ts:12-19,76-104,134-147`; `src/core/run-flow-contract.ts:37-88`; `src/core/sprint-types.ts:62-90`; `src/core/task-lineage.ts:218-254`; `src/core/work-model.ts:1-12`]

Provider and model selection is resolved from effective configuration, the runtime model registry, and live authority evidence. No provider is part of Deckent's product identity. [Evidence: `.deckent/workspace/IDENTITY.md:10`; `src/core/config.ts:1978-2021`; `src/core/model-registry.ts`]

### Three Immutable Laws

1. **Dual Lens + Scale.** Every decision serves Deckent's orchestration quality and the end-user experience, from one person to millions of users, projects, tenants, and environments. [Evidence: `AGENTS.md:13-20`]
2. **Every Environment.** Designs are cross-platform, cross-language, multi-tenant, and million-scale from the start; unsupported platforms fail explicitly. [Evidence: `AGENTS.md:21-27`]
3. **Never MVP.** Work is expert-grade and enterprise-grade; deliberately temporary or knowingly incomplete product design is not accepted as completion. [Evidence: `AGENTS.md:28-35`]

### Runtime baseline verified for this rewrite

The repository declares TypeScript ESM, Node.js 24 or newer, `tsc`, and Vitest. [Evidence: `.deckent/workspace/IDENTITY.md:11-15`; `package.json` fields `type`, `engines`, and scripts]

After the owner ran `npm run build:all`, `node dist/cli/entry.js --version-json` returned version `1.0.0-beta.1`, Node `v24.15.0`, and Linux. This proves the inspected binary identity; it does not claim support for only that host. [Evidence: command output, 2026-08-01]

The declared platform matrix is macOS, Linux, Windows native, and WSL2. [Evidence: `.deckent/workspace/IDENTITY.md:15`]

## Dogfood / repository reality

| Area | State | Current evidence |
|---|---|---|
| Identity and Trinity | ✅ live | Repository identity names the provider-neutral Agent OS, Trinity, surfaces, platform matrix, and authority chain. [Evidence: `.deckent/workspace/IDENTITY.md:2-18`] |
| Built CLI identity | ✅ live | Real `--version-json` returned `1.0.0-beta.1`, Node `v24.15.0`, Linux after the owner build. |
| Unified Goal→Operation implementation | ⚠️ partial | Durable contracts exist, but normalized work-model consumer adoption and canonical Operation remain OQ-05/OQ-06. |
| Primary Terminal/Desktop direction | ⚠️ partial | The native chat/REPL, web-terminal API, and desktop source surfaces exist; this audit did not run their interactive/platform matrix. [Evidence: `src/cli/commands/chat.ts`; `src/api/terminal/session-manager.ts`; `src/desktop/`] |
| Publish-grade autonomous execution | ⚠️ HOLD | Accepted audit reports 0/31 intervention-free end-to-end success pending stabilization/certification. [Evidence: `PAZARTESI.md:36-60`] |

The vision is authoritative direction; status labels above prevent it from being misread as a claim that every end-to-end path is already certified.
