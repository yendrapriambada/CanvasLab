import type { SceneObject } from "../lib/model";
import { rotate, type Point } from "./geometry";

/** Keep the opposite side fixed in world space while resizing a rotated object. */
export function resizeObject(
  object: SceneObject,
  start: Point,
  current: Point,
  handle: string,
  uniform = false,
  fromCenter = false,
) {
  const center = {
      x: object.x + object.width / 2,
      y: object.y + object.height / 2,
    },
    angle = object.rotation || 0;
  const a = rotate(start, -angle, center),
    b = rotate(current, -angle, center),
    multiplier = fromCenter ? 2 : 1;
  const dx = (b.x - a.x) * multiplier,
    dy = (b.y - a.y) * multiplier;
  let width = Math.max(
    30,
    object.width + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0),
  );
  let height = Math.max(
    30,
    object.height +
      (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0),
  );
  if (uniform) {
    const horizontal = handle.includes("e") || handle.includes("w");
    if (horizontal) height = (width / object.width) * object.height;
    else width = (height / object.height) * object.width;
  }
  const shiftX = fromCenter
    ? 0
    : handle.includes("w")
      ? (object.width - width) / 2
      : handle.includes("e")
        ? (width - object.width) / 2
        : 0;
  const shiftY = fromCenter
    ? 0
    : handle.includes("n")
      ? (object.height - height) / 2
      : handle.includes("s")
        ? (height - object.height) / 2
        : 0;
  const moved = rotate(
    { x: center.x + shiftX, y: center.y + shiftY },
    angle,
    center,
  );
  return { x: moved.x - width / 2, y: moved.y - height / 2, width, height };
}
