---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:0e033542c8f85fc0708114adaec802a1338478cd0631cd8f7e99baba1343a5e7
---

# Sprint Load Test Report

Generated: 2026-06-01T00:02:30.310Z
Total entries: 56

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T23:35:17.036Z | dep-pipeline | 6 |
| 2026-05-31T23:52:36.766Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3689.00 | 3977.90 | 4003.58 | 3595.00 | 4010.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 773253.62 | 1022971.77 | 1045168.94 | 495789.01 | 1050718.23 |

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

1. **trace:wait_results** — p99: 1045168.94ms (2 samples)
2. **wave.transition** — p99: 4003.58ms (3 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (20 samples)
5. **collect.batch** — p99: 1.00ms (20 samples)
