export async function GET() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    return Response.json(
      { ok: false, error: "Missing environment variables" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      {
        ok: false,
        airtableStatus: response.status,
        airtableError: data,
        baseId,
      },
      { status: 500 }
    );
  }

  const tables = data.tables as Array<{ id: string; name: string }> | undefined;

  return Response.json({
    ok: true,
    baseId,
    tables: tables?.map((table) => ({
      id: table.id,
      name: table.name,
    })),
  });
}
