import { NextResponse } from "next/server";
import {
  loadParticipants,
  ParticipantLoadError,
} from "@/lib/server/participants";
import {
  customParticipantsFromRecords,
  readSignRecords,
} from "@/lib/server/signRecords";
import { loadRoOverrideSettings } from "@/lib/server/roOverride";
import type { PublicParticipant } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [response, settings] = await Promise.all([
      loadParticipants(),
      loadRoOverrideSettings(),
    ]);
    const signRecords = settings.regattaMode
      ? []
      : await readSignRecords().catch(() => []);
    const customParticipants = settings.regattaMode
      ? []
      : customParticipantsFromRecords(signRecords);

    return NextResponse.json(
      {
        ...response,
        participants: mergeParticipants([
          ...response.participants,
          ...customParticipants,
        ]),
        settings,
      },
      {
      headers: {
        "Cache-Control": "no-store",
      },
      },
    );
  } catch (error) {
    const status =
      error instanceof ParticipantLoadError && error.code === "not_found"
        ? 404
        : 500;
    const searchedPaths =
      process.env.NODE_ENV === "production" ||
      !(error instanceof ParticipantLoadError)
        ? undefined
        : error.searchedPaths;

    console.error("Failed to load participants", error);

    return NextResponse.json(
      {
        participants: [],
        source: {
          loaded: false,
          lastModified: null,
        },
        error:
          "The sailor list is not available yet. Ask the race team to check seasonal.blw.",
        searchedPaths,
      },
      { status },
    );
  }
}

function mergeParticipants(participants: PublicParticipant[]): PublicParticipant[] {
  const byId = new Map<string, PublicParticipant>();

  for (const participant of participants) {
    byId.set(participant.id, participant);
  }

  return Array.from(byId.values()).sort((left, right) =>
    left.helmName.localeCompare(right.helmName, "en-NZ", {
      sensitivity: "base",
    }),
  );
}
