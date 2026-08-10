# 01 — Scope, Methodology and Evidence

## Kapsam

İnceleme şu authority/evidence corpus'unu kapsadı:

- `AGENTS.md`, `DECKENT.md`, ilgili role kuralları
- `PAZARTESI.md`, `docs/MASTER-PLAN.md`, generated active ledger
- `docs/en/vision.md`, workspace Identity ve Hermes-vs-Deckent yön kararı
- `src/**`, `tests/**`, `scripts/**`, `.github/workflows/**`
- Mevcut analysis/diff/coverage raporları ve package metadata
- Salt-okunur live schema snapshot'ı: provider execution observation DB

İnceleme kod değişikliği, fix veya runtime mutasyonu içermez.

## Snapshot ve reproducibility

- Branch: `main`
- HEAD: `aeb60c6b70cd578dba6c12819d2ee05c6cea0888`
- Commit zamanı: `2026-08-03T11:49:25+03:00`
- Analiz başlangıcı: `2026-08-03T11:51:07+03:00`
- Runtime: Node 24.15.0; package engine `>=24`
- İnternet kullanılmadı.

Başlangıçta önceden mevcut worktree durumu:

- `M .deckent/provider-execution-observations.db`
- `?? .deckent/runtime/bot-listen.log`

İnceleme sırasında başka bir süreç/oturumdan şu drift eklendi; analiz bunları oluşturmadı, değiştirmedi veya doğrulamadı:

- `M scripts/test-failure-baseline.json` — final working copy 114 dosya/565 failure'a indirildi; snapshot HEAD değeri 115/591'dir
- `M tests/cli/commands.test.ts`
- `M tests/cli/commands/status-mode.test.ts`
- `M tests/cli/commands/status.test.ts`

## Yöntem

1. Authority ve hedef dokümanlarını tam okuma.
2. Repository/LOC/test/ledger statik envanteri.
3. Vision capability'lerinden canonical producer→consumer→ingress→config→proof trace'i.
4. Kritik iddiaları source line ve salt-okunur disk kanıtıyla çapraz kontrol.
5. Üç paralel same-provider domain peer audit: plan/vision, runtime/architecture, surface/quality/scale.
6. Ana ajan sentezi, çelişki çözümü, risk register ve dependency DAG.

## Kanıt sınıfları

| Sınıf | Anlam |
|---|---|
| `EVIDENCE-CONFIRMED` | Acceptance'ı bağımsız source/disk/receipt kanıtı kapatıyor |
| `PARTIAL` | Zincirin bazı katmanları var, production closure eksik |
| `TEST-ONLY` | Test/fixture kanıtı var; gerçek entrypoint/live proof yok |
| `UNWIRED` | Kod/contract var, canonical consumer veya ingress yok |
| `NOT-STARTED` | Kanıtlanmış code/wire/enable/proof yok |
| `STALE` | Kayıt doğru olmuş olabilir, fakat current HEAD/truth ile güncel değil |
| `CONTRADICTED` | Current source/disk başka bir gerçek gösteriyor |
| `UNKNOWN/HOLD` | Gerekli authority veya kanıt yok; dürüst sonuç verilemiyor |

## Sınırlamalar

- Build/lint/test çalıştırılmadı; dolayısıyla static doğruluk runtime sertifikası değildir.
- Deckent dogfood kapalı tutuldu; sprint/Goal/Mission/Flow/Run başlatılmadı.
- 323 MASTER satırının tamamı deterministic ledger audit'inden geçirildi; yalnız critical path ve yüksek riskli örnekler bağımsız source-level trace edildi.
- Same-provider peer audit XVerify değildir. Farklı provider kullanılmadığından XVerify `unavailable/HOLD`.
- Eforlar repository-static ROM'dur; owner capacity, exact team topology, provider entitlement ve platform lab availability bilinmediği için takvim taahhüdü değildir.
