"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import BulkPurchaseModal, {
  type BulkPurchaseResultItem,
} from "./BulkPurchaseModal";
import ExpandableDescription from "./ExpandableDescription";
import {
  getCategorySearchLabels,
  getLocalizedCategory,
} from "./i18n/categories";
import { useLanguage } from "./i18n/LanguageProvider";
import { useFavorites } from "./lib/favorites";
import PurchaseModal from "./PurchaseModal";
import ReservationModal from "./ReservationModal";

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
type GiftStatus = "Available" | "Reserved" | "Purchased";

const MAX_PRICE = 3000;

const priceFormatter = new Intl.NumberFormat("de-CH", {
  maximumFractionDigits: 0,
});

const selectedTotalFormatter = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();

export default function GiftGrid({
  gifts,
  favoritesOnly = false,
}: {
  gifts: GiftRecord[];
  favoritesOnly?: boolean;
}) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [sort, setSort] = useState<SortOption>("recommended");
  const [searchQuery, setSearchQuery] = useState("");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<FilterSection>>(
    () => new Set(["price"])
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedGift, setSelectedGift] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<{
    id: string;
    name: string;
    status: "Available" | "Reserved";
  } | null>(null);
  const [bulkSelectedGiftIds, setBulkSelectedGiftIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkPurchaseGiftIds, setBulkPurchaseGiftIds] = useState<
    string[] | null
  >(null);
  const [giftStatusOverrides, setGiftStatusOverrides] = useState<
    Map<string, GiftStatus>
  >(() => new Map());
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [favoriteNoticeVisible, setFavoriteNoticeVisible] = useState(false);
  const hasShownFavoriteNotice = useRef(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set()
  );

  const displayedGifts = useMemo(
    () =>
      favoritesOnly
        ? gifts.filter((gift) => favoriteIds.has(gift.id))
        : gifts,
    [favoriteIds, favoritesOnly, gifts]
  );

  const bulkPurchaseSelectedTotal = useMemo(() => {
    if (!bulkPurchaseGiftIds) return 0;

    const selectedIds = new Set(bulkPurchaseGiftIds);
    return gifts.reduce((total, gift) => {
      if (!selectedIds.has(gift.id)) return total;
      const status = giftStatusOverrides.get(gift.id) ?? gift.fields.Status;
      if (status === "Purchased") return total;

      const price = gift.fields.Price;
      return total + (typeof price === "number" && Number.isFinite(price) ? price : 0);
    }, 0);
  }, [bulkPurchaseGiftIds, giftStatusOverrides, gifts]);

  const liveSelectedTotal = useMemo(
    () =>
      displayedGifts.reduce((total, gift) => {
        if (!bulkSelectedGiftIds.has(gift.id)) return total;
        const status = giftStatusOverrides.get(gift.id) ?? gift.fields.Status;
        if (status === "Purchased") return total;

        const price = gift.fields.Price;
        return (
          total +
          (typeof price === "number" && Number.isFinite(price) ? price : 0)
        );
      }, 0),
    [bulkSelectedGiftIds, displayedGifts, giftStatusOverrides]
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
          displayedGifts
            .map((gift) => gift.fields.Category)
            .filter((category): category is string => Boolean(category))
        )
      ).sort((a, b) =>
        getLocalizedCategory(a, language).localeCompare(
          getLocalizedCategory(b, language),
          language
        )
      ),
    [displayedGifts, language]
  );

  const translatedStatus = (status: string) => {
    if (status === "Available") return t.gifts.statuses.available;
    if (status === "Reserved") return t.gifts.statuses.reserved;
    if (status === "Purchased") return t.gifts.statuses.purchased;
    return status;
  };

  const getGiftStatus = (gift: GiftRecord): GiftStatus => {
    const status = gift.fields.Status;
    const airtableStatus: GiftStatus =
      status === "Reserved" || status === "Purchased"
        ? status
        : "Available";

    return giftStatusOverrides.get(gift.id) ?? airtableStatus;
  };

  const updateGiftStatus = (giftId: string, status: GiftStatus) => {
    setGiftStatusOverrides((current) => {
      const next = new Map(current);
      next.set(giftId, status);
      return next;
    });
  };

  const toggleBulkGift = (giftId: string) => {
    setBulkSelectedGiftIds((current) => {
      const next = new Set(current);

      if (next.has(giftId)) {
        next.delete(giftId);
      } else {
        next.add(giftId);
      }

      return next;
    });
  };

  const purchasableFavoriteGiftIds = displayedGifts
    .filter((gift) => getGiftStatus(gift) !== "Purchased")
    .map((gift) => gift.id);
  const allPurchasableFavoritesSelected =
    purchasableFavoriteGiftIds.length > 0 &&
    purchasableFavoriteGiftIds.every((giftId) =>
      bulkSelectedGiftIds.has(giftId)
    );

  const toggleAllPurchasableFavorites = () => {
    setBulkSelectedGiftIds((current) => {
      if (allPurchasableFavoritesSelected) return new Set();

      const next = new Set(current);

      purchasableFavoriteGiftIds.forEach((giftId) => next.add(giftId));

      return next;
    });
  };

  const toggleGiftFavorite = (giftId: string) => {
    const addingFavorite = !favoriteIds.has(giftId);

    if (favoritesOnly && favoriteIds.has(giftId)) {
      setBulkSelectedGiftIds((current) => {
        const next = new Set(current);
        next.delete(giftId);
        return next;
      });
    }

    toggleFavorite(giftId);

    if (!favoritesOnly && addingFavorite && !hasShownFavoriteNotice.current) {
      hasShownFavoriteNotice.current = true;
      setFavoriteNoticeVisible(true);
    }
  };

  const handleBulkPurchaseComplete = (items: BulkPurchaseResultItem[]) => {
    const purchasedIds = new Set(
      items
        .filter((item) => item.outcome === "purchased")
        .map((item) => item.giftId)
    );

    items.forEach((item) => {
      if (item.status) updateGiftStatus(item.giftId, item.status);
    });

    setBulkSelectedGiftIds((current) => {
      const next = new Set(current);
      purchasedIds.forEach((giftId) => next.delete(giftId));
      return next;
    });

    const purchasedCount = purchasedIds.size;
    const message =
      purchasedCount === 0
        ? t.bulkPurchase.noEligible
        : purchasedCount === 1
        ? t.bulkPurchase.purchasedOne
        : t.bulkPurchase.purchasedMany.replace(
            "{count}",
            String(purchasedCount)
          );
    setFeedback({ message, tone: purchasedCount > 0 ? "success" : "error" });
    router.refresh();
  };

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

  const scrollToGiftSection = (status: GiftStatus) => {
    document
      .getElementById(`gift-section-${status.toLowerCase()}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  useEffect(() => {
    if (!favoriteNoticeVisible) return;

    const timeout = window.setTimeout(() => setFavoriteNoticeVisible(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [favoriteNoticeVisible]);

  const sortedGifts = useMemo(() => {
    const searchTerms = normalizeSearchText(searchQuery)
      .split(/\s+/)
      .filter(Boolean);

    const items = displayedGifts.filter((gift) => {
      const priceMatches =
        gift.fields.Price == null ||
        (gift.fields.Price >= minPrice && gift.fields.Price <= maxPrice);
      const categoryMatches =
        selectedCategories.size === 0 ||
        (gift.fields.Category != null &&
          selectedCategories.has(gift.fields.Category));

      const category = gift.fields.Category;
      const searchableText = normalizeSearchText(
        [
          gift.fields["Gift Name"],
          gift.fields.Brand,
          category,
          category ? getCategorySearchLabels(category).join(" ") : undefined,
          gift.fields.Description,
          gift.fields.Store,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
      );
      const searchMatches = searchTerms.every((term) =>
        searchableText.includes(term)
      );

      return priceMatches && categoryMatches && searchMatches;
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
  }, [displayedGifts, maxPrice, minPrice, searchQuery, selectedCategories, sort]);

  const giftSections = favoritesOnly
    ? [{ status: null, gifts: sortedGifts }]
    : (["Available", "Reserved", "Purchased"] as const)
        .map((status) => ({
          status,
          gifts: sortedGifts.filter((gift) => getGiftStatus(gift) === status),
        }))
        .filter((section) => section.gifts.length > 0);

  const priceFilterIsActive = minPrice > 0 || maxPrice < MAX_PRICE;
  const activeFilterCount =
    (priceFilterIsActive ? 1 : 0) +
    (normalizeSearchText(searchQuery) ? 1 : 0) +
    selectedCategories.size +
    (sort !== "recommended" ? 1 : 0);

  if (favoritesOnly && displayedGifts.length === 0) {
    return (
      <div className="rounded-[20px] bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-base leading-6 text-[#756b67]">{t.favorites.empty}</p>
        <Link
          href="/gifts"
          className="mt-6 inline-flex rounded-full bg-[#302b29] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#514844]"
        >
          {t.favorites.returnToGifts}
        </Link>
      </div>
    );
  }

  return (
    <>
      {feedback && (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`mb-6 rounded-[16px] px-4 py-3 text-center text-sm font-medium ${
            feedback.tone === "success"
              ? "bg-[#e7f0e8] text-[#52705b]"
              : "bg-[#f6e7e4] text-[#8a514b]"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-2">
          {favoritesOnly && (
            <Link
              href="/gifts"
              className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-[#302b29] underline-offset-8 hover:underline sm:text-sm"
            >
              <span aria-hidden="true">←</span>
              {t.favorites.returnToGifts}
            </Link>
          )}

          {!favoritesOnly && (
            <nav
              aria-label={t.gifts.sectionNavigation}
              className="flex w-full flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium uppercase tracking-[0.08em] text-[#756b67] sm:w-auto sm:text-sm"
            >
              {(["Available", "Reserved", "Purchased"] as const).map(
                (status, index) => (
                  <span key={status} className="inline-flex items-center gap-2">
                    {index > 0 && (
                      <span aria-hidden="true" className="text-[#c8b9b2]">
                        ·
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => scrollToGiftSection(status)}
                      className="rounded-sm underline-offset-8 transition-colors hover:text-[#302b29] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#756b67]"
                    >
                      {status === "Available"
                        ? t.gifts.sections.available
                        : status === "Reserved"
                          ? t.gifts.sections.reserved
                          : t.gifts.sections.purchased}
                    </button>
                  </span>
                )
              )}
            </nav>
          )}

          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="gift-filters"
            onClick={() => setFiltersOpen((current) => !current)}
            className="ml-auto text-sm font-medium uppercase tracking-[0.08em] text-[#302b29] underline-offset-8 hover:underline"
          >
            {t.gifts.filters.open}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {favoritesOnly && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#e7dfdb] pt-4">
            <p className="text-sm text-[#756b67]">
              {t.bulkPurchase.selectedTotal}:{" "}
              <span className="font-medium text-[#302b29]">
                {selectedTotalFormatter.format(liveSelectedTotal)}
              </span>
            </p>

            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
              <button
                type="button"
                onClick={toggleAllPurchasableFavorites}
                className="text-xs font-medium uppercase tracking-[0.08em] text-[#756b67] underline-offset-8 hover:underline sm:text-sm"
              >
                {allPurchasableFavoritesSelected
                  ? t.bulkPurchase.deselectAll
                  : t.bulkPurchase.selectAllPurchasable}
              </button>
              <button
                type="button"
                disabled={bulkSelectedGiftIds.size === 0}
                onClick={() => {
                  setFeedback(null);
                  setBulkPurchaseGiftIds(Array.from(bulkSelectedGiftIds));
                }}
                className="rounded-full border border-[#302b29] px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] text-[#302b29] hover:bg-[#f3ece9] disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
              >
                {t.bulkPurchase.purchaseSelected} ({bulkSelectedGiftIds.size})
              </button>
            </div>
          </div>
        )}

        {filtersOpen && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/35"
              aria-label={t.gifts.filters.close}
              onClick={() => setFiltersOpen(false)}
            />

            <aside
              id="gift-filters"
              role="dialog"
              aria-modal="true"
              aria-labelledby="filters-title"
              className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl"
            >
              <header className="flex items-center justify-between border-b border-[#d8cec9] px-5 py-4 sm:px-8">
                <h2
                  id="filters-title"
                  className="text-lg font-medium uppercase tracking-[0.04em] text-[#171717]"
                >
                  {t.gifts.filters.open}
                </h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label={t.gifts.filters.close}
                  className="p-1.5 text-[#302b29]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="m5 5 14 14M19 5 5 19" />
                  </svg>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-5 sm:px-8">
                {!favoritesOnly && (
                  <div className="border-b border-[#d8cec9] py-4">
                    <label
                      htmlFor="gift-search"
                      className="block text-base font-medium uppercase"
                    >
                      {t.gifts.filters.search}
                    </label>
                    <div className="relative mt-3">
                      <input
                        id="gift-search"
                        type="search"
                        value={searchQuery}
                        placeholder={t.gifts.filters.searchPlaceholder}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full appearance-none border border-[#d8cec9] bg-white px-3 py-2.5 pr-11 text-sm font-normal text-[#302b29] outline-none placeholder:text-[#a0948f] focus:border-[#302b29]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          aria-label={t.gifts.filters.clearSearch}
                          onClick={() => setSearchQuery("")}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-lg text-[#756b67] hover:text-[#302b29] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#756b67]"
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-b border-[#d8cec9] py-4">
                  <label
                    htmlFor="gift-sort"
                    className="block text-base font-medium uppercase"
                  >
                    {t.gifts.filters.sortBy}
                  </label>
                  <div className="relative mt-3">
                    <select
                      id="gift-sort"
                      value={sort}
                      onChange={(event) =>
                        setSort(event.target.value as SortOption)
                      }
                      className="w-full appearance-none border border-[#d8cec9] bg-white px-3 py-2.5 pr-10 text-sm font-normal text-[#302b29] outline-none focus:border-[#302b29]"
                    >
                      <option value="recommended">{t.gifts.filters.recommended}</option>
                      <option value="price-asc">{t.gifts.filters.priceLowHigh}</option>
                      <option value="price-desc">{t.gifts.filters.priceHighLow}</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="m7 10 5 5 5-5" />
                    </svg>
                  </div>
                </div>

                <div className="border-b border-[#d8cec9] py-4">
                  <button
                    type="button"
                    aria-expanded={openSections.has("price")}
                    onClick={() => toggleSection("price")}
                    className="flex w-full items-center justify-between py-1 text-left text-base font-medium uppercase"
                  >
                    <span>{t.gifts.filters.price}</span>
                    <span aria-hidden="true" className="text-xl font-light">
                      {openSections.has("price") ? "−" : "+"}
                    </span>
                  </button>

                  {openSections.has("price") && (
                    <div className="mt-4 px-1">
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
                          aria-label={t.gifts.filters.minimumPrice}
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
                          aria-label={t.gifts.filters.maximumPrice}
                        />
                      </div>
                      <p className="mt-3 text-base tabular-nums text-[#302b29]">
                        {priceFormatter.format(minPrice)} CHF –{" "}
                        {priceFormatter.format(maxPrice)} CHF
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-b border-[#d8cec9] py-4">
                  <button
                    type="button"
                    aria-expanded={openSections.has("category")}
                    onClick={() => toggleSection("category")}
                    className="flex w-full items-center justify-between py-1 text-left text-base font-medium uppercase"
                  >
                    <span>{t.gifts.filters.category}</span>
                    <span aria-hidden="true" className="text-xl font-light">
                      {openSections.has("category") ? "−" : "+"}
                    </span>
                  </button>

                  {openSections.has("category") && (
                    <div className="mt-4 grid grid-cols-2 border-l border-t border-[#d8cec9]">
                      {categories.map((category) => {
                        const selected = selectedCategories.has(category);

                        return (
                          <button
                            key={category}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleCategory(category)}
                            className={`min-h-12 border-b border-r border-[#d8cec9] px-3 py-2 text-left text-sm font-normal transition-colors ${
                              selected
                                ? "bg-[#302b29] text-white"
                                : "bg-white text-[#302b29] hover:bg-[#f5f1ef]"
                            }`}
                          >
                            {getLocalizedCategory(category, language)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <footer className="grid gap-2 border-t border-[#d8cec9] bg-white p-5 sm:px-8">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="bg-[#171717] px-5 py-3 text-sm font-medium uppercase tracking-[0.05em] text-white hover:bg-[#302b29]"
                >
                  {t.gifts.filters.show} ({sortedGifts.length})
                </button>
                <button
                  type="button"
                  disabled={activeFilterCount === 0}
                  onClick={() => {
                    setSearchQuery("");
                    setSort("recommended");
                    setMinPrice(0);
                    setMaxPrice(MAX_PRICE);
                    setSelectedCategories(new Set());
                  }}
                  className="border border-[#d8cec9] px-5 py-3 text-sm font-medium uppercase tracking-[0.05em] text-[#756b67] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t.gifts.filters.clear}
                </button>
              </footer>
            </aside>
          </div>
        )}
      </div>

      {!favoritesOnly && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-[#eadfd9] bg-[#f7efea] px-5 py-4 text-sm shadow-sm sm:gap-5 sm:px-6">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8 shrink-0 text-[#9a756d]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
          </svg>
          <p className="min-w-0 leading-6 text-[#514844]">
            <span className="font-semibold text-[#302b29]">
              {t.gifts.multiGiftHintTitle}
            </span>
            <br />
            {t.gifts.multiGiftHintBody}
          </p>
        </div>
      )}

      {!favoritesOnly && sortedGifts.length === 0 && (
        <p className="rounded-[18px] bg-white px-6 py-10 text-center text-base text-[#756b67] shadow-sm ring-1 ring-black/5">
          {t.gifts.filters.noResults}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {giftSections.flatMap((section, sectionIndex) => [
          !favoritesOnly && section.status && (
            <h2
              key={`${section.status}-heading`}
              id={`gift-section-${section.status.toLowerCase()}`}
              className={`col-span-full scroll-mt-8 text-lg font-semibold text-[#302b29] sm:text-xl ${
                sectionIndex === 0 ? "" : "mt-7 sm:mt-10"
              }`}
            >
              {section.status === "Available"
                  ? t.gifts.sections.available
                  : section.status === "Reserved"
                    ? t.gifts.sections.reserved
                    : t.gifts.sections.purchased}
            </h2>
          ),
          ...section.gifts.map((gift) => {
          const {
            Brand,
            Category,
            Description,
            Image: giftImages,
            Price,
            Priority,
            Featured,
          } = gift.fields;

          const name = gift.fields["Gift Name"] ?? t.gifts.fallbackName;
          const productUrl = gift.fields["Product URL"];
          const image = giftImages?.[0]?.url;
          const imageFailed = failedImages.has(gift.id);

          const currentStatus = getGiftStatus(gift);
          const available = currentStatus === "Available";
          const reserved = currentStatus === "Reserved";
          const purchased = currentStatus === "Purchased";
          const bulkSelected = bulkSelectedGiftIds.has(gift.id);

          return (
            <article
              key={gift.id}
              className={`overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 transition-shadow sm:flex sm:h-full sm:flex-col ${
                bulkSelected ? "ring-[#a18479]" : "ring-black/5"
              }`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#eee8e5]">
                {favoritesOnly && !purchased && (
                  <button
                    type="button"
                    aria-label={`${t.bulkPurchase.selectGift}: ${name}`}
                    aria-pressed={bulkSelected}
                    onClick={() => toggleBulkGift(gift.id)}
                    className={`absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors ${
                      bulkSelected
                        ? "border-[#302b29] bg-[#302b29] text-white"
                        : "border-white/70 bg-white/90 text-[#756b67]"
                    }`}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      {bulkSelected ? (
                        <path d="m5 12 4 4L19 6" />
                      ) : (
                        <circle cx="12" cy="12" r="8" />
                      )}
                    </svg>
                  </button>
                )}

                <button
                  type="button"
                  aria-label={
                    favoriteIds.has(gift.id)
                      ? t.favorites.remove
                      : t.favorites.add
                  }
                  aria-pressed={favoriteIds.has(gift.id)}
                  onClick={() => toggleGiftFavorite(gift.id)}
                  className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[#9d615d] shadow-sm backdrop-blur transition-transform hover:scale-105"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5"
                    fill={favoriteIds.has(gift.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                  </svg>
                </button>

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
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
                      <path d="m5 16 4.5-4.5 3.25 3.25 2-2L19 17" />
                      <circle cx="15.5" cy="9" r="1.25" />
                    </svg>
                    <span>{t.gifts.imageUnavailable}</span>
                  </div>
                )}
              </div>

              <div className="p-5 sm:flex sm:flex-1 sm:flex-col">
                <div>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      {Brand && (
                        <p className="text-xs uppercase tracking-[0.18em] text-[#a18e86]">
                          {Brand}
                        </p>
                      )}

                      <h2 className="mt-1 text-xl font-semibold">{name}</h2>

                      {Category && (
                        <p className="mt-1 text-sm text-[#8b807b]">
                          {getLocalizedCategory(Category, language)}
                        </p>
                      )}
                    </div>

                    {Featured && (
                      <span className="whitespace-nowrap rounded-full bg-[#f6e7e4] px-2.5 py-0.5 text-xs font-medium text-[#97675e]">
                        {t.gifts.featured}
                      </span>
                    )}
                  </div>

                  {Description && (
                    <ExpandableDescription
                      description={Description}
                      seeMoreLabel={t.gifts.seeMore}
                      seeLessLabel={t.gifts.seeLess}
                    />
                  )}
                </div>

                <div className="sm:mt-auto">
                  <div className="mb-4 flex items-center justify-between gap-2">
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
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        available
                          ? "bg-[#e7f0e8] text-[#52705b]"
                          : purchased
                            ? "bg-[#f6e7e4] text-[#8a514b]"
                            : "bg-[#eeeae8] text-[#837873]"
                      }`}
                    >
                      {translatedStatus(currentStatus)}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      {productUrl && (
                        <a
                          href={productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-full border border-[#d8cec9] px-3 py-2.5 text-center text-sm font-medium hover:bg-[#f8f3f1]"
                        >
                          {t.gifts.view}
                        </a>
                      )}

                      {available && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedGift({ id: gift.id, name })
                          }
                          className="flex-1 rounded-full bg-[#302b29] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#514844]"
                        >
                          {t.gifts.reserve}
                        </button>
                      )}
                    </div>

                    {(available || reserved) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFeedback(null);
                          setSelectedPurchase({
                            id: gift.id,
                            name,
                            status: currentStatus,
                          });
                        }}
                        className="w-full rounded-full border border-[#d8cec9] px-3 py-2.5 text-sm font-medium text-[#514844] hover:bg-[#f8f3f1]"
                      >
                        {t.purchase.markAsPurchased}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
          }),
        ])}
      </div>

      {favoriteNoticeVisible && !favoritesOnly && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:bottom-7"
        >
          <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[#e5dfdc] bg-white px-4 py-4 text-left text-sm text-[#514844] shadow-lg">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3e9e4] text-[#a87870]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
              </svg>
            </span>
            <p className="min-w-0 flex-1 leading-5">
              <span className="font-semibold text-[#302b29]">
                {t.favorites.addedNoticeTitle}
              </span>
              <br />
              {t.favorites.addedNoticeBody}
            </p>
            <button
              type="button"
              aria-label={t.favorites.closeNotice}
              onClick={() => setFavoriteNoticeVisible(false)}
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#514844] transition-colors hover:bg-[#f7f1ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f6d62]"
            >
              <span aria-hidden="true" className="text-xl font-light leading-none">
                ×
              </span>
            </button>
          </div>
        </div>
      )}

      {selectedGift && (
        <ReservationModal
          giftId={selectedGift.id}
          giftName={selectedGift.name}
          onClose={() => setSelectedGift(null)}
          onReserved={() => {
            updateGiftStatus(selectedGift.id, "Reserved");
            router.refresh();
          }}
        />
      )}

      {selectedPurchase && (
        <PurchaseModal
          giftId={selectedPurchase.id}
          giftName={selectedPurchase.name}
          expectedStatus={selectedPurchase.status}
          onClose={() => setSelectedPurchase(null)}
          onPurchased={(message) => {
            updateGiftStatus(selectedPurchase.id, "Purchased");
            setBulkSelectedGiftIds((current) => {
              const next = new Set(current);
              next.delete(selectedPurchase.id);
              return next;
            });
            setFeedback({ message, tone: "success" });
            setSelectedPurchase(null);
            router.refresh();
          }}
          onStatusChanged={(status, message) => {
            if (status) updateGiftStatus(selectedPurchase.id, status);
            setFeedback({ message, tone: "error" });
            setSelectedPurchase(null);
            router.refresh();
          }}
        />
      )}

      {bulkPurchaseGiftIds && (
        <BulkPurchaseModal
          giftIds={bulkPurchaseGiftIds}
          selectedTotal={bulkPurchaseSelectedTotal}
          onClose={() => setBulkPurchaseGiftIds(null)}
          onComplete={handleBulkPurchaseComplete}
        />
      )}
    </>
  );
}
