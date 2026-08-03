# PAZARTESİ PLANI — 2026-08-03

> Sahip: Alperen · Yazan: Claude (Fable 5), 2026-08-01 · Durum: **Fable limit-reset sonrası başla**
> Kural: Brain = Claude (fable) · Codex/gpt-5.6-sol yalnız worker + xverify · Yeni sprint bu plan onaylanmadan açılmaz.
> Amaç: **Hızlı ve doğru bitirmek** — 400 maddelik liste değil, sıralı 4 faz. Her faz bitmeden sonraki başlamaz.

---

## FAZ 0 — Güvenli zemin (30 dk)
- [ ] **Sprint-491 kanıtı dondurulur:** Alperen onayı olmadan finalize/cleanup/`rm .tasks/*` yok — 491, FAZ 4'teki dört-katmanlı kırılmanın (criteria sızıntısı · yanlış scope · bozuk FIX üretimi · runtime zinciri) canlı kanıt setidir.
- [ ] `git status` temizliği: mevcut 35 modified dosya ya commit edilir ya bilinçli stash — kirli zeminde docs resetine girilmez.
- [ ] `docs/` **silinmeden önce** `docs/archive/docs-pre-reset-2026-08-03/` altına taşınır (`MASTER-PLAN.md` ve `docs/archive/*` hariç — onlar yaşamaya devam eder).
  - Neden silme değil arşiv: MASTER-PLAN = iş-takip SSOT'u; ADR geçmişi `.brain/memory.db`'de ama insan-okur izler docs'ta. Geri dönüş kapısı açık kalır.

## FAZ 1 — Dokümantasyon sıfırdan (core set, azı ama doğrusu)
Hedef: **Deckent'i geliştiren modellerin ilk baktığı yer güncel olsun.** Yazılacak çekirdek set (başka doc yok):
- [ ] `README.md` — ne, neden, kurulum, 5 dakikada ilk run (gerçek binary ile doğrulanmış komutlar).
- [ ] `docs/VISION.md` — Trinity/agentic-OS vizyonu + 3 Yasa özeti (tek sayfa).
- [ ] `docs/ARCHITECTURE.md` — Goal→Mission→Flow→Run→WorkItem→Attempt→Operation zinciri, 8-faz lifecycle, src/ haritası (koddan üretilmiş, elle uydurma yok).
- [ ] `docs/CLI.md` — `deckent --help` gerçek çıktısından türetilir; her komut gerçek binary'de koşturulup çıktısıyla yazılır.
- [ ] `docs/MCP.md` — 49 tool'un gerçek şema/davranışı; CLI ile parite tablosu.
- [ ] `docs/DB.md` — `.brain/memory.db` + `.deckent/*.db` şemaları (gerçek `PRAGMA table_info` çıktısından).
- [ ] `docs/MASTER-PLAN.md` — korunur, FAZ 3'te revize edilir.
- Kabul kriteri: her doc'taki her komut/şema **çalıştırılarak** doğrulanmış olacak (Proof-of-Function); "koddan bakılıp yazıldı" yetmez.

## FAZ 2 — Kod tabanı ↔ dokümantasyon fark analizi
- [ ] Kapsamlı kod analizi (paralel ajanlarla): CLI komutları ↔ `docs/CLI.md`, MCP tool'ları ↔ `docs/MCP.md`, DB şemaları ↔ `docs/DB.md`, mimari ↔ `docs/ARCHITECTURE.md`.
- [ ] Bilinen tutarsızlık alanları önden listede: **CLI komut tutarsızlıkları · MCP tarafı tutarsızlıklar · DB tarafı** (Alperen, 2026-08-01).
- [ ] Çıktı: tek fark-raporu — her fark için `kod doğru / doc doğru / ikisi de yanlış` kararı + düzeltme yönü.

## FAZ 3 — İş planı revizyonu
- [ ] Fark-raporu + mevcut MASTER-PLAN birleştirilir → **revize MASTER-PLAN** (Durum+Tarih sütunlu tek tablo korunur).
- [ ] Önceliklendirme tek soruyla: **"Yayına giden en ince dilim ne?"** — o dilime girmeyen iş "sonra" kolonuna.
- [ ] Codex-dönemi raporu (2026-08-01, %42 başarı / ~95B token analizi) karar-satırı olarak MASTER-PLAN'a işlenir.

## FAZ 4 — Runtime stabilizasyonu (Codex denetim raporu entegrasyonu)
Kaynak: `.analysis/codex-brain-audit-2026-08-01/` (data.json + methodology.md, Codex öz-denetimi, 2026-08-01) + Claude değerlendirmesi (aşağıda). İki rapor aynı verdikte birleşiyor: **core bugün publish-grade autonomous değil; müdahalesiz uçtan-uca sprint başarısı 0/31.**

**4a. Tek bounded bootstrap-recovery dilimi — şu 6 sistem kapatılmadan yeni feature/büyük sprint YOK:**
- [ ] Criteria isolation — bir taskın scoped kriterine başka taskın ambient `tsc` hatası sızmasın (491-001 vakası).
- [ ] Repair scope augmentation — NO_GO teşhisindeki eksik dosyalar FIX scope'una otomatik eklensin; aynı imkânsız scope FIX'e kopyalanmasın (491-005/006 vakası).
- [ ] Generated skill durability — PLAN'da üretilen skill FIX'lerde kaybolmasın (`FORCED_SKILL_UNAVAILABLE`).
- [ ] Atomic result writing + malformed-recovery — 3 malformed `.result` vakası (475-017, 475-032, 491-005-fix) collector'ı bir daha kilitleyemesin.
- [ ] Collect→evaluate→status transactionality — valid result toplanmışken task EXECUTING'de kalamasın.
- [ ] Continuous slot refill — EXECUTE bitmeden FIX doğabilsin, boş slot dolabilsin.

**4a-ek. Canlı yakalanan runtime sürtünmeleri (2026-08-01 build olayı, kanıt: bu oturum):**
- [ ] `deckent bot stop` identity-guard kilitlenmesi: build-source-mismatch HOLD'u, drift'i çözecek stop/recovery komutlarının kendisini blokluyor — recovery-sınıfı komutlar guard'dan muaf (veya typed override'lı) olmalı. Workaround: OS SIGTERM.
- [ ] Bot SIGTERM'de `bot.pid` dosyasını temizlemiyor (graceful-shutdown ADR-G-013 eksiği); clean guard ölü PID'i doğru tolere etti (👍) ama pid-dosya hijyeni kapanmalı.
- [ ] `clean` "dashboard'ı koru" derken `build:dashboard` "çıktı boş olsun" istiyor → `E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY`; iki policy çelişiyor. Workaround: `rm -rf dist/dashboard` + yeniden build.
- [ ] 19 stale run-flow/run-job projection'ı (`STALE`/`STALE_DEAD`) `deckent recover` ile typed kapatılmalı — clean çıktısını kirletiyorlar.
- [x] ~~Codex Tur-1 HOLD kalıntıları: `docs:ref:check` 5/5 missing + `lint:master-plan` IDENTITY_REGISTRY_MISSING~~ → **2026-08-02 KAPANDI** (aşağıda "Doküman kapıları" bölümü).
- [ ] provider-observation DB source v2 ↔ live v1 migration bekliyor (MASTER-PLAN adayı).

**4b. Sertifikasyon merdiveni** — her basamak gerçek-binary, fail eden basamakta dur, aynı küçük replay tekrar:
1. Tek başarılı task → 2. Üç-tasklı dependency zinciri → 3. Kasıtlı NO_GO→FIX→DONE → 4. Malformed-result recovery → 5. NOT_DISPATCHED→recover → 6. Mixed-provider refill → 7. 50-task smoke.
- Kabul: ardışık ≥3 sprint owner müdahalesiz `COMPLETE + gate PASS`; sıfır malformed result; sıfır task/summary/gate/receipt çelişkisi.

**4c. Gate-authority çelişkisi (ayrı kök-neden işi):** 476/478/481'de tüm root'lar NO_GO iken final gate PASS verdi — gate, summary, task-state ve receipt farklı logical-task tanımı kullanıyor. Tek canonical logical-progress authority'ye bağlanacak (487/488'de başlayan iş bitirilecek).

**4d. Codex'in Brain'e dönüş şartları:** raporun 10 maddelik yeniden-yetkilendirme listesi aynen kabul (wiring tablosu, call-graph'tan scope kanıtı, ambient kriter yasağı, 3× müdahalesiz COMPLETE+PASS…). O zamana kadar Codex = worker + xverify, dispatch authority yok. Karar: Alperen, 2026-08-01.

## FAZ 5 — Kapanış kuralları (bundan sonrası için)
- [ ] Doc-drift bir daha birikmesin: managed-docs (`src/orchestra/managed-docs/`) üretilen bölümleri sahiplenir; elle yazılan core set FAZ 1'deki 6 dosyayla sınırlı kalır.
- [ ] Her sprint ≥1 ileri/vizyon işi taşır (kanun #6) — yalnız-yama sprinti açılmaz.

---

### Codex denetim raporu — Claude değerlendirmesi (2026-08-01)
- **Rapor güvenilir ve öz-eleştirel:** Codex kendi 10 planlama hatasını (yanlış scope, ambient kriter, erken büyük-sprint kararları) runtime kusurlarından ayırıp üstlenmiş; kanıt zinciri `.analysis/codex-brain-audit-2026-08-01/` altında tekrarlanabilir (collect.mjs → data.json). Metodoloji dosyası çelişkileri sessizce çözmüyor — bu, raporu güçlü kılıyor.
- **İki sayı farkının açıklaması (ikisi de doğru, katman farklı):**
  - *Dönem:* Codex "korunmuş ilk run 461 (28 Tem), ~4 gün" diyor; config yedekleri koltuk değişimini 20 Tem'e koyuyor. 453–460 arası koşular Codex-config döneminde ama run-kaydı zayıf; Claude raporu 13 günü, Codex raporu korunmuş-kanıtlı 4 günü ölçüyor.
  - *Token:* Codex 63M raw input (yalnız task'a atfedilebilen korunmuş usage satırları; satırların %40'ında usage eksik) → **alt sınır**. Claude 95,5 Milyar input (oturum-düzeyi kümülatif, %97,8 cache-read dahil) → **toplam yakım**. "Başarısız işe atfedilen ≥20,2M raw input + %38 NO_GO oranı" ile "7 günde sıfır settle'a rağmen milyarlarca token" aynı hikâyenin iki ölçeği.
- **Raporun en kritik yeni bulgusu:** gate-authority çelişkisi (tüm root'lar NO_GO iken gate PASS — 476/478/481) → FAZ 4c'ye alındı.
- **Verdikt uyumu:** iki bağımsız analiz de aynı yerde: kapasite var (490 tek structural başarı), güvenilirlik yok (491 dört-katmanlı kırılma). Bu yüzden FAZ 4, FAZ 1-3'ün (docs+analiz) arkasına değil MASTER-PLAN revizyonunda **en ince yayın dilimiyle aynı önceliğe** konmalı — çünkü hiçbir feature dilimi bu 6 sistem kapanmadan güvenle akmıyor.

### Doküman kapıları — 2026-08-02 kapanış kaydı (Claude/Opus 5)
Alperen kararı (2026-08-02): config değişmez (Brain Fable'da kalır), xverify kapalı, FAZ 4a ertelendi; bu oturum yalnız **doküman + kontrol** işini bitirir.

- **Kök neden (tek ve ortak):** docs-reset'te pipeline'ın sahip olduğu üç dizin — `docs/generated/`, `docs/adr/`, `docs/reference/` — elle-yazılan doküman sanılıp arşive taşınmıştı. Bunlar üretilen projeksiyondur; arşive gitmemeliydi.
- `docs/generated/master-plan-active.{json,md}` + `docs/adr/*.md` (51) arşivden geri alındı → **`lint:master-plan` OK** (322 satır · 318 aktif · 22 receipt · projeksiyonlar in-sync).
- `npm run docs:ref` koşuldu → **`docs:ref:check` 5/5 in-sync** (mcp-tools 49 · mcp-resources 8 · adr README 50 · cli 165 · agents 23).
- **`lint:link` 33 → 0.** 30'u `.analysis/run-rename-dilim2-inventory.md`'nin *alıntıladığı* link metinleri (sahte pozitif) → `.lintlinkignore`'a `.analysis/**` eklendi (`docs/analysis/**` zaten listedeydi; tutarsızlık giderildi). 3 gerçek kırık link onarıldı: `CHANGELOG.md` ×2 → arşiv yolu, `CONTRIBUTING.md` ×1 → `docs/en/architecture.md`.
- **README'nin salt-okunur orientation bloğu bağımsız ikinci tarafça yeniden doğrulandı:** `--version-json` · `doctor --json` · `onboard --plan-only --json` · `status --json` → hepsi exit 0; sayılar birebir (doctor 15/17, kalan 2 non-required: Brain Budget + Gemini auth; `configPlan.applied=false`).
  - **Execution-proof HOLD'u AÇIK KALIYOR** ve bu bir gözden kaçırma değil, owner kararı: `plan`/`start`/`do` gerçek provider çağrısı yapar, Brain hâlâ tükenmiş `claude-fable-5`'te (config bilinçli değiştirilmedi) ve FAZ 4a ertelendi. Kapanış yeri = FAZ 4b sertifikasyon merdiveni.
- **`.lintlinkignore`'a `.analysis/**` eklendi — Alperen onayına açık karar** (Claude/Opus 5). 30 bulguyu config ile susturuyor; gerekçe: dosya link metinlerini tablo içinde *alıntılıyor* ve `docs/analysis/**` zaten aynı gerekçeyle listedeydi. Reddedilirse alternatif = envanter dosyasını link-temiz hale getirmek.
- **Canlı üretilen MASTER-PLAN adayı (CLI-12 doğrulandı):** `doctor --json` çıktısı `"v24.15.0 (>=18 required)"` diyor, `package.json` ise `engines >=24`. Gerçek binary çıktısında bugün yeniden üretildi — iki satırlık, kullanıcıya görünen doğruluk hatası.
- **README sayı-iddiaları bağımsız doğrulandı:** `truth --json` → 5 kontrat, Codex'in verdiktleriyle aynı; manifest → 21 active / 4 lightly_used / 9 dormant / 1 dead; `TOOL_CATALOG` → 49.
- **Coverage matrisi KAPANDI (Codex Tur-3, 2026-08-02):** 42 `EKSİK` → **0**. Canlı kapsam 623/623 (%100), tarihsel sınıflandırma 31/31 (%100). Doğrulanan 11 canlı-ilgili satırın **11'inde de** en az bir bayat/superseded iddia çıktı — arşiv gerçekten "kapsam çıtası, gerçeklik kaynağı değil"di. Düzeltilen EN/TR hedefler: adr-system, authority-rbac, features/catalog, interactive-surfaces, api-surface, platform-security, lifecycle-internals, development-and-release (+ mcp, recovery-troubleshooting, current-frictions, developer-handbook).
  - Örnek bayat iddia: ADR-010 "tek runtime bağımlılık = commander" → bugün 13 required + 3 optional dependency; `.claude/rules/karpathy-discipline.md` de aynı dogmayı ADR-D-005 lehine emekli etmiş. ADR-090: sürüm iddiası doğru, izolasyon iddiası (`yalnız runInkRepl mount eder`) bayat → `⚠️ partial`.
  - OQ-29 (32/10 ↔ 31/11 çelişkisi) `RESOLVED`: hata Tur-3 prompt'unun düz-metin cümlesindeydi (aritmetik); aynı prompt'un tablosu baştan 31/11 diyordu. Ledger: 29 kayıt, 24 açık HOLD, 5 çözülmüş.
- ~~Pazartesi karar notu: generated reference ağacı nereye?~~ → **KARAR VERİLDİ ve UYGULANDI (Alperen, 2026-08-02):** üretilen içerik `docs/generated/{en,tr}/reference/` altına, elle yazılan `docs/{en,tr}/reference/` ağacının **tamamen dışına** alındı. Gerekçe: ikisinin bir daha karışmaması. Kural `docs/generated/README.md`'de sabitlendi; test artık üretilenin `docs/{en,tr}/reference/` içine düşmesini **yasaklıyor**.

### Repo hijyeni + generated ağaç yeniden yapılandırması — 2026-08-02
- **`.gitignore`:** `.analysis/`, `docs/archive/`, `docs/analysis/` eklendi. Üçü de tracked olduğu için gitignore tek başına etkisizdir; untracking ayrı ve bilinçli adımdır.
- **`.analysis/` untracked** (`git rm --cached -r`, 59 dosya / 3.1M) — diskte duruyor, git geçmişi koruyor.
- **`docs/archive/` (1079 dosya / 149M) bilinçli BEKLETİLDİ:** coverage matrisi 654 satırda arşiv yollarını kanıt gösteriyor; FAZ 3'te iddialar MASTER-PLAN'a taşınınca untrack edilecek.
- **`docs/analysis/` (3 dosya / 192K) bilinçli TUTULDU:** OPEN-QUESTIONS (24 açık HOLD), COVERAGE-MATRIX ve CODE-DOC-DIFF pazartesi MASTER-PLAN revizyonunun girdisi.
- **Generated ağaç iki dilli oldu:** `gen-reference-docs.mjs` locale-döngüsüne alındı → 8 dosya (`en`+`tr` × mcp-tools/mcp-resources/cli/agents) + `docs/adr/README.md` (yerinde kaldı). Yalnız çerçeve metni Türkçeleşti; tablo içeriği (tool adı, CLI bayrağı, agent id) koddan gelen tanımlayıcı olduğu için çevrilmedi. `generate-cli-docs.ts` de aynı hedefe taşındı — iki script aynı `cli.md`'yi yazıyormuş.
- **Yol boyunca çıkan iki gerçek bulgu:**
  - `generate-cli-docs.ts` hâlâ `'Sprint Workflow'` kategorisi üretiyordu; arşivdeki reset-öncesi `cli.md` ise `Run Workflow` diyordu — sprint→run yeniden adlandırması dokümana uygulanmış, **üreticiye uygulanmamış**. Yeniden üretim dokümanı geriye götürüyordu; 10 yerde hizalandı.
  - `tests/docs/reference-drift.test.ts` docs-reset'te arşive giden üç dokümana bakıyordu (`config.md`, `api.md`, `cli-commands.md`) — **reset'ten beri kırıktı**, benim taşımamdan bağımsız. İkisi yeni karşılıklarına yönlendirildi; gerçekten kaybolan iddialar (`worker_memory_limit`, `worker_memory_swap`, Brain memory sabitleri) silinmedi, `it.skip` + `DOC-GAP` yorumuyla görünür bırakıldı. **Doküman kapsam açığı — MASTER-PLAN adayı.**

### 🚨 FAZ 3 önceliğine giren bulgu — docs-reset test yıkımı (2026-08-02 tespiti)
`tests/docs/` bugün **26 dosya / 121 test kırık**. Kaynak bugünkü işler DEĞİL: bu testlerin okuduğu
dokümanlar (`docs/reference/api.md`, `docs/reference/config.md`, `docs/guide/getting-started.md`,
`docs/guide/dashboard.md`, VitePress config, agent/skill/marketplace kılavuzları …) docs-reset
commit'i `97b91e69f`'de arşive taşındı — `git ls-tree HEAD` ile doğrulandı: HEAD'de yoklar.
Yani doküman yeniden yazımı **doküman testlerini sahipsiz bıraktı**.

`tests/docs/` iki workflow'da koşuyor (`ci.yml:174`, `publish.yml:74`), yani `97b91e69f`'den
(2 Ağu 01:20) beri her push kırmızıydı. **2026-08-02 akşamı düzeltildi** — CI'ın birebir komutu
(`npx vitest run tests/docs/ tests/scripts/ --pool=forks`) artık **1543 geçiyor, 0 kırık**.

**Ne yapıldı (sayılarla — "yeşil" tek başına yeterli bilgi değil):**
- **~15 yol yönlendirmesi**: arşive giden dokümanların iki dilli karşılıklarına (`api.md` →
  `en/reference/api-surface.md`, `config-reference.md` → `en/reference/configuration-schema.md`,
  `README-TR.md` → `README.tr.md`, `docs/reference/cli.md` → `docs/generated/en/reference/cli.md` …).
- **`docs-structure.test.ts` sıfırdan yazıldı** (15 gerçek iddia): EN/TR yapısal parite,
  generated↔elle-yazılan ayrımı, pipeline ağaçlarının varlığı. Docs-reset'i yakalaması gereken
  bekçi buydu ve yakalayamamıştı; artık yakalar.
- **3 gerçek doküman hatası bulundu ve DÜZELTİLDİ** (test değil doküman düzeltildi):
  README.md + README.tr.md "30 built-in skills" diyordu → gerçek **31**;
  DECKENT.md "48 araç" diyordu → gerçek **49** (+ bayat `docs/reference/mcp-tools.md` yolu).
- **Sayı testleri kalıp yerine sayı doğrular hale getirildi** — 2026-08 yeniden yazımı ifadeyi
  değiştirmişti ("49 canonical MCP tools"), sayılar doğruydu; prose'a çakılı iddia yanlış nedenle
  kırılıyordu.
- **3 hermetiklik ihlali KALDIRILDI**: `api-md-no-stale-refs` canlı `.brain/exports/` okuyordu
  (`E_HERMETIC_LIVE_STATE_READ`); taze checkout'ta zaten yoktur.
- **~253 iddia `it.skip` + `DOC-GAP` ile görünür bırakıldı** — arşiv corpus'unun içeriğine çakılı,
  karşılığı olmayan iddialar. Silinmedi ve yeni dokümana uydurulmadı (o totoloji olurdu).
  **Bu gerçek bir kapsam kaybıdır; kapatmak FAZ 3 kalemidir.**

**Docs-reset dışı, aynı koşuda çıkan üç bulgu:**
- `lint-no-spawnsync`: oturum-öncesi provider-observation işi hot-path'e 4 yeni `spawnSync`
  (git hash-object/cat-file/diff) eklemiş. Ratchet `--update` ile sessiz affetmiyor; aynı dosyanın
  **mevcut sahip etiketi** altına kaydedildi. **Onayına açık:** ya bu borç kabul edilir ya async
  migration task'ı açılır.
- `lint-test-hermeticity` ratchet taban değerleri tazelendi (unresolved 12441→12463,
  production-inventory 1198→1200) — sweep'in yan etkisi, ihlal sayısı 0.
- `lint-master-plan` "fail-closed" testi kapının zincirde **sonuncu** olmasını şart koşuyordu;
  design-tokens kapısı sonradan eklenince kırılmıştı. `&&` zincirinde her halka zaten fail-closed
  olduğu için iddia kardeşleriyle aynı kalıba (`(?: && |$)`) getirildi.

**🔴 EN BÜYÜK KEŞİF — Type Check kapısı tüm test işlerini gizliyormuş.** CI'ın `Type Check` işi
en az 2026-08-01'den (c637ca0dd) beri kırıktı ve diğer BÜTÜN test işleri ona bağlı olduğu için
`skipped` geçiyordu. Kök neden bulundu ve düzeltildi: hermetiklik tarama grafiği `dist/` ağacını
da içeriyor; CI lint'i build'den önce koştuğu için orada `dist` yok, taban değer ise build almış
yerel ağaçta üretiliyordu (12463↔12392, 1200↔1196). Taban değerler build'siz ağaca göre yeniden
hesaplandı + tazeleme prosedürü koda yazıldı. **Type Check artık yeşil.**

**Sonuç:** kapı açılınca gerçek test işleri ilk kez koştu ve **Dashboard · CLI · MCP-bundle ·
Core+Agents · Orchestra işleri kırık çıktı.** Bunlar bugünkü işten değil — günlerdir görünmüyorlardı.
Bu, FAZ 3'ün gerçek boyutunu değiştiriyor: elimizde bilinmeyen büyüklükte bir test borcu var.
Docs+Scripts işinde kalan üç kırık ise ortama bağlı/eski: Windows `taskkill` testleri Linux runner'da,
CI'da bulunmayan `.deckent/skills/docs` dizini, ve 60 sn'de zaman aşımına uğrayan containment ratchet'i.

**⚠️ Hâlâ kırık ve BENİM KARARIM DEĞİL:** `.github/workflows/docs.yml` (VitePress site deploy)
arşive giden `docs/.vitepress/**` üzerinde `npx vitepress build` koşuyor. Bu **OQ-18**'e bağlı
(nested site devam mı edecek). İlgili 65 test `describe.skip` + OQ-18 referansıyla işaretlendi;
sitenin kaderi senin kararın.

### Alperen kararları — 2026-08-02 akşamı (4 soru, 4 karar)

1. **VitePress docs sitesi → ŞİMDİLİK DURSUN, pazartesi karar.** `.github/workflows/docs.yml`
   otomatik tetikleyicileri (push/pull_request) yoruma alındı; `workflow_dispatch` bırakıldı ki
   karar denenebilsin. Bilinen-kırık bir deploy artık kırmızı raporlamıyor. **OQ-18 açık HOLD**;
   seçenekler: (a) `.vitepress` + `docs/package.json` arşivden geri + yeni `docs/{en,tr}` yapısına
   göre config → 65 test geri açılır, (b) nested site emekli + workflow silinir → 65 test kalıcı emekli.
2. **Hot-path `spawnSync` → ASYNC MIGRATION TASK'I AÇILSIN.** `spawn-backend-docker.ts`'teki 4 git
   çağrısı (`hash-object -w` ×2, `cat-file blob`, `diff --numstat`) worker-dispatch sırasında senkron
   blokluyor. Ratchet kaydı geçici; **FAZ 3 MASTER-PLAN satırı**: bu 4 çağrı async'e taşınacak ve
   ratchet'ten düşürülecek. Kod geri alınmıyor (provider-observation v2'nin dosya-diff kanıtı buna bağlı).
3. **Type Check açılınca ortaya çıkan test borcu → ÖNCE ENVANTER.** Düzeltmeye girmeden önce her CI
   işi koşulup kırıklar sınıflandırılacak: *docs-reset kurbanı · gerçek bug · ortam-bağımlı*. Boyut
   görülmeden düzeltme kararı verilmiyor. (Envanter aşağıda.)
4. **~253 DOC-GAP iddiası → FAZ 3'TE TEK TEK.** Toplu emekli edilmiyor. Her iddia için karar:
   yeni dokümana taşınacak mı, kalıcı emekli mi? Her biri MASTER-PLAN satırı olur. Bugünkü sweep'te
   1 iddia zaten geri açıldı (README sprint rozeti, stats üreticisi düzelince).

### 📋 TEST BORCU ENVANTERİ — 2026-08-03 (karar #3'ün çıktısı)
Her CI işi yerelde koşuldu, kırıklar hata-imzasına göre sınıflandırıldı. **Düzeltme yapılmadı.**

| CI işi | Kırık test | Kırık dosya | Durum |
|---|---|---|---|
| Orchestra | **349** | 52 | en büyük yığın |
| MCP + API + Integration + Security + Providers + Monitor + Skills + Analytics | **176** | 30 | |
| CLI | **116** | 30 | |
| Core + Agents | **9** | 6 | |
| Dashboard | 0 test (2 dosya) | 2 | 1165 test geçiyor; 2 dosya canlı sunucu (`127.0.0.1:3000`) istiyor |
| Docs + Scripts | **0** | 0 | bugün düzeltildi |
| **TOPLAM** | **~650** | **~120** | |

**Sınıflandırma — iyi haber: yığının çoğu tek desende toplanıyor.**

- **A · Eksik modül/fs mock'ları (~230 kırık, en büyük sınıf).** Üretim kodu değişti, testlerin
  `vi.mock` sahteleri güncellenmedi: `renameSync` (127), `ProviderError` export'u (48),
  `chmodSync` (24), `statSync().isFile` (14), `bindSprintLockToExecution` (10), `mkdirSync` (6).
  Kaynak izlendi: `run-status-read-model.ts` atomik yazımı **cd51e1821** (1 Ağu) ile,
  `sprint-log.ts` atomik yazımı **10bb6c9ae** ile geldi — **ikisi de bugün push edilen yerel
  birikimin içindeydi ve CI onları hiç test edemedi** (Type Check kapısı kapalıydı).
  Düzeltme mekanik: eksik export'ları mock'a ekle. Deseni bugün 1 dosyada uyguladım
  (`doc-updater-consistency`), çalışıyor. 324 dosya `node:fs` mock'luyor, 278'inde `renameSync` yok
  — ama yalnız atomik-yazım yolunu tetikleyenler kırılıyor.
- **B · provider-observation v2 wiring-closure (4 kırık).** Şema `runId`'yi zorunlu yaptı;
  `run-status-read-model` ve `provider-concurrency-runtime-projection` tüketicileri onsuz çağırıyor
  → `ZodError: runId Required`. Kendi scoped testleri geçiyordu, tüketicileri kırıktı. Bu tam olarak
  kalite-çıtasındaki **"production wiring closure"** vakası.
- **C · error-registry ratchet (3 kırık / 46 ihlal).** Kayıtsız 46 yeni `throw new Error(...)`
  birikmiş; `lint:errors` kapalı devre.
- **D · CLI spy/beklenti drift'i (116 kırık).** Tek kök neden yok; vaka-vaka bakılmalı.
- **E · Ortam-bağımlı (CI-only, ~6).** Windows `taskkill` testleri Linux runner'da,
  CI'da bulunmayan `.deckent/skills/docs`, 60 sn'de zaman aşan containment ratchet'i,
  dashboard'ın canlı-sunucu isteyen 2 dosyası.

**Çıkarım:** bu borç iki günde birikti ve **görünmezdi** — Type Check kırmızıydı, diğer bütün test
işleri `skipped` geçiyordu. Yani 1-2 Ağustos'ta yapılan yoğun iş hiç CI görmedi. Öncelik sırası
A → B → C → D önerilir: A mekanik ve tek hamlede ~230 kırığı kapatır.

### Notlar
- Fable limiti resetlenmeden hiçbir faz başlamaz; Codex bu planda brain değildir.
- FAZ 1-2 sırası bilinçli: önce "olması gereken"i yaz, sonra kodu ona karşı ölç — tersi, bugünkü bozuk docs'u referans almak olur.
- Bu dosya geçici köprüdür; FAZ 3 bitince içeriği MASTER-PLAN'a taşınır ve bu dosya silinir.
