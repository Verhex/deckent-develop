# Tmp-dogfood → main kontrollü eşitleme — kanıt korpusu (2026-08-27)

MASTER satırı: **3356 / TMP-DOGFOOD-MAIN-CONTROLLED-SYNC-001** (P03). Owner admission:
Alperen soru-cevap kaydı 2026-08-28 ("ADMIT — kuyruk sonuna").

Bu dizin, `/tmp/deckent-md-contract-authority-20260827` worktree'sinde (base+HEAD
`417f4955b`) üretilen ve `/tmp` volatilitesine karşı kalıcılaştırılan devir kanıtıdır.
Hazırlık anındaki main: `a4913b140` (base'den 23 commit ileride; 16 doğrudan path çakışması).

## İçerik

- `handoff/` — 11 devir dokümanı. Ana giriş:
  `MAIN-CONTROLLED-SYNCHRONIZATION-HANDOFF.md` (paket disposition'ları + kopyalanabilir
  ana-session promptu) ve `MAIN-CONTROLLED-SYNCHRONIZATION-RECEIPT.json`
  (receipt digest `sha256:7bfc410f…` — ana-şeritte canonical-JSON yeniden-hesapla doğrulandı,
  DIGEST-MATCH, 2026-08-28).
- `source-evidence.patch` — tmp tracked diff'inin **source-only** kesiti
  (`src/ tests/ scripts/ docs/ DECKENT.md GEMINI.md SECURITY.md .claude .codex .cursor .gemini`);
  never-transfer sınıfı (`.brain/ .deckent/ DIRECTIVES.md` ve runtime/generated path'ler) bilinçli
  DIŞARIDA bırakıldı.
- `untracked-source/` — tmp'de untracked kalmış 5 source/test/script dosyasının bire-bir kopyası.

## ⚠️ Kullanım sınırı

Bu korpus **UYGULANMAK İÇİN DEĞİL, REFERANS İÇİNDİR**. Devir kararı: wholesale merge /
`git apply` / cherry-pick **NO-GO**; her paket güncel main API/i18n/CLI contract'ları üzerine
**yeniden uygulanır** (paket-paket, bağımsız verification ile). Autonomous cleanup/status (P6)
ve terminal/finalizer snapshot'ı (P7) **HOLD** — ayrı owner-admitted outcome ister; bu patch'in o
bölümleri de yalnız tarihsel kanıttır. Uygulama-önü zorunlu gate: `PROVIDER-OBS-MIGRATION-001`
(Work 480) kapanışı veya canlı owner istisnası.

## Silinme-tetiği

TMP-DOGFOOD-MAIN-CONTROLLED-SYNC-001 terminal disposition (DONE/DISPOSED) aldığında bu dizin
owner kararıyla arşive taşınır veya silinir; kalıcı kayıt MASTER satır-kanıtıdır.
