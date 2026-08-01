# Sprint Load Test Report

Generated: 2026-07-14T20:10:21.399Z
Total entries: 104

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-14T18:39:01.047Z | dep-pipeline | 2 |
| 2026-07-14T19:57:19.000Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 34 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 31 | 1.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| honesty.check | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 2746252.88 | 4623369.00 | 4790223.77 | 660568.31 | 4831937.46 |

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

1. **trace:wait_results** — p99: 4790223.77ms (2 samples)
2. **collision.detected** — p99: 3.00ms (1 samples)
3. **collect.batch** — p99: 2.00ms (31 samples)
4. **skill.prompt_load_failed** — p99: 1.00ms (12 samples)
5. **result.collected** — p99: 1.00ms (34 samples)
