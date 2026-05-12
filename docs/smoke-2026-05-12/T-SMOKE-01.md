# T-SMOKE-01: Deckent CLI Komut Paleti Özeti

> Deckent CLI, AI destekli sprint orkestrasyon sistemidir. Bu belge, 16 ana komutun ne işe yaradığını, nasıl kullanıldığını ve hangi bağlamlarda tercih edilmesi gerektiğini özetler.

---

## Komut Referans Tablosu

| Komut | Özet |
|---|---|
| `deckent init` | Projeyi başlatır. `.deckent/`, `.brain/`, `.tasks/` dizinlerini oluşturur, CLAUDE.md ve DIRECTIVES.md referanslarını ekler. |
| `deckent plan` | DIRECTIVES.md dosyasını okur ve sprint için görev JSON dosyalarını `.tasks/` altında oluşturur. |
| `deckent start` | Planlanmış sprinti başlatır; worker'ları tmux veya subprocess olarak spawn eder ve Auditor tarama döngüsünü başlatır. |
| `deckent status` | Aktif sprint durumunu gösterir: çalışan worker'lar, tamamlanan görevler, uyarılar ve kapsam bilgisi. |
| `deckent attach` | Çalışan bir tmux worker session'ına bağlanır; worker'ın gerçek zamanlı çıktısını izlemeyi sağlar. |
| `deckent spawn` | Tek bir görevi bağımsız olarak arka planda worker olarak başlatır; tam sprint başlatmaya gerek kalmaz. |
| `deckent kill` | Aktif sprinti veya belirli bir worker'ı durdurur. Bu komut Alperen onayı gerektirir ve geri alınamaz bir işlemdir. |
| `deckent retro` | Son sprint retrospektifini görüntüler: öğrenimler, kararlar ve bir sonraki sprint için öneriler. |
| `deckent cleanup` | Sprint görev dosyalarını arşivler, kilitler serbest bırakır, tmux session'ları kapatır ve sprint durumunu temizler. |
| `deckent doctor` | Codebase sağlığını denetler: build durumu, test kapsamı, bağımlılık sorunları ve yapılandırma tutarlılığı. |
| `deckent config` | Proje konfigürasyonunu okur veya günceller; `read` ya da `set <key> <value>` alt komutlarıyla kullanılır. |
| `deckent history` | Geçmiş sprintlerin listesini, kararlarını ve sonuçlarını gösterir; `GO`, `NO_GO`, `GO_WITH_TECH_DEBT` durumlarıyla. |
| `deckent plugin` | Deckent plugin ekosistemiyle etkileşim kurar; plugin kurma, kaldırma ve listeleme işlemlerini yönetir. |
| `deckent upgrade` | Deckent CLI'yi ve bağımlı bileşenlerini en son kararlı sürüme günceller. |
| `deckent memory` | Memory V2 SQLite veritabanını yönetir: `recall`, `remember`, `rebuild`, `export`, `stats` alt komutlarını destekler. |
| `deckent sync` | Konfigürasyon ve manifest dosyalarını senkronize eder; agent/skill havuzunu ve proje ayarlarını günceller. |

---

## Komutlara Ayrıntılı Bakış

### `deckent init`
Yeni bir projede Deckent'i kurmak için çalıştırılır. Tek seferlik bir işlemdir ve çevre bağımsızdır: Claude Code, Cursor ve VS Code ortamlarında çalışır. Proje kökünü belirtmek için `--root` bayrağı kullanılabilir.

### `deckent plan`
DIRECTIVES.md dosyasındaki görev tanımlarını ayrıştırır ve her görev için `.tasks/task-NNN.json` dosyaları üretir. `--mode ai` ile yapay zeka tabanlı, `--mode structured` ile kural tabanlı planlama seçilebilir; `--mode auto` proje boyutuna göre otomatik seçim yapar.

### `deckent start`
Sprint'i başlatır ve worker'ları spawn eder. `--dry-run` ile görev listesi önizlenebilir ancak spawn edilmez. `--sprint-id` ile belirli bir sprint ID'si belirtilmez ise sistem otomatik üretir.

### `deckent status`
Anlık sprint tablosu gösterir. `--watch` bayrağıyla canlı izleme moduna geçilir; `--json` bayrağıyla ham JSON çıktısı alınır. Aktif heartbeat bilgileri, gecikmiş görevler ve Auditor uyarıları bu ekranda görünür.

### `deckent attach`
Tmux backend kullanılırken bir worker session'ına doğrudan bağlanmayı sağlar. Worker'ın düşüncesini ve adımlarını gerçek zamanlı olarak gözlemlemek için kullanılır.

### `deckent spawn`
Tek bir görevi sprint başlatmaksızın çalıştırır. Hızlı düzeltmeler veya izole görevler için uygundur. Görev ID ve dosya kapsamı parametresi alır.

### `deckent kill`
Çalışan sprint veya worker'ı zorla durdurur. **Dikkat:** Bu komut Alperen'in onayını gerektirir. `--all` ile tüm worker'lar, `--worker <id>` ile belirli bir worker durdurulur.

### `deckent retro`
Sprint bitiminde otomatik üretilen retrospektif raporunu görüntüler. Öğrenimleri, başarı oranlarını ve agent performansını içerir. Sprint tarihçesiyle birlikte `.brain/memory.db`'de saklanır.

### `deckent cleanup`
Sprint dosyalarını arşivler ve sistem durumunu sıfırlar. Aktif bir sprint üzerinde onaysız çalıştırılması yasaktır. Kilit dosyaları, heartbeat dosyaları ve görev JSON'ları bu işlemde temizlenir.

### `deckent doctor`
Projenin genel sağlığını denetler. `tsc --noEmit`, `vitest run`, bağımlılık kontrolü ve `.deckent/config.json` doğrulama adımlarını çalıştırır; sorunları öncelik sırasıyla listeler.

### `deckent config`
`deckent config read` ile mevcut konfigürasyonu gösterir. `deckent config set <anahtar> <değer>` ile belirli bir ayarı günceller. `max_workers`, `brain_provider`, `worker_tier` gibi alanlar bu komutla yönetilir.

### `deckent history`
Geçmiş sprint kayıtlarını listeler ve filtreleme destekler. Her sprint için durum, başlangıç/bitiş zamanı, görev sayısı ve nihai karar (`GO` / `NO_GO`) gösterilir.

### `deckent plugin`
Harici plugin'leri yüklemek (`install`), kaldırmak (`remove`) veya listelemek (`list`) için kullanılır. DeckentHub üzerinden dağıtılan Ed25519 imzalı plugin'leri destekler.

### `deckent upgrade`
Deckent'i npm üzerinden en güncel sürüme yükseltir. Güncelleme öncesinde mevcut sürümü ve değişiklik günlüğünü gösterir.

### `deckent memory`
Memory V2 SQLite altyapısını yönetir. `deckent memory recall "<sorgu>"` ile tam metin arama yapılır; `deckent memory rebuild` ile `.md` dosyalarından veritabanı yeniden oluşturulur; `deckent memory stats` ile kayıt sayısı ve şema sürümü görüntülenir.

### `deckent sync`
Agent manifest'lerini, skill kayıtlarını ve proje konfigürasyonunu merkezi `.deckent/` diziniyle senkronize eder. CI/CD pipeline'larında yapılandırma tutarlılığını sağlamak için kullanılır.

---

*Bu belge Sprint 153 Smoke Test kapsamında oluşturulmuştur — 2026-05-12.*
