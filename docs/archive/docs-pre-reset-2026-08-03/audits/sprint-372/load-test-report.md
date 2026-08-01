# Sprint Load Test Report

Generated: 2026-07-05T14:01:40.742Z
Total entries: 28

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-05T13:52:22.604Z | dep-pipeline | 6 |
| 2026-07-05T13:59:11.987Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 2.30 | 2.86 | 1.00 | 3.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 196029.05 | 368967.97 | 384340.32 | 3874.70 | 388183.41 |

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

1. **trace:wait_results** — p99: 384340.32ms (2 samples)
2. **collect.batch** — p99: 2.86ms (8 samples)
3. **result.collected** — p99: 1.00ms (10 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **fix.routing.preserved** — p99: 1.00ms (4 samples)
