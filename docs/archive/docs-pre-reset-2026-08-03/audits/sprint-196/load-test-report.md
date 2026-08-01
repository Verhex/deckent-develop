---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:b61dfaf24f3c20ae6e2fcf9eb72d40f2bdc4d63667bcff6931bab4f140debf22
---

# Sprint Load Test Report

Generated: 2026-05-26T16:31:04.543Z
Total entries: 98

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-26T15:50:09.487Z | dep-pipeline | 3 |
| 2026-05-26T16:20:06.616Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 5 | 3545.00 | 8457.00 | 9425.80 | 2977.00 | 9668.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 57 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1229764.65 | 1794972.86 | 1845213.59 | 601755.52 | 1857773.77 |

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

1. **trace:wait_results** — p99: 1845213.59ms (2 samples)
2. **wave.transition** — p99: 9425.80ms (5 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (12 samples)
5. **collect.batch** — p99: 1.00ms (12 samples)
