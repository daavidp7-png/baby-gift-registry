"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";

const TARGET_TIME = new Date("2026-12-27T13:10:00Z").getTime();

type RemainingTime = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  arrived: boolean;
};

function getRemainingTime(): RemainingTime {
  const remaining = Math.max(0, TARGET_TIME - Date.now());

  return {
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining / 3_600_000) % 24),
    minutes: Math.floor((remaining / 60_000) % 60),
    seconds: Math.floor((remaining / 1_000) % 60),
    arrived: remaining === 0,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default function ArrivalCountdown() {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState<RemainingTime | null>(null);

  useEffect(() => {
    let interval: number | undefined;
    const update = () => {
      const nextRemaining = getRemainingTime();
      setRemaining(nextRemaining);
      if (nextRemaining.arrived && interval !== undefined) {
        window.clearInterval(interval);
      }
    };

    update();
    if (Date.now() < TARGET_TIME) {
      interval = window.setInterval(update, 1_000);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);

  if (remaining?.arrived) {
    return (
      <div className="mt-8 rounded-2xl border border-[#ddcec6] px-8 py-5 text-sm font-medium tracking-wide text-[#796d67] sm:mt-10">
        {t.home.arrived}
      </div>
    );
  }

  const units = [
    {
      label: t.home.days,
      value: remaining ? String(remaining.days) : "---",
    },
    {
      label: t.home.hours,
      value: remaining ? pad(remaining.hours) : "--",
    },
    {
      label: t.home.minutes,
      value: remaining ? pad(remaining.minutes) : "--",
    },
    {
      label: t.home.seconds,
      value: remaining ? pad(remaining.seconds) : "--",
    },
  ];

  return (
    <section
      aria-label={t.home.countdownIntro}
      className="mt-8 w-full max-w-xl sm:mt-10"
    >
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b7d76]">
        {t.home.countdownIntro} <span aria-hidden="true">♡</span>
      </p>
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#ddcec6] sm:grid-cols-4">
        {units.map((unit, index) => (
          <div
            key={unit.label}
            className={`flex min-h-24 flex-col items-center justify-center px-3 py-4 ${
              index % 2 === 1 ? "border-l border-[#e1d4cd]" : ""
            } ${
              index >= 2 ? "border-t border-[#e1d4cd] sm:border-t-0" : ""
            } ${
              index > 0 && index % 2 === 0
                ? "sm:border-l sm:border-[#e1d4cd]"
                : ""
            }`}
          >
            <span className="min-w-[3ch] text-3xl font-medium leading-none tabular-nums text-[#352e2b]">
              {unit.value}
            </span>
            <span className="mt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#8b7d76]">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
