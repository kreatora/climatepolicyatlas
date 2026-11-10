// Filter panel for the world map's policy rows. No imports: the pure logic runs under plain Node type-stripping.

export type PolicyRow = Record<string, any>;

export interface PolicyFilterState {
    measures: Set<string>;      // lowercased trimmed `measure`
    techs: Set<string>;         // trimmed `Technology_type`; '' = unspecified
    yearFrom: number;
    yearTo: number;
    events: Set<string>;        // values from eventTypes()
    actors: Set<string>;        // values from actorGroups()
    versions: Set<string>;      // trimmed `added_in_version`; '' = unknown
    includeDeprecated: boolean;
}

export const INSTRUMENT_FAMILIES: { label: string; values: string[] }[] = [
    { label: 'Market premium', values: ['fit', 'premium', 'tender'] },
    { label: 'Tax incentive', values: ['tax incentive'] },
    { label: 'Grant & subsidy', values: ['grant', 'subsidy'] },
    { label: 'Loan', values: ['soft loan', 'loan guarantee'] },
    { label: 'Levy', values: ['carbon tax'] },
    { label: 'Trading scheme', values: ['ets cap-and-trade', 'tgc'] },
];

export const TECH_GROUPS: { label: string; values: string[] }[] = [
    { label: 'PV', values: ['PV', 'PV rooftop', 'PV field'] },
    { label: 'Wind', values: ['wind', 'onshore wind', 'offshore wind'] },
    { label: 'Bioenergy', values: ['bioenergy', 'biomass', 'biogas'] },
    { label: 'CSP', values: ['CSP'] },
    { label: 'All renewables', values: ['all renewables'] },
    { label: 'Multiple', values: ['multiple'] },
];

const ACTOR_PATTERNS: [string, RegExp][] = [
    ['Households & individuals', /household|individual|private person|homeowner|residential|condominium|dwelling|income/i],
    ['Companies', /compan|sme|business|esco|mid-cap|enterprise/i],
    ['Farmers & landowners', /farmer|agric|landowner/i],
    ['Communities & non-profits', /communit|cooperative|ngo|charity|non-commercial|research|state institution/i],
];
const ACTOR_LABELS = [...ACTOR_PATTERNS.map((p) => p[0]), 'Other', 'Not specified'];

const str = (v: unknown): string => String(v ?? '').trim();
const lc = (v: unknown): string => str(v).toLowerCase();
const yearOf = (r: PolicyRow): number | null => {
    const t = str(r.year);
    const y = t === '' ? NaN : Number(t);
    return Number.isFinite(y) ? y : null;
};
const isDeprecated = (r: PolicyRow): boolean => lc(r.status) === 'deprecated';

export function eventTypes(row: PolicyRow): string[] {
    const out = [...new Set(str(row.policy_changed_detail_harmonized).split(';').map(lc).filter(Boolean))];
    return out.length ? out : ['no change recorded'];
}

export function actorGroups(row: PolicyRow): string[] {
    const actor = str(row.Actor);
    if (actor === '' || actor.toLowerCase() === 'na') return ['Not specified'];
    const out = ACTOR_PATTERNS.filter((p) => p[1].test(actor)).map((p) => p[0]);
    return out.length ? out : ['Other'];
}

// ignoreEvents: dashboards pass true to ignore the change-event filter.
export function rowPasses(row: PolicyRow, s: PolicyFilterState, ignoreEvents = false): boolean {
    if (isDeprecated(row) && !s.includeDeprecated) return false;
    if (!s.measures.has(lc(row.measure))) return false;
    if (!s.techs.has(str(row.Technology_type))) return false;
    const y = yearOf(row);
    if (y === null || y < s.yearFrom || y > s.yearTo) return false;
    if (!ignoreEvents && !eventTypes(row).some((e) => s.events.has(e))) return false;
    if (!actorGroups(row).some((a) => s.actors.has(a))) return false;
    if (!s.versions.has(str(row.added_in_version))) return false;
    return true;
}

export function defaultFilterState(rows: PolicyRow[]): PolicyFilterState {
    const measures = new Set<string>();
    const techs = new Set<string>();
    const versions = new Set<string>();
    let yearFrom = Infinity;
    let yearTo = -Infinity;
    for (const r of rows) {
        measures.add(lc(r.measure));
        techs.add(str(r.Technology_type));
        versions.add(str(r.added_in_version));
        const y = yearOf(r);
        if (y !== null) {
            yearFrom = Math.min(yearFrom, y);
            yearTo = Math.max(yearTo, y);
        }
    }
    return {
        measures,
        techs,
        yearFrom: Number.isFinite(yearFrom) ? yearFrom : 0,
        yearTo: Number.isFinite(yearTo) ? yearTo : 0,
        events: new Set(['introduced']),
        actors: new Set(ACTOR_LABELS),
        versions,
        includeDeprecated: false,
    };
}

// ---------- UI ----------

type SetKey = 'measures' | 'techs' | 'events' | 'actors' | 'versions';
type FlagKey = 'includeDeprecated';
type Option = { key: string; label: string };
type Group = { label: string; options: Option[] };
type Badge = { text: string; all: boolean };

const FILTER_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>
    </svg>`;

const DOWNLOAD_ICON_SVG = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>
    </svg>`;

const ACRONYMS = new Map<string, string>([['fit', 'FIT'], ['tgc', 'TGC']]);

// Display only: capitalizes the first letter and upper-cases known acronyms.
const displayLabel = (s: string): string => {
    const t = s.split(' ').map((w) => ACRONYMS.get(w.toLowerCase()) ?? w).join(' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
};

const cloneState = (s: PolicyFilterState): PolicyFilterState => ({
    ...s,
    measures: new Set(s.measures),
    techs: new Set(s.techs),
    events: new Set(s.events),
    actors: new Set(s.actors),
    versions: new Set(s.versions),
});

const serialize = (s: PolicyFilterState): string => JSON.stringify({
    ...s,
    measures: [...s.measures].sort(),
    techs: [...s.techs].sort(),
    events: [...s.events].sort(),
    actors: [...s.actors].sort(),
    versions: [...s.versions].sort(),
});

// key -> label (first seen in data order)
function firstSeen(rows: PolicyRow[], col: string, keyOf: (v: string) => string, fallback: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const r of rows) {
        const raw = str(r[col]);
        const key = keyOf(raw);
        if (!out.has(key)) out.set(key, displayLabel(raw || fallback));
    }
    return out;
}

function buildTree(labels: Map<string, string>, families: { label: string; values: string[] }[]): Group[] {
    const groups: Group[] = [];
    const placed = new Set<string>();
    for (const fam of families) {
        const options: Option[] = [];
        for (const [key, label] of labels) {
            if (!placed.has(key) && fam.values.some((v) => v.toLowerCase() === key.toLowerCase())) {
                placed.add(key);
                options.push({ key, label });
            }
        }
        // Generic value under its own multi-item group (e.g. 'PV' under PV) gets "(general)" so it reads differently from the group.
        if (options.length > 1) for (const o of options) if (o.label.toLowerCase() === fam.label.toLowerCase()) o.label += ' (general)';
        if (options.length) groups.push({ label: fam.label, options });
    }
    const rest: Option[] = [];
    for (const [key, label] of labels) if (!placed.has(key)) rest.push({ key, label });
    if (rest.length) groups.push({ label: 'Other', options: rest });
    return groups;
}

const ensureStyles = () => {
    if (document.getElementById('cpa-policy-filter-styles')) return;
    // Reuses the .cpa-download-* classes injected by graph-export.ts, so register this menu after registerGraphDownloadMenu.
    const style = document.createElement('style');
    style.id = 'cpa-policy-filter-styles';
    style.textContent = `
        .cpa-filter-menu { position: absolute; bottom: 16px; right: 70px; z-index: 30; }
        .cpa-filter-menu[hidden] { display: none; }
        .cpa-filter-menu .cpa-download-trigger { position: relative; }
        .cpa-filter-menu.is-open .cpa-download-trigger {
            background: rgba(255, 255, 255, 0.94);
            border-color: var(--color-primary-light, rgb(100, 140, 88));
            box-shadow: 0 5px 18px rgba(15, 23, 42, 0.15);
        }
        .cpa-filter-menu.has-active .cpa-download-trigger::after {
            content: ''; position: absolute; top: 3px; right: 3px;
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--color-primary-light, rgb(100, 140, 88)); box-shadow: 0 0 0 2px #fff;
        }
        .cpa-filter-menu .cpa-filter-panel {
            width: 300px; max-height: min(70vh, 520px); overflow-y: auto;
            border: 1px solid var(--color-border, rgb(176, 192, 176)); border-radius: 16px;
            box-shadow: 0 18px 40px rgba(42, 58, 42, 0.18);
        }
        .cpa-filter-menu.is-open .cpa-download-sidebar { opacity: 1; visibility: visible; transform: translateX(0); pointer-events: auto; }
        .cpa-filter-panel .cpa-download-sidebar-header {
            position: sticky; top: -10px; z-index: 2; background: #fff;
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .cpa-filter-panel .cpa-download-sidebar-header > span {
            font: 700 14px var(--font-heading, 'Libre Baskerville', Georgia, serif);
            color: var(--color-primary-dark, rgb(42, 58, 42));
        }
        .cpa-filter-panel .cpa-filter-reset {
            border: 1px solid var(--color-border, rgb(176, 192, 176)); border-radius: 999px; background: none;
            padding: 3px 10px; cursor: pointer;
            font: 600 11.5px var(--font-body, 'DM Sans', system-ui, sans-serif); color: var(--color-primary, rgb(50, 70, 53));
        }
        .cpa-filter-panel .cpa-filter-reset:hover {
            background: var(--color-surface-light, rgb(240, 245, 235));
            color: var(--color-primary-light, rgb(100, 140, 88)); text-decoration: underline;
        }
        .cpa-filter-panel .cpa-filter-bulk { display: flex; justify-content: flex-end; padding: 2px 12px 4px; }
        .cpa-filter-panel .cpa-filter-link {
            border: none; background: none; padding: 0; cursor: pointer; text-decoration: none;
            font: 600 11.5px var(--font-body, 'DM Sans', system-ui, sans-serif); color: var(--color-primary, rgb(50, 70, 53));
        }
        .cpa-filter-panel .cpa-filter-link:hover { color: var(--color-primary-light, rgb(100, 140, 88)); text-decoration: underline; }
        .cpa-filter-panel > .cpa-download-section { border: 0; border-bottom: 1px solid rgba(176, 192, 176, 0.5); }
        .cpa-filter-panel details[open] { padding-bottom: 6px; }
        .cpa-filter-panel summary.cpa-download-section-title {
            display: flex; align-items: center; justify-content: flex-start; width: 100%; box-sizing: border-box;
            padding: 10px 12px; border-radius: 8px; cursor: pointer; list-style: none;
            font: 600 12.5px var(--font-body, 'DM Sans', system-ui, sans-serif); color: var(--color-text, rgb(26, 58, 26));
            text-transform: none; letter-spacing: normal;
        }
        .cpa-filter-panel summary.cpa-download-section-title::-webkit-details-marker { display: none; }
        .cpa-filter-panel summary.cpa-download-section-title:hover { background: var(--color-surface-light, rgb(240, 245, 235)); }
        .cpa-filter-panel summary.cpa-download-section-title::after {
            content: ''; flex: none; width: 6px; height: 6px; margin-left: 8px;
            border-right: 1.5px solid var(--color-primary-light, rgb(100, 140, 88));
            border-bottom: 1.5px solid var(--color-primary-light, rgb(100, 140, 88));
            transform: rotate(-45deg); transition: transform 0.15s ease;
        }
        .cpa-filter-panel details[open] > summary.cpa-download-section-title::after { transform: rotate(45deg); }
        .cpa-filter-panel .cpa-filter-badge {
            margin-left: auto; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
            font: 600 10.5px var(--font-body, 'DM Sans', system-ui, sans-serif);
            background: var(--color-surface-light, rgb(240, 245, 235)); color: var(--color-primary, rgb(50, 70, 53));
        }
        .cpa-filter-panel .cpa-filter-badge.is-partial {
            background: var(--color-primary-light, rgb(100, 140, 88)); color: #fff;
        }
        .cpa-filter-panel .cpa-filter-row {
            display: flex; align-items: center; gap: 8px; padding: 4px 8px; margin: 0 4px; border-radius: 6px; cursor: pointer;
            font: 500 12.5px var(--font-body, 'DM Sans', system-ui, sans-serif); color: var(--color-text, rgb(26, 58, 26));
        }
        .cpa-filter-panel .cpa-filter-row:hover { background: rgba(100, 140, 88, 0.08); }
        .cpa-filter-panel .cpa-filter-group > .cpa-filter-row { font-weight: 600; }
        .cpa-filter-panel .cpa-filter-children {
            margin-left: 18px; padding-left: 8px; border-left: 1px solid var(--color-border, rgb(176, 192, 176));
        }
        .cpa-filter-panel input[type=checkbox], .cpa-filter-panel input[type=range] {
            accent-color: var(--color-primary-light, rgb(100, 140, 88));
        }
        .cpa-filter-panel .cpa-filter-note {
            padding: 2px 12px 8px; font: 400 11px var(--font-body, 'DM Sans', system-ui, sans-serif);
            color: rgba(42, 58, 42, 0.65);
        }
        .cpa-filter-panel .cpa-filter-range-readout {
            padding: 2px 10px 0; text-align: center;
            font: 600 12.5px var(--font-body, 'DM Sans', system-ui, sans-serif); color: var(--color-text, rgb(26, 58, 26));
        }
        .cpa-filter-panel .cpa-filter-range { position: relative; height: 28px; margin: 4px 10px 8px; }
        .cpa-filter-panel .cpa-filter-range-track, .cpa-filter-panel .cpa-filter-range-fill {
            position: absolute; top: 12px; height: 4px; border-radius: 2px;
        }
        .cpa-filter-panel .cpa-filter-range-track { left: 8px; right: 8px; background: var(--color-border, rgb(176, 192, 176)); }
        .cpa-filter-panel .cpa-filter-range-fill { background: var(--color-primary-light, rgb(100, 140, 88)); }
        .cpa-filter-panel .cpa-filter-range input[type=range] {
            position: absolute; left: 0; top: 0; width: 100%; height: 28px; margin: 0; z-index: 3;
            background: none; appearance: none; -webkit-appearance: none; pointer-events: none;
        }
        .cpa-filter-panel .cpa-filter-range input[type=range]::-webkit-slider-runnable-track { background: transparent; height: 28px; }
        .cpa-filter-panel .cpa-filter-range input[type=range]::-moz-range-track { background: transparent; height: 28px; }
        .cpa-filter-panel .cpa-filter-range input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none; pointer-events: auto; cursor: pointer;
            width: 16px; height: 16px; margin-top: 6px; border-radius: 50%; box-sizing: border-box;
            background: #fff; border: 2px solid var(--color-primary-light, rgb(100, 140, 88));
            box-shadow: 0 1px 3px rgba(42, 58, 42, 0.25);
        }
        .cpa-filter-panel .cpa-filter-range input[type=range]::-moz-range-thumb {
            pointer-events: auto; cursor: pointer; box-sizing: border-box;
            width: 16px; height: 16px; border-radius: 50%;
            background: #fff; border: 2px solid var(--color-primary-light, rgb(100, 140, 88));
            box-shadow: 0 1px 3px rgba(42, 58, 42, 0.25);
        }
        .cpa-filter-panel .cpa-filter-footer {
            position: sticky; bottom: -10px; z-index: 2;
            background: linear-gradient(to top, #fff 75%, rgba(255, 255, 255, 0));
            padding: 10px 0 6px;
        }
        .cpa-filter-panel .cpa-filter-download {
            display: flex; align-items: center; justify-content: center; gap: 8px;
            width: calc(100% - 20px); margin: 0 10px; padding: 9px 12px; border: none; border-radius: 10px;
            background: var(--color-primary, rgb(50, 70, 53)); color: #fff; cursor: pointer;
            font: 600 12.5px var(--font-body, 'DM Sans', system-ui, sans-serif);
        }
        .cpa-filter-panel .cpa-filter-download:hover { background: var(--color-primary-light, rgb(100, 140, 88)); }
        .cpa-filter-panel .cpa-filter-download:disabled { opacity: 0.6; cursor: default; }
        @media (max-width: 640px) {
            .cpa-filter-menu .cpa-filter-panel { right: -54px; width: min(92vw, 300px); }
            .cpa-filter-menu.is-open .cpa-filter-panel { transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
};

export function registerPolicyFilterMenu(opts: {
    container: HTMLElement; rows: PolicyRow[];
    onChange: (state: PolicyFilterState) => void;
    onDownload: (state: PolicyFilterState) => void | Promise<void>;
}): { setVisible(visible: boolean): void } {
    ensureStyles();
    const { container, rows, onChange } = opts;
    const defaults = defaultFilterState(rows);
    const baseline = serialize(defaults);
    const state = cloneState(defaults);
    const syncers: (() => void)[] = [];
    const syncAll = () => syncers.forEach((f) => f());

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const root = document.createElement('div');
    root.className = 'cpa-filter-menu';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cpa-download-trigger';
    trigger.setAttribute('aria-label', 'Filter policies');
    trigger.setAttribute('title', 'Filter policies');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = FILTER_ICON_SVG;

    const panel = document.createElement('aside');
    panel.className = 'cpa-download-sidebar cpa-filter-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Filter policies');

    const header = document.createElement('div');
    header.className = 'cpa-download-sidebar-header';
    header.innerHTML = '<span>Filter policies</span>';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'cpa-filter-reset';
    resetBtn.textContent = 'Reset';
    header.appendChild(resetBtn);
    panel.appendChild(header);

    const commit = () => {
        syncAll();
        root.classList.toggle('has-active', serialize(state) !== baseline);
        onChange(cloneState(state));
    };

    const addRow = (parent: HTMLElement, text: string, child: boolean): HTMLInputElement => {
        const row = document.createElement('label');
        row.className = 'cpa-filter-row' + (child ? ' is-child' : '');
        const input = document.createElement('input');
        input.type = 'checkbox';
        const span = document.createElement('span');
        span.textContent = text;
        row.append(input, span);
        parent.appendChild(row);
        return input;
    };

    const setCheckbox = (parent: HTMLElement, text: string, kind: SetKey, key: string, child: boolean) => {
        const input = addRow(parent, text, child);
        input.addEventListener('change', () => {
            if (input.checked) state[kind].add(key);
            else state[kind].delete(key);
            commit();
        });
        syncers.push(() => { input.checked = state[kind].has(key); });
    };

    const flagCheckbox = (parent: HTMLElement, text: string, key: FlagKey) => {
        const input = addRow(parent, text, false);
        input.addEventListener('change', () => {
            state[key] = input.checked;
            commit();
        });
        syncers.push(() => { input.checked = state[key]; });
    };

    const bulkRow = (parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement => {
        const row = document.createElement('div');
        row.className = 'cpa-filter-bulk';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cpa-filter-link';
        btn.textContent = text;
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            onClick();
        });
        row.appendChild(btn);
        parent.appendChild(row);
        return btn;
    };

    const bulkSet = (parent: HTMLElement, kind: SetKey, keys: string[]) => {
        const isAll = () => keys.every((k) => state[kind].has(k));
        const btn = bulkRow(parent, 'Select all', () => {
            const all = isAll();
            for (const k of keys) {
                if (all) state[kind].delete(k);
                else state[kind].add(k);
            }
            commit();
        });
        syncers.push(() => { btn.textContent = isAll() ? 'Deselect all' : 'Select all'; });
    };

    const renderGroups = (parent: HTMLElement, groups: Group[], kind: SetKey) => {
        for (const g of groups) {
            if (g.options.length === 1) {
                setCheckbox(parent, g.options[0].label, kind, g.options[0].key, false);
                continue;
            }
            const wrap = document.createElement('div');
            wrap.className = 'cpa-filter-group';
            const parentInput = addRow(wrap, g.label, false);
            parentInput.addEventListener('change', () => {
                for (const o of g.options) {
                    if (parentInput.checked) state[kind].add(o.key);
                    else state[kind].delete(o.key);
                }
                commit();
            });
            syncers.push(() => {
                const n = g.options.filter((o) => state[kind].has(o.key)).length;
                parentInput.checked = n === g.options.length;
                parentInput.indeterminate = n > 0 && n < g.options.length;
            });
            const kids = document.createElement('div');
            kids.className = 'cpa-filter-children';
            for (const o of g.options) setCheckbox(kids, o.label, kind, o.key, true);
            wrap.appendChild(kids);
            parent.appendChild(wrap);
        }
    };

    // Badge for a section whose options are all keys of one set: "All" or "N of M".
    const countOf = (kind: SetKey, keys: string[]) => (): Badge => {
        const n = keys.filter((k) => state[kind].has(k)).length;
        return n === keys.length ? { text: 'All', all: true } : { text: `${n} of ${keys.length}`, all: false };
    };
    const section = (title: string, badge: () => Badge, fill: (body: HTMLElement) => void) => {
        const d = document.createElement('details');
        d.className = 'cpa-download-section';
        d.open = false;
        const s = document.createElement('summary');
        s.className = 'cpa-download-section-title';
        s.textContent = title;
        const pill = document.createElement('span');
        pill.className = 'cpa-filter-badge';
        s.appendChild(pill);
        d.appendChild(s);
        syncers.push(() => {
            const b = badge();
            pill.textContent = b.text;
            pill.classList.toggle('is-partial', !b.all);
        });
        fill(d);
        panel.appendChild(d);
    };

    // Data-derived options
    const measureLabels = firstSeen(rows, 'measure', (v) => v.toLowerCase(), 'Unspecified');
    const techLabels = firstSeen(rows, 'Technology_type', (v) => v, 'Unspecified');
    const versionLabels = firstSeen(rows, 'added_in_version', (v) => v, 'Unknown');
    const eventCounts = new Map<string, number>();
    for (const r of rows) for (const e of eventTypes(r)) eventCounts.set(e, (eventCounts.get(e) ?? 0) + 1);
    const eventKeys = [...eventCounts.keys()].sort((a, b) =>
        (a === 'introduced' ? 0 : 1) - (b === 'introduced' ? 0 : 1) || (eventCounts.get(b)! - eventCounts.get(a)!));

    section('Instruments', countOf('measures', [...measureLabels.keys()]), (d) => {
        bulkSet(d, 'measures', [...measureLabels.keys()]);
        renderGroups(d, buildTree(measureLabels, INSTRUMENT_FAMILIES), 'measures');
    });
    section('Technology', countOf('techs', [...techLabels.keys()]), (d) => {
        bulkSet(d, 'techs', [...techLabels.keys()]);
        renderGroups(d, buildTree(techLabels, TECH_GROUPS), 'techs');
    });

    section('Years', () => {
        const all = state.yearFrom === defaults.yearFrom && state.yearTo === defaults.yearTo;
        return { text: all ? 'All' : `${state.yearFrom}–${state.yearTo}`, all };
    }, (d) => {
        bulkRow(d, 'All years', () => {
            state.yearFrom = defaults.yearFrom;
            state.yearTo = defaults.yearTo;
            commit();
        });
        const span = Math.max(1, defaults.yearTo - defaults.yearFrom);
        const pct = (y: number) => (y - defaults.yearFrom) / span;
        const rangeInput = (label: string): HTMLInputElement => {
            const el = document.createElement('input');
            el.type = 'range';
            el.min = String(defaults.yearFrom);
            el.max = String(defaults.yearTo);
            el.step = '1';
            el.setAttribute('aria-label', label);
            return el;
        };
        const readout = document.createElement('div');
        readout.className = 'cpa-filter-range-readout';
        const wrap = document.createElement('div');
        wrap.className = 'cpa-filter-range';
        const track = document.createElement('div');
        track.className = 'cpa-filter-range-track';
        const fill = document.createElement('div');
        fill.className = 'cpa-filter-range-fill';
        const from = rangeInput('From year');
        const to = rangeInput('To year');
        const paint = () => {
            const a = Number(from.value);
            const b = Number(to.value);
            readout.textContent = `${a} – ${b}`;
            fill.style.left = `calc(8px + (100% - 16px) * ${pct(a)})`;
            fill.style.width = `calc((100% - 16px) * ${pct(b) - pct(a)})`;
            from.style.zIndex = a >= defaults.yearTo ? '4' : '';
        };
        // Handles cannot cross: the moved handle is clamped to the other one.
        from.addEventListener('input', () => {
            from.value = String(Math.min(Number(from.value), Number(to.value)));
            paint();
        });
        to.addEventListener('input', () => {
            to.value = String(Math.max(Number(to.value), Number(from.value)));
            paint();
        });
        from.addEventListener('change', () => {
            state.yearFrom = Number(from.value);
            commit();
        });
        to.addEventListener('change', () => {
            state.yearTo = Number(to.value);
            commit();
        });
        syncers.push(() => {
            from.value = String(state.yearFrom);
            to.value = String(state.yearTo);
            paint();
        });
        wrap.append(track, fill, from, to);
        d.append(readout, wrap);
    });

    section('Change event', countOf('events', eventKeys), (d) => {
        bulkSet(d, 'events', eventKeys);
        for (const k of eventKeys) setCheckbox(d, displayLabel(k), 'events', k, false);
        const note = document.createElement('div');
        note.className = 'cpa-filter-note';
        note.textContent = 'Applies to map counts and download. Dashboards show all years.';
        d.appendChild(note);
    });

    section('Target actor', countOf('actors', [...ACTOR_LABELS]), (d) => {
        bulkSet(d, 'actors', [...ACTOR_LABELS]);
        for (const label of ACTOR_LABELS) setCheckbox(d, label, 'actors', label, false);
    });

    section('Data version', countOf('versions', [...versionLabels.keys()]), (d) => {
        const sorted = [...versionLabels.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        bulkSet(d, 'versions', sorted.map((e) => e[0]));
        for (const [key, label] of sorted) setCheckbox(d, label, 'versions', key, false);
        flagCheckbox(d, 'Include deprecated rows', 'includeDeprecated');
    });

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'cpa-filter-download';
    downloadBtn.innerHTML = `${DOWNLOAD_ICON_SVG}<span>Download filtered data</span>`;
    downloadBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        downloadBtn.disabled = true;
        try {
            await opts.onDownload(cloneState(state));
        } catch (err) {
            console.error(err);
        } finally {
            downloadBtn.disabled = false;
        }
    });
    const footer = document.createElement('div');
    footer.className = 'cpa-filter-footer';
    footer.appendChild(downloadBtn);
    panel.appendChild(footer);

    resetBtn.addEventListener('click', (event) => {
        event.preventDefault();
        Object.assign(state, cloneState(defaults));
        commit();
    });

    const setOpen = (open: boolean) => {
        root.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
    };
    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        setOpen(!root.classList.contains('is-open'));
    });
    document.addEventListener('click', (event) => {
        if (!root.contains(event.target as Node)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && root.classList.contains('is-open')) {
            setOpen(false);
            trigger.focus();
        }
    });

    syncAll();
    root.appendChild(panel);
    root.appendChild(trigger);
    container.appendChild(root);

    return {
        setVisible(visible: boolean) {
            root.hidden = !visible;
            if (!visible) setOpen(false);
        },
    };
}
