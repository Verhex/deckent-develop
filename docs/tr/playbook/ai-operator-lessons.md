# Deckent AI-Operatör Dersleri — Saha Notları

> **Yaşayan doküman.** Deckent'i bir AI ajanıyla (Claude, Codex, yerel model…) süren
> herkes için: gerçek çalışma oturumlarında yapılan hataların ve çıkarılan derslerin
> damıtılmış hâli. Her ders "Hata → Neden → Doğru kullanım" kalıbındadır. Deckent'i
> süren modele de bu dokümanı bağlam olarak verin — aynı hataları tekrar etmesin.
> Her sprint/çalışma deneyiminden sonra güncellenir (sondaki değişiklik günlüğüne bakın).
> İngilizce karşılığı: `docs/en/playbook/ai-operator-lessons.md`.

---

## 1. Plan onaylandıktan sonra task artifact'lerine ASLA elle dokunma

**Hata:** Plan onaylandıktan sonra `.tasks/task-XXX.json` dosyasına elle dependency
eklendi. Run, `TASK_ARTIFACT_CONTENT_CONFLICT` ile hiçbir worker doğmadan öldü.

**Neden:** `deckent plan` onayı bir plan-digest üretir; start makinesi artifact'leri bu
digest'e karşı doğrular (exact-plan, fail-closed). Elle edit = digest uyuşmazlığı =
dürüst red.

**Doğru kullanım:** Dependency'ler DIRECTIVES.md'de task bloğunun altına satır olarak
yazılır — parser bunu destekler:

```markdown
## Task 2: xverify CLI waiting signal (depends on Task 1)
- Files: src/cli/commands/xverify.ts
- Dependencies: Task 1
```

Başlıktaki "(depends on Task 1)" YALNIZ insan içindir; DAG'a `- Dependencies:` satırı
girer. Plan çıktısındaki "Etkin dalgalar" satırından dependency'nin gerçekten dalgalara
yansıdığını doğrula (`1:[1,3] 2:[2]` gibi).

## 2. Model-tier yönlendirmesi: kritik yüzey → üst tier, kesin akış → alt tier

**Hata:** Kritik loop-wiring görevi sonnet'e, deterministik test görevi en güçlü modele
atandı. Owner düzeltti: "model ve görev seçimi aşırı başarısız".

**Doğru kullanım:** Kapasite sırası (bu repo için): `gpt-5.6-sol > claude-opus-5 >
claude-sonnet-5`; terra/luna = sonnet-eşdeğeri ve altı. Çekirdek tasarım / runtime
authority / belirsizliği yüksek iş → üst tier. İyi-spesifiye test, fixture,
deterministik dönüşüm, dokümantasyon → sonnet sınıfı. Planı başlatmadan ÖNCE atamaları
bu kurala karşı gözden geçir.

## 3. Disk kanıtı olmadan ilerleme iddiası yok

**Hata:** "Sprint çalışıyor" varsayımıyla beklendi; gerçekte detached child sessizce
ölmüştü (task'lar PENDING, heartbeat yok).

**Doğru kullanım:** Canlılık iddiası şu dört kanıtın kesişimidir: heartbeat dosyası
mtime'ı taze + process gerçekten yaşıyor (`kill -0` sınıfı kontrol) + log tail akıyor +
`.result` diskte. Status/projection çıktısı kanıt DEĞİLDİR. Run-flow'un gerçek son
durumu `.deckent/runtime/run-flow-store/<flowId>.events.jsonl` son satırındadır —
`RUN_FAILED` oradan okunur.

## 4. Bir hata = DUR; retry fırtınası yasak

**Hata:** Bir sprint hatası üzerine, düzeltmenin hatalı yola gerçekten ulaştığı
doğrulanmadan üç kez yeniden başlatıldı (biri stale `dist/` ile). Üç sprint çöpü doğdu.

**Doğru kullanım:** İlk hatada dur. Tam-zincir kök-neden analizi offline yapılır:
düzelt → test → build → dist'ten disk-kanıtı → TEK yeniden deneme. "Belki bu sefer
olur" diye restart atılmaz. Stale `dist/` uyarısını (`DECKENT_BINARY_IDENTITY_WARN`)
asla yok sayma — önce `npm run build`.

## 5. Onay kuyruğunu İZLE — sessiz bekleme tuzağı

**Hata:** `deckent xverify` 16 dakika "takıldı" sanıldı; gerçekte bir
reachability-probe onayı (`aprp-…`) kuyruğa düşmüş, karar bekliyordu — hiçbir çıktı
basılmadan.

**Doğru kullanım:** Uzun süren her komutta ilk refleks: `deckent approvals list`.
Onaylar tek-kullanımlıktır ve koşuya bağlıdır — eski bir koşunun onayı yenisine
taşınmaz; her koşu kendi onayını ister. Karar canlı-doğrulamalı kanaldan verilir
(interaktif `deckent approvals decide <id> --allow`). Otomasyonda bir izleyici döngü
kurup yeni `aprp-` kayıtlarını anında yakala.

## 6. Pipe, exit code'u maskeler

**Hata:** `komut | tail; echo $?` — okunan şey `tail`'in exit'iydi; gerçek hata yutuldu.

**Doğru kullanım:** Gerçek exit code'u ayrı yakala:
`komut > out.log 2>&1; echo "EXIT=$?"`. Deckent'in kendi tool-result zinciri de aynı
ilkeyle çalışır (exit-code truth): sen de betiklerinde aynı dürüstlüğü uygula.

## 7. Hangi bütçe neyi öldürüyor — bil ve config'ten yönet

**Hata:** Bir worker, aggregate token devre-kesicisiyle SIGKILL yedi; bir native oturum
45 dk duvar-saatinde kalıcı ölü-döngüye düştü; bir verifier 100k token / 300s / sprint
başına 1 doğrulama tavanında sürekli UNCLEAR kaldı.

**Doğru kullanım:** Üç ayrı bütçe ailesi vardır ve üçü de `.deckent/config.json`
`execution_budget` altından yönetilir (kodda sabit yok):
- `roles.worker/brain/auditor` — sprint worker'larının token/turn tavanları
- `native_agent` — native terminal oturumunun round/tool-call/duvar-saati/token profili
- `purposes.*` (örn. `xverify-adjudication`) — amaç-özel tavanlar

Uzun işte plan gecikmesi bütçe patlaması üretiyorsa tavanı config'te yükselt; kodu
bükme, sessiz fallback ekleme.

## 8. XVerify iddia disiplini: statik, diff'ten karar verilebilir, nokta-iddia

**Hata:** "Regression testi loop'u iki kez sürüyor ve şunu kanıtlıyor" gibi
çalışma-zamanı davranış iddiaları verildi — hakem diff'ten karar veremez, sonuç
UNCLEAR/HOLD.

**Doğru kullanım:** Commit'ten ÖNCE, `--files` + `--diff` + `--target` ile; her iddia
dosya içeriğinden okunarak doğrulanabilir olmalı ("X dosyası Y fonksiyonunda Z
parametresini bildirir" gibi). Evrensel iddialar ("hiçbir yerde X yok") makine-gate
işidir, hakeme sorulmaz. HOLD/UNCLEAR kapanış DEĞİLDİR — dürüst kanıt olarak receipt'iyle
kaydedilir; kapanış typed verdict + gerçek çağrı + usage + durable receipt ister.

## 9. Scope dışına yazma — dürüst tech-debt bırak

**İyi örnek (hatanın tersi):** Bir worker, görevinin gerektirdiği iki satırlık
değişikliğin kendi `filesWrite` scope'u DIŞINDA olduğunu gördü; scope ihlali yapmak
yerine `GO_WITH_TECH_DEBT` + tam tarifli açık-madde bıraktı ve handoff notu yazdı.
Kapanış, yetkili el tarafından dakikalar içinde yapıldı.

**Doğru kullanım:** Scope dışı keşif = `.result` notes'a yaz, inline düzeltme yapma.
Bağımlı task'a `.tasks/handoffs/` üzerinden ihtiyaç bildir. Sahte DONE'dan dürüst
NO_GO/tech-debt her zaman daha ucuzdur — FIX döngüsü bunun için vardır.

## 10. Yaşam-döngüsü sırası: recover → finalize → cleanup — ve temiz `.tasks`

**Hata:** `npm run build`, `.tasks` altında settle olmamış artifact'ler yüzünden
clean-gate HOLD'una takıldı; cleanup "run-orphaned" ile reddetti.

**Doğru kullanım:** Sıra her zaman: `deckent recover <sprint> --force` (gerekirse) →
`deckent finalize --sprint <id> [--force]` → `deckent cleanup`. Kanıt dosyaları
silinmez, `.tasks/archive/` altına taşınır. `rm .tasks/*` YASAKTIR — arşivleme
kanonik komutla veya archive dizinine taşıyarak yapılır. Ölü xverify twin-task'ları
da `.tasks`'ta kalıp clean-gate'i tutabilir — settle sonrası arşivle.

## 11. MASTER-PLAN hücre grameri

**Hata:** Evidence hücresine `core|discoverable` yazıldı — ham `|` hücreyi böldü, lint
kırıldı. Bir başka append hücreyi 10.000 karakter sınırının üstüne taşırdı.

**Doğru kullanım:** Hücre içinde ham pipe yok (`/` kullan); evidence bounded tutulur
(sınır aşımında eski metni receipt kaybetmeden sıkıştır); her satır değişikliğinden
sonra `npm run docs:master-plan` + `node scripts/lint-master-plan.mjs --check`.

## 12. Build sonrası dünya değişir

**Doğru kullanım:** Her kod değişikliğinden sonra build al; long-lived MCP process'i
eski `dist/`'i cache'ler — host adapterının restart/reconnect akışını uygula. Sprint
ÇALIŞIRKEN build alma (ESM cache + worker auth kaybı). User-surface değişikliği,
gerçek binary'den koşturulmuş kanıt olmadan DONE değildir (mock/unit yeşili yetmez).

## 13. Scoped-yeşil borcu landing'de ödenir — tam suite'i landing'de koş

**Hata:** Sprint politikası gereği ("sprint sırasında full-suite yok") üç dalga boyunca
yalnız scoped test koşuldu; landing'de tam suite 11 dosyada 18 kırmızı verdi — hepsi
yeni davranışlara karşı bayatlamış ESKİ test pinleriydi (truth-stats, model-identity,
yeni envelope shape'leri).

**Neden:** Scoped koşu, değişikliğin KENDİ testlerini kanıtlar; değişikliğin başka
testlerin pinlediği davranışları değiştirdiğini görmez. Bu borç birikir ve faiziyle
landing'de ödenir.

**Doğru kullanım:** Landing zincirinin zorunlu adımı: TAM suite (`VITEST_MAX_FORKS=2`
bellek tavanıyla). Kırmızıları triage et: kod hatası mı, bayat pin mi? Bayat pinleri
yeni davranışa tarihli açıklama yorumuyla hizala ("hangi dalga değiştirdi" yaz).
Ayrıca: yaygın kullanılan bir options tipine yeni alanı REQUIRED ekleme — fail-closed
semantikle (`=== true` tüketimi) optional ekle; aksi hâlde her test literal'i churn'e
girer.

## 14. Bulgu ≠ iş: raporla, owner karar versin

**Doğru kullanım:** Çalışma sırasında görülen scope-dışı her bulgu tek satır olarak
raporlanır; MASTER'a otomatik iş olarak girmez — owner admission'ı gerekir. Tekrarlayan
darboğaz döngüleri (tek-worker'a düşme, FIX-erişilemez, attribution döngüsü) görülür
görülmez owner'a bildirilir.

---

## 15. Scope'u dizin-genişliğinde ver; nokta-dosya scope'u fix zincirini boğar

**Yanlış:** Task'a yalnız değişecek dosyaların nokta listesi verildi. Worker bloklayıcıyı
komşu dosyada buldu (bayat test pini, ikinci bir resolver) — yazma yetkisi yok, dürüst
NO_GO. FIX task'ı ebeveynin AYNI dar scope'unu miras aldı → fix-fix de aynı duvara
çarptı → çözülemez döngü; sprint duraklatıldı (arka arkaya üç sprint bu sınıftan yaralandı).

**Doğru kullanım:** DIRECTIVES'te `Files:` odak listesidir ama `Scope:` ilgili dizinleri
ve muhtemel komşu test/pin dosyalarını kapsayacak genişlikte verilir (ör. yalnız
`tests/cli/lang-authority.test.ts` değil `tests/cli/` + `tests/cli/helpers/`).
Başlatırken/sürdürürken bilinçli genişleme için `--force-scope` bayrağı vardır — kullan.
Worker'ın `replan-proposal` bıraktığını görürsen bu bir scope-genişletme talebidir:
kararı bekletme, ya genişletilmiş scope'la yeniden planla ya da bloklayıcıyı ADR-D-007
el-tamamlamasıyla kapat.

## 16. XVerify onayı CANLI kanaldan ve koşu başına — eski onay yeni kanıt-tazelemeye geçmez

**Yanlış:** XVerify arka planda başlatıldı, süreç çıktıktan sonra onay verilmeye
çalışıldı (onay süreç-ömürlü — buharlaşmıştı). İkinci hata: retry koşusu YENİ bir
approval id üretti; eski id'ye verilmiş onay yeni kanıt-tazeleme isteğine geçmedi
(`approval_untrusted` fail-closed reddi — doğru davranış).

**Doğru kullanım:** XVerify koşarken stderr'deki `waiting-approval:<aprp-…>` sinyalini
CANLI izle ve HER yeni id'yi süreç çıkmadan `deckent approvals decide <id> --allow`
ile karara bağla; bir koşu birden çok onay isteyebilir (kanıt-tazeleme dahil).
`limit_hold`/cooldown türü HOLD'lar pencere dolunca kendiliğinden açılır — HOLD kapanış
değildir, sakin retry planla.

---

## Değişiklik günlüğü (her sprint deneyiminden sonra güncelle)

- **2026-08-18 — ilk sürüm** (sprint-550…556 dönemi): 13 ders damıtıldı. Kaynak
  olaylar: retry-storm krizi (550-552), NT-correction dalgası (553), NT-06 progressive
  disclosure + tier-düzeltmesi (554), plan-sonrası el-edit çakışması (555),
  `- Dependencies:` sözdizimi keşfi + kanal-onarım sprint'i (556), xverify
  approval-bekleme/bütçe RCA'sı, Qwen canlı-tur bulguları (7083).
- **2026-08-18 — sprint-556 landing güncellemesi**: Ders 13 eklendi (scoped-yeşil
  borcu + required-alan churn'ü) — kaynak: 556 el-kapamasında 11 dosya / 18 bayat
  pinin tek seferde ödenmesi.
- **2026-08-18 — sprint-558/559 dalgası**: Ders 15 (dizin-genişliği scope +
  `--force-scope` + replan-proposal okuma) ve Ders 16 (xverify canlı-onay disiplini,
  koşu-başına aprp, HOLD≠kapanış) eklendi. Kaynak olaylar: 558'in fix-scope-mirası
  kilidi ve ABORTED force-finalize'ı; 559'un kesinti sonrası manuel spawn'la
  sürdürülmesi; terminal-kilitlenme RCA'sının 3-koşu xverify kompozisyonu
  (A: `0d4f3666…` CONFIRMED, B: `752b074e…` CONFIRMED, C: onay-canlılık dersiyle
  yeniden koşuldu).
- **2026-08-18 — sprint-560 (7086 context-lifecycle)**: Ders 16'ya iki ek işledi:
  commit-kimliği xverify iddiasına gömülmez (kanal evidence-digest'i zaten taşır)
  ve chokepoint dosyaları görevlere tahsis ederken ÜRETİCİ-TÜKETİCİ zincirini düşün —
  003'ün ihtiyacı tam da 1/2'ye tahsisli dosyalardaydı; çözüm terminal-yazarların
  serbest kalmasıyla ADR-D-007 üretici el-tamamlaması + fix'in tüketici tarafı oldu.
  Sözleşme değiştiren sprint'in landing-borcu (eski fallback/notice/string-send
  pinleri) tek geçişte yeni typed sözleşmeye hizalandı; canlı Qwen kanıtı taze
  binary + gerçek sunucuyla alındı.
