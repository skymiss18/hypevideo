import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { dateLabel, dateTimeLabel, durationText, money, priceLabel } from "../shared/format";
import type { TradeScene } from "../shared/types";
import { SceneFrame, progress, type SubtitleLanguage } from "./Common";
import { linearScale, niceTicks, pnlColor, theme } from "./theme";

const CHART = { x: 230, y: 220, w: 1000, h: 560 };

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, padding: "8px 0" }}>
    <span style={{ color: theme.muted }}>{label}</span>
    <span style={{ color: color ?? theme.text, fontFamily: theme.mono }}>{value}</span>
  </div>
);

export const Trade: React.FC<{ scene: TradeScene; hide: boolean; subtitleLanguage?: SubtitleLanguage }> = ({ scene, hide, subtitleLanguage }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const hasCandles = scene.candles.length >= 3;

  const span = Math.max(scene.closeTime - scene.openTime, 5 * 60_000);
  const step = hasCandles ? scene.candles[1]!.t - scene.candles[0]!.t : 0;
  const tStart = hasCandles ? scene.candles[0]!.t : scene.openTime - span * 0.2;
  const tEnd = hasCandles ? scene.candles.at(-1)!.t + step : Math.max(scene.closeTime, scene.openTime) + span * 0.2;

  const prices = [
    ...scene.fills.map((f) => f.px),
    scene.entryPx,
    scene.exitPx,
    ...scene.candles.flatMap((c) => [c.h, c.l]),
  ];
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pPad = (pMax - pMin || pMax * 0.01 || 1) * 0.12;
  const x = linearScale(tStart, tEnd, CHART.x, CHART.x + CHART.w);
  const y = linearScale(pMin - pPad, pMax + pPad, CHART.y + CHART.h, CHART.y);

  const cursor = progress(frame, 15, durationInFrames - 70);
  const tCursor = tStart + cursor * (tEnd - tStart);
  const candleW = hasCandles ? Math.max(3, (CHART.w / scene.candles.length) * 0.62) : 0;
  const ticks = niceTicks(pMin - pPad, pMax + pPad, 5);

  const counter = progress(frame, Math.round(durationInFrames * 0.45), durationInFrames - 50);
  const pnl = scene.pnl * counter;
  const returnPct = scene.maxNotional > 0 ? scene.pnl / scene.maxNotional : 0;
  const reveal = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const win = scene.pnl >= 0;
  const flash = scene.liquidated ? interpolate(frame, [durationInFrames - 60, durationInFrames - 40, durationInFrames - 20], [0, 0.5, 0.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;

  const stepLine = scene.fills
    .filter((f) => f.t <= tCursor)
    .map((f, i) => `${i === 0 ? "M" : "L"}${x(f.t).toFixed(1)} ${y(f.px).toFixed(1)}`)
    .join(" ");

  return (
    <SceneFrame scene={scene} subtitleLanguage={subtitleLanguage}>
      <div style={{ position: "absolute", left: 230, top: 100, fontFamily: theme.font, opacity: reveal }}>
        <div style={{ fontSize: 24, color: theme.muted, textTransform: "uppercase", letterSpacing: 4 }}>{scene.title}</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: theme.text }}>{scene.display}</div>
      </div>

      <svg width="100%" height="100%" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }} fontFamily={theme.font}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={CHART.x} x2={CHART.x + CHART.w} y1={y(v)} y2={y(v)} stroke={theme.panelBorder} />
            <text x={CHART.x - 14} y={y(v) + 8} textAnchor="end" fill={theme.muted} fontSize={22}>
              {priceLabel(v)}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((f, i) => (
          <text key={i} x={CHART.x + f * CHART.w} y={CHART.y + CHART.h + 40} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fill={theme.muted} fontSize={22}>
            {tEnd - tStart < 3 * 86_400_000 ? dateTimeLabel(tStart + f * (tEnd - tStart)) : dateLabel(tStart + f * (tEnd - tStart))}
          </text>
        ))}

        {hasCandles
          ? scene.candles
              .filter((c) => c.t <= tCursor)
              .map((c) => {
                const up = c.c >= c.o;
                const color = up ? theme.green : theme.red;
                const cx = x(c.t) + candleW / 2;
                return (
                  <g key={c.t}>
                    <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={2} />
                    <rect x={cx - candleW / 2} y={y(Math.max(c.o, c.c))} width={candleW} height={Math.max(2, Math.abs(y(c.o) - y(c.c)))} fill={color} />
                  </g>
                );
              })
          : stepLine && <path d={stepLine} fill="none" stroke={theme.accent} strokeWidth={4} strokeLinejoin="round" />}

        {tCursor >= scene.openTime && (
          <g>
            <line x1={x(scene.openTime)} x2={CHART.x + CHART.w} y1={y(scene.entryPx)} y2={y(scene.entryPx)} stroke={theme.accent} strokeDasharray="10 8" strokeWidth={2} />
            <text x={CHART.x + CHART.w - 8} y={y(scene.entryPx) - 10} textAnchor="end" fill={theme.accent} fontSize={22}>
              Entry {priceLabel(scene.entryPx)}
            </text>
          </g>
        )}
        {tCursor >= scene.closeTime && (
          <g>
            <line x1={x(scene.closeTime)} x2={CHART.x + CHART.w} y1={y(scene.exitPx)} y2={y(scene.exitPx)} stroke={theme.gold} strokeDasharray="10 8" strokeWidth={2} />
            <text x={CHART.x + CHART.w - 8} y={y(scene.exitPx) + 28} textAnchor="end" fill={theme.gold} fontSize={22}>
              Exit {priceLabel(scene.exitPx)}
            </text>
          </g>
        )}

        {scene.fills.map((f, i) => {
          const age = (tCursor - f.t) / (tEnd - tStart);
          const pop = interpolate(age, [0, 0.025], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (pop <= 0) return null;
          const buy = f.side === "B";
          const px = x(f.t);
          const py = y(f.px) + (buy ? 22 : -22);
          const color = buy ? theme.green : theme.red;
          const pts = buy ? `${px},${py - 14} ${px - 13},${py + 12} ${px + 13},${py + 12}` : `${px},${py + 14} ${px - 13},${py - 12} ${px + 13},${py - 12}`;
          const showLabel = i === 0 || i === scene.fills.length - 1;
          return (
            <g key={i} opacity={pop}>
              <polygon points={pts} fill={color} stroke={theme.bg} strokeWidth={2} />
              {showLabel && (
                <text x={Math.min(Math.max(px, CHART.x + 70), CHART.x + CHART.w - 70)} y={buy ? py + 42 : py - 26} textAnchor="middle" fill={color} fontSize={22} fontWeight={600} stroke={theme.bg} strokeWidth={6} paintOrder="stroke">
                  {f.label}
                </text>
              )}
            </g>
          );
        })}

        {!hasCandles && (
          <text x={CHART.x + CHART.w / 2} y={CHART.y + 30} textAnchor="middle" fill={theme.muted} fontSize={22}>
            Candle history unavailable · showing fills only
          </text>
        )}
      </svg>

      <div
        style={{
          position: "absolute",
          left: 1330,
          top: 220,
          width: 460,
          fontFamily: theme.font,
          background: theme.panel,
          border: `1px solid ${scene.liquidated ? theme.red : theme.panelBorder}`,
          borderRadius: 28,
          padding: "30px 36px",
          opacity: reveal,
          transform: `translateX(${(1 - reveal) * 60}px)`,
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: scene.direction === "short" ? theme.red : theme.green, border: `2px solid currentColor`, borderRadius: 999, padding: "4px 18px", textTransform: "uppercase" }}>
            {scene.direction}
          </span>
          {scene.liquidated && (
            <span style={{ fontSize: 24, fontWeight: 700, color: theme.bg, background: theme.red, borderRadius: 999, padding: "4px 18px" }}>LIQUIDATED</span>
          )}
        </div>
        <div style={{ fontSize: 24, color: theme.muted, textTransform: "uppercase", letterSpacing: 3 }}>Result</div>
        <div style={{ fontSize: hide ? 64 : 76, fontWeight: 800, color: pnlColor(scene.pnl), letterSpacing: -2 }}>
          {hide ? `${returnPct >= 0 ? "+" : ""}${(returnPct * 100 * counter).toFixed(1)}%` : money(pnl, false, { sign: true })}
        </div>
        {!hide && scene.maxNotional > 0 && (
          <div style={{ fontSize: 26, color: theme.muted, marginBottom: 14 }}>
            {returnPct >= 0 ? "+" : ""}
            {(returnPct * 100).toFixed(1)}% on position
          </div>
        )}
        <div style={{ borderTop: `1px solid ${theme.panelBorder}`, marginTop: 14, paddingTop: 10 }}>
          <Row label="Entry" value={priceLabel(scene.entryPx)} />
          <Row label="Exit" value={priceLabel(scene.exitPx)} />
          <Row label="Size" value={money(scene.maxNotional, hide)} />
          <Row label="Held" value={scene.closeTime > scene.openTime ? durationText(scene.closeTime - scene.openTime) : "instant"} />
          <Row label="Outcome" value={win ? "Win" : "Loss"} color={pnlColor(scene.pnl)} />
        </div>
      </div>

      {flash > 0 && <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 220px 40px ${theme.red}`, opacity: flash, pointerEvents: "none" }} />}
    </SceneFrame>
  );
};
