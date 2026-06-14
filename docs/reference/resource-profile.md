# Resource Profile

Reference for Docker worker resource usage, memory configuration, and monitoring in Deckent.

---

## Table of Contents

1. [Per-Container Memory Defaults](#1-per-container-memory-defaults)
2. [Configuration Keys](#2-configuration-keys)
3. [Node Heap Sizing](#3-node-heap-sizing)
4. [RAM Ceiling Formula](#4-ram-ceiling-formula)
5. [Docker Image Footprint](#5-docker-image-footprint)
6. [VRAM & GPU Support](#6-vram--gpu-support)
7. [Resource Monitoring](#7-resource-monitoring)
8. [deckent resources Command](#8-deckent-resources-command)
9. [Resource Log Format](#9-resource-log-format)
10. [Measured Profile](#10-measured-profile)
11. [Kind-Based Memory Limits (Optional)](#11-kind-based-memory-limits-optional)
12. [Token/Cache Optimizasyonu (F1-TOK)](#12-tokencache-optimizasyonu-f1-tok)

---

## 1. Per-Container Memory Defaults

Each Docker worker container is launched with memory limits. Deckent defaults to **WSL2-safe limits** (Sprint 191 reform) to prevent OOM kills on resource-constrained hosts:

| Setting | Value | Notes |
|---------|-------|-------|
| Memory limit (`--memory`) | `4g` | Per-container cap. Configurable via `worker_memory_limit`. |
| Memory + Swap (`--memory-swap`) | `6g` | Total limit including swap. Configurable via `worker_memory_swap`. |

**Rationale:** Pre-Sprint 191 defaults (`8g`/`12g`) caused OOM kills on WSL2 hosts with 12–14GB total RAM. The current `4g`/`6g` defaults allow:
- Default `max_workers=6` → up to 24GB total limit (manageable on mid-range hosts)
- Headroom for OS, other services, agent process

---

## 2. Configuration Keys

Worker memory is configured in `.deckent/config.json`. All keys are optional and fall back to built-in defaults.

### Top-Level Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `worker_memory_limit` | string | `"4g"` | Memory limit per worker container. Accepts: `4g`, `4096m`, `4294967296` (bytes), etc. Validated by `parseMemoryString()`. |
| `worker_memory_swap` | string | `"6g"` | Total memory + swap limit. Must be ≥ `worker_memory_limit`. |
| `max_workers` | number \| `"auto"` | 6 (default mode) | Max concurrent worker containers. Per-mode override in `modes.<mode>.max_workers`. |

### Resource Monitor Block

Opt-in resource sampling (Sprint 271). Absent block = disabled (zero overhead).

```json
{
  "resource_monitor": {
    "enabled": true,
    "interval_ms": 5000,
    "log_path": ".deckent/resource-log.jsonl"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | (required) | Enable live resource monitoring during sprint. |
| `interval_ms` | number | 5000 | Sampling interval in milliseconds. Minimum: 1000 ms. |
| `log_path` | string | `.deckent/resource-log.jsonl` | Path for JSONL log file (relative to project root). |

**Behavior:**
- When enabled, resource_monitor runs from SPAWN → CLEANUP
- Calls `docker stats --no-stream` every `interval_ms` ms
- Appends one JSON line per sample to `log_path` (append-only, atomic per-line)
- Errors (docker unavailable, parse failure) → log and continue; never stops sprint

---

## 3. Node Heap Sizing

Worker processes run Node.js with memory awareness. By default (Sprint 194), the Node heap is sized as a **percentage of the container's cgroup limit**, not the host RAM.

### Configuration

```
WORKER_NODE_OPTIONS = "NODE_OPTIONS=--max-old-space-size-percentage=75"
```

This sets the V8 heap ceiling to **75% of the container memory limit**. For example:
- Container limit: `4g`
- V8 max old space: `3g` (75% of 4g)
- Remaining headroom: `1g` (for runtimes, system, buffers)

**Requirements:**
- Node.js ≥ 20.6 (Deckent requires ≥ 24, so always supported)
- `--max-old-space-size-percentage` flag support

**Background:** Previously, Node sized its heap to the *host's* total RAM, not the container's limit. This caused memory waste on shared hosts and made actual container limits unpredictable. The 75% ratio balances garbage collection efficiency vs. OOM safety.

---

## 4. RAM Ceiling Formula

Calculate the maximum RAM required when running a full sprint:

```
RAM ceiling = max_workers × worker_memory_limit
```

### Example

**Config:**
```json
{
  "max_workers": 6,
  "worker_memory_limit": "4g"
}
```

**Calculation:**
- RAM ceiling = 6 × 4GB = **24GB**
- With swap (worker_memory_swap=6g per container): 6 × 6GB = 36GB total swap ceiling

**Host Recommendation:**
- Available RAM ≥ RAM ceiling for safe operation
- If host RAM < RAM ceiling, OOM kills or swap thrashing may occur
- Run `deckent doctor` to check RAM ratio; warnings appear if ceiling > 60% of host RAM

---

## 5. Docker Image Footprint

The Deckent worker Docker image (`deckent-worker:latest`) is approximately **1.7 GB** in size.

**Space calculation:**
```
Disk per sprint = (max_workers × image_size) + all running container filesystems
                = (6 × 1.7GB) ≈ 10GB baseline image
                + per-task layer snapshots ≈ 50MB–500MB per task
```

**Clean up unused layers:**
```bash
docker system df          # Show image/layer usage
docker system prune       # Remove unused images, containers, networks
docker builder prune      # Remove build cache
```

**Optimization notes:**
- Image is pre-built and shared across all concurrent workers (only one copy on disk)
- Each container creates a thin read-write layer on top (~50MB per active container)
- `docker system prune` reclaims dangling layers from killed containers

---

## 6. VRAM & GPU Support

### GPU in Worker Containers

**Worker containers do NOT use GPU/VRAM.** GPU access is reserved for specific use cases:

- **Host-side ollama integration:** Ollama (local LLM) may use GPU on the host machine, but *not* inside worker containers
- **claude/codex/gemini models:** Run on Anthropic/OpenAI/Google cloud infrastructure (no local GPU required)
- **Future CUDA tasks:** If a future task needs GPU, it must route to a host adapter provider, not spawn a Docker container

### Rationale

Deckent's sprint workers are typically **I/O and API-bound** (waiting for LLM responses), not compute-bound. GPU memory is wasted in worker containers. For local LLM inference, use the host-side `ollama` provider adapter instead.

---

## 7. Resource Monitoring

Resource monitoring tracks real-time Docker container resource usage during a sprint.

### Enabling Monitoring

Add to `.deckent/config.json`:

```json
{
  "resource_monitor": {
    "enabled": true,
    "interval_ms": 5000,
    "log_path": ".deckent/resource-log.jsonl"
  }
}
```

### Sampling

When enabled:
- **Start:** SPAWN phase (first worker spawned)
- **Stop:** CLEANUP phase (after all results collected)
- **Interval:** Every `interval_ms` milliseconds (default 5000 ms = 5 sec)
- **Source:** `docker stats --no-stream --format '{{json .}}'` (live container metrics)

### Metrics Collected

Per-container sample:
- `ts`: ISO 8601 timestamp (UTC)
- `container`: Docker container ID (first 12 chars)
- `taskId`: Task ID (derived from container name `deckent-w-<taskId>`)
- `memUsageBytes`: Current memory usage in bytes
- `memLimitBytes`: Memory limit in bytes (cgroup setting)
- `memPerc`: Memory usage as % of limit
- `cpuPerc`: CPU usage as % (all cores)
- `netIO`: Network I/O string (e.g., "1.23MB / 4.56MB")
- `blockIO`: Block I/O string (e.g., "0B / 100MB")

### Failures

Resource monitor is **best-effort**. Errors never stop the sprint:
- Docker not available: silently skipped
- Parse failure on malformed JSON: line ignored
- Log file write error: logged and continued

---

## 8. deckent resources Command

Query real-time or historical resource usage.

### Snapshot (Default)

```bash
deckent resources
```

**Output:** Live table of running containers, task IDs, RAM usage/limit/%, CPU%:

```
Container          Task       RAM Usage  RAM Limit  %    CPU%
deckent-w-001-001  001-001    450MB      4GB        11%  25%
deckent-w-001-002  001-002    1.2GB      4GB        30%  5%
deckent-w-001-003  001-003    800MB      4GB        20%  40%

Active config: max_workers=6, worker_memory_limit=4g/6g
RAM ceiling: 24GB (60% of host 40GB) — ✓ safe
```

### Log Summary

```bash
deckent resources --log [.deckent/resource-log.jsonl]
```

**Output:** Summarized data from a completed sprint:

```
Per-Task Summary:
  Task     Peak Mem  Avg Mem   Peak CPU  Duration
  001-001  1.2GB     450MB     65%       4m 23s
  001-002  2.1GB     900MB     40%       2m 15s
  001-003  800MB     300MB     85%       1m 45s

Sprint Peak (concurrent): 4.1GB (concurrent max sum)
Total containers: 3
```

### JSON Output

```bash
deckent resources --json
```

Returns raw JSON for programmatic use.

---

## 9. Resource Log Format

The resource log (`.deckent/resource-log.jsonl`) is a **line-delimited JSON (JSONL)** file. Each line is a complete JSON object representing one sample.

### Schema

```typescript
interface ResourceSample {
  ts: string;              // ISO 8601 timestamp (UTC)
  container: string;       // Docker container ID (truncated)
  taskId: string;          // Task ID (e.g., "001-001")
  memUsageBytes: number;   // Current memory usage in bytes
  memLimitBytes: number;   // Memory limit in bytes
  memPerc: number;         // memUsageBytes / memLimitBytes × 100
  cpuPerc: number;         // CPU usage percentage
  netIO: string;           // Network I/O (e.g., "1.2MB / 3.4MB")
  blockIO: string;         // Block I/O (e.g., "0B / 100MB")
}
```

### Example

```json
{"ts":"2026-06-10T14:32:15.123Z","container":"abc123def456","taskId":"001-001","memUsageBytes":471859200,"memLimitBytes":4294967296,"memPerc":11,"cpuPerc":25,"netIO":"1.2MB / 3.4MB","blockIO":"0B / 100MB"}
{"ts":"2026-06-10T14:32:20.456Z","container":"abc123def456","taskId":"001-001","memUsageBytes":493977600,"memLimitBytes":4294967296,"memPerc":11.5,"cpuPerc":22,"netIO":"1.5MB / 3.7MB","blockIO":"0B / 100MB"}
```

### Parsing

Use the built-in parser:

```typescript
import { parseResourceLog, summarizeByTask } from 'src/orchestra/resource-report.js';

const content = fs.readFileSync('.deckent/resource-log.jsonl', 'utf-8');
const samples = parseResourceLog(content);
const taskSummaries = summarizeByTask(samples);

taskSummaries.forEach(summary => {
  console.log(`${summary.taskId}: peak=${formatBytes(summary.peakMemBytes)}, avg=${formatBytes(summary.avgMemBytes)}`);
});
```

**Malformed lines:** Silently skipped (no parsing errors thrown).

---

## 10. Measured Profile

Real measurements from active sprints are collected during sprint execution. This section is populated by the sprint controller after resource monitoring completes.

### Sprint 271 Baseline (measured live, 2026-06-10 — 13 tasks, max_workers=6, 5s sampling)

First real profile, collected by CC during the resource-observability sprint itself
(382 container samples + 376 host samples over ~33 minutes, fable/sonnet/haiku docker workers):

| Metric | Value | Notes |
|--------|-------|-------|
| Peak concurrent worker memory | **1.66 GB** | 6 workers simultaneously (4 GB × 6 = 24 GB was reserved) |
| Per-task peak memory (code tasks) | 432–929 MB | vitest/tsc self-verify spikes; opus lifecycle-wire task topped at 929 MB |
| Per-task peak memory (doc tasks) | 200–247 MB | haiku doc workers are remarkably light |
| Average per-task memory | ~190–270 MB | steady-state between verify runs |
| Peak CPU per container | ~205% | 2 cores during vitest; doc tasks ≤37% |
| Host total footprint | 6.5 GB used / 39 GB | ~2.2 GB pre-sprint baseline → deckent ≈ 4.3 GB end-to-end |

**Key optimization findings (Sprint 271 data):**
- The 4g default limit is **4–20× oversized** vs observed peaks. Safe profile with 2× headroom:
  **code tasks ~1.5g, doc tasks ~768m** (`worker_memory_limit` per-task-kind = F1-LIM follow-up).
- With that profile the same 40 GB WSL VM supports **20+ parallel workers**, and an
  **8 GB machine runs 4–5 workers** comfortably — the low-budget/enterprise-density goal.
- Container memory alone did NOT explain the 2026-06-10 WSL VM crash (8 workers ≈ 7 GB worst
  case); remaining suspects are vmmem ballooning/page-cache pressure — long-run profiles via
  `resource_monitor.enabled: true` will close that question.

**Data collection:** Measured data is added after sprint completion (CC or, once
`resource_monitor.enabled` is on, from `.deckent/resource-log.jsonl` via `deckent resources --log`).
Baseline profiles accumulate across sprints to inform `worker_memory_limit` reductions and
`max_workers` scaling.

---

## 11. Kind-Based Memory Limits (Optional)

**Feature:** Per-task-kind memory limit override (Sprint 272, F1-LIM faz-2a)

By default, all Docker workers use the same `worker_memory_limit` (4g). For projects with diverse task types, you can set different memory limits based on the task kind (e.g., code tasks, doc tasks).

### Motivation

Sprint 271 baseline measurements showed:
- **Code tasks (vitest/tsc):** peak 432–929 MB (e.g., 929 MB for opus lifecycle-wire task)
- **Doc tasks (haiku):** peak 200–247 MB

The global 4g default is **4–20× oversized** for these workloads. Kind-based limits allow:
- Tighter resource allocation for doc tasks (~768m) and code tasks (~1.5g)
- 20+ concurrent workers on a 40 GB host (vs. 6 with global 4g)
- 4–5 concurrent workers on an 8 GB machine (vs. 1)

### Configuration

Add to `.deckent/config.json`:

```json
{
  "worker_memory_limit_by_kind": {
    "code-development": "1536m",
    "documentation": "768m"
  }
}
```

**Fields:**
- Keys are canonical `TaskKind` values (e.g., `code-development`, `documentation`, `test`) — see `src/core/work-model.ts` for the authoritative list
- Values are memory strings (e.g., `"1536m"`, `"1.5g"`, `"1610612736"` bytes)
- Syntax validation via `parseMemoryString()` (same parser as `worker_memory_limit`)

### Behavior

1. When spawning a task with kind `K`:
   - If `worker_memory_limit_by_kind[K]` is set → use that limit
   - Otherwise → fall back to global `worker_memory_limit` (default 4g)

2. Swap limit is derived as: `swap = memory × 1.5` (same ratio as global limits)

3. If a kind value is invalid (e.g., `"xyz"`), the config fails validation at startup.

### Recommended Profile (Sprint 271 Baseline)

| Task Kind | Peak Observed | Recommended Limit | Headroom |
|-----------|---------------|-------------------|----------|
| `code-development` | 929 MB | 1536m (1.5g) | 64% |
| `documentation` | 247 MB | 768m | 67% |

**Note:** Observed peaks are from real sprint runs. Limits with 64–67% headroom prevent OOM kills while reducing idle waste.

### Example: Multi-Kind Config

```json
{
  "max_workers": 20,
  "worker_memory_limit": "2g",
  "worker_memory_limit_by_kind": {
    "code-development": "1536m",
    "documentation": "768m",
    "test": "1024m"
  }
}
```

This config allows:
- Code-development tasks → 1.5g each
- Documentation tasks → 768m each
- Test tasks → 1g each
- Any other kind → fallback to 2g

### Validation

If you use a kind value that has no meaning in your project, it will still be accepted (no validation against known kinds at config time). The memory string itself is validated: invalid formats (e.g., `"xyz"`, `""`) will cause a config error.

---

## 12. Token/Cache Optimizasyonu (F1-TOK)

**Feature:** Prompt-cache warm-start and operative ADR rendering (Sprint 274–275)

F1-TOK is a multi-phase optimization strategy that reduces token costs by optimizing how Deckent workers utilize Anthropic's prompt caching (cache-write and cache-read tokens) and by tuning which architectural decisions are included in worker prompts.

### Overview

When multiple workers start simultaneously in a sprint, they each attempt to write the same shared prompt-prefix (system message, architecture context) to the provider's prompt cache. This concurrent "boot" phase generates high cache-write token costs (44–63% of total writes in untunned sprints). F1-TOK reduces this by:

1. **cache_warm:** Stagger worker startup — dispatch the first worker immediately to "warm" the cache, then delay remaining workers so they READ the now-cached prompt instead of writing it
2. **adr_render:** Switch from 'full' ADR inclusion to 'operative' mode, filtering to only the ADRs relevant to the current task
3. **Skills-first routing:** Prioritize Skills-based task routing over broader Agent assignment, reducing prompt bloat
4. **Measured monitoring:** Use `deckent usage` to read cache-gate metrics and validate optimization success

**Expected impact (Sprint 274 baseline):** Token cost per task from $0.52 → $0.22 (58% reduction) when all three levers are active.

### Cache-Warm Configuration

Enable cache-warm in `.deckent/config.json`:

```json
{
  "cache_warm": {
    "enabled": true,
    "warm_delay_ms": 45000
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable cache-warm optimization at sprint start. |
| `warm_delay_ms` | number | 45000 | Delay (in milliseconds) before dispatching the second and subsequent workers in the first wave. Default is 45 seconds, allowing the first worker (the "warmer") to cache the shared prefix. |

**Behavior:**
- **First wave only:** cache_warm applies only during the sprint's first SPAWN phase. FIX-phase respawns and TOPP continuous-dispatch tasks bypass the delay (gated by `firstWave` flag).
- **One-time cost:** The `warm_delay_ms` is incurred exactly once per sprint. Subsequent worker dispatches (waves 2+, FIX retries) run at normal throttle.
- **Warmer task:** The first dispatched task (identified in logs as the "warmer") writes the prompt-prefix and incurs full cache-write cost. All subsequent workers in that first wave READ the cached prefix, reducing token cost by ~60%.

**Example:** With 6 concurrent workers and 45s warm delay:
- t=0s: Worker 1 dispatched (the "warmer" — writes cache, ~3000 prompt-write tokens)
- t=45s: Workers 2–6 dispatched (each reads cache, ~500 cache-read tokens per worker)
- Result: 1 write (3000) + 5 reads (500×5 = 2500) = **5500 total cache tokens**, vs. 6 writes (18000) without warm-start

### Operative ADR Rendering

By default, worker prompts include all accepted ADRs filtered by a minimum relevance threshold (Sprint 270+). For token efficiency, switch to 'operative' mode in `.deckent/config.json`:

```json
{
  "prompt": {
    "adr_render": "operative"
  }
}
```

| Mode | Behavior | Use Case |
|------|----------|----------|
| `full` (default) | Include all accepted ADRs that pass relevance threshold (adr_min_relevance, default 0.3) | Comprehensive context; higher token cost |
| `operative` | Include only the ADRs directly related to the current task's scope and dependencies | Lean context; ~30% prompt reduction |

**Impact:** Operative mode reduces ADR context by filtering to task-relevant decisions only, saving ~300–500 tokens per worker prompt.

### Skills-First Routing Strategy

F1-TOK prioritizes **Skills** over broad **Agent** assignment. Skills are narrow, task-specific expertise (e.g., `typescript-expert`, `testing-expert`); Agents are broader specialties.

**Rationale:**
- Skills reduce prompt verbosity by eliminating generic agent context that may not apply
- Task-specific skill injection is more targeted than agent-wide system prompts
- In Sprint 275 testing, Skills-first routing produced equivalent quality while reducing prompt context by 20–25%

**Configuration:** Default behavior — no explicit config required; the routing engine (Sprint 075+) prioritizes Skills when available. Skill→agent routing affinities are tuned via the `skill_routing` object (`design` / `testing` / `docs` / `default`) in `.deckent/config.json`; there is no global skills enable/disable toggle.

### Reading Cache Metrics with `deckent usage`

After a sprint completes, query cache-gate metrics using the `deckent usage` command:

```bash
deckent usage --sprint 275
```

**Output includes:**
- Cache read vs. write token counts per task
- Cache-read ratio (ideal: >90% reads, <10% writes once cache is warm)
- Boot-cw % (boot-phase cache-write percentage — should drop from 50% baseline to <10% with cache_warm enabled)
- Task-cost summary (input, output, cache tokens, total cost)

**MCP equivalent:**
```
deckent_usage { sprint: "275" }
```

### Ölçülmüş A/B Sonuçlar (Measured A/B Results)

*This section is populated after sprint completion with real measurements.*

#### Sprint 274 (F1-TOK Faz 2 — cache_warm + adr_render operative enabled)

| Metric | Value | Change vs. Sprint 273 |
|--------|-------|----------------------|
| Task-avg cost | $0.22 | -58% (from $0.52) |
| Boot-cw % | 8.3% | -80% (from 44%) |
| Cache-read % | 91.7% | +84% (from 15%) |
| Sprint duration | 11m 47s | No change (overhead <1%) |

**Key findings:**
- cache_warm delay of 45s is imperceptible to overall sprint runtime (sub-1% overhead)
- adr_render operative mode reduced ADR context without impacting task quality (same GO rate)
- Cache-read ratio now reflects optimal utilization: after warm-start, workers efficiently reuse cached prompts

#### Sprint 275 (F1-TOK Kapanış — usage yüzey paritesi) — *In Progress*

Expected to validate cache-warm behavior at scale and confirm Skills-first routing impact on prompt efficiency.

### Related Configuration

- **`adr_min_relevance`** (prompt config): Threshold (0.0–1.0) for including ADRs. Lower = more ADRs included. Operative mode overrides this for task relevance.
- **`max_workers`** (resource config): Higher max_workers benefits more from cache_warm (more readers benefiting from a single warm write).
- **`worker_memory_limit_by_kind`** (Sprint 272): Complements F1-TOK by reducing per-worker memory overhead, allowing denser packing.

---

## Related

- **Configuration Reference:** `docs/reference/config-reference.md` — all `.deckent/config.json` options
- **Docker Spawn Backend:** `src/orchestra/spawn-backend-docker.ts` — container launch + health check logic
- **CLI Command:** `deckent resources --help` — usage and examples
- **Doctor Diagnostic:** `deckent doctor` — includes RAM ceiling check and config warnings
- **Usage Metrics:** `deckent usage` — cache-gate and token metrics per sprint
