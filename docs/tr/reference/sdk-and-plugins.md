# SDK ve plugin'ler

## Product-user perspektifi: SDK

Package main library'yi `deckent`, typed client'ı `deckent/sdk` olarak export eder. Her project root için bir client oluştur:

```ts
import { createDeckentClient } from 'deckent/sdk';

const client = createDeckentClient({ projectRoot: '/absolute/project/path' });
const status = await client.status();
```

[Kanıt: `package.json:10-20`; `src/sdk/deckent-client.ts:49-106,315-317`]

| Method | Davranış | Side effect / failure semantics | Kanıt |
|---|---|---|---|
| `status()` | Sprint ID, `.dashboard`, task file'ları ve task-count projection okur. | Read-only; missing/unparseable projection null/empty/skip olur. | `src/sdk/deckent-client.ts:108-151,203-213` |
| `memoryQuery(query, options)` | `.brain/memory.db` üzerinde FTS5 query yapar. | Read-only; missing DB `[]` döndürür; store `finally` içinde kapanır. | `src/sdk/deckent-client.ts:215-228` |
| `planStructured(text)` | DIRECTIVES-style text'i structured task'lara parse eder. | Pure parsing; disk write yok. | `src/sdk/deckent-client.ts:230-232` |
| `limits(options)` | Subscription usage probe eder ve limit gate'i evaluate eder. | Probe seam inject edilmezse provider usage probe invoke edebilir. | `src/sdk/deckent-client.ts:234-238,305-314` |
| `startSprintDetached(options)` | `deckent start` argv oluşturur ve detached process başlatır. | Tek direct execution method'udur; PID/log-path result döndürür. | `src/sdk/deckent-client.ts:75-88,240-253` |
| `getSprintResults(sprintId)` | Önce live task/result, sonra yeni archive layout, sonra legacy archive fallback okur. | Read-only; `live|archive|none` source döndürür. | `src/sdk/deckent-client.ts:90-101,155-195,255-274` |
| `getRetro(sprintId)` | Memory DB'den `retro-<sprintId>` okur. | Read-only; missing DB/entry null döndürür. | `src/sdk/deckent-client.ts:276-288` |

`startSprintDetached` auto-approve, sandbox, force, dry-run ve timeout flag'lerini kabul eder. Sprint execution yasak olduğu için bu audit çağırmadı. [Kanıt: `src/sdk/deckent-client.ts:75-88,240-253`; OQ-20]

## Product-user perspektifi: plugin'ler

Plugin'ler `.deckent/plugins/<name>` altında yaşar ve identity/version/entrypoint ile opsiyonel agents, skills, hooks, system/enabled flag ve signature içeren `manifest.json` taşır. `deckent plugin list|info|install|update|remove|create|test` kullan; installation npm, Git ve local source destekler. [Kanıt: `src/core/plugin.ts:11-35,53-155,244-405`; `src/cli/commands/plugin.ts:9-240`]

Lifecycle hook adları `beforeSprint`, `afterSprint`, `beforeTask` ve `afterTask`tır. Birden çok callback registration sırasında çalışır; throw eden hook stderr'e raporlanır ve sprint'i abort etmez. [Kanıt: `src/core/plugin-hooks.ts:20-89`]

### Security contract

Hook loading öncesinde security layer path containment, entrypoint presence, sandbox finding, legacy SHA-256 file signature policy ve opsiyonel Ed25519 publisher authenticity/trust config kontrol eder. Unsigned davranış `require_signature` değerine bağlıdır; untrusted/invalid publisher signature sessiz kabul edilmez. [Kanıt: `src/core/plugin-loader.ts:34-103,105-315,325-460`; `src/core/plugin-hooks.ts:160-190`]

System plugin kaldırılamaz. Disabled plugin listing/loading dışında kalır. Manifest model değeri canonical registry identity'ye resolve olmalıdır. [Kanıt: `src/core/plugin.ts:82-150,170-213,409-454`]

## Dogfood / repository gerçeği

- ✅ SDK export ve client implementation package build içindedir. [Kanıt: `package.json:10-20`; `src/sdk/index.ts`]
- ⚠️ SDK pure read'ler ile iki explicit external-action seam'i karıştırır: usage probing ve detached start. Caller client'ın tamamını read-only sınıflamamalıdır. [Kanıt: `src/sdk/deckent-client.ts:305-314`]
- ⚠️ Plugin installation ve lifecycle hook third-party content execute edebilir. Loader defense in depth sağlar; local policy ve trusted publisher config yine gereklidir. [Kanıt: `src/core/plugin-loader.ts:325-460`]
- ⚠️ Network installation/publish ve detached execution bu documentation audit'inde çalıştırılmadı; source wiring ve CLI help verified, runtime proof `HOLD`'dur. [Kanıt: task boundary; recursive help audit'i, 2026-08-01]
