---
name: Feature Request
about: Suggest a new feature or improvement for deckent
title: "[FEATURE] "
labels: enhancement
assignees: ''
---

## Problem

What problem does this feature solve? What workflow is currently difficult or impossible?

Example: "When running sprints with 10+ tasks, it is hard to..."

## Proposed Solution

Describe the feature or change you would like. Be specific about:

- What command, API, or behavior would change
- What the expected output or result would be
- Whether this is a CLI feature, MCP tool, provider change, or internal improvement

## Example Usage

Show how the feature would be used:

```bash
# Example CLI invocation
deckent <new-command> --option value

# Example DIRECTIVES task
## Task 1: Feature Demo
- Model: sonnet
- Skills: typescript-expert
...
```

## Alternatives Considered

What alternatives or workarounds have you tried? Why don't they solve the problem?

## Affected Components

Which parts of deckent does this involve? (Check all that apply)

- [ ] CLI (`src/cli/`)
- [ ] MCP tools/resources (`src/mcp/`)
- [ ] Sprint orchestration (`src/orchestra/`)
- [ ] Task routing (`src/core/routing-engine.ts`)
- [ ] Providers (`src/providers/`)
- [ ] Memory / recall (`src/core/memory-*.ts`)
- [ ] Dashboard (`src/dashboard/`)
- [ ] Documentation
- [ ] Other: <!-- describe -->

## Priority

How important is this feature to your workflow?

- [ ] Critical — blocking my usage of deckent
- [ ] High — significantly improves my workflow
- [ ] Medium — nice to have
- [ ] Low — minor convenience

## Additional Context

Any mockups, links, related ADRs, or prior discussion that is relevant.
