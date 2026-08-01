# Sprint Load Test Report

Generated: 2026-07-31T07:39:34.875Z
Total entries: 16

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-31T07:08:56.787Z | dep-pipeline | 1 |
| 2026-07-31T07:23:25.290Z | dep-pipeline | 1 |
| 2026-07-31T07:30:02.812Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_generated | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 3 | 168687.66 | 546895.48 | 580513.95 | 134250.25 | 588918.57 |

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

1. **trace:wait_results** — p99: 580513.95ms (3 samples)
2. **skill.prompt_generated** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (4 samples)
4. **collect.batch** — p99: 1.00ms (4 samples)
5. **wave.start** — p99: 0.00ms (3 samples)
