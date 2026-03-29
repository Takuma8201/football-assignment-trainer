"use client";

import {
  type OffenseVariant
} from "@/lib/system-storage";
import {
  type SharedDeletedRecord,
  loadSharedAppState,
  saveSharedAppState
} from "@/lib/shared-app-state";

type PathPoint = {
  x: number;
  y: number;
};

export type SavedToleranceBoxes = {
  main?: PathPoint[];
  leftBranch?: PathPoint[];
  rightBranch?: PathPoint[];
};

type AnchorMode = "center" | "leftFoot" | "rightFoot";
export type SavedLineType = "straight" | "curve" | "bend";

export type SavedPlayPath = {
  playerId: string;
  points: PathPoint[];
  lineType?: SavedLineType;
  controlPoint?: PathPoint;
  blockTargetId?: string;
  leftBranchPoint?: PathPoint;
  rightBranchPoint?: PathPoint;
};

export type SavedPlayDraft = {
  id: string;
  name: string;
  playType: "run" | "pass";
  playDetailType: "inside" | "openSide" | "short" | "long";
  displayVariant: OffenseVariant;
  studyDisplayVariant: OffenseVariant;
  assignmentSide: "offense" | "defense";
  toleranceYards: number;
  offensePackageId?: string;
  defenseSystemId?: string;
  anchorByPlayerId: Record<string, AnchorMode>;
  toleranceByPlayerId: Record<string, SavedToleranceBoxes>;
  paths: SavedPlayPath[];
  createdAt: number;
};

const PLAY_STORAGE_KEY = "football-play-drafts";
const DELETED_PLAY_STORAGE_KEY = "football-play-drafts-deleted";
const DELETE_RETENTION_MS = 24 * 60 * 60 * 1000;

type DeletedPlayDraft = SharedDeletedRecord<SavedPlayDraft>;

const normalizePlayDrafts = (value: unknown): SavedPlayDraft[] =>
  Array.isArray(value) ? (value as SavedPlayDraft[]) : [];

const normalizeDeletedPlayDrafts = (value: unknown): DeletedPlayDraft[] =>
  Array.isArray(value) ? (value as DeletedPlayDraft[]) : [];

const getLocalRecords = (): SavedPlayDraft[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PLAY_STORAGE_KEY);
    return normalizePlayDrafts(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

const getLocalDeletedRecords = (): DeletedPlayDraft[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DELETED_PLAY_STORAGE_KEY);
    return normalizeDeletedPlayDrafts(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

const saveLocalRecords = (records: SavedPlayDraft[]) => {
  window.localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(records));
  return records;
};

const saveLocalDeletedRecords = (records: DeletedPlayDraft[]) => {
  window.localStorage.setItem(DELETED_PLAY_STORAGE_KEY, JSON.stringify(records));
  return records;
};

const purgeExpiredDeletedRecords = (records: DeletedPlayDraft[]) => {
  const now = Date.now();
  return records.filter((record) => now - record.deletedAt <= DELETE_RETENTION_MS);
};

export const getPlayDrafts = () => {
  const shared = loadSharedAppState();

  if (shared) {
    return normalizePlayDrafts(shared.playDrafts);
  }

  return getLocalRecords();
};

export const getPlayDraftById = (id: string) =>
  getPlayDrafts().find((item) => item.id === id) ?? null;

export const getDeletedPlayDrafts = () => {
  const shared = loadSharedAppState();

  if (shared) {
    return purgeExpiredDeletedRecords(normalizeDeletedPlayDrafts(shared.deletedPlayDrafts));
  }

  const next = purgeExpiredDeletedRecords(getLocalDeletedRecords());
  saveLocalDeletedRecords(next);
  return next;
};

export const savePlayDraft = (draft: SavedPlayDraft) => {
  const shared = loadSharedAppState();

  if (shared) {
    const current = normalizePlayDrafts(shared.playDrafts).filter((item) => item.id !== draft.id);
    const next = [draft, ...current];
    saveSharedAppState({
      ...shared,
      playDrafts: next
    });
    return next;
  }

  const current = getLocalRecords().filter((item) => item.id !== draft.id);
  return saveLocalRecords([draft, ...current]);
};

export const deletePlayDraft = (id: string) => {
  const shared = loadSharedAppState();

  if (shared) {
    const current = normalizePlayDrafts(shared.playDrafts);
    const target = current.find((item) => item.id === id);
    const next = current.filter((item) => item.id !== id);

    saveSharedAppState({
      ...shared,
      playDrafts: next,
      deletedPlayDrafts: target
        ? [
            {
              deletedAt: Date.now(),
              item: target
            },
            ...purgeExpiredDeletedRecords(normalizeDeletedPlayDrafts(shared.deletedPlayDrafts)).filter(
              (record) => record.item.id !== id
            )
          ]
        : purgeExpiredDeletedRecords(normalizeDeletedPlayDrafts(shared.deletedPlayDrafts))
    });

    return next;
  }

  const current = getLocalRecords();
  const target = current.find((item) => item.id === id);
  const next = current.filter((item) => item.id !== id);
  saveLocalRecords(next);

  if (target) {
    saveLocalDeletedRecords([
      {
        deletedAt: Date.now(),
        item: target
      },
      ...purgeExpiredDeletedRecords(getLocalDeletedRecords()).filter((record) => record.item.id !== id)
    ]);
  }

  return next;
};
