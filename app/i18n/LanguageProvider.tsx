"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  normalizeLanguage,
  translations,
  type Language,
} from "./translations";

const STORAGE_KEY = "baby-registry-language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (typeof translations)[Language];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const listeners = new Set<() => void>();

function getStoredLanguage(): Language {
  return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
}

function getDefaultLanguage(): Language {
  return "es";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function updateLanguage(language: Language) {
  window.localStorage.setItem(STORAGE_KEY, language);
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}

export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribe, getStoredLanguage, getDefaultLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translations[language].home.title;
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage: updateLanguage, t: translations[language] }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
