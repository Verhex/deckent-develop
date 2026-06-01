# Deckent Threat Model

> **Version:** 1.0.0-beta.1  
> **Last updated:** 2026-05-22  
> **Status:** V1.0 — advisory enforcement; V2 hard enforcement planned post-GA

This document describes the threat model for deckent: who the adversary is, what they can do, and how deckent defends against each threat. It is intended for security-conscious users and contributors evaluating deckent for production or team environments.

---

## Scope and Assumptions

**In scope:**
- Sprint workers executing AI-generated code in the local filesystem
- Provider API key handling (Claude, Codex, Gemini)
- MCP server communication between IDE and deckent
- Multi-project isolation when deckent is used in multiple repos
- Dashboard and web terminal access

**Out of scope (V1.0):**
- Network-level isolation between workers and the internet
- Hardware security modules or TPM-backed secret storage
- Multi-user (team) deployments (deckent is single-user by design in V1.0)

**Trust assumptions:**
- The OS user running deckent is trusted
- The `DIRECTIVES.md` author is trusted (typically the developer themselves)
- Provider APIs (Claude, Codex, Gemini) are trusted third-party services

---

## Attack Surface

### 1. Worker Code Execution

**Threat:** A malicious or buggy AI task directive causes a worker to execute arbitrary shell commands, delete files, or exfiltrate data.

**Attack vectors:**
- Prompt injection via task `description` or `DIRECTIVES.md`
- Adversarial skill injected into `.deckent/skills/` that escapes the sandbox
- Worker operating outside its assigned `scope.filesWrite`

**Mitigations:**
- **AST Sandbox** — all skills undergo AST validation before execution. Static analysis rejects skills that import dangerous Node.js built-ins (`child_process`, `fs` with unescaped paths) or call `eval`/`Function`. See `src/core/skill-pool.ts`.
- **`spawn-safety.ts` whitelist** — subprocess spawns go through a security filter that validates binary path, argument structure, and working directory. Unknown or suspicious patterns are rejected.
- **Scope enforcement (advisory, V1.0)** — each task declares `scope.filesWrite`. The Auditor scans `git diff --stat` after each worker heartbeat and raises alerts on violations. Workers that self-report violations (`BOUNDARY_VIOLATION`) trigger automatic `NO_GO` + Brain FIX cascade.
- **ADR-037 V1.0 limitation:** Scope enforcement is _advisory_. The filesystem does not block writes — the Auditor detects and logs violations but does not prevent them at runtime. Hard enforcement (Layer-2) ships in V2 post-GA.

**Residual risk (V1.0):** A rogue worker can write outside its scope before the Auditor scan cycle (every 30 seconds). The write is logged in the audit trail but not rolled back automatically.

---

### 2. Provider API Key Leakage

**Threat:** API keys for Claude, Codex, or Gemini are exposed in logs, config files, git history, or error output.

**Attack vectors:**
- Keys set as environment variables and accidentally logged
- Config files containing keys committed to git
- Error messages printing full config objects including keys
- `.deckent/credentials/` with overly permissive file mode

**Mitigations:**
- **`.deck` Secret Interpolation (ADR-014)** — secrets stored in `.deck` files are never written to `DIRECTIVES.md`, task JSON, or log files. Config references use `$DECK:KEY_NAME` placeholder; interpolation happens at runtime, in-memory only.
- **0600 file permissions** — `~/.deckent/credentials/` is created with owner-only read/write (mode 0600). Other OS users cannot read credential files.
- **`.gitignore` defaults** — `deckent init` adds `.deckent/credentials/` and `.deck` to `.gitignore` automatically.
- **Environment variable guidance** — documentation and `deckent doctor` recommend `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` env vars over file storage for CI/CD.

**Residual risk:** Keys stored as environment variables may be captured by process-listing tools (`ps aux`, `/proc/PID/environ`) on multi-user systems. Deckent does not protect against this on shared servers — single-user use is the V1.0 design target.

---

### 3. Multi-Project Boundary Violation

**Threat:** A worker in project A reads from or writes to project B's files.

**Attack vectors:**
- Relative path traversal in `scope.directories` (e.g., `../../project-b/`)
- Symlinks that escape the project root
- Worker receiving an injection directive targeting another project

**Mitigations:**
- **ADR-034 Multi-Project Isolation** — each deckent project has its own `.deckent/` directory. Worker tasks reference only paths within the project root. Brain validates `scope.directories` entries at plan time.
- **`git diff --stat` boundary check** — Auditor monitors for uncommitted writes; cross-project writes would appear as changes outside the expected working tree and trigger alerts.
- **Project-relative paths** — task JSON files use project-relative paths; absolute path resolution validates the path starts within the project root.

**Residual risk:** Symlink attacks are not explicitly defended in V1.0. A task with a symlink in `scope.directories` could escape the project root. Mitigation: review DIRECTIVES.md before running sprints on untrusted task definitions.

---

### 4. MCP Stdio Channel

**Threat:** A malicious MCP client or man-in-the-middle sends crafted tool calls to deckent's MCP server, triggering unintended operations.

**Attack vectors:**
- A compromised IDE extension sending `deckent_kill` or `deckent_cleanup` without user intent
- Parameter injection in tool call arguments (e.g., injecting path traversal in `root`)
- SSRF via the MCP HTTP transport (if enabled)

**Mitigations:**
- **stdio-only transport** — the MCP server uses stdio (not network) by default. Attackers must have local OS user access to the stdio pipe, which is equivalent to shell access.
- **`root` parameter validation** — destructive tools (`kill`, `cleanup`, `recover`) validate that `root` is a known deckent project directory and reject path traversal.
- **Confirmation requirements** — ADR-047 and memory rule `feedback_sprint_kill_always_ask_user` require Alperen's explicit approval for destructive operations. MCP callers must supply `force: true` + `userExplicit: true` simultaneously to bypass guards.
- **Input schema validation (Zod)** — all MCP tool inputs are validated against strict Zod schemas before handler execution.

**Residual risk:** Malicious Claude Code extensions or plugins with MCP access could call destructive tools if the user grants permission. The confirmation requirements create a speed-bump but cannot prevent a user who approves every prompt.

---

### 5. Dashboard and Web Terminal

**Threat:** The web dashboard or embedded terminal exposes sprint data or allows arbitrary command execution to unauthorized local users or network attackers.

**Attack vectors:**
- Dashboard HTTP server listening on a network interface accessible to other hosts
- Web terminal (ADR-062) accepting commands from unauthenticated browsers
- Audit log manipulation to hide terminal activity

**Mitigations:**
- **localhost-default binding** — the dashboard server binds to `127.0.0.1` by default. Network exposure requires explicit `--host 0.0.0.0` flag.
- **Terminal auth layer** — the web terminal (ADR-062) uses a separate auth mechanism, stricter than the global API bypass. Auth tokens are generated per-session.
- **Three terminal security layers (ADR-062):**
  1. `prompt-guard` — input pattern matching blocks injection attempts before PTY write
  2. `command-guard` — deny-list of dangerous shell patterns; default-deny on non-localhost
  3. `outbound-limiter` — per-tenant daily byte quota with warn/kill thresholds
- **HMAC-SHA256 audit chain** — terminal activity is stored in an append-only audit chain with tamper detection via `deckent audit verify`.

**Residual risk:** The web terminal provides a full shell to the running user. Any user who can reach the dashboard port (including via localhost if another process is compromised) can use the terminal. Use `--no-terminal` to disable it in sensitive environments.

---

## Defense Summary

| Defense | Implementation | ADR |
|---------|---------------|-----|
| AST Sandbox for skills | `src/core/skill-pool.ts` — static AST validation | — |
| Subprocess spawn safety | `src/core/spawn-safety.ts` — binary + arg whitelist | ADR-006 |
| `.deck` secret interpolation | Runtime-only, never serialized to disk | ADR-014 |
| Multi-project isolation | Per-project `.deckent/` config boundary | ADR-034 |
| RBAC role boundaries | Auditor `git diff --stat` + audit trail (advisory V1.0) | ADR-037 |
| MCP input validation | Zod schemas on all 31 tools | ADR-022-v2 |
| Terminal prompt/command guard | PTY pre-write pattern matching | ADR-062 |
| HMAC audit chain | Append-only terminal audit log | ADR-062 |
| 0600 credential files | `deckent init` sets permissions automatically | — |

---

## ADR-037 V1.0 Honest Disclosure

ADR-037 (Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0) defines role boundaries for Brain, Auditor, and Workers. The V1.0 implementation is **advisory/soft**:

- **What V1.0 does:** Detects scope violations via `git diff --stat`, emits structured events to the audit trail, logs `BOUNDARY_VIOLATION` warnings.
- **What V1.0 does NOT do:** Block workers from writing outside their `scope.filesWrite` at the filesystem level. The runtime enforcement layer (Layer-2) was intentionally deferred to post-GA V2.
- **Honest self-flag:** Workers are expected to self-report boundary violations (`BOUNDARY_VIOLATION → NO_GO`). Brain then applies FIX cascade.
- **V2 plan:** Hard filesystem-level enforcement (chroot, seccomp, or OS-level path restrictions) is planned for post-GA V2. Timeline TBD.

**Security implication:** In deckent V1.0-beta, a determined or buggy AI worker can write outside its declared scope before the Auditor's next scan cycle (~30 seconds). All such violations are recorded in the audit trail, but rollback is not automatic.

For users in high-sensitivity environments, the recommendation is to run deckent with `--sandbox-mode` (subprocess backend with OS-level restrictions) until V2 hard enforcement is available.

---

## Vulnerability Disclosure

See [SECURITY.md](https://github.com/VerhexIO/deckent/blob/main/SECURITY.md) for the full disclosure policy.

**Summary:**
1. Report via [GitHub Security Advisory](https://github.com/VerhexIO/deckent/security/advisories/new) (preferred — private by default)
2. Alternative: security@verhex.com
3. Include: description, reproduction steps, impact, suggested fix
4. Response: acknowledgement within 48h, fix within 7 days for critical issues
5. Do NOT open a public GitHub issue for unpatched vulnerabilities
