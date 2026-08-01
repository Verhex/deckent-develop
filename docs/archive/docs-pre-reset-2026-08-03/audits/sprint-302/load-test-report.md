---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:58331d286525661416bb62270cffbe136dce8a1548df5598b89a7d4b1c6992c1
---

# Sprint Load Test Report

Generated: 2026-06-19T13:25:09.684Z
Total entries: 12

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T12:53:27.255Z | dep-pipeline | 2 |
| 2026-06-19T13:16:35.095Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 897927.47 | 1353035.09 | 1393489.10 | 392252.33 | 1403602.60 |

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

1. **trace:wait_results** — p99: 1393489.10ms (2 samples)
2. **result.collected** — p99: 1.00ms (3 samples)
3. **collect.batch** — p99: 1.00ms (3 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
