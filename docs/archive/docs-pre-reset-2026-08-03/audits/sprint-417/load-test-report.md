# Sprint Load Test Report

Generated: 2026-07-11T23:39:14.349Z
Total entries: 13

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-11T23:07:58.130Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1805050.66 | 1805050.66 | 1805050.66 | 1805050.66 | 1805050.66 |

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

1. **trace:wait_results** — p99: 1805050.66ms (1 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (2 samples)
3. **result.collected** — p99: 1.00ms (3 samples)
4. **collect.batch** — p99: 1.00ms (3 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
