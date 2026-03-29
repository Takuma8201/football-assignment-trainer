"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { getPlayDrafts, type SavedPlayDraft } from "@/lib/play-storage";
import { saveStudySelection } from "@/lib/study-session";
import { getOffensePackages, type SavedOffensePackage } from "@/lib/system-storage";

type StudyPlayType = "run" | "pass";
type StudyPlayDetail = "inside" | "openSide" | "short" | "long";

const playTypeLabels: Record<StudyPlayType, string> = {
  run: "ラン",
  pass: "パス"
};

const playDetailLabels: Record<StudyPlayDetail, string> = {
  inside: "インサイド",
  openSide: "アウトサイド",
  short: "ショート",
  long: "ロング"
};

export default function StudySelectPage() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [systems, setSystems] = useState<SavedOffensePackage[]>([]);
  const [plays, setPlays] = useState<SavedPlayDraft[]>([]);
  const [selectedSystemIds, setSelectedSystemIds] = useState<string[]>([]);
  const [selectedPlayTypes, setSelectedPlayTypes] = useState<StudyPlayType[]>([]);
  const [selectedPlayDetails, setSelectedPlayDetails] = useState<StudyPlayDetail[]>([]);
  const [selectedPlayIds, setSelectedPlayIds] = useState<string[]>([]);

  useEffect(() => {
    const refresh = async () => {
      const [nextSystems, nextPlays] = await Promise.all([getOffensePackages(), getPlayDrafts()]);
      setSystems(nextSystems);
      setPlays(nextPlays);
    };

    void refresh();
    const handleRefresh = () => void refresh();
    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleRefresh);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleRefresh);
    };
  }, []);

  const toggleMulti = <T extends string>(
    value: T,
    current: T[],
    setter: Dispatch<SetStateAction<T[]>>
  ) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const availableDetailOptions = useMemo(() => {
    if (selectedPlayTypes.length === 1 && selectedPlayTypes[0] === "run") {
      return [
        { value: "inside" as const, label: "インサイド" },
        { value: "openSide" as const, label: "アウトサイド" }
      ];
    }

    if (selectedPlayTypes.length === 1 && selectedPlayTypes[0] === "pass") {
      return [
        { value: "short" as const, label: "ショート" },
        { value: "long" as const, label: "ロング" }
      ];
    }

    return [];
  }, [selectedPlayTypes]);

  useEffect(() => {
    setSelectedPlayDetails((current) =>
      current.filter((item) => availableDetailOptions.some((option) => option.value === item))
    );
  }, [availableDetailOptions]);

  const filteredPlays = useMemo(() => {
    return plays.filter((play) => {
      const matchSystem =
        selectedSystemIds.length === 0 || (play.offensePackageId && selectedSystemIds.includes(play.offensePackageId));
      const matchType = selectedPlayTypes.length === 0 || selectedPlayTypes.includes(play.playType);
      const matchDetail = selectedPlayDetails.length === 0 || selectedPlayDetails.includes(play.playDetailType);
      return matchSystem && matchType && matchDetail;
    });
  }, [plays, selectedPlayDetails, selectedPlayTypes, selectedSystemIds]);

  const getSystemName = (offensePackageId?: string) =>
    systems.find((system) => system.id === offensePackageId)?.name ?? "未設定";

  return (
    <div className="mx-auto max-w-5xl">
      <section className="card-surface rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Study Select</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
          学ぶ内容を選ぶ
        </h1>
      </section>

      <section className="mt-6 space-y-4">
        <div className="card-surface overflow-hidden rounded-3xl">
          <button
            type="button"
            onClick={() => setOpenKey(openKey === "system" ? null : "system")}
            className="flex w-full items-center justify-between px-6 py-5 text-left"
          >
            <span className="text-2xl font-bold text-stone-900">体系</span>
            <span className="text-sm font-semibold text-stone-500">{openKey === "system" ? "閉じる" : "開く"}</span>
          </button>
          {openKey === "system" && (
            <div className="border-t border-stone-200 bg-stone-50/80 px-6 py-5">
              {systems.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {systems.map((system) => {
                    const isSelected = selectedSystemIds.includes(system.id);
                    return (
                      <button
                        key={system.id}
                        type="button"
                        onClick={() => toggleMulti(system.id, selectedSystemIds, setSelectedSystemIds)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                          isSelected
                            ? "bg-amber-300 text-stone-950"
                            : "border border-stone-300 bg-white text-stone-900"
                        }`}
                      >
                        {system.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-stone-500">保存済みの体系はまだありません。</p>
              )}
            </div>
          )}
        </div>

        <div className="card-surface overflow-hidden rounded-3xl">
          <button
            type="button"
            onClick={() => setOpenKey(openKey === "run-pass" ? null : "run-pass")}
            className="flex w-full items-center justify-between px-6 py-5 text-left"
          >
            <span className="text-2xl font-bold text-stone-900">ランパス</span>
            <span className="text-sm font-semibold text-stone-500">
              {openKey === "run-pass" ? "閉じる" : "開く"}
            </span>
          </button>
          {openKey === "run-pass" && (
            <div className="border-t border-stone-200 bg-stone-50/80 px-6 py-5">
              <div className="flex flex-wrap gap-3">
                {(["run", "pass"] as const).map((type) => {
                  const isSelected = selectedPlayTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleMulti(type, selectedPlayTypes, setSelectedPlayTypes)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        isSelected
                          ? "bg-amber-300 text-stone-950"
                          : "border border-stone-300 bg-white text-stone-900"
                      }`}
                    >
                      {playTypeLabels[type]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="card-surface overflow-hidden rounded-3xl">
          <button
            type="button"
            onClick={() => setOpenKey(openKey === "play" ? null : "play")}
            className="flex w-full items-center justify-between px-6 py-5 text-left"
          >
            <span className="text-2xl font-bold text-stone-900">プレー内容</span>
            <span className="text-sm font-semibold text-stone-500">{openKey === "play" ? "閉じる" : "開く"}</span>
          </button>
          {openKey === "play" && (
            <div className="border-t border-stone-200 bg-stone-50/80 px-6 py-5">
              {availableDetailOptions.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {availableDetailOptions.map((option) => {
                    const isSelected = selectedPlayDetails.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleMulti(option.value, selectedPlayDetails, setSelectedPlayDetails)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                          isSelected
                            ? "bg-amber-300 text-stone-950"
                            : "border border-stone-300 bg-white text-stone-900"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-stone-500">
                  先にランまたはパスを1つ選ぶと、ここに内容の選択肢が表示されます。
                </p>
              )}

              <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-sm font-semibold text-stone-900">該当するプレー</p>
                {filteredPlays.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {filteredPlays.map((play) => {
                      const isSelected = selectedPlayIds.includes(play.id);
                      return (
                        <button
                          key={play.id}
                          type="button"
                          onClick={() => toggleMulti(play.id, selectedPlayIds, setSelectedPlayIds)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                            isSelected
                              ? "border-amber-400 bg-amber-300 text-stone-950"
                              : "border-stone-300 bg-stone-50 text-stone-900"
                          }`}
                        >
                          <div>{play.name}</div>
                          <div className={`mt-1 text-xs ${isSelected ? "text-stone-200" : "text-stone-500"}`}>
                            {playTypeLabels[play.playType]} / {playDetailLabels[play.playDetailType]}
                          </div>
                          <div className={`mt-1 text-xs ${isSelected ? "text-stone-100" : "text-stone-600"}`}>
                            体系: {getSystemName(play.offensePackageId)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-stone-500">条件に合うプレーはまだありません。</p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-3 rounded-3xl border border-stone-200 bg-white p-5 text-sm text-stone-700 sm:grid-cols-2">
        <div>選択した体系: {selectedSystemIds.length} 件</div>
        <div>選択したプレー: {selectedPlayIds.length} 件</div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/study/session"
          onClick={() =>
            saveStudySelection({
              systemIds: selectedSystemIds,
              playTypes: selectedPlayTypes,
              playDetails: selectedPlayDetails,
              playIds: selectedPlayIds
            })
          }
          className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold no-underline transition ${
            selectedPlayIds.length > 0
              ? "bg-amber-300 text-stone-950 hover:bg-amber-400"
              : "pointer-events-none bg-stone-300 text-stone-500"
          }`}
        >
          学習を開始する
        </Link>
        <Link
          href="/editor"
          className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
        >
          プレーを追加する
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
        >
          戻る
        </Link>
      </div>
    </div>
  );
}
