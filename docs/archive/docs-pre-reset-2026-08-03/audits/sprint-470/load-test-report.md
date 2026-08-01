# Sprint Load Test Report

Generated: 2026-07-29T12:42:57.469Z
Total entries: 94

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-29T07:48:03.374Z | dep-pipeline | 1 |
| 2026-07-29T11:41:40.652Z | dep-pipeline | 4 |
| 2026-07-29T12:07:51.499Z | dep-pipeline | 4 |
| 2026-07-29T12:17:53.273Z | dep-pipeline | 4 |
| 2026-07-29T12:17:53.330Z | dep-pipeline | 4 |
| 2026-07-29T12:21:11.654Z | dep-pipeline | 4 |
| 2026-07-29T12:21:11.709Z | dep-pipeline | 4 |
| 2026-07-29T12:32:34.922Z | dep-pipeline | 4 |
| 2026-07-29T12:40:44.793Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 9 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 25 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 5.45 | 5.89 | 1.00 | 6.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| skill.prompt_load_failed | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| prompt_quality.dispatch_held | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 4 | 385342.36 | 605347.08 | 634638.64 | 368361.38 | 641961.53 |

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

1. **trace:wait_results** — p99: 634638.64ms (4 samples)
2. **collect.batch** — p99: 5.89ms (12 samples)
3. **result.collected** — p99: 1.00ms (25 samples)
4. **honesty.check** — p99: 1.00ms (2 samples)
5. **skill.prompt_load_failed** — p99: 1.00ms (6 samples)
