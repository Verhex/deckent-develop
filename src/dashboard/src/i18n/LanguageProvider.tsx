import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { en } from './en';
import { tr } from './tr';
import type { TranslationKey } from './en';

type Language = 'en' | 'tr';

/** SURF-7: the dashboard's UI language is a CLIENT preference (localStorage),
 *  not a project-config write — flipping the viewer's language must never
 *  mutate `.deckent/config.json` (that was a wrong-layer write the authority
 *  cutover removed). The project config remains the first-boot DEFAULT. */
const LANG_STORAGE_KEY = 'deckent.dashboard.lang';

function readStoredLang(): Language | null {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return stored === 'tr' || stored === 'en' ? stored : null;
  } catch {
    return null; // storage unavailable (privacy mode) — fall back to config
  }
}

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const translations = { en, tr } as const;

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => String(key),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => readStoredLang() ?? 'en');

  useEffect(() => {
    // No stored client preference → the project config's language is the
    // first-boot default (read-only; the canonical token-aware client).
    if (readStoredLang() !== null) return;
    fetchJson<{ language?: string }>('/api/config')
      .then((config) => {
        if (config?.language === 'tr') setLangState('tr');
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, newLang);
    } catch {
      // storage unavailable — the choice lives for this session only
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let value = translations[lang][key] ?? translations.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
        }
      }
      return value;
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
