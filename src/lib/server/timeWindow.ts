import type { SignTimeWindowStatus } from "@/types";
import { loadRoOverrideSettings } from "@/lib/server/roOverride";

type LocalDateParts = {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
};

const DEFAULT_OPEN_TIME = "11:00";
const DEFAULT_CLOSE_TIME = "12:30";
const CLOSING_SOON_MINUTES = 10;

export function getSignOnWindowStatus(
  date = new Date(),
): SignTimeWindowStatus {
  const timeZone = process.env.SIGNON_TIMEZONE?.trim() || "Pacific/Auckland";
  const openTime = normalizedTime(process.env.SIGNON_OPEN_TIME) || DEFAULT_OPEN_TIME;
  const closeTime =
    normalizedTime(process.env.SIGNON_CLOSE_TIME) || DEFAULT_CLOSE_TIME;
  const override = process.env.SIGNON_WINDOW_OVERRIDE?.trim().toLowerCase();

  if (override === "open" || override === "closed") {
    const accepting = override === "open";

    return {
      state: "overridden",
      label: accepting ? "Override open" : "Override closed",
      message: accepting
        ? "RO override is allowing sign-on outside the normal window."
        : "RO override has closed sign-on for now.",
      isAcceptingSignOns: accepting,
      isOverrideActive: true,
      openTime,
      closeTime,
      timeZone,
    };
  }

  return baseSignOnWindowStatus({
    date,
    timeZone,
    openTime,
    closeTime,
    overrideOpen: false,
  });
}

export async function loadSignOnWindowStatus(
  date = new Date(),
): Promise<SignTimeWindowStatus> {
  const timeZone = process.env.SIGNON_TIMEZONE?.trim() || "Pacific/Auckland";
  const settings = await loadRoOverrideSettings();
  const openTime = settings.openTime;
  const closeTime = settings.closeTime;
  const override = process.env.SIGNON_WINDOW_OVERRIDE?.trim().toLowerCase();

  if (override === "open" || override === "closed") {
    const accepting = override === "open";

    return {
      state: "overridden",
      label: accepting ? "Stack override open" : "Stack override closed",
      message: accepting
        ? "Stack override is allowing sign-on outside the normal window."
        : "Stack override has closed sign-on for now.",
      isAcceptingSignOns: accepting,
      isOverrideActive: true,
      openTime,
      closeTime,
      timeZone,
    };
  }

  return baseSignOnWindowStatus({
    date,
    timeZone,
    openTime,
    closeTime,
    overrideOpen: settings.signOnOverrideOpen,
  });
}

function baseSignOnWindowStatus({
  date,
  timeZone,
  openTime,
  closeTime,
  overrideOpen,
}: {
  date: Date;
  timeZone: string;
  openTime: string;
  closeTime: string;
  overrideOpen: boolean;
}): SignTimeWindowStatus {
  if (overrideOpen) {
    return {
      state: "overridden",
      label: "RO override open",
      message: "RO override is allowing sign-on outside the normal window.",
      isAcceptingSignOns: true,
      isOverrideActive: true,
      openTime,
      closeTime,
      timeZone,
    };
  }

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const local = getLocalDateParts(date, timeZone);
  const nowMinutes = local.hour * 60 + local.minute;

  if (nowMinutes >= openMinutes && nowMinutes < closeMinutes) {
    const closingSoonAt = Math.max(
      openMinutes,
      closeMinutes - CLOSING_SOON_MINUTES,
    );
    const closingSoon = nowMinutes >= closingSoonAt;

    return {
      state: closingSoon ? "closing_soon" : "open",
      label: closingSoon ? "Closing soon" : "Open",
      message: closingSoon
        ? `Sign-on closes at ${closeTime}.`
        : `Sign-on is open until ${closeTime}.`,
      isAcceptingSignOns: true,
      isOverrideActive: false,
      openTime,
      closeTime,
      timeZone,
    };
  }

  return {
    state: "closed",
    label: "Closed",
    message:
      nowMinutes < openMinutes
        ? `Sign-on opens at ${openTime}.`
        : `Sign-on closed at ${closeTime}.`,
    isAcceptingSignOns: false,
    isOverrideActive: false,
    openTime,
    closeTime,
    timeZone,
  };
}

export function todayLocalDateString(date = new Date()): string {
  const timeZone = process.env.SIGNON_TIMEZONE?.trim() || "Pacific/Auckland";
  const parts = getLocalDateParts(date, timeZone);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizedTime(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}
