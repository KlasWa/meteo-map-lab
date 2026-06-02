// Format an annual probability (0..1) as a percentage string with enough
// precision that small-but-nonzero values don't collapse to "0%".
export function formatPercent(p: number): string {
  if (p <= 0) return "0%";
  const pct = p * 100;
  // Show 2 significant figures of the percentage value.
  const digits = Math.max(0, 1 - Math.floor(Math.log10(pct)));
  const fixed = pct.toFixed(digits);
  const formatted = digits > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  return `${formatted}%`;
}

// Format a return period in years as "≈ 1 in N years"; null -> em dash.
export function formatReturnPeriod(years: number | null): string {
  if (years == null) return "—";
  const rounded = roundSig(years, 2);
  return `≈ 1 in ${rounded.toLocaleString("en-US")} years`;
}

function roundSig(value: number, sig: number): number {
  if (value === 0) return 0;
  const mag = Math.ceil(Math.log10(Math.abs(value)));
  const power = sig - mag;
  const factor = Math.pow(10, power);
  return Math.round(value * factor) / factor;
}
