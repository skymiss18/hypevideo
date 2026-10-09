import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { dateLabel, money, percent, shortAddress } from "../shared/format";
import type { IntroScene, OutroScene } from "../shared/types";
import { SceneFrame, progress, type SubtitleLanguage } from "./Common";
import { pnlColor, theme } from "./theme";

export const Intro: React.FC<{ scene: IntroScene; subtitleLanguage?: SubtitleLanguage }> = ({ scene, subtitleLanguage }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (delay: number) => {
    const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
    return { opacity: s, transform: `translateY(${(1 - s) * 40}px)` };
  };

  return (
    <SceneFrame scene={scene} subtitleLanguage={subtitleLanguage}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: theme.font, gap: 28 }}>
        <div style={{ ...rise(4), fontSize: 120, fontWeight: 800, color: theme.text, letterSpacing: -2 }}>
          Trading <span style={{ color: theme.green }}>Journey</span>
        </div>
        <div style={{ ...rise(14), fontFamily: theme.mono, fontSize: 52, color: theme.accent }}>{shortAddress(scene.address)}</div>
        <div style={{ ...rise(24), display: "flex", gap: 48, fontSize: 34, color: theme.muted }}>
          <span>
            {dateLabel(scene.startTime)} → {dateLabel(scene.endTime)}
          </span>
          <span>{scene.tradeCount.toLocaleString("en-US")} trades</span>
        </div>
        {scene.partial && (
          <div style={{ ...rise(34), fontSize: 26, color: theme.gold, border: `1px solid ${theme.gold}55`, borderRadius: 999, padding: "8px 22px" }}>
            Showing the most recent 10,000 fills only
          </div>
        )}
      </div>
    </SceneFrame>
  );
};

const Stat: React.FC<{ label: string; value: string; color?: string; delay: number }> = ({ label, value, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`,
        background: theme.panel,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 24,
        padding: "28px 40px",
        minWidth: 300,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 26, color: theme.muted, textTransform: "uppercase", letterSpacing: 3 }}>{label}</div>
      <div style={{ fontSize: 64, fontWeight: 700, color: color ?? theme.text, marginTop: 10 }}>{value}</div>
    </div>
  );
};

export const Outro: React.FC<{ scene: OutroScene; subtitleLanguage?: SubtitleLanguage }> = ({ scene, subtitleLanguage }) => {
  const frame = useCurrentFrame();
  const hide = scene.hideAmounts;
  const count = progress(frame, 10, 60);

  return (
    <SceneFrame scene={scene} subtitleLanguage={subtitleLanguage}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: theme.font, gap: 40 }}>
        <div style={{ fontSize: 34, color: theme.muted, textTransform: "uppercase", letterSpacing: 6 }}>Total PnL · {scene.address}</div>
        <div style={{ fontSize: 190, fontWeight: 800, color: pnlColor(scene.totalPnl), letterSpacing: -4 }}>
          {money(scene.totalPnl * count, hide, { sign: true })}
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          <Stat label="Win rate" value={percent(scene.winRate)} delay={30} />
          <Stat label="Trades" value={scene.tradeCount.toLocaleString("en-US")} delay={38} />
          <Stat label="Best" value={scene.bestPnl > 0 ? money(scene.bestPnl, hide, { sign: true }) : "–"} color={theme.green} delay={46} />
          <Stat label="Worst" value={scene.worstPnl < 0 ? money(scene.worstPnl, hide) : "–"} color={theme.red} delay={54} />
        </div>
      </div>
    </SceneFrame>
  );
};
