"use client";

export type SharedDeletedRecord<T> = {
  deletedAt: number;
  item: T;
};

export type SharedAppState = {
  systems: unknown[];
  deletedSystems: SharedDeletedRecord<unknown>[];
  playDrafts: unknown[];
  deletedPlayDrafts: SharedDeletedRecord<unknown>[];
  tests: unknown[];
};

const SHARED_STATE_ENDPOINT = "/api/shared-state";

const defaultState: SharedAppState = {
  systems: [],
  deletedSystems: [],
  playDrafts: [],
  deletedPlayDrafts: [],
  tests: []
};

const normalizeState = (value: unknown): SharedAppState => {
  if (!value || typeof value !== "object") {
    return { ...defaultState };
  }

  const candidate = value as Partial<SharedAppState>;
  return {
    systems: Array.isArray(candidate.systems) ? candidate.systems : [],
    deletedSystems: Array.isArray(candidate.deletedSystems) ? candidate.deletedSystems : [],
    playDrafts: Array.isArray(candidate.playDrafts) ? candidate.playDrafts : [],
    deletedPlayDrafts: Array.isArray(candidate.deletedPlayDrafts) ? candidate.deletedPlayDrafts : [],
    tests: Array.isArray(candidate.tests) ? candidate.tests : []
  };
};

export const isSharedStorageEnabled = () =>
  typeof window !== "undefined" && process.env.NEXT_PUBLIC_SHARED_STORAGE_ENABLED === "true";

const runSyncRequest = (method: "GET" | "POST", state?: SharedAppState) => {
  if (!isSharedStorageEnabled()) {
    return null;
  }

  try {
    const request = new XMLHttpRequest();
    request.open(method, SHARED_STATE_ENDPOINT, false);
    request.setRequestHeader("Content-Type", "application/json");
    request.send(state ? JSON.stringify({ state }) : null);

    if (request.status < 200 || request.status >= 300) {
      return null;
    }

    const payload = JSON.parse(request.responseText) as { state?: SharedAppState };
    return normalizeState(payload.state);
  } catch {
    return null;
  }
};

export const loadSharedAppState = () => runSyncRequest("GET");

export const saveSharedAppState = (state: SharedAppState) =>
  runSyncRequest("POST", normalizeState(state));

export const getDefaultSharedAppState = () => ({ ...defaultState });
