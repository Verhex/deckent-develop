---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:a8bde34ac9d2fb74959010309e3ef8304c48a73b462a8d719ec6f0d3e2a2849f
---

# Sprint Load Test Report

Generated: 2026-06-09T16:17:49.449Z
Total entries: 47

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T15:53:59.788Z | dep-pipeline | 8 |
| 2026-06-09T16:09:37.722Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 627120.19 | 843999.76 | 863277.94 | 386142.89 | 868097.49 |

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

1. **trace:wait_results** — p99: 863277.94ms (2 samples)
2. **result.collected** — p99: 1.00ms (17 samples)
3. **collect.batch** — p99: 1.00ms (17 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (7 samples)
