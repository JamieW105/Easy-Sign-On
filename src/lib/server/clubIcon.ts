import { promises as fs } from "fs";
import path from "path";
import { signonDataDir } from "@/lib/server/signRecords";

const MAX_ICON_BYTES = 512 * 1024;
const ALLOWED_ICON_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

type StoredClubIcon = { contentType: string; data: string };

export function normalizeClubIcon(value: unknown): StoredClubIcon | null {
  if (!isPlainObject(value) || typeof value.contentType !== "string" || typeof value.data !== "string") {
    return null;
  }

  if (!ALLOWED_ICON_TYPES.has(value.contentType)) {
    return null;
  }

  const decodedSize = Buffer.byteLength(value.data, "base64");
  if (!value.data || decodedSize > MAX_ICON_BYTES) {
    return null;
  }

  return { contentType: value.contentType, data: value.data };
}

export async function saveClubIcon(icon: StoredClubIcon): Promise<void> {
  const dataDir = signonDataDir();
  await fs.mkdir(/* turbopackIgnore: true */ dataDir, { recursive: true });
  await fs.writeFile(
    /* turbopackIgnore: true */ iconFile(),
    `${JSON.stringify(icon)}\n`,
    "utf8",
  );
}

export async function loadClubIcon(): Promise<StoredClubIcon | null> {
  try {
    const content = await fs.readFile(
      /* turbopackIgnore: true */ iconFile(),
      "utf8",
    );
    return normalizeClubIcon(JSON.parse(content));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function iconFile(): string {
  return path.join(signonDataDir(), "club-icon.json");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
