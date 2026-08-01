---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:81678fc1002d7d6358bd4ade2d415705fe96c921bcdb83127faebaa6ddf0c65b
---

# Sprint Load Test Report

Generated: 2026-05-31T17:14:17.876Z
Total entries: 45

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T16:59:00.870Z | dep-pipeline | 6 |
| 2026-05-31T17:07:45.811Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3610.00 | 3633.40 | 3635.48 | 3584.00 | 3636.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 361556.48 | 473747.30 | 483719.82 | 236900.01 | 486212.95 |

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

1. **trace:wait_results** — p99: 483719.82ms (2 samples)
2. **wave.transition** — p99: 3635.48ms (2 samples)
3. **hb.stale** — p99: 1.00ms (2 samples)
4. **result.collected** — p99: 1.00ms (16 samples)
5. **collect.batch** — p99: 1.00ms (16 samples)
