import type { Analysis, CurvePoint, Dataset, Drawdown, Stats, Trade } from "../../shared/types.js";
import { buildTrades } from "./positions.js";

const MAX_HIGHLIGHTS = 5;

/** Drop the empty lead-in before the account first had value or PnL. */
export function trimCurve(curve: CurvePoint[]): CurvePoint[] {
  const first = curve.findIndex((p) => p.accountValue !== 0 || p.pnl !== 0);
  if (first < 0) return [];
  return curve.slice(Math.max(0, first - 1));
}

/** Fallback when the portfolio endpoint is empty: cumulative net PnL by trade close. */
export function curveFromTrades(trades: Trade[]): CurvePoint[] {
  let pnl = 0;
  const out: CurvePoint[] = [];
  for (const t of trades) {
    pnl += t.pnl;
    out.push({ t: t.closeTime, pnl, accountValue: 0 });
  }
  return out;
}

/** Peak-to-trough drop on the PnL curve, so deposits and withdrawals do not distort it. */
export function maxDrawdown(curve: CurvePoint[]): Drawdown | null {
  if (curve.length < 2) return null;
  let peak = curve[0]!;
  let best: Drawdown | null = null;
  for (const p of curve) {
    if (p.pnl > peak.pnl) peak = p;
    const depth = peak.pnl - p.pnl;
    if (depth > 0 && (!best || depth > best.depth)) {
      const base = peak.accountValue > 0 ? peak.accountValue : 0;
      best = {
        peakTime: peak.t,
        troughTime: p.t,
        peakValue: peak.pnl,
        troughValue: p.pnl,
        depth,
        pct: base > 0 ? Math.min(1, depth / base) : 0,
      };
    }
  }
  return best;
}

function streaks(trades: Trade[]): { win: number; loss: number } {
  let win = 0;
  let loss = 0;
  let w = 0;
  let l = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      w++;
      l = 0;
    } else if (t.pnl < 0) {
      l++;
      w = 0;
    } else {
      w = 0;
      l = 0;
    }
    win = Math.max(win, w);
    loss = Math.max(loss, l);
  }
  return { win, loss };
}

export function pickHighlights(trades: Trade[], max = MAX_HIGHLIGHTS): Trade[] {
  const candidates = trades.filter((t) => t.pnl !== 0);
  if (candidates.length === 0) return [];

  const chosen = new Map<number, Trade>();
  const add = (t: Trade | undefined) => {
    if (t && chosen.size < max) chosen.set(t.id, t);
  };

  const byPnl = [...candidates].sort((a, b) => b.pnl - a.pnl);
  add(byPnl[0]!.pnl > 0 ? byPnl[0] : undefined);
  add(byPnl.at(-1)!.pnl < 0 ? byPnl.at(-1) : undefined);
  add(candidates.filter((t) => t.liquidated).sort((a, b) => a.pnl - b.pnl)[0]);

  for (const t of [...candidates].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))) add(t);

  return [...chosen.values()].sort((a, b) => a.openTime - b.openTime);
}

export function analyze(data: Dataset): Analysis {
  const trades = buildTrades(data.fills, data.funding);
  let curve = trimCurve(data.curve);
  if (curve.length < 2) curve = curveFromTrades(trades);

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const sorted = [...trades].sort((a, b) => b.pnl - a.pnl);
  const best = sorted[0] && sorted[0].pnl > 0 ? sorted[0] : null;
  const worst = sorted.at(-1) && sorted.at(-1)!.pnl < 0 ? sorted.at(-1)! : null;

  const volumeByCoin = new Map<string, number>();
  let totalVolume = 0;
  let totalFees = 0;
  for (const f of data.fills) {
    const v = f.px * f.sz;
    totalVolume += v;
    totalFees += f.fee;
    volumeByCoin.set(f.display, (volumeByCoin.get(f.display) ?? 0) + v);
  }
  const topCoin = [...volumeByCoin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const peak = curve.reduce<CurvePoint | null>((m, p) => (!m || p.pnl > m.pnl ? p : m), null);
  const last = curve.at(-1);
  const st = streaks(trades);

  const stats: Stats = {
    totalPnl: last?.pnl ?? 0,
    startTime: Math.min(data.fills[0]?.time ?? Infinity, curve[0]?.t ?? Infinity, Date.now()),
    endTime: last?.t ?? data.fills.at(-1)?.time ?? Date.now(),
    peakPnl: peak?.pnl ?? 0,
    peakPnlTime: peak?.t ?? 0,
    finalAccountValue: last?.accountValue ?? 0,
    tradeCount: trades.length,
    winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
    wins,
    losses,
    bestTrade: best,
    worstTrade: worst,
    liquidations: trades.filter((t) => t.liquidated).length,
    longestWinStreak: st.win,
    longestLossStreak: st.loss,
    totalVolume,
    topCoin,
    totalFees,
    maxDrawdown: maxDrawdown(curve),
  };

  return { stats, trades, highlights: pickHighlights(trades), curve };
}
