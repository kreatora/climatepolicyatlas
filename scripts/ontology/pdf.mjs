/**
 * Builds the downloadable ontology PDF (A3 landscape):
 *   page 1      overview of every concept
 *   pages 2..n  one page per family group: sub-tree diagram + definition glossary
 *   last page   alphabetical index, citation and licence
 *
 * Navigation uses only internal GoTo links, named destinations and bookmarks.
 * Those work in every common viewer (Acrobat, Preview, iOS/Android, Chrome, Firefox, Edge),
 * unlike form buttons or JavaScript.
 */
import PDFDocument from 'pdfkit';
import { createRequire } from 'module';
import {
    ONTOLOGY_TITLE, ONTOLOGY_PAGE_URL, ONTOLOGY_REPO_URL, ONTOLOGY_DOI_URL, CONTACT_EMAIL,
    SUGGESTED_CITATION, PUBLISHER_NAME, ancestorsOf, descendantsOf,
} from './model.mjs';

/**
 * Family pages. `root` is drawn in the first diagram column; `expand` lists the sub-trees shown in full.
 * Terms not covered here (e.g. a newly added family) are attached automatically to the page of their
 * parent, so the PDF never silently drops a concept.
 */
export const PAGE_GROUPS = [
    {
        key: 'core',
        title: 'Policy goals, information and voluntary instruments',
        short: 'Goals, information and voluntary',
        root: 'Public policies',
        expand: ['Policy goals', 'Information instrument', 'Voluntary instrument'],
    },
    {
        key: 'economic-1',
        title: 'Economic instruments I: Financial incentives',
        short: 'Economic I: Financial incentives',
        root: 'Economic instrument',
        expand: ['Financial incentive'],
    },
    {
        key: 'economic-2',
        title: 'Economic instruments II: Levies, direct investment and trading',
        short: 'Economic II: Levies, investment, trading',
        root: 'Economic instrument',
        expand: ['Levy', 'Direct investment', 'Trading scheme'],
    },
    {
        key: 'regulatory-1',
        title: 'Regulatory instruments I: Standards',
        short: 'Regulatory I: Standards',
        root: 'Regulatory instrument',
        expand: ['Standard'],
    },
    {
        key: 'regulatory-2',
        title: 'Regulatory instruments II: Zoning, market design and institutions',
        short: 'Regulatory II: Zoning, markets, institutions',
        root: 'Regulatory instrument',
        expand: ['Zoning and spatial planning regulation', 'Market design regulation', 'Institutional creation'],
    },
];

// A3 landscape, in points.
const PAGE_W = 1190.55;
const PAGE_H = 841.89;
const MARGIN = 36;
const HEADER_H = 78;
const FOOTER_Y = PAGE_H - 30;
const CONTENT_TOP = HEADER_H + 16;
const CONTENT_BOTTOM = FOOTER_Y - 12;

const INK = '#1f2933';
const MUTED = '#5b6672';
const FAINT = '#9aa4ae';
const RULE = '#dde3e8';
const BRAND = '#2a3a2a';

// WOFF (not WOFF2): fontkit cannot subset composite glyphs from WOFF2 files.
const require = createRequire(import.meta.url);
const FONT_FILES = {
    sans: '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff',
    sansItalic: '@fontsource/dm-sans/files/dm-sans-latin-400-italic.woff',
    sansMedium: '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff',
    sansBold: '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff',
    serifBold: '@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff',
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function mix(hex, amount, target = '#ffffff') {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [a, b] = [p(hex), p(target)];
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Page plan: which term lives on which page
// ---------------------------------------------------------------------------

function planPages(terms) {
    const byName = new Map();
    for (const t of terms) if (!byName.has(t.name)) byName.set(t.name, t);
    const order = new Map(terms.map((t, i) => [t, i]));

    const groups = [];
    for (const cfg of PAGE_GROUPS) {
        const root = byName.get(cfg.root);
        if (!root) {
            console.warn(`[ontology-pdf] Page "${cfg.title}": root "${cfg.root}" not found, page skipped.`);
            continue;
        }
        const expand = cfg.expand
            .map((name) => {
                const t = byName.get(name);
                if (!t) console.warn(`[ontology-pdf] Page "${cfg.title}": "${name}" not found, skipped.`);
                return t;
            })
            .filter(Boolean);
        groups.push({ ...cfg, root, expand });
    }

    const home = new Map();
    const shownOn = new Map(); // term -> Set(group)

    const isWithin = (t, root) => t === root || ancestorsOf(t).includes(root);
    const refreshGroup = (g) => {
        const shown = new Set([g.root]);
        for (const e of g.expand) {
            for (const a of ancestorsOf(e)) if (isWithin(a, g.root)) shown.add(a);
            shown.add(e);
            descendantsOf(e).forEach((d) => shown.add(d));
        }
        g.shown = shown;
    };

    groups.forEach(refreshGroup);
    const assignHomes = () => {
        home.clear();
        for (const g of groups) {
            for (const t of terms) if (g.shown.has(t) && !home.has(t)) home.set(t, g);
        }
    };
    assignHomes();

    // Attach uncovered terms to their parent's page (or a fallback page) so nothing is dropped.
    for (const t of terms) {
        if (home.has(t)) continue;
        const parentHome = t.parent && home.get(t.parent);
        if (parentHome) {
            parentHome.expand.push(t);
            refreshGroup(parentHome);
        } else {
            const g = { key: `other-${groups.length}`, title: `Further concepts: ${t.name}`, short: t.name, root: t, expand: [t] };
            refreshGroup(g);
            groups.push(g);
        }
        assignHomes();
    }

    for (const g of groups) for (const t of g.shown) {
        if (!shownOn.has(t)) shownOn.set(t, new Set());
        shownOn.get(t).add(g);
    }

    groups.forEach((g, i) => { g.pageNumber = i + 2; });
    return { groups, home, shownOn, order };
}

function pageRangeLabel(groupsSet) {
    const nums = [...groupsSet].map((g) => g.pageNumber).sort((a, b) => a - b);
    if (nums.length === 1) return `p. ${nums[0]}`;
    return `pp. ${nums[0]}–${nums[nums.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function artifact(doc, draw) {
    doc.markContent('Artifact', { type: 'Layout' });
    draw();
    doc.endMarkedContent();
}

function tagged(doc, parent, type, draw) {
    const el = doc.struct(type, {}, () => draw());
    parent.add(el);
    el.end();
}

function roundedBox(doc, x, y, w, h, { fill, stroke, dash, lineWidth = 0.8, radius = 3 }) {
    doc.save();
    doc.roundedRect(x, y, w, h, radius);
    if (dash) doc.dash(2.2, { space: 1.8 });
    doc.lineWidth(lineWidth);
    if (fill && stroke) doc.fillAndStroke(fill, stroke);
    else if (fill) doc.fill(fill);
    else if (stroke) doc.stroke(stroke);
    doc.restore();
}

function houseIcon(doc, x, y, s, color) {
    doc.save();
    doc.lineWidth(1.1).lineJoin('round').strokeColor(color);
    doc.moveTo(x, y + s * 0.45).lineTo(x + s / 2, y).lineTo(x + s, y + s * 0.45).stroke();
    doc.moveTo(x + s * 0.15, y + s * 0.35).lineTo(x + s * 0.15, y + s).lineTo(x + s * 0.85, y + s).lineTo(x + s * 0.85, y + s * 0.35).stroke();
    doc.restore();
}

// ---------------------------------------------------------------------------
// Header / footer
// ---------------------------------------------------------------------------

function drawHeader(doc, ctx, { title, subtitle, crumbs, accent, pageNumber, structParent }) {
    artifact(doc, () => {
        doc.rect(0, 0, 8, HEADER_H).fill(accent);
        doc.moveTo(MARGIN, HEADER_H).lineTo(PAGE_W - MARGIN, HEADER_H).lineWidth(0.8).stroke(RULE);
    });

    const navW = 330;
    const titleW = PAGE_W - MARGIN * 2 - navW - 20;
    tagged(doc, structParent, pageNumber === 1 ? 'H1' : 'H2', () => {
        doc.font('serifBold').fontSize(18).fillColor(INK).text(title, MARGIN, 20, { width: titleW, lineBreak: false, ellipsis: true });
    });

    if (crumbs && crumbs.length) {
        let x = MARGIN;
        const y = 50;
        doc.font('sans').fontSize(9);
        artifact(doc, () => {
            crumbs.forEach((c, i) => {
                const w = doc.widthOfString(c.label);
                doc.fillColor(MUTED).text(c.label, x, y, { lineBreak: false });
                if (c.dest) doc.goTo(x, y - 1, w, 12, c.dest);
                x += w;
                if (i < crumbs.length - 1) {
                    doc.fillColor(FAINT).text('  ›  ', x, y, { lineBreak: false });
                    x += doc.widthOfString('  ›  ');
                }
            });
        });
    } else if (subtitle) {
        tagged(doc, structParent, 'P', () => {
            doc.font('sans').fontSize(9.5).fillColor(MUTED).text(subtitle, MARGIN, 48, { width: titleW });
        });
    }

    // Navigation buttons (right side).
    artifact(doc, () => {
        const y = 22;
        const h = 26;
        let x = PAGE_W - MARGIN;
        const button = (label, dest, { primary = false, icon = false } = {}) => {
            doc.font('sansMedium').fontSize(10);
            const w = doc.widthOfString(label) + (icon ? 36 : 22);
            x -= w;
            roundedBox(doc, x, y, w, h, primary
                ? { fill: BRAND, radius: 13 }
                : { fill: '#ffffff', stroke: '#b8c2cb', radius: 13 });
            const color = primary ? '#ffffff' : INK;
            if (icon) houseIcon(doc, x + 11, y + 7.5, 11, color);
            doc.fillColor(color).text(label, x + (icon ? 27 : 11), y + 7.5, { lineBreak: false });
            doc.goTo(x, y, w, h, dest);
            x -= 8;
        };
        const total = ctx.totalPages;
        if (pageNumber < total) button('Next ›', `page-${pageNumber + 1}`);
        if (pageNumber > 1) button('‹ Previous', `page-${pageNumber - 1}`);
        if (pageNumber !== 1) button('Overview', 'page-1', { primary: true, icon: true });
        else button('Index', `page-${total}`, { primary: true });

        doc.font('sans').fontSize(8.5).fillColor(MUTED);
        const label = `Page ${pageNumber} of ${total}`;
        doc.text(label, PAGE_W - MARGIN - doc.widthOfString(label), 56, { lineBreak: false });
    });
}

function drawFooter(doc, ctx) {
    artifact(doc, () => {
        doc.moveTo(MARGIN, FOOTER_Y - 6).lineTo(PAGE_W - MARGIN, FOOTER_Y - 6).lineWidth(0.6).stroke(RULE);
        doc.font('sans').fontSize(7.5).fillColor(MUTED);
        const left = `${ONTOLOGY_TITLE} · Climate Policy Atlas · `;
        doc.text(left, MARGIN, FOOTER_Y, { lineBreak: false });
        const lw = doc.widthOfString(left);
        const url = ONTOLOGY_PAGE_URL.replace(/^https:\/\//, '');
        doc.fillColor('#2f5f8f').text(url, MARGIN + lw, FOOTER_Y, { lineBreak: false });
        doc.link(MARGIN + lw, FOOTER_Y - 1, doc.widthOfString(url), 10, ONTOLOGY_PAGE_URL);
        const right = `Ontology data as of ${ctx.dateLabel} · CC BY 4.0`;
        doc.fillColor(MUTED).text(right, PAGE_W - MARGIN - doc.widthOfString(right), FOOTER_Y, { lineBreak: false });
    });
}

function startPage(doc, ctx, pageNumber) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    ctx.pageDicts[pageNumber] = doc.page.dictionary;
    doc.addNamedDestination(`page-${pageNumber}`, 'XYZ', 0, 0, null);
}

// ---------------------------------------------------------------------------
// Family page: definitions laid out as a connected, indented tree
// ---------------------------------------------------------------------------

const INDENT = 13;
const COL_GAP = 22;

/** Rows for a family page, in tree order. `kind`: def (defined here), context (defined elsewhere), stub (other page). */
function familyRows(group, plan) {
    const rows = [];
    const inExpanded = (t) => group.expand.some((e) => e === t || ancestorsOf(t).includes(e));
    const visit = (t, level) => {
        const kind = plan.home.get(t) === group ? 'def' : 'context';
        rows.push({ term: t, level, kind, branch: level === 0 || group.expand.includes(t) || !inExpanded(t) });
        for (const c of t.children) {
            if (group.shown.has(c)) visit(c, level + 1);
            else if (!inExpanded(t)) rows.push({ term: c, level: level + 1, kind: 'stub', branch: true });
        }
    };
    visit(group.root, 0);
    rows.forEach((r, i) => { r.index = i; });
    return rows;
}

function rowNote(row, plan) {
    if (row.kind === 'context') return `Defined on p. ${plan.home.get(row.term).pageNumber}`;
    if (row.kind === 'stub') return `See ${pageRangeLabel(plan.shownOn.get(row.term))}`;
    return null;
}

function layoutFamilyRows(doc, rows, plan, region, columns) {
    const colW = (region.w - COL_GAP * (columns - 1)) / columns;
    for (let defSize = 9; defSize >= 6.25; defSize -= 0.25) {
        const nameSize = defSize + 1;
        const lineGap = defSize * 0.2;
        const contH = defSize * 1.9;
        let col = 0;
        let y = region.y;
        let fits = true;
        for (const r of rows) {
            const x = region.x + col * (colW + COL_GAP) + r.level * INDENT;
            const w = colW - r.level * INDENT;
            const textX = 11;
            doc.font('sansBold').fontSize(r.level === 0 ? nameSize + 1.5 : nameSize);
            const nameH = doc.heightOfString(r.term.name, { width: w - textX - 2 });
            let bodyH = 0;
            const note = rowNote(r, plan);
            if (note) {
                doc.font('sansItalic').fontSize(defSize);
                bodyH = doc.heightOfString(note, { width: w - textX });
            } else {
                doc.font('sans').fontSize(defSize);
                bodyH = doc.heightOfString(r.term.definition || 'No definition available yet.', { width: w - textX, lineGap });
            }
            const pad = r.branch ? 3 : 0;
            const h = pad + nameH + 1.5 + bodyH + pad;
            const gap = r.branch ? defSize * 1.1 : defSize * 0.75;
            if (y + h > region.y + region.h) {
                col += 1;
                if (col >= columns) { fits = false; break; }
                y = region.y + (r.level > 0 ? contH : 0);
                Object.assign(r, { continued: r.level > 0 });
                r.x = region.x + col * (colW + COL_GAP) + r.level * INDENT;
            } else {
                r.continued = false;
                r.x = x;
            }
            Object.assign(r, { col, y, w, h, nameH, pad, textX });
            y += h + gap;
        }
        if (fits) return { rows, defSize, nameSize, lineGap, colW, contH };
    }
    throw new Error('[ontology-pdf] A family page does not fit, even at the smallest font size. Split its page group in PAGE_GROUPS.');
}

function drawFamilyRows(doc, layout, plan, region, structParent) {
    const { rows, defSize, nameSize, lineGap, colW, contH } = layout;
    const colX = (c) => region.x + c * (colW + COL_GAP);
    const tickY = (r) => r.y + r.pad + nameSize * 0.62;
    const byTerm = new Map(rows.map((r) => [r.term, r]));
    const colBottom = new Map();
    for (const r of rows) colBottom.set(r.col, Math.max(colBottom.get(r.col) ?? 0, r.y + r.h));

    artifact(doc, () => {
        // Tree connectors: one guide per parent, split across columns where the children continue.
        for (const p of rows) {
            const kids = p.term.children.map((k) => byTerm.get(k)).filter(Boolean);
            if (!kids.length) continue;
            const last = kids[kids.length - 1];
            const color = mix(kids[0].term.color, 0.45);
            for (let c = p.col; c <= last.col; c++) {
                const gx = colX(c) + p.level * INDENT + 4.5;
                const top = c === p.col ? p.y + p.h - p.pad - 2 : region.y + contH * 0.85;
                const bottom = c === last.col ? tickY(last) : colBottom.get(c);
                doc.moveTo(gx, top).lineTo(gx, bottom).lineWidth(0.7).stroke(color);
            }
            for (const k of kids) {
                const gx = colX(k.col) + p.level * INDENT + 4.5;
                doc.moveTo(gx, tickY(k)).lineTo(k.x + 1, tickY(k)).lineWidth(0.7).stroke(color);
            }
        }

        // "Continued" crumbs at the top of a column.
        for (const r of rows) {
            if (!r.continued) continue;
            const trail = ancestorsOf(r.term).filter((a) => byTerm.has(a)).map((a) => a.name);
            doc.font('sansItalic').fontSize(defSize - 0.5).fillColor(FAINT)
                .text(`continued: ${trail.join(' › ')}`, colX(r.col), region.y, { width: colW, lineBreak: false, ellipsis: true });
        }

        // Row backgrounds and markers.
        for (const r of rows) {
            const color = r.term.color;
            if (r.branch && r.kind !== 'stub') {
                roundedBox(doc, r.x, r.y, r.w, r.h, { fill: mix(color, r.level === 0 ? 0.84 : 0.91), radius: 4 });
                doc.rect(r.x, r.y, 3, r.h).fill(color);
            } else if (r.kind === 'stub') {
                roundedBox(doc, r.x, r.y, r.w, r.h, { stroke: '#b3bcc4', dash: true, radius: 4 });
            } else {
                doc.rect(r.x + 1.5, tickY(r) - 2.6, 5.2, 5.2).fill(color);
            }
        }
    });

    for (const r of rows) {
        const t = r.term;
        const x = r.x + r.textX;
        const w = r.w - r.textX - 2;
        if (r.kind === 'def') doc.addNamedDestination(`def-${t.id}`, 'XYZ', r.x - 30, r.y - 30, null);
        const size = r.level === 0 ? nameSize + 1.5 : nameSize;
        tagged(doc, structParent, r.level === 0 ? 'H3' : 'H4', () => {
            doc.font('sansBold').fontSize(size).fillColor(r.kind === 'stub' ? MUTED : INK)
                .text(t.name, x, r.y + r.pad, { width: w });
        });
        const bodyY = r.y + r.pad + r.nameH + 1.5;
        const note = rowNote(r, plan);
        if (note) {
            artifact(doc, () => {
                doc.font('sansItalic').fontSize(defSize).fillColor('#2f5f8f').text(`${note} ›`, x, bodyY, { width: w });
            });
            doc.goTo(r.x, r.y, r.w, r.h, `def-${t.id}`);
        } else {
            tagged(doc, structParent, 'P', () => {
                doc.font('sans').fontSize(defSize).fillColor('#333b44')
                    .text(t.definition || 'No definition available yet.', x, bodyY, { width: r.w - r.textX, lineGap });
            });
        }
    }
}

function drawFamilyPage(doc, ctx, plan, group, structRoot) {
    const pageNumber = group.pageNumber;
    startPage(doc, ctx, pageNumber);
    const sect = doc.struct('Sect');
    structRoot.add(sect);

    const crumbs = [...ancestorsOf(group.root), group.root].map((t) => ({ label: t.name, dest: `def-${t.id}` }));
    drawHeader(doc, ctx, { title: group.title, crumbs, accent: group.root.color, pageNumber, structParent: sect });

    const region = { x: MARGIN, y: CONTENT_TOP + 4, w: PAGE_W - MARGIN * 2, h: CONTENT_BOTTOM - CONTENT_TOP - 4 };
    const rows = familyRows(group, plan);
    const layout = layoutFamilyRows(doc, rows, plan, region, 3);
    drawFamilyRows(doc, layout, plan, region, sect);

    drawFooter(doc, ctx);
    sect.end();
}

// ---------------------------------------------------------------------------
// Overview page
// ---------------------------------------------------------------------------

function overviewColumns(plan, terms) {
    const roots = [];
    for (const g of plan.groups) for (const e of g.expand) roots.push({ term: e, group: g });
    roots.sort((a, b) => plan.order.get(a.term) - plan.order.get(b.term));
    const columns = [];
    for (const r of roots) {
        const prev = columns[columns.length - 1];
        if (prev && prev.group === r.group && prev.roots[0].parent === r.term.parent) prev.roots.push(r.term);
        else columns.push({ group: r.group, roots: [r.term] });
    }
    columns.forEach((c, i) => { c.index = i; });

    // A column headed by a single shallow concept (e.g. Policy goals) becomes a bar in the row of its
    // hierarchy level, next to its siblings, instead of sitting below the deeper bars.
    const isColumnTerm = (t) => columns.some((c) => c.roots.some((r) => r === t || ancestorsOf(t).includes(r)));
    const barRowCount = Math.max(...terms.filter((t) => !isColumnTerm(t)).map((t) => t.depth)) + 1;
    for (const c of columns) {
        while (c.roots.length === 1 && c.roots[0].depth < barRowCount && c.roots[0].children.length) {
            c.roots = [...c.roots[0].children];
        }
        c.boxed = c.roots.some((r) => r.children.length);
    }

    const colOf = new Map();
    columns.forEach((c) => c.roots.forEach((r) => {
        colOf.set(r, c.index);
        descendantsOf(r).forEach((d) => colOf.set(d, c.index));
    }));
    const spine = terms.filter((t) => !colOf.has(t));
    return { columns, colOf, spine };
}

function drawOverviewColumns(doc, ctx, plan, terms, region) {
    const { columns, colOf, spine } = overviewColumns(plan, terms);
    const n = columns.length;
    const colGap = 12;
    const colW = (region.w - colGap * (n - 1)) / n;
    columns.forEach((c, i) => { c.x = region.x + i * (colW + colGap); });

    const spanOf = (t) => {
        const idx = [...descendantsOf(t), t].map((d) => colOf.get(d)).filter((v) => v != null);
        return [Math.min(...idx), Math.max(...idx)];
    };
    const spineDepth = Math.max(...spine.map((t) => t.depth)) + 1;
    const barH = 22;
    const rowH = 34;
    const columnsTop = region.y + spineDepth * rowH + 6;

    // Fit outline font so the tallest column fits.
    const rowsFor = (c) => c.roots.flatMap((r) => [r, ...descendantsOf(r)]);
    let fontSize = 8.75;
    let rowsLayout;
    for (; fontSize >= 6; fontSize -= 0.25) {
        rowsLayout = columns.map((c) => {
            let y = columnsTop;
            return rowsFor(c).map((t) => {
                const level = t.depth - c.roots[0].depth + (c.boxed ? 0 : 1);
                const isRoot = c.boxed && level === 0;
                const indent = isRoot ? 0 : 6 + level * 9;
                doc.font(isRoot ? 'sansBold' : t.children.length ? 'sansMedium' : 'sans').fontSize(isRoot ? fontSize + 0.5 : fontSize);
                const textW = colW - indent - (isRoot ? 12 : 2);
                const h = doc.heightOfString(t.name, { width: textW }) + (isRoot ? 8 : 2.2);
                if (isRoot && y > columnsTop) y += fontSize * 0.9;
                const row = { term: t, level, isRoot, indent, x: c.x, y, h, textW };
                y += h + (isRoot ? 3 : 0.6);
                return row;
            });
        });
        const bottom = Math.max(...rowsLayout.map((rows) => rows[rows.length - 1].y + rows[rows.length - 1].h));
        if (bottom <= region.y + region.h) break;
    }

    artifact(doc, () => {
        // Spine bars with connectors.
        const barOf = new Map();
        for (const t of spine) {
            const [a, b] = spanOf(t);
            const x = columns[a].x;
            const w = columns[b].x + colW - x;
            const y = region.y + t.depth * rowH;
            barOf.set(t, { x, y, w, h: barH });
        }
        const connectorColor = '#b7c0c8';
        for (const t of spine) {
            const bar = barOf.get(t);
            if (t.parent && barOf.has(t.parent)) {
                const p = barOf.get(t.parent);
                const cx = bar.x + bar.w / 2;
                doc.moveTo(cx, p.y + p.h).lineTo(cx, bar.y).lineWidth(1).stroke(connectorColor);
            }
        }
        columns.forEach((c, ci) => {
            const p = barOf.get(c.roots[0].parent);
            if (!p) return;
            if (c.boxed) {
                const cx = c.x + colW / 2;
                doc.moveTo(cx, p.y + p.h).lineTo(cx, columnsTop).lineWidth(1).stroke(connectorColor);
                return;
            }
            const gx = c.x + 10;
            const elbowY = (row) => row.y + 1 + fontSize * 0.62;
            const tops = rowsLayout[ci].filter((row) => row.level === 1);
            doc.save().lineWidth(0.6).strokeColor(mix(c.roots[0].color, 0.45));
            doc.moveTo(gx, p.y + p.h).lineTo(gx, elbowY(tops[tops.length - 1])).stroke();
            for (const row of tops) doc.moveTo(gx, elbowY(row)).lineTo(row.x + row.indent - 2, elbowY(row)).stroke();
            doc.restore();
        });
        for (const t of spine) {
            const bar = barOf.get(t);
            roundedBox(doc, bar.x, bar.y, bar.w, bar.h, { fill: t.color, radius: 4 });
            const label = t.name;
            let size = 10;
            doc.font('sansBold').fontSize(size).fillColor('#ffffff');
            while (size > 7 && doc.widthOfString(label) > bar.w - 10) doc.fontSize((size -= 0.5));
            const w = doc.widthOfString(label);
            doc.text(label, bar.x + (bar.w - w) / 2, bar.y + 6, { lineBreak: false });
            doc.goTo(bar.x, bar.y, bar.w, bar.h, `def-${t.id}`);
        }

        // Column outlines.
        columns.forEach((c, ci) => {
            const rows = rowsLayout[ci];
            const rowByTerm = new Map(rows.map((r) => [r.term, r]));
            for (const row of rows) {
                const t = row.term;
                if (row.isRoot) {
                    roundedBox(doc, row.x, row.y, colW, row.h, { fill: mix(t.color, 0.62), stroke: t.color, lineWidth: 1 });
                    doc.font('sansBold').fontSize(fontSize + 0.5).fillColor(INK)
                        .text(t.name, row.x + 5, row.y + 4, { width: row.textW });
                    const tag = `p. ${plan.home.get(t).pageNumber}`;
                    doc.font('sansMedium').fontSize(fontSize - 0.5);
                    const tw = doc.widthOfString(tag);
                    doc.fillColor(t.color).text(tag, row.x + colW - tw - 4, row.y + 4, { lineBreak: false });
                } else {
                    doc.font(t.children.length ? 'sansMedium' : 'sans').fontSize(fontSize).fillColor(INK)
                        .text(t.name, row.x + row.indent, row.y + 1, { width: row.textW });
                }
                doc.goTo(row.x + (row.isRoot ? 0 : row.indent - 3), row.y, row.isRoot ? colW : row.textW + 3, row.h, `def-${t.id}`);
            }
            // Elbow connectors.
            doc.save().lineWidth(0.6).strokeColor(mix(c.roots[0].color, 0.45));
            for (const row of rows) {
                const kids = row.term.children.map((k) => rowByTerm.get(k)).filter(Boolean);
                if (!kids.length) continue;
                const gx = row.x + 6 + (row.level + 1) * 9 - 5;
                const top = row.y + row.h;
                const firstLine = fontSize * 0.62;
                const lastKid = kids[kids.length - 1];
                doc.moveTo(gx, top).lineTo(gx, lastKid.y + 1 + firstLine).stroke();
                for (const k of kids) {
                    doc.moveTo(gx, k.y + 1 + firstLine).lineTo(k.x + k.indent - 2, k.y + 1 + firstLine).stroke();
                }
            }
            doc.restore();
        });
    });
}

// Centre-out radial layout: root in the middle, leaves on an ellipse, labels pointing outward.
function drawOverviewRadial(doc, ctx, plan, terms, region) {
    const root = terms[0];
    const leaves = terms.filter((t) => !t.children.length);
    const cx = region.x + region.w / 2;
    const cy = region.y + region.h / 2;
    const maxDepth = Math.max(...terms.map((t) => t.depth));

    // Angular position: leaves evenly spaced, with extra space between top-level families.
    const angle = new Map();
    let slot = 0;
    let prevFamily = null;
    const family = (t) => ancestorsOf(t)[2] || ancestorsOf(t)[1] || t;
    const slots = [];
    for (const l of leaves) {
        const f = family(l);
        if (prevFamily && f !== prevFamily) slot += 1.4;
        slots.push([l, slot]);
        slot += 1;
        prevFamily = f;
    }
    const total = slot + 1.4;
    const start = -Math.PI / 2 + 0.12;
    for (const [l, s] of slots) angle.set(l, start + (s / total) * Math.PI * 2);
    const setAngle = (t) => {
        if (angle.has(t)) return angle.get(t);
        const a = t.children.map(setAngle);
        const v = (Math.min(...a) + Math.max(...a)) / 2;
        angle.set(t, v);
        return v;
    };
    setAngle(root);

    const fontSize = 6.6;
    doc.font('sans').fontSize(fontSize);
    const longest = Math.max(...leaves.map((l) => doc.widthOfString(l.name)));
    const rx = region.w / 2 - longest - 8;
    const ry = region.h / 2 - longest * 0.62 - 8;
    const radiusAt = (d) => (d === 0 ? 0 : 0.16 + (0.84 * d) / maxDepth);
    const pos = (t) => {
        const r = t.children.length ? radiusAt(t.depth) : 1;
        const a = angle.get(t);
        return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
    };

    // Internal-node labels are horizontal boxes; shallow ones first, later ones nudged vertically until they don't overlap.
    const labelFont = (t) => (t.depth <= 2 ? ['sansBold', 8.5] : ['sansMedium', 7]);
    const labelBox = new Map();
    const placedBoxes = [];
    const overlaps = (b) => placedBoxes.some((p) => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
    for (const t of [...terms].filter((x) => x.children.length).sort((a, b) => a.depth - b.depth)) {
        const [x, y] = pos(t);
        const [font, size] = labelFont(t);
        doc.font(font).fontSize(size);
        const w = doc.widthOfString(t.name) + 5;
        const h = doc.currentLineHeight() + 1;
        let box = null;
        for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5].map((k) => k * (h + 1))) {
            const candidate = { x: x - w / 2, y: y + 3 + dy, w, h };
            if (!overlaps(candidate)) { box = candidate; break; }
        }
        box = box || { x: x - w / 2, y: y + 3, w, h };
        placedBoxes.push(box);
        labelBox.set(t, box);
    }

    artifact(doc, () => {
        for (const t of terms) {
            if (!t.parent) continue;
            const [x1, y1] = pos(t.parent);
            const [x2, y2] = pos(t);
            doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.6).stroke(mix(t.color, 0.45));
        }
        for (const t of terms) {
            const [x, y] = pos(t);
            const internal = t.children.length > 0;
            doc.circle(x, y, internal ? 2.6 : 1.6).fill(t.color);
            const a = angle.get(t);
            if (!internal) {
                // Leaf labels: rotated, reading outward; flipped on the left half so they stay upright.
                const deg = (a * 180) / Math.PI;
                const left = Math.cos(a) < 0;
                doc.font('sans').fontSize(fontSize);
                const w = doc.widthOfString(t.name);
                doc.save();
                doc.rotate(left ? deg + 180 : deg, { origin: [x, y] });
                const tx = left ? x - 5 - w : x + 5;
                doc.fillColor(INK).text(t.name, tx, y - fontSize * 0.62, { lineBreak: false });
                doc.restore();
                // Link areas: small squares along the rotated label (link rectangles cannot rotate).
                const step = fontSize * 1.1;
                for (let s = 5; s < w + 5; s += step) {
                    const lx = x + Math.cos(a) * (s + step / 2);
                    const ly = y + Math.sin(a) * (s + step / 2);
                    doc.goTo(lx - step / 2, ly - step / 2, step, step, `def-${t.id}`);
                }
            }
        }
        // Labels last so they sit above every connector.
        for (const t of terms) {
            const box = labelBox.get(t);
            if (!box) continue;
            const [font, size] = labelFont(t);
            roundedBox(doc, box.x, box.y, box.w, box.h, { fill: '#ffffff', stroke: mix(t.color, 0.4), lineWidth: 0.6, radius: 2.5 });
            doc.font(font).fontSize(size).fillColor(INK).text(t.name, box.x + 2.5, box.y + 1, { lineBreak: false });
            doc.goTo(box.x, box.y, box.w, box.h, `def-${t.id}`);
        }
    });
}

function drawOverviewPage(doc, ctx, plan, terms, structRoot, variant) {
    startPage(doc, ctx, 1);
    const sect = doc.struct('Sect');
    structRoot.add(sect);
    drawHeader(doc, ctx, {
        title: ONTOLOGY_TITLE,
        subtitle: `All ${terms.length} concepts at a glance. Click any concept to read its definition, or a family below to open its page. Every page has an Overview button that brings you back here.`,
        accent: BRAND,
        pageNumber: 1,
        structParent: sect,
    });

    // Family page chips (doubles as table of contents).
    let x = MARGIN;
    const y = CONTENT_TOP;
    artifact(doc, () => {
        doc.font('sansBold').fontSize(7.5).fillColor(FAINT).text('PAGES', x, y + 6, { lineBreak: false, characterSpacing: 0.6 });
        x += 40;
        for (const g of [...plan.groups, { pageNumber: ctx.totalPages, short: 'Index, citation and licence', root: { color: BRAND } }]) {
            const label = `${g.pageNumber}  ${g.short}`;
            doc.font('sansMedium').fontSize(8.5);
            const w = doc.widthOfString(label) + 24;
            roundedBox(doc, x, y, w, 19, { fill: mix(g.root.color, 0.88), stroke: mix(g.root.color, 0.4), radius: 9.5 });
            doc.circle(x + 9, y + 9.5, 3).fill(g.root.color);
            doc.fillColor(INK).text(label, x + 16, y + 5, { lineBreak: false });
            doc.goTo(x, y, w, 19, `page-${g.pageNumber}`);
            x += w + 6;
        }
    });

    const region = { x: MARGIN, y: CONTENT_TOP + 34, w: PAGE_W - MARGIN * 2, h: CONTENT_BOTTOM - CONTENT_TOP - 34 };
    if (variant === 'radial') drawOverviewRadial(doc, ctx, plan, terms, region);
    else drawOverviewColumns(doc, ctx, plan, terms, region);

    drawFooter(doc, ctx);
    sect.end();
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function drawIndexPage(doc, ctx, plan, terms, structRoot) {
    const pageNumber = ctx.totalPages;
    startPage(doc, ctx, pageNumber);
    const sect = doc.struct('Sect');
    structRoot.add(sect);
    drawHeader(doc, ctx, {
        title: 'Index, citation and licence',
        subtitle: 'Every concept in alphabetical order. Click a name to jump to its definition.',
        accent: BRAND,
        pageNumber,
        structParent: sect,
    });

    const aboutW = 300;
    const indexRegion = { x: MARGIN, y: CONTENT_TOP, w: PAGE_W - MARGIN * 2 - aboutW - 30, h: CONTENT_BOTTOM - CONTENT_TOP };
    const sorted = [...terms].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    const cols = 4;
    const colGap = 16;
    const colW = (indexRegion.w - colGap * (cols - 1)) / cols;

    let fontSize = 8.5;
    let rows;
    for (; fontSize >= 6; fontSize -= 0.25) {
        doc.font('sans').fontSize(fontSize);
        let col = 0;
        let y = indexRegion.y;
        let letter = '';
        rows = [];
        let ok = true;
        for (const t of sorted) {
            const first = t.name[0].toUpperCase();
            const page = `${plan.home.get(t).pageNumber}`;
            const textW = colW - doc.widthOfString('00') - 8;
            const h = doc.heightOfString(t.name, { width: textW }) + 1.5;
            const headH = first !== letter ? fontSize * 2 : 0;
            if (y + headH + h > indexRegion.y + indexRegion.h) {
                col += 1;
                y = indexRegion.y;
                if (col >= cols) { ok = false; break; }
            }
            if (first !== letter) {
                rows.push({ letter: first, x: indexRegion.x + col * (colW + colGap), y });
                y += headH;
                letter = first;
            }
            rows.push({ term: t, page, x: indexRegion.x + col * (colW + colGap), y, h, textW });
            y += h;
        }
        if (ok) break;
    }

    const list = doc.struct('L');
    sect.add(list);
    for (const r of rows) {
        if (r.letter) {
            artifact(doc, () => {
                doc.font('sansBold').fontSize(fontSize + 1).fillColor(FAINT).text(r.letter, r.x, r.y + fontSize * 0.5, { lineBreak: false });
            });
            continue;
        }
        const li = doc.struct('LI');
        list.add(li);
        li.add(doc.struct('LBody', {}, () => {
            doc.font('sans').fontSize(fontSize).fillColor(INK).text(r.term.name, r.x + 8, r.y, { width: r.textW });
        }));
        artifact(doc, () => {
            doc.rect(r.x, r.y + fontSize * 0.36, 4, 4).fill(r.term.color);
            doc.font('sansMedium').fontSize(fontSize).fillColor(MUTED);
            doc.text(r.page, r.x + colW - doc.widthOfString(r.page), r.y, { lineBreak: false });
        });
        doc.goTo(r.x, r.y, colW, r.h, `def-${r.term.id}`);
        li.end();
    }
    list.end();

    // About panel.
    const ax = PAGE_W - MARGIN - aboutW;
    let ay = CONTENT_TOP;
    artifact(doc, () => {
        roundedBox(doc, ax - 14, ay - 4, aboutW + 14, CONTENT_BOTTOM - ay + 4, { fill: '#f4f6f4', radius: 6 });
    });
    const heading = (text) => {
        tagged(doc, sect, 'H3', () => {
            doc.font('sansBold').fontSize(10).fillColor(INK).text(text, ax, ay, { width: aboutW - 14 });
        });
        ay = doc.y + 3;
    };
    const para = (text) => {
        tagged(doc, sect, 'P', () => {
            doc.font('sans').fontSize(8.5).fillColor('#333b44').text(text, ax, ay, { width: aboutW - 14, lineGap: 1.5 });
        });
        ay = doc.y + 10;
    };
    const linkLine = (label, url) => {
        tagged(doc, sect, 'P', () => {
            doc.font('sans').fontSize(8.5).fillColor(MUTED).text(`${label}: `, ax, ay, { width: aboutW - 14, continued: true })
                .fillColor('#2f5f8f').text(url.replace(/^mailto:/, ''), { link: url, underline: false });
        });
        ay = doc.y + 4;
    };

    heading('About this document');
    para(
        'The Climate and Energy Policy Ontology (CEPO) describes how climate and energy policy instruments relate to and differ ' +
        'from each other, offering a system of mutually exclusive instrument definitions based on the functionality of each ' +
        'instrument type. Each concept is a kind of its parent.'
    );
    heading('How to cite');
    para(SUGGESTED_CITATION);
    heading('Licence');
    para('Content: Creative Commons Attribution 4.0 International (CC BY 4.0). You may share and adapt it with attribution.');
    heading('Links');
    linkLine('Interactive version', ONTOLOGY_PAGE_URL);
    linkLine('OWL source (GitHub)', ONTOLOGY_REPO_URL);
    linkLine('DOI', ONTOLOGY_DOI_URL);
    linkLine('Licence', 'https://creativecommons.org/licenses/by/4.0/');
    linkLine('Contact', `mailto:${CONTACT_EMAIL}`);
    ay += 8;
    heading('Version');
    para(`Built from the ontology data published on the Climate Policy Atlas, as of ${ctx.dateLabel} (${terms.length} concepts). ${PUBLISHER_NAME}.`);

    drawFooter(doc, ctx);
    sect.end();
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

function buildOutline(doc, ctx, plan, terms, destPos) {
    const pointTo = (item, pageNumber, y) => {
        item.outlineData.Dest = [ctx.pageDicts[pageNumber], 'XYZ', null, PAGE_H - y, null];
    };
    pointTo(doc.outline.addItem('Overview of all concepts'), 1, 0);

    const addTerm = (parentItem, t) => {
        const item = parentItem.addItem(t.name, { expanded: t.depth < 2 });
        const pos = destPos.get(t);
        if (pos) pointTo(item, pos.page, pos.y);
        t.children.forEach((c) => addTerm(item, c));
    };
    const tree = doc.outline.addItem('Ontology (by hierarchy)', { expanded: true });
    pointTo(tree, plan.groups[0]?.pageNumber ?? 1, 0);
    terms.filter((t) => !t.parent).forEach((t) => addTerm(tree, t));

    const pages = doc.outline.addItem('Pages', { expanded: false });
    pointTo(pages, 1, 0);
    for (const g of plan.groups) pointTo(pages.addItem(`${g.pageNumber}. ${g.title}`), g.pageNumber, 0);
    pointTo(doc.outline.addItem('Index, citation and licence'), ctx.totalPages, 0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {ReturnType<import('./model.mjs').flattenOntology>} terms
 * @param {{ date?: Date, overview?: 'columns' | 'radial' }} [options]
 * @returns {Promise<Buffer>}
 */
export function buildOntologyPdf(terms, { date = new Date(), overview = 'columns' } = {}) {
    const plan = planPages(terms);
    const dateLabel = date.toISOString().slice(0, 10);
    const ctx = { totalPages: plan.groups.length + 2, pageDicts: [], dateLabel };

    const doc = new PDFDocument({
        autoFirstPage: false,
        size: [PAGE_W, PAGE_H],
        margin: 0,
        pdfVersion: '1.7',
        tagged: true,
        lang: 'en',
        displayTitle: true,
        info: {
            Title: ONTOLOGY_TITLE,
            Author: PUBLISHER_NAME,
            Subject: 'Climate and energy policy instrument types, their definitions and hierarchy.',
            Keywords: 'climate policy, energy policy, ontology, policy instruments, CEPO, Climate Policy Atlas',
            Creator: 'Climate Policy Atlas build (scripts/ontology/pdf.mjs)',
            CreationDate: date,
            ModDate: date,
        },
    });
    for (const [name, file] of Object.entries(FONT_FILES)) doc.registerFont(name, require.resolve(file));

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((res, rej) => {
        doc.on('end', () => res(Buffer.concat(chunks)));
        doc.on('error', rej);
    });

    const structRoot = doc.struct('Document');
    doc.addStructure(structRoot);

    // Destination positions for bookmarks (definition entries on their home page).
    const destPos = new Map();
    const origAddDest = doc.addNamedDestination.bind(doc);
    doc.addNamedDestination = (name, ...args) => {
        if (name.startsWith('def-')) {
            const term = terms.find((t) => `def-${t.id}` === name);
            if (term) destPos.set(term, { page: ctx.pageDicts.length - 1, y: args[2] });
        }
        return origAddDest(name, ...args);
    };

    drawOverviewPage(doc, ctx, plan, terms, structRoot, overview);
    for (const g of plan.groups) drawFamilyPage(doc, ctx, plan, g, structRoot);
    drawIndexPage(doc, ctx, plan, terms, structRoot);

    buildOutline(doc, ctx, plan, terms, destPos);
    structRoot.end();
    doc.end();
    return done;
}
