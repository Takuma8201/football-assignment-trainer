"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { requestActionPassword } from "@/lib/action-password";
import { downloadExportBundle, importExportBundle } from "@/lib/data-transfer";
import { deletePlayDraft, getDeletedPlayDrafts, getPlayDrafts, SavedPlayDraft } from "@/lib/play-storage";
import {
  deleteSavedSystem,
  getDefenseSystems,
  getDeletedSavedSystems,
  getOffensePackages,
  getPlayDraftSelection,
  savePlayDraftSelection,
  SavedDefenseSystem,
  SavedOffensePackage
} from "@/lib/system-storage";

const createItems = [
  {
    key: "system",
    title: "使用する体系",
    createLabel: "体系を追加する",
    href: "/editor/system"
  },
  {
    key: "opponent-front",
    title: "相手の体形",
    createLabel: "体系を追加する",
    href: "/editor/opponent-system"
  }
] as const;

type DeletedItem = {
  id: string;
  name: string;
  kind: string;
  deletedAt: number;
};

export default function EditorPage() {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>("system");
  const [offensePackages, setOffensePackages] = useState<SavedOffensePackage[]>([]);
  const [defenseSystems, setDefenseSystems] = useState<SavedDefenseSystem[]>([]);
  const [savedPlays, setSavedPlays] = useState<SavedPlayDraft[]>([]);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [playTypeFilter, setPlayTypeFilter] = useState<"all" | "run" | "pass">("all");
  const [playDetailFilter, setPlayDetailFilter] = useState<"all" | "inside" | "openSide" | "short" | "long">("all");
  const [studyDisplayFilter, setStudyDisplayFilter] = useState<"all" | "tight" | "wide">("all");
  const [playSearch, setPlaySearch] = useState("");
  const [selectedOffensePackageId, setSelectedOffensePackageId] = useState("");
  const [selectedDefenseSystemId, setSelectedDefenseSystemId] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const handleExportData = () => {
    downloadExportBundle();
    setActionMessage("ローカルのデータを書き出しました。ネット側ではこの JSON を読み込んでください。");
  };

  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      importExportBundle(JSON.parse(text) as unknown);
      refreshSavedItems();
      setActionMessage("データを読み込みました。別の環境でも同じ JSON を読み込めます。");
    } catch {
      setActionMessage("データの読み込みに失敗しました。JSON ファイルを確認してください。");
    } finally {
      event.target.value = "";
    }
  };

  const refreshSavedItems = () => {
    const nextOffensePackages = getOffensePackages();
    const nextDefenseSystems = getDefenseSystems();
    const nextPlays = getPlayDrafts();
    const nextDeletedSystems = getDeletedSavedSystems();
    const nextDeletedPlays = getDeletedPlayDrafts();
    const draftSelection = getPlayDraftSelection();

    setOffensePackages(nextOffensePackages);
    setDefenseSystems(nextDefenseSystems);
    setSavedPlays(nextPlays);
    setDeletedItems(
      [
        ...nextDeletedPlays.map((record) => ({
          id: record.item.id,
          name: record.item.name,
          kind: "プレー",
          deletedAt: record.deletedAt
        })),
        ...nextDeletedSystems.map((record) => ({
          id: record.item.id,
          name: record.item.name,
          kind: record.item.category === "offense-package" ? "体系" : "相手の体形",
          deletedAt: record.deletedAt
        }))
      ].sort((left, right) => right.deletedAt - left.deletedAt)
    );
    setSelectedOffensePackageId(draftSelection.offensePackageId ?? nextOffensePackages[0]?.id ?? "");
    setSelectedDefenseSystemId(draftSelection.defenseSystemId ?? "");
  };

  useEffect(() => {
    refreshSavedItems();
    window.addEventListener("focus", refreshSavedItems);
    document.addEventListener("visibilitychange", refreshSavedItems);

    return () => {
      window.removeEventListener("focus", refreshSavedItems);
      document.removeEventListener("visibilitychange", refreshSavedItems);
    };
  }, []);

  const selectedOffensePackage =
    offensePackages.find((savedItem) => savedItem.id === selectedOffensePackageId) ?? null;
  const compatibleDefenseSystems = useMemo(
    () => defenseSystems.filter((savedItem) => !selectedOffensePackageId || savedItem.offensePackageId === selectedOffensePackageId),
    [defenseSystems, selectedOffensePackageId]
  );
  const selectedDefenseSystem =
    compatibleDefenseSystems.find((savedItem) => savedItem.id === selectedDefenseSystemId) ?? null;
  const hasCompatibleDefense = compatibleDefenseSystems.length > 0;

  useEffect(() => {
    if (!selectedOffensePackageId) {
      return;
    }

    if (!compatibleDefenseSystems.some((item) => item.id === selectedDefenseSystemId)) {
      setSelectedDefenseSystemId(compatibleDefenseSystems[0]?.id ?? "");
    }
  }, [compatibleDefenseSystems, selectedDefenseSystemId, selectedOffensePackageId]);

  useEffect(() => {
    savePlayDraftSelection({
      offensePackageId: selectedOffensePackageId || undefined,
      defenseSystemId:
        compatibleDefenseSystems.some((item) => item.id === selectedDefenseSystemId)
          ? selectedDefenseSystemId || undefined
          : undefined
    });
  }, [compatibleDefenseSystems, selectedDefenseSystemId, selectedOffensePackageId]);

  const filteredPlays = savedPlays.filter((play) => {
    const matchType = playTypeFilter === "all" || play.playType === playTypeFilter;
    const matchDetail = playDetailFilter === "all" || play.playDetailType === playDetailFilter;
    const matchDisplay = studyDisplayFilter === "all" || play.studyDisplayVariant === studyDisplayFilter;
    const matchSearch =
      playSearch.trim().length === 0 ||
      play.name.toLocaleLowerCase("ja").includes(playSearch.trim().toLocaleLowerCase("ja"));
    return matchType && matchDetail && matchDisplay && matchSearch;
  });

  const getOffensePackageName = (id?: string) =>
    offensePackages.find((item) => item.id === id)?.name ?? "未設定";

  const getDefenseSystemName = (id?: string) =>
    defenseSystems.find((item) => item.id === id)?.name ?? "未設定";

  const handleDeleteSystem = (category: "system" | "opponent-front", id: string) => {
    const allowed = requestActionPassword("体系を消去するにはパスワードを入力してください");

    if (!allowed) {
      setActionMessage("パスワードが違うため、消去しませんでした。");
      return;
    }

    deleteSavedSystem(id);
    refreshSavedItems();

    if (category === "system") {
      setSelectedOffensePackageId((current) => (current === id ? "" : current));
    } else {
      setSelectedDefenseSystemId((current) => (current === id ? "" : current));
    }

    setActionMessage("体系を消去しました。");
  };

  const handleDeletePlay = (id: string) => {
    const allowed = requestActionPassword("プレーを消去するにはパスワードを入力してください");

    if (!allowed) {
      setActionMessage("パスワードが違うため、プレーは消去しませんでした。");
      return;
    }

    setSavedPlays(deletePlayDraft(id));
    const nextDeletedSystems = getDeletedSavedSystems();
    const nextDeletedPlays = getDeletedPlayDrafts();
    setDeletedItems(
      [
        ...nextDeletedPlays.map((record) => ({
          id: record.item.id,
          name: record.item.name,
          kind: "プレー",
          deletedAt: record.deletedAt
        })),
        ...nextDeletedSystems.map((record) => ({
          id: record.item.id,
          name: record.item.name,
          kind: record.item.category === "offense-package" ? "体系" : "相手の体形",
          deletedAt: record.deletedAt
        }))
      ].sort((left, right) => right.deletedAt - left.deletedAt)
    );
    setActionMessage("プレーを消去しました。");
  };

  const handleEditSystem = (href: string) => {
    const allowed = requestActionPassword("編集するにはパスワードを入力してください");

    if (!allowed) {
      setActionMessage("パスワードが違うため、編集画面は開きませんでした。");
      return;
    }

    router.push(href);
  };

  const handleEditPlay = (id: string) => {
    const allowed = requestActionPassword("編集するにはパスワードを入力してください");

    if (!allowed) {
      setActionMessage("パスワードが違うため、編集画面は開きませんでした。");
      return;
    }

    router.push(`/editor/play?id=${id}`);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <section className="card-surface rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Create Play</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">プレーを作る</h1>
        <p className="mt-3 text-sm leading-7 text-stone-600">
          使用する体系と相手の体形を選んでから、プレー作成に進みます。
        </p>
        {actionMessage && <p className="mt-4 text-sm text-stone-600">{actionMessage}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportData}
            className="inline-flex rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            データを書き出す
          </button>
          <label className="inline-flex cursor-pointer rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-stone-100">
            データを読み込む
            <input type="file" accept=".json,application/json" onChange={handleImportData} className="hidden" />
          </label>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        {createItems.map((item) => {
          const isOpen = openKey === item.key;
          const savedItems = item.key === "system" ? offensePackages : compatibleDefenseSystems;

          return (
            <div key={item.key} className="card-surface overflow-hidden rounded-3xl">
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : item.key)}
                className="flex w-full items-center justify-between px-6 py-5 text-left"
              >
                <span className="text-2xl font-bold text-stone-900">{item.title}</span>
                <span className="text-sm font-semibold text-stone-500">{isOpen ? "閉じる" : "開く"}</span>
              </button>

              {isOpen && (
                <div className="border-t border-stone-200 bg-stone-50/80 px-6 py-5">
                  <div className="space-y-4">
                    <Link
                      href={
                        item.key === "system"
                          ? item.href
                          : selectedOffensePackage
                            ? `${item.href}?packageId=${selectedOffensePackage.id}`
                            : item.href
                      }
                      className="inline-flex rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
                    >
                      {item.createLabel}
                    </Link>

                    <div className="rounded-2xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-900">保存済みの体形</p>
                        {savedItems.length > 0 && <p className="text-xs text-stone-500">選択か編集か削除ができます</p>}
                      </div>

                      {savedItems.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {savedItems.map((savedItem) => {
                            const isSelected =
                              item.key === "system"
                                ? savedItem.id === selectedOffensePackageId
                                : savedItem.id === selectedDefenseSystemId;

                            return (
                              <div
                                key={savedItem.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionMessage("");
                                    if (item.key === "system") {
                                      setSelectedOffensePackageId(savedItem.id);
                                      setOpenKey("opponent-front");
                                    } else {
                                      setSelectedDefenseSystemId(savedItem.id);
                                    }
                                  }}
                                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                                    isSelected
                                      ? "border border-amber-400 bg-amber-300 text-stone-950"
                                      : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                                  }`}
                                >
                                  {savedItem.name}
                                </button>
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`${item.href}?id=${savedItem.id}`}
                                    className="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                                  >
                                    編集
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSystem(item.key, savedItem.id)}
                                    className="rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-stone-500">まだ保存されていません。</p>
                      )}
                    </div>

                    {item.key === "system" && selectedOffensePackage && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        使用する体系: {selectedOffensePackage.name}
                      </div>
                    )}

                    {item.key === "opponent-front" && selectedDefenseSystem && (
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                        選択中の相手の体形: {selectedDefenseSystem.name}
                      </div>
                    )}

                    {item.key === "opponent-front" && selectedOffensePackage && !hasCompatibleDefense && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                        <p className="font-semibold">オフェンスに対応したディフェンスの体形がありません。</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/editor/opponent-system?packageId=${selectedOffensePackage.id}`}
                            className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
                          >
                            新しく作る
                          </Link>
                        </div>
                        {defenseSystems.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {defenseSystems.map((system) => (
                              <Link
                                key={`quote-${system.id}`}
                                href={`/editor/opponent-system?packageId=${selectedOffensePackage.id}&copyFrom=${system.id}`}
                                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-stone-100"
                              >
                                {system.name} を引用
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="mt-6 card-surface rounded-3xl px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Saved Plays</p>
            <h2 className="mt-2 text-2xl font-bold text-stone-900">今まで作ったプレー</h2>
          </div>
          <p className="text-sm text-stone-500">{filteredPlays.length} 件</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={playSearch}
            onChange={(event) => setPlaySearch(event.target.value)}
            placeholder="プレー名で検索"
            className="min-w-[180px] rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-semibold text-stone-700 outline-none"
          />
          <select
            value={playTypeFilter}
            onChange={(event) => setPlayTypeFilter(event.target.value as "all" | "run" | "pass")}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 outline-none"
          >
            <option value="all">種類: すべて</option>
            <option value="run">種類: ラン</option>
            <option value="pass">種類: パス</option>
          </select>
          <select
            value={playDetailFilter}
            onChange={(event) => setPlayDetailFilter(event.target.value as "all" | "inside" | "openSide" | "short" | "long")}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 outline-none"
          >
            <option value="all">内容: すべて</option>
            <option value="inside">内容: インサイド</option>
            <option value="openSide">内容: アウトサイド</option>
            <option value="short">内容: ショート</option>
            <option value="long">内容: ロング</option>
          </select>
          <select
            value={studyDisplayFilter}
            onChange={(event) => setStudyDisplayFilter(event.target.value as "all" | "tight" | "wide")}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 outline-none"
          >
            <option value="all">表示: すべて</option>
            <option value="tight">表示: タイト</option>
            <option value="wide">表示: ワイド</option>
          </select>
        </div>

        {savedPlays.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {filteredPlays.map((play) => (
              <div key={play.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-stone-900">{play.name}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      使用体系: {getOffensePackageName(play.offensePackageId)} / 相手の体形: {getDefenseSystemName(play.defenseSystemId)}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {play.playType} / {play.playDetailType} / 学習時: {play.studyDisplayVariant}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-stone-400">{new Date(play.createdAt).toLocaleString("ja-JP")}</p>
                    <Link
                      href={`/editor/play?id=${play.id}`}
                      className="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                    >
                      編集
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeletePlay(play.id)}
                      className="rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-stone-500">まだ保存されたプレーはありません。</p>
        )}
      </section>

      <section className="mt-6 card-surface rounded-3xl px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Recently Deleted</p>
            <h2 className="mt-2 text-2xl font-bold text-stone-900">最近消去したもの</h2>
          </div>
          <p className="text-sm text-stone-500">{deletedItems.length} 件</p>
        </div>

        {deletedItems.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {deletedItems.map((item) => (
              <div
                key={`${item.kind}-${item.id}-${item.deletedAt}`}
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-stone-900">{item.name}</p>
                    <p className="mt-1 text-sm text-stone-500">{item.kind}</p>
                  </div>
                  <p className="text-xs text-stone-400">{new Date(item.deletedAt).toLocaleString("ja-JP")}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-stone-500">最近消去したものはありません。</p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {selectedOffensePackage && hasCompatibleDefense ? (
          <Link
            href="/editor/play"
            className="inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            プレーを作成
          </Link>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            オフェンスに対応したディフェンスの体形がありません。
          </div>
        )}

        <Link
          href="/study"
          className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
        >
          学習選択へ戻る
        </Link>
      </div>
    </div>
  );
}
