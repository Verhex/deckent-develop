# Sprint Load Test Report

Generated: 2026-07-30T04:45:07.066Z
Total entries: 741

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-29T19:04:29.764Z | dep-pipeline | 6 |
| 2026-07-29T21:28:20.342Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 43 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 40 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 40 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 611 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 19021672.33 | 19021672.33 | 19021672.33 | 19021672.33 | 19021672.33 |

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

1. **trace:wait_results** — p99: 19021672.33ms (1 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (43 samples)
3. **result.collected** — p99: 1.00ms (40 samples)
4. **collect.batch** — p99: 1.00ms (40 samples)
5. **hb.stale** — p99: 1.00ms (611 samples)
