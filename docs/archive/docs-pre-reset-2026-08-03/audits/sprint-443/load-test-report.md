# Sprint Load Test Report

Generated: 2026-07-14T16:09:41.475Z
Total entries: 74

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-14T15:23:31.847Z | dep-pipeline | 2 |
| 2026-07-14T15:59:29.489Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 29 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 27 | 1.00 | 1.70 | 2.00 | 1.00 | 2.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1286186.14 | 2002483.50 | 2066154.37 | 490300.19 | 2082072.09 |

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

1. **trace:wait_results** — p99: 2066154.37ms (2 samples)
2. **collect.batch** — p99: 2.00ms (27 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **skill.prompt_load_failed** — p99: 1.00ms (3 samples)
5. **result.collected** — p99: 1.00ms (29 samples)
