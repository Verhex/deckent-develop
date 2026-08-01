# Doküman Temizlik Karar-Tablosu — 2026-07-21 (canlı defter)

> **Amaç:** Repo-temizlik programının doküman-ayağı: dosya dosya **SİL / REVİZE / YENİDEN-YAZ / TUT**
> kararları. Süreç soru-cevap; analiz CC'den, **karar Alperen'den** (Karar sütunu ⬜ = beklemede).
> Kayıt yeri bu klasör (`docs/alperen-analysis/`); MASTER-PLAN'a satır açılmaz (Alperen kararı, 2026-07-21).
> Kardeş-analiz: `2026-07-21-routing-v3-durum-ve-temizlik-analizi.md` (kod-tarafı, Alan-1 ✅).
>
> **Yöntem (her dosya için):** inbound-referans taraması (kod+doc+script, markdown-link vs düz-metin ayrımı) ·
> `lint:link` CI-gate etkisi · git-tarihçe · içerik-absorpsiyon durumu (bulgular başka yere geçti mi?) ·
> silme-zarar hükmü. **Yalnız analiz — silme her zaman ayrı Alperen-onayı.**

---

## KARAR TABLOSU (büyüyen)

| # | Dosya | Referans-durumu | Silme-zararı | Öneri (CC) | Karar (Alperen) |
|---|---|---|---|---|---|
| 1 | `PROMPT-MECHANICS-ANALYSIS.md` (kök) | 1 düz-metin anış (`.analysis/prompt-mechanism-revamp-plan.md` Kaynak-1); **markdown-link hedefi DEĞİL → lint:link kırılmaz**; kod/script/CI referansı SIFIR | **DÜŞÜK** (teknik sıfır-kırılma; tarihî kanıt-değeri kaybı var) | **TUT-ARŞİVDE** (silme kazanımı ~0; göçte zaten taşınmaz) | ✅ **SİL** (Alperen 2026-07-21 — `2026-07-21-proje-kok-karar.md`) |
| 2 | `MIGRATION-PLAN.md` (kök) | Inbound referans **SIFIR** (link/metin hiçbir yerde) | **YÜKSEK (göç-öncesi)** — 5 mühürlü göç-kararının + F0-F5 fazlarının TEK kaydı; göç 2026-07-26 Pazar | **KESİN TUT** (en az göç bitene kadar; sonrası arşiv-kaydı) | ✅ TUT (Alperen 2026-07-21) |
| 3 | Kök config kümesi: `package.json` · `package-lock.json` · `tsconfig.json` · `vitest.config.ts` · `vitest.dashboard.config.ts` · `vitest.desktop.config.ts` · `Dockerfile` · `Dockerfile.worker` · `docker-compose.yml` · `LICENSE` | Build/test/publish zinciri doğrudan tüketiyor (npm ci/build/vitest/CI/validate:publish) | **KRİTİK** — silinirse build/CI anında kırılır | **TUT** (tartışmasız); göçte "Kök-config'ler" kümesi olarak taşınır (MIGRATION-PLAN §Taşınan) | ✅ TUT (2026-07-21) |
| 4 | `.agents/` dizini (kök, BOŞ) | Referans **SIFIR**: kod+test+doc+script'te yok · git-pickaxe tüm tarihçede yok · gitignore/npmignore'da yok · hiçbir araç-config'i (.codex/.cursor/.gemini/.claude) işaret etmiyor | **SIFIR** — untracked+boş (git zaten görmüyor), build/CI/araç etkilenmez | **SİL-GÜVENLİ** (Alperen niyeti: SİL) | ✅ **SİL** (Alperen 2026-07-21 karar-turu; aksiyon temizlik-gününde) |
| 5 | `.analysis/` (52 girdi, 55 tracked; 4 alt-dizin) — **xverify hariç ARŞİV** (Alperen niyeti) | Canlı tüketiciler VAR: kod-yorumu spec-ref ×15 (routing/* "Source of truth") · **15 gerçek markdown-link** (`docs/adr/archive/adr-g-006-amendment-v3` → routing-v3-* dosyaları; docs/adr lint:link'te TARANIYOR) · 2 manuel script (`generate-analysis-inventory.mjs`, `measure-prompt-cost.mjs`) · MASTER-PLAN 14 düz-metin anışı · `test:ci-sim` `.analysis`'i topluca gizliyor | **ORTA — refleks yapılmazsa `lint:link` CI KIRILIR** (adr-g-006 15 linki); refleks-listesiyle sıfıra iner | **ARŞİVLENEBİLİR → `.analysis/archive/`** (dizin-İÇİ arşiv; ci-sim+görece-link semantiği korunur) + aşağıdaki 4-istisna ve refleks-listesi | ✅ **ARŞİV onaylandı** (Alperen 2026-07-21 karar-turu — A1-A5 iş-planı kabul; `born-backlog.json` kapsam-DIŞI/yerinde kalır; aksiyon temizlik-gününde) |
| 6 | `.brain/analysis/` (2 dosya, 2026-07-20: durum-analizi 93KB + master-plan-satir-taslagi 17KB; untracked) | Dış referans **SIFIR** (tek iç-ref: taslak→durum-analizi, birlikte ölür); `ci-sim-snapshot.mjs` PROTECTED_PATHS listesinde anılıyor (gizleme-listesi — dizin yoksa no-op, kırılmaz) | **SIFIR (teknik)** — not: dosyalar DÜN yazılmış (Codex-oturumu durum-analizi) | SİL-güvenli | ✅ **SİL** (Alperen 2026-07-21 — aksiyon göç-temizlik gününde) |
| 7 | `.brain/` geri kalanı (memory.db · exports/ · sprints/ · archive/ · ERRORS.md · heartbeat-log.md) | Aşağıda §7 işlevsel analiz (ERRORS/heartbeat) | — | **TUT** — "nizami ve ideal" (Alperen); memory.db zaten yasa-korumalı | ✅ TUT (Alperen 2026-07-21) |
| 8 | `.superpowers/` (kök dot-dizin; tek içerik `sdd/` — 2026-06-24..26 SDD-koşusu artıkları: 6 task-brief+report, 7 review-diff, progress) | `.superpowers` (NOKTALI) referansı repo-genelinde **SIFIR** (kod+doc+config+CI); untracked + git-tarihçesinde hiç olmamış; anlattığı iş (social-identity-rbac) **main'e merge edilmiş** (`e002d1dd` ancestor ✓, `src/connectors/identity/*` canlı), worktree+branch çoktan gitmiş | **SIFIR** — süreç-artığı; işin kendisi git-tarihçesinde | **SİL-GÜVENLİ** — ⚠️ `docs/superpowers/` ile KARIŞTIRMA: o AYRI ve CANLI (tracked spec-kütüphanesi; src yorumları oraya işaret ediyor — `work-model.ts:6`, `cache-adapter.ts:2`), silinecek olan yalnız kök `.superpowers/` | ✅ **SİL** (Alperen 2026-07-21 — "kesin kararım sil"; aksiyon temizlik-gününde) |
| 9a | `.test-e2e-chain-79040/` + `.test-e2e-sprint-1087287/` (untracked; `.gitignore:216` `.test-e2e-*/` kapsamında) | Sızıntı-artığı: `tests/e2e/chain-safety.e2e.test.ts:93` + `sprint-lifecycle.test.ts:17` her koşuda `.test-e2e-<tip>-<pid>` yaratır; bu ikisi 2026-07-08 koşularının temizlenmemiş kalıntısı (sonraki koşular YENİ pid-dizini açar, eskiyi hiç okumaz) | **SIFIR** | **SİL-GÜVENLİ** + born-adayı: bu 2 test hermeticity-kuralını ihlal ediyor (tmpdir yerine proje-köküne yazıyor — sızıntının kök-nedeni; `.gitignore` girişi yara-bandı) | ✅ **SİL** (Alperen 2026-07-21; aksiyon temizlik-gününde) |
| 9b | `.test/` (TRACKED — 3 dosya: shared.txt · sleep-result.txt · sprint-168-smoke-directives.md; commit `b5a0acbd` sprint-168-closure, Mayıs-Haziran artığı) | Referans **SIFIR** — kod/test/script'te hiçbir okuma yok (kod'daki `'.test'` eşleşmeleri BARE_TOKEN_BLOCKLIST'teki dosya-UZANTI token'ı, dizin değil). MIGRATION-PLAN F1 "test-bağımlılığı İHTİMALİNE karşı manifest'e eklenir" demişti — ihtimal bu analizle ÇÜRÜDÜ (bağımlılık yok) | **SIFIR (işlevsel)** — tracked olduğundan silme = `git rm` + commit; içerik git-tarihçesinde kalır | **SİL-GÜVENLİ** + MIGRATION-PLAN F1 ".test manifest'e eklenir" notu artık geçersiz (silinirse F1-notu da düşürülmeli) | ✅ **SİL** (Alperen 2026-07-21; `git rm` + F1-notu düşürme aynı dilimde; aksiyon temizlik-gününde) |
| 10a | `examples/quickstart/` (3 dosya, TRACKED — examples'ın TEK tracked içeriği) | OSS-kullanıcı ilk-temas örneği; sprint-171/172 audit'i C-44 fix'iyle bakımı yapılmış (`workspace:*`→`^1.0.0-beta.1`); `lint-links.mjs:313` `examples/**`'ı script-içi hardcode ignore eder | Ürün-yüzü kaybı (Kanun-1) | **TUT** — küçük, ürün-yüzlü, göçte taşınan | ✅ TUT (Alperen 2026-07-21) |
| 10b | `examples/voice-wrapper/` (UNTRACKED — Alperen-kararıyla untrack `5d31bbdb` + `.gitignore:232`; 71MB — 70MB'ı `.audio-tmp/` GPU-cache) | **Okuyan:** docs/voice.md (tracked, user-facing) 9+ referansla kontrat-referans-uygulaması ilan ediyor (GitHub-URL'le ürün-repoya işaret — external-link, lint doğrulamaz); deckent KODU okumaz (local-voice.ts config-driven stt_url/tts_url, testler localhost:9000 mock). **Yazan:** Python-runtime (cache'ler) + Alperen (voice-ref klipleri, pronunciation.json küratörlüğü) | Dizin silinirse: Voice HTTP Contract'ın TEK çalışır referans-uygulaması + docs/voice.md'nin işaret ettiği her şey gider | **TUT (dizin)** + **SİL-ADAYI (iç-hijyen):** `.audio-tmp/` 70MB + `__pycache__/` 72K (yeniden-üretilebilir cache — kazanım ~70MB); `voice-ref/` 360K kişisel-klip → Alperen-kararı | ✅ **dizin TUT · `.audio-tmp/`+`__pycache__/` SİL · `voice-ref/` KALIR** (Alperen 2026-07-21; aksiyon temizlik-gününde) |
| 11 | `docs/adr/` (47 ADR + AUTOGEN README + `archive/` 4) | SSOT-zinciri canlı: `.brain/memory.db` → export (07-19 auto-regen) → md'ler; `lint:adr` YEŞİL (47/47, canlı koşuldu); README `docs:ref:check` gate'li; lint:link taramasında | Silme/temizlik GÜNDEMDE DEĞİL — dizin sağlıklı | **TUT — GÜNCEL ✓ TUTARLI ✓** (kanıtlar §11); 2 yan-not: md↔DB içerik-senkron gate'i yok (born-adayı) + MIGRATION-PLAN "41 md" sayımı bayat (bugün 47) | ✅ (analiz-sonucu; karar gerekmiyor) |
| 12 | `docs/analysis/` (87 dosya, HEPSİ tracked, 1.4MB) — Alperen niyeti: SİL, ref varsa ARŞİV | **REF VAR (3 sınıf):** (1) `ground-truth-snapshot-2026-07-06` = **GÖÇÜN doğrulama-defteri** (MIGRATION-PLAN:4 + MASTER-PLAN 488) (2) kod-yorumu spec-ref ×10 (`scheduler-unify-design` → config-types/scheduler-reducer; `term-flow-unify-design` → run-flow-*; 527 SCHED-treni HÂLÂ AÇIK dilim-8) (3) runtime rank-map literal'i `doc-tracking/types.ts:58` `'docs/analysis/**': 90`. lint:link: dizin kaynak-ignore (satır 34), tek dış-link GitHub-URL=external → **link-refleksi GEREKMİYOR** | Tam-silme: göç-defteri + açık-işlerin (490/527/583/SURF) tasarım-SSOT'ları gider → **YÜKSEK**; tarihî-kısım için SIFIR | **AYRIŞTIRILMIŞ-ARŞİV** (Alperen-kuralına uygun: ref-var→arşiv): ~15 canlı-refli çekirdek YERİNDE + ~72 tarihî → `docs/analysis/archive/` (doc-tracking `**/archive/**` zaten ignore — uyumlu); tam-silme ancak göç-SONRASI gündem | ✅ **AYRIŞTIRILMIŞ-ARŞİV onaylandı** (Alperen 2026-07-21; aksiyon temizlik-gününde — refleks gerekmez, `git mv` yeter) |
| 13 | `docs/architecture/` (8 tracked, 220K: 6 md + `adr/` alt-dizin ×2) | **Silinemez-refli:** README.md+README-TR.md ×4 gerçek-link (TR yerel-yol → lint:link kırar) · docs/guide ×2 · `docs-structure.test.ts` dizin+≥1-md şartı (silinirse TEST kırmızı) · doc-tracking rank-5 (yüksek-önem) · VitePress yayın-DIŞI (GitHub-blob'dan okunuyor) | Silme = README-linkleri + test kırılır | **TUT** ama **İÇERİK-BAYAT** (V2-çağını anlatıyor: routeTaskV2/routing-engine ×9, V3 anışı SIFIR; 06-14/06-30 donmuş) → yeniden-yazım göç-F5 + çok-dilli program kapsamında; `adr/` alt-dizini YAPISAL-TUTARSIZLIK: eski-ADR-010 (D-005'e EMİLMİŞ, crosswalk kanıtlı) + adr-090 kaçak-kopya → `docs/adr/archive/`e taşı-adayı | ✅ **TUT + 2 kaçak-ADR `docs/adr/archive/`e taşınacak** (Alperen 2026-07-21 karar-turu; aksiyon temizlik-gününde) |
| 14 | **`docs/` → `docs1/` yeniden-adlandırma kararı** (Alperen 2026-07-21: docs sıfırdan yazılacak, eski ağaç parkedilecek) | Tam etki-envanteri + zorunlu-yol sözleşmesi ayrı dokümanda: **`2026-07-21-docs1-zorunlu-yol-sozlesmesi.md`** — 718 tracked dosya; ~37 gerçek-repo-okuyan test + release-gate script'leri + sprint-finalizer makine-yazarları + DECKENT.md @-import + MASTER-PLAN-SSOT yolu etkileniyor | Körce rename = CI-bloke + içerik-bölünmesi (finalizer yeni docs/ yaratır) | **"Çekirdek-değişimi" önerisi:** docs1=arşiv + AYNI dilimde yeni docs/ yalnız zorunlu-çekirdek iskeletiyle kurulur; 3 karar-noktası (MASTER-PLAN yolu · tests/docs kaderi · makine-yazarlar) sözleşme-dokümanında | ✅ **K1=c · K2=a · K3=a — ÜÇÜ DE KESİN** (K1/K3: Alperen 2026-07-21; K2: Alperen 2026-07-22, tests-analizi girdisiyle — docs-okuyan 26 test tracked-çekirdekle yeşil kalır). Çekirdek-değişimi paketi tam-onaylı; yalnız-dokümantasyon, rename-dilimi sonra |
| 15 | `.deckent/` dizini (306MB, ~51 kök-girdi) | Tam harita ayrı dokümanda: **`2026-07-21-deckent-dizini-analiz.md`** — girdi başına amaç+YAZAN+OKUYAN+track+canlılık; 3 orphan (DIRECTIVES-features.md · run-gate.json · recovery-snapshots yazıcısız) + 113 kazara-tracked runtime-dosyası + 4 rotasyonsuz log | Kör-silme YOK — canlı state; adaylar alt-küme bazında | **T1-T12 aday-listesi** dokümanın §5'inde (en büyük: traces-extracted 53.8M · archive eski-sprint'ler ~50M · resource-log 21M · autonomous-events 19M) + git-hijyen dilimi (T9) + rotasyon born-adayı (T10) | ✅ **T-kararları verildi** (Alperen 2026-07-21 karar-turu): T1 **SİL** · T2 **buda** — pencere-sorusu cevabı: `sprint_file_retention.keep_last_n` config-default **10** (`config.ts:1531`) VAR ama yalnız staging→arşiv taşımasını yönetir, `archive/sprints/`in kendisini budayan mekanizma YOK → arşiv-budama yeni-policy (T10-born ailesine) · T3 OK · T4 **SİL** · T5-T12 hepsi OK; **yalnız-dokümantasyon, iş sonra** |
| 16 | `deckent-hub/` (408K, 66 tracked; 20 topluluk-skill + `hub-validate.mjs` + kendi CI-workflow'u) | **Runtime-tüketici SIFIR** (src/scripts/tests grep=0 — skill-pool yalnız `.deckent/skills`+builtins okur); referanslar plan-düzeyi: MASTER-PLAN:281 **HUB-P0 canlı ⬜** · MIGRATION-PLAN "taşınır" · public-repo-manifest "Include" · sprint-171 audit CRITICAL (inline-vs-ayrı-repo drift; Ed25519 imzalar placeholder `awaiting-t149016-keygen`; manifest'ler public-şemaya göçmemiş) | Runtime SIFIR; plan-zararı ORTA (HUB-P0 öksüz kalır, README install-örneği kırılır) | **TUT** — PRE-ALPHA ayrı-repo taslağı (`VerhexIO/deckent-hub`), ölü değil runtime-inert; kaderi göç+repo-split kararına bağlı (audit R3: submodule-leştir); `.deckent/skills` ile isim-çakışması SIFIR | ✅ **TUT** (Alperen 2026-07-21 karar-turu; kaderi repo-split'te) |
| 17 | Araç-config dörtlüsü: `.claude/` · `.codex/` · `.gemini/` · `.cursor/` | Üretici **deckent'in kendisi**: `rule-generator.ts:136/154/172/204` (rules) + `sync.ts` (@DECKENT.md import); tüketici dış-CLI'lar (deckent-runtime proje-içi kopyaları OKUMAZ — HOME-eşleniklerini okur). **4 senkron-bulgu:** (1) ⚠️ `.gemini/rules/karpathy-discipline.md` BAYAT-KRİTİK — emekli ADR-010 "tek-runtime-dependency" dogmasını hâlâ dayatıyor (07-01 `9791edf1` ADR-D-005 regen'ini atlamış) (2) `.codex/skills/ui-ux-pro-max` truncated-mirror (372 vs 669 satır) (3) kök `AGENTS.md`+`GEMINI.md` gövdesi CLAUDE.md'den DRIFT (07-07'de donmuş; 11-kanun/model-ataması-CC-yapmaz notları yok — sync.ts yalnız @import iliştirir, gövde-propagate ETMEZ) (4) `.cursor` eksik-küme: karpathy.mdc üretilmiyor + `init-steps.ts:159`'un beklediği mcp.json hiç yok + rules dir-vs-file gerilimi (`sync.ts:238`) + insan-kullanım kanıtı yok. +2 leftover: `.claude/worktrees/` (boş) · `.codex/tmp/arg0/` (06-01) | Silme gündem-dışı — canlı üretim-hedefi | **TUT + SENKRON-DALGASI adayı** (öncelik sırasıyla): gemini-karpathy regen → AGENTS/GEMINI gövde-resync (veya sync.ts'e gövde-propagate) → codex skill-mirror fix → cursor kararı (tamamla YA DA resmen kapsam-dışı ilan) → 2 leftover sil | ✅ **TUT + senkron-dalgası SEÇMELİ-onay** (Alperen 2026-07-21) + **CURSOR = KAPSAM-DIŞI** (Alperen 2026-07-22 — Cursor-desteği resmen kapsam-dışı ilan; iş-kalemleri sonraya: `rule-generator.ts:204` cursor-üretimi durdurulur · `.cursor/` dizini SİL-aday olur · `init-steps.ts:159` mcp.json-beklentisi düşürülür) |
| 18 | `.deck` (kök **DOSYA** — dizin sanılıyordu; 698B, `-rw-------`) | **Canlı secrets SSOT** (ADR-014 .env-eşdeğeri: TELEGRAM/SMTP/GOOGLE/OPENROUTER token'ları). Okuyan: `deck-file.ts:94` + `provider.ts:1346` · `deck-broker.ts:98` · `erp-connector.ts:47` · `openrouter.ts:185` · `deck-interpolation.ts:11`; gitignore:146; `deck-file.ts:308` tracked-olmadığını kendisi doğruluyor | **KRİTİK — silinirse tüm connector/provider auth kırılır** | **CANLI-DOKUNMA**; ⚠️ bağlı güvenlik-bulgusu #21(a)'da (`.dockerignore` bake-in) | ✅ (analiz-sonucu; karar gerekmiyor) |
| 19 | `.tmp-test/` (32K; `zero-hardcode/` 6 fixture-.ts, mtime 07-20 tek-koşu) | Yaratıcı: `tests/scripts/zero-hardcode-audit.test.ts:14-25` — projectRoot'a `writeFileSync`, **cleanup YOK** → her koşuda yeniden doğar; gitignore:215; canlı-fixture DEĞİL (içerik test-içi inline üretiliyor) | SIFIR (yeniden-üretilir) | **SİL-güvenli** + **born-adayı:** test hermeticity ihlali — tmpdir'e taşınmalı (#9a e2e-sızıntısıyla aynı aile; silme kalıcı çözüm değil, test düzelmeden dizin geri gelir) | ✅ **SİL** (Alperen 2026-07-21 karar-turu; born-aday kayıtlı; aksiyon temizlik-gününde) |
| 20 | Artık/üretilen grubu: `.git-guard-bin/` (boş, **root-owned**) · `.playwright-mcp/` (216K) · `coverage/` (124K) · `dist/` (19M) | git-guard-bin = Docker git-guard shim mount-point kalıntısı (`git-worker-guard.ts:210` container-mount; gitignore'da YOK; silme sudo ister) · playwright-mcp = MCP-plugin oturum-artığı (ignore:48) · coverage/dist = üretilen-çıktı (ignore:3/:2) | SIFIR (hepsi yeniden-üretilir; dist sonrası `npm run build` gerekir) | **SİL-güvenli (4'ü de)** + yan-not: `.git-guard-bin` gitignore'a eklenebilir | ✅ **SİL (4'ü de)** (Alperen 2026-07-21 karar-turu; aksiyon temizlik-gününde) |
| 21 | Dot-dosya beşlisi: `.dockerignore` · `.npmignore` · `.npmrc` · `.pre-commit-config.yaml` · `.secrets-baseline` | Tüketiciler: docker build/compose · npm pack (asıl kapı `package.json files`-allowlist) · npm (`ignore-scripts=true` koruması) · pre-commit (**KURULU DEĞİL** — `.git/hooks`'ta yok + yanlış dosya-adına işaret: `.secrets.baseline` ≠ `.secrets-baseline`; asıl secret-scan = `secret-scan.yml` + `secret-baseline.mjs`) · `.secrets-baseline` CI-canlı (07-10) | `.dockerignore`/`.npmrc`/`.secrets-baseline` silinirse güvenlik-kapıları düşer | 3 CANLI-dokunma + 2 KARAR: **(a) ⚠️ GÜVENLİK: `.dockerignore`'a `.deck` EKLENMELİ** — kök `Dockerfile:19 COPY . .` + compose `build: .` canlı secrets'ı image-layer'a bake ediyor (`.env` korunuyor, `.deck` korunmuyor; worker-Dockerfile'da COPY yok = güvenli) (b) `.pre-commit-config.yaml` ölü-config: ya kur+ad-düzelt ya sil | ✅ **(a) ONAY — `.dockerignore`'a `.deck` eklenecek · (b) `.pre-commit-config.yaml` SİL** (Alperen 2026-07-21 karar-turu; yalnız-dokümantasyon, iş sonra) |
| 22 | `assets/` (8K; tek dosya `Dockerfile.worker` — kök-kopyayla bayt-özdeş) | Canonical shipped-copy: `image.ts:97-99` önce `assets/` dener; `copy-assets.mjs` dist'e kopyalar; `package.json files` yayınlar. Kök-kopya da CANLI (worker-image-check.ts:157 · doctor-checks.ts:232 · init-steps.ts:237 kullanıcıya kök-yolu gösterir) | KRİTİK (build/publish zinciri) | **TUT (iki kopya da)** + yan-not: bayt-özdeş çift = sync-riski (birini güncelleyip diğerini unutma; tek-kaynak+build-kopyalama born-adayı) | ✅ (analiz-sonucu; karar gerekmiyor) |
| 23 | `alp-discipline/` (164K, **UNTRACKED + not-ignored**; 12 dosya + translations/tr + kendi `.deckent/`i) | Canonical karar-çapası: memory kanun-13 SSOT=`ESSENCE.md` · MASTER-PLAN:128 görev-592 "kendi repo'suna bölünecek dünya-hediyesi" · .analysis + docs/analysis ref'leri | İçerik-kaybı YÜKSEK (SSOT) — **ve untracked olduğundan git ONU KORUMUYOR** (tek kopya diskte) | **TUT + 2 karar-noktası:** (a) untracked-riski — repo-split'e kadar track edilsin mi? (b) ⚠️ `alp-discipline/.deckent/` = ana-repo iç core-memory'sinin KOPYASI sızmış (law_*/MEMORY.md) → public-split ÖNCESİ bu alt-dizin temizlenmeli | ✅ **TUT + TRACK EDİLDİ** (Alperen 2026-07-22: "commitleyelim" — repoya alındı, **iç-`.deckent/` kopyası HARİÇ** [sızıntı-bulgusu gereği staging-dışı bırakıldı]; kalan ⬜ yalnız iç-`.deckent` temizlik-zamanı — public-split öncesi) |
| 24 | `.github/` (7 workflow + template'ler + CODEOWNERS/FUNDING/dependabot) | Canlı CI-merkezi; **ölü-script SIFIR** (tüm npm-script/dosya hedefleri mevcut, el-doğrulamalı); actions-pin stratejisi kasıtlı (release/publish=SHA-pin, CI=floating); `schedule`/`workflow_dispatch` HİÇ YOK (release yalnız tag-push — manuel yeniden-koşu yolu yok). Bulgular: **çift-template ×3** — `PULL_REQUEST_TEMPLATE.md`(05-23, detaylı) + `pull_request_template.md`(03-19, case-collision) · `bug.md`+`bug_report.md` · `feature.md`+`feature_request.md` (issue-chooser'da mükerrer; eski kopyalar 03-19; `bug_report.md:30` Node "18.20/20.12" devrinden — CI artık 24/26) · `secret-scan.yml:5,7` ölü `master`-trigger (origin'de master yok) · `docs.yml` PR path-filter asimetrisi | Template-temizliği SIFIR-risk; workflow'lara dokunulmaz | **TUT (dizin)** + SİL-aday 3 bayat template-kopyası (`pull_request_template.md` · `bug_report.md` · `feature_request.md`) + mikro-fix adayları (master-trigger, path-asimetri) | ✅ **CC-önerisi kabul — 3 template-kopyası SİL** (Alperen 2026-07-21 karar-turu; aksiyon temizlik-gününde) |
| 25 | `.tasks/` + `.locks/` (koruma-kurallı — `rm .tasks/*` YASAK) | `.locks/` **BOŞ = temiz** (stale-lock yok). `.tasks/`: **canary-budget-001 CANLI docker-koşusu** (.log gerçek-zaman büyüyor; hb: FAILED/exit-137-OOM → finalize/re-run döngüsünde — **DOKUNULMAZ**) + `.deck-shadow` canlı mount-marker (`spawn-backend-docker.ts:1420`) + `archive/sprint-451..455` retention-penceresi(5) içinde. **Retention kör-noktası — 3 sınıf birikmiş artık:** (A) `archive/cleanup-*` **11 dizin** (Jun-27'den; `cleanTasksArchive` yalnız `sprint-\d+` regex'i eşler → bunlar ASLA budanmıyor, `sprint-docs-updater.ts:591`) (B) `.patch`×2 + top-level `.md`×2 — hiçbir silme-uzantı-listesinde yok (`TASK_FILE_EXTENSIONS` constants.ts:103) → kalıcı-orphan (C) isimli-task (numarasız) **14 `.plan`** (`task-post455-repair.plan` tek başına 49KB) — cleanup numarasız iş için hiç koşulmamış; orphan-cleaner numerik-ID gate'li | Yanlış-silme canlı-koşuyu öldürür — aksiyon yalnız Alperen-onaylı | A+B+C temizlik-aday + **born-adayı: retention kapsam-genişletme** (cleanup-* dizinleri · .patch/.md uzantıları · isimli-task yolu) | ✅ **ŞİMDİLİK DOKUNMA** (Alperen 2026-07-21 karar-turu — canlı canary; A/B/C temizliği + retention-born ertelendi) |
| 26 | Kök MD 12'lisi — tek-tek güncellik-turu (blanket-TUT zaten kararlı) | **EN CİDDİ:** README + README-TR + IDENTITY.md AUTOGEN-blokları drift — `docs:stats:check` **BUGÜN FAIL 3/3** ("17 built-in agents"→gerçek **21**; badge `sprints-406+`→gerçek **≥454**) → `npm run release` 1. adımda patlar; bu gate hiçbir CI-workflow'unda YOK → CI yeşilken release-günü patlar (**süreç-boşluğu born-adayı**). Orta/küçük: **CONTRIBUTING.md hâlâ emekli ADR-010 "single runtime dependency" anlatıyor** (D-005'e emildi — #17 gemini-karpathy bulgusuyla aynı aile) · DECKENT.md iç-çelişki (":27 21 agents" vs ":449 toplam 20") · "14 models" vs kök-CHANGELOG "13" · README prose "31 skills" vs canlı 30 (builtins-baseline kaynak-farkı, grandfathered). Temiz: CLAUDE.md (kırık @-import SIFIR) · DIRECTIVES.md (canlı, set_directives yazıyor) · **kök CHANGELOG.md = canonical, docs/CHANGELOG.md'den AYRI — duplicate DEĞİL** (`release.yml:204` yalnız kökü okur; `release-prepare.mjs` köke yazar; docs/-kopyası finalizer'ın makine-arşivi) · SECURITY/CoC/CONTRIBUTING-komutlar/CROSS-PLATFORM güncel | — | **TUT (12/12)** + düzeltme-adayları: `npm run docs:stats` regen · CONTRIBUTING ADR-010→D-005 · DECKENT 20/21 · stats-gate'in CI'ya bağlanma kararı | ✅ **CC-önerisi kabul** (Alperen 2026-07-21 karar-turu — düzeltme-paketi ONAY + stats-gate CI'ya bağlanacak; yalnız-dokümantasyon, iş sonra) |
| 27 | docs/ kalan-öğe **istisna-triyajı** (docs1-#14 tamamlayıcısı) | **3 SERT-İSTİSNA** (çekirdek-taşımanın dokunmadığı dosyaları kırar): **`audits/`** — `sprint-file-retention.ts:202` **RUNTIME-YAZMA-HEDEFİ** + `model-tier-guard.ts:112` + `authority-enforcer.ts:188,223` sınıflama-literal'leri · **`benchmark/`** — `tests/docs/memory-v2-benchmark.test.ts:5,8` gerçek dosya-okuma · **`assets/logo.png`** — `README.md:2` main-pinned mutlak-URL + `readme.test.ts:42` assertion (taşıma = logo-404 + test-kırmızı). **2 ride-along:** `launch/` + `DOC-POLICY.md` (rankMap/EXCLUDE literal-dosyaları çekirdek-taşımada ZATEN elden geçiyor). **Sözleşme-boşluğu kapatıldı:** taşıma 3 KOD-dosyası editi içeriyor (`doc-tracking/types.ts:54-59` rankMap · `sync-to-product.mjs:34-40` EXCLUDE · `docs.yml:55-64` working-dir) → sözleşmeye §6-eki + §1'e `docs/audits/` satırı yazıldı. PARK-OK: design · features · cookbook · comparison · governance · security(fiilen boş) · templates · `guides/`(stray-singleton — `guide/`ın duplicate'i DEĞİL) · voice.md(tek-yön outbound-köprü) · worker-guide.md(managed olan `.deckent/workspace` kopyası, bu değil) · glossary · adr-index · LIVE-PROOF. **ARTIK:** `docs/node_modules/` (untracked, 82 dizin) + audits'in gitignore'lu 298 üretilmiş-raporu | İstisnalar çözülmeden park = runtime-yazma kaçağı + test-kırmızı + logo-404 | Sözleşmeye işlendi (`2026-07-21-docs1-zorunlu-yol-sozlesmesi.md` §1+§6); K1-K3 kararıyla birlikte değerlendirilir | ✅ (analiz-sonucu) |
| 28 | `tests/` (2304 dosya, ~530K satır, 26MB, 42 üst-dizin) | Tam analiz ayrı dokümanda: **`2026-07-21-tests-analiz.md`** — wiring temiz (koşulmayan test YOK; tek orphan `hot-paths.bench.ts`); bayatlık korkulandan temiz (V2-artığı SIFIR — 61 testiyle birlikte silinmiş, fixture-şişkinlik YOK). **ANA BULGU: 25 test proje-köküne YAZIYOR** (bilinen 3 + 22 yeni) ve 3-katmanlı boşluk nedeniyle hiçbir gate yakalamıyor (ci-sim worktree-cwd ile MASKELER · hermeticity-lint yalnız okuma tarar · gitignore 4-desen yara-bandı). Ek: spawnSync-ratchet src-only — 23 test-dosyası kapsam-dışı kullanıyor · 46 kalıcı-skip (18'i terk edilmiş README/CHANGELOG-coupling) · `PLATFORM.md` stale (+5 eksik Unix-only; enforcement-testi `platform-tags.test.ts` AYNI kör-noktada) · **K2-girdisi: docs-okuyan 26 test tamamı tracked → çekirdek-değişimiyle yeşil kalır, K2 fiilen (a)** | Kör-silme yok — süit sağlıklı; sızıntı+enforcement boşlukları asıl konu | Adaylar **TS1-TS8** (analiz-doc §9): TS1 tmpdir-göçü + yazma-lint'i (**büyük born; #19'un kök-nedeni**) · TS2-TS7 küçük hijyen · TS8 K2-kesinleştirme | ✅ **TS1-TS8 HEPSİ ONAY** (Alperen 2026-07-22; TS1 born-kaydı dahil; yalnız-dokümantasyon, iş sonra) |
| 29 | **Repo-DIŞI çevre** (GitHub-ayarları · npm · HOME ~2.28GB) | Tam analiz: **`2026-07-22-cevre-ve-kucukler-analizi.md` §A** — deckent-develop PUBLIC + **main korumasız** + Pages/vars kurulmamış (docs-deploy hep SKIP) + GitHub-release SIFIR + **npm'de paket hiç yayınlanmamış (E404)** + 🔴 **README 26 ölü-URL** (`VerhexIO/deckent` 404 — public vitrin bugün kırık-logo+25-ölü-link; ürün-repo göçüne ön-yazım) + HOME bayat-adayları (worktree-transcript'ler · 1008 security_warnings dosyası · gemini-tmp 47M) + 2 premise-düzeltme | README-vitrini her ziyaretçiye kırık görünüyor; branch-protection yokluğu public-repo riski | Karar-noktaları: (a) README ölü-URL — göçe-kadar-kabul (CC-önerisi) vs geçici-düzeltme (b) main branch-protection kurulumu (c) HOME bayat-aday temizliği | ✅ **29a KABUL** (göçe-kadar bilinçli-kabul; göç-diliminde repo-adıyla düzelir) · **29b KURMA** — branch-protection burada değil, ürün-repo **`deckent`te kurulacak** (göç-sonrası kalemi) · **29c ONAY** (HOME-temizliği temizlik-gününe) — Alperen 2026-07-22 |
| 30 | **Küçükler**: dal-hijyeni · gitignore-konsolidasyon · memory.db içerik-audit | Tam analiz: aynı doküman **§B** — lokal bayat-dallar (master · **"origin-archive" ADLI dal — adlandırma-kazası** · feat/docs-json · sp1-native · checkpoint/d16) + origin'de 5 bayat konu-dalı + `origin-archive` remote-kaldırma-adayı + **`.git` 485MB** (gc/repack mini-iş adayı) · gitignore ignore-inert kesin-liste **80 dosya = T9 kapsamı teyit** (yeni sürpriz yok; konsolidasyon TS1-SONRASI) · **memory.db TEMİZ** (ADR 47=47 birebir · açık-debt 0 · 4 boş-kayıt + 93 eski non-exempt memory + 1 glitch bakım-kalemi; ajanın "routeTaskV2 canlı" düzeltmesi el-teyitle ÇÜRÜTÜLDÜ — 10/10 referans yorum) | `goal/release-gate-truth` dalı DOKUNULMAZ (Codex-goal) | Adaylar: dal-temizliği listesi + gc/repack + memory 4-boş-kayıt + decay-gözden-geçirme; hepsi temizlik-günü/iş-günü | ✅ **30a ONAY** (5 lokal dal SİL; sp1/checkpoint merge-kontrollü; goal-dalı+main dokunulmaz) · **30b İKİSİ DE OK** (5 remote konu-dalı sil + `origin-archive` remote-kaydı kaldır; dependabot'a dokunma) · **30c ONAY** (gc/repack — önce rapor; temizlik-günü SONUNDA) · **30d ONAY** (4 boş-kayıt sil + sprint-448 glitch-fix; **decay-gözden-geçirme AYRI-İŞ** — MASTER-PLAN adayı) — Alperen 2026-07-22 |

---

## Analiz ayrıntıları

### 1. `PROMPT-MECHANICS-ANALYSIS.md` — 345 satır, kök, 2026-07-08 (`6eeaf417`)

**Ne:** 3-boyutlu mekanizma analizi — (A) worker-prompt token-ekonomisi (ölçülmüş: ~5.2-5.6K token,
%65'i sınıf-içi bayt-özdeş tekrar; Karpathy içeriği 4-katman-derin mükerrer), (B) scope-path
doğrulaması (var-olmayan yola `Write()` izni — sprint-380 orphan-file olayı commit'e kadar izli),
(C) agent/skill seçim-evrimi (unwired modüller + `forceSkills` hayalet-%100 istatistik-kirliliği).

**Absorpsiyon — bulgular nereye geçti:** `.analysis/prompt-mechanism-revamp-plan.md` bu analizi
Kaynak-1 alıp LP-1…LP-7 iş-kalemlerine dönüştürdü; LP-1/2/3/4/6 **teslim edildi** (commit `0f60dbdf`,
`ce9fe016`; canlı sprint-386 prompt'unda doğrulanmış), LP-5 non-issue çıktı. **LP-7 (routing-mismatch:
`api-builder`/`refactorer` yanlış-atamaları) routing-V2 eleştirisinin belgesi — V3 programının (581)
öncül-kanıtlarından.** MASTER-PLAN'da kendi satırı yok; program `.analysis` planında yürümüş.

**Silme-zarar hükmü:** Teknik kırılma SIFIR (tek anış düz-metin backtick; `lint:link` yalnız gerçek
markdown-linkleri tarar — `scripts/lint-links.mjs` extractLinks doğrulandı). Zarar tamamen tarihî:
teslim-edilmiş bir revamp'ın kanıt-tabanı ve V2→V3 gerekçe-zincirinin halkası silinir. Bu repo
READ-ONLY arşiv olacağı için silmenin kazanımı yok. **Öneri: TUT-ARŞİVDE; göçte taşınmaz** (kök-md
kategorisi zaten "Taşınmayan"da).

### 2. `MIGRATION-PLAN.md` — 69 satır, kök, F0 2026-07-06 (`0c198935` + `46af1e83`)

**Ne:** #488 göçünün oynanış-kitabı: hedef-durum (develop→read-only, deckent→yalnız-kod),
Taşınan/Taşınmayan kümeleri, **5 MÜHÜRLÜ Alperen-kararı (2026-07-06):** (1) `.brain/memory.db`
DOSYA-kopyası (commit'e girmez), (2) tek-snapshot commit, (3) deckent-hub taşınır, (4) 11 gerçek-ölü
orphan göç-öncesi silinir, (5) read-only F4'te. Artı keşif: `~/deckent` ZATEN hedef-repo klonu
(`VerhexIO/deckent`, `7058705`). F0 ✅, F1-F5 ⬜.

**Referans:** Inbound SIFIR — MASTER-PLAN 488 satırı bile adını anmıyor (yalnız ground-truth-snapshot'ı
anıyor). Yani bu dosya silinirse mühürlü kararların **başka hiçbir kaydı kalmıyor.**

**Silme-zarar hükmü: YÜKSEK.** Göç bu Pazar (2026-07-26); kararlar + fazlar + staging-keşfi yalnız
burada. **Öneri: KESİN TUT** — göç tamamlanana kadar dokunulmaz; sonrasında arşiv-kaydı olarak kalır.

**Yan-bulgu (not, plan değil):** F0'ın ürettiği söylenen `migration-manifest.txt` repo'da YOK
(find boş) — göç günü manifest yeniden üretilmek zorunda. Ayrıca dosyanın tek link-hedefi
`docs/analysis/ground-truth-snapshot-2026-07-06.md` yerinde ✓.

### 3. Kök config kümesi — hepsi TUT

| Dosya | Neden kritik |
|---|---|
| `package.json` | Tüm npm-betikleri (build/test/lint/validate:publish) + bağımlılık-manifesti; her CI adımı buradan başlar |
| `package-lock.json` | Deterministik `npm ci` — silinirse CI tekrarlanabilirliği ölür |
| `tsconfig.json` | Derleme sözleşmesi (Node16 ESM çözümlemesi dahil — `.js`-uzantı gotcha'sının kaynağı) |
| `vitest.config.ts` / `.dashboard.` / `.desktop.` | Üç test-ailesi ayrı config'le koşuyor (`npm test`, `test:dashboard`, desktop) |
| `Dockerfile` / `Dockerfile.worker` / `docker-compose.yml` | Container spawn-backend'i (Yasa-2 her-ortam matrisinin parçası) |
| `LICENSE` | Hukuki zorunluluk; publish-gate kapsamı |

Göç-notu: MIGRATION-PLAN "Kök-config'ler" kümesi bunları **taşınan** ilan ediyor (`vitest*` globu
desktop-config'i de kapsar). ⚠️ Küçük Alperen-sorusu göç gününe: desktop NEGATIVE-SPACE iken
`vitest.desktop.config.ts` yeni repoya taşınacak mı? (Bugün karar gerekmez.)

### 4. `.agents/` dizini — kök, BOŞ, oluşturulma 2026-07-08 13:15

**Alperen'in 3 sorusu + cevaplar:**
- **Nereden oluşuyor?** Bu repo'nun kodundan DEĞİL. Git-pickaxe (tüm commit-tarihçesinde string-arama)
  `'.agents'` ifadesinin **hiçbir commit'te hiç var olmadığını** gösteriyor; src/scripts/tests/dist/init-templates
  taramaları da sıfır. Oluşturulma anı 2026-07-08 13:15 = prompt-revamp maraton günü (repo'da aynı gün
  claude/codex/gemini/cursor CLI'ları aktifti) → en olası fail: dış bir AI-CLI aracının (veya subagent'ının)
  konvansiyon-dizini spekülatif `mkdir`'ı. Kesin fail tespit edilemiyor; önemli olan: **repo'daki hiçbir şey
  onu üretmiyor ve tüketmiyor.**
- **Kim okuyor?** HİÇ KİMSE. Kod/test/doc/script referansı sıfır (gevşek-grep'teki `?.agents` eşleşmeleri
  JS property-erişimi, dizin değil); `.codex/` `.cursor/` `.gemini/` `.claude/` araç-konfigleri işaret etmiyor;
  gitignore/npmignore'da yok.
- **Neden gerekli?** DEĞİL. 13 gündür boş; untracked + boş olduğu için git zaten görmüyor
  (`git status` çıktısına bile girmiyor).

**Silme-zarar hükmü: SIFIR.** Build/CI/araç hiçbir şekilde etkilenmez. En kötü senaryo: oluşturan dış
araç bir gün boş dizini yeniden yaratır (zararsız — ve yeniden belirirse faili teşhis etme fırsatı doğar).
**Öneri: SİL-GÜVENLİ.** Göç açısından da anlamsız: boş+untracked olduğundan zaten hiçbir şekilde taşınamaz.

### 5. `.analysis/` dizini — xverify-hariç arşivleme analizi (AKSİYON YOK — yalnız plan-dokümantasyonu)

**Envanter:** 52 üst-düzey girdi (55 git-tracked dosya) + 4 alt-dizin: `xverify/` (aktif araç-çıktısı),
`ozet-notu/`, `u4-olcum/`, `a6-sinav-u1/`. En büyükler: born-backlog.json (229KB) ·
deckent-repl-code-review (174KB) · repl-findings-board.html (121KB). Untracked-dirty: `ozet-notu*` + 3 xverify raporu.

**Kim refliyor / kontrol ediyor (tam liste):**
1. **`lint:link` CI-gate — TEK ZORUNLU KIRILMA NOKTASI:** `docs/adr/archive/adr-g-006-amendment-v3-2026-07-14.md`
   içinde `.analysis/routing-v3-*` dosyalarına **15 GERÇEK markdown-link** var ve `docs/adr/` lint:link'te
   taranıyor (`.lintlinkignore`'da yalnız yorum-satırında geçiyor, ignore edilmiyor). Bu 7 hedef-dosya
   taşınırsa link'ler ölür → `npm run lint:link` KIRMIZI. Ayrıca `.analysis`'in kendisi de kaynak-olarak
   taranıyor (ignore'da yok) ve 3 dosyada göreli-link var → derinlik değişince onlar da kırılır.
2. **Kod-yorumu spec-referansları (×15, davranışsız ama truth):** `src/core/routing/*` 7 modül + config-types
   + decision-types "Source of truth: `.analysis/routing-v3-secenek-b-detay/design-spec`" diyor; planner.ts →
   prompt-contract-verification · auditor.ts → adr-review-crosswalk · 2 test-başlığı → design-spec/misroute-corpus/born-backlog.
3. **Canlı script'ler (manuel, npm-script değil):** `scripts/generate-analysis-inventory.mjs`
   (OKUR: `a6-sinav-u1` + `u4-olcum` → YAZAR: `ozet-notu/inventory-*.json`) · `scripts/measure-prompt-cost.mjs`
   (YAZAR: `u4-olcum/report.md`).
4. **`test:ci-sim` (npm-wired):** hermetik simülasyon `.analysis`'i TOPLUCA gizler → arşiv dizin-İÇİ kalırsa
   (`.analysis/archive/`) semantik hiç değişmez; dizin-DIŞINA taşıma (docs/ vb.) dosyaları hermetik-sim'e görünür kılar.
5. **MASTER-PLAN:** 14 anışın tamamı düz-metin/backtick (markdown-link DEĞİL — doğrulandı) → CI-etkisi yok,
   yalnız yol-bayatlaması.
6. **Codex-goal koruması (AKTİF):** yan-oturumun goal'ü `.analysis/ozet-notu-2026-07-18.md` + `.analysis/ozet-notu/`
   dizinini "protected dirty" ilan etmiş durumda.

**Önerilen hedef: `.analysis/archive/`** (dizin-içi arşiv). Gerekçe: ci-sim gizleme-semantiği değişmez;
aynı-dizin görece-linkler birlikte taşındığında yaşar; tek ignore-satırıyla link-rot kapatılabilir.

**İSTİSNALAR (arşive girmeyecekler):**
- `xverify/` — Alperen-kararı + kod-wired (`cli/commands/xverify.ts:236` yazma-hedefi, satır-609 aktif araç).
- `ozet-notu*` — Codex-goal protected-dirty + inventory-script'in yazma-hedefi → **goal kapanana kadar dokunulmaz**, sonra arşivlenebilir.
- `u4-olcum/` + `a6-sinav-u1/` — 2 script'in okuma/yazma hedefi → ya script-sabitleri birlikte güncellenir ya yerinde kalır (öneri: script'ler manuel-araç olduğundan BİRLİKTE güncelle, küçük iş).
- ⚠️ `born-backlog.json` — tarihî analiz değil **çalışma-defteri** görünümünde (born-kayıt ledger'ı, son yazım 07-14, disk-verify yorumunda anılıyor) → arşiv-kararı Alperen'e ayrıca sorulacak.

**REFLEKS-LİSTESİ (arşiv uygulanırsa yapılmak ZORUNDA olanlar — şimdilik yalnız dokümante):**
| Refleks | Zorunluluk | İş |
|---|---|---|
| R1: `adr-g-006-amendment-v3` içindeki 15 link → `../../.analysis/archive/...` yol-güncellemesi | **ZORUNLU** (yoksa lint:link kırmızı) | tek dosya, mekanik sed |
| R2: `.lintlinkignore`'a `.analysis/archive/**` satırı | **ZORUNLU** (taşınan dosyaların kendi dış-linkleri için; dosyanın kendi gerekçesi zaten "historical artifacts, link-rot acceptable") | 1 satır |
| R3: routing/* + planner + auditor + 2 test'teki 15 kod-yorumu spec-yolu | İsteğe-bağlı (davranış etkisi SIFIR; truth-hijyeni) | tek sed dalgası |
| R4: script-sabitleri (`generate-analysis-inventory.mjs:15-16`, `measure-prompt-cost.mjs:51`) | Yalnız u4-olcum/a6-sinav-u1 taşınırsa | 3 satır |
| R5: MASTER-PLAN 14 düz-metin anışı | Önerilmez (tarihsel kayıt — satırlar yazıldığı günün doğrusunu anlatır) | — |
| R6: Taşıma `git mv` ile yapılmalı (55 tracked dosya — tarihçe korunur) + sonrasında `lint:link` + `test:ci-sim` yeşil-kanıtı | **ZORUNLU** (uygulama-günü DoD) | — |

### 7. `.brain/` — ERRORS.md + heartbeat-log.md işlevsel analizi (Alperen-istek, 2026-07-21)

**Genel:** `.brain/` tracked-yüzeyi yalnız `exports/` (4 md — auto-regen); memory.db + ERRORS + heartbeat
+ analysis + sprints untracked. Hüküm: nizami (Alperen) — tek yapısal not: `memory.db.backup-2026-07-07*`
(15MB, 3 dosya) 2 haftalık; temizlik-adayı ama karar Alperen'de, bu turda sorulmadı.

**`ERRORS.md` — repo-genelinin hata-hunisi (canlı, kendi kendini bakan):**
- **Yazan (TEK kanal):** `debugLog()` (`src/core/utils.ts:14`) → `appendToErrorsFile`. **108 dosya**
  debugLog çağırıyor — tüm codebase'in non-fatal hata/iz hunisi. Format pipe-delimited
  `| ISO-ts | context | mesaj(≤200ch) |`.
- **Öz-bakım:** 600-satır yuvarlanan-pencere (`ERRORS_MAX_LINES`, Sprint-140'tan beri) — dosya şu an tam
  600 satır/84KB, rotasyon ÇALIŞIYOR. Vitest koşusunda yazmaz (test-gürültüsü koruması); yazım-hatası
  sessiz-yutulur (non-fatal); `.brain` yoksa no-op. W7-dersi: ENOENT soft-miss'leri loglanmaz
  (born-484 — pencereyi taşırıp adli-kayıtları döndürüyordu).
- **Okuyan:** Kodda **SIFIR okuyucu** — insan/CC adli-inceleme yüzeyi. Tek YÜK-TAŞIYAN NEGATİF-referans:
  `nervous/observer.ts:77` watcher'ı ERRORS.md'yi **açıkça DIŞLAR** (tarihî ~200-sprint sonsuz
  öz-besleme döngüsü: write→watch→debugLog→write; dosya-adı dışlama-listesinde kalmak ZORUNDA).
- **Hijyen-notu (born-adayı, fix değil):** İçerikte INFO-düzeyi breadcrumb'lar var
  (`finalizeSprint:jobSummary | Job summary written…`) — "ERRORS" adlı dosyada hata-olmayan kayıtlar
  600'lük pencereyi tüketiyor.
- **Hüküm: TUT** (canlı altyapı). Silinse bile ilk debugLog'da yeniden doğar — ama tarihçe kaybolur.

**`heartbeat-log.md` — sprint-süresi sağlık-yoklaması çıktısı (wired ama İŞLEVSEL-BOZUK):**
- **Yazan:** `HeartbeatDaemon` (`orchestra/heartbeat-daemon.ts`) — `.deckent/HEARTBEAT.md` checklist'ini
  okur, whitelist-komutları (ps/kill/tsc/npx/node/npm; 5s timeout; metachar-blok) çalıştırır, sonucu
  append eder. **Sprint-controller default-ON başlatır** (`sprint-controller.ts:1541`; opt-out
  `enableHeartbeatDaemon:false`), dakika-aralıklı `setInterval`.
- **Okuyan:** Kodda SIFIR (1 test yazımı assert eder) — insan yüzeyi.
- **🐛 BULGU (born-adayı):** Daemon'un KENDİ default-şablonu kendi guard'ına takılıyor —
  `DEFAULT_HEARTBEAT_TEMPLATE` 2. görevi `npx vitest run … 2>&1 | tail -5` içindeki `|`/`&`
  metakarakterleri `SHELL_METACHAR_REGEX` tarafından BLOKlanıyor → canlı logda her koşu
  `BLOCKED: Shell metacharacter detected` (07-18'den beri tüm girdiler ❌; `tsc --noEmit` de boş-çıktı-❌).
  Yani heartbeat şu an yalnız gürültü üretiyor. Ek: log append-only, **rotasyon YOK** (şimdilik 195
  satır — düşük risk ama sınırsız).
- **Hüküm: TUT** (wired altyapı) + born-adayı not: (a) default-şablon kendi whitelist'iyle çelişiyor
  (şablonu düzelt YA DA compound-komut politikasını netleştir), (b) log-rotasyon eksik. Fix bu turda
  YAPILMADI (yalnız-analiz modu).

### 10. `examples/` — quickstart + voice-wrapper kapsamlı analiz (Alperen-istek, 2026-07-21)

**Genel yapı:** İki çocuk, zıt karakterde — `quickstart/` (3 dosya, tracked, 16K) ve `voice-wrapper/`
(untracked, 71MB). `git ls-files examples/` = yalnız quickstart'ın 3 dosyası.

**`quickstart/`:** OSS-onboarding örneği. Okuyanı son-kullanıcı; bakımı yaşamış (sprint-171 audit C-44:
`workspace:*` protokolü OSS'te patlıyordu → `^1.0.0-beta.1` fix'i). Kod-referansı yok; `docs/guide/*`
linkleri `docs/guide/quickstart.md`'ye gider (ayrı doküman), buraya değil. Hüküm: TUT.

**`voice-wrapper/` — kimlik:** deckent **Voice HTTP Contract**'ının (POST `/tts` JSON→audio ·
POST `/stt` audio→text) Python referans-uygulaması: `server.py` + `engines.py` + `tts_text.py`
(Türkçe telaffuz-normalizasyonu; `pronunciation.json` Alperen-küratörlü: "build→Bıld, merge→Mörç") +
4 test dosyası + `run.sh`. Tarihçe önemli: ÖNCE tracked'dı (`7e2446f9`, `0172b52a`), sonra
**Alperen-kararıyla bilinçli untrack** edildi (`5d31bbdb` "voice-wrapper untrack (Alperen)") +
kök `.gitignore:232`.

**Kim okur:** (a) **İnsan/kullanıcı** — `docs/voice.md` (tracked, ürün-dokümanı) 9+ yerde bu dizini
kontrat-referansı ilan ediyor; linkler `github.com/VerhexIO/deckent/blob/main/examples/voice-wrapper/...`
biçiminde (ürün-repo URL'i = external link, lint:link yerel-doğrulamaz). (b) **deckent kodu OKUMAZ** —
`src/connectors/voice/local-voice.ts` tamamen config-driven (`stt_url`/`tts_url`); kontratı uygulayan
HERHANGİ bir sunucuyla konuşur, wrapper'a bağımlılığı yok. Testler localhost:9000 mock kullanır,
wrapper'ı hiç çağırmaz. **Kim yazar:** Python-runtime (`.audio-tmp/` torchinductor+triton GPU-derleme
cache'leri, son koşu 2026-07-11 — 70MB; `__pycache__/` 72K) + Alperen (`voice-ref/` 360K kişisel
ses-klipleri — iç `.gitignore` bilinçli commit-dışı tutar).

**Neden gerekli:** Kontratın tek çalışır referans-uygulaması; docs/voice.md'nin tüm kurulum-anlatısı
buna dayanıyor. Silinirse ürün-dokümanı havada kalır.

**⚠️ GÖÇ-BULGUSU (bu analizin en önemli çıktısı):** `docs/voice.md` linkleri ürün-repodaki
(`VerhexIO/deckent`) `examples/voice-wrapper/README.md`'ye işaret ediyor; ama wrapper develop'ta
UNTRACKED → git-temelli göç onu **kendiliğinden TAŞIMAZ**; hedef-repo tek-commit (31 Mayıs) ve voice-işi
sonrası (25 Haziran) → **bu linkler bugün 404 ve göçten sonra da 404 kalır**, ta ki wrapper'ın
kod+README'si (cache'ler + voice-ref HARİÇ) göç günü BİLİNÇLİ kopyalanana kadar. Ek: MIGRATION-PLAN'daki
"examples/ (17 dosya)" sayımı bayat (wrapper tracked'ken sayılmış; bugün tracked=3).

**İç-hijyen SİL-adayları (dizin tutulurken):** `.audio-tmp/` 70MB + `__pycache__/` 72K — tamamen
yeniden-üretilebilir; silme kazanımı ~70MB, risk sıfır. `voice-ref/` (360K, kişisel klip) → Alperen-kararı.

### 11. `docs/adr/` — güncellik + tutarlılık denetimi (Alperen-istek, 2026-07-21)

**Sonuç: GÜNCEL ✓ TUTARLI ✓ — temizlik gerekmiyor.** Kanıt-zinciri:

1. **Sayı-tutarlılığı 1:1:1** — `docs/adr/` 47 ADR-dosyası = DB-export'ta (`.brain/exports/decisions.md`)
   tam 47 `## adr-` girdisi = `.claude/rules/*` içine auto-inject edilen 47-accepted indeksi.
   Eksik/fazla YOK.
2. **G-003 / D-003 boşlukları BİLİNÇLİ** (tutarsızlık değil, belgeli): D-003 "intentionally vacant"
   (SpawnOptions spawn-yasasına katlandı — export:2648), G-003 (Brain Role Separation) G-020
   authority-matrisine emildi (export:3399).
3. **Alan-senkronu 47/47** — tüm Status/Date alanları md↔export eşleşti (ilk taramadaki d-011/d-013
   "drift"i benim grep-penceremin sahte-pozitifiydi; el-teyitle çürütüldü).
4. **İçerik-senkronu (en zorlu örnek):** en son el-düzenlenen md (`adr-g-029`, 2026-07-18) DB-export'la
   (regen 2026-07-19) **bayt-özdeş** (tek fark export'un girdiler-arası `---` ayracı). Round-trip çalışıyor.
5. **Mekanik gate'ler canlı:** `npm run lint:adr` → "✓ 47 ADRs validated" (bu analizde koşuldu);
   README AUTOGEN-index `docs:ref:check` ile drift-korumalı; `docs/adr/` lint:link GA-yüzeyinde taranıyor
   (adr-g-006 linkleri #5 `.analysis`-arşiv işinin R1-refleksine bağlı).
6. **`archive/` düzgün:** 3 eski-numaralı emekli ADR (005/009/038 — Haziran-30 yeniden-tasarım öncesi
   çağdan) + g-006 v3-amendment (ana ADR'ye merge edilmiş kopyası) — arşiv-disiplini yerinde.
7. **Tazelik:** export son-regen 07-19 (her sprint-sonu auto-regen); md-ailesi son-düzenleme 07-18;
   kitle-yeniden-yazım tabanı 06-30 (ADR-G-019 governance-redesign konsolidasyonu).

**2 yan-not (temizlik değil):**
- **born-adayı:** md↔DB **içerik**-senkronunu diff'leyen mekanik gate YOK (`lint:adr` yalnız format
  doğrular; senkron bugün konvansiyonla ayakta — g-029 kanıtı iyi ama tek-örnek). Ucuz bir
  `docs:adr:sync-check` eklenebilir.
- MIGRATION-PLAN KARAR-1'deki "docs/adr 41 md" sayımı bayat (bugün 47) — göç günü manifest yeniden
  sayılacak zaten (bkz. #2 yan-bulgu: manifest de kayıp).

### 12. `docs/analysis/` — sil-mi-arşiv-mi analizi (Alperen-istek, 2026-07-21)

**Envanter (87 tracked dosya, sınıflara ayrılmış):**
- **Tarihî (~72, arşiv-adayı):** Mayıs-22 OSS-audit ailesi (~23) · Haziran rekabet/forensik (~11) ·
  sprint-seri kapanışları (debt-close ×7, closing-data ×2, series ×3, worker-quality, codex-audit ×3) ·
  fable-5 makaleleri (3) · m5/f1tok/builtins-drift tek-seferlikleri · 588/589 prototip-HTML'leri.
- **CANLI-refli çekirdek (~15, YERİNDE kalmalı):** `ground-truth-snapshot-2026-07-06` (göç-defteri) ·
  `scheduler-unify-design-2026-07-11` + `scheduler-shadow-divergence-2026-07-12` (527 SCHED-treni açık;
  kod-yorumları spec gösteriyor) · `term-flow-unify-design-2026-07-11` (run-flow ailesinin spec'i) ·
  `orphan-deliverables-2026-07` (490'ın SSOT-listesi, iş açık) · 583-ailesi + surf4-ailesi +
  desktop-* (açık satırların tasarım-kayıtları) · `adr-g-033-amendment-2026-07-17` (amendment-kaydı) ·
  README.

**Referans-sınıfları (silme-kararını belirleyen):**
1. **Göç-bağı (EN KRİTİK):** MIGRATION-PLAN satır-4 `ground-truth-snapshot`'ı "doğrulama-defteri" ilan
   ediyor; F5 doc-yeniden-yazımının rehberi. Göç 2026-07-26 — bu dosya göçten önce SİLİNEMEZ.
2. **Kod-yorumu spec-ref ×10:** `config-types.ts` ×3 · `config.ts:1086` · `scheduler-reducer.ts:3` ·
   `run-flow-store/contract/job-service` · `run-flow` gate açıklamaları — scheduler/term-flow spec'leri
   hâlâ "Source of truth". 527 dilim-8 (default-flip) AÇIK olduğundan bunlar aktif-çalışmanın referansı.
3. **Runtime literal:** `src/core/doc-tracking/types.ts:58` rankMap `'docs/analysis/**': 90` — dizin
   doc-tracking sisteminin izlediği bir sınıf. Önemli uyum: trackIgnore'da `'**/archive/**'` var →
   dizin-İÇİ arşive taşınanlar otomatik izleme-dışı kalır (arşiv-önerisiyle kendiliğinden uyumlu).
4. **lint:link:** dizin kaynak-olarak ignore (`.lintlinkignore:34`); GA-yüzeyden tek gerçek link
   `docs/reference/worker-wrapper-contract.md:14` → **GitHub-URL (external)** → yerel-lint doğrulamaz.
   Sonuç: taşıma/silme lint:link'i KIRMAZ, link-refleksi gerekmez (`.analysis`-dot işindeki R1'in aksine).
5. **MASTER-PLAN:** 13 düz-metin anışı (backtick) — CI-etkisi yok, tarihsel kayıt, güncellenmez.

**Hüküm-önerisi (Alperen-kuralı "ref varsa arşiv"e göre):** REF VAR → tam-silme DEĞİL,
**ayrıştırılmış-arşiv**: ~72 tarihî dosya `docs/analysis/archive/` altına (`git mv`), ~15 canlı-refli
çekirdek yerinde. Refleks GEREKMEZ (lint-ignore + external-link + doc-tracking archive-uyumu sayesinde
sıfır-kırılma). Tam-silme ancak göç-sonrası yeni-repo döneminde gündeme alınabilir (bu repo READ-ONLY
arşiv olacağından o zaman da gereksiz olabilir).

### 13. `docs/architecture/` — analiz (Alperen-istek, 2026-07-21)

**Referans-durumu (TUT'u zorunlu kılan):** README.md + README-TR.md toplam 4 satırda gerçek
markdown-link (TR yerel-yolla — taşınır/silinirse `lint:link` kırmızı; EN GitHub-URL) ·
docs/guide 2 dosya GitHub-URL'le · `tests/docs/docs-structure.test.ts` dizinin varlığını VE ≥1 md
içermesini şart koşuyor (silme = test kırmızı) · doc-tracking rankMap `'docs/architecture/**': 5`
(CLAUDE/MASTER-PLAN=0 ve adr=1'den sonraki en yüksek önem-sınıfı) · VitePress sidebar'ından
BİLİNÇLİ exclude (yayınlanmayan bölüm — kullanıcıya GitHub-blob linkiyle sunuluyor).

**Güncellik: BAYAT (bu analizin ana bulgusu).** 4 çekirdek dosya 2026-06-30'da (ADR-redesign toplu
dalgası), 2'si 2026-06-14'te donmuş. Somut drift-kanıtı: `architecture.md` + `agents.md` +
`agent-skill-architecture.md` üçü toplam **9 yerde routeTaskV2/routing-engine anlatıyor; routeTaskV3
anışı SIFIR** — V2 motoru 2026-07-15'te fiziksel silindi (bkz. Alan-1 routing-analizi). Yani ürünün
"mimari" dokümanı, ölmüş bir motoru bugünün-gerçeği gibi sunuyor. Temmuz trenlerinin (routing-v3,
SCHED-reducer, Goal-v2, xverify) hiçbiri yansımış değil.

**Yapısal tutarsızlık — `adr/` alt-dizini:** canonical ADR-evi `docs/adr/` (47, tutarlı — §11) iken
burada 2 eski-numaralı kaçak-kopya duruyor: `010-single-runtime-dependency.md` (**ADR-D-005'e emilmiş** —
decisions.md crosswalk "ADR-010+011→ADR-D-005"; "tek-runtime-dependency" dogması resmen emekli) +
`adr-090-ink-repl.md` (eski-numara çağından). İkisi de `docs/adr/archive/` düzenine ait.

**Hüküm-önerisi:** TUT (refler zorunlu kılıyor) + iki alt-aksiyon-adayı: (a) `adr/` alt-dizinini
`docs/adr/archive/`e taşı (yapısal-tekilleştirme; küçük `git mv` + README-linki yok, refleks sıfır),
(b) içerik-yeniden-yazımı temizlik işi DEĞİL — göç-F5 doc-yeniden-yazım dalgasının ve aşağıdaki
çok-dilli programın kapsamına girer (bu repo'da elle güncellemeye değmez).

---

### 16-23. Kök-kuyruk analizi (2026-07-21 — kalan kök-öğelerin toplu turu)

Yöntem: 3 bağımsız keşif (deckent-hub · araç-config dörtlüsü · artıklar+dot-dosyalar) + el-teyitleri.
Satır-hücrelerinde olmayan ek notlar:

- **#16 deckent-hub:** README kendini "staging area inside the deckent monorepo… will become its own
  repository" ilan ediyor; submodule DEĞİL, inline-kopya (drift-riski audit'te CRITICAL). 20 skill
  (spotify/telegram/slack… entegrasyon-domain'i) ↔ `.deckent/skills` 31 skill (geliştirici-uzmanlık) —
  sıfır isim-örtüşmesi. `npm files`-allowlist + `.npmignore:46` çifte-dışlama → pakete girmiyor.
  Kendi CI'sı (`validate-skill.yml` + `hub-validate.mjs` AST-sandbox tarayıcı) repo-split'e hazır bekliyor.
- **#17 dörtlü — en kritik tekil bulgu:** Gemini worker'ları bugün `.gemini/rules/karpathy-discipline.md`
  üzerinden **emekli ADR-010** politikasını okuyor (dependency eklerken yanlış kurala uyacaklar);
  `.claude`+`.codex` kopyaları 07-01'de ADR-D-005'e geçmiş, gemini-kopyası atlanmış. İkinci yapısal bulgu:
  `sync.ts` kök-sözleşmelerin yalnız `@DECKENT.md` import-satırını garanti ediyor — CLAUDE.md gövde-değişimleri
  (11-kanun, model-ataması) AGENTS/GEMINI'ye ELLE taşınmadıkça drift kaçınılmaz (mevcut durum: 07-07'de donmuş).
- **#18/#21(a) güvenlik-çifti:** `.deck` (canlı secrets) `.dockerignore`'da YOKKEN kök `Dockerfile:19`
  `COPY . .` yapıyor → `docker compose build` secrets'ı `deckent:latest` layer'ına gömer. CI'da build yok
  (blast-radius lokal/manuel) ama tek-satırlık `.dockerignore` eklemesi kapatır. `npm` tarafında eşdeğer
  risk YOK (`files`-allowlist kapatıyor).
- **#19 kök-neden:** `.tmp-test` silmek semptom-tedavisi — `zero-hardcode-audit.test.ts` tmpdir kullanmadıkça
  her `npm test` dizini yeniden yaratır. Kalıcı çözüm test-düzeltmesi (hermeticity born-adayı, #9a ile birleşik).
- **#23 sızıntı-detayı:** `alp-discipline/.deckent/docs/core-memory/` altında ana-reponun `law_adr_inviolable.md`,
  `feedback_zero_hardcode_live_data.md`, `MEMORY.md`, `temp_sprint_prompt_quality_watch.md` kopyaları var —
  muhtemelen dizin-içinde `deckent init`/sync çalıştırılmış. Public "dünya-hediyesi" repo'ya iç-hafıza taşınmamalı.

---

## 🌍 SÜREÇ-KARARI (Alperen, 2026-07-21): Çok-dilli dokümantasyon programı

> "Tüm dokümanlar docs-en ve docs-tr formatında olacak şekilde hazırlanacak; hatta dünyada ve
> AI piyasasında en popüler 6 dil için dokümantasyon yapılacak."

- Kayıt: yön-kararı olarak buraya işlendi (uygulama-planı YOK — göç-F5 doc-yeniden-yazımıyla
  birleşmesi doğal aday; yeni repoda dil-ağacı kurgusu oradan başlar).
- **Dil-listesi ✅ ONAYLANDI (Alperen 2026-07-21 karar-turu):** `en` (default) · `tr` · `zh-Hans`
  (Çince-basitleştirilmiş) · `es` (İspanyolca) · `ja` (Japonca) · `hi` (Hintçe).
- Teknik not (plan değil): VitePress yerleşik i18n/locales destekler; mevcut site-config tek-dil.
  README zaten EN+TR çift (README.md + README-TR.md) — desen genişletilebilir.

---

## ✅ KARAR-TURU KAYDI (Alperen, 2026-07-21 — toplu karar; YALNIZ-DOKÜMANTASYON, iş sonra yapılacak)

Tek mesajla verilen kararlar (satır-hücrelerine işlendi; burada tam liste):
**#4** SİL · **#5** CC-önerisi kabul (A1-A5 arşiv-planı; born-backlog yerinde) · **#13** CC-önerisi kabul
(2 kaçak-ADR taşınacak) · **#14** K1=**c** / K2=**PAS** / K3=**a** · **#15** T1 SİL · T2 buda (parametre-cevabı:
`keep_last_n=10` config'te VAR ama arşivi kapsamıyor — arşiv-budama yeni-policy) · T3 OK · T4 SİL ·
T5-T12 OK · **#16** TUT · **#17** TUT + senkron-dalgası seçmeli-onay (cursor-seçimi ⬜) · **#19** SİL ·
**#20** SİL · **#21** a=ONAY (dockerignore+.deck) / b=SİL (pre-commit) · **#23** TUT (alt-sorular ⬜) ·
**#24** CC-önerisi kabul (3 template SİL) · **#25** `.tasks`'a ŞİMDİLİK DOKUNMA · **#26** CC-önerisi kabul
(+stats-gate CI'ya) · **Scripts** SEÇMELİ (toptan-SİL yok — 14 aday tek-tek, temizlik-gününde) ·
**Dil-listesi** ONAY (en·tr·zh-Hans·es·ja·hi).

**Ek-tur (Alperen, 2026-07-22):** **#28 TS1-TS8 hepsi ONAY** · **#14-K2 = a KESİNLEŞTİ** (çekirdek-değişimi
paketi K1=c·K2=a·K3=a tam-onaylı) · **#17-cursor = KAPSAM-DIŞI** ilan edildi.

**Ek-tur-2 (Alperen, 2026-07-22):** **#29** 29a-KABUL · 29b-KURMA (ürün-repo `deckent`te kurulacak) ·
29c-ONAY · **#30** 30a/b/c/d HEPSİ ONAY (decay-incelemesi ayrı-iş). → Karar-fazı KAPANDI;
uygulama-planı: **`2026-07-22-temizlik-gunu-plani.md`**.

Kalan açık ⬜'ler: #23 yalnız iç-`.deckent` temizlik-zamanı (track-kararı ✅ 2026-07-22 commit'le çözüldü) ·
scripts tek-tek seçim (temizlik-günü F7'de canlı-tur) · tüm ✅ kararların UYGULAMASI (Alperen "başla"-emriyle).
**Dokümantasyon-fazı Alperen-onayıyla KAPANDI ve commit'lendi (2026-07-22)** — işler sonradan ele alınacak;
tam iş-listesi: `2026-07-22-temizlik-gunu-plani.md` (F1-F12 + 📦 ayrı-iş 7 kalemi).

---

## Süreç-notları
- Tablo büyüdükçe yeni dosyalar aynı formatta eklenir (analiz-ayrıntısı + tablo-satırı).
- Karar verilen satırlarda ⬜ → ✅ SİL / ✅ TUT / ✅ REVİZE / ✅ YENİDEN-YAZ olarak güncellenir; SİL kararı
  uygulaması ayrı onaylı adımdır (bu doküman uygulama-emri değildir).
