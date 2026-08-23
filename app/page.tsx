type AirtableAttachment = {
  url: string;
  filename?: string;
};

type GiftRecord = {
  id: string;
  fields: {
    "Gift Name"?: string;
    Brand?: string;
    Category?: string;
    Description?: string;
    Image?: AirtableAttachment[];
    "Product URL"?: string;
    Store?: string;
    Price?: number;
    Priority?: string;
    Status?: string;
    "Display Order"?: number;
    Featured?: boolean;
    Active?: boolean;
  };
};

async function getGifts(): Promise<GiftRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token) {
    throw new Error("AIRTABLE_TOKEN is missing");
  }

  if (!baseId) {
    throw new Error("AIRTABLE_BASE_ID is missing");
  }

  // Use the table NAME now that we have confirmed the base/token work.
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

  // Filter and sort HERE instead of asking Airtable to do it.
  return records
    .filter((gift) => gift.fields.Active !== false)
    .sort(
      (a, b) =>
        (a.fields["Display Order"] ?? 9999) -
        (b.fields["Display Order"] ?? 9999)
    );
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
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {gifts.map((gift) => {
              const {
                Brand,
                Category,
                Description,
                Image,
                Price,
                Priority,
                Status = "Available",
                Featured,
              } = gift.fields;

              const name = gift.fields["Gift Name"] ?? "Gift";
              const productUrl = gift.fields["Product URL"];
              const image = Image?.[0]?.url;

              const available = Status === "Available";

              return (
                <article
                  key={gift.id}
                  className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-black/5"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[#eee8e5]">
                    {image ? (
                      <img
                        src={image}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-[#a0948f]">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        {Brand && (
                          <p className="text-xs uppercase tracking-[0.18em] text-[#a18e86]">
                            {Brand}
                          </p>
                        )}

                        <h2 className="mt-1 text-xl font-semibold">{name}</h2>

                        {Category && (
                          <p className="mt-1 text-sm text-[#8b807b]">
                            {Category}
                          </p>
                        )}
                      </div>

                      {Featured && (
                        <span className="whitespace-nowrap rounded-full bg-[#f6e7e4] px-3 py-1 text-xs font-medium text-[#97675e]">
                          Featured
                        </span>
                      )}
                    </div>

                    {Description && (
                      <p className="mb-5 text-sm leading-6 text-[#756b67]">
                        {Description}
                      </p>
                    )}

                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div>
                        {typeof Price === "number" && (
                          <p className="text-lg font-semibold">
                            CHF {Price.toFixed(2)}
                          </p>
                        )}

                        {Priority && (
                          <p className="mt-1 text-xs text-[#958985]">
                            {Priority}
                          </p>
                        )}
                      </div>

                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          available
                            ? "bg-[#e7f0e8] text-[#52705b]"
                            : "bg-[#eeeae8] text-[#837873]"
                        }`}
                      >
                        {Status}
                      </span>
                    </div>

                    <div className="flex gap-3">
                      {productUrl && (
                        <a
                          href={productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-full border border-[#d8cec9] px-4 py-3 text-center text-sm font-medium hover:bg-[#f8f3f1]"
                        >
                          View gift
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={!available}
                        className={`flex-1 rounded-full px-4 py-3 text-sm font-medium ${
                          available
                            ? "bg-[#302b29] text-white hover:bg-[#514844]"
                            : "cursor-not-allowed bg-[#ebe7e5] text-[#9c918c]"
                        }`}
                      >
                        {available ? "Reserve" : Status}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
