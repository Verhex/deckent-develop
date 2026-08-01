# Sprint Load Test Report

Generated: 2026-07-29T01:25:03.800Z
Total entries: 1218

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-28T19:27:28.118Z | dep-pipeline | 6 |
| 2026-07-28T19:27:33.327Z | dep-pipeline | 5 |
| 2026-07-28T20:22:10.174Z | dep-pipeline | 1 |
| 2026-07-29T01:22:56.888Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 3 | 16.00 | 21.40 | 21.88 | 16.00 | 22.00 |
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 1201 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 18981985.49 | 18981985.49 | 18981985.49 | 18981985.49 | 18981985.49 |

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

1. **trace:wait_results** — p99: 18981985.49ms (1 samples)
2. **collision.detected** — p99: 21.88ms (3 samples)
3. **skill.prompt_load_failed** — p99: 1.00ms (4 samples)
4. **result.collected** — p99: 1.00ms (1 samples)
5. **collect.batch** — p99: 1.00ms (1 samples)
