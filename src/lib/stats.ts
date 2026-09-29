/** Percentile by linear interpolation between closest ranks (p in 0..1). Input needn't be sorted. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of empty array");
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const median = (values: number[]) => percentile(values, 0.5);

/** Median absolute deviation, scaled by 1.4826 so it is comparable to a standard deviation for normal data. */
export function scaledMad(values: number[]): number {
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}
