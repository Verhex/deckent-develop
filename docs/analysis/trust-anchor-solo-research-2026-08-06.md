# TRUST-ANCHOR-001 — Solo-Hesap Mitigasyon Araştırması (Karar-3, 2026-08-06)

> Work ID: `TRUST-ANCHOR-001` (satır 520, VERIFY) + `TRUST-ANCHOR-003` (satır 526, OPEN).
> Karar-3 (Alperen, 2026-08-06): "önce solo-hesap mitigasyon araştırması" — mutating değil,
> slot yemez. Girdi: `docs/analysis/github-solo-mitigations-2026-08-04.md` + 526 satır planı.
> Bu doküman araştırma güncellemesidir; karar üretmez, 526'nın uygulama sırasını netleştirir.

## 1. Tehdit modeli (neyi kapatıyoruz)

Solo-hesap yapısal ikilisi (xverify-E dürüst sınır 3/4): (a) **parent≠reviewed** — tek
hesap hem yazar hem onaylayandır; (b) **self-modifiable-check** — required-check'i tanımlayan
workflow dosyasını aynı hesap değiştirebilir. Bugünkü kısmi savunmalar: merge-queue (required
check'ler final-merge-result üzerinde yeniden koşar, 2026-08-04'ten beri AÇIK) + Validator
Contract'ın full-history trust-anchor doğrulaması (shallow-clone fail-closed, PR #48 dalgası).

## 2. Güncel durum ölçümü (2026-08-06)

| Mitigasyon | Durum | Not |
|---|---|---|
| Merge queue (required'lar final-result'ta) | ✅ CANLI | 535 daraltması required-seti DEĞİŞTİRMEDİ (Type Check + Validator×3 kuyrukta koşuyor — ilk daralmış kuyruk-merge'i PR #77'de kanıtlandı) |
| Validator full-history anchor | ✅ CANLI | `fetch-depth: 0` yorumu 20321963 ruleset'ine referanslı |
| Bot machine-account + path-scoped required-reviewer | ⏳ BLOKE | Team koltuğu 1/1 dolu; Alperen beyanı ~2026-08-12 koltuk |
| Nightly ruleset-snapshot dış defteri | ❌ Kurulmadı | Org-owner'ın YAZAMADIĞI append-only depo şartı — aşağıda seçenekler |
| Out-of-repo canonical check (GitHub App, ayrı integration-ID) | ❌ Kurulmadı | En güçlü yapısal parça |
| GHEC trial | ❌ Başlamadı | Altyapı hazır olunca (526 sırası) |

## 3. Araştırma bulguları — uygulama sırası önerisi

**Önce (koltuk beklemeden yapılabilir):**
1. **Ruleset-snapshot defteri**: `gh api /repos/{o}/{r}/rulesets` çıktısının günlük imzalı
   snapshot'ı. "Owner'ın yazamadığı" şartını solo dünyada TAM sağlayan tek pratik biçim:
   snapshot'ı **üçüncü-taraf saklama** (örn. Sigstore Rekor transparency-log girişi veya
   başka bir bulut hesabındaki append-only bucket) — org-içi ikinci repo YETERSİZ (aynı
   owner yazabilir). Öneri: Rekor tabanlı imza-günlüğü (ücretsiz, herkese açık doğrulama,
   silinemez); `coverage.yml` gibi schedule'lı hafif workflow.
2. **GitHub App (ayrı integration-ID) canonical-check iskeleti**: App'in private key'i
   owner hesabının Actions secret'ında durursa yapısal kazanım SINIRLI kalır (owner yine
   anahtara sahip) — dürüst sınır olarak belgelenir; asıl değer GHEC/organizasyon büyüyünce.

**Sonra (koltuk ~08-12):** bot hesabı + tek-üyeli enforcement-reviewers team +
`.github/workflows/**` ve validator path'lerine required-reviewer rule (526 plan aynen).

**En son:** GHEC trial (require-workflows + ruleset-history), yukarıdakiler canlıyken.

## 4. Dürüst sınır beyanı

Solo-owner dünyasında owner'ın kendisi her katmanın anahtarına ulaşabilir; buradaki
mitigasyonlar "imkânsızlaştırma" değil, **kurcalamanın kanıt bırakmasını** garanti eder
(tamper-evidence). Bu beyan TRUST-ANCHOR-001'in typed-açık sınırının devamıdır ve GHEC/
çok-kişili org'a geçişte gerçek imkânsızlaştırmaya evrilir.

## 5. Önerilen sonraki adım (karar değil, sıra)

526'ya tek ekleme önerisi: madde-1'deki Rekor-tabanlı snapshot defterinin 526 kapsamına
"üçüncü-taraf append-only" netlemesiyle yazılması; uygulaması koltuk-bağımsız ilk dilim
olarak Dalga-2/3 arasında slot-dışı koşabilir (schedule workflow — mutating ama küçük).
