# DIRECTIVES — SPRINT-421: DEP669B NODEMAILER-MAJOR + TT555 TURN-ECONOMY-2

## Goal
born-669 son-dilimi (nodemailer semver-MAJOR ×2 advisory; ⏰2026-07-26) + TT555 turn-economy
(TRACE-treni P1; **model=opus** Alperen). SSOT: MASTER-PLAN 562 + 555; memory
project_trace_truth_train_2026_07_12.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik (tmpdir, async spawn, ≤16GB); 20dk-forensik-sınırı — envanter kısa, koda erken.

## Task 1: DEP669B — nodemailer 9.x semver-MAJOR bump (GHSA-rcmh + GHSA-p6gq; son 2 istisna)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: package.json, package-lock.json, scripts/audit-exceptions.json, docs/reference/dependencies.md, src/connectors/email-connector.ts, tests/connectors/email-nodemailer-major.test.ts
- Scope: package.json, package-lock.json, scripts/, docs/reference/, src/connectors/, tests/connectors/, tests/release/
- Dependencies: none
### Description
İZİN-NOTU: lockfile-mutasyonuna AÇIKÇA yetkilisin (yalnız nodemailer-zinciri). KANIT: kalan son
2 audit-istisnası nodemailer (direkt-bağımlılık; GHSA-rcmh addressparser-DoS + GHSA-p6gq
raw-option dosya-okuma/SSRF) — fix 9.0.3+ SEMVER-MAJOR. GÖREV: (1) nodemailer'ın gerçek
kullanım-yüzeyini envanterle (grep import/createTransport/sendMail — hangi dosyalar, hangi
API'ler; notes'a); (2) 9.x'e bump + MAJOR breaking-change'leri changelog'dan tara (Node-floor,
transport-API, TLS-default'ları) ve dokunan kullanım-noktalarını DAVRANIŞ-KORUYUCU uyarla;
(3) audit-exceptions.json'dan 2 nodemailer-istisnasını SİL + `node scripts/check-dependency-audit.mjs`
→ SIFIR-istisna PASS kanıtı; (4) dependencies.md major-bump satırı (ADR-D-005 rationale);
(5) test: email-yüzeyinin mevcut testleri + yeni major-uyum testi (transport-oluşturma +
send-yolu mock-SMTP'yle; gerçek-mail YOK); tests/connectors tamamı + smoke.
Smoke: node scripts/check-dependency-audit.mjs → 0 finding, 0 exception, PASS
### goNogo
- goCriteria: nodemailer 9.x + kullanım-envanteri + breaking-uyum davranış-koruyucu; istisnalar silinmiş + audit SIFIR-istisna PASS; dependencies.md satırı; tests/connectors yeşil.
- nogo: istisna silinmeden PASS iddiası NO_GO; kullanım-yüzeyi envantersiz bump NO_GO; başka paket lockfile'da oynarsa NO_GO.

## Task 2: TT555 — TURN-ECONOMY-2: pipe-exit-maskesi + verify_task tool + artifact-tekrarı + env-probe (veri-kanıtlı)
- Model: opus | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/agents/worker.ts, src/orchestra/prompt-god-template.ts, src/orchestra/worker-verify-tool.ts, tests/orchestra/turn-economy-2.test.ts
- Scope: src/agents/, src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (trace-audit 555; 413-002/003 verisi: sürenin %96.9'u API; cache zaten %96-98 — çarpan
TURN-SAYISI): dört veri-kanıtlı israf-sınıfı: (a) `2>&1 | tail` EXIT-CODE-MASKESİ — başarısız
test is_error:false görünüyor (413-001/003 canlı; worker bir tur daha yakıyor); (b) verify-döngüsü
platform-bağımlı elle-komutlarla (mükerrer tur); (c) aynı-sprint'te mükerrer npm-pack/artifact
(413-002/003); (d) env-probe yokluğu (python3-yok→Node-tekrarı sınıfı). GÖREV (worker-PROMPT +
tool-yüzeyi katmanı — scheduler'a DOKUNMA): (1) worker god-prompt'una PIPE-EXIT kuralı bölümü
(≤400-char pin'li; `${PIPESTATUS[0]}`/ayrı-echo deseni + tail-maskesinin yasaklanması) — K1
turn-economy bölümünün yanına, boyut-pin testine uy; (2) YENİ worker-verify-tool.ts: platform-nötr
`verify_task` yardımcı-aracı (lint+test komutlarını proje-config'ten çözer, exit-code'ları
AYRI-AYRI dürüst döndürür — tek turda verify; worker.ts tool-kaydına ekle; DIKKAT: 29-tool
yüzey-pinleri varsa say-güncelle); (3) sprint-başı ENV-PROBE bloğu: worker-prompt'a mevcut
araç-envanteri (python3/docker/rg var-yok) tek-satır enjekte — deneme-yanılma turu ölür; (4)
artifact-tekrarı için prompt-kuralı: 'pack/build çıktısı .tasks/artifacts/<sprint>/ altında varsa
YENİDEN üretme' (mekanizma değil kural — mekanizma born-660-devamına); (5) RED-first: (a)-maskesi
için tail'li-komut fixture'ında is_error:false kanıtı → GREEN: verify_task ile dürüst-fail.
Prompt-değişiklikleri boyut-pin testleriyle uyumlu (grep mevcut pin'leri).
### goNogo
- goCriteria: pipe-exit kuralı + boyut-pin uyumu; verify_task tool (ayrı-exit-code'lu, platform-nötr) kayıtlı + tool-sayı-pinleri senkron; env-probe enjekte testli; RED(maske)→GREEN(dürüst-fail); tests/orchestra+agents yeşil.
- nogo: scheduler/closure'lara dokunulursa NO_GO; tool-sayı-pini kırık kalırsa NO_GO; prompt-pin aşılırsa NO_GO.
