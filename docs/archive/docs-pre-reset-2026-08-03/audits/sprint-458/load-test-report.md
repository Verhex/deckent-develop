# Sprint Load Test Report

Generated: 2026-07-25T23:42:59.163Z
Total entries: 140

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-25T21:56:53.916Z | dep-pipeline | 3 |
| 2026-07-25T23:30:16.458Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 119 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 2576490.43 | 2576490.43 | 2576490.43 | 2576490.43 | 2576490.43 |

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

1. **trace:wait_results** — p99: 2576490.43ms (1 samples)
2. **collision.detected** — p99: 1.00ms (1 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (4 samples)
4. **result.collected** — p99: 1.00ms (4 samples)
5. **collect.batch** — p99: 1.00ms (4 samples)
