---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d4142fc3f1bd3b61c75bf01bf64f0f28fe75652496189f322848cc7ffde853a8
---

# Sprint Load Test Report

Generated: 2026-06-18T12:07:06.235Z
Total entries: 27

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-18T11:37:28.382Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3584.00 | 3584.00 | 3584.00 | 3584.00 | 3584.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1655381.80 | 1655381.80 | 1655381.80 | 1655381.80 | 1655381.80 |

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

1. **trace:wait_results** — p99: 1655381.80ms (1 samples)
2. **wave.transition** — p99: 3584.00ms (1 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (4 samples)
5. **result.collected** — p99: 1.00ms (6 samples)
