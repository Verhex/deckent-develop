# ADR-G-033 Amendment Önerisi — Authority Cutover (SURF-7)

> **Durum:** ÖNERİ (Alperen sözlü-onaylı, 2026-07-17 — "O da ölsün, tam sıfır" +
> tek-ürün-Desktop vizyon cümlesi). `.brain/memory.db`'ye insert EDİLEMEDİ:
> DB şu an her yeni süreçten `disk I/O error` veriyor (bkz. oturum raporu,
> bayat WAL-shm + eski-binding'li uzun-ömürlü süreç şüphesi). DB erişimi
> dönünce bu metin `store.insert({type:'adr', ...amendment})` ile SSOT'a
> işlenecek; bu dosya o ana kadarki kayıp-önleme kopyasıdır.

## Değişen hükümler

1. **Dashboard = KALICI olarak salt-gözlem.** "Tomorrow" bölümündeki
   "Enterprise read → write (V2 management-plane)" hedefi dashboard'dan
   ALINIR: enterprise yönetim-düzleminin istemcisi **Desktop uygulamasıdır**.
   Dashboard'daki tenant/RBAC/rate CRUD arayüzü kaldırılmıştır (SURF-7);
   `/api/enterprise/*` yazma-endpoint'leri, gelecekteki Desktop istemcisi
   için kendi admin-kapılarıyla server-side yaşamaya devam eder.
2. **Chat dashboard'dan tamamen çıkar.** "En fazla read-only conversation
   view" opsiyonu yerine dürüst yönlendirme-sayfası: birincil sohbet yüzeyleri
   native-terminal (ADR-G-034) ve Desktop. `/api/chat` + `/api/chat/stream`
   (yazan-GET) `api.control_mutations` ratchet'i arkasındadır.
3. **Orkestrasyon-kontrol mutasyonları HTTP'de default-kapalı.**
   `api.control_mutations` (default false; env-ikizi `DECKENT_CONTROL_MUTATIONS`)
   kill/cleanup/start/plan/set-directives/config/directives/chat ve
   nervous/autonomous karar-endpoint'lerini kapsar; kapalıyken dürüst 403 +
   terminal/Desktop eşdeğeri işaret edilir. Acil-durum geri-dönüşü = flag'i
   açmak. `/api/run-flow/*` (SURF-2 kontratı), `/api/enterprise/*`,
   auth ve `/api/rpc` bu ratchet'in DIŞINDADIR.
4. **Vizyon-cümlesi (Alperen, 2026-07-17):** "Kullanıcı sadece Desktop'tan tüm
   projesini, işlerini, akışını, entegrasyonlarını, ayarlarını yönetebilmeli —
   Claude Code desktop / Claude Desktop sınıfı, kapsamlı TEK ürün." Desktop,
   çalışma-alanı + enterprise-entegrasyon-alanı + süreç-durumları + akışları
   tek üründe birleştiren birincil yönetim-yüzeyi hedefidir; terminal
   full-control birincil-yüzey rolünü korur (ADR-G-034), dashboard açıklar.

## Gerekçe
SURF-3→6 ile terminal+Desktop, run-flow yaşam-döngüsünün tamamını (propose/
preview/decide/start/cancel + çapraz-yüzey devir) gerçek-binary kanıtla taşır
hale geldi; "equivalent client hazır olduğunda mutating-controls ölür" hükmünün
şartı yerine geldi. Tek-tık kill/cleanup butonları ayrıca onay-disiplinimizle
(sprint kill/cleanup yalnız Alperen onayıyla) çelişen bir risk sınıfıydı.
