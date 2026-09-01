import "server-only";

const MAX_RATE_LIMIT_RETRIES = 1;
const MAX_RETRY_WAIT_MS = 5_000;
const BILLING_LIMIT_ERROR = "PUBLIC_API_BILLING_LIMIT_EXCEEDED";

function retryDelay(response: Response) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) return null;

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds)) {
    const milliseconds = Math.max(0, seconds * 1000);
    return milliseconds > 0 && milliseconds <= MAX_RETRY_WAIT_MS
      ? milliseconds
      : null;
  }

  const date = Date.parse(retryAfter);
  if (Number.isFinite(date)) {
    const milliseconds = Math.max(0, date - Date.now());
    return milliseconds > 0 && milliseconds <= MAX_RETRY_WAIT_MS
      ? milliseconds
      : null;
  }

  return null;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isBillingLimitResponse(response: Response) {
  try {
    const payload: unknown = await response.clone().json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return false;
    }

    const error = (payload as Record<string, unknown>).error;
    if (error === BILLING_LIMIT_ERROR) return true;
    if (!error || typeof error !== "object" || Array.isArray(error)) {
      return false;
    }

    const details = error as Record<string, unknown>;
    return (
      details.type === BILLING_LIMIT_ERROR ||
      details.code === BILLING_LIMIT_ERROR
    );
  } catch {
    return false;
  }
}

export function getAirtableConfig() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    throw new Error("Airtable is not configured");
  }

  return { token, baseId };
}

export async function airtableRequest(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { token, baseId } = getAirtableConfig();

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });

    if (response.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
      return response;
    }

    if (await isBillingLimitResponse(response)) return response;

    const delay = retryDelay(response);
    if (delay === null) return response;

    await wait(delay);
  }
}
