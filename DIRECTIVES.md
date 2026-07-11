# DIRECTIVES — SPRINT-415: RC-5 EVERY-ENVIRONMENT INSTALL-MATRIX + SEC-03 TOKEN-REDACTION

## Goal
RC-treni dilim-5 (543: XPLAT-01 — Win/WSL/macOS/Linux packed-install matrix REQUIRED) + RC-6'dan
öne-alınan SEC-03 (token-redaction). SCHED-5 bilinçli ERTELENDİ: shadow-reducer dogfood-flag'i az
önce açıldı — live-switch ancak journal-kanıtı toplandıktan sonra (bu sprint'in koşusu kanıt üretir).
Tasarım-SSOT: `docs/analysis/beta-blocker-sweep-2026-07-11.md` (XPLAT-01 + SEC-03).
⚠️ Workflow-pin kör-noktaları artık BEŞ dizin: tests/github/ tests/workflows/ tests/docs/
tests/scripts/ tests/governance/ — workflow değiştiren task BEŞİNİ de tarar.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST: fix'ten önce hatalı davranışı RED testle kanıtla.
- i18n-FIRST (user-facing CLI metni; log-prefix'li satırda getMessage aynı-satırda).
- Test hermetik: tmpdir, async spawn, ≤16GB.

## Task 1: RC5A — cross-platform packed-install matrix: üç-OS gerçek-kurulum smoke'u (XPLAT-01)
- Model: sonnet | Effort: high | Provider: claude
- Files: .github/workflows/cross-platform-e2e.yml, scripts/xplat-install-smoke.mjs, tests/workflows/cross-platform-e2e.test.ts
- Scope: .github/workflows/, scripts/, tests/workflows/
- Dependencies: none
### Description
KANIT (sol-sweep XPLAT-01): doctor native-Windows'u 'fully supported' gösterir (doctor.ts:~95)
ama Windows CI informational/allow-failure ve yalnız core-test kapsamındadır (ci.yml:~196); WSL ve
macOS gerçek release-install matrisinde YOK — 'Every Environment' yasasının release-kanıtı eksik.
GÖREV: (1) YENİ scripts/xplat-install-smoke.mjs — OS-AGNOSTİK tek-script (CI adımları yalnız bunu
çağırır; platform-dalları script içinde): `npm pack` → tmpdir'e `npm install -g <tarball>`
(prefix-izoleli — global-kirlilik YOK: npm_config_prefix=tmpdir) → kurulu-binary ile `deckent
init --yes` (413-001 non-interactive akışı) → çıktıda outcome-bloğu var + exit-code sözleşmesi
(0|2 kabul; 1 FAIL) → `deckent doctor` koşar + çıkar; her adım adlı-log + ilk-hatada dürüst
nonzero; (2) .github/workflows/cross-platform-e2e.yml'e 'packed-install' job'ı: matrix
[ubuntu-latest, macos-latest, windows-latest] × node-24 — continue-on-error/allow-failure YASAK
(üçü de required); WSL: ubuntu-job zaten POSIX-kanıtı, ayrıca windows-job'a WSL-adımı EKLEME
(runner-WSL kurulumu kırılgan — dürüst-not: WSL-kanıtı = Alperen'in lokal ortamı + ubuntu-parity;
workflow-yorumuna yaz); (3) mevcut jobs'lara DOKUNMA (yalnız yeni job ekle); (4) pin-testi:
tests/workflows/cross-platform-e2e.test.ts yeni-job şeklini pinler (matrix üç-OS + no-allow-failure
+ script-çağrısı); BEŞ pin-dizinini tara (başka dosya bu workflow'u pinliyorsa senkronla). Lokal
kanıt: script'i linux'ta gerçek koştur (npm pack + izole-prefix install ~2-3dk) → çıktı notes'a.
Smoke: node scripts/xplat-install-smoke.mjs → son satır 'XPLAT SMOKE OK (linux)'
### goNogo
- goCriteria: script üç-platform-dallı + linux'ta gerçek-koşu kanıtı; workflow üç-OS required (allow-failure/continue-on-error sıfır); mevcut job'lar byte-değişmemiş; pin-test yeni-şekli pinliyor; 5-dizin taraması notes'ta.
- nogo: allow-failure/continue-on-error eklenirse NO_GO; global npm-prefix kirletilirse NO_GO; mevcut job'lar değişirse NO_GO.

## Task 2: RC5B — release-attestation'a cross-platform şartı: matrix-yeşili olmadan publish yok
- Model: sonnet | Effort: medium | Provider: claude
- Files: .github/workflows/release.yml, tests/github/workflows/release.test.ts, tests/governance/release-workflow-unify.test.ts, tests/scripts/publish-workflow.test.ts, tests/docs/release-docs.test.ts, tests/workflows/publish.test.ts
- Scope: .github/workflows/, tests/github/, tests/governance/, tests/scripts/, tests/docs/, tests/workflows/
- Dependencies: Task 1
### Description
KANIT: 414-001'in verify-ci-attestation adımı yalnız 'CI' workflow'unu doğrular — Task-1'in yeni
packed-install matrix'i (Cross-Platform E2E) publish-şartı DEĞİL; sol RC-5 gate'i 'her platform
required' ister ve bu ancak release-attestation'a bağlanınca yürütülebilir-contract olur. GÖREV:
(1) release.yml verify-ci-attestation adımını genişlet: tag-commit için HEM 'CI' HEM
'Cross-Platform E2E' workflow-run'ları success olmalı (gh run list --commit ile; herhangi biri
yok/failure → adlı-hata + fail; iki kontrol AYRI log-satırı — hangisi eksik net görünsün);
(2) adım-yorumunu güncelle (attestation-kapsamı: CI + XPLAT); (3) BEŞ pin-dizininde release.yml'i
pinleyen her testi yeni-şekle senkronla (RED-first: önce mevcut tek-workflow-attestation pinini
güncelle). Action-SHA'ları ve OIDC yapısına DOKUNMA (414-001 teslimi).
### goNogo
- goCriteria: attestation iki-workflow'lu (ayrı-log, adlı-hata); 5-dizin pin-senkron testli-yeşil; SHA-pin/OIDC yapısı byte-korunur (diff-kanıt notes'ta).
- nogo: attestation tek-workflow'a düşerse NO_GO; SHA-pin veya OIDC satırları değişirse NO_GO.

## Task 3: SEC03 — API/terminal token-redaction: raw-token stderr'den ölür (RC-6 öne-alım)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/api/server.ts, src/cli/helpers/messages.ts, tests/api/token-redaction.test.ts
- Scope: src/api/, src/cli/helpers/messages.ts, tests/api/
- Dependencies: none
### Description
KANIT (sol-sweep SEC-03 + CC grep-teyit): ÜÇ raw-token stderr'e yazılıyor — server.ts:1651
(auto-generated API token), :1679 (localhost-minted token), :1963 (terminal session token).
Süreç-log'ları toplayan her sistem (CI, journald, log-shipper) bearer-token'ları düz-metin depolar.
GÖREV: (1) üç satırda raw-token ÖLÜR → yerine fingerprint (sha256 ilk-12-hex, 'tok:ab12…' formatı)
+ token'ın NEREDE olduğu bilgisi; (2) token 0600-dosyaya yazılır: `.deckent/runtime/api-token`
(atomic tmp+rename + chmod 0600 — 411-001'in deck-file desenini KOPYALA; Windows: icacls-deseni
varsa kullan yoksa dürüst-warn) — terminal-token için ayrı dosya `.deckent/runtime/terminal-token`;
dosya-yolu stderr-mesajında verilir; (3) mevcut TÜKETİCİLERİ KIRMA: localhost-dashboard'ın
token-alma mekanizması (HTML-injection ~:2000) ve testlerin token-okuma yolları AYNEN çalışır —
değişen yalnız STDERR-LOG içeriği (grep'le tüm resolvedToken/finalToken/terminalToken
kullanım-envanterini çıkar, notes'a yaz; injection SEC-03-kapsamı-DIŞI, RC-6 notu); (4) i18n:
yeni mesajlar getMessage en+tr; (5) RED-first: bugünkü stderr'in raw-token içerdiğini yakalayan
test → GREEN: stderr'de token YOK + fingerprint VAR + 0600-dosya VAR + dosya-içeriği=aktif-token
(server'a gerçek-istek ile doğrula — supertest/fetch deseni mevcut api-testlerinden).
### goNogo
- goCriteria: üç stderr-satırında raw-token sıfır (RED→GREEN); fingerprint + 0600-dosya (POSIX-mode assert) + dosya-token'ı gerçek-auth'ta çalışıyor; dashboard/test tüketicileri yeşil (tests/api tamamı); i18n en+tr; kullanım-envanteri notes'ta.
- nogo: dashboard localhost-auth kırılırsa NO_GO; token herhangi bir log-satırında düz-metin kalırsa NO_GO; mode-teyitsiz dosya-yazımı NO_GO.
