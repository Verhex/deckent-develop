# Tech Debt Tracking

Deckent helps you track technical debt to ensure it doesn't accumulate unnoticed. This allows you to make informed decisions about when to address technical debt.

## `deckent status --debt`

The `deckent status --debt` command provides an overview of the current technical debt in your project. It lists active debt items and their priority.

## `GO_WITH_TECH_DEBT` Verdict

When a worker's output is not perfect but deemed acceptable with known limitations, Brain can issue a `GO_WITH_TECH_DEBT` verdict during evaluation. This means the sprint task is considered "done" but a technical debt item is logged to be addressed in a future sprint.

## Debt Table (`.brain/exports/debt.md`)

All active and resolved technical debt items are tracked in the `.brain/exports/debt.md` file, which is an auto-generated export from the Brain's memory database. It provides a comprehensive record of your project's technical debt over time.

## Decay

Technical debt items, like memories, can decay over time if not actively maintained or resolved. This mechanism helps to keep the debt list relevant and prevents stagnation.