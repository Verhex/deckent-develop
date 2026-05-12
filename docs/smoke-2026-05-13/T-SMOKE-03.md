# deckent_plan MCP Tool

## Overview

`deckent_plan` is a **read-only** MCP tool that previews what a sprint would look like based on the current `DIRECTIVES.md` — without executing anything or writing task files to disk. It reads your directives, analyzes task blocks, assigns models and priorities, and returns a structured plan with wave breakdown, model distribution, and risk assessment. Use it to validate your directives before committing to `deckent_start`.

**Prerequisites:** `deckent_init` and `deckent_set_directives` must have been run first.

---

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `"ai" \| "structured" \| "auto"` | `"auto"` | Planning mode (see below) |
| `dryRun` | `boolean` | `true` | Always `true` — tasks are never written to disk |

---

## Planning Modes

### `ai` — AI-Driven Planning

Calls the configured AI provider (Claude by default) with a structured JSON prompt. The planner reads `DIRECTIVES.md` along with project context — sprint memory, active debt, file tree, past bad agent/skill combinations — and produces a task list with per-task model assignments, scope definitions, and GO/NO-GO criteria.

This mode is **creative and context-aware**: the AI can infer implicit dependencies, adjust priorities based on past sprint failures, and split ambiguous task blocks into more granular units. It requires an active provider session (Claude CLI or API key for Codex/Gemini).

When AI planning produces invalid JSON or fails schema validation, the result is `null` and Deckent falls back to structured mode automatically.

### `structured` — Deterministic Parsing

Parses `DIRECTIVES.md` directly without any AI call. The parser splits the document on `## Task N:` or `## Görev N:` headings and extracts per-task metadata:

- **Title** — first non-empty line after the heading
- **Model override** — `Model: sonnet` field, if present
- **Effort override** — `Effort: low` field, if present
- **Scope** — lines matching `Files:`, `Scope:`, `Dosya:`, `Kapsam:` labels, plus any lines containing `src/`, `tests/`, `docs/` path patterns
- **Test target** — `Test: …` field, if present

If no `## Task N:` headings are found, the parser falls back to bullet-list or numbered-list format.

This mode is **fast, deterministic, and offline** — no API call is made. It is the preferred mode for CI environments or when you want exact control over task definitions.

### `auto` — Adaptive Selection

Tries `ai` mode first. If the provider is unavailable or the AI response fails validation, falls back to `structured`. This is the default behavior when `mode` is omitted.

---

## How Tasks Are Derived from DIRECTIVES

The `DIRECTIVES.md` document is the single source of truth for sprint tasks. A typical task block looks like:

```markdown
## Task 1: Add Rate Limiting Middleware
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/api/middleware.ts
- Scope: src/api/

### Description
Implement per-IP rate limiting using a sliding window algorithm…
```

In `structured` mode, the parser:

1. Splits the document on `## Task N:` (or Turkish `## Görev N:`) headings.
2. Reads `Model:` and `Effort:` override fields from the bullet list.
3. Collects all `Scope:` / `Files:` lines and path-like strings to build the task's `scope.directories` and `scope.filesWrite`.
4. Assigns a default model (`sonnet`) and effort (`normal`) if no overrides are present.

In `ai` mode, the AI receives the full `DIRECTIVES.md` plus project context and produces richer output: explicit GO/NO-GO criteria, cross-task dependencies, and model selections justified per task.

---

## Response Fields

```json
{
  "sprintId": "sprint-155",
  "sprintNumber": 155,
  "tasks": [
    {
      "id": "155-001",
      "title": "Add Rate Limiting Middleware",
      "model": "sonnet",
      "priority": "NORMAL"
    }
  ],
  "recommendation": {
    "size": "full",
    "maxWorkers": 4,
    "reason": "No usage constraints"
  },
  "reasoning": "Plan rationale from AI planner",
  "planningMode": "ai",
  "waveBreakdown": { "wave1": 4, "wave2": 2 },
  "modelDistribution": { "sonnet": 5, "haiku": 1 },
  "riskAssessment": "medium"
}
```

| Field | Description |
|-------|-------------|
| `tasks` | Proposed task list with id, title, model, priority |
| `recommendation` | Max workers, sprint size, reason |
| `reasoning` | Planner's rationale (AI mode only) |
| `planningMode` | Which mode was actually used (`ai` or `structured`) |
| `waveBreakdown` | How tasks are batched into parallel execution waves |
| `modelDistribution` | Count of tasks per model tier |
| `riskAssessment` | `low` (≤3 tasks), `medium` (≤8), `high` (>8) |

---

## Dry-Run Behavior

`deckent_plan` is **always a dry run** — the `dryRun` parameter is hardcoded to `true` and cannot be set to `false`. No `.tasks/task-NNN.json` files are written to disk. The tool is safe to call multiple times without side effects; it only reads `DIRECTIVES.md` and project context.

To actually execute the plan and spawn workers, run `deckent_start` after reviewing the plan output.

---

## Example Usage

```typescript
// Preview plan in auto mode (default)
await client.callTool({ name: 'deckent_plan', arguments: {} });

// Force structured (offline, no AI)
await client.callTool({ name: 'deckent_plan', arguments: { mode: 'structured' } });

// Force AI-driven planning
await client.callTool({ name: 'deckent_plan', arguments: { mode: 'ai' } });
```

---

## Error Handling

If planning fails (missing `DIRECTIVES.md`, provider unavailable, schema validation error), the tool returns:

```json
{ "error": true, "message": "Failed to plan sprint: <reason>" }
```

In `auto` mode, a provider failure silently falls back to `structured` rather than returning an error.
