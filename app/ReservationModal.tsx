"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";

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
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && submitState !== "submitting") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    nameInputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, submitState]);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t.reservation.close}
        disabled={!canClose}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-title"
        className="relative z-10 w-full max-w-md rounded-[20px] bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#a18479]">
              {t.reservation.eyebrow}
            </p>
            <h2
              id="reservation-title"
              className="mt-1 text-xl font-semibold text-[#302b29]"
            >
              {giftName}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t.reservation.close}
            disabled={!canClose}
            onClick={onClose}
            className="p-1 text-[#756b67] disabled:opacity-40"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="m5 5 14 14M19 5 5 19" />
            </svg>
          </button>
        </div>

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
            <label className="grid gap-1.5">
              <span className="font-medium text-[#514844]">{t.reservation.name}</span>
              <input
                ref={nameInputRef}
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                className="rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="font-medium text-[#514844]">{t.reservation.email}</span>
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                className="rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="font-medium text-[#514844]">
                {t.reservation.message} <span className="font-normal text-[#958985]">{t.reservation.optional}</span>
              </span>
              <textarea
                name="message"
                rows={3}
                maxLength={1000}
                className="resize-none rounded-lg border border-[#d8cec9] bg-white px-3 py-2.5 outline-none focus:border-[#302b29]"
              />
            </label>

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
      </section>
    </div>
  );
}
