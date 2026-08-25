# Native Terminal Correction Baseline — 2026-08-18

> NATIVE-AGENT-HORIZON-001 NT-correction ledger'ının incident baseline dokümanı
> (MASTER 7078 evidence + owner admission 2026-08-18). Sprint-553 Task-5 kapsamı;
> Brain el-tamamlaması (ADR-D-007 seam — local-llm worker owner kararıyla iptal).

## Olay

2026-08-18 Qwen oturumunda tek bir `deckent_models` çağrısı 470.325 karakter döndürdü ve üç
tool sonucunun toplamı 474.380 karakter ham/sınırsız biçimde context'e girdi (trace
`u9nzq1`). 25-round guard daha önce (package-1) düzeltilmişti; bu correction dalgası
containment / scratch production wire / context admission'ı hedefler. Uzun-horizon native
terminal için verdict: NO_GO / correction required — NT-01..NT-13 correction ledger'ı yeni
umbrella açılmadan NATIVE-AGENT-HORIZON-001'e bağlanmıştır.

## NT-01..NT-13 özet tablosu

| ID | Tek-satır özet (MASTER 7078 evidence, condensed) | Sahip package |
|----|--------------------------------------------------|---------------|
| NT-01 | Tool-result containment yok — tek `deckent_models` çağrısı 470k karakter | Package 1 — Tool Result Budget Broker |
| NT-02 | Context aritmetiği taşıyor — ~118k token tool-result, fitting current-turn'ü küçültemiyor | Package 3 — Context admission |
| NT-03 | Scratch checkpoint production'da DEAD WIRE — bridge `createAgentSession`'a scratch vermiyor | Package 2 — Epoch/durable checkpoint |
| NT-04 | Tool çıktıları evrensel olarak sınırsız (read_file/bash/CLI/MCP) | Package 1 — Tool Result Budget Broker |
| NT-05 | CLI/bash exit-code'suz `ok:true` — tool-result truth hatalı olabiliyor | Package 1 — Tool Result Budget Broker |
| NT-06 | Progressive disclosure sahte — 46+ şema her round eager gönderiliyor | Package 4 — Progressive disclosure/catalog |
| NT-07 | Effective-context/identity diagnostics boot'ta çağrılmıyor | Package 3 — Context admission |
| NT-08 | Output ceiling provider request'ine gitmiyor | Package 3 — Context admission |
| NT-09 | `/resume` gerçek hydrate değil — UI pointer değişimi | Package 6 — Durable Conversation/resume |
| NT-10 | Interrupt provider stream'ini/subprocess'i durdurmuyor | Package 6 — Durable Conversation/resume |
| NT-11 | Permission authority parçalı (legacy allow · native rules · ApprovalBroker ayrı) | Package 5 — Unified permission/Approval |
| NT-12 | Auto-decision audit event'i durable değil — trace snapshot audit kaydı sayılmış | Package 5 — Unified permission/Approval |
| NT-13 | Trace config-authority ihlali — `DECKENT_TRACE` default-on, 187MB, 0644 | Package 8 — Trace/data governance |

## Kabul senaryoları

Uygulama oturumu aşağıdaki kanıtların tamamını istemeli (gerçek-binary/PTY kanıtı; unit
test tek başına kapanış sayılmaz):

1. [ ] Qwen ile 60+ distinct tool call ve final answer.
2. [ ] Tek tool'dan 5–10 MB output; context overflow yok, full output contentRef ile okunabiliyor.
3. [ ] 1.000 tool catalogu; bounded eager schema.
4. [ ] İki checkpoint + restart + resume; findings/evidence kaybı yok.
5. [ ] suggest, auto-edit, full-auto, locked permission matrixi.
6. [ ] Builtin read, CLI read ve MCP read aynı promptless davranış.
7. [ ] `rm -rf`, force-push, `find -delete`, PowerShell recursive delete ve secret mutation full-auto floor testi.
8. [ ] `/interrupt` aktif provider stream'ini ve process tree'yi gerçekten durduruyor.
9. [ ] Provider context mismatch ve yanlış model identity first-turn öncesi fail ediyor.
10. [ ] Terminal disconnect/reconnect sonrası aynı logical run inspect/cancel/settle.
11. [ ] 10 concurrent session ve bounded memory/backpressure.
12. [ ] Linux/macOS/Windows-native/WSL gerçek terminal proof.
13. [ ] Trace config-off/consent-off negative test ve incremental exactly-once capture.
14. [ ] Real-binary producer → service → protocol → terminal consumer proof; yalnız unit/static wiring kabul edilmemeli.

## Ölçüm taban çizgisi

| Metrik | Incident değeri |
|--------|-----------------|
| Tek tool sonucu (en büyük) | 470.325 karakter |
| Üç tool sonucu toplamı | 474.380 karakter |
| Transcript boyutu | ~118k token |
| Eager tool schema sayısı | 46 |
| `.deckent/traces` disk boyutu | 187 MB |
