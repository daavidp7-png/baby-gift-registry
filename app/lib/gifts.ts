import { type GiftRecord } from "../GiftGrid";
import { unstable_cache } from "next/cache";
import { airtableRequest } from "./airtable";
import { GIFTS_CACHE_SECONDS, GIFTS_CACHE_TAG } from "./giftCache";
import { createImageProxyUrl } from "./imageProxy";

async function getImageFromProductUrl(
  productUrl?: string
): Promise<string | null> {
  if (!productUrl) return null;

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",

        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

        "Accept-Language":
          "de-CH,de;q=0.9,en;q=0.8,es;q=0.7",

        "Cache-Control": "no-cache",
      },

      redirect: "follow",

      next: {
        revalidate: 86400,
      },
    });

    if (!response.ok) {
      console.log(
        `Could not fetch ${productUrl}: ${response.status}`
      );
      return null;
    }

    const html = await response.text();

    // ---------------------------------------------
    // Helper: convert relative URLs to absolute URLs
    // ---------------------------------------------

    const makeAbsolute = (url?: string | null) => {
      if (!url) return null;

      let cleanUrl = url
        .replace(/&amp;/g, "&")
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .trim();

      // Protocol-relative URL: //cdn.shop.com/image.jpg
      if (cleanUrl.startsWith("//")) {
        cleanUrl = `https:${cleanUrl}`;
      }

      try {
        return new URL(cleanUrl, productUrl).href;
      } catch {
        return null;
      }
    };

    // ---------------------------------------------
    // 1. Open Graph image
    // ---------------------------------------------

    const ogPatterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["'][^>]*>/i,
    ];

    for (const pattern of ogPatterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        const url = makeAbsolute(match[1]);

        if (url) return url;
      }
    }

    // ---------------------------------------------
    // 2. Twitter image
    // ---------------------------------------------

    const twitterPatterns = [
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
      /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:image["'][^>]*>/i,
    ];

    for (const pattern of twitterPatterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        const url = makeAbsolute(match[1]);

        if (url) return url;
      }
    }

    // ---------------------------------------------
    // 3. Schema.org / itemprop image
    // ---------------------------------------------

    const itemPropPatterns = [
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']image["'][^>]*>/i,
      /<link[^>]+itemprop=["']image["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    ];

    for (const pattern of itemPropPatterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        const url = makeAbsolute(match[1]);

        if (url) return url;
      }
    }

    // ---------------------------------------------
    // 4. JSON-LD Product image
    // Works with many Shopify / ecommerce websites
    // ---------------------------------------------

    const jsonLdBlocks = html.match(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
    );

    if (jsonLdBlocks) {
      for (const block of jsonLdBlocks) {
        try {
          const jsonText = block
            .replace(/^<script[^>]*>/i, "")
            .replace(/<\/script>$/i, "")
            .trim();

          const json = JSON.parse(jsonText);

          const findProductImage = (value: unknown): string | null => {
            if (!value) return null;

            if (Array.isArray(value)) {
              for (const item of value) {
                const result = findProductImage(item);

                if (result) return result;
              }

              return null;
            }

            if (typeof value !== "object") return null;

            const objectValue = value as Record<string, unknown>;

            const type = objectValue["@type"];

            const isProduct =
              type === "Product" ||
              (Array.isArray(type) && type.includes("Product"));

            if (isProduct && objectValue.image) {
              if (typeof objectValue.image === "string") {
                return objectValue.image;
              }

              if (
                Array.isArray(objectValue.image) &&
                objectValue.image.length > 0
              ) {
                const first = objectValue.image[0];

                if (typeof first === "string") {
                  return first;
                }

                if (
                  first &&
                  typeof first === "object" &&
                  "url" in first &&
                  typeof first.url === "string"
                ) {
                  return first.url;
                }

                if (
                  first &&
                  typeof first === "object" &&
                  "contentUrl" in first &&
                  typeof first.contentUrl === "string"
                ) {
                  return first.contentUrl;
                }
              }

              if (typeof objectValue.image === "object") {
                const imageObject = objectValue.image as Record<string, unknown>;

                if (typeof imageObject.url === "string") return imageObject.url;
                if (typeof imageObject.contentUrl === "string") {
                  return imageObject.contentUrl;
                }
              }
            }

            for (const child of Object.values(objectValue)) {
              const result = findProductImage(child);

              if (result) return result;
            }

            return null;
          };

          const image = findProductImage(json);

          if (image) {
            const url = makeAbsolute(image);

            if (url) return url;
          }
        } catch {
          // Ignore invalid JSON-LD blocks
        }
      }
    }

    // ---------------------------------------------
    // 5. Common ecommerce JSON image properties
    // ---------------------------------------------

    const jsonImagePatterns = [
      /"featured_image"\s*:\s*"([^"]+)"/i,
      /"featuredImage"\s*:\s*"([^"]+)"/i,
      /"image_url"\s*:\s*"([^"]+)"/i,
      /"imageUrl"\s*:\s*"([^"]+)"/i,
      /"image"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i,
      /"src"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i,
    ];

    for (const pattern of jsonImagePatterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        const url = makeAbsolute(match[1]);

        if (url) return url;
      }
    }

    // ---------------------------------------------
    // 6. Product image HTML
    // ---------------------------------------------

    const productImagePatterns = [
      /<img[^>]+class=["'][^"']*(?:product|gallery|main-image)[^"']*["'][^>]+src=["']([^"']+)["']/i,

      /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*(?:product|gallery|main-image)[^"']*["']/i,

      /<img[^>]+data-src=["']([^"']+)["'][^>]*>/i,

      /<img[^>]+data-original=["']([^"']+)["'][^>]*>/i,
    ];

    for (const pattern of productImagePatterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        const url = makeAbsolute(match[1]);

        if (url) return url;
      }
    }

    // ---------------------------------------------
    // 7. srcset fallback
    // Take the largest image listed
    // ---------------------------------------------

    const srcsetMatch = html.match(
      /<img[^>]+srcset=["']([^"']+)["'][^>]*>/i
    );

    if (srcsetMatch?.[1]) {
      const candidates = srcsetMatch[1]
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter(Boolean);

      if (candidates.length > 0) {
        const candidate = candidates[candidates.length - 1];

        const url = makeAbsolute(candidate);

        if (url) return url;
      }
    }

    // ---------------------------------------------
    // Nothing found
    // ---------------------------------------------

    console.log(`No product image found for ${productUrl}`);

    return null;
  } catch (error) {
    console.error(
      `Image extraction failed for ${productUrl}`,
      error
    );

    return null;
  }
}

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

const recordsWithImages = await Promise.all(
  activeRecords.map(async (gift) => {
    // Keep the Airtable image if one already exists
    if (gift.fields.Image?.[0]?.url) {
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
    }

    const productUrl = gift.fields["Product URL"];
    const imageUrl = await getImageFromProductUrl(productUrl);

    if (!imageUrl) {
      return gift;
    }

    return {
      ...gift,
      fields: {
        ...gift.fields,
        Image: [
          {
            url: createImageProxyUrl(imageUrl, productUrl),
            filename: "product-image",
          },
        ],
      },
    };
  })
);

return recordsWithImages;
}

export const getGifts = unstable_cache(loadGifts, [GIFTS_CACHE_TAG], {
  revalidate: GIFTS_CACHE_SECONDS,
  tags: [GIFTS_CACHE_TAG],
});
