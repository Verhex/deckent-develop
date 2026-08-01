# Sprint Load Test Report

Generated: 2026-08-01T16:52:00.717Z
Total entries: 126

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-08-01T15:47:04.405Z | dep-pipeline | 1 |
| 2026-08-01T16:07:26.865Z | dep-pipeline | 6 |
| 2026-08-01T16:14:48.853Z | dep-pipeline | 1 |
| 2026-08-01T16:16:19.084Z | dep-pipeline | 1 |
| 2026-08-01T16:25:44.305Z | dep-pipeline | 1 |
| 2026-08-01T16:30:38.665Z | dep-pipeline | 2 |
| 2026-08-01T16:31:30.401Z | dep-pipeline | 1 |
| 2026-08-01T16:46:38.906Z | dep-pipeline | 0 |
| 2026-08-01T16:48:55.242Z | dep-pipeline | 2 |
| 2026-08-01T16:49:43.792Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 10 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 56 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 23 | 1.00 | 13.70 | 17.34 | 1.00 | 18.00 |
| skill.prompt_generated | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3807.00 | 3814.20 | 3814.84 | 3787.00 | 3815.00 |
| trace:wait_results | 13 | 75422.49 | 350812.79 | 413709.32 | 40414.40 | 429433.45 |

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

1. **trace:wait_results** — p99: 413709.32ms (13 samples)
2. **wave.transition** — p99: 3814.84ms (3 samples)
3. **collect.batch** — p99: 17.34ms (23 samples)
4. **result.collected** — p99: 1.00ms (56 samples)
5. **skill.prompt_generated** — p99: 1.00ms (12 samples)
