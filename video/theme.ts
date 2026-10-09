import type { CSSProperties } from "react";

export const theme = {
  bg: "#070b10",
  panel: "#0f1620",
  panelBorder: "#1d2836",
  text: "#e8eef5",
  muted: "#7f8b99",
  green: "#2ee6a6",
  red: "#ff4d6d",
  accent: "#6c8cff",
  gold: "#ffcf5c",
  font: "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
} as const;

export const pnlColor = (v: number) => (v >= 0 ? theme.green : theme.red);

export const fill: CSSProperties = { position: "absolute", inset: 0 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
