import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, type Camera } from "./geometry";

/** A large but finite working area, like Figma's own bounded canvas - big
 * enough that no real diagram ever reaches the edge, but panning eventually
 * stops instead of scrolling into empty space forever. */
export const CANVAS_MIN = -20000;
export const CANVAS_MAX = 20000;
const CANVAS_MARGIN = 600;

function clampToBounds(
  camera: Camera,
  size: { width: number; height: number },
): Camera {
  if (!size.width || !size.height) return camera;
  const minX = size.width - (CANVAS_MAX + CANVAS_MARGIN) * camera.zoom,
    maxX = -(CANVAS_MIN - CANVAS_MARGIN) * camera.zoom,
    minY = size.height - (CANVAS_MAX + CANVAS_MARGIN) * camera.zoom,
    maxY = -(CANVAS_MIN - CANVAS_MARGIN) * camera.zoom;
  return {
    ...camera,
    x: clamp(camera.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(camera.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  };
}

/**
 * Keep wheel/trackpad navigation direct: native trackpads already supply
 * momentum, so we never layer a second inertia simulation on top (that read
 * as "braking" after the user's fingers left the pad). What we do need is to
 * decouple the *input* rate from the *render* rate: a fast trackpad can fire
 * wheel/pointer events far faster than the display refreshes, and committing
 * a React state update per raw event forces a full scene re-render per
 * event too - which is the actual source of the heavy, laggy feel (frames
 * pile up and keep draining after the gesture ends). Batching every update
 * into a single commit per animation frame keeps the camera pixel-accurate
 * under the cursor while capping re-renders to the display's own cadence.
 */
export function useCanvasCamera(
  initial: Camera,
  viewportSizeRef?: { current: { width: number; height: number } },
) {
  const [camera, commit] = useState(initial);
  const current = useRef(initial),
    target = useRef(initial),
    frame = useRef(0),
    fallback = useRef(0),
    pending = useRef(false);
  const reducedMotion = useRef(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      reducedMotion.current = media.matches;
    };
    change();
    media.addEventListener("change", change);
    return () => {
      media.removeEventListener("change", change);
      cancelAnimationFrame(frame.current);
      clearTimeout(fallback.current);
    };
  }, []);
  const bound = useCallback(
    (value: Camera) =>
      viewportSizeRef
        ? clampToBounds(value, viewportSizeRef.current)
        : value,
    [viewportSizeRef],
  );
  const flush = useCallback(() => {
    pending.current = false;
    cancelAnimationFrame(frame.current);
    clearTimeout(fallback.current);
    commit(current.current);
  }, []);
  const schedule = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    frame.current = requestAnimationFrame(flush);
    // rAF is throttled while the tab is backgrounded/hidden; a timer
    // fallback keeps the camera from looking frozen in that case too.
    fallback.current = window.setTimeout(flush, 50);
  }, [flush]);
  const setCamera = useCallback(
    (next: Camera | ((value: Camera) => Camera)) => {
      current.current = target.current = bound(
        typeof next === "function" ? next(current.current) : next,
      );
      schedule();
    },
    [schedule, bound],
  );
  const smoothCamera = useCallback(
    (next: Camera | ((value: Camera) => Camera)) => {
      // Do not add a second inertia layer over a precision trackpad. It made
      // panning feel heavy and continued after the user stopped scrolling.
      // Still coalesce into the animation-frame cadence below, purely so a
      // burst of wheel events doesn't force a render per event.
      target.current = current.current = bound(
        typeof next === "function" ? next(current.current) : next,
      );
      schedule();
    },
    [schedule, bound],
  );
  return {
    camera,
    setCamera,
    smoothCamera,
    cameraRef: current,
    cameraTarget: target,
  };
}
