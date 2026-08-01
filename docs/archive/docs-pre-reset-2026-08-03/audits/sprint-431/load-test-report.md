# Sprint Load Test Report

Generated: 2026-07-12T19:53:52.231Z
Total entries: 16

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-12T19:37:39.122Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.90 | 1.98 | 1.00 | 2.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 863623.88 | 863623.88 | 863623.88 | 863623.88 | 863623.88 |

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

1. **trace:wait_results** — p99: 863623.88ms (1 samples)
2. **collect.batch** — p99: 1.98ms (3 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **skill.prompt_load_failed** — p99: 1.00ms (2 samples)
5. **result.collected** — p99: 1.00ms (4 samples)
