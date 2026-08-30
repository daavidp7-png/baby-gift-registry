import { randomUUID } from "node:crypto";
import { translations, type Language } from "../../i18n/translations";
import { airtableRequest } from "../../lib/airtable";
import { sendReservationConfirmation } from "../../lib/email";
import { invalidateGiftCache } from "../../lib/giftCache";
import { tryLockGifts, unlockGifts } from "../../lib/giftMutationLock";
import {
  findActiveReservationForGift,
  findBlockingReservationForGift,
  getActiveReservationGiftsForEmail,
} from "../../lib/reservationQueries";

type ReservationAction = "review" | "confirm";
type ReservationClassification =
  | "available"
  | "reserved_by_you"
  | "reserved_by_other"
  | "purchased"
  | "changed";

type ReservationInput = {
  action: ReservationAction;
  giftId: string;
  name: string;
  email: string;
  message: string;
  language: Language;
};

type AirtableGift = {
  id: string;
  fields?: {
    "Gift Name"?: string;
    Status?: string;
    Active?: boolean;
  };
};

type AirtableRecord = {
  id: string;
};

function parseInput(value: unknown): ReservationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const action = input.action;
  const giftId = typeof input.giftId === "string" ? input.giftId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  const language: Language = input.language === "en" ? "en" : "es";

  if (
    (action !== "review" && action !== "confirm") ||
    !/^rec[a-zA-Z0-9]{14}$/.test(giftId) ||
    name.length < 2 ||
    name.length > 100 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    message.length > 1000
  ) {
    return null;
  }

  return { action, giftId, name, email, message, language };
}

async function getGift(giftId: string) {
  const response = await airtableRequest(
    `${encodeURIComponent("Gifts")}/${giftId}`
  );
  if (!response.ok) {
    throw new Error(`Could not read gift (${response.status})`);
  }
  return (await response.json()) as AirtableGift;
}

async function reviewReservation(input: ReservationInput) {
  const [gift, activeReservation, blockingReservation, existingReservations] =
    await Promise.all([
      getGift(input.giftId),
      findActiveReservationForGift(input.giftId),
      findBlockingReservationForGift(input.giftId),
      getActiveReservationGiftsForEmail(input.email, [input.giftId]),
    ]);

  let classification: ReservationClassification = "changed";
  if (gift.fields?.Active !== false && gift.fields?.Status === "Purchased") {
    classification = "purchased";
  } else if (
    gift.fields?.Active !== false &&
    gift.fields?.Status === "Reserved"
  ) {
    const reservationEmail =
      activeReservation?.fields?.Email?.trim().toLowerCase() ?? "";
    classification =
      activeReservation && reservationEmail === input.email
        ? "reserved_by_you"
        : "reserved_by_other";
  } else if (
    gift.fields?.Active !== false &&
    gift.fields?.Status === "Available" &&
    !blockingReservation
  ) {
    classification = "available";
  }

  return {
    item: {
      giftId: input.giftId,
      name: gift.fields?.["Gift Name"] ?? "Gift",
      classification,
      eligible:
        classification === "available" ||
        classification === "reserved_by_you",
    },
    existingReservations,
  };
}

export async function POST(request: Request) {
  let input: ReservationInput | null = null;
  let language: Language = "es";

  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body) && "language" in body) {
      language = body.language === "en" ? "en" : "es";
    }
    input = parseInput(body);
  } catch {
    return Response.json(
      { error: translations[language].reservation.errors.invalidRequest },
      { status: 400 }
    );
  }

  const errors = translations[language].reservation.errors;

  if (!input) {
    return Response.json(
      { error: errors.invalidFields },
      { status: 400 }
    );
  }

  if (input.action === "review") {
    try {
      return Response.json(await reviewReservation(input));
    } catch (error) {
      console.error("Gift reservation review error:", error);
      return Response.json({ error: errors.temporary }, { status: 502 });
    }
  }

  if (!tryLockGifts([input.giftId])) {
    return Response.json(
      { error: errors.inProgress },
      { status: 409 }
    );
  }

  let reservationRecordId: string | null = null;

  try {
    const [gift, activeReservation] = await Promise.all([
      getGift(input.giftId),
      findActiveReservationForGift(input.giftId),
    ]);

    if (
      gift.fields?.Active !== false &&
      gift.fields?.Status === "Reserved" &&
      activeReservation
    ) {
      const reservationEmail =
        activeReservation.fields?.Email?.trim().toLowerCase() ?? "";
      if (reservationEmail === input.email) {
        return Response.json({
          ok: true,
          outcome: "existing",
          status: "Reserved",
        });
      }
    }

    if (gift.fields?.Status !== "Available" || gift.fields.Active === false) {
      return Response.json(
        { error: errors.unavailable },
        { status: 409 }
      );
    }

    const giftName = gift.fields["Gift Name"] ?? "Gift";
    const reservationId = randomUUID();
    const reservationFields: Record<string, unknown> = {
      "Gift Reservation": `${giftName} — ${input.name}`,
      Gift: [input.giftId],
      "Reserved By": input.name,
      Email: input.email,
      "Reservation ID": reservationId,
      "Reservation Status": "Reserved",
      "Reserved Date": new Date().toISOString(),
    };

    if (input.message) {
      reservationFields.Message = input.message;
    }

    const [latestGift, existingReservation] = await Promise.all([
      getGift(input.giftId),
      findBlockingReservationForGift(input.giftId),
    ]);
    if (
      latestGift.fields?.Status !== "Available" ||
      latestGift.fields.Active === false ||
      existingReservation
    ) {
      return Response.json({ error: errors.unavailable }, { status: 409 });
    }

    const createResponse = await airtableRequest(
      encodeURIComponent("Gift Reservations"),
      {
        method: "POST",
        body: JSON.stringify({ fields: reservationFields }),
      }
    );

    if (!createResponse.ok) {
      const airtableErrorBody = await createResponse.text().catch(() => "");
      console.error("Airtable reservation creation failed", {
        status: createResponse.status,
        statusText: createResponse.statusText,
        error: airtableErrorBody || "(empty response body)",
      });
      throw new Error(`Could not create reservation (${createResponse.status})`);
    }

    const reservation = (await createResponse.json()) as AirtableRecord;
    reservationRecordId = reservation.id;

    const updateGiftResponse = await airtableRequest(
      `${encodeURIComponent("Gifts")}/${input.giftId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: { Status: "Reserved" } }),
      }
    );

    if (!updateGiftResponse.ok) {
      const giftAfterFailure = await airtableRequest(
        `${encodeURIComponent("Gifts")}/${input.giftId}`
      ).catch(() => null);
      const currentGift = giftAfterFailure?.ok
        ? ((await giftAfterFailure.json()) as AirtableGift)
        : null;

      if (currentGift && currentGift.fields?.Status !== "Reserved") {
        await airtableRequest(
          `${encodeURIComponent("Gift Reservations")}/${reservationRecordId}`,
          { method: "DELETE" }
        ).catch(() => undefined);
      }
      throw new Error(`Could not update gift (${updateGiftResponse.status})`);
    }

    invalidateGiftCache();
    await sendReservationConfirmation({
      to: input.email,
      giftName,
      language: input.language,
      idempotencyKey: reservationId,
    });
    return Response.json({
      ok: true,
      reservationId,
      outcome: "reserved",
      status: "Reserved",
    });
  } catch (error) {
    console.error("Gift reservation error:", error);
    return Response.json(
      { error: errors.temporary },
      { status: 502 }
    );
  } finally {
    unlockGifts([input.giftId]);
  }
}
