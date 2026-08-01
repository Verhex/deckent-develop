---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:c1cf02bd3de9315a763bb0139b9b3d8687ab5eca1255d7462b3c017d4aeb6df5
---

# Sprint Load Test Report

Generated: 2026-06-10T18:36:14.755Z
Total entries: 44

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T18:14:10.656Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 5 | 7066.00 | 10587.80 | 11222.36 | 3468.00 | 11381.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.45 | 1.89 | 1.00 | 2.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 998036.07 | 998036.07 | 998036.07 | 998036.07 | 998036.07 |

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

1. **trace:wait_results** — p99: 998036.07ms (1 samples)
2. **wave.transition** — p99: 11222.36ms (5 samples)
3. **collect.batch** — p99: 1.89ms (12 samples)
4. **collision.detected** — p99: 1.00ms (1 samples)
5. **hb.stale** — p99: 1.00ms (5 samples)
