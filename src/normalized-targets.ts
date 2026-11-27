/** Values are supplied by the dataset; the website does not recompute normalization. */
export function readTargetNumber(value: unknown): number | null {
    if (value == null || String(value).trim() === '') return null;
    const number = Number(String(value).trim());
    return Number.isFinite(number) ? number : null;
}

function field(row: Record<string, unknown>, name: string): string {
    const key = Object.keys(row).find(key => key.trim().toLowerCase() === name.toLowerCase());
    return key == null ? '' : String(row[key] ?? '').trim();
}

export function readTargetDetails(row: Record<string, unknown>) {
    return {
        targetValue: readTargetNumber(field(row, 'Target_normalized')),
        originalValue: field(row, 'Target_average'),
        originalUnit: field(row, 'Target_unit') || field(row, 'Unit'),
        originalTargetType: field(row, 'Target_type'),
        yearBase: field(row, 'Year_base'),
        conditionality: field(row, 'Conditionality'),
        normalizationReason: field(row, 'Reason_normalization'),
    };
}

export const TARGET_NO_DATA_COLOR = '#d4d4d4';
export const CLIMATE_ZERO_COLOR = '#fff7ec';
export const CLIMATE_NO_TARGET_COLOR = '#b0b0b0';
export const CLIMATE_POSITIVE_OVERFLOW_COLOR = '#a8241b';
export const CLIMATE_LEGEND_COLORS = [
    '#238b6b', '#41a582', '#87cdb1', '#ccebdc',
    '#fee2b6', '#fdbb84', '#f58a5b', '#dc5438',
] as const;

/** Colored only inside this window. Below −100% or above +200% is not used as a change from 1990. */
export const CLIMATE_DISPLAY_MIN = -100;
export const CLIMATE_DISPLAY_MAX = 200;
export type ClimateYearGroup = '2020' | '2030' | '2035' | '2050';
export const CLIMATE_YEAR_GROUPS: ClimateYearGroup[] = ['2020', '2030', '2035', '2050'];

export function climateNormalizedValueIsDisplayed(value: number | null | undefined): value is number {
    return value != null && Number.isFinite(value) && value >= CLIMATE_DISPLAY_MIN && value <= CLIMATE_DISPLAY_MAX;
}

/** 2020: through 2025. 2030: 2026–2034. 2035: 2035–2039. 2050: 2040 and later. */
export function climateYearGroup(year: number): ClimateYearGroup | null {
    if (!Number.isFinite(year)) return null;
    if (year <= 2025) return '2020';
    if (year < 2035) return '2030';
    if (year < 2040) return '2035';
    return '2050';
}

export function isUnconditionalClimateTarget(conditionality: unknown): boolean {
    return String(conditionality ?? '').trim().toLowerCase() === 'unconditional';
}

/** Unconditional targets take precedence within one year. */
export function selectDisplayedClimateTarget<T extends Record<string, unknown>>(
    targets: T[],
    selected: ClimateYearGroup,
    options: { yearField: keyof T; decisionField: keyof T },
): T | null {
    const matching = targets.filter((target) => climateYearGroup(Number(target[options.yearField])) === selected);
    if (!matching.length) return null;
    const unconditional = matching.filter((target) => isUnconditionalClimateTarget(target.conditionality));
    const pool = unconditional.length > 0 ? unconditional : matching;
    return pool.sort((a, b) => Number(b[options.decisionField]) - Number(a[options.decisionField]))[0];
}

/** Latest target in the selected year, or the latest earlier year when that year has none. */
export function selectAccumulatedClimateTarget<T extends Record<string, unknown>>(
    targets: T[],
    selected: ClimateYearGroup,
    options: { yearField: keyof T; decisionField: keyof T },
): T | null {
    const selectedIndex = CLIMATE_YEAR_GROUPS.indexOf(selected);
    for (let index = selectedIndex; index >= 0; index--) {
        const target = selectDisplayedClimateTarget(targets, CLIMATE_YEAR_GROUPS[index], options);
        if (target) return target;
    }
    return null;
}

/** Latest target from a year before the selected one. */
export function selectEarlierClimateTarget<T extends Record<string, unknown>>(
    targets: T[],
    selected: ClimateYearGroup,
    options: { yearField: keyof T; decisionField: keyof T },
): T | null {
    const selectedIndex = CLIMATE_YEAR_GROUPS.indexOf(selected);
    for (let index = selectedIndex - 1; index >= 0; index--) {
        const earlier = selectDisplayedClimateTarget(targets, CLIMATE_YEAR_GROUPS[index], options);
        if (earlier) return earlier;
    }
    return null;
}

/** Fixed bins from −100% to +100%. Beyond either end, the strongest color of that side. Missing values stay grey. */
export function climateTargetColor(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return TARGET_NO_DATA_COLOR;
    if (value <= -75) return CLIMATE_LEGEND_COLORS[0];
    if (value <= -50) return CLIMATE_LEGEND_COLORS[1];
    if (value <= -25) return CLIMATE_LEGEND_COLORS[2];
    if (value < 0) return CLIMATE_LEGEND_COLORS[3];
    if (value === 0) return CLIMATE_ZERO_COLOR;
    if (value <= 25) return CLIMATE_LEGEND_COLORS[4];
    if (value <= 50) return CLIMATE_LEGEND_COLORS[5];
    if (value <= 75) return CLIMATE_LEGEND_COLORS[6];
    if (value <= 100) return CLIMATE_LEGEND_COLORS[7];
    return CLIMATE_POSITIVE_OVERFLOW_COLOR;
}

/** Chart marks use one dark color per direction so a value near 0 stays as visible as a large one. */
export function climateChartColor(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '#57534e';
    return value < 0 ? '#1f7a5c' : '#c2410c';
}

function climateDirectionNote(normalizedValue: number | null, originalValue: string, originalUnit: string): string {
    const originalNumber = readTargetNumber(originalValue);
    if (normalizedValue == null || originalNumber == null || normalizedValue === 0 || originalNumber === 0) return '';
    if (!originalUnit.toLowerCase().includes('percent')) return '';
    if (Math.sign(normalizedValue) === Math.sign(originalNumber)) return '';
    const adopted = originalNumber < 0 ? 'a reduction' : 'an increase';
    const from1990 = normalizedValue < 0 ? 'a reduction from 1990 emissions' : 'an increase from 1990 emissions';
    return `<br/>The adopted target is ${adopted} in its stated unit. The normalized value is ${from1990}.`;
}

export function escapeTargetHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]!));
}

/** The reference named by the adopted target. It is 1990 only when the base year is 1990. */
export function climateTargetTypeGloss(targetType: string): string {
    switch (targetType.trim().toLowerCase()) {
        case 'baseline': return 'change from a stated base year, which equals 1990 only when that year is the base year';
        case 'bau': return 'change from a business-as-usual path, not from 1990 emissions';
        case 'trajectory': return 'an emissions level in the stated unit, not a percent change from 1990';
        case 'intensity': return 'change in emissions per unit of activity, not a change in total emissions from 1990';
        default: return 'the reference named by the adopted target';
    }
}

export function targetDetailsHtml(target: ReturnType<typeof readTargetDetails> & { normalizedValue?: number | null }, climate = false): string {
    const normalizedValue = target.normalizedValue === undefined ? target.targetValue : target.normalizedValue;
    const normalized = normalizedValue == null ? 'Not available'
        : `${normalizedValue > 0 && climate ? '+' : ''}${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(normalizedValue)}%`;
    const originalFigure = target.originalValue
        ? `${escapeTargetHtml(target.originalValue)} ${escapeTargetHtml(target.originalUnit)}` : '';
    const original = originalFigure || 'Not available';
    const targetType = escapeTargetHtml(target.originalTargetType) || 'Not specified';
    if (!climate) {
        return `Normalized value: <strong>${normalized}</strong>`
            + `<br/>Original value: ${original}`
            + `<br/>Target type: ${targetType}`
            + (target.yearBase ? `<br/>Original base year: ${escapeTargetHtml(target.yearBase)}` : '')
            + (target.conditionality ? `<br/>${escapeTargetHtml(target.conditionality)}` : '')
            + (normalizedValue == null && target.normalizationReason
                ? `<br/>Normalization unavailable: ${escapeTargetHtml(target.normalizationReason)}` : '');
    }
    const normalizedGloss = normalizedValue == null
        ? '. This target cannot be expressed as a percent change from 1990 emissions'
        : ', percent change in economy-wide GHG emissions from 1990';
    return `Normalized value: <strong>${normalized}</strong>${normalizedGloss}`
        + climateDirectionNote(normalizedValue, target.originalValue, target.originalUnit)
        + `<br/>Original value: ${original}${originalFigure ? ', the target as adopted, in its stated unit' : ''}`
        + `<br/>Target type: ${targetType} (${climateTargetTypeGloss(target.originalTargetType)})`
        + (target.yearBase ? `<br/>Base year: ${escapeTargetHtml(target.yearBase)}` : '')
        + (target.conditionality ? `<br/>Conditionality: ${escapeTargetHtml(target.conditionality)}` : '')
        + (normalizedValue == null && target.normalizationReason
            ? `<br/>Why normalization is unavailable: ${escapeTargetHtml(target.normalizationReason)}` : '');
}

export type ProgressionBasis = 'normalized' | 'original';

/** Chart hover details must describe only the selected series. Map details can show both. */
export function progressionDetailsHtml(
    target: ReturnType<typeof readTargetDetails>, basis: ProgressionBasis, climate = false,
): string {
    const formatted = target.targetValue == null ? 'Not available'
        : `${climate && target.targetValue > 0 ? '+' : ''}${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(target.targetValue)}`;
    const value = basis === 'original'
        ? `Original value: <strong>${escapeTargetHtml(target.originalValue)} ${escapeTargetHtml(target.originalUnit)}</strong>`
        : `Normalized value: <strong>${formatted}${target.targetValue == null ? '' : '%'}</strong>${climate ? ' relative to 1990' : ''}`;
    return value
        + `<br/>Target type: ${escapeTargetHtml(target.originalTargetType) || 'Not specified'}`
        + (basis === 'original' && target.yearBase ? `<br/>Base year: ${escapeTargetHtml(target.yearBase)}` : '')
        + (target.conditionality ? `<br/>${escapeTargetHtml(target.conditionality)}` : '');
}

type ProgressionObservation = ReturnType<typeof readTargetDetails> & { targetYear: number };

/** One value basis at a time. Original values retain one common unit on their axis. */
export function selectProgressionSeries<T extends ProgressionObservation>(
    observations: T[], basis: ProgressionBasis = 'normalized', targetType?: string,
) {
    const typedTargets = targetType == null ? observations
        : observations.filter(target => target.originalTargetType === targetType);
    const units = [...new Set(typedTargets.map(target => target.originalUnit))].sort();
    const originalUnit = units.find(unit => unit.toLowerCase() === 'percent') ?? units[0] ?? '';
    const displayUnit = basis === 'normalized' || originalUnit.toLowerCase() === 'percent' ? '%' : originalUnit;
    const targets = typedTargets.flatMap(target => {
        if (basis === 'original' && target.originalUnit !== originalUnit) return [];
        const value = basis === 'normalized' ? target.targetValue : readTargetNumber(target.originalValue);
        return value == null ? [] : [{ ...target, normalizedValue: target.targetValue, targetValue: value, displayUnit }];
    });
    return { basis, targets, displayUnit };
}
