import { randomUUID } from "node:crypto";
import {
  normalizeLanguage,
  translations,
  type Language,
} from "../../../i18n/translations";
import { airtableRequest } from "../../../lib/airtable";
import { sendBulkReservationConfirmation } from "../../../lib/email";
import { invalidateGiftCache } from "../../../lib/giftCache";
import { tryLockGifts, unlockGifts } from "../../../lib/giftMutationLock";
import { getActiveReservationGiftsForEmail } from "../../../lib/reservationQueries";

type BulkAction = "review" | "confirm";
type GiftStatus = "Available" | "Reserved" | "Purchased";
type Classification =
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
  reviewedClassifications: Map<string, Classification>;
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
    "Reservation Status"?: string;
  };
};
type AirtableList<T> = { records?: T[]; offset?: string };
type ReviewItem = {
  giftId: string;
  name: string;
  classification: Classification;
  eligible: boolean;
  status?: GiftStatus;
};
type ResultItem = {
  giftId: string;
  name: string;
  outcome: "reserved" | "existing" | "skipped";
  reason?: Exclude<Classification, "available"> | "error";
  status?: GiftStatus;
};
type AirtableWriteRecord = { id: string };

const giftIdPattern = /^rec[a-zA-Z0-9]{14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BULK_GIFTS = 50;
const AIRTABLE_BATCH_SIZE = 10;

function chunks<T>(items: T[], size = AIRTABLE_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function parseInput(value: unknown): BulkInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const action = raw.action;
  const giftIds = Array.isArray(raw.giftIds)
    ? Array.from(
        new Set(
          raw.giftIds
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
        )
      )
    : [];
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email =
    typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const language = normalizeLanguage(raw.language);
  const reviewedClassifications = new Map<string, Classification>();

  if (Array.isArray(raw.reviewedItems)) {
    raw.reviewedItems.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      const reviewed = item as Record<string, unknown>;
      const giftId =
        typeof reviewed.giftId === "string" ? reviewed.giftId.trim() : "";
      const classification = reviewed.classification;
      if (
        giftIdPattern.test(giftId) &&
        (classification === "available" ||
          classification === "reserved_by_you" ||
          classification === "reserved_by_other" ||
          classification === "purchased" ||
          classification === "changed")
      ) {
        reviewedClassifications.set(giftId, classification);
      }
    });
  }

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

function publicStatus(status?: string): GiftStatus | undefined {
  return status === "Available" ||
    status === "Reserved" ||
    status === "Purchased"
    ? status
    : undefined;
}

function recordIdFormula(ids: string[]) {
  const matches = ids.map((id) => `RECORD_ID()='${id}'`);
  return matches.length === 1 ? matches[0] : `OR(${matches.join(",")})`;
}

function blockingReservationFormula(ids: string[]) {
  const matches = ids.map((id) => `{Gift Record ID}='${id}'`);
  return `AND(OR({Reservation Status}='Reserved',{Reservation Status}='Purchased'),${
    matches.length === 1 ? matches[0] : `OR(${matches.join(",")})`
  })`;
}

async function getGiftsByIds(giftIds: string[]) {
  const gifts = new Map<string, AirtableGift>();
  for (const ids of chunks(giftIds)) {
    const search = new URLSearchParams({
      pageSize: "100",
      filterByFormula: recordIdFormula(ids),
    });
    const response = await airtableRequest(
      `${encodeURIComponent("Gifts")}?${search.toString()}`
    );
    if (!response.ok) {
      throw new Error(`Could not read gifts (${response.status})`);
    }
    const page = (await response.json()) as AirtableList<AirtableGift>;
    (page.records ?? []).forEach((gift) => gifts.set(gift.id, gift));
  }
  return gifts;
}

async function getBlockingReservations(giftIds: string[]) {
  const reservations = new Map<string, AirtableReservation>();
  for (const ids of chunks(giftIds)) {
    let offset: string | undefined;
    do {
      const search = new URLSearchParams({
        pageSize: "100",
        filterByFormula: blockingReservationFormula(ids),
      });
      search.append("fields[]", "Gift");
      search.append("fields[]", "Email");
      search.append("fields[]", "Reservation Status");
      if (offset) search.set("offset", offset);
      const response = await airtableRequest(
        `${encodeURIComponent("Gift Reservations")}?${search.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Could not read reservations (${response.status})`);
      }
      const page = (await response.json()) as AirtableList<AirtableReservation>;
      for (const reservation of page.records ?? []) {
        reservation.fields?.Gift?.forEach((giftId) => {
          if (!giftIdPattern.test(giftId)) return;

          const current = reservations.get(giftId);
          if (
            !current ||
            (reservation.fields?.["Reservation Status"] === "Reserved" &&
              current.fields?.["Reservation Status"] !== "Reserved")
          ) {
            reservations.set(giftId, reservation);
          }
        });
      }
      offset = page.offset;
    } while (offset);
  }
  return reservations;
}

function classifyGift(
  gift: AirtableGift | undefined,
  reservations: Map<string, AirtableReservation>,
  email: string
): Classification {
  const status = publicStatus(gift?.fields?.Status);
  if (!gift || gift.fields?.Active === false || !status) return "changed";
  if (status === "Purchased") return "purchased";
  if (status === "Reserved") {
    const reservation = reservations.get(gift.id);
    const reservationEmail = reservation?.fields?.Email?.trim().toLowerCase();
    return reservation?.fields?.["Reservation Status"] === "Reserved" &&
      reservationEmail === email
      ? "reserved_by_you"
      : "reserved_by_other";
  }
  return reservations.has(gift.id) ? "changed" : "available";
}

async function reviewGifts(input: BulkInput): Promise<ReviewItem[]> {
  const [gifts, reservations] = await Promise.all([
    getGiftsByIds(input.giftIds),
    getBlockingReservations(input.giftIds),
  ]);
  return input.giftIds.map((giftId) => {
    const gift = gifts.get(giftId);
    const classification = classifyGift(gift, reservations, input.email);
    return {
      giftId,
      name:
        gift?.fields?.["Gift Name"] ??
        translations[input.language].gifts.fallbackName,
      classification,
      eligible: classification === "available",
      status: publicStatus(gift?.fields?.Status),
    };
  });
}

async function batchCreateReservations(fields: Record<string, unknown>[]) {
  const response = await airtableRequest(
    encodeURIComponent("Gift Reservations"),
    {
      method: "POST",
      body: JSON.stringify({
        records: fields.map((reservationFields) => ({
          fields: reservationFields,
        })),
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Could not create reservations (${response.status})`);
  }
  return ((await response.json()) as AirtableList<AirtableWriteRecord>)
    .records ?? [];
}

async function batchUpdateGifts(gifts: AirtableGift[]) {
  const response = await airtableRequest(encodeURIComponent("Gifts"), {
    method: "PATCH",
    body: JSON.stringify({
      records: gifts.map((gift) => ({
        id: gift.id,
        fields: { Status: "Reserved" },
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not update gifts (${response.status})`);
  }
}

async function batchDeleteReservations(ids: string[]) {
  if (ids.length === 0) return;
  const search = new URLSearchParams();
  ids.forEach((id) => search.append("records[]", id));
  const response = await airtableRequest(
    `${encodeURIComponent("Gift Reservations")}?${search.toString()}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(`Could not roll back reservations (${response.status})`);
  }
}

function skipped(
  gift: AirtableGift | undefined,
  giftId: string,
  reason: ResultItem["reason"],
  language: Language
): ResultItem {
  return {
    giftId,
    name:
      gift?.fields?.["Gift Name"] ?? translations[language].gifts.fallbackName,
    outcome: "skipped",
    reason,
    status: publicStatus(gift?.fields?.Status),
  };
}

async function reserveAvailableChunks(gifts: AirtableGift[], input: BulkInput) {
  const results: ResultItem[] = [];
  for (const group of chunks(gifts)) {
    let created: AirtableWriteRecord[] = [];
    try {
      const reservedDate = new Date().toISOString();
      created = await batchCreateReservations(
        group.map((gift) => {
          const fields: Record<string, unknown> = {
            "Gift Reservation": `${gift.fields?.["Gift Name"] ?? translations[input.language].gifts.fallbackName} — ${input.name}`,
            Gift: [gift.id],
            "Reserved By": input.name,
            Email: input.email,
            "Reservation ID": randomUUID(),
            "Reservation Status": "Reserved",
            "Reserved Date": reservedDate,
          };
          if (input.message) fields.Message = input.message;
          return fields;
        })
      );
      if (created.length !== group.length) {
        throw new Error("Airtable returned an incomplete reservation batch");
      }
      await batchUpdateGifts(group);
      results.push(
        ...group.map((gift) => ({
          giftId: gift.id,
          name:
            gift.fields?.["Gift Name"] ??
            translations[input.language].gifts.fallbackName,
          outcome: "reserved" as const,
          status: "Reserved" as const,
        }))
      );
    } catch (error) {
      if (created.length > 0) {
        const giftsAfterFailure = await getGiftsByIds(
          group.map((gift) => gift.id)
        ).catch(() => null);
        const rollbackIds = giftsAfterFailure
          ? created
              .filter(
                (_, index) =>
                  giftsAfterFailure.get(group[index].id)?.fields?.Status !==
                  "Reserved"
              )
              .map((reservation) => reservation.id)
          : [];
        await batchDeleteReservations(rollbackIds).catch((rollbackError) =>
          console.error(
            "Could not roll back bulk reservations",
            rollbackError
          )
        );
      }
      console.error("Bulk reservation chunk error:", error);
      results.push(
        ...group.map((gift) =>
          skipped(gift, gift.id, "error", input.language)
        )
      );
    }
  }
  return results;
}

async function confirmReservations(input: BulkInput): Promise<ResultItem[]> {
  const results: ResultItem[] = [];
  for (const giftIdChunk of chunks(input.giftIds)) {
    try {
      const [gifts, reservations] = await Promise.all([
        getGiftsByIds(giftIdChunk),
        getBlockingReservations(giftIdChunk),
      ]);
      const available: AirtableGift[] = [];

      for (const giftId of giftIdChunk) {
        const gift = gifts.get(giftId);
        const classification = classifyGift(
          gift,
          reservations,
          input.email
        );
        if (
          input.reviewedClassifications.get(giftId) === "available" &&
          classification === "available" &&
          gift
        ) {
          available.push(gift);
        } else if (classification === "reserved_by_you") {
          results.push({
            giftId,
            name:
              gift?.fields?.["Gift Name"] ??
              translations[input.language].gifts.fallbackName,
            outcome: "existing",
            reason: "reserved_by_you",
            status: "Reserved",
          });
        } else {
          results.push(
            skipped(
              gift,
              giftId,
              classification === "available" ? "changed" : classification,
              input.language
            )
          );
        }
      }

      results.push(...(await reserveAvailableChunks(available, input)));
    } catch (error) {
      console.error("Bulk reservation confirmation chunk error:", {
        giftIds: giftIdChunk,
        error,
      });
      results.push(
        ...giftIdChunk.map((giftId) =>
          skipped(undefined, giftId, "error", input.language)
        )
      );
    }
  }
  return results;
}

export async function POST(request: Request) {
  let input: BulkInput | null = null;
  let language: Language = "es";
  try {
    const body: unknown = await request.json();
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "language" in body
    ) {
      language = normalizeLanguage(body.language);
    }
    input = parseInput(body);
  } catch {
    return Response.json(
      { error: translations[language].bulkReservation.errors.invalidRequest },
      { status: 400 }
    );
  }

  const errors = translations[language].bulkReservation.errors;
  if (!input) {
    return Response.json({ error: errors.invalidFields }, { status: 400 });
  }

  if (input.action === "review") {
    try {
      const [items, existingReservations] = await Promise.all([
        reviewGifts(input),
        getActiveReservationGiftsForEmail(
          input.email,
          translations[input.language].gifts.fallbackName,
          input.giftIds
        ),
      ]);
      return Response.json({
        items,
        eligibleCount: items.filter((item) => item.eligible).length,
        existingReservations,
      });
    } catch (error) {
      console.error("Bulk reservation review error:", error);
      return Response.json({ error: errors.temporary }, { status: 502 });
    }
  }

  if (!tryLockGifts(input.giftIds)) {
    return Response.json({ error: errors.inProgress }, { status: 409 });
  }

  try {
    const items = await confirmReservations(input);
    const reservedItems = items.filter((item) => item.outcome === "reserved");
    const reservedCount = reservedItems.length;
    if (reservedCount > 0) {
      invalidateGiftCache();
      await sendBulkReservationConfirmation({
        to: input.email,
        giftNames: reservedItems.map((item) => item.name),
        language: input.language,
        idempotencyKey: randomUUID(),
      });
    }
    return Response.json({
      items,
      reservedCount,
      skippedCount: items.filter((item) => item.outcome === "skipped").length,
    });
  } catch (error) {
    console.error("Bulk reservation confirmation error:", error);
    return Response.json({ error: errors.temporary }, { status: 502 });
  } finally {
    unlockGifts(input.giftIds);
  }
}
