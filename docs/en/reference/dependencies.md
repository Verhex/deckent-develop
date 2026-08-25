# Dependency Rationale Ledger (ADR-D-005)

Reborn 2026-08-25 (the pre-reset copy lives under docs/archive/). One row per
deliberately admitted package: capability, pin, and the governing decision.
Additions require a real capability, an exact pin, and a rationale row here.

| Package | Pin | Kind | Capability / rationale | Governing decision |
|---|---|---|---|---|
| tsx | 4.23.12 (exact) | dev | Repo-owned runner for `docs:generate-cli` (`scripts/generate-cli-docs.ts`); previously resolved via bare `npx` which depends on network/global cache in hermetic environments (surface-truth finding #16) | ADR-D-005; owner admission 2026-08-25 |
