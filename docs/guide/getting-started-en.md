# Getting Started with Deckent

Deckent is an AI agent orchestration CLI that empowers developers to run autonomous sprints. It orchestrates multiple AI agents (Brain, Workers, Auditor) and tools across various providers (Claude, Codex, Gemini, Ollama) to plan, execute, and evaluate tasks, manage project memory, and enforce architectural decisions.

## Installation and Prerequisites

To get started with Deckent, you need:
-   **Node.js**: Version 24.0.0 or newer.
-   **A provider CLI logged in**: This can be Claude, Codex (OpenAI), Gemini, or a locally running Ollama instance. Deckent will use your configured provider to run agents.

## Your First Sprint

1.  **Initialize Deckent**: Navigate to your project's root directory in your terminal and run:
    ```bash
    deckent init
    ```
    This command sets up the necessary `.deckent/`, `.brain/`, and `.tasks/` directories.
2.  **Learn the workflow**: For a step-by-step guide on running your first sprint, refer to the [First Sprint Cookbook](../cookbook/01-first-sprint.md).

## Where Important Project Information Lives

-   **Project Memory (DB-First)**: Deckent uses a SQLite database (`.brain/memory.db`) as its single source of truth for all project knowledge. Markdown exports like `.brain/exports/summary.md`, `.brain/exports/decisions.md`, and `.brain/exports/memory.md` are generated from this database.
-   **Architecture Decision Records (ADRs)**: Important architectural decisions are stored in the memory database and can be viewed in `.brain/exports/decisions.md`.
