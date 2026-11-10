// Self-check for src/policy-filter.ts. Run: node --experimental-strip-types scripts/check-policy-filter.ts
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { actorGroups, eventTypes, rowPasses, defaultFilterState } from '../src/policy-filter.ts';

assert.deepEqual(actorGroups({ Actor: 'households' }), ['Households & individuals']);
assert.deepEqual(actorGroups({ Actor: 'Micro and SMEs' }), ['Companies']);
const agri = actorGroups({ Actor: 'small agrictultural enterprises' });
assert.ok(agri.includes('Companies') && agri.includes('Farmers & landowners'));
assert.deepEqual(actorGroups({ Actor: '' }), ['Not specified']);
assert.deepEqual(actorGroups({ Actor: 'NA' }), ['Not specified']);
assert.deepEqual(actorGroups({ Actor: 'project-specific subsidy' }), ['Other']);

assert.deepEqual(eventTypes({ policy_changed_detail_harmonized: 'support changed; cap changed' }), ['support changed', 'cap changed']);
assert.deepEqual(eventTypes({ policy_changed_detail_harmonized: '' }), ['no change recorded']);

const sample = {
    measure: 'FIT', Technology_type: 'PV', year: '2020', policy_changed_detail_harmonized: 'introduced',
    Actor: '', added_in_version: '', status: 'deprecated',
};
const base = defaultFilterState([sample]);
assert.equal(rowPasses(sample, base), false);
assert.equal(rowPasses(sample, { ...base, includeDeprecated: true }), true);

// Change-event filter applies by default; dashboards skip it with ignoreEvents = true.
const expired = { ...sample, status: '', policy_changed_detail_harmonized: 'cancelled/expired' };
assert.equal(rowPasses(expired, base), false);
assert.equal(rowPasses(expired, base, true), true);

// Real data: first sheet, every value as a string (as CSV parsing would give).
const XLSX = createRequire(import.meta.url)('xlsx');
const wb = XLSX.readFile(fileURLToPath(new URL('../public/data/policy_data.xlsx', import.meta.url)));
const ws = wb.Sheets[wb.SheetNames[0]];
const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' }).map((r: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
const defaults = defaultFilterState(rows);
const passing = rows.filter((r) => rowPasses(r, defaults)).length;
assert.equal(passing, 503, `default-state count is ${passing}, expected 503`);

console.log('policy-filter checks passed');
