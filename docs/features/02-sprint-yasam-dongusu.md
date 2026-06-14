# Sprint Yaşam Döngüsü — PLAN'dan CLEANUP'a 8 Faz

> Deckent, bir sprint'i baştan sona yönetmek için sekiz aşamalı deterministik bir döngü çalıştırır.

## Ne işe yarar?
- Görev planlama, spawn etme, yürütme ve değerlendirmeyi tek pipeline'da birleştirir.
- Her faz belirli bir sorumlunun (Brain / Worker / Auditor) kontrolünde geçer.
- Bir faz tamamlanmadan bir sonraki başlamaz — tutarlı sprint durumu garanti altındadır.
- Checkpoint mekanizması, sprint'in herhangi bir noktadan devam edilmesine olanak tanır.
- Tüm faz geçişleri ADR-035 event-stream protokolüne yazılır.

## Neden önemli?
- Yarım kalan sprint'ler yok: CLEANUP çalışmadan sprint "tamamlandı" sayılmaz.
- Her faz kendi hata sınırıyla çalışır — bir görev NO_GO olsa bile diğerleri etkilenmez.
- Auditor, 30 saniyelik scan döngüsüyle tüm fazlarda bağımsız denetim yapar.

## Nasıl çalışır?

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

| Faz | Sorumlu | Ne Olur |
|-----|---------|---------|
| **PLAN** | Brain | DIRECTIVES okunur, task JSON'ları `.tasks/` altına yazılır. |
| **SPAWN** | Brain | Worker'lar tmux / Docker / subprocess olarak başlatılır; Auditor scan döngüsü açılır. Bağımlılık pipeline etkinse görevler Kahn topological dalgalara ayrılır. |
| **EXECUTE** | Worker | Worker'lar görevleri uygular, heartbeat (`.hb`) dosyaları günceller. |
| **EVALUATE** | Brain | `.result` dosyaları değerlendirilir: **GO / NO_GO / GO_WITH_TECH_DEBT**. |
| **FIX** | Brain + Worker | Başarısız görevler önceliklendirilmiş sırada yeniden denenir. |
| **RETRO** | Brain | Sprint öğrenimleri ve retrospektif `memory.db`'ye yazılır. |
| **DECAY** | Brain | `.brain/` bellek bütçesi aşıldıysa eski girişler budanır. |
| **CLEANUP** | Brain | Task dosyaları arşivlenir, kilitler serbest bırakılır, oturumlar kapatılır. |

## Komut / Örnek

```bash
# Sprint başlatmak
deckent plan --structured   # görevleri planla
deckent start                    # sprint'i başlat

# İlerlemeyi izlemek
deckent status                   # anlık görüntü
deckent status --watch           # canlı takip

# Sprint sonrası
deckent retro                    # retrospektifi oku
deckent cleanup                  # arşivle ve temizle
```

## Durum
- Olgunluk: ✅ canlı — sprint-285+ aktif kullanım, yüksek import sayısı
- İlgili: ADR-025 · ADR-043 · ADR-044 · ADR-046
- Modüller: `src/orchestra/sprint-controller.ts` · `src/orchestra/sprint-phases.ts`
