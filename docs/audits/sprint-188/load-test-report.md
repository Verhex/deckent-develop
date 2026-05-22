# Sprint Load Test Report

Generated: 2026-05-22T14:31:25.217Z
Total entries: 76

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-22T14:03:54.061Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 47 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 5403.00 | 6972.60 | 7112.12 | 3659.00 | 7147.00 |
| trace:wait_results | 1 | 1555584.48 | 1555584.48 | 1555584.48 | 1555584.48 | 1555584.48 |

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

1. **trace:wait_results** — p99: 1555584.48ms (1 samples)
2. **wave.transition** — p99: 7112.12ms (2 samples)
3. **hb.stale** — p99: 1.00ms (47 samples)
4. **result.collected** — p99: 1.00ms (12 samples)
5. **collect.batch** — p99: 1.00ms (12 samples)
