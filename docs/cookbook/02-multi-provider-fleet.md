# Multi-Provider Fleet Cookbook

Run one sprint across multiple agent providers by setting provider and model overrides on each task in `DIRECTIVES.md`.

This recipe is for sprint operators who want a mixed fleet: Claude for writing, Codex for code work, Gemini for research or broad review, and Ollama for local/offline tasks.

## Prerequisites

Install and authenticate the provider runtimes you want to use:

- **`claude`**: Claude runs by default via subscription auth. For API-key mode, set `ANTHROPIC_API_KEY` and add `- Auth: api` to the task.
- **`codex`**: Install the Codex CLI, then either run `codex login` (ChatGPT subscription) or set `OPENAI_API_KEY`.
- **`gemini`**: Install the Gemini CLI, then set `GOOGLE_API_KEY` (or `DECKENT_GOOGLE_API_KEY` in `.deck`).
- **`ollama`**: Run Ollama locally and pull the model you want (e.g. `ollama pull llama3.2`). Sprint workers use the host HTTP adapter against the local Ollama service.
- **`openrouter`**: Configure the OpenRouter provider and host-side secret; use an exact catalog `vendor/model` ID.

## Quick Start

Add `- Provider:` and `- Model:` lines to each task in `DIRECTIVES.md`. Use the
exact provider API ID, not a family alias. Run `deckent models list` for the
current live/cached catalog.

```markdown
# DIRECTIVES — Sprint 001: Mixed Fleet

## Goal: Use the right provider for the right task.

---

## Task 1: Write onboarding guide
- Agent: doc-writer
- Provider: claude
- Model: claude-sonnet-5
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
- Model: gpt-5.6-sol
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

These exact IDs are examples from the current bundled snapshot, not a fixed
allowlist. Use `deckent models list` for the active catalog.

| Provider | Model ID | Tier | Notes |
| --- | --- | --- | --- |
| `claude` | `claude-fable-5` | premium_plus | Highest bundled Claude tier |
| `claude` | `claude-opus-4-8` | premium | Premium Claude |
| `claude` | `claude-sonnet-5` | standard | Standard Claude |
| `claude` | `claude-haiku-4-5-20251001` | economy | Economy Claude |
| `codex` | `o3` | premium_plus | Advanced reasoning |
| `codex` | `gpt-5.6-sol` | premium | Premium Codex |
| `codex` | `gpt-5.6-terra` | standard | Standard Codex |
| `codex` | `gpt-5.6-luna` | economy | Economy Codex |
| `codex` | `gpt-4.1` | standard | Balanced OpenAI |
| `codex` | `o4-mini` | standard | Reasoning, efficient |
| `codex` | `gpt-5-mini` | economy | Economy OpenAI |
| `gemini` | `gemini-2.5-pro` | premium | Full Gemini 2.5 |
| `gemini` | `gemini-2.5-flash` | standard | Fast Gemini 2.5 |
| `gemini` | `gemini-2.0-flash` | economy | Economy Gemini |

If a task omits `- Provider:` or `- Model:`, Deckent resolves the configured
workspace role and tier defaults. This is default selection, not evidence that
a runtime fallback occurred.

## Per-Task Backend and Reasoning Depth

Two optional fields extend per-task control:

- **`- Backend: docker | tmux | subprocess`** — Codex/Gemini use host adapters by default and may use explicit Docker when the image contains their binaries and host sessions are mounted. Ollama/OpenRouter are host-only and reject Docker routing. Claude uses the configured backend (Docker by default; explicit tmux is deprecated).
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

Provider configuration that applies to all tasks without overrides, in
`.deckent/config.json`:

```json
{
  "providers": {
    "brain": "claude",
    "worker": "codex"
  },
  "provider_fallback": {
    "brain": ["codex", "gemini"],
    "worker": ["claude", "gemini"],
    "auditor_provider": "codex",
    "auditor": ["claude", "gemini"],
    "global": ["ollama"],
    "unattended": false
  },
  "model_strategy": {
    "brain_tier": "premium",
    "worker_tier": "standard",
    "min_tier": "economy",
    "max_tier": "premium_plus",
    "auto_upgrade": true,
    "auto_downgrade": true
  }
}
```

This defines ordered candidates, not live availability. Auth, backend/model
reachability, limit evidence, execution-budget admission, dispatch, and
receipt persistence remain separate proofs.

Use `deckent config set providers.worker codex` to change the Worker primary,
then use `- Provider: claude` on tasks that specifically need Claude.

## Contributing

Keep cookbook examples short and copy-pasteable. Update this recipe when provider names, model IDs, or authentication flows change.

## License

See the repository license file.
