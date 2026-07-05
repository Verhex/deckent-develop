# VS Code Panel — TERM-RPC Bridge/Data/Refresh Soy-Zinciri

> **Config:** yok — extension-seviyesi kod, flag yok · **Kaynak:**
> `src/extensions/vscode/src/{rpc-bridge,deckent-panel,panel-data,panel-refresh}.ts` ·
> **Zincir:** 363-012 (dilim-1, bridge+panel) → 368-007 (dilim-2, data-adapter) →
> 369-004 (dilim-3, refresh+detail) · **Yol haritası:** CHAT-IDE (Sıra-64), MASTER-PLAN.md §64

> **Not (disk-verify düzeltmesi):** `docs/MASTER-PLAN.md`'nin 64. satırı dilim-1'i "363-013"
> olarak anıyor; bu **yanlış task-ID'dir** — `.brain/archive/sprint-363-tasks/task-363-013.json`
> disk-üzerinde 363-013'ün aslında ilgisiz bir task (TOOLCU-DESIGN, `docs/design/tool-cu-pack.md`)
> olduğunu gösteriyor. Dilim-1'in gerçek task'ı **363-012** (VSCODE-EXT-1) —
> `rpc-bridge.ts:2` ve `deckent-panel.ts:2`'nin kendi başlık yorumlarında da bu ID yazılı.
> Bu doküman disk-doğrulanmış ID'yi (363-012) kullanır; MASTER-PLAN.md düzeltmesi bu task'ın
> write-scope'u dışında — bkz. bu task'ın `.result` dosyasındaki `docImpact` notu.

## Ne yapar

VS Code extension'ının salt-okunur durum panelini, `deckent` API sunucusunun TERM-RPC
telinin (`POST /api/rpc`, `src/api/server.ts`) **3. tüketicisi** olarak kuran 3 katmanlı,
ek-üstüne-ek (additive) bir soy-zinciri. Her dilim bir öncekini DEĞİŞTİRMEDEN üzerine yeni
bir modül ekler — hiçbiri diğerini import-side-effect ile bozmaz.

### Dilim-1 — Bridge + Panel (363-012)

- **`rpc-bridge.ts`** (`RpcBridge` sınıfı, 67-145): TERM-RPC'nin 4 **mutasyonsuz** metodunu
  (`run.status`, `session.list`, `limits.get`, `approval.list`) gerçek HTTP üzerinden
  sarar (79-96). 3 mutasyon-metodu (`session.resume`, `run.start-detached`,
  `approval.decide`) BİLİNÇLİ OLARAK yok (1-12. satır yorumu) — bu panel yalnız gösterir,
  asla değiştirmez. Hata iki türe ayrılır (`RpcBridgeError`, 42-44): `transport` (istek
  hiç bir `RpcResponse` zarfı üretmedi) vs `rpc` (sunucu geçerli bir zarfla ama
  `error` alanı dolu cevap verdi) — panel bu ikisini farklı yorumlar (bkz. dilim-2).
- **`deckent-panel.ts`** (`loadPanelData`, 62-79 + `refreshPanel`, 90-98 +
  `renderPanelHtml`, 156-173): 4 bölümü **eşzamanlı** (`Promise.all`) çeker; her bölüm
  bağımsız başarısız olur (57-60. satır yorumu) — biri çökse diğerleri render edilmeye
  devam eder. `renderPanelHtml` her interpolasyonu `escapeHtml` (102-109) ile kaçırır —
  RPC verisi opak kabul edilir, asla ön-temizlenmiş HTML olarak güvenilmez (149-154. satır
  yorumu, XSS-güvenli statik shell).
- **DI kuralı** (her iki dosyada da): hiçbir yerde gerçek `vscode` modülü import edilmez —
  `WebviewLike`/`fetchFn` enjekte edilir, bu yüzden gerçek bir VS Code host olmadan derlenir
  ve test edilir (mock webview / injected fetch yeterli).

### Dilim-2 — Panel-Data Adapter (368-007)

- **`panel-data.ts`**: dilim-1'in bridge'ini DEĞİŞTİRMEDEN, panel'in "sprint-status" /
  "task-list" görünüm-modeline uyarlayan ikinci, daha dar bir tüketici (1-5. satır yorumu).
  Kontrat-dürüst eşleme (7-10. satır yorumu, TERM-RPC v1'de özel bir `sprint.status`/
  `task.list` metodu YOK — bilinen bir v1-katalog boşluğu, uydurulmuş değil):
  `sprint-status ← run.status`, `task-list ← session.list`.
- **Bağlantı-durumu türetimi** (`connectionFromError`, 29-31): SADECE
  `RpcBridgeError.kind`'dan türetilir — `'rpc'` → `connected` (sunucuya ULAŞILDI, çağrının
  kendisi başarısız oldu), `'transport'` → `disconnected`. Asla HTTP status metninden veya
  mesaj içeriğinden çıkarılmaz (26. satır yorumu) — bu ayrım dilim-1'in `RpcBridgeError`
  taksonomisinin doğrudan bir tüketicisi.
- **`loadSprintTaskPanelData`** (92-104): iki bölümü eşzamanlı çeker; string-free tasarım
  (12-14. satır yorumu) — bu modül asla kullanıcıya-görünür bir etiket/mesaj literal'i
  döndürmez, görüntüleme metni çağıranın (i18n-farkında renderer'ın) sorumluluğu.

### Dilim-3 — Live-Refresh + Task-Detay (369-004)

- **`panel-refresh.ts`**: dilim-2'nin `loadSprintTaskPanelData`'sının üstüne (a) poll-tabanlı
  bir canlı-yenileme döngüsü ve (b) task-list bölümü üzerinde saf bir task-detay seçici
  ekler (1-4. satır yorumu) — yine additive, `panel-data.ts`/`rpc-bridge.ts`'e dokunmaz.
- **`startPanelRefresh`** (49-74): `DEFAULT_REFRESH_INTERVAL_MS = 5_000` (40) cadence'la
  poll eder; panel boş oturmasın diye İLK fetch'i hemen yapar (42-47. satır yorumu),
  ardından `intervalMs`'te bir tekrarlar. Timer `unref()`'lenir (62) — process'i canlı
  tutmaz. `dispose()` **idempotent** (68-72. satır yorumu — ikinci çağrı veya dispose
  sonrası çağrı güvenli no-op). Her snapshot (bağlantısız/hatalı olan dahil) `onData`'ya
  OLDUĞU GİBİ iletilir (44-47. satır yorumu) — bir poll tick'i asla taze bir başarısızlığı
  önceki başarı olarak yeniden etiketlemez; panelin bağlantı durumu her zaman dürüst kalır.
- **`selectTaskDetail`** (105-131): task-list bölümünden ID'ye göre saf bir lookup — YENİ
  bir bridge çağrısı değil. `agent`/`model`/`resultSummary` alanları HER ZAMAN `null`
  (78-96. satır yorumları) — TERM-RPC v1'in `sessionSummarySchema`/`runStatusResultSchema`'sı
  bu alanları taşımıyor (bilinen v1-katalog boşluğu, dilim-2'nin
  task-list←session.list eşlemesiyle aynı dürüstlük ilkesi — hiçbir zaman kontratın
  sağlamadığı bir değer uydurulmaz).

## Parametreler

Config-flag yok. Tek çalışma-zamanı parametresi `RpcBridgeOptions`
(`rpc-bridge.ts:48-55`, extension tarafından enjekte edilir):

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `baseUrl` | `string` | `http://127.0.0.1:3100` (57) | Deckent API sunucusunun adresi. |
| `token` | `string` | yok | `/api/*` bearer-auth; sunucuda auth kapalıysa atlanır. |
| `fetchFn` | `FetchFn` | `globalThis.fetch` | DI seam — testler sahte fetch enjekte eder. |
| `intervalMs` (`PanelRefreshOptions`, `panel-refresh.ts:23-30`) | `number` | `5000` | Poll cadence'i. |

## Açınca ne değişir

Bu bir flag-gated özellik değil — extension kodu her zaman bu davranışı sergiler
(derlendiğinde). Extension aktive edildiğinde: panel açılır → `loadPanelData`/
`loadSprintTaskPanelData` ile ilk snapshot çekilir → `startPanelRefresh` her 5 saniyede bir
tazeler → kullanıcı sprint-status, session listesi, limitler, onaylar ve (dilim-3 ile) tek
bir task'ın detayını **salt-okunur** görür; hiçbir panel-eylemi sunucuda bir mutasyon
tetiklemez.

## Kapalıyken garanti

N/A — flag yok. Garanti edilen şey "kapalıyken" değil "asla mutasyon yapmıyorken": bridge
sınıfı yalnız 4 mutasyonsuz TERM-RPC metodunu expose eder (dilim-1), hiçbir dilim
`session.resume`/`run.start-detached`/`approval.decide`'ı çağırmaz — bu üç metot bridge'in
public API'sinde YOKTUR, yanlışlıkla çağrılamaz (derleme zamanı garantisi, çalışma zamanı
flag'i değil).

## Riskler

- **Publish/paketleme henüz YOK** — 363-012'nin kendi goNogo'su bunu açıkça "nogo:
  publish/paketleme" olarak işaretledi; MASTER-PLAN.md §64 CHAT-IDE satırını 🟡 (devam
  ediyor) olarak gösteriyor, ✅ değil. Bu doküman bir kullanıcıya-dağıtılan extension'ı
  değil, **derlenen ve test edilen kaynak kodu** anlatıyor.
- **v1 RPC-katalog boşlukları**: `sprint.status`/`task.list` özel metotları yok (run.status/
  session.list'e eşlenir), `agent`/`model`/`resultSummary` alanları yok (her zaman `null`).
  Bu alanları panelin UI'ında dolu bekleyen bir tüketici, kontratın kendisi
  genişletilmeden yanlış varsayımda bulunur.
- Ayrıca `src/extensions/vscode/` (bu zincir) ile kök dizindeki `extensions/vscode/`
  (sprint 213-214/343-005'ten kalma daha eski bir stub — `extension.ts`/`commands.ts`)
  **iki AYRI dizin/kod-yolu** — karıştırılmamalı. Bu doküman yalnız `src/extensions/vscode/`
  altındaki TERM-RPC panel zincirini anlatır.

## Kanıt

- Testler: `tests/extensions/vscode-panel.test.ts` (360 satır, dilim-1: bridge 4-metot +
  panel veri-bağlama, mock-webview), `tests/extensions/vscode-panel-data.test.ts` (178
  satır, dilim-2: fake-transport ile bağlı/kopuk/boş-veri senaryoları),
  `tests/extensions/vscode-panel-refresh.test.ts` (243 satır, dilim-3: `vi.useFakeTimers()`
  ile poll-cadence + dispose-idempotent + task-detay seçici) — hiçbiri gerçek VS Code host,
  gerçek network veya gerçek clock kullanmaz.
- Canlı: yok (yukarıdaki "Publish/paketleme henüz YOK" riskiyle tutarlı) — `tsc` ile
  ana ve extension tsconfig'inin ikisiyle de temiz derlendiği disk-verify edildi
  (363-012 goCriteria), ama bir kullanıcının kurup çalıştırabileceği paketlenmiş bir
  `.vsix` henüz yok.
