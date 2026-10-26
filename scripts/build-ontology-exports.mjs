/**
 * Writes the downloadable ontology PDF without running the full site build.
 * The Vite build emits the same file automatically (scripts/vite-plugin-machine-readable.mjs).
 *
 *   node scripts/build-ontology-exports.mjs [--out <dir>] [--overview columns|radial]
 */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadOntology, flattenOntology, ontologyDataDate } from './ontology/model.mjs';
import { buildOntologyPdf } from './ontology/pdf.mjs';
const root = resolve(fileURLToPath(import.meta.url), '../..');
const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : fallback;
};
const outDir = resolve(root, arg('out', 'dist-ontology'));
const overview = arg('overview', 'columns');

const terms = flattenOntology(loadOntology(root));
const date = ontologyDataDate(root);
mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, 'ontology_interactive.pdf'), await buildOntologyPdf(terms, { date, overview }));
console.log(`Wrote ontology_interactive.pdf (${overview} overview) to ${outDir}`);
