import { randomUUID } from "node:crypto";
import { translations, type Language } from "../../i18n/translations";
import { airtableRequest } from "../../lib/airtable";
import { invalidateGiftCache } from "../../lib/giftCache";
import { tryLockGifts, unlockGifts } from "../../lib/giftMutationLock";
import { findBlockingReservationForGift } from "../../lib/reservationQueries";

type ReservationInput = {
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
  const giftId = typeof input.giftId === "string" ? input.giftId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  const language: Language = input.language === "en" ? "en" : "es";

  if (
    !/^rec[a-zA-Z0-9]{14}$/.test(giftId) ||
    name.length < 2 ||
    name.length > 100 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    message.length > 1000
  ) {
    return null;
  }

  return { giftId, name, email, message, language };
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

  if (!tryLockGifts([input.giftId])) {
    return Response.json(
      { error: errors.inProgress },
      { status: 409 }
    );
  }

  let reservationRecordId: string | null = null;

  try {
    const giftResponse = await airtableRequest(
      `${encodeURIComponent("Gifts")}/${input.giftId}`
    );

    if (!giftResponse.ok) {
      throw new Error(`Could not read gift (${giftResponse.status})`);
    }

    const gift = (await giftResponse.json()) as AirtableGift;

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

    const [latestGiftResponse, existingReservation] = await Promise.all([
      airtableRequest(`${encodeURIComponent("Gifts")}/${input.giftId}`),
      findBlockingReservationForGift(input.giftId),
    ]);

    if (!latestGiftResponse.ok) {
      throw new Error(`Could not re-read gift (${latestGiftResponse.status})`);
    }

    const latestGift = (await latestGiftResponse.json()) as AirtableGift;
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
    return Response.json({ ok: true, reservationId });
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
