const API_URL = "https://api.hyperliquid.xyz/info";

export class HyperliquidError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Info endpoint is weight-limited; keep a minimum gap between requests.
let lastRequestAt = 0;
const MIN_GAP_MS = 150;

export async function info<T>(body: Record<string, unknown>, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt >= retries) throw new HyperliquidError(`Network error: ${(e as Error).message}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429) {
      throw new HyperliquidError("Hyperliquid API rate limit hit. Try again in a minute.", 429);
    }
    const text = await res.text().catch(() => "");
    throw new HyperliquidError(`Hyperliquid API error ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
}
