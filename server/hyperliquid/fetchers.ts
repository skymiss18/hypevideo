import type { CurvePoint, Dataset, Fill, FundingEvent, LedgerEvent } from "../../shared/types.js";
import { info } from "./client.js";

interface RawFill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  tid: number;
  fee: string;
  feeToken?: string;
}

interface SpotMeta {
  universe: { name: string; index: number; tokens: [number, number] }[];
  tokens: { name: string; index: number }[];
}

export const FILL_CAP = 10_000;
const FILL_PAGE = 2000;
const LEDGER_PAGE = 500;

export interface ResolvedUser {
  address: string;
  role: string;
  /** Set when the input was an agent wallet and was swapped for its master */
  resolvedFrom?: string;
}

export async function resolveUser(address: string): Promise<ResolvedUser> {
  const res = await info<{ role: string; data?: { user?: string; master?: string } }>({
    type: "userRole",
    user: address,
  });
  if (res.role === "missing") {
    throw new Error("No Hyperliquid account exists for this address.");
  }
  if (res.role === "agent" && res.data?.user) {
    return { address: res.data.user.toLowerCase(), role: "user", resolvedFrom: address };
  }
  return { address: address.toLowerCase(), role: res.role };
}

async function loadSpotNames(): Promise<Map<string, string>> {
  const meta = await info<SpotMeta>({ type: "spotMeta" });
  const tokenName = new Map(meta.tokens.map((t) => [t.index, t.name]));
  const names = new Map<string, string>();
  for (const pair of meta.universe) {
    const base = tokenName.get(pair.tokens[0]) ?? "?";
    const quote = tokenName.get(pair.tokens[1]) ?? "USDC";
    names.set(pair.name, `${base}/${quote}`);
  }
  return names;
}

export function normalizeFill(raw: RawFill, spotNames: Map<string, string>): Fill {
  const isSpot = raw.coin.startsWith("@") || raw.coin.includes("/");
  const display = isSpot ? (spotNames.get(raw.coin) ?? raw.coin) : raw.coin;
  const dir = raw.dir ?? "";
  return {
    time: raw.time,
    coin: raw.coin,
    display,
    market: isSpot ? "spot" : "perp",
    px: Number(raw.px),
    sz: Number(raw.sz),
    side: raw.side,
    dir,
    closedPnl: Number(raw.closedPnl) || 0,
    fee: !raw.feeToken || raw.feeToken.trim() === "USDC" ? Number(raw.fee) || 0 : 0,
    startPosition: Number(raw.startPosition) || 0,
    liquidation: /liquidat/i.test(dir),
    hash: raw.hash,
    tid: raw.tid,
  };
}

async function fetchFills(user: string, spotNames: Map<string, string>): Promise<Fill[]> {
  const seen = new Set<number>();
  const out: Fill[] = [];
  let start = 0;
  for (let page = 0; page < 8; page++) {
    const batch = await info<RawFill[]>({ type: "userFillsByTime", user, startTime: start, aggregateByTime: true });
    if (batch.length === 0) break;
    let added = 0;
    for (const raw of batch) {
      const key = raw.tid;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalizeFill(raw, spotNames));
      added++;
    }
    const last = batch[batch.length - 1]!.time;
    if (batch.length < FILL_PAGE) break;
    // Inclusive startTime: reuse last timestamp, but never loop on a page of duplicates.
    start = added === 0 ? last + 1 : last;
  }
  return out.sort((a, b) => a.time - b.time || a.tid - b.tid);
}

async function fetchCurve(user: string): Promise<CurvePoint[]> {
  const res = await info<[string, { accountValueHistory: [number, string][]; pnlHistory: [number, string][] }][]>({
    type: "portfolio",
    user,
  });
  const all = res.find(([name]) => name === "allTime")?.[1];
  if (!all) return [];
  const values = new Map(all.accountValueHistory.map(([t, v]) => [t, Number(v)]));
  return all.pnlHistory.map(([t, v]) => ({ t, pnl: Number(v), accountValue: values.get(t) ?? 0 }));
}

async function fetchLedger(user: string, startTime: number): Promise<LedgerEvent[]> {
  const out: LedgerEvent[] = [];
  let start = startTime;
  for (let page = 0; page < 20; page++) {
    const batch = await info<{ time: number; delta: { type: string; usdc?: string } }[]>({
      type: "userNonFundingLedgerUpdates",
      user,
      startTime: start,
    });
    for (const e of batch) {
      const kind = e.delta.type === "deposit" ? "deposit" : e.delta.type === "withdraw" ? "withdraw" : "other";
      out.push({ time: e.time, kind, usd: Number(e.delta.usdc) || 0 });
    }
    if (batch.length < LEDGER_PAGE) break;
    start = batch[batch.length - 1]!.time + 1;
  }
  return out;
}

async function fetchFunding(user: string, startTime: number): Promise<FundingEvent[]> {
  const out: FundingEvent[] = [];
  let start = startTime;
  // Funding is secondary data; cap the pages so heavy accounts do not stall the pipeline.
  for (let page = 0; page < 20; page++) {
    const batch = await info<{ time: number; delta: { coin: string; usdc: string } }[]>({
      type: "userFunding",
      user,
      startTime: start,
    });
    for (const e of batch) out.push({ time: e.time, coin: e.delta.coin, usdc: Number(e.delta.usdc) || 0 });
    if (batch.length < LEDGER_PAGE) break;
    start = batch[batch.length - 1]!.time + 1;
  }
  return out;
}

export async function fetchDataset(
  address: string,
  onProgress?: (message: string) => void,
): Promise<Dataset & { resolvedFrom?: string }> {
  onProgress?.("Resolving account");
  const user = await resolveUser(address);

  onProgress?.("Loading markets");
  const spotNames = await loadSpotNames();

  onProgress?.("Downloading fills");
  const fills = await fetchFills(user.address, spotNames);

  onProgress?.("Loading PnL history");
  const curve = await fetchCurve(user.address);

  const since = fills[0]?.time ?? curve[0]?.t ?? 0;
  onProgress?.("Loading transfers and funding");
  const [ledger, funding] = await Promise.all([fetchLedger(user.address, since), fetchFunding(user.address, since)]);

  return {
    address: user.address,
    resolvedFrom: user.resolvedFrom,
    fetchedAt: Date.now(),
    role: user.role,
    fills,
    curve,
    ledger,
    funding,
    partial: fills.length >= FILL_CAP,
  };
}
