"use client";

import { type ReactNode, useEffect, useRef } from "react";

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
  const dialogRef = useRef<HTMLElement>(null);
  const canCloseRef = useRef(canClose);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    canCloseRef.current = canClose;
    onCloseRef.current = onClose;
  }, [canClose, onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canCloseRef.current) {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog?.contains(document.activeElement)) {
        dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
      }
    });

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        disabled={!canClose}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[20px] bg-white p-5 shadow-2xl sm:p-6"
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
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-[#756b67] disabled:opacity-40"
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
