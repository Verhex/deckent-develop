# Sprint Load Test Report

Generated: 2026-07-30T12:27:33.710Z
Total entries: 195

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-30T10:15:50.318Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 42 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 712583.47 | 712583.47 | 712583.47 | 712583.47 | 712583.47 |

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

1. **trace:wait_results** — p99: 712583.47ms (1 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (50 samples)
3. **result.collected** — p99: 1.00ms (50 samples)
4. **collect.batch** — p99: 1.00ms (50 samples)
5. **hb.stale** — p99: 1.00ms (42 samples)
