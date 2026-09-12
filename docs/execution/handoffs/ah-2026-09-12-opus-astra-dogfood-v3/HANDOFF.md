# HANDOFF v3 — dogfood go-live lane → Astra (epoch 6 → 7)

> **Bu dosya authority DEĞİLDİR.** Authority yalnız receipt zincirindedir:
> `0001-prepared.json` · `sha256:af8197e631c8a3e8052d7d84b159b9af994053c3b2b42b31132fe7ba04ef9352`
> Durum **PREPARED** — authority hâlâ transferor'dadır (protokol §3.1).
>
> Bu dosya ve kardeş manifestleri `files-changed.json`'dan **bilerek hariç tutuldu**: bir manifest
> kendi hash'ini içeremez; v2'deki `SOURCE_STATE_MISMATCH`'in bir bacağı buydu.

## 0. Aday geçmişi (hiçbiri mutate edilmedi — §3.5)

| aday | son transition | neden |
|---|---|---|
| `…-dogfood` | ABORTED `sha256:f345a3f0…` | `IDENTITY_MISMATCH` — `to.sessionDigest` uydurma varsayılandı (ENTRY 1274) |
| `…-dogfood-v2` | ABORTED `sha256:e0aec820…` | `SOURCE_STATE_MISMATCH/EVIDENCE_STALE` + çözülmemiş principal (ENTRY 1276) |
| **`…-dogfood-v3`** | **PREPARED** | bu paket |

### v2'nin dört itirazı → v3'teki karşılık

| itiraz | karşılık |
|---|---|
| A grubu drift (`current-flow.md`) | **Kök-neden transferor'un sıralama hatasıydı.** Yapısal çözüm: pointer artık receipt digest'i taşımıyor (§4.1 zorunlu kılmaz) ⇒ doküman manifest'ten sonra değişmek zorunda değil. Paket dizini manifest dışı. |
| C grubu drift | C satırları **hash taşımıyor**: `transferred:false` + `hashOmittedReason`. Pinlenecek içerik yoksa bayatlayacak değer de yok. |
| build identity | `BUILD_IDENTITY_VERIFIED` iddiası **GERİ ÇEKİLDİ** → `CURRENT BINARY STALE/HOLD` |
| UTC | Host offset `+0300` ölçüldü; v1/v2'de yerel saat `Z` ile yazılmıştı. v3'teki her `observedAt` gerçek UTC. |
| principal | İki taraf da runtime-resolved; yöntem aşağıda |

## 1. Identity + trigger

| | |
|---|---|
| from | `claude-code-cli` · `claude` · `claude-opus-5` · `supervisor` |
| to | `codex-cli` · `codex` · `gpt-6-astra` · `supervisor` |
| `to.sessionDigest` | `sha256:a9da6833…` — transferee-reported, verbatim (ENTRY 1279) |
| `to.principalDigest` | `sha256:00900c7a…` — transferee-reported, verbatim (ENTRY 1279) |
| `from.sessionDigest` | `sha256:f9362b58…` = `sha256("session_01CLZWPYjFHQc2vSCtAuQsWN")` |
| `from.principalDigest` | `sha256:4f359fda…` — **owner-authorized runtime resolution**, aşağıda |
| epoch | **6 → 7** (sayaç global: 3→4, 4→5, 5→6 emsalleri) |
| trigger | `OWNER_DIRECTIVE` · `owner-live-instruction` |

### Principal — kaynak ve yöntem (her iki taraf)

Ürünün mevcut `pseudonymizeAccount`'ı (`provider-authority-keyring.ts:711`) **host-yerel
pseudonym root üzerinden HMAC** üretir; karşı taraf başka host'ta ne üretebilir ne doğrulayabilir.
Cross-party receipt için uygun değildir — bu bir **finding** olarak kayıtlıdır.

Kullanılan yöntem, iki tarafta da birebir:

```
digest = sha256(canonicalJson({provider, authMode, stableAccountIdentity}))
         canonicalJson = src/core/audit-writer.ts:327 (anahtarlar leksikografik)
```

| taraf | stableAccountIdentity kaynağı | authMode | nasıl elde edildi |
|---|---|---|---|
| from (claude) | `canonicalOrganizationSubject(orgId)` — `src/providers/claude-account-evidence.ts:66-76,287` | `subscription` | **owner-authorized** tek seferlik read-only `claude auth status --json` (ürünün kendi çağrısı, `:244`). Ön-koşullar doğrulandı: `loggedIn` ✓ `apiProvider=firstParty` ✓ `authMethod=claude.ai` ✓ `orgId` ✓ |
| to (codex) | `state.tokens.account_id` — `codex-provider-evidence-sources.ts:201,229` | `subscription` | transferee kendi çözdü ve digest'i bildirdi (ENTRY 1279) |

**Ham hesap kimliği hiçbir tarafta** stdout'a, kanala, receipt'e veya evidence dosyasına yazılmadı.
Auth mutation/login/refresh yok.

> **Dürüst sınır (transferee'nin ifadesiyle uyumlu):** her taraf kendi principal'ını çözer ve
> *attest* eder. Digest tek başına karşı hesabın sahipliğini kriptografik olarak kanıtlayan bir
> imza değildir; karşılıklı self-attestation'dır.

## 2. Authority scope

- **Outcome** `RECOVERY-DO-DOGFOOD-001` · hedef MASTER satır 120 `STATE-RETENTION-001` (OPEN)
- **Includes:** epoch-7 tek yürütücülük + openActions + devredilen kirli kapsam **A(26) + A+B(1) + B(5)**
- **Excludes:** owner-only kararlar · **grup C (35, canlı Cursor lane, `transferred:false`)** · **grup D (14, atfedilemeyen)** · admit edilmemiş iş

## 3. Repo state

`main` · `HEAD=ae87e898613928ca314b5179484982b6bdb6d69f` · upstream ahead 1 · commit/push YOK.

`files-changed.json` (`sha256:b4b72a578b5f363c121eb16687bc78ff100efccc6baf395e64d09c496ab58b14`) —
81 satır, her biri `path·gitStatus·sha256·group·owner·transferred`.
Paket dizini (3 yol) self-reference nedeniyle hariç.

| grup | adet | transferred | hash |
|---|---|---|---|
| A | 26 | ✔ | var |
| A+B | 1 | ✔ | var — **ÇAKIŞMA** `src/core/config-types.ts`: hem transferor (`max_tier`) hem sprint-747 worker'ı (rotation policy) |
| B | 5 | ✔ | var (sprint-747 worker efekti) |
| C | 35 | ✘ | **yok** — canlı eşzamanlı lane, pinlenmiyor |
| D | 14 | ✘ | var (atfedilemeyen, sabit) |

## 4. Live runtime — sınırlı kanıt, ispat DEĞİL

`runtime-liveness.json` (`sha256:1ec76d66d893131f5fa82490f029943e2a295ae7756eb2e3a71213cae6402022`) —
altı sinyal: sprint-state ABSENT · `.pid` ABSENT · heartbeat ABSENT · `.tasks` yalnız 5 `.previous` ·
`docker ps` yalnız `local-llm` · run-flow `6de757f8` son olay `RUN_FAILED`, `RUN_STARTED` hiç yazılmamış.

> **Residual:** tek andaki disk/daemon gözlemi. Başka host/checkout/artefaktsız süreçte canlı
> worker olmadığını **ispatlamaz**; oradaki liveness **UNKNOWN**.
> **Orphan (açık etiketli):** `w-747-001`, `missing_file yaş 92dk`.

## 5. Approvals

Bekleyen istek yok, federe kutu boş. Devralan adına karar verilmedi.

## 6. Verification

`verification.json` (`sha256:94221d74ae1c60b1a07106e81a63d4b2f3bbe1d654380e1850d16b0d2a1ab3cc`) — 6 kayıt.

| sınıf | sonuç |
|---|---|
| `LOCAL_VERIFIED` | devredilen kapsamın 7 test dosyası → **96/96**, exit 0 |
| `GLOBAL_RED_NOT_TRANSFERRED` | `tsc --noEmit` **exit 2**, tek hata: `src/cli/repl/native-transport.ts(604,38) TS2339` → **grup C**. `build:all` tsc'yi zincirlediği için **global rebuild şu an mümkün değil**. Aynı komut 08:27Z'de, devredilen tüm değişiklikler yerindeyken **exit 0**'dı (v2 logu `sha256:e3b0c442…`, boş çıktı) — regresyon sonradan C'den geldi. |
| `PRE_EXISTING_RED` | 9 kırmızı, hepsi `E_PRODUCTION_WIRING_REQUIRED`; baseline yöntemiyle bu oturumun eseri olmadığı kanıtlandı |
| `BUILD_IDENTITY_STALE` | §7 |
| `NOT_RUN` | remote CI |
| `NOT_CLOSED` | provider call + usage + settlement zinciri |

## 7. SSOT + build

```
canlı  sourceTreeSha256 = fd8d19068ac29c86f410b8a73ccc2c8534b13e053614f8e88bdf529d7e688a1a
dist   sourceTreeSha256 = 5f5fb64f043fa6fa1eb74fa8a76ff7b44f8096c6e4990f61afbc1dc14b10045a
→ MISMATCH ⇒ CURRENT BINARY STALE/HOLD
```

Son build `npm run build:all` exit 0 @2026-09-12T01:37Z — **yalnız tarihsel olarak** verified.
Rebuild zorlanmıyor; host restart iddiası yok. Stale'in nedeni canlı C lane'idir, transferor
ölçümünden sonra kaynak mutasyonu yapmadı. **v2'deki `BUILD_IDENTITY_VERIFIED` iddiası geri çekildi.**

MASTER'a yeni satır açılmadı (finding otomatik iş değildir). `durum-raporu.md` EK-2/3/4,
`current-flow.md` LANE bölümü güncel. `.deckent/config.json` `max_tier=standard` **yerel/gitignored**.

## 8. Honesty + findings

`findings.json` (`sha256:fb9150600158743feb74040e849fabb7427e18a1b5d8e5e1638de51c33152816`) — 11 kayıt.
`BLOCKS_CURRENT_DONE` × 2 (BULGU-M · BUG-F), `RELATED_BUT_NONBLOCKING` × 7, `UNRELATED` × 2.

**Bilerek yapılmayan:** `.deckent/sprint-state.json` elle yazılmadı — uydurma kalıcı run durumu
kilidi açardı ama settlement otoritesini sahtelerdi.

## 9. Open actions

Bağlayıcı sıra `0001-prepared.json` → `openActions`.
**recommendedNextAction:** BULGU-M'i çöz — 747-001 settle olmadan hiçbir `deckent do` PLAN'ı geçemez.

---

### Devralma (protokol §6)

1. `to` kimliğini kendi runtime'ınla eşleştir (session + principal, ikisi de senin bildirdiğin).
2. Receipt digest'ini bağımsız hesapla → `sha256:af8197e631c8a3e8052d7d84b159b9af994053c3b2b42b31132fe7ba04ef9352`
3. Dört manifest digest'ini doğrula (§3/§4/§6/§8).
4. `node scripts/authority-handoff.mjs verify --handoff ah-2026-09-12-opus-astra-dogfood-v3 …`
5. Blocker varsa `HOLD` yaz — kendini promote ETME.
6. `COMMITTED`'i transferor üretir; üretemezse tek yol owner-authorized `RECOVERY_COMMITTED` (§3.3).
