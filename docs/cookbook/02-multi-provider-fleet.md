# Multi-Provider Fleet Cookbook

Run one sprint across multiple agent providers by setting provider and model overrides on each task in `DIRECTIVES.md`.

This recipe is for sprint operators who want a mixed fleet: Claude for writing, Codex for code work, Gemini for research or broad review, and Ollama for local/offline tasks.

## Installation

Install and authenticate the provider CLIs you want to use:

- `claude`: sign in with the Claude CLI subscription/OAuth flow. No API key is required for this workflow.
- `codex`: sign in with the Codex CLI subscription/OAuth flow. No API key is required for this workflow.
- `gemini`: sign in with the Gemini CLI subscription/OAuth flow. No API key is required for this workflow.
- `ollama`: run Ollama locally and pull the model you want to use.

## Quick Start

Add `- Provider:` and `- Model:` lines to each task in `DIRECTIVES.md`.

```markdown
## Tasks

### 249-101-docs
- Agent: doc-writer
- Provider: claude
- Model: claude-sonnet-4-5
- Effort: low

Write a short onboarding guide for the new cookbook.

### 249-102-implementation
- Agent: worker
- Provider: codex
- Model: gpt-5
- Effort: medium

Implement the managed-docs validation fix.

### 249-103-review
- Agent: auditor
- Provider: gemini
- Model: gemini-2.5-pro
- Effort: low

Review the sprint output for missing verification evidence.
```

Then build the structured plan:

```bash
deckent plan --structured
```

`deckent plan --structured` honors per-task `Provider` and `Model` overrides when it assigns work.

## Usage

Use task-level overrides when different work benefits from different providers.

```markdown
### 249-104-local-smoke
- Agent: worker
- Provider: ollama
- Model: llama3.1
- Effort: low

Run a local-only smoke review of generated documentation.
```

The override belongs inside the task block, beside the existing task metadata. Keep the keys capitalized as shown:

- `Provider`: one of `claude`, `codex`, `gemini`, or `ollama`.
- `Model`: the provider-specific model name to request.

If a task omits `Provider` or `Model`, Deckent falls back to the sprint or workspace defaults.

## Configuration

Provider configuration lives outside the task file:

- Claude, Codex, and Gemini use their CLI login state. Use the provider CLI to sign in before the sprint.
- Ollama uses the local Ollama daemon and locally available model names.
- Workspace defaults still apply to tasks that do not set overrides.

Task-level overrides are useful for:

- assigning documentation to `claude`;
- assigning implementation to `codex`;
- assigning broad review to `gemini`;
- assigning offline or private local checks to `ollama`.

## API Reference

This recipe documents `DIRECTIVES.md` task metadata, not a library API.

Supported task keys:

| Key | Required | Description |
| --- | --- | --- |
| `Provider` | No | Selects the provider for this task. |
| `Model` | No | Selects the provider-specific model for this task. |

## Contributing

Keep cookbook examples short and copy-pasteable. Update this recipe when the supported provider names, model names, or authentication flows change.

## License

See the repository license file.
