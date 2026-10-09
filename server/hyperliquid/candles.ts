import type { Candle } from "../../shared/types.js";
import { info } from "./client.js";

const INTERVALS: [string, number][] = [
  ["1m", 60_000],
  ["3m", 180_000],
  ["5m", 300_000],
  ["15m", 900_000],
  ["30m", 1_800_000],
  ["1h", 3_600_000],
  ["2h", 7_200_000],
  ["4h", 14_400_000],
  ["8h", 28_800_000],
  ["12h", 43_200_000],
  ["1d", 86_400_000],
  ["3d", 259_200_000],
  ["1w", 604_800_000],
];

const TARGET_MAX = 120;
const API_CANDLE_LIMIT = 5000;

export function pickInterval(start: number, end: number, now = Date.now()): { name: string; ms: number } | null {
  for (const [name, ms] of INTERVALS) {
    const count = (end - start) / ms;
    if (count <= TARGET_MAX && (now - start) / ms <= API_CANDLE_LIMIT) return { name, ms };
  }
  return null;
}

/** Candles around a trade; null when the window is outside what the API keeps. */
export async function fetchTradeCandles(coin: string, openTime: number, closeTime: number): Promise<Candle[] | null> {
  const span = Math.max(closeTime - openTime, 15 * 60_000);
  const pad = span * 0.35;
  const start = Math.floor(openTime - pad);
  const end = Math.min(Math.ceil(closeTime + pad), Date.now());
  const interval = pickInterval(start, end);
  if (!interval) return null;

  try {
    const raw = await info<{ t: number; o: string; h: string; l: string; c: string }[]>({
      type: "candleSnapshot",
      req: { coin, interval: interval.name, startTime: start, endTime: end },
    });
    const candles = raw.map((c) => ({ t: c.t, o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c) }));
    return candles.length >= 3 ? candles : null;
  } catch {
    return null;
  }
}
