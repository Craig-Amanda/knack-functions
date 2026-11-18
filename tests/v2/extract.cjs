/**
 * Pulls named top-level declarations (and everything they call inside the same file) out of a classic-script
 * bundle such as knackFunctions.js or knackFunctionsV2.js, so a test can load just those functions into a page.
 * Uses acorn (already a dependency) rather than string slicing, so the extraction survives reordering.
 */
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('acorn');

const ROOT = path.join(__dirname, '..', '..');
const cache = new Map();

function topLevelName(node) {
    if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) return node.id.name;
    if (node.type === 'VariableDeclaration' && node.declarations.length === 1 && node.declarations[0].id.type === 'Identifier') {
        return node.declarations[0].id.name;
    }
    return null;
}

function walk(node, visit, parent = null, key = null) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent, key);
    for (const [k, v] of Object.entries(node)) {
        if (k === 'loc') continue;
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, node, k));
        else if (v && typeof v.type === 'string') walk(v, visit, node, k);
    }
}

/** Identifiers referenced inside `node` that are not property keys or member names. */
function referencedNames(node) {
    const names = new Set();
    walk(node, (n, parent, key) => {
        if (n.type !== 'Identifier') return;
        if (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
        if (parent?.type === 'Property' && key === 'key' && !parent.computed) return;
        if ((parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && key === 'key') return;
        names.add(n.name);
    });
    return names;
}

function analyse(file) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    if (cache.has(abs)) return cache.get(abs);
    const source = fs.readFileSync(abs, 'utf8');
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    const nodes = new Map();
    const order = [];
    const statements = [];
    for (const node of ast.body) {
        const name = topLevelName(node);
        if (!name) {
            // Bare top-level statements (e.g. `$.expr[':'].textEquals = ...`, `if (...) { globalThis.x = ... }`).
            statements.push({ text: source.slice(node.start, node.end), refs: referencedNames(node) });
            continue;
        }
        nodes.set(name, { name, node, text: source.slice(node.start, node.end), refs: referencedNames(node) });
        order.push(name);
    }
    const result = { source, nodes, order, statements };
    cache.set(abs, result);
    return result;
}

/**
 * Source text for `names` plus their transitive in-file dependencies, in original file order.
 * @param {string} file Path to the bundle (relative to the repo root or absolute).
 * @param {string[]} names Top-level names to extract.
 * @param {object} [options]
 * @param {string[]} [options.exclude] Names to leave out even if referenced (e.g. ones the test stubs itself).
 * @param {string} [options.fallback] A second bundle (normally V1) supplying declarations `file` does not have yet,
 *   so a partially ported V2 can be exercised before every dependency is rewritten.
 * @param {string[]} [options.statements] Substrings identifying bare top-level statements to include as well (they
 *   have no name to extract by), e.g. `['textEquals']` for the jQuery pseudo-selector. Taken from `file`, or from
 *   `fallback` when `file` has no matching statement.
 * @returns {string}
 */
function extract(file, names, { exclude = [], fallback, statements = [] } = {}) {
    const primary = analyse(file);
    const secondary = fallback ? analyse(fallback) : null;
    const chosen = new Map(); // name -> entry (from primary when it has it, else from fallback)
    const extraStatements = statements.map((needle) => {
        const match = primary.statements.find((s) => s.text.includes(needle)) || secondary?.statements.find((s) => s.text.includes(needle));
        if (!match) throw new Error(`no top-level statement containing "${needle}"`);
        return match;
    });
    const queue = [...names, ...extraStatements.flatMap((s) => [...s.refs])];
    while (queue.length) {
        const name = queue.pop();
        if (chosen.has(name) || exclude.includes(name)) continue;
        const entry = primary.nodes.get(name) || secondary?.nodes.get(name);
        if (!entry) {
            if (names.includes(name)) throw new Error(`${path.basename(file)} has no top-level declaration named ${name}`);
            continue; // a browser/global identifier referenced by an extra statement
        }
        chosen.set(name, entry);
        for (const ref of entry.refs) {
            if (ref !== name && (primary.nodes.has(ref) || secondary?.nodes.has(ref))) queue.push(ref);
        }
    }
    // Primary declarations keep their file order; borrowed fallback declarations follow in the fallback's order.
    const fromPrimary = primary.order.filter((n) => chosen.has(n) && primary.nodes.has(n));
    const fromFallback = secondary ? secondary.order.filter((n) => chosen.has(n) && !primary.nodes.has(n)) : [];
    return [...fromPrimary, ...fromFallback].map((n) => chosen.get(n).text).concat(extraStatements.map((s) => s.text)).join('\n\n');
}

/** Every top-level name the bundle declares. */
function topLevelNames(file) {
    return analyse(file).order;
}

module.exports = { extract, topLevelNames };
