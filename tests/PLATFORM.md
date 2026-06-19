---
doc_rank: 50
status: active
last_updated: 2026-03-22
content_hash: sha256:297cf180f713e298a65eb847c272ea00ac1e17c6b07f49dff9d2397418f6d14e
---

# Platform-Specific Test Guide

This document describes which test files are platform-specific and how to run
platform-conditional tests.

## Categories

### Unix-Only Tests

These test files use `describe.skipIf(process.platform === 'win32')` and are
skipped automatically when running on Windows.

| File | Reason |
|------|--------|
| `tests/orchestra/tmux.test.ts` | Tests tmux CLI commands (tmux is a Unix-only terminal multiplexer) |
| `tests/orchestra/tmux-edge.test.ts` | Edge case tests for tmux operations — same Unix dependency |
| `tests/scripts/scripts.test.ts` | Tests bash shell scripts (`.sh` files) via `execSync('bash ...')` — requires bash |

### Windows-Only Tests

None at this time.

### All-Platforms Tests

All other test files under `tests/` run on all platforms. They mock OS-level
calls or use pure TypeScript/Node.js logic with no platform-specific
dependencies.

## How Platform Conditions Work

Each Unix-only file declares a flag at module level:

```typescript
const isWindows = process.platform === 'win32';
```

Each top-level `describe` block in the file uses:

```typescript
describe.skipIf(isWindows)('suite name', () => {
  // tests
});
```

On Linux and macOS `isWindows` is `false`, so all suites run normally.
On Windows `isWindows` is `true`, so vitest marks the suites as skipped — no
errors are thrown and the test run still passes.

## Running Tests

### All platforms (skip Windows-incompatible suites automatically)

```bash
npx vitest run
```

### Unix-only files explicitly

```bash
npx vitest run tests/orchestra/tmux.test.ts tests/orchestra/tmux-edge.test.ts tests/scripts/scripts.test.ts
```

### Verify skipIf flags are present

```bash
npx vitest run tests/platform-tags.test.ts
```

## Adding New Platform-Specific Tests

1. Add `const isWindows = process.platform === 'win32';` near the top of the file (after imports).
2. Wrap every top-level `describe` block with `describe.skipIf(isWindows)(...)`.
3. Add the file to the Unix-Only table above.
4. Update `tests/platform-tags.test.ts` to verify the skipIf pattern is present.
