# Sprint Load Test Report

Generated: 2026-07-13T21:24:06.334Z
Total entries: 26

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-13T20:59:19.168Z | dep-pipeline | 2 |
| 2026-07-13T21:14:07.287Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_load_failed | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 583653.89 | 753317.36 | 768398.56 | 395138.91 | 772168.86 |

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

1. **trace:wait_results** — p99: 768398.56ms (2 samples)
2. **skill.prompt_load_failed** — p99: 1.00ms (5 samples)
3. **result.collected** — p99: 1.00ms (6 samples)
4. **collect.batch** — p99: 1.00ms (6 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
