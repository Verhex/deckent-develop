# 13 — Documentation Truth

## Güçlü taraflar

Vision artık target ile uncertified current state'i daha dürüst ayırır. MASTER'ın `C/W/E/H/L/X/S` truth dimensions'ı code presence ile live/xplat/scale proof'u ayırmak için değerlidir. Existing code-doc and vision-doc diff raporları birçok gap'i açıkça kaydeder.

## Doğrulanmış drift/çelişkiler

1. `AGENTS.md` architecture map `src/core/routing-engine.ts (routeTaskV2)` der; file yoktur. Current v3 entry `src/core/routing/route-task-v3.ts` ve adapter `routing-plan-adapter.ts`dır.
2. `src/core/work-model.ts` header'ı consumer migration olmadığını söyler; bugün production consumers vardır. Adoption partial, comment stale'dir.
3. `DECKENT.md` lifecycle block/table ve executable controller CLEANUP vocabulary'si çelişir.
4. `DECKENT.md` stuck recovery doğrudan `deckent kill --all`/cleanup önerir; owner approval operating rule'ını önkoşul olarak yazmaz.
5. `DECKENT.md` generated reference için eski `docs/reference/*` paths taşır; current tree `docs/generated/{en,tr}/reference`dır.
6. Coverage matrix üstte 654/654 `%100`, altta 612/654 `%93.6` der.
7. `DOCS-TRUTH-PASS-001` 42 MCP tool evidence taşır; current catalog 49'dur.
8. PAZARTESI 564 failure ve P6 pending snapshot'ı current baseline 591/HEAD P6-close message ile güncel değildir.
9. Doctor/errors Node >=18 guidance verir; package/Identity >=24 ister.
10. RunFlow API header comment'i dört route/no-start/in-process state derken file artık start/cancel/coordinator integration taşır; önemli comment bölümleri stale'dir.
11. ApprovalBroker/config comments bazı wiring'i future/separate sayarken worker spawn/terminal producer wiring'i sonradan eklenmiştir.
12. Accepted ADR'lerdeki tarihli “Today/not started” status cümleleri current code state'inden ayrılmamıştır.

## Doküman mimarisi önerisi

- Decision authority: ADR/Identity/Vision, tarihli status'tan ayrılır.
- Current behavior: generated source-backed reference + current-frictions/truth matrix.
- Plan: yalnız MASTER Work IDs.
- Analysis: proposal/evidence, automatic expiry/reconciliation metadata.
- Host guide: operating safety preconditions'larını reference eder.
- Code comments: “future work/out of scope” assertions için lintable Work ID veya removal gate.

## Acceptance

Doküman DONE sayılmak için source symbol/path checks, generated parity, link/lifecycle vocabulary lint, en/tr parity, current capability count ve negative-space claims'i CI'da fail-closed doğrulamalıdır. Analysis artifact tek başına SSOT olamaz.
