"use client";

export type SavedPlayer = {
  id: string;
  label: string;
  left: number;
  top: number;
};

export type OffenseVariant = "tight" | "wide";

export type SavedOffensePackage = {
  id: string;
  name: string;
  category: "offense-package";
  variants: Record<OffenseVariant, SavedPlayer[]>;
  createdAt: number;
};

export type SavedDefenseSystem = {
  id: string;
  name: string;
  category: "defense";
  players: SavedPlayer[];
  offensePackageId?: string;
  offenseVariant?: OffenseVariant;
  createdAt: number;
};

export type SavedSystemRecord = SavedOffensePackage | SavedDefenseSystem;
export type PlayDraftSelection = {
  offensePackageId?: string;
  defenseSystemId?: string;
};

const STORAGE_KEY = "football-system-layouts";
const PLAY_DRAFT_KEY = "football-play-draft-selection";
const DELETED_SYSTEM_STORAGE_KEY = "football-system-layouts-deleted";
const DELETE_RETENTION_MS = 24 * 60 * 60 * 1000;

type DeletedSystemRecord = {
  deletedAt: number;
  item: SavedSystemRecord;
};

export const getSavedSystems = (): SavedSystemRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSystemRecord[]) : [];
  } catch {
    return [];
  }
};

const getDeletedSystems = (): DeletedSystemRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DELETED_SYSTEM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeletedSystemRecord[]) : [];
  } catch {
    return [];
  }
};

const saveDeletedSystems = (records: DeletedSystemRecord[]) => {
  window.localStorage.setItem(DELETED_SYSTEM_STORAGE_KEY, JSON.stringify(records));
  return records;
};

const purgeExpiredDeletedSystems = () => {
  const now = Date.now();
  const next = getDeletedSystems().filter((record) => now - record.deletedAt <= DELETE_RETENTION_MS);
  saveDeletedSystems(next);
  return next;
};

const saveRecords = (records: SavedSystemRecord[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return records;
};

export const saveOffensePackage = (system: SavedOffensePackage) => {
  const current = getSavedSystems().filter((item) => item.id !== system.id);
  return saveRecords([system, ...current]);
};

export const saveDefenseSystem = (system: SavedDefenseSystem) => {
  const current = getSavedSystems().filter((item) => item.id !== system.id);
  return saveRecords([system, ...current]);
};

export const deleteSavedSystem = (id: string) => {
  const currentRecords = getSavedSystems();
  const target = currentRecords.find((item) => item.id === id);
  const current = currentRecords.filter((item) => item.id !== id);
  saveRecords(current);

  if (target) {
    const deleted = purgeExpiredDeletedSystems();
    saveDeletedSystems([
      {
        deletedAt: Date.now(),
        item: target
      },
      ...deleted.filter((record) => record.item.id !== id)
    ]);
  }

  const currentDraft = getPlayDraftSelection();
  const nextDraft: PlayDraftSelection = {
    offensePackageId: currentDraft.offensePackageId === id ? undefined : currentDraft.offensePackageId,
    defenseSystemId: currentDraft.defenseSystemId === id ? undefined : currentDraft.defenseSystemId
  };

  savePlayDraftSelection(nextDraft);
  return current;
};

export const getOffensePackages = () =>
  getSavedSystems().filter((system): system is SavedOffensePackage => system.category === "offense-package");

export const getDefenseSystems = () =>
  getSavedSystems().filter((system): system is SavedDefenseSystem => system.category === "defense");

export const getDeletedSavedSystems = () => purgeExpiredDeletedSystems();

export const getPlayDraftSelection = (): PlayDraftSelection => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PLAY_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as PlayDraftSelection) : {};
  } catch {
    return {};
  }
};

export const savePlayDraftSelection = (selection: PlayDraftSelection) => {
  if (typeof window === "undefined") {
    return selection;
  }

  window.localStorage.setItem(PLAY_DRAFT_KEY, JSON.stringify(selection));
  return selection;
};
