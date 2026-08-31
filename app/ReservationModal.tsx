"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GiftContactFields from "./GiftContactFields";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

type ReservationModalProps = {
  giftId: string;
  giftName: string;
  defaultName?: string;
  defaultEmail?: string;
  onClose: () => void;
  onReserved: () => void;
};

type Step = "form" | "reviewing" | "review" | "confirming" | "success";
type Classification =
  | "available"
  | "reserved_by_you"
  | "reserved_by_other"
  | "purchased"
  | "changed";
type ContactDetails = { name: string; email: string; message: string };
type ExistingReservationGift = { giftId: string; giftName: string };
type ReviewItem = {
  giftId: string;
  name: string;
  classification: Classification;
  eligible: boolean;
};

export default function ReservationModal({
  giftId,
  giftName,
  defaultName,
  defaultEmail,
  onClose,
  onReserved,
}: ReservationModalProps) {
  const { language, t } = useLanguage();
  const [step, setStep] = useState<Step>("form");
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [reviewItem, setReviewItem] = useState<ReviewItem | null>(null);
  const [existingReservations, setExistingReservations] = useState<
    ExistingReservationGift[]
  >([]);
  const [resultOutcome, setResultOutcome] = useState<
    "reserved" | "existing" | null
  >(null);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const busy = step === "reviewing" || step === "confirming";

  useEffect(() => {
    if (step === "form") nameInputRef.current?.focus();
  }, [step]);

  const request = async (
    action: "review" | "confirm",
    details: ContactDetails
  ) => {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, giftId, ...details, language }),
    });
    const data = (await response.json()) as {
      error?: string;
      item?: ReviewItem;
      existingReservations?: ExistingReservationGift[];
      outcome?: "reserved" | "existing";
    };
    if (!response.ok) {
      throw new Error(data.error ?? t.reservation.errors.generic);
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
      setReviewItem(data.item ?? null);
      setExistingReservations(data.existingReservations ?? []);
      setStep("review");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : t.reservation.errors.generic
      );
      setStep("form");
    }
  };

  const confirmReservation = async () => {
    if (!contact || !reviewItem?.eligible || busy) return;
    setStep("confirming");
    setError("");

    try {
      const data = await request("confirm", contact);
      setResultOutcome(data.outcome ?? "reserved");
      onReserved();
      setStep("success");
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : t.reservation.errors.generic
      );
      setStep("review");
    }
  };

  const classificationLabel = (classification: Classification) => {
    if (classification === "available") return t.bulkReservation.available;
    if (classification === "reserved_by_you") {
      return t.bulkPurchase.reservedByYou;
    }
    if (classification === "reserved_by_other") {
      return t.bulkPurchase.reservedByOther;
    }
    if (classification === "purchased") {
      return t.bulkPurchase.alreadyPurchased;
    }
    return t.bulkReservation.availabilityChanged;
  };

  const positive =
    reviewItem?.classification === "available" ||
    reviewItem?.classification === "reserved_by_you";

  return (
    <ModalDialog
      titleId="reservation-title"
      eyebrow={t.reservation.eyebrow}
      title={giftName}
      closeLabel={t.reservation.close}
      canClose={!busy}
      onClose={onClose}
    >
      {(step === "form" || step === "reviewing") && (
        <form onSubmit={reviewReservation} className="mt-5 grid gap-4">
          <GiftContactFields
            nameInputRef={nameInputRef}
            defaultName={contact?.name ?? defaultName}
            defaultEmail={contact?.email ?? defaultEmail}
            defaultMessage={contact?.message}
            labels={t.reservation}
          />
          {error && <p role="alert" className="text-[#9d3f3f]">{error}</p>}
          <div className="mt-1 flex flex-col gap-2 min-[360px]:flex-row">
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

      {(step === "review" || step === "confirming") && reviewItem && (
        <div className="mt-5">
          <h3 className="font-semibold text-[#302b29]">
            {t.bulkReservation.reviewTitle}
          </h3>
          {reviewItem.classification === "available" && (
            <p className="mt-2 text-[#756b67]">
              {t.reservation.addedToReservations}
            </p>
          )}
          {reviewItem.classification === "reserved_by_you" && (
            <p className="mt-2 text-[#756b67]">
              {t.bulkReservation.allAlreadyYours}
            </p>
          )}

          {existingReservations.length > 0 && (
            <div className="mt-4">
              <p className="text-[#756b67]">
                {t.reservation.existingHeading}
              </p>
              <ul className="mt-2 grid gap-2">
                {existingReservations.map((gift) => (
                  <li
                    key={gift.giftId}
                    className="flex items-start gap-2 rounded-xl bg-[#faf7f5] px-3 py-2.5"
                  >
                    <span aria-hidden="true" className="text-[#52705b]">✓</span>
                    <span className="break-words font-medium text-[#302b29] [overflow-wrap:anywhere]">
                      {gift.giftName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#faf7f5] px-3 py-2.5">
            <span
              aria-hidden="true"
              className={positive ? "text-[#52705b]" : "text-[#9d615d]"}
            >
              {positive ? "✓" : "✕"}
            </span>
            <span>
              <span className="break-words font-medium text-[#302b29] [overflow-wrap:anywhere]">{reviewItem.name}</span>
              <span className="text-[#756b67]">
                {" — "}{classificationLabel(reviewItem.classification)}
              </span>
            </span>
          </div>

          {!reviewItem.eligible && (
            <p role="alert" className="mt-3 text-[#9d3f3f]">
              {t.bulkReservation.noEligible}
            </p>
          )}
          {error && <p role="alert" className="mt-3 text-[#9d3f3f]">{error}</p>}
          <div className="mt-5 flex flex-col gap-2 min-[360px]:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("form")}
              className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
            >
              {t.bulkReservation.back}
            </button>
            <button
              type="button"
              disabled={!reviewItem.eligible || busy}
              onClick={confirmReservation}
              className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === "confirming"
                ? t.bulkReservation.processing
                : t.bulkReservation.confirm}
            </button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="pt-6">
          <p className="font-semibold text-[#52705b]">
            {resultOutcome === "existing"
              ? t.bulkReservation.allAlreadyYours
              : t.reservation.successTitle}
          </p>
          {resultOutcome === "reserved" && (
            <p className="mt-2 leading-5 text-[#756b67]">
              {t.reservation.successMessage}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white"
          >
            {t.reservation.done}
          </button>
        </div>
      )}
    </ModalDialog>
  );
}
