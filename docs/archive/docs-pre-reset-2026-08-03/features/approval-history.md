# Approval History — Ayarlanmış-Onayların Salt-Okunur Denetim İzi

> **Endpoint:** `GET /api/approvals/history[?status=&limit=&offset=]` · **Panel:**
> `ApprovalHistoryPanel.tsx` (dashboard entry-point adı: `ApprovalHistory.tsx`, re-export)
> **Default:** her ikisi de kod-seviyesinde var ve testli, ama panel **hiçbir dashboard
> route/nav'a bağlı değil** (bkz. Riskler — disk-doğrulandı)
> **Kaynak:** `src/api/approval-history-endpoint.ts` (tüm dosya) + `src/api/server.ts:1064-1068`
> (route wiring) + `src/dashboard/src/components/ApprovalHistoryPanel.tsx` (tüm dosya) +
> `src/dashboard/src/components/ApprovalHistory.tsx` (re-export)
> **Doğuş:** sprint-359 Task 359-013 (endpoint+panel) → sprint-360 Task 360-013 (server.ts'e
> kablo) → sprint-362 Task 362-005 (APRHIST-DEBT-CLOSE, hermetik unit testler) → sprint-367 Task
> 367-007-fix (`ApprovalHistory.tsx` scope-adlı re-export)
> **İlişkili:** [approval-runtime.md](approval-runtime.md) (canlı/pending onay zinciri — bu
> özellik onun **audit/history companion**'ı, `pending` kuyruğuna dokunmaz)

## Ne yapar

`ApprovalStore`'un (bkz. [approval-runtime.md](approval-runtime.md)) **SETTLED** (karara
bağlanmış) 3 kovasını — `approved` / `denied` / `expired` — sayfalanmış, salt-okunur bir denetim
listesi olarak sunar. `pending` (bekleyen) kuyruk bilinçli olarak dışarıda bırakılmıştır — o
zaten `GET /api/approvals` (Task 356-002) tarafından canlı izlenir; bu endpoint onun geçmiş/audit
tamamlayıcısıdır (dosya başı yorumu, approval-history-endpoint.ts:1-7).

```
GET /api/approvals/history?status=&limit=&offset=
   → parseApprovalHistoryQuery()   [3 param doğrulanır, hatalıysa 400]
   → buildApprovalHistoryPage()    [store.load() → kategori(ler) → serialize → sort → slice]
   → { entries: ApprovalHistoryEntry[], pagination: {total, limit, offset, hasMore} }
```

`server.ts`'te bu route, `/api/approvals/:id` bloğundan **önce** dispatch edilir (L1064-1068) —
sıra load-bearing: `:id` bloğunun prefix eşleşmesi (`/^[a-zA-Z0-9_-]+$/`) aksi halde
`/api/approvals/history`'yi `id="history"` sanıp 404 döndürürdü (regresyon testi:
`tests/api/approval-history-wire.test.ts`).

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `status` (query) | `'all' \| 'approved' \| 'denied' \| 'expired'` | `all` | 3 SETTLED kategoriden hangisi(leri) döner — `all` üçünü birden getirir (bu, "3-filtre" panelin `all` dışındaki 3 kategori düğmesine karşılık gelir). |
| `limit` (query) | integer `1-100` | `20` (`APPROVAL_HISTORY_DEFAULT_LIMIT`) | Sayfa boyutu; aralık dışı/tam-sayı-olmayan değer 400 döner. |
| `offset` (query) | integer `≥0` | `0` | Sayfalama ofseti; negatif/tam-sayı-olmayan değer 400 döner. |

Panel tarafı (`ApprovalHistoryPanel.tsx:288-317`) 4 filtre düğmesi render eder: `All` (reset,
`ListFilter` ikonu) + 3 kategori düğmesi (`Approved`/`Denied`/`Expired`) — her tıklama
`setStatus` + `setOffset(0)` çağırır (L258-261), yani filtre değişince sayfalama sıfırlanır.
Sayfa boyutu istemci tarafında `HISTORY_LIMIT = 20` sabiti ile eşleşir (L72 — sunucudaki
`APPROVAL_HISTORY_DEFAULT_LIMIT` ile aynı değer, paylaşılan bir modül olmadığı için elle
senkron tutulan iki küçük sabit).

## Açınca ne değişir

- Her `ApprovalHistoryEntry` yalnız **maskelenmiş** argümanları taşır (`maskedArgs`) — ham
  argüman hiçbir zaman bu satıra girmez, `rawArgsRef` store katmanının dışına çıkmaz (aynı
  ADR-G-020 redaksiyon duruşu `server.ts`'in `serializeApprovalEntry`'sinde de geçerli).
  `channel`/`decidedBy`/`decidedAt`/`reason` yalnız gerçekten karar verilmiş girdilerde dolu;
  süresi geçmiş ama henüz süpürülmemiş (`decision` yok) bir `expired` girdide bunlar `null`'dır.
- Sonuçlar **en-yeni-önce** sıralanır (`sortKey`, L101-103): `decidedAt` varsa onunla, yoksa
  (süpürülmemiş expired) `expiresAt` ile.
- Panel her filtre için ayrı bir boş-durum metni gösterir (`emptyDescAll`/`approved_empty_desc`/
  `denied_empty_desc`/`emptyDescExpired`) — "henüz hiç yok" ile "bu kategoride yok" ayrımı nettir.

## Kapalıyken garanti

Bu bir config-flag değil, salt-okunur bir GET endpoint + izleme paneli — hiçbir karar/mutasyon
yolu yoktur (`ADR-G-033`/`ADR-G-020`: "dashboard izler, asla karar vermez"). Endpoint her zaman
canlıdır (route her zaman wired) ama zararsızdır: yalnız `ApprovalStore.load()` okur, hiçbir şey
yazmaz. `approval_gate` kapalıyken (bkz. [approval-runtime.md](approval-runtime.md)) hiç istek
üretilmediği için bu endpoint sadece boş kovalar döner.

## Riskler

- **Panel hiçbir dashboard route'una/nav'a bağlı değil (disk-doğrulandı, 2026-07-05):**
  `src/dashboard/src/App.tsx`'te `/api/approvals` veya `/api/approvals/history` ile ilişkili
  hiçbir `<Route>` yok, `Sidebar.tsx`/`nav-items.ts`'te bir "Approvals"/"Onaylar" girişi yok.
  `ApprovalHistoryPanel.tsx` ve kardeşi `ApprovalsPanel.tsx` (canlı/pending panel) kod olarak
  mevcut ve hermetik testlerle kanıtlı (bkz. Kanıt) ama kullanıcı bugün bu ekranlara dashboard
  içinden **ulaşamaz** — yalnız doğrudan API çağrısıyla veri görülebilir. Bu, dokümantasyon
  hatası değil gerçek bir wiring boşluğu; takip görevi gerekir (route + nav-item eklemek).
- **`LOCAL_LABELS` i18n kataloğu dışında** (`ApprovalHistoryPanel.tsx:74-118`) — panelin
  yazma-yetkisi `src/dashboard/src/i18n/{en,tr}.ts`'i kapsamadığı için birkaç panel-özel string
  (`title`, `filterAll`, `pageInfo`, …) merkezi `t()` kataloğu yerine dosya-içi `LOCAL_LABELS`
  map'inde yaşıyor — iki dil de kapsanıyor ama i18n-first kuralına göre teknik borç olarak
  işaretli (dosya başı yorumu L25-31: "docImpact: migrate LOCAL_LABELS into en.ts/tr.ts").
- **`revertOnboardingApply` benzeri bir "undo" bu özellikte yok** — history salt-okunur bir
  görünüm; bir onay kararını burada geri almak/değiştirmek mümkün değildir (kasıtlı: audit
  trail'in bütünlüğü, [approval-runtime.md](approval-runtime.md)'nin karar zinciriyle çelişmez).

## Kanıt

- Testler: `tests/api/approval-history-endpoint.test.ts` (362-005 APRHIST-DEBT-CLOSE — hermetik
  unit, `parseApprovalHistoryQuery`/`buildApprovalHistoryPage` doğrudan bir `ApprovalStore`
  fixture'ına karşı), `tests/api/approval-history-wire.test.ts` (360-013 — gerçek HTTP üzerinden
  `createHttpServer` + route-order regresyonu), `tests/dashboard/approval-history-panel.test.tsx`
  (359-013 — filtre/sayfalama/boş-durum/decide-butonu-yokluğu tam davranış kapsamı),
  `tests/dashboard/approval-history.test.tsx` (367-007-fix — scope-adlı `ApprovalHistory.tsx`
  re-export'unun doğru render ettiğinin dar kanıtı, tam davranış testi panel dosyasında).
