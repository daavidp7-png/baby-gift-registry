import "server-only";

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

  return fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}
