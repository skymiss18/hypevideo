import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH, type Candle, type CurvePoint, type Storyboard } from "../shared/types";

// Deterministic placeholder so the Remotion Studio has something to show.
const DAY = 86_400_000;
const start = Date.UTC(2025, 0, 1);

const points: CurvePoint[] = Array.from({ length: 120 }, (_, i) => {
  const pnl = 4000 * Math.sin(i / 14) + i * 90 - (i > 70 && i < 90 ? (i - 70) * 260 : 0);
  return { t: start + i * DAY, pnl, accountValue: 10_000 + pnl };
});

const candles: Candle[] = Array.from({ length: 60 }, (_, i) => {
  const base = 3000 + Math.sin(i / 6) * 120 + i * 4;
  return { t: start + i * 3_600_000, o: base, c: base + Math.cos(i) * 25, h: base + 45, l: base - 45 };
});

const frames = (sec: number) => sec * VIDEO_FPS;

export const sampleStoryboard: Storyboard = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  fps: VIDEO_FPS,
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  hideAmounts: false,
  totalFrames: frames(6) + frames(12) + frames(9) + frames(8) + frames(8),
  scenes: [
    { id: "intro", type: "intro", durationInFrames: frames(6), narration: "Sample intro narration.", address: "0x1234567890abcdef1234567890abcdef12345678", startTime: start, endTime: start + 120 * DAY, tradeCount: 342, partial: false },
    { id: "equity", type: "equity", durationInFrames: frames(12), narration: "Here is the full profit and loss curve.", points, totalPnl: points.at(-1)!.pnl, markers: [{ t: points[69]!.t, label: "Peak +$9.1K", value: points[69]!.pnl, kind: "peak" }, { t: points[89]!.t, label: "Drawdown -$5.2K", value: points[89]!.pnl, kind: "drawdown" }] },
    { id: "trade-1", type: "trade", durationInFrames: frames(9), narration: "First highlight: a long on ETH.", rank: 1, title: "Trade 1 of 1", display: "ETH", direction: "long", openTime: candles[10]!.t, closeTime: candles[45]!.t, entryPx: candles[10]!.o, exitPx: candles[45]!.c, pnl: 1840, maxNotional: 52_000, liquidated: false, candles, fills: [{ t: candles[10]!.t, px: candles[10]!.o, side: "B", label: "Open Long" }, { t: candles[45]!.t, px: candles[45]!.c, side: "A", label: "Close Long" }] },
    { id: "drawdown", type: "drawdown", durationInFrames: frames(8), narration: "The roughest stretch.", points: points.slice(55, 110), drawdown: { peakTime: points[69]!.t, troughTime: points[89]!.t, peakValue: points[69]!.pnl, troughValue: points[89]!.pnl, depth: points[69]!.pnl - points[89]!.pnl, pct: 0.31 } },
    { id: "outro", type: "outro", durationInFrames: frames(8), narration: "That is the journey.", totalPnl: 6420, winRate: 0.58, tradeCount: 342, bestPnl: 1840, worstPnl: -2100, address: "0x1234…5678", hideAmounts: false },
  ],
};
