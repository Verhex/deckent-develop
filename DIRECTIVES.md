# DIRECTIVES — Sprint 18 (Orchestration Smoke Test — 10 Parallel Doc Tasks)

## Hedef: Orkestrasyon smoke test — 10 paralel doküman görevi. Worker'lar repo'yu analiz edip MD dosyası yazar, kaynak kod değiştirilmez.

---

## Görev 1: GLOSSARY.md — Deckent Terminoloji Sözlüğü
- Dosya: docs/GLOSSARY.md (yeni)
- Kapsam: docs/

### Açıklama
Blueprint'teki (DECKENT-MASTER-BLUEPRINT.md) tüm teknik terimleri alfabetik sırayla listele. Her terim için kısa tanım ve ilk geçtiği Blueprint section numarası. Minimum 40 terim.

### Test
- Manuel doğrulama — terimler alfabetik, Blueprint referansları doğru

---

## Görev 2: TROUBLESHOOTING.md — Sık Sorunlar ve Çözümleri
- Dosya: docs/TROUBLESHOOTING.md (yeni)
- Kapsam: docs/

### Açıklama
En sık karşılaşılan sorunları ve çözümlerini dokümante et. `deckent doctor` çıktılarıyla eşleştir. Minimum 15 sorun-çözüm çifti. Kategoriler: kurulum, sprint çalıştırma, MCP, tmux, dashboard.

### Test
- Manuel doğrulama — doctor çıktılarıyla tutarlı

---

## Görev 3: SECURITY.md — Güvenlik Modeli Detayı
- Dosya: docs/SECURITY.md (yeni)
- Kapsam: docs/

### Açıklama
Blueprint §15 güvenlik modelini detaylandır. 4 seviye permission sistemi, scope kuralları, lock mekanizması, auditor boundary detection. Threat model özetini dahil et.

### Test
- Manuel doğrulama — Blueprint §15 ile tutarlı

---

## Görev 4: MCP-GUIDE.md — MCP Kullanım Kılavuzu
- Dosya: docs/MCP-GUIDE.md (yeni)
- Kapsam: docs/

### Açıklama
10 MCP tool ve 5 MCP resource'un kullanım kılavuzu. Her tool için: parametre listesi, örnek çağrı, beklenen çıktı. IDE entegrasyon adımları (VS Code, Cursor, Claude Code). Blueprint referansları.

### Test
- Manuel doğrulama — tool/resource sayıları doğru

---

## Görev 5: MEMORY-SYSTEM.md — Bellek Mimarisi
- Dosya: docs/MEMORY-SYSTEM.md (yeni)
- Kapsam: docs/

### Açıklama
3 katmanlı bellek mimarisi: MEMORY.md (kısa süreli), PATTERNS.md (uzun süreli), DECISIONS.md (kalıcı). Her dosyanın formatı, max satır limiti, decay kuralı, brain cleanup döngüsü. Blueprint referansları.

### Test
- Manuel doğrulama — format ve limitler doğru

---

## Görev 6: SPRINT-LIFECYCLE.md — Sprint Yaşam Döngüsü
- Dosya: docs/SPRINT-LIFECYCLE.md (yeni)
- Kapsam: docs/

### Açıklama
8 fazlı sprint yaşam döngüsü: INIT → PLAN → SPAWN → EXECUTE → WAIT → EVALUATE → RETRO → COMPLETE. Her faz için: ne yapılır, hangi fonksiyon çağrılır (runSprint kod akışı), hangi dosyalar oluşur/güncellenir. Blueprint referansları.

### Test
- Manuel doğrulama — fazlar doğru sırada, kod referansları doğru

---

## Görev 7: CONFIG-REFERENCE.md — Config Referans Kılavuzu
- Dosya: docs/CONFIG-REFERENCE.md (yeni)
- Kapsam: docs/

### Açıklama
Tüm .deckent/config.json seçenekleri ve varsayılan değerleri. 4 plan modu (ai, structured, hybrid, auto) limitleri ve karşılaştırması. Örneklerle açıklama. Blueprint referansları.

### Test
- Manuel doğrulama — config seçenekleri ve plan modları doğru

---

## Görev 8: WORKER-GUIDE.md — Worker Davranış Kılavuzu
- Dosya: docs/WORKER-GUIDE.md (yeni)
- Kapsam: docs/

### Açıklama
Worker claim'den result'a kadar tüm akış: task okuma, plan yazma, heartbeat, lock yönetimi, scope kuralları, test çalıştırma, result yazma. Blueprint ve worker-default.md referansları.

### Test
- Manuel doğrulama — akış doğru, scope kuralları tutarlı

---

## Görev 9: BRAIN-GUIDE.md — Brain İç İşleyişi
- Dosya: docs/BRAIN-GUIDE.md (yeni)
- Kapsam: docs/

### Açıklama
Brain iç işleyişi: planlama modları (AI vs structured), task atama, model seçimi, GO/NO-GO değerlendirme, debt escalation, memory yönetimi, decay. Blueprint ve brain.md referansları.

### Test
- Manuel doğrulama — planlama modları ve değerlendirme kriterleri doğru

---

## Görev 10: DASHBOARD-GUIDE.md — Dashboard Kılavuzu
- Dosya: docs/DASHBOARD-GUIDE.md (yeni)
- Kapsam: docs/

### Açıklama
Terminal TUI dashboard (deckent status --watch), Web dashboard (React), HTTP API (15 endpoint listesi), SSE real-time stream. Kurulum ve kullanım adımları. Blueprint referansları.

### Test
- Manuel doğrulama — endpoint sayıları ve özellikler doğru

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut 1027 test kırılmamalı
- Yeni dosya oluştur, mevcut kodu DEĞİŞTİRME
- Her doküman Blueprint'e (DECKENT-MASTER-BLUEPRINT.md) referans vermeli
- Sadece docs/ dizinine yazma izni — kaynak kod dokunulmaz
- MCP: 10 tool, 5 resource (değişiklik yok)
- CLI: 26 komut (değişiklik yok)
