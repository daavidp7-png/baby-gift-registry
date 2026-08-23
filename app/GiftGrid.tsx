"use client";

import { useMemo, useState } from "react";

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

export default function GiftGrid({ gifts }: { gifts: GiftRecord[] }) {
  const [sort, setSort] = useState<SortOption>("recommended");

  const sortedGifts = useMemo(() => {
    const items = [...gifts];

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
  }, [gifts, sort]);

  return (
    <>
      <div className="mb-8 flex justify-end">
        <label className="flex items-center gap-3 text-sm text-[#756b67]">
          <span>Sort by</span>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-full border border-[#d8cec9] bg-white px-4 py-2.5 text-sm text-[#302b29] outline-none"
          >
            <option value="recommended">Recommended</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>

      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {sortedGifts.map((gift) => {
          const {
            Brand,
            Category,
            Description,
            Image,
            Price,
            Priority,
            Status = "Available",
            Featured,
          } = gift.fields;

          const name = gift.fields["Gift Name"] ?? "Gift";
          const productUrl = gift.fields["Product URL"];
          const image = Image?.[0]?.url;

          const available = Status === "Available";

          return (
            <article
              key={gift.id}
              className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-black/5"
            >
              <div className="aspect-[4/3] overflow-hidden bg-[#eee8e5]">
                {image ? (
                  <img
                    src={image}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[#a0948f]">
                    No image
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
