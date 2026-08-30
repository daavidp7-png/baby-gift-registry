"use client";

import { FormEvent, useState } from "react";
import { useLanguage } from "../i18n/LanguageProvider";

export default function DpPage() {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function refreshGifts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/dp/refresh-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setStatus("error");
        setError(response.status === 401 ? t.dp.unauthorized : response.status === 503 ? t.dp.unavailable : t.dp.genericError);
        return;
      }

      setPassword("");
      setStatus("success");
    } catch {
      setStatus("error");
      setError(t.dp.genericError);
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-[#faf7f5] px-5 py-12 text-[#352e2b] sm:min-h-[calc(100dvh-4rem)] sm:px-8">
      <section className="w-full max-w-md rounded-3xl border border-[#e2d6d0] bg-[#fffdfb] p-7 sm:p-9">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#9d7b70]">
          {t.dp.eyebrow}
        </p>
        <h1 className="mt-3 text-2xl font-medium tracking-[-0.02em]">
          {t.dp.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#796d67]">
          {t.dp.description}
        </p>

        <form className="mt-7" onSubmit={refreshGifts}>
          <label htmlFor="dp-password" className="block text-sm font-medium">
            {t.dp.password}
          </label>
          <input
            id="dp-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#d9ccc5] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#9d7b70] focus:ring-2 focus:ring-[#9d7b70]/15"
          />

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#352e2b] px-6 py-3 text-sm font-medium text-[#fffaf6] transition hover:bg-[#514641] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f6d62] disabled:cursor-wait disabled:opacity-70"
          >
            {status === "loading" ? t.dp.refreshing : t.dp.refresh}
          </button>
        </form>

        <div aria-live="polite" className="mt-5 min-h-10 text-sm leading-6">
          {status === "success" && <p className="text-[#58705d]">{t.dp.success}</p>}
          {status === "error" && <p className="text-[#9d615d]">{error}</p>}
        </div>
      </section>
    </main>
  );
}
