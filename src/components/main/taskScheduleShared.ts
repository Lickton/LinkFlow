export function toggleNumberSelection(values: number[], target: number): number[] {
  return values.includes(target) ? values.filter((value) => value !== target) : [...values, target];
}
