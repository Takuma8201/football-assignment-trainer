"use client";

export type SavedTest = {
  id: string;
  name: string;
  playIds: string[];
  orderMode: "random" | "ordered";
  createdAt: number;
};

const TEST_STORAGE_KEY = "football-tests";

export const getSavedTests = (): SavedTest[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TEST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedTest[]) : [];
  } catch {
    return [];
  }
};

export const saveTest = (test: SavedTest) => {
  const current = getSavedTests().filter((item) => item.id !== test.id);
  const next = [test, ...current];
  window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const deleteTest = (id: string) => {
  const next = getSavedTests().filter((item) => item.id !== id);
  window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(next));
  return next;
};
