import { memo } from "react";
import { stickySurface, roundedPolygon } from "./surfaces";
import type { SceneObject } from "../lib/model";
import { routedConnectorPath, connectorPoints, linePath } from "./geometry";
export function assetURL(asset: { data: string; mime: string }) {
  return `data:${asset.mime};base64,${asset.data}`;
}
/** The corner radius a shape renders with when it has no explicit `radius`
 * of its own - kept in one place so the on-canvas radius handles line up
 * with what's actually drawn. */
export function defaultRadius(o: SceneObject) {
  const base =
    o.type === "rounded"
      ? 16
      : o.type === "section"
        ? 0
        : o.type === "rectangle"
          ? 0
          : 6;
  return Math.min(base, o.width / 2, o.height / 2);
}
export const SceneView = memo(function SceneView({
  o,
  all,
  asset,
  editing,
  selected,
  details=true,
  onEdit,
  onCell,
}: {
  o: SceneObject;
  all: SceneObject[];
  asset?: string;
  editing?: boolean;
  selected?: boolean;
  details?:boolean;
  onEdit?: (id: string) => void;
  onCell?: (id: string, r: number, c: number, value: string) => void;
}) {
  const extra = o as SceneObject & {
    dashed?: boolean;
    showAuthor?: boolean;
    link?: string;
    arrow?: boolean;
  };
  const stroke = o.stroke || "#35405a",
    fill = o.fill || "#fff",
    style = {
      fill,
      stroke,
      strokeWidth: o.strokeWidth || 0,
      strokeDasharray: extra.dashed ? "7 5" : undefined,
    };
  if (o.type === "connector") {
    const [a, b] = connectorPoints(o, all);
    return (
      <g data-object-id={o.id} opacity={o.opacity ?? 1}>
        <path
          d={routedConnectorPath(o, all)}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
        />
        <path
          d={routedConnectorPath(o, all)}
          fill="none"
          stroke={stroke}
          strokeWidth={o.strokeWidth || 2}
          strokeDasharray={extra.dashed ? "7 5" : undefined}
          markerStart={o.arrowStart ? `url(#arrow-start-${o.id})` : undefined}
          markerEnd={
            (o.arrowEnd !== undefined ? o.arrowEnd : extra.arrow !== false)
              ? `url(#arrow-${o.id})`
              : undefined
          }
        />
        <defs>
          <marker
            id={`arrow-${o.id}`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
          </marker>
          {/* The head on the first point has to face back down the line, into
              the shape it starts at - "auto" alone would aim it along the
              route and leave it pointing outwards. */}
          <marker
            id={`arrow-start-${o.id}`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
          </marker>
        </defs>
        {details && o.text && !editing && (
          <g onDoubleClick={() => onEdit?.(o.id)}>
            <rect
              x={(a.x + b.x) / 2 - o.text.length * 3.8 - 8}
              y={(a.y + b.y) / 2 - 12}
              width={o.text.length * 7.6 + 16}
              height="24"
              fill="#fafaf7"
              rx="5"
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 + 5}
              textAnchor="middle"
              fontSize="14"
              fill={stroke}
            >
              {o.text}
            </text>
          </g>
        )}
      </g>
    );
  }
  if (o.type === "pen")
    return (
      <g
        data-object-id={o.id}
        transform={`translate(${o.x} ${o.y}) rotate(${o.rotation || 0} ${o.width / 2} ${o.height / 2})`}
        opacity={o.opacity ?? 1}
      >
        <path
          d={linePath(o.points || [])}
          stroke="transparent"
          strokeWidth={Math.max(16, o.strokeWidth || 3)}
          fill="none"
        />
        <path
          d={linePath(o.points || [])}
          stroke={stroke}
          strokeWidth={o.strokeWidth || 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    );
  return (
    <g
      data-object-id={o.id}
      transform={`translate(${o.x} ${o.y}) rotate(${o.rotation || 0} ${o.width / 2} ${o.height / 2})`}
      opacity={o.opacity ?? 1}
    >
      {o.type === "ellipse" ? (
        <ellipse
          cx={o.width / 2}
          cy={o.height / 2}
          rx={o.width / 2}
          ry={o.height / 2}
          {...style}
        />
      ) : o.type === "diamond" ? (
        <path
          d={roundedPolygon([
            { x: o.width / 2, y: 0 },
            { x: o.width, y: o.height / 2 },
            { x: o.width / 2, y: o.height },
            { x: 0, y: o.height / 2 },
          ])}
          {...style}
        />
      ) : o.type === "triangle" ? (
        <path
          d={roundedPolygon([
            { x: o.width / 2, y: 0 },
            { x: o.width, y: o.height },
            { x: 0, y: o.height },
          ])}
          {...style}
        />
      ) : o.type === "sticky" ? (
        <>
          <path
            d={stickySurface(o.width, o.height)}
            {...style}
            className={details?"sticky-surface":undefined}
          />
          <path
            d={`M ${o.width - 20} ${o.height} L ${o.width - 20} ${o.height - 20} L ${o.width} ${o.height - 20} Z`}
            fill="#7d6029"
            opacity=".12"
            pointerEvents="none"
          />
        </>
      ) : o.type === "image" ? (
        <>
          <rect width={o.width} height={o.height} fill="#e9edf2" rx="3" />
          {asset ? (
            <image
              href={asset}
              width={o.width}
              height={o.height}
              preserveAspectRatio="none"
            />
          ) : (
            <text
              x={o.width / 2}
              y={o.height / 2}
              textAnchor="middle"
              fill="#778196"
              fontSize="14"
            >
              Loading image…
            </text>
          )}
        </>
      ) : o.type === "stamp" ? null : (
        <rect
          width={o.width}
          height={o.height}
          rx={
            o.radius !== undefined
              ? Math.min(o.radius, o.width / 2, o.height / 2)
              : defaultRadius(o)
          }
          {...style}
          fill={o.type === "text" ? "transparent" : fill}
        />
      )}
      {/* A section's title chip is rendered separately, in a top-level
          overlay pass (see BoardEditor) - drawn there so it always floats
          above every other object instead of being buried by whatever the
          frame's own stacking order happens to place over it. */}
      {o.type === "table" && details ? (
        <foreignObject width={o.width} height={o.height}>
          <div className="canvas-table-wrapper">
            <table className="canvas-table">
              <tbody>
                {(
                  o.cells || [
                    ["Column 1", "Column 2"],
                    ["", ""],
                    ["", ""],
                  ]
                ).map((row, r) => (
                  <tr key={r}>
                    {row.map((value, c) => (
                      <td key={c}>
                        {selected && onCell ? (
                          <input
                            aria-label={`Row ${r + 1} column ${c + 1}`}
                            value={value}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => onCell(o.id, r, c, e.target.value)}
                          />
                        ) : (
                          value || <span>&nbsp;</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </foreignObject>
      ) : (
        details && !editing &&
        !["image", "section","table"].includes(o.type) && (
          <foreignObject width={o.width} height={o.height} pointerEvents="none">
            <div
              className={`object-text ${o.type === "sticky" ? "sticky-text" : ""}`}
              style={{
                fontSize: o.fontSize || 20,
                fontWeight: o.bold ? 700 : 400,
                fontStyle: o.italic ? "italic" : "normal",
                textAlign: o.align || "center",
                padding: o.type === "text" ? 0 : 18,
                color: o.type === "stamp" ? undefined : "#283044",
                alignItems: o.type === "sticky" ? "flex-start" : "center",
                justifyContent: o.type === "stamp" ? "center" : undefined,
              }}
            >
              <div
                style={{
                  width: "100%",
                  overflowWrap: "anywhere",
                  whiteSpace: "pre-wrap",
                }}
              >
                {o.text}
              </div>
            </div>
          </foreignObject>
        )
      )}
      {details && o.type === "sticky" && extra.showAuthor && o.author && (
        <text x="16" y={o.height - 12} fill="#66645b" fontSize="11">
          {o.author}
        </text>
      )}
      {extra.link && (
        <a
          href={/^https?:\/\//i.test(extra.link) ? extra.link : "#"}
          target="_blank"
          rel="noopener noreferrer"
        >
          <text x={o.width - 20} y={o.height - 10} fill="#6255cb" fontSize="17">
            ↗
          </text>
        </a>
      )}
    </g>
  );
});
