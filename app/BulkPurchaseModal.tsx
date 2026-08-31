"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GiftContactFields from "./GiftContactFields";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

type PublicGiftStatus = "Available" | "Reserved" | "Purchased";
type ReviewClassification =
  | "available"
  | "reserved_by_you"
  | "reserved_by_other"
  | "purchased"
  | "changed";

type ReviewItem = {
  giftId: string;
  name: string;
  price: number;
  classification: ReviewClassification;
  eligible: boolean;
  status?: PublicGiftStatus;
};

export type BulkPurchaseResultItem = {
  giftId: string;
  name: string;
  outcome: "purchased" | "skipped";
  reason?: Exclude<ReviewClassification, "available" | "reserved_by_you"> | "error";
  status?: PublicGiftStatus;
};

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

type Step = "form" | "reviewing" | "review" | "processing" | "result";

type BulkPurchaseModalProps = {
  giftIds: string[];
  selectedTotal: number;
  initialName?: string;
  initialEmail?: string;
  onClose: () => void;
  onComplete: (items: BulkPurchaseResultItem[]) => void;
};

function replaceCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

const chfFormatter = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function BulkPurchaseModal({
  giftIds,
  selectedTotal,
  initialName,
  initialEmail,
  onClose,
  onComplete,
}: BulkPurchaseModalProps) {
  const { language, t } = useLanguage();
  const [step, setStep] = useState<Step>("form");
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewSelectedTotal, setReviewSelectedTotal] = useState(0);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [resultItems, setResultItems] = useState<BulkPurchaseResultItem[]>([]);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const busy = step === "reviewing" || step === "processing";
  const eligibleCount = reviewItems.filter((item) => item.eligible).length;
  const purchasedCount = resultItems.filter(
    (item) => item.outcome === "purchased"
  ).length;
  const skippedCount = resultItems.length - purchasedCount;

  useEffect(() => {
    if (step === "form") nameInputRef.current?.focus();
  }, [step]);

  const request = async (
    action: "review" | "confirm",
    details: ContactDetails,
    reviewedItems?: ReviewItem[]
  ) => {
    const eligibleReviewedItems = reviewedItems?.filter((item) => item.eligible);
    const response = await fetch("/api/purchases/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        giftIds: eligibleReviewedItems?.map((item) => item.giftId) ?? giftIds,
        reviewedItems: eligibleReviewedItems?.map((item) => ({
          giftId: item.giftId,
          classification: item.classification,
        })),
        ...details,
        language,
      }),
    });
    const data = (await response.json()) as {
      error?: string;
      items?: ReviewItem[] | BulkPurchaseResultItem[];
      selectedTotal?: number;
      eligibleTotal?: number;
    };

    if (!response.ok) {
      throw new Error(data.error ?? t.bulkPurchase.errors.generic);
    }

    return data;
  };

  const reviewPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const formData = new FormData(event.currentTarget);
    const details = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
    };

    setStep("reviewing");
    setError("");

    try {
      const data = await request("review", details);
      setContact(details);
      setReviewItems((data.items ?? []) as ReviewItem[]);
      setReviewSelectedTotal(data.selectedTotal ?? 0);
      setEligibleTotal(data.eligibleTotal ?? 0);
      setStep("review");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : t.bulkPurchase.errors.generic
      );
      setStep("form");
    }
  };

  const confirmPurchase = async () => {
    if (!contact || eligibleCount === 0 || busy) return;

    setStep("processing");
    setError("");

    try {
      const data = await request("confirm", contact, reviewItems);
      const items = (data.items ?? []) as BulkPurchaseResultItem[];
      setResultItems(items);
      onComplete(items);
      setStep("result");
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : t.bulkPurchase.errors.generic
      );
      setStep("review");
    }
  };

  const classificationLabel = (classification: ReviewClassification) => {
    if (classification === "available") return t.bulkPurchase.available;
    if (classification === "reserved_by_you") {
      return t.bulkPurchase.reservedByYou;
    }
    if (classification === "reserved_by_other") {
      return t.bulkPurchase.reservedByOther;
    }
    if (classification === "purchased") {
      return t.bulkPurchase.alreadyPurchased;
    }
    return t.bulkPurchase.availabilityChanged;
  };

  const resultLabel = (item: BulkPurchaseResultItem) => {
    if (item.outcome === "purchased") return t.gifts.statuses.purchased;
    if (item.reason === "reserved_by_other") {
      return t.bulkPurchase.reservedByOther;
    }
    if (item.reason === "purchased") return t.bulkPurchase.alreadyPurchased;
    return t.bulkPurchase.availabilityChanged;
  };

  return (
    <ModalDialog
      titleId="bulk-purchase-title"
      eyebrow={t.bulkPurchase.eyebrow}
      title={t.bulkPurchase.title}
      closeLabel={t.bulkPurchase.close}
      canClose={!busy}
      onClose={onClose}
    >
      <div>
        {(step === "form" || step === "reviewing") && (
          <form onSubmit={reviewPurchase} className="mt-5 grid gap-4">
            <p className="leading-5 text-[#756b67]">{t.bulkPurchase.intro}</p>

            <div className="rounded-xl bg-[#faf7f5] px-4 py-3">
              <span className="text-[#756b67]">{t.bulkPurchase.selectedTotal}</span>
              <strong className="ml-2 font-semibold text-[#302b29]">
                {chfFormatter.format(selectedTotal)}
              </strong>
            </div>

            <GiftContactFields
              nameInputRef={nameInputRef}
              defaultName={initialName}
              defaultEmail={initialEmail}
              labels={t.reservation}
            />

            {error && (
              <p role="alert" className="text-[#9d3f3f]">
                {error}
              </p>
            )}

            <div className="mt-1 flex flex-col gap-2 min-[360px]:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
              >
                {t.purchase.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {step === "reviewing"
                  ? t.bulkPurchase.reviewing
                  : t.bulkPurchase.reviewAction}
              </button>
            </div>
          </form>
        )}

        {(step === "review" || step === "processing") && (
          <div className="mt-5">
            <h3 className="font-semibold text-[#302b29]">
              {t.bulkPurchase.reviewTitle}
            </h3>
            <p className="mt-2 text-[#756b67]">
              {eligibleCount === 1
                ? t.bulkPurchase.eligibleOne
                : replaceCount(t.bulkPurchase.eligibleMany, eligibleCount)}
            </p>

            <div className="mt-4 rounded-xl bg-[#faf7f5] px-4 py-3">
              {Math.abs(reviewSelectedTotal - eligibleTotal) > 0.005 && (
                <p className="text-sm text-[#8f837d]">
                  {t.bulkPurchase.selectedTotal}: {chfFormatter.format(reviewSelectedTotal)}
                </p>
              )}
              <p className="font-semibold text-[#302b29]">
                {t.bulkPurchase.purchaseTotal}: {chfFormatter.format(eligibleTotal)}
              </p>
            </div>

            <ul className="mt-4 grid gap-2">
              {reviewItems.map((item) => (
                <li
                  key={item.giftId}
                  className="flex items-start gap-2 rounded-xl bg-[#faf7f5] px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={item.eligible ? "text-[#52705b]" : "text-[#9d615d]"}
                  >
                    {item.eligible ? "✓" : "✕"}
                  </span>
                  <span className="min-w-0">
                    <span className="break-words font-medium text-[#302b29] [overflow-wrap:anywhere]">{item.name}</span>
                    <span className="text-[#756b67]">
                      {" — "}
                      {classificationLabel(item.classification)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {reviewItems.some(
              (item) => item.classification === "reserved_by_other"
            ) && (
              <p className="mt-3 text-sm leading-5 text-[#8a514b]">
                {t.bulkPurchase.reservedByOtherMessage}
              </p>
            )}

            {eligibleCount === 0 && (
              <p role="alert" className="mt-3 text-[#9d3f3f]">
                {t.bulkPurchase.noEligible}
              </p>
            )}

            {error && (
              <p role="alert" className="mt-3 text-[#9d3f3f]">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2 min-[360px]:flex-row">
              <button
                type="button"
                disabled={step === "processing"}
                onClick={() => setStep("form")}
                className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
              >
                {t.bulkPurchase.back}
              </button>
              <button
                type="button"
                disabled={eligibleCount === 0 || step === "processing"}
                onClick={confirmPurchase}
                className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {step === "processing"
                  ? t.bulkPurchase.processing
                  : t.bulkPurchase.confirm}
              </button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="mt-5">
            <h3 className="font-semibold text-[#302b29]">
              {t.bulkPurchase.resultTitle}
            </h3>
            <p className="mt-2 text-[#52705b]">
              {purchasedCount === 1
                ? t.bulkPurchase.purchasedOne
                : replaceCount(t.bulkPurchase.purchasedMany, purchasedCount)}
            </p>
            {skippedCount > 0 && (
              <p className="mt-2 text-[#8a514b]">
                {skippedCount === 1
                  ? t.bulkPurchase.skippedOne
                  : replaceCount(t.bulkPurchase.skippedMany, skippedCount)}
              </p>
            )}

            <ul className="mt-4 grid gap-2">
              {resultItems.map((item) => (
                <li
                  key={item.giftId}
                  className="flex items-start gap-2 rounded-xl bg-[#faf7f5] px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={
                      item.outcome === "purchased"
                        ? "text-[#52705b]"
                        : "text-[#9d615d]"
                    }
                  >
                    {item.outcome === "purchased" ? "✓" : "✕"}
                  </span>
                  <span>
                    <span className="break-words font-medium text-[#302b29] [overflow-wrap:anywhere]">{item.name}</span>
                    <span className="text-[#756b67]">
                      {" — "}
                      {resultLabel(item)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white"
            >
              {t.bulkPurchase.done}
            </button>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
