# Sprint Load Test Report

Generated: 2026-07-14T06:20:38.597Z
Total entries: 37

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-13T22:30:32.437Z | dep-pipeline | 1 |
| 2026-07-14T05:25:54.036Z | dep-pipeline | 3 |
| 2026-07-14T06:07:16.346Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 9 | 1.00 | 2.80 | 3.76 | 1.00 | 4.00 |
| skill.prompt_load_failed | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 3 | 1038644.46 | 2140191.24 | 2238106.51 | 659241.89 | 2262585.33 |

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

1. **trace:wait_results** — p99: 2238106.51ms (3 samples)
2. **collect.batch** — p99: 3.76ms (9 samples)
3. **result.collected** — p99: 1.00ms (12 samples)
4. **skill.prompt_load_failed** — p99: 1.00ms (4 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
