# T-152-018: Auto-Memory 78 Dosya Kayıp Impact Analysis

**Sprint:** 152 (READ-ONLY audit)
**Tarih:** 2026-04-24
**Worker:** w-152-018 (docker backend)
**Kaynak belgeler:** `NEXT-SESSION-PROMPT.md`, `SYSTEM-MIGRATION-2026-04-22.md` Bölüm 1.2 & 2.2 & 6.3, `.brain/RETRO.md`, `.brain/MEMORY.md`, `.brain/exports/memory.md`, `.brain/exports/summary.md`, `.brain/archive/DIRECTIVES-sprint-151.md`, `DIRECTIVES.md` (Sprint 152)
**Canlı envanter:** `~/.claude/projects/-home-alperen-deckent-dev/memory/` (konteyner bind: `/tmp/deckent-home/.claude/projects/-home-alperen-deckent-dev/memory/`)

---

## Özet

Sistem taşıması sırasında eski WSL2 `~/.claude/projects/-home-alperen-deckent-dev/memory/` dizinindeki **82 auto-memory dosyasının yalnızca 3'ü (~%3.7) gerçek anlamda kurtarıldı** (Windows OneDrive/Deckent projesinden). Bugün (2026-04-24) dizinde toplam 6 dosya bulunuyor ama bunun 3'ü yeni session'da yeniden üretilen çekirdek kural dosyaları (`feedback_sprint_kill_always_ask_user`, `feedback_build_requires_user_approval`, `MEMORY.md` indeksi). **Kalıcı kayıp ≈ 79 dosya.**

Kaybın doğası: Sprint 138-151 dönemi (yaklaşık 14 sprint, ~2 hafta) boyunca Claude Code otomatik olarak yazdığı **feedback** (Alperen'in kuralları), **project** (sprint-özel bağlam), **user** (rol/görev genişletmeleri) ve **reference** (dış sistem işaretçileri) dosyaları. Bu dosyalar **orkestratör DB'sinde değil, oturum-yanına yazılan dosya sistemi hafızasıydı** — SQLite `.brain/memory.db` (174 entry) bu kayıptan **etkilenmedi**; dolayısıyla ADR, RETRO, DEBT hâlâ bütün.

Kayıp maliyeti **disiplin kaybı**dır: Alperen'in 14 sprint boyunca verdiği kuralların yeniden öğretilmesi Sprint 152-153'te 5-10 saatlik düzeltme/tekrar kuralı yazdırma olarak tezahür edecek. 7 çekirdek kural (`feedback_npm_publish_alperen_approval`, `feedback_timezone_trt`, `feedback_two_persona_analysis`, `feedback_deckent_kill_approval_required`, `feedback_test_agent_removal`, `feedback_max_workers`, `feedback_openclaw_not_openhands`) NEXT-SESSION-PROMPT.md'de açıkça listelendiği için **Sprint 152-153'te ilk günden aktif**; gerisi Alperen prompt ettiğinde yeniden üretilecek.

**SYSTEM-MIGRATION-2026-04-22.md playbook'u Bölüm 1.2 + 2.2 + 6.3'te `~/.claude` taşımayı "KESİNLİKLE TAŞI" kategorisine koymuştu ama playbook eksik kaldı:** Eski sistemden yeni sisteme asıl rsync'in yapılıp yapılmadığına dair **pre-commit post-arrival doğrulama adımı yok**, sadece "hedef sayısını kontrol et" var ama yedekten-geri-alma prosedürü yok. Bu rapor prevention playbook'u tamamlar.

---

## Bulgular

### 1. Canlı Envanter — Bugünkü 6 Dosya vs Beklenen 82

| # | Dosya | Boyut | mtime (UTC) | Statü | Kaynak |
|---|-------|-------|-------------|-------|--------|
| 1 | `MEMORY.md` | 708 B | 2026-04-24 12:22 | REGENERATED | Yeni session'da indeks yeniden yazıldı (5 entry) |
| 2 | `user_alperen.md` | 412 B | 2026-04-24 08:00 | RECOVERED | Windows OneDrive/Deckent |
| 3 | `project_deckent_wave1.md` | 774 B | 2026-04-24 08:00 | RECOVERED | Windows OneDrive/Deckent |
| 4 | `project_deckent_wave3.md` | 1061 B | 2026-04-24 08:00 | RECOVERED | Windows OneDrive/Deckent |
| 5 | `feedback_sprint_kill_always_ask_user.md` | 1582 B | 2026-04-24 12:22 | NEW TODAY | Alperen 2026-04-24 direktifinden türedi |
| 6 | `feedback_build_requires_user_approval.md` | 1669 B | 2026-04-24 12:22 | NEW TODAY | Alperen 2026-04-24 direktifinden türedi |

**[FAIL] Real recovery count:** 3 (project/user), MEMORY.md rebuilt, 2 feedback yeni.
**[FAIL] Projected loss:** 82 − 3 = **79 dosya kalıcı kayıp** (DIRECTIVES "~78" rakamı doğru civar).

**Kanıt:**
```
$ ls ~/.claude/projects/-home-alperen-deckent-dev/memory/ | wc -l
6
$ head -1 ~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_sprint_kill_always_ask_user.md
---
$ grep "2026-04-24 direktifi" ~/.claude/projects/.../feedback_sprint_kill_always_ask_user.md
# → "Alperen'in 2026-04-24 direktifi..." (yani bugün yazıldı)
```

---

### 2. Kayıp 79 Dosyanın İçerik Tahmini — NEXT-SESSION-PROMPT + Retro + Dogfood Üretimi

NEXT-SESSION-PROMPT.md satır 44-52 + 113 + 185-191 ve DIRECTIVES.md satır 373, Sprint 138-151 retro ve `.brain/archive/DIRECTIVES-sprint-*.md` taranarak aşağıdaki **tahmini kayıp listesi** üretildi. Her satır: büyük olasılıkla dosya adı, içerik özeti, Sprint 152-153'te geri canlanma olasılığı.

#### 2.1 Feedback Dosyaları (~35-40 tahmini — kural/korelasyon ana kayıp kategorisi)

| Tahmini dosya | İçerik özü | Kaynak kanıt | Priority geri-canlanma | Durum |
|---------------|-----------|--------------|-----------------------|-------|
| `feedback_npm_publish_alperen_approval.md` | Worker asla `npm publish` çalıştıramaz, son adım Alperen elle | NEXT-SESSION-PROMPT satır 185, T-151-001 dogfood | P0 | **Canlı (NEXT-SESSION + Sprint 151 dogfood kanıtlı)** |
| `feedback_deckent_kill_approval_required.md` | `deckent_kill` / cleanup / `docker stop` Alperen açık onayı zorunlu | NEXT-SESSION satır 186, Sprint 151 DIRECTIVES satır 33 | P0 | **NEW TODAY (`feedback_sprint_kill_always_ask_user.md` olarak regenere)** |
| `feedback_two_persona_analysis.md` | Her analiz dev + prod milyon user lensi altında yapılır | NEXT-SESSION satır 187 | P0 | KAYIP, Sprint 152'de ilk analiz gerektiren task'ta yeniden öğretilecek |
| `feedback_test_agent_removal.md` | test-writer agent YASAK — ADR-041 | NEXT-SESSION satır 188, summary.md ADR-041 | P0 | KAYIP ama ADR'de kalıcı; kural ADR-041'den türetiliyor |
| `feedback_timezone_trt.md` | UTC+3 TRT sunum zorunlu, user Türkçe plan | NEXT-SESSION satır 189 | P0 | KAYIP, NEXT-SESSION referansı var |
| `feedback_openclaw_not_openhands.md` | Rakip OpenClaw (NOT OpenHands) | NEXT-SESSION satır 190, ROADMAP §7 | P0 | KAYIP, NEXT-SESSION+ROADMAP'te ad geçiyor |
| `feedback_max_workers.md` v2 | WSL2 dev 3-4 worker / prod 50+ özgür (bugün 3→6 config değişti) | NEXT-SESSION satır 191, T-152 config.json | P0 | KAYIP, Sprint 152 config zaten 6 |
| `feedback_build_requires_user_approval.md` | `tsc/vitest/docker build/npm publish` son doğrulama Alperen kararı | Alperen 2026-04-24 direktifi | P0 | **NEW TODAY (regenere)** |
| `feedback_sprint_kill_always_ask_user.md` | Sprint kill aşılmaz kural, %100 kullanıcıya sor | Alperen 2026-04-24 direktifi | P0 | **NEW TODAY (regenere)** |
| `feedback_turkish_response.md` | Koordinatör Türkçe yanıt verir, kod İngilizce | `user_alperen.md` satır 8 implicit | P0 | Kural canlı (konuşma dili), dosya kayıp |
| `feedback_read_only_docs_audits.md` (tahmin) | Audit/analiz sprint'lerinde kod yazma YASAK | Sprint 141-142 deep analysis, Sprint 152 DIRECTIVES | P1 | Kural aktif; ADR önerisi yok |
| `feedback_sprint_no_auto_commit.md` (tahmin) | Sprint sonunda auto-commit YOK, Alperen manuel | Git log + NEXT-SESSION "Alperen elle" | P1 | Kural implicit |
| `feedback_no_cleanup_without_permission.md` (tahmin) | `deckent_cleanup` destructive, onay gerekli | MCP Tool ref tablosu "Destructive: Evet" | P1 | Kayıp |
| `feedback_no_force_push.md` (tahmin) | `git push --force` master'da YASAK | Sprint migration doc safety | P1 | CLAUDE.md safety rules implicit |
| `feedback_dashboard_i18n_mandatory.md` (tahmin) | Dashboard'ta her key TR+EN olmak zorunda | Sprint 151 T-151-003 471/471 i18n | P1 | Sprint 151 retro kanıtı |
| `feedback_dockerfile_non_root.md` (tahmin) | Dockerfile.worker `USER deckent` non-root | ROADMAP Beta GA gate #14 | P1 | ADR-034 isolation'la örtülü |
| `feedback_sprint_log_100_lines_max.md` (tahmin) | Per-sprint log 100 satır budget | DECKENT.md Memory budget | P1 | CLAUDE.md'de kural var |
| `feedback_adr_mandatory_read.md` (tahmin) | Tüm agentlar ADR okumak zorunda | ADR-036 self-referential | P1 | ADR'den türetilebilir |
| `feedback_task_builder_no_npm_run.md` (tahmin) | task-builder `npm run` komutu önermez | Sprint 138 Task 3-4 kural | P2 | Kayıp |
| `feedback_no_half_finished_tasks.md` (tahmin) | Sprint NEVER left incomplete (Brain rule) | `.claude/rules/brain.md` satır 14 | P2 | Brain rule'da kalıcı |
| `feedback_retention_rotation_nondestructive.md` (tahmin) | Sprint 150 H4/H5 retention/rotation — destructive değil | Sprint 150A Hot Fix | P2 | Kayıp |
| `feedback_no_git_add_all.md` (tahmin) | `git add .` YASAK, dosya dosya stage | CLAUDE.md safety protocol | P2 | CLAUDE.md'de var |
| `feedback_claude_mcp_register_once.md` (tahmin) | `claude mcp add deckent` her session tekrarlanmaz | Migration playbook | P2 | Migration doc'ta var |
| `feedback_verhex_brand.md` (tahmin) | Verhex markası vurgu + deckent ürün adı | `user_alperen.md` | P2 | user_alperen'da örtülü |
| `feedback_ed25519_sign_verify_required.md` (tahmin) | Skill marketplace'te Ed25519 imza zorunlu | Roadmap 2.6, ADR-034 | P2 | Kayıp, ADR'de kısmen var |
| `feedback_sprint_freeze_no_feature_during_ga.md` (tahmin) | Beta GA dönemi sadece polish, yeni feature yok | Sprint 151 theme | P2 | Kayıp |
| `feedback_no_typescript_any.md` (tahmin) | TypeScript `any` kullanımı minimalize | Sprint 142 batch analysis raporları | P2 | ADR-001 strict config implicit |
| `feedback_no_console_log_in_prod.md` (tahmin) | `console.log` yerine event-stream/logger | Sprint 138 event-stream adoption | P2 | Kayıp |
| `feedback_tmp_dir_not_home.md` (tahmin) | Geçici dosyalar `/tmp` veya `.tasks/`, asla `~/` | Sandbox güvenlik | P2 | Kayıp |
| `feedback_heartbeat_ordered_keys.md` (tahmin) | Heartbeat JSON anahtar sırası sabit | Worker guide | P2 | WORKER-GUIDE.md implicit |
| `feedback_no_emoji_unless_requested.md` (tahmin) | Koordinatör emoji kullanmaz (user istemedikçe) | CLAUDE.md tone guide | P2 | CLAUDE.md'de var |
| `feedback_sprint_rebuild_after_config_change.md` (tahmin) | config.json değişikliği sonrası tsc rebuild | Migration Bölüm 5.3 | P2 | Playbook'ta var |
| `feedback_no_test_writer_mocks_db.md` (tahmin) | Integration test'te mock db kullanma | Sprint 144-145 vitest triage | P2 | Kayıp |
| `feedback_dashboard_port_8080.md` (tahmin) | Dashboard default 8080 (varyasyon başlarsa user onay) | Dashboard config | P3 | Kayıp |
| `feedback_max_3_tmux_sessions.md` (tahmin) | Tmux backend paralel 3 session cap | Spawn-backend doc | P3 | Kayıp, Docker'a geçildi |
| `feedback_no_docker_prune_autocall.md` (tahmin) | `docker prune` otomatik çalışmaz | Destructive kuralı | P3 | Kayıp |
| `feedback_brain_memory_db_readonly_in_worker.md` (tahmin) | Worker `.brain/memory.db`'ye yazamaz (Brain-only) | ADR-008 | P3 | ADR-008'den türetilebilir |
| `feedback_debt_close_requires_evidence.md` (tahmin) | DEBT kapama koşulsuz değil, kanıt zorunlu | Sprint 146 debt spiral | P3 | Kayıp |
| `feedback_memory_v2_dual_layer_tr.md` (tahmin) | FTS5 TR normalize + en raw çift katman | Memory V2 adoption | P3 | Kayıp, kod düzeyinde sabit |
| `feedback_claude_cli_session_auth.md` (tahmin) | Claude CLI oturum kimlik doğrulaması (API yerine) | Migration Bölüm 1.2 | P3 | Kayıp, config'de var |

**[INFO] Kategori toplam:** ~40 feedback dosya (listelenen 40 satır, gerçek sayı ~35-40 arası).

---

#### 2.2 Project Dosyaları (~20 tahmini)

| Tahmini dosya | İçerik özü | Kanıt | Priority |
|---------------|-----------|-------|----------|
| `project_sprint151_preflight_p0_bugs.md` | Sprint 151 preflight: notify background subprocess wire, vitest 1 fail, worker timeout root cause | DIRECTIVES satır 373, NEXT-SESSION P0 listesi | P0 |
| `project_sprint150_hot_fix_pattern.md` | Hot Fix with Claude Subagents pattern H1..H7, ~68dk, ~1M token | ROADMAP §11.11 | P0 |
| `project_sprint149_mode_cli.md` | `deckent mode` CLI 5 subcommand | RETRO satır "deckent mode CLI" | P1 |
| `project_sprint148_docker_hb_final.md` | Docker HB exit pattern 6-layer fix | Sprint 148 + 151 RETRO | P1 |
| `project_sprint147_nervous_system_birth.md` | ADR-040 Nervous System kabul, 11 detector | Sprint 147 commit | P1 |
| `project_sprint146_prompt_god_template.md` | buildTaskPrompt single entry point | Sprint 146 RETRO | P1 |
| `project_beta_ga_20_gate_tracker.md` | 17/20 → 19/20 exit gate durumu | NEXT-SESSION + ROADMAP | P0 |
| `project_deckent_wave1.md` | Wave 1 core types/constants/config (2026-03-16 kapandı) | RECOVERED | P3 |
| `project_deckent_wave3.md` | Wave 3 brain module sprint lifecycle (2026-03-16 kapandı) | RECOVERED | P3 |
| `project_vision_god_level.md` | Roadmap Phase 2 152-160, Phase 3 161-200 | ROADMAP | P1 |
| `project_competitive_analysis_openclaw.md` | OpenClaw 346K star karşılaştırması | COMPETITIVE-ANALYSIS.md | P2 |
| `project_discord_telegram_whatsapp.md` | Messaging trio deploy durumu | Sprint 151 T-151-004/005/007 | P1 |
| `project_deckenthub_skill_marketplace.md` | VerhexIO/deckent-hub repo + 20 seed skill | ROADMAP §2.6 | P1 |
| `project_memory_v2_174_entries.md` | DB-first migration başarı, 174 entry, 96% context reduction | IDENTITY.md | P2 |
| `project_dashboard_7_pages.md` | ChatPage ekleme Sprint 151 | Sprint 151 T-151-003 | P2 |
| `project_adr_governance_37_migration.md` | Sprint 138 37 ADR migration + MADR v3 | ADR-036 | P2 |
| `project_rbac_authority_matrix_runtime.md` | ADR-037 runtime enforcement +1370 LoC | Sprint 139 T-034/35 | P2 |
| `project_self_modifying_detector.md` | ADR-038/039 deckent dogfood vs user project discrimination | Sprint 139 T-051/52 | P2 |
| `project_public_repo_flip_pending.md` | VerhexIO/deckent → /deckent flip handoff | NEXT-SESSION + Sprint 151 T-151-002 | P0 |
| `project_npm_publish_handoff.md` | `npm publish --access public --tag beta` hazır | Sprint 151 T-151-001 | P0 |

**[INFO] Kategori toplam:** ~20 project dosya.

---

#### 2.3 User Dosyaları (~5-8 tahmini)

| Tahmini dosya | İçerik | Kanıt | Priority |
|---------------|--------|-------|----------|
| `user_alperen.md` | Alperen @ Verhex, TS creator, TR plans | RECOVERED | P0 |
| `user_alperen_role_expansion_gradual.md` (tahmin) | Alperen zamanla role ekliyor (dev → architect → founder) | Sprint'ler boyunca evrim | P3 |
| `user_alperen_language_tr_first.md` (tahmin) | TR yanıt, EN teknik terim | `user_alperen` satır 8 | P2 |
| `user_alperen_verhex_brand.md` (tahmin) | Verhex kuruluşu, Deckent ilk ürünü | `user_alperen` implicit | P3 |
| `user_alperen_active_sprints.md` (tahmin) | Aktif sprint takibi, 145+ sprint history | `.brain/MEMORY.md` kronolojisi | P3 |

**[INFO] Kategori toplam:** ~5-8 user dosya (tek user, kısmi güncelleme).

---

#### 2.4 Reference Dosyaları (~10-15 tahmini)

| Tahmini dosya | İçerik | Priority |
|---------------|--------|----------|
| `reference_verhexio_github_org.md` | `github.com/VerhexIO/deckent` private + `VerhexIO/deckent` public flip | P1 |
| `reference_deckent_hub_repo.md` | `VerhexIO/deckent-hub` skill marketplace | P1 |
| `reference_claude_api_anthropic_sdk.md` | `@anthropic-ai/sdk`, Opus 4.7 | P2 |
| `reference_npm_deckent_package.md` | `deckent@1.0.0-beta.1` npm publish pending | P1 |
| `reference_windows_onedrive_backup.md` | C:\Users\...\OneDrive\Deckent\ backup konum | P0 |
| `reference_gh_oauth_token.md` | `~/.config/gh/hosts.yml` gho_* token | P1 |
| `reference_wsl_mount_c.md` | `/mnt/c/Users/.../OneDrive/Deckent/` WSL mount | P2 |
| `reference_discord_server_invite.md` | Discord server invite + 7 kanal | P2 |
| `reference_telegram_bot_handle.md` | Telegram bot @handle (BotFather) | P2 |
| `reference_dev_to_hashnode_posts.md` | Launch blog post URL'leri | P2 |
| `reference_openclaw_competitor_url.md` | OpenClaw repo URL, star count | P3 |
| `reference_roadmap_god_level.md` | `docs/ROADMAP-GOD-LEVEL.md` anchor dosya | P1 |
| `reference_adr_governance_madr_v3.md` | MADR v3 format şablonu | P2 |
| `reference_nervous_11_detector_list.md` | 11 detector registry | P2 |

**[INFO] Kategori toplam:** ~10-15 reference dosya.

---

### 3. Toplam Kayıp Kategori Dağılımı

| Kategori | Tahmini kayıp | Kanıt zinciri | Anlık aktif oran |
|----------|--------------|---------------|------------------|
| feedback_* | ~35-40 | NEXT-SESSION 7 explicit + Sprint retro implicit | 7 çekirdek NEXT-SESSION'da → Sprint 152'de aktif; diğer 28-33 dormant |
| project_* | ~20 | Sprint-özel durumlar | 8-10'u DIRECTIVES'te aktif; kalan 10 RETRO'dan tetiklenebilir |
| user_* | ~5-8 | user_alperen RECOVERED | Çekirdek kuralar canlı |
| reference_* | ~10-15 | Dış sistem URL/config işaretçileri | NEXT-SESSION'da örtülü |
| **TOPLAM** | **~78-83 (≈82)** | — | Çekirdek ~15-20 **Sprint 152-153 ilk günde aktif**; kuyruk ~60 Alperen tetiklediğinde yeniden öğretilir |

**[FAIL] Net kayıp:** 82 − 3 = **79 kalıcı kayıp** (DIRECTIVES'in "~78" değerlendirmesiyle uyumlu; fark ±1 sınırında).

---

### 4. Yeniden-Öğrenme Maliyeti — Sprint 152-153 Projection

| Senaryo | Tahmini Alperen prompt-yaz süresi | Claude token maliyeti | Süre delta |
|---------|----------------------------------|----------------------|-----------|
| **Best case** (Sprint 152 READ-ONLY audit, kural çatışması az) | ~30 dakika (NEXT-SESSION prompt zaten 7 kural içeriyor; bugünün 2 yeni dosyası canlı) | ~0 extra (context'te zaten gömülü) | 0 |
| **Realistic case** (Sprint 153 messaging + hub iş başladığında Alperen kural koyduğunda) | 2-3 saat (~20 yeni kural/durum yaratımı) | ~30-50K token extra (her yeni kural ~500-1500 token prompt) | +1 sprint süresi |
| **Worst case** (P0 kural tekrar çiğneme, worker yanlış aksiyon alır, rollback) | 4-6 saat (düzeltme + yeni kural + regresyon koruması) | ~80-120K token + 1-2 ekstra Sprint task | +2-3 saat per incident |

**[PASS]** 7 P0 kural NEXT-SESSION-PROMPT.md satır 185-191'de açıkça listelendiği için **Sprint 152-153 başında aktif** — kritik kayıp bu kuralları etkilemedi.

**[DRIFT]** Orta katman (~28-33 feedback + ~10 project kayıp) Alperen'in yeniden söylemesi veya Claude'un tehlikeli bir işlem denemesiyle gün yüzüne çıkacak.

**[FAIL]** Uzun kuyruk (~40 dosya) Alperen'in belki de aylar sonra fark edeceği drift (örn. "Neden artık auto-commit'e müdahale etmiyorsun?" gibi sorular).

---

### 5. Prevention Playbook — `~/.claude/` Tam Yedekleme Protokolü

Mevcut SYSTEM-MIGRATION-2026-04-22.md'de **eksik kalan noktalar:**

- [MISSING] Pre-migration'da `~/.claude/projects/.../memory/` dizininin **gerçek dosya listesi snapshot'ı alınmadı** (sadece `du -sh` boyutu alındı).
- [MISSING] Post-migration'da **count-vs-count integrity check** adımı yok (beklenen 82, bulunan 6 kontrolü eksik).
- [MISSING] Windows OneDrive/Deckent path'i **alternatif fallback** olarak dokümante edilmemiş (yalnız bu sayede 3 dosya kurtarıldı).
- [MISSING] **Auto-memory dosyalarının git-tracked alternatif export'u yok** — bu en kritik eksiklik.

#### 5.1 Revize Prevention Checklist (Gelecek Taşımalar İçin)

```bash
# PHASE 1: PRE-MIGRATION SNAPSHOT (eski sistemde yapılacak)

# 1.1 Auto-memory dizinini dosya dosya listele ve SHA sum'larını al
find ~/.claude/projects/-home-*/memory/ -type f -name "*.md" \
  -printf '%p %s %TY-%Tm-%Td\n' \
  | tee /tmp/auto-memory-snapshot.txt
sha256sum ~/.claude/projects/-home-*/memory/*.md \
  | tee /tmp/auto-memory-sha256.txt

# 1.2 Manifest kopyasını repo'ya commit et (git-tracked backup)
mkdir -p .brain/backups/auto-memory/
cp /tmp/auto-memory-snapshot.txt .brain/backups/auto-memory/
cp /tmp/auto-memory-sha256.txt .brain/backups/auto-memory/
cp ~/.claude/projects/-home-*/memory/MEMORY.md \
   .brain/backups/auto-memory/MEMORY-index-$(date -I).md

# 1.3 Tüm memory dosyalarının TAR.GZ'i repo-adjacent (NOT committed, too large)
tar czf ~/auto-memory-backup-$(date -I).tar.gz \
  -C ~/.claude/projects \
  -home-alperen-deckent-dev/memory/
ls -la ~/auto-memory-backup-$(date -I).tar.gz

# 1.4 External backup — Windows OneDrive'a kopya
cp ~/auto-memory-backup-$(date -I).tar.gz \
  /mnt/c/Users/$USER/OneDrive/Deckent/backups/

# PHASE 2: MIGRATION — rsync (mevcut playbook Bölüm 3.A)
rsync -avzP \
  ~/.claude/ \
  alperen@yeni-sistem-ip:~/.claude/

# PHASE 3: POST-MIGRATION VERIFICATION (yeni sistemde)

# 3.1 Count integrity
EXPECTED=$(wc -l < .brain/backups/auto-memory/auto-memory-snapshot.txt)
ACTUAL=$(ls ~/.claude/projects/-home-*/memory/*.md | wc -l)
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "⚠ COUNT MISMATCH: expected=$EXPECTED got=$ACTUAL"
  echo "⚠ Restoring from tar.gz..."
  tar xzf ~/auto-memory-backup-*.tar.gz -C ~/.claude/projects/
fi

# 3.2 SHA integrity
sha256sum --check .brain/backups/auto-memory/auto-memory-sha256.txt
# PASS → tüm dosyalar hash-identical geldi

# 3.3 MEMORY.md indeks consistency
diff <(cat ~/.claude/projects/-home-*/memory/MEMORY.md) \
     .brain/backups/auto-memory/MEMORY-index-*.md
```

#### 5.2 Long-term Alternatif — Git-Tracked Export

Mevcut durumda **`.brain/memory.db` SQLite git-ignored ama `.brain/exports/*.md` git-tracked**. Aynı prensip auto-memory için de uygulanabilir:

| Öneri | Açıklama | Çaba | Fayda |
|-------|----------|------|-------|
| `.brain/auto-memory-export.md` | Auto-memory dosyalarını tek markdown'a topla, haftada bir regenere, git-tracked | Düşük (~20 LoC script) | Kalıcı backup, code review ile drift görülür |
| `.brain/backups/auto-memory/YYYY-MM-DD/` per-sprint snapshot | Sprint sonunda `.result` retro phase'de snapshot al | Orta (~50 LoC + hook) | Sprint-granular recovery |
| Auto-memory dosyalarını DB'ye migrate et | SQLite `.brain/memory.db`'ye yeni tip ekle (`auto_memory`) | Yüksek (~200 LoC + schema migration) | Tek doğruluk kaynağı + FTS5 search |

**Öneri:** İlk ikisi (Sprint 153+ için). Üçüncü (Sprint 160+ Phase 2 sonrası architectural decision).

---

### 6. SYSTEM-MIGRATION-2026-04-22.md Playbook Post-Mortem

Playbook **4/5 dalda işini yaptı** (rsync method, brain memory.db integrity check, dist/node_modules rebuild, docker image rebuild). Tek ciddi eksiklik `~/.claude` auto-memory entegritesini **eski sistem hâlâ açıkken doğrulama** ve **geri-dönüş senaryosu** yoktu.

| Bölüm | Durum | Not |
|-------|-------|-----|
| Bölüm 1.1 Proje taşıma listesi | [PASS] | Tam |
| Bölüm 1.2 `~/.claude` KESİNLİKLE TAŞI | [DRIFT] | Listelenmiş ama integrity check yok |
| Bölüm 2.2 Memory + Brain Export Doğrulama | [DRIFT] | `du -sh` var, **dosya sayısı check + SHA sum yok** |
| Bölüm 3.A rsync yöntemi | [PASS] | Doğru yaklaşım |
| Bölüm 4 Post-migration checklist | [DRIFT] | "ls ~/.claude/projects/.../memory/ \| wc -l" var, fail action yok |
| Bölüm 6.3 "~/.claude memory taşınmazsa" risk | [DRIFT] | Risk listelenmiş ama **actionable recovery path yok** |

**Sprint 153+ için playbook revize önerisi:** `SYSTEM-MIGRATION-*` dokümanına **Bölüm 2.2.1 Auto-Memory Snapshot** ve **Bölüm 4.1 Auto-Memory Count + SHA Integrity Check** alt-bölümleri ekle (yukarıdaki 5.1 script'ini doküman haline getir).

---

### 7. Recovery Priority Matrix — P0/P1/P2 Aksiyon Sıralaması

#### Hemen (Sprint 152 kalanı — analiz sprint'i, aksiyon yok, sadece flag):

| Priority | Aksiyon | Sahip | Etki |
|----------|---------|-------|------|
| P0 | NEXT-SESSION-PROMPT.md 7 çekirdek kuralı CLAUDE.md'ye de inject (silinmez ana context) | Alperen (manuel) | 7 kural her session'da otomatik yüklenir |
| P0 | 2 NEW TODAY dosyasının (`feedback_sprint_kill`, `feedback_build_approval`) git tracking'e alınması | Alperen onayı | Kalıcı |

#### Sprint 153 (messaging + hub + triage ilk sprint):

| Priority | Aksiyon | Tahmini effort |
|----------|---------|---------------|
| P0 | 7 feedback dosyasının manuel yeniden-yazılması (NEXT-SESSION listesi) | 1 task, ~30 dk, 500 LoC |
| P0 | Prevention playbook Bölüm 5.1 script'ini `.brain/backups/auto-memory/` altına ekle | 1 task, ~20 LoC |
| P1 | Kayıp ~10 project dosyasının Sprint 146-151 RETRO'dan türetilmesi (regenerate pipeline) | 1 task, ~1 saat |
| P1 | SYSTEM-MIGRATION doküman revizyonu (Bölüm 2.2.1 + 4.1 ekle) | 1 task, ~30 dk |

#### Sprint 154+:

| Priority | Aksiyon |
|----------|---------|
| P2 | Auto-memory git-tracked export pipeline (`.brain/auto-memory-export.md` haftalık regenere) |
| P2 | Reference_* dosyalarının URL/config işaretçi envanterini oluştur |
| P3 | Auto-memory'yi SQLite DB'ye migrate et (uzun vade, Phase 2 tartışması) |

---

### 8. Meta-Dogfood Gözlemi

Sprint 152 bu audit sprint'i, **"deckent'in kendi kendini denetlemesi"** meta-dogfood fırsatı yaratıyor (ROADMAP §11.11 ve Sprint 150A Hot Fix pattern ile uyumlu). Bu özel task (T-152-018) auto-memory kaybını analiz ederken **bizzat SQLite `memory.db`'nin DB-first tasarımının doğru karar olduğunu** kanıtlıyor:

- `.brain/memory.db` 174 entry → **taşıma sonrası intact** (git-tracked export'lar + SQLite rsync'i bütünüyle korundu).
- `~/.claude/projects/.../memory/` 82 dosya → **%96 kayıp** (dosya tabanlı, session-scoped, git-untracked).

**[PASS] Öğrenim:** Deckent Memory V2 DB-first mimarisi (`.brain/memory.db`) doğru teknik kararı verdi. Claude Code auto-memory'nin aynı disipline alınması gerekli (P2 aksiyon §7).

---

## Sprint 153+ İçin Aksiyon Listesi

| # | Priority | Aksiyon | Tahmini effort | Hedef sprint |
|---|----------|---------|---------------|--------------|
| 1 | **P0** | NEXT-SESSION 7 çekirdek feedback'ini (npm_publish, timezone, two_persona, kill_approval, test_agent_removal, max_workers, openclaw_not_openhands) yeniden üret | 30dk/task, toplam 1 task | sprint-153 |
| 2 | **P0** | Prevention playbook `.brain/backups/auto-memory/` script'i entegre et (§5.1) | 1 saat, 1 task | sprint-153 |
| 3 | **P0** | 2 NEW TODAY dosyasının (`feedback_sprint_kill`, `feedback_build_requires_user_approval`) git-tracked mirror'ı `.brain/exports/auto-memory.md`'de tut | 30dk, 1 task | sprint-153 |
| 4 | **P1** | SYSTEM-MIGRATION playbook Bölüm 2.2.1 + 4.1 revizyonu (Auto-Memory Snapshot + Integrity Check alt-bölümleri) | 30dk, 1 task | sprint-153 |
| 5 | **P1** | ~10 project_* dosyasını Sprint 146-151 retro'lardan regenerate (Hot Fix pattern, Nervous System birth, Prompt God template, vb.) | 1 saat, 1 task | sprint-153 veya sprint-154 |
| 6 | **P1** | Auto-memory git-tracked export pipeline (`.brain/exports/auto-memory.md`) — sprint RETRO phase'inde regenere | 2 saat, 1 task | sprint-154 |
| 7 | **P2** | Reference_* URL/config işaretçi envanterini `.brain/exports/references.md` olarak yayımla | 1 saat, 1 task | sprint-154 |
| 8 | **P2** | Orchestrator'a `auto_memory` tipi ekle (`MemoryEntryV2.type` union'a dahil et) | 3-4 saat, 1 task | sprint-158+ |
| 9 | **P3** | Auto-memory'yi SQLite DB'ye tam migrasyon (dosya → DB → FTS5) | 1-2 sprint | sprint-160+ |
| 10 | **P2** | Post-taşıma hata yönetimi için `deckent doctor --auto-memory-check` alt-flag ekle | 2 saat, 1 task | sprint-153 veya sprint-154 |

---

## Kanıt Ekleri

### Ek A — Canlı Dosya Sayımı (worker konteyner `/tmp/deckent-home/...`)

```
$ ls ~/.claude/projects/-home-alperen-deckent-dev/memory/
MEMORY.md
feedback_build_requires_user_approval.md   # NEW 2026-04-24 12:22
feedback_sprint_kill_always_ask_user.md    # NEW 2026-04-24 12:22
project_deckent_wave1.md                   # RECOVERED 2026-04-24 08:00
project_deckent_wave3.md                   # RECOVERED 2026-04-24 08:00
user_alperen.md                            # RECOVERED 2026-04-24 08:00

$ ls ~/.claude/projects/-home-alperen-deckent-dev/memory/ | wc -l
6
```

### Ek B — MEMORY.md Indeksi (regenere edilmiş)

```
# Memory Index

- [user_alperen.md](user_alperen.md) — Alperen @ Verhex, Deckent creator, plans in Turkish, codes in TypeScript
- [project_deckent_wave1.md](project_deckent_wave1.md) — Wave 1 (core types/constants/config) completed 2026-03-16
- [project_deckent_wave3.md](project_deckent_wave3.md) — Wave 3 (brain module, sprint lifecycle) completed 2026-03-16
- [feedback_sprint_kill_always_ask_user.md](feedback_sprint_kill_always_ask_user.md) — Sprint kill %100 kullanıcı onayı ister
- [feedback_build_requires_user_approval.md](feedback_build_requires_user_approval.md) — Build son doğrulama Alperen'in kararı
```

**[FAIL]** İndekste yalnızca **5 entry**; 82 entry'lik eski indeks bu taşımayla beraber kalıcı kayıp.

### Ek C — NEXT-SESSION-PROMPT.md Referans Kanıtı (satır 44-52)

```
# Beklenen: 82+ (en kritik dosyalar:
#   - feedback_npm_publish_alperen_approval.md (2026-04-22 yeni)
#   - feedback_two_persona_analysis.md
#   - feedback_deckent_kill_approval_required.md
#   - feedback_test_agent_removal.md
#   - feedback_max_workers.md
#   - feedback_timezone_trt.md
#   - feedback_openclaw_not_openhands.md
#   - project_sprint151_preflight_p0_bugs.md
#   - MEMORY.md (indeks))
```

### Ek D — SYSTEM-MIGRATION playbook ilgili satırlar

- Bölüm 1.2 satır 97: "`~/.claude/projects/-home-alperen-deckent-dev/memory/` | 82 memory dosyası — auto-memory bütün öğrenimler"
- Bölüm 6.3 satır 461-462: "Memory.db corrupt | Düşük | Yüksek (174 entry kayıp)" ve "~/.claude memory taşınmazsa | Orta | Çok yüksek (82 auto-memory + tüm konuşma history)"
- Bölüm 4 satır 349-351: "Auto-memory: ls ~/.claude/projects/.../memory/ | wc -l; Beklenen: 82+"

### Ek E — Bugün Oluşturulan 2 Dosyanın İçeriği (kanıt: pre-migration orijinallerin yerini alan regenere'ler)

`feedback_sprint_kill_always_ask_user.md` — 2026-04-24 12:22'de Alperen'in session'da "sprint kill yasaklı her zaman bu aşılmaz değişmez kural %100 her ihtimalde kullanıcıya sorulmalı" direktifinden türedi (dosya içindeki `Why:` satırında açıkça belirtilmiş).

`feedback_build_requires_user_approval.md` — 2026-04-24 12:22'de Alperen'in session'da "build workerlar tarafından çalıştırılmaz her zaman son doğrulama olarak ben karar veririm" direktifinden türedi.

İkisi de pre-migration orijinalleri olan `feedback_deckent_kill_approval_required.md` ve `feedback_npm_publish_alperen_approval.md` yerine yeni cümle yapılarıyla üretildi — **regenere ama kurala uyumlu**.

---

## Karar Özeti

**[FAIL] Kalıcı kayıp doğrulandı:** 82 → 3 gerçek recovery + 2 bugün-regenere + 1 rebuild indeks = **79 dosya kayıp**. DIRECTIVES "~78" tahmini ±1 sınırında doğru.

**[PASS] P0 risk yönetildi:** NEXT-SESSION-PROMPT.md 7 çekirdek kuralı açıkça listeledi, Sprint 152-153'te aktif. `.brain/memory.db` (174 entry DB-first) **etkilenmedi** → ADR/RETRO/DEBT bütün.

**[DRIFT] P1 orta katman:** ~30 feedback + ~10 project dosyası Alperen tetiklediğinde regenere gerekecek (~2-3 saat ek effort Sprint 153).

**[DRIFT] Playbook gap:** SYSTEM-MIGRATION doküman Bölüm 2.2 ve 4'te integrity check / fallback adımı yok → Sprint 153 P0 aksiyonu.

**[PASS] Meta-öğrenim:** DB-first Memory V2 mimarisi (SQLite + git-tracked export) dosya-tabanlı auto-memory'den çok daha dayanıklı; aynı prensibi auto-memory için de uygula (P2 Sprint 154+).

**Sprint 152 bu task için net sonuç:** READ-ONLY audit tamamlandı, kod değişikliği yok (0 satır `src/` / `tests/` diff), rapor `docs/audits/sprint-152/T-152-018-automemory-loss-impact.md` altında.
