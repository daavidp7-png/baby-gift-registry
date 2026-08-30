import "server-only";

const giftsInProgress = new Set<string>();

// Best-effort protection for overlapping requests handled by this process.
// Separate Vercel serverless instances do not share this in-memory set, so every
// mutation must still perform its own final uncached Airtable validation.

export function tryLockGifts(giftIds: string[]): boolean {
  if (giftIds.some((giftId) => giftsInProgress.has(giftId))) return false;

  giftIds.forEach((giftId) => giftsInProgress.add(giftId));
  return true;
}

export function unlockGifts(giftIds: string[]) {
  giftIds.forEach((giftId) => giftsInProgress.delete(giftId));
}
