import path from "node:path";
import { existsSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import type { Storyboard, VideoLanguage } from "../shared/types";

const ENTRY = path.resolve(import.meta.dirname, "../video/index.ts");
const COMPOSITION_ID = "Journey";

const BROWSER_CANDIDATES = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** Prefer an installed Chrome; Remotion's own download can be blocked on some networks. */
const localBrowser = BROWSER_CANDIDATES.find((p): p is string => !!p && existsSync(p)) ?? null;

let bundleUrl: Promise<string> | null = null;

function getBundle(): Promise<string> {
  bundleUrl ??= (async () => {
    if (!localBrowser) await ensureBrowser();
    return bundle({ entryPoint: ENTRY });
  })().catch((e) => {
    bundleUrl = null;
    throw e;
  });
  return bundleUrl;
}

export async function renderVideo(
  storyboard: Storyboard,
  outputLocation: string,
  language: VideoLanguage = "en",
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const serveUrl = await getBundle();
  const inputProps = { storyboard, subtitleLanguage: language };
  const browserExecutable = localBrowser;
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps, browserExecutable });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    browserExecutable,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}
