import { randomUUID } from "node:crypto";
import { translations, type Language } from "../../../i18n/translations";
import { airtableRequest } from "../../../lib/airtable";
import { invalidateGiftCache } from "../../../lib/giftCache";
import { tryLockGifts, unlockGifts } from "../../../lib/giftMutationLock";

type BulkAction = "review" | "confirm";
type PublicGiftStatus = "Available" | "Reserved" | "Purchased";
type ReviewClassification = "available" | "reserved_by_you" | "reserved_by_other" | "purchased" | "changed";
type EligibleClassification = Extract<ReviewClassification, "available" | "reserved_by_you">;
type BulkInput = {
  action: BulkAction; giftIds: string[]; name: string; email: string;
  message: string; language: Language;
  reviewedClassifications: Map<string, EligibleClassification>;
};
type AirtableGift = { id: string; fields?: { "Gift Name"?: string; Price?: number; Status?: string; Active?: boolean } };
type AirtableReservation = { id: string; fields?: { Gift?: string[]; Email?: string; "Gift Record ID"?: string; "Reservation Status"?: string; "Reserved Date"?: string } };
type AirtableList<T> = { records?: T[]; offset?: string };
type ReviewItem = { giftId: string; name: string; price: number; classification: ReviewClassification; eligible: boolean; status?: PublicGiftStatus };
type ConfirmItem = { giftId: string; name: string; outcome: "purchased" | "skipped"; reason?: Exclude<ReviewClassification, EligibleClassification> | "error"; status?: PublicGiftStatus };
type AirtableWriteRecord = { id: string; fields?: Record<string, unknown> };

const giftIdPattern = /^rec[a-zA-Z0-9]{14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BULK_GIFTS = 50;
const AIRTABLE_BATCH_SIZE = 10;

function chunks<T>(items: T[], size = AIRTABLE_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function giftPrice(gift: AirtableGift) {
  const price = gift.fields?.Price;
  return typeof price === "number" && Number.isFinite(price) ? price : 0;
}

function parseInput(value: unknown): BulkInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const action = raw.action;
  const giftIds = Array.isArray(raw.giftIds)
    ? Array.from(new Set(raw.giftIds.filter((id): id is string => typeof id === "string").map((id) => id.trim())))
    : [];
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const language: Language = raw.language === "en" ? "en" : "es";
  const reviewedClassifications = new Map<string, EligibleClassification>();

  if (Array.isArray(raw.reviewedItems)) {
    raw.reviewedItems.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      const reviewed = item as Record<string, unknown>;
      const id = typeof reviewed.giftId === "string" ? reviewed.giftId.trim() : "";
      const classification = reviewed.classification;
      if (giftIdPattern.test(id) && (classification === "available" || classification === "reserved_by_you")) {
        reviewedClassifications.set(id, classification);
      }
    });
  }

  if ((action !== "review" && action !== "confirm") || giftIds.length === 0 || giftIds.length > MAX_BULK_GIFTS ||
      giftIds.some((id) => !giftIdPattern.test(id)) || name.length < 2 || name.length > 100 ||
      email.length > 254 || !emailPattern.test(email) || message.length > 1000 ||
      (action === "confirm" && (reviewedClassifications.size !== giftIds.length || giftIds.some((id) => !reviewedClassifications.has(id))))) return null;

  return { action, giftIds, name, email, message, language, reviewedClassifications };
}

function publicStatus(status?: string): PublicGiftStatus | undefined {
  return status === "Available" || status === "Reserved" || status === "Purchased" ? status : undefined;
}

function recordIdFormula(ids: string[]) {
  const matches = ids.map((id) => `RECORD_ID()='${id}'`);
  return matches.length === 1 ? matches[0] : `OR(${matches.join(",")})`;
}

function reservationFormula(ids: string[]) {
  const matches = ids.map((id) => `{Gift Record ID}='${id}'`);
  return `AND({Reservation Status}='Reserved',${matches.length === 1 ? matches[0] : `OR(${matches.join(",")})`})`;
}

function relevantReservationFormula(
  entries: Array<{ giftId: string; includePurchased: boolean }>
) {
  const matches = entries.map(({ giftId, includePurchased }) => {
    const status = includePurchased
      ? "OR({Reservation Status}='Reserved',{Reservation Status}='Purchased')"
      : "{Reservation Status}='Reserved'";
    return `AND(${status},{Gift Record ID}='${giftId}')`;
  });
  return matches.length === 1 ? matches[0] : `OR(${matches.join(",")})`;
}

async function getGiftsByIds(giftIds: string[]) {
  const gifts = new Map<string, AirtableGift>();
  for (const ids of chunks(giftIds)) {
    const search = new URLSearchParams({ pageSize: "100", filterByFormula: recordIdFormula(ids) });
    const response = await airtableRequest(`${encodeURIComponent("Gifts")}?${search.toString()}`);
    if (!response.ok) throw new Error(`Could not read gifts (${response.status})`);
    const page = (await response.json()) as AirtableList<AirtableGift>;
    (page.records ?? []).forEach((gift) => gifts.set(gift.id, gift));
  }
  return gifts;
}

async function getActiveReservationsForGiftIds(giftIds: string[]) {
  const reservations = new Map<string, AirtableReservation>();
  for (const ids of chunks(giftIds)) {
    let offset: string | undefined;
    do {
      const search = new URLSearchParams({
        pageSize: "100", filterByFormula: reservationFormula(ids),
        "sort[0][field]": "Reserved Date", "sort[0][direction]": "desc",
      });
      if (offset) search.set("offset", offset);
      const response = await airtableRequest(`${encodeURIComponent("Gift Reservations")}?${search.toString()}`);
      if (!response.ok) throw new Error(`Could not read reservations (${response.status})`);
      const page = (await response.json()) as AirtableList<AirtableReservation>;
      for (const reservation of page.records ?? []) {
        const giftId = reservation.fields?.["Gift Record ID"];
        if (giftId && !reservations.has(giftId)) reservations.set(giftId, reservation);
      }
      offset = page.offset;
    } while (offset);
  }
  return reservations;
}

async function getRelevantReservationsForConfirmation(
  availableIds: string[],
  reservedIds: string[]
) {
  const reservations = new Map<string, AirtableReservation>();
  const entries = [
    ...availableIds.map((giftId) => ({ giftId, includePurchased: true })),
    ...reservedIds.map((giftId) => ({ giftId, includePurchased: false })),
  ];

  for (const group of chunks(entries)) {
    let offset: string | undefined;
    do {
      const search = new URLSearchParams({
        pageSize: "100",
        filterByFormula: relevantReservationFormula(group),
        "sort[0][field]": "Reserved Date",
        "sort[0][direction]": "desc",
      });
      if (offset) search.set("offset", offset);
      const response = await airtableRequest(
        `${encodeURIComponent("Gift Reservations")}?${search.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Could not read reservations (${response.status})`);
      }
      const page = (await response.json()) as AirtableList<AirtableReservation>;
      for (const reservation of page.records ?? []) {
        const giftId = reservation.fields?.["Gift Record ID"];
        if (giftId && !reservations.has(giftId)) {
          reservations.set(giftId, reservation);
        }
      }
      offset = page.offset;
    } while (offset);
  }

  return reservations;
}

async function reviewGifts(input: BulkInput): Promise<ReviewItem[]> {
  const gifts = await getGiftsByIds(input.giftIds);
  const reservedIds = input.giftIds.filter((id) => gifts.get(id)?.fields?.Status === "Reserved");
  const reservations = await getActiveReservationsForGiftIds(reservedIds);
  return input.giftIds.map((giftId) => {
    const gift = gifts.get(giftId);
    if (!gift) return { giftId, name: "Gift", price: 0, classification: "changed", eligible: false };
    const name = gift.fields?.["Gift Name"] ?? "Gift";
    const price = giftPrice(gift);
    const status = publicStatus(gift.fields?.Status);
    if (gift.fields?.Active === false || !status) return { giftId, name, price, classification: "changed", eligible: false, status };
    if (status === "Available") return { giftId, name, price, classification: "available", eligible: true, status };
    if (status === "Purchased") return { giftId, name, price, classification: "purchased", eligible: false, status };
    const reservation = reservations.get(giftId);
    const storedEmail = reservation?.fields?.Email?.trim().toLowerCase() ?? "";
    const owned = Boolean(reservation && storedEmail && storedEmail === input.email);
    return { giftId, name, price, classification: owned ? "reserved_by_you" : "reserved_by_other", eligible: owned, status };
  });
}

async function batchCreateReservations(fields: Record<string, unknown>[]) {
  const response = await airtableRequest(encodeURIComponent("Gift Reservations"), {
    method: "POST", body: JSON.stringify({ records: fields.map((item) => ({ fields: item })) }),
  });
  if (!response.ok) throw new Error(`Could not create purchases (${response.status})`);
  return ((await response.json()) as AirtableList<AirtableWriteRecord>).records ?? [];
}

async function batchUpdate(table: "Gifts" | "Gift Reservations", records: Array<{ id: string; fields: Record<string, unknown> }>) {
  const response = await airtableRequest(encodeURIComponent(table), { method: "PATCH", body: JSON.stringify({ records }) });
  if (!response.ok) throw new Error(`Could not update ${table} (${response.status})`);
}

async function batchDeleteReservations(ids: string[]) {
  if (ids.length === 0) return;
  const search = new URLSearchParams();
  ids.forEach((id) => search.append("records[]", id));
  const response = await airtableRequest(`${encodeURIComponent("Gift Reservations")}?${search.toString()}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not roll back purchases (${response.status})`);
}

function skipped(gift: AirtableGift | undefined, giftId: string, reason: ConfirmItem["reason"]): ConfirmItem {
  return { giftId, name: gift?.fields?.["Gift Name"] ?? "Gift", outcome: "skipped", reason, status: publicStatus(gift?.fields?.Status) };
}

async function purchaseAvailableChunks(gifts: AirtableGift[], input: BulkInput) {
  const results: ConfirmItem[] = [];
  for (const group of chunks(gifts)) {
    let created: AirtableWriteRecord[] = [];
    try {
      created = await batchCreateReservations(group.map((gift) => {
        const fields: Record<string, unknown> = {
          "Gift Reservation": `${gift.fields?.["Gift Name"] ?? "Gift"} — ${input.name}`,
          Gift: [gift.id], "Reserved By": input.name, Email: input.email,
          "Reservation ID": randomUUID(), "Reservation Status": "Purchased",
          "Purchased Date": new Date().toISOString(),
        };
        if (input.message) fields.Message = input.message;
        return fields;
      }));
      if (created.length !== group.length) throw new Error("Airtable returned an incomplete create batch");
      await batchUpdate("Gifts", group.map((gift) => ({ id: gift.id, fields: { Status: "Purchased" } })));
      results.push(...group.map((gift) => ({ giftId: gift.id, name: gift.fields?.["Gift Name"] ?? "Gift", outcome: "purchased" as const, status: "Purchased" as const })));
    } catch (error) {
      if (created.length) {
        const giftsAfterFailure = await getGiftsByIds(
          group.map((gift) => gift.id)
        ).catch(() => null);
        const rollbackIds = giftsAfterFailure
          ? created
              .filter(
                (_, index) =>
                  giftsAfterFailure.get(group[index].id)?.fields?.Status !==
                  "Purchased"
              )
              .map((item) => item.id)
          : [];
        await batchDeleteReservations(rollbackIds).catch((rollbackError) =>
          console.error("Could not roll back bulk creates", rollbackError)
        );
      }
      console.error("Bulk available purchase chunk error:", error);
      results.push(...group.map((gift) => skipped(gift, gift.id, "error")));
    }
  }
  return results;
}

async function purchaseReservedChunks(entries: Array<{ gift: AirtableGift; reservation: AirtableReservation }>) {
  const results: ConfirmItem[] = [];
  for (const group of chunks(entries)) {
    try {
      await batchUpdate("Gift Reservations", group.map(({ reservation }) => ({ id: reservation.id, fields: { "Reservation Status": "Purchased", "Purchased Date": new Date().toISOString() } })));
      try {
        await batchUpdate("Gifts", group.map(({ gift }) => ({ id: gift.id, fields: { Status: "Purchased" } })));
      } catch (error) {
        const giftsAfterFailure = await getGiftsByIds(
          group.map(({ gift }) => gift.id)
        ).catch(() => null);
        const rollbackRecords = giftsAfterFailure
          ? group
              .filter(
                ({ gift }) =>
                  giftsAfterFailure.get(gift.id)?.fields?.Status === "Reserved"
              )
              .map(({ reservation }) => ({
                id: reservation.id,
                fields: {
                  "Reservation Status": "Reserved",
                  "Purchased Date": null,
                },
              }))
          : [];
        if (rollbackRecords.length > 0) {
          await batchUpdate("Gift Reservations", rollbackRecords).catch(
            (rollbackError) =>
              console.error(
                "Could not roll back bulk reservation batch",
                rollbackError
              )
          );
        }
        throw error;
      }
      results.push(...group.map(({ gift }) => ({ giftId: gift.id, name: gift.fields?.["Gift Name"] ?? "Gift", outcome: "purchased" as const, status: "Purchased" as const })));
    } catch (error) {
      console.error("Bulk reserved purchase chunk error:", error);
      results.push(...group.map(({ gift }) => skipped(gift, gift.id, "error")));
    }
  }
  return results;
}

async function confirmGifts(input: BulkInput): Promise<ConfirmItem[]> {
  const results: ConfirmItem[] = [];

  for (const giftIdChunk of chunks(input.giftIds)) {
    try {
    const availableIds = giftIdChunk.filter(
      (id) => input.reviewedClassifications.get(id) === "available"
    );
    const reservedIds = giftIdChunk.filter(
      (id) => input.reviewedClassifications.get(id) === "reserved_by_you"
    );
    const reservations = await getRelevantReservationsForConfirmation(
      availableIds,
      reservedIds
    );
    // Final uncached status read for this exact write batch.
    const gifts = await getGiftsByIds(giftIdChunk);
    const available: AirtableGift[] = [];
    const reserved: Array<{
      gift: AirtableGift;
      reservation: AirtableReservation;
    }> = [];
    const skippedItems: ConfirmItem[] = [];

    for (const giftId of giftIdChunk) {
      const gift = gifts.get(giftId);
      const status = publicStatus(gift?.fields?.Status);
      const reviewed = input.reviewedClassifications.get(giftId);

      if (!gift || gift.fields?.Active === false || !status) {
        skippedItems.push(skipped(gift, giftId, "changed"));
      } else if (status === "Purchased") {
        skippedItems.push(skipped(gift, giftId, "purchased"));
      } else if (
        reviewed === "available" &&
        status === "Available" &&
        !reservations.has(giftId)
      ) {
        available.push(gift);
      } else if (reviewed === "reserved_by_you" && status === "Reserved") {
        const reservation = reservations.get(giftId);
        const storedEmail =
          reservation?.fields?.Email?.trim().toLowerCase() ?? "";
        if (
          reservation?.fields?.["Reservation Status"] === "Reserved" &&
          storedEmail &&
          storedEmail === input.email
        ) {
          reserved.push({ gift, reservation });
        } else {
          skippedItems.push(skipped(gift, giftId, "reserved_by_other"));
        }
      } else {
        skippedItems.push(skipped(gift, giftId, "changed"));
      }
    }

    const [availableResults, reservedResults] = await Promise.all([
      purchaseAvailableChunks(available, input),
      purchaseReservedChunks(reserved),
    ]);
    results.push(...skippedItems, ...availableResults, ...reservedResults);
    } catch (error) {
      console.error("Bulk purchase confirmation chunk error:", {
        giftIds: giftIdChunk,
        error,
      });
      results.push(
        ...giftIdChunk.map((giftId) => skipped(undefined, giftId, "error"))
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
    if (body && typeof body === "object" && !Array.isArray(body) && "language" in body) language = body.language === "en" ? "en" : "es";
    input = parseInput(body);
  } catch {
    return Response.json({ error: translations[language].bulkPurchase.errors.invalidRequest }, { status: 400 });
  }
  const errors = translations[language].bulkPurchase.errors;
  if (!input) return Response.json({ error: errors.invalidFields }, { status: 400 });

  if (input.action === "review") {
    try {
      const items = await reviewGifts(input);
      const eligible = items.filter((item) => item.eligible);
      return Response.json({ items, eligibleCount: eligible.length, selectedTotal: items.reduce((sum, item) => sum + item.price, 0), eligibleTotal: eligible.reduce((sum, item) => sum + item.price, 0) });
    } catch (error) {
      console.error("Bulk purchase review error:", error);
      return Response.json({ error: errors.temporary }, { status: 502 });
    }
  }

  if (!tryLockGifts(input.giftIds)) return Response.json({ error: errors.inProgress }, { status: 409 });
  try {
    const items = await confirmGifts(input);
    const purchasedCount = items.filter((item) => item.outcome === "purchased").length;
    if (purchasedCount > 0) invalidateGiftCache();
    return Response.json({ items, purchasedCount, skippedCount: items.length - purchasedCount });
  } catch (error) {
    console.error("Bulk purchase confirmation error:", error);
    return Response.json({ error: errors.temporary }, { status: 502 });
  } finally {
    unlockGifts(input.giftIds);
  }
}
