# Sprint Load Test Report

Generated: 2026-07-18T17:28:59.427Z
Total entries: 54

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-18T15:36:56.087Z | dep-pipeline | 4 |
| 2026-07-18T17:00:49.468Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.40 | 1.88 | 1.00 | 2.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 2903191.05 | 4224942.41 | 4342431.42 | 1434578.43 | 4371803.67 |

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

1. **trace:wait_results** — p99: 4342431.42ms (2 samples)
2. **collect.batch** — p99: 1.88ms (13 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (9 samples)
4. **result.collected** — p99: 1.00ms (14 samples)
5. **honesty.check** — p99: 1.00ms (4 samples)
