# Sprint Kill ve Cleanup Disiplini

## Genel Bakış

Deckent'te bir sprint'i durdurmak veya temizlemek kasıtlı olarak yavaş bir süreç olarak tasarlanmıştır. Yanlışlıkla yürütülen bir `kill` veya `cleanup` komutu tamamlanmış çalışmaları, aktif worker oturumlarını ve sprint durumunu geri alınamaz biçimde yok edebilir. Bu nedenle her iki komut da **kullanıcı onayı gerektiren** ve yıkıcı (destructive) olarak işaretlenmiş işlemlerdir.

---

## Sprint Kill — Kullanıcı Onayı Zorunluluğu

`deckent kill` komutu, çalışan worker'ları ve aktif sprint oturumlarını durdurur. İki hedef modunda çalışır:

| Mod | Açıklama |
|-----|----------|
| `--all` | Tüm aktif worker'ları ve sprint coordinator'ı durdurur |
| `--worker <id>` | Belirli bir worker'ı (örn. `w-153-003`) seçici biçimde durdurur |

### Neden Onay Zorunluluğu Var?

Nervous System güvenlik katmanı (`nervous_system.safety_floor.locked_actions`) içinde `KILL_LIVE_SPRINT` eylemi kilitli aksiyon listesinde yer alır. Bu, `bypass_allowed: false` ile birlikte kill işleminin hiçbir otomatik akış tarafından tetiklenemeyeceği anlamına gelir. Yalnızca açık kullanıcı isteğiyle gerçekleştirilir.

Onaysız kill senaryosunun maliyeti yüksektir:
- Tamamlanmış ama henüz yazılmamış `.result` dosyaları kaybolur
- Kısmi `.hb` (heartbeat) dosyaları stale olarak kalır
- Auditor scan döngüsü sonlandırılmaz; yanlış alert üretebilir
- `.locks/` altındaki dosya kilitleri serbest bırakılmaz → sonraki sprint başlayamaz

### MCP Eşdeğeri (ADR-022-V2 CLI/MCP Parity)

ADR-022-V2 gereği her CLI komutu, parametre simetrisi korunarak MCP tool olarak da mevcuttur:

```bash
# CLI
deckent kill --all
deckent kill --worker w-153-003

# MCP
deckent_kill { "target": "all" }
deckent_kill { "target": "worker", "workerId": "w-153-003" }
```

Her iki yolda da aynı doğrulama, onay mekanizması ve temizlik akışı çalışır. Bir MCP arayüzündeki otomasyon ajanı ile bir kullanıcının terminalde yazdığı komut aynı güvenlik kısıtlamalarına tabidir.

---

## Cleanup Disiplini

`deckent cleanup` komutu, sprint bitiminde veya manuel olarak çağrıldığında beş ayrı adımı sırayla yürütür:

### 1. `.tasks/` Arşivleme

Tamamlanan sprintin tüm task dosyaları (`.json`, `.result`, `.plan`, `.hb`, `.partial-result`) `.tasks/archive/sprint-NNN/` dizinine taşınır. Aktif sprint dizini temizlenerek bir sonraki sprint için hazır hale getirilir.

Arşivleme destructive değildir; dosyalar silinmez, taşınır. Bu nedenle geçmişe dönük audit mümkün kalır.

### 2. `.deckent/jobs/` Kalıcı Kayıt (Persist)

Sprint-level metadata (başlangıç/bitiş zamanı, toplam task sayısı, GO/NO_GO oranı, provider kullanımı) `.deckent/jobs/sprint-NNN.json` formatında kalıcı olarak saklanır. Bu dosyalar arşivlenmez, silinmez; `deckent history` komutu bu kayıtları okur.

### 3. Lock Release — `.locks/` Temizliği

Sprint boyunca worker'ların dosya çakışmalarını önlemek için kullandığı lock dosyaları (`{filepath-with-__-separators}.lock`) serbest bırakılır. Config'de `lock_stale_threshold: 300` (saniye) ile 5 dakikayı aşan lock'lar Auditor tarafından stale olarak işaretlenir; cleanup fazında tamamı temizlenir.

Stale lock kalan bir dizinde yeni sprint başlatılmaya çalışılırsa `deckent doctor` uyarı üretir.

### 4. Metrics Rotation

Her sprint çalışması sırasında `.deckent/sprint-NNN-metrics.jsonl` dosyasına satır satır metrik kaydedilir (token kullanımı, task süreleri, worker hataları). Cleanup aşamasında bu dosyalar `observability.rotation` kurallarına göre işlenir:

```json
"observability": {
  "rotation": {
    "maxSizeMB": 1,
    "archiveFormat": "gzip",
    "keepLastN": 10
  }
}
```

1 MB'ı aşan dosyalar gzip ile sıkıştırılır ve en son 10 arşiv tutulur; eskiler silinir.

### 5. Sprint Dosya Retention Policy

Sprint arşiv dosyaları `sprint_file_retention` politikasıyla yönetilir:

```json
"sprint_file_retention": {
  "keep_last_n": 10,
  "size_cap_mb": 500,
  "archive_path": ".deckent/archive/sprints/"
}
```

- Son 10 sprint arşivi daima korunur
- Toplam arşiv boyutu 500 MB'ı geçerse en eski arşivler silinir
- Silme sırası FIFO (ilk giren ilk çıkar)

---

## CLI/MCP Parity Özeti (ADR-022-V2)

ADR-022-V2, `deckent kill` ve `deckent cleanup` komutlarının MCP eşdeğerleriyle tam parametre ve davranış simetrisi taşımasını zorunlu kılar. Aşağıdaki tablo parite durumunu gösterir:

| Eylem | CLI Komutu | MCP Tool | Destructive |
|-------|------------|----------|-------------|
| Tüm worker'ları durdur | `deckent kill --all` | `deckent_kill { target: "all" }` | Evet |
| Tek worker durdur | `deckent kill --worker <id>` | `deckent_kill { target: "worker", workerId }` | Evet |
| Sprint temizle | `deckent cleanup` | `deckent_cleanup { root: "." }` | Evet |
| Durum sorgula | `deckent status` | `deckent_status` | Hayır |

Pariteden sapma (örn. MCP'de eksik parametre veya farklı davranış) ADR-022-V2 ihlali sayılır ve worker tarafından NO_GO olarak raporlanır.

---

## Özet

Sprint kill ve cleanup, Deckent'in en dikkatli yönetilmesi gereken operasyonlarıdır. Kullanıcı onayı zorunluluğu, Nervous System güvenlik katmanı ve ADR-022-V2 parity kuralı bir arada; kazara veri kaybının, stale lock'ların ve senkronizasyon sorunlarının önüne geçer. Cleanup fazı her zaman sıralı yürür: arşivleme → persist → lock temizliği → metrics rotation → retention uygulama.
