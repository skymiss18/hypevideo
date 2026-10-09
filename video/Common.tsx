import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneBase } from "../shared/types";
import { fill, theme } from "./theme";

const AUDIO_DELAY = 12;

export const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1200px 700px at 15% 0%, #12233a 0%, transparent 60%), radial-gradient(900px 600px at 100% 100%, #1a1238 0%, transparent 55%), ${theme.bg}`,
    }}
  >
    <svg width="100%" height="100%" style={{ ...fill, opacity: 0.07 }}>
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#9fb3c8" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  </AbsoluteFill>
);

function splitSentences(text: string): string[] {
  // Split only at sentence ends followed by whitespace so decimals like "2.7" stay intact.
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Subtitle bar: sentences are spread across the narration span by length. */
export const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const sentences = splitSentences(text);
  const start = AUDIO_DELAY;
  const end = Math.max(start + 1, durationInFrames - 15);
  const total = sentences.reduce((n, s) => n + s.length, 0) || 1;

  let acc = 0;
  let current = sentences[0] ?? "";
  for (const s of sentences) {
    const from = start + (acc / total) * (end - start);
    if (frame >= from) current = s;
    acc += s.length;
  }
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", left: 160, right: 160, bottom: 56, display: "flex", justifyContent: "center", opacity }}>
      <div
        style={{
          fontFamily: theme.font,
          fontSize: 38,
          lineHeight: 1.3,
          color: theme.text,
          textAlign: "center",
          background: "rgba(7,11,16,0.72)",
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 16,
          padding: "14px 28px",
          maxWidth: 1500,
        }}
      >
        {current}
      </div>
    </div>
  );
};

export type SubtitleLanguage = "en" | "zh";

export const SceneFrame: React.FC<{ scene: SceneBase; children: ReactNode; showCaption?: boolean; subtitleLanguage?: SubtitleLanguage }> = ({
  scene,
  children,
  showCaption = true,
  subtitleLanguage = "en",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 60,
          fontFamily: theme.font,
          fontSize: 24,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: theme.muted,
        }}
      >
        Hyperliquid · PnL Journey
      </div>
      {showCaption && <Caption text={subtitleLanguage === "zh" ? scene.narrationZh ?? scene.narration : scene.narration} />}
      {scene.audioUrl && (
        <Sequence from={AUDIO_DELAY} layout="none">
          <Audio src={scene.audioUrl} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

export const ease = Easing.bezier(0.22, 1, 0.36, 1);

export function progress(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}
