import "server-only";

const giftsInProgress = new Set<string>();

export function tryLockGifts(giftIds: string[]): boolean {
  if (giftIds.some((giftId) => giftsInProgress.has(giftId))) return false;

  giftIds.forEach((giftId) => giftsInProgress.add(giftId));
  return true;
}

export function unlockGifts(giftIds: string[]) {
  giftIds.forEach((giftId) => giftsInProgress.delete(giftId));
}
