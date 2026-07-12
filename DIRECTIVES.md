# DIRECTIVES — SPRINT-420: LIVE668A-YENİDEN + DEP-BUMP-A (⏰2026-07-26)

## Goal
LIVE668A üçüncü-deneme (kök çözüldü: heartbeat_timeout 120→600s — task artık kill-korumalı) +
born-669 DEP-BUMP treninin non-major dilimi (istisna-expiry ⏰2026-07-26; RC-6 kapanış-ön-şartı).
**TRACE-task'ı model=opus (Alperen).**

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik (tmpdir, async spawn, ≤16GB); 20dk-forensik-sınırı.

## Task 1: LIVE668A — decideWorkerLiveness ADOPT (3. deneme; iki gerçek kill-yolu)
- Model: opus | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/monitor/auditor.ts, src/orchestra/sprint-checkpoint.ts, src/orchestra/heartbeat-monitor.ts, tests/orchestra/liveness-adopt.test.ts
- Scope: src/monitor/, src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCEKİ İKİ DENEME worker-timeout kurbanı oldu (kök: heartbeat_timeout=120s < opus-düşünme-turu;
şimdi 600s — İRONİ: bu task tam o mekanizmayı düzeltiyor). KANIT (418-002 debt'i): canonical
`decideWorkerLiveness` (src/orchestra/heartbeat-monitor.ts) hazır+testli AMA iki GERÇEK kill-yolu
eski-yolda: (a) src/monitor/auditor.ts::isWorkerStale mtime-PRIMARY, (b) src/orchestra/
sprint-checkpoint.ts::isStaleHeartbeat/detectStaleWorkers dosya-içi hb.timestamp. GÖREV: (1) iki
yol da decideWorkerLiveness'ı çağırır (üçüncü-kopya YASAK); host-sinyal girdileri mevcut
kayıtlardan; sağlanamayan ortamda DÜRÜST-fallback (eski mtime-davranışı + karar-log'unda
'host-signal-unavailable'); (2) RED-first ×2 (auditor-yolu ve checkpoint-yolu ayrı): bayat-ts +
canlı-host fixture'ında bugün kill çıktığını kanıtla → GREEN; (3) BONUS (aynı modül):
heartbeat-monitor.ts'teki 3 spawnSync-probe async-spawn'a çevrilir (sanction geri-alınır —
scripts/spawnsync-baseline.json'a DOKUNMA, o CC-işi); (4) checkpoint-v2/550-normalize bölgeleri
byte-korunur. HIZLI ÇALIŞ: envanter-not kısa, koda erken gir.
### goNogo
- goCriteria: iki kill-yolu canonical-çağrılı (kopya-yok grep-kanıtı); 2× RED→GREEN; dürüst-fallback testli; spawnSync→async (modül-içi); korunan-bölgeler diff-kanıtlı; tests/orchestra+monitor yeşil.
- nogo: üçüncü karar-kopyası NO_GO; sessiz-fallback NO_GO.

## Task 2: DEP669A — non-major dependency-bump dilimi: fast-uri · hono · path-to-regexp · undici · ws (⏰2026-07-26)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: package.json, package-lock.json, scripts/audit-exceptions.json, docs/reference/dependencies.md, tests/release/dep-bump-audit.test.ts
- Scope: package.json, package-lock.json, scripts/, docs/reference/, tests/release/
- Dependencies: none
### Description
İZİN-NOTU: bu task lockfile-mutasyonuna AÇIKÇA yetkilidir (NPM-ADVISORY istisnası — Brain-onaylı;
yalnız listedeki paketler). KANIT (born-669 + scripts/audit-exceptions.json): 8 high-advisory
kısa-expiry istisnayla yaşıyor; ⏰2026-07-26'da CI bilinçli kırmızıya döner. BU DİLİM yalnız
NON-MAJOR bump'lar: fast-uri (GHSA-q3j6+v39h) · hono (GHSA-88fw) · path-to-regexp (GHSA-j3q9) ·
undici (GHSA-vxpw — discord.js'in gerektirdiği aralıkta kalınabiliyorsa; major gerekiyorsa ATLA +
notes'a) · ws (GHSA-96hv — direkt, minor/patch aralığında kalınabiliyorsa). nodemailer (semver-
MAJOR) KAPSAM-DIŞI — DEP669B'ye. GÖREV: (1) her paket için minimal-yeterli bump (`npm ls <pkg>`
zincir-envanteri notes'a; override/resolution gerekiyorsa package.json overrides bloğu — gerekçeli);
(2) bump SONRASI `node scripts/check-dependency-audit.mjs` → kapanan advisory'lerin İSTİSNALARI
audit-exceptions.json'dan SİLİNİR (kapanmayan kalır); (3) ADR-D-005: docs/reference/dependencies.md'ye
her bump satırı (paket, eski→yeni, advisory, gerekçe); (4) test: dep-bump-audit.test.ts —
audit-script'i gerçek-koşup 'silinen-istisnaların advisory'leri artık bulgu-listesinde YOK' pinler;
(5) BLAST: değişen paketleri kullanan aileler (hono→api/gateway testleri; ws→connectors;
path-to-regexp→api-routing; undici→connectors) + tests/api tests/connectors tam koşu — kırılan
varsa minimal-uyum fix'i (davranış-koruyucu) ya da o paketi GERİ AL + dürüst-not.
Smoke: node scripts/check-dependency-audit.mjs → kalan-istisna sayısı azaldı, exit 0
### goNogo
- goCriteria: non-major bump'lar uygulanmış + zincir-envanteri; kapanan istisnalar silinmiş (script-kanıt); dependencies.md satırları; blast-aileleri yeşil (ya da geri-alım+dürüst-not); nodemailer'a DOKUNULMAMIŞ.
- nogo: semver-major sızarsa NO_GO; istisna-silmeden 'kapandı' denirse NO_GO; blast koşulmadan DONE NO_GO.
