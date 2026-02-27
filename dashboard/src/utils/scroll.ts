// Compute visible window start for scrollable list
export function computeScrollOffset(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number,
): number {
  if (totalItems <= maxVisible) return 0;
  if (selectedIndex === 0) return 0;
  if (selectedIndex >= totalItems - 1) return totalItems - maxVisible;
  return Math.max(0, Math.min(selectedIndex - 1, totalItems - maxVisible));
}
