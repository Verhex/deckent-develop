---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:0f9363385fb4c0c2386d40584362b14c6c89dabcc444702886c5d611554a7ac4
---

# Sprint Load Test Report

Generated: 2026-06-04T13:53:54.986Z
Total entries: 19

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-04T13:39:23.380Z | dep-pipeline | 4 |
| 2026-06-04T13:48:36.647Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 1 | 3631.00 | 3631.00 | 3631.00 | 3631.00 | 3631.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 356101.17 | 507174.67 | 520603.42 | 188241.73 | 523960.61 |

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

1. **trace:wait_results** — p99: 520603.42ms (2 samples)
2. **wave.transition** — p99: 3631.00ms (1 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (5 samples)
5. **collect.batch** — p99: 1.00ms (5 samples)
