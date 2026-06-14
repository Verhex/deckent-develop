# Deckent Security Threat Model

> **Version:** 1.0.0-beta.1  
> **Last updated:** 2026-06-14  
> **Status:** V1.0 — code-grounded, advisory enforcement; V2 hard enforcement roadmap
>
> **Honesty principle:** This document distinguishes three posture levels:
> - **Implemented** — enforced in code, verified against source
> - **Advisory** — detected and logged but not hard-blocked (ADR-037 V1.0)
> - **Post-beta** — planned, not yet shipped

---

## 1. Assets and Trust Boundaries

| Asset | Location | Sensitivity | Current Protection |
|-------|----------|-------------|-------------------|
| Provider API keys (Claude, Codex, Gemini) | `.deck` file (project root) | Critical | Plaintext at rest, gitignored, per-provider env injection |
| `memory.db` (sprint knowledge, ADRs) | `.brain/memory.db` | Medium | Gitignored, local filesystem only |
| API auth token | `config.api_auth_token` or `DECKENT_API_TOKEN` env | High | Timing-safe SHA-256 comparison |
| Worker spawn processes (docker/tmux/subprocess) | OS process table | High | Scope declarations + advisory RBAC |
| MCP server/client channel | stdio (local) | Medium | Stdio-only transport; no network |
| Dashboard / REST API | `localhost:PORT` by default | Medium | Bearer token auth; localhost-auto opt-in |
| Terminal PTY audit log | SQLite (`.deckent/`) | High | HMAC-SHA256 append-only chain |
| Autonomous backlog (nervous system) | `.deckent/autonomous/` | Medium | Same filesystem ACLs as project root |
| `.deck` secret file | project root | Critical | Gitignored; plaintext on disk; no encryption at rest |

### Trust Boundaries

```
[ User / DIRECTIVES author ]
        |  (trusted — single-user design V1.0)
        v
[ Brain (sprint-controller) ]
   |                    |
   v                    v
[ Worker processes ]  [ Auditor (in-process scan) ]
   |                    |
   v                    v
[ Provider APIs ]   [ Audit log / event stream ]
(Claude/Codex/Gemini — trusted third-party)
```

**Key boundary:** Workers are spawned as subprocesses or in Docker/tmux. Brain passes them tasks and secrets — workers are not trusted to enforce their own scope boundaries. The Auditor monitors boundary compliance after the fact (advisory, V1.0).

---

## 2. Threat Actors

| Actor | Motivation | Capability |
|-------|-----------|------------|
| **Malicious DIRECTIVES** | Inject harmful task into sprint | Can control task description + scope declarations; cannot directly write files |
| **Rogue worker / model hallucination** | Write outside scope, exfiltrate secrets | Can write any file the OS user owns; only advisory RBAC blocks it |
| **Local attacker (same machine)** | Steal `.deck` credentials; read `memory.db` | Requires OS user compromise or running as same user |
| **Supply-chain attacker** | Inject malicious skill/plugin | Constrained by AST sandbox validation; can still exfiltrate via API calls |
| **MCP client attacker** | Trigger destructive operations | Limited to stdio pipe; same OS user access required |

---

## 3. Threats and Mitigations

### 3a. API Authentication (HTTP/Dashboard)

**Threat:** Unauthorized access to the deckent REST API or dashboard.

**Code:** `src/api/auth.ts`

**Implemented mitigations:**
- **Timing-safe token comparison** — uses `timingSafeEqual(SHA-256(actual), SHA-256(expected))` from `node:crypto`. Both tokens are SHA-256 hashed before comparison to prevent length-based timing side-channels.
- **Default deny** — when no token is configured, all non-exempt requests return 401. No open-by-default mode.
- **Localhost auto-inject (opt-in only)** — `allowLocalhostAutoInject` (config) or `DECKENT_API_LOCALHOST_AUTO=1` (env) allows loopback callers without an `Authorization` header to pass through. A localhost request that *does* present an Authorization header is still verified — a wrong token from localhost earns a 403. This is an opt-in convenience, not the default.
- **Explicit auth bypass warning** — `DECKENT_API_AUTH_DISABLED=1` disables all auth with a stderr warning. Intended for development only; the code explicitly prints: `WARNING: API authentication is DISABLED ... do NOT use in production`.

**Residual risk:** If `DECKENT_API_AUTH_DISABLED=1` is set in a shared environment, any local process can reach the API without a token.

---

### 3b. Provider Credentials (`.deck` secrets)

**Threat:** API keys for Claude, Codex, or Gemini are exposed via logs, git history, or error output.

**Code:** `src/core/deck-file.ts`, `src/core/provider.ts:applyDeckSecretsToEnv()`

**Implemented mitigations:**
- **Per-provider isolation** — `applyDeckSecretsToEnv()` returns a map of `ProviderName → { ENV_VAR: value }`. Only the provider-specific key is passed to each worker's environment. A Claude worker does not receive the Codex or Gemini key.
- **Gitignore enforcement** — `.deck` is added to `.gitignore` by `deckent init`. `isDeckFileCommitted()` detects accidental git tracking. `deckent doctor` flags `.deck` tracked by git as a security issue.
- **No serialization to task files** — secrets are never written to task JSON, DIRECTIVES, or log files.

**Known limitations:**
- **Plaintext at rest** — `.deck` is stored as a plaintext `KEY=VALUE` file. No encryption at rest. OS file permissions are the only protection.
- **`process.env` injection** — `applyDeckSecretsToEnv()` writes keys into `process.env`. On multi-user Linux, other processes running as the same OS user can read `/proc/PID/environ`. Deckent is single-user V1.0; this is acceptable in that context but not on shared servers.
- **No secret vault** — no HashiCorp Vault, AWS Secrets Manager, or equivalent integration (post-beta roadmap).

---

### 3c. Worker Scope Enforcement (RBAC)

**Threat:** A worker writes outside its declared `scope.filesWrite`, modifying files it was not assigned.

**Code:** `src/orchestra/authority-enforcer.ts`

**Two posture levels — enforcement differs by worker backend:**

| Worker type | Scope enforcement | Detail |
|-------------|------------------|--------|
| **Local-model / native-agent workers** | 🟢 **Hard** | The scope guard checks each write path *before* the tool executes and returns an error, forcing the model to self-correct. Writes outside scope never reach disk. |
| **CLI / tmux workers** | 🟡 **Advisory (V1.0)** | The Auditor detects out-of-scope writes via `git diff --stat` and emits events to the audit trail, but does **not** block them at the OS level. Hard enforcement is planned for V2 (post-GA). |

**Authority matrix (ADR-037 V1.0) — RBAC check behavior:**

The authority matrix defines which roles (Brain, Auditor, Worker) may read/write which paths. For CLI/tmux workers, the check is **deliberately soft**:

```typescript
// checkAuthority() for CLI/tmux workers returns mode: 'soft'
return {
  allowed: false,
  level: 'warn',
  mode: 'soft',   // <-- advisory; never hard-blocks CLI/tmux writes
  reason: `...worker scope violation...`,
};
```

`checkAuthority()` returns a result; callers decide whether to proceed. The filesystem does **not** block CLI/tmux writes. For local-model/native-agent workers the scope guard is enforced before the write tool executes (not via `checkAuthority`).

**What V1.0 does (all workers):**
- Detects scope violations via Auditor scan every 30 seconds (`git diff --stat`)
- Emits `AUDITOR→BRAIN:AUTHORITY_VIOLATION` events to the event stream
- Workers are expected to self-flag boundary violations as `BOUNDARY_VIOLATION → NO_GO`
- Brain applies FIX cascade on honest NO_GO results

**What V1.0 does NOT do (CLI/tmux workers only):**
- Block writes outside `scope.filesWrite` at the OS level (hard enforcement is V2 roadmap)
- Roll back unauthorized writes automatically
- Hard-deny at process creation time

**V2 roadmap:** Hard OS-level path restriction for CLI/tmux workers is planned for post-GA V2. Timeline is TBD.

**Security implication:** For CLI/tmux workers in V1.0-beta, a rogue worker (or model hallucination) can write outside its assigned scope before the Auditor's next scan cycle (~30 seconds). All violations are recorded in the audit trail but are not blocked. Use Docker or local-model workers for hard scope enforcement.

---

### 3d. Sandbox Mode

**Threat:** A worker modifies production code or leaves persistent changes after a test sprint.

**Code:** `src/providers/sandbox.ts`, `src/cli/commands/start.ts` (`--sandbox-mode`)

**Implemented mitigations:**
- **Git-stash rollback** — `--sandbox-mode` runs `git stash --include-untracked` before the sprint. After sprint completion (or on error), `git stash pop` restores the original state. Changes made during the sprint are discarded.
- **Memory limit** — workers run with `NODE_OPTIONS=--max-old-space-size=<N>` (default 512 MB).
- **Pre-spawn scope check** — `SandboxSpawnBackend.enforceScope()` validates the working directory against `allowedDirs` before spawning. Throws `ProviderError` on violation.

**What sandbox mode is NOT:**
- **Not OS-level process isolation** — no chroot, no seccomp, no Linux namespaces.
- **Network blocking is best-effort only** — `blockNetwork: true` sets proxy env vars (`http_proxy`, `https_proxy`). This prevents well-behaved processes from making HTTP/HTTPS calls but does not block raw TCP connections, DNS, or processes that ignore proxy env vars.
- **Not a security boundary** — sandbox mode is primarily a rollback mechanism, not a security isolation mechanism.

**Residual risk:** A worker that uses raw socket APIs or ignores `http_proxy` can still make outbound network calls in sandbox mode. Use Docker backend for stronger fs/mem isolation (but Docker also lacks network isolation in V1.0 — see §3e).

---

### 3e. Docker Worker Isolation

**Threat:** A worker process escapes the project filesystem or consumes unbounded resources.

**Code:** `src/orchestra/spawn-backend.ts`, `src/orchestra/spawn-backend-docker.ts` (see ADR-062 and project docs)

**Implemented mitigations:**
- **Filesystem isolation** — Docker workers run in a container with the project directory bind-mounted. Host filesystem outside the mount point is not accessible.
- **Memory isolation** — container memory limits enforced by Docker.

**What Docker does NOT provide (V1.0):**
- **No network isolation** — Docker containers run on the default bridge network and can make outbound network calls. There is no `--network=none` or firewall rule applied by deckent.
- **No seccomp/AppArmor profile** — deckent does not apply a custom seccomp profile; the Docker default profile applies.

**Residual risk:** A Docker worker can exfiltrate data via outbound HTTP/HTTPS calls to arbitrary hosts. This is the same network risk as subprocess mode.

---

### 3f. HMAC Audit Chain (Terminal PTY)

**Threat:** Audit logs are tampered with to hide malicious terminal activity.

**Code:** `src/api/terminal/audit-integrity.ts`

**Implemented:**
- **HMAC-SHA256 chain** — each terminal audit row carries `audit_hmac = HMAC-SHA256(secret, prevHmac ∥ timestamp ∥ tenantId ∥ action ∥ content)`. Any UPDATE or DELETE of an audit row breaks the chain.
- **32-byte random audit key** — generated on first use, stored at `.deckent/audit-key` with `chmod 0600`. Machine-local and gitignored.
- **`verifyAuditChain()`** — walks rows in id-order, recomputes expected HMAC, reports the first tampered row id.
- **Genesis row** — `prevHmac = null` is normalized to `""` so the first row's digest is well-defined.

**Limitations:**
- The audit key is stored on the same machine as the audit log. An attacker with local filesystem access can regenerate the chain with a new key.
- No remote audit log shipping or SIEM integration (post-beta).

---

### 3g. Data Sovereignty (Never-Calls-Home)

**Threat:** Deckent sends sprint data, code, or telemetry to external servers without the user's knowledge.

**Code:** `src/core/telemetry.ts`

**Implemented:**
- **Telemetry off by default** — `TelemetryCollector` is instantiated with `enabled: false`. No events are recorded or sent unless explicitly enabled by the user.
- **Local-only storage** — `record()` appends to an in-memory `events[]` array. `flush()` returns the array to the caller — there are no HTTP calls, WebSocket sends, or file writes in `telemetry.ts`. No data leaves the process.
- **PII sanitization** — `sanitize()` strips string values containing `@` (email patterns) or home directory paths (`/home/`, `/Users/`).
- **Local Ollama option** — for fully air-gapped deployments, deckent supports local Ollama models. In this mode, no AI prompts leave the machine.

**Note:** Provider API calls (Claude, Codex, Gemini) do send prompts to third-party APIs when those providers are used. This is expected behavior, not background telemetry. Users who require fully offline operation should use the local Ollama provider.

---

### 3h. Multi-Tenant Isolation

**Threat:** In a hypothetical multi-tenant deployment, one tenant's data is accessible to another.

**Code:** `src/core/tenant-context.ts`

**Current posture — schema-only (honest disclosure):**

The multi-tenant API exists and is used: `tenantId` is validated with regex `^[a-z0-9][a-z0-9-]{0,62}$`, path isolation is enforced via `<projectRoot>/.deckent/tenants/<tenantId>/`, and `AsyncLocalStorage` provides tenant-scoped async context.

However, the system defaults to `tenantId: 'local'` everywhere:

```typescript
const tenantId =
  opts?.tenantId ??
  process.env['DECKENT_TENANT_ID'] ??
  'local';  // <-- default, used in all single-user deployments
```

**What multi-tenant does NOT provide (V1.0):**
- No cross-tenant access control enforcement at the OS level
- No database-level row isolation (all tenants share the same `memory.db` in V1.0)
- No authentication boundary between tenants
- The schema is correct but the runtime does not enforce tenant isolation

**V1.0 is single-user by design.** The multi-tenant schema exists to support future F3/F4 enterprise features (ADR-067/068). Using deckent in a genuine multi-tenant deployment in V1.0 is **not supported and provides no security isolation**.

---

### 3i. Supply Chain (Plugin / Skill Sandbox AST)

**Threat:** A malicious skill or plugin in `.deckent/skills/` executes arbitrary code when loaded.

**Code:** `src/core/skill-pool.ts` (structural validation) + `src/core/marketplace/skill-sandbox.ts` (AST sandbox: eval/Function/require denylist)

**Implemented:**
- **AST static analysis** — skills undergo AST validation before activation. The sandbox rejects skills that import dangerous Node.js built-ins or call `eval` / `Function()`.
- **Sandboxed execution scope** — skills run with a restricted set of allowed imports.

**Known limitations:**
- AST validation is a static analysis heuristic, not a complete sandbox. Obfuscated code or indirect call patterns may bypass it.
- Skills that make outbound HTTP calls (e.g., `fetch()`, `axios`) are not blocked — a malicious skill could exfiltrate data via legitimate-looking API calls.
- No cryptographic signature verification on skill manifests.

---

### 3j. MCP Server / Client Channel

**Threat:** A malicious MCP client sends crafted tool calls to trigger unintended operations.

**Implemented mitigations:**
- **Stdio-only transport** — the MCP server uses stdio, not network. Attackers require local OS user access equivalent to shell access.
- **Zod schema validation** — all MCP tool inputs are validated against strict Zod schemas before handler execution.
- **Destructive-op guards** — `deckent_kill`, `deckent_cleanup`, `deckent_recover` require explicit confirmation. ADR-047 + feedback rule `feedback_deckent_kill_approval_required`.

**Residual risk:** A compromised IDE extension with MCP access could call destructive tools if the user approves the permission prompt.

---

### 3k. Worker Code Execution

**Threat:** A worker — a provider-backed agent (Claude/Codex/Gemini) executing a task — runs arbitrary code inside the project working tree: it edits source files and runs the project's own build, lint, and test commands (e.g. `npm run build`, `vitest`). A malicious DIRECTIVES author, a compromised provider response, or a model hallucination can therefore cause unintended code execution on the host.

**Code:** `src/agents/worker.ts`, `src/orchestra/spawn-backend.ts`, `src/orchestra/spawn-backend-docker.ts`

**Trust assumption (honest):** The DIRECTIVES author is trusted — single-user design, V1.0 (see §1 trust boundaries). Worker code execution is the *intended* behavior of the system: deckent orchestrates agents that write and run code. The security question is not "can a worker run code" (yes, by design) but "how far can a worker's code reach."

**Implemented mitigations:**
- **Backend isolation choice** — workers run via subprocess, tmux, or Docker (`spawn-backend.ts`). The Docker backend bind-mounts only the project directory, so worker code cannot read host files outside the mount (§3e). subprocess/tmux backends run as the same OS user with no filesystem boundary.
- **Symlink-aware scope resolution** — `worker.ts` resolves each written path with `realpathSync()` before scope matching, so a symlink that points outside the project root resolves to its real location instead of masking the target (ADR-034 Katman 3).
- **Honest-gate self-assessment** — a worker that detects it wrote outside its declared `scope.filesWrite` is expected to self-flag `BOUNDARY_VIOLATION → NO_GO`; Brain then applies a FIX cascade (§3c).
- **Per-provider API Key isolation** — each worker process receives only its own provider's API Key via per-provider environment injection; a Claude worker never receives the Codex or Gemini key (§3b).

**Scope enforcement posture by backend — honest disclosure:**

Scope enforcement is **not uniform** across backends (see §3c for the full breakdown):

- **Local-model / native-agent workers:** scope is enforced **hard** — the write tool checks the path before executing and blocks out-of-scope writes before they reach disk.
- **CLI/tmux workers (subprocess/tmux backends):** scope is **advisory in V1.0** — `checkAuthority()` returns `mode: 'soft'`, the Auditor detects violations via `git diff --stat` after the fact, but does not block or roll back the write.

**Residual risk:** For **CLI/tmux workers** specifically, a rogue worker can execute any command and write any file the OS user owns before the next Auditor scan (~30 s). The provider API Key for that worker is present in its `process.env` and is readable by any process running as the same OS user (`/proc/PID/environ`). For untrusted DIRECTIVES, use the Docker backend (filesystem isolation) plus `--sandbox-mode` (git-stash rollback) — but note that neither provides network isolation in V1.0 (§3d, §3e).

---

### 3l. Multi-Project Isolation

**Threat:** A worker in Project A reaches the source, secrets, or memory of a sibling Project B on the same machine. This is **Multi-Project** isolation — one user running several projects side by side — and is explicitly **not** SaaS multi-tenant isolation, which is out of scope per ADR-033 (see §3h for the separate multi-tenant posture).

**Code:** `src/agents/worker.ts` (symlink-aware scope resolution), ADR-034.

**Implemented mitigations:**
- **Per-project directory isolation (structural)** — each project owns independent `.deckent/`, `.brain/`, `.tasks/`, and `.locks/` directories under its own project root. There is no cross-reference between them; a project's `.brain/` contains only that project's sprint history (ADR-034 Katman 1).
- **Symlink-aware scope resolution** — a sibling-project access attempt via a crafted symlink (`../project-b/src/secret.ts`) resolves to its real path through `realpathSync()` before scope matching, closing the naive symlink-bypass vector (ADR-034 Katman 3; Sprint 132 MEDIUM #10).
- **Environment-only API Keys** — provider API Keys live in environment variables and the project-local `.deck` file, never in the global `~/.deckent/config.json`, so the shared global config is not a cross-project credential-leakage vector (ADR-034 Katman 4).

**Advisory posture (ADR-037 V1.0):** As with all scope enforcement (§3c), the cross-project check is **advisory** — the symlink is *resolved* correctly and an out-of-scope target is logged and surfaced, but it is not hard-blocked at the OS level. Hard cross-project enforcement is **V2 post-GA**.

**Residual risk:** A worker running as the same OS user can still read a sibling project's files directly — there is no kernel-level boundary between projects on subprocess/tmux backends. Multi-Project isolation is a structural-plus-advisory boundary in V1.0-beta, not an OS-enforced one.

---

## 4. Implementation Status Summary

| Control | Status | Code Reference |
|---------|--------|----------------|
| Timing-safe token auth (SHA-256 + `timingSafeEqual`) | **Implemented** | `src/api/auth.ts` |
| Localhost auto-inject (opt-in) | **Implemented** | `src/api/auth.ts` |
| `.deck` per-provider secret isolation | **Implemented** | `src/core/provider.ts:applyDeckSecretsToEnv()` |
| `.deck` gitignore + doctor check | **Implemented** | `src/core/deck-file.ts`, `src/cli/commands/doctor.ts` |
| Scope enforcement — local/agentic workers (hard, pre-write) | **Implemented (hard)** | Worker scope guard in local-model / native-agent path |
| Scope enforcement — CLI/tmux workers (advisory, post-write detection) | **Implemented (advisory)** | `src/orchestra/authority-enforcer.ts`, Auditor `git diff --stat` |
| Scope enforcement — CLI/tmux hard FS-level blocking | **Not implemented (V2 roadmap)** | ADR-037 V2 |
| Worker code execution — Docker backend isolation (bind-mount) | **Implemented** | `src/orchestra/spawn-backend.ts`, `src/orchestra/spawn-backend-docker.ts` |
| Worker code execution — OS-level confinement | **Not implemented (advisory; V2 roadmap)** | ADR-037 V2 |
| Multi-project: per-project directory isolation | **Implemented (structural)** | ADR-034 Katman 1 |
| Multi-project: symlink-aware scope resolution | **Implemented** | `src/agents/worker.ts` (`realpathSync`) |
| Multi-project: cross-project OS-level boundary | **Not implemented (advisory; V2 roadmap)** | ADR-037 V2 |
| Sandbox: git-stash rollback | **Implemented** | `src/cli/commands/start.ts` |
| Sandbox: network blocking | **Best-effort only** (proxy env vars) | `src/providers/sandbox.ts` |
| Docker: filesystem isolation | **Implemented** | `src/orchestra/spawn-backend-docker.ts` |
| Docker: network isolation | **Not implemented** | Post-beta |
| HMAC-SHA256 audit chain (terminal PTY) | **Implemented** | `src/api/terminal/audit-integrity.ts` |
| Telemetry off by default / never-calls-home | **Implemented** | `src/core/telemetry.ts` |
| Multi-tenant path isolation | **Schema only** | `src/core/tenant-context.ts` |
| Multi-tenant cross-tenant access control | **Not implemented** | ADR-067/068, post-beta |
| Encryption at rest for `.deck` secrets | **Not implemented** | Post-beta |
| Secret vault integration | **Not implemented** | Post-beta |
| SIEM / remote audit log | **Not implemented** | Post-beta |
| AST skill sandbox | **Implemented (heuristic)** | `src/core/skill-pool.ts` |

---

## 5. Recommendations for Security-Conscious Users

1. **Always set `DECKENT_API_TOKEN`** — do not rely on localhost-auto-inject in production.
2. **Do not set `DECKENT_API_AUTH_DISABLED=1`** outside local development.
3. **Run `deckent doctor`** after `deckent init` — it checks `.deck` git tracking and other security issues.
4. **Use `--sandbox-mode`** for sprint runs involving untrusted DIRECTIVES. Understand it is a rollback mechanism, not a security isolation boundary.
5. **Use Docker backend** for stronger filesystem isolation (but note: network isolation is not provided).
6. **Review DIRECTIVES.md** before running sprints. The DIRECTIVES author is trusted; verify the source before running third-party directives.
7. **For offline operation**, use the local Ollama provider — no prompts leave the machine.
8. **Do not use deckent in multi-tenant deployments** until F3/F4 enterprise isolation ships (post-beta).

---

## 6. Vulnerability Disclosure

See `SECURITY.md` for the full disclosure policy.

**Summary:**
1. Report via [GitHub Security Advisory](https://github.com/VerhexIO/deckent/security/advisories/new) (private by default)
2. Alternative: security@deckent.ai
3. Include: description, reproduction steps, impact, suggested fix
4. Response: acknowledgement within 48h, fix within 7 days for critical issues
5. Do NOT open a public GitHub issue for unpatched vulnerabilities
