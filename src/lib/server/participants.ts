import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Participant, ParticipantsResponse, PublicParticipant } from "@/types";
import {
  normalizeHelmName,
  normalizeSailNo,
  normalizeSearchText,
} from "@/lib/validation";
import { loadRoOverrideSettings } from "@/lib/server/roOverride";

type ParticipantCache = {
  filePath: string;
  mtimeMs: number;
  lastModified: string;
  participants: PublicParticipant[];
};

type RawParticipant = Record<string, string | undefined>;

let cache: ParticipantCache | null = null;

export class ParticipantLoadError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "read_failed" | "parse_failed",
    readonly cause?: unknown,
    readonly searchedPaths: string[] = [],
  ) {
    super(message);
    this.name = "ParticipantLoadError";
  }
}

export async function loadParticipants(): Promise<ParticipantsResponse> {
  const seasonalFile = await findSeasonalFile();

  let stat;
  try {
    stat = await fs.stat(/* turbopackIgnore: true */ seasonalFile);
  } catch (error) {
    throw new ParticipantLoadError(
      "The participant list could not be inspected.",
      "read_failed",
      error,
    );
  }

  if (
    cache &&
    cache.filePath === seasonalFile &&
    cache.mtimeMs === stat.mtimeMs
  ) {
    return {
      participants: cache.participants,
      source: {
        loaded: true,
        lastModified: cache.lastModified,
      },
    };
  }

  try {
    const content = await fs.readFile(
      /* turbopackIgnore: true */ seasonalFile,
      "utf8",
    );
    const participants = parseSeasonalBlw(content).map(toPublicParticipant);
    const lastModified = stat.mtime.toISOString();

    cache = {
      filePath: seasonalFile,
      mtimeMs: stat.mtimeMs,
      lastModified,
      participants,
    };

    return {
      participants,
      source: {
        loaded: true,
        lastModified,
      },
    };
  } catch (error) {
    if (error instanceof ParticipantLoadError) {
      throw error;
    }

    throw new ParticipantLoadError(
      "The participant list could not be loaded.",
      "parse_failed",
      error,
    );
  }
}

export function parseSeasonalBlw(content: string): Participant[] {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const candidates = [
    ...parseSailwaveCompetitors(text),
    ...parseDelimitedTables(text),
    ...parseXmlLikeRecords(text),
    ...parseKeyValueRecords(text),
  ];

  return normalizeParticipants(candidates);
}

function parseSailwaveCompetitors(text: string): RawParticipant[] {
  const records = new Map<string, RawParticipant>();

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const [rawKey, rawValue, rawRecordId] = splitDelimitedLine(line, ",");
    const key = unquote(rawKey ?? "");
    const value = unquote(rawValue ?? "");
    const recordId = unquote(rawRecordId ?? "");

    if (!key.startsWith("comp") || !recordId || !value) {
      continue;
    }

    const record = records.get(recordId) ?? { id: `sailwave-${recordId}` };
    const field = identifySailwaveField(key);

    if (field) {
      record[field] = value;
    } else {
      continue;
    }

    records.set(recordId, record);
  }

  return Array.from(records.values());
}

function identifySailwaveField(key: string): keyof NormalizedFields | null {
  switch (normalizeFieldKey(key)) {
    case "comphelmname":
      return "helmName";
    case "compclass":
      return "className";
    case "compsailno":
      return "sailNo";
    case "compaltsailno":
      return "altSailNo";
    case "compclub":
      return "club";
    default:
      return null;
  }
}

async function findSeasonalFile(): Promise<string> {
  const candidates = await seasonalFileCandidates();
  const seasonalFile = await firstExistingFile(candidates);

  if (seasonalFile) {
    return seasonalFile;
  }

  const discoveredCandidates = await discoveredSeasonalFileCandidates();
  const discoveredSeasonalFile = await firstExistingFile(discoveredCandidates);

  if (discoveredSeasonalFile) {
    return discoveredSeasonalFile;
  }

  throw new ParticipantLoadError(
    `No seasonal participant file was found. Checked: ${[
      ...candidates,
      ...discoveredCandidates,
    ].join(", ")}`,
    "not_found",
    undefined,
    uniqueStrings([...candidates, ...discoveredCandidates]),
  );
}

async function seasonalFileCandidates(): Promise<string[]> {
  const settings = await loadRoOverrideSettings();
  const configuredPath = settings.seasonSailwaveFile;
  const configuredDataDir = process.env.EASY_SIGN_ON_DATA_DIR?.trim();
  const fallbackDataDir =
    process.platform === "win32"
      ? path.join("data", "signon")
      : "/opt/easy-sign-on/data";

  return uniqueStrings(
    [
      configuredPath,
      "/app/data/seasonal.blw",
      configuredDataDir ? path.join(configuredDataDir, "seasonal.blw") : null,
      path.join(fallbackDataDir, "seasonal.blw"),
      path.join("data", "seasonal.blw"),
    ]
      .filter((candidate): candidate is string => Boolean(candidate)),
  );
}

async function firstExistingFile(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(/* turbopackIgnore: true */ candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Keep trying the fallback list.
    }
  }

  return null;
}

async function discoveredSeasonalFileCandidates(): Promise<string[]> {
  return [];
}

function parseDelimitedTables(text: string): RawParticipant[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const records: RawParticipant[] = [];
  const delimiters = ["\t", ",", ";", "|"];

  for (const delimiter of delimiters) {
    for (let index = 0; index < lines.length; index += 1) {
      const header = splitDelimitedLine(lines[index], delimiter);
      if (!looksLikeHeader(header)) {
        continue;
      }

      const fieldIndexes = mapHeaderIndexes(header);

      for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
        const row = splitDelimitedLine(lines[rowIndex], delimiter);
        if (row.length < 2 || looksLikeHeader(row)) {
          break;
        }

        const record: RawParticipant = {};
        for (const [field, columnIndex] of Object.entries(fieldIndexes)) {
          const value = row[columnIndex]?.trim();
          if (value) {
            record[field] = unquote(value);
          }
        }

        if (record.helmName) {
          records.push(record);
        }
      }
    }
  }

  return records;
}

function parseXmlLikeRecords(text: string): RawParticipant[] {
  const records: RawParticipant[] = [];
  const tagPattern =
    /<\s*(competitor|participant|sailor|row)\b([^>]*)>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  const selfClosingPattern =
    /<\s*(competitor|participant|sailor|row)\b([^>]*)\/\s*>/gi;

  for (const match of text.matchAll(tagPattern)) {
    const record = {
      ...parseXmlAttributes(match[2]),
      ...parseXmlChildren(match[3]),
    };
    records.push(record);
  }

  for (const match of text.matchAll(selfClosingPattern)) {
    records.push(parseXmlAttributes(match[2]));
  }

  return records;
}

function parseKeyValueRecords(text: string): RawParticipant[] {
  const records = new Map<string, RawParticipant>();
  let currentSection: string | null = null;

  for (const originalLine of text.split("\n")) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      currentSection = section[1].trim();
      continue;
    }

    const keyValue = /^([^:=\t]+)\s*[:=\t]\s*(.*)$/.exec(line);
    if (!keyValue) {
      continue;
    }

    const parsed = parseRecordKey(keyValue[1], currentSection);
    if (!parsed) {
      continue;
    }

    const record = records.get(parsed.recordId) ?? {};
    record[parsed.field] = unquote(keyValue[2].trim());
    records.set(parsed.recordId, record);
  }

  return Array.from(records.values());
}

function parseRecordKey(
  key: string,
  section: string | null,
): { recordId: string; field: keyof NormalizedFields } | null {
  const field = identifyField(key);
  if (!field) {
    return null;
  }

  const recordId = extractRecordId(key) ?? extractRecordId(section ?? "");
  if (!recordId) {
    return null;
  }

  return { recordId, field };
}

type NormalizedFields = Pick<
  Participant,
  "id" | "helmName" | "className" | "sailNo" | "altSailNo" | "club"
>;

function identifyField(key: string): keyof NormalizedFields | null {
  const normalized = normalizeFieldKey(key);

  if (
    hasFieldAlias(normalized, [
      "id",
      "compid",
      "competitorid",
      "competitorno",
      "competitornumber",
    ])
  ) {
    return "id";
  }

  if (
    hasFieldAlias(normalized, [
      "helmname",
      "helm",
      "helmfullname",
      "sailor",
      "sailorname",
      "name",
      "skipper",
      "skippername",
    ])
  ) {
    return "helmName";
  }

  if (
    hasFieldAlias(normalized, [
      "class",
      "classname",
      "boatclass",
      "fleet",
      "division",
      "rig",
    ])
  ) {
    return "className";
  }

  if (
    hasFieldAlias(normalized, [
      "altsailno",
      "altsailnumber",
      "altsailnum",
      "alternatesailno",
      "alternatesailnumber",
      "alternativesailno",
      "alternativesailnumber",
    ])
  ) {
    return "altSailNo";
  }

  if (
    hasFieldAlias(normalized, [
      "sailno",
      "sailnumber",
      "sailnum",
      "sail",
      "sailid",
    ])
  ) {
    return "sailNo";
  }

  if (hasFieldAlias(normalized, ["club", "clubname", "homeclub"])) {
    return "club";
  }

  return null;
}

function extractRecordId(value: string): string | null {
  const patterns = [
    /(?:competitor|participant|sailor|comp|entry|row)[^\d]{0,4}(\d+)/i,
    /(\d+)[^\d]{0,4}(?:competitor|participant|sailor|comp|entry|row)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match) {
      return `record-${match[1]}`;
    }
  }

  return null;
}

function normalizeParticipants(rawRecords: RawParticipant[]): Participant[] {
  const byKey = new Map<string, Participant>();

  for (const rawRecord of rawRecords) {
    const participant = rawToParticipant(rawRecord);
    if (!participant) {
      continue;
    }

    const dedupeKey = [
      normalizeSearchText(participant.helmName),
      normalizeSearchText(participant.className ?? ""),
      normalizeSearchText(participant.sailNo ?? ""),
    ].join("|");
    const existing = byKey.get(dedupeKey);

    byKey.set(
      dedupeKey,
      existing ? mergeParticipants(existing, participant) : participant,
    );
  }

  return Array.from(byKey.values()).sort((left, right) =>
    left.helmName.localeCompare(right.helmName, "en-NZ", {
      sensitivity: "base",
    }),
  );
}

function rawToParticipant(record: RawParticipant): Participant | null {
  const helmName = readRecordField(record, "helmName");
  if (!helmName) {
    return null;
  }

  const className = readRecordField(record, "className")?.trim();
  const normalizedHelmName = normalizeHelmName(helmName);
  const sailNo = normalizeSailNo(
    readRecordField(record, "sailNo") ?? "",
    className,
  );
  const altSailNo = normalizeSailNo(
    readRecordField(record, "altSailNo") ?? "",
    className,
  );
  const club = readRecordField(record, "club");
  const explicitId = readRecordField(record, "id");
  const fallbackKey = [normalizedHelmName, className ?? "", sailNo].join("|");

  return {
    id: explicitId ? String(explicitId).trim() : stableParticipantId(fallbackKey),
    helmName: normalizedHelmName,
    className,
    sailNo: sailNo || undefined,
    altSailNo: altSailNo || undefined,
    club,
    raw: record,
  };
}

function mergeParticipants(
  existing: Participant,
  incoming: Participant,
): Participant {
  return {
    ...incoming,
    id: existing.id || incoming.id,
    helmName: existing.helmName || incoming.helmName,
    className: existing.className || incoming.className,
    sailNo: existing.sailNo || incoming.sailNo,
    altSailNo: existing.altSailNo || incoming.altSailNo,
    club: existing.club || incoming.club,
    raw: {
      ...incoming.raw,
      ...existing.raw,
    },
  };
}

function toPublicParticipant(participant: Participant): PublicParticipant {
  return {
    id: participant.id,
    helmName: participant.helmName,
    className: participant.className,
    sailNo: participant.sailNo,
    altSailNo: participant.altSailNo,
    club: participant.club,
  };
}

function readRecordField(
  record: RawParticipant,
  field: keyof NormalizedFields,
): string | undefined {
  const direct = record[field]?.trim();
  if (direct) {
    return direct;
  }

  for (const [key, value] of Object.entries(record)) {
    if (identifyField(key) === field && value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function looksLikeHeader(fields: string[]): boolean {
  const normalizedFields = fields.map(normalizeFieldKey);
  const hasName = normalizedFields.some((field) =>
    hasFieldAlias(field, ["helmname", "helm", "sailor", "sailorname", "name"]),
  );
  const hasBoatContext = normalizedFields.some((field) =>
    hasFieldAlias(field, [
      "class",
      "classname",
      "boatclass",
      "fleet",
      "sailno",
      "sailnumber",
      "sailnum",
    ]),
  );

  return hasName && hasBoatContext;
}

function mapHeaderIndexes(fields: string[]): Record<string, number> {
  const indexes: Record<string, number> = {};

  fields.forEach((field, index) => {
    const mappedField = identifyField(field);
    if (mappedField && indexes[mappedField] === undefined) {
      indexes[mappedField] = index;
    }
  });

  return indexes;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") {
    return line.split("\t");
  }

  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseXmlAttributes(value: string): RawParticipant {
  const record: RawParticipant = {};
  const attributePattern = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

  for (const match of value.matchAll(attributePattern)) {
    record[match[1]] = htmlDecode(match[3] ?? match[4] ?? "");
  }

  return record;
}

function parseXmlChildren(value: string): RawParticipant {
  const record: RawParticipant = {};
  const childPattern = /<\s*([\w:-]+)\s*>\s*([^<]*)\s*<\s*\/\s*\1\s*>/g;

  for (const match of value.matchAll(childPattern)) {
    record[match[1]] = htmlDecode(match[2] ?? "");
  }

  return record;
}

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hasFieldAlias(normalizedKey: string, aliases: string[]): boolean {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeFieldKey(alias);
    return (
      normalizedKey === normalizedAlias ||
      normalizedKey.endsWith(normalizedAlias)
    );
  });
}

function normalizeFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stableParticipantId(value: string): string {
  return `p_${createHash("sha1").update(value).digest("hex").slice(0, 12)}`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
