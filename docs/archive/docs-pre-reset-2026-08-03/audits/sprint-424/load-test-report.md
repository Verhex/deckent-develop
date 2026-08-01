# Sprint Load Test Report

Generated: 2026-07-12T04:15:34.476Z
Total entries: 8

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-12T03:58:42.975Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 907202.65 | 907202.65 | 907202.65 | 907202.65 | 907202.65 |

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

1. **trace:wait_results** — p99: 907202.65ms (1 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (2 samples)
4. **collect.batch** — p99: 1.00ms (2 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
