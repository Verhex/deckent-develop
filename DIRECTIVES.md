# DIRECTIVES — OVERNIGHT ROUND 8: canlı-gözlem + onay-kanalları + kalan borçlar (15 task)

## Goal
WORKER-LIVE-TRACE dilimlerini indir (progress-stream yaz+oku), onay-kanallarını bağla
(telegram/terminal/nervous), golden-flow'u komuta giydir, kalan born-borçları (427/428) kapat,
landed-pillar'ların dokümantasyonunu güncelle. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (index.ts YALNIZ Task 10 · app.tsx YALNIZ Task 11 · config.ts YALNIZ Task 13 ·
  messages.ts YALNIZ Task 15). **DISK-VERIFY first**; ADR (D-004 yön!); surgical; YAGNI.
- **Hermetik test**; gerçek provider/exec/telegram YOK. **No build/install/login.**
- **Flag-gated wiring** default-off; flag-off byte-identical (test).
- **Honest result. No haiku.**

---

## Task 1: WLT-EMIT — worker progress-stream yazıcı (WORKER-LIVE-TRACE dilim-1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/agents/agentic-worker-runner.ts, tests/agents/wlt-emit.test.ts
- Scope: src/agents/, src/core/, tests/agents/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-025 §4 (WORKER-LIVE-TRACE — ".log yetmez, structured progress-stream").
Worker-runner'ın anlamlı adımlarında (start/plan-yazıldı/edit-file/verify-koşuyor/result-yazılıyor)
`.tasks/task-<id>.progress.jsonl`'e satır-event (ts/step/detail/seq) — append-only, fail-soft,
`live_trace.enabled` flag default-off (flag-off byte-identical). Heartbeat currentAction ile uyumlu
(çiftleme değil: hb=son-durum, progress=akış).
### goNogo
- goCriteria: flag-on adım-event'leri sıralı yazılır (fake-runner testi); flag-off hiç-yazmaz;
  fail-soft (yazım-hatası runner'ı öldürmez); `tsc` temiz.
- nogo: default-on; hb-formatını değiştirmek.

## Task 2: WLT-READ — progress-stream okuyucu/agregatör (dilim-2)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/progress-reader.ts, tests/cli/progress-reader.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
`.tasks/*.progress.jsonl` okuyucusu: `readWorkerProgress(dir)` → worker-başına son-N adım +
"şu an ne yapıyor" özeti; bozuk-satır atlanır (sayaçla); run-state-feed'in worker-detay alanını
beslemeye uygun şekil (feed'e YAZMADAN — tüketici sonra bağlar).
### goNogo
- goCriteria: fixture-stream'lerden doğru özet; bozuk-satır toleransı; büyük-dosyada son-N (tail)
  verimli; `tsc` temiz.
- nogo: run-state-feed.ts'e yazmak.

## Task 3: APR-TG-CHANNEL — telegram onay-kanal adaptörü
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/connectors/approval-telegram.ts, tests/connectors/approval-telegram.test.ts
- Scope: src/connectors/, src/core/, tests/connectors/, docs/adr/
- Dependencies: none
### Description
ApprovalRelay'in attachChannel kontratına telegram adaptörü: pending → maskedArgs-özet + risk +
inline-butonlar (approve/deny — mevcut telegram-connector'ın buton/callback altyapısını disk-verify
edip YENİDEN-KULLAN; feedback_telegram_rich_approval_bot emsali); callback → onDecision. Transport
inject (fake-bot testleri); gerçek-bot bağlama follow-up.
### goNogo
- goCriteria: fake-transport ile pending→mesaj-payload (masked+butonlar); callback→decision; kanal-
  hatası relay'i etkilemez; `tsc` temiz.
- nogo: gerçek telegram; connector-çekirdeğini değiştirmek; raw-args.

## Task 4: APR-TERM-CHANNEL — terminal onay-kanal adaptörü
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/repl/approval-terminal-channel.ts, tests/cli/approval-terminal-channel.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Relay↔EventStream↔approval-card kuyruğu köprüsü: relay-pending → eventstream-publish → card-queue
enqueue seam; card-decision → relay.onDecision. app.tsx'e DOKUNMADAN (Task 11 bağlar) saf köprü.
### goNogo
- goCriteria: uçtan-uca fake zincir (pending→card-payload→decision→relay); cross-broadcast alımı;
  `tsc` temiz.
- nogo: app.tsx/approval-card.tsx'e yazmak.

## Task 5: ROLLBACK-DECIDE — worker-rollback wire-or-kill (born-427)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/worker-rollback.ts, src/orchestra/result-evaluator.ts, tests/orchestra/rollback-decide.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-D-006 (dead-code disposition) + born-427. `setupTaskSnapshot`/`applyRollbackVerdict`
0-caller (disk-verify güncel durum). KARAR + uygulama: NOT_DISPATCHED/re-dispatch çağı geldi —
NO_GO-task dosya-revert'i hâlâ isteniyor mu? (a) KILL: ölü kodu sil + ADR-notu; ya da (b) WIRE:
evaluate-NO_GO + files-changed'li task için flag-gated revert (`rollback.enabled` default-off).
Seçimini kanıt+gerekçeyle yaz; hangisiyse TAM yap (yarım-wire bırakma).
### goNogo
- goCriteria: 0-caller güncel-kanıt; seçim gerekçeli; KILL→grep-temiz+testler yeşil YA DA WIRE→
  flag-gated revert testli (tmpdir git-fixture); `tsc` temiz.
- nogo: yarım-wire; kanıtsız silme.

## Task 6: SPAWNLOCK-HARDEN — TOCTOU pencere kapatma (born-428)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/file-lock.ts, tests/core/spawnlock-toctou.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
born-428: O_EXCL-create ile content-write arası "corrupted sanıp unlink" dar-penceresi. Fix:
lock-içeriğini tmp+rename atomik yaz YA DA pre-check'in unlink-dalını kaldır (O_EXCL yeter) —
disk-verify edip dar-değişikliği uygula; mevcut moat-1 suite (conflict/batch/release) yeşil kalmalı.
### goNogo
- goCriteria: mid-write okuma artık unlink tetiklemez (test-simülasyon); moat-1-source-merge-race
  suite yeşil; `tsc` temiz.
- nogo: lock-semantiğini değiştirmek.

## Task 7: DOC-PILLARS — landed-pillar dokümantasyonu
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: DECKENT.md, docs/reference/api-surface.md, tests/docs/doc-pillars-links.test.ts
- Scope: docs/, DECKENT.md, tests/docs/, src/
- Dependencies: none
### Description
Bu gece inen pillar-çekirdeklerini (TOOL registry/search/dispatch · APR contract→eventstream zinciri ·
TERM çekirdekleri · DeckBroker · trace-extract CLI) DECKENT.md katalog-bölümlerine + api-surface.md
kontratlarına DİSK-DOĞRULAYARAK ekle (her iddia file:line'lı gerçek; vizyonu shipped gibi yazma —
flag-gated olanları 'flag-gated (default-off)' etiketiyle). Ölü-link testi.
### goNogo
- goCriteria: her yeni-iddia disk-verify (modül+export gerçek); flag-etiketleri doğru; link-testi
  yeşil; AUTO-section'lara dokunulmadı.
- nogo: vizyon=shipped yazmak; autogen-blok düzenlemek.

## Task 8: WM-7 — dil-uyumsuzluk routing-penaltısı (config-gated)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/routing-engine.ts, tests/core/wm7-language-penalty.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-006/G-023 (WM-7). Task-dili (TR/EN — basit heuristik: TR-karakter/kelime oranı) ile
agent-prompt dili uyuşmazsa küçük-penaltı (−1), `routing.languagePenalty ?? false` gate default-off;
flag-off byte-identical. Kind-affinity/role-signal desenlerini aynala.
### goNogo
- goCriteria: flag-off identical; flag-on TR-task'ta EN-only-agent −1 (fixture); diversity testleri
  yeşil; `tsc` temiz.
- nogo: default-on; dil-tespitine bağımlılık eklemek.

## Task 9: TRN-LINT — eğitim-korpusu kalite-denetçisi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/training/corpus-lint.ts, tests/training/corpus-lint.test.ts
- Scope: src/training/, src/core/, tests/training/, docs/adr/
- Dependencies: none
### Description
ShareGPT JSONL denetçisi: şema-uygunluk + redaction-taraması (sk-/AKIA/ghp_/JWT kalıntısı → ihlal) +
dedupe-istatistiği + boş/çok-kısa örnek tespiti → rapor-objesi {ok, violations[], stats}. CLI-wiring
follow-up. Satır-akışlı.
### goNogo
- goCriteria: temiz/kirli fixture'larda doğru rapor; secret-kalıntısı yakalanır; satır-akışlı;
  `tsc` temiz.
- nogo: dosya-düzeltme (salt-denetim); yeni bağımlılık.

## Task 10: GOLDENFLOW-CMD — `deckent do "<goal>"` (index.ts TEK-yetkili)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/do.ts, src/cli/index.ts, tests/cli/do-cmd.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/, docs/adr/
- Dependencies: none
### Description
golden-flow'u (READ-ONLY) komuta giydir: `deckent do "<goal>"` — default DRY-RUN (plan-önizleme +
ne-yapılacak listesi; start ETMEZ); `--run` ile approve-seam üzerinden gerçek akış (start-seam mevcut
runSprint-yoluna bağlanır ama --run'suz test edilir). index.ts kaydı bu görevde.
### goNogo
- goCriteria: dry-run önizleme deterministik (fake-seam); --run seam-zinciri unit-fake ile; kayıt-
  testi; `tsc` temiz.
- nogo: default'ta sprint başlatmak; golden-flow'u değiştirmek.

## Task 11: APP-APPROVAL-WIRE — approval-card+dual-stream'i app'e tak (app.tsx TEK-yetkili)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, react-specialist
- Files: src/cli/repl/app.tsx, tests/cli/app-approval-wire.test.tsx
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: APR-TERM-CHANNEL
### Description
354'te inen repl_surface bölgesine (disk-verify app.tsx flag-yapısı) approval-card + dual-stream +
terminal-kanal köprüsünü tak: pending-varken dual-stream düzeni (approval üst, status min-1);
`repl_surface.approvals ?? false` alt-flag; flag-off 354-davranışı byte-identical.
### goNogo
- goCriteria: alt-flag-off identical; flag-on pending→kart görünür + y/n decide zinciri (fake-relay);
  footer kaybolmaz; `tsc` temiz.
- nogo: kart/kanal core dosyalarına yazmak; default-on.

## Task 12: NERVOUS-APR — nervous accept/reject ↔ broker köprüsü
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/approval-bridge.ts, tests/nervous/approval-bridge.test.ts
- Scope: src/nervous/, src/core/, tests/nervous/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-022 + G-020. Nervous'un mevcut accept/reject akışını (disk-verify nervous-accept
tool/handler) ApprovalBroker'a köprüle: nervous-onayı → broker.decide(map'lenmiş request); broker-
pending (nervous-kaynaklı aksiyonlar) → nervous-bildirim payload'u. Saf köprü + fake'lerle test;
gerçek-wiring follow-up. Bilinen gotcha: accept pending'i silmiyor ([[project_nervous_accept_pending_not_cleared]]) — köprü decide-sonrası temizliği üstlenir.
### goNogo
- goCriteria: nervous-accept→decide + pending-temizliği; reject→deny; çift-karar idempotent;
  `tsc` temiz.
- nogo: nervous-çekirdeğini yeniden-yazmak.

## Task 13: CFG-APR-WIRE — approval.rules'u config'e bağla (config.ts TEK-yetkili)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, src/core/config-types.ts, tests/core/cfg-apr-wire.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
`approval` config-bloğunu (rules[] + gate/relay flag'leri) config-types'a ekle + loadConfig merge'inde
approval-rules-load (READ-ONLY) ile doğrula — bozuk-kural sprint'i KIRMAZ (uyarı-listesi debugLog);
default'lar approval-rules-load'un güvenli-set'i. validatePartialConfig uyumu.
### goNogo
- goCriteria: geçerli/bozuk config fixture'ları (tmpdir loadConfig); default-güvenli; mevcut config
  suite yeşil; `tsc` temiz.
- nogo: rules-load'u çiftlemek; validation'ı gevşetmek.

## Task 14: SMOKE-AUDIT — post-sprint Tier-1 smoke zinciri disk-denetimi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/post-sprint-smoke.ts, tests/orchestra/smoke-audit.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-009 (proof-of-function). worker-default docs "deckent Smoke'u host-side koşar +
DONE→DEBT düşürür" diyor — disk-verify: post-sprint-smoke gerçekte var mı/çağrılıyor mu/Smoke-satırını
nereden okuyor? Eksik/kopuksa dürüst tespit + minimal-onarım (koşucu seam'li: exec inject); çalışıyorsa
kapsam-testi ekle (Smoke-fail→DONE-düşürme yolu).
### goNogo
- goCriteria: zincirin gerçek-durumu kanıtlı (file:line); kopuksa onarıldı + smoke-fail→downgrade
  testli (fake-exec); çalışıyorsa regression-testi; `tsc` temiz.
- nogo: gerçek-binary exec testte; DONE-düşürme semantiğini genişletmek.

## Task 15: MESSAGES-KEYS-4 — round-8 i18n (tek-yetkili)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, tests/cli/messages-round8-keys.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: GOLDENFLOW-CMD, APP-APPROVAL-WIRE, APR-TG-CHANNEL
### Description
Round-8 notes'larındaki key-ihtiyaçları (en+tr) — yalnız anahtar-ekleme, çakışma/fallback testli.
### goNogo
- goCriteria: ihtiyaçlar karşılandı (cite); en+tr; suite yeşil.
- nogo: tek-dilli; yapısal değişiklik.
