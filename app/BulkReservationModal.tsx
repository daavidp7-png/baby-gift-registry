"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GiftContactFields from "./GiftContactFields";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

type PublicGiftStatus = "Available" | "Reserved" | "Purchased";
type ReviewClassification = "available" | "reserved" | "purchased" | "changed";

type ReviewItem = {
  giftId: string;
  name: string;
  classification: ReviewClassification;
  eligible: boolean;
  status?: PublicGiftStatus;
};

export type BulkReservationResultItem = {
  giftId: string;
  name: string;
  outcome: "reserved" | "skipped";
  reason?: Exclude<ReviewClassification, "available"> | "error";
  status?: PublicGiftStatus;
};

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

type Step = "form" | "reviewing" | "review" | "processing" | "result";

function replaceCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export default function BulkReservationModal({
  giftIds,
  onClose,
  onComplete,
}: {
  giftIds: string[];
  onClose: () => void;
  onComplete: (items: BulkReservationResultItem[]) => void;
}) {
  const { language, t } = useLanguage();
  const [step, setStep] = useState<Step>("form");
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [resultItems, setResultItems] = useState<BulkReservationResultItem[]>([]);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const busy = step === "reviewing" || step === "processing";
  const eligibleCount = reviewItems.filter((item) => item.eligible).length;
  const reservedCount = resultItems.filter(
    (item) => item.outcome === "reserved"
  ).length;
  const skippedCount = resultItems.length - reservedCount;

  useEffect(() => {
    if (step === "form") nameInputRef.current?.focus();
  }, [step]);

  const request = async (
    action: "review" | "confirm",
    details: ContactDetails,
    reviewedItems?: ReviewItem[]
  ) => {
    const response = await fetch("/api/reservations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        giftIds,
        reviewedItems: reviewedItems?.map((item) => ({
          giftId: item.giftId,
          classification: item.classification,
        })),
        ...details,
        language,
      }),
    });
    const data = (await response.json()) as {
      error?: string;
      items?: ReviewItem[] | BulkReservationResultItem[];
    };

    if (!response.ok) {
      throw new Error(data.error ?? t.bulkReservation.errors.generic);
    }

    return data;
  };

  const reviewReservation = async (event: FormEvent<HTMLFormElement>) => {
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
      setStep("review");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : t.bulkReservation.errors.generic
      );
      setStep("form");
    }
  };

  const confirmReservation = async () => {
    if (!contact || eligibleCount === 0 || busy) return;

    setStep("processing");
    setError("");

    try {
      const data = await request("confirm", contact, reviewItems);
      const items = (data.items ?? []) as BulkReservationResultItem[];
      setResultItems(items);
      onComplete(items);
      setStep("result");
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : t.bulkReservation.errors.generic
      );
      setStep("review");
    }
  };

  const classificationLabel = (classification: ReviewClassification) => {
    if (classification === "available") return t.bulkReservation.available;
    if (classification === "reserved") return t.bulkReservation.alreadyReserved;
    if (classification === "purchased") return t.bulkReservation.alreadyPurchased;
    return t.bulkReservation.availabilityChanged;
  };

  const resultLabel = (item: BulkReservationResultItem) => {
    if (item.outcome === "reserved") return t.gifts.statuses.reserved;
    if (item.reason === "reserved") return t.bulkReservation.alreadyReserved;
    if (item.reason === "purchased") return t.bulkReservation.alreadyPurchased;
    return t.bulkReservation.noLongerAvailable;
  };

  return (
    <ModalDialog
      titleId="bulk-reservation-title"
      eyebrow={t.bulkReservation.eyebrow}
      title={t.bulkReservation.title}
      closeLabel={t.bulkReservation.close}
      canClose={!busy}
      onClose={onClose}
    >
      <div className="max-h-[72vh] overflow-y-auto pr-1">
        {(step === "form" || step === "reviewing") && (
          <form onSubmit={reviewReservation} className="mt-5 grid gap-4">
            <p className="leading-5 text-[#756b67]">{t.bulkReservation.intro}</p>

            <GiftContactFields nameInputRef={nameInputRef} labels={t.reservation} />

            {error && <p role="alert" className="text-[#9d3f3f]">{error}</p>}

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
              >
                {t.reservation.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {step === "reviewing"
                  ? t.bulkReservation.reviewing
                  : t.bulkReservation.reviewAction}
              </button>
            </div>
          </form>
        )}

        {(step === "review" || step === "processing") && (
          <div className="mt-5">
            <h3 className="font-semibold text-[#302b29]">
              {t.bulkReservation.reviewTitle}
            </h3>
            <p className="mt-2 text-[#756b67]">
              {eligibleCount === 1
                ? t.bulkReservation.eligibleOne
                : replaceCount(t.bulkReservation.eligibleMany, eligibleCount)}
            </p>

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
                    <span className="font-medium text-[#302b29]">{item.name}</span>
                    <span className="text-[#756b67]">
                      {" — "}
                      {classificationLabel(item.classification)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {eligibleCount === 0 && (
              <p role="alert" className="mt-3 text-[#9d3f3f]">
                {t.bulkReservation.noEligible}
              </p>
            )}
            {error && <p role="alert" className="mt-3 text-[#9d3f3f]">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={step === "processing"}
                onClick={() => setStep("form")}
                className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
              >
                {t.bulkReservation.back}
              </button>
              <button
                type="button"
                disabled={eligibleCount === 0 || step === "processing"}
                onClick={confirmReservation}
                className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {step === "processing"
                  ? t.bulkReservation.processing
                  : t.bulkReservation.confirm}
              </button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="mt-5">
            <h3 className="font-semibold text-[#302b29]">
              {t.bulkReservation.resultTitle}
            </h3>
            <p className="mt-2 text-[#52705b]">
              {reservedCount === 1
                ? t.bulkReservation.reservedOne
                : replaceCount(t.bulkReservation.reservedMany, reservedCount)}
            </p>
            {skippedCount > 0 && (
              <p className="mt-2 text-[#8a514b]">
                {skippedCount === 1
                  ? t.bulkReservation.skippedOne
                  : replaceCount(t.bulkReservation.skippedMany, skippedCount)}
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
                      item.outcome === "reserved"
                        ? "text-[#52705b]"
                        : "text-[#9d615d]"
                    }
                  >
                    {item.outcome === "reserved" ? "✓" : "✕"}
                  </span>
                  <span>
                    <span className="font-medium text-[#302b29]">{item.name}</span>
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
              {t.bulkReservation.done}
            </button>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
