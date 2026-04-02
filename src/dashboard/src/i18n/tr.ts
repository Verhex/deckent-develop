import type { TranslationKey } from './en';

export const tr: Record<TranslationKey, string> = {
  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.settings': 'Ayarlar',
  'nav.history': 'Geçmiş',
  'nav.memory': 'Bellek',
  'nav.config': 'Yapılandırma',

  // Layout
  'layout.subtitle': 'ajan orkestrasyon',
  'layout.auditor': 'Denetçi',
  'layout.active': 'Aktif',
  'layout.inactive': 'Pasif',
  'layout.language': 'Dil',

  // Dashboard Page
  'dashboard.title': 'Sprint Paneli',
  'dashboard.no_sprint': 'Aktif sprint yok',
  'dashboard.no_sprint_hint': 'Sprint başlatmak için `deckent start` çalıştırın.',
  'dashboard.phase': 'Faz',
  'dashboard.elapsed': 'Geçen Süre',
  'dashboard.progress': 'İlerleme',
  'dashboard.tasks': 'Görevler',
  'dashboard.agents': 'Ajanlar',
  'dashboard.alerts': 'Uyarılar',
  'dashboard.no_alerts': 'Aktif uyarı yok.',
  'dashboard.usage': 'Kullanım',
  'dashboard.worker': 'Worker',
  'dashboard.task': 'Görev',
  'dashboard.model': 'Model',
  'dashboard.status': 'Durum',
  'dashboard.action': 'Eylem',
  'dashboard.kill': 'Durdur',
  'dashboard.done': 'tamamlandı',
  'dashboard.running': 'çalışıyor',
  'dashboard.queued': 'kuyrukta',
  'dashboard.failed': 'başarısız',
  'dashboard.new_sprint': 'Yeni Sprint',
  'dashboard.cleanup': 'Temizle',
  'dashboard.kill_all': 'Tümünü Durdur',
  'dashboard.confirm_cleanup': 'Sprint dosyalarını arşivle?',
  'dashboard.confirm_kill': "Tüm worker'ları durdur?",
  'dashboard.phase_timeline': 'Sprint Fazları',

  // Settings Page
  'settings.title': 'Ayarlar & Sağlık',
  'settings.doctor': 'Sistem Sağlığı',
  'settings.run_doctor': 'Kontrol Et',
  'settings.check': 'Kontrol',
  'settings.result': 'Sonuç',
  'settings.details': 'Detay',
  'settings.passed': 'Geçti',
  'settings.failed': 'Başarısız',
  'settings.warning': 'Uyarı',
  'settings.health_score': 'Sağlık Puanı',

  // History Page
  'history.title': 'Sprint Geçmişi',
  'history.no_history': 'Sprint geçmişi bulunamadı.',
  'history.sprint': 'Sprint',
  'history.date': 'Tarih',
  'history.total_tasks': 'Görevler',
  'history.completed': 'Tamam',
  'history.nogo_rate': 'NO_GO %',
  'history.coverage': 'Kapsam',
  'history.duration': 'Süre',
  'history.trend': 'Trend',

  // Memory Page
  'memory.title': 'Brain Belleği',
  'memory.tab_memory': 'Bellek',
  'memory.tab_debt': 'Teknik Borç',
  'memory.no_memory': 'Bellek içeriği bulunamadı.',
  'memory.no_debt': 'Teknik borç bulunamadı.',

  // Config Page
  'config.title': 'Yapılandırma',
  'config.save': 'Kaydet',
  'config.saving': 'Kaydediliyor...',
  'config.saved': 'Yapılandırma kaydedildi.',
  'config.error': 'Yapılandırma kaydedilemedi.',
  'config.reset': 'Varsayılanlara Sıfırla',
  'config.category.provider': 'Sağlayıcı',
  'config.category.sprint': 'Sprint',
  'config.category.memory': 'Bellek',
  'config.category.auditor': 'Denetçi',
  'config.category.output': 'Çıktı',
  'config.category.search': 'Arama',
  'config.category.notifications': 'Bildirimler',
  'config.category.telemetry': 'Telemetri',
  'config.category.environment': 'Ortam',
  'config.category.routing': 'Yönlendirme',
  'config.category.rollback': 'Geri Alma',
  'config.category.project': 'Proje',
  'config.category.advanced': 'Gelişmiş',

  // Activity Feed
  'activity.title': 'Canlı Aktivite',
  'activity.spawned': 'başlatıldı',
  'activity.writing': 'yazıyor',
  'activity.done': 'TAMAMLANDI',
  'activity.nogo': 'BAŞARISIZ',
  'activity.stale': 'Eski heartbeat',
  'activity.phase_changed': 'Faz değişti →',
  'activity.no_activity': 'Sprint başlatın, aktivite burada görünecek.',
  'activity.waiting': 'Aktivite bekleniyor...',

  // Worker Card
  'worker.model': 'Model',
  'worker.agent': 'Ajan',
  'worker.skill': 'Beceri',
  'worker.elapsed': 'Geçen Süre',
  'worker.heartbeat': 'Son Nabız',
  'worker.files_changed': 'Değişen dosyalar',
  'worker.detail': 'Detay',
  'worker.no_workers': 'Henüz worker yok — sprint başlatın',

  // Welcome Screen
  'welcome.no_sprint': 'Aktif sprint yok.',
  'welcome.start_hint': 'Başlamak için Yeni Sprint butonunu kullanın.',
  'welcome.last_sprint': 'Son sprint',

  // Dashboard additional
  'dashboard.sprint_status': 'Sprint Durumu',
  'dashboard.sprint_id': 'Sprint ID',
  'dashboard.updated': 'Güncellendi',
  'dashboard.usage_5hr': '5s Kullanım',
  'dashboard.usage_weekly': 'Haftalık Kullanım',
  'dashboard.usage_tokens': 'Sprint Token Tahmini',
  'dashboard.usage_cost': 'Toplam Maliyet Tahmini',
  'dashboard.usage_estimated': 'Tahmini',
  'dashboard.usage_note': 'Tahmini gösteriliyor — canlı kullanım API\'si mevcut değil',
  'dashboard.active': 'Aktif',
  'dashboard.pending': 'Bekliyor',
  'dashboard.violations': 'ihlal',
  'dashboard.confirm_kill_worker': "Worker'ı durdur",

  // History additional
  'history.all_sprints': 'Tüm Sprintler',
  'history.sprint_id': 'Sprint ID',
  'history.success_rate': 'Başarı %',
  'history.tech_debt': 'Teknik Borç',
  'history.nogo': 'No-Go',
  'history.success_rate_trend': 'Başarı Trendi',
  'history.trend_legend': 'Son 10 sprint',

  // Memory additional
  'memory.technical_debt': 'Teknik Borç',

  // Config additional
  'config.save_changes': 'Değişiklikleri Kaydet',
  'config.loading': 'Yapılandırma yükleniyor...',
  'config.reset_field': 'Sıfırla',
  'config.save_success': 'Yapılandırma başarıyla kaydedildi.',
  'config.doctor_ok': 'Tüm zorunlu kontroller geçti',
  'config.doctor_fail': 'Bazı zorunlu kontroller başarısız oldu',
  'config.required': 'zorunlu',

  // New Sprint Modal
  'modal.directives_hint': 'Sprint direktiflerini aşağıya girin. Her "## Task" bloğu bir görevi tanımlar.',
  'modal.plan_sprint': 'Sprint Planla',
  'modal.planning': 'Sprint planlanıyor...',
  'modal.review_tasks_parsed': 'görev ayrıştırıldı. Sprint',
  'modal.review_planned_with': 'planlandı,',
  'modal.review_tasks_suffix': 'görev:',
  'modal.confirm_start': 'Onayla ve Başlat',
  'modal.starting': 'Sprint başlatılıyor...',
  'modal.success': 'Sprint başarıyla başlatıldı!',
  'modal.try_again': 'Tekrar Dene',

  // Agent Detail
  'agent.worker': 'Worker',
  'agent.scope': 'Kapsam',
  'agent.log_output': 'Log Çıktısı',
  'agent.no_log': 'Henüz log çıktısı yok.',

  // Common
  'common.loading': 'Yükleniyor...',
  'common.error': 'Hata',
  'common.retry': 'Tekrar Dene',
  'common.close': 'Kapat',
  'common.cancel': 'İptal',
  'common.confirm': 'Onayla',
  'common.yes': 'Evet',
  'common.no': 'Hayır',
};
