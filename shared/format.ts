const HIDDEN = "$•••";

export function money(n: number, hide = false, opts: { sign?: boolean } = {}): string {
  if (hide) return HIDDEN;
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1e9) body = `${(abs / 1e9).toFixed(2)}B`;
  else if (abs >= 1e6) body = `${(abs / 1e6).toFixed(2)}M`;
  else if (abs >= 1e4) body = `${(abs / 1e3).toFixed(1)}K`;
  else if (abs >= 1000) body = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  else body = abs.toFixed(2);
  const sign = n < 0 ? "-" : opts.sign ? "+" : "";
  return `${sign}$${body}`;
}

/** Amount phrased for text-to-speech. */
export function spokenMoney(n: number): string {
  const abs = Math.abs(n);
  const round = (v: number) => (v >= 100 ? Math.round(v) : Number(v.toPrecision(2)));
  if (abs >= 1e9) return `${round(abs / 1e9)} billion dollars`;
  if (abs >= 1e6) return `${round(abs / 1e6)} million dollars`;
  if (abs >= 1e3) return `${round(abs / 1e3)} thousand dollars`;
  return `${Math.round(abs)} dollars`;
}

export function percent(frac: number, digits = 0): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function dateTimeLabel(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${day} ${d.toISOString().slice(11, 16)}`;
}

export function monthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function durationText(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return "under a minute";
  if (min < 90) return `${Math.round(min)} minutes`;
  const hours = min / 60;
  if (hours < 48) return `${Math.round(hours)} hours`;
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)} days`;
  return `${Math.round(days / 30)} months`;
}

export function priceLabel(px: number): string {
  if (px >= 1000) return px.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (px >= 1) return px.toFixed(2);
  if (px >= 0.01) return px.toFixed(4);
  return px.toPrecision(3);
}
