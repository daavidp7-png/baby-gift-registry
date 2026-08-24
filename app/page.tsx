"use client";

import Link from "next/link";
import { useLanguage } from "./i18n/LanguageProvider";

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f4ef] px-6 py-12 text-[#352e2b]">
      <div className="flex max-w-2xl flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="mb-7 flex h-10 w-10 items-center justify-center rounded-full border border-[#ddcec6] text-lg text-[#a57f72]"
        >
          ♡
        </span>

        <h1 className="text-5xl leading-tight tracking-[-0.03em] sm:text-6xl md:text-7xl">
          {t.home.title}
        </h1>

        <p className="mt-6 max-w-md text-base leading-7 text-[#796d67] sm:text-lg">
          {t.home.description}
        </p>

        <Link
          href="/gifts"
          className="mt-10 rounded-full bg-[#352e2b] px-9 py-3.5 text-sm font-medium tracking-wide text-[#fffaf6] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#514641] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8f6d62]"
        >
          {t.home.enter}
        </Link>
      </div>
    </main>
  );
}
