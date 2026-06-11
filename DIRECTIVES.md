# DIRECTIVES — Sprint 281: Resource-Arbiter Spec Review — 3-Perspektif Audit

## Goal: `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md` (izin-önce-eylem kaynak hakemi, commit fbaed64b) implementasyona girmeden ÖNCE 3 bağımsız perspektifle denetlensin: (1) mimari & eşzamanlılık doğruluğu, (2) adversarial kırmızı-takım, (3) ürün/user-enterprise. Bu bir SPEC-REVIEW sprint'idir — KOD YAZILMAZ.

## Ortak kurallar
- **AUDIT task (ADR-053):** `src/`, spec dosyası veya başka HİÇBİR mevcut dosyaya DOKUNMA. Tek yazımın: kendi rapor dosyan (`docs/reviews/resource-arbiter-spec/`) + `.tasks/task-XXX.result`.
- **Koda-karşı doğrulama ZORUNLU:** Spec, mevcut modüllere entegrasyon iddiaları içeriyor (file-lock.ts deseni, spawn PATH enjeksiyonu, hb/watchdog, PROGRESS/notify Sprint-280 altyapısı, host-detector, nervous approve/edit). Yüzeysel okuma YASAK — iddiayı GERÇEK koddan `file:line` ile teyit et veya çürüt.
- **Rapor formatı:** Markdown; her bulgu: `[P0]`/`[P1]`/`[P2]`/`[P3]` severity (P0=blocker, P1=major, P2=minor, P3=nit) + somut gerekçe (spec bölüm referansı + varsa kod `file:line`) + öneri. Sonda zorunlu blok: `## Verdict: APPROVE | APPROVE_WITH_CHANGES | REWORK` + en kritik 3 madde özeti. Teyit ettiğin güçlü yönleri de yaz (yalnız kusur avı değil, dengeli denetim).
- **Dil:** Rapor Türkçe (teknik terim İngilizce serbest). Rapor user-facing değil, i18n gerekmez.
- Test koşma, build koşma — bu read-only denetim. `.tasks/task-XXX.result` YAZ (selfAssessment + notes'a verdict).

---

## Task 1: Mimari & Eşzamanlılık Doğruluğu Denetimi
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: architect
- Skills: system-architect, typescript-expert
- Files: docs/reviews/resource-arbiter-spec/01-architecture-correctness.md
- Scope: docs/reviews/

### Description
Spec'i (`docs/superpowers/specs/2026-06-11-resource-arbiter-design.md`) mimari doğruluk gözüyle denetle:
(a) **FileLeaseBackend algoritması (§5.2):** atomik rename promotion gerçekten tek-kazanan mı (iki worker aynı anda head-of-line olduğunu düşünürse?); monoton `seq` sayacının atomik artırımı pratikte nasıl — `src/core/file-lock.ts`'teki mevcut desenler (acquireLock O_EXCL, claimTaskLock, acquireSpawnLock) yetiyor mu, OKU ve karşılaştır; head-of-line promotion FIFO'yu her durumda garanti eder mi; stale-temizlik ile promotion aynı anda koşarsa yarış var mı; mtime-tabanlı TTL Docker bind-mount'ta güvenilir mi (container içi/dışı mtime semantiği).
(b) **ADR uyumu:** ADR-008 (resource-arbiter core/'da, lease-shim orchestra/'da — core'un orchestra'dan import etmediği iddiası tutarlı mı), ADR-010 (yeni dependency yok), ADR-037 (RBAC ile çelişki/örtüşme), ADR-045/064 (L1 "TOPP dispatch erteleme" iddiası gerçekçi mi — dispatch kodunu `src/orchestra/` altında bul-oku), ADR-087 (hermetiklik).
(c) **Saat-donması kontratı (§5.5):** timeout-watchdog gerçekte nerede yaşıyor — `src/orchestra/spawn-backend-docker.ts` timeout mantığı + `src/orchestra/result-collector.ts` deadline yolu; spec'in "hb'de taze WAITING_LEASE varsa deadline uzar" kontratı bu kodlara cerrahi şekilde uygulanabilir mi, yoksa derin refactor mu gerekir? Auditor stale-heartbeat tarafı (`src/monitor/`) için aynı soru.
(d) **L1 plan-time packing (§4):** TaskKind→resource-class çıkarımı spec'te belirsiz mi; structured/AI planner çıktısından bu sinyal üretilebilir mi.
(e) Katman sorumlulukları, V1/V2 kesimi, eksik bileşen var mı (örn. `renew()` kim çağırıyor — shim mi arka-plan mı, spec netliği).

**Kanıt:** `test -s docs/reviews/resource-arbiter-spec/01-architecture-correctness.md && grep -cE "^## Verdict|\[P[0-3]\]" docs/reviews/resource-arbiter-spec/01-architecture-correctness.md` ≥ 9 (≥8 bulgu/teyit + verdict). **Test:** yok — .result YAZ.

---

## Task 2: Adversarial Kırmızı-Takım — Tasarımı Kır
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, testing-expert
- Files: docs/reviews/resource-arbiter-spec/02-adversarial-redteam.md
- Scope: docs/reviews/

### Description
Hedefin spec'teki tasarımı KIRMAK. Her açı için: çalışır bir kötüye-kullanım/kaçış senaryosu kur, severity ver, savunma öner. Asgari açılar (kendi bulduklarını EKLE):
(1) **Shim bypass:** `npx vitest` `node_modules/.bin`'i PATH-shim'den önce mi çözer? `node node_modules/vitest/vitest.mjs` doğrudan çağrı? `package.json` içindeki `npm test` script'i (npm, çocuk-process PATH'ini nasıl kurar — npm kendisi `node_modules/.bin`'i BAŞA ekler!)? `bash -c 'PATH=/usr/bin vitest run'`? Worker'ın (LLM) shim'i fark edip bilinçli/bilinçsiz devre-dışı bırakması.
(2) **Saat-donması suistimali:** buggy/kötü worker sahte `WAITING_LEASE` hb yazarak timeout'u SONSUZ uzatabilir mi — spec'te sentinel'in arbiter-tarafı doğrulaması var mı (hb iddiası ile leases/waiting/ kaydının çapraz kontrolü)?
(3) **Fail-open suistimali:** `leases/` dizinini bozmak (silmek/izin kırmak/çöp dosya) gate'i topyekûn kapatır mı — fail-open'ın "bypass'a dönüşen DoS" yüzü; hangi minimum bütünlük kontrolü şart?
(4) **Starvation/livelock:** 1-2 sn polling + head-of-line altında 6 bekleyenli kuyrukta adalet; capacity>1'de tek-tek promotion'ın gecikme maliyeti; `reject` policy'de eşzamanlı iki migration'ın ikisinin de reddedilme olasılığı.
(5) **Çoklu-bağlam çakışması:** aynı `.deckent/leases/` üstünde 2 eşzamanlı sprint, sprint+REPL, veya host'ta elle koşan `vitest` (shim'siz — gate'i hiç görmez!) — "korumasız katılımcı" problemi; spec bunu adresliyor mu?
(6) **Crash pencereleri:** holder crash → TTL dolana dek kapasite kayıp (1800 sn!) — etki + erken-tespit (pid liveness?) önerisi; shim'in `trap release EXIT`'i SIGKILL'de çalışmaz — bu yol spec'te var mı?
(7) **Injection/spoofing:** `match` regex'lerinden shim dosya adı üretimi (binary adı `;rm -rf` benzeri olabilir mi); lease JSON'una sahte holder yazımı; `.deckent/shims/` worker filesWrite dışında ama Docker mount'ta yazılabilir — bütünlük?

**Kanıt:** `test -s docs/reviews/resource-arbiter-spec/02-adversarial-redteam.md && grep -cE "^## Verdict|\[P[0-3]\]" docs/reviews/resource-arbiter-spec/02-adversarial-redteam.md` ≥ 9 (≥8 bulgu + verdict). **Test:** yok — .result YAZ.

---

## Task 3: Ürün & User/Enterprise Perspektifi Denetimi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: architecture-planner
- Skills: system-architect, documentation-writer
- Files: docs/reviews/resource-arbiter-spec/03-product-perspective.md
- Scope: docs/reviews/

### Description
Spec'i deckent-iç dogfood gözüyle DEĞİL, ürün gözüyle denetle (solo user + enterprise):
(a) **Solo user:** 8-16 GB makinede `capacity:"auto"` formülü ne üretir (hesapla); sürpriz-bekleme UX'i — worker kuyruktayken kullanıcı bunu NEREDE görür (PROGRESS/notify yüzeyleri `src/core/notification-dispatcher.ts` + Sprint-280 sonrası gerçekte hangi yüzeylere gidiyor, OKU); REPL'de görünürlük; "neden yavaş?" sorusunun cevaplanabilirliği (`deckent lease ls` yeterli mi).
(b) **Enterprise/ERP:** `erp.material.<lot>` genellemesi gerçekçi mi — iş-kaynağı lease'ini KİM acquire eder (worker mı, autonomous capability-dispatch mi, insan onayı mı); lease süresi iş süreci ölçeğinde (saatler/günler) TTL modeliyle uyumlu mu; `tenant` alanı rezervasyonu F3/F4 planlarıyla (`docs/MASTER-PLAN.md` §4 + ADR-067/068/071) hizalı mı.
(c) **Prior-art kıyası:** GNU make jobserver, GitHub Actions `concurrency` groups, k8s ResourceQuota/PriorityClass — bu tasarım hangi kanıtlanmış desenleri alıyor, hangilerini kaçırıyor (örn. jobserver'ın token-tabanlı modeli vs bizim sınıf-tabanlı)?
(d) **Konfigürasyon UX:** `resource_classes` JSON'unu gerçek kullanıcı tanımlayabilir mi — şema doğrulama, hata mesajları, `deckent config` yüzeyi; stack-profil "JSON-veri ile dağıtım" mekanizması ürünleşmiş mi yoksa el-sallama mı?
(e) **Görünürlük/i18n kapsamı** (en+tr mesaj listesi eksiksiz mi) + docs/onboarding ihtiyacı (hangi doküman güncellenmeli).
(f) **V1/V2 kesimi ürün değeri:** REPL/autonomous wire'ın V2'ye kalması solo-user'ı korumasız bırakıyor mu (REPL tek-agent — gerçek risk?); dashboard kuyruk panelinin V2'ye kalması enterprise demoda eksik mi?

**Kanıt:** `test -s docs/reviews/resource-arbiter-spec/03-product-perspective.md && grep -cE "^## Verdict|\[P[0-3]\]" docs/reviews/resource-arbiter-spec/03-product-perspective.md` ≥ 9 (≥8 madde + verdict). **Test:** yok — .result YAZ.

---

**Beklenen:** 3 audit task (opus 2 · sonnet 1), hepsi Wave-1 paralel (deps yok), dosya çakışması yok (her task kendi raporu), KOD DEĞİŞİKLİĞİ YOK. CC sprint-sonu: 3 raporu sentezleyip Alperen'le analiz.
