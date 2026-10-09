import { useCurrentFrame, useVideoConfig } from "remotion";
import { money, percent, dateLabel } from "../shared/format";
import type { DrawdownScene, EquityScene } from "../shared/types";
import { SceneFrame, progress, type SubtitleLanguage } from "./Common";
import { CurveChart, pnlAt } from "./CurveChart";
import { pnlColor, theme } from "./theme";

const CHART = { x: 230, y: 250, w: 1500, h: 520 };

export const Equity: React.FC<{ scene: EquityScene; hide: boolean; subtitleLanguage?: SubtitleLanguage }> = ({ scene, hide, subtitleLanguage }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cursor = progress(frame, 20, durationInFrames - 70);
  const first = scene.points[0]!.t;
  const last = scene.points.at(-1)!.t;
  const value = pnlAt(scene.points, first + cursor * (last - first));

  return (
    <SceneFrame scene={scene} subtitleLanguage={subtitleLanguage}>
      <div style={{ position: "absolute", left: 230, top: 110, fontFamily: theme.font }}>
        <div style={{ fontSize: 24, color: theme.muted, textTransform: "uppercase", letterSpacing: 4 }}>Cumulative PnL</div>
        <div style={{ fontSize: 88, fontWeight: 800, color: pnlColor(value), letterSpacing: -2 }}>{money(value, hide, { sign: true })}</div>
      </div>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <CurveChart points={scene.points} markers={scene.markers} box={CHART} hide={hide} cursor={cursor} />
      </svg>
    </SceneFrame>
  );
};

export const Drawdown: React.FC<{ scene: DrawdownScene; hide: boolean; subtitleLanguage?: SubtitleLanguage }> = ({ scene, hide, subtitleLanguage }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cursor = progress(frame, 20, durationInFrames - 60);
  const d = scene.drawdown;
  const first = scene.points[0]!.t;
  const last = scene.points.at(-1)!.t;
  const t = first + cursor * (last - first);
  const lost = t < d.peakTime ? 0 : Math.max(0, Math.min(d.depth, d.peakValue - pnlAt(scene.points, t)));

  return (
    <SceneFrame scene={scene} subtitleLanguage={subtitleLanguage}>
      <div style={{ position: "absolute", left: 230, top: 110, fontFamily: theme.font }}>
        <div style={{ fontSize: 24, color: theme.muted, textTransform: "uppercase", letterSpacing: 4 }}>
          Max drawdown · {dateLabel(d.peakTime)} → {dateLabel(d.troughTime)}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
          <span style={{ fontSize: 88, fontWeight: 800, color: theme.red, letterSpacing: -2 }}>{money(-lost, hide)}</span>
          {d.pct > 0 && <span style={{ fontSize: 40, color: theme.muted }}>{percent(d.pct * (lost / (d.depth || 1)), 0)} of account</span>}
        </div>
      </div>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <CurveChart points={scene.points} box={CHART} hide={hide} cursor={cursor} includeZero={false} emphasis={{ from: d.peakTime, to: d.troughTime }} />
      </svg>
    </SceneFrame>
  );
};
