"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { saveRetiredSignOff } from "@/components/RetireBySailNumberPanel";
import { useLiveUpdates } from "@/lib/useLiveUpdates";
import { normalizeSailNo, normalizeSearchText } from "@/lib/validation";
import type { SignRecordsResponse, TodaySailor } from "@/types";

type PageStatus = "loading" | "ready" | "error";
type SortKey = "time" | "name" | "class";
type StatusFilter = "signed_on_first" | "all" | TodaySailor["status"];
type RetireFeedback = {
  tone: "success" | "error";
  message: string;
};
const TODAY_LIVE_UPDATE_TYPES = ["ro-settings", "sign-records"] as const;

export function TodaysSailorsPanel() {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<SignRecordsResponse | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("time");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("signed_on_first");
  const [lookupQuery, setLookupQuery] = useState("");
  const [retiringParticipantId, setRetiringParticipantId] = useState<string | null>(
    null,
  );
  const [retireFeedback, setRetireFeedback] = useState<RetireFeedback | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const nextData = await fetchSignRecords();

        if (!cancelled) {
          setData(nextData);
          setStatus("ready");
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus("error");
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Today's sailors could not be loaded.",
          );
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const visibleSailors = useMemo(() => {
    const normalizedLookup = normalizeSearchText(lookupQuery);
    const normalizedLookupSailNo = normalizeSailNo(lookupQuery);
    const sailors = (data?.today ?? [])
      .filter((sailor) =>
        statusFilter === "all" || statusFilter === "signed_on_first"
          ? true
          : sailor.status === statusFilter,
      )
      .filter((sailor) =>
        sailorMatchesLookup(sailor, normalizedLookup, normalizedLookupSailNo),
      );

    return [...sailors].sort((left, right) =>
      compareSailors(left, right, sortBy, statusFilter),
    );
  }, [data, lookupQuery, sortBy, statusFilter]);

  const refreshToday = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setStatus("loading");
    }
    setError("");

    try {
      const nextData = await fetchSignRecords();
      setData(nextData);
      setStatus("ready");
    } catch (refreshError) {
      setStatus("error");
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Today's sailors could not be loaded.",
      );
    }
  }, []);

  const refreshLiveToday = useCallback(() => {
    void refreshToday({ showLoading: false });
  }, [refreshToday]);

  useLiveUpdates(TODAY_LIVE_UPDATE_TYPES, refreshLiveToday);

  async function markSailorRetired(sailor: TodaySailor) {
    if (sailor.status !== "signed_on") {
      return;
    }

    setRetiringParticipantId(sailor.participantId);
    setRetireFeedback(null);

    try {
      await saveRetiredSignOff(sailor.participantId);
      setRetireFeedback({
        tone: "success",
        message: `${sailor.helmName} marked as retired.`,
      });
      await refreshToday();
    } catch (retireError) {
      setRetireFeedback({
        tone: "error",
        message:
          retireError instanceof Error
            ? retireError.message
            : "The sailor could not be marked retired.",
      });
    } finally {
      setRetiringParticipantId(null);
    }
  }

  const timeWindow = data?.timeWindow;
  const regattaMode = data?.settings.regattaMode === true;
  const hasLookupQuery = Boolean(normalizeSearchText(lookupQuery));
  const hasActiveListFilter =
    hasLookupQuery || statusFilter !== "signed_on_first";

  return (
    <main className="min-h-dvh bg-[#f8fafc] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
              Race Officer
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Today&apos;s sailors
            </h1>
            {timeWindow ? (
              <p className="mt-2 text-sm font-medium text-slate-600">
                {timeWindow.label}: {timeWindow.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="grid h-11 place-items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Kiosk
            </Link>
            <Link
              href="/ro-manage"
              className="grid h-11 place-items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              RO Manage
            </Link>
            <a
              href="/api/sign?format=csv"
              className="grid h-11 place-items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Export CSV
            </a>
            <button
              type="button"
              onClick={() => void refreshToday()}
              className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Refresh
            </button>
          </div>
        </header>

        {data ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <SummaryMetric label="Signed on" value={data.summary.signedOn} />
            <SummaryMetric label="Signed off" value={data.summary.signedOff} />
            <SummaryMetric label="Retired" value={data.summary.retired} />
            <SummaryMetric label="Visitors" value={data.summary.visitors} />
            <SummaryMetric label="New" value={data.summary.newSailors} />
            <SummaryMetric label="Late" value={data.summary.lateSignOns} />
            <SummaryMetric label="Records" value={data.summary.totalRecords} />
          </div>
        ) : null}

        <section className="border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              Sign-on window
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              {timeWindow?.label ?? "Loading"}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {timeWindow?.message ?? "Checking race-day status."}
            </p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,1fr)_14rem_14rem]">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="text-sm font-semibold text-slate-600">
              Lookup sailor
            </span>
            <input
              type="search"
              value={lookupQuery}
              onChange={(event) => setLookupQuery(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              autoComplete="off"
              placeholder="Name, sail number, or boat class"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Sort by</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="time">Sign-on time</option>
              <option value="name">Name</option>
              <option value="class">Class</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-600">
              Filter status
            </span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <option value="signed_on_first">Signed on first</option>
              <option value="all">All statuses</option>
              <option value="signed_on">Signed on only</option>
              <option value="signed_off">Signed off only</option>
              <option value="retired">Retired only</option>
            </select>
          </label>

        </section>

        {status === "ready" && data ? (
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-600">
              Showing {visibleSailors.length} of {data.today.length} sailors
            </p>
            {hasActiveListFilter ? (
              <button
                type="button"
                onClick={() => {
                  setLookupQuery("");
                  setStatusFilter("signed_on_first");
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              >
                Clear lookup
              </button>
            ) : null}
          </div>
        ) : null}

        {retireFeedback ? (
          <p
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              retireFeedback.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {retireFeedback.message}
          </p>
        ) : null}

        {status === "loading" ? (
          <PanelMessage title="Loading today's sailors" />
        ) : null}

        {status === "error" ? (
          <PanelMessage title="Could not load today's sailors" message={error} />
        ) : null}

        {status === "ready" && visibleSailors.length === 0 ? (
          <PanelMessage
            title={
              data?.today.length && hasActiveListFilter
                ? "No sailors match that lookup"
                : "No sailors signed on yet"
            }
            message={
              data?.today.length && hasActiveListFilter
                ? "Try a name, sail number, or boat class from today's list."
                : "Signed-on sailors will appear here as records are saved."
            }
          />
        ) : null}

        {status === "ready" && visibleSailors.length > 0 ? (
          <SailorsCards
            onMarkRetired={(sailor) => void markSailorRetired(sailor)}
            regattaMode={regattaMode}
            retiringParticipantId={retiringParticipantId}
            sailors={visibleSailors}
          />
        ) : null}
      </div>
    </main>
  );
}

function SailorsCards({
  sailors,
  regattaMode,
  retiringParticipantId,
  onMarkRetired,
}: {
  sailors: TodaySailor[];
  regattaMode: boolean;
  retiringParticipantId: string | null;
  onMarkRetired: (sailor: TodaySailor) => void;
}) {
  return (
    <div className="grid gap-3">
      {sailors.map((sailor) => {
        const retiring = retiringParticipantId === sailor.participantId;
        const canMarkRetired = sailor.status === "signed_on";

        return (
          <article
            key={sailor.participantId}
            className="rounded-xl border border-slate-200 bg-white px-4 py-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <p className="truncate text-lg font-semibold text-slate-950">
                    {sailor.helmName}
                  </p>
                  <StatusPill status={sailor.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sailor.isVisitor ? <Flag label="Visitor" /> : null}
                  {sailor.isNewSailor ? <Flag label="New" /> : null}
                  {sailor.late ? <Flag label="Late" tone="amber" /> : null}
                  {sailor.roOverride ? (
                    <Flag label="RO override" tone="indigo" />
                  ) : null}
                  {sailor.retired ? <Flag label="Retired" tone="amber" /> : null}
                </div>
              </div>

              <dl className="grid min-w-0 gap-3 sm:grid-cols-3 lg:w-[34rem]">
                <SailorDetail label="Class" value={sailor.className || "Unlisted"} />
                <SailorDetail label="Sail" value={sailor.sailNo || "Missing"} />
                <SailorDetail
                  label="Time"
                  value={
                    sailor.signOffTime
                      ? `${formatTime(sailor.signOnTime)} / off ${formatTime(
                          sailor.signOffTime,
                        )}`
                      : formatTime(sailor.signOnTime)
                  }
                />
              </dl>

              {regattaMode ? (
                <button
                  type="button"
                  disabled={!canMarkRetired || retiring}
                  onClick={() => onMarkRetired(sailor)}
                  className="h-11 w-full rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-200 lg:w-36"
                >
                  {retiring
                    ? "Saving..."
                    : sailor.status === "retired"
                    ? "Retired"
                    : sailor.status === "signed_off"
                    ? "Signed off"
                    : "Mark retired"}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SailorDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
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

function StatusPill({ status }: { status: TodaySailor["status"] }) {
  if (status === "retired") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        Retired
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        status === "signed_on"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {status === "signed_on" ? "Signed on" : "Signed off"}
    </span>
  );
}

function Flag({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "amber" | "indigo";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {label}
    </span>
  );
}

function compareSailors(
  left: TodaySailor,
  right: TodaySailor,
  sortBy: SortKey,
  statusFilter: StatusFilter,
) {
  if (statusFilter === "signed_on_first") {
    const statusCompare = statusRank(left.status) - statusRank(right.status);

    if (statusCompare !== 0) {
      return statusCompare;
    }
  }

  if (sortBy === "name") {
    return left.helmName.localeCompare(right.helmName, "en-NZ", {
      sensitivity: "base",
    });
  }

  if (sortBy === "class") {
    const classCompare = (left.className ?? "").localeCompare(
      right.className ?? "",
      "en-NZ",
      { sensitivity: "base" },
    );

    return classCompare || left.helmName.localeCompare(right.helmName);
  }

  return right.signOnTime.localeCompare(left.signOnTime);
}

function statusRank(status: TodaySailor["status"]): number {
  if (status === "signed_on") {
    return 0;
  }

  if (status === "retired") {
    return 1;
  }

  return 2;
}

function sailorMatchesLookup(
  sailor: TodaySailor,
  normalizedLookup: string,
  normalizedLookupSailNo: string,
): boolean {
  if (!normalizedLookup) {
    return true;
  }

  const textMatch = [sailor.helmName, sailor.sailNo ?? "", sailor.className ?? ""]
    .map(normalizeSearchText)
    .some((value) => value.includes(normalizedLookup));

  if (textMatch) {
    return true;
  }

  const sailorSailNo = normalizeSailNo(sailor.sailNo ?? "", sailor.className);
  return Boolean(
    normalizedLookupSailNo && sailorSailNo.includes(normalizedLookupSailNo),
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchSignRecords(): Promise<SignRecordsResponse> {
  const response = await fetch("/api/sign", {
    cache: "no-store",
  });
  const data = (await response.json()) as SignRecordsResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "Today's sailors could not be loaded.");
  }

  return data;
}
