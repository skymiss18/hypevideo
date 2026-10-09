import type { Dataset, Fill, FundingEvent, Trade } from "../../shared/types.js";

const EPS = 1e-9;

interface Builder {
  trade: Trade;
  openCost: number;
  openSz: number;
  closeCost: number;
  closeSz: number;
}

function startBuilder(id: number, f: Fill, position: number, time: number, px: number): Builder {
  return {
    trade: {
      id,
      coin: f.coin,
      display: f.display,
      market: "perp",
      direction: position > 0 ? "long" : "short",
      openTime: time,
      closeTime: time,
      entryPx: px,
      exitPx: px,
      maxSize: Math.abs(position),
      maxNotional: Math.abs(position) * px,
      fills: [],
      grossPnl: 0,
      fees: 0,
      funding: 0,
      pnl: 0,
      liquidated: false,
      open: false,
    },
    openCost: 0,
    openSz: 0,
    closeCost: 0,
    closeSz: 0,
  };
}

function finish(b: Builder, closeTime: number, open: boolean): Trade {
  const t = b.trade;
  t.closeTime = closeTime;
  t.open = open;
  if (b.openSz > EPS) t.entryPx = b.openCost / b.openSz;
  if (b.closeSz > EPS) t.exitPx = b.closeCost / b.closeSz;
  else t.exitPx = t.fills.at(-1)?.px ?? t.entryPx;
  t.pnl = t.grossPnl - t.fees + t.funding;
  return t;
}

/** Rebuild position lifecycles from fills: flat -> ... -> flat is one trade. */
export function buildTrades(fills: Fill[], funding: FundingEvent[] = []): Trade[] {
  const trades: Trade[] = [];
  let nextId = 1;

  const byCoin = new Map<string, Fill[]>();
  for (const f of fills) {
    if (f.market === "spot") continue;
    const list = byCoin.get(f.coin);
    if (list) list.push(f);
    else byCoin.set(f.coin, [f]);
  }

  for (const list of byCoin.values()) {
    list.sort((a, b) => a.time - b.time || a.tid - b.tid);
    let cur: Builder | null = null;

    for (const f of list) {
      const signed = f.side === "B" ? f.sz : -f.sz;
      const before = f.startPosition;
      const after = before + signed;

      // A gap in history (before is flat while a trade is open) ends the dangling trade.
      if (cur && Math.abs(before) < EPS) {
        trades.push(finish(cur, cur.trade.fills.at(-1)?.time ?? f.time, false));
        cur = null;
      }
      if (!cur) cur = startBuilder(nextId++, f, Math.abs(before) < EPS ? signed : before, f.time, f.px);

      const t = cur.trade;
      t.fills.push(f);
      t.grossPnl += f.closedPnl;
      t.fees += f.fee;
      if (f.liquidation) t.liquidated = true;

      if (Math.abs(after) > Math.abs(before)) {
        cur.openCost += f.px * f.sz;
        cur.openSz += f.sz;
      } else {
        cur.closeCost += f.px * f.sz;
        cur.closeSz += f.sz;
      }
      if (Math.abs(after) > t.maxSize) t.maxSize = Math.abs(after);
      t.maxNotional = Math.max(t.maxNotional, Math.abs(after) * f.px, Math.abs(before) * f.px);

      const flipped = before * after < 0;
      if (Math.abs(after) < EPS || flipped) {
        trades.push(finish(cur, f.time, false));
        cur = null;
        if (flipped) cur = startBuilder(nextId++, f, after, f.time, f.px);
      }
    }
    if (cur && cur.trade.fills.length > 0) trades.push(finish(cur, cur.trade.fills.at(-1)!.time, true));
  }

  // Spot: only sells carry realized PnL, treat each as a standalone trade.
  for (const f of fills) {
    if (f.market !== "spot" || f.side !== "A" || f.closedPnl === 0) continue;
    const entry = f.sz > 0 ? f.px - f.closedPnl / f.sz : f.px;
    trades.push({
      id: nextId++,
      coin: f.coin,
      display: f.display,
      market: "spot",
      direction: "spot",
      openTime: f.time,
      closeTime: f.time,
      entryPx: entry,
      exitPx: f.px,
      maxSize: f.sz,
      maxNotional: f.sz * f.px,
      fills: [f],
      grossPnl: f.closedPnl,
      fees: f.fee,
      funding: 0,
      pnl: f.closedPnl - f.fee,
      liquidated: false,
      open: false,
    });
  }

  attachFunding(trades, funding);
  return trades.sort((a, b) => a.closeTime - b.closeTime || a.id - b.id);
}

function attachFunding(trades: Trade[], funding: FundingEvent[]) {
  if (funding.length === 0) return;
  const byCoin = new Map<string, FundingEvent[]>();
  for (const e of funding) {
    const list = byCoin.get(e.coin);
    if (list) list.push(e);
    else byCoin.set(e.coin, [e]);
  }
  for (const t of trades) {
    if (t.market !== "perp") continue;
    const events = byCoin.get(t.coin);
    if (!events) continue;
    const end = t.open ? Infinity : t.closeTime;
    let sum = 0;
    for (const e of events) if (e.time >= t.openTime && e.time <= end) sum += e.usdc;
    t.funding = sum;
    t.pnl = t.grossPnl - t.fees + t.funding;
  }
}

export function tradesFromDataset(data: Dataset): Trade[] {
  return buildTrades(data.fills, data.funding);
}
