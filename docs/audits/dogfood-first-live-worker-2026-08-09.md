# Dogfood — ilk canlı worker ve ölçülen bulgular (2026-08-09)

> MASTER-PLAN satırı `RECOVERY-DO-DOGFOOD-001` (3178) bu dosyaya işaret eder. Buradaki her sayı
> gerçek koşumdan alınmıştır; tahmin veya modelleme yoktur. İş-takip otoritesi MASTER-PLAN'dır,
> bu dosya kanıt ekidir.

## 0. Sonuç

20 gündür doğmayan worker doğdu. `deckent start` yüzeyinden tek doküman task'ı ile tam zincir koştu:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX ×3 → bounded PAUSE
```

4 worker docker'da doğdu; prompt, plan, heartbeat, landing-proposal ve result üretti. Hiçbiri
uydurmadı, sprint sahte tamamlama yerine dürüstçe duraklattı.

**Dogfood yine de ayakta değil:** hedeflenen doküman üretilmedi, çünkü task NO_GO ile kapandı.
Zincir çalışıyor, iş henüz bitmiyor.

## 1. Worker'ı doğuran fix — bütçe zarfı anahtar sırası

Docker spawn backend'inin bütçe-zarfı kapısı altı alanı karşılaştırıp tek opak cümle basıyordu.
Spawn deneme-1'i üç ardışık koşuda öldürdü ve kaynak okuyarak çözülemedi. Önce alan düzeyinde
teşhis eklendi, sonra koşu gerçeği söyledi:

```
budget:
  disk = {"maxTurns":100,"maxCacheReadTokens":10000000,"maxInputTokens":9720,"maxOutputTokens":14400}
  host = {"maxTurns":100,"maxInputTokens":9720,"maxOutputTokens":14400,"maxCacheReadTokens":10000000}
```

Değerler birebir aynı, yalnız **anahtar sırası** farklı. Kapı `JSON.stringify` ile sıraya duyarlı
string karşılaştırması yapıyordu. Bütçe ve landing-policy bacakları kanonik karşılaştırmaya alındı
(anahtarlar sıralı). Gerçekten farklı bir bütçe hâlâ fail-closed.

## 2. Token muhasebesi — iki yapısal hata

Ham `turn.completed` kaydı (`.tasks/task-496-001.log`):

```json
{"input_tokens":101859,"cached_input_tokens":66560,"cache_write_input_tokens":0,
 "output_tokens":3604,"reasoning_output_tokens":1192}
```

2 turn, 6 `command_execution`, 16 text item. Prompt dosyası 15.250 karakter (~3,8k token),
`estimatedTokens` 3.201, tavan `maxInputTokens` 9.720.

**(a) Birim uyuşmazlığı.** Tahmin *tek prompt*'u ölçüyor; devre kesici *turdaki tüm model
çağrılarının toplamını* sayıyor. Burada 32 kat. Agent loop'ta her çağrı transkripti baştan
gönderdiği için tool-çağrısı sayısıyla büyür — sabit bir headroom çarpanı bunu güvenli yapamaz.

**(b) Cache çifte sayımı ve ters teşvik.** `input_tokens` `cached_input_tokens`'ı **içeriyor**
(101.859'un 66.560'ı). Ayrıca `maxCacheReadTokens: 10.000.000` bacağı var; aynı token iki yere
yazılıyor. Sonuç ters yönde: cache isabet oranı arttıkça input tavanı daha hızlı patlıyor, yani
containment ödüllendirmesi gereken verimliliği cezalandırıyor. Taze input yalnızca **35.299**'du.

**Doğru containment agent loop için token değil:** tavan uygulanacaksa taze input
(`input_tokens − cached_input_tokens`) + output üzerinden; cache ayrı bacakta ve çifte sayılmadan;
asıl sınırlar tur sayısı, tool-çağrısı sayısı ve wall-clock (ilki ve sonuncusu zaten var,
tool-çağrısı sayacı yok).

## 3. Containment fix yolunda kaçıyor

| task | budget |
|---|---|
| `496-001` | `maxTurns:100, maxCacheReadTokens:10M, maxInputTokens:9720, maxOutputTokens:14400` |
| `496-001-fix` | `maxTurns:100, maxCacheReadTokens:10M` |
| `496-001-fix-fix` | `maxTurns:100, maxCacheReadTokens:10M` |

Fix task üreticisi token bacaklarını taşımıyor. İlk worker 101.859 token'da `exitCode=137` ile
kesildi; fix worker'ları 69.782 ve 69.077 tüketip **kesilmeden** tamamlandı. Devre kesici tutarsız
değil — containment fix yolunda kayboluyor.

## 4. FIX fazı planlama kusurunu retry ediyor

Hata "scope çelişkisi"ydi: task `src/` doğrulaması istiyordu ama read-scope yalnız `docs/reference/`
idi (ve o dizin yoktu). Bu, worker'ın düzeltebileceği bir sınıf değil. Üç fix turu aynı dürüst
NO_GO'yu yazdı, ~210k token boşa gitti. Bu sınıf tespit edilip re-plan'a eskalasyon istiyor.

Üç worker da uydurmadı — honesty gate'in çalıştığının kanıtı.

## 5. Prompt kompozisyonu

15.250 karakter, 189 satır. Bölümler: Budget Landing Checkpoint Protocol · Primary Task Prompt ·
3 ADR bloğu · Your Task · Definition of Done · Plan-Time Execution Contract · What To Do ·
Environment Tool Inventory · VERIFY STEPS · Scope Rules · Heartbeat · Result & Self-Assessment ·
Karpathy Discipline · Turn Economy · Pipe-Exit Honesty · Artifact Reuse.

Enjekte edilen 3 ADR'nin **2'si "Active constraint: none"** — biri design-only, biri hiç enforce
edilmiyor. Tek sayfalık doküman görevi için `adr-d-011 Global Install Topology` ve
`adr-d-012 Terminal Risk Language` taşınmış. Bu sabit iskele her model çağrısında yeniden gidiyor.

Owner kararı 2026-08-09: prompt gürültüsü şimdilik bırakılıyor, ürün bittikten sonra ele alınacak.

## 6. Run-flow birikimi

44 flow, son olaylarına göre:

| son olay | adet |
|---|---|
| `APPROVAL_GRANTED` | 17 (sıkışmış) |
| `RUN_FAILED` | 11 (terminal) |
| `RUN_COMPLETED` | 8 (terminal) |
| `PREVIEW_READY` | 5 (onay bekliyor) |
| `APPROVAL_REJECTED` | 3 (terminal) |

Depo: `.deckent/runtime/run-flow-store/run-flow-authority.sqlite` (records, commands,
projection_state, start_attempt journal/identities, recovery manifests) + flow başına JSONL aynalar.

Onay verilip başlatılmayan her koşu `APPROVAL_GRANTED`'da kalıyor. Üç kapı birden kapalı:

1. `--close-stale` ölü process arıyor; bunlar hiç başlamadı
2. `--reject` `AWAITING_APPROVAL` istiyor; `APPROVED` reddediliyor
   (`cannot apply 'APPROVAL_REJECTED' to state 'APPROVED'`)
3. `runs` yalnız 10 satır listeliyor ve hedefi o pencere içinde çözüyor — sayfalama ve doğrudan
   flowId adresleme yok, dolayısıyla 22 terminal-olmayan flow'un hiçbirine erişilemiyor

İki bağımsız kusur: listeleme penceresi, ve `APPROVED`'dan geri çekilme geçişinin olmaması.

## 7. Diğer ölçümler

- **`recover --resume` tek atımlık.** İlk çağrı task'ı PENDING'e çevirip checkpoint'i tüketiyor,
  ikinci çağrı `Resume HOLD` veriyor — kurtarma yüzeyi kendi durumunu bozuyor.
- **Çöken koordinatör sahte `.result` yazıyor** (`coordinator-crashed-before-docker-prepare`) ve bu
  sonraki resume'u `unprepared-attempt-has-worker-result` ile kilitliyor. Owner kararı: tasarım
  gereği, şimdilik kabul.
- **Canlı koşuda `deckent status`** hâlâ `RUN_STATUS_READ_MODEL_UNAVAILABLE` veriyor.
- **Planner deaktif model atayabiliyor.** `gpt-5-mini` ve `gpt-4.1-mini` owner tarafından
  kapatılmışken plana girdi; aktivasyon store'u yalnız detection'ı filtreliyor, planning/routing/
  admission/spawn hatlarını değil. `start` yolunda config'ten çözülünce doğru model
  (`gpt-5.6-terra`) seçildi.

## 8. Binary-identity guard

Guard yalnızca deckent kaynak checkout'unda tetikleniyor — ürün kullanıcısı hiç görmez. Ama deckent
kendi kaynağını değiştiren bir runtime olduğundan worker `src/`'ye yazdığı an `dist/` bayatlıyor ve
guard operatörü `status`/`watch`/`recover`/`finalize` komutlarından kilitliyor. 2026-08-09'da üç kez
ölçüldü; her seferinde yalnız `clean`'siz `tsc` ile kırılabilen kapalı döngü üretti.

Owner kararı: aynı-checkout ailesi (`build-source-mismatch`, `build-identity-missing`,
`build-identity-invalid`) advisory `WARN`; cross-checkout ailesi (`runtime-root-mismatch`,
`build-root-mismatch`) fail-closed `HOLD` kalır — gerçek tehlike odur.

Gerçek-binary kanıtı: `src` bilerek bayatlatıldı, `deckent runs` çalıştırıldı → `WARN` basıldı,
komut normal çıktı verdi, `exit=0`.
