---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:b8991e564c4ddd82bffd2c124d1a073d553e03bf73cc5c5bcf30a96291002c36
---

# Sprint Load Test Report

Generated: 2026-06-09T07:13:23.183Z
Total entries: 45

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T07:05:58.315Z | dep-pipeline | 8 |
| 2026-06-09T07:08:49.201Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 138315.89 | 143949.03 | 144449.76 | 132056.83 | 144574.94 |

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

1. **trace:wait_results** — p99: 144449.76ms (2 samples)
2. **result.collected** — p99: 1.00ms (15 samples)
3. **collect.batch** — p99: 1.00ms (15 samples)
4. **hb.stale** — p99: 1.00ms (9 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
