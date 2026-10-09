import { describe, expect, it } from "vitest";
import type { Fill } from "../shared/types";
import { buildTrades } from "../server/analysis/positions";
import { analyze, maxDrawdown, pickHighlights, trimCurve } from "../server/analysis/stats";

let tid = 0;
function fill(p: Partial<Fill> & Pick<Fill, "side" | "sz" | "startPosition" | "time">): Fill {
  return {
    coin: "BTC",
    display: "BTC",
    market: "perp",
    px: 100,
    dir: "",
    closedPnl: 0,
    fee: 0,
    liquidation: false,
    hash: "0x",
    tid: ++tid,
    ...p,
  };
}

describe("buildTrades", () => {
  it("groups open, add and close fills into one trade with net PnL", () => {
    const trades = buildTrades([
      fill({ time: 1, side: "B", sz: 1, startPosition: 0, px: 100, fee: 0.5 }),
      fill({ time: 2, side: "B", sz: 1, startPosition: 1, px: 110, fee: 0.5 }),
      fill({ time: 3, side: "A", sz: 2, startPosition: 2, px: 120, closedPnl: 30, fee: 1 }),
    ]);
    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.direction).toBe("long");
    expect(t.entryPx).toBeCloseTo(105);
    expect(t.exitPx).toBe(120);
    expect(t.maxSize).toBe(2);
    expect(t.pnl).toBeCloseTo(28);
    expect(t.open).toBe(false);
  });

  it("splits at a position flip and keeps the remainder as a new trade", () => {
    const trades = buildTrades([
      fill({ time: 1, side: "B", sz: 1, startPosition: 0 }),
      fill({ time: 2, side: "A", sz: 3, startPosition: 1, px: 90, closedPnl: -10 }),
      fill({ time: 3, side: "B", sz: 2, startPosition: -2, px: 80, closedPnl: 20 }),
    ]);
    expect(trades.map((t) => t.direction)).toEqual(["long", "short"]);
    expect(trades[0]!.pnl).toBe(-10);
    expect(trades[1]!.pnl).toBe(20);
    expect(trades[1]!.fills).toHaveLength(1);
  });

  it("flags liquidations and treats a trailing position as open", () => {
    const trades = buildTrades([
      fill({ time: 1, side: "A", sz: 1, startPosition: 0 }),
      fill({ time: 2, side: "B", sz: 1, startPosition: -1, px: 150, closedPnl: -50, dir: "Liquidated Cross Short", liquidation: true }),
      fill({ time: 3, side: "B", sz: 1, startPosition: 0, coin: "ETH", display: "ETH" }),
    ]);
    const btc = trades.find((t) => t.coin === "BTC")!;
    expect(btc.liquidated).toBe(true);
    expect(btc.direction).toBe("short");
    expect(trades.find((t) => t.coin === "ETH")!.open).toBe(true);
  });

  it("adds funding that falls inside the holding window", () => {
    const trades = buildTrades(
      [
        fill({ time: 10, side: "B", sz: 1, startPosition: 0 }),
        fill({ time: 20, side: "A", sz: 1, startPosition: 1, closedPnl: 5 }),
      ],
      [
        { time: 5, coin: "BTC", usdc: -100 },
        { time: 15, coin: "BTC", usdc: -2 },
        { time: 15, coin: "ETH", usdc: -9 },
      ],
    );
    expect(trades[0]!.funding).toBe(-2);
    expect(trades[0]!.pnl).toBe(3);
  });

  it("turns spot sells into standalone trades and ignores spot buys", () => {
    const trades = buildTrades([
      fill({ time: 1, market: "spot", coin: "@107", display: "HYPE/USDC", side: "B", sz: 10, startPosition: 0 }),
      fill({ time: 2, market: "spot", coin: "@107", display: "HYPE/USDC", side: "A", sz: 10, startPosition: 10, px: 20, closedPnl: 50, fee: 0.2 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.direction).toBe("spot");
    expect(trades[0]!.pnl).toBeCloseTo(49.8);
    expect(trades[0]!.entryPx).toBeCloseTo(15);
  });
});

describe("curve analytics", () => {
  const curve = [0, 100, 300, 120, 50, 400].map((pnl, i) => ({ t: i * 1000, pnl, accountValue: 1000 + pnl }));

  it("finds the deepest peak-to-trough drop on the PnL curve", () => {
    const dd = maxDrawdown(curve)!;
    expect(dd.depth).toBe(250);
    expect(dd.peakTime).toBe(2000);
    expect(dd.troughTime).toBe(4000);
    expect(dd.pct).toBeCloseTo(250 / 1300);
  });

  it("returns null when the curve never drops", () => {
    expect(maxDrawdown(curve.slice(0, 3))).toBeNull();
  });

  it("trims the empty lead-in but keeps one zero point", () => {
    const lead = [{ t: 0, pnl: 0, accountValue: 0 }, { t: 1, pnl: 0, accountValue: 0 }, { t: 2, pnl: 0, accountValue: 10 }, { t: 3, pnl: 5, accountValue: 15 }];
    expect(trimCurve(lead).map((p) => p.t)).toEqual([1, 2, 3]);
  });
});

describe("highlights and stats", () => {
  it("always includes best, worst and liquidated trades, in chronological order", () => {
    const fills: Fill[] = [];
    const pnls = [10, -5, 300, -200, 20, -900, 15];
    pnls.forEach((p, i) => {
      const coin = `C${i}`;
      fills.push(fill({ coin, display: coin, time: i * 100 + 1, side: "B", sz: 1, startPosition: 0 }));
      fills.push(fill({ coin, display: coin, time: i * 100 + 50, side: "A", sz: 1, startPosition: 1, closedPnl: p, liquidation: i === 3, dir: i === 3 ? "Liquidated Long" : "Close Long" }));
    });
    const { trades } = analyze({ address: "0x", fetchedAt: 0, role: "user", fills, curve: [], ledger: [], funding: [], partial: false });
    const picked = pickHighlights(trades, 3);
    expect(picked.map((t) => t.coin)).toEqual(["C2", "C3", "C5"]);
  });

  it("computes win rate and streaks from trades", () => {
    const fills: Fill[] = [];
    [5, 5, -1, 5, 5, 5, -2].forEach((p, i) => {
      fills.push(fill({ time: i * 10 + 1, side: "B", sz: 1, startPosition: 0 }));
      fills.push(fill({ time: i * 10 + 2, side: "A", sz: 1, startPosition: 1, closedPnl: p }));
    });
    const { stats } = analyze({ address: "0x", fetchedAt: 0, role: "user", fills, curve: [], ledger: [], funding: [], partial: false });
    expect(stats.tradeCount).toBe(7);
    expect(stats.winRate).toBeCloseTo(5 / 7);
    expect(stats.longestWinStreak).toBe(3);
    expect(stats.longestLossStreak).toBe(1);
    expect(stats.totalPnl).toBe(22);
  });
});
