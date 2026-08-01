// Smoke test for the ERP Executive Reports Hub date-filtering bug: a report's
// PDF header printed a "Period: Daily | Range: ..." label while the table
// body underneath ignored the selected tab and included every record ever
// created (see AdminReports.tsx 'Sales by Partner Type' / 'Partner Type
// Revenue Report'). Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getReportPeriod, isWithinReportPeriod } from '../reportPeriod';

// Fixed "now" so the test is deterministic regardless of when it runs.
const NOW = new Date('2026-07-29T12:00:00');

const sampleOrders = [
  { id: 'today', created_at: '2026-07-29T09:00:00', status: 'Delivered' },
  { id: 'yesterday', created_at: '2026-07-28T09:00:00', status: 'Delivered' },
  { id: 'six-days-ago', created_at: '2026-07-23T09:00:00', status: 'Delivered' },
  { id: 'eight-days-ago', created_at: '2026-07-21T09:00:00', status: 'Delivered' },
  { id: 'last-month', created_at: '2026-06-15T09:00:00', status: 'Delivered' },
];

test('Daily tab period range is just today', () => {
  const period = getReportPeriod('Daily', { start: '', end: '' }, NOW);
  assert.equal(period.startStr, '2026-07-29');
  assert.equal(period.endStr, '2026-07-29');
});

test('Weekly tab period range spans the last 7 days', () => {
  const period = getReportPeriod('Weekly', { start: '', end: '' }, NOW);
  assert.equal(period.startStr, '2026-07-23');
  assert.equal(period.endStr, '2026-07-29');
});

test('Custom tab uses the caller-provided range verbatim', () => {
  const period = getReportPeriod('Custom', { start: '2026-01-01', end: '2026-01-31' }, NOW);
  assert.equal(period.startStr, '2026-01-01');
  assert.equal(period.endStr, '2026-01-31');
});

test('regression: Daily-period filtering only includes records dated today, not every record ever created', () => {
  const period = getReportPeriod('Daily', { start: '', end: '' }, NOW);

  // This mirrors the exact filter shape a report handler must use:
  // status check AND isWithinReportPeriod - dropping the period check here
  // is precisely the bug that shipped (label said "Daily" for an all-time query).
  const included = sampleOrders.filter(o => o.status === 'Delivered' && isWithinReportPeriod(o.created_at, period));

  assert.deepEqual(included.map(o => o.id), ['today']);
});

test('regression: Weekly-period filtering excludes records older than 7 days', () => {
  const period = getReportPeriod('Weekly', { start: '', end: '' }, NOW);
  const included = sampleOrders.filter(o => o.status === 'Delivered' && isWithinReportPeriod(o.created_at, period));

  assert.deepEqual(included.map(o => o.id).sort(), ['six-days-ago', 'today', 'yesterday'].sort());
  assert.ok(!included.some(o => o.id === 'eight-days-ago'));
  assert.ok(!included.some(o => o.id === 'last-month'));
});

test('isWithinReportPeriod includes the full end day up to 23:59:59.999', () => {
  const period = getReportPeriod('Daily', { start: '', end: '' }, NOW);
  assert.ok(isWithinReportPeriod('2026-07-29T23:59:59', period));
  assert.ok(!isWithinReportPeriod('2026-07-30T00:00:00', period));
});
