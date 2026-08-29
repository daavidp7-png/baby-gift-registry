import BackToTopButton from "../BackToTopButton";
import GiftRegistryContent from "../GiftRegistryContent";
import { getGifts } from "../lib/gifts";

export const dynamic = "force-dynamic";

export default async function GiftsPage() {
  const gifts = await getGifts();

  return (
    <main className="min-h-screen bg-[#faf7f5] text-[#302b29]">
      <GiftRegistryContent gifts={gifts} />
      <BackToTopButton />
    </main>
  );
}
