# ADR-003: vitest over Jest

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use vitest for testing.
**Context:** Native ESM support, faster startup, v8 coverage provider, compatible API.
**Consequence:** Tests in `tests/` directory, `vitest.config.ts` at root.
