# Sprint Load Test Report

Generated: 2026-07-14T09:01:47.498Z
Total entries: 41

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-14T08:45:24.308Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 30 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.90 | 1.98 | 1.00 | 2.00 |
| trace:wait_results | 1 | 833614.43 | 833614.43 | 833614.43 | 833614.43 | 833614.43 |

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

1. **trace:wait_results** — p99: 833614.43ms (1 samples)
2. **collect.batch** — p99: 1.98ms (3 samples)
3. **hb.stale** — p99: 1.00ms (30 samples)
4. **result.collected** — p99: 1.00ms (4 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
