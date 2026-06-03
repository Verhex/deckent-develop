# CLI Komutları — 52 Komutla Tam Orkestrasyon Kontrolü

> Terminalde tek bir `deckent` ikili ile sprint planla, başlat, izle, retrospektif yaz ve hafızana sor — hiçbir şeye gerek yok.

## Ne işe yarar?

- **52 kayıtlı CLI komutu** — `deckent init`'ten `deckent rbac`'e kadar tam sprint yaşam döngüsü ve yardımcı araçlar (kaynak: `src/cli/index.ts`).
- **REPL varsayılanı** — argümansız `deckent` → agentic sohbet REPL açılır (ADR-081); `deckent chat --native` ile aynı.
- **Hafıza CLI** — `deckent recall "sorgu"`, `deckent remember "not"`, `deckent memory stats|export|rebuild`.
- **Model ve maliyet kontrolü** — `deckent models list`, `deckent cost` ile token/maliyet özeti.
- **CLI/MCP parity** — her CLI komutu karşılığı MCP aracıyla eşdeğer parametreleri paylaşır (ADR-022-V2).

## Neden önemli?

- **Sıfır-bağımlılık** — tek runtime bağımlılık `commander.js` (ADR-010); yüzlerce araç değil tek ikili.
- **IDE'siz tam kontrol** — CI pipeline, terminal otomasyon veya script'ler üzerinden tüm sprint yaşam döngüsü yönetilebilir.
- **Keşfedilebilir** — `deckent --help`, `deckent <komut> --help` yeterli; kılavuz okumak zorunda değilsiniz.

## Nasıl çalışır?

1. **Kayıt deseni** — her komut `registerXxx(program)` fonksiyonu ile `src/cli/index.ts`'te kayıtlı (ADR-012).
2. **Giriş noktası** — `src/cli/entry.ts` `buildProgram()` çağırır, argüman yoksa `chat --native`'e yönlendirir.
3. **Hata yönetimi** — tüm hatalar `handleCliError()` üzerinden yönlendirilir; `process.exit(1)` ile temiz çıkış.

## Komut / Örnek

```bash
# Sprint yaşam döngüsü (temel akış)
deckent init                        # Projeyi başlat (.deckent/, .brain/, .tasks/)
deckent plan --mode structured      # DIRECTIVES.md'yi oku, task JSON'larını oluştur
deckent start                       # Worker'ları spawn et, sprint başlat
deckent status                      # Aktif sprint durumunu göster
deckent review                      # GO / NO_GO / GO_WITH_TECH_DEBT değerlendirmesi
deckent retro                       # Retrospektif raporu göster
deckent cleanup                     # Task dosyalarını arşivle, sprint temizle

# Hafıza ve analiz
deckent recall "docker heartbeat"   # Hafızada FTS5 arama
deckent remember "P0 bug found"     # Yeni hafıza kaydı ekle
deckent memory stats                # Hafıza veritabanı istatistikleri

# Agent ve skill yönetimi
deckent agent list                  # Kayıtlı agent'ları listele
deckent skill list                  # Kayıtlı skill'leri listele
deckent evolve report               # Cross-sprint agent/skill trend raporu

# Model ve maliyet
deckent models list                 # Kayıtlı 13 modeli provider/tier ile listele
deckent cost                        # Sprint token kullanım özeti

# Yardım
deckent --help                      # Tüm komutların listesi
deckent start --help                # Belirli komut yardımı
```

### Tam Komut Listesi (52 adet — kaynak: `src/cli/index.ts`)

| Kategori | Komutlar |
|----------|----------|
| Sprint yaşam döngüsü | `init`, `plan`, `start`, `status`, `attach`, `spawn`, `kill`, `retro`, `cleanup`, `review`, `finalize`, `recover`, `resume`, `checkpoint` |
| Analiz & izleme | `doctor`, `analyze`, `history`, `explain`, `watch`, `audit`, `audit-verify`, `output` |
| Konfigürasyon | `config`, `sync`, `docs`, `set-directives`, `mode`, `flow` |
| Agent / Skill / Model | `agent`, `skill`, `models`, `evolve` |
| Hafıza | `recall`, `remember`, `memory` |
| Agentic REPL & sohbet | `chat`, `heartbeat` |
| Raporlama & maliyet | `cost`, `features` |
| Sistem | `help`, `serve`, `web`, `dashboard`, `rbac`, `nervous`, `config-nervous` |
| Kurulum & geliştirme | `onboard`, `upgrade`, `plugin`, `run`, `test-run` |

## Durum

- Olgunluk: ✅ canlı — tüm 52 komut `buildProgram()` ile kayıtlı, `deckent --help` ile erişilebilir
- İlgili: ADR-012 (register\<Name\> Pattern) · ADR-010 (Tek Runtime Dependency) · ADR-022-V2 (CLI/MCP Parity)
- Modül: `src/cli/index.ts` (kayıt hub'ı) · `src/cli/entry.ts` (giriş noktası) · `src/cli/commands/` (52 komut)
