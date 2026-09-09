import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Point } from "./geometry";

/** Pointer capture makes a toolbar object follow the hand, including on touch screens. */
export function DragToolButton({
  label,
  children,
  active,
  disabled,
  className = "",
  onClick,
  onPreview,
  onDrop,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  onPreview: (point: Point | null) => void;
  onDrop: (point: Point) => void;
}) {
  const origin = useRef<Point | null>(null),
    dragged = useRef(false),
    suppressClick = useRef(false);
  const [lifting, setLifting] = useState(false);
  return (
    <button
      type="button"
      title={`${label} · click or drag onto the canvas`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`editor-icon drag-tool ${active ? "is-active" : ""} ${lifting ? "is-lifting" : ""} ${className}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        origin.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
        suppressClick.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const p = { x: e.clientX, y: e.clientY };
        if (
          !dragged.current &&
          Math.hypot(p.x - origin.current.x, p.y - origin.current.y) < 5
        )
          return;
        dragged.current = true;
        setLifting(true);
        onPreview(p);
      }}
      onPointerUp={(e) => {
        if (!origin.current) return;
        origin.current = null;
        if (dragged.current) {
          suppressClick.current = true;
          onPreview(null);
          onDrop({ x: e.clientX, y: e.clientY });
        }
        setLifting(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        origin.current = null;
        dragged.current = false;
        suppressClick.current = true;
        setLifting(false);
        onPreview(null);
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onClick();
      }}
    >
      {children}
    </button>
  );
}
