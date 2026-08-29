"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";
import ModalDialog from "./ModalDialog";

const INFO_SEEN_KEY = "giftRegistryInfoSeen";

export default function GiftRegistryInfoModal() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const understoodButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let shouldOpen = true;

    try {
      shouldOpen = sessionStorage.getItem(INFO_SEEN_KEY) !== "true";
    } catch {
      // Show the information when session storage is unavailable.
    }

    const openFrame = window.requestAnimationFrame(() => setOpen(shouldOpen));
    return () => window.cancelAnimationFrame(openFrame);
  }, []);

  useEffect(() => {
    if (open) understoodButtonRef.current?.focus();
  }, [open]);

  const closeModal = useCallback(() => {
    try {
      sessionStorage.setItem(INFO_SEEN_KEY, "true");
    } catch {
      // The modal can still close when session storage is unavailable.
    }

    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <ModalDialog
      titleId="gift-registry-info-title"
      eyebrow={t.giftRegistryInfo.eyebrow}
      title={t.giftRegistryInfo.title}
      closeLabel={t.giftRegistryInfo.close}
      canClose
      onClose={closeModal}
    >
      <div className="mt-5 text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f3e9e4] text-xl text-[#9a756d]"
        >
          ♡
        </span>

        <div className="mt-5 space-y-4 leading-6 text-[#514844]">
          <p>{t.giftRegistryInfo.introduction}</p>
          <p>
            <strong className="font-semibold text-[#302b29]">
              {t.giftRegistryInfo.purchaseNotice}
            </strong>{" "}
            {t.giftRegistryInfo.purchaseDetails}
          </p>
          <p>{t.giftRegistryInfo.closing}</p>
        </div>

        <button
          ref={understoodButtonRef}
          type="button"
          onClick={closeModal}
          className="mt-6 min-h-11 w-full rounded-full bg-[#302b29] px-5 py-2.5 font-medium text-white transition-colors hover:bg-[#514844] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#756b67] sm:mx-auto sm:w-auto sm:min-w-44"
        >
          {t.giftRegistryInfo.understood}
        </button>
      </div>
    </ModalDialog>
  );
}
