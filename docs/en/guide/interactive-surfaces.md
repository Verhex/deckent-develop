# Interactive surfaces

## Product-user perspective

Deckent deliberately separates control from projection:

- Terminal and Desktop are primary operator surfaces.
- CLI, API, MCP, process/autonomous entry points, and connectors adapt the same application-service authority.
- Dashboard observes; it is not the execution or state authority.

[Evidence: `.deckent/workspace/IDENTITY.md:8-9,16`]

## Native terminal / REPL

Invoking `deckent` with no subcommand routes to native chat. Help/version flags bypass that route; unknown subcommands go to Commander instead of silently opening chat. Interactive TTY sessions load the Ink REPL; non-TTY and rollback paths use the legacy line loop. [Evidence: `src/cli/entry.ts:51-107,157-171,664-738,1184-1218`]

Provider resolution follows the configured chat provider, then Brain provider, then Claude fallback. Supported adapter branches include subscription CLIs, Ollama, and OpenAI-compatible presets; availability and authorization are runtime evidence, not config assertions. [Evidence: `src/cli/entry.ts:174-190,531-633`; `src/core/config.ts:712-716,2538-2542`]

The REPL can dispatch tools and asks for permission on side-effecting operations. Off-TTY auto-approval requires explicit `--auto-approve` or `--yes`; absence is fail-closed. [Evidence: `src/cli/entry.ts:72-123,786-863`; `src/cli/commands/chat-permissions.ts`]

The feature truth run found tool-surface code, wiring, and enablement, but no runtime proof reference. Treat progressive-disclosure tools as `⚠️ partial`, not certified merely because the dogfood flag is on. [Evidence: real `truth --json`, 2026-08-01; `src/cli/repl/native-tool-registry.ts`; callsite `src/cli/repl/run.tsx:986`]

## Explicit chat command

`deckent chat` can launch Claude, Codex, or Gemini host CLIs, check MCP attachment, resume stored chat turns, select local Ollama, or use the native loop. `--message` implies a single native turn. [Evidence: `src/cli/commands/chat.ts:417-579`; actual `chat --help`, 2026-08-01]

`chat --local` is no longer only a reserved flag: the current action probes Ollama and wires the native adapter when available. The help text still says “reserved,” so help and implementation differ. [Evidence: `src/cli/commands/chat.ts:277-305,421-471`; actual help]

## Terminal dashboard and live status

`deckent dashboard` is a terminal auto-refresh projection; `status --watch` is the related status surface. JSON mode returns once. In the audit, `dashboard --json` exited 1 because no sprint was active, while `status --json` returned a structured idle authority snapshot. [Evidence: `src/cli/commands/dashboard.ts:147-214`; `src/cli/commands/status.ts:1024-1040`; real outputs, 2026-08-01]

## Web/API dashboard

`deckent serve` starts the HTTP API and SSE server on `127.0.0.1:3100` by default, with a dev proxy option and an embedded-terminal opt-out. `deckent web` remains visible but is deprecated in favor of `serve`. [Evidence: `src/cli/commands/serve.ts:72-80`; `src/cli/commands/web.ts:27-32`; real help audit]

The dashboard remains a projection over API/read models. Details and endpoints are in [API surface](../reference/api-surface.md). [Evidence: `src/api/server.ts`; identity contract]

## Desktop

The repository contains an Electron/Vite Desktop application with main-process daemon lifecycle, security, connection profiles, IPC handlers, tray/menu/window management, a preload boundary, and renderer shells for command, changes, engine-room, worker, and radio views. [Evidence: `src/desktop/package.json`; `src/desktop/src/main/index.ts`; `src/desktop/src/main/security.ts`; `src/desktop/src/preload/index.ts`; `src/desktop/src/renderer/shell/`]

Status is `⚠️ partial`: source and tests exist, but this audit did not build or launch Desktop and therefore does not claim end-to-end operator proof. The owner ran root `build:all`, whose script builds the web dashboard but not `src/desktop`. [Evidence: `package.json:38,73-76`; no Desktop runtime run in this audit]

## VS Code extension

The extension source supplies a Deckent panel, refresh loop, data projection, and RPC bridge. It is an adapter, not separate execution authority. Status is `⚠️ partial` because no extension host was launched in this audit. [Evidence: `src/extensions/vscode/src/deckent-panel.ts`; `src/extensions/vscode/src/panel-refresh.ts`; `src/extensions/vscode/src/rpc-bridge.ts`; identity contract]

## Dogfood / repository reality

| Surface | State | Evidence boundary |
|---|---|---|
| Bare native REPL | ✅ live wiring | Default route and Ink mount exist; no interactive provider turn was run here. |
| Tool surface | ⚠️ partial | code/wired/enabled, proof undefined |
| Terminal status | ✅ live | real idle JSON output |
| Terminal dashboard | ✅ live, honest no-run failure | real exit 1 with typed error |
| Web/API | ✅ registered | server action help-verified; not started |
| Desktop | ⚠️ partial | source/tests present; no runtime proof |
| VS Code | ⚠️ partial | adapter source present; no extension-host proof |

All executable syntax mentioned here was real-binary help-verified; only explicitly identified read-only commands were action-run. [Evidence: 212-call help audit and read-only run ledger, 2026-08-01]
