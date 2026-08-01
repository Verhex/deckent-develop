# Sprint Load Test Report

Generated: 2026-07-30T17:39:38.016Z
Total entries: 43

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-30T15:55:30.725Z | dep-pipeline | 6 |
| 2026-07-30T16:01:51.271Z | dep-pipeline | 6 |
| 2026-07-30T17:22:04.044Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_generated | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 5.20 | 6.64 | 1.00 | 7.00 |
| hb.stale | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 360607.77 | 360607.77 | 360607.77 | 360607.77 | 360607.77 |

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

1. **trace:wait_results** — p99: 360607.77ms (1 samples)
2. **collect.batch** — p99: 6.64ms (7 samples)
3. **skill.prompt_generated** — p99: 1.00ms (7 samples)
4. **result.collected** — p99: 1.00ms (13 samples)
5. **hb.stale** — p99: 1.00ms (7 samples)
