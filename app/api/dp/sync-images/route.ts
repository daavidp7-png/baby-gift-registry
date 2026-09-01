import "server-only";

import { timingSafeEqual } from "node:crypto";
import { airtableRequest } from "../../../lib/airtable";
import { invalidateGiftCache } from "../../../lib/giftCache";
import {
  type ImageSyncFailureReason,
  type ImageSyncResult,
} from "../../../lib/imageSyncTypes";
import {
  discoverProductImage,
  parseProductUrl,
} from "../../../lib/productImageDiscovery";

const DISCOVERY_CONCURRENCY = 4;
const DISCOVERY_TIMEOUT_MS = 12_000;

type AirtableAttachment = { url?: string };

type AirtableGift = {
  id: string;
  fields: {
    "Gift Name"?: string;
    "Product URL"?: string;
    Image?: AirtableAttachment[];
  };
};

type AirtableGiftPage = {
  records?: AirtableGift[];
  offset?: string;
};

type DiscoveryCandidate = {
  gift: AirtableGift;
  imageUrl: string;
};

function passwordsMatch(submitted: string, expected: string) {
  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);

  return (
    submittedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(submittedBuffer, expectedBuffer)
  );
}

function giftName(gift: AirtableGift) {
  return gift.fields["Gift Name"]?.trim() || gift.id;
}

function recordFailure(
  result: ImageSyncResult,
  gift: AirtableGift,
  reason: ImageSyncFailureReason
) {
  result.failures.push({ giftName: giftName(gift), reason });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker)
  );

  return results;
}

async function readAllGifts() {
  const gifts: AirtableGift[] = [];
  let offset: string | undefined;

  do {
    const search = new URLSearchParams({ pageSize: "100" });
    search.append("fields[]", "Gift Name");
    search.append("fields[]", "Product URL");
    search.append("fields[]", "Image");
    if (offset) search.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent("Gifts")}?${search.toString()}`
    );
    const data = (await response.json()) as AirtableGiftPage;

    if (!response.ok) {
      console.error("Airtable image sync read failed", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Could not read Gifts (${response.status})`);
    }

    gifts.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return gifts;
}

async function stillHasNoImage(giftId: string) {
  const response = await airtableRequest(
    `${encodeURIComponent("Gifts")}/${encodeURIComponent(giftId)}`
  );
  const gift = (await response.json()) as AirtableGift;

  if (!response.ok) {
    console.error("Airtable image sync safety read failed", {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Could not re-read Gift (${response.status})`);
  }

  return !gift.fields.Image?.length;
}

async function attachImage(giftId: string, imageUrl: string) {
  const response = await airtableRequest(
    `${encodeURIComponent("Gifts")}/${encodeURIComponent(giftId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: { Image: [{ url: imageUrl }] } }),
    }
  );

  if (!response.ok) {
    console.error("Airtable image sync update failed", {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Could not update Gift image (${response.status})`);
  }
}

export async function POST(request: Request) {
  const expectedPassword = process.env.DP_ADMIN_PASSWORD;

  if (!expectedPassword) {
    console.error("DP_ADMIN_PASSWORD is not configured");
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  let password: unknown;

  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (
    typeof password !== "string" ||
    !passwordsMatch(password, expectedPassword)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result: ImageSyncResult = {
    checked: 0,
    alreadyHadImage: 0,
    imagesAdded: 0,
    invalidProductUrl: 0,
    fetchFailed: 0,
    noImageFound: 0,
    airtableUpdateFailed: 0,
    failures: [],
  };

  let gifts: AirtableGift[];

  try {
    gifts = await readAllGifts();
  } catch (error) {
    console.error("Image sync could not start:", error);
    return Response.json({ error: "sync_failed" }, { status: 502 });
  }

  result.checked = gifts.length;
  const giftsWithoutImages = gifts.filter((gift) => {
    if (gift.fields.Image?.length) {
      result.alreadyHadImage += 1;
      return false;
    }
    return true;
  });

  const discoveries = await mapWithConcurrency(
    giftsWithoutImages,
    DISCOVERY_CONCURRENCY,
    async (gift): Promise<DiscoveryCandidate | null> => {
      const discovery = await discoverProductImage(
        gift.fields["Product URL"],
        { timeoutMs: DISCOVERY_TIMEOUT_MS }
      );

      if (discovery.status === "invalid_url") {
        result.invalidProductUrl += 1;
        return null;
      }
      if (discovery.status === "fetch_failed") {
        result.fetchFailed += 1;
        recordFailure(result, gift, "fetch_failed");
        return null;
      }
      if (discovery.status === "no_image") {
        result.noImageFound += 1;
        recordFailure(result, gift, "no_image");
        return null;
      }

      const validatedImageUrl = parseProductUrl(discovery.imageUrl);
      if (!validatedImageUrl) {
        result.noImageFound += 1;
        recordFailure(result, gift, "no_image");
        return null;
      }

      return { gift, imageUrl: validatedImageUrl.href };
    }
  );

  for (const candidate of discoveries) {
    if (!candidate) continue;

    try {
      if (!(await stillHasNoImage(candidate.gift.id))) {
        result.alreadyHadImage += 1;
        continue;
      }

      await attachImage(candidate.gift.id, candidate.imageUrl);
      result.imagesAdded += 1;
    } catch (error) {
      console.error(
        `Image sync failed for Gift ${candidate.gift.id}:`,
        error
      );
      result.airtableUpdateFailed += 1;
      recordFailure(result, candidate.gift, "airtable_update_failed");
    }
  }

  invalidateGiftCache();
  return Response.json({ ok: true, result });
}
