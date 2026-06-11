# Resource Arbiter Spec — Ürün-Mimarı Denetimi (Solo User + Enterprise Perspektifi)

**Denetlenen:** `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md`
**Denetçi merceği:** Ürün (solo geliştirici + enterprise/ERP deneyimi) — deckent-iç dogfood merceği DEĞİL
**Yöntem:** Spec'teki her iddia gerçek kod/dokümana karşı `file:line` ile doğrulandı; bash davranış iddiası deneyle test edildi. Bağımsızlık kuralı gereği `docs/reviews/resource-arbiter-spec/` altındaki diğer raporlar OKUNMADI.
**Tarih:** 2026-06-11

---

## 0. Özet Hüküm

Mimari yön doğru: izin-önce-eylem (K1), saat dondurma (K2), daemon'suz dosya çekirdeği (K3), deterministik hakem (K4) — dördü de geçmiş acılardan (sentetik NO_GO ailesi, ADR-037 advisory dersi) doğru çıkarılmış kararlar ve spec'in dayandığı altyapı parçalarının **hepsi gerçekten diskte ve canlı** (aşağıda tek tek doğrulandı). Ancak spec, **dogfood'da çalışıp kullanıcı projesinde tanımsız kalan** bir yürütme-modeli boşluğu (shim→acquire köprüsü + docker imajı), **yazıldığı haliyle yanlış bir shim yaşam döngüsü** (`exec` + `trap EXIT` — deneyle çürütüldü) ve **görünürlük vaadinin mekanizmasız** kalması nedeniyle bu haliyle implementasyona inemez. Düzeltmeler tasarımın özünü değiştirmiyor — bu yüzden REWORK değil, **APPROVE_WITH_CHANGES**.

---

## 1. Doğrulama Tabanı — Spec'in Dayandığı Altyapı Gerçek mi?

| Spec iddiası | Kod gerçeği | Durum |
|---|---|---|
| §5.6 `emitProgress` (Sprint 280-001) | `src/core/event-stream.ts:162-163` (`PROGRESS` channel) + `:610-633` (`emitProgress`, fail-safe) | ✅ var |
| §5.6 `notify('progress')` (280-002) | `src/core/notification-dispatcher.ts:13-20` (`'progress'`, `'phase-change'` tipleri) + `src/core/notify.ts:98-104` (`notifyProgress`) | ✅ var |
| 3-surface (tty+MCP+file) | `src/core/notify-adapters/cli-adapter.ts`, `mcp-adapter.ts`, `file-adapter.ts` | ✅ var |
| Emit-site'lar canlı | `src/orchestra/result-collector.ts:828` (SPAWN), `:1021` (EXECUTE tick) | ✅ var |
| §8 nervous accept/**edit**/reject (APPROVE-007b) | `src/cli/commands/chat-nervous-bridge.ts:87-100,210-219` (`handleEdit`+`modifiedPayload`), `src/nervous/executor.ts:95-109` (merge) | ✅ var |
| §8 rule-evolver deseni + detector | `src/orchestra/rule-evolver.ts`, `src/nervous/detector-registry.ts` | ✅ var |
| §1 resource-log ölçümü | `.deckent/resource-log.jsonl` + `src/cli/commands/resources.ts:172-173` (`deckent resources` CLI) | ✅ var |
| §5.3 host-detection | `src/core/host-detector.ts:59-77` (`detectHostMemory` — /proc/meminfo öncelikli, WSL2-doğru), `src/core/system-capacity.ts:32` | ✅ var |
| §4 L1 temel (`detectScopeCollisions`) | `src/orchestra/conflict-resolver.ts`, `dependency-scheduler.ts` | ✅ var |
| §4 L4 (`tierBasedMaxWorkers`) | `src/orchestra/spawn-coordinator.ts` | ✅ var |
| §5.2 `clearStaleLocks` deseni | `src/core/file-lock.ts` | ✅ var |
| L1 TOPP-uyum | `src/orchestra/result-collector.ts:177-300` (continuous dispatch planner, ADR-064) | ✅ var |
| §5.4 worker env enjeksiyonu | `src/orchestra/spawn-backend-docker.ts:724-725` (`DECKENT_TASK_ID`, `DECKENT_PROJECT_ROOT`) | ✅ var |
| §5.2 leases/ container paylaşımı | `spawn-backend-docker.ts:698-699` — proje dizini **read-write** mount (`.deckent/` dahil) | ✅ tutarlı |
| §5.3 `tenant?` rezervi F3 hizası | `src/core/tenant-context.ts` (skeleton) + `docs/adr/067-process-mode-tenancy.md:14-16` | ✅ hizalı |

Bu tablo spec'in en güçlü yanı: **havada hiçbir bağımlılık yok**, her dayanak diskte. Bu, Sprint 211 "dormant wire" dersinin tersine örnek olarak takdir edilmeli.

---

## 2. Bulgular

### (a) Solo User Deneyimi

#### [P0] BULGU-1: Shim'in `acquire`'ı NASIL çağıracağı tanımsız — kullanıcı projelerinde (varsayılan docker backend) gate'in çalışacağının kanıtı yok

**Gerekçe:** Spec §5.1 `acquire()`'ı `src/core/resource-arbiter.ts` içinde bir **Node/TS Promise API** olarak tanımlıyor; §5.4 shim'i ise `.deckent/shims/current/<binary>` altında bir **kabuk script'i** olarak tanımlıyor ve "Shim: `acquire(class)` → …" diyor (spec:104-110). Bash script'in Node API'sini çağırma köprüsü (CLI alt-komutu mu? gömülü self-contained node script mi? saf-bash dosya protokolü mü?) spec'in hiçbir yerinde tanımlı değil. Bu seçim ürün-kritik, çünkü:

1. **Worker imajında deckent YOK.** `Dockerfile.worker:9,24,44` — imaj `node:24-trixie-slim` + global `@anthropic-ai/claude-code`; deckent kurulu değil, entrypoint yok (`:50-51`). Container'da `/workspace` = **kullanıcının projesi** (`spawn-backend-docker.ts:698-699`). deckent-dev dogfood'unda `/workspace/dist` tesadüfen deckent'in kendisidir — ama bir React/Python kullanıcı projesinde `deckent lease acquire` diye çağrılacak hiçbir binary container içinde yoktur. **Dogfood'da çalışır, üründe çalışmaz** — bu tam olarak görevin uyardığı dogfood-körlüğü sınıfı.
2. Claude'un varsayılan backend'i docker'dır (DECKENT.md, DIRECTIVES format rehberi: "varsayilan: … claude docker") → bu boşluk köşe-durum değil, **varsayılan yol**.
3. Köprü "her korumalı komutta `node` ile CLI başlat" olursa: komut başına ~100-300 ms Node soğuk-başlangıç + acquire-poll süreci komut bitene kadar YAŞAMALI mı ölmeli mi (release/renew kim yapacak) sorusu açılıyor — §5.4 bunların hiçbirine cevap vermiyor.

**Öneri:** Spec'e "Shim Yürütme Modeli" alt-bölümü ekle ve şunlardan birini seç: **(önerilen)** shim üreticisi (`lease-shim.ts`) her shim'in yanına **bağımsız, dependency'siz tek-dosya bir Node acquire-helper script'i** yazar (`.deckent/shims/.arbiter.mjs` gibi; imajda node:24 zaten var — `Dockerfile.worker:9`); shim `node .deckent/shims/.arbiter.mjs acquire <class>` çağırır. Alternatif (saf-bash dosya protokolü) iki dilde aynı protokolün bakımı demek — kaçının. Tier-1 smoke'a (spec §9) "**deckent-dışı bir kullanıcı projesi fixture'ında** docker worker + shim" satırı ekleyin; mevcut smoke deckent-dev'de koşarsa bu boşluğu asla yakalamaz.

#### [P1] BULGU-2: `trap release EXIT` + `exec` kombinasyonu çalışmaz — release hiç koşmaz, her lease TTL'e kadar (30 dk) hayalet-tutulur

**Gerekçe:** Spec §5.4: "Shim: `acquire(class)` → `trap release EXIT` → kendi dizinini PATH'ten çıkararak **gerçek binary'yi exec** eder" (spec:107). Bash'te `exec` süreç imajını değiştirir ve EXIT trap **çalışmaz**. Bu denetimde deneyle doğrulandı:

```
$ bash -c 'trap "echo TRAP_FIRED >&2" EXIT; exec true'      # → (çıktı yok)
$ bash -c 'trap "echo TRAP_FIRED >&2" EXIT; true'           # → TRAP_FIRED
```

Sonuç: yazıldığı haliyle **hiçbir lease normal tamamlanmada bırakılmaz**; tek temizlik yolu TTL-stale (heavy-test: 1800 sn). §6 adım 3'teki "w1 biter → trap release → head-of-line 1-2 sn içinde promote" senaryosu (spec:130) yazıldığı haliyle **geçersiz** — gerçek davranış "w1 biter → 30 dk sonra w3 başlar" olur. Solo kullanıcı yüzeyinde bu, "deckent testlerimi yarım saat arayla koşuyor" deneyimi demektir; ürünün temel vaadi (kuyruk ama hızlı devir) çöker. İkincil hasar: `exec` sonrası shim yaşamadığı için §5.1'deki `renew()` da granted lease için **çağrılamaz** → 30 dk'yı aşan meşru koşular (büyük suite, `cargo build` tam derleme) stale sayılıp **çift-admission** üretir — spec'in çözmeye geldiği problem geri gelir.

**Öneri:** Shim modeli "child-spawn + `wait` + sinyal-iletimi + release" olmalı (exec YOK); shim ayakta kaldığı için granted-mtime/renew tick'i de atabilir. §6 senaryosu ve §5.2 stale tanımı buna göre güncellensin. (Spec §9'daki entegrasyon testi "2 subprocess serileşme kanıtı" bu hatayı yakalardı — yani sevkiyat riski düşük; ama spec metni tasarım sözleşmesidir, yanlış kalamaz.)

#### [P2] BULGU-3: `capacity:"auto"` 8-16 GB'lık TÜM makinelerde 1 üretir — koruma doğru, ama "tam serileşme"nin UX sonucu spec'te hesaplanmamış

**Gerekçe:** Formül `max(1, min(3, floor(totalGB/16), floor(cores/4)))` (spec:96-97). Hesap tablosu:

| RAM | Çekirdek | floor(GB/16) | floor(c/4) | **auto** |
|----:|----:|----:|----:|----:|
| 8 GB | 4 | 0 | 1 | **1** |
| 8 GB | 8 | 0 | 2 | **1** |
| 16 GB | 8 | 1 | 2 | **1** |
| 16 GB | 12 | 1 | 3 | **1** |
| 24 GB | 8 | 1 | 2 | **1** |
| 32 GB | 8/16 | 2 | 2/4 | **2** |
| 40 GB | 20 | 2 | 5 | **2** (spec örneğiyle uyumlu ✓) |
| 64 GB | 16 | 4 | 4 | **3** (tavan) |
| 128 GB | 32 | 8 | 8 | **3** (tavan) |

Aynı makinelerde deckent'in worker önerisi: `suggestMaxWorkers = floor(totalGB/2)-1` (`src/core/host-detector.ts:96-103`) → 8 GB'da **3 worker**, 16 GB'da **7 worker**. Yani tipik 16 GB solo makinede ürün 7 worker önerirken heavy-test kapasitesi 1: test-ağır bir sprint'te 7 worker'ın test fazı **7× seri** çalışır. Koruma amaçlı doğru karar (2 eşzamanlı vitest bile 8 GB'ı boğar) ve K2 sahte-timeout'u engelliyor — ama duvar-saati uzaması kaçınılmaz ve spec bu beklenti yönetimini hiç ele almıyor. Ek belirsizlik: "auto"nun **nerede** çözüldüğü yazılmıyor — her shim container içinde kendisi hesaplarsa (container'da `/proc/meminfo` host değerlerini gösterir ama lxcfs'li ortamlarda göstermez) worker'lar arası kapasite tutarsızlığı doğar.

**Öneri:** (1) "auto" **bir kez host tarafında** (spawn/shim-üretim anında) çözülür ve sınıf-snapshot'ına gömülür — spec'e yaz. (2) Formül tablosunu (yukarıdaki gibi) spec'e koy; "8-16 GB = serileşme, bu kasıtlı" cümlesi docs/onboarding'e girsin. (3) 3-tavanı büyük makinelerde (64 GB+ build sunucusu) bilinçli muhafazakârlık — override edilebilirliği (`capacity: 4`) dokümante et [P3].

#### [P1] BULGU-4: §5.6 görünürlük vaadinin MEKANİZMASI tanımsız — emitProgress/notify in-process Node API'leri; shim onları çağıramaz, sprint-dışında ise hiçbir şey üretmezler

**Gerekçe:** Görev sorusu "bash shim bu Node API'lerini nasıl tetikler, spec'te tanımlı mı?" — cevap: **tanımlı değil**. Spec §5.6 "Kuyruğa giriş/grant/release → emitProgress + notify" diyor (spec:120-121) ama:
- `emitProgress` **in-process** çağrıdır ve `getCurrentSprintId` `.deckent/sprint-state.json` yoksa `null` döner → event YAZILMAZ (`src/core/event-stream.ts:219-229,618-620`). REPL/manuel kullanım = sprint yok = **sıfır görünürlük** bu kanaldan.
- `notify` global dispatcher'ı **aynı process'te** ister; yoksa sessiz no-op (`src/core/notify.ts:83-84`). tty adapter'ı Brain process'inin terminaline/parent-fd'sine yazar (`src/core/notify-adapters/cli-adapter.ts:31-60`) — container içindeki bir shim'den çağrılamaz.
- Shim worker container'ında ayrı bir process'tir; Brain host'tadır. Aradaki köprü (kim, hangi tarafta, hangi tetikle emit eder?) spec'te yok.

İyi haber: spec §5.5 zaten doğru ham veriyi üretiyor — hb dosyasındaki `WAITING_LEASE:<classId>:pos=<n>` işareti host'tan okunabilir ve Auditor zaten 30 sn'de bir tüm hb'leri tarıyor (`.claude/rules/auditor.md` scan döngüsü; `src/monitor/auditor.ts`). Eksik olan tek cümle: **emit'i host-tarafı yapar**.

**Öneri:** Spec §5.6'ya net cümle: "PROGRESS/notify emit'i shim DEĞİL, host-tarafı yapar: result-collector bekleme tick'i (mevcut emit-site deseni, `result-collector.ts:1021`) + Auditor scan'i hb `WAITING_LEASE` işaretlerini ve `.deckent/leases/` durumunu okuyup `emitProgress`/`notifyProgress` çağırır." REPL/manuel (sprint'siz) bağlam için tek görünürlük yüzeyinin `deckent lease ls` olduğunu dürüstçe yaz.

#### [P2] BULGU-5: "Neden yavaş?" sorusu `deckent status`'ta cevapsız — kuyruk bilgisi yalnız yeni `deckent lease` komutunda

**Gerekçe:** Kullanıcının kas hafızası `deckent status`'tur (workflow rehberindeki 8 adımın 5.'si). Spec görünürlüğü `deckent lease ls` + PROGRESS/notify'a koyuyor (spec:119-123) ama `status` çıktısına kuyruk satırı eklemiyor; `src/cli/commands/status.ts` task/dashboard/dep-graph okur, lease kavramı yok. Sprint yavaşladığında kullanıcının ilk bakacağı yerde "3 worker heavy-test kuyruğunda (kapasite 1)" satırı yoksa, K2 sayesinde timeout da düşmeyeceği için sprint **sessizce uzar** — kullanıcı algısı "deckent takıldı" olur; halbuki sistem tasarlandığı gibi çalışıyordur.

**Öneri (V1'e ucuz):** `deckent status` çıktısına ve Auditor'ın `.dashboard` alanına (alerts değil, info satırı) lease-kuyruk özeti ekle: sınıf başına `granted/capacity + waiting + en-uzun-bekleme`. Veri zaten `.deckent/leases/` dizin listelemesi — `status(classId?)` API'si (spec:66) bunu sağlıyor; tek iş status.ts'e bir bölüm.

### (b) Enterprise / ERP Perspektifi

#### [P2] BULGU-6: `erp.material.<lot>` genellemesi V1'de ÇAĞIRANSIZ — anlatı "şimdi çözer" tonunda ama V1'de hiçbir yürütme yolu iş-kaynağı lease'i alamaz

**Gerekçe:** §8 "lease adı serbest anahtar — `erp.material.<lot>` capacity-1 → '2 agent aynı malzemeden mamul üretemez' **aynı primitive**" (spec:145-146) — ama V1'de acquire'ı çağıran tek şey **komut-regex'iyle eşleşen shim'lerdir** (§5.4). ERP malzeme tüketimi bir shell komutu değil, bir capability-dispatch'tir ve §3 + §8 bunu açıkça V2'ye atıyor ("Autonomous capability-dispatch V2'de acquire çağırır", spec:39,146). Autonomous engine bugün **canlı ve merge'lenmiş** durumda (flag-gated default-off; `docs/MASTER-PLAN.md:169,324-326`, canlı kanıt commit `ab8f25d8`) — yani ERP-yönlü müşteri konuşmasında "engine var, arbiter var, ama ikisi V2'ye kadar konuşmuyor" demek zorundasınız. Çelişki değil (kesim dürüst), fakat §8'in sunumu V1 yeteneği gibi okunuyor — enterprise satış/demo beklentisi yanlış kurulur.

**Öneri:** §8'e tek cümle: "V1'de iş-kaynağı lease'inin çağıranı YOKTUR; primitive hazırdır, ilk tüketici V2 capability-dispatch'tir." Ayrıca olumlu düzeltme: autonomous `kind=task|sprint` girdileri `runTaskMode`/`runSprint` üzerinden **aynı worker-spawn yoluna iner** (`src/orchestra/autonomous/execute-dispatcher.ts:3,26,117`) → bu işler V1 shim korumasını **otomatik miras alır**. Spec bunu söylemiyor; söylemesi V1'in gerçek kapsamını OLDUĞUNDAN BÜYÜK gösterir (iyi yönde) [P3].

#### [P2] BULGU-7: TTL/mtime-yenileme yaşam döngüsü iş-süreci ölçeğiyle (saatler/günler) uyumsuz — V2 ERP vaadi farklı bir lease semantiği gerektirecek

**Gerekçe:** §5.2 stale tanımı "mtime > ttl → temizlenir" ve örnek TTL'ler 600-1800 sn (spec:87-93). Bu, "canlı bir OS-process'i mtime yeniler" varsayımına dayanır. ERP lot-rezervasyonu ise insan onayı bekleyen, vardiya deviren, **günler süren** bir iş-sürecine bağlıdır; holder bir OS-process değil bir iş-akışı kimliğidir. Mtime-yenileme modeliyle: ya TTL'i 86400×N yaparsınız (crash-kurtarma ölür — spec'in kendi K3 gerekçesi boşa düşer) ya da renew edecek daimî bir process tutarsınız (K3 "daemon'suz" ilkesiyle çelişir). `LeaseBackend` arayüzü (spec:62-67) imza olarak yeterli ama **semantik sözleşmesi** (TTL zorunlu mu? explicit-release-only lease olabilir mi?) tanımsız.

**Öneri:** §8/V2 notuna: "İş-kaynağı lease'leri TTL-stale yerine **explicit-release + sahiplik-devri** semantiği gerektirir; `LeaseBackend` arayüzü TTL'i opsiyonel kılacak şekilde tasarlanmalı (V1 FileLeaseBackend TTL'li kalır)." Bu bir satırlık arayüz-öngörüsü, V2'de kırıcı değişikliği önler.

#### [P2] BULGU-8: Dinamik classId çözümlemesi tanımsız + makine-kaynağı/iş-kaynağı scope ayrımı yok (tenant boyutu)

**Gerekçe:** `resource_classes` statik bir config haritası ve match alanı **komut-regex'i** (spec:85-94). `erp.material.<lot>` ise dinamik, potansiyel binlerce anahtar — config'de duramaz. Kayıtsız bir classId ile `acquire('erp.material.LOT123')` çağrılırsa kapasite/policy/ttl nereden gelir? Tanımsız. Ayrıca `tenant?` rezervi (spec:102) F3 ile hizalı (`src/core/tenant-context.ts` skeleton; ADR-067 `docs/adr/067-process-mode-tenancy.md:14-16` — tenant-scoped I/O `.deckent/tenants/<id>/` altında) fakat spec tek lease-namespace kullanıyor: **CPU/disk gibi makine-kaynakları tenant'lar arası ORTAKTIR (global scope), iş-kaynakları ise tenant'a aittir (tenant scope)**. İki farklı scoping aynı şemada ayrışmazsa V2 tenant-backend'inde `heavy-test`'i tenant-başına böler ve makineyi yine boğarsınız — ya da tersi, lot-lease'i global yapıp tenant sızıntısı yaratırsınız.

**Öneri:** Şema rezervine `tenant?` yanına `scope?: 'machine' | 'tenant'` (V1'de kullanılmaz, default 'machine') ve "kayıtsız classId → prefix-kuralı veya default-sınıf (capacity 1, queue)" kararını V2 notu olarak ekle.

### (c) Prior-Art Kıyası

**Aldığı kanıtlanmış desenler (doğru seçimler):**
- **GNU make jobserver** → token/admission çekirdeği. Üstüne iyileştirme: jobserver'ın meşhur kusuru "crash'te token kaybolur, havuz küçülür"dür; TTL/stale-temizlik (spec:81) bunu çözüyor — dosya-tabanlı seçim burada jobserver'dan **daha sağlam**.
- **Ticket lock / Lamport bakery** → monoton seq + head-of-line promotion (spec:74-81): FIFO adalet + açlık-imkânsızlığı kanıtlanabilir.
- **Chubby/etcd/k8s Lease** → TTL'li lease + renew (spec:65-66).
- **GHA `concurrency` group'un `queue` yarısı** + dürüst `reject` (spec:99).

**Kaçırdıkları:**

#### [P1] BULGU-9: Sınıf-çaprazı GLOBAL bütçe yok — jobserver'ın asıl dersi tek havuzdur; mevcut tasarımda motivasyondaki kilitlenme sınıflar-arası karışımla nüksedebilir

**Gerekçe:** §1'in ölçülmüş tezi "RAM'den önce **CPU/IO aşırı-aboneliği** kilitler" (spec:12). Ama sınıflar bağımsız sayaçlar: 32 GB makinede `heavy-test` 2 + `native-build` 2 + `package-install` 1 → **5 ağır süreç aynı anda meşru** (2 vitest fork-havuzu + 2 `make -j` + 1 npm install). Disk/CPU yine doyar. make jobserver tam bu yüzden **tek global token havuzu** kullanır. L1 packing de kurtarmaz — L1 "doğruluk garantisi vermez" diye spec kendisi söylüyor (spec:54).

**Öneri:** V1'e ucuz çözüm: sınıf şemasına opsiyonel `pool?: string` (örn. hepsi `"heavy"` havuzuna işaret eder; havuzun kendi `capacity:"auto"`su olur — acquire iki seviyeyi de geçer: sınıf-kapasitesi VE havuz-kapasitesi). V1'de built-in 4 sınıfı tek `heavy` havuzuna bağlamak, ölçülen hata sınıfını sınıf-çaprazı da kapatır. (Çoklu-lease yasağıyla çelişmez — havuz, lease değil üst-sayaçtır; tek atomik acquire içinde değerlendirilir.)

#### [P2] BULGU-10: `package-install` için coalesce/singleflight yok — kuyruk, işi SERİLEŞTİRİR ama TEKRARI engellemez

**Gerekçe:** Spec'in kendi örneği "N worker aynı anda `npm install`" (spec:18-19). capacity-1 + queue ile: w2, w1'in install'ı bitince **aynı install'ı baştan koşar**. Doğru davranış çoğu zaman "bekle-sonra-ATLA" (Go `singleflight` deseni; GHA'da `cancel-in-progress` aynı ailedendir). Kuyruk israfı kullanıcıya duvar-saati + (API-mode'da) para olarak yansır.

**Öneri:** V2 yol haritasına `policy: "coalesce"` (aynı sınıf + aynı komut-imzası bekleyenleri, holder başarıyla bitince serbest-geçirir) maddesini ekle; V1'de YAGNI kabul, ama yol haritasında adı geçmeli ki şema policy-enum'u genişlemeye açık tasarlansın.

#### [P2] BULGU-11: max-wait V1'de SINIRSIZ + alarmsız — k8s preemption/PriorityClass bilinçli ertelenmiş (doğru) ama "sonsuz sabır" gözlemsiz bırakılmamalı

**Gerekçe:** K2 sayaç dondurur (spec:30), Brain'e-devir V2 (spec:40). Birleşim: bekleyen worker **süresiz** bekleyebilir ve hiçbir eşik alarmı tanımlı değil. Auditor "taze WAITING_LEASE = sağlıklı, alarm üretme" talimatı alıyor (spec:117) — yani tek gözcü de susturulmuş. CRITICAL bir hotfix task'ı 3×30 dk'lık test kuyruğunun arkasında sessizce bekler; FIFO bunu çözmez (öncelik yok — non-goal, spec:38).

**Öneri (V1'e ucuz):** "Sağlıklı ama uzun" ayrımı: bekleme > eşik (örn. sınıf TTL'inin 1×'i) → Auditor `.dashboard`'a **info-level** "uzun lease beklemesi" satırı + tek seferlik `notify('progress', …)`. Preemption değil, sadece gözlemlenebilirlik.

### (d) Konfigürasyon UX

#### [P1] BULGU-12: Geçersiz `resource_classes` (bozuk regex / capacity / policy) davranışı tanımsız — fail-open ilkesi, KORUMANIN SESSİZCE KAPANMASI demek olabilir

**Gerekçe:** §7 fail-open'ı arbiter İÇ hataları için tanımlıyor (spec:135-137) ama **kullanıcı-config hatası** ayrı bir sınıftır: kullanıcı `"capacity": "atuo"` ya da derlenemeyen regex yazarsa ne olur? Fail-open uygulanırsa sınıf sessizce eşleşmez → kullanıcı korunduğunu sanır, korunmaz — bir **güvenlik özelliği** için en kötü hata modu. §9'da "şema doğrulama" bir test satırı olarak var (spec:160) ama doğrulamanın **ürün sözleşmesi** (ne zaman, hangi yüzeyde, hangi mesajla reddedilir) spec'te yok. Mevcut altyapı hazır: `deckent config set` dot-notation + JSON parse + `validatePartialConfig` + `ConfigValidationError` zinciri zaten çalışıyor (`src/cli/commands/config.ts:108-146`, `src/core/config.ts:1575`) — yani iç-içe `resource_classes.heavy-test.capacity` CLI'dan ayarlanabilir; eksik olan kod değil, spec'teki sözleşme.

**Öneri:** Spec'e Hata Yönetimi'ne (§7) madde: "(a) `deckent config set` yazım-anında `validatePartialConfig` ile reddeder (i18n hata mesajı: hangi sınıf, hangi alan, beklenen tip); (b) runtime'da yine de bozuk sınıfla karşılaşılırsa fail-open + **bir kez** `notify('phase-change', warning)` + `deckent doctor`'a kalıcı bulgu." Regex çift-kaçış (`"\\bvitest\\b"`) yazım hatalarına davetiye — `deckent lease test "<komut>"` (hangi sınıfa düşer? dry-run matcher) komutu V1'e ucuz, debug değeri yüksek [P3].

#### [P2] BULGU-13: "Stack profilleri … ürün data-update gönderir" ifadesi AS-7 (air-gapped/sıfır phone-home) ile çelişkili okunuyor

**Gerekçe:** Spec §5.3:100-101 "python/c++/ERP profilleri … veri olarak eklenir (kullanıcı tanımlar veya **ürün data-update gönderir**)" — deckent'te uzaktan veri-itme kanalı yok ve AS-7 sütunu "sıfır phone-home" taahhüdü taşıyor (spec §11'in kendisi de AS-7 uyumunu satıyor, spec:183). "Gönderir" fiili remote-update çağrışımı yapar; kastedilen "yeni sürümle gelen built-in JSON profilleri" ise bu ADR-010 (tek dependency) ve AS-7 ile tamamen uyumludur ama öyle yazılmalı.

**Öneri:** İfadeyi "profiller npm release'leriyle paket-içi veri olarak gelir; runtime'da hiçbir uzak çekme/itme yoktur (AS-7)" olarak netleştir. Ayrıca 3-katman merge'de `resource_classes`'ın **deep-merge mi replace mi** olduğu tanımlansın — kullanıcı yalnız `heavy-test.capacity` override ettiğinde built-in `match` listesi yaşamalı; bu klasik config-merge tuzağı (`config.ts` katman-merge davranışına referansla) spec'te bir cümleyi hak ediyor.

### (e) Görünürlük & i18n

#### [P2] BULGU-14: i18n vaadi var, anahtar listesi ve test satırı yok

**Gerekçe:** Spec §5.6 "tüm user-facing mesajlar `getMessage` (en+tr)" (spec:123) — desen doğru (`src/cli/helpers/messages.ts:1329-1345`, en+tr `:1347`) ve mesaj kataloğunda `lease.*` anahtarı bugün yok (beklenen — spec tasarım aşamasında). Ancak: (1) anahtar envanteri tanımsız (en az: kuyruk-girişi, sıra-pozisyonu, grant, release, reject-hatası, `lease ls/release/clear` çıktıları, config-doğrulama hataları); (2) §9 test tablosunda i18n satırı YOK — oysa aynı dönemin Sprint-280 task'larının hepsi açık i18n test maddesi taşıyor (DIRECTIVES.md Task 4/6/8). Quality-bar'a göre bu sözleşme spec'te görünmeli.

**Öneri:** §5.6'ya asgari anahtar listesi + §9'a "i18n: en+tr anahtar çifti var, mekanizma modülleri string-free (lease-shim/arbiter `getMessage` import ETMEZ — etiketler caller'dan)" test satırı.

#### [P3] BULGU-15: Docs/onboarding teslimat listesi yok

**Gerekçe:** Spec §10 V1 kapsamı kod-teslimatlarını sayıyor ama dokümantasyon yüzeyi yok. Bu repo'nun yerleşik deseni her özellik için referans-doc güncellemesidir (DIRECTIVES.md Task 9 deseni).
**Öneri:** V1 kapsamına ekle: `docs/reference/cli-commands.md` (`deckent lease`, `deckent resources` çapraz-ref), `docs/reference/features.md`, config referansına `resource_classes` şeması + auto-formül tablosu, DECKENT.md "Gotchas"a "test'leriniz kuyruklanıyorsa bu kasıtlı — `deckent lease ls`" satırı, `docs/MASTER-PLAN.md` §4 işaretleri.

### (f) V1/V2 Kesimi — Ürün Değeri

#### [P2] BULGU-16: "Kilitlenme fiziken imkânsız" (§6) — overclaim; gate yalnız WORKER-kaynaklı yükü kapsar

**Gerekçe:** PATH-prepend yalnız spawn edilen worker'lara enjekte edilir (spec:108). Kullanıcının kendi terminali, IDE'si ve **CC-verify döngüsünün kendisi** (CLAUDE.md akışı sprint-sonu host'ta tam vitest koşar) arbiter dışındadır. 2 worker lease'liyken host'ta bir `npm test` = 3 eşzamanlı suite. İddia "worker-kaynaklı eşzamanlı ağır-iş ≤ kapasite" olarak daraltılmalı — ürün dili dürüst kalmalı (proof-of-function kültürüyle tutarlılık).
**Öneri:** §6 son cümlesini kapsam-niteleyici ile yeniden yaz; V2 listesine opsiyonel `deckent shell-init` (kullanıcı kabuğuna gönüllü PATH kancası) fikri eklenebilir.

#### [P3] BULGU-17: REPL wire'ın V2'ye kalması bugün için DOĞRU karar — ama gerekçesi spec'te eksik

**Gerekçe:** REPL agentic bugün keyfi shell çalıştırmaz; tool yüzeyi `deckent_*` CLI-köprüsüyle sınırlı (`src/cli/repl/tool-permissions.ts:1-15,43-63` — bash/file tool yok). Yani REPL'den tetiklenen ağır iş zaten sprint/task yoluyla worker'a iner ve V1 korumasını alır. Bu olgu spec'e yazılırsa "REPL V2" kesimi savunmasız-bırakma değil, doğru-sıralama olarak görünür. (ADR-081 Agentic-OS yönü REPL'e bash tool eklediği GÜN bu karar yeniden açılmalı — spec'e tetik-koşulu olarak not düş.)

#### [P2] BULGU-18: `reject` policy × Brain FIX döngüsü = kullanıcıya maliyet yazan retry-burn riski

**Gerekçe:** §7 "reject çakışması → worker dürüst NO_GO → Brain FIX" (spec:142). FIX, task'ı yeniden spawn eder; çakışma penceresi sürüyorsa ikinci deneme de reject yer — her tur gerçek token/para (API-mode) ve duvar-saati yakar. L1 packing "doğruluk garantisi vermez" (spec:54) — yani reject-sınıfı çakışmaları plan-time'da engellenmemiş olabilir.
**Öneri:** (1) L1'e özel kural: `policy:"reject"` sınıfına dokunan task'lar **aynı wave/dispatch penceresine asla birlikte** konmaz (bu, optimizasyon değil reject-sınıfı için zorunluluk olmalı); (2) FIX-prompt'una reject-nedenini taşı (mevcut FIX enrichment deseni, ADR-073) ki yeniden deneme körlemesine olmasın.

#### Dashboard kuyruk paneli V2 — kabul edilebilir [P3]

PROGRESS event'leri event-stream dosyasına yazılıyor ve watch/MCP genel kanal akışıyla taşınabiliyor (`result-collector.ts:828,1021`; MCP `deckent_watch` backfill DIRECTIVES PLANOBS-003). Bulgu-5'teki `deckent status` satırı + `.dashboard` info alanı V1'de varsa, panelin V2'ye kalması enterprise demo'da delik açmaz: demo anlatısı "CLI+status'ta canlı kuyruk, zengin panel yol haritasında" diye kurulabilir.

---

## 3. Güçlü Yönler

1. **K2 saat-dondurma, sentetik-NO_GO ailesinin kökünü hedefliyor** — bu projenin en pahalı tekrarlayan acısına (stale_heartbeat/timeout → sahte başarısızlık; `.brain/exports/summary.md` pattern listesi bununla dolu) doğrudan, kontratlı çözüm (spec:112-117). Ürün-güveni perspektifinden spec'in en değerli kararı.
2. **Zero-hard-code kapasite** — sabit sayı gömmek yerine host-detector formülü + config override (spec:96-98); formülün spec'teki tek sayısal örneği (40 GB/20 core → 2) bu denetimde yeniden hesaplanıp **doğrulandı**.
3. **Tüm dayanaklar diskte ve canlı** (bkz. §1 tablosu) — emitProgress'ten nervous edit'e kadar; "dormant-wire üstüne kule" değil. Sprint-280 bağımlılıkları (`PROGRESS`, `notify('progress')`, `modifiedPayload`) tek tek kodda mevcut.
4. **Fail-open + dürüst reject** — yeni güvenlik katmanının ana akışı düşürmemesi (spec:135-137) ve reject'in sahte-başarıya değil dürüst NO_GO'ya gitmesi (spec:99) ürün-güven ilkeleriyle (honest-gate kültürü) hizalı.
5. **AS-7/offline ve ADR-010 uyumu yapısal** — daemon yok, ağ yok, dependency yok (spec:31,70,183); air-gapped enterprise argümanını bozmuyor (Bulgu-13'teki ifade düzeltmesi şartıyla).
6. **Öğrenme döngüsü ürünleşmiş** — resource-log → nervous detector → rule-evolver → insan accept/**edit**/reject → config (spec:148-150); zincirin her halkası gerçek modüle bağlanıyor ve "elle ayar" yerine ürün davranışı kurguluyor. Enterprise'da "sistem kendi kaynak profilini öğrenir" anlatısı güçlü bir farklılaştırıcı.
7. **V1 non-goals disiplinli** — çoklu-lease yasağıyla deadlock'u sınıf olarak yok etmek (spec:37,139), öncelik/preemption'ı YAGNI'ye atmak: doğru mühendislik ekonomisi; itirazlarım kesimin kendisine değil, kesilen yerlerin görünürlük telafilerine (Bulgu-5, 11).

---

## 4. Bulgu Özeti

| # | Sev | Başlık | Spec | Kanıt |
|---|-----|--------|------|-------|
| 1 | **P0** | Shim→acquire köprüsü tanımsız; kullanıcı-projesi docker'ında deckent yok | §5.1/§5.4 | `Dockerfile.worker:9,24,44,50-51`; `spawn-backend-docker.ts:29,698-699` |
| 2 | **P1** | `exec` + `trap EXIT` çalışmaz → release hiç koşmaz, lease TTL'e dek tutulur; renew imkânsız | §5.4/§6 | bash deneyi (bu rapor §2a); spec:107,130 |
| 3 | **P1** | §5.6 görünürlük mekanizması tanımsız (in-process + sprint-scoped API'ler; shim emit edemez) | §5.6 | `event-stream.ts:219-229,618-620`; `notify.ts:83-84`; `cli-adapter.ts:31-60` |
| 4 | **P1** | Sınıf-çaprazı global bütçe yok — CPU/IO aşırı-aboneliği karışık yükle nüksedebilir | §1/§5.3 | spec:12,54,85-94; make jobserver kıyası |
| 5 | **P1** | Geçersiz config = sessiz koruma-kaybı; doğrulama sözleşmesi yok | §5.3/§7/§9 | `config.ts(cli):108-146`; `config.ts(core):1575` |
| 6 | P2 | auto=1 (8-16 GB) tam-serileşme UX'i hesaplanmamış; auto'nun çözüm-yeri belirsiz | §5.3 | formül tablosu (bu rapor); `host-detector.ts:96-103` |
| 7 | P2 | ERP genellemesi V1'de çağıransız; TTL iş-süreci ölçeğiyle uyumsuz; dinamik classId + scope ayrımı tanımsız | §8 | `execute-dispatcher.ts:3,117`; `MASTER-PLAN.md:169`; ADR-067:14-16 |
| 8 | P2 | `deckent status`'ta kuyruk görünmüyor ("neden yavaş?" cevapsız) | §5.6 | `status.ts:306+` |
| 9 | P2 | coalesce/singleflight yok (npm-install tekrarı); cancel-in-progress ailesi değerlendirilmemiş | §5.3 | spec:18,89-90 |
| 10 | P2 | max-wait sınırsız + alarmsız (Auditor susturulmuş) | §5.5/§3 | spec:40,117 |
| 11 | P2 | "fiziken imkânsız" overclaim — host-side yük kapsam dışı | §6 | spec:108,131 |
| 12 | P2 | reject × FIX retry-burn; L1'de reject-sınıfı zorunlu-serileştirme yok | §7/§4 | spec:54,142 |
| 13 | P2 | "ürün data-update gönderir" AS-7 ile çelişkili ifade; merge semantiği tanımsız | §5.3 | spec:100-101,183 |
| 14 | P2 | i18n anahtar listesi + test satırı yok | §5.6/§9 | `messages.ts:1329-1347` |
| 15 | P3 | Docs/onboarding teslimat listesi yok | §10 | — |
| 16 | P3 | REPL-V2 kesiminin olgusal gerekçesi yazılmamış (bugün REPL'de bash tool yok) | §3 | `tool-permissions.ts:1-15,43-63` |
| 17 | P3 | Autonomous task/sprint V1'de spawn-yoluyla zaten kapsanıyor — açıkça yazılmalı | §3/§8 | `execute-dispatcher.ts:3,26,117` |
| 18 | P3 | 3-tavan büyük makinelerde under-utilization; override dokümante edilmeli; `lease test` dry-run matcher önerisi | §5.3 | formül tablosu |

---

## Verdict: APPROVE_WITH_CHANGES

Tasarımın yönü, katmanlaması ve karar gerekçeleri ürün açısından sağlam; dayandığı her altyapı parçası gerçek ve canlı. Ancak aşağıdaki üç madde spec metnine işlenmeden implementasyon plan'ına geçilmemeli:

1. **[P0] Shim yürütme modeli tanımlanmalı ve kullanıcı-projesi docker yolunda kanıtlanmalı** — bash shim'in `acquire`'ı nasıl çağıracağı (önerim: shim-üreticinin yazdığı self-contained tek-dosya node helper; imajda node:24 mevcut) + Tier-1 smoke'un deckent-DIŞI bir proje fixture'ında koşması. Bugünkü haliyle özellik dogfood'da çalışır, ürünün varsayılan yolunda (claude=docker) tanımsızdır.
2. **[P1] `exec`+`trap EXIT` akışı düzeltilmeli (child-spawn + wait + renew + release)** — deneyle kanıtlandı: yazıldığı haliyle release hiç koşmaz, her lease 30 dk hayalet-tutulur ve §6 senaryosu geçersizdir; renew'suz uzun koşular çift-admission üretir.
3. **[P1] Görünürlük köprüsü + sessiz koruma-kaybı sözleşmesi yazılmalı** — PROGRESS/notify emit'inin host-tarafında (result-collector tick + Auditor hb/lease taraması) yapıldığı açıkça tanımlanmalı (in-process ve sprint-scoped API'ler shim'den çağrılamaz); geçersiz `resource_classes` yazım-anında reddedilmeli (`validatePartialConfig` zinciri hazır), runtime'da fail-open ise bir-kez uyarı + doctor bulgusu üretmeli. Bekleyen kullanıcının "neden yavaş?" sorusu `deckent status`'ta cevaplanmalı.
