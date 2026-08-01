---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:8ebe05938ddc79dfe195f7f9b383ac0178566cb1f43d9ed9f7f3d37d83b312f1
---

# Sprint Load Test Report

Generated: 2026-06-19T14:12:10.435Z
Total entries: 37

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T13:47:34.114Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 3 | 3586.00 | 7213.90 | 7536.38 | 3551.00 | 7617.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1261922.22 | 1261922.22 | 1261922.22 | 1261922.22 | 1261922.22 |

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

1. **trace:wait_results** — p99: 1261922.22ms (1 samples)
2. **wave.transition** — p99: 7536.38ms (3 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (12 samples)
5. **collect.batch** — p99: 1.00ms (12 samples)
