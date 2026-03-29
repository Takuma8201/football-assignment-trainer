"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPlayDrafts, type SavedPlayDraft } from "@/lib/play-storage";
import { getOffensePackages, type SavedOffensePackage } from "@/lib/system-storage";
import { saveTest } from "@/lib/test-storage";

export default function TestCreatePage() {
  const [name, setName] = useState("");
  const [plays, setPlays] = useState<SavedPlayDraft[]>([]);
  const [systems, setSystems] = useState<SavedOffensePackage[]>([]);
  const [selectedPlayIds, setSelectedPlayIds] = useState<string[]>([]);
  const [orderMode, setOrderMode] = useState<"random" | "ordered">("random");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refresh = async () => {
      const [nextPlays, nextSystems] = await Promise.all([getPlayDrafts(), getOffensePackages()]);
      setPlays(nextPlays);
      setSystems(nextSystems);
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

  const togglePlay = (id: string) => {
    setSelectedPlayIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const getSystemName = (offensePackageId?: string) =>
    systems.find((system) => system.id === offensePackageId)?.name ?? "未設定";

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("テスト名を入力してください。");
      return;
    }

    if (selectedPlayIds.length === 0) {
      setMessage("中に入れるプレーを1つ以上選んでください。");
      return;
    }

    await saveTest({
      id: `test-${Date.now()}`,
      name: trimmedName,
      playIds: selectedPlayIds,
      orderMode,
      createdAt: Date.now()
    });

    setMessage(`${trimmedName} を保存しました。`);
    setName("");
    setSelectedPlayIds([]);
    setOrderMode("random");
  };

  return (
    <div className="mx-auto max-w-4xl">
      <section className="card-surface rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Create Test</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
          新しくテストを作成する
        </h1>
      </section>

      <section className="mt-6 space-y-4">
        <div className="card-surface rounded-3xl px-6 py-6">
          <label className="text-sm font-semibold text-stone-900" htmlFor="test-name">
            テスト名
          </label>
          <input
            id="test-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="テスト名を入力"
            className="mt-3 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-700"
          />
        </div>

        <div className="card-surface rounded-3xl px-6 py-6">
          <p className="text-sm font-semibold text-stone-900">中に入れるプレーを選択</p>
          {plays.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {plays.map((play) => {
                const isSelected = selectedPlayIds.includes(play.id);
                return (
                  <button
                    key={play.id}
                    type="button"
                    onClick={() => togglePlay(play.id)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                      isSelected
                        ? "border-amber-400 bg-amber-300 text-stone-950"
                        : "border-stone-300 bg-stone-50 text-stone-900"
                    }`}
                  >
                    <div>{play.name}</div>
                    <div className={`mt-1 text-xs ${isSelected ? "text-stone-200" : "text-stone-500"}`}>
                      {play.playType} / {play.playDetailType}
                    </div>
                    <div className={`mt-1 text-xs ${isSelected ? "text-stone-100" : "text-stone-600"}`}>
                      体系: {getSystemName(play.offensePackageId)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">保存されたプレーがまだありません。</p>
          )}
        </div>

        <div className="card-surface rounded-3xl px-6 py-6">
          <p className="text-sm font-semibold text-stone-900">出題順</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setOrderMode("random")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                orderMode === "random"
                  ? "bg-amber-300 text-stone-950"
                  : "border border-stone-300 bg-white text-stone-900"
              }`}
            >
              ランダム
            </button>
            <button
              type="button"
              onClick={() => setOrderMode("ordered")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                orderMode === "ordered"
                  ? "bg-amber-300 text-stone-950"
                  : "border border-stone-300 bg-white text-stone-900"
              }`}
            >
              順番どおり
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="mt-6 rounded-3xl border border-stone-200 bg-white px-5 py-4 text-sm text-stone-700">
          {message}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
        >
          テストを保存する
        </button>
        <Link
          href="/test"
          className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
        >
          テスト一覧へ戻る
        </Link>
      </div>
    </div>
  );
}
