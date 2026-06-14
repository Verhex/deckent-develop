# Multi-Provider Fleet Cookbook

Run one sprint across multiple agent providers by setting provider and model overrides on each task in `DIRECTIVES.md`.

This recipe is for sprint operators who want a mixed fleet: Claude for writing, Codex for code work, Gemini for research or broad review, and Ollama for local/offline tasks.

## Prerequisites

Install and authenticate the provider CLIs you want to use:

- **`claude`**: Claude runs by default via subscription auth. For API-key mode, set `ANTHROPIC_API_KEY` and add `- Auth: api` to the task.
- **`codex`**: Install the Codex CLI, then either run `codex login` (ChatGPT subscription) or set `OPENAI_API_KEY`.
- **`gemini`**: Install the Gemini CLI, then set `GOOGLE_API_KEY` (or `DECKENT_GOOGLE_API_KEY` in `.deck`).
- **`ollama`**: Run Ollama locally and pull the model you want (e.g. `ollama pull llama3.2`). Note: Ollama sprint-worker support is limited to REPL/chat; sprint workers run stubs.

## Quick Start

Add `- Provider:` and `- Model:` lines to each task in `DIRECTIVES.md`. Use the short registry model ID (`sonnet`, `gpt-5`, `gemini-2.5-pro`, etc.), not the full API ID.

```markdown
# DIRECTIVES — Sprint 001: Mixed Fleet

## Goal: Use the right provider for the right task.

---

## Task 1: Write onboarding guide
- Agent: doc-writer
- Provider: claude
- Model: sonnet
- Effort: low
- Files: docs/onboarding.md
- Scope: docs/

### Description
Create a short onboarding guide for new contributors.

**Kanıt:** `test -f docs/onboarding.md`

---

## Task 2: Implement validation fix
- Agent: bug-fixer
- Provider: codex
- Model: gpt-5
- Effort: normal
- Files: src/core/validator.ts
- Scope: src/core/

### Description
Fix the edge case in the validation pipeline.

**Kanıt:** `grep -c "validateEdgeCase" src/core/validator.ts` ≥ 1

---

## Task 3: Review sprint output
- Agent: code-reviewer
- Provider: gemini
- Model: gemini-2.5-pro
- Effort: low
- Files: docs/onboarding.md, src/core/validator.ts
- Scope: docs/, src/core/

### Description
Review the sprint output for quality and missing evidence.

**Kanıt:** Review notes written to result file.
```

Then plan and start the sprint:

```bash
deckent plan
deckent start
```

## Provider Model Reference

Use these short registry IDs in `- Model:`:

| Provider | Model ID | Tier | Notes |
| --- | --- | --- | --- |
| `claude` | `opus` | premium | Most capable Claude |
| `claude` | `sonnet` | standard | Balanced (default) |
| `claude` | `haiku` | economy | Fastest Claude |
| `codex` | `o3` | premium_plus | Advanced reasoning |
| `codex` | `gpt-5` | premium | Frontier OpenAI |
| `codex` | `gpt-4.1` | standard | Balanced OpenAI |
| `codex` | `o4-mini` | standard | Reasoning, efficient |
| `codex` | `gpt-5-mini` | economy | Economy OpenAI |
| `gemini` | `gemini-2.5-pro` | premium | Full Gemini 2.5 |
| `gemini` | `gemini-2.5-flash` | standard | Fast Gemini 2.5 |
| `gemini` | `gemini-2.0-flash` | economy | Economy Gemini |

If a task omits `- Provider:` or `- Model:`, Deckent falls back to the sprint or workspace defaults (`brain_provider` / `worker_provider` in `.deckent/config.json`).

## Per-Task Backend and Reasoning Depth

Two optional fields extend per-task control:

- **`- Backend: docker | tmux | subprocess`** — by default, `codex`/`gemini`/`ollama` run via their host CLI and `claude` runs in a Docker container. Use `- Backend: docker` to run a host-CLI provider inside the container (the host session is mounted: `~/.codex`, `~/.gemini`).
- **`- ModelEffort: <level>`** — the model's **reasoning depth**, independent of `- Effort:` (which controls task work size and timeout). Claude accepts `low / medium / high / xhigh / max`; Codex accepts `minimal / low / medium / high`. Gemini and Ollama do not support this field.

```markdown
## Task 1: Deep codex analysis in a container
- Provider: codex
- Backend: docker
- ModelEffort: high
- Effort: normal
- Files: docs/analysis.md
- Scope: docs/

### Description
Run a high-reasoning Codex analysis inside the container.

**Kanıt:** `test -f docs/analysis.md`

---

## Task 2: Claude with maximum reasoning
- Provider: claude
- ModelEffort: xhigh
- Effort: normal
- Files: src/core/tricky.ts
- Scope: src/core/

### Description
Analyse the tricky module with extended reasoning.

**Kanıt:** `npx tsc --noEmit` passes.
```

> `- Effort:` (task work size → timeout/budget) and `- ModelEffort:` (reasoning depth) are independent knobs. A quick task can still use deep reasoning, and vice versa.

## Workspace Defaults

Provider configuration that applies to all tasks without overrides:

```json
// .deckent/config.json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "fallback_provider": "claude",
  "brain_tier": "premium",
  "worker_tier": "standard"
}
```

Set `worker_provider` to `codex` or `gemini` to change the default for all workers, then use `- Provider: claude` on tasks that specifically need Claude.

## Contributing

Keep cookbook examples short and copy-pasteable. Update this recipe when provider names, model IDs, or authentication flows change.

## License

See the repository license file.
