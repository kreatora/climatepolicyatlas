/**
 * Shared ontology model for every build-time ontology output
 * (JSON-LD, Markdown, PDF), so term ids stay identical across them.
 */
import { execFileSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';

export const SITE_URL = 'https://climatepolicyatlas.org';
export const ONTOLOGY_PAGE_URL = `${SITE_URL}/ontology.html`;
export const ONTOLOGY_REPO_URL = 'https://github.com/OpenEnergyPlatform/climate-energy-policy-ontology';
export const ONTOLOGY_DOI_URL = 'https://doi.org/10.5281/zenodo.15583093';
export const CONTACT_EMAIL = 'climatepolicyatlas@nfdi4energy.org';
export const ONTOLOGY_TITLE = 'Climate and Energy Policy Ontology (CEPO)';
export const PUBLISHER_NAME = 'Sustainability Transition Policy Group, FAU Erlangen-Nürnberg';
export const SUGGESTED_CITATION =
    `${ONTOLOGY_TITLE}. ${PUBLISHER_NAME}. Climate Policy Atlas, ${ONTOLOGY_PAGE_URL}. ` +
    `Canonical OWL version: ${ONTOLOGY_DOI_URL}`;

/**
 * Colour per top-level branch, keyed by the name of the branch's root term.
 * Terms outside these branches inherit the colour of the closest coloured ancestor.
 */
export const FAMILY_COLORS = {
    'Public policies': '#b3261e',
    'Policy goals': '#c62828',
    'Policy instruments': '#2f5f8f',
    'Economic instrument': '#c86a00',
    'Information instrument': '#2f7bbf',
    'Regulatory instrument': '#3d8b45',
    'Voluntary instrument': '#8d5129',
};
const DEFAULT_COLOR = '#55606e';

const ONTOLOGY_FILE = 'public/ontology_tree.json';

export function loadOntology(root) {
    return JSON.parse(readFileSync(resolve(root, ONTOLOGY_FILE), 'utf8'));
}

/**
 * Date the ontology data last changed: its last commit, or the file's mtime outside git.
 * Using this (not "now") keeps the generated PDF/HTML byte-stable between builds.
 */
export function ontologyDataDate(root) {
    try {
        const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', ONTOLOGY_FILE], {
            cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (iso) return new Date(iso);
    } catch {
        // not a git checkout
    }
    return statSync(resolve(root, ONTOLOGY_FILE)).mtime;
}

/** Flatten the tree, assigning each term a unique, stable id (used as its anchor / JSON-LD identifier). */
export function flattenOntology(tree) {
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
            const name = node.name.trim();
            const color = FAMILY_COLORS[name] || parent?.color || DEFAULT_COLOR;
            const term = {
                id,
                name,
                definition: (node.definition || '').trim().replace(/\s+/g, ' '),
                parent,
                depth,
                color,
                children: [],
            };
            terms.push(term);
            if (parent) parent.children.push(term);
            walk(node.children || [], term, depth + 1);
        }
    };
    walk(tree, null, 0);
    return terms;
}

/** Ancestors from the root down to (excluding) the term. */
export function ancestorsOf(term) {
    const out = [];
    for (let cur = term.parent; cur; cur = cur.parent) out.unshift(cur);
    return out;
}

export function descendantsOf(term) {
    const out = [];
    const walk = (t) => t.children.forEach((c) => { out.push(c); walk(c); });
    walk(term);
    return out;
}
