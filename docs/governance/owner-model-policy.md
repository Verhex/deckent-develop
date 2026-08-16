# Owner Model Policy (OWNER-MODEL-POLICY-001) — Governance & Reference Spec

Bu doküman, `ModelActivationStore` üzerine kurulan **provider-scoped model
activation policy** (sağlayıcı-kapsamlı model aktivasyon politikası)
mekanizmasının kalıcı governance/reference spesifikasyonudur. Mekanizma;
otomatik tespit edilen (auto-detect) model havuzunun üstünde, "hangi modelin
gerçekten **çalıştırılabilir** (executable) olduğu" kararını **tek bir authority**
altında toplar ve bu kararı bootstrap anında immutable bir in-memory snapshot'a
dondurup plan/dispatch kanıtına bağlar. `OWNER-MODEL-POLICY-001`, daha önceki
`MODEL-ACTIVATION-001` (owner-managed model activation) işinin doğrudan
successor'ıdır: aktivasyon store'una **policy mode** kavramını ekler ve
"tespit edilen yeni bir model havuza kendiliğinden giremez" garantisini
enforcement zinciri boyunca kanıta bağlar.

Bu spec, **FAZ-0** (fiilen sevk edilmiş, hermetic + real-binary kanıtlı manual
bootstrap seam) ile **FAZ-1** (local-llm provider, Terminal ve worker wiring) arasını
adversarial cross-provider audit'e dayanacak netlikte ayırır. `default_model`
bir TERCİH'tir; kesin sınır owner active-set'idir. Bir `MODEL_INACTIVE` typed
HOLD asla sessiz bir model ikamesi (silent substitution) değildir.

---

## 1. Amaç ve dual-lens ürün değeri

Provider-scoped policy, "bir provider'da hangi modeller çalıştırılabilir?"
sorusuna verilen mekanik, tek-authority'li cevaptır. Değeri, deckent'in
🔒 DUAL-LENS yasası gereği iki kitleye birden hizmet etmesidir:

- **(a) deckent'in kendi orchestration'ı (dogfood).** Auto-detect bir provider'ın
  gerçekten sunduğu her model-id'yi registry'ye kaydeder — ama "aktiflik"
  kavramı olmadan tespit edilen her model havuza girerdi (ör. `gpt-5.5`,
  `o3`, `gpt-4.1` eski nesilleri `gpt-5.6` ailesiyle yan yana). Policy mode,
  owner'ın "yalnız benim aktive ettiklerim çalışsın" kararını registry'nin
  seçilebilir (selectable) havuzuna kadar taşır; planner/router/forceModel/dispatch
  hiçbir aşamada inaktif bir modele düşemez.
- **(b) uçtan-uca ürün deneyimi.** Aynı "detected ≠ executable" ayrımı; solo bir
  kullanıcının tek bir provider'ından, dünyanın en büyük multi-tenant
  kurulumuna kadar, "bu projede fiilen hangi model seti çalışır" sorusunun
  dosya düzenlemeden yönetilen, snapshot-digest ile denetlenebilir cevabıdır.

Kısacası mekanizma, "yürütülebilir model kümesi = owner'ın açık kararı" ilkesini
hem deckent'in kendi run'larına hem de ürünün model-yönetim yüzeyine tek
implementasyondan uygular.

---

## 2. İki policy mode + semantik

Store şeması `v1 → v2`'ye taşındı (`MODEL_ACTIVATION_STORE_SCHEMA_VERSION = 2`,
`src/core/model-activation-store.ts:39`). v2, provider başına bir **policy mode**
kaydı taşır (`ProviderPolicyMode`, aynı dosya `:49`). Default `implicit-active`'tir
(`DEFAULT_PROVIDER_POLICY_MODE`, `:57`) ve bu **byte-compatible**'dır: hiç kayıt
yoksa davranış birebir eski davranıştır.

| Policy mode | Kayıt yok | `active=true` kaydı | `active=false` kaydı | Yeni tespit/katalog modeli |
|---|---|---|---|---|
| `implicit-active` (default) | Eligible (çalıştırılabilir) | Eligible | Deactivated (havuz-dışı) | **Otomatik eligible** |
| `explicit-active` | **Değil** — çalıştırılamaz | Eligible | Değil | **ASLA** otomatik havuza giremez |

Semantik özü (`ModelActivationStore.isExecutable`,
`src/core/model-activation-store.ts:285` ve resolved snapshot'ta `:392`):

- **`explicit-active` provider** → bir model YALNIZCA owner'ın `active=true`
  kaydı varsa çalıştırılabilir. Yeni tespit edilen veya bundled katalogdan gelen
  bir model, açık bir owner kararı olmadan seçilebilir havuza asla giremez.
- **`implicit-active` provider** → bir model, açık bir `active=false` kaydı
  yoksa çalıştırılabilir (eski davranış; kurulum hiçbir projede sessiz daralma
  yapmaz).

`explicit-active`, "izin-listesi (allowlist) olarak owner active-set" demektir;
`implicit-active` ise "kara-liste (denylist) olarak owner deaktivasyonları".

---

## 3. Tek-authority ilkesi (single authority)

Yürütülebilirlik kararının **tek kaynağı `ModelActivationStore`'dur**
(`.deckent/models.db`, proje-kapsamlı). Paralel bir config allowlist, ayrı bir
env değişkeni ya da instruction-metni kataloğu YOKTUR — bu, 🔒 0-hardcode
yasasının (KANUN 10) doğrudan uygulamasıdır. `resolveActiveModelPolicy(projectRoot)`
store'u okur ve immutable bir in-memory snapshot üretir
(`ModelActivationPolicy` interface'i, `src/core/model-activation-store.ts:332`;
builder `buildPolicy`, `:350`):

```
interface ModelActivationPolicy {
  isExecutable(provider, modelId): boolean
  providerMode(provider): ProviderPolicyMode        // default implicit-active
  explicitProviders: ReadonlySet<string>            // explicit-active'e alınmış provider'lar
  activeModels: ReadonlyArray<{ provider, modelId }> // sort-stable
  snapshotDigest: string                            // sha256
}
```

Snapshot resolve edildikten sonra **immutable**'dır: her `isExecutable` çağrısı bir
Set lookup'tır, SQLite'a inmez. Hiç kayıt yoksa `emptyModelActivationPolicy()`
fail-safe döner (her provider `implicit-active`; `EMPTY_POLICY_DIGEST`).

---

## 4. Enforcement zinciri (dört yüzey, gerçek file:line)

Karar, üretici → tüketici → ingress → policy zinciri boyunca **dört ayrı
yüzeyde** enforce edilir. Zincir tek yönlüdür: snapshot bootstrap'ta enjekte
edilir, registry read-filter havuzu daraltır, ve iki dispatch-öncesi sınırda
typed `MODEL_INACTIVE` HOLD ateşlenir.

### 4.1 Bootstrap snapshot injection (üretici → registry)

`bootstrapProviders` (`src/core/provider.ts:1401`) snapshot'ı **senkron** çözer
ve planner-policy kurulmadan ÖNCE registry'ye enjekte eder
(`src/core/provider.ts:1778-1781`):

```
const modelActivationPolicy = root
  ? resolveActiveModelPolicy(root)
  : emptyModelActivationPolicy();
mr.setActivationPolicy(modelActivationPolicy);      // detect/register'dan ÖNCE
```

Enjeksiyon, `detectAndRegisterModels(...)` fire-and-forget probe'undan önce
gelir; böylece auto-detect kayıt anında aynı owner deaktivasyonlarını uygular.
Snapshot'ın `snapshotDigest`'i `BootstrapResult.modelActivationDigest`
(`src/core/provider.ts:1386`, `BootstrapResult` `:1342`) alanına bağlanır ve
plan/dispatch kanıtına taşınır (§5).

### 4.2 Registry read-filter tombstone (registry)

`ModelRegistry`, enjekte edilen policy'yi tutar
(`private activationPolicy?`, `src/core/model-registry.ts:584`;
`setActivationPolicy` `:595`, `getActivationPolicy` `:601`). Bir modelin
çalıştırılabilirliği tek satırda süzülür (`:606-607`):

```
this.activationPolicy === undefined
  || this.activationPolicy.isExecutable(model.provider, model.id)
```

Bu filtre YALNIZCA **pool/selectable accessor'larına** uygulanır — inaktif model
bu yüzeylerden gizlenir (bir "tombstone"):

- `getAllModels` (`:776`), `getByProviderAndTier` (`:654`), `getEquivalent`
  (`:665`), `getByProvider` (`:646`), `getByTier` (`:650`), `getAllModelIds`
  (`:772`), `getAllProviders` (`:780`).

Buna karşılık **identity/accounting accessor'ları TOTAL kalır**
(`get`/`getOrThrow`/`has`): bir inaktif model receipt/muhasebe için hâlâ
çözülür ama seçilebilir havuza **diriltilemez**. Bu ayrım kritiktir — yalnızca
keşif listesini filtrelemek yetmezdi, çünkü cloud modeller bundled katalogdan
zaten kayıtlıydı ve parametrik bir yeniden-register (re-register) inaktif bir
modeli havuza geri sokabilirdi. Read-filter, tam da bu resurrection'ı engeller.

### 4.3 forceModel typed HOLD (Layer 0, model-selector)

`selectModel`'in en üst katmanı — DIRECTIVES.md'den gelen `forceModel` override'ı
(Layer 0, `src/orchestra/model-selector.ts:245`) — hedef provider'a ait ama owner
policy altında aktif OLMAYAN bir modeli **sessizce ikame etmez**, typed HOLD
fırlatır (`src/orchestra/model-selector.ts:250-260`):

```
if (!isModelExecutable(forceModel, targetProvider)) {
  throw new DeckentError('MODEL_INACTIVE', …);   // routing/persist/dispatch'ten ÖNCE
}
```

Bu, forceModel provider-uyumsuzluğunun equivalent'e map edildiği daldan (`:247`)
ayrıdır: uyumlu ama inaktif model = HOLD, sessiz düşüş yok. HOLD, herhangi bir
routing/persist/dispatch başlamadan ateşlenir; provider/backend inaktif bir
modelde asla başlamaz.

### 4.4 Pre-dispatch admission HOLD (task-mode-runner)

İkinci sınır, herhangi bir Task JSON yazımı veya worker spawn'ından ÖNCE gelen
pre-dispatch admission'dır (`src/orchestra/task-mode-runner.ts:218`):

```
if (!isModelExecutable(model, identity.provider)) {
  … 'MODEL_INACTIVE' …                            // Task JSON write / spawn'dan ÖNCE
}
```

`isModelExecutable` (`src/core/model-equivalence.ts:98`) registry'nin aktif
policy'sini okur ve policy yoksa `true` döner (fail-open yalnızca policy hiç
enjekte edilmemişse; bootstrap her zaman enjekte eder). Böylece hem
seçim-zamanı (forceModel) hem de gönderim-zamanı (dispatch) tek ve aynı
`MODEL_INACTIVE` sözleşmesine bağlanır.

---

## 5. snapshotDigest evidence binding

`snapshotDigest`, policy'nin **kanıta bağlanan** deterministik parmak izidir.
`buildPolicy` (`src/core/model-activation-store.ts:369-380`) sort-stable
canonical serialization üretir; aynı store aynı digest'i verir:

```
sha256( "model-activation-policy v2 "
        + JSON(canonicalPolicies)        // [provider, mode] sıralı
        + " "
        + JSON(canonicalActivations) )   // [provider, modelId, active?1:0] sıralı
```

Bootstrap bu digest'i `BootstrapResult.modelActivationDigest`'e koyar ve
plan/dispatch kanıtına bağlar; `deckent models active-set` komutu aynı digest'in
ilk 16 hane'sini (`sha256:…16…`) operatöre gösterir
(`src/cli/commands/models.ts:270-271`). Owner active-set snapshot digest'i şu
anda **`sha256:759fb7e7a3f45bf8…`** (claude + codex + local-llm).

---

## 6. CLI yüzeyi

Tüm yönetim, dosya düzenlemeden — first-class CLI'dan yapılır
(`src/cli/commands/models.ts`):

| Komut | İşlev |
|---|---|
| `deckent models policy [provider] [mode]` | Bir provider'ın policy mode'unu göster/ayarla (`implicit-active` \| `explicit-active`); argümansız çağrı kayıtlı politikaları listeler (`:222`) |
| `deckent models active-set` | Çözülmüş owner executable pool + snapshot digest'i göster (`:264`) |
| `deckent models activate <model> --provider <p>` | Bir modeli aktive et (`:164`) |
| `deckent models deactivate <model> --provider <p>` | Bir modeli deaktive et — artık route edilmez (`:178`) |
| `deckent models activation` | Aktivasyon durumunu listele (`:192`) |

---

## 7. `default_model` bir tavan DEĞİLDİR

`default_model`, i18n kataloğunda (`src/cli/helpers/messages.ts`, `en`+`tr`)
**TERCİH edilen/varsayılan** seçim olarak netleştirildi — kesin tavan (hard
ceiling) DEĞİL. Kesin çalıştırma sınırı owner active-set'idir. İlgili mesaj
anahtarları:

- `model_policy.default_not_ceiling` (`:30`) — "`default_model` bir TERCİH'tir,
  kesin tavan değildir; kesin sınır `deckent models active-set`."
- `model_policy.inactive_hold` (`:38`) — `MODEL_INACTIVE` HOLD'un kullanıcıya
  görünen açıklaması (plan/route/forceModel/dispatch yapamaz).
- `model_policy.explicit_active_set` (`:48`) — "explicit-active: yalnız
  owner-aktive modeller çalışır; yeni tespit/katalog modeli havuza kendiliğinden
  giremez."

Yani seçim tercihi (`default_model`) ile yürütme sınırı (active-set) ayrı
kavramlardır; policy'nin dayattığı **sert** sınır ikincisidir.

---

## 8. Owner active execution set (explicit-active)

FAZ-0'da owner tarafından kaydedilen, real-binary koşumla uygulanan aktif küme:

| Provider | Mode | Aktif modeller |
|---|---|---|
| `claude` | explicit-active | `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001` |
| `codex` | explicit-active | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |
| `local-llm` | explicit-active | `Qwen3.8-27B` |

`gpt-5.5` **INACTIVE**'tir ve bu, negatif bir real-binary canary ile kanıtlanmıştır
(§9). Snapshot digest: `sha256:759fb7e7a3f45bf8…`.

---

## 9. Proof özeti (FAZ-0)

- **32 hermetic test** yeşil — `tests/core/model-activation-store.test.ts` +
  `tests/orchestra/model-activation-policy-enforcement.test.ts`.
- **248 regression test** yeşil.
- **`tsc` temiz** (noEmit clean).
- **Gerçek build** — `tsc` emit + copy-assets.
- **gpt-5.5 negatif binary canary (5/5):** (1) havuz `gpt-5.5`'i dışlıyor;
  (2) tier → `premium` isteği `gpt-5.6-sol` veriyor; (3) `forceModel gpt-5.5`
  herhangi bir spawn'dan ÖNCE `MODEL_INACTIVE` ile düşüyor. Yani policy hem
  read-filter hem forceModel hem pre-dispatch sınırında ölçüldü.
- **Active-set snapshot digest** `sha256:759fb7e7a3f45bf8…` (claude + codex +
  local-llm).

---

## 10. Dürüst follow-up — tier-projection uzlaşmazlığı

Bilinen ve izlenen bir açık: canlı `models.dev` kataloğu şu an
`gpt-5.6-terra`/`gpt-5.6-sol` modellerini tier `premium` olarak **projekte
ediyor**, oysa owner-reviewed BUILTIN merdiveni `terra = standard`,
`sol = premium_plus`, `luna = economy`'dir. Hermetic tier testi owner-reviewed
merdivene karşı assert eder. Canlı-katalog tier projection'ını owner-reviewed
merdivene uzlaştırmak **ayrı, izlenen bir follow-up**'tır ve **activation
sözleşmesini etkilemez**: FAZ-1 dogfood worker modellerini explicit olarak
pin'lediği için, tier-projection farkı aktivasyon kararına sızmaz. Bu not
yalnız kanıt kaydıdır; bir kapanış/DONE iddiası değildir.

---

## 11. FAZ-1 — local-llm runtime ve hardware placement

FAZ-1 üretim zinciri kuruludur: keyless `authMode=local`, yerel maliyet sınıfı,
registry/provider identity, fresh `/health`, `/v1/models`, Terminal native engine,
http-agentic worker ve `deckent local-llm start|status|stop` aynı config authority'sini
tüketir. Gerçek Qwen kanıtında Terminal `package.json` dosyasını Deckent tool'u ile
okudu; worker ise host-adapter üzerinden `DONE` result, provider usage ve durable
consumer settlement üretti.

`local_llm.acceleration` donanım yerleşimini aynı owner-authored config altında tutar:

| Alan | Semantik |
|---|---|
| `backend` | `auto`, `cpu`, `cuda`, `vulkan` veya `metal` |
| `backendLibrary` | Explicit dynamic ggml backend shared library; CUDA/Vulkan için zorunlu |
| `runtimeLibraryDirectories` | Platform loader path'ine sırayla eklenen dizinler |
| `device` | llama.cpp `--list-devices` kimliği; explicit GPU backend'de zorunlu |
| `gpuLayers` | `auto`, `all` veya non-negative integer; explicit GPU'da sıfır olamaz |
| `flashAttention` | `auto`, `on` veya `off` |

Config yoksa önceki portable llama.cpp argv'si korunur. `cpu` seçimi
`--device none --gpu-layers 0` ile offload'ı açıkça kapatır. CUDA/Vulkan gibi
explicit dynamic backend'ler library/runtime/device/layer authority eksikse spawn'dan
önce fail-loud olur; sessiz CPU fallback yoktur. Source hiçbir WSL, CUDA veya owner
dosya yolunu hardcode etmez. Linux `LD_LIBRARY_PATH`, macOS `DYLD_LIBRARY_PATH` ve
Windows `PATH` hedef-platform delimiter'ıyla deterministik üretilir.

---

## 12. Authority sınırı

- **Tek authority:** `ModelActivationStore` (`.deckent/models.db`). Paralel
  allowlist/config/instruction-katalog yoktur.
- **HOLD ≠ closure:** `MODEL_INACTIVE` bir typed HOLD'dur; asla sessiz ikame veya
  sessiz düşüş değildir.
- **FAZ-0 = manual bootstrap seam:** kanıtlı (32+248 test, canary 5/5, build),
  fakat MASTER ledger'da `MODEL-ACTIVATION-001` gibi typed-residual taşıyan
  bir `VERIFY` satırıdır; terminal DONE closure ayrı owner-receipt işidir.
- **FAZ-1 = local-llm runtime wiring:** üretim zinciri ve hardware-placement
  authority'si kurulu; owner config seçimi §11 kontratına tabidir.

Extended ledger satırı: `docs/MASTER-PLAN.md` — `OWNER-MODEL-POLICY-001`.
Core-memory referansı: `.deckent/docs/core-memory/project_owner_model_policy.md`.
