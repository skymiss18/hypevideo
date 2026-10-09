import { dateLabel, durationText, money, monthLabel, shortAddress, spokenMoney } from "../../shared/format.js";
import type { Drawdown, Stats, Trade } from "../../shared/types.js";

const spellTail = (address: string) => address.slice(-4).toUpperCase().split("").join(" ");

/** "xyz:MU" -> "MU", "HYPE/USDC" -> "HYPE" so the voice does not read symbols out. */
const speakCoin = (display: string) => display.replace(/^[^:]+:/, "").replace(/\/USDC$/, "").replace("/", " ");

function result(pnl: number, hide: boolean): string {
  if (hide) return pnl >= 0 ? "a profit" : "a loss";
  return pnl >= 0 ? `a profit of ${spokenMoney(pnl)}` : `a loss of ${spokenMoney(pnl)}`;
}

export function introNarration(p: {
  address: string;
  startTime: number;
  endTime: number;
  tradeCount: number;
  totalPnl: number;
  partial: boolean;
  hide: boolean;
}): string {
  const span = durationText(Math.max(p.endTime - p.startTime, 60_000));
  const parts = [
    `This is the trading journey of the Hyperliquid wallet ending in ${spellTail(p.address)}.`,
    `Over ${span}, it made ${p.tradeCount} trades, and finished with ${result(p.totalPnl, p.hide)}.`,
  ];
  if (p.partial) parts.push("Only the most recent ten thousand fills are available, so earlier history is not shown.");
  return parts.join(" ");
}

export function equityNarration(s: Stats, hide: boolean): string {
  const peakText = hide ? "" : ` at ${spokenMoney(s.peakPnl)}`;
  if (s.totalPnl >= 0 && s.peakPnl - s.totalPnl < Math.abs(s.peakPnl) * 0.15) {
    return `Here is the full profit and loss curve. The climb reached its high${peakText} in ${monthLabel(s.peakPnlTime)}, and the account held most of it.`;
  }
  if (s.peakPnl > 0 && s.totalPnl < s.peakPnl) {
    return `Here is the full profit and loss curve. The account peaked${peakText} in ${monthLabel(s.peakPnlTime)}, then gave a lot of it back.`;
  }
  return "Here is the full profit and loss curve, one swing at a time.";
}

export function tradeNarration(t: Trade, rank: number, total: number, hide: boolean): string {
  const lead = rank === 1 ? "First" : rank === total ? "Last" : "Next";
  const win = t.pnl >= 0;
  const what =
    t.direction === "spot"
      ? `a spot sale of ${speakCoin(t.display)}`
      : `a ${t.direction} on ${speakCoin(t.display)}, held for ${durationText(t.closeTime - t.openTime)}`;
  const outcome = hide
    ? win
      ? "It paid off."
      : "It went wrong."
    : win
      ? `It made ${spokenMoney(t.pnl)}.`
      : `It lost ${spokenMoney(t.pnl)}.`;
  const tail = t.liquidated ? " The position was liquidated." : "";
  return `${lead} highlight: ${what}. ${outcome}${tail}`;
}

export function drawdownNarration(d: Drawdown, hide: boolean): string {
  const amount = hide ? "a large part of its gains" : spokenMoney(d.depth);
  const pct = d.pct >= 0.05 ? `, about ${Math.round(d.pct * 100)} percent of the account` : "";
  return `The roughest stretch ran from ${dateLabel(d.peakTime)} to ${dateLabel(d.troughTime)}. The account gave back ${amount}${pct}.`;
}

export function outroNarration(s: Stats, hide: boolean): string {
  const parts = [`In total, ${result(s.totalPnl, hide)}, with a ${Math.round(s.winRate * 100)} percent win rate across ${s.tradeCount} trades.`];
  if (s.liquidations > 0) {
    parts.push(s.liquidations === 1 ? "There was one liquidation along the way." : `There were ${s.liquidations} liquidations along the way.`);
  }
  if (s.bestTrade && s.worstTrade && !hide) {
    parts.push(`The best trade made ${spokenMoney(s.bestTrade.pnl)}, and the worst lost ${spokenMoney(s.worstTrade.pnl)}.`);
  }
  parts.push("That is the journey.");
  return parts.join(" ");
}

function zhResult(pnl: number, hide: boolean): string {
  if (hide) return pnl >= 0 ? "盈利" : "亏损";
  return pnl >= 0 ? `盈利 ${money(pnl, false, { sign: true })}` : `亏损 ${money(pnl, false)}`;
}

export function introNarrationZh(p: {
  address: string;
  startTime: number;
  endTime: number;
  tradeCount: number;
  totalPnl: number;
  partial: boolean;
  hide: boolean;
}): string {
  const span = durationText(Math.max(p.endTime - p.startTime, 60_000));
  const parts = [
    `这是 Hyperliquid 钱包 ${shortAddress(p.address)} 的交易旅程。`,
    `在 ${span} 期间，它完成了 ${p.tradeCount} 笔交易，最终${zhResult(p.totalPnl, p.hide)}。`,
  ];
  if (p.partial) parts.push("由于接口限制，这里只展示最近一万笔成交记录。");
  return parts.join(" ");
}

export function equityNarrationZh(s: Stats, hide: boolean): string {
  const peakText = hide ? "" : `，达到 ${money(s.peakPnl, false, { sign: true })}`;
  if (s.totalPnl >= 0 && s.peakPnl - s.totalPnl < Math.abs(s.peakPnl) * 0.15) {
    return `这是完整的盈亏曲线。账户在 ${monthLabel(s.peakPnlTime)} 达到高点${peakText}，并保住了大部分收益。`;
  }
  if (s.peakPnl > 0 && s.totalPnl < s.peakPnl) {
    return `这是完整的盈亏曲线。账户在 ${monthLabel(s.peakPnlTime)} 达到高点${peakText}，随后回吐了相当一部分收益。`;
  }
  return "这是完整的盈亏曲线，展示了账户的一次次波动。";
}

export function tradeNarrationZh(t: Trade, rank: number, total: number, hide: boolean): string {
  const lead = rank === 1 ? "第一个" : rank === total ? "最后一个" : "下一个";
  const coin = speakCoin(t.display);
  const what = t.direction === "spot" ? `${coin} 的现货卖出` : `${coin} 的${t.direction === "long" ? "多头" : "空头"}仓位，持仓 ${durationText(t.closeTime - t.openTime)}`;
  const outcome = hide ? (t.pnl >= 0 ? "这笔交易最终盈利。" : "这笔交易最终亏损。") : (t.pnl >= 0 ? `这笔交易盈利 ${money(t.pnl, false, { sign: true })}。` : `这笔交易亏损 ${money(t.pnl, false)}。`);
  const tail = t.liquidated ? "仓位最终被强制清算。" : "";
  return `${lead}个重点交易：${what}。${outcome}${tail}`;
}

export function drawdownNarrationZh(d: Drawdown, hide: boolean): string {
  const amount = hide ? "一大部分收益" : money(d.depth, false);
  const pct = d.pct >= 0.05 ? `，约占账户的 ${Math.round(d.pct * 100)}%` : "";
  return `最艰难的阶段从 ${dateLabel(d.peakTime)} 持续到 ${dateLabel(d.troughTime)}。账户回吐了 ${amount}${pct}。`;
}

export function outroNarrationZh(s: Stats, hide: boolean): string {
  const parts = [`总计${zhResult(s.totalPnl, hide)}，在 ${s.tradeCount} 笔交易中的胜率为 ${Math.round(s.winRate * 100)}%。`];
  if (s.liquidations > 0) parts.push(`期间发生了 ${s.liquidations} 次强制清算。`);
  if (s.bestTrade && s.worstTrade && !hide) {
    parts.push(`最佳交易盈利 ${money(s.bestTrade.pnl, false, { sign: true })}，最差交易亏损 ${money(s.worstTrade.pnl, false)}。`);
  }
  parts.push("这就是这段交易旅程。");
  return parts.join(" ");
}
