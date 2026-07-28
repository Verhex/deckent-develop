# DEVİR BELGESİ — Main Provider: Codex · Claude = yalnız worker

> **Karar:** Alperen, 2026-07-26. Orkestrasyon/Brain rolü **Codex**'e devredildi. Claude
> main provider'dan alındı, yalnız **worker** (işçi) olarak kalıyor. Bu belge, devrin
> teknik karşılığı + devredilen işin tam durumu + yeniden keşfedilmemesi gereken pahalı
> olgulardır.
>
> **Bu belge Codex'e verilecek prompt'un kendisidir.** Baştan sona okunacak, sonra
> "Bekleyen İş" bölümünden devam edilecek.

---

## 0. Sen kimsin, bu proje ne

`deckent` — çok-ajanlı AI orkestrasyon CLI'ı. Brain (planlayıcı) · Worker (işçi) ·
Auditor (denetçi) rolleri, 8-fazlı sprint yaşam döngüsü
(`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`).
Kendi kendini dogfood eder: deckent, deckent'i geliştirmek için kullanılır.

Bundan sonra **sen Brain'sin.** Planlama, değerlendirme, routing, karar senin.
Claude yalnız `providers.worker` olarak task koşturur — karar vermez.

**Önce oku (zorunlu, bu sırayla):**
1. `CLAUDE.md` — 3 Değişmez Yasa + kalite barı + operasyon kuralları (tek-yer)
2. `~/.claude/projects/-home-alperen-deckent-dev/memory/MEMORY.md` — 13 kalıcı kanun
3. `DIRECTIVES.md` — güncel sprint hedefleri
4. `docs/MASTER-PLAN.md` — **iş-takip SSOT'u**. Tek tablo, 10 kolon. Her iş buraya satır olur.
5. `.brain/exports/summary.md` — son sprint durumu

> Yasaların tam metnini buraya kopyalamıyorum — kopyalanan kural eskir. Yukarıdaki
> dosyalar SSOT'tur, oradan oku.

---

## 1. Rol devri — uygulanacak tam config

`.deckent/config.json` **gitignore'da** (lokal makine state'i). Yani bu değişiklik git'ten
gelmez, elle uygulanır. **Ben uygulamadım** — provider/default flip'i Alperen onayına bağlı
ve o onay bu belgeyi yazmak içindi, uygulamak için değil.

### Şu anki hâl (ölçüldü 2026-07-26)

```json
{
  "providers":  { "brain": "claude", "worker": "claude" },
  "native_provider": "claude",
  "native_model": "claude-fable-5",
  "mode": "performance",
  "modes": { "performance": {
      "max_workers": 8,
      "brain_model": "claude-sonnet-5",
      "default_model": "claude-sonnet-5",
      "haiku_allowed": false,
      "brain_planning": "structured"
  }},
  "auth_mode": "subscription",
  "cross_verify": {
    "enabled": true, "high_stakes_only": true,
    "verifier_priority": ["codex", "claude"],
    "enforce_refuted": false, "max_verifications_per_sprint": 1,
    "verifier_model": { "codex": "gpt-5.6-sol" }
  }
}
```

### Devir sonrası olması gereken

```json
{
  "providers":  { "brain": "codex", "worker": "claude", "fallback": "claude" },
  "modes": { "performance": {
      "brain_model": "gpt-5.6-sol",
      "default_model": "claude-sonnet-5"
  }}
}
```

**Neden bu değerler:**

| alan | değer | gerekçe |
|---|---|---|
| `providers.brain` | `codex` | Devrin kendisi. Kanonik blok; `brain_provider` alanına otomatik projekte edilir (`projectCanonicalProviderFields`). |
| `providers.worker` | `claude` | Claude işçi olarak kalıyor. Değişmiyor. |
| `providers.fallback` | `claude` | Codex düşerse iş durmasın. Set edilmezse varsayılan `'claude'` zaten — açık yazmak dürüsttür. |
| `modes.performance.brain_model` | `gpt-5.6-sol` | **Brain artık codex, model de codex olmalı** yoksa provider-model uyuşmazlığı. `gpt-5.6-sol` seçildi çünkü bu hesapta **çağrılabilirliği canlı kanıtlı** (bkz. §3). Premium tier, 1.05M context, $5/$30. |
| `modes.performance.default_model` | `claude-sonnet-5` | Worker claude kaldığı için değişmiyor. |
| `cross_verify.verifier_priority` | `["codex","claude"]` (değişmez) | Hakem, işi ÜRETEN provider'dan farklı olmak zorunda. Task'ları claude worker üretiyor → hakem codex. Doğru kalıyor. |
| `cross_verify.verifier_model.codex` | `gpt-5.6-sol` (değişmez) | 674 düzeltmesinden sonra bu değer artık gerçekten dispatch'e ulaşıyor (öncesinde sessizce düşüyordu). |

**Karar bekleyen (ben karar vermedim):** `native_provider` / `native_model` = `claude` /
`claude-fable-5`. Bu REPL/native yüzeyi besliyor, sprint orkestrasyonu değil. Devre dahil mi,
Alperen'e sor.

**Uygulama:** `deckent config` ile veya doğrudan `.deckent/config.json` düzenlemesiyle.
Config değişikliği sonrası `deckent doctor` koş.

---

## 2. Değişmez yasalar — ihlal edilemez

Tam metin `CLAUDE.md`'de. Özet-hatırlatma:

1. **DUAL LENS + SCALE** — her iş hem deckent'in kendi orkestrasyon kalitesi hem son-kullanıcı
   deneyimi için tasarlanır; solo kullanıcıdan dünyanın en büyük kurumuna kadar.
2. **EVERY ENVIRONMENT** — macOS · Linux · Windows (native) · Windows (WSL) baştan, platform
   adapter'ları arkasında. Desteklenmeyen platform **dürüstçe** patlar, sessizce değil.
3. **NEVER MVP** — MVP/minimal/"şimdilik basit" öneri YASAK. Her konuda alanın uzmanı gibi
   davran, god-level enterprise çözüm öner.

Ayrıca `MEMORY.md`'deki 13 kanun bağlayıcıdır. En sık ihlal edilenler:

- **Kanıt = çalışan kod.** Test yeşili kanıt DEĞİL. User-surface iş için `DONE` ancak
  **gerçek-binary koşum** ile kapanır.
- **0-hardcode.** Model adı / akış değeri literal'i kod yolunda YASAK. Tek kaynak
  registry + config. (Bu oturumda 5 test dosyası tam bu yüzden registry-güdümlü yapıldı.)
- **i18n-first.** Kullanıcıya görünen string ASLA hardcode edilmez → `getMessage(key, lang)`
  (`src/cli/helpers/messages.ts`, en/tr).
- **Türkçe anlatım** (teknik terim EN), ve her iş AYNI GÜN `docs/MASTER-PLAN.md` satırı olur.
- **Madde → rapor → Alperen onayı → sonraki madde.** Onaysız atlama yok.
- **Test ≤16GB** lokalde: `VITEST_MAX_FORKS=2`, full-suite tek-process YASAK.
- **20-40 mikro-task/sprint** + Dependencies grafiği (8 paralel worker). 3-5 yüklü task
  ANTİ-PATTERN'dir.

---

## 3. PAHALI OLGULAR — yeniden keşfetme, faturası ödendi

Bunlar canlı, faturalı koşumlarla ölçüldü. Diskten türetilemezler.

### 3.1 Entitlement (hangi model bu hesapta gerçekten çağrılabiliyor)

`auth_mode: subscription` (ChatGPT hesabı). Registry'de model kimliği + tier + fiyat var,
**entitlement YOK.** Yani herhangi bir kod yolu, hesabın çağıramadığı bir modeli seçebilir.

| model | durum | kanıt |
|---|---|---|
| `gpt-5.6-sol` | ✅ **çağrılabilir** | `xv-1785008399857` — `turn.completed`, 43.748 in / 1.349 out token, iki gerçek `agent_message` |
| `gpt-5.6-terra` | ✅ **çağrılabilir** | `xv-1785066348203` — `verdict: confirmed`, gerçek adversarial muhakeme |
| `gpt-4.1` | ❌ **REDDEDİLİYOR** | HTTP 400 `invalid_request_error`: "The 'gpt-4.1' model is not supported when using Codex with a ChatGPT account." (sprint-460 + `xv-1785059251151`) |
| `gpt-5.6-luna` | ❓ ölçülmedi | — |
| `gpt-5.5`, `gpt-5-mini`, `o3`, `o4-mini` | ❓ ölçülmedi | — |

**Bedava öğrenme kuralı:** provider reddi **tek token harcamıyor** — logda `usage` envelope'u
hiç yayılmıyor, red `turn.completed`'dan önce düşüyor. Yani bilinmeyen bir modelin
entitlement'ını sınamak pratikte ücretsiz. (Model çalışırsa faturalıdır.)

Kanıt dosyaları: `.analysis/xverify/xv-*.{md,json,log,result}` +
`.analysis/xverify/xv-1785059251151.provider-log.jsonl` (kalıcı kopya; `.tasks/` altındaki
özgün kopyalar geçicidir, sprint finalize'ında arşive süpürülür).

### 3.2 Tier designation (hangi model tier'ın cevabı) — MASTER-PLAN 670

Dört (provider, tier) çiftinde birden fazla GA model vardı ve **kayıt sırası** kimliği
belirliyordu. Artık her biri `preferredForTier: true` ile açıkça işaretli:

| çift | eski (sıra kararı) | yeni (designation) |
|---|---|---|
| claude/premium | `claude-opus-4-8` | **`claude-opus-5`** |
| codex/standard | `gpt-4.1` *(reddediliyor!)* | **`gpt-5.6-terra`** |
| codex/premium | `gpt-5.5` | **`gpt-5.6-sol`** |
| codex/economy | `gpt-5-mini` | **`gpt-5.6-luna`** |

Tek GA modeli olan çiftler işaretsiz — sıranın karar vereceği bir şey yok.
Her (provider, tier) için **en fazla bir** işaret: `assertSoleTierPreferencePerSet`
üç giriş noktasında da zorunlu kılıyor (constructor · `loadFromCatalog` · `register`),
ihlal `E_MODEL_TIER_PREFERENCE_AMBIGUOUS` ile fail-loud.

**Designation = KUŞAK, entitlement DEĞİL.** Katalog "bu tier'ın güncel kuşağı bu" der;
"bu hesap onu çağırabilir" demez. Entitlement ayrı ölçülen bir olgudur (§3.1, §3.3).

### 3.3 Entitlement hafızası — MASTER-PLAN 671(b)

`src/core/verifier-entitlement-memory.ts`. Canlı gözlenmiş reddi
`(authMode, provider, model)` başına **hesap-kapsamlı** tutar:
`<global-state-dir>/runtime/verifier-entitlement/refusals.jsonl` (mode 0600).
Runner dispatch'ten ÖNCE danışır; bilinen-reddedilmiş çifti faturalı çağrı yapmadan
dürüstçe `unavailable` bırakır.

Üç kural (ihlal etme):
1. Yalnız **kalıcı** kollar hatırlanır: `model-not-found`, `auth-rejected`.
   `rate-limited` / `transport-error` bir kötü dakikanın özelliği — hatırlanırsa çalışan
   bir modeli bir ay kara-listeye alır.
2. **Fail-open.** Dosya yok / okunamaz / bozuk satır / bilinmeyen şema = "hiçbir şey
   öğrenilmedi", akış eskisi gibi devam. Bu katman doğrulamanın durmasının sebebi OLAMAZ.
3. **30 gün TTL** (`VERIFIER_REFUSAL_TTL_MS`). Plan yükseltmesi / hesap değişimi
   entitlement'ı değiştirir; kalıcı bastırma telafi edilemez, kısa süre "yeniden dene"
   yönünde yanılmak edilebilir.

Şu an dosyada bir kayıt var: `subscription/codex/gpt-4.1 → model-not-found`.

### 3.4 Full-suite referans çizgisi (baseline)

`VITEST_MAX_FORKS=2 npx vitest run` → **7 hata / 4 dosya BEKLENİR.** Bunlar flip'ten
önce de kırıktı, bu iş zincirinden bağımsız:

- `tests/cli/command-registry.test.ts` (1)
- `tests/cli/commands/doctor.test.ts` (4)
- `tests/providers/deckbroker-wire.test.ts` (1)
- `tests/scripts/lint-no-spawnsync.test.ts` (1)

Toplam: **33.670 geçti / 7 kırık / 69 skip / ~660s**.
**7'den fazla kırık görürsen senin değişikliğindendir.** Bu çizgi, atıf yapmanın en hızlı yolu.

### 3.5 Atıf metodu (A/B) — bir değişikliğin gerçekten neyi kırdığını ölçmek

Bu oturumda kritikti: 670 flip'i 96 test kırdı, ama 7'si zaten kırıktı. Yöntem:

1. Flip'li tam süiti koş, kırık dosya listesini çıkar.
2. Değişikliği **geçici olarak kapat** (ör. `preferredForTier: true` satırlarını yorumla),
   yalnız o listeyi tekrar koş.
3. Hâlâ kırık olanlar = **önceden kırık**, atıf dışı. Düzelenler = değişikliğinden.
4. Değişikliği geri aç.

"Tahmin ettim" ile "ölçtüm" arasındaki fark: bu satırın kendi tahmini **16 test** diyordu,
ölçüm **89** çıktı — 6 kat. Kimlik, tahmin edilenden çok daha fazla yüzeye sızıyor
(CLI çıktısı, MCP instructions metni, `estimatedModels` anahtarları, reservation/reachability
**kanıt fixture'ları**, planner/selector varsayılanları).

---

## 4. Devredilen işin durumu (MASTER-PLAN 669-676)

Commit: `51c68774` — *"feat(xverify): honest verifier dispatch truth + explicit tier identity"*
(57 dosya, +2434/−175). **Push YAPILMADI.**

| # | Konu | Durum | Not |
|---|---|---|---|
| **669** | XVERIFY-VERIFIER-IDENTITY | 🟢 | `cross_verify.verifier_model` (provider → exact API id). Öncelik: caller bayrağı > owner config > tier-eşdeğerliği. Bilinmeyen/provider-uyuşmaz/`deprecated` id → fail-loud dürüst `unavailable`, sessiz ikame YOK. **İki yolu da canlı kanıtlı.** |
| **670** | MODEL-TIER-REGISTRATION-ORDER | 🟢 | §3.2. Alperen onaylı flip. 89 test/33 dosya kaydı; gerçek bir regresyon açığa çıkardı (aşağıda). |
| **671(a)** | XVERIFY-DISPATCH-REJECTION-MISCLASS | 🟢 | Provider reddi artık `unclear` değil `unavailable`. `extractDispatchRejectionFromLog` mevcut `ReachabilityOutcome` sözlüğünü kullanıyor, önceliği `claudeFailureOutcome` ile aynı. **İki sert kapı:** logda herhangi bir assistant metni varsa red DEĞİL; yalnız kesin kanıt (status ≥ 400 veya adlandırılmış `…error` sınıfı) sınıflandırır. |
| **671(b1)** | Entitlement hafızası | 🟢 | §3.3. Canlı kapalı-devre kanıtı: bir koşum 400'ü aldı ve öğrendi, sonraki aynı çifti **hiç dispatch etmeden** kesti (sıfır `.tasks/` artefaktı). |
| **672** | XVERIFY-REFUSAL-IDENTITY-UNSTRUCTURED | 🟢 | `CrossVerifyRunResult` artık seçimden sonraki her çıkışta `verifier`/`verifierModel` + yapısal `rejection` taşıyor. `XverifyResult.verdict` artık nullable — hiç çalışmamış hakemin kararı YOKTUR. |
| **674** | XVERIFY-CLI-CONFIG-BLOCK-DROPPED | 🟢 | `xverify` yüzeyi `cross_verify`'ı sıfırdan kuruyor ve `verifier_model`'i sessizce düşürüyordu. Artık `...config.cross_verify` devralınıyor, yalnız çağrının zorladığı 3 şey override ediliyor. Regresyon testi var. |
| **671(b2)** | Alternatif hakem seçme | 🔴 | **BEKLİYOR** — §5.1 |
| **673** | XVERIFY-CLI-FILES sessiz zorunluluk | 🔴 | **BEKLİYOR** — §5.2 |
| **675** | Test süiti gerçek `.tasks/`'e yazıyor | 🔴 | **BEKLİYOR** — §5.3 |
| **676** | Test süiti `dist/`'i siliyor | 🔴 | **BEKLİYOR** — §5.4 |

### Flip'in açığa çıkardığı gerçek regresyon (kaynağı düzeltildi)

`src/orchestra/reconciler.ts` — `DEFAULT_DOWNGRADE_LADDER` yalnız tier'ın *designated*
modelini anahtarlıyordu. Designation Opus 4.8'den Opus 5'e geçince **`claude-opus-4-8` —
hâlâ GA ve dispatch edilebilir — ucuzlatma önerisini sessizce kaybetti**: maliyet-aşım
sinyali yanmaya devam ederken tavsiye susuyor. Ladder artık bir tier'ın HER modelini
anahtarlıyor, hedef designated model olarak kalıyor.

**Ders:** mekanik bir test düzeltmesi bu regresyonu gömerdi. Bir test kırıldığında ilk soru
"literal mi eskimiş?" değil, **"davranış mı bozuldu?"** olmalı.

### İkinci gerçek sonuç: kanıt devredilmez

Reachability/limit kanıtı **exact model** başına saklanıyor. Flip, yeni modeller için
**taze kanıt** gerektiriyor; eski kuşağın kanıtıyla `HostRoleInvocationAdmissionRuntime` ve
`admitRoleInvocation` dürüstçe `hold` (`authority_unavailable`) veriyor — yanlış dispatch
değil, fail-closed. **Gerçek host'ta da böyle olacak:** ilk sprintte codex fallback'i,
kanıt üretilene kadar tutabilir. Bu bir bug değil, tasarım.

---

## 5. BEKLEYEN İŞ (öncelik sırasıyla)

### 5.1 — MASTER-PLAN 671(b2): entitlement-aware alternatif seçme · P1

**Sorun:** (b1) bilinen-kötü çifti *tekrar satın almayı* durduruyor ama yerine BAŞKASINI
seçmiyor. Yani tek uygun hakem modeli kara-listedeyse doğrulama dürüstçe atlanıyor.

**Ölçülen engel:** `selectVerifierProvider` saf bir fonksiyon ve **provider seçimi model
çözümlemesinden ÖNCE** oluyor. Yaygın sprint yolunda (`availableProviders`) seçim anında
model henüz yok → `(provider, model)` anahtarlı bir filtre provider adaylarını süzemiyor,
"sıradakine düş" döngüsü YOK.

İki yol, ikisi de gerçek iş:
- **(i) provider fall-through** — `decideCrossVerify`'ı "provider seç → model çöz" şeklinden
  "(provider, model) adaylarını sırala → süz → seç"e çevirmek. 669'un öncelik kurallarına
  (caller > config > tier) dokunur. Gerçek refactor.
- **(ii) aynı provider'da model ikamesi** — designated olmayan bir modele düşmek. Bu, 670'in
  designation semantiğiyle çelişir (tier'ın cevabı tek olmalı), dolayısıyla designation
  semantiğinin genişletilmesi gerekir.

**Alperen'e sor:** hangi yol. Ben karar vermedim, kapsamı da büyütmedim.

### 5.2 — MASTER-PLAN 673: `xverify --files` sessiz zorunluluğu · P2

`--help` `--files`'ı **optional** ilan ediyor ama dispatch yolu en az bir path'i **zorunlu**
kılıyor. Eksikse operatör eylem alınamaz `spawn-error` görüyor; gerçek sebep yalnız
`.brain/ERRORS.md`'de: `Execution landing scope must contain at least one path`.

Ölçüm: `xv-1785059128366` (`--files` yok) → `spawn-error`. Aynı komut `--files` ile
dispatch'e ulaşıyor.

**Düzeltme seçenekleri:** ya CLI pre-flight'ta i18n'li + eylem-önerili hata (dispatch'e hiç
girmeden), ya da claim-only doğrulama için scope'suz bir landing yolu. Sessizce
`spawn-error`'a düşmek ikisi de değil.

### 5.3 — MASTER-PLAN 675: test süiti gerçek `.tasks/`'e yazıyor · P2

`tests/providers/openrouter.test.ts:507-512` ve `:526-531` provider'ı
`projectDir: process.cwd()` ile kuruyor, sonra `provider.spawn('t-477', …)` /
`spawn('t-477-b', …)` çağırıyor. `spawnImpl` mock'lanmış ama heartbeat/log yazımı gerçek
`projectDir`'e gidiyor → `.tasks/task-t-477*.{hb,log}`.

Hermetiklik yasası ihlali ("tüm dosya I/O `os.tmpdir()` altında"). Ayrıca sprint-öncesi
"`.tasks/` temiz olmalı" ön-koşulunu her test koşumunda sessizce bozuyor.
**Düzeltme tek satır:** `projectDir` → tmpdir fixture (dosyada `mkdtempSync` deseni var).
Bu oturumda iki kez tekrarlandığı gözlendi.

### 5.4 — MASTER-PLAN 676: test süiti `dist/`'i siliyor · P2

Tam süit sırasında `dist/` boşalıyor, yalnız `dist/dashboard` kalıyor — `scripts/clean.mjs`
imzasının tam kendisi ("dist cleaned — N entries removed, dist/dashboard preserved").
Bir koşumda oldu, sonrakinde olmadı → sıraya-bağlı.

**Fail bulunamadı.** Elenenler: `tests/scripts/clean-clone-smoke.test.ts`
(`runSmoke({source:'cwd', cwd:'/nonexistent-…'})` ile çağrılıyor, gerçek cwd'de pipeline
koşturmuyor), `tests/scripts/validate-publish.test.ts` (`npm run build:all` geçişleri yalnız
string iddiası).

**Neden önemli:** proof-of-function yasası gerçek-binary koşum istiyor; süit koşarken
`dist`'e bakan bir doğrulama sessizce yanlış sonuç verir. Bu oturumda tam olarak bu oldu ve
yalnız `ERR_MODULE_NOT_FOUND` sayesinde yakalandı — sessizce yanlış bir "geçti" de
üretebilirdi.

**Öneri:** `clean.mjs`'e çağıran-izi logu ekle + süiti tek-fork koş, ya da
`DECKENT_FORBID_DIST_CLEAN=1` gibi test-zamanı bekçisiyle çağrıyı fail-loud yap.

### 5.5 — Daha eski açık kalemler (MASTER-PLAN'den)

- **668** WORKER-BOUNDED-DISCOVERY 🟡 — worker prompt'una kalıcı "bounded discovery" sınırı;
  üç sprint SIGKILL ölçümü var.
- **667** 🟡 · **665** 🟡 · **664** 🟡 — MASTER-PLAN'den oku.
- **663** (ALLOW yolu yok) · **662** · **661** (tüm WorkItemKind'lar) · **660** ⬜ — başlanmadı.

---

## 6. OPERASYON KURALLARI — ihlal etme

### Yasaklar (Alperen onayı olmadan ASLA)

- Sprint **kill/cleanup** etme. `rm .tasks/*` **YASAK**.
- `.brain/memory.db` **ASLA silinmez** — tüm Brain knowledge orada.
- Sprint çalışırken `npm run build` ve `/login` **YASAK** (ESM cache + worker auth-loss).
- **commit / push / publish** — yalnız Alperen isteyince. Commit öncesi `git branch -vv`
  (shared-worktree HEAD-drift var: `checkpoint/d16-approval-*`, `goal/*` worktree'leri açık).
- **Default flip / config flip / key provisioning / paid canary / credential migration** —
  ayrı onay.
- **Subscription→API veya provider→provider sessiz fallback YAPMA.**
- Raw credential'ı worker, task, receipt, log, `.brain/memory.db` veya
  `ProviderSessionLease` içine **koyma**.
- Başka oturumun dirty dosyalarını attribution olmadan sahiplenme.
- **Test yeşilini tek başına live success sayma.**

### Zorunluluklar

- Sprint'ler **CLI'dan**: `env -u ANTHROPIC_API_KEY deckent start …` — MCP'den start/run/plan
  değil (`deckent_start` fire-and-forget: MCP stdio aynı process'te event loop'u bloke eder).
- **Model atamasını sen (Brain) yapmazsın** — routing yapar. `haiku` yalnız doc/config,
  koda route etme.
- `npm run build` sonrası `/mcp restart` Alperen yapar (long-lived MCP process eski kodu
  cache'ler).
- Her iş **AYNI GÜN** `docs/MASTER-PLAN.md` satırı olur (10 kolon, azalan sıra).

### Komutlar

```
Build:  npm run build        (tsc + copy-assets)   |  Full: npm run build:all
Test:   VITEST_MAX_FORKS=2 npx vitest run          |  Lint: npm run lint (tsc --noEmit)
Publish gate: npm run validate:publish             (npm publish'i Alperen elle yapar)
```

---

## 7. TUZAKLAR — bu oturumda canı yakan şeyler

1. **`tsconfig.json` `tests`'i hariç tutuyor.** Yani `npm run lint` / `tsc --noEmit`
   **test dosyalarını kontrol ETMİYOR.** "tsc temiz + testler yeşil" kulağa geldiğinden az
   şey kapsıyor: bir test dosyasındaki tip hatası ikisinde de görünmez.
2. **ESM imports `.js` uzantısı zorunlu** (Node16 resolution). `from './bar'` çalışmaz,
   `'./bar.js'` gerekir.
3. **Terminal verdict protokolü gerekçe İSTER:** `VERDICT: <karar> <gerekçe>`.
   Gerekçesiz `VERDICT: CONFIRMED` kasıtlı olarak terminal sayılmaz ve log-fallback'e düşer.
   (Bir testim bu yüzden `unclear` döndü — kusur testteydi, kodda değil.)
4. **Mekanik test düzeltmesi tehlikelidir.** Satır-hedefli bir kimlik güncellemesi,
   `host-role-invocation-admission-runtime`'daki fail-closed testinde kasten
   *designated-olmayan* model taşıyan fixture'ı da değiştirdi → `hold` beklenen yer `allow`
   döndü, testin kastı yok oldu. Geri alındı ve kast açık yazıldı + yanına
   `expect(getByProviderAndTier('codex','premium')).not.toBe('gpt-5.5')` eklendi ki sonraki
   designation bunu sessizce etkisizleştiremesin. **Aynı deseni koru.**
5. **`.deckent/config.json` gitignore'da.** Config'e dayanan bir davranışı hermetik testte
   doğrulayamazsın (ve doğrulamamalısın); config→runtime bağlantısı ancak canlı koşumla
   kanıtlanır. **674 tam bu yüzden gözden kaçmıştı:** 669'un hermetik testleri geçiyordu
   çünkü config'i doğrudan `runCrossVerify`'a veriyorlardı; kırık halka CLI'ın kendi
   config'ini kurmasıydı ve yalnız canlı koşum gösterdi.
6. **`unclear` vs `unavailable` sözleşmesi:** `unclear` = hakem ÇALIŞTI, çıktısı
   yorumlanamadı. `unavailable` = dispatch EDİLEMEDİ. Karıştırmak gerçek bir entitlement
   hatasını "hakem kararsız kaldı" gibi gösterir. 671 tam olarak buydu.
7. **Scope enforcement runtime'da advisory/soft** (ADR-037 V1.0 Layer-2 kasıtlı eksik).
   İhlal `git diff --stat` ile Auditor tarafından izlenir + warn edilir, **bloke ETMEZ**.

---

## 8. DOĞRULAMA PROTOKOLÜ

Bir işi `DONE` demeden önce:

1. `npx tsc --noEmit -p tsconfig.json` temiz. **(Testleri kapsamadığını hatırla — §7.1)**
2. Etkilenen suite'ler yeşil: `VITEST_MAX_FORKS=2 npx vitest run <dosyalar>`
3. Geniş kimlik/kanıt değişikliği yaptıysan **tam süit** + §3.4 çizgisiyle karşılaştır
   (7 kırık = normal; fazlası senden).
4. Kırık test varsa **§3.5 A/B atıfı** yap — "önceden kırıktı" iddiasını ölç, varsayma.
5. **User-surface** iş (`src/cli/commands/`, `src/dashboard/`, `src/api/`) → Tier-1:
   `npm run build` + **gerçek-binary koşum**. Mock-only test tek başına
   `GO_WITH_TECH_DEBT`'tir, `DONE` değil.
6. Kanıtı kalıcı yaz: `.analysis/` altına, `.tasks/` geçicidir.
7. `docs/MASTER-PLAN.md` satırını aynı gün yaz — ölçümü, kanıt yolunu ve **kanıt sınırını**
   (neyin kanıtlanMADIĞINI) açıkça belirt.
8. Sprint öncesi `.tasks/` temiz olmalı (yalnız `archive/` + `.deck-shadow` kalır).

---

## 9. Devir anındaki durum özeti

- **Commit:** `51c68774` (main, `origin/main`'in 4 önünde). **Push yok.**
- **`.tasks/`:** temiz (`archive/` + `.deck-shadow`). Sprint'e hazır.
- **`.locks/`:** boş.
- **`dist/`:** güncel build (`npm run build` koşuldu, doğrulandı).
- **Full suite:** 33.670 geçti / 7 bilinen kırık (§3.4).
- **Commit edilmemiş:** ~146 dosya — önceki oturumların işi (#1/#2/#6 zinciri:
  `src/cli/commands/doctor.ts`, `spawn.ts`, `start.ts`, `deck-broker.ts`,
  `execution-budget-policy.ts`, yeni `provider-authority.ts`,
  `credential-decision-audit.ts` …) + runtime state (`.deckent/autonomous/autonomous.db`,
  `.brain/exports/*`, `.deckent/settings/*`). **Bunlar bilerek commit edilmedi** —
  benim oturumumun işi değil, attribution olmadan sahiplenilmez.
- **Entitlement hafızasında bir kayıt:** `subscription/codex/gpt-4.1 → model-not-found`.

**İlk işin:** §1'deki config devrini Alperen onayıyla uygula, `deckent doctor` koş,
sonra §5.1'de Alperen'e hangi yolu seçtiğini sor.
