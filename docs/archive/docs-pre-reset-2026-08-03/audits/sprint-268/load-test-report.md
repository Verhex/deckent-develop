---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:4050a48a474956d05e6da082a0c94dae7466740a9a12da08fedca661fe95d399
---

# Sprint Load Test Report

Generated: 2026-06-10T06:02:48.836Z
Total entries: 22

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T05:35:54.059Z | dep-pipeline | 6 |
| 2026-06-10T05:58:27.953Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 655831.44 | 1125253.90 | 1166980.34 | 134250.93 | 1177411.95 |

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

1. **trace:wait_results** — p99: 1166980.34ms (2 samples)
2. **result.collected** — p99: 1.00ms (6 samples)
3. **collect.batch** — p99: 1.00ms (7 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (3 samples)
