export function mean(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

export function stdev(arr) {
  if (arr.length === 0) return NaN;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

// Least-squares fit of y ~ a + b*i for i = 0..y.length-1.
export function linreg(y) {
  const n = y.length;
  const meanI = (n - 1) / 2;
  const meanY = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanI) * (y[i] - meanY);
    den += (i - meanI) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = meanY - b * meanI;
  return { a, b, residuals: y.map((v, i) => v - (a + b * i)) };
}
