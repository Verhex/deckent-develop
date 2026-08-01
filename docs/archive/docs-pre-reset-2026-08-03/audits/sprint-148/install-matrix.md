# Sprint 148 — Fresh Install Matrix Validation

## Summary

| Node Version | Platform | Backend | Result |
|-------------|----------|---------|--------|
| 18 | Ubuntu 22.04 (Docker) | subprocess | ✅ PASS |
| 20 | Ubuntu 22.04 (Docker) | subprocess | ✅ PASS |
| 22 | Ubuntu 22.04 (Docker) | subprocess | ✅ PASS |

## Test Coverage

1. **npm ci exit 0** — No peer dependency errors, package-lock.json valid
2. **tsc build** — TypeScript compilation succeeds on all Node versions
3. **CLI version** — `deckent --version` returns correct semver string
4. **Init flow** — `deckent init` creates .deckent/, .brain/, .tasks/, .locks/
5. **Mini sprint** — Task creation + result write lifecycle validates correctly

## Environment Details

- **Base image:** `node:{version}-slim` (Debian-based)
- **Dependencies:** git, python3, make, g++ (for native modules like better-sqlite3)
- **Source mount:** Read-only volume mount, copied to /tmp for isolation
- **Build:** `npm ci && npm run build`

## Node Version Constraints

- **Node 18 (LTS):** Minimum supported version. ESM support stable.
- **Node 20 (LTS):** Primary target. Full feature support.
- **Node 22 (Current):** Forward compatibility verified.

## Key Findings

- `better-sqlite3` requires native compilation → `python3 make g++` needed in Docker
- ESM (`"type": "module"`) works consistently across all 3 versions
- No peer dependency warnings with current dependency set
- `package-lock.json` is in sync with `package.json`

## Script

Run the full Docker-based matrix test:
```bash
bash scripts/fresh-env-test.sh
```

Run the lightweight vitest version (in-process):
```bash
npx vitest run tests/e2e/install-matrix/fresh-install.test.ts
```

## Status: GO

All 3 Node versions pass. Ready for Beta GA (Sprint 150).
