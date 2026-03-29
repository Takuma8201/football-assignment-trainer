"use client";

import { OffenseVariant } from "@/lib/system-storage";

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

type DeletedPlayDraft = {
  deletedAt: number;
  item: SavedPlayDraft;
};

const getRecords = (): SavedPlayDraft[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PLAY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPlayDraft[]) : [];
  } catch {
    return [];
  }
};

const getDeletedRecords = (): DeletedPlayDraft[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DELETED_PLAY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeletedPlayDraft[]) : [];
  } catch {
    return [];
  }
};

const saveDeletedRecords = (records: DeletedPlayDraft[]) => {
  window.localStorage.setItem(DELETED_PLAY_STORAGE_KEY, JSON.stringify(records));
  return records;
};

const purgeExpiredDeletedRecords = () => {
  const now = Date.now();
  const next = getDeletedRecords().filter((record) => now - record.deletedAt <= DELETE_RETENTION_MS);
  saveDeletedRecords(next);
  return next;
};

export const getPlayDrafts = () => {
  purgeExpiredDeletedRecords();
  return getRecords();
};

export const getPlayDraftById = (id: string) => getRecords().find((item) => item.id === id) ?? null;

export const getDeletedPlayDrafts = () => purgeExpiredDeletedRecords();

export const savePlayDraft = (draft: SavedPlayDraft) => {
  const current = getRecords().filter((item) => item.id !== draft.id);
  const next = [draft, ...current];
  window.localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const deletePlayDraft = (id: string) => {
  const current = getRecords();
  const target = current.find((item) => item.id === id);
  const next = current.filter((item) => item.id !== id);
  window.localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(next));

  if (target) {
    const deleted = purgeExpiredDeletedRecords();
    saveDeletedRecords([
      {
        deletedAt: Date.now(),
        item: target
      },
      ...deleted.filter((record) => record.item.id !== id)
    ]);
  }

  return next;
};
