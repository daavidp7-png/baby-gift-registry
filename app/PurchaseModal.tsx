"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GiftContactFields from "./GiftContactFields";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

type PurchasableStatus = "Available" | "Reserved";
type CurrentStatus = PurchasableStatus | "Purchased";

type PurchaseModalProps = {
  giftId: string;
  giftName: string;
  expectedStatus: PurchasableStatus;
  onClose: () => void;
  onPurchased: () => void;
  onStatusChanged: (status: CurrentStatus | undefined, message: string) => void;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

type PurchaseResponse = {
  error?: string;
  code?: string;
  currentStatus?: CurrentStatus;
};

export default function PurchaseModal({
  giftId,
  giftName,
  expectedStatus,
  onClose,
  onPurchased,
  onStatusChanged,
}: PurchaseModalProps) {
  const { language, t } = useLanguage();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const canClose = submitState !== "submitting";

  useEffect(() => {
    if (expectedStatus === "Available") {
      nameInputRef.current?.focus();
    } else {
      emailInputRef.current?.focus();
    }
  }, [expectedStatus]);

  const submitPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitState === "submitting") return;

    setSubmitState("submitting");
    setError("");

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId,
          expectedStatus,
          email:
            formData.get("email"),
          name:
            expectedStatus === "Available" ? formData.get("name") : undefined,
          message:
            expectedStatus === "Available"
              ? formData.get("message")
              : undefined,
          language,
        }),
      });
      const data = (await response.json()) as PurchaseResponse;

      if (!response.ok) {
        const message = data.error ?? t.purchase.errors.generic;

        if (
          data.code === "already_purchased" ||
          data.code === "stale_status"
        ) {
          onStatusChanged(data.currentStatus, message);
          return;
        }

        setError(message);
        setSubmitState("error");
        return;
      }

      setSubmitState("success");
      onPurchased();
    } catch {
      setError(t.purchase.errors.generic);
      setSubmitState("error");
    }
  };

  return (
    <ModalDialog
      titleId="purchase-title"
      eyebrow={t.purchase.eyebrow}
      title={giftName}
      closeLabel={t.purchase.close}
      canClose={canClose}
      onClose={onClose}
    >
      {submitState === "success" ? (
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
              {" — "}
              {t.gifts.statuses.purchased}
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
      ) : (
        <form onSubmit={submitPurchase} className="mt-5 grid gap-4">
          <p className="leading-5 text-[#756b67]">
            {expectedStatus === "Available"
              ? t.purchase.availableExplanation
              : t.purchase.reservedExplanation}
          </p>

          {expectedStatus === "Available" ? (
            <GiftContactFields
              nameInputRef={nameInputRef}
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
                required
                maxLength={254}
                autoComplete="email"
                className="rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
              />
            </label>
          )}

          {error && (
            <p role="alert" className="text-[#9d3f3f]">
              {error}
            </p>
          )}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={!canClose}
              onClick={onClose}
              className="flex-1 rounded-full border border-[#d8cec9] px-4 py-2.5 font-medium text-[#514844] disabled:opacity-40"
            >
              {t.purchase.cancel}
            </button>
            <button
              type="submit"
              disabled={submitState === "submitting"}
              className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-wait disabled:opacity-60"
            >
              {submitState === "submitting"
                ? t.purchase.submitting
                : t.purchase.confirm}
            </button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}
