# Troubleshooting Guide

## Tmux Backend Deprecation

**Status:** DEPRECATED — tmux backend will be removed in Sprint 178.

### Background

Sprint 176 uncovered a critical issue: the `auto` backend resolution chain was selecting `tmux` as a fallback when Docker was unavailable, causing unexpected behavior including incorrect process isolation and stale metadata after `deckent kill`.

Starting from Sprint 177, the `auto` mode resolves directly to `docker`. Explicit `spawn_backend: "tmux"` still works but emits a deprecation warning.

### Migration Steps

**From tmux → docker (recommended):**

```bash
# Update your project config
deckent config set spawn_backend docker

# Verify the change
deckent config read | grep spawn_backend
```

Or edit `.deckent/config.json` directly:

```json
{
  "spawn_backend": "docker"
}
```

**From tmux → subprocess (Windows / no Docker):**

```bash
deckent config set spawn_backend subprocess
```

### Docker Setup

If Docker is not installed, follow the [Docker Backend Guide](./docker-backend.md).

Quick check:

```bash
docker info
# Should show Docker daemon info without errors
```

### Deprecation Warning

When `spawn_backend: "tmux"` is set, deckent emits this warning once per sprint:

```
[deckent] DEPRECATION: spawn_backend="tmux" is deprecated and will be removed in Sprint 178.
Migrate to spawn_backend="docker" (recommended) or spawn_backend="subprocess" (Windows fallback).
See docs/guide/troubleshooting.md for migration instructions.
```

The warning is emitted only once per sprint lifecycle to avoid noise.

### Timeline

| Sprint | Change |
|--------|--------|
| 177 | `auto` resolves to `docker`; `tmux` emits deprecation warning |
| 178 | tmux backend code removed; `spawn_backend: "tmux"` causes error |

---

## Common Issues

### Workers not starting

1. Check Docker is running: `docker info`
2. Check deckent config: `deckent config read`
3. Check spawn_backend: should be `"docker"` or `"subprocess"`

### Sprint stuck after kill

See [Sprint Recovery Guide](./config-recovery.md).

### Config lost after regen

See [Config Recovery Guide](./config-recovery.md).
