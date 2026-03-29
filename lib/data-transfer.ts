"use client";

import { getDefaultSharedAppState, saveSharedAppState } from "@/lib/shared-app-state";

const STORAGE_KEYS = {
  systems: "football-system-layouts",
  deletedSystems: "football-system-layouts-deleted",
  playDraftSelection: "football-play-draft-selection",
  playDrafts: "football-play-drafts",
  deletedPlayDrafts: "football-play-drafts-deleted",
  tests: "football-tests"
} as const;

export type ExportBundle = {
  version: 1;
  exportedAt: number;
  data: Record<string, unknown>;
};

const parseStoredValue = (raw: string | null) => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

export const createExportBundle = (): ExportBundle => {
  const data = Object.fromEntries(
    Object.entries(STORAGE_KEYS).map(([key, storageKey]) => [key, parseStoredValue(window.localStorage.getItem(storageKey))])
  );

  return {
    version: 1,
    exportedAt: Date.now(),
    data
  };
};

export const downloadExportBundle = () => {
  const bundle = createExportBundle();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date(bundle.exportedAt).toISOString().replace(/[:.]/g, "-");

  anchor.href = url;
  anchor.download = `football-data-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);

  return bundle;
};

export const importExportBundle = (bundle: unknown) => {
  if (!bundle || typeof bundle !== "object" || !("data" in bundle)) {
    throw new Error("読み込むデータの形式が正しくありません。");
  }

  const data = (bundle as ExportBundle).data;

  Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
    const value = data[key];

    if (value === undefined || value === null) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(value));
  });

  saveSharedAppState({
    ...getDefaultSharedAppState(),
    systems: Array.isArray(data.systems) ? data.systems : [],
    deletedSystems: Array.isArray(data.deletedSystems) ? data.deletedSystems : [],
    playDrafts: Array.isArray(data.playDrafts) ? data.playDrafts : [],
    deletedPlayDrafts: Array.isArray(data.deletedPlayDrafts) ? data.deletedPlayDrafts : [],
    tests: Array.isArray(data.tests) ? data.tests : []
  });
};
