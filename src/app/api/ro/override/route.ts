import { NextResponse } from "next/server";
import {
  loadRoOverrideSettings,
  normalizeClubName,
  normalizeRoClockTime,
  normalizeSeasonSailwaveFile,
  normalizeSupportedLanguage,
  saveRoOverrideSettings,
} from "@/lib/server/roOverride";
import { normalizeClubIcon, saveClubIcon } from "@/lib/server/clubIcon";
import { loadSignOnWindowStatus } from "@/lib/server/timeWindow";
import { publishLiveUpdate } from "@/lib/server/liveUpdates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, timeWindow] = await Promise.all([
    loadRoOverrideSettings(),
    loadSignOnWindowStatus(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      settings,
      timeWindow,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Override details were not valid." },
      { status: 400 },
    );
  }

  if (!isPlainObject(body)) {
    return NextResponse.json(
      { ok: false, error: "Override details were not valid." },
      { status: 400 },
    );
  }

  const parsedOpenTime =
    "openTime" in body ? normalizeRoClockTime(body.openTime) : undefined;
  const parsedCloseTime =
    "closeTime" in body ? normalizeRoClockTime(body.closeTime) : undefined;
  const clubName = "clubName" in body ? normalizeClubName(body.clubName) : undefined;
  const language =
    "language" in body ? normalizeSupportedLanguage(body.language) : undefined;
  const seasonSailwaveFile =
    "seasonSailwaveFile" in body
      ? normalizeSeasonSailwaveFile(body.seasonSailwaveFile)
      : undefined;
  const icon = "icon" in body ? normalizeClubIcon(body.icon) : undefined;

  if (
    ("openTime" in body && !parsedOpenTime) ||
    ("closeTime" in body && !parsedCloseTime) ||
    ("clubName" in body && !clubName) ||
    ("language" in body && !language) ||
    ("seasonSailwaveFile" in body && !seasonSailwaveFile) ||
    ("icon" in body && !icon)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Check the club name, language, Sailwave file path, icon, and times.",
      },
      { status: 400 },
    );
  }

  const openTime = parsedOpenTime ?? undefined;
  const closeTime = parsedCloseTime ?? undefined;

  if (openTime && closeTime && timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
    return NextResponse.json(
      { ok: false, error: "Close time must be after open time." },
      { status: 400 },
    );
  }

  const currentSettings = await loadRoOverrideSettings();
  const nextOpenTime = openTime ?? currentSettings.openTime;
  const nextCloseTime = closeTime ?? currentSettings.closeTime;

  if (timeToMinutes(nextOpenTime) >= timeToMinutes(nextCloseTime)) {
    return NextResponse.json(
      { ok: false, error: "Close time must be after open time." },
      { status: 400 },
    );
  }

  const iconUpdatedAt = icon ? new Date().toISOString() : undefined;
  if (icon) {
    await saveClubIcon(icon);
  }

  const settings = await saveRoOverrideSettings({
    signOnOverrideOpen:
      typeof body.signOnOverrideOpen === "boolean"
        ? body.signOnOverrideOpen
        : currentSettings.signOnOverrideOpen,
    regattaMode:
      typeof body.regattaMode === "boolean"
        ? body.regattaMode
        : currentSettings.regattaMode,
    openTime,
    closeTime,
    clubName: clubName ?? undefined,
    language: language ?? undefined,
    seasonSailwaveFile: seasonSailwaveFile ?? undefined,
    iconUpdatedAt,
  });
  const timeWindow = await loadSignOnWindowStatus();
  publishLiveUpdate("ro-settings");

  return NextResponse.json({
    ok: true,
    settings,
    timeWindow,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
