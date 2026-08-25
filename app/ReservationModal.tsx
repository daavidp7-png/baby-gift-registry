"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import GiftContactFields from "./GiftContactFields";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

type ReservationModalProps = {
  giftId: string;
  giftName: string;
  onClose: () => void;
  onReserved: () => void;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

export default function ReservationModal({
  giftId,
  giftName,
  onClose,
  onReserved,
}: ReservationModalProps) {
  const { language, t } = useLanguage();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const submitReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitState("submitting");
    setError("");

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId,
          name: formData.get("name"),
          email: formData.get("email"),
          message: formData.get("message"),
          language,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? t.reservation.errors.generic);
      }

      setSubmitState("success");
      onReserved();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t.reservation.errors.generic
      );
      setSubmitState("error");
    }
  };

  const canClose = submitState !== "submitting";

  return (
    <ModalDialog
      titleId="reservation-title"
      eyebrow={t.reservation.eyebrow}
      title={giftName}
      closeLabel={t.reservation.close}
      canClose={canClose}
      onClose={onClose}
    >
      {submitState === "success" ? (
          <div className="pt-6">
            <p className="font-semibold text-[#52705b]">{t.reservation.successTitle}</p>
            <p className="mt-2 leading-5 text-[#756b67]">
              {t.reservation.successMessage}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white"
            >
              {t.reservation.done}
            </button>
          </div>
        ) : (
          <form onSubmit={submitReservation} className="mt-5 grid gap-4">
            <GiftContactFields
              nameInputRef={nameInputRef}
              labels={t.reservation}
            />

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
                {t.reservation.cancel}
              </button>
              <button
                type="submit"
                disabled={submitState === "submitting"}
                className="flex-1 rounded-full bg-[#302b29] px-4 py-2.5 font-medium text-white disabled:cursor-wait disabled:opacity-60"
              >
                {submitState === "submitting" ? t.reservation.submitting : t.reservation.submit}
              </button>
            </div>
          </form>
      )}
    </ModalDialog>
  );
}
