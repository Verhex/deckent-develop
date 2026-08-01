---
doc_rank: 50
status: active
last_updated: 2026-06-20
content_hash: sha256:9f89d645dbdd53fb7a288ed4425bdb2000b40db9e1fc87364fbca2b59efcb0cb
---

# Sprint Load Test Report

Generated: 2026-06-20T06:10:01.603Z
Total entries: 75

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-20T05:29:16.474Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 36 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 34 | 1.00 | 1.35 | 2.00 | 1.00 | 2.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1809492.16 | 1809492.16 | 1809492.16 | 1809492.16 | 1809492.16 |

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

1. **trace:wait_results** — p99: 1809492.16ms (1 samples)
2. **collect.batch** — p99: 2.00ms (34 samples)
3. **result.collected** — p99: 1.00ms (36 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
