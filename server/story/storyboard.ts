import { money, shortAddress } from "../../shared/format.js";
import {
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type Analysis,
  type Candle,
  type CurvePoint,
  type Dataset,
  type DrawdownScene,
  type EquityScene,
  type IntroScene,
  type Marker,
  type OutroScene,
  type Scene,
  type Storyboard,
  type Trade,
  type TradeScene,
  type TradeSceneFill,
} from "../../shared/types.js";
import {
  drawdownNarration,
  drawdownNarrationZh,
  equityNarration,
  equityNarrationZh,
  introNarration,
  introNarrationZh,
  outroNarration,
  outroNarrationZh,
  tradeNarration,
  tradeNarrationZh,
} from "./narration.js";

const WORDS_PER_SEC = 2.6;
/** Silence around the narration inside a scene, in seconds. */
const SCENE_PADDING_SEC = 1.4;
const MIN_SEC: Record<Scene["type"], number> = { intro: 6, equity: 12, trade: 9, drawdown: 8, outro: 8 };
export const MIN_TARGET_SEC = 60;
export const MAX_TARGET_SEC = 180;

export function estimateSeconds(text: string): number {
  return text.trim().split(/\s+/).length / WORDS_PER_SEC;
}

export function framesFor(type: Scene["type"], narrationSeconds: number): number {
  return Math.ceil(Math.max(MIN_SEC[type], narrationSeconds + SCENE_PADDING_SEC) * VIDEO_FPS);
}

/** Keep extremes per bucket so spikes survive downsampling. */
export function downsample(points: CurvePoint[], max = 240): CurvePoint[] {
  if (points.length <= max) return points;
  const buckets = Math.floor(max / 2);
  const size = points.length / buckets;
  const out: CurvePoint[] = [points[0]!];
  for (let b = 0; b < buckets; b++) {
    const slice = points.slice(Math.floor(b * size), Math.floor((b + 1) * size));
    if (slice.length === 0) continue;
    let lo = slice[0]!;
    let hi = slice[0]!;
    for (const p of slice) {
      if (p.pnl < lo.pnl) lo = p;
      if (p.pnl > hi.pnl) hi = p;
    }
    const pair = lo.t <= hi.t ? [lo, hi] : [hi, lo];
    for (const p of pair) if (out.at(-1) !== p) out.push(p);
  }
  const last = points.at(-1)!;
  if (out.at(-1) !== last) out.push(last);
  return out;
}

export function valueAt(curve: CurvePoint[], t: number): number {
  if (curve.length === 0) return 0;
  if (t <= curve[0]!.t) return curve[0]!.pnl;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (t <= b.t) {
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a.pnl + (b.pnl - a.pnl) * f;
    }
  }
  return curve.at(-1)!.pnl;
}

function thinFills(trade: Trade, max = 24): TradeSceneFill[] {
  const fills = trade.fills.map((f) => ({ t: f.time, px: f.px, side: f.side, label: f.dir || (f.side === "B" ? "Buy" : "Sell") }));
  if (fills.length <= max) return fills;
  const step = (fills.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => fills[Math.round(i * step)]!);
}

function buildMarkers(a: Analysis, hide: boolean): Marker[] {
  const { stats, curve } = a;
  const markers: Marker[] = [];
  if (stats.peakPnl > 0) {
    markers.push({ t: stats.peakPnlTime, label: `Peak ${money(stats.peakPnl, hide, { sign: true })}`, value: stats.peakPnl, kind: "peak" });
  }
  const dd = stats.maxDrawdown;
  if (dd && dd.depth > 0) {
    markers.push({ t: dd.troughTime, label: `Drawdown ${money(-dd.depth, hide)}`, value: dd.troughValue, kind: "drawdown" });
  }
  const liquidated = a.trades.filter((t) => t.liquidated).sort((x, y) => x.pnl - y.pnl).slice(0, 3);
  for (const t of liquidated) {
    markers.push({ t: t.closeTime, label: `Liquidated ${t.display}`, value: valueAt(curve, t.closeTime), kind: "liquidation" });
  }
  const { bestTrade: best, worstTrade: worst } = stats;
  if (best && !markers.some((m) => m.kind === "peak" && Math.abs(m.t - best.closeTime) < 86_400_000)) {
    markers.push({ t: best.closeTime, label: `Best ${money(best.pnl, hide, { sign: true })}`, value: valueAt(curve, best.closeTime), kind: "best" });
  }
  if (worst && !worst.liquidated) {
    markers.push({ t: worst.closeTime, label: `Worst ${money(worst.pnl, hide)}`, value: valueAt(curve, worst.closeTime), kind: "worst" });
  }
  // Keep markers readable: drop ones that crowd a higher-priority marker.
  const priority: Marker["kind"][] = ["peak", "liquidation", "drawdown", "best", "worst", "deposit"];
  const span = (curve.at(-1)?.t ?? 0) - (curve[0]?.t ?? 0) || 1;
  const kept: Marker[] = [];
  for (const m of [...markers].sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))) {
    if (kept.every((k) => Math.abs(k.t - m.t) / span > 0.07)) kept.push(m);
  }
  return kept.sort((x, y) => x.t - y.t);
}

function worthShowingDrawdown(a: Analysis): boolean {
  const dd = a.stats.maxDrawdown;
  if (!dd || a.curve.length < 5) return false;
  const scale = Math.max(Math.abs(a.stats.peakPnl), Math.abs(a.stats.totalPnl), 1);
  return dd.depth / scale >= 0.15;
}

export interface StoryboardInput {
  data: Dataset;
  analysis: Analysis;
  /** Candles for highlighted trades keyed by trade id; missing/null means unavailable. */
  candles: Map<number, Candle[] | null>;
  hideAmounts: boolean;
  targetSeconds: number;
}

function makeScenes(input: StoryboardInput, highlights: Trade[]): Scene[] {
  const { data, analysis: a, hideAmounts: hide } = input;
  const { stats } = a;
  const scenes: Scene[] = [];

  const introText = introNarration({
    address: data.address,
    startTime: stats.startTime,
    endTime: stats.endTime,
    tradeCount: stats.tradeCount,
    totalPnl: stats.totalPnl,
    partial: data.partial,
    hide,
  });
  const intro: IntroScene = {
    id: "intro",
    type: "intro",
    durationInFrames: 0,
    narration: introText,
    narrationZh: introNarrationZh({ address: data.address, startTime: stats.startTime, endTime: stats.endTime, tradeCount: stats.tradeCount, totalPnl: stats.totalPnl, partial: data.partial, hide }),
    address: data.address,
    startTime: stats.startTime,
    endTime: stats.endTime,
    tradeCount: stats.tradeCount,
    partial: data.partial,
  };
  scenes.push(intro);

  const equity: EquityScene = {
    id: "equity",
    type: "equity",
    durationInFrames: 0,
    narration: equityNarration(stats, hide),
    narrationZh: equityNarrationZh(stats, hide),
    points: downsample(a.curve),
    markers: buildMarkers(a, hide),
    totalPnl: stats.totalPnl,
  };
  scenes.push(equity);

  highlights.forEach((t, i) => {
    const scene: TradeScene = {
      id: `trade-${t.id}`,
      type: "trade",
      durationInFrames: 0,
      narration: tradeNarration(t, i + 1, highlights.length, hide),
      narrationZh: tradeNarrationZh(t, i + 1, highlights.length, hide),
      rank: i + 1,
      title: `Trade ${i + 1} of ${highlights.length}`,
      display: t.display,
      direction: t.direction,
      openTime: t.openTime,
      closeTime: t.closeTime,
      entryPx: t.entryPx,
      exitPx: t.exitPx,
      pnl: t.pnl,
      maxNotional: t.maxNotional,
      liquidated: t.liquidated,
      candles: input.candles.get(t.id) ?? [],
      fills: thinFills(t),
    };
    scenes.push(scene);
  });

  const dd = stats.maxDrawdown;
  if (dd && worthShowingDrawdown(a)) {
    const pad = Math.max((dd.troughTime - dd.peakTime) * 0.25, 3_600_000);
    const window = a.curve.filter((p) => p.t >= dd.peakTime - pad && p.t <= dd.troughTime + pad);
    const scene: DrawdownScene = {
      id: "drawdown",
      type: "drawdown",
      durationInFrames: 0,
      narration: drawdownNarration(dd, hide),
      narrationZh: drawdownNarrationZh(dd, hide),
      points: downsample(window.length >= 2 ? window : a.curve, 160),
      drawdown: dd,
    };
    scenes.push(scene);
  }

  const outro: OutroScene = {
    id: "outro",
    type: "outro",
    durationInFrames: 0,
    narration: outroNarration(stats, hide),
    narrationZh: outroNarrationZh(stats, hide),
    totalPnl: stats.totalPnl,
    winRate: stats.winRate,
    tradeCount: stats.tradeCount,
    bestPnl: stats.bestTrade?.pnl ?? 0,
    worstPnl: stats.worstTrade?.pnl ?? 0,
    address: shortAddress(data.address),
    hideAmounts: hide,
  };
  scenes.push(outro);
  return scenes;
}

const estimatedTotal = (scenes: Scene[]) =>
  scenes.reduce((sum, s) => sum + framesFor(s.type, estimateSeconds(s.narration)) / VIDEO_FPS, 0);

export function buildStoryboard(input: StoryboardInput): Storyboard {
  const target = Math.min(MAX_TARGET_SEC, Math.max(MIN_TARGET_SEC, input.targetSeconds));
  let highlights = [...input.analysis.highlights];
  let scenes = makeScenes(input, highlights);

  // Drop the least impactful highlight until the estimate fits the target length.
  while (highlights.length > 0 && estimatedTotal(scenes) > target) {
    const weakest = highlights.reduce((m, t) => (Math.abs(t.pnl) < Math.abs(m.pnl) ? t : m));
    highlights = highlights.filter((t) => t !== weakest);
    scenes = makeScenes(input, highlights);
  }

  for (const s of scenes) s.durationInFrames = framesFor(s.type, estimateSeconds(s.narration));
  const targetFrames = Math.round(target * VIDEO_FPS);
  const currentFrames = scenes.reduce((n, s) => n + s.durationInFrames, 0);
  if (currentFrames < targetFrames) {
    const outro = scenes.at(-1);
    if (outro) outro.durationInFrames += targetFrames - currentFrames;
  }
  return {
    address: input.data.address,
    fps: VIDEO_FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    hideAmounts: input.hideAmounts,
    scenes,
    totalFrames: scenes.reduce((n, s) => n + s.durationInFrames, 0),
  };
}

/** Recompute durations once real narration lengths are known. */
export function applyNarrationDurations(board: Storyboard, seconds: Map<string, number>): Storyboard {
  for (const s of board.scenes) {
    s.durationInFrames = framesFor(s.type, seconds.get(s.id) ?? estimateSeconds(s.narration));
  }
  board.totalFrames = board.scenes.reduce((n, s) => n + s.durationInFrames, 0);
  return board;
}
