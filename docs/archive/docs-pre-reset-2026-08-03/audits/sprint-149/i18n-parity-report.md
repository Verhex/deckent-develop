# TR/EN Parity Report

> Generated: 2026-04-20T21:24:49.215Z
> Script: scripts/i18n-parity.mjs

## Summary

| Document Pair | EN Sections | TR Sections | Missing in TR | Extra in TR | Coverage |
|---------------|-------------|-------------|---------------|-------------|----------|
| README | 41 | 31 | 40 | 30 | 2% |
| VISION | 19 | 19 | 15 | 15 | 21% |
| BETA-TRACKER | 87 | 108 | 77 | 98 | 11% |
| MASTER-BLUEPRINT / ANA-PLAN | 145 | 101 | 144 | 100 | 1% |

## Detailed Analysis

### README

**Files:**
- EN: `README.md` (580 lines)
- TR: `README-TR.md` (504 lines)

**Section Coverage:** 2% (1/41 sections matched)
**Line Ratio:** 87% (TR has 504 vs EN 580 lines)

**Missing in TR (40 sections):**
- `## Quick Start`
- `## Dual Mode: Sprint + Task`
- `## How It Works`
- `### Sprint Mode`
- `### Task Mode`
- `## Architecture`
- `## Key Features`
- `### Core Orchestration`
- `### Security & Safety`
- `### Intelligence & Memory`
- `### Agents & Skills`
- `### Infrastructure`
- `### Cross-Platform`
- `## Comparison`
- `## Requirements`
- `## Installation`
- `## CLI Usage`
- `### Initialize a Project`
- `### Set Your Mode`
- `### Start a Sprint (Sprint Mode)`
- `### Run a One-Shot Task (Task Mode)`
- `### Check Status`
- `### Query Memory`
- `### Health Check`
- `### All Commands`
- `## MCP Integration`
- `### MCP Tools (22)`
- `### MCP Resources (8)`
- `## Configuration`
- `### Key Options`
- `### Plan Tiers`
- `### Multi-Provider Support`
- `### `.deck` Secret Interpolation`
- `## Docker Backend (Isolated Workers)`
- `## Nervous System`
- `## Workspace Structure`
- `## DeckentHub — Skill Registry`
- `## Contributing`
- `## Documentation`
- `## License`

**Extra in TR (30 sections — TR-only content):**
- `## Hızlı Başlangıç`
- `## Nasıl Çalışır`
- `## Mimari`
- `## Temel Özellikler`
- `## Karşılaştırma`
- `## Platform Desteği`
- `## Gereksinimler`
- `## Kurulum`
- `## CLI Kullanımı`
- `### Proje Başlat`
- `### Sprint Başlat`
- `### Durumu Kontrol Et`
- `### Çalıştırmadan Planla`
- `### Sağlık Kontrolü`
- `### Tüm Komutlar`
- `## MCP Entegrasyonu`
- `### MCP Tool'lar (21)`
- `### MCP Resource'lar (8)`
- `## Yapılandırma`
- `### Temel Seçenekler`
- `### Plan Katmanları`
- `### Çoklu Provider Desteği`
- `## Docker Backend (İzole Worker'lar)`
- `### Kurulum`
- `### Nasıl Çalışır`
- `## HTTP API`
- `## Çalışma Alanı Yapısı`
- `## Katkıda Bulunma`
- `## Dokümantasyon`
- `## Lisans`

**Matched Sections (1):**
- `## Web Dashboard` ✓

### VISION

**Files:**
- EN: `VISION.md` (142 lines)
- TR: `VISION-TR.md` (142 lines)

**Section Coverage:** 21% (4/19 sections matched)
**Line Ratio:** 100% (TR has 142 vs EN 142 lines)

**Missing in TR (15 sections):**
- `## Vision`
- `## Mission`
- `## Target Users`
- `## Competitive Analysis`
- `## Technology Decisions`
- `### Triple Spawn Backend (tmux + Subprocess + Docker)`
- `### MCP (Model Context Protocol) Integration`
- `### Docker Container Isolation`
- `## Roadmap`
- `### Phase 1: "Orchestration Foundation" — Complete (Sprint 1-82)`
- `### Phase 2: "Beta Readiness" — Active (Sprint 83-130)`
- `### Phase 3: "Public Beta" — Next`
- `### Phase 4: "Autonomous Assistant" — Future`
- `## Values`
- `## Deckent by the Numbers`

**Extra in TR (15 sections — TR-only content):**
- `## Vizyon`
- `## Misyon`
- `## Hedef Kullanıcılar`
- `## Rakip Analizi`
- `## Teknoloji Kararları`
- `### Üçlü Spawn Backend (tmux + Subprocess + Docker)`
- `### MCP (Model Context Protocol) Entegrasyonu`
- `### Docker Container İzolasyonu`
- `## Yol Haritası`
- `### Faz 1: "Orkestrasyon Temeli" — Tamamlandı (Sprint 1-82)`
- `### Faz 2: "Beta Hazırlığı" — Aktif (Sprint 83-123)`
- `### Faz 3: "Public Beta" — Sonraki`
- `### Faz 4: "Otonom Asistan" — Gelecek`
- `## Değerler`
- `## Sayılarla Deckent`

**Matched Sections (4):**
- `### TypeScript + ESM` ✓
- `### Multi-Provider (Claude + Codex + Gemini)` ✓
- `## Sprint History` ✓
- `## Sprint Metrics` ✓

### BETA-TRACKER

**Files:**
- EN: `BETA-TRACKER.md` (1535 lines)
- TR: `BETA-TRACKER-TR.md` (1739 lines)

**Section Coverage:** 11% (10/87 sections matched)
**Line Ratio:** 113% (TR has 1739 vs EN 1535 lines)

**Missing in TR (77 sections):**
- `## Sprint 150 — Beta GA Exit Criteria`
- `## Sprint 145-150 Roadmap — Beta GA Countdown`
- `## M0-M9 Milestone Progress Matrix`
- `## Current Status`
- `## Overview`
- `## Phase Plan`
- `### Phase 1: "Eat Your Own Dog Food" — COMPLETE ✅`
- `### Phase 1.5: "Init UX + Onboarding" — COMPLETE ✅ (Sprint 070-071)`
- `### Phase 2: "General Usability" — ACTIVE`
- `### Sprint 145 Deliverables Checklist (27 Tasks, 7 Waves)`
- `### Phase 3: "Documentation"`
- `### Phase 4: "Public Repo"`
- `## Priority Matrix (P0-P6)`
- `## P0 — npm Packaging + Dogfooding — COMPLETE ✅`
- `## P1 — Provider & Tier Generalization`
- `## P2 — Documentation`
- `## P4 — Platform & Infrastructure`
- `## P5 — Code Quality`
- `## P6 — User Experience Improvements`
- `## Competitive Analysis`
- `### A. OpenClaw (Open-Source Personal AI Assistant)`
- `### B. Microsoft Copilot Cowork (Enterprise AI Orchestrator)`
- `### C. Perplexity Computer (Multi-Model AI Agent System)`
- `### D. Devin 2.0/3.0 (Autonomous Software Engineer)`
- `### E. Claude Agent SDK + Computer Use (Anthropic Ecosystem)`
- `### F. Claude Managed Agents — CMA (Anthropic Cloud Agent Platform)`
- `### G. Comparison Matrix`
- `### H. Deckent's Unique Position`
- `## Verified Blockers (Code-Verified)`
- `### BLOCKER-1: LEARNING LOOP BROKEN — ✅ RESOLVED (Sprint 091)`
- `### BLOCKER-2: INTENT CLASSIFIER IS STATIC (VERIFIED)`
- `### BLOCKER-3: SILENT ERROR SWALLOWING — ✅ RESOLVED (Sprint 085+086+087+088)`
- `### BLOCKER-4: COVERAGE THRESHOLD — ✅ RESOLVED (Sprint 086)`
- `### Corrected False Claims`
- `## Self-Improvement Roadmap`
- `### PHASE 0: Observability Foundation — ✅ COMPLETE (Sprint 085)`
- `### PHASE 1: Close the Learning Loop — ✅ COMPLETE (Sprint 086)`
- `### PHASE 2: Autonomous Adaptation — ✅ COMPLETE (Sprint 088+091)`
- `### PHASE 3: Proactive System — ✅ PARTIALLY COMPLETE (Sprint 088)`
- `### PHASE 4: Human-in-the-Loop — ✅ PARTIALLY COMPLETE (Sprint 088)`
- `### PHASE 5: Ecosystem Expansion (4+ sprints)`
- `## Sprint History (Sprint 136-145)`
- `## Dogfooding Bug Tracker`
- `### Sprint 070 — Init UX Overhaul (15 fixes)`
- `### Sprint 071 — Dogfooding Bug Fixes (7 fixes + upgrade)`
- `### Sprint 070 — New Features`
- `### Known Open Bugs`
- `## Docker & Infrastructure`
- `### A. Critical Issues Found and Fixed (3)`
- `### B. E2E Test Results`
- `### C. Sprint 103 Results (7 Tasks)`
- `### D. New Features Added`
- `### E. Container Exit Code Analysis (Sprint 103 Test Containers)`
- `### F. Issues Detected and Resolved`
- `### G. `deckent run` Test Results`
- `### H. Current Work Plan (Sprint 104+)`
- `### Session Wrap-Up (April 7, 2026 — 10 commits)`
- `### Session Wrap-Up (April 8-9, 2026 — Docker Live Verification)`
- `### I. Token Usage Analysis + Context-Aware Routing Work Plan`
- `## Success Metrics & Risk`
- `### Self-Improvement Metrics`
- `### Autonomy Metrics`
- `### Competitive Convergence`
- `### Risk Analysis`
- `## Strategic Positioning`
- `### ✅ Short Term — COMPLETE (Sprint 085-086): "Learning Orchestrator"`
- `### ✅ Medium Term — COMPLETE (Sprint 087-097): "Proactive Developer Assistant"`
- `### ✅ Infrastructure Maturity — COMPLETE (Sprint 137-145): "Foundational Hardening"`
- `### Long Term (Sprint 146-150+): "Beta GA + Autonomous Software Team"`
- `## Conclusion`
- `## Sources`
- `### Claude Ecosystem`
- `## Sprint 146 — Detailed Summary`
- `## Sprint 148 — Detailed Summary`
- `### Key Insights — Sprint 148`
- `### Sprint 148 Deliverables Summary`
- `### Sprint 149 Preview — Last Mile`

**Extra in TR (98 sections — TR-only content):**
- `## Mevcut Durum`
- `## Genel Bakış`
- `## Faz Planı`
- `### Faz 1: "Kendin Kullan" — TAMAMLANDI ✅`
- `### Faz 1.5: "Init UX + Onboarding" — TAMAMLANDI ✅ (Sprint 070-071)`
- `### Faz 2: "Genel Kullanılabilirlik" — AKTİF`
- `### Faz 3: "Dokümantasyon" — ✅ TAMAMLANDI`
- `### Faz 4: "Public Repo" — AKTİF (Beta GA: 23 Nisan 2026)`
- `## 🚀 Beta GA Yol Haritası — Sprint 150 (23 Nisan 2026)`
- `### 5-Sprint Roadmap`
- `### Sprint 150 GA Exit Criteria (12 Madde)`
- `## Öncelik Matrisi (P0-P6)`
- `### P0 — npm Paketleme + Dogfooding — TAMAMLANDI ✅`
- `### P1 — Provider & Tier Generalizasyonu`
- `### P2 — Dokümantasyon`
- `### P4 — Platform & Altyapı`
- `### P5 — Kod Kalitesi`
- `### P6 — Kullanıcı Deneyimi İyileştirmeleri`
- `## Rakip Analizi`
- `### A. OpenClaw (Acik Kaynak Kisisel AI Asistan)`
- `### B. Microsoft Copilot Cowork (Kurumsal AI Orkestrator)`
- `### C. Perplexity Computer (Multi-Model AI Agent Sistemi)`
- `### D. Devin 2.0/3.0 (Otonom Yazilim Muhendisi)`
- `### E. Claude Agent SDK + Computer Use (Anthropic Ekosistemi)`
- `### F. Claude Managed Agents — CMA (Anthropic Bulut Ajan Platformu)`
- `### G. Karsilastirma Matrisi`
- `### H. Deckent'in Benzersiz Konumu`
- `## Doğrulanmış Engeller`
- `### ENGEL-1: OGRENME DONGUSU KIRIK — ✅ COZULDU (Sprint 091)`
- `### ENGEL-2: INTENT CLASSIFIER STATIK (DOGRULANDI)`
- `### ENGEL-3: SESSIZ HATA YUTMA — ✅ COZULDU (Sprint 085+086+087+088)`
- `### ENGEL-4: COVERAGE THRESHOLD — ✅ COZULDU (Sprint 086)`
- `### Duzeltilen Yanlis Iddialar`
- `## Self-Improvement Yol Haritası`
- `### FAZ 0: Gozlemlenebilirlik Temeli — ✅ TAMAMLANDI (Sprint 085)`
- `### FAZ 1: Ogrenme Dongusunu Kapat — ✅ TAMAMLANDI (Sprint 086)`
- `### FAZ 2: Otonom Adaptasyon — ✅ TAMAMLANDI (Sprint 088+091)`
- `### FAZ 3: Proaktif Sistem — ✅ KISMI TAMAMLANDI (Sprint 088)`
- `### FAZ 3.5: Memory V2 + Governance — ✅ TAMAMLANDI (Sprint 138-145)`
- `### FAZ 4: Human-in-the-Loop — ✅ KISMI TAMAMLANDI (Sprint 088)`
- `### FAZ 5: Ekosistem Genisleme (4+ sprint)`
- `### Öncelik Matrisi`
- `## Sprint Metrikleri`
- `### Tamamlanan Hedefler (Sprint 085 + 086)`
- `### Sprint 085 Metrikleri`
- `### Sprint 086 Metrikleri`
- `### Sprint 097 Metrikleri`
- `### Sprint 131-139 Özet Metrikleri`
- `### Sprint 140-145 Özet Metrikleri`
- `### Sprint 098 Metrikleri`
- `### Sprint 099 Metrikleri`
- `### Sprint 100 Metrikleri`
- `### Sprint 101 Metrikleri`
- `### Sprint 102 Metrikleri`
- `### Kalan Tech Debt`
- `### Sprint 140-145 Detaylı Metrikler`
- `## Bug Tracker`
- `### Sprint 070 — Init UX Overhaul (15 fix)`
- `### Sprint 071 — Dogfooding Bug Fixes (7 fix + upgrade)`
- `### Sprint 070 — Yeni Özellikler`
- `### Bilinen Açık Bug'lar`
- `## Docker & Altyapı`
- `### A. Bulunan ve Duzeltilen 3 Kritik Sorun`
- `### B. E2E Test Sonuclari`
- `### C. Sprint 103 Sonuclari (7 Task)`
- `### D. Eklenen Yeni Ozellikler`
- `### E. Container Exit Code Analizi (Sprint 103 Test Container'lari)`
- `### F. Tespit Edilen ve Cozulen Sorunlar`
- `### G. `deckent run` Test Sonuclari`
- `### H. Guncel Is Plani (Sprint 104+)`
- `### Oturum Kapanisi (7 Nisan 2026 — 10 commit)`
- `### Oturum Ozeti (8-9 Nisan 2026 — Docker Canli Dogrulama)`
- `### I. Token Kullanim Analizi + Context-Aware Routing Is Plani`
- `## Başarı Metrikleri & Risk`
- `### Self-Improvement Olcumleri`
- `### Otonomi Olcumleri`
- `### Rakip Yakinlastirma`
- `### Risk Analizi`
- `## Stratejik Konumlandırma`
- `### ✅ Kısa Vade — TAMAMLANDI (Sprint 085-086): "Öğrenen Orkestratör"`
- `### ✅ Orta Vade — TAMAMLANDI (Sprint 087-097): "Proaktif Gelistirici Asistani"`
- `### ✅ Yakın Vade — TAMAMLANDI (Sprint 130-145): "Kurumsal Hazırlık + Memory V2"`
- `### Beta GA (Sprint 146-150): "Ürün Lansmanı"`
- `### Uzun Vade (Sprint 150+): "Otonom Yazılım Takımı"`
- `## Sonuç`
- `## Kaynaklar (Dogrulanmis — Nisan 2026)`
- `### Claude Ekosistemi`
- `## Sprint Metrikleri (Güncel)`
- `## Sprint 146 — Detaylı Özet`
- `## Sprint Metrikleri (Sprint 146 Güncel)`
- `## Sprint Metrics (Sprint 146 Current)`
- `## Sprint 148 — Detaylı Özet`
- `### Temel İçgörüler — Sprint 148`
- `### Sprint 148 Deliverable Özeti`
- `### 5 Günlük Beta GA Yol Haritası (Güncel)`
- `### Sprint 149 Preview — Son Mil`
- `## Sprint Metrikleri (Sprint 148 Güncel)`
- `## Sprint Metrics (Sprint 148 Current)`

**Matched Sections (10):**
- `## P3 — UX & Dashboard` ✓
- `## Sprint Metrics` ✓
- `### OpenClaw` ✓
- `### Microsoft Copilot Cowork` ✓
- `### Perplexity Computer` ✓
- `### Devin` ✓
- `### Claude Managed Agents (CMA)` ✓
- `## Sprint History` ✓
- `### Sprint 146 Deliverables` ✓
- `### Sprint 147 Preview — Nervous System` ✓

### MASTER-BLUEPRINT / ANA-PLAN

**Files:**
- EN: `DECKENT-MASTER-BLUEPRINT.md` (2760 lines)
- TR: `DECKENT-ANA-PLAN-TR.md` (1731 lines)

**Section Coverage:** 1% (1/145 sections matched)
**Line Ratio:** 63% (TR has 1731 vs EN 2760 lines)

**Missing in TR (144 sections):**
- `## AI Agent Orchestration System — Complete Implementation Reference`
- `### Version 3.0 — April 2026 — Verhex`
- `## Live Metrics`
- `## 3.1 Installation`
- `## 3.2 CLI Commands`
- `## 3.3 Init Wizard Flow`
- `## 3.4 System Requirements`
- `## 4.1 Project-Level (in your repo)`
- `## 4.2 Global Config (~/.deckent/)`
- `## 4.3 DECKENT.md + Adapter Pattern`
- `## Identity`
- `## Rules`
- `## Context`
- `## Agent Roles`
- `## Environment`
- `## Boot`
- `## 5.1 Brain + Planner`
- `## 5.2 Auditor (In-Process Scan Loop)`
- `## 5.3 Worker`
- `## Overview`
- `## DB Schema (5 tables + FTS5)`
- `## Query API`
- `## File Layout`
- `## CLI & MCP Access`
- `## turkishNormalize — i18n Text Normalization`
- `## Decay Mechanism`
- `## Legacy 3-Tier (Pre-V2, Sprint 1-139)`
- `## Memory Files Reference`
- `## Usage Check Flow`
- `## BrainPlanningMode`
- `## Model Budget Per Sprint`
- `## How Workers Are Spawned`
- `## tmux Session Layout`
- `## Dynamic Scaling`
- `## Agent Teams Integration (Future)`
- `## Skill Structure`
- `## SKILL.md Format`
- `## Template`
- `## Built-in Skills (Ship with Deckent)`
- `## Custom Skills`
- `## Phase 1: Terminal Dashboard — DONE (Sprint 10)`
- `## Phase 2: Web Dashboard — DONE (Sprint 11)`
- `## Phase 3: VSCode Extension (Planned)`
- `## System Messages`
- `## RBAC Protocol V1.0 (ADR-037 — Sprint 139)`
- `## Permission Model`
- `## Cross-Role Interaction Rules (ADR-037 §5)`
- `## Claude Code --allowedTools Per Agent`
- `## Dangerous Mode Control`
- `## Test Layers`
- `## Sprint Report (auto-generated)`
- `## Summary`
- `## Metrics`
- `## Learnings`
- `## Next Sprint`
- `## Dual Repo`
- `## .gitignore for Private Repo`
- `## .gitignore for Public Repo`
- `## Sync Strategy`
- `## Sprint 1: Core Engine (March 2026)`
- `## Sprint 2-5: Lifecycle Hardening`
- `## Sprint 6: First Dogfooding`
- `## Sprint 7: MCP Server Integration`
- `## Sprint 8: Documentation & MCP Dogfooding`
- `## Sprint 9: Analyzer & CI Pipeline`
- `## Sprint 10: HTTP API & Terminal Dashboard`
- `## Sprint 11: Web Dashboard`
- `## Sprint 12-13: Brain AI Planning & Auditor In-Process`
- `## Sprint 14: Auditor Live Integration (in progress)`
- `## Sprint 15: Deckent Bağımsızlık + Self-Hosting`
- `## Sprint 16: Watch Mode, Worker Logs, Agent Detail`
- `## Sprint 17: Reliability + Test Infra + Docs`
- `## Sprint 18: Orchestration Smoke Test — 10 Parallel Doc Tasks`
- `## Sprint 19: Motor Repair — 6 Bug Fixes`
- `## Sprint 20: Fix Validation`
- `## Sprint 21: Parametric Orchestration`
- `## Sprint 22: Decay Fix + Auto Setup + MCP Enrichment`
- `## Sprint 23: AI Planner Post-Validation Fallback + 12-Task Validation`
- `## Sprint 24 (Mega Sprint): Plugin v2 + i18n + OSS Infrastructure`
- `## Sprint 25-26: Tech Debt Cleanup + OSS Polish`
- `## Sprint 27-29: Global Launch Preparation`
- `## How Claude Code Sees Deckent`
- `## Rules Files (.claude/rules/)`
- `## Starting a Sprint with Claude Code`
- `## Overview`
- `## Installation`
- `## Tools (22)`
- `### Lifecycle Tools`
- `### Information Tools`
- `### Configuration & Sync Tools`
- `### Agent, Skill & Memory Tools`
- `## Resources (8)`
- `## Auth Chain`
- `## Key Design Decision: deckent_set_directives`
- `## Flow 1: First Setup (MCP User)`
- `## Flow 2: First Sprint`
- `## Flow 3: Ongoing Usage`
- `## Flow 4: Zero-Config Mode (Planned — Sprint 27)`
- `## Flow 5: Provider-Agnostic Usage (Planned — Sprint 29+)`
- `## Phase 1: Claude Native Stable (Sprint 1-16) — COMPLETE`
- `## Phase 2: Self-Orchestration & Learning (Sprint 17-26) — COMPLETE`
- `## Phase 3: Global Launch Preparation (Sprint 27-29) — COMPLETE`
- `### Sprint 27: Technical Gap Closure (30 tasks)`
- `### Sprint 28: npm Publish Preparation (30 tasks)`
- `### Sprint 29: Real-World Testing + Beta Publish (30 tasks)`
- `## Phase 4: Agent/Skill Intelligence (Sprint 29-33) — COMPLETE (Sprint 133 Readiness 3.6/5)`
- `### Sprint 29: Agent Pool Core + Brain Integration (30 tasks)`
- `### Sprint 30: Skill System + Stack Detection (30 tasks)`
- `### Sprint 31: Brain Decision Engine + Learning Loop (30 tasks)`
- `### Sprint 32: UX — Progress, Summary, Notifications (30 tasks)`
- `### Sprint 33: Integration Testing + Marketplace + Analytics (30 tasks)`
- `### Sprint 34: Real-World Testing + Beta Publish (30 tasks)`
- `## Phase 5: Multi-Provider & Ecosystem (Sprint 35-38) — COMPLETE`
- `## Phase 6: Governance & Hardening (Sprint 133-145) — IN PROGRESS`
- `## Phase 7: Platform & Enterprise (Sprint 150+) — VISION`
- `## Sprint 137: Test Restoration + Wire Deployment`
- `## Sprint 138: ADR Governance + Verification Protocol + Event Stream`
- `## Sprint 139: Docker HB Fix + Chain Scheduler + RBAC + Self-Modifying Detection`
- `## Sprint 141: Comprehensive Codebase Analysis (316+ Files)`
- `## Sprint 142: God Analysis — Largest Sprint by Task Count (49 Tasks)`
- `## Sprint 143: Chain Reform Complete + Security Hardening`
- `## Sprint 144: God Split + Performance + i18n`
- `## Sprint 145: Adaptive Timeout + Unified Observability + CLI/MCP Audit (In Progress)`
- `## Overview`
- `## Gate Criteria`
- `### Functional Completeness`
- `### Quality`
- `### Governance`
- `### Documentation`
- `### Distribution`
- `### Performance`
- `## Cross-References`
- `## Sprint 146 — Prompt God Template Reform + Critical Bug Fix + Rubric Consolidation`
- `### Key Deliverables`
- `### Architectural Outputs`
- `### Sprint Gate Results (Sprint 146 Exit)`
- `## Sprint 148 — Detailed Summary`
- `### Sprint 148 Theme: Self-Healing Architecture`
- `### Sprint 148 Deliverables (4 Blocks × 6 Waves)`
- `### Architectural Outputs`
- `### Detector Live Evidence (Sprint 148)`
- `### Sprint Gate Results (Sprint 148 Exit)`
- `### Sprint 148 → Sprint 149 Bridge`
- `### Sprint 149 Preview — Documentation Consolidation + npm Publish`

**Extra in TR (100 sections — TR-only content):**
- `## Yapay Zeka Ajan Orkestrasyon Sistemi — Tam Uygulama Referansı`
- `### Versiyon 3.0 — Nisan 2026 — Beta GA`
- `## 3.1 Kurulum`
- `## 3.2 CLI Komutları`
- `## 3.3 Sistem Gereksinimleri`
- `## 4.1 Proje Düzeyinde`
- `## 5.1 Üç Bileşen Modeli`
- `### Brain (Orkestratör)`
- `### Auditor (Doğrulayıcı)`
- `### Worker (Uygulayıcı)`
- `## 5.2 Sprint 130-145 Gelişmeleri`
- `## Sprint 1-23: Çekirdek Motor ve Kararlılık (Mart 2026)`
- `## Sprint 24-38: Eklenti, Ajan ve Çoklu Sağlayıcı (Mart 2026)`
- `## Sprint 39-65: Platform Genişleme ve Stabilizasyon (Mart-Nisan 2026)`
- `## Sprint 66-77: MCP Olgunlaşma ve God Object Bölme (Nisan 2026)`
- `## Sprint 78-100: Dashboard UX ve ModelRegistry (Nisan 2026)`
- `## Sprint 101-122: Docker Altyapısı ve Stabilizasyon (Nisan 2026)`
- `## Sprint 123-134: Değerlendirme Sistemi ve Mimari (Nisan 2026)`
- `## Sprint 135-139: Orkestrasyon Olgunlaşması (Nisan 2026)`
- `## Sprint 140-145: Kod Kalitesi, Memory V2 ve Büyük Refaktör (Nisan 2026)`
- `### Sprint 140 — Memory V2 DB-First Başlangıcı`
- `### Sprint 141 — Kapsamlı Codebase Analizi`
- `### Sprint 142 — Devasa Kod İnceleme`
- `### Sprint 143 — Chain Reform ve Güvenlik`
- `### Sprint 144 — Büyük Refaktör ve Test Genişlemesi`
- `### Sprint 145 — Olgunlaşma (Devam Ediyor)`
- `## Genel Bakış`
- `## Kurulum`
- `## Araçlar (22)`
- `### Yaşam Döngüsü Araçları`
- `### Bilgi Araçları`
- `### Yapılandırma, Senkronizasyon ve İzleme Araçları`
- `## Kaynaklar (8)`
- `## Kritik Tasarım Kararı: deckent_set_directives`
- `## Akış 1: İlk Kurulum`
- `## Akış 2: İlk Sprint`
- `## Akış 3: Sürekli Kullanım`
- `## Aşama 1: Claude Native Kararlı (Sprint 1-8) — TAMAMLANDI`
- `## Aşama 2: Sağlayıcı Soyutlama (Sprint 9-12) — TAMAMLANDI`
- `## Aşama 3: Çoklu Sağlayıcı (Sprint 13-38) — TAMAMLANDI`
- `## Aşama 4: Platform Genişleme (Sprint 39-100) — TAMAMLANDI`
- `## Aşama 5: Olgunlaşma ve Kurumsal Hazırlık (Sprint 101-150+) — DEVAM EDİYOR`
- `### Tarihsel Dönüm Noktaları (Sprint 1 → Sprint 145)`
- `### Sprint 130-145 Mimari Evrim Özeti`
- `## Genel Bakış`
- `## Mimari`
- `## FTS5 Dual-Layer Arama`
- `### Sorgu API'si`
- `### Akıllı Sorgu Kaçışı`
- `### Decay (Zayıflama)`
- `## turkishNormalize()`
- `## Entry Tipleri`
- `## CLI ve MCP Entegrasyonu`
- `## Genel Bakış`
- `### ADR Yaşam Döngüsü`
- `### ADR-036: Mandatory Enforcement`
- `## ADR Listesi (39 Aktif)`
- `## ADR-035: Verification Protocol V1.0`
- `## ADR-037: RBAC Protocol V1.0`
- `### Brain Yetkileri`
- `### Auditor Yetkileri`
- `### Worker Yetkileri`
- `### Çapraz Rol Kuralları`
- `### Enforcement Mekanizması`
- `## Genel Bakış`
- `## Motivasyon`
- `## Bileşenler`
- `### Timeout Estimator (`timeout-estimator.ts`)`
- `### Timeout Watcher (`timeout-watcher.ts`)`
- `## Genel Bakış`
- `## Event Stream (`event-stream.ts`)`
- `### DeckentEvent Yapısı`
- `## Event Bus (`event-bus.ts`)`
- `## Monitor Adapter (`monitor-adapter.ts`)`
- `## Genel Bakış`
- `## Bileşenler`
- `### Cost Calculator (`cost-calculator.ts`)`
- `### Token Counter (`token-counter.ts`)`
- `### Pricing Updater (`pricing-updater.ts`)`
- `### Prompt Token Optimizer (`prompt-token-optimizer.ts`)`
- `## CLI Kullanımı`
- `## Sprint 145 Özeti`
- `### 1. Adaptive Timeout Sistemi`
- `### 2. Unified Native Observability`
- `### 3. CLI/MCP Kapsamlı Audit`
- `## Deckent v3.0 Toplam Kazanımlar (Sprint 23 → Sprint 145)`
- `## Sprint 146 Özeti`
- `### Sprint 146 Ana Hedefleri`
- `### Sprint 146 Deliverables (17 Task)`
- `### Sprint 146 Bug Fix Özeti`
- `### Sprint 146 Teknik Mimari Çıktıları`
- `### Sprint 146 → Sprint 147 Köprüsü`
- `## Sprint 148 — Detaylı Özet`
- `### Sprint 148 Tema: Self-Healing Architecture`
- `### Sprint 148 Deliverable'lar (4 Blok × 6 Dalga)`
- `### Sprint 148 Mimari Çıktıları`
- `### Sprint 148 Detector Canlı Kanıtları`
- `### Sprint 148 Sprint Gate Sonuçları`
- `### Sprint 148 → Sprint 149 Köprüsü`
- `### Sprint 149 Preview — Dokümantasyon Konsolidasyonu + npm Publish`

**Matched Sections (1):**
- `### Sprint 147 Preview — Nervous System` ✓

---

## Action Items

4 document(s) have missing TR sections:

- **README**: 40 section(s) missing in `README-TR.md`
- **VISION**: 15 section(s) missing in `VISION-TR.md`
- **BETA-TRACKER**: 77 section(s) missing in `BETA-TRACKER-TR.md`
- **MASTER-BLUEPRINT / ANA-PLAN**: 144 section(s) missing in `DECKENT-ANA-PLAN-TR.md`
