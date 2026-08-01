# Sprint Load Test Report

Generated: 2026-07-20T08:41:02.417Z
Total entries: 28

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-20T06:50:25.134Z | dep-pipeline | 8 |
| 2026-07-20T07:16:14.507Z | dep-pipeline | 2 |
| 2026-07-20T07:57:21.913Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 2440731.20 | 2440731.20 | 2440731.20 | 2440731.20 | 2440731.20 |

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

1. **trace:wait_results** — p99: 2440731.20ms (1 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (6 samples)
3. **result.collected** — p99: 1.00ms (6 samples)
4. **collect.batch** — p99: 1.00ms (5 samples)
5. **honesty.check** — p99: 1.00ms (3 samples)
