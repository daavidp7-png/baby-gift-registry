"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";

export default function HomePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    router.prefetch("/gifts");
  }, [router]);

  const enterGiftRegistry = () => {
    if (loading) return;

    setLoading(true);

    try {
      router.push("/gifts");
    } catch {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-[#f8f4ef] px-6 py-12 text-[#352e2b] sm:min-h-[calc(100dvh-4rem)]">
      <div className="flex max-w-2xl flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="mb-7 flex h-10 w-10 items-center justify-center rounded-full border border-[#ddcec6] text-lg text-[#a57f72]"
        >
          ♡
        </span>

        <h1 className="text-5xl font-medium leading-tight tracking-[-0.03em] sm:text-6xl md:text-7xl">
          {t.home.title}
        </h1>

        <p className="mt-6 max-w-md text-base leading-7 text-[#796d67] sm:text-lg">
          {t.home.description}
        </p>

        <button
          type="button"
          disabled={loading}
          aria-busy={loading}
          onClick={enterGiftRegistry}
          className="landing-enter-link pointer-events-auto relative z-10 mt-10 inline-flex min-w-32 touch-manipulation items-center justify-center gap-2 rounded-full bg-[#352e2b] px-9 py-3.5 text-sm font-medium tracking-wide text-[#fffaf6] shadow-sm transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8f6d62] disabled:cursor-wait"
        >
          {loading && (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-r-transparent motion-reduce:animate-none"
            />
          )}
          <span>{loading ? t.home.loading : t.home.enter}</span>
        </button>
      </div>
    </main>
  );
}
