"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { requestActionPassword } from "@/lib/action-password";
import {
  getPlayDraftById,
  getPlayDrafts,
  savePlayDraft,
  type SavedLineType,
  type SavedPlayDraft,
  type SavedToleranceBoxes
} from "@/lib/play-storage";
import {
  getDefenseSystems,
  getOffensePackages,
  getPlayDraftSelection,
  type OffenseVariant,
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
type AssignmentSide = "offense" | "defense";
type RunDetailType = "inside" | "openSide";
type PassDetailType = "short" | "long";
type PlayDetailType = RunDetailType | PassDetailType;
type DragHandleType = "anchor" | "end" | "leftBranch" | "rightBranch";
type DragLine = {
  playerId: string;
  currentPoint: PathPoint;
  startPoint: PathPoint;
  handleType: DragHandleType;
  lineType: SavedLineType;
  stage: "placingMid" | "placingEnd";
  controlPoint?: PathPoint;
};
type ToleranceKey = keyof SavedToleranceBoxes;
type CornerDrag = { playerId: string; cornerIndex: number; toleranceKey: ToleranceKey };

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
const TOLERANCE_RADIUS_X = (1 / FIELD_WIDTH_YARDS) * 100;
const TOLERANCE_RADIUS_Y = (1 / FIELD_LENGTH_YARDS) * 100;
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

const isLinePlayer = (label: string) => ["C", "G", "T", "TE", "DE", "DT", "NT", "N"].includes(label);
const isOffenseBlockPlayer = (label: string) => ["C", "G", "T", "TE"].includes(label);
const isDefensiveLinePlayer = (label: string) => ["DE", "DT", "NT", "N"].includes(label);
const CONTACT_RADIUS = 1.3;
const CONTACT_BAR_HALF = 1.35;
const CONTACT_SNAP_DISTANCE = 3.2;

const clampPoint = (point: PathPoint): PathPoint => ({
  x: Math.max(0, Math.min(100, point.x)),
  y: Math.max(0, Math.min(100, point.y))
});

const getAnchorPoint = (player: SavedPlayer, anchorMode: AnchorMode, side: AssignmentSide) => {
  const frontOffsetY = side === "offense" ? -BODY_FRONT_OFFSET_Y : BODY_FRONT_OFFSET_Y;

  if (anchorMode === "leftFoot") {
    return { x: player.left - FOOT_OFFSET_X, y: player.top + frontOffsetY };
  }

  if (anchorMode === "rightFoot") {
    return { x: player.left + FOOT_OFFSET_X, y: player.top + frontOffsetY };
  }

  return { x: player.left, y: player.top + frontOffsetY };
};

const createDefaultToleranceBox = (endPoint: PathPoint, toleranceYards: number) => {
  const halfWidth = toleranceYards * TOLERANCE_RADIUS_X;
  const halfHeight = toleranceYards * TOLERANCE_RADIUS_Y;

  return [
    { x: endPoint.x - halfWidth, y: endPoint.y - halfHeight },
    { x: endPoint.x + halfWidth, y: endPoint.y - halfHeight },
    { x: endPoint.x + halfWidth, y: endPoint.y + halfHeight },
    { x: endPoint.x - halfWidth, y: endPoint.y + halfHeight }
  ];
};

const getDistance = (left: PathPoint, right: PathPoint) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const getBlockBarGeometry = (contactPoint: PathPoint, targetPoint: PathPoint) => {
  const dx = contactPoint.x - targetPoint.x;
  const dy = contactPoint.y - targetPoint.y;
  const length = Math.hypot(dx, dy) || 0.0001;
  const unitX = dx / length;
  const unitY = dy / length;
  const perpendicular = { x: -unitY, y: unitX };

  return {
    contactPoint,
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

    const defaultThroughPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: startPoint.y + (endPoint.y - startPoint.y) * 0.35
    };
    const bezierControlPoint = {
      x: 2 * defaultThroughPoint.x - (startPoint.x + endPoint.x) / 2,
      y: 2 * defaultThroughPoint.y - (startPoint.y + endPoint.y) / 2
    };
    return `M ${startPoint.x} ${startPoint.y} Q ${bezierControlPoint.x} ${bezierControlPoint.y} ${endPoint.x} ${endPoint.y}`;
  }

  return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
};

export default function EditorPlayPage() {
  const [offensePackages, setOffensePackages] = useState<SavedOffensePackage[]>([]);
  const [defenseSystems, setDefenseSystems] = useState<SavedDefenseSystem[]>([]);
  const [savedPlayDrafts, setSavedPlayDrafts] = useState<SavedPlayDraft[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [paths, setPaths] = useState<PlayerPath[]>([]);
  const [anchorByPlayerId, setAnchorByPlayerId] = useState<Record<string, AnchorMode>>({});
  const [toleranceByPlayerId, setToleranceByPlayerId] = useState<Record<string, SavedToleranceBoxes>>({});
  const [displayVariant, setDisplayVariant] = useState<OffenseVariant>("wide");
  const [studyDisplayVariant, setStudyDisplayVariant] = useState<OffenseVariant>("wide");
  const [selectedLineType, setSelectedLineType] = useState<SavedLineType>("straight");
  const [playType, setPlayType] = useState<"run" | "pass">("run");
  const [playDetailType, setPlayDetailType] = useState<PlayDetailType>("inside");
  const [assignmentSide, setAssignmentSide] = useState<AssignmentSide>("offense");
  const [toleranceYards, setToleranceYards] = useState(1.5);
  const [draftName, setDraftName] = useState("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [dragLine, setDragLine] = useState<DragLine | null>(null);
  const [cornerDrag, setCornerDrag] = useState<CornerDrag | null>(null);
  const [selectedOffensePackageId, setSelectedOffensePackageId] = useState<string>("");
  const [selectedDefenseSystemId, setSelectedDefenseSystemId] = useState<string>("");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingCreatedAt, setEditingCreatedAt] = useState<number | null>(null);
  const [quotePlayId, setQuotePlayId] = useState<string>("");
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const editingId = searchParams.get("id");
    const nextOffensePackages = getOffensePackages();
    const nextDefenseSystems = getDefenseSystems();
    const nextSavedPlayDrafts = getPlayDrafts();

    setOffensePackages(nextOffensePackages);
    setDefenseSystems(nextDefenseSystems);
    setSavedPlayDrafts(nextSavedPlayDrafts);

    if (editingId) {
      const allowed = requestActionPassword("プレーを編集するにはパスワードを入力してください");
      if (!allowed) {
        window.location.replace("/editor");
        return;
      }

      const target = getPlayDraftById(editingId);
      if (!target) {
        window.location.replace("/editor");
        return;
      }

      setEditingDraftId(target.id);
      setEditingCreatedAt(target.createdAt);
      setDraftName(target.name);
      setPaths(target.paths);
      setAnchorByPlayerId(target.anchorByPlayerId);
      setToleranceByPlayerId(target.toleranceByPlayerId);
      setDisplayVariant(target.displayVariant);
      setStudyDisplayVariant(target.studyDisplayVariant);
      setPlayType(target.playType);
      setPlayDetailType(target.playDetailType);
      setAssignmentSide(target.assignmentSide);
      setToleranceYards(target.toleranceYards);
      setSelectedOffensePackageId(target.offensePackageId ?? "");
      setSelectedDefenseSystemId(target.defenseSystemId ?? "");
      return;
    }

    const draftSelection = getPlayDraftSelection();
    setSelectedOffensePackageId(draftSelection.offensePackageId ?? "");
    setSelectedDefenseSystemId(draftSelection.defenseSystemId ?? "");
  }, []);

  const selectedOffense = useMemo(
    () => offensePackages.find((item) => item.id === selectedOffensePackageId) ?? null,
    [offensePackages, selectedOffensePackageId]
  );
  const compatibleDefenseSystems = useMemo(
    () => defenseSystems.filter((item) => !selectedOffense?.id || item.offensePackageId === selectedOffense.id),
    [defenseSystems, selectedOffense?.id]
  );
  const selectedDefense = useMemo(
    () => compatibleDefenseSystems.find((item) => item.id === selectedDefenseSystemId) ?? null,
    [compatibleDefenseSystems, selectedDefenseSystemId]
  );
  const quoteCandidates = useMemo(
    () =>
      savedPlayDrafts.filter((item) => {
        if (editingDraftId && item.id === editingDraftId) {
          return false;
        }

        const sameOffense = !selectedOffensePackageId || item.offensePackageId === selectedOffensePackageId;
        const sameDefense = !selectedDefenseSystemId || item.defenseSystemId === selectedDefenseSystemId;
        return sameOffense && sameDefense;
      }),
    [editingDraftId, savedPlayDrafts, selectedDefenseSystemId, selectedOffensePackageId]
  );

  const offensePlayers = selectedOffense?.variants.wide ?? [];
  const defensePlayers = selectedDefense?.players ?? [];
  const editablePlayers = assignmentSide === "offense" ? offensePlayers : defensePlayers;
  const selectedPlayer = editablePlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedAnchorMode = selectedPlayerId ? (anchorByPlayerId[selectedPlayerId] ?? "center") : "center";
  const selectedPlayerCanUseFeet = selectedPlayer ? isLinePlayer(selectedPlayer.label) : false;
  const selectedPath = selectedPlayerId
    ? paths.find((path) => path.playerId === selectedPlayerId) ?? null
    : null;
  const selectedPathEndPoint = selectedPath?.points[selectedPath.points.length - 1] ?? null;
  const selectedToleranceBoxes = selectedPlayerId ? toleranceByPlayerId[selectedPlayerId] ?? null : null;

  const getSnapBlockTarget = (player: SavedPlayer | null, point: PathPoint): SavedPlayer | null => {
    if (!player || assignmentSide !== "offense" || !isOffenseBlockPlayer(player.label)) {
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

  const getRenderedPathGeometry = (player: SavedPlayer, path: PlayerPath | undefined) => {
    const anchorMode = isLinePlayer(player.label) ? (anchorByPlayerId[player.id] ?? "center") : "center";
    const startPoint = getAnchorPoint(player, anchorMode, assignmentSide);

    if (!path || path.points.length === 0) {
      return {
        startPoint,
        endPoint: null as PathPoint | null,
        controlPoint: null as PathPoint | null,
        barStart: null as PathPoint | null,
        barEnd: null as PathPoint | null,
        leftBranchPoint: null as PathPoint | null,
        rightBranchPoint: null as PathPoint | null
      };
    }

    if (path.blockTargetId) {
      const target = defensePlayers.find((item) => item.id === path.blockTargetId);
      if (target) {
        const savedContactPoint = path.points[path.points.length - 1] ?? startPoint;
        const barGeometry = getBlockBarGeometry(savedContactPoint, { x: target.left, y: target.top });
        const geometry = {
          contactPoint: savedContactPoint,
          barStart: barGeometry.barStart,
          barEnd: barGeometry.barEnd
        };
        return {
          startPoint,
          endPoint: geometry.contactPoint,
          controlPoint: null as PathPoint | null,
          barStart: geometry.barStart,
          barEnd: geometry.barEnd,
          leftBranchPoint: path.leftBranchPoint ?? null,
          rightBranchPoint: path.rightBranchPoint ?? null
        };
      }
    }

    return {
      startPoint,
      endPoint: path.points[path.points.length - 1],
      controlPoint: path.controlPoint ?? null,
      barStart: null as PathPoint | null,
      barEnd: null as PathPoint | null,
      leftBranchPoint: null as PathPoint | null,
      rightBranchPoint: null as PathPoint | null
    };
  };

  useEffect(() => {
    setSelectedPlayerId(null);
    setDragLine(null);
    setCornerDrag(null);
  }, [assignmentSide]);

  useEffect(() => {
    if (!selectedPlayerId) {
      return;
    }

    setSelectedLineType(selectedPath?.lineType ?? "straight");
  }, [selectedPath?.lineType, selectedPlayerId]);

  useEffect(() => {
    setPlayDetailType(playType === "run" ? "inside" : "short");
  }, [playType]);

  useEffect(() => {
    if (!selectedPlayerId || !selectedPathEndPoint || toleranceByPlayerId[selectedPlayerId]?.main) {
      return;
    }

    setToleranceByPlayerId((current) => ({
      ...current,
      [selectedPlayerId]: {
        ...current[selectedPlayerId],
        main: createDefaultToleranceBox(selectedPathEndPoint, toleranceYards)
      }
    }));
  }, [selectedPathEndPoint, selectedPlayerId, toleranceByPlayerId, toleranceYards]);

  const convertDisplayPointToFieldPoint = (x: number, y: number) => {
    if (displayVariant !== "tight") {
      return { x, y };
    }

    const adjustedX = ZOOM_ORIGIN_X + (x - ZOOM_ORIGIN_X) / TIGHT_ZOOM_SCALE;
    const adjustedY =
      ZOOM_ORIGIN_Y + (y - TIGHT_ZOOM_TRANSLATE_Y - ZOOM_ORIGIN_Y) / TIGHT_ZOOM_SCALE;

    return clampPoint({ x: adjustedX, y: adjustedY });
  };

  const getFieldPointFromPointer = (clientX: number, clientY: number) => {
    const field = fieldRef.current;
    if (!field) {
      return null;
    }

    const rect = field.getBoundingClientRect();
    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 100;
    return convertDisplayPointToFieldPoint(rawX, rawY);
  };

  const clearSelectedPath = () => {
    if (!selectedPlayerId) {
      return;
    }

    setPaths((current) => current.filter((path) => path.playerId !== selectedPlayerId));
    setToleranceByPlayerId((current) => {
      const next = { ...current };
      delete next[selectedPlayerId];
      return next;
    });
    setDragLine(null);
    setCornerDrag(null);
    setSaveMessage("");
  };

  const clearAllPaths = () => {
    setPaths([]);
    setToleranceByPlayerId({});
    setDragLine(null);
    setCornerDrag(null);
    setSaveMessage("");
  };

  const clearBranchPath = (branch: "left" | "right") => {
    if (!selectedPlayerId) {
      return;
    }

    setPaths((current) =>
      current.map((path) =>
        path.playerId === selectedPlayerId
          ? {
              ...path,
              ...(branch === "left"
                ? { leftBranchPoint: undefined }
                : { rightBranchPoint: undefined })
            }
          : path
      )
    );
    setToleranceByPlayerId((current) => {
      const next = { ...current };
      if (!next[selectedPlayerId]) {
        return current;
      }

      next[selectedPlayerId] = {
        ...next[selectedPlayerId],
        ...(branch === "left" ? { leftBranch: undefined } : { rightBranch: undefined })
      };
      return next;
    });
    setSaveMessage("");
  };

  const handleQuotePlay = () => {
    const source = quoteCandidates.find((item) => item.id === quotePlayId) ?? null;
    if (!source) {
      return;
    }

    setPaths(source.paths.map((path) => ({ ...path })));
    setAnchorByPlayerId({ ...source.anchorByPlayerId });
    setToleranceByPlayerId({ ...source.toleranceByPlayerId });
    setAssignmentSide(source.assignmentSide);
    setPlayType(source.playType);
    setPlayDetailType(source.playDetailType);
    setDisplayVariant(source.displayVariant);
    setStudyDisplayVariant(source.studyDisplayVariant);
    setToleranceYards(source.toleranceYards);
    setSaveMessage(`「${source.name}」を参考として読み込みました。`);
  };

  const commitMainPath = (
    player: SavedPlayer,
    playerId: string,
    startPoint: PathPoint,
    point: PathPoint,
    lineType: SavedLineType,
    controlPoint?: PathPoint
  ) => {
    const snapTarget = getSnapBlockTarget(player, point);
    const endPoint = snapTarget
      ? getGuidedBlockGeometry(
          point,
          {
            x: snapTarget.left,
            y: snapTarget.top
          },
          startPoint
        ).contactPoint
      : point;

    setPaths((current) => {
      const currentPath = current.find((path) => path.playerId === playerId);
      const remaining = current.filter((path) => path.playerId !== playerId);

      const nextPath: PlayerPath = {
        playerId,
        points: [endPoint],
        lineType: currentPath?.lineType ?? lineType,
        controlPoint: snapTarget ? undefined : controlPoint,
        leftBranchPoint: currentPath?.leftBranchPoint,
        rightBranchPoint: currentPath?.rightBranchPoint,
        ...(snapTarget ? { blockTargetId: snapTarget.id } : {})
      };

      return [...remaining, nextPath];
    });

    setToleranceByPlayerId((current) => ({
      ...current,
      [playerId]: {
        ...current[playerId],
        main: createDefaultToleranceBox(endPoint, toleranceYards)
      }
    }));

    setSaveMessage("");
  };

  const beginHandleDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    player: SavedPlayer,
    handleType: DragHandleType,
    startPoint: PathPoint
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const playerId = player.id;
    setSelectedPlayerId(playerId);

    if (handleType === "anchor" || handleType === "end") {
      setDragLine({
        playerId,
        currentPoint: startPoint,
        startPoint,
        handleType,
        lineType: selectedLineType,
        stage: selectedLineType === "straight" ? "placingEnd" : "placingMid"
      });
      setSaveMessage("");
      return;
    }

    setDragLine({
      playerId,
      currentPoint: startPoint,
      startPoint,
      handleType,
      lineType: selectedLineType,
      stage: "placingMid"
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const point = getFieldPointFromPointer(moveEvent.clientX, moveEvent.clientY);
      if (!point) {
        return;
      }

      setDragLine((current) =>
        current
          ? {
              ...current,
              currentPoint: point
            }
          : current
      );
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const point = getFieldPointFromPointer(upEvent.clientX, upEvent.clientY);
      if (point) {
        if (handleType === "leftBranch" || handleType === "rightBranch") {
          setPaths((current) => {
            const currentPath = current.find((path) => path.playerId === playerId);
            const remaining = current.filter((path) => path.playerId !== playerId);

            if (!currentPath) {
              return current;
            }

            const nextPath: PlayerPath = {
              ...currentPath,
              [handleType === "leftBranch" ? "leftBranchPoint" : "rightBranchPoint"]: point
            };

            return [...remaining, nextPath];
          });

          setToleranceByPlayerId((current) => ({
            ...current,
            [playerId]: {
              ...current[playerId],
              [handleType]: createDefaultToleranceBox(point, toleranceYards)
            }
          }));
          setSaveMessage("");
        } else {
          const snapTarget = getSnapBlockTarget(player, point);
          const shouldContinueLine =
            !snapTarget && (selectedLineType === "curve" || selectedLineType === "bend");

          if (shouldContinueLine) {
            setDragLine({
              playerId,
              startPoint,
              currentPoint: point,
              handleType,
              lineType: selectedLineType,
              stage: "placingEnd",
              controlPoint: point
            });
          } else {
            commitMainPath(player, playerId, startPoint, point, selectedLineType);
            setDragLine(null);
          }
        }
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleOpenSaveDialog = () => {
    setIsSaveDialogOpen(true);
    setSaveMessage("");
  };

  const handleConfirmSave = () => {
    const name = draftName.trim();

    if (!name) {
      setSaveMessage("プレー名を入力してください。");
      return;
    }

    savePlayDraft({
      id: editingDraftId ?? `play-${Date.now()}`,
      name,
      playType,
      playDetailType,
      displayVariant,
      studyDisplayVariant,
      assignmentSide,
      toleranceYards,
      offensePackageId: selectedOffense?.id,
      defenseSystemId: selectedDefense?.id,
      anchorByPlayerId,
      toleranceByPlayerId,
      paths,
      createdAt: editingCreatedAt ?? Date.now()
    });

    setSaveMessage(editingDraftId ? `${name} を更新しました。` : `${name} を保存しました。`);
    setIsSaveDialogOpen(false);
  };

  const handleSave = () => {
    const inputName = window.prompt("プレー名を入力してください", "");
    const name = inputName?.trim();

    if (!name) {
      setSaveMessage("プレー名を入力してください。");
      return;
    }

    savePlayDraft({
      id: editingDraftId ?? `play-${Date.now()}`,
      name,
      playType,
      playDetailType,
      displayVariant,
      studyDisplayVariant,
      assignmentSide,
      toleranceYards,
      offensePackageId: selectedOffense?.id,
      defenseSystemId: selectedDefense?.id,
      anchorByPlayerId,
      toleranceByPlayerId,
      paths,
      createdAt: editingCreatedAt ?? Date.now()
    });

    setSaveMessage(editingDraftId ? `${name} を更新しました。` : `${name} を保存しました。`);
  };

  const selectedAnchorPoint = selectedPlayer
    ? getAnchorPoint(
        selectedPlayer,
        selectedPlayerCanUseFeet ? selectedAnchorMode : "center",
        assignmentSide
      )
    : null;
  const selectedPathGeometry =
    selectedPlayer && selectedPath ? getRenderedPathGeometry(selectedPlayer, selectedPath) : null;
  const dragSnapTarget: SavedPlayer | null =
    dragLine && selectedPlayer && (dragLine.handleType === "anchor" || dragLine.handleType === "end")
      ? getSnapBlockTarget(selectedPlayer, dragLine.currentPoint)
      : null;
  let dragGeometry:
    | {
        contactPoint: PathPoint;
        controlPoint?: PathPoint;
        barStart: PathPoint | null;
        barEnd: PathPoint | null;
      }
    | null = null;

  if (dragLine && selectedPlayer && selectedAnchorPoint) {
    if (dragLine.handleType === "anchor" || dragLine.handleType === "end") {
      dragGeometry = dragSnapTarget
        ? getGuidedBlockGeometry(
            dragLine.currentPoint,
            {
              x: dragSnapTarget.left,
              y: dragSnapTarget.top
            },
            selectedAnchorPoint
          )
        : {
            contactPoint: dragLine.currentPoint,
            controlPoint: dragLine.controlPoint,
            barStart: null,
            barEnd: null
          };
    } else {
      dragGeometry = {
        contactPoint: dragLine.currentPoint,
        barStart: null,
        barEnd: null
      };
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <section className="card-surface rounded-[2rem] px-6 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Play Editor</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900">プレーを作成する</h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">
          選手を選択して白い丸から線を引き、終端の四角を4角それぞれ調整します。
        </p>

        <div className="mt-6 space-y-3 text-sm text-stone-700">
          <p>使用する体系: {selectedOffense?.name ?? "未選択"}</p>
          <p>相手の体形: {selectedDefense?.name ?? "未選択"}</p>
          <p>選択中の選手: {selectedPlayer?.label ?? "なし"}</p>
        </div>

        {quoteCandidates.length > 0 && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-semibold text-stone-900">ほかのプレーを参考にする</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select
                value={quotePlayId}
                onChange={(event) => setQuotePlayId(event.target.value)}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900"
              >
                <option value="">参考にするプレーを選択</option>
                {quoteCandidates.map((play) => (
                  <option key={play.id} value={play.id}>
                    {play.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleQuotePlay}
                disabled={!quotePlayId}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  quotePlayId
                    ? "bg-amber-300 text-stone-950 hover:bg-amber-400"
                    : "border border-stone-300 bg-stone-100 text-stone-400"
                }`}
              >
                引用して読み込む
              </button>
            </div>
            <p className="mt-3 text-sm text-stone-600">
              線、許容誤差、表示設定をまとめて土台として読み込んでから調整できます。
            </p>
          </div>
        )}

        {selectedOffense && compatibleDefenseSystems.length === 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">オフェンスに対応したディフェンスの体形がありません。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/editor/opponent-system?packageId=${selectedOffense.id}`}
                className="rounded-full bg-amber-300 px-4 py-2 font-semibold text-stone-950 transition hover:bg-amber-400"
              >
                新しく作る
              </Link>
            </div>
            {defenseSystems.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {defenseSystems.map((system) => (
                  <Link
                    key={`quote-${system.id}`}
                    href={`/editor/opponent-system?packageId=${selectedOffense.id}&copyFrom=${system.id}`}
                    className="rounded-full border border-stone-300 bg-white px-4 py-2 font-semibold text-stone-900 transition hover:bg-stone-100"
                  >
                    {system.name} を引用
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-900">どちらのアサインメントを作るか</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAssignmentSide("offense")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                assignmentSide === "offense"
                  ? "bg-amber-300 text-stone-950"
                  : "border border-stone-300 bg-white text-stone-900"
              }`}
            >
              オフェンス
            </button>
            <button
              type="button"
              onClick={() => setAssignmentSide("defense")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                assignmentSide === "defense"
                  ? "bg-amber-300 text-stone-950"
                  : "border border-stone-300 bg-white text-stone-900"
              }`}
            >
              ディフェンス
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-900">表示</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDisplayVariant("tight")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                displayVariant === "tight"
                  ? "bg-amber-300 text-stone-950"
                  : "border border-stone-300 bg-white text-stone-900"
              }`}
            >
              タイト
            </button>
            <button
              type="button"
              onClick={() => setDisplayVariant("wide")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                displayVariant === "wide"
                  ? "bg-amber-300 text-stone-950"
                  : "border border-stone-300 bg-white text-stone-900"
              }`}
            >
              ワイド
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-900">線の形</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { key: "straight", label: "直線" },
              { key: "curve", label: "曲線" },
              { key: "bend", label: "一度曲がる" }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  const nextType = item.key as SavedLineType;
                  setSelectedLineType(nextType);
                  if (!selectedPlayerId) {
                    return;
                  }

                  setPaths((current) =>
                    current.map((path) =>
                      path.playerId === selectedPlayerId ? { ...path, lineType: nextType } : path
                    )
                  );
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selectedLineType === item.key
                    ? "bg-amber-300 text-stone-950"
                    : "border border-stone-300 bg-white text-stone-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-stone-600">
            選手を選んだ状態で切り替えると、その選手の線の形を変更できます。
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-stone-900">終端四角の初期サイズ</p>
            <p className="text-sm font-semibold text-stone-700">{toleranceYards.toFixed(1)} ヤード</p>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm font-medium text-stone-700" htmlFor="tolerance-input">
              手入力
            </label>
            <input
              id="tolerance-input"
              type="number"
              min="0"
              max="20"
              step="0.1"
              value={toleranceYards}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isNaN(nextValue)) {
                  return;
                }

                setToleranceYards(Math.max(0, Math.min(20, nextValue)));
              }}
              className="w-28 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-900"
            />
            <span className="text-sm text-stone-600">ヤード</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={toleranceYards}
            onChange={(event) => setToleranceYards(Number(event.target.value))}
            className="mt-4 w-full accent-black"
          />
          <p className="mt-3 text-sm text-stone-600">
            この値は線を作った直後の四角サイズです。作成後は終端の4角をそれぞれドラッグして自由に調整できます。
          </p>
        </div>

        {selectedPlayerCanUseFeet && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-semibold text-stone-900">線の始点</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  selectedPlayerId &&
                  setAnchorByPlayerId((current) => ({ ...current, [selectedPlayerId]: "leftFoot" }))
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selectedAnchorMode === "leftFoot"
                    ? "bg-amber-300 text-stone-950"
                    : "border border-stone-300 bg-white text-stone-900"
                }`}
              >
                左足
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedPlayerId &&
                  setAnchorByPlayerId((current) => ({ ...current, [selectedPlayerId]: "center" }))
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selectedAnchorMode === "center"
                    ? "bg-amber-300 text-stone-950"
                    : "border border-stone-300 bg-white text-stone-900"
                }`}
              >
                真ん中
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedPlayerId &&
                  setAnchorByPlayerId((current) => ({ ...current, [selectedPlayerId]: "rightFoot" }))
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selectedAnchorMode === "rightFoot"
                    ? "bg-amber-300 text-stone-950"
                    : "border border-stone-300 bg-white text-stone-900"
                }`}
              >
                右足
              </button>
            </div>
          </div>
        )}

        {!selectedPlayerCanUseFeet && selectedPlayer && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            この選手の線の始点は体の中央です。
          </div>
        )}
        {selectedPlayer && selectedPathGeometry?.endPoint && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-semibold text-stone-900">線の再設定</p>
            <p className="mt-2 text-sm text-stone-600">
              終点の白い点をドラッグすると主線を引き直せます。T が出ているときは横の白い点から枝線を追加できます。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearSelectedPath}
                className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
              >
                主線を引き直す
              </button>
              {selectedPathGeometry.barStart && (
                <button
                  type="button"
                  onClick={() => clearBranchPath("left")}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900"
                >
                  左枝を引き直す
                </button>
              )}
              {selectedPathGeometry.barEnd && (
                <button
                  type="button"
                  onClick={() => clearBranchPath("right")}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900"
                >
                  右枝を引き直す
                </button>
              )}
            </div>
            {(selectedPathGeometry.barStart || selectedPathGeometry.barEnd) && (
              <p className="mt-3 text-xs text-stone-500">
                T の左白点から左枝、右白点から右枝を出せます。
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={clearSelectedPath}
            className="rounded-full border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700"
          >
            選択中の線を消す
          </button>
          <button
            type="button"
            onClick={clearAllPaths}
            className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
          >
            線をすべて消す
          </button>
          <button
            type="button"
            onClick={handleOpenSaveDialog}
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            <span className="text-white">プレーを保存</span>
          </button>
        </div>

        {saveMessage && <p className="mt-4 text-sm text-stone-600">{saveMessage}</p>}

        <div className="mt-6">
          <Link
            href="/editor"
            className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
          >
            戻る
          </Link>
        </div>
      </section>

      <section className="card-surface rounded-[2rem] p-4 sm:p-6">
        <div
          ref={fieldRef}
          onPointerMove={(event) => {
            if (!dragLine) {
              return;
            }

            const point = getFieldPointFromPointer(event.clientX, event.clientY);
            if (!point) {
              return;
            }

            setDragLine((current) => (current ? { ...current, currentPoint: point } : current));
          }}
          onPointerDown={(event) => {
            if (!dragLine || !(dragLine.handleType === "anchor" || dragLine.handleType === "end")) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            const point = getFieldPointFromPointer(event.clientX, event.clientY);
            const player = editablePlayers.find((item) => item.id === dragLine.playerId);
            if (!point || !player) {
              return;
            }

            if (dragLine.stage === "placingMid") {
              setDragLine((current) =>
                current
                  ? {
                      ...current,
                      stage: "placingEnd",
                      controlPoint: point,
                      currentPoint: point
                    }
                  : current
              );
              return;
            }

            commitMainPath(player, dragLine.playerId, dragLine.startPoint, point, dragLine.lineType, dragLine.controlPoint);
            setDragLine(null);
          }}
          className="relative h-[640px] overflow-hidden rounded-[1.75rem] border border-white/20 bg-[linear-gradient(180deg,#2d6a3d_0%,#1f4f2e_100%)]"
        >
          <div
            className="absolute inset-0"
            style={{
              transform:
                displayVariant === "tight"
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
                className={`absolute left-0 w-full border-t ${
                  index % 2 === 1 ? "border-white/30" : "border-white/12"
                }`}
                style={{ top: `${top}%` }}
              />
            ))}
            <div className="absolute inset-x-0 border-t-4 border-white" style={{ top: `${LOS_TOP}%` }} />
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
            <div
              className="absolute right-4 -translate-y-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-900"
              style={{ top: `${LOS_TOP}%` }}
            >
              LOS
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

            <svg
              className="pointer-events-none absolute inset-0 z-30 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {editablePlayers.map((player) => {
                const path = paths.find((item) => item.playerId === player.id);
                const geometry = getRenderedPathGeometry(player, path);
                if (!geometry.endPoint) {
                  return null;
                }

                return (
                  <g key={`line-${player.id}`}>
                    <path
                      d={getLinePathD(geometry.startPoint, geometry.endPoint, path?.lineType, geometry.controlPoint ?? undefined)}
                      stroke="#ffffff"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                    />
                    {geometry.barStart && geometry.barEnd && (
                      <>
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
                        {geometry.leftBranchPoint && (
                          <path
                            d={getLinePathD(geometry.barStart, geometry.leftBranchPoint, path?.lineType)}
                            stroke="#ffffff"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {geometry.rightBranchPoint && (
                          <path
                            d={getLinePathD(geometry.barEnd, geometry.rightBranchPoint, path?.lineType)}
                            stroke="#ffffff"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                      </>
                    )}
                  </g>
                );
              })}
              {dragGeometry && selectedAnchorPoint && (
                <g>
                  <path
                    d={getLinePathD(
                      dragLine?.startPoint ?? selectedAnchorPoint,
                      dragGeometry.contactPoint,
                      dragLine?.lineType ?? selectedLineType,
                      dragGeometry.controlPoint
                    )}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                  {dragLine?.controlPoint && (
                    <circle
                      cx={dragLine.controlPoint.x}
                      cy={dragLine.controlPoint.y}
                      r="0.55"
                      fill="#fde68a"
                      stroke="#111827"
                      strokeWidth="0.2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {dragGeometry.barStart && dragGeometry.barEnd && (
                    <line
                      x1={dragGeometry.barStart.x}
                      y1={dragGeometry.barStart.y}
                      x2={dragGeometry.barEnd.x}
                      y2={dragGeometry.barEnd.y}
                      stroke="#ffffff"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              )}
              {Object.entries(toleranceByPlayerId).flatMap(([playerId, boxes]) =>
                (Object.entries(boxes) as [ToleranceKey, PathPoint[] | undefined][]).map(([boxKey, corners]) => {
                  if (!corners || corners.length !== 4) {
                    return null;
                  }

                  return (
                    <polygon
                      key={`tolerance-${playerId}-${boxKey}`}
                      points={corners.map((point) => `${point.x},${point.y}`).join(" ")}
                      fill={playerId === selectedPlayerId ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)"}
                      stroke="#ffffff"
                      strokeWidth={playerId === selectedPlayerId ? "0.55" : "0.35"}
                      strokeDasharray="1.2 1"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })
              )}
            </svg>

            {defensePlayers.map((player) => (
              <button
                key={`defense-${player.id}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (assignmentSide !== "defense") {
                    return;
                  }
                  setSelectedPlayerId(player.id);
                  setSaveMessage("");
                }}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${player.left}%`, top: `${player.top}%` }}
              >
                <div
                  className={`flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                    selectedPlayerId === player.id
                      ? "border-2 border-orange-600 bg-orange-100 text-stone-900"
                      : assignmentSide === "defense"
                        ? "border border-orange-200 bg-orange-50 text-stone-900"
                        : "border border-orange-100 bg-orange-50/50 text-stone-500"
                  }`}
                >
                  {player.label}
                </div>
              </button>
            ))}
            {offensePlayers.map((player) => (
              <button
                key={`offense-${player.id}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (assignmentSide !== "offense") {
                    return;
                  }
                  setSelectedPlayerId(player.id);
                  setSaveMessage("");
                }}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${player.left}%`, top: `${player.top}%` }}
              >
                <div
                  className={`flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                    selectedPlayerId === player.id
                      ? "border-2 border-rose-600 bg-rose-100 text-stone-900"
                      : assignmentSide === "offense"
                        ? "border border-white/50 bg-amber-100 text-stone-900"
                        : "border border-white/30 bg-amber-50/70 text-stone-500"
                  }`}
                >
                  {player.label}
                </div>
              </button>
            ))}
            {selectedPlayer && selectedAnchorPoint && (
              <button
                type="button"
                onPointerDown={(event) => beginHandleDrag(event, selectedPlayer, "anchor", selectedAnchorPoint)}
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{ left: `${selectedAnchorPoint.x}%`, top: `${selectedAnchorPoint.y}%` }}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/5">
                  <span className="block h-[3px] w-[3px] rounded-full border border-black bg-white" />
                </span>
              </button>
            )}
            {selectedPlayer && selectedPathGeometry?.endPoint && (
              <button
                type="button"
                onPointerDown={(event) =>
                  beginHandleDrag(event, selectedPlayer, "end", selectedPathGeometry.endPoint!)
                }
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{
                  left: `${selectedPathGeometry.endPoint.x}%`,
                  top: `${selectedPathGeometry.endPoint.y}%`
                }}
              >
                <span className="block h-[8px] w-[8px] rounded-full border border-black bg-white" />
              </button>
            )}
            {selectedPlayer && selectedPathGeometry?.barStart && (
              <button
                type="button"
                onPointerDown={(event) =>
                  beginHandleDrag(event, selectedPlayer, "leftBranch", selectedPathGeometry.barStart!)
                }
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{
                  left: `${selectedPathGeometry.barStart.x}%`,
                  top: `${selectedPathGeometry.barStart.y}%`
                }}
              >
                <span className="block h-[8px] w-[8px] rounded-full border border-black bg-white" />
              </button>
            )}
            {selectedPlayer && selectedPathGeometry?.barEnd && (
              <button
                type="button"
                onPointerDown={(event) =>
                  beginHandleDrag(event, selectedPlayer, "rightBranch", selectedPathGeometry.barEnd!)
                }
                className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{
                  left: `${selectedPathGeometry.barEnd.x}%`,
                  top: `${selectedPathGeometry.barEnd.y}%`
                }}
              >
                <span className="block h-[8px] w-[8px] rounded-full border border-black bg-white" />
              </button>
            )}
            {selectedPlayerId &&
              selectedToleranceBoxes &&
              (Object.entries(selectedToleranceBoxes) as [ToleranceKey, PathPoint[] | undefined][])
                .flatMap(([toleranceKey, corners]) =>
                  (corners ?? []).map((corner, cornerIndex) => ({ toleranceKey, corner, cornerIndex }))
                )
                .map(({ toleranceKey, corner, cornerIndex }) => (
                <button
                  key={`corner-${selectedPlayerId}-${toleranceKey}-${cornerIndex}`}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setCornerDrag({ playerId: selectedPlayerId, cornerIndex, toleranceKey });

                    const handlePointerMove = (moveEvent: PointerEvent) => {
                      const point = getFieldPointFromPointer(moveEvent.clientX, moveEvent.clientY);
                      if (!point) {
                        return;
                      }

                      setToleranceByPlayerId((current) => {
                        const playerBoxes = current[selectedPlayerId];
                        const currentCorners = playerBoxes?.[toleranceKey];
                        if (!currentCorners) {
                          return current;
                        }

                        return {
                          ...current,
                          [selectedPlayerId]: {
                            ...playerBoxes,
                            [toleranceKey]: currentCorners.map((item, index) =>
                              index === cornerIndex ? clampPoint(point) : item
                            )
                          }
                        };
                      });
                    };

                    const handlePointerUp = () => {
                      setCornerDrag(null);
                      window.removeEventListener("pointermove", handlePointerMove);
                      window.removeEventListener("pointerup", handlePointerUp);
                    };

                    window.addEventListener("pointermove", handlePointerMove);
                    window.addEventListener("pointerup", handlePointerUp);
                  }}
                  className="absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none"
                  style={{ left: `${corner.x}%`, top: `${corner.y}%` }}
                >
                  <span
                    className={`block h-3 w-3 rounded-sm border ${
                      cornerDrag?.playerId === selectedPlayerId &&
                      cornerDrag.cornerIndex === cornerIndex &&
                      cornerDrag.toleranceKey === toleranceKey
                        ? "border-black bg-amber-200"
                        : "border-black bg-white"
                    }`}
                  />
                </button>
              ))}
          </div>
        </div>
      </section>

      {isSaveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-800">Save Play</p>
            <h2 className="mt-3 text-2xl font-bold text-stone-900">保存内容を選択する</h2>

            <div className="mt-6">
              <label className="text-sm font-semibold text-stone-900" htmlFor="draft-name">
                プレー名
              </label>
              <input
                id="draft-name"
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-700"
                placeholder="プレー名を入力"
              />
            </div>

            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-900">プレーの種類</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPlayType("run")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    playType === "run"
                      ? "bg-amber-300 text-stone-950"
                      : "border border-stone-300 bg-white text-stone-900"
                  }`}
                >
                  ラン
                </button>
                <button
                  type="button"
                  onClick={() => setPlayType("pass")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    playType === "pass"
                      ? "bg-amber-300 text-stone-950"
                      : "border border-stone-300 bg-white text-stone-900"
                  }`}
                >
                  パス
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-900">
                {playType === "run" ? "ランの分類" : "パスの分類"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {playType === "run" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPlayDetailType("inside")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        playDetailType === "inside"
                          ? "bg-amber-300 text-stone-950"
                          : "border border-stone-300 bg-white text-stone-900"
                      }`}
                    >
                      インサイド
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayDetailType("openSide")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        playDetailType === "openSide"
                          ? "bg-amber-300 text-stone-950"
                          : "border border-stone-300 bg-white text-stone-900"
                      }`}
                    >
                      オープンサイド
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setPlayDetailType("short")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        playDetailType === "short"
                          ? "bg-amber-300 text-stone-950"
                          : "border border-stone-300 bg-white text-stone-900"
                      }`}
                    >
                      ショート
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayDetailType("long")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        playDetailType === "long"
                          ? "bg-amber-300 text-stone-950"
                          : "border border-stone-300 bg-white text-stone-900"
                      }`}
                    >
                      ロング
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-900">学習時の表示</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStudyDisplayVariant("tight")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    studyDisplayVariant === "tight"
                      ? "bg-amber-300 text-stone-950"
                      : "border border-stone-300 bg-white text-stone-900"
                  }`}
                >
                  タイト
                </button>
                <button
                  type="button"
                  onClick={() => setStudyDisplayVariant("wide")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    studyDisplayVariant === "wide"
                      ? "bg-amber-300 text-stone-950"
                      : "border border-stone-300 bg-white text-stone-900"
                  }`}
                >
                  ワイド
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSaveDialogOpen(false)}
                className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950"
              >
                この内容で保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
