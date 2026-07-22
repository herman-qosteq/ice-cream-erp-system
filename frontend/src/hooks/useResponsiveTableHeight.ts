import { useWindowDimensions } from 'react-native';

// Computes the FIXED height for a paginated table/card-list region (pass
// straight through to <ScrollableSection height={...}> - not as a
// maxHeight, which would let the box shrink on a short page of results).
// Chosen so that (a) the page's own chrome - header, filters, pagination
// footer - fits on screen without the whole page needing to scroll in the
// common case, and (b) it never gets uselessly short on a small viewport or
// absurdly tall on a large monitor. `chromeHeight` is how much vertical
// space this screen's surrounding chrome (tabs, title, filter bar, footer,
// outer page padding) already takes up, so screens with more or less of it
// around the table can still land on a sensible height instead of one fixed
// number everywhere.
export function useResponsiveTableHeight(chromeHeight = 320, opts: { min?: number; max?: number } = {}): number {
  const { height: windowHeight } = useWindowDimensions();
  const min = opts.min ?? 320;
  const max = opts.max ?? 640;
  return Math.min(max, Math.max(min, windowHeight - chromeHeight));
}
