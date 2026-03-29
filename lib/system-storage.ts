"use client";

import {
  getDefaultSharedAppState,
  type SharedDeletedRecord,
  loadSharedAppState,
  saveSharedAppState
} from "@/lib/shared-app-state";

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

type DeletedSystemRecord = SharedDeletedRecord<SavedSystemRecord>;

const normalizeSystems = (value: unknown): SavedSystemRecord[] =>
  Array.isArray(value) ? (value as SavedSystemRecord[]) : [];

const normalizeDeletedSystems = (value: unknown): DeletedSystemRecord[] =>
  Array.isArray(value) ? (value as DeletedSystemRecord[]) : [];

const getLocalSystems = (): SavedSystemRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeSystems(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

const getLocalDeletedSystems = (): DeletedSystemRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DELETED_SYSTEM_STORAGE_KEY);
    return normalizeDeletedSystems(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

const saveLocalSystems = (records: SavedSystemRecord[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return records;
};

const saveLocalDeletedSystems = (records: DeletedSystemRecord[]) => {
  window.localStorage.setItem(DELETED_SYSTEM_STORAGE_KEY, JSON.stringify(records));
  return records;
};

const purgeExpiredDeletedSystems = (records: DeletedSystemRecord[]) => {
  const now = Date.now();
  return records.filter((record) => now - record.deletedAt <= DELETE_RETENTION_MS);
};

export const getSavedSystems = (): SavedSystemRecord[] => {
  const shared = loadSharedAppState();

  if (shared) {
    return normalizeSystems(shared.systems);
  }

  return getLocalSystems();
};

export const saveOffensePackage = (system: SavedOffensePackage) => {
  const shared = loadSharedAppState();

  if (shared) {
    const current = normalizeSystems(shared.systems).filter((item) => item.id !== system.id);
    const next = [system, ...current];
    saveSharedAppState({
      ...shared,
      systems: next
    });
    return next;
  }

  const current = getLocalSystems().filter((item) => item.id !== system.id);
  return saveLocalSystems([system, ...current]);
};

export const saveDefenseSystem = (system: SavedDefenseSystem) => {
  const shared = loadSharedAppState();

  if (shared) {
    const current = normalizeSystems(shared.systems).filter((item) => item.id !== system.id);
    const next = [system, ...current];
    saveSharedAppState({
      ...shared,
      systems: next
    });
    return next;
  }

  const current = getLocalSystems().filter((item) => item.id !== system.id);
  return saveLocalSystems([system, ...current]);
};

export const deleteSavedSystem = (id: string) => {
  const shared = loadSharedAppState();

  if (shared) {
    const currentRecords = normalizeSystems(shared.systems);
    const target = currentRecords.find((item) => item.id === id);
    const systems = currentRecords.filter((item) => item.id !== id);
    const deletedSystems = target
      ? [
          { deletedAt: Date.now(), item: target },
          ...purgeExpiredDeletedSystems(normalizeDeletedSystems(shared.deletedSystems)).filter(
            (record) => record.item.id !== id
          )
        ]
      : purgeExpiredDeletedSystems(normalizeDeletedSystems(shared.deletedSystems));

    saveSharedAppState({
      ...shared,
      systems,
      deletedSystems
    });

    const currentDraft = getPlayDraftSelection();
    savePlayDraftSelection({
      offensePackageId: currentDraft.offensePackageId === id ? undefined : currentDraft.offensePackageId,
      defenseSystemId: currentDraft.defenseSystemId === id ? undefined : currentDraft.defenseSystemId
    });

    return systems;
  }

  const currentRecords = getLocalSystems();
  const target = currentRecords.find((item) => item.id === id);
  const current = currentRecords.filter((item) => item.id !== id);
  saveLocalSystems(current);

  if (target) {
    const deleted = purgeExpiredDeletedSystems(getLocalDeletedSystems());
    saveLocalDeletedSystems([
      {
        deletedAt: Date.now(),
        item: target
      },
      ...deleted.filter((record) => record.item.id !== id)
    ]);
  }

  const currentDraft = getPlayDraftSelection();
  savePlayDraftSelection({
    offensePackageId: currentDraft.offensePackageId === id ? undefined : currentDraft.offensePackageId,
    defenseSystemId: currentDraft.defenseSystemId === id ? undefined : currentDraft.defenseSystemId
  });

  return current;
};

export const getOffensePackages = () =>
  getSavedSystems().filter(
    (system): system is SavedOffensePackage => system.category === "offense-package"
  );

export const getDefenseSystems = () =>
  getSavedSystems().filter((system): system is SavedDefenseSystem => system.category === "defense");

export const getDeletedSavedSystems = () => {
  const shared = loadSharedAppState();
  if (shared) {
    return purgeExpiredDeletedSystems(normalizeDeletedSystems(shared.deletedSystems));
  }

  const next = purgeExpiredDeletedSystems(getLocalDeletedSystems());
  saveLocalDeletedSystems(next);
  return next;
};

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

export const getEmptySharedSystemState = () => getDefaultSharedAppState();
