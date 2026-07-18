# Desktop Enterprise-Grade Plan — «deckent şu an napıyor?» (KABUL Gün-1 · P7, Alperen-yönü)

**Tetik (Alperen):** *"Sprint durumu, dosya-akışı, deckent şu an napıyor — yok. History'de sadece kod
var. Worker'ları görebileceğim detaylı pencere yok. `.deckent` altında desktopta gösterilebilir
milyon tane özellik var. Geliştirmeden önce enterprise-grade app nasıl olur, DETAYLI planla; sonra
geliştir."* — Bu belge o plan. İhtiyaç-analizinin (aynı-gün) üstüne oturur; onu **ekran-ekran spec** +
**disk-gerçeği veri-eşlemesi** + **fazlı yol-haritası** seviyesine indirir.

## 0 · Tasarım-anayasası (her ekran için bağlayıcı)
1. **Canlı-öncelik:** her ekranın ilk sorusu "ŞU AN ne oluyor?" — statik liste ancak canlının arkasında gelir.
2. **Basit-VE-gelişmiş:** üst-güverte (SEYİR/ÇALIŞMA) günlük-akış; alt-güverte (KAYNAKLAR/GÖZLEM) uzman-derinlik, katlanabilir — bir-tık uzakta, asla gizli değil. **Sahte-menü yasak:** ray'e yalnız gerçek-çalışan görünüm girer.
3. **587-deseni zorunlu:** her ekran = orchestra-servis → HTTP-kontrat → görünüm; CLI ve Desktop AYNI servisi tüketir, ikinci-implementasyon asla.
4. **Dürüstlük-dili:** eksik-veri adıyla söylenir (`unverified`, `no-base`, gate-off bandı); Köprüüstü metafor DİLDE yaşar, süste değil; renk asla tek-taşıyıcı değil.
5. **Enterprise-DNA baştan:** tenant-farkındalı kontratlar (ADR-G-017/031), audit-edilebilir mutasyonlar (yalnız mandal-arkası), i18n-tam (en/tr), a11y (react-aria + focus-ring), 3-vardiya tema, milyon-kayıt-ölçeği (sanal-liste + sayfalama + cap'ler AÇIK).

## 1 · Veri-hazinesi → ekran eşlemesi (disk-gerçeği, bugün taranan)

| Kaynak (gerçek yol) | İçerik | Ekran (↓§2) | Sunucu-yüzü |
|---|---|---|---|
| `.tasks/task-*.json`/.plan/.hb/.result | canlı görev: hedef/scope/goCriteria · plan · **kalp-atışı** · sonuç+evidence | Operasyon-Merkezi + Worker-Penceresi | 🔴 yok → `sprint-live-service` |
| ACTIVITY-kanalı (live_trace, N5-açık) + `/api/workers/:id/logs` SSE | worker'ın **satır-satır canlı** işi | Worker-Penceresi | 🟢 SSE VAR |
| `.deckent/runtime/scheduler-shadow/sprint-N.jsonl` | faz-geçişleri, zamanlama | Operasyon-Merkezi faz-şeridi | 🔴 → aynı servis |
| `.locks/` + task.scope.filesWrite | **dosya-akışı**: kim hangi dosyada | Operasyon-Merkezi dosya-haritası | 🔴 → aynı servis |
| `.deckent/runtime/jobs/run-*.json` | koşu-kapanışları (metrik/özet) | Runs-detay | 🟢 jobs-join VAR |
| `runtime/run-flow-store/*` (events/handle/snapshot) | akış-yaşamı, plan-snapshot, gitBase | Runs-detay + Rota | 🟢 VAR |
| `runtime/evaluations/` + `decisions/` | Brain değerlendirmeleri, GO/NO_GO | Runs-detay "karar-izi" | 🔴 → oku-servis |
| `.brain/memory.db` — **retro 203 · memory 290 · debt 222 · pattern 69 · adr 47 · chat 354** | kurumsal-hafıza | Brain-Gezgini + Debt + Runs-retro-bağı | 🔴 → `brain-read-service` |
| `.brain/sprints/*.md` | sprint-anlatıları | Runs/Arşiv detayı | 🔴 → aynı |
| `.deckent/agents/*` (tanım+PROMPT+**stats**) · `skills/*` | ajan/skill havuzu + başarı-oranları | Kaynaklar: Agents/Skills | 🔴 → `pool-read-service` |
| `cost-config.json` + `stats/` + usage | maliyet/limit/kullanım | Insights | 🔴 → `insights-service` |
| `runtime/prompt-lint.jsonl` | prompt-kalite akışı (İZLENEN geçici-kanun!) | Insights: Kalite | 🔴 → aynı |
| `capability-audit.jsonl` · `crashes/` · `ERRORS.md` | güvenlik/kaza izleri | Insights: Sağlık | 🔴 → aynı |
| `config.json` (+şema) · `run-gate` · `safety-point` · `workspace/IDENTITY` | yapılandırma | Settings | 🟢 `/api/config` VAR |
| `routing/` · `provider-cache` · MCP/connector kayıtları | entegrasyon-düzlemi | Integrations | 🔴 → oku+mandallı-yaz |
| `recently-works/*.log` | detached-koşu logları | Runs-detay log-sekmesi | 🟡 kısmî |
| `approvals/` + broker | onaylar | Approvals ✓ | 🟢 VAR |
| git (N4-servis) | status/diff/proposal/commit | Changes | 🟢 **bugün açıldı** `/api/git/*` |

## 2 · Ekran-ekran spec

### 2.1 «Köprü» — Operasyon-Merkezi (YENİ ana-ekran; ray'de Console'un yerini alır, Rota içine taşınır)
**Amaç:** tek bakışta *deckent şu an napıyor*. **Veri:** sprint-live-service (tasks+hb+faz+locks) + ACTIVITY-SSE + run-flow-SSE.
**Bileşenler:** (a) **Faz-şeridi**: PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→CLEANUP, aktif-faz vurgulu + süre; (b) **Worker-kartları ızgarası**: her worker = kart [ajan-adı+model · task-id+başlık · durum(hb) · son-aktivite-satırı (canlı) · dosya-sayacı · süre]; kart-tık → Worker-Penceresi; (c) **Dosya-akış paneli**: filesWrite-scope'ları + kilitler — "şu an dokunulan dosyalar" canlı listesi, çakışma kırmızı; (d) **Rota-şeridi** (mevcut course-strip, seçili akış); (e) **Emir-satırı** (mevcut). **Durumlar:** sprint-yok (dürüst boş + son-koşu özeti + Emir-CTA) · koşuyor · bitti (özet+Changes-CTA). 
### 2.2 Worker-Penceresi (drill-in; modal değil, sağ-panel/route `/workers/:taskId`)
**Amaç:** Alperen'in "worker'ları görebileceğim detaylı pencere". **Veri:** task.json + .plan + .hb + live-trace-SSE (`/api/workers/:id/logs`) + .result. **Bileşenler:** üst-kimlik [task-id · ajan · model · durum · hb-tazeliği]; sekmeler: **Canlı** (satır-akış, otoscroll+durdur) · **Görev** (hedef/goCriteria/scope-listesi) · **Plan** (.plan metni) · **Sonuç** (self-assessment+evidence+dosya-listesi→Changes-diff-bağı). Koşu-sonrası da açılır (arşiv-görev).
### 2.3 Runs (liste+detay; History'nin yerini alır — "sadece kod" biter)
**Detay-sekmeleri:** Özet [hedef · durum · revizyon · gate · metrikler · süre] · **Plan** (snapshot: task-listesi+scope'lar) · **Görevler** (evidence-satırları → Worker-Penceresi-arşiv) · **Karar-izi** (evaluations/decisions: GO/NO_GO gerekçeli) · **Diff** (mevcut panel) · **Retro** (memory.db retro-kaydı + öğrenmeler) · Log (recently-works).
### 2.4 Changes ✓sunucu-hazır — status+diff+öneri+**commit** (mandal-arkası); Rota-bağlamlı (flowId) veya serbest.
### 2.5 Telsiz — kalıcı-geçmiş (profil-anahtarlı) + «işe-çevir» (mesajdan → Emir-satırına devir) + araç-onay-kartları (sonraki-faz).
### 2.6 Engine Room ✓ (bugün kanıtlı) — ileride: oturum-adlandırma, split.
### 2.7 Approvals ✓ — ileride: risk-rozetleri, toplu-karar.
### 2.8 Kaynaklar — **Agents** (kart: tanım+prompt-önizleme+**stats**: kullanım/başarı; düzenleme mandal-arkası) · **Skills** (aynı) · **Brain-Gezgini** (tip-sekmeli arama: ADR/memory/pattern/retro — FTS5 sorgusu; ADR-detay: tam-metin+status) · **Debt** (222-kayıt: filtre/önceliklendirme).
### 2.9 Insights — Maliyet (cost-config+ledger) · Kullanım/KPI · **Kalite** (prompt-lint akışı) · Sağlık (crashes/capability-audit/doctor).
### 2.10 Integrations — MCP-sunucular (kayıt/durum) · connector'lar · provider'lar+routing-görünümü (salt-okur başlar; yazma mandallı).
### 2.11 Settings — config-editörü (şema-farkındalı form, `/api/config`; tehlikeli-alan çift-onay) · cost-config · vardiya · IDENTITY-görüntüleme.
### 2.12 Kabuk: proje-seçici (üst) · durum-ışığı+Connected (alt) · bildirim-tepsisi (approval/nervous push → tray).

## 3 · Sunucu-kontrat yol-haritası (587-servisleri)
| Yeni servis (orchestra/) | Beslediği ekran | Not |
|---|---|---|
| `sprint-live-service` | Köprü + Worker-Pencere | .tasks+hb+shadow+locks tek-okuma; SSE: mevcut event-stream ACTIVITY |
| `brain-read-service` | Brain-Gezgini/Debt/Runs-retro | MemoryStore salt-okur sarmalı; FTS sorgu-cap'li |
| `pool-read-service` | Agents/Skills | tanım+stats birleşik |
| `insights-service` | Insights | cost/usage/lint/audit birleşik-okuma |
| (mevcutlar) run-flow · jobs-join · run-diff · **git** ✓ · approvals ✓ · terminal ✓ · chat ✓ · config ✓ | | |
Kontrat-kuralları: GET=serbest-okuma (loopback+bearer), her yazma=control-mutations-mandalı; SSE'ler 586-auth-v2'ye evrilir; OTel-izleri 587.

## 4 · Fazlar (her faz: gerçek-binary kanıt + Alperen görsel-onayı; KABUL sürerken F0-F1)
- **F0 (bugün-yarın · A-seti planla-hizalı):** Changes-görünümü (sunucu ✓) · Runs-detay-v1 (mevcut kontratlarla: özet/plan/diff/görevler) · Telsiz-kalıcılık · ray-grupları.
- **F1 «Köprü» (KABUL-içi hedef):** sprint-live-service + Operasyon-Merkezi + Worker-Penceresi (canlı-sekme dahil — N5-akışı burada ete kemiğe bürünür).
- **F2 Kaynaklar+Brain:** brain-read + pool-read → Agents/Skills/Brain/Debt.
- **F3 Insights+Settings:** insights-service + config-editörü.
- **F4 Integrations+Workspace:** entegrasyon-düzlemi + çoklu-proje genel-bakış.
- **F5 Enterprise-sertleşme:** 584-587 tam-bağ (SSE-auth-v2, OTel, managed-runtime), RBAC-yüzeyi, audit-görünümü, paket/dağıtım-cilası.
*(Önceki DESK-DEPTH-1..6 bu fazların içine erir; ayrıca satırlaşmaz — SSOT bu plan.)*

## 5 · Kabul-ölçütleri (plan-geneli)
"Alperen bir sprint'i başlatıp, worker'ları CANLI izleyip, birinin penceresine girip satır-akışını
okuyup, biten işi Runs-detayında karar-iziyle görüp, diff'ini inceleyip Desktop'tan mühürleyebiliyor;
Brain'e soru sorup ADR bulabiliyor; maliyeti görüyor; config'i düzenleyebiliyor — **VS Code'suz,
terminale inmeden**. Her faz-sonu bu cümlenin bir parçası gerçek-binary+görsel kanıtla kapanır."

## 6 · Alperen-kararları
1. Plan-onayı (bu belge SSOT olur; MASTER-PLAN'e tek DESKTOP-ENT treni satırı, fazlar check-listesi).
2. F0→F1 sırası onayı (KABUL sürerken F1'e kadar inilir mi, yoksa KABUL yalnız-F0'la mı sürer?).
3. «Köprü»nün Console'la ilişkisi: Console'u DÖNÜŞTÜR (önerim) vs ayrı-görünüm ekle.
