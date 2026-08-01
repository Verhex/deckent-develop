# Orphan Wire — Wave 1 (Sprint 375, Task 375-007)

> **Kaynak:** `docs/analysis/orphan-deliverables-2026-07.md` §4 "follow-up-öneri" (69
> teslim-edilmiş-ama-bağlanmamış modül). Bu doküman o listeden **kullanıcı-değeri en
> yüksek 5**'ini seçip (gerekçeli), her biri için somut, dosya/satır-seviyeli bir
> "wiring spec" veriyor.

## 0. Bu Task'ın Kapsam Çelişkisi (NO-GO Notu, önce bunu oku)

`task-375-007.json`'un `scope.filesWrite`'i **yalnızca** şu 2 dosya:
- `docs/analysis/orphan-wire-wave1.md` (bu dosya)
- `tests/governance/orphan-deliverables.test.ts`

Hiçbir `src/**` yolu bu task için yazılabilir değil. Ama task tanımı "her birini
production call-graph'ına bağla" (yani en az bir `src/` caller dosyasına import+call
eklemeyi) istiyor. Bu, `.claude/rules/worker-default.md` + `docs/guide/workers.md`'de
**YASAK** olarak işaretlenmiş "Writing outside `scope.filesWrite`" ihlaline girmeden
yapılamaz (ADR-037 RBAC). Yani bu task, kendi JSON'unun scope'u içinde **gerçek kodda
hiçbir wiring yapamaz** — bu, "375-003/004'ün kilitlediği KAPALI dosyalar" senaryosundan
farklı bir şey: hiçbir dosya kilitli değil, sadece bu task'a o dosyalar için yazma
yetkisi hiç verilmemiş.

**Sonuç:** Aşağıdaki 5 modülün hepsi bu task kapsamında **`blocked: scope`** olarak
teslim ediliyor — bu, task'ın kendi `goCriteria`'sının açıkça kabul ettiği bir çıktı
("≥5 modül wired+testli **YA DA** blocked-gerekçeli"). Her biri için somut bir
wiring spec aşağıda var — bir sonraki dalga task'ı (doğru `src/` write-scope ile)
bunu aynı gün uygulayabilir; keşif/tasarım işi burada zaten bitti.

`KNOWN_ORPHANS` allowlist'i bu nedenle **değişmedi** (bkz. §7) — hiçbir modül gerçekten
bağlanmadığı için küçültmek testi (`orphans === KNOWN_ORPHANS` roundtrip-pin) yanlış bir
şekilde kırardı.

## 1. Seçim Metodolojisi

69 aday, 4 kritere göre puanlandı:
1. **P0-hizalama** — CLAUDE.md'nin pinned "🧭 Aktif Yön (2026-06-29 pivot)" listesindeki
   5 maddeden (training-trace, runtime-wide ApprovalBroker, Hermes-tool+progressive
   disclosure, global-install+proje-scope, DIRECTIVES 0-kırılganlık) biriyle **doğrudan**
   örtüşme.
2. **"ilk-ve-tek-caller" şiddeti** — modülün kendi header'ı, bağlanmadığı için
   **başka bir zaten-var-olan production API'nin de** fiilen ölü kaldığını itiraf
   ediyor mu (yani bu tek wire iki kuşu birden vuruyor mu).
3. **Somutluk** — doğal wiring noktası (hangi dosya, hangi satır) tek bir grep ile
   netleşiyor mu, yoksa tasarım kararı mı gerektiriyor (§4.2 model-catalog kümesi gibi
   belirsiz olanlar elendi).
4. **Law 1 (dual-lens)** — hem dogfood (deckent'in kendi sağlığı) hem son-kullanıcı
   deneyimi tarafında somut bir kazanım var mı.

Elenen güçlü adaylar: §4.2 Model-Catalog kümesi (5 dosya) — `catalog-registry.ts`'in
`model-registry.ts` ile ilişkisi netleşmeden bağlamak yanlış soyutlamayı kalıcılaştırır,
önce bir tasarım kararı gerekir (bkz. orijinal doküman §4.2 notu); bu nedenle wave-1
dışında bırakıldı, wave-2 adayı olarak not düşüldü.

## 2. Seçilen 5 + Somut Wiring Spec

### 2.1 `src/core/approval-expiry-driver.ts`
- **P0 örtüşme:** "runtime-wide ApprovalBroker (çok-ortam canlı onay)".
- **İlk-ve-tek-caller şiddeti:** dosyanın kendi header'ı: *"Neither method is otherwise
  called by production code — this module is the first (and only) caller."* — yani
  bu wire olmadan `ApprovalBroker.expire()` (TTL sweep) ve `ApprovalStore.prune()`
  (retention cleanup) **de** fiilen çağrılmıyor. Sonuç: süresi geçmiş approval'lar hiç
  expire olmuyor, approval-store diski süresiz büyüyor — sessiz bir operasyonel sızıntı.
- **Wiring noktası:** `src/api/server.ts` — `ApprovalBroker` L1438'de, `ApprovalStore`
  L559/1060/1084/1426'da instantiate ediliyor (server bootstrap). Öneri: server
  başlatma sırasında bir `ApprovalExpiryDriver({ broker, store }).start(intervalMs)`
  çağrısı eklenmeli (ADR-G-013 uyumlu — `.unref()` zaten sınıfın içinde), shutdown
  hook'unda `stop()`.
- **Bağlama-testi (follow-up task'ın yazması gereken):** server bootstrap testi,
  driver'ın `running === true` olduğunu ve bir sahte-clock ile `tick()`'in
  `broker.expire`/`store.prune`'u çağırdığını doğrulamalı (mevcut
  `tests/core/approval-expiry-driver.test.ts` zaten birim-testli — eksik olan yalnız
  entegrasyon noktası).

### 2.2 `src/nervous/ask-brain-escalation.ts`
- **P0 örtüşme:** "runtime-wide ApprovalBroker" (nervous-tarafı ikizi) — DEFER-002
  kapanışı (MASTER-PLAN Sıra-75).
- **İlk-ve-tek-caller şiddeti:** header açıkça: *"deliberately NOT wired into
  dispatcher.ts / executor.ts here... threading this into the live re-notify path is
  explicit follow-up work."* Bağlanmazsa reddedilen/pending kalan nervous önerileri
  **sonsuza kadar sessizce re-notify edilir** — Brain'e hiç escalate olmaz (Law 1
  son-kullanıcı güveni: kullanıcı aynı öneriyi yüzlerce kez görür, hiçbir zaman
  "bu artık Brain'e gitti" sinyali almaz).
- **Wiring noktası:** `src/nervous/executor.ts:275 handleSuggestTimeout` — bu method
  zaten `record.decision === 'rejected'` / `outcome === 'pending'` şeklini üretiyor
  (`AskBrainEscalationTracker.isReNotifySignal` bunu mirror'lıyor, aynı sözlük).
  Öneri: `executor.ts`'e bir `AskBrainEscalationTracker` instance enjekte edilip
  `handleSuggestTimeout` içinde `recordOutcome(...)` çağrılmalı;
  `shouldStopReNotifying === true` dönünce re-notify loop'u kırılmalı.
- **Bağlama-testi:** executor.ts'in re-notify path'inde threshold'u aşan bir senaryoda
  `store.insert` ve `notify('human-checkpoint-required', ...)`'in gerçekten
  çağrıldığını doğrulayan bir entegrasyon testi (birim-test zaten var:
  `tests/nervous/ask-brain-escalation.test.ts`).

### 2.3 `src/core/global-store.ts`
- **P0 örtüşme:** "global-install+proje-scope" — pinned madde ile birebir.
- **İlk-ve-tek-caller şiddeti:** header: *"migrating those owner modules onto
  GlobalStore is separate, future work"* (design doc §8 "Born work-items" /
  ONB-GLOBAL-WIRE) — yani bu zaten dokümante edilmiş, sıralaması bekleyen bir iş
  parçası, rastgele ölü kod değil.
- **Wiring noktası:** `src/core/global-config.ts` — bugün `ensureGlobalDir()` +
  düz `readFileSync`/`writeFileSync` ile kendi ad-hoc JSON I/O'sunu yapıyor
  (atomic-write YOK, migration-chain YOK). Öneri: `global-config.ts`'in okuma/yazma
  gövdesi bir `GlobalStoreDefinition` (role: 'config') tanımlayıp `GlobalStore`'un
  `load()`/`save()`'ine devretmeli — atomic-write + fail-soft-read + versioned-migration
  bedava gelir. Aynı desen `credentials.ts` (role: 'data'/'cache') için de tekrarlanabilir
  (design doc §8'in kapsadığı 3 owner modülden biri).
- **Bağlama-testi:** `tests/core/global-config.test.ts`'e (varsa) bir
  round-trip senaryosu: `saveConfig()` → dosya `GlobalStore`'un atomic-tmp-rename
  desenini kullanıyor mu (bir ara `.{uuid}.tmp` dosyasının kısa süre var olup
  kaybolduğunu doğrulayan bir test) — mevcut ad-hoc `writeFileSync` bunu sağlamıyor,
  bu regresyon-yakalayan bir test olurdu.

### 2.4 `src/core/tool-scope-gate.ts`
- **P0 örtüşme:** dolaylı ama güçlü — CLAUDE.md `<gotchas>` bölümünde adı geçen
  **bilinen açık**: *"Scope enforcement: Worker scope.filesWrite dışına yazamaz —
  ADR-037 RBAC compile-time lint + audit-trail; runtime advisory/soft (V1.0 Layer-2
  kasıtlı eksik — ihlal git diff --stat ile Auditor tarafından izlenir + warn/emit
  edilir, bloke ETMEZ; hard-flip post-GA V2)."*
- **İlk-ve-tek-caller şiddeti:** `ScopeGate` tam olarak bu "advisory/soft" katmanı
  gerçek zamanlı (yazma-anında) sağlayacak parça — bugünkü tek enforcement mekanizması
  **post-hoc** (`git diff --stat`, Auditor tarafından sprint sonunda). `ScopeGate`
  bağlanırsa, bir worker yazma anında (dosya diske gerçekten yazılmadan önce)
  advisory bir `violation:true` sinyali üretebilir — Auditor'ın post-hoc taramasını
  değiştirmeden **tamamlayan** ikinci bir advisory katman (default `mode:'advisory'`,
  hiçbir zaman bloke etmiyor — mevcut "hard-flip post-GA V2" planıyla tam uyumlu).
- **Wiring noktası:** `src/agents/worker.ts` (dosya-yazma öncesi bir
  `createScopeGate({ projectRoot, mode: 'advisory' }).checkWrite(targetPath)` çağrısı)
  veya `src/orchestra/authority-enforcer.ts` (ADR-008 kontrolünün yanına ikinci bir
  advisory-check olarak). İkisi de `ScopeGate`'in zaten mirror'ladığı
  `core/task-types.ts` `TaskScope` şeklini kullanıyor — tip uyuşmazlığı yok.
- **Bağlama-testi:** worker.ts'in scope-dışı bir yazma denemesinde `violation:true`
  içeren bir advisory log/emit ürettiğini doğrulayan bir entegrasyon testi (mevcut
  birim-test: `tests/core/tool-scope-gate.test.ts`).

### 2.5 `src/cli/commands/retro-formatter.ts`
- **Kanıt (bu görevin kendi taramasıyla doğrulandı, aday listesindeki en somut bulgu):**
  `retro.ts` **kendi** `RETRO_LABELS` sabitini (L19) ve `lbl()` fonksiyonunu (L43) ve
  `formatRichSummary()`'yi (L105) tanımlıyor — `retro-formatter.ts`'in **aynı üç
  export'unun bağımsız bir kopyası**. `retro-formatter.ts` gerçek implementasyon +
  test'e sahip ama `retro.ts` onu import etmek yerine kendi paralel kopyasını yazmış.
  Bu, DIRECTIVES'in "3 kez yaşanan desen" olarak tarif ettiği aynı olgunun (ölü-endpoint
  / orphan-kart / pool-görünmez-katalog) dördüncü somut örneği: **iki paralel
  implementasyon, yalnız biri bağlı.**
- **Law 1 / i18n-FIRST riski:** CLAUDE.md quality-bar'ın "i18n-FIRST" maddesi tam bu
  riski tarif ediyor — iki bağımsız TR/EN etiket haritası aynı veri için var olduğunda,
  biri güncellenip diğeri unutulursa sessiz bir çeviri-drift'i oluşur.
- **Wiring noktası:** `retro.ts` L19-45 + L105 civarındaki yerel tanımlar silinip
  `import { formatRichSummary, lbl } from './retro-formatter.js';` ile
  değiştirilmeli (retro-formatter.ts zaten `RichSprintSummary` tipini
  `retro-parser.js`'den alıyor — retro.ts ile aynı tip zinciri, adaptör gerekmiyor).
- **Bağlama-testi:** `retro.ts`'in mevcut retro-format testleri (varsa) import
  sonrası hâlâ yeşil kalmalı — davranış değişmemeli, yalnız kaynak birleşiyor; ek
  olarak `retro-formatter.ts`'in artık `KNOWN_ORPHANS`'tan çıktığını doğrulayan
  governance testi (bu dosyanın kendisi) kırmızıya döner ve bilinçli güncellenir.

## 3. Wave-2 Adayları (Bu Dalgaya Alınmadı — Kayıt İçin)

- **§4.2 Model-Catalog kümesi (5)** — `catalog-registry.ts`'in `model-registry.ts` ile
  ilişkisi netleşmeden bağlamak riskli; önce bir tasarım notu gerekir.
- **§4.7'nin geri kalanı (8)** — `chat-intent-executor.ts` özellikle, ama bu dosya
  şu an 375-003'ün (`src/cli/commands/chat-native.ts`, `src/cli/repl/app.tsx`,
  `src/connectors/chat-bridge.ts`) aynı NL-dispatch alanında **eşzamanlı** çalıştığı
  dosyalarla aynı komşulukta — çakışma riski nedeniyle bu dalgada elendi, 375-003
  kapandıktan sonra ayrı bir dalga olarak ele alınmalı.
- **§4.4 Marketplace + Notification (6)** — `notification-providers/discord.ts` /
  `slack.ts` gerçek kullanıcı-değeri taşıyor (çok-kanallı bildirim) ama
  `notification-config.ts` ile birlikte bağlanması gerekiyor (üçü bir paket) — tek
  başına wire etmek yarım-iş olurdu, wave-2'de üçü birlikte ele alınmalı.

## 4. Takip Aksiyonu (Brain İçin)

Yukarıdaki 5 spec, ayrı bir "375-XXX ORPHAN-WIRE-DALGA-1-UYGULAMA" task'ına (doğru
`scope.filesWrite`: ilgili `src/**` caller dosyaları + ilgili `tests/**` dosyaları ile)
doğrudan girdi olarak kullanılabilir — tasarım/keşif işi burada bitti, kalan iş mekanik
wiring + entegrasyon testi.

## 5. Doğrulama

- `npx tsc --noEmit` — bu task hiçbir `src/` dosyasına dokunmadı, temiz kalması
  beklenir (kod değişikliği yok).
- `npx vitest run tests/governance/orphan-deliverables.test.ts` — 21/21 yeşil, canlı
  tarama hâlâ `KNOWN_ORPHANS` ile birebir eşleşiyor (hiçbir modül gerçekten
  bağlanmadığı için allowlist değişmedi — bkz. §0).

## 6. Bu Task'ın Sınırı (NO-GO Notu, 374-004 emsali)

Bu task da (374-004 gibi) yalnızca **keşif + spec + pin-doğrulama**dır. §2'deki 5
modülün hiçbiri bu task kapsamında bağlanmadı — kapsam, bu task'ın kendi
`scope.filesWrite`'i (yalnız bu doc + governance test dosyası) tarafından engellendi
(bkz. §0). §2'deki wiring specleri Brain'in gelecekteki dalga-2 sprint planlama
girdisidir.

## 7. `KNOWN_ORPHANS` Durumu

Wave-1'in seçtiği 5 modül için **değişmedi** — hiçbiri gerçekten bağlanmadı (bkz. §0),
küçültmek testi yanlış bir şekilde kırardı.

**Ayrı bir bulgu (bu task'ın kendi taraması sırasında canlı yakalandı):** verify
adımında `tests/governance/orphan-deliverables.test.ts` ilk çalıştırmada **kırmızı**
çıktı — `src/cli/helpers/risk-language.ts` allowlist'te olmayan yeni bir orphan olarak
bulundu. Kök neden: aynı sprint'te eşzamanlı çalışan **375-004 (TERM5-I18N-DILIM-1)**
bu dosyayı yeni oluşturdu; kendi `.result` notu açıkça "Zero consumer wiring touched
(task nogo)... slice-2 will wire help/catalog-render" diyor — yani kasıtlı, dokümante
edilmiş bir "henüz bağlanmamış teslim" (tam olarak bu governance testinin avladığı
desen). `git status` ile doğrulandı (dosya `??` untracked, 375-004 zaten `DONE`) — bu
geçici bir yarış durumu değil, kalıcı bir yeni-orphan. Bu task'ın write-scope'u tam da
bu dosyayı (governance test) kapsadığı için, pin'i **86 kayda** güncelledim (yeni satır
+ gerekçe yorumu `tests/governance/orphan-deliverables.test.ts` içinde) — aksi halde
test bu sprint'ten sonra herkes için kalıcı kırmızı kalırdı. Bu ekleme wave-1'in
seçilen-5 listesinin bir parçası DEĞİL, yalnızca pin-doğruluğu bakımıdır.
