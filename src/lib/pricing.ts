// USD per million tokens (input, output) for cost tracking. Unknown models fall back to Opus 5.5.
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

/** Cost in micro-dollars ($1 = 1,000,000). */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const [inp, out] = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return Math.round(inputTokens * inp + outputTokens * out);
}

export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
