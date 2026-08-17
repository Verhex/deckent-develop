# Changelog

> **Engineering sprint ledger — NOT product release notes.** Product, per-version release notes are
> the repository-root [CHANGELOG.md](../CHANGELOG.md) (the single source of truth that
> `.github/workflows/release.yml` reads). This file is the machine-written, verbose per-sprint
> engineering log (each sprint's task-level Added/Changed/Fixed, appended by the sprint finalizer).
> Since the `0.100.0` rebaseline its headers are sprint numbers (`## [sprintNN]`) only — never
> product-version-shaped tags.
>
> Pre-`0.100.0` sprint history (the retired `1.0.0-beta.1-sprintNNN` ledger) is archived at
> [docs/archive/docs-pre-reset-2026-08-14/CHANGELOG.md](archive/docs-pre-reset-2026-08-14/CHANGELOG.md);
> the earlier reset is at
> [docs/archive/docs-pre-reset-2026-08-03/CHANGELOG.md](archive/docs-pre-reset-2026-08-03/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [sprint546] - 2026-08-17

### Added

- authored GO/NO-GO criteria reach the task verbatim
- declared Files enter filesWrite even when not yet on disk (depends on nothing)

### Fixed

- scale-honest post-FIX circuit breaker


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [sprint544] - 2026-08-17

### Added

- Terminal — `deckent inspect --follow` (depends on Task 1)

### Changed

- core — bounded log-tail lineage (completed with tech debt)
- API — task detail serves the log tail (depends on Task 1) (completed with tech debt)
- Desktop — stream adoption on Runs/console (depends on Task 2) (completed with tech debt)
- documentation — follow + tail + stream adoption (depends on Tasks 1,2,3) (completed with tech debt)


_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [sprint542] - 2026-08-17

### Added

- read-model expansion — logical run listing + run lineage detail
- Terminal face — `deckent inspect` (depends on Task 1)
- bilingual reference documentation (depends on Task 1)

### Fixed

- Fix: API face — inspector runs endpoints (depends on Task 1)


_Tasks: 5 total, 4 done, 0 tech debt, 1 no-go_

## [sprint541] - 2026-08-17

### Added

- canonical inspector read-model v1 (core module + hermetic suite)


_Tasks: 2 total, 1 done, 0 tech debt, 1 no-go_

## [sprint540] - 2026-08-17

### Added

- No completed tasks


_Tasks: 1 total, 0 done, 0 tech debt, 1 no-go_

## [sprint539] - 2026-08-17

### Added

- phase5-writer.mjs — claim filing + verified append + projections
- phase5-sign.mjs — owner sign ceremony (depends on Task 1)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [sprint538] - 2026-08-17

### Added

- Phase-5 dry-run bundle builder + hermetic proof


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [sprint537] - 2026-08-17


### Changed

- Canary no-op doc touch (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [sprint536] - 2026-08-17

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [sprint535] - 2026-08-17

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [sprint534] - 2026-08-17

### Added

- No completed tasks


_Tasks: 1 total, 0 done, 0 tech debt, 0 no-go_

## [sprint533] - 2026-08-16

### Added

- close the local-llm agentic worker and settlement lineage
- close the deckent local-llm lifecycle command lineage


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_
