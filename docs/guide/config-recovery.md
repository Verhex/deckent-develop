# Config Recovery Guide

## Overview

Deckent proje konfigürasyonu `.deckent/config.json` dosyasında saklanır. Bazen bu dosya
kaybolabilir, bozulabilir, veya `git rm --cached` gibi işlemlerden sonra template'den
yeniden oluşturulabilir — bu durumda tüm kullanıcı ayarları kaybolur (Sprint 176 root cause).

`regenerateConfigSafe()` bu sorunu çözer: mevcut config'i template defaults ile **MERGE**
eder, overwite etmez. Kullanıcı değerleri her zaman kazanır.

## Sprint 176 Örüntüsü

Sprint 176'da şu senaryo gerçekleşti:
1. `git rm --cached .deckent/config.json` ile dosya git'ten kaldırıldı
2. `deckent init` yeniden çalıştırıldı
3. Template'den üretilen config, `spawn_backend` dahil tüm alanları sildi
4. Sonraki sprint'ler yanlış backend ile çalıştı

## Güvenli Config Yenileme

```typescript
import { regenerateConfigSafe } from 'deckent/core/config';

const result = await regenerateConfigSafe('/path/to/project');
console.log('Backup:', result.backupPath);
console.log('Eklenen alanlar:', result.added);
```

### Davranış

| Durum | Sonuç |
|-------|-------|
| Kullanıcının `spawn_backend: 'subprocess'` ayarı var | **Korunur** |
| Kullanıcının `dependency_pipeline_enabled` ayarı yok | Template'den `false` eklenir |
| Config dosyası bozuk/parse edilemez | Template ile başlanır |
| Config dosyası hiç yok | Template defaults yazılır |

### Template Defaults

```json
{
  "spawn_backend": "docker",
  "dependency_pipeline_enabled": false,
  "haiku_allowed": false,
  "brain_planning": "structured"
}
```

Bu değerler deckent-dev projesi için güvenli defaults'lardır (ADR-047 manuel wave protokolü).

## Backup Dosyaları

Regen öncesi otomatik olarak oluşturulan backup dosyaları:

```
.deckent/config.json.bak.regen-2026-05-20T10-15-30-000Z
```

### Backup'tan Geri Yükleme

```bash
# Backup listele
ls .deckent/config.json.bak.regen-*

# İstenen backup'ı geri yükle
cp .deckent/config.json.bak.regen-<timestamp> .deckent/config.json

# Config'i doğrula
deckent config read
```

## CLI ile Geri Yükleme

```bash
# Mevcut config'i oku
deckent config read

# Belirli bir değeri sıfırla (template default'u tekrar uygula)
deckent config set spawn_backend docker

# Tam regen (merge ile)
deckent recover
```

## Sorun Giderme

### Config kayboldu ama sprint başlatılması gerekiyor

```bash
# 1. Config'in var olup olmadığını kontrol et
ls .deckent/config.json

# 2. Backup varsa geri yükle
ls .deckent/config.json.bak.*

# 3. Backup yoksa defaults ile başla
deckent config read  # defaults gösterir
deckent config set spawn_backend docker

# 4. Sprint başlat
deckent start
```

### `spawn_backend` yanlış backend'i kullanıyor

Sprint 176 senaryosu: config regen sonrası `spawn_backend` 'auto' veya tmux'a dönmüş.

```bash
deckent config set spawn_backend docker
```

### `dependency_pipeline_enabled` sıfırlandı

ADR-047: deckent-dev'de bu değer `false` olmalı (Brain manuel wave yönetimi).

```bash
deckent config set dependency_pipeline_enabled false
```

## Kod API

```typescript
import { regenerateConfigSafe, REGEN_TEMPLATE_DEFAULTS } from './src/core/config.js';

// Güvenli merge (user fields korunur, eksik alanlar eklenir)
const { backupPath, merged, added } = regenerateConfigSafe(projectRoot);

// Template defaults'ı görüntüle
console.log(REGEN_TEMPLATE_DEFAULTS);
// {
//   spawn_backend: 'docker',
//   dependency_pipeline_enabled: false,
//   haiku_allowed: false,
//   brain_planning: 'structured'
// }
```
