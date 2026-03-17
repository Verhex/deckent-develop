# DIRECTIVES — Sprint 8 (Documentation)

## Hedef: Proje Dokümantasyonu
Deckent'e katkıda bulunma rehberi ve API referans dokümanı oluştur.

## Görev 1: CONTRIBUTING.md Oluştur
- Proje kök dizininde CONTRIBUTING.md oluştur
- İçerik: Geliştirme ortamı kurulumu (Node 18+, npm install, npm run build, npm test)
- Kod stili kuralları: TypeScript strict, ESM, Node16 module resolution
- Branch stratejisi ve commit mesajı formatı
- Test yazma rehberi: vitest, mock pattern'leri, coverage hedefi (%95+)
- PR süreci: testlerin geçmesi, tsc --noEmit clean, review
- Proje yapısı: src/core, src/orchestra, src/agents, src/monitor, src/cli, src/mcp açıklamaları
- Sprint katkısı: DIRECTIVES.md formatı, wave planı
- Markdown formatında, İngilizce
- Dosya: src/, tests/, package.json, tsconfig.json, vitest.config.ts referans al

## Görev 2: docs/API.md Oluştur
- docs/ dizini yoksa oluştur, docs/API.md yaz
- İçerik: Deckent'in programatik API referansı
- Core exports: types (Task, Sprint, DashboardState, DoctorResult, DebtItem, ResolvedConfig, PlanMode), constants, config (loadConfig, validatePartialConfig)
- Orchestra exports: brain fonksiyonları (readContext, checkUsage, adjustSprintSize, planSprint, runSprint, evaluateResult, runDecay, cleanup), tmux fonksiyonları
- Agent exports: worker fonksiyonları (readTask, claimTask, acquireLock, releaseLock, writeResult, updateTaskStatus, isWithinScope)
- Monitor exports: auditor fonksiyonları (scanHeartbeats, checkBoundaryViolations, updateDashboard, detectPatterns)
- MCP: server (createServer), 8 tool, 4 resource listesi
- CLI: 17 komut listesi ve açıklamaları
- Her fonksiyon için imza, parametre açıklaması ve kısa kullanım örneği
- Markdown formatında, İngilizce
- Dosya: src/index.ts, src/core/index.ts, src/orchestra/index.ts, src/agents/index.ts, src/monitor/index.ts, src/mcp/server.ts referans al

## Kalite Kuralları
- Mevcut testler regresyona uğramamalı (669 test)
- Yeni dosya oluştur, mevcut kodu DEĞİŞTİRME
- tsc --noEmit clean kalmalı
