# Sprint Load Test Report

Generated: 2026-07-11T23:01:14.407Z
Total entries: 24

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-11T22:23:02.972Z | dep-pipeline | 3 |
| 2026-07-11T22:37:06.742Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1126287.83 | 1332815.26 | 1351173.25 | 896812.92 | 1355762.75 |

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

1. **trace:wait_results** — p99: 1351173.25ms (2 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (4 samples)
3. **result.collected** — p99: 1.00ms (6 samples)
4. **collect.batch** — p99: 1.00ms (6 samples)
5. **fix.routing.preserved** — p99: 1.00ms (3 samples)
