"use client";

import { useEffect, useRef, useState } from "react";
import { SavedPlayer } from "@/lib/system-storage";

const FIELD_LENGTH_YARDS = 120;
const FIELD_WIDTH_YARDS = 53.3;
const HASH_FROM_SIDELINE_YARDS = 20;
const FIELD_WIDTH_FEET = FIELD_WIDTH_YARDS * 3;
const HASH_INBOUND_FEET = HASH_FROM_SIDELINE_YARDS * 3;
const HASH_X_LEFT = (HASH_INBOUND_FEET / FIELD_WIDTH_FEET) * 100;
const HASH_X_RIGHT = 100 - HASH_X_LEFT;
const SIDELINE_HASH_OFFSET = (0.67 / FIELD_WIDTH_FEET) * 100;
const HASH_LENGTH = (2 / FIELD_WIDTH_FEET) * 100;
const OUTER_HASH_OFFSET = (1.2 / FIELD_WIDTH_FEET) * 100;
const PLAYER_MARKER_YARDS = 1.05;
const PLAYER_MARKER_SIZE = (PLAYER_MARKER_YARDS / FIELD_WIDTH_YARDS) * 100;
const TIGHT_ZOOM_SCALE = 2.1;
const TIGHT_ZOOM_TRANSLATE_Y = -18;
const FIVE_YARD_ROWS = Array.from(
  { length: FIELD_LENGTH_YARDS / 5 - 1 },
  (_, index) => ((index + 1) * 5 * 100) / FIELD_LENGTH_YARDS
);
const HASH_ROWS = Array.from(
  { length: FIELD_LENGTH_YARDS - 20 },
  (_, index) => ((index + 10) * 100) / FIELD_LENGTH_YARDS
);
const YARD_NUMBER_ROWS = [20, 30, 40, 50, 60, 70, 80, 90, 100].map((yard) => ({
  top: (yard / FIELD_LENGTH_YARDS) * 100,
  label: yard <= 50 ? String(yard) : String(100 - yard)
}));

type Player = SavedPlayer;

type Props = {
  title: string;
  description: string;
  palettePlayers: readonly string[];
  players: Player[];
  onPlayersChange: (players: Player[]) => void;
  sideLabel: string;
  onSave: (players: Player[]) => string;
  lockedPlayers?: Player[];
  lockedSideLabel?: string;
  zoomToLine?: boolean;
};

type DragState = {
  playerId: string;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
};

export const SystemEditorField = ({
  title,
  description,
  palettePlayers,
  players,
  onPlayersChange,
  sideLabel,
  onSave,
  lockedPlayers = [],
  lockedSideLabel,
  zoomToLine = false
}: Props) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [history, setHistory] = useState<Player[][]>([]);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [customPositionName, setCustomPositionName] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const zoomScale = zoomToLine ? TIGHT_ZOOM_SCALE : 1;

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const clonePlayers = (source: Player[]) => source.map((player) => ({ ...player }));

  const pushHistory = (snapshot: Player[]) => {
    setHistory((current) => [...current, clonePlayers(snapshot)].slice(-30));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedPlayerId) {
        return;
      }

      const step = event.shiftKey ? 0.25 : 0.125;
      const keyMap: Record<string, { dx: number; dy: number }> = {
        ArrowUp: { dx: 0, dy: -step },
        ArrowDown: { dx: 0, dy: step },
        ArrowLeft: { dx: -step, dy: 0 },
        ArrowRight: { dx: step, dy: 0 }
      };

      const movement = keyMap[event.key];
      if (!movement) {
        return;
      }

      event.preventDefault();
      pushHistory(players);
      onPlayersChange(
        players.map((player) =>
          player.id === selectedPlayerId
            ? {
                ...player,
                left: clamp(player.left + movement.dx, 3, 97),
                top: clamp(player.top + movement.dy, 3, 97)
              }
            : player
        )
      );
      setSaveMessage("");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [players, selectedPlayerId, onPlayersChange]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const field = fieldRef.current;
    if (!field) {
      return;
    }

    const rect = field.getBoundingClientRect();

    const handleMouseMove = (event: MouseEvent) => {
      const deltaXPercent = (event.clientX - dragState.startClientX) / (rect.width * zoomScale) * 100;
      const deltaYPercent = (event.clientY - dragState.startClientY) / (rect.height * zoomScale) * 100;

      onPlayersChange(
        players.map((player) =>
          player.id === dragState.playerId
            ? {
                ...player,
                left: clamp(dragState.startLeft + deltaXPercent, 3, 97),
                top: clamp(dragState.startTop + deltaYPercent, 3, 97)
              }
            : player
        )
      );
      setSaveMessage("");
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, onPlayersChange, players, zoomScale]);

  const deleteSelectedPlayer = () => {
    if (!selectedPlayerId) {
      return;
    }

    pushHistory(players);
    onPlayersChange(players.filter((player) => player.id !== selectedPlayerId));
    setSelectedPlayerId(null);
    setSaveMessage("");
  };

  const undoOneStep = () => {
    setHistory((current) => {
      if (current.length === 0) {
        return current;
      }

      const previous = current[current.length - 1];
      onPlayersChange(clonePlayers(previous));
      setSelectedPlayerId(null);
      setSaveMessage("");
      return current.slice(0, -1);
    });
  };

  const handleSave = () => {
    setSaveMessage(onSave(players));
  };

  const addCustomPosition = () => {
    const label = customPositionName.trim().toUpperCase();
    if (!label) {
      setSaveMessage("追加するポジション名を入力してください。");
      return;
    }

    pushHistory(players);
    onPlayersChange([
      ...players,
      {
        id: `${label}-${Date.now()}-${players.length}`,
        label,
        left: 50,
        top: 72
      }
    ]);
    setCustomPositionName("");
    setSaveMessage(`${label} を追加しました。`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <section className="card-surface rounded-[2rem] px-6 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">System Editor</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">{description}</p>

        <div className="mt-6 space-y-3">
          {palettePlayers.map((player) => (
            <div
              key={player}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/player-label", player);
                event.dataTransfer.effectAllowed = "copy";
              }}
              className="flex w-full cursor-grab items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 py-4 text-base font-bold text-stone-900"
            >
              {player}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-900">新しくポジションを追加する</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              value={customPositionName}
              onChange={(event) => setCustomPositionName(event.target.value)}
              placeholder="例: H / FB / NB"
              className="min-w-[180px] flex-1 rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900"
            />
            <button
              type="button"
              onClick={addCustomPosition}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
            >
              <span className="text-white">ポジションを追加</span>
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm text-stone-600">
          <p>フィールド長: 120ヤード</p>
          <p>フィールド幅: 53.3ヤード</p>
          <p>ハッシュ位置: サイドラインから約20ヤード内側</p>
          <p>選手を選んだ後は矢印キーで微調整できます。Shift で少し大きめに動きます。</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            <span className="text-white">保存する</span>
          </button>
          <button
            type="button"
            onClick={undoOneStep}
            className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
          >
            一つ戻る
          </button>
          <button
            type="button"
            onClick={deleteSelectedPlayer}
            className="rounded-full border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700"
          >
            ポジションを削除
          </button>
        </div>

        {saveMessage && <p className="mt-4 text-sm text-stone-600">{saveMessage}</p>}
      </section>

      <section className="card-surface rounded-[2rem] p-4 sm:p-6">
        <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:overflow-visible sm:px-0">
        <div
          ref={fieldRef}
          className="relative mx-auto aspect-[53.3/120] w-[560px] min-w-[560px] overflow-hidden rounded-[1.75rem] border border-white/20 bg-[linear-gradient(180deg,#2d6a3d_0%,#1f4f2e_100%)] sm:w-full sm:min-w-0 sm:max-w-[480px] lg:max-w-[560px]"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const label = event.dataTransfer.getData("text/player-label");
            if (!label || !fieldRef.current) {
              return;
            }

            const rect = fieldRef.current.getBoundingClientRect();
            const left = clamp(((event.clientX - rect.left) / rect.width) * 100, 3, 97);
            const top = clamp(((event.clientY - rect.top) / rect.height) * 100, 3, 97);

            pushHistory(players);
            onPlayersChange([
              ...players,
              {
                id: `${label}-${Date.now()}-${players.length}`,
                label,
                left,
                top
              }
            ]);
            setSaveMessage("");
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: zoomToLine ? `translateY(${TIGHT_ZOOM_TRANSLATE_Y}%) scale(${TIGHT_ZOOM_SCALE})` : "none",
              transformOrigin: "50% 62%"
            }}
          >
            {Array.from({ length: 9 }, (_, index) => (
              <div
                key={`vertical-${index}`}
                className="absolute top-0 h-full w-px bg-white/35"
                style={{ left: `${(index + 1) * 10}%` }}
              />
            ))}

            {FIVE_YARD_ROWS.map((top, index) => (
              <div
                key={`yard-${index}`}
                className={`absolute left-0 w-full border-t ${index % 2 === 1 ? "border-white/30" : "border-white/12"}`}
                style={{ top: `${top}%` }}
              />
            ))}

            <div className="absolute inset-x-0 top-[62%] border-t-4 border-white" />

            {HASH_ROWS.map((top) => (
              <div
                key={`left-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/90"
                style={{
                  left: `${HASH_X_LEFT}%`,
                  top: `${top}%`,
                  width: `${HASH_LENGTH}%`,
                  transform: "translate(-100%, -50%)"
                }}
              />
            ))}

            {HASH_ROWS.map((top) => (
              <div
                key={`right-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/90"
                style={{
                  left: `${HASH_X_RIGHT}%`,
                  top: `${top}%`,
                  width: `${HASH_LENGTH}%`
                }}
              />
            ))}

            {HASH_ROWS.map((top) => (
              <div
                key={`left-sideline-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/65"
                style={{
                  left: `${SIDELINE_HASH_OFFSET}%`,
                  top: `${top}%`,
                  width: `${HASH_LENGTH}%`
                }}
              />
            ))}

            {HASH_ROWS.map((top) => (
              <div
                key={`right-sideline-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/65"
                style={{
                  right: `${SIDELINE_HASH_OFFSET}%`,
                  top: `${top}%`,
                  width: `${HASH_LENGTH}%`
                }}
              />
            ))}

            {HASH_ROWS.map((top) => (
              <div
                key={`left-outer-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/45"
                style={{
                  left: `-${OUTER_HASH_OFFSET + HASH_LENGTH}%`,
                  top: `${top}%`,
                  width: `${HASH_LENGTH}%`
                }}
              />
            ))}

            {HASH_ROWS.map((top) => (
              <div
                key={`right-outer-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/45"
                style={{
                  right: `-${OUTER_HASH_OFFSET + HASH_LENGTH}%`,
                  top: `${top}%`,
                  width: `${HASH_LENGTH}%`
                }}
              />
            ))}

            <div className="absolute right-4 top-[62%] -translate-y-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-900">
              LOS
            </div>

            <div className="absolute inset-x-0 bottom-4 text-center text-sm font-semibold tracking-[0.25em] text-white/85">
              {sideLabel}
            </div>

            {YARD_NUMBER_ROWS.map((item) => (
              <div
                key={`left-number-${item.top}`}
                className="absolute -translate-y-1/2 text-sm font-bold text-white/70"
                style={{ left: "8%", top: `${item.top}%` }}
              >
                {item.label}
              </div>
            ))}

            {YARD_NUMBER_ROWS.map((item) => (
              <div
                key={`right-number-${item.top}`}
                className="absolute -translate-y-1/2 text-sm font-bold text-white/70"
                style={{ right: "8%", top: `${item.top}%` }}
              >
                {item.label}
              </div>
            ))}

            {lockedSideLabel && (
              <div className="absolute inset-x-0 top-4 text-center text-sm font-semibold tracking-[0.25em] text-cyan-100/90">
                {lockedSideLabel}
              </div>
            )}

            {selectedPlayer && (
              <>
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-amber-200/80"
                  style={{ top: `${selectedPlayer.top}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 border-l border-dashed border-amber-200/80"
                  style={{ left: `${selectedPlayer.left}%` }}
                />
              </>
            )}

            {lockedPlayers.map((player) => (
              <div
                key={`locked-${player.id}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                style={{ left: `${player.left}%`, top: `${player.top}%` }}
              >
                <div
                  className="mx-auto flex items-center justify-center rounded-full border border-cyan-100/70 bg-cyan-100 font-bold text-slate-900 opacity-90"
                  style={{
                    width: `${PLAYER_MARKER_SIZE}%`,
                    height: `${PLAYER_MARKER_SIZE}%`,
                    minWidth: "18px",
                    minHeight: "18px",
                    fontSize: "9px"
                  }}
                >
                  {player.label}
                </div>
              </div>
            ))}

            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setSelectedPlayerId(player.id)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pushHistory(players);
                  setSelectedPlayerId(player.id);
                  setDragState({
                    playerId: player.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startLeft: player.left,
                    startTop: player.top
                  });
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move text-center"
                style={{ left: `${player.left}%`, top: `${player.top}%` }}
              >
                <div
                  className={`mx-auto flex items-center justify-center rounded-full font-bold text-stone-900 shadow-sm ${
                    selectedPlayerId === player.id
                      ? "border-2 border-rose-600 bg-rose-100"
                      : "border border-white/50 bg-amber-100"
                  }`}
                  style={{
                    width: `${PLAYER_MARKER_SIZE}%`,
                    height: `${PLAYER_MARKER_SIZE}%`,
                    minWidth: "18px",
                    minHeight: "18px",
                    fontSize: "9px"
                  }}
                >
                  {player.label}
                </div>
              </button>
            ))}
          </div>
        </div>
        </div>
      </section>
    </div>
  );
};
