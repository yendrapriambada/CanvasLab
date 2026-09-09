import type { SceneObject } from "../lib/model";
import {
  bounds,
  connectorPoints,
  routedConnectorPath,
  connectorRoutePoints,
  linePath,
  download,
} from "./geometry";
import { stickySurface, roundedPolygon } from "./surfaces";
const esc = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function exportBounds(objects: SceneObject[], all: SceneObject[]) {
  return bounds(
    objects.flatMap((o) =>
      o.type === "connector"
        ? connectorRoutePoints(o, all).map((p) => ({
            ...o,
            x: p.x,
            y: p.y,
            width: 0,
            height: 0,
            rotation: 0,
          }))
        : o.type === "section"
          ? [{ ...o, y: o.y - 35, height: o.height + 35 }]
          : [o],
    ),
  );
}
export function svgDocument(
  objects: SceneObject[],
  assets: Record<string, string> = {},
  all: SceneObject[] = objects,
): string {
  const b = exportBounds(objects, all),
    pad = 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.width + pad * 2)}" height="${Math.ceil(b.height + pad * 2)}" viewBox="${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}"><rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="#fafaf7"/>${objects
    .map((o) => {
      const extra = o as SceneObject & { dashed?: boolean };
      const style = `fill="${esc(o.fill || "#fff")}" stroke="${esc(o.stroke || "#35405a")}" stroke-width="${o.strokeWidth || 0}" ${extra.dashed ? 'stroke-dasharray="7 5"' : ""}`;
      if (o.type === "connector") {
        const [a, b] = connectorPoints(o, all);
        return `<g><defs><marker id="a${o.id}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3z" fill="${esc(o.stroke)}"/></marker></defs><path d="${routedConnectorPath(o, all)}" fill="none" stroke="${esc(o.stroke)}" stroke-width="${o.strokeWidth || 2}" ${o.arrow === false ? "" : `marker-end="url(#a${o.id})"`} ${o.dashed ? 'stroke-dasharray="7 5"' : ""}/><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 8}" text-anchor="middle" font-family="Arial" font-size="14">${esc(o.text)}</text></g>`;
      }
      let shape =
        o.type === "ellipse"
          ? `<ellipse cx="${o.width / 2}" cy="${o.height / 2}" rx="${o.width / 2}" ry="${o.height / 2}" ${style}/>`
          : o.type === "diamond"
            ? `<path d="${roundedPolygon([
                { x: o.width / 2, y: 0 },
                { x: o.width, y: o.height / 2 },
                { x: o.width / 2, y: o.height },
                { x: 0, y: o.height / 2 },
              ])}" ${style}/>`
            : o.type === "triangle"
              ? `<path d="${roundedPolygon([
                  { x: o.width / 2, y: 0 },
                  { x: o.width, y: o.height },
                  { x: 0, y: o.height },
                ])}" ${style}/>`
              : o.type === "sticky"
                ? `<path d="${stickySurface(o.width, o.height)}" ${style}/>`
                : o.type === "image"
                  ? `<image href="${esc(assets[o.assetId || ""])}" width="${o.width}" height="${o.height}"/>`
                  : o.type === "pen"
                    ? `<path d="${linePath(o.points || [])}" fill="none" stroke="${esc(o.stroke)}" stroke-width="${o.strokeWidth || 3}" stroke-linecap="round"/>`
                    : ["text", "stamp"].includes(o.type)
                      ? ""
                      : `<rect width="${o.width}" height="${o.height}" rx="${o.type === "rounded" ? Math.min(30, o.height / 2) : o.type === "section" ? 18 : 6}" ${style}/>`;
      if (o.type === "table") {
        const cells = o.cells || [],
          h = o.height / Math.max(cells.length, 1),
          w = o.width / Math.max(cells[0]?.length || 1, 1);
        shape += cells
          .map((row, r) =>
            row
              .map(
                (value, c) =>
                  `<rect x="${c * w}" y="${r * h}" width="${w}" height="${h}" fill="${r === 0 ? "#eff0fa" : "#fff"}" stroke="#d9dce5"/><text x="${c * w + 10}" y="${r * h + h / 2 + 5}" font-size="14" font-family="Arial">${esc(value)}</text>`,
              )
              .join(""),
          )
          .join("");
      } else if (o.text) {
        const size = o.fontSize || 20,
          padText = o.type === "text" ? 0 : 18,
          maxChars = Math.max(
            1,
            Math.floor((o.width - padText * 2) / (size * 0.54)),
          );
        const lines = o.text.split("\n").flatMap((line) => {
          const words = line.split(" "),
            result: string[] = [];
          let current = "";
          for (const word of words) {
            if ((current + " " + word).trim().length > maxChars && current) {
              result.push(current);
              current = "";
            }
            current += (current ? " " : "") + word;
          }
          result.push(current);
          return result;
        });
        const left = o.align === "left",
          right = o.align === "right",
          startY =
            o.type === "section"
              ? -14
              : o.type === "sticky" || o.type === "text"
                ? size + padText
                : Math.max(
                    size,
                    (o.height - lines.length * size * 1.35) / 2 + size,
                  );
        shape += `<text x="${left ? padText : right ? o.width - padText : o.width / 2}" y="${startY}" text-anchor="${left ? "start" : right ? "end" : "middle"}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${o.bold ? "700" : "400"}" font-style="${o.italic ? "italic" : "normal"}" fill="#283044">${lines.map((l, i) => `<tspan x="${left ? padText : right ? o.width - padText : o.width / 2}" dy="${i ? size * 1.35 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
      }
      return `<g transform="translate(${o.x} ${o.y}) rotate(${o.rotation || 0} ${o.width / 2} ${o.height / 2})" opacity="${o.opacity ?? 1}">${shape}</g>`;
    })
    .join("")}</svg>`;
}
export async function exportScene(
  format: "svg" | "png",
  objects: SceneObject[],
  assets: Record<string, string>,
  name: string,
  all: SceneObject[] = objects,
) {
  if (!objects.length) throw new Error("Add an object before exporting.");
  const svg = svgDocument(objects, assets, all);
  if (format === "svg") {
    download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
    return;
  }
  const b = exportBounds(objects, all);
  if (
    (b.width + 80) * (b.height + 80) > 32_000_000 ||
    b.width > 16000 ||
    b.height > 16000
  )
    throw new Error(
      "This export is too large. Select a smaller area (up to 32 million pixels).",
    );
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not render export. Please try SVG."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(b.width + 80);
    canvas.height = Math.ceil(b.height + 80);
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
        "image/png",
      ),
    );
    download(blob, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
