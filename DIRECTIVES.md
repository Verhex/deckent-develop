# DOGFOOD-SKILL EVRİMİ — DALGA-1: MEKANİZMA ONARIMI (owner-onaylı plan, 2026-08-26)

## Goal

Skill-routing mekanizmasının dört kök-onarımı: (T1) profil-türetimi v2'ye çekilir ve
çöp-domain sınıfı ölür; (T2) builtin-katmanı ile `.deckent/skills` manifest-katmanı
senkron olur ve `deckent sync` skill kolu kazanır; (T3) profilsiz skill yaratmak ve
unroutable manifest'i sessiz taşımak imkânsızlaşır (fail-closed gate); (T4) worker
prompt'una giden proje-komutları ve context-bloğu gerçek-veriye hizalanır. Ürün
kullanıcısı için karşılık: skill seçimi çeşitlenir (aynı-üçlü patolojisi ölür),
prompt'taki komutlar projenin GERÇEK script'leridir.

## Execution contract

- Kalite barı aynen: i18n-FIRST (user-facing string yalnız getMessage), 0-hardcode
  (model/akış-değeri literal'i yasak; tek kaynak registry+config), no-MVP, hermetik
  test (tmpdir; VITEST_MAX_FORKS=2), production wiring closure (producer→consumer→
  entrypoint zinciri koşturulmadan DONE yok).
- Mevcut deseni kullan, yeniden icat etme; assertion zayıflatma ve test silme YASAK.
- Her task kendi Test komutunu koşar; koşum kanıtı .result notes'a. Ürün-bug
  kanıtında dosyaya dokunmadan NO_GO + exact src dosya:satır.
- Manifest yeniden-yazımları elle değil, GERÇEK binary komutla üretilir
  (`node dist/cli/entry.js sync ...`) — proof-of-function.

## Task 1: Skill-profil türetimi v2 — çöp-domain temizliği + yeniden-türetim kapısı
- Files: src/core/skill-profile-derivation.ts, tests/core/skill-profile-derivation.test.ts
- Reads: src/core/skill-types.ts, src/core/skill-pool.ts, src/core/routing-engine.ts, tests/core/skill-pool.test.ts, tests/core/skill-profile-state.test.ts
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/skill-profile-derivation.test.ts tests/core/skill-pool.test.ts tests/core/skill-profile-state.test.ts
### Description
deriveCanonicalSkillProfile (:129) + deriveDomains (:78) bugün v1 türetimiyle çöp-domain
üretiyor (genel-geçer terimlerden anlamsız domain'ler; aynı-üçlü seçim patolojisinin kökü).
deriveDomains v2: (a) domain'ler yalnız skill'in description/tags/name'inden anlamlı
tekil köklerle türer, stop-word/jenerik-terim listesi tek-kaynak sabit olur; (b)
SKILL_PROFILE_DERIVATION_VERSION artırılır ve persisted profileProvenance'ta eski
derivationVersion görüldüğünde profil BAYAT sayılıp yeniden türetilir (derivationVersion
guard'ı — persisted-generated profil eski sürümdeyse manifest-profile'a değil fresh
v2 türetimine gider); (c) authored manifest-profile yolu AYNEN korunur (authority
değişmez). Regresyon: çöp-domain örnekleri fixture'lanır (v1'de üreyen, v2'de ölen);
version-guard fixture'ı (v1-provenance'lı persisted profil → v2 yeniden-türetim).

## Task 2: Katman-senkronu — deckent sync skill kolu + builtin content-hash + observability onarımı
- Files: src/cli/commands/sync.ts, src/core/skill-pool.ts, src/cli/helpers/messages.ts, tests/cli/sync-skill.test.ts, .deckent/skills/
- Reads: src/core/skill-profile-derivation.ts, src/core/agent-pool.ts, src/core/agent-prompt-sync.ts, src/cli/commands/skill.ts, tests/cli/commands.test.ts
- Priority: HIGH
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/sync-skill.test.ts tests/core/skill-pool.test.ts
### Description
Task 1'e bağımlıdır (v2 türetimi landed olmalı). Agent-emsali desenle (agent-pool
seedBuiltins + agent-prompt-sync content-hash akışı) `deckent sync`e skill kolu eklenir:
builtin skill tanımı değiştiğinde content-hash uyuşmazlığı tespit edilir ve manifest
GERÇEK binary koşusuyla yeniden-materialize edilir (elle JSON yazmak yasak). Bu koşu
`.deckent/skills/*/manifest.json` altındaki ~30 manifesti v2 profilleriyle re-persist
eder; `observability` skill'inin bozuk manifesti bu akışla onarılır (özel-durum
elle düzeltme değil, sync'in genel yolu onarmalı). Kullanıcıya görünen yeni string'ler
getMessage kataloğuna (en+tr) eklenir. Kanıt: sync koşusu öncesi/sonrası manifest
diff özeti + yeniden koşulduğunda idempotent (ikinci koşu 0 değişiklik) .result'ta.

## Task 3: Unroutable-gate — skill create zorunlu profil + lint-manifests fail-closed
- Files: src/cli/commands/skill.ts, scripts/lint-manifests.mjs, src/cli/helpers/messages.ts, tests/cli/skill-create-gate.test.ts
- Reads: src/core/skill-profile-derivation.ts, src/core/skill-types.ts, tests/core/skill-profile-derivation.test.ts
- Priority: HIGH
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/skill-create-gate.test.ts && node scripts/lint-manifests.mjs
### Description
Task 1'e bağımlıdır (v2 kontratına karşı doğrulanır). İki kapak: (a) `deckent skill
create` (skill.ts:309 bölgesi) profil-üretimi başarısızsa skill'i UNROUTABLE olarak
sessizce yazamaz — typed hata + kullanıcıya getMessage'lı yönlendirme (en+tr), skill
dosyası yazılmaz; (b) scripts/lint-manifests.mjs unroutable/profilsiz manifest
gördüğünde fail-closed FAIL verir (bugünkü davranış neyse tespit edilip sıkılaştırılır;
yalnız-azalma baseline gerekiyorsa tarihli ledger yorumuyla kurulur). Gate lint
zincirindeki mevcut yerinde kalır; yeni gate icat edilmez.

## Task 4: Prompt-doğruluğu — stack-detector komutları package.json'dan + context sinyal-diyeti
- Files: src/core/stack-detector.ts, src/orchestra/prompt-god-template.ts, tests/core/stack-detector.test.ts
- Reads: src/orchestra/prompt-compile.ts, src/core/analyzer.ts, tests/orchestra/prompt-god-template.test.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/stack-detector.test.ts tests/orchestra/prompt-god-template.test.ts
### Description
Bağımsız task (T1-T3'e bağlı değil). (a) stack-detector.ts:57 bölgesindeki dil-başına
hardcoded komut tablosu (typescript: 'npx tsc' vb.) projenin GERÇEK package.json
scripts'inden çözülür: script varsa `npm run <script>` kullanılır (build/test/lint/
typecheck isim-eşleme + yaygın takma-adlar), yoksa mevcut dil-default'una dürüst
fallback — asla var-olmayan komut uydurma (honest-empty kuralı aynen). Tablo yalnız
fallback-katmanı olarak kalır. (b) prompt-god-template buildProjectContextBlock (:999
bölgesi) sinyal-diyeti: boş/jenerik context-bloğu prompt'a katılmaz, mevcut davranış
korunarak yalnız gerçek-sinyal metin geçer. Worker-prompt çıktısına fixture: scripts'li
projede prompt gerçek komutları içerir, scripts'siz projede fallback + uydurma-komut-yok.
