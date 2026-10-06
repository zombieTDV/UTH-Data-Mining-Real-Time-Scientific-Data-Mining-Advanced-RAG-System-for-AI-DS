import { useSyncExternalStore } from 'react';
import en from '../../assets/languages/en.json';
import vi from '../../assets/languages/vi.json';

export type Language = 'en' | 'vi';

const STORAGE_KEY = 'uth-language';

const translations: Record<Language, typeof en> = { en, vi };

type NestedKeyOf<T> = T extends object
  ? { [K in keyof T]: K extends string
      ? T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K
      : never
    }[keyof T]
  : never;

export type TranslationKey = NestedKeyOf<typeof en>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let result: unknown = obj;
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof result === 'string' ? result : path;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'vi';
  const saved = localStorage.getItem(STORAGE_KEY) as Language;
  if (saved === 'en' || saved === 'vi') return saved;
  return 'vi';
};

let currentLanguage: Language = getInitialLanguage();

if (typeof window !== 'undefined') {
  document.documentElement.lang = currentLanguage;
}

const listeners = new Set<() => void>();

function emitLanguageChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function setLanguageGlobally(lang: Language) {
  if (currentLanguage === lang) return;
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }
  emitLanguageChange();
}

export function toggleLanguageGlobally() {
  const next: Language = currentLanguage === 'en' ? 'vi' : 'en';
  setLanguageGlobally(next);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Language {
  return currentLanguage;
}

export interface UseTranslationReturn {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useTranslation(): UseTranslationReturn {
  const language: Language = useSyncExternalStore(subscribe, getSnapshot, () => 'vi' as Language);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const translation = getNestedValue(
      translations[language] as unknown as Record<string, unknown>,
      key
    );
    return interpolate(translation, params);
  };

  return {
    language,
    setLanguage: setLanguageGlobally,
    toggleLanguage: toggleLanguageGlobally,
    t,
  };
}
