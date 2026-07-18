"use client";

import { useEffect } from "react";
import type { LiveUpdateType } from "@/lib/server/liveUpdates";

type LiveUpdateMessage =
  | {
      type: LiveUpdateType;
    }
  | {
      type: "connected";
    };

export function useLiveUpdates(
  types: readonly LiveUpdateType[],
  onUpdate: (type: LiveUpdateType) => void,
) {
  const typesKey = types.join("|");

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }

    const allowedTypes = new Set(typesKey.split("|") as LiveUpdateType[]);
    const events = new EventSource("/api/live");

    events.onmessage = (event) => {
      const message = parseLiveUpdateMessage(event.data);
      if (!message || message.type === "connected") {
        return;
      }

      if (allowedTypes.has(message.type)) {
        onUpdate(message.type);
      }
    };

    return () => {
      events.close();
    };
  }, [onUpdate, typesKey]);
}

function parseLiveUpdateMessage(data: string): LiveUpdateMessage | null {
  try {
    const value = JSON.parse(data) as Partial<LiveUpdateMessage>;
    if (
      value.type === "connected" ||
      value.type === "ro-settings" ||
      value.type === "sign-records"
    ) {
      return { type: value.type };
    }
  } catch {
    return null;
  }

  return null;
}
