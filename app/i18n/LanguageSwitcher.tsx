"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFavorites } from "../lib/favorites";
import { useLanguage } from "./LanguageProvider";
import type { Language } from "./translations";

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  const { favoriteIds } = useFavorites();
  const pathname = usePathname();
  const [compactSelectorExpanded, setCompactSelectorExpanded] = useState(false);
  const compactSelectorRef = useRef<HTMLDivElement>(null);
  const compactTriggerRef = useRef<HTMLButtonElement>(null);
  const compactActiveOptionRef = useRef<HTMLButtonElement>(null);
  const compactLanguageSelector =
    pathname === "/gifts" || pathname === "/favorites";

  useEffect(() => {
    if (!compactSelectorExpanded) return;

    compactActiveOptionRef.current?.focus();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!compactSelectorRef.current?.contains(event.target as Node)) {
        setCompactSelectorExpanded(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCompactSelectorExpanded(false);
      window.requestAnimationFrame(() => compactTriggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [compactSelectorExpanded]);

  const option = (
    value: Language,
    label: string,
    compact = false
  ) => (
    <button
      ref={compact && language === value ? compactActiveOptionRef : undefined}
      type="button"
      aria-pressed={language === value}
      aria-label={label}
      onClick={() => {
        setLanguage(value);
        if (compact) setCompactSelectorExpanded(false);
      }}
      className={`${
        compact
          ? "flex h-11 min-w-11 items-center justify-center px-2 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#9a756d]"
          : "px-1 py-0.5"
      } transition-colors ${
        language === value ? "font-medium text-[#352e2b]" : "font-normal text-[#9a8d86] hover:text-[#5d514c]"
      }`}
    >
      {value.toUpperCase()}
    </button>
  );

  return (
    <>
      <header
        className={`relative z-30 flex h-14 shrink-0 items-start px-5 pt-5 sm:h-16 sm:px-8 sm:pt-7 ${
          pathname === "/" ? "bg-[#f8f4ef]" : "bg-[#faf7f5]"
        }`}
      >
        {compactLanguageSelector ? (
          <div
            ref={compactSelectorRef}
            className={`-m-1 flex h-11 items-center overflow-hidden text-[10px] tracking-[0.08em] transition-[width] duration-200 motion-reduce:transition-none ${
              compactSelectorExpanded
                ? "w-[9.25rem] rounded-full border border-[#ddcec6] bg-[#f8f4ef]/90 shadow-sm backdrop-blur"
                : "w-11"
            }`}
          >
            {compactSelectorExpanded ? (
              <div
                id="compact-language-options"
                role="group"
                aria-label={t.language.label}
                className="flex h-11 min-w-max items-center"
              >
                {option("es", t.language.spanish, true)}
                <span aria-hidden="true" className="text-[#c8b9b2]">|</span>
                {option("ca", t.language.catalan, true)}
                <span aria-hidden="true" className="text-[#c8b9b2]">|</span>
                {option("en", t.language.english, true)}
              </div>
            ) : (
              <button
                ref={compactTriggerRef}
                type="button"
                aria-expanded="false"
                aria-controls="compact-language-options"
                aria-label={`${t.language.label}: ${language.toUpperCase()}`}
                onClick={() => setCompactSelectorExpanded(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center font-medium text-[#352e2b] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#9a756d]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ddcec6] bg-[#f8f4ef]/90 shadow-sm backdrop-blur transition-colors hover:bg-[#f1e9e4]">
                  {language.toUpperCase()}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div role="group" aria-label={t.language.label} className="flex items-center rounded-full border border-[#ddcec6] bg-[#f8f4ef]/90 px-2.5 py-1.5 text-xs tracking-[0.12em] shadow-sm backdrop-blur">
            {option("es", t.language.spanish)}
            <span aria-hidden="true" className="mx-1 text-[#c8b9b2]">|</span>
            {option("ca", t.language.catalan)}
            <span aria-hidden="true" className="mx-1 text-[#c8b9b2]">|</span>
            {option("en", t.language.english)}
          </div>
        )}
      </header>

      <Link
        href="/favorites"
        aria-label={t.favorites.navigation}
        aria-current={pathname === "/favorites" ? "page" : undefined}
        className={`fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center sm:right-7 sm:top-6 ${
          pathname === "/favorites" ? "text-[#9d615d]" : "text-[#5d514c]"
        }`}
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#ddcec6] bg-[#f8f4ef]/90 shadow-sm backdrop-blur transition-colors hover:bg-[#f1e9e4]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill={favoriteIds.size > 0 ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
          </svg>
          {favoriteIds.size > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9d615d] px-1 text-[9px] leading-none text-white">
              {favoriteIds.size}
            </span>
          )}
          </span>
      </Link>
    </>
  );
}
