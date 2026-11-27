import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { dsvFormat } from 'd3';

const source = readFileSync(new URL('../src/normalized-targets.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readTargetNumber, readTargetDetails, climateTargetColor, targetDetailsHtml, progressionDetailsHtml, selectProgressionSeries, TARGET_NO_DATA_COLOR,
    CLIMATE_POSITIVE_OVERFLOW_COLOR, CLIMATE_ZERO_COLOR, CLIMATE_LEGEND_COLORS, climateTargetTypeGloss,
    climateYearGroup, selectDisplayedClimateTarget, selectAccumulatedClimateTarget, selectEarlierClimateTarget } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

for (const missing of [null, undefined, '', ' ', 'NA', 'NaN', 'Infinity', '12bad']) {
    assert.equal(readTargetNumber(missing), null);
}
assert.equal(readTargetNumber('0'), 0);
assert.equal(readTargetNumber('-65'), -65);
assert.equal(climateTargetColor(null), TARGET_NO_DATA_COLOR);
assert.equal(climateTargetColor(NaN), TARGET_NO_DATA_COLOR);
assert.equal(climateTargetColor(-101), CLIMATE_LEGEND_COLORS[0]);
assert.equal(climateTargetColor(-100), CLIMATE_LEGEND_COLORS[0]);
assert.equal(climateTargetColor(101), CLIMATE_POSITIVE_OVERFLOW_COLOR);
assert.equal(climateTargetColor(200), CLIMATE_POSITIVE_OVERFLOW_COLOR);
assert.equal(climateTargetColor(201), CLIMATE_POSITIVE_OVERFLOW_COLOR);
assert.notEqual(climateTargetColor(100), CLIMATE_POSITIVE_OVERFLOW_COLOR);
assert.equal(climateYearGroup(2025), '2020');
assert.equal(climateYearGroup(2030), '2030');
assert.equal(climateYearGroup(2035), '2035');
assert.equal(climateYearGroup(2040), '2050');
const yearFields = { yearField: 'targetYear', decisionField: 'decisionYear' };
const yearTargets = [
    { targetYear: 2030, decisionYear: 2024, conditionality: 'Conditional', id: 'conditional' },
    { targetYear: 2030, decisionYear: 2021, conditionality: 'Unconditional', id: 'unconditional' },
    { targetYear: 2035, decisionYear: 2025, conditionality: 'Unconditional', id: 'year-2035' },
    { targetYear: 2020, decisionYear: 2015, conditionality: 'Unconditional', id: 'earlier' },
];
assert.equal(selectDisplayedClimateTarget(yearTargets, '2030', yearFields).id, 'unconditional');
assert.equal(selectDisplayedClimateTarget(yearTargets, '2035', yearFields).id, 'year-2035');
assert.equal(selectDisplayedClimateTarget(yearTargets, '2050', yearFields), null);
assert.equal(selectAccumulatedClimateTarget(yearTargets, '2050', yearFields).id, 'year-2035');
assert.equal(selectAccumulatedClimateTarget(yearTargets, '2030', yearFields).id, 'unconditional');
assert.equal(selectAccumulatedClimateTarget(yearTargets, '2020', yearFields).id, 'earlier');
assert.equal(selectEarlierClimateTarget(yearTargets, '2030', yearFields).id, 'earlier');
const opposite = targetDetailsHtml(readTargetDetails({
    Target_normalized: '83', Target_average: '-5.8', Target_unit: 'Percent', Target_type: 'Baseline',
}), true);
assert.match(opposite, /adopted target is a reduction/);
assert.match(opposite, /normalized value is an increase from 1990/);
assert.match(targetDetailsHtml(readTargetDetails({
    Target_normalized: '25000000', Target_average: '-20', Target_unit: 'Percent', Target_type: 'BAU',
}), true), /percent change in economy-wide GHG emissions from 1990/);
assert.notEqual(climateTargetColor(-65), climateTargetColor(65));
assert.equal(climateTargetColor(0), CLIMATE_ZERO_COLOR);
assert.equal(CLIMATE_LEGEND_COLORS.includes(CLIMATE_ZERO_COLOR), false);
assert.equal(climateTargetTypeGloss('BAU'), 'change from a business-as-usual path, not from 1990 emissions');
assert.equal(climateTargetTypeGloss('Intensity'), 'change in emissions per unit of activity, not a change in total emissions from 1990');
const missing = readTargetDetails({ Target_normalized: '', Target_average: '-65', Target_unit: 'Percent',
    Target_type: 'Baseline', Reason_normalization: '<unknown>' });
assert.equal(missing.targetValue, null, 'Missing normalized values must not fall back to original values');
assert.match(targetDetailsHtml(missing, true), /Original value: -65 Percent/);
assert.match(targetDetailsHtml(missing, true), /Not available/);
assert.match(targetDetailsHtml(missing, true), /cannot be expressed as a percent change from 1990/);
assert.match(targetDetailsHtml(missing, true), /Why normalization is unavailable: &lt;unknown&gt;/);
assert.doesNotMatch(targetDetailsHtml(missing, false), /economy-wide GHG/);
assert.equal(readTargetDetails({ 'Target_normalized ': '-65' }).targetValue, -65);

const observations = [
    { ...readTargetDetails({ Target_normalized: '-65', Target_average: '-50', Target_unit: 'Percent', Target_type: 'Baseline' }), targetYear: 2030 },
    { ...readTargetDetails({ Target_normalized: '-100', Target_average: '-100', Target_unit: 'Percent', Target_type: 'Baseline' }), targetYear: 2050 },
    { ...readTargetDetails({ Target_normalized: '90', Target_average: '-25', Target_unit: 'Percent', Target_type: 'BAU' }), targetYear: 2030 },
    { ...readTargetDetails({ Target_normalized: '', Target_average: '42', Target_unit: 'MtCO2eq', Target_type: 'BAU' }), targetYear: 2030 },
];
const baseline = selectProgressionSeries(observations, 'normalized', 'Baseline');
assert.deepEqual(baseline.targets.map(target => target.targetValue), [-65, -100]);
const original = selectProgressionSeries(observations, 'original', 'Baseline');
assert.deepEqual(original.targets.map(target => target.targetValue), [-50, -100]);
const originalTooltip = progressionDetailsHtml(original.targets[0], 'original', true);
assert.match(originalTooltip, /Original value:.*-50/);
assert.doesNotMatch(originalTooltip, /Normalized|relative to 1990|-65/);
const normalizedTooltip = progressionDetailsHtml(baseline.targets[0], 'normalized', true);
assert.match(normalizedTooltip, /Normalized value:.*-65%/);
assert.doesNotMatch(normalizedTooltip, /Original value|-50/);
const climateDetails = targetDetailsHtml(original.targets[0], true);
assert.match(climateDetails, /-65%/);
assert.match(climateDetails, /Original value:.*-50 Percent, the target as adopted/);
assert.match(climateDetails, /percent change in economy-wide GHG emissions from 1990/);
assert.match(climateDetails, /stated base year/);
assert.doesNotMatch(targetDetailsHtml(original.targets[0], false), /1990/);
const originalOnly = selectProgressionSeries([observations[3]], 'original');
assert.deepEqual(originalOnly.targets.map(target => target.targetValue), [42]);
assert.equal(originalOnly.displayUnit, 'MtCO2eq');
assert.equal(originalOnly.targets[0].normalizedValue, null);
assert.match(targetDetailsHtml(originalOnly.targets[0], true), /Normalized value: <strong>Not available/);
assert.equal(new Set(selectProgressionSeries(observations, 'original').targets.map(target => target.originalUnit)).size, 1);
assert.deepEqual(selectProgressionSeries([], 'normalized').targets, []);
console.log('PASS: exclusive normalized/original series, full progression history, original units, and original-only records');

for (const [name, expected] of [['targets_data.csv', 1213], ['climate_targets_data.csv', 882]]) {
    const rows = dsvFormat(';').parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
    assert.equal(rows.length, expected);
    assert.ok(rows.every(row => /^[A-Z]{3}$/.test(row.Country_code)));
    for (const row of rows) {
        const target = readTargetDetails(row);
        assert.equal(target.targetValue, row.Target_normalized.trim() ? Number(row.Target_normalized) : null);
        assert.equal(target.originalValue, row.Target_average.trim());
        if (target.targetValue == null) assert.equal(climateTargetColor(target.targetValue), TARGET_NO_DATA_COLOR);
    }
    console.log(`${name}: ${rows.length} observations preserve normalized and original values`);
}
console.log('PASS: signed colors, overflow boundaries, zero, missing normalization, original details, and real datasets');
