# DIRECTIVES — SPRINT-419: LIVENESS-ADOPT + TT554-ARTIK + SEC-05 FAIL-CLOSED-AUDIT

## Goal
born-668 yarım-wire kapatma (553/554 debt'leri) + RC-6'nın SEC-05 dilimi. **TRACE-task'ları
model=opus (Alperen).** ⚠️ Workflow-pin kör-noktaları BEŞ dizin: tests/github/ tests/workflows/
tests/docs/ tests/scripts/ tests/governance/.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST: fix'ten önce hatalı davranışı RED testle kanıtla.
- Test hermetik: tmpdir, async spawn, ≤16GB. ZAMAN-DİSİPLİNİ: 20dk forensik-sınırı.

## Task 1: LIVE668A — decideWorkerLiveness ADOPT: iki gerçek kill-yolu host-primary'ye döner
- Model: opus | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/monitor/auditor.ts, src/orchestra/sprint-checkpoint.ts, tests/orchestra/liveness-adopt.test.ts
- Scope: src/monitor/, src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (418-002 dürüst-debt'i): canonical `decideWorkerLiveness` (src/orchestra/
heartbeat-monitor.ts, sprint-418) modül-sınırında RED→GREEN'li AMA iki GERÇEK kill-yolu hâlâ
eski-yolda — (a) src/monitor/auditor.ts::isWorkerStale mtime-PRIMARY, (b) src/orchestra/
sprint-checkpoint.ts::isStaleHeartbeat/detectStaleWorkers dosya-içi hb.timestamp okuyor →
bayat-ts yanlış-kill PROD'da hâlâ mümkün (412-003 phantom-fix zinciri sınıfı). GÖREV: (1) iki
yol da decideWorkerLiveness'ı ÇAĞIRIR (üçüncü-kopya karar-mantığı YASAK; adapter-girdilerini
[pid/container/pane bilgisi] mevcut kayıtlardan besle — yoksa dürüst-fallback: host-sinyali
sağlanamayan ortamda ESKİ mtime-davranışı korunur ve karar-log'unda 'host-signal-unavailable'
yazılır, sessiz-varsayım yok); (2) RED-first İKİ yol için ayrı: bayat-ts + canlı-host fixture'ında
bugün kill-kararı çıktığını kanıtla → GREEN: canlı sayılır + karar-log adlı-sinyalli; (3)
checkpoint'in restore-yolu (sprint-412 v2) ve 550-normalize bölgeleri byte-korunur. Mevcut
auditor/checkpoint testleri güncellenirken davranış-değişimi ayrı-pinli.
### goNogo
- goCriteria: iki kill-yolu da canonical-çağrılı (grep-kanıt: karar-mantığı kopyası yok); 2× RED→GREEN; host-signal-unavailable dürüst-fallback testli; checkpoint-v2/550 bölgeleri diff-korunur; tests/orchestra + monitor-aile yeşil.
- nogo: üçüncü karar-kopyası doğarsa NO_GO; fallback sessiz-varsayımsa NO_GO.

## Task 2: MET668B — TT554-artıkları: haiku yardımcı-maliyet ledger-flip + reporter canlı-wiring
- Model: opus | Agent: bug-fixer | Effort: medium | Provider: claude
- Files: src/orchestra/result-evaluator.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-reporter.ts, src/core/cost-ledger.ts, tests/orchestra/metering-live-wire.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/
- Dependencies: none
### Description
KANIT (418-001 dürüst-debt'i): metering-çekirdeği (cost-ledger.ts + variance-alert + reporter-fix)
sprint-418'de kuruldu AMA iki artık read-only-scope'taydı: (a) haiku yardımcı-çağrı maliyeti
($0.0127 sınıfı — Brain'in doc/summary yardımcı-çağrıları) hâlâ ledger-DIŞI; (b) reporter'ın
gerçek-cost/files-changed alanları canlı-veri yoluna bağlı değil. GÖREV: (1) haiku/yardımcı-çağrı
maliyetlerinin üretildiği yerleri envanterle (grep: haiku çağrı-noktaları; notes'a) ve ledger'a
akıt — ÇİFT-SAYIM YASAK (mevcut worker-cost yoluyla kesişimi kontrol et, testle pinle); (2)
reporter gerçek-cost/files-changed'i canlı-kaynaktan basar (418-001'in bıraktığı seam'leri kullan;
yeni-seam icat etme); (3) RED-first: bugün haiku-maliyetinin ledger-toplamında OLMADIĞINI +
reporter'ın placeholder bastığını kanıtla → GREEN. ⚠ usage-patch/result-collector kontratına
DOKUNMA (born-562). ⚠BUILD-GATE notu notes'a.
### goNogo
- goCriteria: haiku-maliyet ledger'da (çift-sayım-yok pini) + reporter canlı-alanlar RED→GREEN; kontrat-koruma diff-kanıt; ilgili orchestra testleri yeşil.
- nogo: çift-sayım oluşursa NO_GO; usage-patch kontratına dokunulursa NO_GO.

## Task 3: SEC05 — dependency-audit fail-closed + imzalı-istisna allowlist (RC-6 dilimi)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: .github/workflows/ci.yml, .github/workflows/release.yml, scripts/audit-exceptions.json, scripts/check-dependency-audit.mjs, tests/workflows/dependency-audit-gate.test.ts, tests/github/workflows/release.test.ts
- Scope: .github/workflows/, scripts/, tests/workflows/, tests/github/, tests/governance/, tests/scripts/, tests/docs/
- Dependencies: none
### Description
KANIT (sol-sweep SEC-05): high-severity npm-audit CI'da `continue-on-error: true` (ci.yml:~56-67)
— kırmızı-audit YEŞİL-CI verir; release-workflow güvenlik-gate'i HİÇ koşmaz. GÖREV: (1) YENİ
scripts/check-dependency-audit.mjs: `npm audit --json --omit=dev` async-spawn + parse →
high/critical bulgu = FAIL; İSTİSNA yalnız scripts/audit-exceptions.json'dan: her kayıt
{advisoryId, package, reason, owner, expires(ISO)} — süresi-geçmiş istisna GEÇERSİZ (fail) +
istisna-kullanımı raporda adlı-basılır (sessiz-bypass yok); network-hatası dürüst-FAIL
(fail-closed: 'audit koşulamadı' ≠ 'temiz'); (2) ci.yml audit-adımı continue-on-error KALKAR →
yeni script'i çağırır; (3) release.yml verify-zincirine audit-adımı eklenir (attestation'dan
sonra, publish'ten önce; SHA-pin/OIDC yapısına DOKUNMA); (4) BEŞ pin-dizini senkron (RED-first:
mevcut continue-on-error pinini önce güncelle); (5) script'in unit-testi enjekte-audit-çıktısıyla
(temiz / high'lı / istisnalı / süresi-geçmiş-istisnalı / audit-koşulamadı beş-yolu). Mevcut gerçek
vulnerability-seti varsa: fix-denemesi KAPSAM-DIŞI — bulguları istisna-DEĞİL, notes'a envanter yaz
(Brain karar verir); CI-yeşili için gerekiyorsa geçici-istisna AÇIK-gerekçeli + kısa-expiry.
Smoke: node scripts/check-dependency-audit.mjs → temiz-ya-da-adlı-rapor, exit-code dürüst
### goNogo
- goCriteria: fail-closed beş-yol testli; istisna şeması expires/owner/reason zorunlu + süre-aşımı fail; ci.yml continue-on-error sıfır; release-zincirinde audit-adımı; 5-dizin pin-senkron; SHA-pin/OIDC diff-korunur.
- nogo: continue-on-error herhangi bir audit-adımında kalırsa NO_GO; süresiz-istisna kabul edilirse NO_GO; network-hatası sessiz-geçerse NO_GO.
