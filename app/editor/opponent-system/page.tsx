"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SystemEditorField } from "@/components/system-editor-field";
import { requestActionPassword } from "@/lib/action-password";
import {
  getDefenseSystems,
  getOffensePackages,
  type OffenseVariant,
  saveDefenseSystem,
  type SavedDefenseSystem,
  type SavedOffensePackage,
  type SavedPlayer
} from "@/lib/system-storage";

const defenseInitialPlayers: SavedPlayer[] = [
  { id: "de-left", label: "DE", left: 34, top: 58 },
  { id: "dt-left", label: "DT", left: 43, top: 58 },
  { id: "dt-right", label: "DT", left: 57, top: 58 },
  { id: "de-right", label: "DE", left: 66, top: 58 },
  { id: "lb", label: "LB", left: 50, top: 48 }
];

const clonePlayers = (players: SavedPlayer[]) => players.map((player) => ({ ...player }));

export default function OpponentSystemPage() {
  const [offensePackages, setOffensePackages] = useState<SavedOffensePackage[]>([]);
  const [savedDefenseSystems, setSavedDefenseSystems] = useState<SavedDefenseSystem[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<OffenseVariant>("tight");
  const [defensePlayers, setDefensePlayers] = useState<SavedPlayer[]>(clonePlayers(defenseInitialPlayers));
  const [editingSystem, setEditingSystem] = useState<SavedDefenseSystem | null>(null);
  const [quoteSourceId, setQuoteSourceId] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const editingId = searchParams.get("id");
      const packageId = searchParams.get("packageId");
      const copyFromId = searchParams.get("copyFrom");
      const packages = await getOffensePackages();
      const defenseSystems = await getDefenseSystems();

      setOffensePackages(packages);
      setSavedDefenseSystems(defenseSystems);

      if (!editingId) {
        setEditingSystem(null);
        setSelectedPackageId(packageId ?? packages[0]?.id ?? "");
        setSelectedVariant("tight");
        setQuoteSourceId(copyFromId ?? "");
        if (copyFromId) {
          const source = defenseSystems.find((item) => item.id === copyFromId) ?? null;
          setDefensePlayers(clonePlayers(source?.players ?? defenseInitialPlayers));
        } else {
          setDefensePlayers(clonePlayers(defenseInitialPlayers));
        }
        return;
      }

      const allowed = requestActionPassword("体系を編集するにはパスワードを入力してください");
      if (!allowed) {
        window.location.replace("/editor");
        return;
      }

      const target = defenseSystems.find((item) => item.id === editingId) ?? null;
      setEditingSystem(target);
      setSelectedPackageId(target?.offensePackageId ?? packages[0]?.id ?? "");
      setSelectedVariant(target?.offenseVariant ?? "tight");
      setDefensePlayers(clonePlayers(target?.players ?? defenseInitialPlayers));
      setQuoteSourceId("");
    };

    void load();
  }, []);

  const selectedPackage = useMemo(
    () => offensePackages.find((system) => system.id === selectedPackageId) ?? null,
    [offensePackages, selectedPackageId]
  );

  const lockedOffensePlayers = useMemo<SavedPlayer[]>(() => selectedPackage?.variants.wide ?? [], [selectedPackage]);

  const quoteCandidates = useMemo(
    () => savedDefenseSystems.filter((system) => (editingSystem ? system.id !== editingSystem.id : true)),
    [editingSystem, savedDefenseSystems]
  );

  const handleQuoteDefense = () => {
    const source = quoteCandidates.find((item) => item.id === quoteSourceId) ?? null;
    if (!source) {
      return;
    }

    setDefensePlayers(clonePlayers(source.players));
  };

  const saveDefense = () => {
    const inputName = window.prompt("体系名を入力してください", editingSystem?.name ?? "ディフェンス体系");
    const name = inputName?.trim();

    if (!name) {
      return "保存をキャンセルしました。";
    }

    saveDefenseSystem({
      id: editingSystem?.id ?? `defense-${Date.now()}`,
      name,
      category: "defense",
      players: defensePlayers,
      offensePackageId: selectedPackage?.id,
      offenseVariant: selectedVariant,
      createdAt: editingSystem?.createdAt ?? Date.now()
    });

    return `${name} を保存しました。`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/editor"
          className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
        >
          戻る
        </Link>

        <label className="text-sm font-semibold text-stone-700">
          基準にするオフェンス体系
          <select
            value={selectedPackageId}
            onChange={(event) => setSelectedPackageId(event.target.value)}
            className="ml-3 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900"
          >
            {offensePackages.length === 0 && <option value="">オフェンス体系がありません</option>}
            {offensePackages.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedVariant("tight")}
            className={`rounded-full px-5 py-3 text-sm font-semibold ${
              selectedVariant === "tight"
                ? "bg-amber-300 text-stone-950"
                : "border border-stone-300 bg-white text-stone-900"
            }`}
          >
            タイト
          </button>
          <button
            type="button"
            onClick={() => setSelectedVariant("wide")}
            className={`rounded-full px-5 py-3 text-sm font-semibold ${
              selectedVariant === "wide"
                ? "bg-amber-300 text-stone-950"
                : "border border-stone-300 bg-white text-stone-900"
            }`}
          >
            ワイド
          </button>
        </div>
      </div>

      {!editingSystem && quoteCandidates.length > 0 && (
        <div className="rounded-3xl border border-stone-200 bg-white px-5 py-4">
          <p className="text-sm font-semibold text-stone-900">ほかのディフェンス体系を引用する</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={quoteSourceId}
              onChange={(event) => setQuoteSourceId(event.target.value)}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900"
            >
              <option value="">引用する体系を選択</option>
              {quoteCandidates.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleQuoteDefense}
              disabled={!quoteSourceId}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                quoteSourceId
                  ? "bg-amber-300 text-stone-950 hover:bg-amber-400"
                  : "border border-stone-300 bg-stone-100 text-stone-400"
              }`}
            >
              引用して配置する
            </button>
          </div>
        </div>
      )}

      <SystemEditorField
        title={editingSystem ? "相手の体形を編集する" : "相手の体形を追加する"}
        description="基準のオフェンス体系を表示したまま、ディフェンス配置だけを編集します。"
        palettePlayers={["CB", "S", "LB", "DE", "DT", "N"]}
        players={defensePlayers}
        onPlayersChange={setDefensePlayers}
        sideLabel="DEFENSE"
        onSave={saveDefense}
        lockedPlayers={lockedOffensePlayers}
        lockedSideLabel={lockedOffensePlayers.length > 0 ? `LOCKED OFFENSE ${selectedVariant.toUpperCase()}` : undefined}
        zoomToLine={selectedVariant === "tight"}
      />
    </div>
  );
}
