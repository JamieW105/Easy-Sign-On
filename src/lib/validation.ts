import type { PublicParticipant, SignAction } from "@/types";

export type CustomParticipantPayload = Pick<
  PublicParticipant,
  "helmName" | "className" | "sailNo" | "club" | "isVisitor" | "isNewSailor"
>;

export type SignPayload =
  | {
      action: "sign_on";
      participantId: string;
      sailNo: string;
    }
  | {
      action: "sign_on";
      participant: CustomParticipantPayload;
      sailNo: string;
    }
  | {
      action: "sign_off";
      participantId: string;
      retired?: boolean;
    }
  | {
      action: "retire";
      participantId: string;
    };

export function normalizeSailNo(value: string, className?: string): string {
  const compact = value
    .trim()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!compact) {
    return "";
  }

  const normalizedClass = normalizeSearchText(className ?? "").replace(
    /[^a-z0-9]/g,
    "",
  );
  const isNumericOnlyClass = ["ilca", "laser", "420", "okdinghy"].some(
    (entry) => normalizedClass.includes(entry),
  );
  const isAlphaNumericClass = ["optimist", "opti"].some((entry) =>
    normalizedClass.includes(entry),
  );

  if (isNumericOnlyClass) {
    const numeric = compact.replace(/O/g, "0").replace(/[^0-9]/g, "");
    return stripLeadingZeroes(numeric);
  }

  if (isAlphaNumericClass && /[A-Z]/.test(compact)) {
    return compact.replace(/0/g, "O");
  }

  if (/^\d+$/.test(compact)) {
    return stripLeadingZeroes(compact);
  }

  return compact;
}

export function normalizeHelmName(value: string): string {
  return titleCaseName(
    value
      .trim()
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " "),
  ).replace(/\bBenj\b/g, "Benji");
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isSignAction(value: unknown): value is SignAction {
  return value === "sign_on" || value === "sign_off";
}

export function parseSignPayload(
  value: unknown,
):
  | { ok: true; payload: SignPayload }
  | { ok: false; message: string } {
  if (!isPlainObject(value)) {
    return { ok: false, message: "Submit details were not valid." };
  }

  if (!isSignAction(value.action) && value.action !== "retire") {
    return { ok: false, message: "Choose sign on or sign off." };
  }

  if (value.action === "sign_on") {
    const hasCustomParticipant = isPlainObject(value.participant);
    const customParticipant = parseCustomParticipant(value.participant);
    if (customParticipant.ok) {
      const sailNo = normalizeSailNo(
        typeof value.sailNo === "string"
          ? value.sailNo
          : customParticipant.participant.sailNo ?? "",
        customParticipant.participant.className,
      );

      if (!sailNo) {
        return {
          ok: false,
          message: "Enter the sail number you are using today.",
        };
      }

      return {
        ok: true,
        payload: {
          action: "sign_on",
          participant: {
            ...customParticipant.participant,
            sailNo,
          },
          sailNo,
        },
      };
    }
    if (hasCustomParticipant) {
      return { ok: false, message: customParticipant.message };
    }

    if (
      typeof value.participantId !== "string" ||
      !value.participantId.trim()
    ) {
      return { ok: false, message: "Choose your name before submitting." };
    }

    if (typeof value.sailNo !== "string" || !normalizeSailNo(value.sailNo)) {
      return {
        ok: false,
        message: "Enter the sail number you are using today.",
      };
    }

    return {
      ok: true,
      payload: {
        action: "sign_on",
        participantId: value.participantId.trim(),
        sailNo: normalizeSailNo(value.sailNo),
      },
    };
  }

  if (typeof value.participantId !== "string" || !value.participantId.trim()) {
    return { ok: false, message: "Choose your name before submitting." };
  }

  if (value.action === "retire") {
    return {
      ok: true,
      payload: {
        action: "retire",
        participantId: value.participantId.trim(),
      },
    };
  }

  return {
    ok: true,
    payload: {
      action: "sign_off",
      participantId: value.participantId.trim(),
      retired: value.retired === true,
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCustomParticipant(
  value: unknown,
):
  | { ok: true; participant: CustomParticipantPayload }
  | { ok: false; message: string } {
  if (!isPlainObject(value)) {
    return { ok: false, message: "No new sailor details were supplied." };
  }

  const helmName =
    typeof value.helmName === "string" ? normalizeHelmName(value.helmName) : "";
  const className =
    typeof value.className === "string" ? value.className.trim() : "";
  const sailNo = normalizeSailNo(
    typeof value.sailNo === "string" ? value.sailNo : "",
    className,
  );
  const club = typeof value.club === "string" ? value.club.trim() : "";
  const isVisitor = value.isVisitor === true;
  const isNewSailor = value.isNewSailor === true;

  if (!helmName) {
    return { ok: false, message: "Enter the sailor name." };
  }

  if (!className) {
    return { ok: false, message: "Enter the sailor class." };
  }

  if (!sailNo) {
    return { ok: false, message: "Enter the sail number." };
  }

  if (!isVisitor && !isNewSailor) {
    return {
      ok: false,
      message: "Mark the sailor as a visitor or a new club sailor.",
    };
  }

  return {
    ok: true,
    participant: {
      helmName,
      className,
      sailNo,
      club: club || undefined,
      isVisitor,
      isNewSailor,
    },
  };
}

function stripLeadingZeroes(value: string): string {
  if (!value) {
    return "";
  }

  return value.replace(/^0+(?=\d)/, "");
}

function titleCaseName(value: string): string {
  return value
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((hyphenPart) =>
          hyphenPart
            .split("'")
            .map((apostrophePart) => {
              if (!apostrophePart) {
                return apostrophePart;
              }

              return (
                apostrophePart.charAt(0).toUpperCase() +
                apostrophePart.slice(1).toLowerCase()
              );
            })
            .join("'"),
        )
        .join("-"),
    )
    .join(" ");
}
