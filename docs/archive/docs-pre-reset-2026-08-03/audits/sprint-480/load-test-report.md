# Sprint Load Test Report

Generated: 2026-07-30T20:31:07.258Z
Total entries: 30

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-30T19:10:06.570Z | dep-pipeline | 1 |
| 2026-07-30T20:15:34.876Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.00 | 2.90 | 2.98 | 1.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_generated | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 4.50 | 5.70 | 1.00 | 6.00 |
| trace:wait_results | 1 | 2565050.90 | 2565050.90 | 2565050.90 | 2565050.90 | 2565050.90 |

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

1. **trace:wait_results** — p99: 2565050.90ms (1 samples)
2. **collect.batch** — p99: 5.70ms (7 samples)
3. **collision.detected** — p99: 2.98ms (2 samples)
4. **skill.prompt_generated** — p99: 1.00ms (4 samples)
5. **result.collected** — p99: 1.00ms (12 samples)
