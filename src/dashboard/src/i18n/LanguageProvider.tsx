import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchJson, postJson } from '../lib/api';
import { en } from './en';
import { tr } from './tr';
import type { TranslationKey } from './en';

type Language = 'en' | 'tr';

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
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    // Load language from config API (canonical token-aware client — a raw
    // fetch here was the last un-migrated caller and 401'd on served builds)
    fetchJson<{ language?: string }>('/api/config')
      .then((config) => {
        if (config?.language === 'tr') setLangState('tr');
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    // Persist to config
    postJson('/api/config', { language: newLang }).catch(() => {});
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
