"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPlayDrafts, type SavedLineType, type SavedPlayDraft } from "@/lib/play-storage";
import { getSavedTests, type SavedTest } from "@/lib/test-storage";
import {
  getDefenseSystems,
  getOffensePackages,
  type SavedDefenseSystem,
  type SavedOffensePackage,
  type SavedPlayer
} from "@/lib/system-storage";

type PathPoint = { x: number; y: number };
type PlayerPath = {
  playerId: string;
  points: PathPoint[];
  lineType?: SavedLineType;
  controlPoint?: PathPoint;
  blockTargetId?: string;
  leftBranchPoint?: PathPoint;
  rightBranchPoint?: PathPoint;
};
type AnchorMode = "center" | "leftFoot" | "rightFoot";
type SegmentJudge = {
  main: boolean;
  leftBranch: boolean | null;
  rightBranch: boolean | null;
};
type JudgeResult = Record<string, SegmentJudge>;
type DragHandleType = "main" | "leftBranch" | "rightBranch";
type DragLine = {
  playerId: string;
  currentPoint: PathPoint;
  startPoint: PathPoint;
  handleType: DragHandleType;
  lineType: SavedLineType;
  stage: "placingMid" | "placingEnd";
  controlPoint?: PathPoint;
};

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
const LOS_TOP = 62;
const FOOT_OFFSET_X = 0.9;
const BODY_FRONT_OFFSET_Y = 1.2;
const TIGHT_ZOOM_SCALE = 2.1;
const TIGHT_ZOOM_TRANSLATE_Y = -18;
const ZOOM_ORIGIN_X = 50;
const ZOOM_ORIGIN_Y = 62;
const FIVE_YARD_ROWS = Array.from(
  { length: FIELD_LENGTH_YARDS / 5 - 1 },
  (_, index) => ((index + 1) * 5 * 100) / FIELD_LENGTH_YARDS
);
const HASH_ROWS = Array.from(
  { length: FIELD_LENGTH_YARDS - 20 },
  (_, index) => ((index + 10) * 100) / FIELD_LENGTH_YARDS
);

const isLinePlayer = (label: string) => ["C", "G", "T", "TE", "DE", "DT", "NT", "N"].includes(label);
const isOffenseBlockPlayer = (label: string) => ["C", "G", "T", "TE"].includes(label);
const isDefensiveLinePlayer = (label: string) => ["DE", "DT", "NT", "N"].includes(label);
const CONTACT_RADIUS = 1.3;
const CONTACT_BAR_HALF = 1.35;
const CONTACT_SNAP_DISTANCE = 3.2;

const getAnchorPoint = (player: SavedPlayer, anchorMode: AnchorMode, side: "offense" | "defense") => {
  const frontOffsetY = side === "offense" ? -BODY_FRONT_OFFSET_Y : BODY_FRONT_OFFSET_Y;

  if (anchorMode === "leftFoot") {
    return { x: player.left - FOOT_OFFSET_X, y: player.top + frontOffsetY };
  }

  if (anchorMode === "rightFoot") {
    return { x: player.left + FOOT_OFFSET_X, y: player.top + frontOffsetY };
  }

  return { x: player.left, y: player.top + frontOffsetY };
};

const pointInPolygon = (point: PathPoint, polygon: PathPoint[]) => {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const xi = polygon[index].x;
    const yi = polygon[index].y;
    const xj = polygon[previous].x;
    const yj = polygon[previous].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.00001) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
};

const getDistance = (left: PathPoint, right: PathPoint) => Math.hypot(left.x - right.x, left.y - right.y);

const getLinePathD = (
  startPoint: PathPoint,
  endPoint: PathPoint,
  lineType: SavedLineType = "straight",
  controlPoint?: PathPoint
) => {
  if (lineType === "bend") {
    const bendPoint = controlPoint ?? { x: startPoint.x, y: endPoint.y };
    return `M ${startPoint.x} ${startPoint.y} L ${bendPoint.x} ${bendPoint.y} L ${endPoint.x} ${endPoint.y}`;
  }

  if (lineType === "curve") {
    if (controlPoint) {
      const bezierControlPoint = {
        x: 2 * controlPoint.x - (startPoint.x + endPoint.x) / 2,
        y: 2 * controlPoint.y - (startPoint.y + endPoint.y) / 2
      };
      return `M ${startPoint.x} ${startPoint.y} Q ${bezierControlPoint.x} ${bezierControlPoint.y} ${endPoint.x} ${endPoint.y}`;
    }

    const throughPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: startPoint.y + (endPoint.y - startPoint.y) * 0.35
    };
    const bezierControlPoint = {
      x: 2 * throughPoint.x - (startPoint.x + endPoint.x) / 2,
      y: 2 * throughPoint.y - (startPoint.y + endPoint.y) / 2
    };
    return `M ${startPoint.x} ${startPoint.y} Q ${bezierControlPoint.x} ${bezierControlPoint.y} ${endPoint.x} ${endPoint.y}`;
  }

  return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
};

const getBlockBarGeometry = (contactPoint: PathPoint, targetPoint: PathPoint) => {
  const dx = contactPoint.x - targetPoint.x;
  const dy = contactPoint.y - targetPoint.y;
  const length = Math.hypot(dx, dy) || 0.0001;
  const unitX = dx / length;
  const unitY = dy / length;
  const perpendicular = { x: -unitY, y: unitX };

  return {
    barStart: {
      x: contactPoint.x - perpendicular.x * CONTACT_BAR_HALF,
      y: contactPoint.y - perpendicular.y * CONTACT_BAR_HALF
    },
    barEnd: {
      x: contactPoint.x + perpendicular.x * CONTACT_BAR_HALF,
      y: contactPoint.y + perpendicular.y * CONTACT_BAR_HALF
    }
  };
};

const getGuidedBlockGeometry = (pointerPoint: PathPoint, targetPoint: PathPoint, fallbackPoint: PathPoint) => {
  const dx = pointerPoint.x - targetPoint.x;
  const dy = pointerPoint.y - targetPoint.y;
  const length = Math.hypot(dx, dy);
  const safeDx = length > 0.0001 ? dx : fallbackPoint.x - targetPoint.x;
  const safeDy = length > 0.0001 ? dy : fallbackPoint.y - targetPoint.y;
  const safeLength = Math.hypot(safeDx, safeDy) || 0.0001;
  const unitX = safeDx / safeLength;
  const unitY = safeDy / safeLength;
  const contactPoint = {
    x: targetPoint.x + unitX * CONTACT_RADIUS,
    y: targetPoint.y + unitY * CONTACT_RADIUS
  };
  const barGeometry = getBlockBarGeometry(contactPoint, targetPoint);

  return {
    contactPoint,
    barStart: barGeometry.barStart,
    barEnd: barGeometry.barEnd
  };
};

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

export default function TestSessionPage() {
  const [currentTest, setCurrentTest] = useState<SavedTest | null>(null);
  const [plays, setPlays] = useState<SavedPlayDraft[]>([]);
  const [offensePackages, setOffensePackages] = useState<SavedOffensePackage[]>([]);
  const [defenseSystems, setDefenseSystems] = useState<SavedDefenseSystem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [answerPaths, setAnswerPaths] = useState<PlayerPath[]>([]);
  const [dragLine, setDragLine] = useState<DragLine | null>(null);
  const [selectedLineType, setSelectedLineType] = useState<SavedLineType>("straight");
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeSummary, setJudgeSummary] = useState("");
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [judgedPlayIds, setJudgedPlayIds] = useState<string[]>([]);
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const testId = new URLSearchParams(window.location.search).get("id");
      const [savedTests, savedPlays, nextOffensePackages, nextDefenseSystems] = await Promise.all([
        getSavedTests(),
        getPlayDrafts(),
        getOffensePackages(),
        getDefenseSystems()
      ]);
      const savedTest = savedTests.find((item) => item.id === testId) ?? null;
      const selectedPlays = savedTest
        ? savedTest.playIds
            .map((playId) => savedPlays.find((play) => play.id === playId) ?? null)
            .filter((play): play is SavedPlayDraft => Boolean(play))
        : [];

      setCurrentTest(savedTest);
      setPlays(savedTest?.orderMode === "random" ? shuffle(selectedPlays) : selectedPlays);
      setOffensePackages(nextOffensePackages);
      setDefenseSystems(nextDefenseSystems);
    };

    void load();
  }, []);

  const currentPlay = plays[currentIndex] ?? null;
  const offensePackage = useMemo(
    () => offensePackages.find((item) => item.id === currentPlay?.offensePackageId) ?? null,
    [currentPlay?.offensePackageId, offensePackages]
  );
  const defenseSystem = useMemo(
    () => defenseSystems.find((item) => item.id === currentPlay?.defenseSystemId) ?? null,
    [currentPlay?.defenseSystemId, defenseSystems]
  );

  const offensePlayers = currentPlay && offensePackage ? offensePackage.variants[currentPlay.studyDisplayVariant] : [];
  const defensePlayers = defenseSystem?.players ?? [];
  const editablePlayers = currentPlay?.assignmentSide === "offense" ? offensePlayers : defensePlayers;
  const selectedPlayer = editablePlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedPath = selectedPlayerId
    ? answerPaths.find((path) => path.playerId === selectedPlayerId) ?? null
    : null;

  const getSnapBlockTarget = (player: SavedPlayer | null, point: PathPoint): SavedPlayer | null => {
    if (!player || currentPlay?.assignmentSide !== "offense" || !isOffenseBlockPlayer(player.label)) {
      return null;
    }

    const candidates = defensePlayers.filter((target) => isDefensiveLinePlayer(target.label));
    let nearest: SavedPlayer | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((target) => {
      const distance = getDistance(point, { x: target.left, y: target.top });
      if (distance < nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    });

    return nearest && nearestDistance <= CONTACT_SNAP_DISTANCE ? nearest : null;
  };

  useEffect(() => {
    setSelectedPlayerId(null);
    setAnswerPaths([]);
    setDragLine(null);
    setJudgeResult(null);
    setJudgeSummary("");
  }, [currentIndex]);

  useEffect(() => {
    if (selectedPath?.lineType) {
      setSelectedLineType(selectedPath.lineType);
    }
  }, [selectedPath?.lineType]);

  const getFieldPointFromPointer = (clientX: number, clientY: number) => {
    const field = fieldRef.current;
    if (!field || !currentPlay) {
      return null;
    }

    const rect = field.getBoundingClientRect();
    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 100;

    if (currentPlay.studyDisplayVariant !== "tight") {
      return {
        x: Math.max(0, Math.min(100, rawX)),
        y: Math.max(0, Math.min(100, rawY))
      };
    }

    const adjustedX = ZOOM_ORIGIN_X + (rawX - ZOOM_ORIGIN_X) / TIGHT_ZOOM_SCALE;
    const adjustedY =
      ZOOM_ORIGIN_Y + (rawY - TIGHT_ZOOM_TRANSLATE_Y - ZOOM_ORIGIN_Y) / TIGHT_ZOOM_SCALE;

    return {
      x: Math.max(0, Math.min(100, adjustedX)),
      y: Math.max(0, Math.min(100, adjustedY))
    };
  };

  const getRenderedPathGeometry = (player: SavedPlayer, path: PlayerPath | undefined) => {
    if (!currentPlay) {
      return {
        startPoint: null as PathPoint | null,
        endPoint: null as PathPoint | null,
        barStart: null as PathPoint | null,
        barEnd: null as PathPoint | null,
        leftBranchPoint: null as PathPoint | null,
        rightBranchPoint: null as PathPoint | null
      };
    }

    const anchorMode = isLinePlayer(player.label)
      ? ((currentPlay.anchorByPlayerId[player.id] ?? "center") as AnchorMode)
      : "center";
    const startPoint = getAnchorPoint(player, anchorMode, currentPlay.assignmentSide);

    if (!path || path.points.length === 0) {
      return {
        startPoint,
        endPoint: null as PathPoint | null,
        barStart: null as PathPoint | null,
        barEnd: null as PathPoint | null,
        leftBranchPoint: null as PathPoint | null,
        rightBranchPoint: null as PathPoint | null
      };
    }

    if (path.blockTargetId) {
      const target = defensePlayers.find((item) => item.id === path.blockTargetId);
      if (target) {
        const endPoint = path.points[path.points.length - 1];
        const barGeometry = getBlockBarGeometry(endPoint, { x: target.left, y: target.top });
        return {
          startPoint,
          endPoint,
          barStart: barGeometry.barStart,
          barEnd: barGeometry.barEnd,
          leftBranchPoint: path.leftBranchPoint ?? null,
          rightBranchPoint: path.rightBranchPoint ?? null
        };
      }
    }

    return {
      startPoint,
      endPoint: path.points[path.points.length - 1],
      barStart: null as PathPoint | null,
      barEnd: null as PathPoint | null,
      leftBranchPoint: null as PathPoint | null,
      rightBranchPoint: null as PathPoint | null
    };
  };

  const handleJudge = () => {
    if (!currentPlay) {
      return;
    }

    const result: JudgeResult = {};

    currentPlay.paths.forEach((path) => {
      const answer = answerPaths.find((item) => item.playerId === path.playerId);
      const correctEnd = path.points[path.points.length - 1];
      const tolerance = currentPlay.toleranceByPlayerId[path.playerId];
      const tolerancePolygon = tolerance?.main;

      if (!answer || answer.points.length === 0 || !correctEnd || !tolerancePolygon) {
        result[path.playerId] = { main: false, leftBranch: null, rightBranch: null };
        return;
      }

      const answerEnd = answer.points[answer.points.length - 1];
      const mainCorrect = pointInPolygon(answerEnd, tolerancePolygon);
      const leftRequired = Boolean(path.leftBranchPoint || tolerance?.leftBranch);
      const rightRequired = Boolean(path.rightBranchPoint || tolerance?.rightBranch);
      const leftCorrect = leftRequired
        ? Boolean(
            answer.leftBranchPoint &&
              tolerance?.leftBranch &&
              pointInPolygon(answer.leftBranchPoint, tolerance.leftBranch)
          )
        : !answer.leftBranchPoint;
      const rightCorrect = rightRequired
        ? Boolean(
            answer.rightBranchPoint &&
              tolerance?.rightBranch &&
              pointInPolygon(answer.rightBranchPoint, tolerance.rightBranch)
          )
        : !answer.rightBranchPoint;

      result[path.playerId] = {
        main: mainCorrect,
        leftBranch: leftRequired ? leftCorrect : null,
        rightBranch: rightRequired ? rightCorrect : null
      };
    });

    const total = Object.values(result).reduce(
      (sum, item) => sum + 1 + (item.leftBranch !== null ? 1 : 0) + (item.rightBranch !== null ? 1 : 0),
      0
    );
    const correct = Object.values(result).reduce(
      (sum, item) =>
        sum +
        (item.main ? 1 : 0) +
        (item.leftBranch ? 1 : 0) +
        (item.rightBranch ? 1 : 0),
      0
    );
    setJudgeResult(result);
    setJudgeSummary(`${correct} / ${total} 正解`);

    if (!judgedPlayIds.includes(currentPlay.id)) {
      setJudgedPlayIds((current) => [...current, currentPlay.id]);
      setTotalCorrect((current) => current + correct);
    }
  };

  const totalQuestions = plays.reduce((sum, play) => sum + play.paths.length, 0);
  const selectedPathGeometry =
    selectedPlayer && selectedPath ? getRenderedPathGeometry(selectedPlayer, selectedPath) : null;

  if (!currentTest) {
    return (
      <div className="mx-auto max-w-4xl">
        <section className="card-surface rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="text-3xl font-bold text-stone-900">テストが見つかりません</h1>
          <div className="mt-6">
            <Link
              href="/test"
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
            >
              テスト一覧へ戻る
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Test Session</p>
          <h1 className="mt-2 text-3xl font-bold text-stone-900">{currentPlay?.name ?? "プレーが見つかりません"}</h1>
          <p className="mt-2 text-sm text-stone-500">
            テスト名: {currentTest.name} / {currentIndex + 1} / {plays.length} プレー
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-2">
            <span className="text-xs font-semibold text-stone-500">線の形</span>
            {([
              { value: "straight", label: "直線" },
              { value: "curve", label: "曲線" },
              { value: "bend", label: "一度曲がる" }
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedLineType(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  selectedLineType === option.value
                    ? "bg-amber-300 text-stone-950"
                    : "border border-stone-200 bg-stone-50 text-stone-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setAnswerPaths([]);
              setJudgeResult(null);
              setJudgeSummary("");
            }}
            className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
          >
            回答を消す
          </button>
          <button
            type="button"
            onClick={handleJudge}
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950"
          >
            正誤判定
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((current) => (plays.length === 0 ? 0 : Math.min(current + 1, plays.length - 1)))}
            className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
          >
            次のプレー
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="rounded-3xl border border-stone-200 bg-white px-5 py-4 text-sm font-semibold text-stone-900">
          累計正解: {totalCorrect} / {totalQuestions}
        </div>
        {judgeSummary && (
          <div className="rounded-3xl border border-stone-200 bg-white px-5 py-4 text-sm font-semibold text-stone-900">
            {judgeSummary}
          </div>
        )}
      </div>

      <div className="card-surface mx-auto max-w-5xl rounded-[2rem] p-6">
        <div
          ref={fieldRef}
          onPointerMove={(event) => {
            if (!dragLine) {
              return;
            }

            const nextPoint = getFieldPointFromPointer(event.clientX, event.clientY);
            if (!nextPoint) {
              return;
            }

            setDragLine((current) => (current ? { ...current, currentPoint: nextPoint } : current));
          }}
          onPointerDown={(event) => {
            if (!dragLine || !selectedPlayer) {
              return;
            }

            const nextPoint = getFieldPointFromPointer(event.clientX, event.clientY);
            if (!nextPoint) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (dragLine.stage === "placingMid") {
              setDragLine((current) =>
                current
                  ? {
                      ...current,
                      stage: "placingEnd",
                      controlPoint: nextPoint,
                      currentPoint: nextPoint
                    }
                  : current
              );
              return;
            }

            const startPoint = dragLine.startPoint;
            const snapTarget =
              dragLine.handleType === "main" ? getSnapBlockTarget(selectedPlayer, nextPoint) : null;
            const endPoint = snapTarget
              ? getGuidedBlockGeometry(nextPoint, { x: snapTarget.left, y: snapTarget.top }, startPoint).contactPoint
              : nextPoint;

            if (dragLine.handleType === "main") {
              setAnswerPaths((current) => [
                ...current.filter((item) => item.playerId !== selectedPlayer.id),
                {
                  playerId: selectedPlayer.id,
                  points: [endPoint],
                  lineType: dragLine.lineType,
                  ...(dragLine.controlPoint ? { controlPoint: dragLine.controlPoint } : {}),
                  ...(snapTarget ? { blockTargetId: snapTarget.id } : {})
                }
              ]);
            } else if (dragLine.handleType === "leftBranch") {
              setAnswerPaths((current) =>
                current.map((path) =>
                  path.playerId === selectedPlayer.id
                    ? {
                        ...path,
                        leftBranchPoint: endPoint,
                        lineType: dragLine.lineType,
                        ...(dragLine.controlPoint ? { controlPoint: dragLine.controlPoint } : {})
                      }
                    : path
                )
              );
            } else {
              setAnswerPaths((current) =>
                current.map((path) =>
                  path.playerId === selectedPlayer.id
                    ? {
                        ...path,
                        rightBranchPoint: endPoint,
                        lineType: dragLine.lineType,
                        ...(dragLine.controlPoint ? { controlPoint: dragLine.controlPoint } : {})
                      }
                    : path
                )
              );
            }

            setDragLine(null);
          }}
          className="relative mx-auto h-[700px] w-full overflow-hidden rounded-[1.75rem] border border-white/20 bg-[linear-gradient(180deg,#2d6a3d_0%,#1f4f2e_100%)]"
        >
          <div
            className="absolute inset-0"
            style={{
              transform:
                currentPlay?.studyDisplayVariant === "tight"
                  ? `translateY(${TIGHT_ZOOM_TRANSLATE_Y}%) scale(${TIGHT_ZOOM_SCALE})`
                  : "none",
              transformOrigin: `${ZOOM_ORIGIN_X}% ${ZOOM_ORIGIN_Y}%`
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

            <div className="absolute inset-x-0 border-t-4 border-white" style={{ top: `${LOS_TOP}%` }} />

            {HASH_ROWS.map((top) => (
              <div
                key={`left-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/90"
                style={{ left: `${HASH_X_LEFT}%`, top: `${top}%`, width: `${HASH_LENGTH}%`, transform: "translate(-100%, -50%)" }}
              />
            ))}
            {HASH_ROWS.map((top) => (
              <div
                key={`right-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/90"
                style={{ left: `${HASH_X_RIGHT}%`, top: `${top}%`, width: `${HASH_LENGTH}%` }}
              />
            ))}
            {HASH_ROWS.map((top) => (
              <div
                key={`left-sideline-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/65"
                style={{ left: `${SIDELINE_HASH_OFFSET}%`, top: `${top}%`, width: `${HASH_LENGTH}%` }}
              />
            ))}
            {HASH_ROWS.map((top) => (
              <div
                key={`right-sideline-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/65"
                style={{ right: `${SIDELINE_HASH_OFFSET}%`, top: `${top}%`, width: `${HASH_LENGTH}%` }}
              />
            ))}
            {HASH_ROWS.map((top) => (
              <div
                key={`left-outer-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/45"
                style={{ left: `-${OUTER_HASH_OFFSET + HASH_LENGTH}%`, top: `${top}%`, width: `${HASH_LENGTH}%` }}
              />
            ))}
            {HASH_ROWS.map((top) => (
              <div
                key={`right-outer-hash-${top}`}
                className="absolute h-1 -translate-y-1/2 rounded-full bg-white/45"
                style={{ right: `-${OUTER_HASH_OFFSET + HASH_LENGTH}%`, top: `${top}%`, width: `${HASH_LENGTH}%` }}
              />
            ))}

            <div className="absolute left-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-900">
              {currentPlay?.name ?? "プレーが見つかりません"}
            </div>

            <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {editablePlayers.map((player) => {
                const path = answerPaths.find((item) => item.playerId === player.id);
                const geometry = getRenderedPathGeometry(player, path);
                if (!geometry.startPoint || !geometry.endPoint) {
                  return null;
                }

                const playerJudge = judgeResult?.[player.id];
                const mainStroke = judgeResult ? (playerJudge?.main ? "#86efac" : "#fda4af") : "#ffffff";
                const leftStroke =
                  judgeResult && playerJudge?.leftBranch !== null
                    ? playerJudge?.leftBranch
                      ? "#86efac"
                      : "#fda4af"
                    : "#ffffff";
                const rightStroke =
                  judgeResult && playerJudge?.rightBranch !== null
                    ? playerJudge?.rightBranch
                      ? "#86efac"
                      : "#fda4af"
                    : "#ffffff";
                const lineType = path?.lineType ?? "straight";
                const controlPoint = path?.controlPoint;

                return (
                  <g key={`answer-${player.id}`}>
                    <path
                      d={getLinePathD(
                        geometry.startPoint,
                        geometry.endPoint,
                        lineType,
                        controlPoint
                      )}
                      fill="none"
                      stroke={mainStroke}
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {geometry.barStart && geometry.barEnd && (
                      <>
                        <line
                          x1={geometry.barStart.x}
                          y1={geometry.barStart.y}
                          x2={geometry.barEnd.x}
                          y2={geometry.barEnd.y}
                          fill="none"
                          stroke={mainStroke}
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        {geometry.leftBranchPoint && (
                          <path
                            d={getLinePathD(geometry.barStart, geometry.leftBranchPoint, lineType)}
                            fill="none"
                            stroke={leftStroke}
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {geometry.rightBranchPoint && (
                          <path
                            d={getLinePathD(geometry.barEnd, geometry.rightBranchPoint, lineType)}
                            fill="none"
                            stroke={rightStroke}
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {dragLine && selectedPlayer && (
                (() => {
                  const startPoint = dragLine.startPoint;
                  const snapTarget = dragLine.handleType === "main" ? getSnapBlockTarget(selectedPlayer, dragLine.currentPoint) : null;
                  const geometry = snapTarget
                    ? getGuidedBlockGeometry(dragLine.currentPoint, { x: snapTarget.left, y: snapTarget.top }, startPoint)
                    : { contactPoint: dragLine.currentPoint, barStart: null, barEnd: null };

                  return (
                    <g>
                      <path
                        d={getLinePathD(
                          startPoint,
                          geometry.contactPoint,
                          dragLine.lineType,
                          dragLine.stage === "placingEnd" ? dragLine.controlPoint : undefined
                        )}
                        stroke="#ffffff"
                        fill="none"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {geometry.barStart && geometry.barEnd && (
                        <line
                          x1={geometry.barStart.x}
                          y1={geometry.barStart.y}
                          x2={geometry.barEnd.x}
                          y2={geometry.barEnd.y}
                          stroke="#ffffff"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </g>
                  );
                })()
              )}
            </svg>

            {[...defensePlayers, ...offensePlayers].map((player) => {
              const isEditable = editablePlayers.some((editablePlayer) => editablePlayer.id === player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isEditable) {
                      return;
                    }
                    setSelectedPlayerId(player.id);
                    setJudgeResult(null);
                    setJudgeSummary("");
                  }}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${player.left}%`, top: `${player.top}%` }}
                >
                  <div
                    className={`flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                      selectedPlayerId === player.id
                        ? "border-2 border-rose-600 bg-rose-100 text-stone-900"
                        : isEditable
                          ? "border border-white/50 bg-amber-100 text-stone-900"
                          : "border border-white/30 bg-amber-50/70 text-stone-500"
                    }`}
                  >
                    {player.label}
                  </div>
                </button>
              );
            })}

            {selectedPlayer && (
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  const anchorPoint = getAnchorPoint(
                    selectedPlayer,
                    isLinePlayer(selectedPlayer.label)
                      ? ((currentPlay?.anchorByPlayerId[selectedPlayer.id] ?? "center") as AnchorMode)
                      : "center",
                    currentPlay?.assignmentSide ?? "offense"
                  );
                  setDragLine({
                    playerId: selectedPlayer.id,
                    currentPoint: anchorPoint,
                    startPoint: anchorPoint,
                    handleType: "main",
                    lineType: selectedLineType,
                    stage: selectedLineType === "straight" ? "placingEnd" : "placingMid"
                  });
                }}
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{
                  left: `${getAnchorPoint(
                    selectedPlayer,
                    isLinePlayer(selectedPlayer.label)
                      ? ((currentPlay?.anchorByPlayerId[selectedPlayer.id] ?? "center") as AnchorMode)
                      : "center",
                    currentPlay?.assignmentSide ?? "offense"
                  ).x}%`,
                  top: `${getAnchorPoint(
                    selectedPlayer,
                    isLinePlayer(selectedPlayer.label)
                      ? ((currentPlay?.anchorByPlayerId[selectedPlayer.id] ?? "center") as AnchorMode)
                      : "center",
                    currentPlay?.assignmentSide ?? "offense"
                  ).y}%`
                }}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/5">
                  <span className="block h-[3px] w-[3px] rounded-full border border-black bg-white" />
                </span>
              </button>
            )}
            {selectedPlayer && selectedPathGeometry?.barStart && (
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragLine({
                    playerId: selectedPlayer.id,
                    currentPoint: selectedPathGeometry.barStart!,
                    startPoint: selectedPathGeometry.barStart!,
                    handleType: "leftBranch",
                    lineType: selectedPath?.lineType ?? selectedLineType,
                    stage: (selectedPath?.lineType ?? selectedLineType) === "straight" ? "placingEnd" : "placingMid"
                  });
                }}
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{ left: `${selectedPathGeometry.barStart.x}%`, top: `${selectedPathGeometry.barStart.y}%` }}
              >
                <span className="block h-[8px] w-[8px] rounded-full border border-black bg-white" />
              </button>
            )}
            {selectedPlayer && selectedPathGeometry?.barEnd && (
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragLine({
                    playerId: selectedPlayer.id,
                    currentPoint: selectedPathGeometry.barEnd!,
                    startPoint: selectedPathGeometry.barEnd!,
                    handleType: "rightBranch",
                    lineType: selectedPath?.lineType ?? selectedLineType,
                    stage: (selectedPath?.lineType ?? selectedLineType) === "straight" ? "placingEnd" : "placingMid"
                  });
                }}
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{ left: `${selectedPathGeometry.barEnd.x}%`, top: `${selectedPathGeometry.barEnd.y}%` }}
              >
                <span className="block h-[8px] w-[8px] rounded-full border border-black bg-white" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
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
