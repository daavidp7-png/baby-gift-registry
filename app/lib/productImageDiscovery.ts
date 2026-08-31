import "server-only";

export type ProductImageDiscoveryResult =
  | { status: "found"; imageUrl: string; productUrl: string }
  | { status: "invalid_url" }
  | { status: "fetch_failed"; productUrl: string; httpStatus?: number }
  | { status: "no_image"; productUrl: string };

export function parseProductUrl(value?: string): URL | null {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export async function discoverProductImage(
  rawProductUrl?: string,
  options: { timeoutMs?: number } = {}
): Promise<ProductImageDiscoveryResult> {
  const parsedProductUrl = parseProductUrl(rawProductUrl);
  if (!parsedProductUrl) return { status: "invalid_url" };

  const productUrl = parsedProductUrl.href;

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-CH,de;q=0.9,en;q=0.8,es;q=0.7",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: options.timeoutMs
        ? AbortSignal.timeout(options.timeoutMs)
        : undefined,
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      console.log(`Could not fetch ${productUrl}: ${response.status}`);
      return {
        status: "fetch_failed",
        productUrl,
        httpStatus: response.status,
      };
    }

    const html = await response.text();

    const makeAbsolute = (url?: string | null) => {
      if (!url) return null;

      let cleanUrl = url
        .replace(/&amp;/g, "&")
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/")
        .trim();

      if (cleanUrl.startsWith("//")) cleanUrl = `https:${cleanUrl}`;

      try {
        return new URL(cleanUrl, productUrl).href;
      } catch {
        return null;
      }
    };

    const firstMatch = (patterns: RegExp[]) => {
      for (const pattern of patterns) {
        const imageUrl = makeAbsolute(html.match(pattern)?.[1]);
        if (imageUrl) return imageUrl;
      }
      return null;
    };

    const ogImage = firstMatch([
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["'][^>]*>/i,
    ]);
    if (ogImage) return { status: "found", imageUrl: ogImage, productUrl };

    const twitterImage = firstMatch([
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
      /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:image["'][^>]*>/i,
    ]);
    if (twitterImage) {
      return { status: "found", imageUrl: twitterImage, productUrl };
    }

    const itemPropImage = firstMatch([
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']image["'][^>]*>/i,
      /<link[^>]+itemprop=["']image["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    ]);
    if (itemPropImage) {
      return { status: "found", imageUrl: itemPropImage, productUrl };
    }

    const jsonLdBlocks = html.match(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
    );

    if (jsonLdBlocks) {
      for (const block of jsonLdBlocks) {
        try {
          const json = JSON.parse(
            block
              .replace(/^<script[^>]*>/i, "")
              .replace(/<\/script>$/i, "")
              .trim()
          );

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
              if (Array.isArray(objectValue.image) && objectValue.image.length) {
                const first = objectValue.image[0];
                if (typeof first === "string") return first;
                if (first && typeof first === "object") {
                  if ("url" in first && typeof first.url === "string") {
                    return first.url;
                  }
                  if (
                    "contentUrl" in first &&
                    typeof first.contentUrl === "string"
                  ) {
                    return first.contentUrl;
                  }
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

          const imageUrl = makeAbsolute(findProductImage(json));
          if (imageUrl) return { status: "found", imageUrl, productUrl };
        } catch {
          // Ignore invalid JSON-LD blocks.
        }
      }
    }

    const jsonImage = firstMatch([
      /"featured_image"\s*:\s*"([^"]+)"/i,
      /"featuredImage"\s*:\s*"([^"]+)"/i,
      /"image_url"\s*:\s*"([^"]+)"/i,
      /"imageUrl"\s*:\s*"([^"]+)"/i,
      /"image"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i,
      /"src"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i,
    ]);
    if (jsonImage) return { status: "found", imageUrl: jsonImage, productUrl };

    const productImage = firstMatch([
      /<img[^>]+class=["'][^"']*(?:product|gallery|main-image)[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*(?:product|gallery|main-image)[^"']*["']/i,
      /<img[^>]+data-src=["']([^"']+)["'][^>]*>/i,
      /<img[^>]+data-original=["']([^"']+)["'][^>]*>/i,
    ]);
    if (productImage) {
      return { status: "found", imageUrl: productImage, productUrl };
    }

    const srcsetMatch = html.match(
      /<img[^>]+srcset=["']([^"']+)["'][^>]*>/i
    );
    if (srcsetMatch?.[1]) {
      const candidates = srcsetMatch[1]
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter(Boolean);
      const imageUrl = makeAbsolute(candidates.at(-1));
      if (imageUrl) return { status: "found", imageUrl, productUrl };
    }

    console.log(`No product image found for ${productUrl}`);
    return { status: "no_image", productUrl };
  } catch (error) {
    console.error(`Image extraction failed for ${productUrl}`, error);
    return { status: "fetch_failed", productUrl };
  }
}
