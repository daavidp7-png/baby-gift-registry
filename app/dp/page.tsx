"use client";

import { FormEvent, useState } from "react";
import { useLanguage } from "../i18n/LanguageProvider";
import {
  type ImageSyncFailureReason,
  type ImageSyncResult,
} from "../lib/imageSyncTypes";

type ActionStatus = "idle" | "refreshing" | "syncing";

export default function DpPage() {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncResult, setSyncResult] = useState<ImageSyncResult | null>(null);

  const isBusy = status !== "idle";

  function setRequestError(responseStatus: number) {
    setError(
      responseStatus === 401
        ? t.dp.unauthorized
        : responseStatus === 503
          ? t.dp.unavailable
          : t.dp.genericError
    );
  }

  async function refreshGifts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    setStatus("refreshing");
    setError("");
    setMessage("");
    setSyncResult(null);

    try {
      const response = await fetch("/api/dp/refresh-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setRequestError(response.status);
        return;
      }

      setAuthenticated(true);
      setMessage(t.dp.success);
    } catch {
      setError(t.dp.genericError);
    } finally {
      setStatus("idle");
    }
  }

  async function syncImages() {
    if (isBusy) return;

    setStatus("syncing");
    setError("");
    setMessage("");
    setSyncResult(null);

    try {
      const response = await fetch("/api/dp/sync-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setRequestError(response.status);
        return;
      }

      const data = (await response.json()) as {
        result?: ImageSyncResult;
      };

      if (!data.result) {
        setError(t.dp.genericError);
        return;
      }

      setAuthenticated(true);
      setMessage(t.dp.syncSuccess);
      setSyncResult(data.result);
    } catch {
      setError(t.dp.genericError);
    } finally {
      setStatus("idle");
    }
  }

  function failureReason(reason: ImageSyncFailureReason) {
    if (reason === "fetch_failed") {
      return t.dp.syncSummary.fetchFailedReason;
    }
    if (reason === "no_image") return t.dp.syncSummary.noImageReason;
    return t.dp.syncSummary.airtableUpdateFailedReason;
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
          {!authenticated && (
            <>
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
            </>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#352e2b] px-6 py-3 text-sm font-medium text-[#fffaf6] transition hover:bg-[#514641] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f6d62] disabled:cursor-wait disabled:opacity-70"
          >
            {status === "refreshing" ? t.dp.refreshing : t.dp.refresh}
          </button>

          <button
            type="button"
            disabled={isBusy || !password}
            onClick={syncImages}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#d9ccc5] bg-white px-6 py-3 text-sm font-medium text-[#514641] transition hover:bg-[#f8f3f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f6d62] disabled:cursor-wait disabled:opacity-70"
          >
            {status === "syncing" ? t.dp.syncingImages : t.dp.syncImages}
          </button>
        </form>

        <div aria-live="polite" className="mt-5 min-h-10 text-sm leading-6">
          {message && <p className="font-medium text-[#58705d]">{message}</p>}
          {error && <p className="text-[#9d615d]">{error}</p>}

          {syncResult && (
            <div className="mt-4 border-t border-[#e2d6d0] pt-4 text-[#796d67]">
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                <dt>{t.dp.syncSummary.checked}</dt><dd>{syncResult.checked}</dd>
                <dt>{t.dp.syncSummary.alreadyHadImage}</dt><dd>{syncResult.alreadyHadImage}</dd>
                <dt>{t.dp.syncSummary.imagesAdded}</dt><dd>{syncResult.imagesAdded}</dd>
                <dt>{t.dp.syncSummary.invalidProductUrl}</dt><dd>{syncResult.invalidProductUrl}</dd>
                <dt>{t.dp.syncSummary.fetchFailed}</dt><dd>{syncResult.fetchFailed}</dd>
                <dt>{t.dp.syncSummary.noImageFound}</dt><dd>{syncResult.noImageFound}</dd>
                <dt>{t.dp.syncSummary.airtableUpdateFailed}</dt><dd>{syncResult.airtableUpdateFailed}</dd>
              </dl>

              {syncResult.failures.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium text-[#514641]">
                    {t.dp.syncSummary.failedGifts}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {syncResult.failures.map((failure, index) => (
                      <li key={`${failure.giftName}-${failure.reason}-${index}`}>
                        {failure.giftName}: {failureReason(failure.reason)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
