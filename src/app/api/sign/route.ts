import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createSignRecord,
  customParticipantsFromRecords,
  loadSignRecordsResponse,
  readSignRecords,
  signRecordsToCsv,
} from "@/lib/server/signRecords";
import { loadRoOverrideSettings } from "@/lib/server/roOverride";
import {
  loadParticipants,
  ParticipantLoadError,
} from "@/lib/server/participants";
import { loadSignOnWindowStatus } from "@/lib/server/timeWindow";
import { publishLiveUpdate } from "@/lib/server/liveUpdates";
import { normalizeSailNo, parseSignPayload } from "@/lib/validation";
import type { PublicParticipant } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const response = await loadSignRecordsResponse();

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new Response(signRecordsToCsv(response.records), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="today-sign-records.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Submit details were not valid." },
      { status: 400 },
    );
  }

  const parsed = parseSignPayload(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.message },
      { status: 400 },
    );
  }

  try {
    const [timeWindow, settings] = await Promise.all([
      loadSignOnWindowStatus(),
      loadRoOverrideSettings(),
    ]);
    if (
      parsed.payload.action === "sign_on" &&
      !timeWindow.isAcceptingSignOns
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sign-on is closed. Ask the Race Officer to use the override.",
        },
        { status: 409 },
      );
    }

    if ("participant" in parsed.payload && settings.regattaMode) {
      return NextResponse.json(
        {
          ok: false,
          error: "Regatta mode only accepts sailors from the Sailwave file.",
        },
        { status: 409 },
      );
    }

    const participant =
      "participant" in parsed.payload
        ? customParticipantFromPayload(parsed.payload.participant)
        : await findKnownParticipant(
            parsed.payload.participantId,
            !settings.regattaMode,
          );

    if (!participant) {
      return NextResponse.json(
        { ok: false, error: "That sailor was not found in today's list." },
        { status: 404 },
      );
    }

    const currentStatus = await findTodaySailorStatus(participant.id);
    if (parsed.payload.action === "sign_off") {
      if (currentStatus === "signed_off") {
        return NextResponse.json(
          { ok: false, error: "That sailor has already signed off today." },
          { status: 409 },
        );
      }

      if (!currentStatus) {
        return NextResponse.json(
          { ok: false, error: "That sailor has not signed on today." },
          { status: 409 },
        );
      }
    }

    if (parsed.payload.action === "retire") {
      if (currentStatus === "signed_off") {
        return NextResponse.json(
          { ok: false, error: "That sailor has already signed off today." },
          { status: 409 },
        );
      }

      if (!currentStatus) {
        return NextResponse.json(
          { ok: false, error: "That sailor has not signed on today." },
          { status: 409 },
        );
      }
    }

    const record = await createSignRecord({
      action: parsed.payload.action,
      participant,
      sailNo:
        parsed.payload.action === "sign_on"
          ? normalizeSailNo(parsed.payload.sailNo, participant.className)
          : undefined,
      source: "tablet",
      roOverride:
        parsed.payload.action === "sign_on"
          ? timeWindow.isOverrideActive && timeWindow.isAcceptingSignOns
          : false,
      retired:
        parsed.payload.action === "sign_off"
          ? parsed.payload.retired === true
          : parsed.payload.action === "retire",
      timeWindow,
    });

    publishLiveUpdate("sign-records");

    return NextResponse.json({ ok: true, recordId: record.id, record });
  } catch (error) {
    const status =
      error instanceof ParticipantLoadError && error.code === "not_found"
        ? 503
        : 500;

    console.error("Failed to store sign record", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          "The sign-on system could not save that entry. Ask the race team to try again.",
      },
      { status },
    );
  }
}

async function findTodaySailorStatus(
  participantId: string,
): Promise<"signed_on" | "signed_off" | "retired" | null> {
  const response = await loadSignRecordsResponse();
  return (
    response.today.find((sailor) => sailor.participantId === participantId)
      ?.status ?? null
  );
}

async function findKnownParticipant(
  participantId: string,
  includeCustomParticipants: boolean,
): Promise<PublicParticipant | null> {
  const [{ participants }, signRecords] = await Promise.all([
    loadParticipants(),
    readSignRecords().catch(() => []),
  ]);
  const allParticipants = [
    ...participants,
    ...(includeCustomParticipants
      ? customParticipantsFromRecords(signRecords)
      : []),
  ];

  return allParticipants.find((entry) => entry.id === participantId) ?? null;
}

function customParticipantFromPayload(
  participant: Omit<PublicParticipant, "id">,
): PublicParticipant {
  return {
    id: `custom-${randomUUID()}`,
    helmName: participant.helmName,
    className: participant.className,
    sailNo: participant.sailNo,
    club: participant.club,
    isVisitor: participant.isVisitor,
    isNewSailor: participant.isNewSailor,
  };
}
