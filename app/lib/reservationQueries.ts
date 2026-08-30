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
};

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
