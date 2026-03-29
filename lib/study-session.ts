"use client";

type StudySelection = {
  systemIds: string[];
  playTypes: ("run" | "pass")[];
  playDetails: ("inside" | "openSide" | "short" | "long")[];
  playIds: string[];
};

const STORAGE_KEY = "football-study-selection";

export const getStudySelection = (): StudySelection => {
  if (typeof window === "undefined") {
    return {
      systemIds: [],
      playTypes: [],
      playDetails: [],
      playIds: []
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw
      ? (JSON.parse(raw) as StudySelection)
      : {
          systemIds: [],
          playTypes: [],
          playDetails: [],
          playIds: []
        };
  } catch {
    return {
      systemIds: [],
      playTypes: [],
      playDetails: [],
      playIds: []
    };
  }
};

export const saveStudySelection = (selection: StudySelection) => {
  if (typeof window === "undefined") {
    return selection;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  return selection;
};
