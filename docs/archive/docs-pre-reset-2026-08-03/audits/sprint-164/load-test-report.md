---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:96d58783d0a089c2f1770742fc6d1ef023a14ec3c6e8d9b49e0be7ccc189b5cd
---

# Sprint Load Test Report

Generated: 2026-05-13T07:55:29.555Z
Total entries: 20

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-13T06:22:09.780Z | legacy | 3 |
| 2026-05-13T07:52:36.609Z | legacy | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.50 | 2.95 | 2.99 | 2.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 5212568.09 | 5212568.09 | 5212568.09 | 5212568.09 | 5212568.09 |

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

1. **trace:wait_results** — p99: 5212568.09ms (1 samples)
2. **collision.detected** — p99: 2.99ms (2 samples)
3. **result.collected** — p99: 1.00ms (5 samples)
4. **collect.batch** — p99: 1.00ms (5 samples)
5. **honesty.check** — p99: 1.00ms (4 samples)
