# Interactive surfaces

## Product-user perspektifi

Deckent control ile projection'ı bilinçli ayırır:

- Terminal ve Desktop primary operator surface'lerdir.
- CLI, API, MCP, process/autonomous girişleri ve connectors aynı application-service authority'yi adapt eder.
- Dashboard gözlemler; execution veya state authority değildir.

[Kanıt: `.deckent/workspace/IDENTITY.md:8-9,16`]

## Native terminal / REPL

`deckent` subcommand olmadan çağrıldığında native chat'e yönlenir. Help/version flag'leri bu route'u bypass eder; unknown subcommand sessizce chat açmak yerine Commander'a gider. Interactive TTY session'ları Ink REPL yükler; non-TTY ve rollback path'leri legacy line loop kullanır. [Kanıt: `src/cli/entry.ts:51-107,157-171,664-738,1184-1218`]

Provider resolution configured chat provider, sonra Brain provider, sonra Claude fallback sırasını izler. Supported adapter branch'leri subscription CLI'ları, Ollama ve OpenAI-compatible preset'leri içerir; availability/authorization config assertion değil runtime evidence'dır. [Kanıt: `src/cli/entry.ts:174-190,531-633`; `src/core/config.ts:712-716,2538-2542`]

REPL tool dispatch edebilir ve side-effecting operation'da permission ister. Off-TTY auto-approval explicit `--auto-approve` veya `--yes` gerektirir; yokluğu fail-closed'dur. [Kanıt: `src/cli/entry.ts:72-123,786-863`; `src/cli/commands/chat-permissions.ts`]

Feature truth run, tool-surface için code, wiring ve enablement buldu ama runtime proof ref bulmadı. Dogfood flag açık diye progressive-disclosure tool'ları certified saymayın; status `⚠️ kısmi`. [Kanıt: gerçek `truth --json`, 2026-08-01; `src/cli/repl/native-tool-registry.ts`; callsite `src/cli/repl/run.tsx:986`]

## Explicit chat komutu

`deckent chat`; Claude, Codex veya Gemini host CLI launch edebilir, MCP attachment check edebilir, stored chat turn'leri resume edebilir, local Ollama seçebilir veya native loop kullanabilir. `--message`, single native turn ima eder. [Kanıt: `src/cli/commands/chat.ts:417-579`; actual `chat --help`, 2026-08-01]

`chat --local` artık yalnız reserved flag değildir: current action Ollama probe eder ve available ise native adapter'ı wire eder. Help text hâlâ “reserved” der; help ile implementation farklıdır. [Kanıt: `src/cli/commands/chat.ts:277-305,421-471`; actual help]

## Terminal dashboard ve live status

`deckent dashboard` terminal auto-refresh projection'dır; `status --watch` ilişkili status surface'tir. JSON mode bir kez döner. Audit'te `dashboard --json` active sprint olmadığı için exit 1 verdi; `status --json` structured idle authority snapshot döndürdü. [Kanıt: `src/cli/commands/dashboard.ts:147-214`; `src/cli/commands/status.ts:1024-1040`; real output'lar, 2026-08-01]

## Web/API dashboard

`deckent serve`, default `127.0.0.1:3100` üzerinde HTTP API ve SSE server başlatır; dev proxy option ve embedded-terminal opt-out içerir. `deckent web` visible kalır fakat `serve` lehine deprecated'dir. [Kanıt: `src/cli/commands/serve.ts:72-80`; `src/cli/commands/web.ts:27-32`; real help audit]

Dashboard API/read model'ler üzerinde projection kalır. Detay ve endpoint'ler [API surface](../reference/api-surface.md) içindedir. [Kanıt: `src/api/server.ts`; identity contract]

## Desktop

Repository; main-process daemon lifecycle, security, connection profile, IPC handler, tray/menu/window management, preload boundary ve command/changes/engine-room/worker/radio view'leri için renderer shell içeren Electron/Vite Desktop application taşır. [Kanıt: `src/desktop/package.json`; `src/desktop/src/main/index.ts`; `src/desktop/src/main/security.ts`; `src/desktop/src/preload/index.ts`; `src/desktop/src/renderer/shell/`]

Status `⚠️ kısmi`: source ve tests var, fakat audit Desktop build/launch yapmadı ve end-to-end operator proof iddia etmez. Owner root `build:all` çalıştırdı; script web dashboard'u build eder ama `src/desktop`'u etmez. [Kanıt: `package.json:38,73-76`; audit'te Desktop runtime run yok]

## VS Code extension

Extension source Deckent panel, refresh loop, data projection ve RPC bridge sunar. Ayrı execution authority değil adapter'dır. Extension host audit'te launch edilmediği için status `⚠️ kısmi`. [Kanıt: `src/extensions/vscode/src/deckent-panel.ts`; `src/extensions/vscode/src/panel-refresh.ts`; `src/extensions/vscode/src/rpc-bridge.ts`; identity contract]

## Dogfood / repository gerçeği

| Surface | State | Evidence boundary |
|---|---|---|
| Bare native REPL | ✅ canlı wiring | Default route ve Ink mount var; interactive provider turn çalıştırılmadı. |
| Tool surface | ⚠️ kısmi | code/wired/enabled, proof undefined |
| Terminal status | ✅ canlı | real idle JSON output |
| Terminal dashboard | ✅ canlı, dürüst no-run failure | real exit 1 ve typed error |
| Web/API | ✅ registered | server action help-verified; başlatılmadı |
| Desktop | ⚠️ kısmi | source/tests var; runtime proof yok |
| VS Code | ⚠️ kısmi | adapter source var; extension-host proof yok |

Burada geçen tüm executable syntax real-binary help ile doğrulandı; yalnız açıkça belirtilen read-only command'lar action-run edildi. [Kanıt: 212-call help audit ve read-only run ledger, 2026-08-01]
