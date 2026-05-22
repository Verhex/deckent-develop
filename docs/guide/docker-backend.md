# Docker Backend Guide

> Run Deckent workers in isolated Docker containers for stronger isolation and reproducibility.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Building the Worker Image](#3-building-the-worker-image)
4. [Configuration](#4-configuration)
5. [Architecture](#5-architecture)
6. [Running a Sprint](#6-running-a-sprint)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

Deckent supports three spawn backends for worker processes:

| Backend | Description | Status |
|---------|-------------|--------|
| `docker` | Workers run in isolated Docker containers | **Default** — `auto` resolves here (Sprint 177) |
| `subprocess` | Workers run as child processes | Fallback — Windows / no Docker |
| `tmux` | Workers run in tmux panes (session auth) | Deprecated — emits a warning |

The **Docker backend** provides the strongest *process* isolation: each worker runs in its own container with separate PID, network, and mount namespaces, so workers cannot see or interfere with each other's processes.

> **Note on the project mount:** The project directory is mounted **read-write** — workers need to create and edit files within their assigned scope. Docker does **not** add a filesystem-level read-only guarantee for the project; a worker can write anywhere under the project root. Scope boundaries are enforced the same way as on the other backends: advisory at runtime (ADR-037 V1.0 — compile-time lint + audit-trail; the Auditor flags out-of-scope writes via `git diff --stat`). Treat the Docker backend as process and environment isolation, not as protection against a worker modifying project files.

---

## 2. Prerequisites

### 2.1 Docker Engine

Install Docker Engine on your platform:

**Ubuntu / WSL2:**
```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to the docker group (avoids sudo for every command)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker info
```

**macOS (Docker Desktop):**
```bash
# Install Docker Desktop from https://www.docker.com/products/docker-desktop/
# Or via Homebrew:
brew install --cask docker

# Verify
docker info
```

**WSL2 Notes:**
- Docker Desktop with WSL2 backend is recommended for Windows
- Alternatively, install Docker Engine directly inside WSL2 (Ubuntu steps above)
- Ensure Docker daemon is running: `sudo service docker start`

### 2.2 Claude Code CLI Authentication

The Docker backend mounts your host `~/.claude/` directory into each container. This means workers use **your existing Claude Code session** — no separate login needed inside containers. (The mount is read-write; see [§5.2](#52-authentication) for why.)

Verify your host session is active before launching Docker-backed sprints:
```bash
claude --version
# Should print version without prompting for login
```

---

## 3. Building the Worker Image

The worker image is defined in `Dockerfile.worker` at the project root.

```bash
# Build the image (run from project root)
docker build -f Dockerfile.worker -t deckent-worker:latest .

# Verify the image was built
docker images | grep deckent-worker
```

The image includes:
- **Node.js 24** (`trixie-slim` base)
- **Git** (for diff operations)
- **curl** (for health checks)
- **Claude Code CLI** (`@anthropic-ai/claude-code`) installed globally

**Optional providers** (uncomment in `Dockerfile.worker` if needed):
```dockerfile
# Codex CLI
RUN npm i -g @openai/codex

# Gemini CLI
RUN npm i -g @google/gemini-cli
```

> The image has no entrypoint — the command is injected by `DockerSpawnBackend` at spawn time.

---

## 4. Configuration

### 4.1 Enable Docker Backend

```bash
npx deckent config set spawn_backend docker
```

Or edit `.deckent/config.json` directly:
```json
{
  "spawn_backend": "docker"
}
```

### 4.2 Verify Configuration

```bash
npx deckent config read | grep spawn_backend
# spawn_backend: docker
```

---

## 5. Architecture

### 5.1 Volume Mount Strategy

Each container receives four volume mounts — **all read-write**:

| Mount | Container Path | Mode | Purpose |
|-------|---------------|------|---------|
| Project root | `/workspace` | `rw` | Source code — workers create/edit files within their scope |
| `.tasks/` | `/workspace/.tasks/` | `rw` | Results, heartbeats, prompts (shared volume) |
| `.locks/` | `/workspace/.locks/` | `rw` | File locking between workers |
| `~/.claude/` | `<container HOME>/.claude/` | `rw` | Claude Code session auth (writable — the session env updates on use) |

All four mounts are read-write. Inter-process communication between Brain and workers happens through `.tasks/` and `.locks/`; the project root is writable because workers must edit source files to do their work. The container HOME itself is a `tmpfs` (in-memory, 100 MB) — files a worker writes outside the mounted paths stay in the container and never touch the host.

### 5.2 Authentication

Workers use the host user's Claude Code session via the `~/.claude/` mount:

```
Host ~/.claude/
  ├── .credentials.json   ← session token (mounted rw into container)
  └── settings.json       ← Claude settings
```

The `~/.claude/` mount is **read-write** — the Claude CLI updates its session environment on use, so a read-only mount would break authentication. If `~/.claude.json` exists on the host, it is also mounted (read-write, for the same reason).

> **Security note:** Because `~/.claude/` is mounted read-write, a worker container can in principle modify your host Claude credentials. The container runs as your host user (see §5.3), so this is the same trust boundary as running Claude locally — the mount is shared, not sandboxed.

For API-key-based providers (Codex, Gemini), keys are passed as environment variables:
- `ANTHROPIC_API_KEY` → Claude API mode
- `OPENAI_API_KEY` → Codex provider
- `GOOGLE_API_KEY` → Gemini provider

### 5.3 Non-Root Execution

**Claude Code's `--dangerously-skip-permissions` flag is blocked when running as root.** The Docker backend explicitly runs containers as the host user:

```bash
docker run --user <uid>:<gid> -e HOME=<host_home> ...
```

The host user's UID and GID are detected at runtime via `process.getuid()` / `process.getgid()`. This ensures:
- Workers have the same filesystem permissions as the host user
- `--dangerously-skip-permissions` is accepted by the Claude CLI
- Files written to `.tasks/` are owned by the host user (no permission issues after cleanup)

### 5.4 Container Lifecycle

```
spawn()
  │
  ├─ Write prompt to .tasks/.prompt-<id>.txt
  ├─ docker run -d --name deckent-w-<taskId> ...
  ├─ Write initial .tasks/task-<id>.hb (backend: "docker")
  └─ monitorContainer() [async, fire-and-forget]
       │
       ├─ docker wait <containerName>   ← blocks until container exits
       ├─ Update .hb → status: DONE/FAILED
       ├─ If no .result + exit != 0 → write .timeout marker
       └─ docker rm -f <containerName>  ← automatic cleanup
```

Container names follow the pattern `deckent-w-<taskId>` (e.g., `deckent-w-103-001`).

The container timeout is 20 minutes by default. You can override it via `config.json`:

```json
{
  "docker_timeout": 1800
}
```

This sets the timeout to 1800 seconds (30 minutes). If a worker exceeds the timeout, the `timeout` wrapper inside the container kills the process and writes a `.timeout` marker file to `.tasks/`.

---

## 6. Running a Sprint

Once Docker is configured:

```bash
# 1. Install Docker Engine (see Prerequisites)

# 2. Build the worker image
docker build -f Dockerfile.worker -t deckent-worker:latest .

# 3. Enable Docker backend
npx deckent config set spawn_backend docker

# 4. Write sprint directives
npx deckent set_directives

# 5. Plan the sprint
npx deckent plan

# 6. Start the sprint
npx deckent start

# 7. Monitor progress
npx deckent status --watch
```

### Checking Active Containers

While a sprint is running, you can inspect active worker containers:

```bash
# List running deckent containers
docker ps --filter name=deckent-w

# View container logs for a specific worker
docker logs deckent-w-103-001

# Check container resource usage
docker stats --no-stream --filter name=deckent-w
```

---

## 7. Troubleshooting

### 7.1 "dangerously-skip-permissions cannot be used with root"

**Symptom:** Worker task writes `NO_GO` immediately; container logs show this error.

**Cause:** The Docker daemon is running containers as root. This happens when:
- The Docker backend fails to detect `process.getuid()` (returns undefined)
- The container image overrides the user

**Fix:**
```bash
# Verify your UID is non-zero
id -u  # Should be >= 1000

# Check if docker group membership is active
groups | grep docker

# If not in docker group, add and re-login
sudo usermod -aG docker $USER
newgrp docker
```

If `process.getuid()` fails (rare on some platforms), the backend falls back to UID 1000. Ensure your host user has UID >= 1000.

### 7.2 "Not logged in" / Auth Errors

**Symptom:** Worker fails with authentication errors; `claude --version` works on host but not in container.

**Cause:** `~/.claude/` directory is empty or `.credentials.json` is missing.

**Diagnosis:**
```bash
# Check credentials exist on host
ls -la ~/.claude/
# Should include .credentials.json or similar auth files

# Verify host session is active
claude --version
```

**Fix:**
```bash
# Re-authenticate on host
claude auth login

# Then re-run the sprint (auth is volume-mounted, not baked into image)
npx deckent start
```

### 7.3 Container Timeout Issues

**Symptom:** Tasks write `.timeout` marker files; heartbeat shows `status: FAILED`.

**Cause:** The worker exceeded the container timeout (default: 1200 seconds / 20 minutes).

**Diagnosis:**
```bash
# Check timeout markers
ls .tasks/*.timeout

# Check container exit code (if container still exists)
docker logs deckent-w-<taskId>
```

**Fix — Increase timeout via config:**
```bash
npx deckent config set docker_timeout 1800  # 30 minutes
```

**Fix — Break tasks into smaller units:**
High-effort tasks should be split into sub-tasks in DIRECTIVES.

**Fix — Enable Fix Phase for retries:**
```bash
npx deckent config set fix_phase_enabled true
npx deckent config set max_fix_retries 2
```

### 7.4 Docker Not Available

**Symptom:** Sprint starts but immediately falls back to subprocess backend.

**Diagnosis:**
```bash
docker info
# If this fails, Docker daemon is not running
```

**Fix (Ubuntu/WSL2):**
```bash
sudo service docker start
# or
sudo systemctl start docker
```

**Fix (WSL2 with Docker Desktop):**
Open Docker Desktop on Windows and ensure the WSL2 integration is enabled for your distro.

### 7.5 Permission Denied on `.tasks/` Files

**Symptom:** Worker cannot write heartbeat or result files.

**Cause:** The `.tasks/` directory on the host was created by root or a different user.

**Fix:**
```bash
# Check ownership
ls -la .tasks/

# Fix ownership if needed
sudo chown -R $USER:$USER .tasks/
sudo chown -R $USER:$USER .locks/
```

---

## See Also

- [Quickstart Guide](quickstart.md) — General sprint setup
- [Configuration Reference](../reference/config-reference.md) — All config options
- [Architecture Overview](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/architecture.md) — Sprint lifecycle internals
