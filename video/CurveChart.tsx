import { interpolate } from "remotion";
import { dateLabel, money } from "../shared/format";
import type { CurvePoint, Marker } from "../shared/types";
import { linearScale, niceTicks, pnlColor, theme, type Box } from "./theme";

const MARKER_COLOR: Record<Marker["kind"], string> = {
  peak: theme.gold,
  best: theme.green,
  worst: theme.red,
  drawdown: theme.red,
  liquidation: theme.red,
  deposit: theme.accent,
};

export function pnlAt(points: CurvePoint[], t: number): number {
  const first = points[0];
  if (!first) return 0;
  if (t <= first.t) return first.pnl;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (t <= b.t) return a.pnl + (b.pnl - a.pnl) * (b.t === a.t ? 1 : (t - a.t) / (b.t - a.t));
  }
  return points.at(-1)!.pnl;
}

interface Props {
  points: CurvePoint[];
  markers?: Marker[];
  box: Box;
  hide: boolean;
  /** 0..1 reveal position along the time axis */
  cursor: number;
  /** Time range drawn in red regardless of sign (used for the drawdown scene) */
  emphasis?: { from: number; to: number };
  /** Keep the zero line in view; off for windows far from zero */
  includeZero?: boolean;
}

export const CurveChart: React.FC<Props> = ({ points, markers = [], box, hide, cursor, emphasis, includeZero = true }) => {
  const tMin = points[0]!.t;
  const tMax = points.at(-1)!.t;
  const tCursor = tMin + cursor * (tMax - tMin);

  const values = points.map((p) => p.pnl);
  const lo = Math.min(includeZero ? 0 : Infinity, ...values);
  const hi = Math.max(includeZero ? 0 : -Infinity, ...values);
  const pad = (hi - lo || 1) * 0.14;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const x = linearScale(tMin, tMax, box.x, box.x + box.w);
  const y = linearScale(yMin, yMax, box.y + box.h, box.y);
  const y0 = includeZero ? y(0) : box.y + box.h;

  const visible = points.filter((p) => p.t <= tCursor).map((p) => [x(p.t), y(p.pnl)] as const);
  const headValue = pnlAt(points, tCursor);
  const head = [x(tCursor), y(headValue)] as const;
  if (visible.length === 0 || visible.at(-1)![0] < head[0]) visible.push(head);

  const line = visible.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L${head[0].toFixed(1)} ${y0.toFixed(1)} L${visible[0]![0].toFixed(1)} ${y0.toFixed(1)} Z`;

  const ticks = niceTicks(yMin, yMax, 5);
  const xTicks = Array.from({ length: 5 }, (_, i) => tMin + ((tMax - tMin) * i) / 4);

  const emphasisPath = (() => {
    if (!emphasis) return null;
    const seg = points.filter((p) => p.t >= emphasis.from && p.t <= Math.min(emphasis.to, tCursor));
    if (seg.length < 2) return null;
    return seg.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.pnl).toFixed(1)}`).join(" ");
  })();

  return (
    <g fontFamily={theme.font}>
      <defs>
        <clipPath id="above-zero">
          <rect x={box.x - 20} y={box.y - 40} width={box.w + 40} height={Math.max(0, y0 - box.y + 40)} />
        </clipPath>
        <clipPath id="below-zero">
          <rect x={box.x - 20} y={y0} width={box.w + 40} height={Math.max(0, box.y + box.h + 40 - y0)} />
        </clipPath>
        <linearGradient id="fade-up" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.green} stopOpacity="0.35" />
          <stop offset="1" stopColor={theme.green} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="fade-down" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={theme.red} stopOpacity="0.35" />
          <stop offset="1" stopColor={theme.red} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {ticks.map((v) => (
        <g key={v}>
          <line x1={box.x} x2={box.x + box.w} y1={y(v)} y2={y(v)} stroke={theme.panelBorder} strokeWidth={1} />
          {!hide && (
            <text x={box.x - 16} y={y(v) + 8} textAnchor="end" fill={theme.muted} fontSize={22}>
              {money(v, false)}
            </text>
          )}
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={x(t)} y={box.y + box.h + 40} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fill={theme.muted} fontSize={22}>
          {dateLabel(t)}
        </text>
      ))}
      {includeZero && <line x1={box.x} x2={box.x + box.w} y1={y0} y2={y0} stroke={theme.muted} strokeWidth={1.5} strokeDasharray="8 8" />}

      <path d={area} fill="url(#fade-up)" clipPath="url(#above-zero)" />
      <path d={area} fill="url(#fade-down)" clipPath="url(#below-zero)" />
      <path d={line} fill="none" stroke={theme.green} strokeWidth={4} strokeLinejoin="round" clipPath="url(#above-zero)" />
      <path d={line} fill="none" stroke={theme.red} strokeWidth={4} strokeLinejoin="round" clipPath="url(#below-zero)" />
      {emphasisPath && <path d={emphasisPath} fill="none" stroke={theme.red} strokeWidth={7} strokeLinecap="round" />}

      {markers.map((m, i) => {
        const pop = interpolate((tCursor - m.t) / ((tMax - tMin) || 1), [0, 0.03], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (pop <= 0) return null;
        const px = x(m.t);
        const py = y(m.value);
        const above = m.kind === "peak" || m.kind === "best";
        const chipY = above ? py - 70 : py + 70;
        const chipW = Math.max(150, m.label.length * 15 + 36);
        const chipX = Math.min(Math.max(px, box.x + chipW / 2), box.x + box.w - chipW / 2);
        const color = MARKER_COLOR[m.kind];
        return (
          <g key={i} opacity={pop} transform={`translate(0 ${(1 - pop) * (above ? 12 : -12)})`}>
            <line x1={px} x2={px} y1={py} y2={chipY} stroke={color} strokeWidth={2} strokeDasharray="4 6" />
            <circle cx={px} cy={py} r={10} fill={theme.bg} stroke={color} strokeWidth={4} />
            <rect x={chipX - chipW / 2} y={chipY - 24} width={chipW} height={48} rx={24} fill={theme.panel} stroke={color} strokeWidth={2} />
            <text x={chipX} y={chipY + 8} textAnchor="middle" fill={color} fontSize={24} fontWeight={600}>
              {m.label}
            </text>
          </g>
        );
      })}

      <circle cx={head[0]} cy={head[1]} r={22} fill={pnlColor(headValue)} opacity={0.2} />
      <circle cx={head[0]} cy={head[1]} r={9} fill={pnlColor(headValue)} />
    </g>
  );
};
