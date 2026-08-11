# Runtime-visible credential exposure taxonomy

**Date:** 2026-08-11
**MASTER row:** 2030 (rerun of task 519-001, which correctly HOLD'ed on an
under-scoped read view — see `git log` for that artifact)
**Status:** `COMPLETE` — every provider credential path the code actually uses is
classified below with file-level evidence, an exposure window, and a revocation
story. No production or configuration file was touched to produce this document.

## Required verdict (row 2030)

**The current Docker Codex authentication handling is NOT zero-exposure.** For
the default `auth_mode: subscription` path (the default whenever a task does not
explicitly declare `Auth: api` — `src/orchestra/spawn-backend-docker.ts:5247`,
`:5606-5607`), a Docker-spawned Codex task copies `~/.codex/auth.json` through
**two** additional storage locations beyond the user's own host file before the
provider CLI ever runs, and writes a third copy back afterward:

1. A **host-side persistent copy** (a broker file under the OS temp directory,
   `chmod 600`, retained indefinitely and only refreshed by mtime comparison).
2. A **container-side tmpfs copy** (the actual working copy the `codex` CLI
   reads from during execution).
3. A **write-back into copy #1** after the container exits, carrying any
   refreshed/rotated token forward to the next task.

None of these three copies is `host-only`, and #1 is not cleaned up by any code
path found in this task's scope (see §3.2). This matches — and now gives file
evidence for — the row-2030 premise: "a copy is exposure by definition."

---

## 1. Scope and method

Evidence was gathered by reading, inside this task's authorized scope:

- `src/orchestra/spawn-backend-docker.ts` (Docker backend — the only backend
  that copies OAuth/subscription credential files at all)
- `src/orchestra/spawn-backend-subprocess.ts` (log-capture only; no credential
  logic — see §3.4)
- `src/providers/cross-provider-keys.ts`, `subprocess.ts`, `codex.ts`,
  `openrouter.ts`, `bedrock.ts`, `ollama.ts`, `openai-compatible.ts`
- `src/core/provider.ts`, `deck-file.ts`, `deck-broker.ts`, `credentials.ts`,
  `credential-encryption.ts`, `credentials-per-project.ts`,
  `provider-command-spec.ts`
- Corroborating test file names in `tests/orchestra/` and `tests/core/`
  (`docker-provider-auth.test.ts`, `deck-worker-isolation.test.ts`,
  `f1014-auth-isolation.test.ts`, `subprocess-auth-noleak.test.ts`,
  `deck-broker*.test.ts`, `credentials*.test.ts`) — file names only, used to
  corroborate that the mechanisms below are the ones under active test, not
  re-derived from them.

Every row in §2 cites an exact file and line range. Where a mechanism exists in
the codebase but is not on the path any current spawn backend actually calls,
that is stated explicitly (§3.5) rather than folded into the "actually used"
table, per this task's instruction to classify what the code **actually uses**.

## 2. Classification table

Five classes, as required: **host-only**, **env**, **tmpfs-copy**,
**persistent-copy**, **enterprise custody**.

| # | Credential | Provider(s) | Backend | Class | Exposure window | Revocation story | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | OAuth/session file (`.credentials.json`, `auth.json`, `gemini-credentials.json` + `google_accounts.json`) | claude / codex / gemini | **Docker**, subscription mode (default) — **origin** | host-only | Indefinite — the user's own CLI-managed file under `~/.claude`, `~/.codex`, `~/.gemini` | Provider-side: log out / revoke session via the provider's own account UI. Deckent does not touch this file's lifecycle. | `src/core/provider-command-spec.ts:114,133,149` (oauthHomeDir map); `spawn-backend-docker.ts:482-488` (`PROVIDER_AUTH_FILES`) |
| 2 | Same file | claude / codex / gemini | **Docker**, subscription mode | **persistent-copy** | Created on first Docker spawn for the (project, provider) pair; refreshed only when the host file's mtime is newer; **never deleted by any code path found in scope** (no matching `rmSync`/`unlinkSync`/TTL sweep for `deckent-provider-auth` — see §3.2). Survives across every sprint/task run. | None found. No expiry, no cleanup call site, no rotation-triggered purge in scope. Manual deletion of the OS temp dir is the only observed removal path. | `spawn-backend-docker.ts:1740-1773` (`prepareProviderAuthBroker`) — writes to `join(tmpdir(), 'deckent-provider-auth', projectKeyHash, provider, safeFileName)`, `mkdirSync(..., {mode: 0o700})`, `writeFileSync(..., {mode: 0o600})` |
| 3 | Same file | claude / codex / gemini | **Docker**, subscription mode | tmpfs-copy | From container start (`cp` in the bootstrap script) until container exit/removal — bounded by the single task's Docker run | Implicit: destroyed when the container's tmpfs `$HOME` is torn down at container exit. No explicit shred/zero step; relies entirely on tmpfs teardown. | `spawn-backend-docker.ts:1672-1699` (`buildProviderAuthIsolation`, `cp "${source}" "${destination}"` into `$HOME/<oauthHomeDir>/<file>`); `:5841-5842` (`--tmpfs ${containerHome}:size=...`) confirms `$HOME` is RAM-backed tmpfs, not container disk |
| 4 | Same file, refreshed/rotated token | claude / codex / gemini | **Docker**, subscription mode | persistent-copy (write-back into #2) | At container exit (both the normal-completion path and the `TERM`-trap path) if the in-container copy is non-empty | Feeds back into row 2's un-cleaned broker file — same no-revocation gap | `spawn-backend-docker.ts:1693-1698` (`writebackLines`, `sync_provider_auth`); called at `:5761` (TERM trap) and `:5784` (normal exit) |
| 5 | Gemini's `security.auth.selectedType` (trimmed `settings.json`) | gemini | **Docker**, subscription mode | tmpfs-copy | Container lifetime only — written directly into container tmpfs `$HOME/.gemini/settings.json`, never mounted from a host broker copy | Same as row 3 — tmpfs teardown at container exit | `spawn-backend-docker.ts:1614-1635` (`buildGeminiAuthSelectionBootstrap`) |
| 6 | OAuth/session file | claude / codex / gemini | **subprocess** (native host process), subscription mode | host-only | Indefinite — the worker CLI runs as a plain host child process inside the user's own `$HOME`/project dir and reads the host credential file directly; deckent performs **no copy step** for this backend | Same as row 1 — provider-side revocation only | No credential-copy logic exists in `spawn-backend-subprocess.ts` (146 lines, log-capture only) or in `providers/subprocess.ts`'s `spawn()` (no `oauthHomeDir`/`PROVIDER_AUTH_FILES`-equivalent reference in that file); the worker process inherits the real `HOME`, unlike the Docker backend's synthetic `/tmp/deckent-home` |
| 7 | API key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / `DASHSCOPE_API_KEY` / `ZHIPU_API_KEY`) | claude / codex / gemini / deepseek / qwen / zhipu | **Docker**, `Auth: api` mode | env | Container process lifetime — passed via `docker run -e KEY=value`; visible to `docker inspect`/`docker top`/any host process that can read `/proc/<pid>/environ` of the `docker run` process or the container's own PID 1 for that window | None automated. Host-side rotation = edit `.deck` or host env and respawn; no in-flight revocation. | `spawn-backend-docker.ts:5938-5949` (per-provider allowlisted `-e` forwarding, gated `useApiOnly`) |
| 8 | Same API key | same | **subprocess**, `Auth: api` / legacy `.deck` mode | env | Child process lifetime; same `/proc/<pid>/environ` exposure class as row 7, scoped to the host instead of a container | Same as row 7 | `src/providers/subprocess.ts:340` (`scrubCrossProviderEnv(process.env, ...)`) + `:377-392` (DeckBroker branch vs. legacy `opts.env` reinjection) |
| 9 | Same API key, as loaded from `.deck` | same | **parent (Brain) process** | env | For the lifetime of the Brain process, **or indefinitely if `config.auth_mode !== 'subscription'`** — `applyDeckSecretsToEnv` writes the key straight into `process.env` of the long-lived orchestrator process itself, by design (each adapter's own `isAvailable()` reads it back out) | Restart of the Brain process, or manual `.deck` edit + reload; no explicit un-set/expiry | `src/core/provider.ts:1053-1123` (`applyDeckSecretsToEnv`), doc comment at `:1036-1046` names this as "the actual cross-provider leak SITE" by design, mitigated only by downstream scrubbing, not by avoiding the write |
| 10 | `.deck` file itself (plaintext `KEY=VALUE`, all configured secrets, not just the one a given worker needs) | all API-key providers | **Docker** | host-only, deliberately shadowed from the worker | Host-permanent (the user's own project file); the Docker worker is prevented from reading it | `src/core/deck-file.ts:94-100` (`loadDeckSecrets`, plaintext, no encryption); `spawn-backend-docker.ts:3304-3336` (`buildDeckShadowMountArgs` — 0-byte read-only overlay hides `/workspace/.deck` from the container; conditional on the host file existing, to avoid phantom-file creation) |
| 11 | `.deck` file itself | all API-key providers | **subprocess** | host-only, **not shadowed** | Host-permanent; the worker process runs inside the real project root, so `.deck` is disk-readable to it exactly as it is to any other process in that directory | `spawn-backend-docker.ts:3327-3331` — explicit doc comment: "the subprocess backend runs the worker as a host process inside the project root, so `.deck` stays disk-readable there (mitigated by env-scrubbing, not mount-isolation) until the host-side credential broker lands" |
| 12 | Per-task API key via `DeckBroker` (audited, TTL'd, single-use mint) | claude / codex / gemini / config-driven openai-compatible | **subprocess**, opt-in only | env (broker-mediated) | One resolve per `taskId`, denied after TTL (`ttlMs`, default 5 min from broker construction) or after first consumption; the `.deck` file path itself never reaches the worker or the audit trail | Automatic: TTL expiry and single-use consumption are enforced in-process; every grant/denial is appended to an in-memory log and, if configured, a durable `CredentialDecisionAuditSink` | `src/core/deck-broker.ts` (whole file, esp. `:136,179-216`); wiring point `src/providers/subprocess.ts:377-392`; **default-off** — `src/core/provider.ts:1404-1413`: `config.deck_broker?.enabled && config.auth_mode !== 'subscription'` — absent that flag, row 8/9's legacy plain-env path is what actually runs |
| 13 | AWS `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | bedrock | N/A — no CLI spawn; direct in-process HTTPS SigV4 calls from the Brain/adapter process | env | Lifetime of the calling process; used to compute a SigV4 signature and never written to any deckent-managed file | `src/providers/bedrock.ts:257-259,335-341` — read straight from `process.env`, no adapter-level copy, no CLI subprocess (SigV4 request signing happens in-process, `bedrock.ts:114-171`) |
| 14 | OpenRouter API key | openrouter | its own spawned Node worker child process | env | Child process lifetime; resolved fresh from `.deck` on every call, **never written to `process.env` of the parent** — the one provider deliberately excluded from `BASE_PROVIDER_CREDENTIAL_ENV`'s scrub set because it has no leak site to scrub | `src/providers/openrouter.ts:6,65,236,455-492` (`resolveApiKey()` host-side, injected only into `spawnOpts.env` via `buildProviderChildEnv`); confirmed exclusion reasoning at `spawn-backend-docker.ts:5608-5617` |
| 15 | Ollama | ollama | local, no credential | host-only (N/A — no secret) | N/A | N/A | `spawn-backend-docker.ts:5926-5927` — "ollama is host-only: `getProviderCommandSpec` returns null and the spawn honest-fails above before reaching here, so it never receives any key" |

## 3. Notes, gaps, and things this document deliberately does NOT claim

### 3.1 The Docker Codex auth copy — full lifecycle, stated plainly

For a Docker-spawned `codex` task in the default subscription mode:

```
~/.codex/auth.json  (host-only, user-owned)
        │  read + write, mtime-gated  (prepareProviderAuthBroker)
        ▼
$TMPDIR/deckent-provider-auth/<projectHash>/codex/auth.json   (persistent-copy, 0600)
        │  bind-mount --mount type=bind (read-write)
        ▼
/run/deckent-auth-codex-auth.json   (container bind-mount target)
        │  `cp` in container bootstrap script
        ▼
/tmp/deckent-home/.codex/auth.json   (tmpfs-copy, RAM-backed, container-local)
        │  codex CLI reads this during the task
        │  ... task runs ...
        │  writeback `cp` on exit (if non-empty)
        ▼
back into $TMPDIR/deckent-provider-auth/.../auth.json  (persistent-copy, refreshed)
```

The persistent-copy step (host `$TMPDIR`) is the one that makes the "not
zero-exposure" verdict concrete and durable rather than merely
transient-during-execution: it survives after the container is gone, is not
observed to be deleted by any code in this task's scope, and is protected only
by Unix file permissions (`0600`/`0700`) — not by encryption, not by an OS
keychain, not by a TTL.

### 3.2 No cleanup call site found for the host-side broker

A scoped search of `spawn-backend-docker.ts` for deletion (`rmSync`,
`unlinkSync`, `rm -rf`) of `deckent-provider-auth` or `brokerDir` found none.
`prepareProviderAuthBroker` (`:1740-1773`) only ever creates or refreshes files
under that directory; nothing in this task's read scope removes them. This is
reported as an evidence gap, not asserted as "no cleanup exists anywhere in the
codebase" — a cleanup routine could live in a module outside this task's scope
(e.g. a CLI `deckent cleanup` command under `src/cli/`, which was not
authorized for reading here). If such a routine exists, it is not visible from
the spawn path and should be named explicitly by an owner, not assumed.

### 3.3 Host `$TMPDIR` tmpfs-or-not is genuinely host-dependent

`prepareProviderAuthBroker` uses Node's `os.tmpdir()`, which resolves to `/tmp`
on most Linux/macOS hosts. Whether `/tmp` itself is tmpfs-backed (RAM) or a
regular disk-backed filesystem varies by host OS/distro/container runtime and
is not something the code controls or checks. This document classifies the
broker copy as **persistent-copy** rather than **tmpfs-copy** because the code
treats it as durable regardless of the underlying mount (it deliberately
persists across runs via mtime comparison, unlike the container's `$HOME`,
which is an explicit `--tmpfs` mount with a declared size). An owner tightening
this should not rely on "well, `/tmp` might be tmpfs on my machine" as a
mitigation — the code's own intent is persistence, not ephemerality.

### 3.4 Subprocess backend: no copy step exists, which is a smaller surface but not zero

The subprocess backend does not synthesize a private `$HOME` (unlike Docker's
`/tmp/deckent-home`) and does not copy any OAuth file — the worker CLI process
inherits the real host `$HOME` and reads `~/.claude`, `~/.codex`, `~/.gemini`
directly, exactly as an interactive terminal session of that CLI would. This is
architecturally simpler (one fewer copy) but is still worth stating precisely:
it means every subprocess-mode task's worker process has the SAME filesystem
visibility as the operator's own shell, including `.deck` (§ row 11) — isolated
only by an env-scrub, not by mount or filesystem boundary. `deck-broker.ts`
exists specifically to close this gap for the API-key case but is **not wired
by default** (§ row 12; `config.deck_broker.enabled` is unset by default per
`core/provider.ts:1404-1413`), and no equivalent broker exists in scope for the
OAuth/subscription-file case on the subprocess backend at all.

### 3.5 Mechanisms present in the codebase but NOT on the current credential path

Two encrypted-at-rest credential stores exist under `src/core/` and are fully
implemented, tested, and documented, but a scoped import search
(`grep -rl` across `src/providers`, `src/orchestra`, `src/core`) found **no
call site outside their own module and each other** that wires them into the
actual provider-spawn credential flow (`bootstrapProviders`, `applyDeckSecretsToEnv`,
`DeckBroker`, or either spawn backend all resolve credentials via `loadDeckSecrets`
reading the plaintext `.deck` file or the host OAuth files directly — never via
these stores):

- `src/core/credentials.ts` (`CredentialManager`) — AES-256-GCM encrypted
  per-provider files at `~/.deckent/credentials/<provider>.json`, master key
  from `DECKENT_MASTER_KEY` env or an auto-generated `~/.deckent/.keyring`
  file (`src/core/credential-encryption.ts:24-25`).
- `src/core/credentials-per-project.ts` — a project-scoped variant
  (`.deckent/credentials.enc`), key derived via HKDF from the same machine
  master key salted with the canonical project root.

These are reported here because the task requires classifying "every provider
credential path the code actually uses," and it would be dishonest by omission
to leave an encrypted-storage capability unmentioned — but per that same
instruction, they are **not** given an exposure-window/revocation row in §2,
because no evidence in scope shows them actually receiving or serving a live
provider credential during a spawn. If an owner intends these to be the future
**enterprise custody** tier (§4, decision 5), that is a design decision, not a
currently-active runtime path — this document does not classify unused code as
if it were load-bearing.

### 3.6 No `enterprise custody` class is currently active for any provider

None of the 15 classified rows above land in the fifth requested class,
**enterprise custody** (an external secret manager, workload-identity system,
OS keychain, or air-gapped equivalent). The closest candidate is the dormant
`CredentialManager`/per-project store in §3.5, which is host-local
AES-256-GCM, not an external custody boundary, and is not wired in regardless.
This is reported as a gap, not filled with an invented classification.

## 4. Owner decision points

1. **Broker cleanup.** Decide a retention/TTL policy for
   `$TMPDIR/deckent-provider-auth/<project>/<provider>/*` (persistent-copy,
   §3.1–3.2) — e.g., delete on sprint completion, delete after N days of
   inactivity, or delete on provider logout. No cleanup currently exists in
   this task's scope; confirm whether one exists elsewhere (`src/cli/`) before
   assuming a gap.
2. **Encrypt the broker copy at rest.** Currently `chmod 600` plaintext. Decide
   whether to route it through the existing (but currently unwired)
   `credential-encryption.ts` primitives, or an OS keychain, instead of a bare
   file.
3. **Subprocess-backend OAuth isolation.** Decide whether the subprocess
   backend should gain an equivalent of `DeckBroker` for OAuth/subscription
   files (not just API keys), given it currently has zero isolation for that
   credential class (§3.4).
4. **`deck_broker.enabled` default.** Decide whether the audited, TTL'd,
   single-use `DeckBroker` (§2 row 12) should become the default for API-key
   mode instead of opt-in, closing the legacy plain-`process.env` path (§2 rows
   8–9).
5. **Define `enterprise custody`.** No current mechanism qualifies (§3.6).
   Decide which external secret managers, workload-identity systems, OS
   keychains, or air-gapped equivalents should qualify, across macOS, Linux,
   native Windows, WSL, and containers, and whether the dormant
   `CredentialManager`/per-project store (§3.5) is the intended foundation or
   should be replaced.
6. **Negative verification.** Require proof that the tmpfs-copy (§2 rows 3, 5)
   and the persistent-copy (§2 rows 2, 4) do not survive container crash,
   sprint cancellation, or host restart, before accepting any tightened design
   as complete — this task found no such verification evidence in scope.

## 5. Non-actions

This document proposes no production or configuration change. It does not
claim zero-exposure anywhere the code shows a copy, and it does not invent an
`enterprise custody` classification where none exists. Every class above is
grounded in a cited file and line range from this task's authorized read
scope.
