# Contributing to Deckent

Thanks for your interest in contributing to Deckent!

## Development Setup

```bash
# Prerequisites
node --version  # >= 18.0.0
git --version

# Clone and install
git clone https://github.com/verhex/deckent.git
cd deckent
npm install

# Verify
npm test          # Run tests (vitest)
npm run lint      # Type check (tsc --noEmit)
npm run build     # Compile to dist/
```

## Branch Strategy

- `main` — stable, releasable code
- `feature/<name>` — new features
- `fix/<name>` — bug fixes
- `docs/<name>` — documentation changes

Always branch from `main`. Never push directly to `main`.

## Commit Messages

Format: `type(scope): description [task-XXX]`

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`

Examples:
```
feat(core): add 3-layer config loader [task-001]
fix(config): handle malformed JSON gracefully
test(core): add config validation edge cases
docs: add ARCHITECTURE.md and ROADMAP.md
refactor(types): split enums into separate file
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure `npm test` and `npm run lint` pass
4. Open a PR with a clear description
5. Reference related issues or tasks

## Code Standards

- **TypeScript strict mode** — no `any`, no implicit returns
- **ESM modules** — `import/export`, `.js` extensions in imports
- **vitest** for testing — colocate tests in `tests/` mirroring `src/`
- **No unused locals/parameters** — enforced by tsconfig
- **Coverage** — aim for >90% on new code

## Project Structure

```
src/core/       — Types, constants, config
src/orchestra/  — Brain, tmux manager
src/agents/     — Worker lifecycle
src/monitor/    — Auditor, dashboard
src/cli/        — CLI commands
src/utils/      — Shared utilities
tests/          — Mirrors src/ structure
```

## Questions?

Open an issue on GitHub or check the [Blueprint](DECKENT-MASTER-BLUEPRINT.md) for architecture details.
