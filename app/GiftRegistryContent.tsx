"use client";

import GiftGrid, { type GiftRecord } from "./GiftGrid";
import { useLanguage } from "./i18n/LanguageProvider";

export default function GiftRegistryContent({
  gifts,
  favoritesOnly = false,
}: {
  gifts: GiftRecord[];
  favoritesOnly?: boolean;
}) {
  const { t } = useLanguage();
  const heading = favoritesOnly ? t.favorites : t.gifts;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-[#a18479]">{heading.eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">{heading.title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-6 text-[#756b67] sm:text-lg">{heading.description}</p>
      </div>

      {gifts.length === 0 && !favoritesOnly ? (
        <div className="rounded-[20px] bg-white p-8 text-center shadow-sm"><p>{t.gifts.empty}</p></div>
      ) : (
        <GiftGrid gifts={gifts} favoritesOnly={favoritesOnly} />
      )}
    </section>
  );
}
