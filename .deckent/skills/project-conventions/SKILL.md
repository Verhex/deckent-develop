# Project Conventions (Auto-Generated)

## Stack
- Language: typescript
- Framework: react
- Build: vite
- Test: vitest

## Commands
- Build: `npx tsc`
- Test: `npx vitest run`
- Lint: `npx eslint`

## typescript Idioms
- ESM imports require `.js` extensions (Node16 resolution)
- Strict typing — avoid `any`; prefer discriminated unions + exhaustive switches
- Tests: `describe/it/expect` + `vi.mock()`; mirror `src/` under `tests/`

## Key Dependencies
- @lydell/node-pty
- @modelcontextprotocol/sdk
- @noble/ed25519
- @noble/hashes
- better-sqlite3
- cli-highlight
- commander
- grammy
- ink
- react
- react-dom
- ws
- zod
- @testing-library/jest-dom
- @testing-library/react

## Languages
This project uses multiple languages: typescript, python

## Sub-Projects
- examples/quickstart
- native/exec-authority
- src/dashboard
- src/desktop

## Testing
- Framework: vitest
- Pattern: `describe/it/expect` with `vi.mock()` for mocking
- Tests mirror src/ structure in tests/
