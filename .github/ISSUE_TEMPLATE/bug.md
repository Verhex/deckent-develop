---
name: Bug Report
about: Report a reproducible bug in deckent
title: "[BUG] "
labels: bug
assignees: ''
---

## Description

A clear and concise description of the bug.

## Steps to Reproduce

1. Run `deckent ...`
2. Observe that...
3. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include full error messages, stack traces, or `.dashboard` output if available.

```
paste error output here
```

## Minimal Reproduction

If possible, include the smallest `DIRECTIVES.md` or command that reproduces the issue.

```markdown
# DIRECTIVES — Sprint XXX: Reproduction
## Task 1: Minimal task
...
```

## Environment

- OS: [e.g., macOS 14, Ubuntu 24.04, WSL2]
- Node.js version: [e.g., 20.12.0] — run `node --version`
- deckent version: [e.g., 1.0.0-beta.1] — run `deckent --version`
- Claude Code version (if applicable): [e.g., 1.0.0]
- Provider: [claude / codex / gemini / ollama]
- Backend: [tmux / subprocess / docker]

## Sprint / Task Context (if applicable)

- Sprint ID: [e.g., sprint-123]
- Task ID: [e.g., 123-001]
- Phase when error occurred: [PLAN / SPAWN / EXECUTE / EVALUATE / FIX / RETRO / CLEANUP]

## Logs

<details>
<summary>deckent status --json output</summary>

```json
paste here
```

</details>

<details>
<summary>Relevant .tasks/ result files</summary>

```json
paste here
```

</details>

## Additional Context

Any other context, configuration excerpts, or relevant `.deckent/config.json` settings.
