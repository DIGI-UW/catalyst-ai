import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFields, defaultFilters, exportRows, csv, saveConfiguration, loadConfiguration, catalystRecords, differences, comparisonRows, dateError } from './model.mjs';

test('August export uses collection dates, status and result multiplicity', () => {
  const rows = exportRows(defaultFilters);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.filter(row => row.accessionNumber === 'DEMO-0831').map(row => row.resultValue), ['1200', '1250']);
  assert.equal(rows.find(row => row.accessionNumber === 'DEMO-0824').resultValue, '');
  assert.ok(!rows.some(row => row.collectionDate === '2026-09-01' || row.resultStatus === 'Preliminary'));
  assert.equal(exportRows({ ...defaultFilters, status: 'All results' }).length, 6);
  assert.equal(exportRows({ ...defaultFilters, from: '2026-07-01', to: '2026-07-31' }).length, 0);
});
test('saved configurations omit dates, restore fields, and do not mutate a running request', () => {
  const fields = [...defaultFields], filters = { ...defaultFilters };
  const config = saveConfiguration(fields, filters);
  fields.pop(); filters.status = 'Preliminary';
  assert.equal(config.fields.length, 7);
  assert.equal(config.filters.status, 'Validated');
  assert.ok(!('from' in config.filters) && !('to' in config.filters));
  assert.deepEqual(loadConfiguration(config).filters, { ...defaultFilters, from: '', to: '' });
});
test('CSV preserves selected order, escaping, empty cells and complete row count', () => {
  const rows = exportRows(defaultFilters);
  const result = csv(rows, ['accessionNumber', 'resultValue']);
  assert.equal(result.split('\r\n').filter(Boolean).length, 6);
  assert.ok(result.includes('"DEMO-0824",""'));
  assert.equal(csv([{ resultValue: 'quoted "result", value' }], ['resultValue']), '"Result"\r\n"quoted ""result"", value"\r\n');
});
test('parity review identifies values and multiplicity rather than counts alone', () => {
  const reference = exportRows(defaultFilters);
  assert.deepEqual(differences(reference, catalystRecords), { missing: [], extra: [] });
  assert.equal(differences(reference, comparisonRows('missing')).missing[0].accessionNumber, 'DEMO-0812');
  assert.equal(differences(reference, comparisonRows('duplicate')).missing[0].resultValue, '1250');
  assert.equal(differences(reference, comparisonRows('boundary')).extra[0].collectionDate, '2026-09-01');
  const altered = structuredClone(catalystRecords); altered[0].resultValue = 'wrong';
  assert.equal(differences(reference, altered).missing.length, 1);
  assert.equal(differences(reference, altered).extra.length, 1);
});
test('report dates must be selected, ordered and bounded', () => {
  assert.equal(dateError(defaultFilters), '');
  assert.match(dateError({ from: '', to: '' }), /both dates/);
  assert.match(dateError({ from: '2026-09-01', to: '2026-08-01' }), /on or after/);
  assert.match(dateError({ from: '2026-01-01', to: '2026-08-31' }), /90 days/);
  assert.equal(dateError({ from: '2026-01-01', to: '2026-03-31' }), '');
  assert.match(dateError({ from: '2026-01-01', to: '2026-04-01' }), /90 days/);
});
