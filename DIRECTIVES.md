# GUVENLIK+HIJYEN MIKRO-DALGASI — dockerignore-secret-pini · oksuz-i18n temizligi

## Goal

Iki sinirli is kapanir: (1) REPO-DECK-001'in kalan hermetik dilimi — `.dockerignore`
secret-dislama satirlarinin (`.deck`, `.deck.*`, `.env` ailesi) varligini ve
negation-ile-geri-alinmadigini pinleyen hermetik test (image-layer canli-kaniti landing'de
host tarafindan docker-probe ile alinir); (2) `cli.provider-observations.*` alti oksuz
i18n anahtarinin silinmesi (komut cliContract kataloguna tasinmisti; repo-genelinde sifir
tuketici). Bu kosu ayni zamanda xverify producer-fence onariminin kabul-probudur: otomatik
cross-verify'da `xverify_producer_result_mismatch` imzasi SIFIR olmalidir.

## Execution contract

- Otorite: main'deki kontratlar; assertion zayiflatilmaz. Yalniz kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope disina cikma.
- Testler hermetik (tmpdir/pure-parse; docker daemon CAGIRILMAZ — daemon-gerektiren
  image-layer kaniti bilinçli olarak landing-host isidir). VITEST_MAX_FORKS=2.
- Degistirdigin dosyalar icin `npx tsc --noEmit` SIFIR hata; ciktiyi result notes'a yaz.
- Aktif run sirasinda build/provider-auth/bot mutation YASAK.

## Task 1: dockerignore secret-dislama hermetik pini
- Files: tests/docker/dockerignore-secrets.test.ts
- Reads: .dockerignore, Dockerfile.worker
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/docker/dockerignore-secrets.test.ts
### Description
YENI hermetik test (gercek repo `.dockerignore`'unu okur — repo-kok dosyasi read-only
fixture'dir, tmpdir kopyasi gerekmez cunku test salt-okur): (1) `.deck` ve `.deck.*`
satirlari MEVCUT ve bir negation (`!` on-ekli) satirla sonradan GERI ALINMIYOR (dosya
sirasiyla tarama); (2) `.env`, `.env.local`, `.env.*.local` ailesi ayni garantiyle mevcut;
(3) minimal dockerignore-semantigi dogrulamasi: satirlar trim'lenir, `#` yorum satirlari
ve bos satirlar atlanir — parser bu kurallarla okur (Docker'in gercek davranisiyla uyum;
harici lib EKLENMEZ, ~15 satirlik saf parse yeterli). 3 it. Dockerfile.worker'daki COPY
kaynaklarinin `.deck` gerektirmedigini de tek assertion'la pinle (Dockerfile metninde
`.deck` gecmiyor).

## Task 2: oksuz cli.provider-observations.* i18n anahtarlarinin silinmesi
- Files: src/cli/helpers/messages.ts
- Reads: src/cli/commands/provider-observations.ts, src/cli/helpers/message-catalog/cli-run.ts
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/messages-completeness.test.ts
### Description
messages.ts:7184-7207 bolgesindeki alti `cli.provider-observations.*` anahtari (desc,
inspect.desc, migrate.desc, adopt.desc, adopt-runtime.desc, reconcile.desc) SILINIR —
komutun gercek aciklamalari cliContract katalogundan geliyor (Reads'teki komut dosyasinda
dogrula: getMessage bu anahtarlarla CAGRILMIYOR) ve repo-genelinde sifir tuketici var.
Silme oncesi kendi grep-dogrulamani yap ve result notes'a yaz (anahtar-basina tuketici=0
kaniti). Baska anahtara DOKUNMA; en+tr cifti birlikte gider. messages-completeness testi
katalog-butunlugunu dogrular.
