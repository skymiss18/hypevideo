import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Dataset } from "../shared/types";
import { fetchDataset } from "./hyperliquid/fetchers.js";

const CACHE_DIR = path.resolve(import.meta.dirname, "../.cache");
const DATA_TTL_MS = 15 * 60_000;

export const jobsDir = path.join(CACHE_DIR, "jobs");
export const dataDir = path.join(CACHE_DIR, "data");

/** Fetch with a short-lived disk cache so re-runs and tweaks do not hit the API again. */
export async function loadDataset(address: string, onProgress?: (msg: string) => void): Promise<Dataset> {
  const key = path.join(dataDir, `${address.toLowerCase()}.json`);
  try {
    const cached = JSON.parse(await readFile(key, "utf8")) as Dataset;
    if (Date.now() - cached.fetchedAt < DATA_TTL_MS) return cached;
  } catch {
    // cache miss
  }

  const fresh = await fetchDataset(address, onProgress);
  // Cache under the requested address and the resolved master.
  await mkdir(dataDir, { recursive: true });
  const json = JSON.stringify(fresh);
  await writeFile(key, json);
  await writeFile(path.join(dataDir, `${fresh.address}.json`), json);
  return fresh;
}
