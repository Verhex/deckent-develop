# Sprint Load Test Report

Generated: 2026-06-28T12:48:00.377Z
Total entries: 54

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-28T12:27:03.005Z | dep-pipeline | 12 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 28 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 22 | 1.00 | 2.00 | 3.58 | 1.00 | 4.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 957310.58 | 957310.58 | 957310.58 | 957310.58 | 957310.58 |

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

1. **trace:wait_results** — p99: 957310.58ms (1 samples)
2. **collect.batch** — p99: 3.58ms (22 samples)
3. **result.collected** — p99: 1.00ms (28 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
