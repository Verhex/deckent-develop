# Installation Guide

> Install Deckent and verify your environment.

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | **>= 24** | `node --version` |
| git | any | `git --version` |
| Claude Code CLI | any | `claude --version` |
| tmux | any (optional, Linux/macOS) | `tmux -V` |

**Claude subscription:** Pro, Max 5x, Max 20x, or Anthropic API key. Alternatively, configure [Codex or Gemini](../reference/multi-provider.md) as your provider.

**tmux** is optional — Deckent falls back to the subprocess backend automatically if tmux is not available.

---

## Option A: Zero Install (Recommended)

No global install required. Run directly with `npx`:

```bash
npx deckent@latest init
```

This detects your environment, prompts for consent before installing any missing provider CLIs, and sets up your project. Use `--yes` to install all dependencies without prompting (CI mode), or `--no-install` for detection only.

---

## Option B: Global Install

```bash
npm install -g deckent
```

Verify:

```bash
deckent --version
# Expected: 1.0.0-beta.1

deckent init
```

If you see `command not found` after global install, add the npm global bin to your PATH:

```bash
export PATH="$(npm bin -g):$PATH"
# Add to ~/.bashrc or ~/.zshrc for persistence
```

---

## Verify Your Environment

Run the health check after installation:

```bash
deckent doctor
```

Expected output on a freshly initialized project:

```
  [PASS] Node.js        v24.0.0 (>=24 required)
  [PASS] git            git 2.43.0
  [PASS] tmux           tmux 3.3a
  [PASS] Claude CLI     claude 1.2.3
  [PASS] Workspace      .deckent/ found
```

Before `deckent init`, the `workspace` row shows `[fail]` — that is expected.

---

## Platform Notes

### Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch)

All backends supported (tmux, subprocess, Docker). Install tmux:

```bash
# Ubuntu/Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

### macOS (12+)

All backends supported. Install tmux via Homebrew:

```bash
brew install tmux
```

### Windows WSL2 (Recommended for tmux workflows)

Full support. Use a WSL2 distribution (Ubuntu 22.04 recommended). Run `deckent` commands from inside WSL2.

### Windows Native

Full support via the subprocess backend (`shell: true`, UTF-8 support). tmux is not available on native Windows; Deckent uses subprocess automatically.

---

## Docker Backend (Optional)

Workers can run in isolated Docker containers:

```bash
docker build -f Dockerfile -t deckent-worker:latest .
deckent config set spawn_backend docker
```

See [Docker Backend Guide](docker-backend.md) for the complete setup guide.

---

## Updating Deckent

```bash
# npx always fetches the latest published version:
npx deckent@latest --version

# If installed globally:
npm update -g deckent

# Beta installs via local tarball:
deckent upgrade --local deckent-1.0.0-beta.1.tgz
```

---

## Node.js Version Support

| Node Version | Status |
|--------------|--------|
| 24.x | **Supported** (minimum) |
| 26.x | Supported |
| 22.x and below | Not supported |

Deckent uses Node 24+ APIs (readline/promises, ESM, native crypto). Older versions will fail at startup.

---

## Next Steps

- [Quickstart Guide](quickstart.md) — run your first sprint in 5 minutes
- [Getting Started](getting-started.md) — step-by-step walkthrough
- [Config Reference](../reference/config-reference.md) — all configuration options
- [Troubleshooting](https://github.com/VerhexIO/deckent/blob/main/docs/development/troubleshooting.md) — common issues and fixes
