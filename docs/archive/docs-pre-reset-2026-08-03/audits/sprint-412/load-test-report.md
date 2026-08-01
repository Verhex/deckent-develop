# Sprint Load Test Report

Generated: 2026-07-11T19:35:08.804Z
Total entries: 28

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-11T18:54:12.506Z | dep-pipeline | 3 |
| 2026-07-11T19:28:59.940Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 1600.00 | 1600.00 | 1600.00 | 1600.00 | 1600.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1181985.98 | 2017861.76 | 2092161.83 | 253235.12 | 2110736.85 |

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

1. **trace:wait_results** — p99: 2092161.83ms (2 samples)
2. **wave.transition** — p99: 1600.00ms (1 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **skill.prompt_load_failed** — p99: 1.00ms (5 samples)
5. **result.collected** — p99: 1.00ms (5 samples)
