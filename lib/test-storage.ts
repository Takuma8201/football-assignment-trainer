"use client";

import { loadSharedAppState, saveSharedAppState } from "@/lib/shared-app-state";

export type SavedTest = {
  id: string;
  name: string;
  playIds: string[];
  orderMode: "random" | "ordered";
  createdAt: number;
};

const TEST_STORAGE_KEY = "football-tests";

const normalizeTests = (value: unknown): SavedTest[] =>
  Array.isArray(value) ? (value as SavedTest[]) : [];

const getLocalTests = (): SavedTest[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TEST_STORAGE_KEY);
    return normalizeTests(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

const saveLocalTests = (tests: SavedTest[]) => {
  window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(tests));
  return tests;
};

export const getSavedTests = (): SavedTest[] => {
  const shared = loadSharedAppState();

  if (shared) {
    return normalizeTests(shared.tests);
  }

  return getLocalTests();
};

export const saveTest = (test: SavedTest) => {
  const shared = loadSharedAppState();

  if (shared) {
    const current = normalizeTests(shared.tests).filter((item) => item.id !== test.id);
    const next = [test, ...current];
    saveSharedAppState({
      ...shared,
      tests: next
    });
    return next;
  }

  const current = getLocalTests().filter((item) => item.id !== test.id);
  return saveLocalTests([test, ...current]);
};

export const deleteTest = (id: string) => {
  const shared = loadSharedAppState();

  if (shared) {
    const next = normalizeTests(shared.tests).filter((item) => item.id !== id);
    saveSharedAppState({
      ...shared,
      tests: next
    });
    return next;
  }

  const next = getLocalTests().filter((item) => item.id !== id);
  return saveLocalTests(next);
};
