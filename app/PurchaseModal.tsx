"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GiftContactFields from "./GiftContactFields";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

type PurchasableStatus = "Available" | "Reserved";
type CurrentStatus = PurchasableStatus | "Purchased";
type Classification =
  | "available"
  | "reserved_by_you"
  | "reserved_by_other"
  | "purchased"
  | "changed";
type Step = "form" | "reviewing" | "review" | "confirming" | "success";
type ContactDetails = { name: string; email: string; message: string };
type ReviewItem = {
  giftId: string;
  name: string;
  price: number;
  classification: Classification;
  eligible: boolean;
  status?: CurrentStatus;
};

type PurchaseModalProps = {
  giftId: string;
  giftName: string;
  expectedStatus: PurchasableStatus;
  defaultName?: string;
  defaultEmail?: string;
  onClose: () => void;
  onPurchased: () => void;
  onStatusChanged: (status: CurrentStatus | undefined, message: string) => void;
};

type PurchaseResponse = {
  error?: string;
  code?: string;
  currentStatus?: CurrentStatus;
  item?: ReviewItem;
};

const chfFormatter = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PurchaseModal({
  giftId,
  giftName,
  expectedStatus,
  defaultName,
  defaultEmail,
  onClose,
  onPurchased,
  onStatusChanged,
}: PurchaseModalProps) {
  const { language, t } = useLanguage();
  const [step, setStep] = useState<Step>("form");
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [reviewItem, setReviewItem] = useState<ReviewItem | null>(null);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const busy = step === "reviewing" || step === "confirming";

  useEffect(() => {
    if (step !== "form") return;
    if (expectedStatus === "Available") nameInputRef.current?.focus();
    else emailInputRef.current?.focus();
  }, [expectedStatus, step]);

  const request = async (
    action: "review" | "confirm",
    details: ContactDetails
  ) => {
    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        giftId,
        expectedStatus,
        email: details.email,
        name: expectedStatus === "Available" ? details.name : undefined,
        message: expectedStatus === "Available" ? details.message : undefined,
        language,
      }),
    });
    const data = (await response.json()) as PurchaseResponse;
    if (!response.ok) {
      const message = data.error ?? t.purchase.errors.generic;
      if (
        action === "confirm" &&
        (data.code === "already_purchased" || data.code === "stale_status")
      ) {
        onStatusChanged(data.currentStatus, message);
      }
      throw new Error(message);
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
      setReviewItem(data.item ?? null);
      setStep("review");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : t.purchase.errors.generic
      );
      setStep("form");
    }
  };

  const confirmPurchase = async () => {
    if (!contact || !reviewItem?.eligible || busy) return;
    setStep("confirming");
    setError("");

    try {
      await request("confirm", contact);
      onPurchased();
      setStep("success");
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : t.purchase.errors.generic
      );
      setStep("review");
    }
  };

  const classificationLabel = (classification: Classification) => {
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

  return (
    <ModalDialog
      titleId="purchase-title"
      eyebrow={t.purchase.eyebrow}
      title={giftName}
      closeLabel={t.purchase.close}
      canClose={!busy}
      onClose={onClose}
    >
      {(step === "form" || step === "reviewing") && (
        <form onSubmit={reviewPurchase} className="mt-5 grid gap-4">
          <p className="leading-5 text-[#756b67]">
            {expectedStatus === "Available"
              ? t.purchase.availableExplanation
              : t.purchase.reservedExplanation}
          </p>
          {expectedStatus === "Available" ? (
            <GiftContactFields
              nameInputRef={nameInputRef}
              defaultName={contact?.name ?? defaultName}
              defaultEmail={contact?.email ?? defaultEmail}
              defaultMessage={contact?.message}
              labels={t.reservation}
            />
          ) : (
            <label className="grid gap-1.5">
              <span className="font-medium text-[#514844]">
                {t.purchase.email}
              </span>
              <input
                ref={emailInputRef}
                name="email"
                type="email"
                defaultValue={contact?.email ?? defaultEmail}
                required
                maxLength={254}
                autoComplete="email"
                className="rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
              />
            </label>
          )}
          {error && <p role="alert" className="text-[#9d3f3f]">{error}</p>}
          <div className="mt-1 flex gap-2">
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

      {(step === "review" || step === "confirming") && reviewItem && (
        <div className="mt-5">
          <h3 className="font-semibold text-[#302b29]">
            {t.purchase.reviewTitle}
          </h3>
          <div className="mt-3 rounded-xl bg-[#faf7f5] px-4 py-3">
            <span className="text-[#756b67]">{t.purchase.purchaseTotal}</span>
            <strong className="ml-2 font-semibold text-[#302b29]">
              {chfFormatter.format(reviewItem.price)}
            </strong>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#faf7f5] px-3 py-2.5">
            <span
              aria-hidden="true"
              className={reviewItem.eligible ? "text-[#52705b]" : "text-[#9d615d]"}
            >
              {reviewItem.eligible ? "✓" : "✕"}
            </span>
            <span>
              <span className="font-medium text-[#302b29]">{reviewItem.name}</span>
              <span className="text-[#756b67]">
                {" — "}{classificationLabel(reviewItem.classification)}
              </span>
            </span>
          </div>
          {!reviewItem.eligible && (
            <p role="alert" className="mt-3 text-[#9d3f3f]">
              {t.bulkPurchase.noEligible}
            </p>
          )}
          {error && <p role="alert" className="mt-3 text-[#9d3f3f]">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("form")}
              className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
            >
              {t.bulkPurchase.back}
            </button>
            <button
              type="button"
              disabled={!reviewItem.eligible || busy}
              onClick={confirmPurchase}
              className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === "confirming"
                ? t.bulkPurchase.processing
                : t.purchase.confirm}
            </button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="pt-6">
          <p className="font-semibold text-[#52705b]">
            {t.purchase.successTitle}
          </p>
          <p className="mt-2 leading-5 text-[#756b67]">
            {t.purchase.successMessage}
          </p>
          <p className="mt-4 rounded-xl bg-[#faf7f5] px-4 py-3 text-[#52705b]">
            <span aria-hidden="true">✓</span>{" "}
            <span className="font-medium text-[#302b29]">{giftName}</span>
            <span className="text-[#756b67]">
              {" — "}{t.gifts.statuses.purchased}
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white"
          >
            {t.purchase.done}
          </button>
        </div>
      )}
    </ModalDialog>
  );
}
