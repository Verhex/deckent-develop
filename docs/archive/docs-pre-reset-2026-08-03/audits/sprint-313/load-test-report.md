---
doc_rank: 50
status: active
last_updated: 2026-06-20
content_hash: sha256:2a64d8be6b7292917457d2bb87f98ef23801290b8df82479a10adb1d1274bda6
---

# Sprint Load Test Report

Generated: 2026-06-20T06:34:18.832Z
Total entries: 58

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-20T06:17:03.960Z | dep-pipeline | 8 |
| 2026-06-20T06:31:49.342Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 30 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 18 | 1.00 | 7.15 | 7.83 | 1.00 | 8.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 11773.00 | 11773.00 | 11773.00 | 11773.00 | 11773.00 |
| trace:wait_results | 2 | 400843.22 | 750416.46 | 781489.64 | 12428.50 | 789257.93 |

## File Lock Histogram

| Bucket (ms) | Count |
|-------------|-------|
| <=0 | 0 |
| 0-10 | 0 |
| 10-50 | 0 |
| 50-100 | 0 |
| 100-500 | 0 |
| 500-1000 | 0 |
| 1000-5000 | 0 |
| >5000 | 0 |

## Critical Path Analysis

Top 5 slowest operations by p99:

1. **trace:wait_results** — p99: 781489.64ms (2 samples)
2. **wave.transition** — p99: 11773.00ms (1 samples)
3. **collect.batch** — p99: 7.83ms (18 samples)
4. **result.collected** — p99: 1.00ms (30 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
