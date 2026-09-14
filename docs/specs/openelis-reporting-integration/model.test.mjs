import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFields, defaultFilters, exportRows, csv, catalystRecords, differences, comparisonRows, readPreviewCsv, previewTypeErrors } from './model.mjs';

test('August export uses collection dates, status and result multiplicity', () => {
  const rows = exportRows(defaultFilters);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.filter(row => row.accessionNumber === 'DEMO-0831').map(row => row.resultValue), ['1200', '1250']);
  assert.equal(rows.find(row => row.accessionNumber === 'DEMO-0824').resultValue, '');
  assert.ok(!rows.some(row => row.collectionDate === '2026-09-01' || row.resultStatus === 'Preliminary'));
  assert.equal(exportRows({ ...defaultFilters, status: 'All results' }).length, 6);
  assert.equal(exportRows({ ...defaultFilters, from: '2026-07-01', to: '2026-07-31' }).length, 0);
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

test('import review preserves BOM, escaping, line breaks, blanks and repeated rows', () => {
  const file = readPreviewCsv('\uFEFFIdentifier,Result,Note\r\n0012,<20,"a,b"\r\n0012,,"line\nwith ""quotes"""\r\n');
  assert.deepEqual(file.headers, ['Identifier', 'Result', 'Note']);
  assert.deepEqual(file.types, ['text', 'text', 'text']);
  assert.deepEqual(file.rows, [['0012', '<20', 'a,b'], ['0012', '', 'line\nwith "quotes"']]);
  assert.deepEqual(previewTypeErrors(file), []);
  file.types[0] = 'number';
  assert.match(previewTypeErrors(file)[0], /Identifier/);
  assert.equal(file.rows[0][0], '0012');
});
test('review rejects partial, malformed, empty and ambiguous CSV files', () => {
  for (const text of ['', 'A,B\n', 'A,A\n1,2', 'A,B\n1', 'A,B\n"1', 'A,B\n"1"x,2']) assert.throws(() => readPreviewCsv(text));
});
test('reviewed types can be corrected without replacing original cells', () => {
  const file = readPreviewCsv('Date,Result\n2026-08-31,430\n2026-08-31,\n');
  assert.deepEqual(file.types, ['date', 'number']);
  assert.deepEqual(previewTypeErrors(file), []);
  file.rows[1][0] = '2026-02-31';
  assert.equal(previewTypeErrors(file).length, 1);
  file.types[0] = 'text';
  assert.deepEqual(previewTypeErrors(file), []);
  assert.equal(file.rows[1][0], '2026-02-31');
});
