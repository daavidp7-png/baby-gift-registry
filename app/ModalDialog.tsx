"use client";

import { type ReactNode, useEffect } from "react";

type ModalDialogProps = {
  titleId: string;
  eyebrow: string;
  title: string;
  closeLabel: string;
  canClose: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function ModalDialog({
  titleId,
  eyebrow,
  title,
  closeLabel,
  canClose,
  onClose,
  children,
}: ModalDialogProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canClose) onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [canClose, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={closeLabel}
        disabled={!canClose}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-[20px] bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#a18479]">
              {eyebrow}
            </p>
            <h2
              id={titleId}
              className="mt-1 text-xl font-semibold text-[#302b29]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={closeLabel}
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

        {children}
      </section>
    </div>
  );
}
