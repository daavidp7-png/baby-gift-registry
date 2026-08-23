import { isIP } from "node:net";
import { type NextRequest } from "next/server";
import { hasValidImageSignature } from "../../lib/imageProxy";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function parsePublicUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const ipVersion = isIP(hostname);

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    ipVersion !== 0
  ) {
    throw new Error("Unsupported image URL");
  }

  return url;
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url") ?? "";
  const referer = request.nextUrl.searchParams.get("ref") ?? "";
  const signature = request.nextUrl.searchParams.get("sig") ?? "";

  if (!imageUrl || !signature || !hasValidImageSignature(imageUrl, referer, signature)) {
    return new Response("Invalid image request", { status: 403 });
  }

  try {
    const url = parsePublicUrl(imageUrl);
    const sourceUrl = referer ? parsePublicUrl(referer).href : "";
    const headers = new Headers({
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });

    if (sourceUrl) {
      headers.set("Referer", sourceUrl);
    }

    const upstream = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 86_400 },
    });

    if (!upstream.ok) {
      return new Response("Image unavailable", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();

    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      return new Response("Unsupported image type", { status: 415 });
    }

    const declaredSize = Number(upstream.headers.get("content-length") ?? 0);

    if (declaredSize > MAX_IMAGE_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    const image = await upstream.arrayBuffer();

    if (image.byteLength > MAX_IMAGE_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
