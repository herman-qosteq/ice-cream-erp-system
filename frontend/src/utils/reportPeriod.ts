export type ReportTab = 'Daily' | 'Weekly' | 'Monthly' | 'Custom';

export interface ReportPeriod {
  startStr: string;
  endStr: string;
  startDate: Date;
  endDate: Date;
  periodStr: string;
}

const toIsoDate = (d: Date) => d.toISOString().split('T')[0];

// Single source of truth for the Daily/Weekly/Monthly/Custom tab -> date
// range mapping used by every ERP Executive Reports Hub export, so a report
// can't print a "Period: X" label that its own data query didn't filter by.
export function getReportPeriod(
  activeReportTab: ReportTab,
  customRange: { start: string; end: string },
  now: Date = new Date(),
): ReportPeriod {
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  const startStr = activeReportTab === 'Daily' ? toIsoDate(now)
    : activeReportTab === 'Weekly' ? toIsoDate(daysAgo(6))
    : activeReportTab === 'Monthly' ? toIsoDate(daysAgo(30))
    : customRange.start;
  const endStr = activeReportTab === 'Custom' ? customRange.end : toIsoDate(now);

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  endDate.setHours(23, 59, 59, 999);

  return { startStr, endStr, startDate, endDate, periodStr: `${startStr} to ${endStr}` };
}

export function isWithinReportPeriod(dateValue: string | Date, period: ReportPeriod): boolean {
  const d = new Date(dateValue);
  return d >= period.startDate && d <= period.endDate;
}
