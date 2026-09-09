import type { Point } from "./geometry";

export function stickySurface(width: number, height: number) {
  const r = Math.min(5, width / 6, height / 6),
    fold = Math.min(20, width / 5, height / 5);
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - fold} L ${width - fold} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
}

export function roundedPolygon(vertices: Point[], radius = 10) {
  const corners = vertices.map((p, i) => {
    const previous = vertices[(i + vertices.length - 1) % vertices.length],
      next = vertices[(i + 1) % vertices.length];
    const before = Math.hypot(previous.x - p.x, previous.y - p.y),
      after = Math.hypot(next.x - p.x, next.y - p.y),
      r = Math.min(radius, before / 2, after / 2);
    return {
      p,
      a: {
        x: p.x + ((previous.x - p.x) * r) / before,
        y: p.y + ((previous.y - p.y) * r) / before,
      },
      b: {
        x: p.x + ((next.x - p.x) * r) / after,
        y: p.y + ((next.y - p.y) * r) / after,
      },
    };
  });
  return (
    corners
      .map(
        ({ p, a, b }, i) =>
          `${i ? "L" : "M"} ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`,
      )
      .join(" ") + " Z"
  );
}
