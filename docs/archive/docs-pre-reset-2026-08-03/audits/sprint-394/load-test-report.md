# Sprint Load Test Report

Generated: 2026-07-10T08:00:24.387Z
Total entries: 18

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-10T07:36:40.666Z | dep-pipeline | 3 |
| 2026-07-10T07:54:37.839Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.dna_filtered | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 623130.86 | 997256.67 | 1030512.29 | 207435.52 | 1038826.20 |

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

1. **trace:wait_results** — p99: 1030512.29ms (2 samples)
2. **skill.dna_filtered** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (4 samples)
4. **collect.batch** — p99: 1.00ms (4 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
