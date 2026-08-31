import { type GiftRecord } from "../GiftGrid";
import { unstable_cache } from "next/cache";
import { airtableRequest } from "./airtable";
import { GIFTS_CACHE_SECONDS, GIFTS_CACHE_TAG } from "./giftCache";
import { createImageProxyUrl } from "./imageProxy";

type GiftListPage = {
  records?: GiftRecord[];
  offset?: string;
};

async function loadGifts(): Promise<GiftRecord[]> {
  const records: GiftRecord[] = [];
  let offset: string | undefined;

  do {
    const search = new URLSearchParams({ pageSize: "100" });
    if (offset) search.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent("Gifts")}?${search.toString()}`
    );
    const data = (await response.json()) as GiftListPage;

    if (!response.ok) {
      console.error("Airtable Gifts error:", data);
      throw new Error(`Could not load gifts from Airtable (${response.status})`);
    }

    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  const activeRecords = records
    .filter((gift) => gift.fields.Active !== false)
    .sort(
      (a, b) =>
        (a.fields["Display Order"] ?? 9999) -
        (b.fields["Display Order"] ?? 9999)
    );

  return activeRecords.map((gift) => {
    if (!gift.fields.Image?.[0]?.url) return gift;

    const [firstImage, ...otherImages] = gift.fields.Image;

    return {
      ...gift,
      fields: {
        ...gift.fields,
        Image: [
          {
            ...firstImage,
            url: createImageProxyUrl(firstImage.url),
          },
          ...otherImages,
        ],
      },
    };
  });
}

export const getGifts = unstable_cache(loadGifts, [GIFTS_CACHE_TAG], {
  revalidate: GIFTS_CACHE_SECONDS,
  tags: [GIFTS_CACHE_TAG],
});
