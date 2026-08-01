---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:6dd466408312a2d733eef0f7a14bcf811f2055e5249e7dd17972433636fbf1c6
---

# Sprint Load Test Report

Generated: 2026-06-10T17:53:02.943Z
Total entries: 31

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T17:24:48.855Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3464.00 | 6891.95 | 7372.79 | 3426.00 | 7493.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1364254.30 | 1364254.30 | 1364254.30 | 1364254.30 | 1364254.30 |

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

1. **trace:wait_results** — p99: 1364254.30ms (1 samples)
2. **wave.transition** — p99: 7372.79ms (4 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (2 samples)
5. **queue.force_rescan_spawn** — p99: 1.00ms (2 samples)
