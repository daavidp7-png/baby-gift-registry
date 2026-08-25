import { randomUUID } from "node:crypto";
import { translations, type Language } from "../../i18n/translations";
import { airtableRequest } from "../../lib/airtable";

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

const purchasesInProgress = new Set<string>();
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

  if (purchasesInProgress.has(input.giftId)) {
    return Response.json(
      { error: errors.inProgress, code: "in_progress" },
      { status: 409 }
    );
  }

  purchasesInProgress.add(input.giftId);

  try {
    const gift = await getGift(input.giftId);

    if (
      gift.fields?.Active === false ||
      gift.fields?.Status !== input.expectedStatus
    ) {
      return conflictResponse(language, gift.fields?.Status);
    }

    if (input.expectedStatus === "Available") {
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
        "Gift Record ID": input.giftId,
      };

      if (input.message) {
        reservationFields.Message = input.message;
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
        await airtableRequest(
          `${encodeURIComponent("Gift Reservations")}/${purchaseRecord.id}`,
          { method: "DELETE" }
        ).catch(() => undefined);
        throw new Error(`Could not update gift (${updateGiftResponse.status})`);
      }

      return Response.json({ ok: true, status: "Purchased" });
    }

    const reservation = await findActiveReservation(input.giftId);

    if (!reservation) {
      throw new Error("No active reservation found for reserved gift");
    }

    const storedEmail = reservation.fields?.Email?.trim().toLowerCase() ?? "";

    if (!storedEmail || storedEmail !== input.email) {
      return Response.json(
        { error: errors.incorrectEmail, code: "incorrect_email" },
        { status: 403 }
      );
    }

    const latestGift = await getGift(input.giftId);

    if (
      latestGift.fields?.Active === false ||
      latestGift.fields?.Status !== "Reserved"
    ) {
      return conflictResponse(language, latestGift.fields?.Status);
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
      `${encodeURIComponent("Gifts")}/${input.giftId}`,
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
        console.error("Could not roll back reservation after gift update failure", {
          giftId: input.giftId,
          reservationId: reservation.id,
        });
      }

      throw new Error(`Could not update gift (${updateGiftResponse.status})`);
    }

    return Response.json({ ok: true, status: "Purchased" });
  } catch (error) {
    console.error("Gift purchase error:", error);
    return Response.json({ error: errors.temporary }, { status: 502 });
  } finally {
    purchasesInProgress.delete(input.giftId);
  }
}
