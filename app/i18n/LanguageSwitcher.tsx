"use client";

import { useLanguage } from "./LanguageProvider";
import type { Language } from "./translations";

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  const option = (value: Language, label: string) => (
    <button
      type="button"
      aria-pressed={language === value}
      aria-label={label}
      onClick={() => setLanguage(value)}
      className={`px-1 py-0.5 transition-colors ${
        language === value ? "font-semibold text-[#352e2b]" : "text-[#9a8d86] hover:text-[#5d514c]"
      }`}
    >
      {value.toUpperCase()}
    </button>
  );

  return (
    <header className="fixed right-5 top-5 z-40 sm:right-8 sm:top-7">
      <div role="group" aria-label={t.language.label} className="flex items-center rounded-full border border-[#ddcec6] bg-[#f8f4ef]/90 px-2.5 py-1.5 text-xs tracking-[0.12em] shadow-sm backdrop-blur">
        {option("es", t.language.spanish)}
        <span aria-hidden="true" className="mx-1 text-[#c8b9b2]">|</span>
        {option("en", t.language.english)}
      </div>
    </header>
  );
}
