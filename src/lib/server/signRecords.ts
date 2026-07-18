import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  PublicParticipant,
  RoSettings,
  SignRecordAction,
  SignRecord,
  SignRecordsResponse,
  SignTimeWindowStatus,
  TodaySailor,
} from "@/types";
import { loadRoOverrideSettings } from "@/lib/server/roOverride";
import {
  getSignOnWindowStatus,
  loadSignOnWindowStatus,
  todayLocalDateString,
} from "@/lib/server/timeWindow";

type CreateSignRecordInput = {
  action: SignRecordAction;
  participant: PublicParticipant;
  sailNo?: string;
  source?: SignRecord["source"];
  retired?: boolean;
  roOverride?: boolean;
  timeWindow?: SignTimeWindowStatus;
};

let writeQueue: Promise<void> = Promise.resolve();

export async function createSignRecord({
  action,
  participant,
  sailNo,
  source = "tablet",
  retired = false,
  roOverride = false,
  timeWindow = getSignOnWindowStatus(),
}: CreateSignRecordInput): Promise<SignRecord> {
  const effectiveWindowState = roOverride ? "overridden" : timeWindow.state;
  const record: SignRecord = {
    id: randomUUID(),
    action,
    participantId: participant.id,
    helmName: participant.helmName,
    className: participant.className,
    sailNo,
    club: participant.club,
    isVisitor: participant.isVisitor,
    isNewSailor: participant.isNewSailor,
    late:
      action === "sign_on" &&
      !["open", "closing_soon"].includes(timeWindow.state),
    retired: action === "retire" ? true : action === "sign_off" ? retired : undefined,
    roOverride,
    timeWindowState: effectiveWindowState,
    timestamp: formatZonedTimestamp(
      new Date(),
      process.env.SIGNON_TIMEZONE?.trim() || "Pacific/Auckland",
    ),
    source,
  };

  await appendRecord(record);
  return record;
}

export async function readSignRecords(): Promise<SignRecord[]> {
  const recordsFile = signRecordsFile();

  try {
    const content = await fs.readFile(
      /* turbopackIgnore: true */ recordsFile,
      "utf8",
    );

    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseRecordLine)
      .filter((record): record is SignRecord => Boolean(record));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function loadSignRecordsResponse(): Promise<SignRecordsResponse> {
  const records = await readSignRecords();
  const todayDate = todayLocalDateString();
  const todaysRecords = records.filter((record) =>
    record.timestamp.startsWith(todayDate),
  );
  const today = summarizeTodaySailors(todaysRecords);
  const [settings, timeWindow] = await Promise.all([
    loadRoOverrideSettings(),
    loadSignOnWindowStatus(),
  ]);

  return {
    records: todaysRecords,
    today,
    summary: {
      totalRecords: todaysRecords.length,
      signedOn: today.filter((entry) => entry.status === "signed_on").length,
      signedOff: today.filter((entry) => entry.status === "signed_off").length,
      retired: today.filter((entry) => entry.retired).length,
      visitors: today.filter((entry) => entry.isVisitor).length,
      newSailors: today.filter((entry) => entry.isNewSailor).length,
      lateSignOns: today.filter((entry) => entry.late).length,
    },
    timeWindow,
    settings: publicRoSettings(settings),
  };
}

export function customParticipantsFromRecords(
  records: SignRecord[],
): PublicParticipant[] {
  const participants = new Map<string, PublicParticipant>();

  for (const record of records) {
    if (record.action !== "sign_on") {
      continue;
    }

    if (!record.isVisitor && !record.isNewSailor) {
      continue;
    }

    participants.set(record.participantId, {
      id: record.participantId,
      helmName: record.helmName,
      className: record.className,
      sailNo: record.sailNo,
      club: record.club,
      isVisitor: record.isVisitor,
      isNewSailor: record.isNewSailor,
    });
  }

  return Array.from(participants.values()).sort((left, right) =>
    left.helmName.localeCompare(right.helmName, "en-NZ", {
      sensitivity: "base",
    }),
  );
}

export function signRecordsToCsv(records: SignRecord[]): string {
  const header = [
    "id",
    "action",
    "participantId",
    "helmName",
    "className",
    "sailNo",
    "club",
    "isVisitor",
    "isNewSailor",
    "late",
    "retired",
    "roOverride",
    "timeWindowState",
    "timestamp",
    "source",
  ];
  const rows = records.map((record) =>
    header.map((key) => csvCell(record[key as keyof SignRecord])).join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

async function appendRecord(record: SignRecord): Promise<void> {
  const dataDir = signonDataDir();
  const recordsFile = signRecordsFile();
  const line = `${JSON.stringify(record)}\n`;
  const pendingWrite = writeQueue.then(async () => {
    await fs.mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
    await fs.appendFile(/* turbopackIgnore: true */ recordsFile, line, {
      encoding: "utf8",
      flag: "a",
    });
  });

  writeQueue = pendingWrite.catch(() => undefined);
  await pendingWrite;
}

export function signonDataDir(): string {
  const configured = process.env.EASY_SIGN_ON_DATA_DIR?.trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    return path.join("data", "signon");
  }

  return "/opt/easy-sign-on/data";
}

function signRecordsFile(): string {
  return path.join(signonDataDir(), "sign-records.jsonl");
}

function summarizeTodaySailors(records: SignRecord[]): TodaySailor[] {
  const byParticipant = new Map<string, TodaySailor>();
  const sortedRecords = [...records].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  for (const record of sortedRecords) {
    if (record.action === "sign_on") {
      byParticipant.set(record.participantId, {
        participantId: record.participantId,
        helmName: record.helmName,
        className: record.className,
        sailNo: record.sailNo,
        club: record.club,
        isVisitor: record.isVisitor,
        isNewSailor: record.isNewSailor,
        late: record.late,
        roOverride: record.roOverride,
        signOnTime: record.timestamp,
        status: "signed_on",
      });
      continue;
    }

    const existing = byParticipant.get(record.participantId);
    if (record.action === "retire") {
      if (existing && existing.status !== "signed_off") {
        byParticipant.set(record.participantId, {
          ...existing,
          retired: true,
          status: "retired",
        });
      }
      continue;
    }

    if (existing) {
      byParticipant.set(record.participantId, {
        ...existing,
        retired: existing.retired || record.retired,
        signOffTime: record.timestamp,
        status: "signed_off",
      });
    }
  }

  return Array.from(byParticipant.values()).sort((left, right) =>
    left.signOnTime.localeCompare(right.signOnTime),
  );
}

function parseRecordLine(line: string): SignRecord | null {
  try {
    const value = JSON.parse(line) as Partial<SignRecord>;
    if (
      typeof value.id !== "string" ||
      !isSignAction(value.action) ||
      typeof value.participantId !== "string" ||
      typeof value.helmName !== "string" ||
      typeof value.timestamp !== "string"
    ) {
      return null;
    }

    return {
      id: value.id,
      action: value.action,
      participantId: value.participantId,
      helmName: value.helmName,
      className: value.className,
      sailNo: value.sailNo,
      altSailNo: value.altSailNo,
      club: value.club,
      isVisitor: value.isVisitor,
      isNewSailor: value.isNewSailor,
      late: value.late,
      retired: value.retired,
      roOverride: value.roOverride,
      timeWindowState: value.timeWindowState,
      timestamp: value.timestamp,
      source: value.source === "web" ? "web" : "tablet",
    };
  } catch {
    return null;
  }
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function isSignAction(value: unknown): value is SignRecordAction {
  return value === "sign_on" || value === "sign_off" || value === "retire";
}

function publicRoSettings(settings: RoSettings): RoSettings {
  return {
    signOnOverrideOpen: settings.signOnOverrideOpen,
    regattaMode: settings.regattaMode,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    clubName: settings.clubName,
    language: settings.language,
    seasonSailwaveFile: settings.seasonSailwaveFile,
    iconUpdatedAt: settings.iconUpdatedAt,
    updatedAt: settings.updatedAt,
  };
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function formatZonedTimestamp(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  const second = part("second");
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    date.getMilliseconds(),
  );
  const offsetMinutes = Math.round((localAsUtc - date.getTime()) / 60000);
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMinute = String(absoluteOffset % 60).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${offsetSign}${offsetHour}:${offsetMinute}`;
}
