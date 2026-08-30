import "server-only";

import { revalidateTag } from "next/cache";

export const GIFTS_CACHE_TAG = "gifts";
export const GIFTS_CACHE_SECONDS = 3600;

export function invalidateGiftCache() {
  revalidateTag(GIFTS_CACHE_TAG, { expire: 0 });
}
