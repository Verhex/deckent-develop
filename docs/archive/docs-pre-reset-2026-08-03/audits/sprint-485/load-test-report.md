# Sprint Load Test Report

Generated: 2026-07-31T14:05:43.189Z
Total entries: 40

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-31T13:43:00.296Z | dep-pipeline | 8 |
| 2026-07-31T13:54:51.137Z | dep-pipeline | 2 |
| 2026-07-31T13:59:02.096Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_generated | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 3 | 274045.42 | 648615.64 | 681910.77 | 249986.81 | 690234.55 |

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

1. **trace:wait_results** — p99: 681910.77ms (3 samples)
2. **skill.prompt_generated** — p99: 1.00ms (8 samples)
3. **result.collected** — p99: 1.00ms (11 samples)
4. **collect.batch** — p99: 1.00ms (11 samples)
5. **fix.routing.preserved** — p99: 1.00ms (3 samples)
