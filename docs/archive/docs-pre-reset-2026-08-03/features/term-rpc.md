# TERM-RPC — Paylaşımlı Session/Action RPC Kontratı

> **Config:** yok — kontratın kendisi **her zaman aktif** (foundation modülü, on/off flag'i yok).
> Her *tüketici* kendi ayrı yüzeyinden bağımsız olarak wire olur/olmaz; kontrat bunu bilmez.
> **Kaynak:** `src/core/term-rpc.ts` (zod-şema envelope + v1 method katalogu + dispatcher) ·
> **Doğuş:** Sıra-54 (REPL + dashboard + desktop + gateway'in TEK session/action RPC
> protokolünü paylaşması) — slice-1 (contract, task 361-011) → slice-2b-read (362-009,
> REPL) → slice-2a (362-008, HTTP) → dilim-2c (363-003, write-methods) → dilim-1 (363-012,
> VS Code extension bridge)

## Ne yapar

`core/term-rpc.ts` tek bir versiyonlanmış `RpcRequest`/`RpcResponse` zarfı + 7 metotluk v1
katalogu (`session.list`, `session.resume`, `run.status`, `run.start-detached`,
`approval.list`, `approval.decide`, `limits.get`) + transport-agnostik `dispatchRpcRequest`
tanımlar. Dispatcher, enjekte edilen bir `RpcHandlerMap` üzerinden çalışır — bir metodun
handler'ı yoksa `METHOD_NOT_IMPLEMENTED` döner (throw değil): **kısmen bağlanmış bir harita
dürüst bir runtime durumudur**, sahte bir cevap uydurmaz.

Bu tek kontratı **4 farklı tüketici** kullanır — hepsi aynı zarfı konuşur ama farklı
transport/handler-seti ile:

| # | Tüketici | Dosya | Transport | Rolü / handler kapsamı |
|---|----------|-------|-----------|-------------------------|
| 1 | REPL local transport | `src/cli/repl/rpc-client.ts` (362-009) | in-process (`createLocalRpcTransport` → `dispatchRpcRequest` doğrudan çağrılır, socket/fetch yok) | `buildReplRpcHandlers`: `session.list` (MemoryStore.listChatSessions), `approval.list` (ApprovalBroker.list), `limits.get` (probeSubscriptionLimits) — hepsi opsiyonel dep'e bağlı, eksikse metod haritada yok. `run.status`'un REPL'de hiç karşılığı yok (kasıtlı — dilim notu). `/rpc <method> [json]` debug komutu bu transport üzerinden çalışır. |
| 2 | HTTP API route | `src/api/server.ts` `POST /api/rpc` (362-008) | gerçek HTTP, aynı bearer-auth kapısının arkasında | `buildRpcHandlerMap`: 4 READ metodu — `session.list`/`run.status` → `PtySessionManager`, `approval.list` → `ApprovalStore`, `limits.get` → `probeSubscriptionLimits`. `session.resume` / `run.start-detached` / `approval.decide` bu route'ta **hâlâ bağlı değil** (aşağıya bkz). |
| 3 | VS Code extension bridge | `src/extensions/vscode/src/rpc-bridge.ts` (363-012) | gerçek HTTP (`fetch` → `POST /api/rpc`, #2'nin route'una) | Salt-okunur `RpcBridge` sınıfı — yalnız 4 non-mutating metodu (`run.status`, `session.list`, `limits.get`, `approval.list`) çağırır; 3 mutating metot (**#4'ün karşılığı**) bilinçli olarak bu bridge'in public API'sinde YOK — panel yalnız görüntüler, değiştirmez. Sonucu `deckent-panel.ts` render eder (`renderRunStatus`/`renderSessions`/`renderLimits`/`renderApprovals`). |
| 4 | Write-method handler builder | `src/api/rpc-write-handlers.ts` (363-003) | (transport yok — server.ts'in #2 route'una merge edilecek bir `RpcHandlerMap` üretir) | `buildRpcWriteHandlerMap`: `run.start-detached` (deckent'in KENDİ CLI'ını detached spawn eder — asla keyfi bir binary değil) + `approval.decide` (ApprovalBroker.decide, `requester` audit-trail zorunlu). Kod tam, testli — ama server.ts'e **henüz merge edilmedi** (bkz. Kapalıyken garanti). |

`session.resume` hiçbir tüketicide karşılık bulmuyor — `RPC_WRITE_METHODS_STILL_UNSUPPORTED`
(`rpc-write-handlers.ts`) bunu açıkça isimlendiriyor; bugün her zaman `METHOD_NOT_IMPLEMENTED`.

## Parametreler

Bu modülün bir config flag'i **yok** — `repl_surface.*` / `approval_gate` gibi diğer
runtime-özellikleri aksine, TERM-RPC kontratı ve dispatcher'ı koşulsuz mevcuttur (npm-advisory.md
ile aynı "Config: yok" sınıfı). Açılıp kapanan şey kontrat değil, **her tüketicinin
kendi handler-haritasının ne kadarının dolu olduğu** — o da yukarıdaki tablonun kendisi.

## Açınca ne değişir

Kontrat zaten her zaman "açık" — pratikte "ne değişir" sorusunun cevabı hangi tüketicinin
hangi metotları gerçekten cevapladığıdır:

- REPL'de `/rpc session.list {}` çalıştırmak gerçek `MemoryStore` verisini JSON olarak basar
  (in-process, network yok).
- `curl -X POST /api/rpc -d '{"id":"1","version":"1.0","method":"limits.get","params":{}}'`
  gerçek `probeSubscriptionLimits`'i tetikler ve `RpcResponse` zarfında sonucu döner.
- VS Code panelinde bir bölüm (`runStatus`/`sessions`/`limits`/`approvals`) `RpcBridge`
  aracılığıyla aynı HTTP route'una gerçek bir istek atar — deckent API server'ı çalışmıyorsa
  panel `transport` hatasıyla düşer (fabrike veri göstermez).

## Kapalıyken garanti

Kontratın kendisi kapatılamaz, ama her tüketici bağımsız fail-soft'tur:
- Bir REPL dep'i (ör. `listChatSessions`) sağlanmazsa o metot haritada hiç yok →
  `METHOD_NOT_IMPLEMENTED`, asla uydurma veri.
- `run.start-detached` + `approval.decide` bugün `server.ts`'in route'unda **bağlı değil** —
  `rpc-write-handlers.ts`'in kendi başlık yorumu bunu tek satırlık bir merge olarak
  tanımlıyor (`{...buildRpcHandlerMap(...), ...buildRpcWriteHandlerMap(...)}`) ama bu satır
  henüz `server.ts`'e yazılmadı (o dosya bu task'ın write-scope'u dışında). Yani **kod
  tam, test edilmiş, ama canlı `/api/rpc`'de bugün hâlâ `METHOD_NOT_IMPLEMENTED`
  döner** — bu dürüst bir ara-durum, gizli bir borç değil.

## Riskler

- Write-method merge'ünün eksik olması: bir operatör `rpc-write-handlers.ts`'in var
  olduğunu görüp `run.start-detached`/`approval.decide`'ın canlı `/api/rpc`'de çalıştığını
  varsayabilir — bugün çalışmıyor.
- VS Code bridge'in (#3) kendi test dosyası yok (disk-doğrulanmış: `src/extensions/vscode/`
  altında hiçbir `.test.ts` bulunmuyor) — HTTP sözleşmesi yalnız `server.ts` tarafındaki
  `tests/api/rpc-endpoint.test.ts` ile dolaylı doğrulanıyor, bridge'in kendi hata-haritalama
  (`transport` vs `rpc` error kind ayrımı) mantığı doğrudan test edilmiyor.
- `session.resume` kalıcı olarak `METHOD_NOT_IMPLEMENTED` — hiçbir tüketicide plan yok;
  bir çağıran bunu "henüz sırada" sanabilir ama kodda bunu üstlenecek bir slice yok.

## Kanıt

- Testler: `tests/core/term-rpc.test.ts` (17 test — envelope/zod şema, dispatcher hata
  taksonomisi: `VERSION_MISMATCH`/`UNKNOWN_METHOD`/`METHOD_NOT_IMPLEMENTED`/`INVALID_PARAMS`/
  `INTERNAL_ERROR`), `tests/cli/repl/rpc-client.test.ts` (24 test — local transport
  round-trip, `buildReplRpcHandlers` dep-eksikliği fail-soft davranışı, `/rpc` debug komutu
  parse), `tests/api/rpc-endpoint.test.ts` (9 test — HTTP route + 4 READ handler),
  `tests/api/rpc-write-handlers.test.ts` (16 test — `run.start-detached` tokenize+spawn,
  `approval.decide` audit-identity zorunluluğu).
- Canlı: REPL'de `/rpc <method> [json-params]` — gerçek in-process dispatch, ekstra
  network/mock yok. `POST /api/rpc` gerçek HTTP endpoint (bearer-auth arkasında).
- Follow-up (bu task'ın write-scope'u dışında, docImpact olarak kaydedildi): write-method
  merge'ünü `server.ts`'e taşımak.
