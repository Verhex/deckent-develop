# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0-beta.1-sprint510] - 2026-08-11

### Added

- The DIRECTIVES scope chain stops producing phantoms and silent shrinks (row 3312)
- Wire validatePluginSecurity into the production plugin load path, flag-gated (row 7031)
- Point the model catalog at the live models.dev endpoint, typed on drift (row 539)

### Changed

- Worker verification cannot judge unrelated concurrent partial writes (row 3277) (completed with tech debt)
- enforce_spend_gate becomes a real typed pre-spawn gate, flag-gated (row 4091) (completed with tech debt)

### Fixed

- A PLAN-generated skill survives every FIX turn (row 3310)


_Tasks: 6 total, 6 done, 2 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint508] - 2026-08-11

### Added

- One runtime floor: doctor derives from package engines (row 450)

### Fixed

- Legacy controller fixtures satisfy today's fail-closed contracts (row 3297)


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint505] - 2026-08-10

### Added

- Let an approved-but-unstarted flow be retired from the inbox

### Fixed

- Sweep task artifacts by task identity, not by filename prefix


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint504] - 2026-08-10

### Added

- Render a liveness-proven ACTIVE run instead of holding it


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint501] - 2026-08-10

### Added

- Address any run-flow directly and page the inbox


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint499] - 2026-08-09

### Added

- Escape Unicode line separators in the structured-criteria projection
- Make the declared minimum model tier authoritative


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint498] - 2026-08-09

### Added

- Document the run-flow inbox surface


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint497] - 2026-08-09

### Added

- Document the owner-managed model activation surface


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

