// src/hooks/useI18n.ts
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { translations, languageNativeNames, type Language } from '../libs/translations';
import { getJson, setJson } from '../libs/storage';

export type { Language } from '../libs/translations';

import { getAppConfig } from '../libs/runtimeConfig';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, options?: Record<string, string | number>) => string;
    languages: typeof languageNativeNames;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getInitialLanguage(): Language {
    if (typeof window === 'undefined') return 'en';

    // 1. User manual preference
    const stored = getJson<Language>('language');
    if (stored && translations[stored]) return stored;

    // 2. Global runtime config default
    const config = getAppConfig();
    const configLang = config.DEFAULT_LANG as Language;
    if (configLang && translations[configLang]) return configLang;

    // 3. Try browser language
    const browserLang = navigator.language.slice(0, 2) as Language;
    if (translations[browserLang]) return browserLang;

    return 'en';
}

interface I18nProviderProps {
    children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
    const [language, setLanguageState] = useState<Language>(getInitialLanguage);

    const setLanguage = useCallback((lang: Language) => {
        if (translations[lang]) {
            setLanguageState(lang);
            setJson('language', lang);
            document.documentElement.lang = lang;
        }
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const t = useCallback((key: string, options?: Record<string, string | number>): string => {
        const pack = (translations[language] || translations.en) as Record<string, string>;
        const fallback = translations.en as Record<string, string>;
        let text = pack[key] || fallback[key] || key;

        if (options && typeof text === 'string') {
            Object.entries(options).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }
        return text;
    }, [language]);

    return (
        <I18nContext.Provider value={{ language, setLanguage, t, languages: languageNativeNames }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within I18nProvider');
    }
    return context;
}
