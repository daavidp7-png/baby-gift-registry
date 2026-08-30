import { translations, type Language } from "../../../i18n/translations";
import { airtableRequest } from "../../../lib/airtable";

type AirtableReservation = {
  fields?: {
    Gift?: string[];
    "Reserved By"?: string;
    "Reserved Date"?: string;
    "Purchased Date"?: string;
  };
};

type AirtableReservationPage = {
  records?: AirtableReservation[];
  offset?: string;
};

const giftIdPattern = /^rec[a-zA-Z0-9]{14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeAirtableString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function reservationFormula(email: string) {
  return `AND(LOWER(TRIM({Email}))='${escapeAirtableString(email)}',OR({Reservation Status}='Reserved',{Reservation Status}='Purchased'))`;
}

export async function POST(request: Request) {
  let email = "";
  let language: Language = "es";

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }

    const input = body as Record<string, unknown>;
    email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    language = input.language === "en" ? "en" : "es";
  } catch {
    return Response.json(
      { error: translations[language].favorites.recovery.errors.invalid },
      { status: 400 }
    );
  }

  const errors = translations[language].favorites.recovery.errors;
  if (email.length > 254 || !emailPattern.test(email)) {
    return Response.json({ error: errors.invalid }, { status: 400 });
  }

  try {
    const giftIds = new Set<string>();
    let recoveredName: string | null = null;
    let recoveredNameTimestamp = Number.NEGATIVE_INFINITY;
    let offset: string | undefined;

    do {
      const search = new URLSearchParams({
        pageSize: "100",
        filterByFormula: reservationFormula(email),
      });
      search.append("fields[]", "Gift");
      search.append("fields[]", "Reserved By");
      search.append("fields[]", "Reserved Date");
      search.append("fields[]", "Purchased Date");
      if (offset) search.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent("Gift Reservations")}?${search.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Could not recover reservations (${response.status})`);
      }

      const page = (await response.json()) as AirtableReservationPage;
      for (const reservation of page.records ?? []) {
        for (const giftId of reservation.fields?.Gift ?? []) {
          if (giftIdPattern.test(giftId)) giftIds.add(giftId);
        }

        const name = reservation.fields?.["Reserved By"]?.trim();
        if (name) {
          const reservedAt = Date.parse(
            reservation.fields?.["Reserved Date"] ?? ""
          );
          const purchasedAt = Date.parse(
            reservation.fields?.["Purchased Date"] ?? ""
          );
          const timestamp = Math.max(
            Number.isFinite(reservedAt) ? reservedAt : Number.NEGATIVE_INFINITY,
            Number.isFinite(purchasedAt)
              ? purchasedAt
              : Number.NEGATIVE_INFINITY
          );

          if (recoveredName === null || timestamp >= recoveredNameTimestamp) {
            recoveredName = name;
            recoveredNameTimestamp = timestamp;
          }
        }
      }
      offset = page.offset;
    } while (offset);

    return Response.json({
      email,
      name: recoveredName,
      giftIds: [...giftIds],
      count: giftIds.size,
    });
  } catch (error) {
    console.error("Reservation recovery error:", error);
    return Response.json({ error: errors.temporary }, { status: 502 });
  }
}
