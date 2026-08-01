---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:5451b20443bf7095c83f3af13980b9a78875d866156ec1d8593cbc52ae310e74
---

# Sprint Load Test Report

Generated: 2026-06-10T21:04:05.714Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T20:34:04.369Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 6 | 5525.50 | 17284.25 | 18800.85 | 3473.00 | 19180.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1435444.92 | 1435444.92 | 1435444.92 | 1435444.92 | 1435444.92 |

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

1. **trace:wait_results** — p99: 1435444.92ms (1 samples)
2. **wave.transition** — p99: 18800.85ms (6 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (14 samples)
5. **collect.batch** — p99: 1.00ms (14 samples)
