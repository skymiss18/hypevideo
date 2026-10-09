import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Candle, JobInfo, JobOptions, JobStatus } from "../shared/types";
import { analyze } from "./analysis/stats.js";
import { loadDataset, jobsDir } from "./cache.js";
import { fetchTradeCandles } from "./hyperliquid/candles.js";
import { renderVideo } from "./render.js";
import { buildStoryboard } from "./story/storyboard.js";
import { narrateStoryboard } from "./story/tts.js";

export type Report = (status: JobStatus, progress: number, message: string) => void;

export interface PipelineResult {
  storyboard: NonNullable<JobInfo["storyboard"]>;
  stats: NonNullable<JobInfo["stats"]>;
  videoFile: string;
}

export class UserFacingError extends Error {}

/** address -> dataset -> analysis -> storyboard -> narration -> MP4 */
export async function runPipeline(
  jobId: string,
  address: string,
  options: JobOptions,
  baseUrl: string,
  report: Report,
  onStoryboard: (storyboard: PipelineResult["storyboard"], stats: PipelineResult["stats"]) => void,
): Promise<PipelineResult> {
  report("fetching", 0.02, "Fetching Hyperliquid history");
  const data = await loadDataset(address, (m) => report("fetching", 0.05, m));

  report("analyzing", 0.2, "Analyzing trades");
  const analysis = analyze(data);
  if (analysis.trades.length === 0 && analysis.curve.length < 2) {
    throw new UserFacingError("This address has no trading history on Hyperliquid.");
  }

  const candles = new Map<number, Candle[] | null>();
  let done = 0;
  for (const t of analysis.highlights) {
    candles.set(t.id, await fetchTradeCandles(t.coin, t.openTime, t.closeTime));
    report("analyzing", 0.2 + 0.1 * (++done / analysis.highlights.length), `Loading charts (${done}/${analysis.highlights.length})`);
  }

  const storyboard = buildStoryboard({
    data,
    analysis,
    candles,
    hideAmounts: options.hideAmounts,
    targetSeconds: options.targetSeconds,
  });

  const jobDir = path.join(jobsDir, jobId);
  await mkdir(jobDir, { recursive: true });

  if (options.tts) {
    report("narrating", 0.32, "Recording narration");
    await narrateStoryboard(
      storyboard,
      path.join(jobDir, "audio"),
      options.language,
      (file) => `/files/${jobId}/audio/${file}`,
      (n, total) => report("narrating", 0.32 + 0.13 * (n / total), `Recording narration (${n}/${total})`),
    );
  }

  const { stats: s } = analysis;
  const stats = { totalPnl: s.totalPnl, tradeCount: s.tradeCount, winRate: s.winRate, liquidations: s.liquidations };
  onStoryboard(storyboard, stats);

  report("rendering", 0.45, "Rendering video");
  const videoFile = path.join(jobDir, "journey.mp4");
  await renderVideo(storyboard, videoFile, options.language, baseUrl, (f) => report("rendering", 0.45 + 0.55 * f, `Rendering video ${Math.round(f * 100)}%`));

  return { storyboard, videoFile, stats };
}
