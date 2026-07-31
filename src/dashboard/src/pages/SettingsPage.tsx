import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useTranslation } from "../i18n/LanguageProvider";

export default function SettingsPage() {
  const { t, lang, setLang } = useTranslation();

  return (
    <div data-testid="settings-page" className="space-y-6">
      <div className="flex items-center gap-2">
        <Globe className="w-6 h-6 text-brand-fg" />
        <h1 className="text-2xl font-bold text-zinc-100">{t('nav.settings')}</h1>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">{t('settings.appearance')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">{t('settings.language_label')}</p>
            </div>
            <div className="flex rounded-md overflow-hidden border border-zinc-700">
              <button
                data-testid="settings-lang-en"
                onClick={() => setLang('en')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  lang === 'en'
                    ? 'bg-brand-fg text-brand-bg'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
                aria-pressed={lang === 'en'}
              >
                {t('settings.language_en')}
              </button>
              <button
                data-testid="settings-lang-tr"
                onClick={() => setLang('tr')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  lang === 'tr'
                    ? 'bg-brand-fg text-brand-bg'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
                aria-pressed={lang === 'tr'}
              >
                {t('settings.language_tr')}
              </button>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
