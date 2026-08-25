import { randomUUID } from "node:crypto";
import { translations, type Language } from "../../../i18n/translations";
import { airtableRequest } from "../../../lib/airtable";
import { tryLockGifts, unlockGifts } from "../../../lib/giftMutationLock";

type BulkAction = "review" | "confirm";
type PublicGiftStatus = "Available" | "Reserved" | "Purchased";
type ReviewClassification =
  | "available"
  | "reserved_by_you"
  | "reserved_by_other"
  | "purchased"
  | "changed";

type BulkInput = {
  action: BulkAction;
  giftIds: string[];
  name: string;
  email: string;
  message: string;
  language: Language;
  reviewedClassifications: Map<
    string,
    Extract<ReviewClassification, "available" | "reserved_by_you">
  >;
};

type AirtableGift = {
  id: string;
  fields?: {
    "Gift Name"?: string;
    Status?: string;
    Active?: boolean;
  };
};

type AirtableReservation = {
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
  records?: AirtableReservation[];
  offset?: string;
};

type ReviewItem = {
  giftId: string;
  name: string;
  classification: ReviewClassification;
  eligible: boolean;
  status?: PublicGiftStatus;
};

type ConfirmItem = {
  giftId: string;
  name: string;
  outcome: "purchased" | "skipped";
  reason?: Exclude<ReviewClassification, "available" | "reserved_by_you"> | "error";
  status?: PublicGiftStatus;
};

const giftIdPattern = /^rec[a-zA-Z0-9]{14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BULK_GIFTS = 50;

function parseInput(value: unknown): BulkInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const action = input.action;
  const giftIds = Array.isArray(input.giftIds)
    ? Array.from(
        new Set(
          input.giftIds
            .filter((giftId): giftId is string => typeof giftId === "string")
            .map((giftId) => giftId.trim())
        )
      )
    : [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  const language: Language = input.language === "en" ? "en" : "es";
  const reviewedItems = Array.isArray(input.reviewedItems)
    ? input.reviewedItems
    : [];
  const reviewedClassifications = new Map<
    string,
    Extract<ReviewClassification, "available" | "reserved_by_you">
  >();

  reviewedItems.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const reviewedItem = item as Record<string, unknown>;
    const reviewedGiftId =
      typeof reviewedItem.giftId === "string" ? reviewedItem.giftId.trim() : "";
    const classification = reviewedItem.classification;

    if (
      giftIdPattern.test(reviewedGiftId) &&
      (classification === "available" || classification === "reserved_by_you")
    ) {
      reviewedClassifications.set(reviewedGiftId, classification);
    }
  });

  if (
    (action !== "review" && action !== "confirm") ||
    giftIds.length === 0 ||
    giftIds.length > MAX_BULK_GIFTS ||
    giftIds.some((giftId) => !giftIdPattern.test(giftId)) ||
    name.length < 2 ||
    name.length > 100 ||
    email.length > 254 ||
    !emailPattern.test(email) ||
    message.length > 1000 ||
    (action === "confirm" &&
      (reviewedClassifications.size !== giftIds.length ||
        giftIds.some((giftId) => !reviewedClassifications.has(giftId))))
  ) {
    return null;
  }

  return {
    action,
    giftIds,
    name,
    email,
    message,
    language,
    reviewedClassifications,
  };
}

function publicStatus(status?: string): PublicGiftStatus | undefined {
  if (
    status === "Available" ||
    status === "Reserved" ||
    status === "Purchased"
  ) {
    return status;
  }

  return undefined;
}

async function getGift(giftId: string): Promise<AirtableGift> {
  const response = await airtableRequest(
    `${encodeURIComponent("Gifts")}/${giftId}`
  );

  if (!response.ok) {
    throw new Error(`Could not read gift (${response.status})`);
  }

  return (await response.json()) as AirtableGift;
}

async function findActiveReservation(
  giftId: string
): Promise<AirtableReservation | null> {
  const records: AirtableReservation[] = [];
  let offset: string | undefined;

  do {
    const search = new URLSearchParams({
      pageSize: "100",
      filterByFormula: "{Reservation Status}='Reserved'",
    });

    if (offset) search.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}?${search.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Could not read reservations (${response.status})`);
    }

    const page = (await response.json()) as ReservationList;
    records.push(...(page.records ?? []));
    offset = page.offset;
  } while (offset);

  const exactMatches = records.filter(
    (record) =>
      record.fields?.["Gift Record ID"] === giftId &&
      record.fields?.["Reservation Status"] === "Reserved"
  );
  const linkedMatches = records.filter(
    (record) =>
      record.fields?.Gift?.includes(giftId) &&
      record.fields?.["Reservation Status"] === "Reserved"
  );
  const matches = exactMatches.length > 0 ? exactMatches : linkedMatches;

  return (
    matches.sort((a, b) =>
      (b.fields?.["Reserved Date"] ?? "").localeCompare(
        a.fields?.["Reserved Date"] ?? ""
      )
    )[0] ?? null
  );
}

async function classifyGift(giftId: string, email: string): Promise<ReviewItem> {
  const gift = await getGift(giftId);
  const name = gift.fields?.["Gift Name"] ?? "Gift";
  const status = publicStatus(gift.fields?.Status);

  if (gift.fields?.Active === false || !status) {
    return { giftId, name, classification: "changed", eligible: false, status };
  }

  if (status === "Available") {
    return { giftId, name, classification: "available", eligible: true, status };
  }

  if (status === "Purchased") {
    return { giftId, name, classification: "purchased", eligible: false, status };
  }

  const reservation = await findActiveReservation(giftId);
  const storedEmail = reservation?.fields?.Email?.trim().toLowerCase() ?? "";

  if (reservation && storedEmail && storedEmail === email) {
    return {
      giftId,
      name,
      classification: "reserved_by_you",
      eligible: true,
      status,
    };
  }

  return {
    giftId,
    name,
    classification: "reserved_by_other",
    eligible: false,
    status,
  };
}

async function purchaseAvailableGift(
  gift: AirtableGift,
  input: BulkInput
): Promise<ConfirmItem> {
  const giftId = gift.id;
  const name = gift.fields?.["Gift Name"] ?? "Gift";
  const fields: Record<string, unknown> = {
    "Gift Reservation": `${name} — ${input.name}`,
    Gift: [giftId],
    "Reserved By": input.name,
    Email: input.email,
    "Reservation ID": randomUUID(),
    "Reservation Status": "Purchased",
    "Purchased Date": new Date().toISOString(),
    "Gift Record ID": giftId,
  };

  if (input.message) fields.Message = input.message;

  const createResponse = await airtableRequest(
    encodeURIComponent("Gift Reservations"),
    { method: "POST", body: JSON.stringify({ fields }) }
  );

  if (!createResponse.ok) {
    throw new Error(`Could not create purchase (${createResponse.status})`);
  }

  const purchaseRecord = (await createResponse.json()) as { id: string };
  let latestGift: AirtableGift;

  try {
    latestGift = await getGift(giftId);
  } catch (error) {
    await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}/${purchaseRecord.id}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    throw error;
  }

  if (
    latestGift.fields?.Active === false ||
    latestGift.fields?.Status !== "Available"
  ) {
    await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}/${purchaseRecord.id}`,
      { method: "DELETE" }
    ).catch(() => undefined);

    const status = publicStatus(latestGift.fields?.Status);
    return {
      giftId,
      name,
      outcome: "skipped",
      reason: status === "Purchased" ? "purchased" : "changed",
      status,
    };
  }

  const updateGiftResponse = await airtableRequest(
    `${encodeURIComponent("Gifts")}/${giftId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: { Status: "Purchased" } }),
    }
  );

  if (!updateGiftResponse.ok) {
    await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}/${purchaseRecord.id}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    throw new Error(`Could not update gift (${updateGiftResponse.status})`);
  }

  return { giftId, name, outcome: "purchased", status: "Purchased" };
}

async function purchaseReservedGift(
  gift: AirtableGift,
  input: BulkInput
): Promise<ConfirmItem> {
  const giftId = gift.id;
  const name = gift.fields?.["Gift Name"] ?? "Gift";
  const reservation = await findActiveReservation(giftId);
  const storedEmail = reservation?.fields?.Email?.trim().toLowerCase() ?? "";

  if (!reservation || !storedEmail || storedEmail !== input.email) {
    return {
      giftId,
      name,
      outcome: "skipped",
      reason: "reserved_by_other",
      status: "Reserved",
    };
  }

  const latestGift = await getGift(giftId);

  if (
    latestGift.fields?.Active === false ||
    latestGift.fields?.Status !== "Reserved"
  ) {
    const status = publicStatus(latestGift.fields?.Status);
    return {
      giftId,
      name,
      outcome: "skipped",
      reason: status === "Purchased" ? "purchased" : "changed",
      status,
    };
  }

  const updateReservationResponse = await airtableRequest(
    `${encodeURIComponent("Gift Reservations")}/${reservation.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          "Reservation Status": "Purchased",
          "Purchased Date": new Date().toISOString(),
        },
      }),
    }
  );

  if (!updateReservationResponse.ok) {
    throw new Error(
      `Could not update reservation (${updateReservationResponse.status})`
    );
  }

  const updateGiftResponse = await airtableRequest(
    `${encodeURIComponent("Gifts")}/${giftId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: { Status: "Purchased" } }),
    }
  );

  if (!updateGiftResponse.ok) {
    const rollbackResponse = await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}/${reservation.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            "Reservation Status": "Reserved",
            "Purchased Date": null,
          },
        }),
      }
    ).catch(() => null);

    if (!rollbackResponse?.ok) {
      console.error("Could not roll back bulk reservation purchase", {
        giftId,
        reservationId: reservation.id,
      });
    }

    throw new Error(`Could not update gift (${updateGiftResponse.status})`);
  }

  return { giftId, name, outcome: "purchased", status: "Purchased" };
}

async function confirmGift(giftId: string, input: BulkInput): Promise<ConfirmItem> {
  const gift = await getGift(giftId);
  const name = gift.fields?.["Gift Name"] ?? "Gift";
  const status = publicStatus(gift.fields?.Status);

  if (gift.fields?.Active === false || !status) {
    return { giftId, name, outcome: "skipped", reason: "changed", status };
  }

  if (status === "Purchased") {
    return { giftId, name, outcome: "skipped", reason: "purchased", status };
  }

  const reviewedClassification = input.reviewedClassifications.get(giftId);

  if (reviewedClassification === "available") {
    if (status !== "Available") {
      return {
        giftId,
        name,
        outcome: "skipped",
        reason: "changed",
        status,
      };
    }

    return purchaseAvailableGift(gift, input);
  }

  if (reviewedClassification !== "reserved_by_you" || status !== "Reserved") {
    return { giftId, name, outcome: "skipped", reason: "changed", status };
  }

  return purchaseReservedGift(gift, input);
}

export async function POST(request: Request) {
  let input: BulkInput | null = null;
  let language: Language = "es";

  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object" && !Array.isArray(body) && "language" in body) {
      language = body.language === "en" ? "en" : "es";
    }

    input = parseInput(body);
  } catch {
    return Response.json(
      { error: translations[language].bulkPurchase.errors.invalidRequest },
      { status: 400 }
    );
  }

  const errors = translations[language].bulkPurchase.errors;

  if (!input) {
    return Response.json({ error: errors.invalidFields }, { status: 400 });
  }

  if (input.action === "review") {
    try {
      const items: ReviewItem[] = [];

      for (const giftId of input.giftIds) {
        try {
          items.push(await classifyGift(giftId, input.email));
        } catch (error) {
          console.error("Bulk purchase review item error:", { giftId, error });
          items.push({
            giftId,
            name: "Gift",
            classification: "changed",
            eligible: false,
          });
        }
      }

      return Response.json({
        items,
        eligibleCount: items.filter((item) => item.eligible).length,
      });
    } catch (error) {
      console.error("Bulk purchase review error:", error);
      return Response.json({ error: errors.temporary }, { status: 502 });
    }
  }

  if (!tryLockGifts(input.giftIds)) {
    return Response.json({ error: errors.inProgress }, { status: 409 });
  }

  try {
    const items: ConfirmItem[] = [];

    for (const giftId of input.giftIds) {
      try {
        items.push(await confirmGift(giftId, input));
      } catch (error) {
        console.error("Bulk purchase confirmation item error:", {
          giftId,
          error,
        });
        items.push({
          giftId,
          name: "Gift",
          outcome: "skipped",
          reason: "error",
        });
      }
    }

    const purchasedCount = items.filter(
      (item) => item.outcome === "purchased"
    ).length;

    return Response.json({
      items,
      purchasedCount,
      skippedCount: items.length - purchasedCount,
    });
  } finally {
    unlockGifts(input.giftIds);
  }
}
