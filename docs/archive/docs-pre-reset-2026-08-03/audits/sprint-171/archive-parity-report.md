# Archive ↔ memory.db Parity Report

**Sprint:** 172 — Task B1 (172-008)
**Scanned at:** 2026-05-18T05:05:31.935Z
**DB:** `.brain/memory.db` (readonly)
**Archive:** `.brain/archive`

## Özet

- **Toplam arşiv dosyası:** 219 (sprint=121, retro=98)
- **parity-OK:** 23 (sprint=0, retro=23)
- **DB-eksik:** 196 (sprint=121, retro=75)
- **DB global:** type=sprint=11, type=retro=26, total_entries=240

## B2 İnvariantı

> **DB-eksik HİÇBİR dosya `git rm --cached` edilmez.** Önce backfill (BA-05 deseni — örn. `scripts/sprint-167-memory-backfill.mjs`). DB-eksik dosyalar B2 kapsamı **DIŞINDA**.

## Lookup Stratejisi

Her arşiv dosyası iki yolla DB'de aranır (tolerans için):

1. **by-id**: `SELECT … WHERE id='sprint-log-NNN'` veya `'retro-sprint-NNN'` (kanonik konvansiyon).
2. **by-type-sprint_num**: `SELECT … WHERE type='sprint'|'retro' AND sprint_num=NNN` (fallback — id konvansiyonu farklıysa).

Her iki sorgu da boş dönerse dosya **DB-eksik** sayılır.

## parity-OK Listesi (23 dosya — B2 adayı)

| # | Dosya | Tür | Sprint# | DB id | Match Mode | DB Status |
|---|-------|-----|---------|-------|-----------|-----------|
| 1 | `retro-sprint-141.md` | retro | 141 | `retro-sprint-141` | by-id | active |
| 2 | `retro-sprint-142.md` | retro | 142 | `retro-sprint-142` | by-id | active |
| 3 | `retro-sprint-143.md` | retro | 143 | `retro-sprint-143` | by-id | active |
| 4 | `retro-sprint-144.md` | retro | 144 | `retro-sprint-144` | by-id | active |
| 5 | `retro-sprint-145.md` | retro | 145 | `retro-sprint-145` | by-id | active |
| 6 | `retro-sprint-146.md` | retro | 146 | `retro-sprint-146` | by-id | active |
| 7 | `retro-sprint-147.md` | retro | 147 | `retro-sprint-147` | by-id | active |
| 8 | `retro-sprint-148.md` | retro | 148 | `retro-sprint-148` | by-id | active |
| 9 | `retro-sprint-149.md` | retro | 149 | `retro-sprint-149` | by-id | active |
| 10 | `retro-sprint-150.md` | retro | 150 | `retro-sprint-150` | by-id | active |
| 11 | `retro-sprint-151.md` | retro | 151 | `retro-sprint-151` | by-id | active |
| 12 | `retro-sprint-153.md` | retro | 153 | `retro-sprint-153` | by-id | active |
| 13 | `retro-sprint-154.md` | retro | 154 | `retro-sprint-154` | by-id | active |
| 14 | `retro-sprint-155.md` | retro | 155 | `retro-sprint-155` | by-id | active |
| 15 | `retro-sprint-156.md` | retro | 156 | `retro-sprint-156` | by-id | active |
| 16 | `retro-sprint-162.md` | retro | 162 | `retro-sprint-162` | by-id | active |
| 17 | `retro-sprint-163.md` | retro | 163 | `retro-sprint-163` | by-id | active |
| 18 | `retro-sprint-164.md` | retro | 164 | `retro-sprint-164` | by-id | active |
| 19 | `retro-sprint-165.md` | retro | 165 | `retro-sprint-165` | by-id | active |
| 20 | `retro-sprint-168.md` | retro | 168 | `retro-sprint-168` | by-id | active |
| 21 | `retro-sprint-169.md` | retro | 169 | `retro-sprint-169` | by-id | active |
| 22 | `retro-sprint-170.md` | retro | 170 | `retro-sprint-170` | by-id | active |
| 23 | `retro-sprint-171.md` | retro | 171 | `retro-sprint-171` | by-id | active |

## DB-Eksik Listesi (196 dosya — B2 KAPSAMI DIŞI)

| # | Dosya | Tür | Sprint# | Beklenen DB id |
|---|-------|-----|---------|----------------|
| 1 | `sprint-001.md` | sprint | 1 | `sprint-log-001` |
| 2 | `sprint-002.md` | sprint | 2 | `sprint-log-002` |
| 3 | `sprint-003.md` | sprint | 3 | `sprint-log-003` |
| 4 | `sprint-004.md` | sprint | 4 | `sprint-log-004` |
| 5 | `sprint-005.md` | sprint | 5 | `sprint-log-005` |
| 6 | `sprint-006.md` | sprint | 6 | `sprint-log-006` |
| 7 | `sprint-007.md` | sprint | 7 | `sprint-log-007` |
| 8 | `sprint-008.md` | sprint | 8 | `sprint-log-008` |
| 9 | `sprint-009.md` | sprint | 9 | `sprint-log-009` |
| 10 | `sprint-010.md` | sprint | 10 | `sprint-log-010` |
| 11 | `sprint-011.md` | sprint | 11 | `sprint-log-011` |
| 12 | `sprint-012.md` | sprint | 12 | `sprint-log-012` |
| 13 | `sprint-013.md` | sprint | 13 | `sprint-log-013` |
| 14 | `sprint-014.md` | sprint | 14 | `sprint-log-014` |
| 15 | `sprint-015.md` | sprint | 15 | `sprint-log-015` |
| 16 | `sprint-016.md` | sprint | 16 | `sprint-log-016` |
| 17 | `sprint-017.md` | sprint | 17 | `sprint-log-017` |
| 18 | `sprint-018.md` | sprint | 18 | `sprint-log-018` |
| 19 | `sprint-019.md` | sprint | 19 | `sprint-log-019` |
| 20 | `sprint-020.md` | sprint | 20 | `sprint-log-020` |
| 21 | `sprint-021.md` | sprint | 21 | `sprint-log-021` |
| 22 | `sprint-022.md` | sprint | 22 | `sprint-log-022` |
| 23 | `sprint-023.md` | sprint | 23 | `sprint-log-023` |
| 24 | `sprint-024.md` | sprint | 24 | `sprint-log-024` |
| 25 | `sprint-025.md` | sprint | 25 | `sprint-log-025` |
| 26 | `sprint-026.md` | sprint | 26 | `sprint-log-026` |
| 27 | `sprint-027.md` | sprint | 27 | `sprint-log-027` |
| 28 | `sprint-028.md` | sprint | 28 | `sprint-log-028` |
| 29 | `sprint-029.md` | sprint | 29 | `sprint-log-029` |
| 30 | `sprint-030.md` | sprint | 30 | `sprint-log-030` |
| 31 | `sprint-031.md` | sprint | 31 | `sprint-log-031` |
| 32 | `sprint-032.md` | sprint | 32 | `sprint-log-032` |
| 33 | `sprint-033.md` | sprint | 33 | `sprint-log-033` |
| 34 | `sprint-037.md` | sprint | 37 | `sprint-log-037` |
| 35 | `sprint-039.md` | sprint | 39 | `sprint-log-039` |
| 36 | `sprint-040.md` | sprint | 40 | `sprint-log-040` |
| 37 | `sprint-041.md` | sprint | 41 | `sprint-log-041` |
| 38 | `sprint-042.md` | sprint | 42 | `sprint-log-042` |
| 39 | `sprint-046.md` | sprint | 46 | `sprint-log-046` |
| 40 | `sprint-047.md` | sprint | 47 | `sprint-log-047` |
| 41 | `sprint-048.md` | sprint | 48 | `sprint-log-048` |
| 42 | `sprint-049.md` | sprint | 49 | `sprint-log-049` |
| 43 | `sprint-050.md` | sprint | 50 | `sprint-log-050` |
| 44 | `sprint-051.md` | sprint | 51 | `sprint-log-051` |
| 45 | `sprint-052.md` | sprint | 52 | `sprint-log-052` |
| 46 | `sprint-053.md` | sprint | 53 | `sprint-log-053` |
| 47 | `sprint-054.md` | sprint | 54 | `sprint-log-054` |
| 48 | `sprint-055.md` | sprint | 55 | `sprint-log-055` |
| 49 | `sprint-056.md` | sprint | 56 | `sprint-log-056` |
| 50 | `sprint-057.md` | sprint | 57 | `sprint-log-057` |
| 51 | `retro-sprint-058.md` | retro | 58 | `retro-sprint-058` |
| 52 | `sprint-058.md` | sprint | 58 | `sprint-log-058` |
| 53 | `retro-sprint-059.md` | retro | 59 | `retro-sprint-059` |
| 54 | `sprint-059.md` | sprint | 59 | `sprint-log-059` |
| 55 | `retro-sprint-060.md` | retro | 60 | `retro-sprint-060` |
| 56 | `sprint-060.md` | sprint | 60 | `sprint-log-060` |
| 57 | `retro-sprint-061.md` | retro | 61 | `retro-sprint-061` |
| 58 | `sprint-061.md` | sprint | 61 | `sprint-log-061` |
| 59 | `retro-sprint-062.md` | retro | 62 | `retro-sprint-062` |
| 60 | `sprint-062.md` | sprint | 62 | `sprint-log-062` |
| 61 | `retro-sprint-063.md` | retro | 63 | `retro-sprint-063` |
| 62 | `sprint-063.md` | sprint | 63 | `sprint-log-063` |
| 63 | `retro-sprint-064.md` | retro | 64 | `retro-sprint-064` |
| 64 | `sprint-064.md` | sprint | 64 | `sprint-log-064` |
| 65 | `sprint-065.md` | sprint | 65 | `sprint-log-065` |
| 66 | `retro-sprint-066.md` | retro | 66 | `retro-sprint-066` |
| 67 | `sprint-066.md` | sprint | 66 | `sprint-log-066` |
| 68 | `retro-sprint-067.md` | retro | 67 | `retro-sprint-067` |
| 69 | `sprint-067.md` | sprint | 67 | `sprint-log-067` |
| 70 | `retro-sprint-068.md` | retro | 68 | `retro-sprint-068` |
| 71 | `sprint-068.md` | sprint | 68 | `sprint-log-068` |
| 72 | `retro-sprint-069.md` | retro | 69 | `retro-sprint-069` |
| 73 | `sprint-069.md` | sprint | 69 | `sprint-log-069` |
| 74 | `retro-sprint-070.md` | retro | 70 | `retro-sprint-070` |
| 75 | `sprint-070.md` | sprint | 70 | `sprint-log-070` |
| 76 | `retro-sprint-071.md` | retro | 71 | `retro-sprint-071` |
| 77 | `sprint-071.md` | sprint | 71 | `sprint-log-071` |
| 78 | `retro-sprint-072.md` | retro | 72 | `retro-sprint-072` |
| 79 | `sprint-072.md` | sprint | 72 | `sprint-log-072` |
| 80 | `retro-sprint-073.md` | retro | 73 | `retro-sprint-073` |
| 81 | `sprint-073.md` | sprint | 73 | `sprint-log-073` |
| 82 | `retro-sprint-074.md` | retro | 74 | `retro-sprint-074` |
| 83 | `sprint-074.md` | sprint | 74 | `sprint-log-074` |
| 84 | `retro-sprint-075.md` | retro | 75 | `retro-sprint-075` |
| 85 | `sprint-075.md` | sprint | 75 | `sprint-log-075` |
| 86 | `retro-sprint-076.md` | retro | 76 | `retro-sprint-076` |
| 87 | `sprint-076.md` | sprint | 76 | `sprint-log-076` |
| 88 | `retro-sprint-077.md` | retro | 77 | `retro-sprint-077` |
| 89 | `sprint-077.md` | sprint | 77 | `sprint-log-077` |
| 90 | `retro-sprint-078.md` | retro | 78 | `retro-sprint-078` |
| 91 | `sprint-078.md` | sprint | 78 | `sprint-log-078` |
| 92 | `retro-sprint-079.md` | retro | 79 | `retro-sprint-079` |
| 93 | `sprint-079.md` | sprint | 79 | `sprint-log-079` |
| 94 | `retro-sprint-080.md` | retro | 80 | `retro-sprint-080` |
| 95 | `sprint-080.md` | sprint | 80 | `sprint-log-080` |
| 96 | `retro-sprint-081.md` | retro | 81 | `retro-sprint-081` |
| 97 | `sprint-081.md` | sprint | 81 | `sprint-log-081` |
| 98 | `retro-sprint-082.md` | retro | 82 | `retro-sprint-082` |
| 99 | `sprint-082.md` | sprint | 82 | `sprint-log-082` |
| 100 | `retro-sprint-083.md` | retro | 83 | `retro-sprint-083` |
| 101 | `sprint-083.md` | sprint | 83 | `sprint-log-083` |
| 102 | `retro-sprint-085.md` | retro | 85 | `retro-sprint-085` |
| 103 | `sprint-085.md` | sprint | 85 | `sprint-log-085` |
| 104 | `retro-sprint-086.md` | retro | 86 | `retro-sprint-086` |
| 105 | `sprint-086.md` | sprint | 86 | `sprint-log-086` |
| 106 | `retro-sprint-087.md` | retro | 87 | `retro-sprint-087` |
| 107 | `sprint-087.md` | sprint | 87 | `sprint-log-087` |
| 108 | `retro-sprint-088.md` | retro | 88 | `retro-sprint-088` |
| 109 | `sprint-088.md` | sprint | 88 | `sprint-log-088` |
| 110 | `retro-sprint-089.md` | retro | 89 | `retro-sprint-089` |
| 111 | `sprint-089.md` | sprint | 89 | `sprint-log-089` |
| 112 | `retro-sprint-090.md` | retro | 90 | `retro-sprint-090` |
| 113 | `sprint-090.md` | sprint | 90 | `sprint-log-090` |
| 114 | `retro-sprint-091.md` | retro | 91 | `retro-sprint-091` |
| 115 | `sprint-091.md` | sprint | 91 | `sprint-log-091` |
| 116 | `retro-sprint-092.md` | retro | 92 | `retro-sprint-092` |
| 117 | `sprint-092.md` | sprint | 92 | `sprint-log-092` |
| 118 | `retro-sprint-093.md` | retro | 93 | `retro-sprint-093` |
| 119 | `sprint-093.md` | sprint | 93 | `sprint-log-093` |
| 120 | `retro-sprint-094.md` | retro | 94 | `retro-sprint-094` |
| 121 | `sprint-094.md` | sprint | 94 | `sprint-log-094` |
| 122 | `retro-sprint-095.md` | retro | 95 | `retro-sprint-095` |
| 123 | `sprint-095.md` | sprint | 95 | `sprint-log-095` |
| 124 | `retro-sprint-096.md` | retro | 96 | `retro-sprint-096` |
| 125 | `sprint-096.md` | sprint | 96 | `sprint-log-096` |
| 126 | `retro-sprint-097.md` | retro | 97 | `retro-sprint-097` |
| 127 | `sprint-097.md` | sprint | 97 | `sprint-log-097` |
| 128 | `retro-sprint-098.md` | retro | 98 | `retro-sprint-098` |
| 129 | `sprint-098.md` | sprint | 98 | `sprint-log-098` |
| 130 | `retro-sprint-099.md` | retro | 99 | `retro-sprint-099` |
| 131 | `sprint-099.md` | sprint | 99 | `sprint-log-099` |
| 132 | `retro-sprint-100.md` | retro | 100 | `retro-sprint-100` |
| 133 | `sprint-100.md` | sprint | 100 | `sprint-log-100` |
| 134 | `retro-sprint-101.md` | retro | 101 | `retro-sprint-101` |
| 135 | `sprint-101.md` | sprint | 101 | `sprint-log-101` |
| 136 | `retro-sprint-102.md` | retro | 102 | `retro-sprint-102` |
| 137 | `sprint-102.md` | sprint | 102 | `sprint-log-102` |
| 138 | `retro-sprint-103.md` | retro | 103 | `retro-sprint-103` |
| 139 | `sprint-103.md` | sprint | 103 | `sprint-log-103` |
| 140 | `retro-sprint-104.md` | retro | 104 | `retro-sprint-104` |
| 141 | `sprint-104.md` | sprint | 104 | `sprint-log-104` |
| 142 | `retro-sprint-105.md` | retro | 105 | `retro-sprint-105` |
| 143 | `sprint-105.md` | sprint | 105 | `sprint-log-105` |
| 144 | `retro-sprint-106.md` | retro | 106 | `retro-sprint-106` |
| 145 | `sprint-106.md` | sprint | 106 | `sprint-log-106` |
| 146 | `retro-sprint-107.md` | retro | 107 | `retro-sprint-107` |
| 147 | `sprint-107.md` | sprint | 107 | `sprint-log-107` |
| 148 | `retro-sprint-108.md` | retro | 108 | `retro-sprint-108` |
| 149 | `sprint-108.md` | sprint | 108 | `sprint-log-108` |
| 150 | `retro-sprint-110.md` | retro | 110 | `retro-sprint-110` |
| 151 | `sprint-110.md` | sprint | 110 | `sprint-log-110` |
| 152 | `retro-sprint-111.md` | retro | 111 | `retro-sprint-111` |
| 153 | `sprint-111.md` | sprint | 111 | `sprint-log-111` |
| 154 | `retro-sprint-113.md` | retro | 113 | `retro-sprint-113` |
| 155 | `sprint-113.md` | sprint | 113 | `sprint-log-113` |
| 156 | `retro-sprint-115.md` | retro | 115 | `retro-sprint-115` |
| 157 | `sprint-115.md` | sprint | 115 | `sprint-log-115` |
| 158 | `retro-sprint-116.md` | retro | 116 | `retro-sprint-116` |
| 159 | `sprint-116.md` | sprint | 116 | `sprint-log-116` |
| 160 | `retro-sprint-117.md` | retro | 117 | `retro-sprint-117` |
| 161 | `sprint-117.md` | sprint | 117 | `sprint-log-117` |
| 162 | `retro-sprint-118.md` | retro | 118 | `retro-sprint-118` |
| 163 | `sprint-118.md` | sprint | 118 | `sprint-log-118` |
| 164 | `retro-sprint-119.md` | retro | 119 | `retro-sprint-119` |
| 165 | `sprint-119.md` | sprint | 119 | `sprint-log-119` |
| 166 | `retro-sprint-120.md` | retro | 120 | `retro-sprint-120` |
| 167 | `sprint-120.md` | sprint | 120 | `sprint-log-120` |
| 168 | `retro-sprint-121.md` | retro | 121 | `retro-sprint-121` |
| 169 | `sprint-121.md` | sprint | 121 | `sprint-log-121` |
| 170 | `retro-sprint-122.md` | retro | 122 | `retro-sprint-122` |
| 171 | `sprint-122.md` | sprint | 122 | `sprint-log-122` |
| 172 | `retro-sprint-123.md` | retro | 123 | `retro-sprint-123` |
| 173 | `sprint-123.md` | sprint | 123 | `sprint-log-123` |
| 174 | `retro-sprint-124.md` | retro | 124 | `retro-sprint-124` |
| 175 | `sprint-124.md` | sprint | 124 | `sprint-log-124` |
| 176 | `retro-sprint-125.md` | retro | 125 | `retro-sprint-125` |
| 177 | `sprint-125.md` | sprint | 125 | `sprint-log-125` |
| 178 | `retro-sprint-126.md` | retro | 126 | `retro-sprint-126` |
| 179 | `sprint-126.md` | sprint | 126 | `sprint-log-126` |
| 180 | `retro-sprint-127.md` | retro | 127 | `retro-sprint-127` |
| 181 | `sprint-127.md` | sprint | 127 | `sprint-log-127` |
| 182 | `retro-sprint-128.md` | retro | 128 | `retro-sprint-128` |
| 183 | `sprint-128.md` | sprint | 128 | `sprint-log-128` |
| 184 | `retro-sprint-129.md` | retro | 129 | `retro-sprint-129` |
| 185 | `sprint-129.md` | sprint | 129 | `sprint-log-129` |
| 186 | `retro-sprint-132.md` | retro | 132 | `retro-sprint-132` |
| 187 | `sprint-132.md` | sprint | 132 | `sprint-log-132` |
| 188 | `retro-sprint-133.md` | retro | 133 | `retro-sprint-133` |
| 189 | `sprint-133.md` | sprint | 133 | `sprint-log-133` |
| 190 | `retro-sprint-135.md` | retro | 135 | `retro-sprint-135` |
| 191 | `sprint-135.md` | sprint | 135 | `sprint-log-135` |
| 192 | `retro-sprint-136.md` | retro | 136 | `retro-sprint-136` |
| 193 | `retro-sprint-137.md` | retro | 137 | `retro-sprint-137` |
| 194 | `retro-sprint-138.md` | retro | 138 | `retro-sprint-138` |
| 195 | `retro-sprint-139.md` | retro | 139 | `retro-sprint-139` |
| 196 | `retro-sprint-152.md` | retro | 152 | `retro-sprint-152` |

## Orphan DB Entries (DB'de var, arşivde .md yok)

Bu kayıtlar DB'de mevcut ama `.brain/archive/` altında karşılık .md dosyası yok. BA-05 deseninin doğal sonucu (backfill yalnızca DB'ye yazıldı) veya `.brain/sprints/` altında kalmış aktif sprint logları.

**Toplam:** sprint=11, retro=3

| Tür | Sprint# | DB id |
|-----|---------|-------|
| sprint | 136 | `sprint-log-136` |
| sprint | 137 | `sprint-log-137` |
| sprint | 138 | `sprint-log-138` |
| sprint | 139 | `sprint-log-139` |
| sprint | 165 | `sprint-log-165` |
| sprint | 166 | `sprint-log-166` |
| sprint | 167 | `sprint-log-167` |
| sprint | 168 | `sprint-log-168` |
| sprint | 169 | `sprint-log-169` |
| sprint | 170 | `sprint-log-170` |
| sprint | 171 | `sprint-log-171` |
| retro | 0 | `retro-latest` |
| retro | 166 | `retro-sprint-166` |
| retro | 167 | `retro-sprint-167` |

## Spot-Check Kanıtları

Aşağıdaki dosyalar bilinen referans noktaları — beklenen davranış (gerçek arşiv durumuna göre):

| Dosya | Beklenen | Gerçekleşen | Açıklama |
|-------|----------|-------------|----------|
| `retro-sprint-171.md` | parity-OK | parity-OK (`retro-sprint-171`) ✓ | Sprint 171 retro DB'ye yazıldı + archive .md mevcut. |
| `retro-sprint-168.md` | parity-OK | parity-OK (`retro-sprint-168`) ✓ | Sprint 168 retro DB'ye yazıldı + archive .md mevcut. |
| `sprint-001.md` | DB-eksik | DB-eksik ✓ | Çok eski sprint, DB öncesi era; backfill kapsamı dışı. |
| `retro-sprint-058.md` | DB-eksik | DB-eksik ✓ | Eski retro, DB'ye hiç yazılmamış. |
| `sprint-167.md` | arşivde YOK | arşivde YOK ✓ | BA-05 backfill yalnızca DB'ye yazdı (sprint-log-167) — archive .md yok. .brain/sprints/sprint-167.md mevcut ama bu script kapsamı dışı. |
| `retro-sprint-167.md` | arşivde YOK | arşivde YOK ✓ | BA-05 backfill yalnızca DB'ye yazdı (retro-sprint-167) — archive .md yok. |

## Sonraki Adım (B2 — 172-009)

1. **.gitignore + .npmignore** güncellemesi (SYNTHESIS §4.3 blok).
2. **`git rm --cached -r`** yalnızca **parity-OK** listesindeki 23 dosya + ignore kapsamı.
3. **DB-eksik** 196 dosya **diskte kalır + git takipte kalır** — backfill gelene dek silinmez.
4. `memory.db` ASLA ignore edilmez (zaten gitignored ama tekrar doğrula).
5. `npm pack --dry-run` temiz paket boyutu doğrula.

## Üretim Komutu

```bash
node scripts/verify-archive-db-parity.mjs --report docs/audits/sprint-171/archive-parity-report.md
```
