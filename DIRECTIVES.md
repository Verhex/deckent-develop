# DIRECTIVES — 7086 NATIVE-CONTEXT-LIFECYCLE: ölçülmüş admission + dinamik output tavanı + hidden-reasoning continuation + context epoch + @ref soyağacı

## Goal

MASTER 7086 (owner admission 2026-08-18: "Codex analiz sonucu bunu da değerlendirerek
sonraki sprinte dahil edelim"). Authority satırı: NATIVE-AGENT-HORIZON-001 ailesi.
Sonuç: uzun süren native chat/agent işi manuel `devam` olmadan, yanlış context
uyarısı olmadan ve sessiz durum kaybı olmadan akıcı çalışır.

KANIT TABANI (iki bağımsız, receipt'li RCA — hipotez değil ölçüm):
- Codex handoff: `.analysis/handoff-native-context-lifecycle-2026-08-18.json`
  (receiptDigest sha256:ab3a9a3a…) + kabul/kapanış otoritesi
  `.analysis/native-context-lifecycle-rca-2026-08-18.md` (scope digest
  sha256:8a8dea2c… bağımsız doğrulandı). BU DOSYAYI OKU — kapanış sözleşmesi odur.
- Fable→Sol xverify kompozisyonu 3/3 CONFIRMED: `0d4f3666…` (probe config-şartlı +
  100k hayalet tavan), `752b074e…` (fitting hayalet tavana bakıyor + checkpoint
  çağrısı tam-transcript taşıdığından tıkanınca kendisi de sığmıyor), `897936bd…`
  (renew transcript'e dokunmuyor; max_tokens şartlı geçiyor).

DÖRT AYRI failure sınıfı (karıştırılamaz): (1) OUTPUT-CAP: outputReserve=4096 wire
max_tokens oluyor, Qwen bunu hidden reasoning'e harcıyor, adapter reasoning_content'i
okumuyor, görünür içerik boş + finish=length → UI bunu yanlışça context sanıyor
(ölçüldü: 88,599 input / 131,072 n_ctx — 36k headroom VARDI); (2) GERÇEK OVERFLOW:
222,682 token istek vs 131,072 pencere — chars/4 tahmini 126k demişti, yani mevcut
context-budget.ts konservatif authority DEĞİL; (3) @REF ŞİŞMESİ: 26 karakterlik ham
girdi 99,353 karakter expanded payload olarak transcript'e KALICI yazılıyor,
checkpoint bunu yeniden taşıyor; (4) /renew yalnız çalışma bütçesini yeniler —
context epoch'unu değil.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Sprint sırasında local-llm daemon'ı durdurma; provider auth mutation YOK.
- Billing/cost/usage/audit kümülatif gerçeği HİÇBİR mekanizmayla sıfırlanmaz;
  fail-closed zayıflatılmaz; sonsuz continuation YOK (bounded + typed HOLD).
- Chain-of-thought KULLANICIYA AÇILMAZ — hidden reasoning yalnız typed metadata/usage.
- i18n-FIRST: user-facing metin getMessage en+tr; mekanizma string-free. Mevcut
  canonical audit sink kullanılır; prompt gövdesi audit'e yazılmaz (privacy-safe).
- Parallel execution ADMITTED; single-writer chokepoints: ONLY Task 1 writes
  src/agent/context-budget.ts + src/agent/provider-tooluse/types.ts; ONLY Task 2
  writes src/agent/provider-tooluse/openai.ts + anthropic.ts; ONLY Task 3 writes
  src/agent/loop.ts + src/agent/events.ts; ONLY Task 4 writes src/agent/session.ts +
  src/agent/transcript.ts (varsa) + src/cli/repl/native-agent-bridge.ts; messages.ts
  yazımı YALNIZ Task 5.
- Provider-family string switch capability discovery yerine GEÇEMEZ (RCA §1).
- Echo the policy digest in your .result as runPolicyEvidence exactly as the
  prompt's Result contract instructs.

## Task 1: Provider-neutral istek ölçümü + typed admission authority
- Files: src/agent/context-budget.ts, src/agent/provider-tooluse/types.ts, src/cli/repl/native-transport.ts, tests/agent/request-measurement.test.ts
- Scope: src/agent/, src/cli/repl/, tests/agent/, tests/cli/
- Provider: codex
- Model: gpt-5.6-sol

### Description
RCA §1. Async provider capability: GERÇEK wire isteğini ölç (system + messages +
tools + chat template). Sonuç: {inputTokens, quality: 'exact'|'conservative-upper-bound',
provenance, requestDigest, model/context identity}; bounded timeout + cache.
- llama.cpp/OpenAI-compatible: sunucu ilan ediyorsa `/apply-template` + `/tokenize`.
- Anthropic: token-count endpoint'i (destekleniyorsa).
- Diğerleri: KANITLI konservatif üst-sınır — heuristik asla 'exact' etiketlenemez;
  chars/4 tek başına authority olmaktan çıkar (incident: 222K gerçek vs 126K tahmin).
- Admission: mahkûm istek modele GİTMEZ; typed karar (INPUT_CONTEXT_OVERFLOW sınıfı)
  dış kullanıcı turn'ünü korur. NT-07 probe'u config-şartlı olmaktan çıkar: efektif
  context TÜM native provider'larda sunucu/registry'den çözülür; hiçbir fallback
  gerçek pencereden İYİMSER olamaz (100k hayalet tavan ölür — receipt 0d4f3666).
- Test (hermetik): incident-şekilli sayaç ~222K dönerken chars/4 ~126K — mahkûm
  çağrının HİÇ gönderilmediği assert edilir; exact ve upper-bound yolları ayrı ayrı.

GO: tsc 0; scoped suite yeşil; doomed-request-never-sent kanıtı; iyimser fallback
kalmadı. NO_GO: herhangi bir yol ölçümsüz dispatch yapabiliyorsa.

## Task 2: Dinamik output tavanı + adapter paritesi (depends on Task 1)
- Files: src/agent/provider-tooluse/openai.ts, src/agent/provider-tooluse/anthropic.ts, tests/agent/output-ceiling-parity.test.ts
- Scope: src/agent/provider-tooluse/, tests/agent/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
RCA §2. `outputReserveTokens` = korunan MINIMUM cevap alanı; wire tavanı DEĞİL.
Güvenli tavan = f(ölçülmüş input, context size, safety reserve, model-registry
output limiti, policy, kalan session bütçesi). İki transport da normalized
sözleşmeye uyar: openai.ts şartlı max_tokens yerine hesaplanan tavanı geçirir;
anthropic.ts'teki `opts.maxTokens ?? 4096` hardcode'u ölür (KANUN 10).
Test: 93.5K-input incident şekli 4,096'dan BÜYÜK güvenli tavan alır; iki adapter'ın
tavan davranışı parity-test edilir.

GO: tsc 0; scoped yeşil; parity + >4096 kanıtı. NO_GO: sabit 4096 herhangi bir
yolda wire tavanı olarak yaşarsa.

## Task 3: Hidden-reasoning farkındalığı + bounded continuation + atomik tool güvenliği (depends on Task 2)
- Files: src/agent/loop.ts, src/agent/events.ts, src/agent/provider-tooluse/sse.ts, tests/agent/reasoning-continuation.test.ts
- Scope: src/agent/, tests/agent/
- Provider: codex
- Model: gpt-5.6-sol
- Dependencies: Task 2

### Description
RCA §3. OpenAI-compatible stream'de `delta.reasoning_content` typed metadata/usage
olarak izlenir (görüntülenmez). Typed ayrım: OUTPUT_LIMIT / CONTEXT_OVERFLOW /
EMPTY_VISIBLE_AFTER_REASONING / transport-empty. finish=length'te AYNI mantıksal
turn içinde bounded otomatik continuation: görünür segment stitch + dedup, usage/
bütçe muhasebesi, recovery provenance; tükenince typed HOLD (kullanıcıya 'devam'
yazdırmak ÇÖZÜM DEĞİL). Length'te yarım kalan tool-call ASLA execute edilmez —
yalnız tamamlanmış+doğrulanmış argüman sınırından sonra commit (bugünkü drain
yolu kapatılır). Reasoning-only length boş assistant turn'üne DÖNÜŞEMEZ.
Test: reasoning+length+visible-empty otomatik tek görünür cevaba toparlanır;
çoklu segment TAM BİR kez stitch'lenir; partial tool-call asla koşmaz.

GO: tsc 0; scoped yeşil; üç incident-şekilli kanıt. NO_GO: sonsuz continuation
mümkünse veya partial tool-call koşabiliyorsa.

## Task 4: Context epoch'ları + yapılandırılmış @ref soyağacı + /renew semantiği (depends on Task 1)
- Files: src/agent/session.ts, src/cli/repl/native-agent-bridge.ts, src/cli/repl/run.tsx, tests/agent/context-epoch-lineage.test.ts
- Scope: src/agent/, src/cli/repl/, tests/agent/, tests/cli/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
RCA §4-§6. (a) EPOCH: checkpoint isteği = önceki checkpoint özeti + yalnız bounded
DELTA (tam transcript değil); sığmıyorsa recursive chunk+merge; checkpoint çağrısı
da AYNI admission/usage/audit zincirinden geçer; yeni epoch'un exact-fit'i doğrulanıp
orijinal turn bir kez retry edilir (typed overflow → tek bounded kurtarma yolu).
Proaktif ölçülmüş high-water mark tetiklemesi (tıkanmadan ÖNCE). (b) @REF: ham
kullanıcı niyeti / provider-expanded payload / referans tanımlayıcıları (canonical
path + digest + excerpt lineage) AYRI taşınır; transcript ham yazılan satırı tutar;
`compactForContextEpoch` objective olarak 26-karakterlik ham niyeti + lineage'ı
kullanır, 99KB expansion'ı DEĞİL; compaction gerekli alıntı+digest'i korur, tam eki
kopyalamaz. (c) /renew: kümülatif billing/cost/usage gerçeği aynen; çalışma bütçesi
yenilenir VE güvenli context-epoch tazelemesi planlanır/yapılır — normal akışta
manuel renew gereksizleşir.
Test: overflow'lu tam transcript bounded delta'lardan başarıyla checkpoint'lenir;
26-karakter niyet + 99,327-karakter expansion → ham niyet+lineage'a compact olur;
/renew kümülatifi korur + context'i güvenle tazeler.

GO: tsc 0; scoped yeşil; üç incident-şekilli kanıt. NO_GO: checkpoint yolu tam
transcript taşımaya devam ediyorsa veya kümülatif sayaç herhangi bir yerde sıfırlanıyorsa.

## Task 5: Typed UX + i18n + canonical audit (depends on Task 3, Task 4)
- Files: src/cli/helpers/messages.ts, src/cli/repl/native-agent-bridge.ts, tests/cli/context-lifecycle-ux.test.ts
- Scope: src/cli/, tests/cli/
- Provider: claude
- Model: claude-sonnet-5
- Dependencies: Task 3, Task 4

### Description
RCA §7. Beş typed durum ayrı, i18n-temiz (en+tr) mesajlar: INPUT_CONTEXT_OVERFLOW,
OUTPUT_CEILING_REACHED, CONTINUATION_EXHAUSTED, EMPTY_VISIBLE_CONTENT_WITH_REASONING,
REFERENCE_EXPANSION_REQUIRES_CHECKPOINT. Terminal output-exhaustion ile
context-overflow'u ASLA karıştırmaz (bugünkü 'context penceresi dolmuş olabilir'
yanlış-etiketi ölür). Canonical audit sink'e privacy-safe lifecycle olayları:
ölçülen token, quality/provenance, headroom, kept/dropped, epoch/checkpoint digest,
continuation index, stop reason, hidden-reasoning-observed bool, recovery action —
prompt gövdesi YOK. Test: en+tr mesajlar + beş sınıfın ayrıştığı UX kanıtı.

GO: tsc 0; scoped yeşil; beş sınıf iki dilde kanıtlı. NO_GO: tek bir sınıf başka
sınıfın mesajını gösterirse.

## Task 6: Incident-şekilli hermetik battery — 11 regresyon kanıtı (depends on Task 5)
- Files: tests/agent/context-lifecycle-battery.test.ts
- Scope: tests/agent/, tests/cli/
- Provider: claude
- Model: claude-sonnet-5
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5

### Description
RCA 'Mandatory regression proof' listesinin 11 maddesi tek hermetik battery'de:
(1) 222K-gerçek/126K-tahmin şekli — mahkûm çağrı gönderilmez; (2) 93.5K şekli
>4,096 tavan alır; (3) reasoning+length+boş-görünür → tek görünür cevap;
(4) çoklu segment tam bir kez stitch; (5) length'te partial tool-call asla koşmaz;
(6) overflow'lu transcript bounded delta'dan checkpoint'lenir; (7) 26-karakter/
99,327-karakter compaction; (8) /renew kümülatif korur + güvenli tazeler;
(9) exact ve upper-bound yolları; (10) openai/anthropic tavan paritesi;
(11) en+tr typed mesajlar. Kapsam sayımı .result notes'a; eksik varsa adlı adınca.

GO: battery 11/11 yeşil; tsc 0. NO_GO: tek madde mock-only kalırsa (gerçek kod
yolu yerine fixture-local reimplementation = UNWIRED).
