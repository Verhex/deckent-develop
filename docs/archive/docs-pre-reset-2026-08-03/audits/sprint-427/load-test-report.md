# Sprint Load Test Report

Generated: 2026-07-12T10:57:07.085Z
Total entries: 91

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-12T09:59:48.543Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 24 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 23 | 1.00 | 1.00 | 1.78 | 1.00 | 2.00 |
| wave.transition | 14 | 3682.50 | 7299.00 | 7756.60 | 2863.00 | 7871.00 |
| honesty.check | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 3193547.93 | 3193547.93 | 3193547.93 | 3193547.93 | 3193547.93 |

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

1. **trace:wait_results** — p99: 3193547.93ms (1 samples)
2. **wave.transition** — p99: 7756.60ms (14 samples)
3. **collision.detected** — p99: 4.00ms (1 samples)
4. **collect.batch** — p99: 1.78ms (23 samples)
5. **skill.prompt_load_failed** — p99: 1.00ms (12 samples)
