/**
 * Dataset metadata for map/chart attribution, exports, and the "Learn more" modal.
 * Pattern inspired by Our World in Data chart footers.
 */

export type DatasetKey =
    | 'reSupport'
    | 'evSupport'
    | 'reTargets'
    | 'climateTargets'
    | 'buildCodes'
    | 'buildableLand';

export interface DatasetMetadata {
    /** Short label for the data source line (shown in chart footer). */
    dataSource: string;
    /** Full bibliographic citation users should copy. */
    suggestedCitation: string;
    /** License shorthand, e.g. "CC BY 4.0". */
    license: string;
    licenseUrl: string;
    /** Canonical page slug for the citation line (domain omitted). */
    pageSlug: string;
    /** Longer description for the learn-more modal. */
    about: string;
    /** Optional bullet notes (methodology, caveats, etc.). */
    notes?: string[];
    relatedLinks?: Array<{ label: string; url: string }>;
}

const ATLAS_PUBLISHER =
    'Sustainability Transition Policy Group, Friedrich-Alexander-Universität Erlangen-Nürnberg';

/** Domain only; pageSlug supplies the page path (e.g. "world-map"), so the label must not repeat it. */
export const ATLAS_SITE_LABEL = 'ClimatePolicyAtlas.org';

/**
 * Zenodo record IDs (also DOI suffixes). Must match the links on data.html (the Data page).
 * Single source of truth for the map attribution, the "Learn more" modal and the JSON-LD export.
 */
export const ZENODO_RECORD_IDS = {
    reSupport: '21208041',
    evSupport: '18328109',
    reTargets: '21106558',
    climateTargets: '21107298',
    regulations: '21107423',
} as const;

const REGULATIONS_CITATION =
    `Chaianong, A., Günkördü, D., Lebedeva, D., Malhotra, P., Milioritsas, I., Weiß, J., Weko, S., and Lilliestam, J. (2026): Data on landscape and environmental regulations for energy production and infrastructure (Version 1, July 2026). Sustainability Transition Policy Group, Friedrich-Alexander-Universität Erlangen-Nürnberg. DOI: 10.5281/zenodo.${ZENODO_RECORD_IDS.regulations}`;

const zenodoUrl = (id: string): string => `https://zenodo.org/records/${id}`;

const DATASETS: Record<DatasetKey, DatasetMetadata> = {
    reSupport: {
        dataSource: 'Climate Policy Atlas — Renewable electricity support instruments (2000–2024)',
        suggestedCitation:
            `Weko, S., Bold, F., Chaianong, A., Günkördü, D., Lebedeva, D., Malhotra, P., Milioritsas, I., Weiß, J., and Lilliestam, J. (2026): Data on policy support for renewable electricity (Version 1.1, July 2026). Friedrich-Alexander-Universität Erlangen-Nürnberg. DOI: 10.5281/zenodo.${ZENODO_RECORD_IDS.reSupport}`,
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        pageSlug: 'world-map',
        about:
            'Country-level counts and details of renewable electricity support instruments ' +
            'collected for EU member states and the UK, covering the period 2000–2024.',
        notes: [
            'If you reuse emissions-trading or carbon-tax components, cite the World Bank Carbon Pricing Dashboard separately.',
            'Data are free to reuse with appropriate attribution (see Zenodo record for full terms).',
        ],
        relatedLinks: [
            { label: 'Zenodo dataset', url: zenodoUrl(ZENODO_RECORD_IDS.reSupport) },
            { label: 'Data page', url: 'data.html' },
        ],
    },
    evSupport: {
        dataSource: 'Climate Policy Atlas — Electric vehicle support instruments',
        suggestedCitation:
            `Weko, S., Bold, F., Chaianong, A., Günkördü, D., Lebedeva, D., Malhotra, P., Milioritsas, I., Weiß, J., and Lilliestam, J. (2026): Data on policy support for electric vehicles (Version 1, January 2026). Friedrich-Alexander-Universität Erlangen-Nürnberg. DOI: 10.5281/zenodo.${ZENODO_RECORD_IDS.evSupport}`,
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        pageSlug: 'world-map',
        about:
            'Electric vehicle support instruments for France, Germany, Ireland, and Greece, ' +
            'including introduction years and policy types.',
        relatedLinks: [
            { label: 'Zenodo dataset', url: zenodoUrl(ZENODO_RECORD_IDS.evSupport) },
            { label: 'Data page', url: 'data.html' },
        ],
    },
    reTargets: {
        dataSource: 'Climate Policy Atlas — Renewable energy targets (2020–2050)',
        suggestedCitation:
            `Chaianong, A., Günkördü, D., Malhotra, P., Milioritsas, I., Weko, S., and Lilliestam, J. (2026): Data on renewable electricity targets (Version 3, July 2026). Sustainability Transition Policy Group, Friedrich-Alexander-Universität Erlangen-Nürnberg. DOI: 10.5281/zenodo.${ZENODO_RECORD_IDS.reTargets}.`,
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        pageSlug: 'world-map',
        about:
            'Renewable electricity, renewable energy, and related targets by country, ' +
            'including decision year and target year.',
        relatedLinks: [
            { label: 'Zenodo dataset', url: zenodoUrl(ZENODO_RECORD_IDS.reTargets) },
            { label: 'Data page', url: 'data.html' },
        ],
    },
    climateTargets: {
        dataSource: 'Climate Policy Atlas — Emission reduction targets (% vs 1990 baseline)',
        suggestedCitation:
            `Chaianong, A., Malhotra P., Milioritsas, I., Weko, S., and Lilliestam, J. (2026): Data on climate targets (Version 3, June 2026). Sustainability Transition Policy Group, Friedrich-Alexander-Universität Erlangen-Nürnberg. DOI: 10.5281/zenodo.${ZENODO_RECORD_IDS.climateTargets}.`,
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        pageSlug: 'world-map',
        about:
            'National emission reduction targets expressed as percentage change compared to 1990 emissions baseline.',
        relatedLinks: [
            { label: 'Zenodo dataset', url: zenodoUrl(ZENODO_RECORD_IDS.climateTargets) },
            { label: 'Data page', url: 'data.html' },
        ],
    },
    buildCodes: {
        dataSource:
            'Climate Policy Atlas — Landscape and environmental regulations for energy production and infrastructure',
        suggestedCitation: REGULATIONS_CITATION,
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        pageSlug: 'world-map#regulations-build-codes',
        about:
            'Sub-national renewable-energy and EV charging regulations coded from legal sources ' +
            'for surveyed NUTS regions. Rules are classified as constraining or promoting and ' +
            'filtered by active status for the map metric (regulation balance: constraining minus promoting).',
        notes: [
            'Map colours show regulation balance (constraining minus promoting) among active rules.',
            'Demo visualisations — values are taken verbatim from the dataset.',
            'Inactive and overwritten rules are excluded from the map metric.',
        ],
        relatedLinks: [
            { label: 'Zenodo dataset', url: zenodoUrl(ZENODO_RECORD_IDS.regulations) },
            { label: 'Data page', url: 'data.html' },
            { label: 'Contact', url: 'mailto:climatepolicyatlas@nfdi4energy.org' },
        ],
    },
    buildableLand: {
        dataSource:
            'Regulations dataset (STP/FAU) + OpenStreetMap features + Eurostat NUTS (GISCO)',
        suggestedCitation:
            `${REGULATIONS_CITATION}. Buildable land rasters derived from the coded setback rules; ` +
            'OSM © OpenStreetMap contributors (ODbL).',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        pageSlug: 'world-map#regulations-buildable-land',
        about:
            'Two land models on a 250 m grid. Policy Only applies coded setbacks to coarse OpenStreetMap residential landuse. ' +
            'Full Screening uses all OpenStreetMap buildings and settlements, water, forest, nature reserves, ' +
            'slopes steeper than 20°, plus the same setback rules.',
        notes: [
            'Policy Only: setback rules on landuse=residential (regulatory view).',
            'Full Screening: building footprints, settlement areas, water, forest, nature, slope, plus rules.',
            'Neither model matches Tröndle et al. (2.5 m settlements, CORINE land cover) — compare as benchmark only.',
            'Re-bake rasters after pipeline updates: python scripts/build_buildable_rasters.py --overwrite',
        ],
        relatedLinks: [
            { label: 'Zenodo dataset (regulations)', url: zenodoUrl(ZENODO_RECORD_IDS.regulations) },
            { label: 'Data page', url: 'data.html' },
            {
                label: 'Tröndle et al. — technical potential maps (comparison)',
                url: 'https://timtroendle.github.io/possibility-for-electricity-autarky-map/',
            },
            {
                label: 'atlite land-use availability example',
                url: 'https://atlite.readthedocs.io/en/master/examples/landuse-availability.html',
            },
        ],
    },
};

export function getDatasetMetadata(key: DatasetKey): DatasetMetadata {
    return DATASETS[key];
}

export function resolveDatasetKey(mapType: string): DatasetKey {
    if (mapType === 'regulations') {
        return 'buildCodes';
    }
    if (mapType === 'ev') return 'evSupport';
    if (mapType === 'targets') return 'reTargets';
    if (mapType === 'climateTargets') return 'climateTargets';
    return 'reSupport';
}
