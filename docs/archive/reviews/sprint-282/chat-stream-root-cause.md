# Chat Stream Boşluğu — Kök-Teşhis Raporu (Sprint 282 · Task 282-001)

**Tarih:** 2026-06-11
**Görev:** DASH-UX-1 kökü — dashboard-chat NL mesajına "Anlamadım" dönüyor; canlıda
SSE stream BOŞ kalıyor → ChatPage POST-fallback classifier-cevabı gösteriyor. İki hipotez
ayrıştırıldı ve **gerçek-binary smoke** + **hermetik repro** ile kanıtlandı.

---

## ÖZET — KÖK / ROOT

> **KÖK (PRIMARY ROOT):** `src/api/server.ts:1170` — auth-gate `queryTokenPaths` listesi
> yalnız `['/api/events']` içeriyor; **`/api/chat/stream` bu listede YOK.**
>
> EventSource Authorization header gönderemediği için token'ı `?token=` query-param'ında
> taşır (`chat-stream-client.ts:31-39`). Auth-gate (`server.ts:408-409`) tüm `/api/`
> rotalarını stream-bloğundan (`server.ts:623`) ÖNCE kontrol eder. Query-token fallback
> (`auth.ts:231`) yalnız `queryTokenPaths`'te whitelist'lenmiş yollar için çalışır →
> `/api/chat/stream` whitelist'te olmadığından **valid token bile 401'leniyor**
> (`auth.ts:244-247`). Stream adapter'a HİÇ ulaşılmıyor; EventSource `onerror` tetikleniyor,
> ChatPage onError'ı sessizce yutuyor (`ChatPage.tsx:382-384`), POST-fallback
> `buildChatReply` classifier'ına düşüyor (`server.ts:813`) → **"Anlamadım"**.

**Hipotez (a) EventSource-auth = DOĞRULANAN KÖK.**
**Hipotez (b) serve-içi CLI-spawn = İKİNCİL** — auth 401'i spawn'dan ÖNCE attığı için
canlı hata-yolunda spawn HİÇ çalışmıyor (gate hipotez (a)'dır).

---

## 🟢 FIX LANDED — Güncelleme (282-004 + 282-001-xfix · 2026-06-11)

> **Durum:** Bu raporun aşağıda ayrıştırdığı KÖK teşhisi **DOĞRU** çıktı ve fix **landed**.
> Task-2/4 chat-yolunu değiştirdiği için bu cross-fix (282-001-xfix, fresh-eyes rotation)
> teşhisi canlı kaynağa karşı yeniden doğruladı ve repro'yu güncel-gerçekliğe bağladı.

- **Birincil fix (282-004) uygulandı:** `src/api/server.ts:1208` artık
  `queryTokenPaths: ['/api/events', '/api/chat/stream']` (eski: `['/api/events']`,
  rapor metninde `:1170` olarak referanslanmıştı — kod o zamandan beri kaydı, **kök aynı**).
  `/api/chat/stream` artık `/api/events` ile **bit-aynı** sabit-zamanlı SHA-256 query-token
  yolundan geçiyor (`auth.ts:231-242`); ana Bearer-auth zayıflamadı, yeni güvenlik yüzeyi açılmadı.
  EventSource client (`chat-stream-client.ts`) **değişmedi** — token zaten `?token=`'da olduğu için
  sunucu whitelist'i sıfır-client-değişikliğiyle çalıştırdı.
- **Repro testi güncellendi (bu cross-fix):** `tests/api/chat-stream-live-repro.test.ts` artık
  `queryTokenPaths` whitelist'ini **canlı `src/api/server.ts` kaynağından türetiyor** (eskiden
  statik `['/api/events']` snapshot'ı hardcode'luydu → fix inince sessizce stale kaldı, `it.fails`
  yanlış-nedenle yeşil kalıyordu — klasik "wired ≠ working" tuzağı). Yeni hâl:
  - `it.fails` repro → kalıcı-yeşil `it`'e çevrildi: `/api/chat/stream?token=<valid>` artık
    **authenticate ediyor** (fix kanıtı; whitelist'ten path silinirse otomatik KIRMIZI).
  - **drift-guard testi** eklendi: canlı whitelist `/api/chat/stream` içermeli (regresyon sinyali).
  - **güvenlik testi** eklendi: yanlış `?token=` → **403** (fix auth'u zayıflatmıyor; token gövdeye sızmıyor).
  - 2 kontrol (events query-token; chat-stream header) korundu → toplam **5 test yeşil**.
- **İkincil (CLI-spawn) hipotezi** değişmedi: auth açıldıktan sonra adapter çalışmazsa endpoint
  dürüst SSE `error`-event'i yazar (sessiz-boş DEĞİL) — aşağıdaki Kanıt (b) hâlâ geçerli.
- **Açık takip (kapsam-dışı, bu task dokunamaz):** `src/api/middleware/token.ts:22` yorumu hâlâ
  *"by default that is just `/api/events`"* diyor — `/api/chat/stream` artık opt-in olduğundan
  yorum hafif stale; `src/api/middleware/` bu task'ın `filesWrite`'ında değil, not düşüldü.

---

## Zincir (file:line)

| # | Adım | Konum |
|---|------|-------|
| 1 | EventSource GET; token `?token=`, header İMKANSIZ | `src/dashboard/src/lib/chat-stream-client.ts:31-39, 53` |
| 2 | Auth-gate TÜM `/api/` için stream-bloğundan önce çalışır | `src/api/server.ts:408-409` |
| 3 | Static token var → header yok → `verifyBearerToken` = `'missing'` | `src/api/auth.ts:224-227` |
| 4 | Query-token fallback yalnız `queryTokenPaths.has(path)` ise | `src/api/auth.ts:231-242` |
| 5 | **`queryTokenPaths: ['/api/events']` — `/api/chat/stream` YOK** ← **KÖK** | `src/api/server.ts:1170` |
| 6 | `'missing'` + whitelist-dışı → **401** döner | `src/api/auth.ts:244-247` |
| 7 | `handleRequest` 401'de short-circuit; stream-bloğu (`:623`) HİÇ çalışmaz | `src/api/server.ts:409` |
| 8 | Adapter `chatStreamAdapter ?? chatAdapter` HİÇ çağrılmaz | `src/api/server.ts:643-665` |
| 9 | EventSource 401 → `es.onerror` → `onError("stream connection error")` | `src/dashboard/src/lib/chat-stream-client.ts:85-89` |
| 10 | ChatPage `onError` boş gövde — sessizce yutuluyor | `src/dashboard/src/pages/ChatPage.tsx:382-384` |
| 11 | POST-fallback her durumda → `buildChatReply` classifier | `src/dashboard/src/pages/ChatPage.tsx:391-393` → `src/api/server.ts:813` |
| 12 | NL mesaj classifier'da eşleşmiyor → **"Anlamadım"** | `src/api/chat-handler.ts` (`buildChatReply`) |

> Not: `src/api/middleware/token.ts:21-22` yorumu kökü zaten belgeliyor:
> *"The query-token fallback applies ONLY to the paths the server opts in via
> `queryTokenPaths` — by default that is just `/api/events`."* — `/api/chat/stream`
> Sprint 219/269'da stream eklenirken bu listeye EKLENMEMİŞ.

---

## Kanıt (a) — Canlı gerçek-binary smoke

Komut:
```bash
DECKENT_API_TOKEN="smoke-test-token-282001" node dist/cli/entry.js serve --port 3299 --no-terminal &
```

Kontrollü deney — **aynı token, aynı endpoint, yalnız taşıyıcı (transport) farklı**:

| # | İstek | Sonuç |
|---|-------|-------|
| 1 | `GET /api/chat/stream?message=ping` (token YOK) | **401** `{"error":"authentication required"}` |
| 2 | `GET /api/chat/stream?message=ping&token=<VALID>` (EventSource'un yaptığı) | **401** `{"error":"authentication required"}` ← **BUG** |
| 3 | `GET /api/chat/stream?message=ping` + `Authorization: Bearer <VALID>` | **200** `retry: 3000` (stream AÇILIR) |
| 4 | `POST /api/chat` + `Authorization: Bearer <VALID>` `{"message":"merhaba, sprint nedir?"}` | **200** `{"reply":"Anlamadım: \"merhaba, sprint nedir?\"..."}` |

**Deney #2 vs #3 kesin kanıt:** Geçerli token query-param ile **401**, aynı token header ile
**200**. EventSource yapısal olarak header gönderemez → her zaman #2 (401) yoluna zorlanır.
Bu, hipotez (a)'yı kanıtlar. Smoke (Kanıt) gereği: `/api/chat/stream` query-param yolu **401**.

## Kanıt (b) — CLI-spawn ikincil

`resolveChatAdapter('claude', {})` → `buildCliSpawnAdapter('claude', defaultSubscriptionSpawn)`
(`src/cli/commands/chat-provider-parity.ts:58-86, 163-187`) → `send/stream` çağrıldığında
`claude --print <prompt>` spawn eder. Bu kod YALNIZ stream-bloğuna (`server.ts:650-665`)
ulaşıldığında, yani **auth GEÇTİKTEN sonra** çalışır. Smoke deney #3 (header → 200) auth
geçince bloğun açıldığını gösterir; canlı hata-yolunda (deney #2) auth 401'i spawn'dan önce
attığından spawn HİÇ tetiklenmez. → Spawn sağlığı (env/PATH/`subscriptionEnv`,
`chat-provider-parity.ts:51-56`) **ikinci-derece risk**; canlı boşluğun GATE'i DEĞİL.
(Stream açıldığında adapter yine de çalışmazsa endpoint dürüst SSE `error`-event'i yazar —
`server.ts:644-646, 657-661` — sessiz-boş değil. Yani fix sonrası ikinci-derece spawn
sorunu çıkarsa kullanıcı dürüst hata görür, classifier'a sessizce düşmez.)

---

## Düzeltme yönü (Task-4 için — bu task fix YAPMAZ, yalnız teşhis eder)

**Birincil fix (kök):** `/api/chat/stream`'i auth-gate query-token whitelist'ine ekle —
`server.ts:1170` `queryTokenPaths: ['/api/events', '/api/chat/stream']`. `/api/events` ile
**bit-aynı** sabit-zamanlı SHA-256 compare (`auth.ts:231-242`) kullanılır; ana Bearer-auth
zayıflamaz, yeni güvenlik yüzeyi açılmaz (`/api/events` zaten aynı kalıbı kullanıyor).

**Alternatif (ADR-080 §3'te önerilen):** EventSource yerine fetch-tabanlı SSE-client
(Authorization-header'lı `ReadableStream` parse) — EventSource bağımlılığı kalkar, query-token
hiç gerekmez. Daha büyük değişiklik; Task-4 raporun köküne göre seçer.

**Frontend dürüstlüğü (Task-3 kapsamı):** `ChatPage.tsx:382-384` stream-hatasını sessizce
yutmamalı; kullanıcıya görünür hata + POST-yarışı deterministik olmalı (DASH-UX-1 frontend
parçası). Bu rapor o parçayı kapsamaz; yalnız stream'in neden boş kaldığını ayrıştırır.

---

## Repro testi (güncel — 282-001-xfix)

`tests/api/chat-stream-live-repro.test.ts` — gerçek `bearerAuthMiddleware`'i (`src/api/auth.ts`)
serve'ün config'iyle sürer. `queryTokenPaths` whitelist'i artık **canlı `src/api/server.ts`
kaynağından türetilir** (regex; tek `queryTokenPaths: [...]` literal'i — `server.ts:1208`), böylece
test gerçeklikten kopamaz ve path silinirse KIRMIZI'ya döner. Tamamen hermetik (yalnız git-tracked
kaynak okunur; gerçek-server yok, spawn yok, network yok). **5 test:**
- **Drift-guard:** canlı whitelist `/api/events` + `/api/chat/stream` içermeli (regresyon sinyali).
- **Kontrol:** `/api/events?token=` → auth GEÇER (mekanizma çalışıyor).
- **Kontrol:** `/api/chat/stream` + Bearer header → auth GEÇER (header taşıyıcısı etkilenmedi).
- **Repro (kalıcı-yeşil):** `/api/chat/stream?token=<valid>` → auth GEÇER (fix öncesi 401'di;
  DASH-UX-1 kökü). Path whitelist'ten çıkarsa bu assertion KIRMIZI'ya döner.
- **Güvenlik:** yanlış `/api/chat/stream?token=` → **403** (fix auth'u zayıflatmıyor; token gövdeye
  sızmıyor).

> Tarihçe: ilk repro (`it.fails` + statik `['/api/events']` mirror) fix landikten sonra stale
> kalıyordu — bu cross-fix onu canlı-config'e bağlayıp `it`'e çevirdi.
