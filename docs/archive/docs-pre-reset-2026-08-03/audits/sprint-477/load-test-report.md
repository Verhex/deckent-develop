# Sprint Load Test Report

Generated: 2026-07-30T12:49:54.317Z
Total entries: 152

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-30T12:29:53.170Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 48 | 1.00 | 1.00 | 2.00 | 1.00 | 2.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 703772.33 | 703772.33 | 703772.33 | 703772.33 | 703772.33 |

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

1. **trace:wait_results** — p99: 703772.33ms (1 samples)
2. **collect.batch** — p99: 2.00ms (48 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (50 samples)
4. **result.collected** — p99: 1.00ms (50 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
