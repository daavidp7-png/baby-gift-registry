"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type AirtableAttachment = {
  url: string;
  filename?: string;
};

export type GiftRecord = {
  id: string;
  fields: {
    "Gift Name"?: string;
    Brand?: string;
    Category?: string;
    Description?: string;
    Image?: AirtableAttachment[];
    "Product URL"?: string;
    Store?: string;
    Price?: number;
    Priority?: string;
    Status?: string;
    "Display Order"?: number;
    Featured?: boolean;
    Active?: boolean;
  };
};

type SortOption = "recommended" | "price-asc" | "price-desc";
type FilterSection = "category" | "price";

const MAX_PRICE = 3000;

const priceFormatter = new Intl.NumberFormat("de-CH", {
  maximumFractionDigits: 0,
});

export default function GiftGrid({ gifts }: { gifts: GiftRecord[] }) {
  const [sort, setSort] = useState<SortOption>("recommended");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<FilterSection>>(
    () => new Set(["price"])
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set()
  );

  const markImageAsFailed = (giftId: string) => {
    setFailedImages((current) => {
      const next = new Set(current);
      next.add(giftId);
      return next;
    });
  };

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          gifts
            .map((gift) => gift.fields.Category)
            .filter((category): category is string => Boolean(category))
        )
      ).sort((a, b) => a.localeCompare(b, "es")),
    [gifts]
  );

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) => {
      const next = new Set(current);

      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }

      return next;
    });
  };

  const toggleSection = (section: FilterSection) => {
    setOpenSections((current) => {
      const next = new Set(current);

      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }

      return next;
    });
  };

  useEffect(() => {
    if (!filtersOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

  const sortedGifts = useMemo(() => {
    const items = gifts.filter((gift) => {
      const priceMatches =
        gift.fields.Price == null ||
        (gift.fields.Price >= minPrice && gift.fields.Price <= maxPrice);
      const categoryMatches =
        selectedCategories.size === 0 ||
        (gift.fields.Category != null &&
          selectedCategories.has(gift.fields.Category));

      return priceMatches && categoryMatches;
    });

    if (sort === "price-asc") {
      return items.sort((a, b) => {
        const priceA = a.fields.Price ?? Number.MAX_VALUE;
        const priceB = b.fields.Price ?? Number.MAX_VALUE;
        return priceA - priceB;
      });
    }

    if (sort === "price-desc") {
      return items.sort((a, b) => {
        const priceA = a.fields.Price ?? -1;
        const priceB = b.fields.Price ?? -1;
        return priceB - priceA;
      });
    }

    return items.sort(
      (a, b) =>
        (a.fields["Display Order"] ?? 9999) -
        (b.fields["Display Order"] ?? 9999)
    );
  }, [gifts, maxPrice, minPrice, selectedCategories, sort]);

  const priceFilterIsActive = minPrice > 0 || maxPrice < MAX_PRICE;
  const activeFilterCount =
    (priceFilterIsActive ? 1 : 0) +
    selectedCategories.size +
    (sort !== "recommended" ? 1 : 0);

  return (
    <>
      <div className="mb-8">
        <div className="flex justify-end py-4">
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="gift-filters"
            onClick={() => setFiltersOpen((current) => !current)}
            className="text-sm font-semibold uppercase tracking-[0.08em] text-[#302b29] underline-offset-8 hover:underline"
          >
            Filter &amp; Sort
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {filtersOpen && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/35"
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
            />

            <aside
              id="gift-filters"
              role="dialog"
              aria-modal="true"
              aria-labelledby="filters-title"
              className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl"
            >
              <header className="flex items-center justify-between border-b border-[#d8cec9] px-6 py-6 sm:px-10">
                <h2
                  id="filters-title"
                  className="text-lg font-semibold uppercase tracking-[0.04em] text-[#171717]"
                >
                  Filter &amp; Sort
                </h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Close filters"
                  className="p-2 text-[#302b29]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="m5 5 14 14M19 5 5 19" />
                  </svg>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-6 sm:px-10">
                <div className="border-b border-[#d8cec9] py-6">
                  <label
                    htmlFor="gift-sort"
                    className="block text-base font-semibold uppercase"
                  >
                    Sort by
                  </label>
                  <div className="relative mt-4">
                    <select
                      id="gift-sort"
                      value={sort}
                      onChange={(event) =>
                        setSort(event.target.value as SortOption)
                      }
                      className="w-full appearance-none border border-[#d8cec9] bg-white px-4 py-3 pr-11 text-sm text-[#302b29] outline-none focus:border-[#302b29]"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="price-asc">Price: low to high</option>
                      <option value="price-desc">Price: high to low</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="m7 10 5 5 5-5" />
                    </svg>
                  </div>
                </div>

                <div className="border-b border-[#d8cec9] py-6">
                  <button
                    type="button"
                    aria-expanded={openSections.has("price")}
                    onClick={() => toggleSection("price")}
                    className="flex w-full items-center justify-between py-1 text-left text-base font-semibold uppercase"
                  >
                    <span>Price</span>
                    <span aria-hidden="true" className="text-xl font-light">
                      {openSections.has("price") ? "−" : "+"}
                    </span>
                  </button>

                  {openSections.has("price") && (
                    <div className="mt-6 px-1">
                      <div className="price-range-control">
                        <div className="price-range-track" />
                        <div
                          className="price-range-fill"
                          style={{
                            left: `${(minPrice / MAX_PRICE) * 100}%`,
                            right: `${100 - (maxPrice / MAX_PRICE) * 100}%`,
                          }}
                        />
                        <input
                          type="range"
                          min="0"
                          max={MAX_PRICE}
                          step="50"
                          value={minPrice}
                          onChange={(event) =>
                            setMinPrice(
                              Math.min(
                                Number(event.target.value),
                                maxPrice - 50
                              )
                            )
                          }
                          aria-label="Minimum price in Swiss francs"
                        />
                        <input
                          type="range"
                          min="0"
                          max={MAX_PRICE}
                          step="50"
                          value={maxPrice}
                          onChange={(event) =>
                            setMaxPrice(
                              Math.max(
                                Number(event.target.value),
                                minPrice + 50
                              )
                            )
                          }
                          aria-label="Maximum price in Swiss francs"
                        />
                      </div>
                      <p className="mt-3 text-base tabular-nums text-[#302b29]">
                        {priceFormatter.format(minPrice)} CHF –{" "}
                        {priceFormatter.format(maxPrice)} CHF
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-b border-[#d8cec9] py-6">
                  <button
                    type="button"
                    aria-expanded={openSections.has("category")}
                    onClick={() => toggleSection("category")}
                    className="flex w-full items-center justify-between py-1 text-left text-base font-semibold uppercase"
                  >
                    <span>Category</span>
                    <span aria-hidden="true" className="text-xl font-light">
                      {openSections.has("category") ? "−" : "+"}
                    </span>
                  </button>

                  {openSections.has("category") && (
                    <div className="mt-5 grid grid-cols-2 border-l border-t border-[#d8cec9]">
                      {categories.map((category) => {
                        const selected = selectedCategories.has(category);

                        return (
                          <button
                            key={category}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleCategory(category)}
                            className={`min-h-14 border-b border-r border-[#d8cec9] px-4 py-3 text-left text-sm transition-colors ${
                              selected
                                ? "bg-[#302b29] text-white"
                                : "bg-white text-[#302b29] hover:bg-[#f5f1ef]"
                            }`}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <footer className="grid gap-3 border-t border-[#d8cec9] bg-white p-6 sm:px-10">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="bg-[#171717] px-6 py-4 text-sm font-semibold uppercase tracking-[0.05em] text-white hover:bg-[#302b29]"
                >
                  Show gifts ({sortedGifts.length})
                </button>
                <button
                  type="button"
                  disabled={activeFilterCount === 0}
                  onClick={() => {
                    setSort("recommended");
                    setMinPrice(0);
                    setMaxPrice(MAX_PRICE);
                    setSelectedCategories(new Set());
                  }}
                  className="border border-[#d8cec9] px-6 py-4 text-sm font-semibold uppercase tracking-[0.05em] text-[#756b67] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear filters
                </button>
              </footer>
            </aside>
          </div>
        )}
      </div>

      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {sortedGifts.map((gift) => {
          const {
            Brand,
            Category,
            Description,
            Image: giftImages,
            Price,
            Priority,
            Status = "Available",
            Featured,
          } = gift.fields;

          const name = gift.fields["Gift Name"] ?? "Gift";
          const productUrl = gift.fields["Product URL"];
          const image = giftImages?.[0]?.url;
          const imageFailed = failedImages.has(gift.id);

          const available = Status === "Available";

          return (
            <article
              key={gift.id}
              className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-black/5"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#eee8e5]">
                {image && !imageFailed ? (
                  <Image
                    src={image}
                    alt={name}
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                    className="h-full w-full object-cover"
                    onError={() => markImageAsFailed(gift.id)}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[#a0948f]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
                      <path d="m5 16 4.5-4.5 3.25 3.25 2-2L19 17" />
                      <circle cx="15.5" cy="9" r="1.25" />
                    </svg>
                    <span>Image unavailable</span>
                  </div>
                )}
              </div>

              <div className="p-6">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    {Brand && (
                      <p className="text-xs uppercase tracking-[0.18em] text-[#a18e86]">
                        {Brand}
                      </p>
                    )}

                    <h2 className="mt-1 text-xl font-semibold">{name}</h2>

                    {Category && (
                      <p className="mt-1 text-sm text-[#8b807b]">
                        {Category}
                      </p>
                    )}
                  </div>

                  {Featured && (
                    <span className="whitespace-nowrap rounded-full bg-[#f6e7e4] px-3 py-1 text-xs font-medium text-[#97675e]">
                      Featured
                    </span>
                  )}
                </div>

                {Description && (
                  <p className="mb-5 text-sm leading-6 text-[#756b67]">
                    {Description}
                  </p>
                )}

                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    {typeof Price === "number" && (
                      <p className="text-lg font-semibold">
                        CHF {Price.toFixed(2)}
                      </p>
                    )}

                    {Priority && (
                      <p className="mt-1 text-xs text-[#958985]">
                        {Priority}
                      </p>
                    )}
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      available
                        ? "bg-[#e7f0e8] text-[#52705b]"
                        : "bg-[#eeeae8] text-[#837873]"
                    }`}
                  >
                    {Status}
                  </span>
                </div>

                <div className="flex gap-3">
                  {productUrl && (
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-full border border-[#d8cec9] px-4 py-3 text-center text-sm font-medium hover:bg-[#f8f3f1]"
                    >
                      View gift
                    </a>
                  )}

                  <button
                    type="button"
                    disabled={!available}
                    className={`flex-1 rounded-full px-4 py-3 text-sm font-medium ${
                      available
                        ? "bg-[#302b29] text-white hover:bg-[#514844]"
                        : "cursor-not-allowed bg-[#ebe7e5] text-[#9c918c]"
                    }`}
                  >
                    {available ? "Reserve" : Status}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
