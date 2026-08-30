import "server-only";

const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }

  return DEFAULT_RETRY_DELAY_MS * 2 ** attempt;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

    await wait(retryDelay(response, attempt));
  }
}
