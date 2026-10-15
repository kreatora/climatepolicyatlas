/**
 * Machine-readable layer for the Climate Policy Atlas.
 *
 * The interactive pages (ontology tree, world map) are rendered by JavaScript,
 * which most crawlers and LLM tools never execute. At build time this plugin adds:
 *   - per-page <meta name="description">, canonical URL and Open Graph tags
 *   - JSON-LD (schema.org): WebSite/Organization on the home page,
 *     DefinedTermSet for the ontology, Dataset entries on the data page
 *   - sitemap.xml and ontology.md (plain-text copy of the ontology)
 *
 * Single source of truth: public/ontology_tree.json and src/data-metadata.ts.
 */
import { readFileSync } from 'fs';
import { resolve, basename } from 'path';
import { getDatasetMetadata } from '../src/data-metadata.ts';

export const SITE_URL = 'https://climatepolicyatlas.org';

const ONTOLOGY_REPO_URL = 'https://github.com/OpenEnergyPlatform/climate-energy-policy-ontology';
const ONTOLOGY_DOI_URL = 'https://doi.org/10.5281/zenodo.15583093';
const CONTACT_EMAIL = 'climatepolicyatlas@nfdi4energy.org';

const PUBLISHER = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#publisher`,
    name: 'Sustainability Transition Policy Group, Friedrich-Alexander-Universität Erlangen-Nürnberg (FAU)',
    url: 'https://www.transitionpolicy.rw.fau.de/',
    email: CONTACT_EMAIL,
    parentOrganization: {
        '@type': 'CollegeOrUniversity',
        name: 'Friedrich-Alexander-Universität Erlangen-Nürnberg',
        url: 'https://www.fau.eu/',
    },
};

const FUNDER = {
    '@type': 'Organization',
    name: 'NFDI4Energy (German Research Foundation, DFG)',
    url: 'https://nfdi4energy.uol.de/',
};

/** Page path (relative to site root) → metadata. Order is the sitemap order. */
const PAGES = {
    'index.html': {
        path: '',
        description:
            'Climate Policy Atlas: curated, open research data on climate and energy policy instruments and targets, ' +
            'structured by the Climate and Energy Policy Ontology (CEPO). Sustainability Transition Policy Group, ' +
            'FAU Erlangen-Nürnberg, funded by NFDI4Energy.',
    },
    'ontology.html': {
        path: 'ontology.html',
        description:
            'The Climate and Energy Policy Ontology (CEPO): mutually exclusive definitions of climate and energy policy ' +
            'instrument types and how they relate, from financial incentives to regulatory standards.',
    },
    'world-map.html': {
        path: 'world-map.html',
        description:
            'Interactive map of climate and energy policy: renewable electricity support, electric vehicle support, ' +
            'renewable energy and emission reduction targets, and siting regulations by country.',
    },
    'data.html': {
        path: 'data.html',
        description:
            'Download Climate Policy Atlas research datasets (CC BY 4.0) on renewable electricity support, electric ' +
            'vehicle support, renewable energy targets and climate targets, with versioned DOIs on Zenodo.',
    },
    'about-us.html': {
        path: 'about-us.html',
        description:
            'The team behind the Climate Policy Atlas at the Sustainability Transition Policy Group, ' +
            'Friedrich-Alexander-Universität Erlangen-Nürnberg.',
    },
    'imprint.html': { path: 'imprint.html', description: 'Imprint (legal notice) of the Climate Policy Atlas.' },
    'privacy.html': { path: 'privacy.html', description: 'Privacy policy of the Climate Policy Atlas.' },
    'accessibility.html': {
        path: 'accessibility.html',
        description: 'Accessibility statement of the Climate Policy Atlas.',
    },
};

/** Datasets published with a DOI; these become schema.org Dataset entries. */
const PUBLISHED_DATASET_KEYS = ['reSupport', 'evSupport', 'reTargets', 'climateTargets'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const escapeXml = escapeHtml;

/** JSON safe to embed inside <script>. */
const jsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const pageUrl = (path) => `${SITE_URL}/${path}`;

function loadOntology(root) {
    return JSON.parse(readFileSync(resolve(root, 'public/ontology_tree.json'), 'utf8'));
}

/** Flatten the tree, assigning each term a unique, stable id (used as its JSON-LD identifier). */
function flattenOntology(tree) {
    const used = new Set();
    const terms = [];
    const slugify = (name) =>
        'term-' +
        name
            .toLowerCase()
            .replace(/&/g, ' and ')
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    const walk = (nodes, parent, depth) => {
        for (const node of nodes) {
            let id = slugify(node.name);
            for (let i = 2; used.has(id); i++) id = `${slugify(node.name)}-${i}`;
            used.add(id);
            const term = { id, name: node.name.trim(), definition: (node.definition || '').trim(), parent, depth, children: [] };
            terms.push(term);
            if (parent) parent.children.push(term);
            walk(node.children || [], term, depth + 1);
        }
    };
    walk(tree, null, 0);
    return terms;
}

// ---------------------------------------------------------------------------
// Ontology outputs
// ---------------------------------------------------------------------------

function ontologyJsonLd(terms) {
    const setId = `${pageUrl('ontology.html')}#cepo`;
    return {
        '@context': ['https://schema.org', { skos: 'http://www.w3.org/2004/02/skos/core#' }],
        '@type': 'DefinedTermSet',
        '@id': setId,
        name: 'Climate and Energy Policy Ontology (CEPO)',
        description: PAGES['ontology.html'].description,
        url: pageUrl('ontology.html'),
        isBasedOn: ONTOLOGY_REPO_URL,
        identifier: ONTOLOGY_DOI_URL,
        publisher: { '@id': PUBLISHER['@id'] },
        inLanguage: 'en',
        hasDefinedTerm: terms.map((t) => ({
            '@type': 'DefinedTerm',
            '@id': `${pageUrl('ontology.html')}#${t.id}`,
            name: t.name,
            description: t.definition || undefined,
            inDefinedTermSet: { '@id': setId },
            'skos:broader': t.parent ? { '@id': `${pageUrl('ontology.html')}#${t.parent.id}` } : undefined,
        })),
    };
}

function ontologyMarkdown(terms) {
    const lines = [
        '# Climate and Energy Policy Ontology (CEPO)',
        '',
        `Source: ${pageUrl('ontology.html')} (Climate Policy Atlas). Canonical OWL ontology: ${ONTOLOGY_REPO_URL} (DOI ${ONTOLOGY_DOI_URL}).`,
        '',
        'Terms are nested by subtype: each term is a kind of its parent. Sibling categories are designed to be mutually exclusive.',
        'When quoting a definition, use it verbatim and cite the ontology.',
        '',
    ];
    for (const t of terms) {
        const indent = '  '.repeat(t.depth);
        const def = t.definition ? `: ${t.definition.replace(/\s+/g, ' ')}` : '';
        lines.push(`${indent}- **${t.name}**${def}`);
    }
    return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Dataset / site JSON-LD
// ---------------------------------------------------------------------------

function parseCreators(citation) {
    const authorPart = citation.split(/\s\(\d{4}/)[0];
    const people = [...authorPart.matchAll(/([\p{Lu}][\p{L}'’-]+),?\s+((?:\p{Lu}\.\s?)+)/gu)].map((m) => ({
        '@type': 'Person',
        familyName: m[1],
        givenName: m[2].trim(),
        name: `${m[2].trim()} ${m[1]}`,
    }));
    return people.length ? people : [{ '@id': PUBLISHER['@id'] }];
}

function datasetsJsonLd() {
    return {
        '@context': 'https://schema.org',
        '@graph': PUBLISHED_DATASET_KEYS.map((key) => {
            const meta = getDatasetMetadata(key);
            const doi = meta.suggestedCitation.match(/10\.5281\/zenodo\.\d+/)?.[0];
            const title = meta.suggestedCitation.match(/\):\s*(.+?)\s*\(Version/)?.[1] ?? meta.dataSource;
            const version = meta.suggestedCitation.match(/Version\s+([\w.]+)/)?.[1];
            const zenodo = meta.relatedLinks?.find((l) => l.url.includes('zenodo.org'))?.url;
            return {
                '@type': 'Dataset',
                name: title,
                alternateName: meta.dataSource,
                description: meta.about,
                url: pageUrl('data.html'),
                sameAs: zenodo,
                identifier: doi ? `https://doi.org/${doi}` : undefined,
                version,
                license: meta.licenseUrl,
                isAccessibleForFree: true,
                creator: parseCreators(meta.suggestedCitation),
                publisher: { '@id': PUBLISHER['@id'] },
                funder: FUNDER,
                citation: meta.suggestedCitation,
                creditText: meta.suggestedCitation,
                inLanguage: 'en',
            };
        }),
    };
}

function siteJsonLd() {
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${SITE_URL}/#website`,
                name: 'Climate Policy Atlas',
                url: `${SITE_URL}/`,
                description: PAGES['index.html'].description,
                publisher: { '@id': PUBLISHER['@id'] },
                funder: FUNDER,
                inLanguage: 'en',
            },
            PUBLISHER,
        ],
    };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default function machineReadable() {
    let root = process.cwd();
    return {
        name: 'climate-policy-atlas-machine-readable',
        configResolved(config) {
            root = config.root;
        },
        transformIndexHtml(html, ctx) {
            const file = basename(ctx.filename || ctx.path || '');
            const page = PAGES[file];
            if (!page) return html;

            const url = pageUrl(page.path);
            const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Climate Policy Atlas';
            const tags = [
                { tag: 'meta', attrs: { name: 'description', content: page.description }, injectTo: 'head' },
                { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
                { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
                { tag: 'meta', attrs: { property: 'og:site_name', content: 'Climate Policy Atlas' }, injectTo: 'head' },
                { tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' },
                { tag: 'meta', attrs: { property: 'og:description', content: page.description }, injectTo: 'head' },
                { tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' },
            ];
            const jsonLd = (obj) => ({
                tag: 'script',
                attrs: { type: 'application/ld+json' },
                children: jsonForScript(obj),
                injectTo: 'head',
            });

            if (file === 'index.html') tags.push(jsonLd(siteJsonLd()));
            if (file === 'data.html') tags.push(jsonLd(datasetsJsonLd()));
            if (file === 'ontology.html') {
                const terms = flattenOntology(loadOntology(root));
                tags.push(
                    jsonLd(ontologyJsonLd(terms)),
                    { tag: 'link', attrs: { rel: 'alternate', type: 'application/json', href: 'ontology_tree.json', title: 'CEPO ontology (JSON)' }, injectTo: 'head' },
                    { tag: 'link', attrs: { rel: 'alternate', type: 'text/markdown', href: 'ontology.md', title: 'CEPO ontology (Markdown)' }, injectTo: 'head' },
                );
            }
            return { html, tags };
        },
        generateBundle() {
            const today = new Date().toISOString().slice(0, 10);
            const sitemap =
                '<?xml version="1.0" encoding="UTF-8"?>\n' +
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                Object.values(PAGES)
                    .map((p) => `  <url><loc>${escapeXml(pageUrl(p.path))}</loc><lastmod>${today}</lastmod></url>`)
                    .join('\n') +
                '\n</urlset>\n';
            this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
            this.emitFile({
                type: 'asset',
                fileName: 'ontology.md',
                source: ontologyMarkdown(flattenOntology(loadOntology(root))),
            });
        },
    };
}
