# Sprint Load Test Report

Generated: 2026-07-23T13:33:24.662Z
Total entries: 39

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-23T13:26:10.435Z | dep-pipeline | 3 |
| 2026-07-23T13:31:10.304Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 222722.00 | 222722.00 | 222722.00 | 222722.00 | 222722.00 |

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

1. **trace:wait_results** — p99: 222722.00ms (1 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (3 samples)
3. **hb.stale** — p99: 1.00ms (23 samples)
4. **result.collected** — p99: 1.00ms (3 samples)
5. **collect.batch** — p99: 1.00ms (3 samples)
