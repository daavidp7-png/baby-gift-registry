import { randomUUID } from "node:crypto";
import { translations, type Language } from "../../i18n/translations";
import { airtableRequest } from "../../lib/airtable";
import { invalidateGiftCache } from "../../lib/giftCache";
import { tryLockGifts, unlockGifts } from "../../lib/giftMutationLock";
import {
  findActiveReservationForGift,
  findBlockingReservationForGift,
} from "../../lib/reservationQueries";

type PurchasableStatus = "Available" | "Reserved";
type CurrentStatus = PurchasableStatus | "Purchased";

type PurchaseInput = {
  giftId: string;
  expectedStatus: PurchasableStatus;
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

const giftIdPattern = /^rec[a-zA-Z0-9]{14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseInput(value: unknown): PurchaseInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const giftId = typeof input.giftId === "string" ? input.giftId.trim() : "";
  const expectedStatus = input.expectedStatus;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  const language: Language = input.language === "en" ? "en" : "es";

  if (
    !giftIdPattern.test(giftId) ||
    (expectedStatus !== "Available" && expectedStatus !== "Reserved") ||
    email.length > 254 ||
    !emailPattern.test(email) ||
    (expectedStatus === "Available" &&
      (name.length < 2 || name.length > 100 || message.length > 1000))
  ) {
    return null;
  }

  return { giftId, expectedStatus, name, email, message, language };
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

function safeStatus(status?: string): CurrentStatus | undefined {
  if (
    status === "Available" ||
    status === "Reserved" ||
    status === "Purchased"
  ) {
    return status;
  }

  return undefined;
}

function conflictResponse(
  language: Language,
  status?: string
): Response {
  const errors = translations[language].purchase.errors;
  const currentStatus = safeStatus(status);

  if (currentStatus === "Purchased") {
    return Response.json(
      { error: errors.alreadyPurchased, code: "already_purchased", currentStatus },
      { status: 409 }
    );
  }

  return Response.json(
    { error: errors.stale, code: "stale_status", currentStatus },
    { status: 409 }
  );
}

export async function POST(request: Request) {
  let input: PurchaseInput | null = null;
  let language: Language = "es";

  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object" && !Array.isArray(body) && "language" in body) {
      language = body.language === "en" ? "en" : "es";
    }

    input = parseInput(body);
  } catch {
    return Response.json(
      { error: translations[language].purchase.errors.invalidRequest },
      { status: 400 }
    );
  }

  const errors = translations[language].purchase.errors;

  if (!input) {
    return Response.json({ error: errors.invalidFields }, { status: 400 });
  }

  if (!tryLockGifts([input.giftId])) {
    return Response.json(
      { error: errors.inProgress, code: "in_progress" },
      { status: 409 }
    );
  }

  try {
    if (input.expectedStatus === "Available") {
      const gift = await getGift(input.giftId);

      if (
        gift.fields?.Active === false ||
        gift.fields?.Status !== "Available"
      ) {
        return conflictResponse(language, gift.fields?.Status);
      }

      const reservationId = randomUUID();
      const giftName = gift.fields?.["Gift Name"] ?? "Gift";
      const purchasedDate = new Date().toISOString();
      const reservationFields: Record<string, unknown> = {
        "Gift Reservation": `${giftName} — ${input.name}`,
        Gift: [input.giftId],
        "Reserved By": input.name,
        Email: input.email,
        "Reservation ID": reservationId,
        "Reservation Status": "Purchased",
        "Purchased Date": purchasedDate,
      };

      if (input.message) {
        reservationFields.Message = input.message;
      }

      const [latestGift, existingReservation] = await Promise.all([
        getGift(input.giftId),
        findBlockingReservationForGift(input.giftId),
      ]);

      if (
        latestGift.fields?.Active === false ||
        latestGift.fields?.Status !== "Available" ||
        existingReservation
      ) {
        return conflictResponse(language, latestGift.fields?.Status);
      }

      const createResponse = await airtableRequest(
        encodeURIComponent("Gift Reservations"),
        {
          method: "POST",
          body: JSON.stringify({ fields: reservationFields }),
        }
      );

      if (!createResponse.ok) {
        throw new Error(
          `Could not create purchase record (${createResponse.status})`
        );
      }

      const purchaseRecord = (await createResponse.json()) as { id: string };
      const updateGiftResponse = await airtableRequest(
        `${encodeURIComponent("Gifts")}/${input.giftId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ fields: { Status: "Purchased" } }),
        }
      );

      if (!updateGiftResponse.ok) {
        const giftAfterFailure = await getGift(input.giftId).catch(() => null);

        if (giftAfterFailure && giftAfterFailure.fields?.Status !== "Purchased") {
          await airtableRequest(
            `${encodeURIComponent("Gift Reservations")}/${purchaseRecord.id}`,
            { method: "DELETE" }
          ).catch(() => undefined);
        }
        throw new Error(`Could not update gift (${updateGiftResponse.status})`);
      }

      invalidateGiftCache();
      return Response.json({ ok: true, status: "Purchased" });
    }

    const [gift, reservation] = await Promise.all([
      getGift(input.giftId),
      findActiveReservationForGift(input.giftId),
    ]);

    if (
      gift.fields?.Active === false ||
      gift.fields?.Status !== "Reserved"
    ) {
      return conflictResponse(language, gift.fields?.Status);
    }

    if (!reservation) {
      return Response.json(
        { error: errors.stale, code: "stale_status", currentStatus: "Reserved" },
        { status: 409 }
      );
    }

    const storedEmail = reservation.fields?.Email?.trim().toLowerCase() ?? "";

    if (!storedEmail || storedEmail !== input.email) {
      return Response.json(
        { error: errors.incorrectEmail, code: "incorrect_email" },
        { status: 403 }
      );
    }

    const [latestGift, latestReservation] = await Promise.all([
      getGift(input.giftId),
      findActiveReservationForGift(input.giftId),
    ]);

    if (
      latestGift.fields?.Active === false ||
      latestGift.fields?.Status !== "Reserved"
    ) {
      return conflictResponse(language, latestGift.fields?.Status);
    }

    const latestEmail =
      latestReservation?.fields?.Email?.trim().toLowerCase() ?? "";
    if (
      !latestReservation ||
      latestReservation.id !== reservation.id ||
      !latestEmail ||
      latestEmail !== input.email
    ) {
      return Response.json(
        { error: errors.stale, code: "stale_status", currentStatus: "Reserved" },
        { status: 409 }
      );
    }

    const updateReservationResponse = await airtableRequest(
      `${encodeURIComponent("Gift Reservations")}/${latestReservation.id}`,
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
      `${encodeURIComponent("Gifts")}/${input.giftId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: { Status: "Purchased" } }),
      }
    );

    if (!updateGiftResponse.ok) {
      const giftAfterFailure = await getGift(input.giftId).catch(() => null);
      const rollbackResponse =
        giftAfterFailure?.fields?.Status === "Reserved"
          ? await airtableRequest(
              `${encodeURIComponent("Gift Reservations")}/${latestReservation.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  fields: {
                    "Reservation Status": "Reserved",
                    "Purchased Date": null,
                  },
                }),
              }
            ).catch(() => null)
          : null;

      if (giftAfterFailure?.fields?.Status === "Reserved" && !rollbackResponse?.ok) {
        console.error("Could not roll back reservation after gift update failure", {
          giftId: input.giftId,
          reservationId: latestReservation.id,
        });
      }

      throw new Error(`Could not update gift (${updateGiftResponse.status})`);
    }

    invalidateGiftCache();
    return Response.json({ ok: true, status: "Purchased" });
  } catch (error) {
    console.error("Gift purchase error:", error);
    return Response.json({ error: errors.temporary }, { status: 502 });
  } finally {
    unlockGifts([input.giftId]);
  }
}
