export type DateFilterMode = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export function getDateFilterRange(mode: DateFilterMode, customFrom: string, customTo: string): { start: Date; end: Date } | null {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);
  if (mode === 'today') return { start: startOfToday, end: endOfToday };
  if (mode === 'yesterday') {
    const startYesterday = new Date(startOfToday.getTime() - 86400000);
    return { start: startYesterday, end: new Date(startOfToday.getTime() - 1) };
  }
  if (mode === 'week') return { start: new Date(startOfToday.getTime() - 6 * 86400000), end: endOfToday };
  if (mode === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfToday };
  if (mode === 'custom') return { start: new Date(customFrom + 'T00:00:00'), end: new Date(customTo + 'T23:59:59.999') };
  return null;
}

export function isWithinDateFilter(dateStr: string | undefined | null, mode: DateFilterMode, customFrom: string, customTo: string): boolean {
  const range = getDateFilterRange(mode, customFrom, customTo);
  if (!range) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= range.start && d <= range.end;
}
