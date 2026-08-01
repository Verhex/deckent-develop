# Sprint Load Test Report

Generated: 2026-07-11T06:53:15.301Z
Total entries: 20

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-11T06:10:38.436Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3646.00 | 3646.00 | 3646.00 | 3646.00 | 3646.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 2362842.15 | 2362842.15 | 2362842.15 | 2362842.15 | 2362842.15 |

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

1. **trace:wait_results** — p99: 2362842.15ms (1 samples)
2. **wave.transition** — p99: 3646.00ms (1 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (3 samples)
4. **result.collected** — p99: 1.00ms (5 samples)
5. **collect.batch** — p99: 1.00ms (5 samples)
