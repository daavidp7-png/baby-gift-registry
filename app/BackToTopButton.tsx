"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";

const SHOW_AFTER_SCROLL_PX = 600;

export default function BackToTopButton() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let animationFrame = 0;

    const updateVisibility = () => {
      if (animationFrame) return;

      animationFrame = window.requestAnimationFrame(() => {
        setVisible(window.scrollY > SHOW_AFTER_SCROLL_PX);
        animationFrame = 0;
      });
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      aria-label={t.gifts.backToTop}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={scrollToTop}
      className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-[#ddcec6] bg-[#f8f4ef]/95 text-lg text-[#5d514c] shadow-md backdrop-blur transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#756b67] motion-reduce:transition-none sm:bottom-8 sm:right-8 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
