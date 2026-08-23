import GiftGrid, { type GiftRecord } from "./GiftGrid";

async function getImageFromProductUrl(
  productUrl?: string
): Promise<string | null> {
  if (!productUrl) return null;

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BabyGiftRegistry/1.0)",
      },
      next: {
        revalidate: 86400,
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    const ogImage =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );

    if (ogImage?.[1]) {
      return new URL(ogImage[1], productUrl).href;
    }

    const twitterImage =
      html.match(
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
      );

    if (twitterImage?.[1]) {
      return new URL(twitterImage[1], productUrl).href;
    }

    return null;
  } catch {
    return null;
  }
}

async function getGifts(): Promise<GiftRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token) {
    throw new Error("AIRTABLE_TOKEN is missing");
  }

  if (!baseId) {
    throw new Error("AIRTABLE_BASE_ID is missing");
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
    "Gifts"
  )}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Airtable Gifts error:", data);

    throw new Error(
      `Could not load gifts from Airtable (${response.status})`
    );
  }

  const records = (data.records ?? []) as GiftRecord[];

const activeRecords = records
  .filter((gift) => gift.fields.Active !== false)
  .sort(
    (a, b) =>
      (a.fields["Display Order"] ?? 9999) -
      (b.fields["Display Order"] ?? 9999)
  );

const recordsWithImages = await Promise.all(
  activeRecords.map(async (gift) => {
    // Keep the Airtable image if one already exists
    if (gift.fields.Image?.[0]?.url) {
      return gift;
    }

    const productUrl = gift.fields["Product URL"];
    const imageUrl = await getImageFromProductUrl(productUrl);

    if (!imageUrl) {
      return gift;
    }

    return {
      ...gift,
      fields: {
        ...gift.fields,
        Image: [
          {
            url: imageUrl,
            filename: "product-image",
          },
        ],
      },
    };
  })
);

return recordsWithImages;
}

export default async function Home() {
  const gifts = await getGifts();

  return (
    <main className="min-h-screen bg-[#faf7f5] text-[#302b29]">
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <header className="mx-auto mb-14 max-w-3xl text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-[#a18479]">
            Baby Registry
          </p>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Our baby girl&apos;s gift list
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#756b67] sm:text-lg">
            We are so excited to welcome our little girl. If you would like to
            give her something, here are some of the things we have chosen for
            her.
          </p>
        </header>

        {gifts.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <p>No gifts are available yet.</p>
          </div>
        ) : (
          <GiftGrid gifts={gifts} />
        )}
      </section>
    </main>
  );
}
