# Sprint Load Test Report

Generated: 2026-07-18T10:07:36.107Z
Total entries: 54

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-14T20:41:33.606Z | dep-pipeline | 5 |
| 2026-07-18T09:44:10.009Z | dep-pipeline | 4 |
| 2026-07-18T10:00:30.627Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.50 | 1.90 | 1.00 | 2.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 615200.75 | 923199.47 | 950577.13 | 272979.94 | 957421.55 |

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

1. **trace:wait_results** — p99: 950577.13ms (2 samples)
2. **collision.detected** — p99: 3.00ms (1 samples)
3. **collect.batch** — p99: 1.90ms (11 samples)
4. **skill.prompt_load_failed** — p99: 1.00ms (10 samples)
5. **result.collected** — p99: 1.00ms (18 samples)
