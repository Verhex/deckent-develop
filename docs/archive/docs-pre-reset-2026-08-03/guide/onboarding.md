# Onboarding

> `deckent onboard` -- the guided first-contact wizard: detects providers, checks
> login status, suggests MCP attachments, and lets you choose where configuration
> should live before you ever run `deckent init`.

---

## Table of Contents

1. [`onboard` vs. `init`](#1-onboard-vs-init)
2. [The Four Invocation Paths](#2-the-four-invocation-paths)
3. [Interactive Wizard Walkthrough](#3-interactive-wizard-walkthrough)
4. [Workspace Scope: Project vs. Global](#4-workspace-scope-project-vs-global)
5. [Plan Modes](#5-plan-modes)
6. [Provider Auto-Pick and MCP Suggestions](#6-provider-auto-pick-and-mcp-suggestions)
7. [Next Steps](#7-next-steps)

---

## 1. `onboard` vs. `init`

- **`deckent onboard`** is the *advisory* front door: it probes your machine (which
  provider CLIs are installed, which are logged in, whether their MCP server is already
  attached to your host CLI) and lets you preview or confirm a configuration plan. In
  most of its modes today it is **read-only** -- see the path table below for exactly
  which mode writes anything.
- **`deckent init`** is the command that actually creates `.deckent/config.json` and the
  rest of the project workspace (see the [Quickstart Guide](quickstart.md#3-first-project-setup)).
- The non-interactive/non-TTY path of `onboard` (path 3 below) is the one exception: if
  you confirm its "run init?" prompt, it spawns `deckent init --force` for you.

## 2. The Four Invocation Paths

`deckent onboard` picks one of four behaviors based on its flags and whether stdin is a
TTY:

| Path | Trigger | What happens | Writes anything? |
|------|---------|---------------|-------------------|
| **Plan report** | `--plan-only` (+ optional `--json`) | Runs every probe once (provider discovery, auth status, MCP attach status, workspace/mode resolution) and prints the resulting plan as text or JSON. Never prompts, never writes `config.json`. | No config write (see the cache-file note below) |
| **Interactive wizard** | No flags, stdin is a TTY | Mounts the Ink card-based wizard (see [§3](#3-interactive-wizard-walkthrough)). You step through info cards and questions, review a summary, and choose Apply or Cancel. | No -- Apply only *confirms* the plan today; see the note in §3 |
| **Non-interactive fallback** | `--non-interactive`, or stdin is not a TTY | Runs the original scripted flow: prints Claude CLI / provider / system / project detection, asks 3 questions (language, plan mode, "run init?"), and -- if you confirm -- spawns `deckent init --force` with your answers. | **Yes**, via `deckent init`, only if you confirm -- see the known-issue note below |
| **Force re-run** | `--force` | Combine with any of the above to re-run onboarding even when `.deckent/` already exists. | Same as the path it's combined with |

```bash
# Preview the plan without touching anything project-config-wise (CI-safe)
deckent onboard --plan-only

# Same, machine-readable
deckent onboard --plan-only --json

# Full interactive wizard (default when run from a real terminal)
deckent onboard

# Scripted/CI path -- answers defaults, optionally runs `deckent init`
deckent onboard --non-interactive

# Re-run onboarding even though .deckent/ already exists
deckent onboard --force
```

> **Note:** `--plan-only` is the recommended way to inspect what onboarding *would* do --
> in CI, in a script, or before handing a laptop to a new teammate -- it never writes
> `config.json` or touches a provider CLI. It does, however, create/update
> `.deckent/project-stack.json` -- a small, rebuildable stack-detection cache shared with
> other commands (e.g. `deckent doctor`), not part of the onboarding plan itself.

> **Known issue:** on a project with no `.deckent/` directory at all, the "already
> initialized?" check in the non-interactive fallback path can read `.deckent/` as
> already existing -- because the project-stack cache write above happens moments
> earlier in the same run, before the check. In that case the confirmed `deckent init`
> step is skipped unless you also pass `--force`. Until this is fixed upstream, add
> `--force` to `deckent onboard --non-interactive` on a brand-new project if you want the
> init step to actually run.

## 3. Interactive Wizard Walkthrough

Running `deckent onboard` from a real terminal (no flags) mounts a 5-step card flow:

1. **Provider Detection** -- which of `claude` / `codex` / `gemini` CLIs are present on
   `PATH` (with version, when detected).
2. **Authentication Status** -- for each detected CLI, whether it is actually logged in
   (installed and logged-in are tracked separately -- a CLI can be present but signed out).
3. **MCP Attach** -- for each provider whose CLI supports MCP attachment and isn't
   attached yet, a suggestion + one-time accept/skip question. Hosts with no MCP support,
   or already attached, show as an info row instead of a question.
4. **Workspace & Mode** -- two questions: where configuration should live (project vs.
   global -- see [§4](#4-workspace-scope-project-vs-global)) and which plan mode to use
   (see [§5](#5-plan-modes)).
5. **Summary** -- the resolved config path, mode/tier, scope, chosen providers, and any
   pending MCP-attach actions, followed by an Apply/Cancel confirmation.

Keys: `↑`/`↓` move the cursor, `Enter` selects, `s` skips a question and takes its
default, `Esc` cancels from any step.

> **Important:** choosing **Apply** on the summary card confirms the plan and closes the
> wizard, but it does **not** currently write `config.json` or run any MCP attach
> command -- the wizard prints an explicit "no files were written, this was a plan
> preview only" notice once it exits. Persisting the confirmed plan to disk is a
> separate, not-yet-shipped step. If you need `.deckent/config.json` written today, run
> `deckent init` (directly, or via the non-interactive onboarding path in the table
> above).

## 4. Workspace Scope: Project vs. Global

The wizard's "Where should this configuration live?" question previews **two** possible
targets:

| Scope | Where it would live | Meaning |
|-------|----------------------|---------|
| **Project** (default) | `<project>/.deckent/config.json` | Per-repo overrides -- what every existing `deckent init` project already has. |
| **Global** | Platform-correct per-user directory (e.g. `~/.config/deckent` on Linux, `~/Library/Application Support/deckent` on macOS, `%APPDATA%\deckent` on Windows) | Machine-wide defaults shared across every project you onboard on this machine. |

This preview is powered by a resolver (`resolveGlobalScopePaths`) that computes the
platform-correct directory for every supported OS (Linux, WSL, macOS, Windows) without
touching the filesystem. It is intentionally **unwired** as of this writing: picking
"Global" in the wizard shows you *where* a global config would go, but -- consistent with
§3's note -- nothing is actually applied there yet. Today's real global state (provider
credentials, MCP config, caches) still lives in the flat `~/.deckent` directory used by
the rest of the CLI.

For the full layer model -- which state item is global vs. project-scoped, the complete
per-platform path matrix, and the staged migration plan -- see the design document:
[Global Install + Project Scope — Layer Model Design](../design/onb-global-install.md).

## 5. Plan Modes

The "Select a working mode" question offers the same resource/cost presets used by
`deckent init` (see [Quickstart §3](quickstart.md#3-first-project-setup)), plus three
subscription-tier presets added for onboarding:

| Mode | Meaning |
|------|---------|
| `performance` | Premium tier, maximum power (default) |
| `balanced` | Standard-tier Brain + premium-tier workers |
| `economic` | Standard tier, cost-efficient |
| `api` | Pay-per-use API billing, premium Brain + standard workers |
| `max_plan` | Claude Max subscription -- performance preset |
| `max5x_plan` | Claude Max 5x subscription -- higher usage ceiling |
| `pro_plan` | Claude Pro subscription -- economic preset |

## 6. Provider Auto-Pick and MCP Suggestions

- If exactly one provider CLI is logged in, it becomes both `brain_provider` and
  `worker_provider`.
- If two or more are logged in, the first (in `claude` → `codex` → `gemini` order)
  becomes the primary (brain + worker), and the next authenticated one becomes
  `fallback_provider`.
- If **none** are authenticated, the plan reports it can't auto-pick a provider and asks
  you to sign in to a provider CLI first (`claude` / `codex` / `gemini`) and re-run
  onboarding.
- MCP attach is only suggested for a host whose CLI is installed, supports MCP
  attachment, and isn't attached yet -- accepting the suggestion records the attach
  command in the plan's summary; it does not run the command itself (see §3's note on
  Apply).

## 7. Next Steps

- New to the terminal? After onboarding, consider trimming the REPL's `/help` output to
  a small, beginner-friendly core set (`/status /plan /do /help /resume /model /exit`)
  with Simple-Mode:

  ```bash
  deckent config set terminal.simple_mode true
  ```

  Every command still works when typed directly -- Simple-Mode only narrows what
  `/help` *lists*, so it's safe to turn on for a first-time user and off again later.

- **[Quickstart Guide](quickstart.md)** -- run your first sprint after onboarding
- **[Installation Guide](installation.md)** -- prerequisites and install options
- **[Multi-Provider Guide](../reference/multi-provider.md)** -- using Claude, Codex, and Gemini together
- **[Global Install + Project Scope — Layer Model Design](../design/onb-global-install.md)** -- the full global vs. project design
- **[CLI Reference](../reference/cli.md#onboard)** -- flag-level reference for every `deckent` command

---

*Deckent -- AI Agent Orchestration CLI | Node.js >=24 | TypeScript ESM | MIT License*
