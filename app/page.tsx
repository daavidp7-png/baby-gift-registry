type AirtableAttachment = {

  url: string;

  filename: string;

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

async function getGifts() {

  const token = process.env.AIRTABLE_TOKEN;

  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {

    throw new Error("Missing Airtable environment variables");

  }

  const params = new URLSearchParams();

  params.set(

    "filterByFormula",

    "AND({Active}=1)"

  );

  params.set(

    "sort[0][field]",

    "Display Order"

  );

  params.set(

    "sort[0][direction]",

    "asc"

  );

  const response = await fetch(

    `https://api.airtable.com/v0/${baseId}/tblzgy8G8TzSF0NA9?${params.toString()}`,

    {

      headers: {

        Authorization: `Bearer ${token}`,

      },

      cache: "no-store",

    }

  );

  if (!response.ok) {

    const error = await response.text();

    throw new Error(`Airtable error: ${error}`);

  }

  const data = await response.json();

  return data.records as GiftRecord[];

}

export default async function Home() {

  const gifts = await getGifts();

  return (

    <main className="min-h-screen bg-[#faf7f5] text-[#2f2a28]">

      <section className="mx-auto max-w-6xl px-6 py-16">

        <div className="mb-14 text-center">

          <p className="mb-3 text-sm uppercase tracking-[0.25em] text-[#9c8177]">

            Baby Registry

          </p>

          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">

            Our little girl's gift list

          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#756b67] md:text-lg">

            We are so excited to welcome our baby girl. If you would like to

            give her something, these are a few things we have chosen for her.

          </p>

        </div>

        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">

          {gifts.map((gift) => {

            const image = gift.fields.Image?.[0]?.url;

            const status = gift.fields.Status ?? "Available";

            const available = status === "Available";

            return (

              <article

                key={gift.id}

                className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5"

              >

                <div className="aspect-[4/3] bg-[#f1ece9]">

                  {image ? (

                    <img

                      src={image}

                      alt={gift.fields["Gift Name"] ?? "Gift"}

                      className="h-full w-full object-cover"

                    />

                  ) : (

                    <div className="flex h-full items-center justify-center text-sm text-[#9d918c]">

                      No image

                    </div>

                  )}

                </div>

                <div className="p-6">

                  <div className="mb-3 flex items-start justify-between gap-4">

                    <div>

                      {gift.fields.Brand && (

                        <p className="text-xs uppercase tracking-[0.18em] text-[#a18e86]">

                          {gift.fields.Brand}

                        </p>

                      )}

                      <h2 className="mt-1 text-xl font-semibold">

                        {gift.fields["Gift Name"]}

                      </h2>

                    </div>

                    {gift.fields.Featured && (

                      <span className="rounded-full bg-[#f6e7e4] px-3 py-1 text-xs font-medium text-[#9b675e]">

                        Favourite

                      </span>

                    )}

                  </div>

                  {gift.fields.Description && (

                    <p className="mb-5 text-sm leading-6 text-[#756b67]">

                      {gift.fields.Description}

                    </p>

                  )}

                  <div className="mb-5 flex items-center justify-between">

                    <span className="text-lg font-semibold">

                      {typeof gift.fields.Price === "number"

                        ? `CHF ${gift.fields.Price.toFixed(2)}`

                        : ""}

                    </span>

                    <span

                      className={`rounded-full px-3 py-1 text-xs font-medium ${

                        available

                          ? "bg-[#e8f1ea] text-[#52705b]"

                          : "bg-[#f0ecea] text-[#8a7e79]"

                      }`}

                    >

                      {status}

                    </span>

                  </div>

                  <div className="flex gap-3">

                    {gift.fields["Product URL"] && (

                      <a

                        href={gift.fields["Product URL"]}

                        target="_blank"

                        rel="noreferrer"

                        className="flex-1 rounded-full border border-[#d8cec9] px-4 py-3 text-center text-sm font-medium transition hover:bg-[#f8f3f1]"

                      >

                        View gift

                      </a>

                    )}

                    <button

                      disabled={!available}

                      className={`flex-1 rounded-full px-4 py-3 text-sm font-medium transition ${

                        available

                          ? "bg-[#2f2a28] text-white hover:bg-[#514844]"

                          : "cursor-not-allowed bg-[#ebe7e5] text-[#9c918c]"

                      }`}

                    >

                      {available ? "Reserve" : status}

                    </button>

                  </div>

                </div>

              </article>

            );

          })}

        </div>

      </section>

    </main>

  );

}
