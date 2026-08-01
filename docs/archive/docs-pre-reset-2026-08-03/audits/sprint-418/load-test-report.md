# Sprint Load Test Report

Generated: 2026-07-12T00:40:28.068Z
Total entries: 70

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-12T00:13:01.338Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 56 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.50 | 1.95 | 1.99 | 1.00 | 2.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1610538.52 | 1610538.52 | 1610538.52 | 1610538.52 | 1610538.52 |

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

1. **trace:wait_results** — p99: 1610538.52ms (1 samples)
2. **collect.batch** — p99: 1.99ms (2 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (3 samples)
4. **hb.stale** — p99: 1.00ms (56 samples)
5. **result.collected** — p99: 1.00ms (3 samples)
