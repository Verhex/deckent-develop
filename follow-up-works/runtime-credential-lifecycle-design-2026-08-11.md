# Runtime credential & descriptor lifecycle — service contract

**Date:** 2026-08-11
**MASTER row:** 4131 (first slice)
**Status:** `DESIGN` — proposal only. No production or configuration file was
touched to produce this document.
**Depends on:** [credential exposure taxonomy](./credential-exposure-taxonomy-2026-08-11.md)
(task 520-001, settled `DONE`) — its five custody classes are the labeling
vocabulary used here.

---

## 0. Verdict (row 4131)

**Confirmed with file evidence: there is no lifecycle owner.** Runtime
credentials and process descriptors are minted, published, and (sometimes)
retired by five independent call-site families. Each family invented its own
atomicity story, its own durability guarantee, and its own idea of what
"retired" means. Three of the five have **no retirement path at all**.

The asymmetry is the finding. The same repository contains:

- the **strongest** implementation — the bot pid record
  (`src/connectors/bot-daemon.ts:164-218`): `O_EXCL` staging, `O_NOFOLLOW`,
  `fsync` of both file and parent directory, atomic `link(2)` no-clobber
  publication, generation-bound compare-then-remove retirement, and a
  fail-closed `ownership-unknown` state when evidence is ambiguous; and
- the **weakest** — the runtime token files
  (`src/api/server.ts:1931-1946`): tmp + rename, no `fsync`, fixed filename
  with no generation or port component, and **no call site anywhere in this
  task's read scope ever removes them**.

They share no contract, no identity model, and no vocabulary. A credential
minted by the second family is strictly less manageable than a *pid number*
minted by the first.

Three specific, ordered failure modes are demonstrated below rather than
asserted: a failed port bind that **clobbers a healthy daemon's credentials**
(§4.1), token files that are structurally **write-only** (§4.2), and a crash
path that leaves **live bearer tokens readable on disk** with no expiry and no
sweeper (§4.3).

---

## 1. Scope and method

### 1.1 What was read

Evidence was gathered by reading, inside this task's authorized read scope:

- `src/api/server.ts` — token mint, persistence, injection, delivery, listen
- `src/api/serve-daemon-meta.ts` — the daemon handshake descriptor (whole file)
- `src/api/middleware/token.ts` — bootstrap resolve, HTML inject, query token
- `src/api/auth.ts` — token resolution order and the auth-disable bypass
- `src/api/terminal/auth-provider.ts` — the three terminal credential verifiers
- `src/cli/commands/serve.ts` — daemon publication and shutdown ordering
- `src/connectors/bot-daemon.ts` — pid record publication/inspection/retirement
- `src/cli/commands/bot.ts` — the pid record's CLI call sites
- `src/connectors/gateway/gateway-access.ts` — pairing codes, allowlist, bindings
- `src/connectors/gateway/gateway-daemon.ts` — gateway bot-token passthrough

Every row in §3 cites an exact file and line.

### 1.2 What was NOT read — stated so no reader over-trusts this document

`src/core/`, `src/orchestra/`, `src/desktop/`, and `src/monitor/` were **outside
this task's read scope**. Consequences, stated honestly rather than papered over:

- `src/core/pid-ownership.ts` (`processStartToken`, `verifyPidOwnership`) is the
  generation primitive both the daemon descriptor and the bot pid record depend
  on. It is referenced here **as its in-scope callers document it**
  (`src/api/serve-daemon-meta.ts:7-8,51`, `src/connectors/bot-daemon.ts:29`),
  not from inspection. Its platform coverage is an open question (§8, D6), not
  a claim.
- The desktop shell is the documented consumer of `serve-daemon.json`
  (`src/api/serve-daemon-meta.ts:2-10`). Its adopt-vs-spawn implementation was
  not inspected; this document therefore describes the **producer's** contract
  and the obligations it imposes on any consumer, and does not assert what the
  desktop side currently does.
- Where this document says "no call site removes X", the claim is scoped:
  **no call site in the read scope above**. A sweeper could exist in
  `src/core/` or `src/monitor/`. §8 D1 makes confirming that an explicit owner
  action rather than an assumption — the same discipline the taxonomy applied
  to the provider-auth broker (its §3.2).

### 1.3 Relationship to the task-520-001 taxonomy — no contradiction by construction

The taxonomy classified **provider credentials**: secrets deckent *borrows*
from an external issuer (Anthropic, OpenAI, AWS) and hands to a worker. This
document covers a **disjoint population**: credentials and descriptors deckent
*mints for itself* to guard its own surfaces (the HTTP API, the embedded web
terminal, the daemon handshake, the bot process record, the chat pairing flow).

The two sets do not overlap, so **no row classified by the taxonomy is
reclassified here**. What is inherited is the vocabulary:

| Class (from the taxonomy) | Meaning, applied to deckent-minted runtime credentials |
|---|---|
| `host-only` | Lives only in the minting process's memory, or in a file the operator already owns; never copied |
| `env` | Reaches a consumer through process environment; visible to `/proc/<pid>/environ` and equivalents |
| `tmpfs-copy` | A copy whose destruction is guaranteed by RAM-backed teardown |
| `persistent-copy` | A copy on durable storage that outlives the minting process |
| `enterprise custody` | Held by an external secret manager, workload-identity system, OS keychain, or air-gapped equivalent |

One inherited finding carries over directly: the taxonomy's §3.6 recorded that
**no** provider credential path reaches `enterprise custody`. The same holds for
every runtime credential in §3 below — the class remains unoccupied across both
populations. That is a consistency check, not a new claim.

The taxonomy's own §4 D1 asked whether a cleanup routine for its broker files
"exists elsewhere, e.g. a CLI `deckent cleanup` command under `src/cli/`". This
task *did* hold `src/cli/` in read scope. Answer, bounded to that scope: the
`serve` and `bot` command paths contain **no** provider-auth broker cleanup.
That is a partial answer to the taxonomy's open question, not a complete one —
other `src/cli/` commands were not inventoried, since this task's subject is
runtime credentials, not provider ones.

---

## 2. The five call-site families

| # | Family | Minting authority | Retirement authority | Durability |
|---|---|---|---|---|
| F1 | API bearer token | `src/api/server.ts` (4 distinct branches) | **none found** | tmp+rename, no fsync |
| F2 | Terminal session token | `src/api/server.ts:2445` | **none found** | tmp+rename, no fsync |
| F3 | Serve-daemon descriptor | `src/api/serve-daemon-meta.ts:74` | `:107` graceful path only | tmp+chmod+rename, no fsync |
| F4 | Bot pid record | `src/connectors/bot-daemon.ts:274` | `:406` generation-bound | O_EXCL+link(2)+double fsync |
| F5 | Gateway pairing / allowlist / bindings | `src/connectors/gateway/gateway-access.ts:64` | consume-on-approve only | tmp+rename, no fsync, no mode |

Five families, five different answers to the same four questions. That is the
row's premise, made concrete.

---

## 3. Call-site inventory

Custody classes are those defined in §1.3. "Retire (crash)" is the column the
row specifically demands and is **never** collapsed into "Retire (shutdown)".

| # | Credential / descriptor | Created at | Published to | Custody | Bound to | Expiry | Rotate | Revoke | Retire (shutdown) | Retire (crash) | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | API token — explicit param | caller-supplied | in-memory + §3 rows 5-7 | host-only | nothing | none | restart | restart | n/a | n/a | `src/api/server.ts:2069,2082`; resolution order `:2118-2127` |
| 2 | API token — `DECKENT_API_TOKEN` env | operator env | in-memory + rows 5-7 | env | nothing | none | restart | edit env + restart | n/a | n/a | `src/api/auth.ts:97-99`; `src/api/middleware/token.ts:37-39` |
| 3 | API token — auto-generate | `randomUUID()` | row 5 | persistent-copy | nothing | none | restart | **none** | **none** | **none** | `src/api/server.ts:2090-2113` |
| 4 | API token — loopback auto-mint | `randomBytes(32)` | row 5 | persistent-copy | nothing | none | restart | **none** | **none** | **none** | `src/api/server.ts:2135-2161` |
| 5 | → `.deckent/runtime/api-token` | `writeRuntimeTokenFile` | disk, mode 0600 (+`icacls` on win32) | persistent-copy | project dir only | none | overwrite on next start | **none** | **none** | **none** | `src/api/server.ts:1931-1946`, win32 ACL `:1950-1975` |
| 6 | → `window.__DECKENT_API_TOKEN__` | HTML rewrite | every loopback GET of index.html | host-only (client memory) | loopback check only | page lifetime | n/a | n/a | n/a | n/a | `src/api/middleware/token.ts:47-52`, loopback gate `:84-91` |
| 7 | → `?token=` query parameter | caller-appended | SSE URLs (opt-in paths) | env-adjacent (URL) | opt-in path list | none | n/a | n/a | n/a | n/a | `src/api/middleware/token.ts:62-76`; rationale `:11-14,21-24` |
| 8 | Terminal token | `randomUUID()` | rows 9-11 | host-only at mint | nothing | none | restart | **none** | **none** | **none** | `src/api/server.ts:2441-2466` |
| 9 | → `.deckent/runtime/terminal-token` | `writeRuntimeTokenFile` | disk, mode 0600 | persistent-copy | project dir only | none | overwrite on next start | **none** | **none** | **none** | `src/api/server.ts:2452` |
| 10 | → `window.__DECKENT_TERMINAL_TOKEN__` | HTML rewrite | served index.html | host-only (client memory) | see §4.6 | page lifetime | n/a | n/a | n/a | n/a | `src/api/server.ts:2517-2530` |
| 11 | → `GET /api/terminal/token` | echo of row 8 | any API-bearer-authorized caller | host-only in transit | API bearer | none | n/a | n/a | n/a | n/a | `src/api/server.ts:2598-2617` |
| 12 | `serve-daemon.json` | `writeServeDaemonMeta` | disk, mode 0600, **carries rows 5+9 values** | persistent-copy | pid + `startToken` + `projectRoot` | none | none | none | `clearServeDaemonMeta` | **none** | `src/api/serve-daemon-meta.ts:74-91,97-104,107-113`; publication `src/cli/commands/serve.ts:190-200`; shutdown `:219-236` |
| 13 | `bot.pid` record | `writeBotPid` | disk, mode 0600, dir 0700 | persistent-copy (no secret) | pid + `startToken` + root + schema version | none | none | `stopBot` SIGTERM | `clearBotPid`, generation-bound | `src/connectors/bot-daemon.ts:274-292`, write `:164-218`, retire `:155-163,406-429`; callers `src/cli/commands/bot.ts:198,238,271` |
| 14 | Gateway pairing code | `randomInt(100000,1000000)` | `pairings.json` (no explicit mode) | persistent-copy | chatKey | **none** | reuses existing code | `rejectPairing` | **none** | **none** | `src/connectors/gateway/gateway-access.ts:43,64-71,75-87` |
| 15 | Gateway allowlist / bindings | `authorize` / `setBinding` | `allowlist.json`, `bindings.json` | persistent-copy | chatKey + projectPath | none | n/a | `revoke` | n/a | n/a | `src/connectors/gateway/gateway-access.ts:56-64,89-90` |
| 16 | Gateway bot token | operator-supplied | connector `start({token})` | env | nothing | none | restart | provider-side | n/a | n/a | `src/connectors/gateway/gateway-daemon.ts:25,92` |

**Sixteen rows. Zero expiries. Zero generation bindings on any credential.
Zero crash-retirement paths.** The single non-empty crash-adjacent cell in the
table is row 13 — and it protects a pid number, not a secret.

---

## 4. Lifecycle gap analysis

### 4.1 A failed port bind clobbers a healthy daemon's credentials

This is the sharpest measured defect and it is an **ordering** bug, so the order
is given precisely.

`createHttpServer` performs, in this sequence:

1. mints the API token and writes `.deckent/runtime/api-token`
   (`src/api/server.ts:2097` or `:2145` — both *before* any bind);
2. mints the terminal token and writes `.deckent/runtime/terminal-token`
   (`:2452`);
3. calls `server.listen(listenPort, host)` (`:2775`) — **and returns
   synchronously**; `listen` is asynchronous and `EADDRINUSE` surfaces later, as
   an `'error'` event on a subsequent tick.

`src/cli/commands/serve.ts` then runs `writeServeDaemonMeta(...)` at `:190`,
still on the current tick — **before** the error event can fire.

Now start a second `deckent serve` on a port a healthy daemon already owns:

- Steps 1-2 **overwrite** the incumbent's `api-token` and `terminal-token`
  files. Both are fixed filenames under `RUNTIME_DIR` with no port, pid, or
  generation component (`src/api/server.ts:1933-1935`), so the write is
  unconditional.
- Step 3's bind fails, but only later.
- `writeServeDaemonMeta` has already published a descriptor naming the **new,
  about-to-die** pid, its `startToken`, the contested `host`/`port`, and the
  **new tokens** (`src/cli/commands/serve.ts:191-197`). The rename is atomic, so
  the incumbent's descriptor is replaced cleanly and irrecoverably.
- The `'error'` event then fires. Grepping `src/api/server.ts` finds **no
  `server.on('error', ...)` handler** — the only `'error'` registrations in the
  file are `req.on('error')` at `:399` and the `icacls` child at `:1964`. An
  unhandled `'error'` event on an EventEmitter throws, so the process dies
  before `registerShutdownHook`'s cleanup (`src/cli/commands/serve.ts:218`) can
  run. Nothing is rolled back.

Steady state after this sequence:

- The incumbent daemon is **still healthy** and still serving, holding its
  original tokens in memory.
- Every on-disk credential now describes a **process that no longer exists**.
- A client that follows the documented handshake reads `serve-daemon.json`,
  finds a dead pid, and correctly decides "stale, spawn" — the descriptor's own
  contract saves it (`src/api/serve-daemon-meta.ts:17-20`). It then tries to
  spawn, hits the same occupied port, and reproduces the failure.
- A client that instead reads `.deckent/runtime/api-token` — which carries **no
  pid, no generation, and no liveness hint of any kind** — has no way to detect
  staleness. It presents a token the live daemon has never heard of and receives
  `401` indefinitely.

The descriptor is protected by its identity binding. The token files are not,
because they have no identity at all. That is precisely the asymmetry §0 names.

### 4.2 The runtime token files are structurally write-only

`writeRuntimeTokenFile` (`src/api/server.ts:1931`) is called from exactly three
sites (`:2097`, `:2145`, `:2452`). Searching the read scope for removal of
`api-token` or `terminal-token` returns **only** the tmp-file cleanup inside
that same helper's own rename-failure branch (`:1941`). There is no unlink on
the shutdown path, none in `clearServeDaemonMeta`, none in `serve.ts`.

The lifecycle is therefore: **created, never destroyed.** After the last
`deckent serve` of a project ever exits, a valid-looking bearer token for that
project's API and a valid-looking session token for its embedded PTY remain on
disk — `0600`, plaintext, indefinitely. They are inert only because no process
is listening; nothing marks them inert, and the next daemon start silently
overwrites rather than rotates them.

Contrast row 13: the bot pid record — which guards nothing secret — gets
compare-then-remove retirement with an explicit comment about not letting an
older generation erase a newer one (`src/connectors/bot-daemon.ts:406-408`).

### 4.3 Crash retirement — the case the row demands

Handled as its own phase throughout this document, because collapsing it into
graceful shutdown is exactly how it gets lost.

`serve-daemon.json` is cleared **only** by the shutdown hook
(`src/cli/commands/serve.ts:219`), which runs on `SIGINT`/`SIGTERM`. It does not
run on `SIGKILL`, OOM-kill, host power loss, container eviction, or the
unhandled `'error'` throw of §4.1. The module documents this as acceptable
(`src/api/serve-daemon-meta.ts:17-20`) — and **for the descriptor's own
adopt-vs-spawn purpose it is**, because readers are contractually obliged to
re-verify via pid-ownership and `/health`.

That reasoning is sound for the descriptor and **does not transfer to its
payload.** The file also carries `apiToken` and `terminalToken` as live values
(`src/api/serve-daemon-meta.ts:58-61`, populated at `src/cli/commands/serve.ts:194-195`).
"Readers must re-verify liveness" is a correctness guarantee; it is not a
confidentiality guarantee. A crashed daemon leaves **live bearer credentials
readable on disk with no expiry, no generation marker, and no sweeper** — and
per §4.2 the same values also sit in two other files that are never removed
even on the graceful path.

Four distinct crash classes must each have a defined outcome. Today all four
have the same outcome — nothing happens:

| Crash class | Signal delivered? | Hook runs? | Today's residue |
|---|---|---|---|
| `SIGTERM` / `SIGINT` (orchestrated stop) | yes | yes | descriptor cleared; **token files remain** (§4.2) |
| `SIGKILL` / OOM / container evict | no | no | descriptor + both token files remain, all live |
| Unhandled `'error'` throw (§4.1) | n/a | no | same, **plus** a healthy daemon's credentials clobbered |
| Host power loss / kernel panic | no | no | same, plus possible torn writes (§4.5) |

**A design that does not answer all four rows is incomplete.** This is a NO-GO
condition for this task and must remain one for every downstream slice.

### 4.4 Generation blindness, port reuse, and concurrent daemons

The descriptor (row 12) and the pid record (row 13) both bind to a
`startToken`, which is what makes them pid-reuse-safe. **No credential does.**

Consequences that follow directly from the inventory:

- **Port reuse.** Nothing ties a token to the `(host, port)` it was minted for.
  Daemon A on `:3100` exits without cleanup; daemon B starts on `:3100`; A's
  leaked token file is indistinguishable from B's except by content.
- **Concurrent daemons, distinct ports.** `RUNTIME_DIR` is per project, not per
  endpoint (`src/api/server.ts:1932-1935`). Two daemons on `:3100` and `:3200`
  in the same project both write `api-token`; the second wins the file while
  both remain live in memory. The file names one of them, arbitrarily, with no
  way for a reader to tell which.
- **Restart.** Rotation is indistinguishable from clobbering: the new token
  overwrites the old with no generation increment, so no consumer can detect
  that it now holds a superseded credential rather than a wrong one.

### 4.5 Durability and partial-write asymmetry

Four different levels of write discipline for the same category of data:

| Mechanism | Staging | Publication | fsync | Mode | Symlink-safe | Evidence |
|---|---|---|---|---|---|---|
| Bot pid record | `O_EXCL` + `O_NOFOLLOW` | `link(2)` no-clobber | file **+ parent directory** | 0600 / dir 0700 | yes | `src/connectors/bot-daemon.ts:174-206` |
| Serve-daemon meta | `.tmp-<pid>` | `rename` | **no** | 0600 + explicit re-`chmod` | no | `src/api/serve-daemon-meta.ts:84-89` |
| Runtime token file | `.tmp` (**no pid suffix**) | `rename` | **no** | 0600 + win32 `icacls` | no | `src/api/server.ts:1935-1946` |
| Gateway JSON | `.tmp` (**no pid suffix**) | `rename` | **no** | **none — umask default** | no | `src/connectors/gateway/gateway-access.ts:33-38` |

Two concrete defects fall out of the right-hand columns:

1. **Fixed `.tmp` staging names collide.** `writeRuntimeTokenFile` uses
   `${tokenPath}.tmp` and the gateway uses `${path}.tmp`, with no pid or random
   suffix. Two concurrent writers interleave into the *same* staging path; the
   loser's rename publishes a file the winner was mid-write on. Both the
   descriptor (`.tmp-${process.pid}`) and the pid record
   (`.tmp-${pid}-${randomBytes(6)}`) already avoid this — the fix pattern
   exists in-repo and is simply not applied uniformly.
2. **Gateway files inherit the umask.** `writeJson`
   (`src/connectors/gateway/gateway-access.ts:33-38`) passes no `mode`. On a
   `022` umask these land `0644` — world-readable. `pairings.json` holds live
   pairing codes and `allowlist.json` holds the authorization set that decides
   which chats may drive a project.

Without `fsync`, a power-loss crash can leave a renamed-but-empty file. The
descriptor's reader tolerates this (`readServeDaemonMeta` returns `null` on
unparsable input, `src/api/serve-daemon-meta.ts:97-104`). The token files have
no reader-side validation in scope at all.

### 4.6 Least-privilege gaps in delivery

- **Terminal token in served HTML.** `src/api/server.ts:2517-2530` injects
  `window.__DECKENT_TERMINAL_TOKEN__`. The gate at `:2517` tests
  `!terminalToken && !finalToken` — a token-presence check. The API token's
  parallel injection path routes through an explicit **loopback** check
  (`src/api/middleware/token.ts:84-91`, whose doc comment at `:17-20` calls the
  loopback restriction essential). Whether the terminal injection is reached
  only on loopback depends on call-site guards not resolved within this task's
  reading; `src/cli/commands/serve.ts:92-97` does force `terminalEnabled` false
  for non-loopback binds, which appears to close it **for that entry point**.
  Recorded as an item requiring a proof obligation (§7 P2), not as a defect —
  the honest state is "guarded at one call site, not by the mechanism".
- **Token in URL query strings.** `extractTokenFromQuery`
  (`src/api/middleware/token.ts:62-76`) exists because `EventSource` cannot set
  headers — a legitimate constraint, correctly narrowed to an opt-in path list
  (`:21-24`). It remains the highest-exposure delivery channel in the inventory:
  URLs reach access logs, proxy logs, and `Referer` headers. With no expiry
  (§3), a token captured from a log line is valid forever.
- **`GET /api/terminal/token`** (`src/api/server.ts:2598-2617`) exchanges API
  bearer authority for terminal authority with no separate scope check, so the
  two credentials' blast radii are joined despite
  `src/api/terminal/auth-provider.ts:44-51` deliberately keeping terminal auth
  independent of the API's disable switch.
- **`DECKENT_API_AUTH_DISABLED=1`** (`src/api/auth.ts:181-184`) disables API
  auth wholesale. The terminal providers deliberately ignore it
  (`src/api/terminal/auth-provider.ts:44-51,98-101,178-181`) — a deliberate,
  documented, correct decision that the lifecycle service must preserve
  verbatim, not "unify".

### 4.7 Rotation is process restart; revocation does not exist

No row in §3 has a rotation path that is not "restart the daemon", and no row
except gateway `revoke`/`rejectPairing` has any revocation at all. A leaked API
token cannot be invalidated without terminating the daemon — which drops every
live SSE stream and PTY session. Enterprise operation requires rotation without
a service interruption and revocation of a single credential without touching
its siblings.

### 4.8 No tenant or principal binding

`src/api/terminal/auth-provider.ts` already carries a `TenantId` concept
(`:6,34`) and `src/api/server.ts:2765` reads a `strictTenantIsolation` setting.
No minted credential in §3 records which tenant or principal it was minted for.
Row 4131's required binding —
project + tenant + principal + generation + endpoint + expiry — currently has
**at most two of six components** present on the best row (project via the
containing directory, and nothing else on any token).

---

## 5. Proposed service — `RuntimeCredentialLifecycleService`

One service owns every row in §3. Call sites stop performing file I/O and start
declaring intent.

### 5.1 Layer placement (ADR-D-004 compliance — binding on this design)

The consumers are `src/api/`, `src/cli/`, and `src/connectors/`. Under
ADR-D-004 C1-C3, surfaces must not import one another and must not host
reusable business logic, so the service **must** live in `src/core/` and import
nothing from `orchestra/`, `cli/`, `api/`, or `mcp/`.

This has a concrete, already-visible benefit. `src/api/serve-daemon-meta.ts:30-37`
documents that it deliberately avoids importing `core/utils.readJsonSafe`
because that import drags the `core/types → config-types → connectors` type hub
into the desktop shell's DOM-lib typecheck program, and it therefore keeps
itself a leaf: node builtins + `constants` + `pid-ownership` + `debug-log`.
**The lifecycle service inherits that constraint as a hard requirement**, not a
preference: it must remain a leaf module with the same import budget, or it
will reintroduce the sprint-392 typecheck breakage. Any proof obligation in §7
that adds an import outside that budget fails.

`src/api/server.ts:1922-1928` records the mirror-image problem — the win32 ACL
hardening was duplicated out of `core/deck-file.ts` because that helper is not
exported and the file was out of scope. The service is the correct home for
that primitive, retiring the duplication.

### 5.2 Identity — the tuple the row demands

Every credential and descriptor carries a complete, non-optional identity:

```
CredentialIdentity {
  project:    ProjectId      // canonical absolute root, hashed for path safety
  tenant:     TenantId       // 'local' for solo; real tenant under isolation
  principal:  PrincipalId    // who the credential acts as — operator, desktop
                             // shell, bot listener, CI job
  generation: Generation     // { pid, startToken, seq } — monotonic per endpoint
  endpoint:   EndpointRef    // { kind: 'api'|'terminal'|'daemon'|'bot'|'pairing',
                             //   host, port }
  expiry:     Instant        // absolute; NO credential may be minted without one
}
```

Four properties, each closing a specific gap above:

- **`generation` makes §4.1 impossible.** Publication is compare-and-swap
  against the incumbent generation. A daemon that has not yet proven its bind
  cannot displace a live one.
- **`endpoint` makes §4.4 impossible.** Storage is keyed by endpoint, so two
  daemons on different ports cannot collide, and a token from `:3100` is
  structurally not presentable at `:3200`.
- **`expiry` makes §4.2 self-healing.** An orphaned credential becomes
  inert by the passage of time rather than by a sweeper that must be remembered.
- **`tenant` + `principal` make §4.8 answerable** and give revocation a subject.

`expiry` being non-optional is the load-bearing decision. It is what converts
crash retirement from "a cleanup routine we hope runs" into a property that
holds even when no deckent process is alive.

### 5.3 The six phases

```
                 ┌─────────────┐
   (1) CREATE ──▶│  RESERVED   │  minted; identity complete; NOT yet valid
                 └──────┬──────┘
                        │ (2) PUBLISH — compare-and-swap on generation
                        │     succeeds only after the endpoint is proven bound
                        ▼
                 ┌─────────────┐
                 │   ACTIVE    │◀──┐
                 └──┬───┬───┬──┘   │ (3) ROTATE: mint gen n+1, both valid
                    │   │   └──────┘ for an overlap window, then retire n
                    │   │
       (4) REVOKE   │   │  (5) SHUTDOWN — graceful, generation-bound
                    ▼   ▼
                 ┌─────────────┐
                 │   RETIRED   │  tombstoned, then erased
                 └─────────────┘
                        ▲
                        │ (6) CRASH RETIREMENT — no live process required
                        │     expiry lapse | liveness disproof | next-start sweep
```

**(1) Create.** Mints into `RESERVED`. A `RESERVED` credential is never
accepted by any verifier and never published. This phase is what §4.1 lacks:
today, minting *is* publication.

**(2) Publish.** Only permitted once the endpoint is **proven** — for the HTTP
surface, after `listen` has emitted `'listening'`, not merely been called.
Publication is a compare-and-swap against the stored generation; a stale or
unproven generation is rejected, not overwritten. Row 13 already implements
exactly this with `link(2)` (`src/connectors/bot-daemon.ts:190-193`); the
service generalizes that proven mechanism rather than inventing one.

**(3) Rotate.** Mint generation *n+1* into `RESERVED`, publish it, accept both
*n* and *n+1* for a bounded overlap, then retire *n*. This is what makes
rotation possible without dropping live SSE and PTY connections (§4.7).

**(4) Revoke.** Immediate, single-credential, generation-precise. Distinct from
retire: revoke is a deliberate act with a recorded reason and survives as a
tombstone so a replayed credential is rejected rather than merely unknown.

**(5) Shutdown retirement.** Generation-bound removal, mirroring
`clearBotPid`'s compare-then-remove (`src/connectors/bot-daemon.ts:406-429`) so
a late-exiting older daemon can never erase a newer one's credentials — the
exact race that comment already anticipates.

**(6) Crash retirement.** §6, in full.

### 5.4 Atomicity contract — one mechanism, the best one already in the repo

Every write in §3 adopts the row-13 discipline verbatim
(`src/connectors/bot-daemon.ts:174-206`), because it is already written, already
tested, and already the strongest:

1. stage with `O_EXCL | O_NOFOLLOW` at a **pid- and random-suffixed** path
   (fixes §4.5's collision defect for rows 5, 9, 14, 15);
2. `fsync` the file, then `fsync` the parent directory (fixes the torn-write
   window on all non-row-13 mechanisms);
3. publish by `link(2)` for create-once semantics, `rename` for replace;
4. mode `0600`, directories `0700`, with the win32 ACL path applied uniformly
   (fixes §4.5's umask defect for rows 14-15);
5. reject symlinks, hardlinked files (`nlink !== 1`), and oversize records —
   the validation `readBotPidRaw` already performs
   (`src/connectors/bot-daemon.ts:140-152`);
6. every read is schema-validated and version-checked; malformed input is
   `null`, never a partial object — the discipline
   `readServeDaemonMeta` already applies (`src/api/serve-daemon-meta.ts:97-104`).

Nothing here is novel. The whole atomicity contract is "apply the bot pid
record's proven mechanism to the other fifteen rows".

### 5.5 Least privilege

- **Secrets are never carried by a discovery descriptor.** `serve-daemon.json`
  stops embedding `apiToken`/`terminalToken`. It carries a *reference*; the
  holder redeems it against the live daemon, which can refuse. This alone
  removes the §4.3 confidentiality residue from the crash path.
- **Distinct credentials keep distinct scopes.** The API↔terminal exchange of
  §4.6 becomes an explicit scope grant with its own expiry, preserving the
  deliberate independence at `src/api/terminal/auth-provider.ts:44-51`.
- **Delivery channels are typed and ranked.** `header` > `body` > `query`. The
  query channel stays available for `EventSource` (its constraint is real) but
  mints a **short-expiry, single-endpoint, read-only** credential rather than
  handing over the full-authority token that `src/api/middleware/token.ts:62-76`
  passes today.
- **Fingerprints, never values, in logs.** `tokenFingerprint`
  (`src/api/server.ts:1918`) is already correct and becomes mandatory
  service-wide.

### 5.6 Cross-platform matrix (Immutable Law 2 — designed up front)

| Concern | macOS | Linux | Windows native | WSL | Container |
|---|---|---|---|---|---|
| Generation token | `pid-ownership` (unread, §1.2) | same | **must be proven, not assumed** (§8 D6) | Linux semantics on a Windows FS | pid namespace — pid 1 collisions are the norm |
| File mode | `chmod 0600` | `chmod 0600` | `icacls` (`src/api/server.ts:1950-1975`) | `chmod` on `drvfs` is unreliable | `chmod 0600` |
| Directory fsync | supported | supported | **not supported** — needs an adapter | supported on `ext4`, not `drvfs` | supported |
| `link(2)` no-clobber | yes | yes | needs `CreateHardLink` equivalent | filesystem-dependent | yes |
| Crash detection | liveness + expiry | same | same | **host↔guest pid namespaces differ** | orchestrator eviction, no signal |

Two rules follow, per Law 2's "fail honestly, never silently":

- Where a platform cannot provide a generation proof, the service returns
  fail-closed `ownership-unknown` — the state
  `src/connectors/bot-daemon.ts:57,286-289` already defines and already refuses
  to launch on. It never degrades to "assume it's ours".
- Where a platform cannot provide durable atomicity, that is a typed capability
  gap reported at startup, not an unannounced weaker guarantee.

### 5.7 Multi-tenant and million-scale

- Storage is keyed by `(project, tenant, endpoint, generation)`; nothing is
  global. The per-project choice already made for the descriptor
  (`src/api/serve-daemon-meta.ts:13-15`) is the right instinct and is extended
  to every row.
- The file-backed store is one **adapter**. The same contract admits a
  keychain, an external secret manager, or a workload-identity issuer — which
  is how `enterprise custody` (§1.3, empty across both populations) finally
  becomes reachable, satisfying the taxonomy's own §4 D5.
- Sweeps are bounded per project and never scan a shared global namespace.

### 5.8 What the service deliberately does NOT do

- It does not touch **provider** credentials. That population is the taxonomy's,
  and merging the two would contradict §1.3.
- It does not replace `LocalTokenAuthProvider` / `OidcAuthProvider` /
  `JwksAuthProvider` (`src/api/terminal/auth-provider.ts`). Verification stays
  where it is; only lifecycle moves.
- It does not alter the `DECKENT_API_AUTH_DISABLED` semantics, in either
  direction (§4.6).
- It does not introduce a daemon or background process. Crash retirement is
  designed to work with no live deckent process anywhere (§6).

---

## 6. Crash retirement, in full

The row's explicitly protected case. Three independent mechanisms, layered so
that **no single one has to be reliable**.

### 6.1 Layer 1 — expiry (works with zero processes alive)

Every credential carries an absolute `expiry` (§5.2). A credential whose expiry
has lapsed is invalid regardless of what any file says and regardless of whether
any cleanup ever runs. This is the only layer that survives host power loss,
container eviction, and disk-image capture, and it is why `expiry` is
non-optional.

Consequence for §4.2: a leaked `api-token` file stops being a live credential on
its own schedule. The daemon renews it while healthy; a dead daemon renews
nothing.

### 6.2 Layer 2 — liveness disproof at read

Every reader verifies the generation before trusting a credential: the pid and
`startToken` must still identify a live process, exactly as the descriptor's
documented step 2 already requires (`src/api/serve-daemon-meta.ts:6-8`).

Ambiguous evidence yields **`ownership-unknown`, never "probably fine"** — the
fail-closed posture `src/connectors/bot-daemon.ts:294-297,343-355` already
implements. Extending this to rows 5 and 9 is what would have contained §4.1:
a token file whose generation names a dead process is self-evidently stale.

### 6.3 Layer 3 — sweep at next start

On start, before minting, the service sweeps its own project+tenant namespace:
every credential whose generation is disproved or whose expiry has lapsed is
retired with compare-then-remove semantics. Bounded to that namespace (§5.7);
never a global scan.

This is the layer that reclaims disk and tombstones, and the only one that may
be skipped without a **security** consequence — because layers 1 and 2 have
already made the residue inert.

### 6.4 Coverage against the four crash classes of §4.3

| Crash class | L1 expiry | L2 liveness | L3 sweep | Residual risk |
|---|---|---|---|---|
| `SIGTERM`/`SIGINT` | n/a — graceful path retires | n/a | n/a | none |
| `SIGKILL` / OOM / evict | credential lapses | dead pid detected at first read | erased at next start | window = expiry TTL |
| Unhandled `'error'` (§4.1) | lapses | **publication never happened** (§5.3 phase 2) | erased | **none — prevented, not mitigated** |
| Power loss / kernel panic | lapses | dead pid detected | erased | window = expiry TTL; torn writes rejected by §5.4 rule 6 |

The §4.1 row is the one to read carefully: it is closed at **prevention**, by
the `RESERVED`→`PUBLISH` split, not by cleanup afterwards. The other rows are
bounded by the expiry TTL, which is an owner-tunable number (§8 D3) rather than
"indefinitely" — today's answer for every row in the table.

---

## 7. Admission-sized work packages

Each package is independently admissible, independently provable, and ordered so
that no package depends on a later one. **None of them is implemented by this
task.** Per the project's production-wiring-closure rule, every package's proof
obligation names a producer→consumer→entrypoint chain, not a unit test alone.

### P1 — Identity + state machine, no I/O

`src/core/` module defining `CredentialIdentity`, `Generation`, the six-phase
state machine, and the legal transitions. Pure types and pure functions.

**Proof:** exhaustive transition tests, including every illegal transition;
`RESERVED` provably unusable by any verifier. Import budget stays within
§5.1's leaf constraint — verified with `tsc --explainFiles`, the same technique
that diagnosed sprint-392.

### P2 — Inventory freeze + delivery-guard proof

Encode the §3 table as an executable inventory, and resolve the §4.6 open item:
prove by test whether the terminal-token HTML injection
(`src/api/server.ts:2517-2530`) can be reached on a non-loopback bind through
**any** entry point, not only through `serve.ts`'s guard.

**Proof:** a test that boots the server bound to a non-loopback address and
asserts the served HTML carries no terminal token. If it fails, P2 becomes a
security fix and is re-admitted ahead of P3.

### P3 — Atomic store adapter

The §5.4 contract as a single implementation, with the platform adapters of
§5.6. Includes the pid/random staging suffix and explicit modes that rows 5, 9,
14, and 15 currently lack.

**Proof:** concurrent-writer test showing no interleaving; crash-injection test
(kill between stage and publish) showing no torn record is ever read; a
capability-report assertion on each platform tier; `nlink`/symlink rejection
tests ported from `src/connectors/bot-daemon.ts:140-152`.

### P4 — Migrate the serve-daemon descriptor

`serve-daemon.json` moves to the service and **stops carrying token values**
(§5.5). Publication moves behind `'listening'` (§5.3 phase 2).

**Proof:** the §4.1 sequence becomes a regression test — start a daemon, start a
second on the same port, assert the incumbent's credentials are untouched, the
incumbent still answers `/health`, and the loser publishes nothing. Real-binary
run, not mock-only, per the Tier-1 proof-of-function rule (`serve.ts` is a
user surface). A `server.on('error')` handler lands here.

### P5 — Migrate the API and terminal tokens

Rows 1-11 move to the service: endpoint-keyed storage, mandatory expiry, the
scoped short-lived query credential of §5.5, and shutdown retirement — closing
§4.2.

**Proof:** run-verified restart shows generation increment, not silent
overwrite; a `SIGKILL`ed daemon's token is provably rejected by the next daemon;
two daemons on distinct ports in one project provably do not collide.

### P6 — Migrate the bot pid record and gateway state

Row 13 adopts the shared identity while **keeping every guarantee it already
has** — it is the reference implementation, so this package must not weaken it.
Rows 14-16 gain explicit modes, expiry on pairing codes, and an attempt limit.

**Proof:** the existing bot-daemon test suite passes unchanged; a new test shows
a pairing code expiring; `pairings.json` and `allowlist.json` are asserted
`0600` under a `022` umask.

### P7 — Rotation and revocation surface

Rotation without dropping live SSE/PTY connections (§5.3 phase 3), plus
CLI/API revocation.

**Proof:** an SSE client and a PTY session stay connected across a rotation; a
revoked credential is rejected within a bounded interval; the tombstone survives
a restart.

---

## 8. Owner decision points

1. **D1 — Confirm the negative.** §4.2 claims no retirement exists for rows 5
   and 9 *within this task's read scope*. `src/core/` and `src/monitor/` were
   not readable here. Confirm before P5 is admitted. (Mirrors the taxonomy's
   §4 D1, whose `src/cli/` half this task partially answered — §1.3.)
2. **D2 — Descriptor payload.** §5.5 proposes `serve-daemon.json` stop carrying
   live tokens and carry a redeemable reference instead. This changes the
   contract for the desktop shell, which was outside read scope. Owner must
   confirm the consumer can be migrated, and in which order.
3. **D3 — Expiry defaults.** Concrete TTLs per credential kind. Shorter TTLs
   shrink every §6.4 residual-risk window and increase renewal traffic. Proposed
   starting points requiring a decision: API token 24h with renewal-while-alive,
   terminal token 1h, query-channel credential 60s, pairing code 15m.
4. **D4 — Rotation overlap window.** How long generation *n* stays valid after
   *n+1* publishes. Too short breaks live connections; too long widens the
   compromise window.
5. **D5 — Principal taxonomy.** Enumerate `PrincipalId` values (operator,
   desktop shell, dashboard, bot listener, CI job, MCP client). This is the
   component of §5.2's tuple that cannot be derived from existing code — nothing
   in §3 records a principal today.
6. **D6 — Windows and container generation proof.** `processStartToken`'s
   coverage on native Windows and inside pid namespaces was not verifiable in
   scope (§1.2, §5.6). If unavailable, confirm that fail-closed
   `ownership-unknown` — which today blocks the bot daemon from launching at all
   (`src/connectors/bot-daemon.ts:286-289`) — is the accepted behaviour for the
   serve daemon too, or specify the alternative proof.
7. **D7 — `enterprise custody` adapter.** §5.7 makes the class reachable for the
   first time across both populations. Decide which backends qualify — this is
   the runtime-credential half of the taxonomy's §4 D5 and should be answered
   once, for both.
8. **D8 — Package order.** P2's outcome may promote a security fix ahead of P3.
   Confirm the escalation path before P2 runs.

---

## 9. Non-actions

This document proposes only. It made no production or configuration change; the
sole file it wrote is itself.

It does not claim any credential is safe where the code shows otherwise, does
not assert the absence of code it could not read (§1.2), does not reclassify any
row the task-520-001 taxonomy already classified (§1.3), and does not collapse
crash retirement into graceful shutdown at any point — §4.3 and §6 keep it a
first-class phase with its own four-class coverage table, because that is the
case row 4131 exists to protect.
