import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseBuffer } from "music-metadata";
import type { Storyboard } from "../../shared/types.js";
import { applyNarrationDurations } from "./storyboard.js";

const VOICE = "en-US-AndrewNeural";

async function synthesize(text: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  } finally {
    tts.close();
  }
}

/**
 * Synthesize narration per scene into `dir` and size scenes to fit.
 * A scene whose synthesis fails keeps its estimated duration and no audio.
 */
export async function narrateStoryboard(
  board: Storyboard,
  dir: string,
  audioUrl: (file: string) => string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ board: Storyboard; failures: number }> {
  await mkdir(dir, { recursive: true });
  const seconds = new Map<string, number>();
  let failures = 0;
  let done = 0;

  for (const scene of board.scenes) {
    try {
      let buf: Buffer | null = null;
      for (let attempt = 0; attempt < 2 && !buf?.length; attempt++) buf = await synthesize(scene.narration);
      if (!buf?.length) throw new Error("empty audio");
      const meta = await parseBuffer(buf, "audio/mpeg");
      const file = `${scene.id}.mp3`;
      await writeFile(path.join(dir, file), buf);
      scene.audioUrl = audioUrl(file);
      if (meta.format.duration) seconds.set(scene.id, meta.format.duration);
    } catch {
      failures++;
    }
    onProgress?.(++done, board.scenes.length);
  }

  return { board: applyNarrationDurations(board, seconds), failures };
}
