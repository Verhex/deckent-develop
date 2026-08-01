# RAM Experiment Guide — Multi-Worker Memory Sizing

**Command:** `deckent doctor --ram-experiment`

Verify whether your host has enough RAM for a given `max_workers × worker_memory_limit` configuration before running a sprint.

---

## Quick Check

```bash
deckent doctor --ram-experiment
```

Example output (24 GB host, config `max_workers=6, worker_memory_limit=2g`):

```
RAM Experiment Report
Host RAM: 24 GB (source=meminfo)
Current config: max_workers=6, worker_memory_limit=2g
Peak RAM need: 12 GB (workers) + 2 GB (host overhead) = 14 GB
Recommendation: ✓ Safe
```

---

## How the Verdict is Computed

```
peak_worker_RAM = max_workers × worker_memory_limit
total_required  = peak_worker_RAM + 2 GB (host overhead)

Safe            → host_RAM ≥ total_required
Risky           → host_RAM < total_required
Cannot determine → host RAM could not be detected
```

The **2 GB host overhead** covers Brain, Auditor, OS page cache, and WSL2 VM baseline.

---

## Scenario Matrix

| Config | Peak Worker RAM | Host Overhead | Total Required | Min Safe Host |
|--------|---------------:|-------------:|---------------:|:-------------:|
| 2 workers × 3g  |  6 GB |  2 GB |  8 GB | 8 GB  |
| 6 workers × 2g  | 12 GB |  2 GB | 14 GB | 14 GB |
| 6 workers × 3g  | 18 GB |  2 GB | 20 GB | 20 GB |
| 12 workers × 2g | 24 GB |  2 GB | 26 GB | 26 GB |

**Recommendation:** For most developers with 16–32 GB RAM, `max_workers=6, worker_memory_limit=2g` is safe.

---

## WSL2 Configuration

If your host reports **Risky**, increase the WSL2 memory allocation:

```ini
# ~/.wslconfig (Windows host)
[wsl2]
memory=24GB
swap=8GB
```

After editing, restart WSL2:

```powershell
wsl --shutdown
wsl
```

Verify the new limit:

```bash
deckent doctor --ram-experiment
# Should now show ✓ Safe
```

---

## JSON Output

```bash
deckent doctor --ram-experiment --json
```

```json
{
  "hostGB": 24,
  "source": "meminfo",
  "maxWorkers": 6,
  "workerMemGB": 2,
  "peakWorkerGB": 12,
  "hostOverheadGB": 2,
  "totalRequiredGB": 14,
  "verdict": "Safe",
  "recommendation": "Host RAM (24 GB) ≥ required (14 GB). Config is safe."
}
```

Exit code is `1` when verdict is **Risky**, so this can gate CI/CD pipelines.

---

## Historical Context

Sprint 192 (`192-013`) documented first OOM incidents with `max_workers=2, worker_memory_limit=3g` on a 4 GB Docker-limited environment. Sprint 194 added `detectHostMemory()` (`/proc/meminfo` first, `os.totalmem()` fallback). Sprint 198 added `--ram-experiment` for pre-sprint RAM readiness verification.

See also: `deckent doctor --memory` (simple host RAM + suggested max_workers).
