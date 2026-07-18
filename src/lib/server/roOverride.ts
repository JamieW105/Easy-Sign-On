import { promises as fs } from "fs";
import path from "path";
import { supportedLanguages, type RoSettings, type SupportedLanguage } from "@/types";

export type RoOverrideSettings = RoSettings;

const DEFAULT_OPEN_TIME = "11:00";
const DEFAULT_CLOSE_TIME = "12:30";
const DEFAULT_CLUB_NAME = "Easy Sign On";

let writeQueue: Promise<void> = Promise.resolve();

export async function loadRoOverrideSettings(): Promise<RoOverrideSettings> {
  const defaults = defaultSettings();

  try {
    const content = await fs.readFile(
      /* turbopackIgnore: true */ settingsFile(),
      "utf8",
    );
    const parsed = JSON.parse(content) as Partial<RoOverrideSettings>;

    return {
      signOnOverrideOpen: parsed.signOnOverrideOpen === true,
      regattaMode: parsed.regattaMode === true,
      openTime: normalizedTime(parsed.openTime) || defaults.openTime,
      closeTime: normalizedTime(parsed.closeTime) || defaults.closeTime,
      clubName: normalizeClubName(parsed.clubName) || defaults.clubName,
      language: normalizeSupportedLanguage(parsed.language) || defaults.language,
      seasonSailwaveFile:
        normalizeSeasonSailwaveFile(parsed.seasonSailwaveFile) ||
        defaults.seasonSailwaveFile,
      iconUpdatedAt:
        typeof parsed.iconUpdatedAt === "string" && parsed.iconUpdatedAt
          ? parsed.iconUpdatedAt
          : null,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt
          ? parsed.updatedAt
          : null,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaults;
    }

    throw error;
  }
}

export async function saveRoOverrideSettings(
  nextSettings: Partial<
    Pick<
      RoOverrideSettings,
      | "signOnOverrideOpen"
      | "regattaMode"
      | "openTime"
      | "closeTime"
      | "clubName"
      | "language"
      | "seasonSailwaveFile"
      | "iconUpdatedAt"
    >
  >,
): Promise<RoOverrideSettings> {
  const current = await loadRoOverrideSettings();
  const settings: RoOverrideSettings = {
    signOnOverrideOpen:
      nextSettings.signOnOverrideOpen ?? current.signOnOverrideOpen,
    regattaMode: nextSettings.regattaMode ?? current.regattaMode,
    openTime: normalizedTime(nextSettings.openTime) ?? current.openTime,
    closeTime: normalizedTime(nextSettings.closeTime) ?? current.closeTime,
    clubName: normalizeClubName(nextSettings.clubName) ?? current.clubName,
    language: normalizeSupportedLanguage(nextSettings.language) ?? current.language,
    seasonSailwaveFile:
      normalizeSeasonSailwaveFile(nextSettings.seasonSailwaveFile) ??
      current.seasonSailwaveFile,
    iconUpdatedAt: nextSettings.iconUpdatedAt ?? current.iconUpdatedAt,
    updatedAt: new Date().toISOString(),
  };
  const pendingWrite = writeQueue.then(async () => {
    const dataDir = signonDataDir();
    await fs.mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
    await fs.writeFile(
      /* turbopackIgnore: true */ settingsFile(),
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf8",
    );
  });

  writeQueue = pendingWrite.catch(() => undefined);
  await pendingWrite;
  return settings;
}

export function normalizeRoClockTime(value: unknown): string | null {
  return typeof value === "string" ? normalizedTime(value) : null;
}

export function normalizeClubName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= 100 ? normalized : null;
}

export function normalizeSupportedLanguage(
  value: unknown,
): SupportedLanguage | null {
  return typeof value === "string" && supportedLanguages.includes(value as SupportedLanguage)
    ? (value as SupportedLanguage)
    : null;
}

export function normalizeSeasonSailwaveFile(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > 1024) {
    return null;
  }

  return path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    ? normalized
    : null;
}

function defaultSettings(): RoOverrideSettings {
  return {
    signOnOverrideOpen: false,
    regattaMode: false,
    openTime:
      normalizedTime(process.env.EASY_SIGN_ON_OPEN_TIME) || DEFAULT_OPEN_TIME,
    closeTime:
      normalizedTime(process.env.EASY_SIGN_ON_CLOSE_TIME) || DEFAULT_CLOSE_TIME,
    clubName:
      normalizeClubName(process.env.EASY_SIGN_ON_CLUB_NAME) ||
      DEFAULT_CLUB_NAME,
    language:
      normalizeSupportedLanguage(process.env.EASY_SIGN_ON_LANGUAGE) || "en",
    seasonSailwaveFile:
      normalizeSeasonSailwaveFile(
        process.env.EASY_SIGN_ON_SEASON_SAILWAVE_CONTAINER_FILE,
      ) || "/seasonal/seasonal.blw",
    iconUpdatedAt: null,
    updatedAt: null,
  };
}

function settingsFile(): string {
  return path.join(signonDataDir(), "ro-settings.json");
}

function signonDataDir(): string {
  const configured = process.env.EASY_SIGN_ON_DATA_DIR?.trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    return path.join("data", "signon");
  }

  return "/opt/easy-sign-on/data";
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

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
