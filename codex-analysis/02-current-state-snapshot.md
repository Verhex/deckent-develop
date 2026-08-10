# 02 — Current State Snapshot

## Repository ölçeği

`rg --files` tabanlı, ignore kurallarına uyan yaklaşık kaynak LOC:

| Alan | LOC |
|---|---:|
| core | 123,610 |
| orchestra | 99,964 |
| CLI | 66,910 |
| API | 10,562 |
| MCP | 9,441 |
| providers | 8,429 |
| connectors | 8,090 |
| agents | 7,972 |
| nervous | 7,707 |
| monitor | 4,095 |
| dashboard TS/TSX | 16,801 |
| desktop | 9,811 |
| tests | 631,174 |
| scripts | 58,591 |

Tracked file sayısı 6,012'dir. Kod tabanı prototip ölçeğini geçmiş; değişiklik maliyetinin ana belirleyicisi LOC değil, authority parçalanması ve test debt'tir.

## Ürün yüzeyi snapshot'ı

- MCP canonical catalog: 49 tool (`src/mcp/tools/index.ts`).
- CLI inventory contract: en az 45 top-level command; birçok command group/subcommand.
- Terminal REPL'de progressive tool disclosure: `deckent_search_tools`, `deckent_describe_tool`, `deckent_call_tool`.
- Dashboard ve Desktop ayrı frontend ağaçlarına sahip.
- API; RunFlow, enterprise, memory, KPI, provider ve execution yüzeyleri taşıyor.
- Connectors kimlik, approval client ve capability adapter'ları içeriyor.

Bu sayıların hiçbiri ürün readiness kanıtı değildir; genişlik yüksektir, closure düzensizdir.

## Test snapshot'ı

`scripts/test-failure-baseline.json` sabit HEAD snapshot'ında:

- 115 test file
- 591 expected failure
- orchestra 346
- CLI 121
- MCP 95
- API 22
- diğer 7

Ayrıca source/test/doc aramasında 382 explicit `skip/todo` bildirimi vardır. Bunların tümü gerçek debt değildir; conditional platform testleri ve doküman örnekleri de dahildir. Yine de failure baseline, publish/autonomy güven sinyalini bloklayacak büyüklüktedir. Analiz sırasında external/concurrent uncommitted patch baseline'ı 114 dosya/565 failure'a indirdi; bu patch başlangıç snapshot'ında yoktu ve bu analizde test edilmediği için ana metrik olarak kullanılmadı.

## Plan snapshot'ı

| Ölçü | Değer |
|---|---:|
| Toplam ledger row | 323 |
| Aktif | 318 |
| DONE | 5 |
| OPEN | 221 |
| BLOCKED | 67 |
| VERIFY | 30 |
| READY | 0 |
| P0 | 250 |
| Dependency edge | 723 |
| Max active depth | 33 |
| Active row, 2026-07-26 update | 198 |
| Active row with exact `receipt=` | 34 |
| Active row with exact `proof=` | 22 |

DAG cycle-free'dir; ancak `READY=0` ve P0 inflation execution ordering'i pratikte yok eder.

## Live read-only observation snapshot'ı

`.deckent/provider-execution-observations.db` 53 interval içeriyor; `user_version=1` schema'da `run_id` ve `retired` kolonları yok. Source store schema v2'dir ve writable open sırasında v1→v2 migration tanımlar. Bu, source migration'ın var olduğunu fakat current live DB'de henüz uygulanmış production adoption evidence olmadığını gösterir. DB baştan beri modified durumdaydı; analiz yalnız readonly açtı.

## Current truth özeti

- **Code-rich:** çok sayıda capability ve derin durability sistemi var.
- **Wire-inconsistent:** aynı capability farklı surface ve backends'de farklı closure seviyesinde.
- **Proof-poor relative to claims:** live, cross-provider, cross-platform ve scale proof'u sınırlı.
- **Plan-overloaded:** geniş backlog var, executable next action yok.
- **Documentation improving but drifting:** yeni truth docs güçlü, eski host/reference/status metinleri birbiriyle çelişebiliyor.
