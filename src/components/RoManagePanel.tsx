"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLiveUpdates } from "@/lib/useLiveUpdates";
import {
  supportedLanguages,
  type RoSettings,
  type SignTimeWindowStatus,
  type SupportedLanguage,
} from "@/types";

type PageStatus = "loading" | "ready" | "error";
type OverrideResponse =
  | {
      ok: true;
      settings: RoSettings;
      timeWindow: SignTimeWindowStatus;
    }
  | {
      ok: false;
      error?: string;
    };
const RO_MANAGE_LIVE_UPDATE_TYPES = ["ro-settings"] as const;

export function RoManagePanel() {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<RoSettings | null>(null);
  const [timeWindow, setTimeWindow] = useState<SignTimeWindowStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [clubName, setClubName] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const [seasonSailwaveFile, setSeasonSailwaveFile] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextOverride = await fetchOverrideSettings();

        if (!cancelled) {
          setSettings(nextOverride.settings);
          setTimeWindow(nextOverride.timeWindow);
          setOpenTime(nextOverride.settings.openTime);
          setCloseTime(nextOverride.settings.closeTime);
          setClubName(nextOverride.settings.clubName);
          setLanguage(nextOverride.settings.language);
          setSeasonSailwaveFile(nextOverride.settings.seasonSailwaveFile);
          setStatus("ready");
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus("error");
          setError(
            loadError instanceof Error
              ? loadError.message
              : "RO settings could not be loaded.",
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSettings = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setStatus("loading");
    }
    setError("");
    setSaveError("");

    try {
      const nextOverride = await fetchOverrideSettings();
      setSettings(nextOverride.settings);
      setTimeWindow(nextOverride.timeWindow);
      setOpenTime(nextOverride.settings.openTime);
      setCloseTime(nextOverride.settings.closeTime);
      setClubName(nextOverride.settings.clubName);
      setLanguage(nextOverride.settings.language);
      setSeasonSailwaveFile(nextOverride.settings.seasonSailwaveFile);
      setStatus("ready");
    } catch (refreshError) {
      setStatus("error");
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "RO settings could not be loaded.",
      );
    }
  }, []);

  const refreshLiveSettings = useCallback(() => {
    void refreshSettings({ showLoading: false });
  }, [refreshSettings]);

  useLiveUpdates(RO_MANAGE_LIVE_UPDATE_TYPES, refreshLiveSettings);

  async function saveSettings(
    nextSettings: Partial<RoSettings> & {
      icon?: { contentType: string; data: string };
    },
  ) {
    setSaving(true);
    setSaveError("");

    try {
      const nextOverride = await saveOverrideSettings(nextSettings);
      setSettings(nextOverride.settings);
      setTimeWindow(nextOverride.timeWindow);
      setOpenTime(nextOverride.settings.openTime);
      setCloseTime(nextOverride.settings.closeTime);
      setClubName(nextOverride.settings.clubName);
      setLanguage(nextOverride.settings.language);
      setSeasonSailwaveFile(nextOverride.settings.seasonSailwaveFile);
      setStatus("ready");
    } catch (updateError) {
      setSaveError(
        updateError instanceof Error
          ? updateError.message
          : "RO override could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveClubSettings() {
    const icon = iconFile ? await readIcon(iconFile) : undefined;
    await saveSettings({ clubName, language, seasonSailwaveFile, icon });
    setIconFile(null);
  }

  const overrideOpen = settings?.signOnOverrideOpen === true;
  const regattaMode = settings?.regattaMode === true;

  return (
    <main className="min-h-dvh bg-[#f8fafc] text-slate-950">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
              Race Officer
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              RO Manage
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Manage race-day controls that affect the sign-on kiosk.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/today"
              className="grid h-11 place-items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Today
            </Link>
            <Link
              href="/"
              className="grid h-11 place-items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Kiosk
            </Link>
            <button
              type="button"
              onClick={() => void refreshSettings()}
              className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Refresh
            </button>
          </div>
        </header>

        {status === "loading" ? <PanelMessage title="Loading RO controls" /> : null}

        {status === "error" ? (
          <PanelMessage title="Could not load RO controls" message={error} />
        ) : null}

        {status === "ready" ? (
          <>
            <section className="border-b border-slate-200 pb-5">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Sign-on window
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {timeWindow?.label ?? "Unknown"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-600">
                {timeWindow?.message ?? "Race-day status is unavailable."}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Window {timeWindow?.openTime ?? settings?.openTime} to{" "}
                {timeWindow?.closeTime ?? settings?.closeTime}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Site mode
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-950">
                    {regattaMode ? "Regatta mode" : "Club mode"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Regatta mode only accepts sailors from the Sailwave file.
                  </p>
                </div>

                <label className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-4 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={regattaMode}
                    disabled={saving}
                    onChange={(event) =>
                      void saveSettings({ regattaMode: event.target.checked })
                    }
                    className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-100"
                  />
                  Regatta mode
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Club settings
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  Brand and data source
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  These settings apply to every connected kiosk immediately.
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-600">Club name</span>
                  <input
                    value={clubName}
                    disabled={saving}
                    onChange={(event) => setClubName(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-600">Language</span>
                  <select
                    value={language}
                    disabled={saving}
                    onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {supportedLanguages.map((item) => (
                      <option key={item} value={item}>{languageLabel(item)}</option>
                    ))}
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-600">Season Sailwave file</span>
                  <input
                    value={seasonSailwaveFile}
                    disabled={saving}
                    onChange={(event) => setSeasonSailwaveFile(event.target.value)}
                    placeholder="/opt/easy-sign-on/seasonal.blw"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <span className="mt-1 block text-xs font-medium text-slate-500">Use the absolute path from the server root.</span>
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-600">Icon (favicon)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                    disabled={saving}
                    onChange={(event) => setIconFile(event.target.files?.[0] ?? null)}
                    className="mt-2 block w-full text-sm font-medium text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  <span className="mt-1 block text-xs font-medium text-slate-500">PNG, JPEG, WebP, SVG, or ICO up to 512 KB.</span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveClubSettings()}
                  className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-200"
                >
                  Save club settings
                </button>
                {settings?.iconUpdatedAt ? (
                  // The persistent icon is served by an API route, so it cannot use Next's static image optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/club-settings/icon?updated=${encodeURIComponent(settings.iconUpdatedAt)}`}
                    alt="Current club icon"
                    className="h-9 w-9 rounded-lg border border-slate-200 object-contain"
                  />
                ) : null}
              </div>
              {saveError ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{saveError}</p> : null}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  RO override
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {overrideOpen ? "Override open" : "Override off"}
                </p>
                {settings?.updatedAt ? (
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Updated {formatDateTime(settings.updatedAt)}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-4 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={overrideOpen}
                    disabled={saving}
                    onChange={(event) =>
                      void saveSettings({
                        signOnOverrideOpen: event.target.checked,
                      })
                    }
                    className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-100"
                  />
                  Allow sign-on outside normal hours
                </label>
                <span className="text-sm font-medium text-slate-500">
                  {saving ? "Saving..." : "Used by the kiosk immediately"}
                </span>
              </div>

              {saveError ? (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                  {saveError}
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Sign-on times
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {settings?.openTime} to {settings?.closeTime}
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-600">
                    Open
                  </span>
                  <input
                    type="time"
                    value={openTime}
                    disabled={saving}
                    onChange={(event) => setOpenTime(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-600">
                    Close
                  </span>
                  <input
                    type="time"
                    value={closeTime}
                    disabled={saving}
                    onChange={(event) => setCloseTime(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSettings({ openTime, closeTime })}
                  className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-200"
                >
                  Save times
                </button>
              </div>

              {saveError ? (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                  {saveError}
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function PanelMessage({ title, message }: { title: string; message?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-5">
      <p className="text-base font-semibold text-slate-950">{title}</p>
      {message ? (
        <p className="mt-2 text-sm font-medium text-slate-600">{message}</p>
      ) : null}
    </div>
  );
}

function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchOverrideSettings(): Promise<Extract<OverrideResponse, { ok: true }>> {
  const response = await fetch("/api/ro/override", {
    cache: "no-store",
  });
  const data = (await response.json()) as OverrideResponse;

  if (!response.ok || !data.ok) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : "RO override settings could not be loaded.",
    );
  }

  return data;
}

async function saveOverrideSettings({
  signOnOverrideOpen,
  regattaMode,
  openTime,
  closeTime,
  clubName,
  language,
  seasonSailwaveFile,
  icon,
}: {
  signOnOverrideOpen?: boolean;
  regattaMode?: boolean;
  openTime?: string;
  closeTime?: string;
  clubName?: string;
  language?: SupportedLanguage;
  seasonSailwaveFile?: string;
  icon?: { contentType: string; data: string };
}): Promise<Extract<OverrideResponse, { ok: true }>> {
  const response = await fetch("/api/ro/override", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signOnOverrideOpen,
      regattaMode,
      openTime,
      closeTime,
      clubName,
      language,
      seasonSailwaveFile,
      icon,
    }),
  });
  const data = (await response.json()) as OverrideResponse;

  if (!response.ok || !data.ok) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : "RO override settings could not be saved.",
    );
  }

  return data;
}

async function readIcon(file: File): Promise<{ contentType: string; data: string }> {
  if (file.size > 512 * 1024) {
    throw new Error("The icon must be 512 KB or smaller.");
  }
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { contentType: file.type || "image/x-icon", data: btoa(binary) };
}

function languageLabel(language: SupportedLanguage): string {
  return ({ en: "English", es: "Spanish", fr: "French", de: "German", ru: "Russian", uk: "Ukrainian", "zh-CN": "Chinese (Simplified Mandarin)", "zh-HK": "Chinese (Cantonese)" })[language];
}
