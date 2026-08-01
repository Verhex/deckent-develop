# Sprint Load Test Report

Generated: 2026-07-29T17:53:51.138Z
Total entries: 39

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-29T14:16:27.632Z | dep-pipeline | 1 |
| 2026-07-29T14:18:39.729Z | dep-pipeline | 1 |
| 2026-07-29T15:13:02.375Z | dep-pipeline | 6 |
| 2026-07-29T15:21:49.079Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collision.detected | 2 | 8.50 | 15.25 | 15.85 | 1.00 | 16.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 236356.57 | 391148.75 | 404908.05 | 64365.25 | 408347.88 |

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

1. **trace:wait_results** — p99: 404908.05ms (2 samples)
2. **collision.detected** — p99: 15.85ms (2 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (9 samples)
4. **result.collected** — p99: 1.00ms (8 samples)
5. **collect.batch** — p99: 1.00ms (8 samples)
