# REPL Surface — Mode-Indicator + Live-Footer + Approval-Card

> **Config:** `repl_surface.*` (`.deckent/config.json`, top-level) · **Default:** tüm alanlar off
> **Kaynak:** `src/cli/repl/app.tsx` + `src/cli/helpers/live-footer.ts` / `run-state-feed.ts` /
> `health-snapshot.ts` / `progress-reader.ts` + `src/cli/repl/approval-card.tsx` / `dual-stream.ts` /
> `approval-terminal-channel.ts` · **Doğuş:** sprint-354 (354-001) + sprint-355 (355-011)
> **Pivot bağlamı:** "terminal = ana yönetim + kullanım yüzeyi" (2026-06-29 stratejik pivot, TERM pillar)

## Ne yapar

Native REPL'i (deckent'in kendi terminal arayüzü) pasif bir chat penceresinden **canlı yönetim
yüzeyine** çevirir. İki bağımsız yetenek tek config bloğunda toplanır:

1. **Mode-indicator + live-footer** (`enabled`): REPL'in alt satırında sürekli güncellenen durum
   şeridi — aktif mod, koşan sprint/task'ın run-state feed'i (`run-state-feed.ts`), sistem sağlık
   özeti (`health-snapshot.ts`: provider/DB/disk sinyalleri) ve görev ilerleme okuyucusu
   (`progress-reader.ts`). Terminalden ayrılmadan "şu an ne oluyor?" sorusunun cevabı.
2. **Approval-card** (`approvals`): Approval Runtime'dan ([approval-runtime.md](approval-runtime.md))
   gelen bekleyen onay istekleri REPL içinde **Ink kartı** olarak render edilir; `dual-stream.ts`
   chat akışı ile onay akışını ayrıştırır, `approval-terminal-channel.ts` terminal'i canlı onay
   kanalı olarak broker'a bağlar. Karar terminalden verilir — dashboard'a geçmek gerekmez.

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `repl_surface.enabled` | `boolean` | `false` | Mode-indicator + live-footer yüzeyini açar. Kapalıyken render, eklenti-öncesi çıktıyla **byte-identical**. |
| `repl_surface.approvals` | `boolean` | `false` | Approval-card + dual-stream + terminal onay kanalını açar. `enabled`'dan **bağımsız** — footer kapalıyken bile bekleyen onay kartı render edilebilir. |
| `repl_surface.bg_turns` | `boolean` | `false` | **Rezerve** — background-turn-queue (`chat-turn-queue.ts`) yüzey kapısı için ayrılmış alan; bugün hiçbir kod okumaz (queue zaten koşulsuz çalışır). Follow-up task bu alanı bağlayacak. |

## Açınca ne değişir

- REPL açılışında footer şeridi belirir; sprint koştuğunda task ilerlemesi/health canlı akar.
- `approvals` ile: `require-approval` politikalı bir istek doğduğunda REPL'de kart açılır;
  terminal, relay'in kayıtlı kanallarından biri olur (telegram/nervous ile eşzamanlı).

## Kapalıyken garanti

Flag-off render **byte-identical** (354-001/355-011 kanıt-testleri) — hiçbir yeni node, hiçbir
davranış değişikliği. Bu, riskli-yüzey kör-default-on yasağının (quality bar) uygulamasıdır.

## Riskler

- Footer, terminal genişliği çok dar ortamlarda satır kaydırabilir (Ink yeniden-render eder; veri kaybı yok).
- `approvals` yalnız görünür yüzeydir — onayın **enforcement** tarafı `approval_gate` flag'ine bağlıdır
  (bkz. [approval-runtime.md](approval-runtime.md)); kartı açmak tek başına worker'ları durdurmaz.

## Kanıt

- Testler: `tests/` altında 354-001/355-011 aileleri (flag-off byte-identity + kart render + kanal köprüsü).
- Dogfood: **2026-07-02'den beri `enabled: true` + `approvals: true`** (deckent-dev `.deckent/config.json`).
