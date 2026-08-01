---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:37504921864cd3f07b8fcf449c6847f7a4801c29f8a390c72ce8a99fc69c657b
---

# Sprint Load Test Report

Generated: 2026-05-18T19:44:34.059Z
Total entries: 81

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-18T19:28:57.265Z | dep-pipeline | 4 |
| 2026-05-18T19:39:38.559Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 22 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 22 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 12 | 3536.00 | 11235.30 | 12350.26 | 2088.00 | 12629.00 |
| hb.stale | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 371040.44 | 573936.43 | 591971.63 | 145600.45 | 596480.43 |

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

1. **trace:wait_results** — p99: 591971.63ms (2 samples)
2. **wave.transition** — p99: 12350.26ms (12 samples)
3. **result.collected** — p99: 1.00ms (22 samples)
4. **collect.batch** — p99: 1.00ms (22 samples)
5. **hb.stale** — p99: 1.00ms (20 samples)
