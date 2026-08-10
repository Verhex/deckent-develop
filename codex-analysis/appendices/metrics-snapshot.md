# Metrics Snapshot

Snapshot: `2026-08-03`, HEAD `aeb60c6b70cd578dba6c12819d2ee05c6cea0888`.

## Repository

| Metric | Value |
|---|---:|
| Tracked files | 6,012 |
| Core LOC | 123,610 |
| Orchestra LOC | 99,964 |
| CLI LOC | 66,910 |
| API LOC | 10,562 |
| MCP LOC | 9,441 |
| Dashboard TS/TSX LOC | 16,801 |
| Desktop LOC | 9,811 |
| Tests LOC | 631,174 |
| Scripts LOC | 58,591 |

## Quality

| Metric | Value |
|---|---:|
| Failure baseline files | 115 |
| Failure baseline total | 591 |
| Orchestra failures | 346 |
| CLI failures | 121 |
| MCP failures | 95 |
| API failures | 22 |
| Explicit skip/todo declarations | 382 |
| Root test file inventory | ~2,530 |

Final scope kontrolünde external/concurrent uncommitted çalışma baseline'ı 114/565'e indirmişti. Bu yeni değer test edilmemiş ve başlangıç snapshot'ından sonra doğmuştur; raporun reproducible HEAD metriği 115/591 olarak tutulur.

## Ledger

| Metric | Value |
|---|---:|
| Total / active / terminal | 323 / 318 / 5 |
| OPEN / BLOCKED / VERIFY / READY | 221 / 67 / 30 / 0 |
| P0 / P1 / P2 | 250 / 57 / 16 |
| Dependency edges | 723 |
| Max active depth | 33 |
| Active updated 2026-07-26 | 198 |
| Active exact receipt token | 34 |
| Active exact proof token | 22 |
| Coarse PARTIAL / NOT-STARTED / UNWIRED | 181 / 93 / 44 |
| Active X=1 / S=1 | 0 / 0 |

## Product surfaces

| Metric | Value |
|---|---:|
| MCP tools | 49 |
| CLI top-level command contract | ≥45 |
| Declared core locales | 2 (en/tr) |
| Packed install OS matrix | 3 (Linux/macOS/Windows) |
| Explicit WSL CI leg | 0 |

## Live readonly observation DB

| Metric | Value |
|---|---:|
| Schema user_version | 1 |
| Provider intervals | 53 |
| Contradictions | 0 |
| `run_id` column | absent in live v1 |
| Source schema version | 2 |

Bütün ölçüler source/snapshot'tır; runtime throughput, latency, success rate veya scale certification değildir.
