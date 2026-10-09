import { afterEach, describe, expect, it, vi } from "vitest";
import { pickInterval } from "../server/hyperliquid/candles";
import { fetchDataset } from "../server/hyperliquid/fetchers";
import { buildStoryboard, downsample, estimateSeconds } from "../server/story/storyboard";
import { analyze } from "../server/analysis/stats";
import { money, spokenMoney } from "../shared/format";
import type { Dataset, Fill } from "../shared/types";

describe("pickInterval", () => {
  const now = Date.UTC(2026, 0, 1);
  it("uses the smallest interval that keeps the chart under 120 candles", () => {
    expect(pickInterval(now - 3_600_000, now, now)?.name).toBe("1m");
    expect(pickInterval(now - 10 * 86_400_000, now, now)?.name).toBe("2h");
  });
  it("gives up when no supported interval fits the window", () => {
    expect(pickInterval(now - 3 * 365 * 86_400_000, now, now)).toBeNull();
  });
  it("picks a coarser interval for old windows that fit the API retention", () => {
    expect(pickInterval(now - 5 * 365 * 86_400_000, now - 5 * 365 * 86_400_000 + 86_400_000, now)?.name).toBe("12h");
  });
});

describe("format", () => {
  it("abbreviates amounts and phrases them for speech", () => {
    expect(money(1_234_567, false, { sign: true })).toBe("+$1.23M");
    expect(money(-42.5)).toBe("-$42.50");
    expect(money(5, true)).toBe("$•••");
    expect(spokenMoney(37_400)).toBe("37 thousand dollars");
    expect(spokenMoney(-1_250_000)).toBe("1.3 million dollars");
  });
});

describe("downsample", () => {
  it("keeps spikes and endpoints", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i, pnl: i === 500 ? 9999 : 0, accountValue: 0 }));
    const out = downsample(pts, 100);
    expect(out.length).toBeLessThanOrEqual(110);
    expect(out[0]!.t).toBe(0);
    expect(out.at(-1)!.t).toBe(999);
    expect(out.some((p) => p.pnl === 9999)).toBe(true);
  });
});

describe("storyboard", () => {
  const fills: Fill[] = [];
  for (let i = 0; i < 8; i++) {
    const coin = `C${i}`;
    const base = { coin, display: coin, market: "perp" as const, px: 100, dir: "", fee: 0, liquidation: false, hash: "0x" };
    fills.push({ ...base, tid: i * 2, time: i * 1e8, side: "B", sz: 1, startPosition: 0, closedPnl: 0 });
    fills.push({ ...base, tid: i * 2 + 1, time: i * 1e8 + 3_600_000, side: "A", sz: 1, startPosition: 1, closedPnl: (i % 2 ? -1 : 1) * (i + 1) * 100 });
  }
  const curve = fills.filter((f) => f.closedPnl).map((f, i, arr) => ({ t: f.time, pnl: arr.slice(0, i + 1).reduce((s, x) => s + x.closedPnl, 0), accountValue: 5000 }));
  const data: Dataset = { address: "0x" + "ab".repeat(20), fetchedAt: 0, role: "user", fills, curve: [{ t: 0, pnl: 0, accountValue: 5000 }, ...curve], ledger: [], funding: [], partial: false };
  const analysis = analyze(data);

  it("orders scenes intro -> equity -> trades -> outro and respects the target length", () => {
    const board = buildStoryboard({ data, analysis, candles: new Map(), hideAmounts: false, targetSeconds: 60 });
    const types = board.scenes.map((s) => s.type);
    expect(types[0]).toBe("intro");
    expect(types[1]).toBe("equity");
    expect(types.at(-1)).toBe("outro");
    expect(board.totalFrames / board.fps).toBeLessThanOrEqual(75);
    expect(board.totalFrames).toBe(board.scenes.reduce((n, s) => n + s.durationInFrames, 0));
  });

  it("keeps dollar figures out of narration when amounts are hidden", () => {
    const board = buildStoryboard({ data, analysis, candles: new Map(), hideAmounts: true, targetSeconds: 180 });
    for (const s of board.scenes) expect(s.narration).not.toMatch(/dollars|\$/);
  });

  it("estimates speech duration from word count", () => {
    expect(estimateSeconds("one two three four five")).toBeGreaterThan(1.5);
  });
});

describe("fetchDataset pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages userFillsByTime past 2000 fills, dedupes, and flags partial at the 10k cap", async () => {
    const mkFill = (n: number) => ({ coin: "BTC", px: "1", sz: "1", side: "B", time: 1000 + n, startPosition: "0", dir: "Open Long", closedPnl: "0", hash: "0x", tid: n, fee: "0", feeToken: "USDC" });
    const all = Array.from({ length: 10_000 }, (_, i) => mkFill(i));
    const starts: number[] = [];

    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { type: string; startTime?: number };
      let payload: unknown = [];
      if (body.type === "userRole") payload = { role: "user" };
      else if (body.type === "spotMeta") payload = { universe: [], tokens: [] };
      else if (body.type === "userFillsByTime") {
        starts.push(body.startTime!);
        payload = all.filter((f) => f.time >= body.startTime!).slice(0, 2000);
      }
      return { ok: true, status: 200, json: async () => payload, text: async () => "" };
    });

    const data = await fetchDataset("0x" + "1".repeat(40));
    expect(data.fills).toHaveLength(10_000);
    expect(new Set(data.fills.map((f) => f.tid)).size).toBe(10_000);
    expect(data.partial).toBe(true);
    expect(starts.length).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it("swaps an agent wallet for its master account", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { type: string; user?: string };
      let payload: unknown = [];
      if (body.type === "userRole") payload = body.user === "0xagent" + "0".repeat(34) ? { role: "agent", data: { user: "0xMASTER" } } : { role: "user" };
      else if (body.type === "spotMeta") payload = { universe: [], tokens: [] };
      return { ok: true, status: 200, json: async () => payload, text: async () => "" };
    });
    const data = await fetchDataset("0xagent" + "0".repeat(34));
    expect(data.address).toBe("0xmaster");
    expect(data.resolvedFrom).toBeDefined();
  });
});
