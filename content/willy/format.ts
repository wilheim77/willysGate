/** Spanish short numbers: 950 → «950»; 1.250 → «1,2 mil»; 3.400.000 → «3,4 M». */
export function viewers(n: number): string {
  const a = Math.abs(n);
  const short = (v: number, unit: string) => `${(Math.floor(v * 10) / 10).toLocaleString('es-ES', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unit}`;
  if (a >= 1_000_000) return short(n / 1_000_000, 'M');
  if (a >= 1_000) return short(n / 1_000, 'mil');
  return String(Math.round(n));
}
