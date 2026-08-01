# Sprint Load Test Report

Generated: 2026-07-31T11:33:06.171Z
Total entries: 11

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-31T11:24:32.602Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_generated | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 374177.02 | 374177.02 | 374177.02 | 374177.02 | 374177.02 |

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

1. **trace:wait_results** — p99: 374177.02ms (1 samples)
2. **skill.prompt_generated** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (3 samples)
4. **collect.batch** — p99: 1.00ms (3 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
