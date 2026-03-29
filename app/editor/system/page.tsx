"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SystemEditorField } from "@/components/system-editor-field";
import { requestActionPassword } from "@/lib/action-password";
import {
  getOffensePackages,
  OffenseVariant,
  saveOffensePackage,
  SavedOffensePackage,
  SavedPlayer
} from "@/lib/system-storage";

const defaultPlayers: SavedPlayer[] = [
  { id: "lt", label: "T", left: 42.6, top: 66 },
  { id: "lg", label: "G", left: 46.3, top: 66 },
  { id: "c", label: "C", left: 50, top: 66 },
  { id: "rg", label: "G", left: 53.7, top: 66 },
  { id: "rt", label: "T", left: 57.4, top: 66 },
  { id: "qb", label: "QB", left: 50, top: 79 },
  { id: "wr-left", label: "WR", left: 20, top: 78 },
  { id: "wr-right", label: "WR", left: 80, top: 78 }
];

const clonePlayers = (players: SavedPlayer[]) => players.map((player) => ({ ...player }));

export default function EditorSystemPage() {
  const [variant, setVariant] = useState<OffenseVariant>("tight");
  const [players, setPlayers] = useState<SavedPlayer[]>(clonePlayers(defaultPlayers));
  const [editingPackage, setEditingPackage] = useState<SavedOffensePackage | null>(null);

  useEffect(() => {
    const editingId = new URLSearchParams(window.location.search).get("id");

    if (!editingId) {
      setEditingPackage(null);
      setPlayers(clonePlayers(defaultPlayers));
      return;
    }

    const allowed = requestActionPassword("体系を編集するにはパスワードを入力してください");
    if (!allowed) {
      window.location.replace("/editor");
      return;
    }

    const target = getOffensePackages().find((item) => item.id === editingId) ?? null;
    setEditingPackage(target);
    setPlayers(clonePlayers(target?.variants.wide ?? defaultPlayers));
  }, []);

  const savePackage = () => {
    const inputName = window.prompt("体系名を入力してください", editingPackage?.name ?? "オフェンス体系");
    const name = inputName?.trim();

    if (!name) {
      return "保存をキャンセルしました。";
    }

    saveOffensePackage({
      id: editingPackage?.id ?? `offense-package-${Date.now()}`,
      name,
      category: "offense-package",
      variants: {
        tight: clonePlayers(players),
        wide: clonePlayers(players)
      },
      createdAt: editingPackage?.createdAt ?? Date.now()
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVariant("tight")}
            className={`rounded-full px-5 py-3 text-sm font-semibold ${
              variant === "tight"
                ? "bg-amber-300 text-stone-950"
                : "border border-stone-300 bg-white text-stone-900"
            }`}
          >
            タイト
          </button>
          <button
            type="button"
            onClick={() => setVariant("wide")}
            className={`rounded-full px-5 py-3 text-sm font-semibold ${
              variant === "wide"
                ? "bg-amber-300 text-stone-950"
                : "border border-stone-300 bg-white text-stone-900"
            }`}
          >
            ワイド
          </button>
        </div>
      </div>

      <SystemEditorField
        title={editingPackage ? "使用する体系を編集する" : "使用する体系を追加する"}
        description="体系は1つとして扱います。タイトはズーム表示、ワイドは全体表示です。編集時は保存済みの配置をそのまま直せます。"
        palettePlayers={["C", "G", "T", "QB", "WR", "TE", "RB"]}
        players={players}
        onPlayersChange={setPlayers}
        sideLabel={`OFFENSE ${variant.toUpperCase()}`}
        onSave={savePackage}
        zoomToLine={variant === "tight"}
      />
    </div>
  );
}
