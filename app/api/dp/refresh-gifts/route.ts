import "server-only";

import { timingSafeEqual } from "node:crypto";
import { invalidateGiftCache } from "../../../lib/giftCache";

function passwordsMatch(submitted: string, expected: string) {
  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);

  return (
    submittedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(submittedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const expectedPassword = process.env.DP_ADMIN_PASSWORD;

  if (!expectedPassword) {
    console.error("DP_ADMIN_PASSWORD is not configured");
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  let password: unknown;

  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (typeof password !== "string" || !passwordsMatch(password, expectedPassword)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  invalidateGiftCache();

  return Response.json({ ok: true });
}
