# Sprint Load Test Report

Generated: 2026-07-12T01:54:20.306Z
Total entries: 16

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-12T01:18:31.947Z | dep-pipeline | 2 |
| 2026-07-12T01:32:27.575Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1091010.36 | 1269680.88 | 1285562.70 | 892487.57 | 1289533.16 |

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

1. **trace:wait_results** — p99: 1285562.70ms (2 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (3 samples)
3. **result.collected** — p99: 1.00ms (3 samples)
4. **collect.batch** — p99: 1.00ms (3 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
