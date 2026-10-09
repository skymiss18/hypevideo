export type Market = "perp" | "spot";

export interface Fill {
  time: number;
  /** Raw API coin: "BTC", "xyz:TSLA", "@107", "PURR/USDC" */
  coin: string;
  /** Human-readable name, e.g. "HYPE/USDC" for spot */
  display: string;
  market: Market;
  px: number;
  sz: number;
  side: "B" | "A";
  dir: string;
  closedPnl: number;
  /** Fee in USD (only counted when paid in USDC) */
  fee: number;
  startPosition: number;
  liquidation: boolean;
  hash: string;
  tid: number;
}

export interface CurvePoint {
  t: number;
  /** Cumulative PnL in USD */
  pnl: number;
  accountValue: number;
}

export interface LedgerEvent {
  time: number;
  kind: "deposit" | "withdraw" | "other";
  usd: number;
}

export interface FundingEvent {
  time: number;
  coin: string;
  usdc: number;
}

export interface Dataset {
  address: string;
  fetchedAt: number;
  role: string;
  fills: Fill[];
  curve: CurvePoint[];
  ledger: LedgerEvent[];
  funding: FundingEvent[];
  /** True when the API's 10000-fill cap truncated the history */
  partial: boolean;
}

export interface Trade {
  id: number;
  coin: string;
  display: string;
  market: Market;
  direction: "long" | "short" | "spot";
  openTime: number;
  closeTime: number;
  entryPx: number;
  exitPx: number;
  maxSize: number;
  /** Peak notional in USD */
  maxNotional: number;
  fills: Fill[];
  grossPnl: number;
  fees: number;
  funding: number;
  /** grossPnl - fees + funding */
  pnl: number;
  liquidated: boolean;
  /** Position still open at end of history */
  open: boolean;
}

export interface Drawdown {
  peakTime: number;
  troughTime: number;
  peakValue: number;
  troughValue: number;
  /** Peak-to-trough drop in PnL USD */
  depth: number;
  /** Fraction of peak account value (0..1) */
  pct: number;
}

export interface Stats {
  totalPnl: number;
  startTime: number;
  endTime: number;
  peakPnl: number;
  peakPnlTime: number;
  finalAccountValue: number;
  tradeCount: number;
  winRate: number;
  wins: number;
  losses: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  liquidations: number;
  longestWinStreak: number;
  longestLossStreak: number;
  totalVolume: number;
  topCoin: string | null;
  totalFees: number;
  maxDrawdown: Drawdown | null;
}

export interface Analysis {
  stats: Stats;
  trades: Trade[];
  highlights: Trade[];
  curve: CurvePoint[];
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface Marker {
  t: number;
  label: string;
  value: number;
  kind: "peak" | "drawdown" | "liquidation" | "best" | "worst" | "deposit";
}

export interface SceneBase {
  id: string;
  durationInFrames: number;
  narration: string;
  narrationZh?: string;
  /** URL of the narration audio, if available */
  audioUrl?: string;
}

export interface IntroScene extends SceneBase {
  type: "intro";
  address: string;
  startTime: number;
  endTime: number;
  tradeCount: number;
  partial: boolean;
}

export interface EquityScene extends SceneBase {
  type: "equity";
  points: CurvePoint[];
  markers: Marker[];
  totalPnl: number;
}

export interface TradeSceneFill {
  t: number;
  px: number;
  side: "B" | "A";
  label: string;
}

export interface TradeScene extends SceneBase {
  type: "trade";
  rank: number;
  display: string;
  direction: Trade["direction"];
  openTime: number;
  closeTime: number;
  entryPx: number;
  exitPx: number;
  pnl: number;
  maxNotional: number;
  liquidated: boolean;
  candles: Candle[];
  fills: TradeSceneFill[];
  title: string;
}

export interface DrawdownScene extends SceneBase {
  type: "drawdown";
  points: CurvePoint[];
  drawdown: Drawdown;
}

export interface OutroScene extends SceneBase {
  type: "outro";
  totalPnl: number;
  winRate: number;
  tradeCount: number;
  bestPnl: number;
  worstPnl: number;
  address: string;
  hideAmounts: boolean;
}

export type Scene = IntroScene | EquityScene | TradeScene | DrawdownScene | OutroScene;

export interface Storyboard {
  address: string;
  fps: number;
  width: number;
  height: number;
  hideAmounts: boolean;
  scenes: Scene[];
  totalFrames: number;
}

export type JobStatus = "queued" | "fetching" | "analyzing" | "narrating" | "rendering" | "done" | "error";

export interface JobInfo {
  id: string;
  address: string;
  status: JobStatus;
  /** 0..1 within the whole pipeline */
  progress: number;
  message: string;
  error?: string;
  storyboard?: Storyboard;
  stats?: Pick<Stats, "totalPnl" | "tradeCount" | "winRate" | "liquidations">;
  videoUrl?: string;
}

export interface JobOptions {
  hideAmounts: boolean;
  /** Target video length in seconds (clamped 60..180) */
  targetSeconds: number;
  tts: boolean;
}

export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
