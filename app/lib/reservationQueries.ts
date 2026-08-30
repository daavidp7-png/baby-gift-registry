import "server-only";

import { airtableRequest } from "./airtable";

export type AirtableReservationRecord = {
  id: string;
  fields?: {
    Gift?: string[];
    Email?: string;
    "Gift Record ID"?: string;
    "Reservation Status"?: string;
    "Reserved Date"?: string;
  };
};

type ReservationList = {
  records?: AirtableReservationRecord[];
  offset?: string;
};

type AirtableGiftRecord = {
  id: string;
  fields?: {
    "Gift Name"?: string;
  };
};

type GiftList = {
  records?: AirtableGiftRecord[];
};

export type ExistingReservationGift = {
  giftId: string;
  giftName: string;
};

const giftIdPattern = /^rec[a-zA-Z0-9]{14}$/;
const AIRTABLE_QUERY_BATCH_SIZE = 10;

function escapeAirtableString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findReservationForGift(
  giftId: string,
  statuses: Array<"Reserved" | "Purchased">
) {
  const statusMatches = statuses.map(
    (status) => `{Reservation Status}='${status}'`
  );
  const statusFormula =
    statusMatches.length === 1
      ? statusMatches[0]
      : `OR(${statusMatches.join(",")})`;
  const search = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `AND(${statusFormula},{Gift Record ID}='${giftId}')`,
    "sort[0][field]": "Reserved Date",
    "sort[0][direction]": "desc",
  });
  const response = await airtableRequest(
    `${encodeURIComponent("Gift Reservations")}?${search.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Could not read reservations (${response.status})`);
  }

  const page = (await response.json()) as ReservationList;
  return page.records?.[0] ?? null;
}

export function findActiveReservationForGift(giftId: string) {
  return findReservationForGift(giftId, ["Reserved"]);
}

export function findBlockingReservationForGift(giftId: string) {
  return findReservationForGift(giftId, ["Reserved", "Purchased"]);
}

async function getActiveReservationGiftIdsForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const giftIds = new Set<string>();
  let offset: string | undefined;

  do {
    const search = new URLSearchParams({
      pageSize: "100",
      filterByFormula: `AND({Reservation Status}='Reserved',LOWER(TRIM({Email}))='${escapeAirtableString(normalizedEmail)}')`,
    });
    search.append("fields[]", "Gift");
    if (offset) search.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}?${search.toString()}`
    );
    if (!response.ok) {
      throw new Error(`Could not read reservations (${response.status})`);
    }

    const page = (await response.json()) as ReservationList;
    for (const reservation of page.records ?? []) {
      for (const giftId of reservation.fields?.Gift ?? []) {
        if (giftIdPattern.test(giftId)) giftIds.add(giftId);
      }
    }
    offset = page.offset;
  } while (offset);

  return giftIds;
}

export async function getActiveReservationGiftsForEmail(
  email: string,
  fallbackGiftName: string,
  excludedGiftIds: Iterable<string> = []
): Promise<ExistingReservationGift[]> {
  const activeGiftIds = await getActiveReservationGiftIdsForEmail(email);
  const excluded = new Set(excludedGiftIds);
  const giftIds = [...activeGiftIds].filter((giftId) => !excluded.has(giftId));
  const gifts = new Map<string, AirtableGiftRecord>();

  for (
    let index = 0;
    index < giftIds.length;
    index += AIRTABLE_QUERY_BATCH_SIZE
  ) {
    const ids = giftIds.slice(index, index + AIRTABLE_QUERY_BATCH_SIZE);
    const matches = ids.map((giftId) => `RECORD_ID()='${giftId}'`);
    const search = new URLSearchParams({
      pageSize: "100",
      filterByFormula:
        matches.length === 1 ? matches[0] : `OR(${matches.join(",")})`,
    });
    search.append("fields[]", "Gift Name");

    const response = await airtableRequest(
      `${encodeURIComponent("Gifts")}?${search.toString()}`
    );
    if (!response.ok) {
      throw new Error(`Could not read gifts (${response.status})`);
    }

    const page = (await response.json()) as GiftList;
    for (const gift of page.records ?? []) gifts.set(gift.id, gift);
  }

  return giftIds.flatMap((giftId) => {
    const gift = gifts.get(giftId);
    if (!gift) return [];
    return [
      {
        giftId,
        giftName: gift.fields?.["Gift Name"] ?? fallbackGiftName,
      },
    ];
  });
}
