import { mkdir } from "node:fs/promises";
import { ADDRESS_RE } from "../shared/types";
import { jobsDir } from "./cache.js";
import { runPipeline } from "./pipeline.js";

const args = process.argv.slice(2);
const address = args.find((a) => ADDRESS_RE.test(a));
if (!address) {
  console.error("Usage: npm run cli -- <0xAddress> [--no-tts] [--hide] [--seconds=120]");
  process.exit(1);
}

const seconds = Number(args.find((a) => a.startsWith("--seconds="))?.split("=")[1] ?? 120);
const id = `cli-${address.slice(2, 10)}`;
await mkdir(jobsDir, { recursive: true });

// Audio is read by the renderer from disk-served URLs, so CLI runs need the server for narration.
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const result = await runPipeline(
  id,
  address,
  { hideAmounts: args.includes("--hide"), tts: !args.includes("--no-tts"), targetSeconds: seconds },
  baseUrl,
  (status, progress, message) => console.log(`[${Math.round(progress * 100)}%] ${status}: ${message}`),
  () => {},
);
console.log(`Video: ${result.videoFile}`);
console.log(result.stats);
