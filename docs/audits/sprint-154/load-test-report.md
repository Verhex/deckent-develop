# Sprint Load Test Report

Generated: 2026-05-12T11:55:13.753Z
Total entries: 26

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-12T11:39:24.437Z | legacy | 6 |
| 2026-05-12T11:49:53.716Z | legacy | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 372987.12 | 571055.60 | 588661.69 | 152911.03 | 593063.21 |

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

1. **trace:wait_results** — p99: 588661.69ms (2 samples)
2. **collision.detected** — p99: 4.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (9 samples)
4. **collect.batch** — p99: 1.00ms (9 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
