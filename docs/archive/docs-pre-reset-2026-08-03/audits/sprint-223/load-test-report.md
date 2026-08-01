---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d7e0a705c22b85f3fb2907bb51b53b92e7903b735d670fdab29c8cc9f3436f95
---

# Sprint Load Test Report

Generated: 2026-06-02T11:42:55.707Z
Total entries: 36

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-02T11:24:40.481Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.45 | 1.89 | 1.00 | 2.00 |
| wave.transition | 3 | 3546.00 | 3945.60 | 3981.12 | 3511.00 | 3990.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 914236.02 | 914236.02 | 914236.02 | 914236.02 | 914236.02 |

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

1. **trace:wait_results** — p99: 914236.02ms (1 samples)
2. **wave.transition** — p99: 3981.12ms (3 samples)
3. **collect.batch** — p99: 1.89ms (12 samples)
4. **result.collected** — p99: 1.00ms (13 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
