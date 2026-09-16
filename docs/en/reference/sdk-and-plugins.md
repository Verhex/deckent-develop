# SDK and plugins

## Product-user perspective: SDK

The package exports the main library at `deckent` and the typed client at `deckent/sdk`. Create one client per project root:

```ts
import { createDeckentClient } from 'deckent/sdk';

const client = createDeckentClient({ projectRoot: '/absolute/project/path' });
const status = await client.status();
```

[Evidence: `package.json:10-20`; `src/sdk/deckent-client.ts:49-106,315-317`]

| Method | Behavior | Side effects / failure semantics | Evidence |
|---|---|---|---|
| `status()` | Reads sprint ID, `.dashboard`, task files, and task-count projection. | Read-only; missing/unparseable projections become null/empty/skip. | `src/sdk/deckent-client.ts:108-151,203-213` |
| `memoryQuery(query, options)` | FTS5 query over `.brain/memory.db`. | Read-only; missing DB returns `[]`; store is closed in `finally`. | `src/sdk/deckent-client.ts:215-228` |
| `planStructured(text)` | Parses DIRECTIVES-style text to structured tasks. | Pure parsing; no disk write. | `src/sdk/deckent-client.ts:230-232` |
| `limits(options)` | Probes subscription usage and evaluates the limit gate. | May invoke the provider usage probe unless a probe seam is injected. | `src/sdk/deckent-client.ts:234-238,305-314` |
| `startSprintDetached(options)` | Builds `deckent start` argv and starts the detached process. | The only direct execution method; returns PID/log-path result. | `src/sdk/deckent-client.ts:75-88,240-253` |
| `getSprintResults(sprintId)` | Reads live task/result files, then new archive layout, then legacy archive fallback. | Read-only; returns source `live|archive|none`. | `src/sdk/deckent-client.ts:90-101,155-195,255-274` |
| `getRetro(sprintId)` | Reads `retro-<sprintId>` from memory DB. | Read-only; missing DB/entry returns null. | `src/sdk/deckent-client.ts:276-288` |

`startSprintDetached` accepts auto-approve, sandbox, force, dry-run, and timeout flags. This audit did not call it because sprint execution was prohibited. [Evidence: `src/sdk/deckent-client.ts:75-88,240-253`; OQ-20]

## Product-user perspective: plugins

Plugins live in `.deckent/plugins/<name>` and carry a `manifest.json` with identity/version/entrypoint plus optional agents, skills, hooks, system/enabled flags, and signatures. Use `deckent plugin list|info|install|update|remove|create|test`; installation supports npm, Git, and local sources. [Evidence: `src/core/plugin.ts:11-35,53-155,244-405`; `src/cli/commands/plugin.ts:9-240`]

Lifecycle hook names are `beforeSprint`, `afterSprint`, `beforeTask`, and `afterTask`. Multiple callbacks run in registration order; a thrown hook is reported to stderr and does not abort the sprint. [Evidence: `src/core/plugin-hooks.ts:20-89`]

### Security contract

Before hook loading, the security layer checks path containment, entrypoint presence, sandbox findings, legacy SHA-256 file signature policy, and optional Ed25519 publisher authenticity/trust configuration. Unsigned behavior depends on `require_signature`; an untrusted/invalid publisher signature is not silently accepted. [Evidence: `src/core/plugin-loader.ts:34-103,105-315,325-460`; `src/core/plugin-hooks.ts:160-190`]

System plugins cannot be removed. Disabled plugins are excluded from listing/loading. Manifest model values must resolve to canonical registry identities. [Evidence: `src/core/plugin.ts:82-150,170-213,409-454`]

## Dogfood / repository reality

- ✅ SDK export and client implementation are in the package build. [Evidence: `package.json:10-20`; `src/sdk/index.ts`]
- ⚠️ The SDK mixes pure reads with two explicit external-action seams: usage probing and detached start. Callers must not classify the whole client as read-only. [Evidence: `src/sdk/deckent-client.ts:305-314`]
- ⚠️ Plugin installation and lifecycle hooks can execute third-party content. The loader provides defense in depth, but local policy and trusted publisher configuration remain required. [Evidence: `src/core/plugin-loader.ts:325-460`]
- ⚠️ Network installation/publish and detached execution were not exercised in this documentation audit; source wiring and CLI help are verified, runtime proof is `HOLD`. [Evidence: task boundary; recursive help audit, 2026-08-01]
