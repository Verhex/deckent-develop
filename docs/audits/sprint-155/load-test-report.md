# Sprint Load Test Report

Generated: 2026-05-12T12:36:00.235Z
Total entries: 24

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-12T12:27:50.933Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 279472.79 | 279472.79 | 279472.79 | 279472.79 | 279472.79 |

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

1. **trace:wait_results** — p99: 279472.79ms (1 samples)
2. **result.collected** — p99: 1.00ms (10 samples)
3. **collect.batch** — p99: 1.00ms (10 samples)
4. **honesty.check** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
