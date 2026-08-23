import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function getSigningSecret() {
  const secret = process.env.AIRTABLE_TOKEN;

  if (!secret) {
    throw new Error("AIRTABLE_TOKEN is missing");
  }

  return secret;
}

function createSignature(imageUrl: string, referer: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`${imageUrl}\n${referer}`)
    .digest("base64url");
}

export function createImageProxyUrl(imageUrl: string, referer = "") {
  const params = new URLSearchParams({
    url: imageUrl,
    ref: referer,
    sig: createSignature(imageUrl, referer),
  });

  return `/api/image?${params.toString()}`;
}

export function hasValidImageSignature(
  imageUrl: string,
  referer: string,
  signature: string
) {
  const expected = Buffer.from(createSignature(imageUrl, referer));
  const received = Buffer.from(signature);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
