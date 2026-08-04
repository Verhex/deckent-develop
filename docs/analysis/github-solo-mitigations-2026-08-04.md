# Solo Hesapta İki Boşluğun Daraltılması — GitHub Mitigasyon Araştırması (2025–2026 docs)

> Hazırlayan: Claude (Fable 5) araştırma turu, 2026-08-04 · Tetikleyen: xverify-E REFUTED
> (codex-analysis/xverify-e-2026-08-03.md) yapısal ikili — G1 "parent ≠ reviewed",
> G2 "self-modifiable required check" · Statü: **karar-girdisi** (owner: Alperen).
> Bu dosya veri/analizdir; policy üretmez — hüküm MASTER satırıyla verilir.

## 0) Kritik ön-bulgu: repo profili

`gh api` ile doğrulandı: **VerhexIO = Organization** (plan görünmüyor → büyük olasılıkla Free
for organizations), **deckent-develop = public**. Yani bu repo "personal account" değil,
**single-member org + public repo** profilinde. Bu profil şu kapıları **bedava açar**: merge
queue, org audit log (UI), teams (→ required reviewer rule, machine-account'lu team),
CODEOWNERS. Şu kapılar **kapalı kalır**: push rulesets (yalnız private/internal + Team planı),
require-workflows rule ve ruleset history UI (yalnız GitHub Enterprise Cloud).

Gap tanımları: **G1** = "parent ≠ reviewed" (validator'ın güven çapası bağımsız incelenmemiş
parent commit), **G2** = "self-modifiable required check" (aynı PR validator script + workflow
dosyalarını değiştirebilir; ruleset yalnız check ADI + GitHub Actions integration ID'sini
sabitler, semantiği sabitlemez).

## (a) Mitigasyon × Availability × Gap × Residual Risk tablosu

| # | Mitigasyon | Availability (bu repo için) | Daralttığı gap | Residual risk |
|---|---|---|---|---|
| 1 | **Push ruleset — "Restrict file paths"** (`.github/workflows/**`, `scripts/lint-master-plan.mjs` push'unu blokla) | **Bu repoda YOK.** Push rulesets yalnız **private/internal** repolarda; github.com'da **Team planı** (GHEC'te internal dahil + enterprise düzeyi). Public repoda hiçbir planda yok. Rule türü olarak "restrict file paths" **yalnız push ruleset** rule'udur, branch ruleset'e konamaz | G2 (en doğrudan yol — ama erişilemez) | Repo private + Team'e ($4/ay) geçilse bile: admin bypass_actors'a kendini ekleyebilir/ruleset'i düzenleyebilir; mutasyon ancak dış snapshot ile kanıtlanır |
| 2 | **Org ruleset "Require workflows to pass before merging"** (canonical validator workflow'u ayrı repodan, org düzeyinde pinli — repo içi PR bunu değiştiremez) | **GHEC only** (docs feature flag `repo-rules-required-workflows: ghec` — fpt'de render edilmiyor; org rulesets genel olarak Team+, ama bu rule Enterprise). ~$21/kullanıcı/ay | **G2'yi en güçlü kapatan GitHub-native mekanizma** (workflow dosyası + ref org-level pinlenir, kaynak repo ayrı) | Solo org owner ruleset'i yine düzenleyebilir; workflow kaynağı branch ref'e pinlenirse o repo'ya yazan da değiştirir → SHA/tag pin + kaynak repoyu ayrı korumak gerekir |
| 3 | **Reusable workflow ayrı trusted repodan, SHA-pinned `uses:`** | **Free, her planda** (private→private paylaşım aynı user/org içinde 2022'den beri GA; SHA pin resmi öneri) | **Tek başına G2'yi KAPATMAZ** (bkz. (c)) — yalnız hijyen/tek-kaynak değeri | Caller workflow repo İÇİNDE ve aynı PR'da düzenlenebilir: PR, `uses:` satırını söküp aynı check adını üreten trivial job yazabilir; ruleset yalnız ad+Actions integration ID kontrol eder |
| 4 | **Kendi GitHub App'inle üretilen required check** (validator, repo dışındaki trusted altyapıda koşar; sonucu Checks API ile App olarak yazar; ruleset'te check'in `integration_id`'si **senin App'ine** pinlenir) | **Free** (App oluşturma bedava; koşturma altyapısı sana ait — deckent runtime'ı zaten var). Ruleset'in required check'i belirli bir app'e pinleme mekanizması bugün zaten kullandığınız şeyin aynısı (şu an Actions'ın ID'sine pinli) | **G2'yi free katmanda gerçekten kapatan tek desen**: repo içi hiçbir workflow, farklı integration ID'li o check context'ini taklit edemez; enforcing kod repo dışında. G1'i de kapatabilir: App tarafındaki validator, güven çapasını parent commit yerine **protected branch tip'inden merge-base**'e bağlar | App private key custody (anahtar sızarsa oyun biter); admin ruleset'ten check'i düşürebilir (→ #8 snapshot ile izlenir); altyapı uptime senin sorumluluğun |
| 5 | **Merge queue** (`merge_group` event, final merge sonucunda check'leri yeniden koşar) | **Bu repoda FREE** — "public repository owned by an organization" koşulunu sağlıyor; private org repo olsaydı GHEC gerekirdi. Personal (user-owned) repoda hiç yok | **G1'in "final SHA yeniden gate'lenmiyor" bileşeni**: PR'ın değişiklikleri, hedef branch'in en güncel hali + kuyruktaki PR'larla birleşik olarak doğrulanır | Workflow'ların `merge_group` trigger'ı eklenmesi gerekir — o workflow'lar repo içi (G2'ye bağımlı). Merge queue "parent'ı kim inceledi" sorusuna cevap vermez |
| 6 | **Strict required status checks** ("Require branches to be up to date before merging") | **Free** (branch ruleset'in mevcut rule'unun bir seçeneği; public repoda zaten kullanılabilir; ruleset 20321963'te AÇIK) | G1 kısmi: check'in koşulduğu test-merge, güncel main'i içerir; bayat-parent'a karşı pencereyi küçültür | Semantik doğrulama yok; validator'ın çapa mantığını değiştirmez |
| 7 | **Machine account (bot) + required PR review / path-scoped Required Reviewer rule** — bot ikinci org üyesi, tek kişilik "enforcement-reviewers" team'i; **Required reviewer rule** (GA: 2026-02-17) fnmatch pattern ile yalnız `.github/workflows/**` + `scripts/lint-master-plan.mjs` dokunuşlarında team onayı ister | **Free**: ToS açıkça izinli — "One person or legal entity may maintain no more than one free Account (if you choose to control a machine account as well, that's fine, but it can only be used for running a machine)". Required reviewer rule fpt'de mevcut ama **team gerektirir → user-owned repoda yok, org'da var** (bu repo org ✓, public ✓ → free). "Require approval from someone other than the last pusher" seçeneği ile birleştir | G1+G2, ama **yalnız belirli tehdit modeline karşı gerçek**: primary hesabın token'ını taşıyan otonom agent, bot'un ayrı credential'ı olmadan enforcement dosyalarını merge edemez (deckent'in agent'ları için asıl ilgili senaryo bu). İnsana (Alperen'e) karşı **theater** — iki credential da aynı insanda | Bot token'ı primary makineden/agent erişiminden izole tutulmazsa değer sıfırlanır; bot onayı semantik review değil, credential gate |
| 8 | **Ruleset mutation evidence — dış snapshot** | Ruleset **history UI/rollback = GHEC only** (flag `repo-rules-history: ghec, ghes>=3.19`). Ama REST `GET /repos/{o}/{r}/rulesets` + `GET .../rulesets/{id}` rulesets'in var olduğu her planda çalışır → periyodik `gh api` snapshot'ını append-only dış store'a (başka hesabın repo'su / S3 object-lock / transparency log) yazmak **free**. Org audit log UI (90 gün) free org'da var; audit log **API/streaming/export = GHEC** | G1/G2'yi doğrudan daraltmaz; **her mitigasyonun bypass'ını kanıtlanabilir kılar** (tamper-evidence, tamper-proof değil) | Snapshot cron'unun kendisi kimin credential'ıyla koşuyor sorusu; 90-günlük audit UI penceresi; silent-window (iki snapshot arası aç-kapa) — sıklaştırılmış interval + audit log ile çapraz kontrol |
| 9 | **Require signed commits (+ vigilant mode)** | **Free** (branch ruleset rule'u) | Neredeyse hiçbirini. Yalnız "hesaba kayıtlı bir anahtar imzaladı"yı attest eder; **review'u attest etmez** | Kritik zayıflık: web UI / Contents API / squash-merge commit'lerini **GitHub kendi anahtarıyla imzalar ve "verified" sayılır** → yalnız token taşıyan bir agent bile verified commit üretebilir; solo yazarda bağımsızlık kanıtı sıfır |
| 10 | **Environments + protection rules (wait timer, required reviewers)** | Public repoda tüm planlarda free (private'ta wait timer/required reviewers → Enterprise) | **Hiçbirini** — bkz. (c) | — |

## (b) Bu repo için önerilen minimal stack (free katman, bugün uygulanabilir)

1. **Out-of-repo enforcement (#4 — omurga):** Küçük bir GitHub App (VerhexIO org'una install)
   + deckent'in kendi altyapısında koşan validator worker. Canonical `lint-master-plan` ayrı
   trusted repoda, release-SHA'dan checkout; sonuç Checks API ile App kimliğiyle yazılır.
   `main-protection` ruleset'ine bu App'in `integration_id`'sine pinli **5. required check**
   eklenir ("Validator Contract — canonical"). Bu, G2'nin "aynı PR check'in semantiğini
   değiştirir" kolunu keser: repo içi workflow'lar bu context'i üretemez.
2. **G1 için validator çapası değişikliği (kod tarafı, GitHub feature değil):** App-side
   validator, güveni "record'u getiren commit'in parent'ı"na değil, **`merge-base(PR head,
   protected main tip)` + main tip'in kendisi App tarafından bağımsız fetch edilerek** bağlar;
   parent'ın PR içinde sahnelenmesi anlamsızlaşır.
3. **Merge queue aç (#5, free):** dört Actions check'i + canonical check `merge_group`
   trigger'ıyla final merge result üzerinde yeniden koşar → "history-sensitive validator final
   SHA'da re-gate edilmiyor" endişesi kapanır. Strict "up to date" (#6) zaten açık.
4. **Bot machine account + path-scoped Required Reviewer (#7):** bot'u org'a al, tek üyeli
   team yap, `.github/workflows/**` + `scripts/lint-master-plan.mjs` + validator test
   path'lerine required-reviewer rule; bot credential'ı yalnız air-gapped/ayrı secret
   store'da. Değer beyanı dürüst: bu, **otonom agent'lara karşı** gerçek bir ikinci-credential
   kapısıdır, insana karşı değil.
5. **Nightly ruleset snapshot (#8):** `gh api /repos/VerhexIO/deckent-develop/rulesets`
   (+ her ID'nin detayı) → append-only dış store; org audit log UI haftalık gözden geçirme.
   Bypass/ruleset mutasyonu artık en geç 24 saatte kanıta dönüşür.

Paid upgrade path (istenirse): **GHEC** → require-workflows rule (#2, G2'nin GitHub-native
kapanışı) + ruleset history/rollback + audit log streaming. **Team + repo'yu private yapmak**
→ push rulesets (#1); ama repo public kaldıkça bu yol kapalı ve public kalmak muhtemelen tercih.

## (c) "İŞE YARAMAZ" listesi — gerekçeli

- **Reusable workflow SHA-pin (tek başına):** Caller workflow repo içinde; saldırgan PR
  `uses:` satırını siler, aynı isimli job'la check adını taklit eder. Ruleset ad + Actions
  integration ID'ye bakar — her ikisi de repo içi herhangi bir Actions workflow'unca
  üretilebilir. Ancak #4 (farklı integration ID) veya #2 (org-pin) ile birleşince anlamlı.
- **Environments / wait timer / environment required reviewers:** Bunlar **deployment**'ı
  gate eder, **merge**'ü değil; üstelik PR, workflow'daki `environment:` referansını silebilir
  (G2'nin aynısı). Required reviewer'ı da yine kendin onaylarsın. Bu iki gap için sıfır katkı.
- **Require signed commits:** Solo yazar için "hangi anahtar" sorusunun tek cevabı yine
  sensin; ayrıca web/API üzerinden yapılan commit'ler GitHub tarafından imzalanıp verified
  sayıldığından token-only bir agent'ı bile durdurmaz. Review attestation'ı değildir.
- **Push rulesets (bu repo için):** Mekanizma doğru ama public repoda hiçbir planda mevcut
  değil — "önerilen çözüm" olarak sunulamaz.
- **CODEOWNERS tek başına:** Required-PR-review rule'u olmadan CODEOWNERS bilgilendirmedir;
  review rule'u eklense bile onaylayan yine sensin/botun — #7'deki credential-separation
  analizi neyse o, fazlası değil.
- **Ruleset history'ye güvenmek:** UI/rollback GHEC-only; free katmanda "GitHub'ın kendi
  geçmişi" diye bir kanıt zinciri yok — dış snapshot (#8) şart.
- **Genel sınır (dürüst beyan):** GitHub'ın trust modelinde solo bir hesabın kendine karşı
  **zorunlu bağımsız insan review'u** üretmesinin hiçbir yolu yok; org owner her kuralı
  değiştirebilir. Free katmanda ulaşılabilir maksimum: (i) enforcement kodunu repo-dışına +
  ayrı integration kimliğine taşımak, (ii) ikinci credential'ı agent'lardan izole etmek,
  (iii) her kural mutasyonunu dışarıda tamper-evident kılmak.

## (d) Kaynaklar (availability iddiaları)

- Rulesets genel availability + push rulesets (Team, private/internal only) — gated snippet:
  https://github.com/github/docs/blob/main/data/reusables/gated-features/repo-rules.md ve
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- Push Rules GA changelog (Team private; GHEC internal/org):
  https://github.blog/changelog/2024-09-10-push-rules-are-now-generally-available-and-updates-to-custom-properties/
- Rule türleri ("restrict file paths" push-only, signed commits, strict checks, merge queue
  rule, required workflows):
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets ve
  https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- Require-workflows = GHEC-only (docs feature flag):
  https://github.com/github/docs/blob/main/data/features/repo-rules-required-workflows.yml ;
  ayrıca https://github.blog/changelog/2023-08-02-github-actions-required-workflows-will-move-to-repository-rules/
- Ruleset history = GHEC/GHES≥3.19:
  https://github.com/github/docs/blob/main/data/features/repo-rules-history.yml ve
  https://github.blog/changelog/2025-02-13-repositories-ruleset-history-import-and-export-are-generally-available/
- Required reviewer rule GA (org/teams; user-owned repoda yok):
  https://github.blog/changelog/2026-02-17-required-reviewer-rule-is-now-generally-available/
  + flag https://github.com/github/docs/blob/main/data/features/repo-rules-required-reviewer.yml
- Merge queue availability (org public free; org private GHEC) + `merge_group` re-run:
  https://github.com/github/docs/blob/main/data/reusables/gated-features/merge-queue.md ve
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- Private reusable workflows aynı user/org içinde GA:
  https://github.blog/changelog/2022-12-13-github-actions-sharing-actions-and-reusable-workflows-from-private-repositories-is-now-ga/ ;
  erişim ayarları:
  https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- Environments availability (public free; private'ta wait timer/required reviewers Enterprise):
  https://github.com/github/docs/blob/main/data/reusables/gated-features/environments.md
- CODEOWNERS (public free, private paid):
  https://github.com/github/docs/blob/main/data/reusables/gated-features/code-owners.md
- Machine account ToS (1 free machine account izni):
  https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
- Personal security log (90 gün, JSON/CSV export):
  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/reviewing-your-security-log
- Rulesets REST (snapshot için): https://docs.github.com/en/rest/repos/rules
