import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import * as Y from "yjs";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  MousePointer2,
  Hand,
  StickyNote,
  Type,
  Pencil,
  Highlighter,
  Eraser,
  Square,
  Circle,
  Diamond,
  Triangle,
  ArrowUpRight,
  Frame,
  Table2,
  ImagePlus,
  GitBranch,
  MessageCircle,
  Share2,
  ChevronDown,
  Plus,
  Minus,
  Maximize,
  Undo2,
  Redo2,
  Search,
  PanelLeft,
  X,
  MoreHorizontal,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Group,
  Download,
  Layers,
  Timer,
  History,
  Smile,
  Keyboard,
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  MoveUpRight,
  Columns3,
  Rows3,
  Link as LinkIcon,
  Radio,
  SquareRoundCorner,
} from "lucide-react";
import { useBoard } from "../lib/useBoard";
import { api } from "../lib/api";
import type { SceneObject } from "../lib/model";
import Modal from "../components/Modal";
import BoardPanels from "../components/BoardPanels";
import { SceneView, assetURL, defaultRadius } from "./SceneView";
import {
  bounds,
  box,
  clamp,
  connectorPoints,
  contains,
  download,
  encodeCSV,
  intersects,
  parseCSV,
  rotate,
  uid,
} from "./geometry";
import type { Point, Camera } from "./geometry";
import { exportScene } from "./export";
import { resizeObject } from "./transforms";
import { useCanvasCamera, CANVAS_MIN, CANVAS_MAX } from "./useCanvasCamera";
import { DragToolButton } from "./DragToolButton";
import {
  shapeAnchorPoint,
  routedConnectorPath,
  connectorRoutePoints,
  curveBendPoint,
  curveOffsetFromPoint,
} from "./geometry";
import type { ConnectorAnchor } from "./geometry";
import "./editor.css";

type User = { id: string; name: string; email: string; color: string };
type Tool =
  | "select"
  | "hand"
  | "sticky"
  | "text"
  | "rectangle"
  | "rounded"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "connector"
  | "section"
  | "pen"
  | "highlighter"
  | "eraser"
  | "table"
  | "mindmap"
  | "stamp"
  | "comment";
type Panel = "share" | "comments" | "workshop" | "versions" | null;
type Interaction =
  | { kind: "idle" }
  | { kind: "pan"; start: Point; camera: Camera }
  | {
      kind: "marquee";
      start: Point;
      current: Point;
      additive: boolean;
      base: string[];
    }
  | { kind: "drag"; start: Point; items: SceneObject[] }
  | { kind: "resize"; start: Point; item: SceneObject; handle: string }
  | { kind: "rotate"; start: Point; item: SceneObject; angle: number }
  | { kind: "draw"; points: Point[]; highlighter: boolean }
  | { kind: "create"; type: Tool; start: Point; current: Point }
  | {
      kind: "connect";
      start: Point;
      fromId?: string;
      fromAnchor?: ConnectorAnchor;
      current: Point;
    }
  | { kind: "endpoint"; id: string; end: "from" | "to"; current: Point }
  | { kind: "bend"; id: string; index: number; current: Point }
  | { kind: "radius"; item: SceneObject; corner: "nw" | "ne" | "sw" | "se" };
const GRID_SIZE = 20;
const COLORS = [
  "#ffe48b",
  "#ffc99e",
  "#ffb8cb",
  "#d8c4ff",
  "#bcdcff",
  "#b5e5cf",
  "#ffffff",
  "#e4e7ee",
];
/** Figma's own default swatch grid: a vivid row, then its pastel tints. */
const FIGMA_PALETTE = [
  "#000000",
  "#808080",
  "#eb5757",
  "#f2994a",
  "#f2c94c",
  "#6fcf67",
  "#3fd1c4",
  "#4a90e2",
  "#9b51e0",
  "#eb5da0",
  "#ffffff",
  "#b3b3b3",
  "#e0e0e0",
  "#fadbd8",
  "#fce4d6",
  "#fdf3cd",
  "#d7f5e0",
  "#d2f4f0",
  "#d6e8fb",
  "#e6d6f7",
];
const SHAPES: [Tool, string, typeof Square][] = [
  ["rectangle", "Rectangle", Square],
  ["rounded", "Rounded rectangle", Square],
  ["ellipse", "Ellipse", Circle],
  ["diamond", "Decision", Diamond],
  ["triangle", "Triangle", Triangle],
];
const textTypes = [
  "sticky",
  "text",
  "rectangle",
  "rounded",
  "ellipse",
  "diamond",
  "triangle",
  "section",
  "connector",
  "stamp",
];
/** Shapes rendered as a plain rounded rect - the only ones a corner radius
 * actually applies to. */
const RADIUS_TYPES = ["rectangle", "rounded", "section"];
const emptyInteraction: Interaction = { kind: "idle" };
const NO_OBJECTS: SceneObject[] = [];
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,textarea,[contenteditable="true"]');
let measureCanvas: HTMLCanvasElement | null = null;
/** Hug a free-standing text box tightly to its own content, like Figma's
 * auto-width text - rather than the padded container every other shape has. */
function measureFreeText(
  text: string,
  fontSize: number,
  bold?: boolean,
  italic?: boolean,
) {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  const lines = (text || " ").split("\n");
  if (!ctx)
    return {
      width: Math.max(20, ...lines.map((l) => l.length * fontSize * 0.55)),
      height: lines.length * fontSize * 1.38,
    };
  ctx.font = `${italic ? "italic " : ""}${bold ? 700 : 400} ${fontSize}px DM Sans, Inter, sans-serif`;
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  return { width, height: lines.length * fontSize * 1.38 };
}
const defaultCells = [
  ["Stage", "Owner", "Status"],
  ["Discover", "", "Not started"],
  ["Design", "", "Not started"],
  ["Deliver", "", "Not started"],
];
function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`editor-icon ${active ? "is-active" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
function EditableText({
  o,
  onChange,
  onClose,
}: {
  o: SceneObject;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false),
    [value, setValue] = useState(o.text || "");
  useEffect(() => {
    if (!composing.current) setValue(o.text || "");
  }, [o.text]);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(
      (o.text || "").length,
      (o.text || "").length,
    );
  }, [o.id]);
  return (
    <textarea
      ref={ref}
      aria-label="Edit object text"
      className="canvas-text-editor"
      value={value}
      style={{
        width: o.width,
        height: o.height,
        fontSize: o.fontSize || 20,
        fontWeight: o.bold ? 700 : 400,
        fontStyle: o.italic ? "italic" : "normal",
        textAlign: o.align || "center",
        padding: o.type === "text" ? 0 : 18,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        setValue(e.target.value);
        if (!composing.current) onChange(e.target.value);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        onChange(e.currentTarget.value);
      }}
      onBlur={onClose}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          e.key === "Escape" ||
          ((e.metaKey || e.ctrlKey) && e.key === "Enter")
        ) {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}

export default function BoardEditor({
  boardId,
  user,
  onBack,
  onMetadataChange,
}: {
  boardId: string;
  user: User;
  onBack: () => void;
  onMetadataChange?: () => void;
}) {
  const live = useBoard(boardId, user);
  const {
    doc,
    objects,
    pages,
    board,
    status,
    role,
    presence,
    mutate,
    addObject,
    updateObject,
    deleteObjects,
    setText,
    undo,
    redo,
    sendPresence,
    refreshMetadata,
  } = live;
  const [pageId, setPageId] = useState(""),
    [tool, setTool] = useState<Tool>("select"),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null);
  const viewportSizeRef = useRef({ width: 1440, height: 900 });
  const { camera, setCamera, smoothCamera, cameraRef, cameraTarget } =
    useCanvasCamera({ x: 260, y: 180, zoom: 1 }, viewportSizeRef);
  const [toolbarDrag, setToolbarDrag] = useState<{
    type: Tool;
    point: Point;
  } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [pageMenu, setPageMenu] = useState(false);
  const pageCameras = useRef(new Map<string, Camera>());
  const [interaction, setInteraction] = useState<Interaction>(emptyInteraction),
    [preview, setPreview] = useState<Record<string, Partial<SceneObject>>>({}),
    [outline, setOutline] = useState(false),
    [search, setSearch] = useState(""),
    [panel, setPanel] = useState<Panel>(null),
    [menu, setMenu] = useState<
      "shapes" | "more" | "board" | "help" | "emoji" | "palette" | null
    >(null),
    [fill, setFill] = useState(COLORS[0]),
    [stroke, setStroke] = useState("#b3b3b3"),
    [strokeWidth, setStrokeWidth] = useState(3),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [context, setContext] = useState<Point | null>(null),
    [moreMenuPos, setMoreMenuPos] = useState<Point | null>(null),
    [renamingBoard, setRenamingBoard] = useState(false),
    [boardNameDraft, setBoardNameDraft] = useState(""),
    [follow, setFollow] = useState<string | null>(null),
    [spotlighting, setSpotlighting] = useState(false),
    [spotlightMenu, setSpotlightMenu] = useState(false),
    [dismissedSpotlight, setDismissedSpotlight] = useState<string | null>(
      null,
    ),
    [space, setSpace] = useState(false),
    [pendingConnector, setPendingConnector] = useState<{
      point: Point;
      id?: string;
    } | null>(null),
    [assets, setAssets] = useState<Record<string, string>>({}),
    [snap, setSnap] = useState(true),
    [stamp, setStamp] = useState("👍");
  const rootRef = useRef<HTMLDivElement>(null),
    svgRef = useRef<SVGSVGElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    csvInput = useRef<HTMLInputElement>(null),
    clipboard = useRef<SceneObject[]>([]),
    touches = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; zoom: number; world: Point } | null>(
      null,
    ),
    lastCursor = useRef<Point>({ x: 0, y: 0 }),
    initialized = useRef(false),
    followTarget = useRef<Camera | null>(null),
    assetLoading = useRef(new Set<string>());
  const [commentAnchor, setCommentAnchor] = useState<{
      x: number;
      y: number;
      pageId: string;
    }>(),
    [threads, setThreads] = useState<any[]>([]);
  useEffect(() => {
    let disposed = false;
    const get = () =>
      api("comment.list", { board_id: boardId })
        .then((v) => {
          if (!disposed) setThreads(v.comments || []);
        })
        .catch(() => {});
    void get();
    const t = setInterval(() => void get(), 5000);
    return () => {
      disposed = true;
      clearInterval(t);
    };
  }, [boardId]);
  const [size, setSize] = useState({ width: 1440, height: 900 });
  viewportSizeRef.current = size;
  const canEdit = role === "owner" || role === "editor";
  const allObjects = useMemo(
    () => objects.map((o) => (preview[o.id] ? { ...o, ...preview[o.id] } : o)),
    [objects, preview],
  );
  const pageObjects = useMemo(
    () =>
      allObjects
        .filter((o) => o.pageId === pageId)
        .sort(
          (a, b) =>
            (a.type === "section" ? -1 : 0) - (b.type === "section" ? -1 : 0) ||
            (a.order || 0) - (b.order || 0),
        ),
    [allObjects, pageId],
  );
  const selectedObjects = useMemo(
    () => pageObjects.filter((o) => selected.includes(o.id)),
    [pageObjects, selected],
  );
  const editableSelected = selectedObjects.filter((o) => !o.locked),
    selectionBox = selectedObjects.length ? bounds(selectedObjects) : null,
    one = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const editingObject = editing
    ? allObjects.find((o) => o.id === editing)
    : null;
  const page = pages.find((p) => p.id === pageId);
  const peerList = Array.isArray(presence)
    ? presence
    : Object.values(presence || {});
  const panelCamera = { ...camera };
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (pages.length && !pages.some((p) => p.id === pageId)) {
      setPageId(pages[0].id);
      setSelected([]);
      setEditing(null);
    }
  }, [pages, pageId]);
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => objects.some((o) => o.id === id)));
  }, [objects]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!error) return;
    const timeout = setTimeout(() => setError(""), 7000);
    return () => clearTimeout(timeout);
  }, [error]);
  useEffect(() => {
    sendPresence({
      pageId,
      selected,
      camera: undefined,
      viewport: camera,
      spotlight: spotlighting,
    } as any);
  }, [pageId, selected, camera, spotlighting, sendPresence]);
  useEffect(() => {
    // Figma-style spotlight: whoever turns it on drags every other viewer's
    // camera along, until that viewer explicitly stops following.
    const spotlighter = peerList.find(
      (p: any) => p.spotlight && p.user?.id !== user.id,
    ) as any;
    if (spotlighter) {
      if (dismissedSpotlight === spotlighter.user.id) return;
      setFollow(spotlighter.user.id);
    } else if (dismissedSpotlight) {
      setDismissedSpotlight(null);
    }
  }, [presence, user.id, dismissedSpotlight]);
  useEffect(() => {
    if (!follow) {
      followTarget.current = null;
      return;
    }
    const peer = peerList.find((p: any) => p.user?.id === follow) as any;
    if (peer?.viewport) {
      // Presence lands in discrete ticks (a few times a second), so jumping
      // the camera straight to each one reads as choppy. Keep only the
      // latest target here; a continuous animation loop below eases toward
      // it every frame, the same "smooth follow" trick Figma's own
      // multiplayer viewport-following uses.
      followTarget.current = peer.viewport;
      if (peer.pageId) setPageId(peer.pageId);
    } else if (!peer) setFollow(null);
  }, [presence, follow]);
  useEffect(() => {
    if (!follow) return;
    let raf = 0;
    const step = () => {
      const target = followTarget.current;
      if (target) {
        setCamera((c) => {
          const dx = target.x - c.x,
            dy = target.y - c.y,
            dz = target.zoom - c.zoom;
          // Snap the last small remainder instead of easing forever.
          if (Math.hypot(dx, dy) < 0.5 && Math.abs(dz) < 0.001) return target;
          return { x: c.x + dx * 0.22, y: c.y + dy * 0.22, zoom: c.zoom + dz * 0.22 };
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [follow]);
  useEffect(() => {
    for (const o of objects) {
      if (
        !o.assetId ||
        assets[o.assetId] ||
        assetLoading.current.has(o.assetId)
      )
        continue;
      const id = o.assetId;
      assetLoading.current.add(id);
      api<any>("asset.get", { board_id: boardId, asset_id: id })
        .then((v) => {
          const a = v.asset || v;
          setAssets((old) => ({ ...old, [id]: assetURL(a) }));
        })
        .catch(() =>
          setError(
            "An image could not be loaded. Check your connection and access.",
          ),
        )
        .finally(() => assetLoading.current.delete(id));
    }
  }, [objects, assets, boardId]);
  const world = useCallback(
    (client: Point): Point => {
      const r = rootRef.current?.getBoundingClientRect(),
        c = cameraRef.current;
      return {
        x: (client.x - (r?.left || 0) - c.x) / c.zoom,
        y: (client.y - (r?.top || 0) - c.y) / c.zoom,
      };
    },
    [cameraRef],
  );
  const snapPoint = useCallback(
    (point: Point) =>
      snap
        ? {
            x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
          }
        : point,
    [snap],
  );
  const center = () => ({
    x: (size.width / 2 - camera.x) / camera.zoom,
    y: (size.height / 2 - camera.y) / camera.zoom,
  });
  const fit = useCallback(
    (items: SceneObject[] = pageObjects) => {
      const b = bounds(items),
        z = clamp(
          Math.min(
            (size.width - (outline ? 300 : 140)) / (b.width + 100),
            (size.height - 230) / (b.height + 100),
          ),
          0.08,
          2,
        );
      setFollow(null);
      smoothCamera({
        x: size.width / 2 - (b.x + b.width / 2) * z + (outline ? 90 : 0),
        y: size.height / 2 - (b.y + b.height / 2) * z,
        zoom: z,
      });
    },
    [pageObjects, size, outline],
  );
  useEffect(() => {
    if (!initialized.current && pageId && pages.length && size.width) {
      initialized.current = true;
      if (pageObjects.length) fit(pageObjects);
    }
  }, [pageObjects, pageId, pages.length, size.width, fit]);
  const zoomTo = useCallback(
    (newZoom: number, p?: Point) => {
      const pos = p || { x: size.width / 2, y: size.height / 2 },
        z = clamp(newZoom, 0.08, 5);
      setFollow(null);
      smoothCamera((c) => ({
        x: pos.x - ((pos.x - c.x) / c.zoom) * z,
        y: pos.y - ((pos.y - c.y) / c.zoom) * z,
        zoom: z,
      }));
    },
    [size],
  );
  const navigate = useCallback(
    (id?: string, x?: number, y?: number, targetPage?: string) => {
      const o = objects.find((v) => v.id === id);
      if (o) {
        setPageId(o.pageId);
        setSelected([o.id]);
        fit([o]);
      } else if (x !== undefined && y !== undefined) {
        if (targetPage) setPageId(targetPage);
        setCamera((c) => ({
          ...c,
          x: size.width / 2 - x * c.zoom,
          y: size.height / 2 - y * c.zoom,
        }));
      }
    },
    [objects, fit, size],
  );
  const tryAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    }
  };
  const patchSelected = (patch: Partial<SceneObject>) => {
    if (!canEdit) return;
    mutate(() => editableSelected.forEach((o) => updateObject(o.id, patch)));
  };
  const expanded = (ids: string[]) => {
    const gs = new Set(
      objects
        .filter((o) => ids.includes(o.id) && o.groupId)
        .map((o) => o.groupId),
    );
    const sections = new Set(
      objects
        .filter((o) => ids.includes(o.id) && o.type === "section")
        .map((o) => o.id),
    );
    return objects.filter(
      (o) =>
        o.pageId === pageId &&
        (ids.includes(o.id) ||
          (o.groupId && gs.has(o.groupId)) ||
          (o.sectionId && sections.has(o.sectionId))),
    );
  };
  const draftObject = (
    type: Tool,
    p: Point,
    extra: Partial<SceneObject> = {},
  ): SceneObject => {
    const kind =
      type === "mindmap"
        ? "rounded"
        : type === "highlighter"
          ? "pen"
          : type === "comment"
            ? "sticky"
            : (type as SceneObject["type"]);
    const dims =
      kind === "sticky"
        ? { width: 210, height: 210 }
        : kind === "section"
          ? { width: 600, height: 440 }
          : kind === "table"
            ? { width: 540, height: 220 }
            : kind === "stamp"
              ? { width: 64, height: 64 }
              : kind === "text"
                ? // A free click starts a tight, near-empty caret like
                  // Figma's auto-width text - it grows as soon as you type.
                  { width: 24, height: 32 }
                : kind === "ellipse"
                  ? // Figma has no separate "circle" tool - Ellipse itself
                    // defaults to a perfect circle on a plain click, and
                    // only turns into an oval once you drag it out.
                    { width: 140, height: 140 }
                  : { width: 180, height: 110 };
    return {
      id: "__draft",
      type: kind,
      pageId,
      x: p.x,
      y: p.y,
      ...dims,
      fill:
        kind === "text"
          ? "transparent"
          : kind === "sticky"
            ? fill
            : "#ffffff",
      stroke:
        kind === "sticky" || kind === "text" || kind === "stamp"
          ? "transparent"
          : stroke,
      strokeWidth:
        kind === "sticky" || kind === "text" || kind === "stamp" ? 0 : 3,
      rotation: 0,
      fontSize: kind === "stamp" ? 48 : 20,
      align: "center",
      opacity: 1,
      bold: false,
      italic: false,
      locked: false,
      text:
        kind === "stamp"
          ? stamp
          : kind === "section"
            ? "Section"
            : type === "mindmap"
              ? "Central idea"
              : "",
      author: user.name,
      showAuthor: kind === "sticky",
      order: Date.now(),
      cells: kind === "table" ? defaultCells : undefined,
      // A click starts an auto-width text node (hugs content on both axes,
      // like Figma); dragging out an explicit box opts into fixed-width
      // wrapping instead - `extra` below overrides this when it's dragged.
      autoWidth: kind === "text" ? true : undefined,
      ...extra,
    };
  };
  const create = (type: Tool, p: Point, extra: Partial<SceneObject> = {}) => {
    if (!canEdit || !pageId) return "";
    const draft = draftObject(type, p, extra);
    const id = addObject({ ...draft, id: uid() });
    if (draft.type === "section")
      mutate(() =>
        pageObjects
          .filter(
            (o) =>
              o.type !== "section" &&
              !o.locked &&
              contains(draft, { x: o.x + o.width / 2, y: o.y + o.height / 2 }),
          )
          .forEach((o) => updateObject(o.id, { sectionId: id })),
      );
    else {
      const section = [...pageObjects].reverse().find(
        (o) =>
          o.type === "section" &&
          contains(o, {
            x: draft.x + draft.width / 2,
            y: draft.y + draft.height / 2,
          }),
      );
      if (section) updateObject(id, { sectionId: section.id });
    }
    setSelected([id]);
    setTool("select");
    if (["sticky", "text"].includes(draft.type)) setEditing(id);
    return id;
  };
  const duplicate = (
    items = expanded(selected),
    offset: Point = { x: 32, y: 32 },
  ) => {
    if (!canEdit || !items.length) return;
    const idMap = new Map(items.map((o) => [o.id, uid()])),
      groupMap = new Map(
        items.filter((o) => o.groupId).map((o) => [o.groupId!, uid()]),
      );
    const ids: string[] = [];
    mutate(() => {
      items.forEach((o) => {
        const copy = {
          ...o,
          id: idMap.get(o.id),
          pageId,
          x: o.x + offset.x,
          y: o.y + offset.y,
          groupId: o.groupId ? groupMap.get(o.groupId) : undefined,
          sectionId: o.sectionId ? idMap.get(o.sectionId) : undefined,
          fromId: o.fromId ? idMap.get(o.fromId) || o.fromId : undefined,
          toId: o.toId ? idMap.get(o.toId) || o.toId : undefined,
          fromX: o.fromX !== undefined ? o.fromX + offset.x : undefined,
          fromY: o.fromY !== undefined ? o.fromY + offset.y : undefined,
          toX: o.toX !== undefined ? o.toX + offset.x : undefined,
          toY: o.toY !== undefined ? o.toY + offset.y : undefined,
          order: Date.now() + ids.length,
        };
        ids.push(addObject(copy));
      });
    });
    setSelected(ids);
  };
  const remove = () => {
    if (canEdit)
      deleteObjects(
        expanded(selected)
          .filter((o) => !o.locked)
          .map((o) => o.id),
      );
    setSelected(selectedObjects.filter((o) => o.locked).map((o) => o.id));
  };
  const copy = async (cut = false) => {
    clipboard.current = expanded(selected).map((o) => ({ ...o }));
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ canvaslab: 1, objects: clipboard.current }),
      );
    } catch {
      /* Internal clipboard remains available. */
    }
    if (cut) remove();
    setToast(cut ? "Objects cut" : "Objects copied");
  };
  const pasteObjects = (items: SceneObject[]) => {
    const b = bounds(items),
      p = lastCursor.current;
    duplicate(items, { x: p.x - b.x, y: p.y - b.y });
  };
  const pasteText = (text: string, p = center()) => {
    if (!canEdit || !text.trim()) return;
    try {
      const data = JSON.parse(text);
      if (data.canvaslab === 1 && Array.isArray(data.objects)) {
        pasteObjects(data.objects);
        return;
      }
    } catch {
      /* Plain text. */
    }
    if (text.includes("\t")) {
      try {
        create("table", p, { cells: parseCSV(text) });
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    const lines = text.trim().split(/\r?\n/).filter(Boolean).slice(0, 100);
    const ids: string[] = [];
    mutate(() =>
      lines.forEach((line, i) => {
        ids.push(
          addObject({
            type: "sticky",
            pageId,
            x: p.x + (i % 4) * 235,
            y: p.y + Math.floor(i / 4) * 235,
            width: 210,
            height: 210,
            fill,
            strokeWidth: 0,
            stroke: "transparent",
            text: line,
            fontSize: 20,
            align: "center",
            order: Date.now() + i,
            author: user.name,
          }),
        );
      }),
    );
    setSelected(ids);
  };
  const group = () => {
    if (!canEdit) return;
    const grouped =
      one?.groupId ||
      selectedObjects.every(
        (o) => o.groupId && o.groupId === selectedObjects[0]?.groupId,
      );
    patchSelected({ groupId: grouped ? undefined : uid() });
  };
  const reorderStep = (direction: 1 | -1) => {
    if (!canEdit || !one || one.locked) return;
    const sorted = [...pageObjects].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );
    const neighbor = sorted[sorted.findIndex((o) => o.id === one.id) + direction];
    if (!neighbor) return;
    mutate(() => {
      updateObject(one.id, { order: neighbor.order });
      updateObject(neighbor.id, { order: one.order });
    });
  };
  const arrange = (mode: string) => {
    if (!canEdit || !editableSelected.length) return;
    const b = bounds(editableSelected);
    mutate(() => {
      const sorted = [...editableSelected].sort((a, c) =>
        mode === "distribute-y" ? a.y - c.y : a.x - c.x,
      );
      let cursor = mode === "distribute-y" ? b.y : b.x;
      const total = sorted.reduce(
          (n, o) => n + (mode === "distribute-y" ? o.height : o.width),
          0,
        ),
        gap =
          ((mode === "distribute-y" ? b.height : b.width) - total) /
          Math.max(sorted.length - 1, 1);
      editableSelected.forEach((o, i) => {
        if (mode === "left") updateObject(o.id, { x: b.x });
        if (mode === "center")
          updateObject(o.id, { x: b.x + (b.width - o.width) / 2 });
        if (mode === "top") updateObject(o.id, { y: b.y });
        if (mode === "tidy")
          updateObject(o.id, {
            x: b.x + (i % 3) * 250,
            y: b.y + Math.floor(i / 3) * 250,
          });
      });
      if (mode.startsWith("distribute"))
        sorted.forEach((o) => {
          updateObject(
            o.id,
            mode === "distribute-y" ? { y: cursor } : { x: cursor },
          );
          cursor += (mode === "distribute-y" ? o.height : o.width) + gap;
        });
    });
  };
  const addPage = () => {
    if (!canEdit) return;
    pageCameras.current.set(pageId, cameraRef.current);
    const id = uid();
    mutate(() => {
      const p = new Y.Map();
      p.set("id", id);
      p.set("name", `Page ${pages.length + 1}`);
      p.set("order", pages.length);
      doc.getMap("pages").set(id, p);
    });
    setPageId(id);
    setSelected([]);
    setCamera({ x: 260, y: 180, zoom: 1 });
  };
  const switchPage = (id: string) => {
    pageCameras.current.set(pageId, cameraRef.current);
    setPageId(id);
    setSelected([]);
    setEditing(null);
    setFollow(null);
    setPageMenu(false);
    setHovered(null);
    setCamera(pageCameras.current.get(id) || { x: 260, y: 180, zoom: 1 });
  };
  const renamePage = (id: string) => {
    const p = pages.find((v) => v.id === id);
    const name = prompt("Page name", p?.name);
    if (name?.trim() && canEdit)
      mutate(() => {
        const value = doc.getMap("pages").get(id) as Y.Map<unknown>;
        value?.set("name", name.trim().slice(0, 120));
      });
  };
  const copyPage = (id: string) => {
    if (!canEdit) return;
    pageCameras.current.set(pageId, cameraRef.current);
    const newId = uid(),
      items = objects.filter((o) => o.pageId === id),
      map = new Map(items.map((o) => [o.id, uid()])),
      groups = new Map(
        items.filter((o) => o.groupId).map((o) => [o.groupId!, uid()]),
      );
    mutate(() => {
      const p = new Y.Map();
      p.set("id", newId);
      p.set("name", `${pages.find((v) => v.id === id)?.name || "Page"} copy`);
      p.set("order", pages.length);
      doc.getMap("pages").set(newId, p);
      items.forEach((o) =>
        addObject({
          ...o,
          id: map.get(o.id),
          pageId: newId,
          groupId: o.groupId ? groups.get(o.groupId) : undefined,
          sectionId: o.sectionId ? map.get(o.sectionId) : undefined,
          fromId: o.fromId ? map.get(o.fromId) : undefined,
          toId: o.toId ? map.get(o.toId) : undefined,
        }),
      );
    });
    setPageId(newId);
    setSelected([]);
  };
  const removePage = (id: string) => {
    if (!canEdit) return;
    if (pages.length === 1) {
      setToast("Keep at least one page in your board.");
      return;
    }
    if (confirm("Delete this page and all its objects?"))
      mutate(() => {
        deleteObjects(objects.filter((o) => o.pageId === id).map((o) => o.id));
        doc.getMap("pages").delete(id);
      });
  };
  const movePage = (id: string, direction: number) => {
    if (!canEdit) return;
    const index = pages.findIndex((p) => p.id === id),
      other = pages[index + direction];
    if (!other) return;
    mutate(() => {
      const map = doc.getMap("pages");
      (map.get(id) as Y.Map<unknown>).set("order", other.order);
      (map.get(other.id) as Y.Map<unknown>).set("order", pages[index].order);
    });
  };
  const mindChild = (sibling = false) => {
    if (!canEdit) return;
    let parent = one;
    if (sibling && one) {
      const edge = objects.find(
        (o) => o.type === "connector" && o.toId === one.id,
      );
      parent = objects.find((o) => o.id === edge?.fromId) || one;
    }
    if (!parent) {
      create("mindmap", center());
      return;
    }
    const children = objects.filter(
      (o) => o.type === "connector" && o.fromId === parent!.id,
    ).length;
    mutate(() => {
      const id = create(
        "rounded",
        { x: parent!.x + parent!.width + 120, y: parent!.y + children * 150 },
        { text: "New idea", fill: COLORS[(children + 3) % 6] },
      );
      addObject({
        type: "connector",
        pageId,
        x: parent!.x + parent!.width,
        y: parent!.y + parent!.height / 2,
        width: 120,
        height: 0,
        fromId: parent!.id,
        toId: id,
        stroke: "#9b8cc5",
        strokeWidth: 2,
        routing: "elbow",
        order: Date.now(),
      });
      setSelected([id]);
      setEditing(id);
    });
  };
  const layoutMindmap = () => {
    if (!canEdit || !one) return;
    const root = one,
      visited = new Set<string>();
    mutate(() => {
      const layout = (o: SceneObject, depth: number, row: number): number => {
        if (visited.has(o.id)) return row;
        visited.add(o.id);
        updateObject(o.id, { x: root.x + depth * 300, y: root.y + row * 160 });
        let next = row;
        objects
          .filter((c) => c.type === "connector" && c.fromId === o.id)
          .forEach((c) => {
            const child = objects.find((v) => v.id === c.toId);
            if (child) next = layout(child, depth + 1, next) + 1;
          });
        return Math.max(row, next - 1);
      };
      layout(root, 0, 0);
    });
  };
  const uploadImage = async (file: File, p = center()) => {
    if (!canEdit) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw new Error("Choose a PNG, JPEG, or WebP image.");
    if (file.size > 8 * 1024 * 1024)
      throw new Error("Images must be 8 MB or smaller.");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await api<any>("asset.create", {
        board_id: boardId,
        name: file.name,
        mime: file.type,
        data,
      }),
      asset = result.asset || result;
    const src = `data:${file.type};base64,${data}`,
      image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Invalid image file."));
      image.src = src;
    });
    const scale = Math.min(1, 600 / image.width);
    setAssets((old) => ({ ...old, [asset.id]: src }));
    create("rectangle", p, {
      type: "image",
      width: image.width * scale,
      height: image.height * scale,
      assetId: asset.id,
      strokeWidth: 0,
    });
    setToast("Image uploaded");
  };
  const doExport = (format: "svg" | "png") =>
    tryAction(async () => {
      const items = selected.length ? expanded(selected) : pageObjects;
      await exportScene(
        format,
        items,
        assets,
        `${board?.name || "CanvasLab"}${selected.length ? " selection" : ""}`,
        pageObjects,
      );
      setMenu(null);
      setToast(`${format.toUpperCase()} exported`);
    });
  const editableExport = () =>
    tryAction(async () => {
      const out = await api<any>("board.export", { board_id: boardId });
      download(
        new Blob([JSON.stringify(out)], { type: "application/json" }),
        `${board?.name || "board"}.canvaslab`,
      );
      setMenu(null);
    });
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (isTyping(event.target) || !canEdit) return;
      const image = Array.from(event.clipboardData?.items || []).find((i) =>
        i.type.startsWith("image/"),
      );
      if (image) {
        event.preventDefault();
        const file = image.getAsFile();
        if (file) void tryAction(() => uploadImage(file));
        return;
      }
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        event.preventDefault();
        pasteText(text, lastCursor.current);
      }
    },
    [canEdit, pageId, objects, selected, fill, camera],
  );
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("dialog[open]")) return;
      const mod = e.metaKey || e.ctrlKey,
        key = e.key.toLowerCase();
      if (key === "escape") {
        setEditing(null);
        setMenu(null);
        setContext(null);
        setPanel(null);
        setInteraction(emptyInteraction);
        setPreview({});
        setPendingConnector(null);
        setToolbarDrag(null);
        setGuides({});
        setHovered(null);
        setPageMenu(false);
        setSpotlightMenu(false);
        setTool("select");
        if (follow) {
          const followed = peerList.find(
            (p: any) => p.user?.id === follow,
          ) as any;
          if (followed?.spotlight) setDismissedSpotlight(follow);
        }
        setFollow(null);
        return;
      }
      if (key === " ") {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (canEdit) (e.shiftKey ? redo : undo)();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        setSelected(pageObjects.map((o) => o.id));
        return;
      }
      if (mod && key === "c") {
        if (selected.length) {
          e.preventDefault();
          void copy();
        }
        return;
      }
      if (mod && key === "x") {
        if (selected.length) {
          e.preventDefault();
          void copy(true);
        }
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        duplicate();
        return;
      }
      if (mod && key === "g") {
        e.preventDefault();
        group();
        return;
      }
      if (key === "]" || key === "[") {
        e.preventDefault();
        if (mod) patchSelected({ order: key === "]" ? Date.now() : -Date.now() });
        else reorderStep(key === "]" ? 1 : -1);
        return;
      }
      if (mod && key === "f") {
        e.preventDefault();
        setOutline(true);
        setTimeout(() => document.getElementById("board-search")?.focus(), 0);
        return;
      }
      if (mod && key === "v") {
        if (!navigator.clipboard && clipboard.current.length) {
          e.preventDefault();
          pasteObjects(clipboard.current);
        }
        return;
      }
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        remove();
        return;
      }
      if (key.startsWith("arrow")) {
        e.preventDefault();
        if (canEdit) {
          const step = e.shiftKey ? 10 : 1;
          mutate(() =>
            expanded(selected)
              .filter((o) => !o.locked)
              .forEach((o) =>
                updateObject(o.id, {
                  x:
                    o.x +
                    (key === "arrowleft"
                      ? -step
                      : key === "arrowright"
                        ? step
                        : 0),
                  y:
                    o.y +
                    (key === "arrowup"
                      ? -step
                      : key === "arrowdown"
                        ? step
                        : 0),
                }),
              ),
          );
        }
        return;
      }
      if (key === "tab" && one) {
        e.preventDefault();
        mindChild();
        return;
      }
      if (key === "enter" && one && e.shiftKey) {
        e.preventDefault();
        mindChild(true);
        return;
      }
      if (key === "enter" && one && canEdit && textTypes.includes(one.type)) {
        e.preventDefault();
        setEditing(one.id);
        return;
      }
      if (key === "1") {
        fit();
        return;
      }
      if (key === "2") {
        fit(selectedObjects);
        return;
      }
      if (key === "0") {
        zoomTo(1);
        return;
      }
      if (key === "?" || key === "/") {
        setMenu("help");
        return;
      }
      if (!mod) {
        const map: Record<string, Tool> = {
          v: "select",
          h: "hand",
          s: e.shiftKey ? "section" : "sticky",
          n: "sticky",
          t: "text",
          p: "pen",
          l: "connector",
          c: "comment",
          r: "rectangle",
          e: "eraser",
        };
        if (
          map[key] &&
          (canEdit || ["select", "hand", "comment"].includes(map[key]))
        ) {
          setTool(map[key]);
          setMenu(null);
        }
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === " ") setSpace(false);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, [
    selected,
    pageObjects,
    canEdit,
    objects,
    one,
    camera,
    tool,
    fill,
    undo,
    redo,
    follow,
    presence,
  ]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (
        (e.target as Element).closest(
          ".editor-panel,.editor-popover,.editor-topbar,.editor-toolbar,.context-style,.zoom-control,.page-switcher",
        )
      )
        return;
      // Also blocks the trackpad's horizontal-swipe "back/forward" page
      // navigation gesture, which otherwise fires on a two-finger swipe.
      e.preventDefault();
      e.stopPropagation();
      setFollow(null);
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(),
          pos = { x: e.clientX - r.left, y: e.clientY - r.top };
        smoothCamera((c) => {
          // Matched to Figma's pinch-to-zoom sensitivity: one gesture should
          // reach the same zoom Figma does, not need 3-4x the pinching.
          const z = clamp(c.zoom * Math.exp(-e.deltaY * unit * 0.013), 0.08, 5);
          return {
            x: pos.x - ((pos.x - c.x) / c.zoom) * z,
            y: pos.y - ((pos.y - c.y) / c.zoom) * z,
            zoom: z,
          };
        });
      } else {
        // A two-finger scroll's delta is pre-dampened by the OS compared to
        // a mouse-cursor drag's raw pixel motion, so panning-by-scroll reads
        // as heavier than the hand tool at the same 1:1 factor. Boost it to
        // bring the two onto equal footing.
        const panBoost = 2.4;
        smoothCamera((c) => ({
          ...c,
          x: c.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit * panBoost,
          y: c.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit * panBoost,
        }));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [smoothCamera]);
  const hitObject = (
    target: EventTarget | null,
    p: Point,
    exclude?: string,
  ) => {
    const id = (target as Element)
      ?.closest?.("[data-object-id]")
      ?.getAttribute("data-object-id");
    if (id && id !== exclude) return pageObjects.find((o) => o.id === id);
    return [...pageObjects]
      .reverse()
      .find(
        (o) =>
          o.id !== exclude &&
          !["connector", "pen", "section"].includes(o.type) &&
          contains(o, p),
      );
  };
  const updateMembership = (patches: Record<string, Partial<SceneObject>>) => {
    const sections = pageObjects.filter((o) => o.type === "section");
    for (const [id, patch] of Object.entries(patches)) {
      const original = objects.find((o) => o.id === id);
      if (!original || original.type === "section" || original.locked) continue;
      const value = { ...original, ...patch },
        p = { x: value.x + value.width / 2, y: value.y + value.height / 2 },
        section = sections.find((s) => contains({ ...s, ...patches[s.id] }, p));
      patch.sectionId = section?.id;
    }
  };
  const ANCHORS: ConnectorAnchor[] = ["top", "right", "bottom", "left"];
  const connectionTarget = (point: Point, exclude?: string) => {
    const options = pageObjects
      .filter(
        (o) =>
          o.id !== exclude &&
          !["connector", "pen", "section", "text", "stamp"].includes(o.type),
      )
      .map((o) => {
        const anchors = ANCHORS.map((side) => ({
          side,
          point: shapeAnchorPoint(o, side),
        }));
        const closest = anchors.sort(
          (a, b) =>
            Math.hypot(a.point.x - point.x, a.point.y - point.y) -
            Math.hypot(b.point.x - point.x, b.point.y - point.y),
        )[0];
        const b = box(o),
          distance = contains(o, point)
            ? 0
            : Math.hypot(
                Math.max(b.x - point.x, point.x - b.x - b.width, 0),
                Math.max(b.y - point.y, point.y - b.y - b.height, 0),
              );
        return {
          object: o,
          anchor: closest.side,
          point: closest.point,
          distance,
        };
      })
      .filter((v) => v.distance <= 30 / camera.zoom)
      .sort((a, b) => a.distance - b.distance);
    return options[0];
  };
  const finishConnector = (
    from: Point,
    fromId: string | undefined,
    to: Point,
    toId: string | undefined,
    fromAnchor?: ConnectorAnchor,
    toAnchor?: ConnectorAnchor,
  ) => {
    if (!canEdit || (fromId && fromId === toId)) return;
    const id = addObject({
      type: "connector",
      pageId,
      x: from.x,
      y: from.y,
      width: to.x - from.x,
      height: to.y - from.y,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      fromId,
      toId,
      fromAnchor,
      toAnchor,
      routing: "elbow",
      stroke,
      strokeWidth: 2,
      fill: "transparent",
      text: "",
      order: Date.now(),
    });
    setSelected([id]);
    setPendingConnector(null);
    setTool("select");
    setHovered(null);
  };
  const quickConnect = (source: SceneObject, side: ConnectorAnchor) => {
    const from = shapeAnchorPoint(source, side),
      middle = {
        x: source.x + source.width / 2,
        y: source.y + source.height / 2,
      };
    const magnitude = Math.hypot(from.x - middle.x, from.y - middle.y) || 1,
      direction = {
        x: (from.x - middle.x) / magnitude,
        y: (from.y - middle.y) / magnitude,
      };
    const target = pageObjects
      .filter(
        (o) =>
          o.id !== source.id &&
          !["connector", "pen", "section", "text", "stamp"].includes(o.type),
      )
      .map((o) => {
        const x = o.x + o.width / 2 - from.x,
          y = o.y + o.height / 2 - from.y;
        return {
          o,
          along: x * direction.x + y * direction.y,
          across: Math.abs(x * direction.y - y * direction.x),
        };
      })
      .filter(
        (v) =>
          v.along > 20 &&
          v.along < 700 &&
          v.across < Math.max(source.width, source.height) * 0.7,
      )
      .sort((a, b) => a.along + a.across * 2 - (b.along + b.across * 2))[0];
    live.stopCapturing();
    mutate(() => {
      if (target) {
        const to = shapeAnchorPoint(
          target.o,
          ANCHORS[(ANCHORS.indexOf(side) + 2) % 4],
        );
        finishConnector(from, source.id, to, target.o.id, side);
      } else {
        const distance =
            Math.abs(direction.x) * source.width +
            Math.abs(direction.y) * source.height +
            100,
          position = {
            x: source.x + direction.x * distance,
            y: source.y + direction.y * distance,
          };
        const id = create(source.type as Tool, position, {
          width: source.width,
          height: source.height,
          fill: source.fill,
          stroke: source.stroke,
          text: "",
        });
        finishConnector(
          from,
          source.id,
          {
            x: position.x + source.width / 2,
            y: position.y + source.height / 2,
          },
          id,
          side,
        );
        setSelected([id]);
        setEditing(id);
      }
    });
    live.stopCapturing();
  };
  const pointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2 || (e.target as Element).closest("a,input,textarea"))
      return;
    e.preventDefault();
    setContext(null);
    setMenu(null);
    setPageMenu(false);
    setCamera(cameraRef.current);
    const p = world({ x: e.clientX, y: e.clientY });
    lastCursor.current = p;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: camera.zoom,
        world: world(mid),
      };
      setInteraction(emptyInteraction);
      setPreview({});
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (editing) {
      setEditing(null);
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    if (tool === "hand" || space || e.button === 1) {
      e.preventDefault();
      setFollow(null);
      setInteraction({
        kind: "pan",
        start: { x: e.clientX, y: e.clientY },
        camera,
      });
      return;
    }
    const anchorElement = (e.target as Element).closest(
      "[data-connector-anchor]",
    );
    if (anchorElement && canEdit) {
      const source = pageObjects.find(
        (o) => o.id === anchorElement.getAttribute("data-connector-object"),
      );
      const side = anchorElement.getAttribute(
        "data-connector-anchor",
      ) as ConnectorAnchor;
      if (source && !source.locked) {
        const start = shapeAnchorPoint(source, side);
        setSelected([source.id]);
        setInteraction({
          kind: "connect",
          start,
          current: start,
          fromId: source.id,
          fromAnchor: side,
        });
        return;
      }
    }
    const handle = (e.target as Element)
      .closest("[data-handle]")
      ?.getAttribute("data-handle");
    if (handle && one && !one.locked && canEdit) {
      if (handle.startsWith("endpoint-"))
        setInteraction({
          kind: "endpoint",
          id: one.id,
          end: handle.endsWith("from") ? "from" : "to",
          current: p,
        });
      else if (handle === "bend")
        setInteraction({ kind: "bend", id: one.id, index: 0, current: p });
      else if (handle.startsWith("radius-"))
        setInteraction({
          kind: "radius",
          item: one,
          corner: handle.slice(7) as "nw" | "ne" | "sw" | "se",
        });
      else if (handle === "rotate")
        setInteraction({
          kind: "rotate",
          start: p,
          item: one,
          angle: Math.atan2(
            p.y - one.y - one.height / 2,
            p.x - one.x - one.width / 2,
          ),
        });
      else setInteraction({ kind: "resize", start: p, item: one, handle });
      return;
    }
    const hit = hitObject(e.target, p);
    if (tool === "comment") {
      setCommentAnchor({ ...p, pageId });
      setPanel("comments");
      setSelected(hit ? [hit.id] : []);
      sendPresence({ x: p.x, y: p.y, pageId, selected: hit ? [hit.id] : [] });
      setTool("select");
      return;
    }
    if (!canEdit && tool !== "select") return;
    if (tool === "connector") {
      if (pendingConnector) {
        finishConnector(
          pendingConnector.point,
          pendingConnector.id,
          p,
          hit?.id,
        );
        return;
      }
      setInteraction({
        kind: "connect",
        start: p,
        current: p,
        fromId: hit?.type === "connector" ? undefined : hit?.id,
      });
      return;
    }
    if (tool === "pen" || tool === "highlighter") {
      setSelected([]);
      setInteraction({
        kind: "draw",
        points: [p],
        highlighter: tool === "highlighter",
      });
      return;
    }
    if (tool === "eraser") {
      if (hit && !hit.locked) deleteObjects([hit.id]);
      return;
    }
    if (tool !== "select") {
      setSelected([]);
      setInteraction({ kind: "create", type: tool, start: p, current: p });
      return;
    }
    if (hit) {
      const ids = e.shiftKey
        ? selected.includes(hit.id)
          ? selected.filter((id) => id !== hit.id)
          : [...selected, hit.id]
        : selected.includes(hit.id)
          ? selected
          : expanded([hit.id]).map((o) => o.id);
      setSelected(ids);
      if (!hit.locked && canEdit) {
        const items = expanded(ids).filter((o) => !o.locked);
        if (e.altKey) {
          duplicate(items, { x: 0, y: 0 });
          return;
        }
        setInteraction({ kind: "drag", start: p, items });
      }
    } else {
      const base = e.shiftKey ? selected : [];
      if (!e.shiftKey) setSelected([]);
      setInteraction({
        kind: "marquee",
        start: p,
        current: p,
        additive: e.shiftKey,
        base,
      });
    }
  };
  const pointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = world({ x: e.clientX, y: e.clientY });
    lastCursor.current = p;
    if (touches.current.has(e.pointerId))
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()],
        z = clamp(
          (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
            pinch.current.distance,
          0.08,
          5,
        ),
        rect = rootRef.current!.getBoundingClientRect();
      setCamera({
        x: (a.x + b.x) / 2 - rect.left - pinch.current.world.x * z,
        y: (a.y + b.y) / 2 - rect.top - pinch.current.world.y * z,
        zoom: z,
      });
      return;
    }
    sendPresence({ x: p.x, y: p.y, pageId, selected, spotlight: spotlighting });
    if (interaction.kind === "idle" && canEdit && tool === "select") {
      const hit = [...pageObjects].reverse().find(
        (o) =>
          !o.locked &&
          !["connector", "pen", "section", "text", "table", "stamp"].includes(
            o.type,
          ) &&
          intersects(box(o), {
            x: p.x - 28 / camera.zoom,
            y: p.y - 28 / camera.zoom,
            width: 56 / camera.zoom,
            height: 56 / camera.zoom,
          }),
      );
      setHovered(hit?.id || null);
    }
    if (interaction.kind === "create") {
      let current = p;
      if (e.shiftKey && interaction.type !== "section") {
        const dx = p.x - interaction.start.x,
          dy = p.y - interaction.start.y,
          d = Math.max(Math.abs(dx), Math.abs(dy));
        current = {
          x: interaction.start.x + Math.sign(dx || 1) * d,
          y: interaction.start.y + Math.sign(dy || 1) * d,
        };
      }
      setInteraction({ ...interaction, current });
      return;
    }
    if (interaction.kind === "pan") {
      setCamera({
        ...interaction.camera,
        x: interaction.camera.x + e.clientX - interaction.start.x,
        y: interaction.camera.y + e.clientY - interaction.start.y,
      });
      return;
    }
    if (interaction.kind === "marquee") {
      const b = {
        x: Math.min(interaction.start.x, p.x),
        y: Math.min(interaction.start.y, p.y),
        width: Math.abs(p.x - interaction.start.x),
        height: Math.abs(p.y - interaction.start.y),
      };
      // Figma shows the selection highlight live, under the cursor, rather
      // than only once the marquee is released.
      setSelected([
        ...new Set([
          ...interaction.base,
          ...pageObjects.filter((o) => intersects(box(o), b)).map((o) => o.id),
        ]),
      ]);
      setInteraction({ ...interaction, current: p });
      return;
    }
    if (interaction.kind === "drag") {
      let dx = p.x - interaction.start.x,
        dy = p.y - interaction.start.y;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (snap && !e.altKey && interaction.items.length) {
        const base = interaction.items[0];
        dx = Math.round((base.x + dx) / GRID_SIZE) * GRID_SIZE - base.x;
        dy = Math.round((base.y + dy) / GRID_SIZE) * GRID_SIZE - base.y;
      }
      const guide: { x?: number; y?: number } = {};
      if (!snap && !e.altKey && interaction.items.length) {
        const b = bounds(interaction.items),
          threshold = 4 / camera.zoom;
        let bestX = threshold,
          bestY = threshold,
          adjustX = 0,
          adjustY = 0;
        const xs = [b.x + dx, b.x + dx + b.width / 2, b.x + dx + b.width],
          ys = [b.y + dy, b.y + dy + b.height / 2, b.y + dy + b.height];
        for (const other of pageObjects) {
          if (
            other.type === "connector" ||
            other.type === "section" ||
            interaction.items.some((o) => o.id === other.id)
          )
            continue;
          const r = box(other);
          for (const x of [r.x, r.x + r.width / 2, r.x + r.width])
            for (const current of xs) {
              const d = x - current;
              if (Math.abs(d) < bestX) {
                bestX = Math.abs(d);
                adjustX = d;
                guide.x = x;
              }
            }
          for (const y of [r.y, r.y + r.height / 2, r.y + r.height])
            for (const current of ys) {
              const d = y - current;
              if (Math.abs(d) < bestY) {
                bestY = Math.abs(d);
                adjustY = d;
                guide.y = y;
              }
            }
        }
        if (!e.shiftKey || dx !== 0) dx += adjustX;
        if (!e.shiftKey || dy !== 0) dy += adjustY;
      }
      setGuides(guide);
      const next: Record<string, Partial<SceneObject>> = {};
      interaction.items.forEach((o) => {
        next[o.id] = { x: o.x + dx, y: o.y + dy };
        if (o.type === "connector") {
          next[o.id] = {
            ...next[o.id],
            fromX: (o.fromX ?? o.x) + dx,
            fromY: (o.fromY ?? o.y) + dy,
            toX: (o.toX ?? o.x + o.width) + dx,
            toY: (o.toY ?? o.y + o.height) + dy,
          };
        }
      });
      setPreview(next);
      return;
    }
    if (interaction.kind === "resize") {
      const o = interaction.item;
      let result = resizeObject(
        o,
        interaction.start,
        p,
        interaction.handle,
        e.shiftKey || o.type === "image",
        e.altKey,
      );
      // Snapping the raw cursor point isn't enough: the handle is rarely
      // grabbed pixel-perfect on the edge, so that offset would carry
      // through the whole drag and the edge would still stop off-grid.
      // Snap the actual resulting edges instead - the ones the handle
      // just moved - so a corner always lands exactly on a dot.
      if (snap && !e.altKey && !(o.rotation || 0)) {
        const h = interaction.handle;
        if (h.includes("w")) {
          const left = Math.round(result.x / GRID_SIZE) * GRID_SIZE;
          result = { ...result, x: left, width: result.x + result.width - left };
        } else if (h.includes("e")) {
          const right =
            Math.round((result.x + result.width) / GRID_SIZE) * GRID_SIZE;
          result = { ...result, width: right - result.x };
        }
        if (h.includes("n")) {
          const top = Math.round(result.y / GRID_SIZE) * GRID_SIZE;
          result = { ...result, y: top, height: result.y + result.height - top };
        } else if (h.includes("s")) {
          const bottom =
            Math.round((result.y + result.height) / GRID_SIZE) * GRID_SIZE;
          result = { ...result, height: bottom - result.y };
        }
      }
      setPreview({ [o.id]: result });
      return;
    }
    if (interaction.kind === "rotate") {
      const o = interaction.item;
      let angle =
        (o.rotation || 0) +
        ((Math.atan2(p.y - o.y - o.height / 2, p.x - o.x - o.width / 2) -
          interaction.angle) *
          180) /
          Math.PI;
      if (e.shiftKey) angle = Math.round(angle / 15) * 15;
      setPreview({ [o.id]: { rotation: Math.round(angle) } });
      return;
    }
    if (interaction.kind === "draw") {
      const last = interaction.points.at(-1)!;
      if (Math.hypot(last.x - p.x, last.y - p.y) > 2 / camera.zoom)
        setInteraction({
          ...interaction,
          points: [...interaction.points, p].slice(0, 4000),
        });
      return;
    }
    if (interaction.kind === "connect" || interaction.kind === "endpoint") {
      setInteraction({ ...interaction, current: p });
      return;
    }
    if (interaction.kind === "bend") {
      const connector = allObjects.find((v) => v.id === interaction.id);
      if (connector) {
        const [a, b] = connectorPoints(connector, allObjects);
        setPreview({
          [connector.id]: { curveOffset: curveOffsetFromPoint(a, b, p) },
        });
      }
      setInteraction({ ...interaction, current: p });
      return;
    }
    if (interaction.kind === "radius") {
      const o = interaction.item,
        center = { x: o.x + o.width / 2, y: o.y + o.height / 2 },
        local = rotate(p, -(o.rotation || 0), center),
        corner = {
          nw: { x: o.x, y: o.y },
          ne: { x: o.x + o.width, y: o.y },
          sw: { x: o.x, y: o.y + o.height },
          se: { x: o.x + o.width, y: o.y + o.height },
        }[interaction.corner];
      const radius = clamp(
        Math.min(Math.abs(local.x - corner.x), Math.abs(local.y - corner.y)),
        0,
        Math.min(o.width, o.height) / 2,
      );
      setPreview({ [o.id]: { radius: Math.round(radius) } });
      return;
    }
    if (tool === "eraser" && e.buttons === 1 && canEdit) {
      const hit = hitObject(e.target, p);
      if (hit && !hit.locked) deleteObjects([hit.id]);
    }
  };
  const pointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      setInteraction(emptyInteraction);
      return;
    }
    const p = world({ x: e.clientX, y: e.clientY });
    if (interaction.kind === "create") {
      const end = interaction.current,
        distance =
          Math.hypot(end.x - interaction.start.x, end.y - interaction.start.y) *
          camera.zoom;
      const rect = {
        x: Math.min(interaction.start.x, end.x),
        y: Math.min(interaction.start.y, end.y),
        width: Math.max(30, Math.abs(end.x - interaction.start.x)),
        height: Math.max(30, Math.abs(end.y - interaction.start.y)),
      };
      live.stopCapturing();
      mutate(() =>
        create(
          interaction.type,
          distance > 6 ? rect : interaction.start,
          distance > 6
            ? {
                ...rect,
                autoWidth:
                  interaction.type === "text" ? false : undefined,
              }
            : {},
        ),
      );
      live.stopCapturing();
    }
    if (interaction.kind === "marquee") {
      const b = {
        x: Math.min(interaction.start.x, p.x),
        y: Math.min(interaction.start.y, p.y),
        width: Math.abs(p.x - interaction.start.x),
        height: Math.abs(p.y - interaction.start.y),
      };
      // Selection was already kept live during the drag (see pointerMove);
      // this finalizes it against the release point in case no move event
      // landed exactly there.
      setSelected([
        ...new Set([
          ...interaction.base,
          ...pageObjects.filter((o) => intersects(box(o), b)).map((o) => o.id),
        ]),
      ]);
    }
    if (
      ["drag", "resize", "rotate", "bend", "radius"].includes(
        interaction.kind,
      ) &&
      Object.keys(preview).length
    ) {
      if (interaction.kind === "drag") updateMembership(preview);
      live.stopCapturing();
      mutate(() =>
        Object.entries(preview).forEach(([id, patch]) =>
          updateObject(id, patch),
        ),
      );
      live.stopCapturing();
      setPreview({});
    }
    if (interaction.kind === "draw" && interaction.points.length > 1) {
      const points = interaction.points;
      const x = Math.min(...points.map((v) => v.x)),
        y = Math.min(...points.map((v) => v.y)),
        width = Math.max(1, ...points.map((v) => v.x - x)),
        height = Math.max(1, ...points.map((v) => v.y - y));
      addObject({
        type: "pen",
        pageId,
        x,
        y,
        width,
        height,
        points: points.map((v) => ({ x: v.x - x, y: v.y - y })),
        stroke: interaction.highlighter ? fill : stroke,
        strokeWidth: interaction.highlighter ? 22 : strokeWidth,
        opacity: interaction.highlighter ? 0.45 : 1,
        order: Date.now(),
      });
    }
    if (interaction.kind === "connect") {
      const source = pageObjects.find((o) => o.id === interaction.fromId),
        distance = Math.hypot(
          p.x - interaction.start.x,
          p.y - interaction.start.y,
        );
      // Handles sit outside the shape, so measure from the displayed handle for a click.
      const sidePoint =
        source && interaction.fromAnchor
          ? shapeAnchorPoint(source, interaction.fromAnchor)
          : interaction.start;
      if (
        interaction.fromAnchor &&
        source &&
        Math.hypot(p.x - sidePoint.x, p.y - sidePoint.y) < 34 / camera.zoom
      ) {
        quickConnect(source, interaction.fromAnchor);
      } else if (distance < 8 / camera.zoom)
        setPendingConnector({
          point: interaction.start,
          id: interaction.fromId,
        });
      else {
        const target = connectionTarget(p, interaction.fromId);
        finishConnector(
          interaction.start,
          interaction.fromId,
          target?.point || p,
          target?.object.id,
          interaction.fromAnchor,
          target?.anchor,
        );
      }
    }
    if (interaction.kind === "endpoint") {
      const target = connectionTarget(p, interaction.id);
      updateObject(
        interaction.id,
        interaction.end === "from"
          ? {
              fromId: target?.object.id,
              fromX: p.x,
              fromY: p.y,
              fromAnchor: target?.anchor,
            }
          : {
              toId: target?.object.id,
              toX: p.x,
              toY: p.y,
              toAnchor: target?.anchor,
            },
      );
    }
    setInteraction(emptyInteraction);
    setGuides({});
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* Pointer may already be released. */
    }
  };
  const editObject = (id: string) => {
    const o = objects.find((v) => v.id === id);
    if (canEdit && o && !o.locked && textTypes.includes(o.type)) {
      setSelected([id]);
      if (o.type === "section" || o.type === "connector") {
        const value = prompt(
          o.type === "section" ? "Section title" : "Connector label",
          o.text || "",
        );
        if (value !== null) setText(id, value);
      } else setEditing(id);
    }
  };
  const fitFrameToContent = (id: string) => {
    const frame = objects.find((v) => v.id === id);
    if (!canEdit || !frame || frame.locked) return;
    const children = objects.filter((o) => o.sectionId === id);
    if (!children.length) return;
    const b = bounds(children),
      padding = 40;
    updateObject(id, {
      x: b.x - padding,
      y: b.y - padding,
      width: b.width + padding * 2,
      height: b.height + padding * 2,
    });
  };
  const commitBoardName = (name: string) => {
    setRenamingBoard(false);
    if (name.trim() && name.trim() !== board?.name)
      void tryAction(async () => {
        await api("board.update", { board_id: boardId, name: name.trim() });
        refreshMetadata();
        onMetadataChange?.();
      });
  };
  const renameBoard = () => {
    if (!canEdit) return;
    setBoardNameDraft(board?.name || "");
    setRenamingBoard(true);
  };
  const setTableCell = (id: string, r: number, c: number, value: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj || obj.locked || !canEdit) return;
    const cells = (obj.cells || defaultCells).map((row) => [...row]);
    cells[r][c] = value;
    updateObject(id, { cells });
  };
  const tableAction = (kind: string) => {
    if (!one || one.type !== "table") return;
    const cells = (one.cells || defaultCells).map((r) => [...r]);
    if (kind === "add-row" && cells.length < 100)
      cells.push(cells[0].map(() => ""));
    if (kind === "add-col" && cells[0].length < 30)
      cells.forEach((r) => r.push(""));
    if (kind === "remove-row" && cells.length > 1) cells.pop();
    if (kind === "remove-col" && cells[0].length > 1)
      cells.forEach((r) => r.pop());
    updateObject(one.id, { cells });
  };
  const react = (emoji: string) => {
    sendPresence({ reaction: { emoji, at: Date.now() }, pageId });
    setMenu(null);
    setToast(`${emoji} Reaction sent`);
  };
  const cursorChat = () => {
    const text = prompt("Cursor chat · visible for 8 seconds");
    if (text?.trim())
      sendPresence({
        chat: { text: text.trim().slice(0, 80), at: Date.now() },
        pageId,
      });
  };
  const callbacks = useRef({ editObject, setTableCell });
  callbacks.current = { editObject, setTableCell };
  const stableEdit = useCallback(
    (id: string) => callbacks.current.editObject(id),
    [],
  );
  const stableCell = useCallback(
    (id: string, r: number, c: number, value: string) =>
      callbacks.current.setTableCell(id, r, c, value),
    [],
  );
  const toolDragProps = (type: Tool) => ({
    onPreview: (point: Point | null) => {
      setToolbarDrag(point ? { type, point } : null);
      if (point) {
        setEditing(null);
        setSelected([]);
      }
    },
    onDrop: (point: Point) => {
      const el = document.elementFromPoint(point.x, point.y);
      setMenu(null);
      if (!el?.closest(".infinite-canvas") || !canEdit) return;
      const p = world(point),
        draft = draftObject(type, p);
      live.stopCapturing();
      mutate(() =>
        create(type, { x: p.x - draft.width / 2, y: p.y - draft.height / 2 }),
      );
      live.stopCapturing();
    },
  });
  const draft =
    interaction.kind === "create"
      ? draftObject(
          interaction.type,
          {
            x: Math.min(interaction.start.x, interaction.current.x),
            y: Math.min(interaction.start.y, interaction.current.y),
          },
          {
            width: Math.max(
              1,
              Math.abs(interaction.current.x - interaction.start.x),
            ),
            height: Math.max(
              1,
              Math.abs(interaction.current.y - interaction.start.y),
            ),
          },
        )
      : toolbarDrag
        ? (() => {
            const p = world(toolbarDrag.point),
              d = draftObject(toolbarDrag.type, p);
            return { ...d, x: p.x - d.width / 2, y: p.y - d.height / 2 };
          })()
        : null;
  const connectorTarget =
    interaction.kind === "connect"
      ? connectionTarget(interaction.current, interaction.fromId)
      : interaction.kind === "endpoint"
        ? connectionTarget(interaction.current, interaction.id)
        : null;
  const connectorDraft =
    interaction.kind === "connect"
      ? draftObject("connector", interaction.start, {
          fromId: interaction.fromId,
          fromAnchor: interaction.fromAnchor,
          toId: connectorTarget?.object.id,
          toAnchor: connectorTarget?.anchor,
          toX: interaction.current.x,
          toY: interaction.current.y,
          routing: "elbow",
        })
      : null;
  const handleObject =
    !editing && tool === "select" && interaction.kind === "idle"
      ? pageObjects.find((o) => o.id === hovered) || one
      : null;
  // The dot pitch is the same world unit that object snapping uses, so
  // sizing and positioning always land exactly on a visible dot.
  const gridStep =
    GRID_SIZE * (camera.zoom < 0.3 ? 4 : camera.zoom < 0.6 ? 2 : 1) * camera.zoom;
  const worldSpan = CANVAS_MAX - CANVAS_MIN;
  const scrollbarThumbW = clamp(size.width / camera.zoom / worldSpan, 0.03, 1);
  const scrollbarThumbH = clamp(size.height / camera.zoom / worldSpan, 0.03, 1);
  const scrollbar = {
    thumbW: scrollbarThumbW,
    thumbH: scrollbarThumbH,
    left: clamp(
      (-camera.x / camera.zoom - CANVAS_MIN) / worldSpan,
      0,
      1 - scrollbarThumbW,
    ),
    top: clamp(
      (-camera.y / camera.zoom - CANVAS_MIN) / worldSpan,
      0,
      1 - scrollbarThumbH,
    ),
  };
  const visibleObjects = pageObjects.filter(
    (o) =>
      o.type === "connector" ||
      selected.includes(o.id) ||
      intersects(box(o), {
        x: -camera.x / camera.zoom - 300,
        y: -camera.y / camera.zoom - 300,
        width: size.width / camera.zoom + 600,
        height: size.height / camera.zoom + 600,
      }),
  );
  const displayObjects =
    interaction.kind === "endpoint"
      ? visibleObjects.map((o) =>
          o.id === interaction.id
            ? {
                ...o,
                ...(interaction.end === "from"
                  ? {
                      fromId: undefined,
                      fromX: interaction.current.x,
                      fromY: interaction.current.y,
                    }
                  : {
                      toId: undefined,
                      toX: interaction.current.x,
                      toY: interaction.current.y,
                    }),
              }
            : o,
        )
      : visibleObjects;
  const searchResults = search
    ? objects.filter(
        (o) =>
          (o.text || "").toLowerCase().includes(search.toLowerCase()) ||
          (o.type === "table" &&
            (o.cells || [])
              .flat()
              .some((v) => v.toLowerCase().includes(search.toLowerCase()))),
      )
    : pageObjects;
  const editPos = editingObject
    ? {
        left: camera.x + editingObject.x * camera.zoom,
        top: camera.y + editingObject.y * camera.zoom,
        transform: `scale(${camera.zoom}) translate(${editingObject.width / 2}px, ${editingObject.height / 2}px) rotate(${editingObject.rotation || 0}deg) translate(${-editingObject.width / 2}px, ${-editingObject.height / 2}px)`,
        transformOrigin: "0 0",
      }
    : undefined;
  return (
    <div
      ref={rootRef}
      className={`board-editor tool-${space ? "hand" : tool} ${interaction.kind !== "idle" || toolbarDrag ? "is-manipulating" : ""} ${toolbarDrag ? "is-tool-dragging" : ""}`}
      onDragOver={(e) => {
        if (canEdit) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        const p = world({ x: e.clientX, y: e.clientY });
        Array.from(e.dataTransfer.files).forEach(
          (file, i) =>
            void tryAction(() =>
              uploadImage(file, { x: p.x + i * 35, y: p.y + i * 35 }),
            ),
        );
      }}
    >
      <svg
        ref={svgRef}
        className="infinite-canvas"
        aria-label="Collaborative board canvas"
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          setInteraction(emptyInteraction);
          setPreview({});
          touches.current.clear();
          pinch.current = null;
        }}
        onDoubleClick={(e) => {
          const p = world({ x: e.clientX, y: e.clientY }),
            // The first click of the pair already put pointer capture on
            // this <svg> (see pointerDown), and per spec that also redirects
            // the target of compatibility mouse events like this one - so
            // e.target is always the <svg>, never whatever is drawn under
            // the cursor. Do a real hit-test instead.
            hit = hitObject(document.elementFromPoint(e.clientX, e.clientY), p);
          // A double-click on a frame resizes it to hug its contents,
          // rather than opening a text editor - matching how it reads on an
          // empty patch of canvas too (no more implicit text creation).
          if (hit?.type === "section") fitFrameToContent(hit.id);
          else if (hit) editObject(hit.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = rootRef.current!.getBoundingClientRect(),
            p = world({ x: e.clientX, y: e.clientY }),
            hit = hitObject(e.target, p);
          if (hit && !selected.includes(hit.id)) setSelected([hit.id]);
          setContext({
            x: Math.min(e.clientX - r.left, size.width - 235),
            y: Math.min(e.clientY - r.top, size.height - 390),
          });
        }}
      >
        <defs>
          <pattern
            id="canvas-dots"
            width={gridStep}
            height={gridStep}
            patternUnits="userSpaceOnUse"
            x={camera.x % gridStep}
            y={camera.y % gridStep}
          >
            <circle
              cx={gridStep / 2}
              cy={gridStep / 2}
              r={camera.zoom < 0.35 ? 1 : 1.2}
              fill="#8c8c8c"
              fillOpacity={0.5}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#f8f7fa" />
        <rect width="100%" height="100%" fill="url(#canvas-dots)" />
        <g
          transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
        >
          {displayObjects.map((o) => (
            <SceneView
              key={o.id}
              o={o}
              all={o.type === "connector" ? (Object.keys(preview).length&&!preview[o.id]&&!preview[o.fromId||'']&&!preview[o.toId||'']?objects:allObjects) : NO_OBJECTS}
              details={camera.zoom>=.28||selected.includes(o.id)}
              asset={o.assetId ? assets[o.assetId] : undefined}
              selected={selected.includes(o.id) && canEdit}
              editing={editing === o.id}
              onEdit={stableEdit}
              onCell={stableCell}
            />
          ))}
          {draft && (
            <g
              className={`object-draft ${toolbarDrag ? "toolbar-object-draft" : ""}`}
              pointerEvents="none"
            >
              <SceneView o={draft} all={allObjects} />
              <rect
                x={draft.x}
                y={draft.y}
                width={draft.width}
                height={draft.height}
                rx="6"
                fill="none"
                stroke="#5d41d3"
                strokeWidth={1.5 / camera.zoom}
              />
            </g>
          )}
          {draft && interaction.kind === "create" && (
            <g
              pointerEvents="none"
              transform={`translate(${draft.x + draft.width / 2} ${draft.y + draft.height + 22 / camera.zoom}) scale(${1 / camera.zoom})`}
            >
              <rect
                x="-46"
                y="-12"
                width="92"
                height="24"
                rx="7"
                fill="#302644"
              />
              <text textAnchor="middle" y="4" fill="white" fontSize="11">
                {Math.round(draft.width)} × {Math.round(draft.height)}
              </text>
            </g>
          )}
          {guides.x !== undefined && (
            <line
              x1={guides.x}
              x2={guides.x}
              y1={-camera.y / camera.zoom}
              y2={(size.height - camera.y) / camera.zoom}
              stroke="#cf4eaa"
              strokeWidth={1 / camera.zoom}
              strokeDasharray={`${4 / camera.zoom} ${4 / camera.zoom}`}
              pointerEvents="none"
            />
          )}
          {guides.y !== undefined && (
            <line
              y1={guides.y}
              y2={guides.y}
              x1={-camera.x / camera.zoom}
              x2={(size.width - camera.x) / camera.zoom}
              stroke="#cf4eaa"
              strokeWidth={1 / camera.zoom}
              strokeDasharray={`${4 / camera.zoom} ${4 / camera.zoom}`}
              pointerEvents="none"
            />
          )}
          {connectorTarget && (
            <g pointerEvents="none">
              <rect
                x={connectorTarget.object.x - 5 / camera.zoom}
                y={connectorTarget.object.y - 5 / camera.zoom}
                width={connectorTarget.object.width + 10 / camera.zoom}
                height={connectorTarget.object.height + 10 / camera.zoom}
                rx={16 / camera.zoom}
                fill="#7958f00a"
                stroke="#7350e6"
                strokeWidth={2 / camera.zoom}
                transform={`rotate(${connectorTarget.object.rotation || 0} ${connectorTarget.object.x + connectorTarget.object.width / 2} ${connectorTarget.object.y + connectorTarget.object.height / 2})`}
              />
              <circle
                cx={connectorTarget.point.x}
                cy={connectorTarget.point.y}
                r={6 / camera.zoom}
                fill="#7350e6"
                stroke="white"
                strokeWidth={2 / camera.zoom}
              />
            </g>
          )}
          {interaction.kind === "draw" && (
            <polyline
              points={interaction.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={interaction.highlighter ? fill : stroke}
              opacity={interaction.highlighter ? 0.45 : 1}
              strokeWidth={interaction.highlighter ? 22 : strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}
          {connectorDraft && (
            <path
              d={routedConnectorPath(connectorDraft, allObjects)}
              fill="none"
              stroke="#7250db"
              strokeWidth={2.5 / camera.zoom}
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}
          {pendingConnector && (
            <circle
              cx={pendingConnector.point.x}
              cy={pendingConnector.point.y}
              r={7 / camera.zoom}
              fill="#8066d7"
              pointerEvents="none"
            />
          )}
          {interaction.kind === "marquee" && (
            <rect
              x={Math.min(interaction.start.x, interaction.current.x)}
              y={Math.min(interaction.start.y, interaction.current.y)}
              width={Math.abs(interaction.current.x - interaction.start.x)}
              height={Math.abs(interaction.current.y - interaction.start.y)}
              fill="#0d99ff14"
              stroke="#0d99ff"
              strokeWidth={1 / camera.zoom}
              pointerEvents="none"
            />
          )}
          {selectedObjects
            .filter((o) => o.type !== "connector")
            .map((o) => (
              <rect
                key={`selection-${o.id}`}
                transform={`rotate(${o.rotation || 0} ${o.x + o.width / 2} ${o.y + o.height / 2})`}
                x={o.x}
                y={o.y}
                width={o.width}
                height={o.height}
                fill="none"
                stroke={o.locked ? "#9399a7" : "#0d99ff"}
                strokeWidth={2 / camera.zoom}
                pointerEvents="none"
              />
            ))}
          {one &&
            canEdit &&
            !one.locked &&
            !editing &&
            one.type !== "connector" &&
            one.type !== "pen" && (
              <g
                transform={`translate(${one.x} ${one.y}) rotate(${one.rotation || 0} ${one.width / 2} ${one.height / 2})`}
              >
                {(["n", "e", "s", "w"] as const).map((h) => (
                  <rect
                    key={`edge-${h}`}
                    data-handle={h}
                    x={
                      h === "e"
                        ? one.width - 4 / camera.zoom
                        : h === "w"
                          ? -4 / camera.zoom
                          : 10 / camera.zoom
                    }
                    y={
                      h === "s"
                        ? one.height - 4 / camera.zoom
                        : h === "n"
                          ? -4 / camera.zoom
                          : 10 / camera.zoom
                    }
                    width={
                      h === "e" || h === "w"
                        ? 8 / camera.zoom
                        : Math.max(0, one.width - 20 / camera.zoom)
                    }
                    height={
                      h === "n" || h === "s"
                        ? 8 / camera.zoom
                        : Math.max(0, one.height - 20 / camera.zoom)
                    }
                    fill="transparent"
                    style={{
                      cursor: `${h === "e" || h === "w" ? "ew" : "ns"}-resize`,
                    }}
                  />
                ))}
                {(["nw", "ne", "sw", "se"] as const).map((h) => (
                  <rect
                    key={h}
                    data-handle={h}
                    x={(h.includes("e") ? one.width : 0) - 5 / camera.zoom}
                    y={(h.includes("s") ? one.height : 0) - 5 / camera.zoom}
                    width={10 / camera.zoom}
                    height={10 / camera.zoom}
                    rx={1 / camera.zoom}
                    fill="white"
                    stroke="#0d99ff"
                    strokeWidth={1 / camera.zoom}
                    style={{ cursor: `${h}-resize` }}
                  />
                ))}
                {RADIUS_TYPES.includes(one.type) &&
                  (() => {
                    const r = Math.min(
                      one.radius ?? defaultRadius(one),
                      one.width / 2,
                      one.height / 2,
                    );
                    // Sitting exactly at 0 would hide this dot right behind
                    // the resize-corner square; keep it visibly inset even
                    // on a perfectly square corner, like Figma's own handle.
                    const inset = Math.min(
                      Math.max(r, 14 / camera.zoom),
                      one.width / 2,
                      one.height / 2,
                    );
                    return (["nw", "ne", "sw", "se"] as const).map((c) => (
                      <circle
                        key={`radius-${c}`}
                        data-handle={`radius-${c}`}
                        cx={c.includes("e") ? one.width - inset : inset}
                        cy={c.includes("s") ? one.height - inset : inset}
                        r={4 / camera.zoom}
                        fill="white"
                        stroke="#0d99ff"
                        strokeWidth={1.5 / camera.zoom}
                        style={{ cursor: "pointer" }}
                      />
                    ));
                  })()}
                {!["table", "section"].includes(one.type) && (
                  <>
                    <line
                      x1={one.width / 2}
                      x2={one.width / 2}
                      y1="0"
                      y2={-47 / camera.zoom}
                      stroke="#0d99ff"
                      strokeWidth={1 / camera.zoom}
                    />
                    <circle
                      data-handle="rotate"
                      cx={one.width / 2}
                      cy={-50 / camera.zoom}
                      r={5 / camera.zoom}
                      fill="white"
                      stroke="#0d99ff"
                      strokeWidth={1 / camera.zoom}
                      style={{ cursor: "grab" }}
                    />
                  </>
                )}
              </g>
            )}
          {handleObject &&
            canEdit &&
            !handleObject.locked &&
            !["connector", "pen", "section", "text", "table", "stamp"].includes(
              handleObject.type,
            ) && (
              <g className="quick-connect-handles">
                {ANCHORS.map((side) => {
                  const p = shapeAnchorPoint(handleObject, side),
                    center = {
                      x: handleObject.x + handleObject.width / 2,
                      y: handleObject.y + handleObject.height / 2,
                    },
                    d = Math.hypot(p.x - center.x, p.y - center.y) || 1,
                    x = p.x + (((p.x - center.x) / d) * 20) / camera.zoom,
                    y = p.y + (((p.y - center.y) / d) * 20) / camera.zoom;
                  return (
                    <g
                      key={side}
                      data-connector-anchor={side}
                      data-connector-object={handleObject.id}
                      role="button"
                      aria-label={`Connect from ${side}`}
                      tabIndex={0}
                      transform={`translate(${x} ${y}) scale(${1 / camera.zoom})`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          quickConnect(handleObject, side);
                        }
                      }}
                    >
                      <circle
                        className="connector-handle-hit"
                        r="15"
                        fill="transparent"
                      />
                      <circle
                        className="connector-handle-ring"
                        r="8"
                        fill="white"
                        stroke="#7655df"
                        strokeWidth="1.7"
                      />
                      <path
                        d="M -3.5 0 H 3.5 M 0 -3.5 V 3.5"
                        stroke="#7655df"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
              </g>
            )}
          {one &&
            one.type === "connector" &&
            canEdit &&
            !one.locked &&
            connectorPoints(one, allObjects).map((p, i) => (
              <circle
                key={i}
                data-handle={`endpoint-${i ? "to" : "from"}`}
                cx={p.x}
                cy={p.y}
                r={6 / camera.zoom}
                fill="white"
                stroke="#0d99ff"
                strokeWidth={2 / camera.zoom}
                style={{ cursor: "crosshair" }}
              />
            ))}
          {one &&
            one.type === "connector" &&
            one.routing === "curve" &&
            canEdit &&
            !one.locked &&
            (() => {
              const [a, b] = connectorPoints(one, allObjects);
              const bend = curveBendPoint(a, b, one.curveOffset ?? 60);
              return (
                <circle
                  data-handle="bend"
                  cx={bend.x}
                  cy={bend.y}
                  r={6 / camera.zoom}
                  fill="#0d99ff"
                  stroke="white"
                  strokeWidth={2 / camera.zoom}
                  style={{ cursor: "grab" }}
                />
              );
            })()}
          {selectedObjects.length > 1 && selectionBox && (
            <rect
              x={selectionBox.x - 4 / camera.zoom}
              y={selectionBox.y - 4 / camera.zoom}
              width={selectionBox.width + 8 / camera.zoom}
              height={selectionBox.height + 8 / camera.zoom}
              fill="none"
              stroke="#0d99ff"
              strokeWidth={1 / camera.zoom}
              strokeDasharray={`${4 / camera.zoom} ${3 / camera.zoom}`}
              pointerEvents="none"
            />
          )}
          {threads
            .filter((t) => !t.parent_id && !t.resolved)
            .map((t, i) => {
              const o = allObjects.find((o) => o.id === t.object_id);
              if ((o?.pageId || t.page_id) !== pageId) return null;
              const x = o ? o.x + o.width : t.x,
                y = o ? o.y : t.y;
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return (
                <g
                  key={t.id}
                  transform={`translate(${x} ${y}) scale(${1 / camera.zoom})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setPanel("comments");
                    if (o) setSelected([o.id]);
                  }}
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label={`Comment ${i + 1}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setPanel("comments");
                  }}
                >
                  <circle
                    r="14"
                    fill="#8055d7"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <text y="4" textAnchor="middle" fill="white" fontSize="11">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          {peerList.map(
            (peer: any) =>
              peer.pageId === pageId &&
              peer.user?.id !== user.id && (
                <g key={peer.user?.id} pointerEvents="none">
                  {(peer.selected || []).map((id: string) => {
                    const o = allObjects.find((v) => v.id === id);
                    return o ? (
                      <rect
                        key={id}
                        x={o.x - 3 / camera.zoom}
                        y={o.y - 3 / camera.zoom}
                        width={o.width + 6 / camera.zoom}
                        height={o.height + 6 / camera.zoom}
                        fill="none"
                        stroke={peer.user?.color || "#dc8d46"}
                        strokeWidth={2 / camera.zoom}
                      />
                    ) : null;
                  })}
                  {Number.isFinite(peer.x) && Number.isFinite(peer.y) && (
                    <g
                      transform={`translate(${peer.x} ${peer.y}) scale(${1 / camera.zoom})`}
                    >
                      <path
                        d="M0 0 L0 20 L6 15 L11 24 L15 22 L10 14 L18 13Z"
                        fill={peer.user?.color || "#dc8d46"}
                        stroke="white"
                        strokeWidth="1.5"
                      />
                      <rect
                        x="17"
                        y="20"
                        width={Math.min(
                          180,
                          (peer.user?.name?.length || 5) * 7 + 20,
                        )}
                        height="25"
                        rx="6"
                        fill={peer.user?.color || "#dc8d46"}
                      />
                      <text
                        x="26"
                        y="37"
                        fill="white"
                        fontSize="12"
                        fontWeight="600"
                      >
                        {peer.user?.name}
                      </text>
                      {peer.chat && Date.now() - peer.chat.at < 8000 && (
                        <g>
                          <rect
                            x="17"
                            y="50"
                            width={Math.min(
                              380,
                              peer.chat.text.length * 7 + 20,
                            )}
                            height="30"
                            rx="8"
                            fill="#292637"
                          />
                          <text x="26" y="70" fill="white" fontSize="13">
                            {peer.chat.text}
                          </text>
                        </g>
                      )}
                      {peer.reaction &&
                        Date.now() - peer.reaction.at < 5000 && (
                          <text x="-5" y="-15" fontSize="36">
                            {peer.reaction.emoji}
                          </text>
                        )}
                    </g>
                  )}
                </g>
              ),
          )}
        </g>
      </svg>
      <div className="canvas-scrollbar canvas-scrollbar-x" aria-hidden="true">
        <div
          className="canvas-scrollbar-thumb"
          style={{
            left: `${scrollbar.left * 100}%`,
            width: `${scrollbar.thumbW * 100}%`,
          }}
        />
      </div>
      <div className="canvas-scrollbar canvas-scrollbar-y" aria-hidden="true">
        <div
          className="canvas-scrollbar-thumb"
          style={{
            top: `${scrollbar.top * 100}%`,
            height: `${scrollbar.thumbH * 100}%`,
          }}
        />
      </div>
      {editingObject && (
        <div className="text-edit-overlay" style={editPos as CSSProperties}>
          <EditableText
            o={editingObject}
            onChange={(value) => {
              setText(editingObject.id, value);
              if (
                editingObject.type === "text" &&
                editingObject.autoWidth !== false
              ) {
                // Free-standing text has no container: hug it tightly, on
                // both axes, exactly like Figma's auto-width text. A box the
                // user explicitly dragged out (autoWidth===false) keeps its
                // fixed width and wraps instead, falling through below.
                const { width, height } = measureFreeText(
                  value,
                  editingObject.fontSize || 20,
                  editingObject.bold,
                  editingObject.italic,
                );
                updateObject(editingObject.id, {
                  width: Math.max(20, Math.ceil(width) + 6),
                  height: Math.max(24, Math.ceil(height) + 4),
                });
                return;
              }
              const lines = value
                .split("\n")
                .reduce(
                  (n, line) =>
                    n +
                    Math.max(
                      1,
                      Math.ceil(
                        line.length /
                          Math.max(
                            1,
                            (editingObject.width - 36) /
                              ((editingObject.fontSize || 20) * 0.55),
                          ),
                      ),
                    ),
                  0,
                );
              const required =
                lines * (editingObject.fontSize || 20) * 1.38 + 40;
              if (required > editingObject.height)
                updateObject(editingObject.id, { height: required });
            }}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
      <header className="editor-topbar">
        <div className="board-heading">
          <IconButton label="Back to project" onClick={onBack}>
            <ArrowLeft size={18} />
          </IconButton>
          <div className="editor-brand" aria-label="CanvasLab">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="board-title-block">
            <div className="board-title-row">
              {renamingBoard ? (
                <input
                  className="board-name board-name-input"
                  aria-label="Board name"
                  autoFocus
                  value={boardNameDraft}
                  maxLength={160}
                  onChange={(e) => setBoardNameDraft(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => commitBoardName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitBoardName(e.currentTarget.value);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenamingBoard(false);
                    }
                  }}
                />
              ) : (
                <button
                  className="board-name"
                  onClick={renameBoard}
                  onDoubleClick={renameBoard}
                  disabled={!canEdit}
                >
                  {board?.name || "Opening board…"}
                </button>
              )}
              <IconButton
                label="Board menu"
                onClick={() => setMenu(menu === "board" ? null : "board")}
              >
                <ChevronDown size={14} />
              </IconButton>
            </div>
            <div className="board-navigation-row">
              <button
                className="page-switcher"
                aria-label="Switch page"
                aria-expanded={pageMenu}
                onClick={() => {
                  setPageMenu(!pageMenu);
                  setMenu(null);
                }}
              >
                <Frame size={13} />
                <span>{page?.name || "Page 1"}</span>
                <ChevronDown size={12} />
              </button>
              <span className="navigation-divider" />
              <IconButton
                label="Pages and outline"
                active={outline}
                onClick={() => setOutline(!outline)}
              >
                <PanelLeft size={15} />
              </IconButton>
              <button
                className="board-breadcrumb"
                title={`${board?.workspace_name || "Workspace"} / ${board?.project_name || "Project"}`}
                onClick={onBack}
              >
                {board?.project_name || "Project"}
              </button>
            </div>
          </div>
          <div className="save-status" title={status}>
            <span>
              {status === "Saved" ? (
                <Cloud size={14} />
              ) : status.startsWith("Offline") ? (
                <CloudOff size={14} />
              ) : (
                <LoaderCircle size={14} className="spinning" />
              )}
            </span>
            {status === "Saved" ? "All changes saved" : status}
          </div>
        </div>
        <div className="editor-collaboration">
          <div className="collaborator-avatars">
            <button
              className={`avatar-self ${spotlighting ? "is-spotlighting" : ""}`}
              style={{ background: user.color || "#8970b5" }}
              title={`${user.name} (you)`}
              aria-label="Your presence menu"
              aria-expanded={spotlightMenu}
              onClick={() => setSpotlightMenu((v) => !v)}
            >
              {user.name?.slice(0, 1).toUpperCase()}
            </button>
            {peerList
              .filter((p: any) => p.user?.id !== user.id)
              .slice(0, 4)
              .map((p: any) => (
                <button
                  key={p.user?.id}
                  style={{ background: p.user?.color || "#cd9260" }}
                  title={`Follow ${p.user?.name}`}
                  onClick={() =>
                    setFollow(follow === p.user?.id ? null : p.user?.id)
                  }
                >
                  {p.user?.name?.slice(0, 1).toUpperCase()}
                </button>
              ))}
          </div>
          <IconButton
            label="Workshop tools"
            active={panel === "workshop"}
            onClick={() => setPanel(panel === "workshop" ? null : "workshop")}
          >
            <Timer size={19} />
          </IconButton>
          <IconButton
            label="Comments"
            active={panel === "comments"}
            onClick={() => setPanel(panel === "comments" ? null : "comments")}
          >
            <MessageCircle size={19} />
          </IconButton>
          <button className="editor-share" onClick={() => setPanel("share")}>
            <Share2 size={15} />
            Share
          </button>
        </div>
      </header>
      {spotlightMenu && (
        <div className="editor-popover presence-menu" role="menu">
          <div className="presence-menu-self">
            <span
              className="avatar-self"
              style={{ background: user.color || "#8970b5" }}
            >
              {user.name?.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>You</span>
            </div>
          </div>
          <button
            className={spotlighting ? "danger" : ""}
            onClick={() => {
              setSpotlighting((v) => !v);
              setSpotlightMenu(false);
            }}
          >
            <Radio size={16} />
            {spotlighting ? "Stop spotlighting" : "Spotlight me"}
          </button>
          {peerList.filter((p: any) => p.user?.id !== user.id).length > 0 && (
            <>
              <span className="menu-heading">Viewing now</span>
              {peerList
                .filter((p: any) => p.user?.id !== user.id)
                .map((p: any) => (
                  <button
                    key={p.user?.id}
                    onClick={() => {
                      setFollow(follow === p.user?.id ? null : p.user?.id);
                      setSpotlightMenu(false);
                    }}
                  >
                    <span
                      className="avatar-self"
                      style={{ background: p.user?.color || "#cd9260" }}
                    >
                      {p.user?.name?.slice(0, 1).toUpperCase()}
                    </span>
                    {p.user?.name}
                    <span>{follow === p.user?.id ? "Following" : ""}</span>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
      {menu === "board" && (
        <div className="editor-popover board-menu" role="menu">
          <button
            onClick={() => {
              renameBoard();
              setMenu(null);
            }}
            disabled={!canEdit}
          >
            <Type size={16} />
            Rename board
          </button>
          <button
            onClick={() => {
              setPanel("versions");
              setMenu(null);
            }}
          >
            <History size={16} />
            Version history
          </button>
          <div className="menu-separator" />
          <span className="menu-heading">
            Export {selected.length ? "selection" : "current page"}
          </span>
          <button onClick={() => doExport("png")}>
            <Download size={16} />
            PNG image
          </button>
          <button onClick={() => doExport("svg")}>
            <Download size={16} />
            SVG vector
          </button>
          <button onClick={editableExport}>
            <Download size={16} />
            Editable .canvaslab
          </button>
          <div className="menu-separator" />
          <button
            onClick={() => {
              setSnap(!snap);
              setMenu(null);
            }}
          >
            <Check size={16} style={{ opacity: snap ? 1 : 0 }} />
            Snap to grid
          </button>
          <button
            onClick={() => {
              setMenu("help");
            }}
          >
            <Keyboard size={16} />
            Keyboard shortcuts
          </button>
        </div>
      )}
      {pageMenu && (
        <div
          className="editor-popover page-switch-menu"
          role="menu"
          aria-label="Board pages"
        >
          <div className="panel-heading">
            <strong>Pages</strong>
            {canEdit && (
              <IconButton
                label="Create page"
                onClick={() => {
                  addPage();
                  setPageMenu(false);
                }}
              >
                <Plus size={17} />
              </IconButton>
            )}
          </div>
          {pages.map((p) => (
            <button
              key={p.id}
              className={p.id === pageId ? "current" : ""}
              role="menuitem"
              onClick={() => switchPage(p.id)}
            >
              <Frame size={15} />
              <span>{p.name}</span>
              {p.id === pageId && <Check size={15} />}
            </button>
          ))}
          <div className="menu-separator" />
          <button
            onClick={() => {
              setPageMenu(false);
              setOutline(true);
            }}
          >
            <PanelLeft size={15} />
            Pages & outline
          </button>
        </div>
      )}
      {outline && (
        <aside className="editor-panel outline-panel">
          <div className="panel-heading">
            <strong>Pages & outline</strong>
            <IconButton label="Close outline" onClick={() => setOutline(false)}>
              <X size={17} />
            </IconButton>
          </div>
          <div className="outline-search">
            <Search size={15} />
            <input
              id="board-search"
              placeholder="Find on this board…"
              aria-label="Search objects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="outline-section-heading">
            PAGES
            {canEdit && (
              <IconButton label="Add page" onClick={addPage}>
                <Plus size={16} />
              </IconButton>
            )}
          </div>
          <div className="pages-list">
            {pages.map((p) => (
              <div
                className={`page-row ${p.id === pageId ? "current" : ""}`}
                key={p.id}
              >
                <button
                  onClick={() => {
                    setPageId(p.id);
                    setSelected([]);
                    setEditing(null);
                    setFollow(null);
                  }}
                  onDoubleClick={() => renamePage(p.id)}
                >
                  <Frame size={15} />
                  <span>{p.name}</span>
                </button>
                {canEdit && (
                  <div className="page-actions">
                    <button
                      title="Move page up"
                      aria-label={`Move ${p.name} up`}
                      onClick={() => movePage(p.id, -1)}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      title="Move page down"
                      aria-label={`Move ${p.name} down`}
                      onClick={() => movePage(p.id, 1)}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      title="Rename page"
                      aria-label={`Rename ${p.name}`}
                      onClick={() => renamePage(p.id)}
                    >
                      <Type size={12} />
                    </button>
                    <button
                      title="Duplicate page"
                      aria-label={`Duplicate ${p.name}`}
                      onClick={() => copyPage(p.id)}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      title="Delete page"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => removePage(p.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="outline-section-heading">
            {search ? "SEARCH RESULTS" : "OBJECTS"}
            <span>{searchResults.length}</span>
          </div>
          <div className="object-outline">
            {searchResults.map((o) => (
              <button
                key={o.id}
                className={selected.includes(o.id) ? "current" : ""}
                onClick={() => navigate(o.id)}
              >
                <span>
                  {o.type === "section" ? (
                    <Frame size={14} />
                  ) : o.type === "sticky" ? (
                    <StickyNote size={14} />
                  ) : o.type === "connector" ? (
                    <ArrowUpRight size={14} />
                  ) : o.type === "table" ? (
                    <Table2 size={14} />
                  ) : (
                    <Square size={14} />
                  )}
                </span>
                <span>
                  {o.text?.trim() ||
                    o.type.charAt(0).toUpperCase() + o.type.slice(1)}
                </span>
                {o.locked && <Lock size={12} />}
              </button>
            ))}
            {!searchResults.length && (
              <p className="outline-empty">
                {search
                  ? "No matching objects."
                  : "Your ideas will appear here."}
              </p>
            )}
          </div>
        </aside>
      )}
      {selectedObjects.length > 0 && canEdit && !editing && (
        <div
          className="context-style"
          style={{
            left: Math.max(
              outline ? 280 : 18,
              Math.min(
                size.width - 560,
                selectionBox
                  ? camera.x +
                      (selectionBox.x + selectionBox.width / 2) * camera.zoom -
                      200
                  : size.width / 2 - 200,
              ),
            ),
            top: Math.max(
              122,
              Math.min(
                size.height - 195,
                selectionBox
                  ? camera.y + selectionBox.y * camera.zoom - 70
                  : 122,
              ),
            ),
          }}
        >
          <div className="color-options">
            {COLORS.slice(0, 6).map((color) => (
              <button
                key={color}
                title={`Fill ${color}`}
                aria-label={`Fill ${color}`}
                className={one?.fill === color ? "picked" : ""}
                style={{ background: color }}
                onClick={() => {
                  setFill(color);
                  patchSelected({ fill: color });
                }}
              />
            ))}
          </div>
          <label className="custom-color" title="Custom fill">
            <input
              type="color"
              aria-label="Custom fill color"
              value={/^#[0-9a-f]{6}$/i.test(one?.fill || "") ? one!.fill : fill}
              onChange={(e) => {
                setFill(e.target.value);
                patchSelected({ fill: e.target.value });
              }}
            />
            <span>+</span>
          </label>
          <IconButton
            label="More colors"
            active={menu === "palette"}
            onClick={() => setMenu(menu === "palette" ? null : "palette")}
          >
            <ChevronDown size={13} />
          </IconButton>
          <span className="toolbar-divider" />
          <select
            aria-label="Font size"
            value={one?.fontSize || 20}
            onChange={(e) => patchSelected({ fontSize: +e.target.value })}
          >
            {[12, 14, 16, 20, 24, 28, 32, 40, 48, 64].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <IconButton
            label="Bold"
            active={!!one?.bold}
            onClick={() => patchSelected({ bold: !one?.bold })}
          >
            <Bold size={16} />
          </IconButton>
          <IconButton
            label="Italic"
            active={!!one?.italic}
            onClick={() => patchSelected({ italic: !one?.italic })}
          >
            <Italic size={16} />
          </IconButton>
          <IconButton
            label="Text alignment"
            onClick={() =>
              patchSelected({
                align:
                  one?.align === "left"
                    ? "center"
                    : one?.align === "center"
                      ? "right"
                      : "left",
              })
            }
          >
            {one?.align === "left" ? (
              <AlignLeft size={16} />
            ) : one?.align === "right" ? (
              <AlignRight size={16} />
            ) : (
              <AlignCenter size={16} />
            )}
          </IconButton>
          {one && RADIUS_TYPES.includes(one.type) && (
            <>
              <span className="toolbar-divider" />
              <label className="corner-radius-field" title="Corner radius">
                <SquareRoundCorner size={15} />
                <input
                  type="number"
                  aria-label="Corner radius"
                  min={0}
                  max={Math.floor(Math.min(one.width, one.height) / 2)}
                  value={Math.round(one.radius ?? defaultRadius(one))}
                  onChange={(e) =>
                    patchSelected({ radius: Math.max(0, +e.target.value) })
                  }
                />
              </label>
            </>
          )}
          <span className="toolbar-divider" />
          <button
            type="button"
            title="More object options"
            aria-label="More object options"
            aria-pressed={menu === "more"}
            className={`editor-icon ${menu === "more" ? "is-active" : ""}`}
            onClick={(e) => {
              if (menu === "more") {
                setMenu(null);
                return;
              }
              const r = e.currentTarget.getBoundingClientRect(),
                root = rootRef.current!.getBoundingClientRect();
              setMoreMenuPos({
                x: Math.min(r.left - root.left, size.width - 250),
                y: Math.min(r.bottom - root.top + 6, size.height - 340),
              });
              setMenu("more");
            }}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      )}
      {menu === "palette" && (
        <div className="editor-popover color-palette-menu">
          <div className="color-palette-grid">
            {FIGMA_PALETTE.map((color, i) => (
              <button
                key={`${color}-${i}`}
                title={`Fill ${color}`}
                aria-label={`Fill ${color}`}
                className={one?.fill === color ? "picked" : ""}
                style={{ background: color }}
                onClick={() => {
                  setFill(color);
                  patchSelected({ fill: color });
                  setMenu(null);
                }}
              />
            ))}
            <label
              className="custom-color palette-custom-color"
              title="Custom color"
            >
              <input
                type="color"
                aria-label="Custom fill color"
                value={
                  /^#[0-9a-f]{6}$/i.test(one?.fill || "") ? one!.fill : fill
                }
                onChange={(e) => {
                  setFill(e.target.value);
                  patchSelected({ fill: e.target.value });
                }}
              />
              <span />
            </label>
          </div>
        </div>
      )}
      {menu === "more" && (
        <div
          className="editor-popover object-options"
          style={
            moreMenuPos
              ? { left: moreMenuPos.x, top: moreMenuPos.y, right: "auto" }
              : undefined
          }
        >
          <div className="panel-heading">
            <strong>Object properties</strong>
            <IconButton label="Close properties" onClick={() => setMenu(null)}>
              <X size={15} />
            </IconButton>
          </div>
          <label className="property-row">
            Stroke
            <input
              type="color"
              value={one?.stroke?.startsWith("#") ? one.stroke : "#b3b3b3"}
              onChange={(e) => {
                setStroke(e.target.value);
                patchSelected({ stroke: e.target.value });
              }}
            />
            <select
              aria-label="Stroke width"
              value={one?.strokeWidth || 0}
              onChange={(e) => patchSelected({ strokeWidth: +e.target.value })}
            >
              {[0, 1, 2, 3, 5, 8, 12].map((v) => (
                <option key={v} value={v}>
                  {v} px
                </option>
              ))}
            </select>
          </label>
          <label className="property-row">
            Opacity
            <input
              type="range"
              min="10"
              max="100"
              value={(one?.opacity ?? 1) * 100}
              onChange={(e) =>
                patchSelected({ opacity: +e.target.value / 100 })
              }
            />
          </label>
          <button
            onClick={() =>
              patchSelected({ dashed: !(one as any)?.dashed } as any)
            }
          >
            <ArrowRight size={16} />
            Toggle dashed line
          </button>
          {one?.type === "connector" && (
            <>
              <button
                onClick={() =>
                  patchSelected({
                    routing:
                      one.routing === "elbow"
                        ? "straight"
                        : one.routing === "curve"
                          ? "elbow"
                          : "curve",
                    curveOffset:
                      one.routing === "straight"
                        ? (one.curveOffset ?? 60)
                        : one.curveOffset,
                  })
                }
              >
                <GitBranch size={16} />
                {one.routing === "elbow"
                  ? "Straight connector"
                  : one.routing === "curve"
                    ? "Elbow connector"
                    : "Curved connector"}
              </button>
              {one.routing === "curve" && (
                <label className="property-row">
                  Curviness
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={one.curveOffset ?? 60}
                    onChange={(e) =>
                      patchSelected({ curveOffset: +e.target.value })
                    }
                  />
                </label>
              )}
              <button onClick={() => editObject(one.id)}>
                <Type size={16} />
                Edit connector label
              </button>
              <button
                onClick={() =>
                  patchSelected({ arrow: (one as any).arrow === false } as any)
                }
              >
                <ArrowUpRight size={16} />
                Toggle arrowhead
              </button>
            </>
          )}
          {one?.type === "sticky" && (
            <button
              onClick={() =>
                patchSelected({ showAuthor: !(one as any).showAuthor } as any)
              }
            >
              <Type size={16} />
              Toggle author name
            </button>
          )}
          {one?.type === "section" && (
            <>
              <button
                onClick={() => {
                  editObject(one.id);
                  setMenu(null);
                }}
              >
                <Type size={16} />
                Rename frame
              </button>
              <button
                onClick={() => {
                  fitFrameToContent(one.id);
                  setMenu(null);
                }}
              >
                <Maximize size={16} />
                Resize to fit content
              </button>
            </>
          )}
          <button
            onClick={() => {
              const link = prompt(
                "Link URL (https://)",
                (one as any)?.link || "https://",
              );
              if (link === null) return;
              if (link && !/^https?:\/\//i.test(link)) {
                setError("Links must start with https:// or http://.");
                return;
              }
              patchSelected({ link } as any);
            }}
          >
            <LinkIcon size={16} />
            Add or edit hyperlink
          </button>
          <div className="menu-separator" />
          <button
            onClick={() => {
              duplicate();
              setMenu(null);
            }}
          >
            <Copy size={16} />
            Duplicate<span>⌘D</span>
          </button>
          <button
            onClick={() => {
              if (canEdit)
                mutate(() =>
                  selectedObjects.forEach((o) =>
                    updateObject(o.id, { locked: !o.locked }),
                  ),
                );
              setMenu(null);
            }}
          >
            {one?.locked ? <Unlock size={16} /> : <Lock size={16} />}Lock /
            unlock
          </button>
          <button onClick={() => patchSelected({ order: Date.now() })}>
            <Layers size={16} />
            Bring to front
          </button>
          <button onClick={() => patchSelected({ order: -Date.now() })}>
            <Layers size={16} />
            Send to back
          </button>
          {selectedObjects.length > 1 && (
            <>
              <button onClick={group}>
                <Group size={16} />
                Group / ungroup<span>⌘G</span>
              </button>
              <button onClick={() => arrange("left")}>
                <AlignLeft size={16} />
                Align left
              </button>
              <button onClick={() => arrange("center")}>
                <AlignCenter size={16} />
                Align centers
              </button>
              <button onClick={() => arrange("top")}>
                <ArrowUp size={16} />
                Align top
              </button>
              <button onClick={() => arrange("distribute-x")}>
                <Columns3 size={16} />
                Distribute horizontally
              </button>
              <button onClick={() => arrange("distribute-y")}>
                <Rows3 size={16} />
                Distribute vertically
              </button>
              <button onClick={() => arrange("tidy")}>
                <Table2 size={16} />
                Tidy up
              </button>
            </>
          )}
          <button
            onClick={() => {
              remove();
              setMenu(null);
            }}
            className="danger"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}
      {one?.type === "table" && canEdit && (
        <div className="table-controls">
          <button onClick={() => tableAction("add-row")}>
            <Plus size={14} />
            Row
          </button>
          <button onClick={() => tableAction("add-col")}>
            <Plus size={14} />
            Column
          </button>
          <button onClick={() => tableAction("remove-row")}>
            <Minus size={14} />
            Row
          </button>
          <button onClick={() => tableAction("remove-col")}>
            <Minus size={14} />
            Column
          </button>
          <button
            onClick={() =>
              download(
                new Blob([encodeCSV(one.cells || [])], {
                  type: "text/csv;charset=utf-8",
                }),
                "table.csv",
              )
            }
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      )}
      {!pageObjects.length && status !== "connecting" && (
        <div className="empty-canvas-hint">
          <div className="hint-star">✳</div>
          <h2>A little space for big ideas.</h2>
          <p>Pick a sticky note to start, or double-click anywhere.</p>
          <span>
            Press <kbd>S</kbd> for a sticky · <kbd>T</kbd> for text
          </span>
        </div>
      )}
      {pendingConnector && (
        <div className="canvas-mode-notice">
          Click another object or an empty spot to connect.{" "}
          <button
            onClick={() => {
              setPendingConnector(null);
              setTool("select");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {spotlighting && (
        <div className="canvas-mode-notice">
          <Radio size={13} />
          Spotlighting your view for everyone
          <button onClick={() => setSpotlighting(false)}>Stop</button>
        </div>
      )}
      {follow &&
        (() => {
          const followed = peerList.find(
            (p: any) => p.user?.id === follow,
          ) as any;
          const isSpotlight = !!followed?.spotlight;
          return (
            <div className="canvas-mode-notice">
              {isSpotlight ? (
                <Radio size={13} />
              ) : null}
              Following {followed?.user?.name}
              {isSpotlight ? "'s spotlight" : ""}
              <button
                onClick={() => {
                  if (isSpotlight) setDismissedSpotlight(follow);
                  setFollow(null);
                }}
              >
                Stop following
              </button>
            </div>
          );
        })()}
      {!canEdit && board && role && (
        <div className="permission-badge">
          <Lock size={13} />
          {role === "commenter" ? "Can comment" : "View only"}
        </div>
      )}
      <div className="editor-bottom">
        <div className="history-controls">
          <IconButton label="Undo (⌘Z)" onClick={undo} disabled={!canEdit}>
            <Undo2 size={18} />
          </IconButton>
          <IconButton label="Redo (⌘⇧Z)" onClick={redo} disabled={!canEdit}>
            <Redo2 size={18} />
          </IconButton>
        </div>
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Canvas tools"
        >
          <IconButton
            label="Select (V)"
            active={tool === "select"}
            onClick={() => {
              setTool("select");
              setPendingConnector(null);
            }}
          >
            <MousePointer2 size={22} />
          </IconButton>
          <IconButton
            label="Hand (H / Space)"
            active={tool === "hand"}
            onClick={() => setTool("hand")}
          >
            <Hand size={22} />
          </IconButton>
          <span className="toolbar-divider" />
          <DragToolButton
            label="Sticky note (S)"
            {...toolDragProps("sticky")}
            active={tool === "sticky"}
            disabled={!canEdit}
            onClick={() => setTool("sticky")}
          >
            <span className="sticky-tool-icon">
              <StickyNote size={23} />
            </span>
          </DragToolButton>
          <DragToolButton
            label="Shapes"
            {...toolDragProps("rounded")}
            active={SHAPES.some(([t]) => t === tool) || menu === "shapes"}
            disabled={!canEdit}
            onClick={() => setMenu(menu === "shapes" ? null : "shapes")}
          >
            <span className="shape-tool-icon">
              <Square size={20} />
              <Circle size={12} />
            </span>
          </DragToolButton>
          <IconButton
            label="Connector (L)"
            active={tool === "connector"}
            disabled={!canEdit}
            onClick={() => setTool("connector")}
          >
            <MoveUpRight size={24} />
          </IconButton>
          <DragToolButton
            label="Text (T)"
            {...toolDragProps("text")}
            active={tool === "text"}
            disabled={!canEdit}
            onClick={() => setTool("text")}
          >
            <Type size={24} />
          </DragToolButton>
          <IconButton
            label="Pen (P)"
            active={tool === "pen"}
            disabled={!canEdit}
            onClick={() => setTool("pen")}
          >
            <Pencil size={23} />
          </IconButton>
          <DragToolButton
            label="Section"
            {...toolDragProps("section")}
            active={tool === "section"}
            disabled={!canEdit}
            onClick={() => setTool("section")}
          >
            <span className="frame-tool-icon">
              <Frame size={29} />
            </span>
          </DragToolButton>
          <span className="toolbar-divider" />
          <IconButton
            label="More tools"
            active={menu === "emoji"}
            onClick={() => setMenu(menu === "emoji" ? null : "emoji")}
          >
            <Plus size={24} />
          </IconButton>
        </div>
        <div className="zoom-control">
          <IconButton
            label="Zoom out"
            onClick={() => zoomTo(cameraTarget.current.zoom / 1.2)}
          >
            <Minus size={15} />
          </IconButton>
          <button
            className="zoom-value"
            title="Reset to 100% (0)"
            onClick={() => zoomTo(1)}
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            onClick={() => zoomTo(cameraTarget.current.zoom * 1.2)}
          >
            <Plus size={15} />
          </IconButton>
          <span className="toolbar-divider" />
          <IconButton
            label="Fit to content (1) · Shift click selection"
            onClick={() => fit(selected.length ? selectedObjects : pageObjects)}
          >
            <Maximize size={17} />
          </IconButton>
        </div>
      </div>
      {["pen", "highlighter", "sticky", "stamp"].includes(tool) && (
        <div className="tool-settings">
          {tool === "stamp" ? (
            ["👍", "❤️", "⭐", "✅", "🔥", "🎉", "❓", "💡"].map((e) => (
              <button
                className={stamp === e ? "is-active" : ""}
                key={e}
                onClick={() => setStamp(e)}
              >
                {e}
              </button>
            ))
          ) : (
            <>
              <div className="color-options">
                {COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    aria-label={`Tool color ${c}`}
                    style={{ background: c }}
                    className={fill === c ? "picked" : ""}
                    onClick={() => {
                      setFill(c);
                      if (tool === "pen") setStroke(c);
                    }}
                  />
                ))}
              </div>
              {tool !== "sticky" && (
                <>
                  <input
                    type="color"
                    aria-label="Drawing color"
                    value={stroke}
                    onChange={(e) => {
                      setStroke(e.target.value);
                      if (tool === "highlighter") setFill(e.target.value);
                    }}
                  />
                  <input
                    type="range"
                    aria-label="Pen thickness"
                    min="1"
                    max="16"
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(+e.target.value)}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}
      {menu === "shapes" && (
        <div className="editor-popover shapes-menu">
          <span className="menu-heading">SHAPES</span>
          <div>
            {SHAPES.map(([value, label, Icon]) => (
              <DragToolButton
                key={value}
                label={label}
                {...toolDragProps(value)}
                onClick={() => {
                  setTool(value);
                  setMenu(null);
                }}
              >
                <Icon
                  size={30}
                  style={value === "rounded" ? { borderRadius: 5 } : undefined}
                />
                <span>{label}</span>
              </DragToolButton>
            ))}
          </div>
        </div>
      )}
      {menu === "emoji" && (
        <div className="editor-popover tools-menu">
          <span className="menu-heading">ADD TO YOUR BOARD</span>
          <div className="tools-grid">
            {(
              [
                ["table", "Table", Table2],
                ["mindmap", "Mind map", GitBranch],
                ["highlighter", "Highlighter", Highlighter],
                ["eraser", "Eraser", Eraser],
                ["stamp", "Stamps", Smile],
              ] as [Tool, string, typeof Square][]
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                disabled={!canEdit}
                onClick={() => {
                  setTool(value);
                  setMenu(null);
                }}
              >
                <Icon size={21} />
                {label}
              </button>
            ))}
            <button
              disabled={!canEdit}
              onClick={() => {
                imageInput.current?.click();
                setMenu(null);
              }}
            >
              <ImagePlus size={21} />
              Upload image
            </button>
            <button
              disabled={!canEdit}
              onClick={() => {
                csvInput.current?.click();
                setMenu(null);
              }}
            >
              <Table2 size={21} />
              Import CSV
            </button>
            <button
              onClick={() => {
                cursorChat();
                setMenu(null);
              }}
            >
              <MessageCircle size={21} />
              Cursor chat
            </button>
            <button
              onClick={() => {
                setMenu("help");
              }}
            >
              <Keyboard size={21} />
              Shortcuts
            </button>
          </div>
          <span className="menu-heading">SEND A REACTION</span>
          <div className="reaction-options">
            {["👍", "❤️", "👏", "🎉", "🔥", "🤔"].map((e) => (
              <button key={e} title={`React ${e}`} onClick={() => react(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      {one &&
        ["rounded", "rectangle", "ellipse", "diamond"].includes(one.type) &&
        canEdit && (
          <div className="mindmap-controls">
            <button onClick={() => mindChild()}>
              <GitBranch size={15} />
              Add child <kbd>Tab</kbd>
            </button>
            <button onClick={() => mindChild(true)}>Add sibling</button>
            <button onClick={layoutMindmap}>Auto layout</button>
          </div>
        )}
      {context && (
        <div
          className="editor-popover canvas-context"
          role="menu"
          style={{ left: context.x, top: context.y }}
        >
          {selected.length > 0 ? (
            <>
              <button
                disabled={!canEdit}
                onClick={() => {
                  duplicate();
                  setContext(null);
                }}
              >
                <Copy size={16} />
                Duplicate<span>⌘D</span>
              </button>
              <button
                onClick={() => {
                  void copy();
                  setContext(null);
                }}
              >
                <Copy size={16} />
                Copy<span>⌘C</span>
              </button>
              <button
                disabled={!canEdit}
                onClick={() => {
                  void copy(true);
                  setContext(null);
                }}
              >
                <Trash2 size={16} />
                Cut<span>⌘X</span>
              </button>
              <button
                disabled={!canEdit}
                onClick={() => {
                  mutate(() =>
                    selectedObjects.forEach((o) =>
                      updateObject(o.id, { locked: !o.locked }),
                    ),
                  );
                  setContext(null);
                }}
              >
                <Lock size={16} />
                Lock / unlock
              </button>
              <button
                disabled={!canEdit}
                onClick={() => {
                  group();
                  setContext(null);
                }}
              >
                <Group size={16} />
                Group / ungroup<span>⌘G</span>
              </button>
              <button
                disabled={!canEdit}
                onClick={() => {
                  patchSelected({ order: Date.now() });
                  setContext(null);
                }}
              >
                <Layers size={16} />
                Bring to front
              </button>
              <button
                disabled={!canEdit}
                onClick={() => {
                  patchSelected({ order: -Date.now() });
                  setContext(null);
                }}
              >
                <Layers size={16} />
                Send to back
              </button>
              <div className="menu-separator" />
              <button
                onClick={() => {
                  fit(selectedObjects);
                  setContext(null);
                }}
              >
                <Maximize size={16} />
                Fit selection<span>2</span>
              </button>
              <button
                onClick={() => {
                  setPanel("comments");
                  setContext(null);
                }}
              >
                <MessageCircle size={16} />
                Comment
              </button>
              <button
                disabled={!canEdit}
                className="danger"
                onClick={() => {
                  remove();
                  setContext(null);
                }}
              >
                <Trash2 size={16} />
                Delete<span>⌫</span>
              </button>
            </>
          ) : (
            <>
              <button
                disabled={!canEdit}
                onClick={() => {
                  create("sticky", lastCursor.current);
                  setContext(null);
                }}
              >
                <StickyNote size={16} />
                Add sticky<span>S</span>
              </button>
              <button
                disabled={!canEdit}
                onClick={() => {
                  if (clipboard.current.length) pasteObjects(clipboard.current);
                  else
                    void tryAction(async () =>
                      pasteText(
                        await navigator.clipboard.readText(),
                        lastCursor.current,
                      ),
                    );
                  setContext(null);
                }}
              >
                <Copy size={16} />
                Paste<span>⌘V</span>
              </button>
              <button
                onClick={() => {
                  fit();
                  setContext(null);
                }}
              >
                <Maximize size={16} />
                Fit to content<span>1</span>
              </button>
              <button
                onClick={() => {
                  setPanel("comments");
                  setContext(null);
                }}
              >
                <MessageCircle size={16} />
                Add comment<span>C</span>
              </button>
            </>
          )}
        </div>
      )}
      {panel && (
        <BoardPanels
          anchor={commentAnchor}
          kind={panel}
          boardId={boardId}
          user={user}
          objects={objects}
          selected={selected}
          pageId={pageId}
          camera={panelCamera}
          onNavigate={navigate}
          onClose={() => setPanel(null)}
        />
      )}
      {menu === "help" && (
        <Modal
          title="A shortcut to your next idea"
          onClose={() => setMenu(null)}
          wide
        >
          <div className="shortcut-columns">
            {[
              ["Select", "V"],
              ["Pan", "H / Space + drag"],
              ["Sticky note", "S"],
              ["Text", "T"],
              ["Pen", "P"],
              ["Connector", "L"],
              ["Comment", "C"],
              ["Duplicate", "⌘ / Ctrl + D"],
              ["Undo", "⌘ / Ctrl + Z"],
              ["Redo", "⌘ / Ctrl + Shift + Z"],
              ["Select all", "⌘ / Ctrl + A"],
              ["Group / ungroup", "⌘ / Ctrl + G"],
              ["Find in board", "⌘ / Ctrl + F"],
              ["Nudge", "Arrow keys"],
              ["Nudge 10px", "Shift + arrows"],
              ["Fit content / selection", "1 / 2"],
              ["Reset zoom", "0"],
              ["Zoom at pointer", "Ctrl + scroll"],
              ["Mind map child", "Tab"],
              ["Mind map sibling", "Shift + Enter"],
              ["Edit text", "Double-click / Enter"],
              ["Finish editing", "Esc / ⌘ + Enter"],
            ].map(([name, key]) => (
              <div key={name}>
                <span>{name}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <p>
            Paste multiple lines to create sticky notes. Paste a spreadsheet
            range to create a table.
          </p>
        </Modal>
      )}
      {error && (
        <div className="editor-toast error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {toast && !error && (
        <div className="editor-toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {status.startsWith("Access unavailable") && (
        <div className="permission-overlay">
          <Lock size={30} />
          <h2>This board is no longer available</h2>
          <p>Your access may have changed, or the board was moved to Trash.</p>
          <button className="editor-share" onClick={onBack}>
            Back to workspace
          </button>
        </div>
      )}
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        multiple
        onChange={(e) => {
          Array.from(e.target.files || []).forEach(
            (f) => void tryAction(() => uploadImage(f)),
          );
          e.target.value = "";
        }}
      />
      <input
        ref={csvInput}
        type="file"
        accept=".csv,.tsv,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void tryAction(async () => {
              if (file.size > 2 * 1024 * 1024)
                throw new Error("CSV must be 2 MB or smaller.");
              create("table", center(), { cells: parseCSV(await file.text()) });
            });
          e.target.value = "";
        }}
      />
    </div>
  );
}
