# EXPLORATION-BONUS DALGASI — az-kanitli ajanlara kesif-payi (flag-gated, default-OFF)

## Goal

Routing V3'e rich-get-richer kirici kesif-payi eklenir: stage-verified eligible ama az-kanitli
(cells totalUses < CELL_MIN_USES) adaya finalScore-katmaninda kucuk blend-bonusu
(`s + b*(1-s)`), config-gated `routing_v3.explorationBonus` skaleriyle, DEFAULT 0 = OFF.
Bugunku olcum: uses dagilimi implementer 305 / api-builder 233 / ci-guardian 2 — soguk hucre
zaten NOTR (ceza yok), sorun kanit-yoklugu dongusu. Gorunurluk story-detail'e yazilir; decision
ve journal semalari DEGISMEZ. Owner-onayli plan: /home/alperen/.claude/plans/snuggly-doodling-stream.md

## Execution contract

- Otorite: main'deki kontratlar; assertion zayiflatilmaz. Kesif-referanslari task
  Description'larinda exact dosya:satir olarak verilmistir — once oku, sonra degistir.
- Yalniz kendi Files listendeki dosyalara yaz; Reads listendekileri OKU. Scope disina cikma.
- 0-hardcode: yeni esik/deger yok — soguk-esik mevcut CELL_MIN_USES sabitinden, bonus-katsayisi
  yalniz config'ten; default'un tek kaynagi DEFAULT_ROUTING_V3_CONFIG.
- `finalScore <= 1` zod-pini (decision-types.ts:106/:123/:139) ve journal parse (journal.ts:38)
  KORUNUR — additive degil blend; ScoredCandidate/RoutingDecisionV3 semalarina alan EKLENMEZ.
- Mevcut corpus-harness ve tie-judge suite dosyalarina DOKUNULMAZ — default-0 onlari yesil
  tutmali; kirilirlarsa davranis-notrluk ihlali var demektir, NO_GO + exact kanit.
- Testler hermetik (tmpdir); VITEST_MAX_FORKS=2. Scoped vitest yetmez: degistirdigin dosyalar
  icin `npx tsc --noEmit` SIFIR hata; tsc ciktisini result notes'a yaz.
- Aktif run sirasinda build/provider-auth/bot mutation YASAK.

## Task 1: config knob — routing_v3.explorationBonus (default 0)
- Files: src/core/routing/config.ts, src/core/config-types.ts, tests/core/routing/config.test.ts, tests/core/routing/foundation-roundtrip.test.ts
- Reads: src/core/routing/route-task-v3.ts, src/core/routing/stage-rank.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/routing/config.test.ts tests/core/routing/foundation-roundtrip.test.ts
### Description
`explorationBonus` skaleri uc tek-kaynak dokunusla eklenir: (a) ROUTING_V3_SCHEMA (.strict,
config.ts:35-47) — `z.number().min(0).max(1)` sinirli alan; (b) DEFAULT_ROUTING_V3_CONFIG
(config.ts:59-74) — deger 0, yanina signalGatedNumerical (config.ts:70-73) tarzinda
davranis+rollback yorumu ("0 = OFF; kesif-payi yalniz acikca yapilandirilinca"); (c)
RoutingV3Config arayuzu (config-types.ts:566-589). `weights` bloguna GIRMEZ (sumWeights=1.0
kontrati config.ts:78-80/:127-130 aynen). Test-eki: config.test.ts'e yeni-anahtar kabulu +
defaults-esitligi guncellemesi (:115/:120 bolgesi) + gecersiz-deger (negatif, >1) reddi;
foundation-roundtrip.test.ts'e 3-katman merge'te explorationBonus tasima pini (mevcut :127-160
deseninde). Baska davranis degisikligi YOK — bu task yalniz konfigurasyon yuzeyi.

## Task 2: bonus mekanigi + gorunurluk (finalScore-katmani blend)
- Files: src/core/routing/route-task-v3.ts, src/core/routing/stage-rank.ts, src/core/routing/decision-story.ts, tests/core/routing/engine-slice1.test.ts, tests/core/routing/ci-guardian-eligibility.test.ts
- Reads: src/core/routing/learning-cells.ts, src/core/routing/axis-numerical.ts, src/core/routing/decision-types.ts, src/core/routing/journal.ts, src/core/routing/agent-lint.ts, src/core/routing/config.ts, src/core/skill-profile-derivation.ts, src/core/skill-types.ts
- Priority: HIGH
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/routing/engine-slice1.test.ts tests/core/routing/ci-guardian-eligibility.test.ts
### Description
(a) route-task-v3.ts:215-227 aday-map'inde per-aday bonus hesabi: `totalUses(agentId)` cells
ledger Map'inden (:180 kapsamda; anahtar `${workType}|${domain}|${agentId}`, buildCellKey
learning-cells.ts:185) agentId-suffix eslemesiyle toplanir;
`b = config.explorationBonus * max(0, 1 - totalUses/CELL_MIN_USES)` (CELL_MIN_USES
axis-numerical.ts:18'den import — yeni sabit YOK); explorationBonus 0 iken kod-yolu erken-cikisla
bit-notr kalir (hesap da yapilmaz). (b) stage-rank.ts:13-16 RankInput'a OPSIYONEL
`explorationBonus?: number`; :52-60 map'inde `base` agirlikli-toplam hesaplandiktan sonra
`finalScore = base + (c.explorationBonus ?? 0) * (1 - base)` — clamp gerekmez (blend <= 1),
confidence/indecision (:74-82) blended skordan turedigi icin otomatik tutarli. agent-lint.ts
:141-153 alani gecmedigi icin bit-identical kalir — degistirme. (c) decision-story.ts rank
adiminin detail'ine (:87-92; sema serbest, decision-types.ts:70) bonus>0 olan adaylar icin
`explorationBonus` degeri ve kazanani bonus degistirdiyse `bonusDecisive: true`; ozet-cumle
(:39-46/:115) bonusDecisive iken eksen-iddiasi yerine kesif-payini adlandirir (line 80-kolon
klibi decision-story.ts:19-21 korunur). ScoredCandidate/RoutingDecisionV3'e alan EKLENMEZ.
Test-eki: engine-slice1.test.ts'e 4 pin — opsiyonel-alan-yoklugu bit-identical; blend hicbir
skoru 1 uzerine tasimaz; bonus'lu determinizm (ayni girdi ayni cikti); rank tie-break zinciri
(:61-66) bozulmaz. ci-guardian-eligibility.test.ts:63-90 mevcut "ranked'te var" pini KORUNUR
ve yanina nonzero-bonus fixture'inda (explorationBonus orn. config-override ile) soguk
ci-guardian'in eligible senaryoda KAZANDIGI pini eklenir.

## Task 3: davranis-bekcisi — default-0 notrluk + nonzero davranis pinleri
- Files: tests/core/routing/exploration-bonus.test.ts
- Reads: src/core/routing/route-task-v3.ts, src/core/routing/stage-rank.ts, src/core/routing/decision-story.ts, src/core/routing/config.ts, src/core/routing/agent-lint.ts, tests/core/routing/corpus-harness.test.ts
- Priority: NORMAL
- Dependencies: Task 1, Task 2
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/routing/exploration-bonus.test.ts
### Description
YENI hermetik dosya (Reads listesindeki mevcut corpus-harness suite'ine DOKUNMADAN, onun
fixture desenini ogrenerek) 5 it: (1) default-0 notrluk — ayni aday-kumesi uzerinde explorationBonus=0 ve alan
tamamen yokken routeTaskV3 karar ciktisi BIT-AYNI (JSON.stringify esitligi); (2) nonzero'da
soguk-eligible ajan erisilebilir skor-araliginda one gecer, sicak (totalUses >= CELL_MIN_USES)
ajan bonus almaz; (3) blend siniri — asiri girdilerde bile hicbir finalScore > 1 ve journal
appendDecision parse'i gecer; (4) agent-lint ciktisi bonus-config'ten bagimsiz bit-identical;
(5) tie-uretimi olculur-pinlenir: bonus'un kazanan-ikinci farkini TIE_EPSILON altina indirdigi
kurgu senaryoda indecision 'tie' dogru raporlanir (sessiz flip yok).
