# Sprint Load Test Report

Generated: 2026-07-18T11:26:22.643Z
Total entries: 27

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-18T11:12:04.874Z | dep-pipeline | 3 |
| 2026-07-18T11:19:27.959Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 343106.29 | 412469.29 | 418634.89 | 266036.28 | 420176.29 |

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

1. **trace:wait_results** — p99: 418634.89ms (2 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (2 samples)
3. **result.collected** — p99: 1.00ms (8 samples)
4. **collect.batch** — p99: 1.00ms (8 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
