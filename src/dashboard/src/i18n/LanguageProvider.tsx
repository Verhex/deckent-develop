import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { en } from './en';
import { tr } from './tr';
import type { TranslationKey } from './en';

type Language = 'en' | 'tr';

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const translations = { en, tr } as const;

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    // Load language from config API
    fetch('/api/config')
      .then((res) => res.ok ? res.json() : null)
      .then((config) => {
        if (config?.language === 'tr') setLangState('tr');
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    // Persist to config
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: newLang }),
    }).catch(() => {});
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => translations[lang][key] ?? translations.en[key] ?? key,
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
