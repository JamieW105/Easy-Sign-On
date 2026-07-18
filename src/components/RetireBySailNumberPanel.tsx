"use client";

import { useMemo, useState } from "react";
import type { SignRecordsResponse, TodaySailor } from "@/types";
import { normalizeSailNo } from "@/lib/validation";

type RetireStatus = "idle" | "loading" | "saving" | "success" | "error";

type RetireBySailNumberPanelProps = {
  data?: SignRecordsResponse | null;
  onChanged?: () => void | Promise<void>;
};

export function RetireBySailNumberPanel({
  data,
  onChanged,
}: RetireBySailNumberPanelProps) {
  const [localData, setLocalData] = useState<SignRecordsResponse | null>(null);
  const [sailNo, setSailNo] = useState("");
  const [status, setStatus] = useState<RetireStatus>("idle");
  const [message, setMessage] = useState("");

  const activeData = data ?? localData;
  const normalizedSailNo = normalizeSailNo(sailNo);
  const match = useMemo(
    () => findSignedOnSailorBySailNo(activeData?.today ?? [], normalizedSailNo),
    [activeData, normalizedSailNo],
  );

  async function ensureDataLoaded() {
    if (data) {
      return data;
    }

    setStatus("loading");
    setMessage("");
    const nextData = await fetchSignRecords();
    setLocalData(nextData);
    setStatus("idle");
    return nextData;
  }

  async function markRetired() {
    setMessage("");

    try {
      const currentData = await ensureDataLoaded();
      const sailor = findSignedOnSailorBySailNo(
        currentData.today,
        normalizeSailNo(sailNo),
      );

      if (!sailor) {
        setStatus("error");
        setMessage("No currently signed-on sailor was found for that sail number.");
        return;
      }

      setStatus("saving");
      await saveRetiredSignOff(sailor.participantId);
      setStatus("success");
      setMessage(`${sailor.helmName} marked as retired.`);
      setSailNo("");

      if (onChanged) {
        await onChanged();
      } else {
        setLocalData(await fetchSignRecords());
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The sailor could not be marked retired.",
      );
    }
  }

  const disabled = status === "loading" || status === "saving";

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Retire sailor
          </p>
          <label className="mt-3 block">
            <span className="text-sm font-semibold text-slate-600">
              Sail number
            </span>
            <input
              type="text"
              value={sailNo}
              disabled={disabled}
              onChange={(event) => {
                setSailNo(event.target.value);
                setStatus("idle");
                setMessage("");
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold uppercase text-slate-950 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              autoComplete="off"
              inputMode="text"
              placeholder="e.g. 12345"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={disabled || !normalizedSailNo}
          onClick={() => void markRetired()}
          className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-200"
        >
          {status === "saving" ? "Saving..." : "Mark retired"}
        </button>
      </div>

      {match ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Match: {match.helmName}
          {match.className ? `, ${match.className}` : ""}.
        </p>
      ) : normalizedSailNo && activeData ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          No currently signed-on sailor matches that sail number.
        </p>
      ) : null}

      {message ? (
        <p
          className={`mt-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function findSignedOnSailorBySailNo(
  sailors: TodaySailor[],
  sailNo: string,
): TodaySailor | null {
  if (!sailNo) {
    return null;
  }

  return (
    sailors.find(
      (sailor) =>
        sailor.status === "signed_on" &&
        normalizeSailNo(sailor.sailNo ?? "", sailor.className) === sailNo,
    ) ?? null
  );
}

export async function saveRetiredSignOff(participantId: string) {
  const response = await fetch("/api/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "retire",
      participantId,
    }),
  });
  const data = (await response.json().catch(() => null)) as
    | { ok: true }
    | { ok: false; error?: string }
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(
      data && "error" in data && data.error
        ? data.error
        : "The sailor could not be marked retired.",
    );
  }
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
