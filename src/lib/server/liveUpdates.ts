import { EventEmitter } from "events";

export type LiveUpdateType = "ro-settings" | "sign-records";

export type LiveUpdate = {
  id: string;
  type: LiveUpdateType;
  timestamp: string;
};

type LiveUpdateState = {
  emitter: EventEmitter;
  sequence: number;
};

const stateKey = "__easySignOnLiveUpdateState";

function liveUpdateState(): LiveUpdateState {
  const globalState = globalThis as typeof globalThis & {
    [stateKey]?: LiveUpdateState;
  };

  if (!globalState[stateKey]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalState[stateKey] = {
      emitter,
      sequence: 0,
    };
  }

  return globalState[stateKey];
}

export function publishLiveUpdate(type: LiveUpdateType): LiveUpdate {
  const state = liveUpdateState();
  state.sequence += 1;

  const update: LiveUpdate = {
    id: String(state.sequence),
    type,
    timestamp: new Date().toISOString(),
  };

  state.emitter.emit("update", update);
  return update;
}

export function subscribeLiveUpdates(
  listener: (update: LiveUpdate) => void,
): () => void {
  const { emitter } = liveUpdateState();
  emitter.on("update", listener);

  return () => {
    emitter.off("update", listener);
  };
}
